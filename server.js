import express        from 'express';
import { existsSync } from 'fs';
import cors           from 'cors';
import Anthropic      from '@anthropic-ai/sdk';
import Database       from 'better-sqlite3';
import multer         from 'multer';
import pdfParse       from 'pdf-parse/lib/pdf-parse.js';
import mammoth        from 'mammoth';

const app       = express();
// Persistenter Pfad: /data wenn Railway-Volume gemountet, sonst lokal
const DB_PATH   = existsSync('/data') ? '/data/libby.db' : 'libby.db';
const db        = new Database(DB_PATH);
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const upload    = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

app.use(cors());
app.use(express.json());
app.use(express.static('.'));

// ── DB setup + migrations (safe on every start) ────────────────
db.exec(`
  CREATE TABLE IF NOT EXISTS conversations (
    id                INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id        TEXT,
    user_message      TEXT,
    assistant_message TEXT,
    feedback          INTEGER  DEFAULT 0,
    context           TEXT     DEFAULT '',
    used_search       INTEGER  DEFAULT 0,
    language          TEXT     DEFAULT 'de',
    source_doc_ids    TEXT     DEFAULT '',
    timestamp         DATETIME DEFAULT CURRENT_TIMESTAMP
  );
  CREATE INDEX IF NOT EXISTS idx_session  ON conversations(session_id);
  CREATE INDEX IF NOT EXISTS idx_feedback ON conversations(feedback);
  CREATE INDEX IF NOT EXISTS idx_ts       ON conversations(timestamp);

  CREATE TABLE IF NOT EXISTS documents (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    filename   TEXT    NOT NULL,
    title      TEXT    NOT NULL,
    content    TEXT    NOT NULL,
    file_type  TEXT,
    hit_count  INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE VIRTUAL TABLE IF NOT EXISTS documents_fts USING fts5(
    title, content, content='documents', content_rowid='id'
  );

  CREATE TRIGGER IF NOT EXISTS docs_ai AFTER INSERT ON documents BEGIN
    INSERT INTO documents_fts(rowid, title, content) VALUES (new.id, new.title, new.content);
  END;
  CREATE TRIGGER IF NOT EXISTS docs_ad AFTER DELETE ON documents BEGIN
    INSERT INTO documents_fts(documents_fts, rowid, title, content)
    VALUES ('delete', old.id, old.title, old.content);
  END;
  CREATE TRIGGER IF NOT EXISTS docs_au AFTER UPDATE ON documents BEGIN
    INSERT INTO documents_fts(documents_fts, rowid, title, content)
    VALUES ('delete', old.id, old.title, old.content);
    INSERT INTO documents_fts(rowid, title, content) VALUES (new.id, new.title, new.content);
  END;
`);
for (const sql of [
  'ALTER TABLE conversations ADD COLUMN used_search    INTEGER DEFAULT 0',
  'ALTER TABLE conversations ADD COLUMN language       TEXT    DEFAULT "de"',
  'ALTER TABLE conversations ADD COLUMN source_doc_ids TEXT    DEFAULT ""',
]) { try { db.exec(sql); } catch { /* column already exists */ } }

// ── Admin auth ─────────────────────────────────────────────────
const ADMIN_KEY = process.env.ADMIN_KEY || 'libby-admin';
function requireAdmin(req, res, next) {
  if (req.headers['x-admin-key'] !== ADMIN_KEY) return res.status(401).json({ error: 'Unauthorized' });
  next();
}

// ── Document search via FTS5 ───────────────────────────────────
function searchDocuments(query) {
  try {
    const q = query.replace(/['"*\[\](){}!^~?:\\]/g, ' ').trim();
    if (!q) return [];
    return db.prepare(`
      SELECT d.id, d.title,
             snippet(documents_fts, 1, '', '', ' [...] ', 60) AS excerpt
      FROM   documents_fts
      JOIN   documents d ON d.id = documents_fts.rowid
      WHERE  documents_fts MATCH ?
      ORDER  BY rank
      LIMIT  2
    `).all(q);
  } catch { return []; }
}

// ── Language detection ─────────────────────────────────────────
function detectLanguage(msg) {
  const t = msg.toLowerCase();
  let en = 0, de = 0;
  [/\b(what|how|why|when|the|is|are|you|can)\b/, /\b(tax|pension|debt|show|tell)\b/]
    .forEach(p => { if (p.test(t)) en++; });
  [/\b(was|wie|warum|der|die|das|ich|ist|und)\b/, /\b(steuer|pension|schuld)\b/]
    .forEach(p => { if (p.test(t)) de++; });
  if (en === de) {
    if (/\b\w+tion\b|\b\w+ing\b/.test(t)) en++;
    if (/\b\w+ung\b|\b\w+keit\b/.test(t)) de++;
  }
  return en > de ? 'en' : 'de';
}

// ── Conversation history ───────────────────────────────────────
function getHistory(sessionId, limit = 6) {
  return db.prepare(
    'SELECT user_message, assistant_message FROM conversations WHERE session_id = ? ORDER BY id DESC LIMIT ?'
  ).all(sessionId, limit).reverse().flatMap(r => [
    { role: 'user',      content: r.user_message      },
    { role: 'assistant', content: r.assistant_message },
  ]);
}

// ── System prompts ─────────────────────────────────────────────
const SOURCES_DE = `• Steuern & Abgaben – Agenda Austria | https://www.agenda-austria.at/topics/staatsbudget-finanzen/steuern-abgaben/
• Pensionen – Agenda Austria | https://www.agenda-austria.at/topics/soziales/pensionen/
• Wohnen & Mieten – Agenda Austria | https://www.agenda-austria.at/topics/soziales/wohnen/
• Staatsschulden – Agenda Austria | https://www.agenda-austria.at/topics/staatsbudget-finanzen/staatsschulden/
• Staatshaushalt – Agenda Austria | https://www.agenda-austria.at/topics/staatsbudget-finanzen/staatshaushalt/
• Beschäftigung – Agenda Austria | https://www.agenda-austria.at/topics/arbeit-wohlstand/beschaeftigung/
• Arbeitslosigkeit – Agenda Austria | https://www.agenda-austria.at/topics/arbeit-wohlstand/arbeitslosigkeit/
• Wirtschaft & Standort – Agenda Austria | https://www.agenda-austria.at/topics/wirtschaft-standort/wettbewerbsfaehigkeit/
• Sozialstaat – Agenda Austria | https://www.agenda-austria.at/topics/soziales/sozialstaat/
• Energie – Agenda Austria | https://www.agenda-austria.at/topics/energie-klima/energie/
• Bildung – Agenda Austria | https://www.agenda-austria.at/topics/zukunft/bildung/
• Armut & Verteilung – Agenda Austria | https://www.agenda-austria.at/topics/soziales/armut-verteilung/`;

const BASE = {
  de: `Du bist Libby, Ökonomin bei Agenda Austria Wien, 28 Jahre alt.

SPRACHE: Immer Deutsch. Immer "du", niemals "Sie".
STIL: 3–5 Sätze. Aufzählungen mit • wenn sinnvoll. **Fett** sehr sparsam. Max. 1 Emoji.
VERBOTEN: Lange Einleitungen, Meta-Kommentare, Selbstvorstellungen.

WISSEN:
• Abgabenquote **43 %** (OECD 34 %) → Senkung auf 40 % möglich
• Pensionsantritt faktisch **60 J** (EU: 64 J), **8 Mrd. €** Zuschuss/Jahr
• Staatsschulden **78 % BIP** = 32.000 €/Kopf
• Mietpreisregulierung → mehr Angebot statt Preisdeckel
• Lohnnebenkosten zu hoch → Flexibilisierung nötig
• Agenda Austria: 100 % privat finanziert, unabhängig

QUELLEN — nur diese URLs verwenden, nie andere erfinden:
${SOURCES_DE}

FORMAT: Jede Antwort endet mit:
FOLLOWUP: Kurze Frage 1 | Kurze Frage 2 | Kurze Frage 3
QUELLE: Linktext | URL  (passende Quelle aus der Liste oben; weglassen wenn keine passt)
(max. 5 Wörter je Folgefrage)`,

  en: `You are Libby, economist at Agenda Austria Vienna, age 28.

LANGUAGE: Always English. Use "you" informally.
STYLE: 3–5 sentences. Bullets with • where useful. **Bold** sparingly. Max. 1 emoji.
FORBIDDEN: Long intros, meta-comments, self-introductions.

KNOWLEDGE:
• Tax burden **43%** (OECD 34%) → reduction to 40% possible
• Retirement effectively at **60** (EU: 64), €8bn/yr subsidy
• Public debt **78% GDP** = €32,000 per capita
• Rent regulation → more supply, not price caps
• Agenda Austria: 100% privately funded, independent

SOURCES — only use these URLs, never invent others:
• Taxes & Levies – Agenda Austria | https://www.agenda-austria.at/topics/staatsbudget-finanzen/steuern-abgaben/
• Pensions – Agenda Austria | https://www.agenda-austria.at/topics/soziales/pensionen/
• Housing & Rents – Agenda Austria | https://www.agenda-austria.at/topics/soziales/wohnen/
• Public Debt – Agenda Austria | https://www.agenda-austria.at/topics/staatsbudget-finanzen/staatsschulden/
• State Budget – Agenda Austria | https://www.agenda-austria.at/topics/staatsbudget-finanzen/staatshaushalt/
• Employment – Agenda Austria | https://www.agenda-austria.at/topics/arbeit-wohlstand/beschaeftigung/
• Unemployment – Agenda Austria | https://www.agenda-austria.at/topics/arbeit-wohlstand/arbeitslosigkeit/
• Economy & Competitiveness – Agenda Austria | https://www.agenda-austria.at/topics/wirtschaft-standort/wettbewerbsfaehigkeit/
• Welfare State – Agenda Austria | https://www.agenda-austria.at/topics/soziales/sozialstaat/
• Energy – Agenda Austria | https://www.agenda-austria.at/topics/energie-klima/energie/
• Education – Agenda Austria | https://www.agenda-austria.at/topics/zukunft/bildung/
• Poverty & Distribution – Agenda Austria | https://www.agenda-austria.at/topics/soziales/armut-verteilung/

FORMAT: End every answer with:
FOLLOWUP: Short question 1 | Short question 2 | Short question 3
QUELLE: Link text | URL  (matching source from the list above; omit if none fits)
(max. 5 words per follow-up)`,
};

// ── Chat ───────────────────────────────────────────────────────
app.post('/api/chat', async (req, res) => {
  try {
    const { message, sessionId = 'default' } = req.body;
    const lang    = detectLanguage(message);
    const history = getHistory(sessionId);

    // Inject relevant document context
    const docHits    = searchDocuments(message);
    const usedDocIds = docHits.map(d => d.id);
    let   docContext = '';
    if (docHits.length > 0) {
      docContext = (lang === 'de' ? '\n\nDOKUMENTE:\n' : '\n\nDOCUMENTS:\n')
        + docHits.map(d => `[${d.title}]\n${d.excerpt}`).join('\n\n');
      for (const id of usedDocIds) {
        db.prepare('UPDATE documents SET hit_count = hit_count + 1 WHERE id = ?').run(id);
      }
    }

    history.push({ role: 'user', content: message });

    const response = await anthropic.messages.create({
      model:      'claude-haiku-4-5-20251001',
      max_tokens: 400,
      system:     BASE[lang] + docContext,
      messages:   history,
    });

    const assistantMessage = response.content
      .filter(b => b.type === 'text').map(b => b.text).join('');

    const result = db.prepare(`
      INSERT INTO conversations (session_id, user_message, assistant_message, context, language, source_doc_ids)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(sessionId, message, assistantMessage, docContext, lang, usedDocIds.join(','));

    res.json({ message: assistantMessage, conversationId: result.lastInsertRowid, detectedLanguage: lang });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ── Feedback ───────────────────────────────────────────────────
app.post('/api/feedback', (req, res) => {
  try {
    db.prepare('UPDATE conversations SET feedback = ? WHERE id = ?').run(req.body.feedback, req.body.conversationId);
    res.json({ success: true });
  } catch { res.status(500).json({ error: 'Server error' }); }
});

// ── Public stats ───────────────────────────────────────────────
app.get('/api/stats', (_req, res) => {
  try {
    res.json({
      total:    db.prepare('SELECT COUNT(*) AS c FROM conversations').get().c,
      positive: db.prepare("SELECT COUNT(*) AS c FROM conversations WHERE feedback =  1").get().c,
      negative: db.prepare("SELECT COUNT(*) AS c FROM conversations WHERE feedback = -1").get().c,
      german:   db.prepare("SELECT COUNT(*) AS c FROM conversations WHERE language = 'de'").get().c,
      english:  db.prepare("SELECT COUNT(*) AS c FROM conversations WHERE language = 'en'").get().c,
    });
  } catch (err) {
    console.error('/api/stats error:', err);
    res.json({ total: 0, positive: 0, negative: 0, german: 0, english: 0 });
  }
});

// ══════════════════════════════════════════════════════════════
// ADMIN API
// ══════════════════════════════════════════════════════════════

app.get('/admin/verify', requireAdmin, (_req, res) => res.json({ ok: true }));

// Upload
app.post('/admin/upload', requireAdmin, upload.single('file'), async (req, res) => {
  try {
    const { originalname, mimetype, buffer } = req.file;
    const title = (req.body.title || originalname).replace(/\.[^.]+$/, '');
    let content = '', fileType = 'TXT';

    if (mimetype.includes('pdf') || originalname.endsWith('.pdf')) {
      content = (await pdfParse(buffer)).text;
      fileType = 'PDF';
    } else if (mimetype.includes('wordprocessingml') || originalname.endsWith('.docx')) {
      content = (await mammoth.extractRawText({ buffer })).value;
      fileType = 'DOCX';
    } else {
      content = buffer.toString('utf-8');
    }

    content = content.replace(/\s+/g, ' ').trim();
    if (!content) return res.status(400).json({ error: 'Kein lesbarer Text gefunden.' });

    const result = db.prepare(
      'INSERT INTO documents (filename, title, content, file_type) VALUES (?, ?, ?, ?)'
    ).run(originalname, title, content, fileType);

    res.json({ success: true, id: result.lastInsertRowid, title, fileType });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Upload fehlgeschlagen: ' + err.message });
  }
});

// List documents
app.get('/admin/documents', requireAdmin, (_req, res) => {
  res.json(db.prepare(
    'SELECT id, filename, title, file_type, hit_count, created_at FROM documents ORDER BY created_at DESC'
  ).all());
});

// Delete document
app.delete('/admin/documents/:id', requireAdmin, (req, res) => {
  db.prepare('DELETE FROM documents WHERE id = ?').run(req.params.id);
  res.json({ success: true });
});

// Full stats
app.get('/admin/stats/full', requireAdmin, (_req, res) => {
  const total    = db.prepare('SELECT COUNT(*) AS c FROM conversations').get().c;
  const today    = db.prepare("SELECT COUNT(*) AS c FROM conversations WHERE DATE(timestamp)=DATE('now')").get().c;
  const pos      = db.prepare('SELECT COUNT(*) AS c FROM conversations WHERE feedback =  1').get().c;
  const neg      = db.prepare('SELECT COUNT(*) AS c FROM conversations WHERE feedback = -1').get().c;
  const docCount = db.prepare('SELECT COUNT(*) AS c FROM documents').get().c;

  const queriesPerDay = db.prepare(`
    SELECT DATE(timestamp) AS date, COUNT(*) AS count
    FROM   conversations
    WHERE  timestamp >= DATE('now','-30 days')
    GROUP  BY DATE(timestamp)
    ORDER  BY date ASC
  `).all();

  const topDocuments = db.prepare(
    'SELECT id, title, file_type, hit_count FROM documents ORDER BY hit_count DESC LIMIT 10'
  ).all();

  // Word-frequency on last 500 user messages
  const STOP = new Set([
    'ich','du','er','sie','es','wir','ihr','die','der','das','den','dem','des','ein','eine',
    'einer','eines','einem','einen','und','oder','aber','denn','weil','dass','wenn','wie',
    'was','wo','wer','warum','wann','welche','welcher','ist','sind','war','waren','sein',
    'werden','wird','wurde','haben','hat','hatte','kann','muss','will','soll','nicht','kein',
    'keine','auch','noch','schon','nur','sehr','mehr','viel','alle','von','mit','für','auf',
    'in','an','zu','bei','nach','aus','über','unter','vor','im','zum','zur','am','beim',
    'mir','dir','uns','mich','sich','bitte','mal','doch','ja','nein','so','da','hier','dann',
    'jetzt','heute','gibt','geht','macht','sagt','the','is','are','what','how','why','when',
    'where','who','about','can','have','this','that','with','from','would','could','should',
  ]);
  const freq = {};
  db.prepare('SELECT user_message FROM conversations ORDER BY id DESC LIMIT 500').all()
    .forEach(({ user_message }) => {
      user_message.toLowerCase().replace(/[^a-zäöüß\s]/g, ' ').split(/\s+/)
        .filter(w => w.length >= 4 && !STOP.has(w))
        .forEach(w => { freq[w] = (freq[w] || 0) + 1; });
    });
  const topTopics = Object.entries(freq)
    .sort(([, a], [, b]) => b - a).slice(0, 12)
    .map(([word, count]) => ({ word, count }));

  res.json({
    kpi: { total, today, positivePct: Math.round((pos / (pos + neg || 1)) * 100), docCount },
    queriesPerDay,
    topTopics,
    topDocuments,
  });
});

// Serve admin panel
app.get('/admin', (_req, res) => res.sendFile('admin.html', { root: '.' }));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`✅ Libby läuft auf Port ${PORT} — DB: ${DB_PATH} (persistent: ${DB_PATH.startsWith('/data')}) — Admin: http://localhost:${PORT}/admin`));
