import Database from 'better-sqlite3';

const db = new Database('libby.db');

db.exec(`
  -- ── Conversations ──────────────────────────────────────────
  CREATE TABLE IF NOT EXISTS conversations (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id      TEXT,
    user_message    TEXT,
    assistant_message TEXT,
    feedback        INTEGER DEFAULT 0,
    context         TEXT    DEFAULT '',
    used_search     INTEGER DEFAULT 0,
    language        TEXT    DEFAULT 'de',
    source_doc_ids  TEXT    DEFAULT '',
    timestamp       DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE INDEX IF NOT EXISTS idx_session  ON conversations(session_id);
  CREATE INDEX IF NOT EXISTS idx_feedback ON conversations(feedback);
  CREATE INDEX IF NOT EXISTS idx_ts       ON conversations(timestamp);

  -- ── Documents ───────────────────────────────────────────────
  CREATE TABLE IF NOT EXISTS documents (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    filename   TEXT    NOT NULL,
    title      TEXT    NOT NULL,
    content    TEXT    NOT NULL,
    file_type  TEXT,
    hit_count  INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  -- Full-text search index (FTS5) over title + content
  CREATE VIRTUAL TABLE IF NOT EXISTS documents_fts USING fts5(
    title,
    content,
    content='documents',
    content_rowid='id'
  );

  -- Triggers to keep FTS index in sync with documents table
  CREATE TRIGGER IF NOT EXISTS docs_ai AFTER INSERT ON documents BEGIN
    INSERT INTO documents_fts(rowid, title, content)
    VALUES (new.id, new.title, new.content);
  END;

  CREATE TRIGGER IF NOT EXISTS docs_ad AFTER DELETE ON documents BEGIN
    INSERT INTO documents_fts(documents_fts, rowid, title, content)
    VALUES ('delete', old.id, old.title, old.content);
  END;

  CREATE TRIGGER IF NOT EXISTS docs_au AFTER UPDATE ON documents BEGIN
    INSERT INTO documents_fts(documents_fts, rowid, title, content)
    VALUES ('delete', old.id, old.title, old.content);
    INSERT INTO documents_fts(rowid, title, content)
    VALUES (new.id, new.title, new.content);
  END;
`);

// ── Migrations for existing databases ──────────────────────────
const migrations = [
  'ALTER TABLE conversations ADD COLUMN used_search     INTEGER DEFAULT 0',
  'ALTER TABLE conversations ADD COLUMN language        TEXT    DEFAULT "de"',
  'ALTER TABLE conversations ADD COLUMN source_doc_ids  TEXT    DEFAULT ""',
];

for (const sql of migrations) {
  try { db.exec(sql); } catch { /* column already exists — safe to ignore */ }
}

console.log('✅ Datenbank initialisiert');
db.close();
