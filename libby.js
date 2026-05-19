/* ── Backend URL ──────────────────────────────────────────────
   Leer lassen  →  relative Pfade (/api/chat) — funktioniert wenn
                   der Browser direkt auf dem Railway-Server ist.
   Railway URL  →  absoluter Pfad für GitHub Pages Embedding, z. B.:
                   'https://aa-chatbot-production.up.railway.app'
   ──────────────────────────────────────────────────────────── */
const BACKEND_URL = 'https://aa-chatbot-production.up.railway.app';

/* ── Build sources list for system prompt (from sources.js) ── */
function buildSourcesList() {
  return SOURCES.map(s => `• ${s.label}: ${s.url}`).join('\n');
}

/* ── System prompt ── */
const SYSTEM = `Du bist Libby, Ökonomin bei Agenda Austria Wien, 28 Jahre alt.

SPRACHE: Immer Deutsch. Immer "du", niemals "Sie".
STIL: 3–5 Sätze. Nutze Aufzählungen mit • wenn sinnvoll. Setze **fett** sehr sparsam ein – nur für das eine entscheidende Wort oder die eine Zahl pro Antwort, die wirklich heraussticht. Max. 1 Emoji.
VERBOTEN: Lange Einleitungen, Meta-Kommentare, Selbstvorstellungen.

QUELLEN — nur diese URLs verwenden, nie andere erfinden:
${buildSourcesList()}

FORMAT: Jede Antwort endet mit:
FOLLOWUP: Kurze Frage 1 | Kurze Frage 2 | Kurze Frage 3
QUELLE: Linktext | URL   (passende Quelle aus der Liste oben; weglassen wenn keine passt)
(max. 5 Wörter je Folgefrage)`;

const SYSTEM_FIRST = SYSTEM + `\n\nERSTE FRAGE: Antworte in max. 2–3 Sätzen, FOLLOWUP und QUELLE wie gewohnt anhängen.`;

const CHIP_POOL = [
  'Wohnungsmarkt – warum so teuer?',
  'Warum zahlen wir so viel Steuern?',
  'Ist das Pensionssystem noch zu retten?',
  'Was kostet uns die Bürokratie?',
  'Warum wächst Österreichs Wirtschaft kaum?',
  'Wie steht Österreich im EU-Vergleich?',
  'Was bringt eine Steuersenkung wirklich?',
  'Ist der Sozialstaat noch finanzierbar?',
  'Warum sind Energiekosten so hoch?',
  'Was kostet uns der Staat wirklich?',
  'Warum ist Österreich kein Gründerland?',
  'Wie hoch sind die Staatsschulden wirklich?',
];

const INTRO = `Ich bin Libby, Ökonomin bei Agenda Austria.\n\nIch sage, was ich denke – nicht was du hören willst. Unabhängig, aber nicht neutral 😉\n\nWas willst du wissen?`;

function randomChips(n = 3) {
  return [...CHIP_POOL].sort(() => Math.random() - 0.5).slice(0, n);
}

let history     = [];
let sessionId   = 'u_' + Date.now();
let apiKey      = localStorage.getItem('libby_key') || '';
let isFirst     = true;
let recognition = null;

const chatInner = document.querySelector('.chat-inner');
const chatEl    = document.getElementById('chat');
const msgEl     = document.getElementById('msg');
const btnEl     = document.getElementById('btn');
const micBtn    = document.getElementById('mic-btn');
const banner    = document.getElementById('key-banner');

/* ── Init ── */
(async function init() {
  addBotStatic(INTRO, null, randomChips());
  // Prüfen ob Backend erreichbar — wenn ja, kein API Key nötig
  try {
    const r = await fetch(BACKEND_URL + '/api/stats', { signal: AbortSignal.timeout(4000) });
    if (!r.ok) throw new Error();
    // Backend OK → Banner versteckt lassen
  } catch {
    // Backend nicht erreichbar → API Key nötig
    if (!apiKey) banner.classList.add('visible');
  }
  if (!('SpeechRecognition' in window) && !('webkitSpeechRecognition' in window)) {
    micBtn.style.display = 'none';
  }
})();

/* ── Key ── */
function saveKey() {
  const v = document.getElementById('key-input').value.trim();
  if (!v.startsWith('sk-')) { alert('Ungültiger Key'); return; }
  apiKey = v;
  localStorage.setItem('libby_key', apiKey);
  banner.classList.remove('visible');
}

/* ── Dictation ── */
function toggleDictation() {
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SR) return;

  if (recognition) {
    recognition.stop();
    recognition = null;
    micBtn.classList.remove('listening');
    return;
  }

  recognition = new SR();
  recognition.lang = 'de-DE';
  recognition.continuous = false;
  recognition.interimResults = false;

  recognition.onstart  = () => micBtn.classList.add('listening');
  recognition.onresult = (e) => { msgEl.value = e.results[0][0].transcript; msgEl.focus(); };
  recognition.onend    = () => { micBtn.classList.remove('listening'); recognition = null; };
  recognition.onerror  = () => { micBtn.classList.remove('listening'); recognition = null; };
  recognition.start();
}

/* ── Text rendering ── */
function renderText(raw) {
  function parseBold(text) {
    const span  = document.createElement('span');
    const parts = text.split(/\*\*(.+?)\*\*/g);
    parts.forEach((p, i) => {
      if (i % 2 === 1) {
        const b = document.createElement('b');
        b.textContent = p;
        span.appendChild(b);
      } else if (p) {
        span.appendChild(document.createTextNode(p));
      }
    });
    return span;
  }

  const paras = raw.split(/\n{2,}/);
  const frag  = document.createDocumentFragment();

  paras.forEach(para => {
    const lines  = para.split('\n').filter(l => l.trim());
    const isList = lines.length > 1 && lines.every(l => /^[•\-]/.test(l.trim()));

    if (isList) {
      const ul = document.createElement('ul');
      lines.forEach(l => {
        const li = document.createElement('li');
        li.appendChild(parseBold(l.replace(/^[•\-]\s*/, '').trim()));
        ul.appendChild(li);
      });
      frag.appendChild(ul);
    } else {
      const p = document.createElement('p');
      p.appendChild(parseBold(para.trim()));
      frag.appendChild(p);
    }
  });
  return frag;
}

/* ── Parse FOLLOWUP + QUELLE tags from AI response ── */
function parseTags(text) {
  const fuMatch = text.match(/\nFOLLOWUP:\s*(.+?)(?:\n|$)/m);
  const qMatch  = text.match(/\nQUELLE:\s*(.+?)\s*\|\s*(https?:\/\/\S+)\s*(?:\n|$)/m);

  // Cut the clean text before the first tag
  let cutAt = text.length;
  if (fuMatch) cutAt = Math.min(cutAt, fuMatch.index);
  if (qMatch)  cutAt = Math.min(cutAt, qMatch.index);

  // Safety: only accept agendaaustria.at URLs — never render AI-hallucinated external links
  const rawUrl = qMatch?.[2]?.trim();
  const source = (qMatch && rawUrl?.includes('agendaaustria.at'))
    ? { label: qMatch[1].trim(), url: rawUrl }
    : null;

  return {
    clean:     text.slice(0, cutAt).trim(),
    followups: fuMatch ? fuMatch[1].split('|').map(s => s.trim()).filter(Boolean) : [],
    source
  };
}

/* ── DOM helpers ── */
function scrollBottom() { chatEl.scrollTop = chatEl.scrollHeight; }

function renderSource(bubble, source) {
  if (!source) return;
  const a = document.createElement('a');
  a.className = 'source-link';
  a.href = source.url;
  a.target = '_blank';
  a.rel = 'noopener noreferrer';
  a.textContent = source.label;
  bubble.appendChild(a);
}

function addChips(chips) {
  if (!chips.length) return;
  const wrap = document.createElement('div');
  wrap.className = 'chips-wrap';
  chips.forEach(label => {
    const c = document.createElement('button');
    c.className = 'chip';
    c.textContent = label;
    c.onclick = () => { wrap.remove(); pickChip(label); };
    wrap.appendChild(c);
  });
  chatInner.appendChild(wrap);
  scrollBottom();
}

function addFeedback(id) {
  if (!id) return;
  const fb = document.createElement('div');
  fb.className = 'fb';
  fb.innerHTML = `<button onclick="giveFb(${id},1,this)">👍</button><button onclick="giveFb(${id},-1,this)">👎</button>`;
  chatInner.appendChild(fb);
}

function addBotStatic(text, id, chips = []) {
  const w = document.createElement('div');
  w.className = 'msg-wrap bot';
  const b = document.createElement('div');
  b.className = 'bubble bot';
  b.appendChild(renderText(text));
  w.appendChild(b);
  chatInner.appendChild(w);
  if (id) addFeedback(id);
  if (chips.length) addChips(chips);
  scrollBottom();
}

function addUser(text) {
  const w = document.createElement('div');
  w.className = 'msg-wrap user';
  const b = document.createElement('div');
  b.className = 'bubble user';
  b.textContent = text;
  w.appendChild(b);
  chatInner.appendChild(w);
  scrollBottom();
}

function createStreamBubble() {
  const w   = document.createElement('div');
  w.className = 'msg-wrap bot';
  const b   = document.createElement('div');
  b.className = 'bubble bot';
  const cur = document.createElement('span');
  cur.className = 'cursor';
  b.appendChild(cur);
  w.appendChild(b);
  chatInner.appendChild(w);
  return { bubble: b, cursor: cur };
}

/* During streaming: strip tags so they never flash up mid-render */
function updateStream(bubble, cursor, text) {
  const display = text
    .replace(/\nFOLLOWUP:.*$/m, '')
    .replace(/\nQUELLE:.*$/m, '');
  let wrap = bubble.querySelector('.stream-wrap');
  if (!wrap) {
    wrap = document.createElement('div');
    wrap.className = 'stream-wrap';
    bubble.insertBefore(wrap, cursor);
  }
  wrap.innerHTML = '';
  wrap.appendChild(renderText(display));
  scrollBottom();
}

/* After streaming: unwrap — content already formatted, zero visual jump */
function finalizeStream(bubble) {
  const wrap = bubble.querySelector('.stream-wrap');
  if (wrap) {
    const frag = document.createDocumentFragment();
    Array.from(wrap.childNodes).forEach(n => frag.appendChild(n));
    wrap.replaceWith(frag);
  }
}

function pickChip(label) {
  msgEl.value = label;
  btnEl.click();
}

/* ── Send ── */
async function send(e) {
  e.preventDefault();
  const text = msgEl.value.trim();
  if (!text) return;

  document.querySelectorAll('.chips-wrap').forEach(el => el.remove());
  addUser(text);
  history.push({ role: 'user', content: text });
  msgEl.value = '';
  btnEl.disabled = true;

  const typingWrap = document.createElement('div');
  typingWrap.className = 'typing-wrap';
  typingWrap.innerHTML = '<div class="typing"><div class="dot"></div><div class="dot"></div><div class="dot"></div></div>';
  chatInner.appendChild(typingWrap);
  scrollBottom();

  const sysPrompt = isFirst ? SYSTEM_FIRST : SYSTEM;
  isFirst = false;

  try {
    let fullText = '', convId = null, usedBackend = false;

    // Backend-first: kein API Key nötig (Railway kümmert sich darum)
    try {
      const r = await fetch(BACKEND_URL + '/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: text, sessionId }),
        signal: AbortSignal.timeout(8000)
      });
      if (r.ok) { const d = await r.json(); fullText = d.message; convId = d.conversationId; usedBackend = true; }
    } catch { /* fall through to direct API */ }

    typingWrap.remove();
    const { bubble, cursor } = createStreamBubble();

    if (usedBackend) {
      const { clean, followups, source } = parseTags(fullText);
      updateStream(bubble, cursor, clean);
      cursor.remove();
      finalizeStream(bubble);
      renderSource(bubble, source);
      history.push({ role: 'assistant', content: clean });
      addFeedback(convId);
      addChips(followups);
    } else {
      // Direkter API-Fallback: braucht lokalen Key
      if (!apiKey) {
        typingWrap.remove();
        cursor.remove();
        bubble.parentElement.remove();
        banner.classList.add('visible');
        document.getElementById('key-input').focus();
        btnEl.disabled = false;
        return;
      }
      const resp = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
          'anthropic-dangerous-direct-browser-access': 'true'
        },
        body: JSON.stringify({
          model: 'claude-haiku-4-5-20251001',
          max_tokens: 400,
          stream: true,
          system: sysPrompt,
          messages: history.slice(-10)
        })
      });

      if (resp.status === 401) {
        localStorage.removeItem('libby_key');
        apiKey = '';
        banner.classList.add('visible');
        cursor.remove();
        bubble.textContent = 'API Key ungültig – bitte neu eingeben.';
        btnEl.disabled = false;
        return;
      }

      const reader  = resp.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop();
        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          const raw = line.slice(6).trim();
          if (raw === '[DONE]') break;
          try {
            const ev = JSON.parse(raw);
            if (ev.type === 'content_block_delta' && ev.delta?.type === 'text_delta') {
              fullText += ev.delta.text;
              updateStream(bubble, cursor, fullText);
            }
          } catch { /* malformed SSE chunk, skip */ }
        }
      }

      const { clean, followups, source } = parseTags(fullText);
      cursor.remove();
      finalizeStream(bubble);
      renderSource(bubble, source);
      history.push({ role: 'assistant', content: clean });
      addChips(followups);
    }
  } catch {
    typingWrap.remove();
    addBotStatic('Verbindungsfehler – bitte nochmal versuchen.');
  }

  btnEl.disabled = false;
  msgEl.focus();
}

async function giveFb(id, val, btn) {
  try {
    await fetch(BACKEND_URL + '/api/feedback', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ conversationId: id, feedback: val })
    });
  } catch { /* ignore */ }
  btn.classList.add(val > 0 ? 'good' : 'bad');
  btn.parentElement.querySelectorAll('button').forEach(b => { if (b !== btn) b.disabled = true; });
}

window.visualViewport?.addEventListener('resize', scrollBottom);
