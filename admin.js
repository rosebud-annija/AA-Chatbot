/* ── State ── */
let adminKey = localStorage.getItem('libby_admin_key') || '';
let charts   = {};

/* ── Login / Logout ── */
async function login() {
  const key = document.getElementById('login-input').value.trim();
  if (!key) return;

  const ok = await verifyKey(key);
  if (!ok) {
    document.getElementById('login-error').style.display = 'block';
    return;
  }
  adminKey = key;
  localStorage.setItem('libby_admin_key', key);
  showApp();
}

function logout() {
  localStorage.removeItem('libby_admin_key');
  adminKey = '';
  document.getElementById('app').hidden = true;
  document.getElementById('login-screen').style.display = 'flex';
  document.getElementById('login-input').value = '';
  document.getElementById('login-error').style.display = 'none';
}

async function verifyKey(key) {
  try {
    const r = await fetch('/admin/verify', { headers: { 'x-admin-key': key } });
    return r.ok;
  } catch { return false; }
}

function showApp() {
  document.getElementById('login-screen').style.display = 'none';
  document.getElementById('app').hidden = false;
  loadDocuments();
}

/* Auto-login if key stored */
(async function init() {
  if (adminKey && await verifyKey(adminKey)) {
    showApp();
  }
  document.getElementById('login-input').addEventListener('keydown', e => {
    if (e.key === 'Enter') login();
  });
})();

/* ── Navigation ── */
function showSection(id) {
  document.querySelectorAll('section').forEach(s => s.classList.remove('visible'));
  document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
  document.getElementById('section-' + id).classList.add('visible');
  document.getElementById('nav-' + id).classList.add('active');

  if (id === 'stats') loadStats();
}

/* ── Documents ── */
async function loadDocuments() {
  try {
    const r    = await fetch('/admin/documents', { headers: { 'x-admin-key': adminKey } });
    const docs = await r.json();
    renderDocTable(docs);
  } catch (err) {
    console.error(err);
  }
}

function renderDocTable(docs) {
  const tbody = document.getElementById('doc-tbody');
  if (!docs.length) {
    tbody.innerHTML = '<tr class="empty-row"><td colspan="5">Noch keine Dokumente hochgeladen.</td></tr>';
    return;
  }
  tbody.innerHTML = docs.map(d => `
    <tr>
      <td><strong>${esc(d.title)}</strong><br>
          <small style="color:var(--muted)">${esc(d.filename)}</small></td>
      <td><span class="badge badge-${d.file_type.toLowerCase()}">${d.file_type}</span></td>
      <td>${formatDate(d.created_at)}</td>
      <td><span class="hit-count">${d.hit_count}</span></td>
      <td><button class="del-btn" onclick="deleteDoc(${d.id}, this)" title="Löschen">🗑</button></td>
    </tr>
  `).join('');
}

async function deleteDoc(id, btn) {
  if (!confirm('Dokument wirklich löschen?')) return;
  btn.disabled = true;
  try {
    await fetch(`/admin/documents/${id}`, {
      method: 'DELETE',
      headers: { 'x-admin-key': adminKey },
    });
    await loadDocuments();
  } catch (err) {
    alert('Fehler beim Löschen.');
    btn.disabled = false;
  }
}

/* ── Upload ── */
const zone      = document.getElementById('upload-zone');
const fileInput = document.getElementById('file-input');
const progress  = document.getElementById('upload-progress');
const statusEl  = document.getElementById('upload-status');

zone.addEventListener('click', () => fileInput.click());
zone.addEventListener('dragover',  e => { e.preventDefault(); zone.classList.add('drag-over'); });
zone.addEventListener('dragleave', ()  => zone.classList.remove('drag-over'));
zone.addEventListener('drop', e => {
  e.preventDefault();
  zone.classList.remove('drag-over');
  const file = e.dataTransfer.files[0];
  if (file) uploadFile(file);
});
fileInput.addEventListener('change', () => {
  if (fileInput.files[0]) uploadFile(fileInput.files[0]);
  fileInput.value = '';
});

async function uploadFile(file) {
  const allowed = ['application/pdf',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'text/plain'];
  const byExt = file.name.match(/\.(pdf|docx|txt)$/i);
  if (!allowed.includes(file.type) && !byExt) {
    alert('Nur PDF, DOCX oder TXT erlaubt.');
    return;
  }

  progress.classList.add('visible');
  statusEl.textContent = `„${file.name}" wird hochgeladen …`;

  const form = new FormData();
  form.append('file', file);

  try {
    const r    = await fetch('/admin/upload', {
      method: 'POST',
      headers: { 'x-admin-key': adminKey },
      body:   form,
    });
    const data = await r.json();
    if (!r.ok) throw new Error(data.error || 'Upload fehlgeschlagen');

    statusEl.textContent = `✅ „${data.title}" erfolgreich hochgeladen (${data.fileType})`;
    setTimeout(() => progress.classList.remove('visible'), 3000);
    await loadDocuments();
  } catch (err) {
    statusEl.textContent = '❌ ' + err.message;
    setTimeout(() => progress.classList.remove('visible'), 4000);
  }
}

/* ── URL Import ── */
async function importUrl() {
  const url = document.getElementById('url-input').value.trim();
  if (!url || !url.startsWith('http')) { alert('Bitte eine gültige URL eingeben.'); return; }

  progress.classList.add('visible');
  statusEl.textContent = `„${url}" wird importiert …`;

  try {
    const r    = await fetch('/admin/import-url', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json', 'x-admin-key': adminKey },
      body:    JSON.stringify({ url }),
    });
    const data = await r.json();
    if (!r.ok) throw new Error(data.error || 'Import fehlgeschlagen');

    statusEl.textContent = `✅ „${data.title}" erfolgreich importiert`;
    document.getElementById('url-input').value = '';
    setTimeout(() => progress.classList.remove('visible'), 3000);
    await loadDocuments();
  } catch (err) {
    statusEl.textContent = '❌ ' + err.message;
    setTimeout(() => progress.classList.remove('visible'), 4000);
  }
}

/* ── Statistics ── */
async function loadStats() {
  try {
    const r    = await fetch('/admin/stats/full', { headers: { 'x-admin-key': adminKey } });
    const data = await r.json();
    renderKPIs(data.kpi);
    renderQueriesChart(data.queriesPerDay);
    renderTopicsChart(data.topTopics);
    renderDocsChart(data.topDocuments);
  } catch (err) {
    console.error(err);
  }
}

function renderKPIs({ total, today, positivePct, docCount }) {
  document.getElementById('kpi-total').textContent    = total.toLocaleString('de');
  document.getElementById('kpi-today').textContent    = today;
  document.getElementById('kpi-feedback').textContent = positivePct + ' %';
  document.getElementById('kpi-docs').textContent     = docCount;
}

function renderQueriesChart(data) {
  destroyChart('queries');

  // Fill missing days with 0
  const filled = fillDays(data, 30);

  charts.queries = new Chart(document.getElementById('chart-queries'), {
    type: 'line',
    data: {
      labels:   filled.map(d => d.date.slice(5)),
      datasets: [{
        label:           'Anfragen',
        data:            filled.map(d => d.count),
        borderColor:     '#27348b',
        backgroundColor: 'rgba(39,52,139,.08)',
        borderWidth:     2,
        pointRadius:     3,
        pointBackgroundColor: '#27348b',
        fill:            true,
        tension:         .3,
      }],
    },
    options: {
      responsive: true,
      plugins: { legend: { display: false } },
      scales: {
        x: { grid: { display: false }, ticks: { maxTicksLimit: 10, font: { size: 11 } } },
        y: { beginAtZero: true, ticks: { precision: 0, font: { size: 11 } } },
      },
    },
  });
}

function renderTopicsChart(data) {
  destroyChart('topics');
  if (!data.length) return;

  charts.topics = new Chart(document.getElementById('chart-topics'), {
    type: 'bar',
    data: {
      labels:   data.map(d => d.word),
      datasets: [{
        data:            data.map(d => d.count),
        backgroundColor: '#27348b',
        borderRadius:    4,
      }],
    },
    options: {
      indexAxis: 'y',
      responsive: true,
      plugins: { legend: { display: false } },
      scales: {
        x: { beginAtZero: true, ticks: { precision: 0, font: { size: 11 } } },
        y: { ticks: { font: { size: 11 } } },
      },
    },
  });
}

function renderDocsChart(data) {
  destroyChart('docs');
  if (!data.length) {
    document.getElementById('chart-docs').parentElement.querySelector('h3').insertAdjacentHTML(
      'afterend', '<p style="color:var(--muted);font-size:13px;margin-top:8px">Noch keine Dokumente abgerufen.</p>'
    );
    return;
  }

  charts.docs = new Chart(document.getElementById('chart-docs'), {
    type: 'bar',
    data: {
      labels:   data.map(d => d.title.length > 28 ? d.title.slice(0, 26) + '…' : d.title),
      datasets: [{
        data:            data.map(d => d.hit_count),
        backgroundColor: '#8ccaae',
        borderRadius:    4,
      }],
    },
    options: {
      indexAxis: 'y',
      responsive: true,
      plugins: { legend: { display: false } },
      scales: {
        x: { beginAtZero: true, ticks: { precision: 0, font: { size: 11 } } },
        y: { ticks: { font: { size: 11 } } },
      },
    },
  });
}

/* ── Helpers ── */
function destroyChart(key) {
  if (charts[key]) { charts[key].destroy(); delete charts[key]; }
}

function fillDays(data, days) {
  const map    = Object.fromEntries(data.map(d => [d.date, d.count]));
  const result = [];
  for (let i = days - 1; i >= 0; i--) {
    const d    = new Date(); d.setDate(d.getDate() - i);
    const key  = d.toISOString().slice(0, 10);
    result.push({ date: key, count: map[key] || 0 });
  }
  return result;
}

function formatDate(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('de-AT', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

function esc(str) {
  return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
