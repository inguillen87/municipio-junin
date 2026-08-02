// ============================================================
// UPLOAD.JS — Análisis Masivo de Archivos
// Soporta: Excel, PDF, Word, CSV, Imágenes
// ============================================================

// Configurar PDF.js worker
if (window.pdfjsLib) pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.worker.min.js';

// ── ESTADO GLOBAL ─────────────────────────────────────────
const state = {
  files: [],          // { id, file, type, status, data, text, summary }
  allRows: [],        // Todas las filas de todos los Excels/CSVs
  allHeaders: [],     // Headers unificados
  charts: {},
};

// ── TIPOS DE ARCHIVO ──────────────────────────────────────
function getFileType(file) {
  const name = file.name.toLowerCase();
  const ext  = name.split('.').pop();
  if (['xlsx','xls'].includes(ext)) return 'excel';
  if (ext === 'csv') return 'csv';
  if (ext === 'pdf') return 'pdf';
  if (['docx','doc'].includes(ext)) return 'word';
  if (['jpg','jpeg','png','webp','gif','bmp'].includes(ext)) return 'img';
  if (ext === 'txt') return 'txt';
  return 'other';
}

function getFileIcon(type) {
  return { excel:'📊', csv:'📋', pdf:'📄', word:'📝', img:'🖼️', txt:'📃', other:'📁' }[type] || '📁';
}

function formatBytes(bytes) {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024*1024) return (bytes/1024).toFixed(1) + ' KB';
  return (bytes/1024/1024).toFixed(1) + ' MB';
}

// ── DRAG & DROP ───────────────────────────────────────────
const dropArea = document.getElementById('uploadDropArea');
const fileInput = document.getElementById('fileInput');

dropArea.addEventListener('dragover', e => { e.preventDefault(); dropArea.closest('.upload-zone').classList.add('dragover'); });
dropArea.addEventListener('dragleave', () => dropArea.closest('.upload-zone').classList.remove('dragover'));
dropArea.addEventListener('drop', e => {
  e.preventDefault();
  dropArea.closest('.upload-zone').classList.remove('dragover');
  addFiles([...e.dataTransfer.files]);
});
dropArea.addEventListener('click', () => fileInput.click());
fileInput.addEventListener('change', () => addFiles([...fileInput.files]));
document.getElementById('uploadSelectBtn').addEventListener('click', e => { e.stopPropagation(); fileInput.click(); });

// ── AGREGAR ARCHIVOS ──────────────────────────────────────
function addFiles(files) {
  const MAX = 20;
  if (state.files.length + files.length > MAX) {
    alert(`Máximo ${MAX} archivos. Tenés ${state.files.length} cargados.`);
    files = files.slice(0, MAX - state.files.length);
  }
  files.forEach(file => {
    const id = Date.now() + Math.random().toString(36).slice(2);
    state.files.push({ id, file, type: getFileType(file), status: 'pending', data: null, text: '', summary: '' });
    renderFileCard(state.files[state.files.length - 1]);
  });
  document.getElementById('filesSection').style.display = 'block';
  document.getElementById('fileCount').textContent = state.files.length;
  fileInput.value = '';
}

// ── RENDER CARD ────────────────────────────────────────────
function renderFileCard(f) {
  const grid = document.getElementById('filesGrid');
  const card = document.createElement('div');
  card.className = 'file-card';
  card.id = 'card-' + f.id;
  card.innerHTML = `
    <div class="file-card-top">
      <div class="file-icon">${getFileIcon(f.type)}</div>
      <div class="file-meta">
        <div class="file-name" title="${f.file.name}">${f.file.name}</div>
        <div class="file-size">${formatBytes(f.file.size)} · ${f.type.toUpperCase()}</div>
      </div>
      <button class="file-remove" data-id="${f.id}" title="Quitar">✕</button>
    </div>
    <div class="file-progress">
      <div class="file-progress-bar-wrap">
        <div class="file-progress-bar ${f.type}" id="bar-${f.id}" style="width:0%"></div>
      </div>
      <span class="file-progress-label" id="lbl-${f.id}">Pendiente</span>
    </div>
    <div class="file-summary" id="sum-${f.id}">Listo para analizar</div>
    <div class="file-tags" id="tags-${f.id}"></div>`;
  grid.appendChild(card);
  card.querySelector('.file-remove').addEventListener('click', e => {
    e.stopPropagation();
    removeFile(f.id);
  });
}

function removeFile(id) {
  state.files = state.files.filter(f => f.id !== id);
  document.getElementById('card-' + id)?.remove();
  document.getElementById('fileCount').textContent = state.files.length;
  if (state.files.length === 0) document.getElementById('filesSection').style.display = 'none';
}

function setCardStatus(id, status, label, pct) {
  const card = document.getElementById('card-' + id);
  if (!card) return;
  if (status) { card.className = 'file-card ' + status; }
  const bar = document.getElementById('bar-' + id);
  if (bar && pct !== undefined) bar.style.width = pct + '%';
  const lbl = document.getElementById('lbl-' + id);
  if (lbl && label) lbl.textContent = label;
}

function setCardSummary(id, text) {
  const el = document.getElementById('sum-' + id);
  if (el) el.textContent = text;
}

function addCardTags(id, tags) {
  const el = document.getElementById('tags-' + id);
  if (el) el.innerHTML = tags.map(t => `<span class="file-tag">${t}</span>`).join('');
}

// ── ANALIZAR TODOS ────────────────────────────────────────
document.getElementById('btnAnalyzeAll').addEventListener('click', async () => {
  const btn = document.getElementById('btnAnalyzeAll');
  btn.disabled = true;
  btn.textContent = '⏳ Analizando...';
  state.allRows = [];
  state.allHeaders = [];
  const textResults = [];

  for (const f of state.files) {
    if (f.status === 'done') continue;
    setCardStatus(f.id, 'processing', 'Procesando...', 10);
    try {
      if (f.type === 'excel') await processExcel(f);
      else if (f.type === 'csv')   await processCSV(f);
      else if (f.type === 'pdf')   await processPDF(f);
      else if (f.type === 'word')  await processWord(f);
      else if (f.type === 'img')   await processImage(f);
      else if (f.type === 'txt')   await processTxt(f);
      f.status = 'done';
      setCardStatus(f.id, 'done', '✅ Procesado', 100);
      if (f.text) textResults.push({ name: f.file.name, type: f.type, text: f.text });
    } catch (e) {
      f.status = 'error';
      setCardStatus(f.id, 'error', '❌ Error: ' + e.message, 0);
    }
  }

  renderResults(textResults);
  btn.disabled = false;
  btn.textContent = '⚡ Analizar todos';
});

document.getElementById('btnClear').addEventListener('click', () => {
  state.files = [];
  state.allRows = [];
  document.getElementById('filesGrid').innerHTML = '';
  document.getElementById('fileCount').textContent = 0;
  document.getElementById('filesSection').style.display = 'none';
  document.getElementById('resultsPanel').style.display = 'none';
});

// ── PROCESADORES ──────────────────────────────────────────

async function processExcel(f) {
  setCardStatus(f.id, null, 'Leyendo Excel...', 30);
  const buf = await f.file.arrayBuffer();
  const wb  = XLSX.read(buf, { type: 'array' });
  let rowCount = 0;
  let sheetNames = [];

  wb.SheetNames.forEach(sheetName => {
    const ws   = wb.Sheets[sheetName];
    const data = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
    if (data.length < 2) return;
    const headers = data[0].map(String);
    const rows    = data.slice(1).filter(r => r.some(c => c !== ''));
    rows.forEach(row => {
      const obj = { _source: f.file.name, _sheet: sheetName };
      headers.forEach((h, i) => obj[h] = row[i] ?? '');
      state.allRows.push(obj);
      headers.forEach(h => { if (!state.allHeaders.includes(h)) state.allHeaders.push(h); });
    });
    rowCount += rows.length;
    sheetNames.push(sheetName);
  });
  setCardStatus(f.id, null, `✅ ${rowCount} filas en ${sheetNames.length} hoja(s)`, 100);
  setCardSummary(f.id, `${rowCount} filas · Hojas: ${sheetNames.join(', ')}`);
  addCardTags(f.id, ['Excel', `${rowCount} filas`, `${sheetNames.length} hojas`]);
  f.summary = `${rowCount} filas`;
}

async function processCSV(f) {
  setCardStatus(f.id, null, 'Leyendo CSV...', 30);
  const text  = await f.file.text();
  const lines = text.split('\n').filter(l => l.trim());
  if (lines.length < 2) return;
  const sep  = text.includes(';') ? ';' : ',';
  const hdrs = lines[0].split(sep).map(h => h.trim().replace(/"/g, ''));
  const rows = lines.slice(1);
  rows.forEach(line => {
    const vals = line.split(sep).map(v => v.trim().replace(/"/g, ''));
    const obj  = { _source: f.file.name, _sheet: 'CSV' };
    hdrs.forEach((h, i) => obj[h] = vals[i] ?? '');
    state.allRows.push(obj);
    hdrs.forEach(h => { if (!state.allHeaders.includes(h)) state.allHeaders.push(h); });
  });
  setCardStatus(f.id, null, `✅ ${rows.length} filas`, 100);
  setCardSummary(f.id, `${rows.length} filas · ${hdrs.length} columnas`);
  addCardTags(f.id, ['CSV', `${rows.length} filas`]);
  f.summary = `${rows.length} filas`;
}

async function processPDF(f) {
  setCardStatus(f.id, null, 'Leyendo PDF...', 20);
  if (!window.pdfjsLib) throw new Error('PDF.js no disponible');
  const buf = await f.file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: buf }).promise;
  let fullText = '';
  for (let i = 1; i <= pdf.numPages; i++) {
    setCardStatus(f.id, null, `Página ${i}/${pdf.numPages}...`, Math.round((i / pdf.numPages) * 90));
    const page    = await pdf.getPage(i);
    const content = await page.getTextContent();
    fullText += content.items.map(item => item.str).join(' ') + '\n';
  }
  f.text = fullText.trim();
  const words = fullText.split(/\s+/).length;
  setCardStatus(f.id, null, `✅ ${pdf.numPages} páginas · ${words} palabras`, 100);
  setCardSummary(f.id, `${pdf.numPages} páginas · ~${words} palabras`);
  addCardTags(f.id, ['PDF', `${pdf.numPages} págs`]);
  f.summary = `${pdf.numPages} páginas`;
}

async function processWord(f) {
  setCardStatus(f.id, null, 'Leyendo Word...', 40);
  if (!window.mammoth) throw new Error('Mammoth.js no disponible');
  const buf    = await f.file.arrayBuffer();
  const result = await mammoth.extractRawText({ arrayBuffer: buf });
  f.text = result.value.trim();
  const words = f.text.split(/\s+/).length;
  setCardStatus(f.id, null, `✅ ${words} palabras extraídas`, 100);
  setCardSummary(f.id, `~${words} palabras`);
  addCardTags(f.id, ['Word', `${words} palabras`]);
  f.summary = `${words} palabras`;
}

async function processImage(f) {
  setCardStatus(f.id, null, 'OCR en proceso...', 20);
  if (!window.Tesseract) throw new Error('Tesseract no disponible');
  const url = URL.createObjectURL(f.file);
  const res = await Tesseract.recognize(url, 'spa+eng', {
    logger: m => {
      if (m.status === 'recognizing text') {
        setCardStatus(f.id, null, `OCR ${Math.round(m.progress * 100)}%...`, Math.round(m.progress * 90));
      }
    }
  });
  URL.revokeObjectURL(url);
  f.text = res.data.text.trim();
  const confidence = Math.round(res.data.confidence);
  setCardStatus(f.id, null, `✅ OCR ${confidence}% confianza`, 100);
  setCardSummary(f.id, `OCR: ${confidence}% confianza`);
  addCardTags(f.id, ['OCR', `${confidence}% conf.`]);
  f.summary = `OCR ${confidence}%`;
}

async function processTxt(f) {
  setCardStatus(f.id, null, 'Leyendo texto...', 60);
  f.text = await f.file.text();
  const words = f.text.split(/\s+/).length;
  setCardStatus(f.id, null, `✅ ${words} palabras`, 100);
  setCardSummary(f.id, `${words} palabras`);
  addCardTags(f.id, ['TXT']);
}

// ── RENDER RESULTADOS ─────────────────────────────────────
function renderResults(textResults) {
  document.getElementById('resultsPanel').style.display = 'flex';
  document.getElementById('btnExportReport').style.display = 'inline-block';
  document.getElementById('btnExportExcel').style.display  = 'inline-block';

  const now = new Date().toLocaleString('es-AR');
  document.getElementById('resultsMeta').textContent = `Análisis generado el ${now} · ${state.files.length} archivos · ${state.allRows.length} filas totales`;

  renderGlobalKPIs();
  renderDataTable();
  renderTextResults(textResults);
  renderCharts();
  populateSheetFilter();
}

function renderGlobalKPIs() {
  const excelFiles = state.files.filter(f => f.type === 'excel' || f.type === 'csv').length;
  const pdfFiles   = state.files.filter(f => f.type === 'pdf').length;
  const wordFiles  = state.files.filter(f => f.type === 'word').length;
  const imgFiles   = state.files.filter(f => f.type === 'img').length;

  // Buscar columnas numéricas
  const numCols = state.allHeaders.filter(h => {
    const sample = state.allRows.slice(0, 10).map(r => r[h]).filter(v => v !== '');
    return sample.length > 0 && sample.some(v => !isNaN(parseFloat(String(v).replace(/[$,.]/g,''))));
  });

  let totalSum = 0;
  if (numCols.length > 0) {
    const col = numCols[0];
    state.allRows.forEach(row => {
      const v = parseFloat(String(row[col] || '0').replace(/[$,.]/g,''));
      if (!isNaN(v)) totalSum += v;
    });
  }

  const kpis = [
    { label: 'Total archivos', value: state.files.length, icon: '📂', color: 'blue' },
    { label: 'Total filas/registros', value: state.allRows.length.toLocaleString('es-AR'), icon: '📋', color: 'green' },
    { label: 'Columnas detectadas', value: state.allHeaders.length, icon: '📊', color: 'violet' },
    { label: 'Archivos Excel/CSV', value: excelFiles, icon: '📊', color: 'green' },
    { label: 'Documentos PDF', value: pdfFiles, icon: '📄', color: 'red' },
    { label: 'Documentos Word', value: wordFiles, icon: '📝', color: 'blue' },
  ];
  if (numCols.length > 0 && totalSum > 0) {
    kpis[5] = { label: `Total "${numCols[0]}"`, value: '$' + totalSum.toLocaleString('es-AR'), icon: '💰', color: 'amber' };
  }

  document.getElementById('globalKPIs').innerHTML = kpis.map(k => `
    <div class="kpi-card">
      <div class="kpi-header"><span class="kpi-label">${k.label}</span><div class="kpi-icon ${k.color}">${k.icon}</div></div>
      <div class="kpi-value" style="font-size:28px">${k.value}</div>
    </div>`).join('');
}

function renderDataTable() {
  const wrap = document.getElementById('dataTableWrap');
  if (state.allRows.length === 0) {
    wrap.innerHTML = '<p class="empty-state">No se encontraron datos tabulares (sólo PDF/Word/imágenes)</p>';
    return;
  }
  const displayHeaders = ['_source', ...state.allHeaders.slice(0, 10)];
  const rows = state.allRows.slice(0, 500);

  let html = `<table class="uploaded-table"><thead><tr>`;
  html += displayHeaders.map(h => `<th>${h === '_source' ? 'Origen' : h}</th>`).join('');
  html += `</tr></thead><tbody>`;

  rows.forEach(row => {
    const srcType = state.files.find(f => f.file.name === row._source)?.type || 'excel';
    html += `<tr>`;
    displayHeaders.forEach(h => {
      const val = row[h] ?? '';
      const isNum = h !== '_source' && !isNaN(parseFloat(String(val).replace(/[$,.]/g,''))) && val !== '';
      if (h === '_source') {
        html += `<td><span class="source-badge ${srcType}">${String(val).slice(0,20)}</span></td>`;
      } else {
        html += `<td class="${isNum ? 'numeric' : ''}">${String(val).slice(0,60)}</td>`;
      }
    });
    html += `</tr>`;
  });
  if (state.allRows.length > 500) html += `<tr><td colspan="${displayHeaders.length}" style="text-align:center;color:var(--text-muted);font-style:italic">... y ${state.allRows.length - 500} filas más</td></tr>`;
  html += `</tbody></table>`;

  wrap.innerHTML = html;
  document.getElementById('tableTitle').textContent = `${state.allRows.length} registros de ${state.files.filter(f=>f.type==='excel'||f.type==='csv').length} archivos`;

  // Búsqueda
  document.getElementById('searchData').addEventListener('input', e => {
    const q = e.target.value.toLowerCase();
    wrap.querySelectorAll('tbody tr').forEach(row => {
      row.style.display = row.textContent.toLowerCase().includes(q) ? '' : 'none';
    });
  });
}

function renderTextResults(textResults) {
  const container = document.getElementById('textResults');
  if (textResults.length === 0) {
    container.innerHTML = '<p class="empty-state">No hay PDFs, Word ni imágenes procesados</p>';
    return;
  }
  container.innerHTML = textResults.map(t => `
    <div class="text-result-card">
      <div class="text-result-header">
        <span>${getFileIcon(t.type)}</span>
        <strong style="font-size:13px">${t.name}</strong>
        <span style="margin-left:auto;font-size:11px;color:var(--text-muted)">${t.text.split(/\s+/).length} palabras</span>
      </div>
      <div class="text-result-body">${t.text.slice(0, 800)}${t.text.length > 800 ? '...' : ''}</div>
    </div>`).join('');
}

function renderCharts() {
  // Donut: tipos de archivo
  const typeCounts = {};
  state.files.forEach(f => { typeCounts[f.type] = (typeCounts[f.type] || 0) + 1; });
  const typeColors = { excel:'#10b981', csv:'#f59e0b', pdf:'#ef4444', word:'#3b82f6', img:'#8b5cf6', txt:'#06b6d4', other:'#6b7280' };

  destroyChart('chartTipos');
  state.charts.tipos = new Chart(document.getElementById('chartTipos'), {
    type: 'doughnut',
    data: {
      labels: Object.keys(typeCounts).map(t => t.toUpperCase()),
      datasets: [{ data: Object.values(typeCounts), backgroundColor: Object.keys(typeCounts).map(t => typeColors[t] || '#6b7280'), borderWidth: 0 }],
    },
    options: { plugins: { legend: { labels: { color: '#94a3b8', font: { size: 12 } } } }, maintainAspectRatio: false },
  });

  // Bar: primera columna numérica
  if (state.allRows.length === 0) return;
  const numCols = state.allHeaders.filter(h => {
    const sample = state.allRows.slice(0, 5).map(r => r[h]).filter(v => v !== '');
    return sample.some(v => !isNaN(parseFloat(String(v).replace(/[$,.]/g,''))));
  });
  if (numCols.length === 0) return;

  const col  = numCols[0];
  const col2 = numCols[1] || null;
  const labelCol = state.allHeaders.find(h => !numCols.includes(h) && h !== '_source' && h !== '_sheet') || '_source';

  const sample = state.allRows.slice(0, 15);
  const labels = sample.map(r => String(r[labelCol] || '').slice(0, 20));
  const values = sample.map(r => parseFloat(String(r[col] || '0').replace(/[$,.]/g,'')) || 0);
  const values2 = col2 ? sample.map(r => parseFloat(String(r[col2] || '0').replace(/[$,.]/g,'')) || 0) : null;

  const chartData = {
    type: 'bar',
    data: {
      labels,
      datasets: [
        { label: col, data: values, backgroundColor: 'rgba(59,130,246,0.7)', borderRadius: 6 },
        ...(values2 ? [{ label: col2, data: values2, backgroundColor: 'rgba(16,185,129,0.7)', borderRadius: 6 }] : []),
      ],
    },
    options: {
      plugins: { legend: { labels: { color: '#94a3b8' } } },
      scales: { x: { ticks: { color: '#64748b' } }, y: { ticks: { color: '#64748b' }, grid: { color: 'rgba(255,255,255,0.05)' } } },
      maintainAspectRatio: false,
    },
  };

  destroyChart('chartNumeros');
  destroyChart('chartBarras');
  state.charts.num   = new Chart(document.getElementById('chartNumeros'), { ...chartData, type: 'bar' });
  document.getElementById('chartNumTitle').textContent = `${col} por registro`;

  // Línea para el chart grande
  state.charts.barras = new Chart(document.getElementById('chartBarras'), {
    ...chartData,
    type: 'line',
    data: { ...chartData.data, datasets: chartData.data.datasets.map(d => ({ ...d, fill: true, tension: 0.4, backgroundColor: d.backgroundColor.replace('0.7','0.15'), borderColor: d.backgroundColor.replace('0.7','1'), borderWidth: 2 })) },
  });
  document.getElementById('chartBarTitle').textContent = `Tendencia: ${col}`;
}

function destroyChart(id) {
  const key = Object.keys(state.charts).find(k => state.charts[k]?.canvas?.id === id);
  if (key) { state.charts[key].destroy(); delete state.charts[key]; }
}

function populateSheetFilter() {
  const sources = [...new Set(state.allRows.map(r => r._source))];
  const sel = document.getElementById('filterSheet');
  sel.innerHTML = '<option value="">Todos los archivos</option>' + sources.map(s => `<option>${s}</option>`).join('');
  sel.addEventListener('change', () => {
    const v = sel.value;
    document.querySelectorAll('.uploaded-table tbody tr').forEach(row => {
      row.style.display = !v || row.textContent.includes(v) ? '' : 'none';
    });
  });
}

// ── TABS ──────────────────────────────────────────────────
document.querySelectorAll('.tab-btn').forEach(btn => {
  btn.addEventListener('click', function() {
    this.closest('.content-wrapper').querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    this.closest('.content-wrapper').querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
    this.classList.add('active');
    document.getElementById('tab-' + this.dataset.tab)?.classList.add('active');
  });
});

// ── RESUMEN IA ────────────────────────────────────────────
document.getElementById('btnGenerateResumen')?.addEventListener('click', () => {
  const area = document.getElementById('iaSummaryArea');
  if (state.files.length === 0) { area.innerHTML = '<div class="ia-summary-placeholder">Primero cargá y analizá archivos.</div>'; return; }

  const numCols = state.allHeaders.filter(h => {
    const sample = state.allRows.slice(0, 5).map(r => r[h]).filter(v => v !== '');
    return sample.some(v => !isNaN(parseFloat(String(v).replace(/[$,.]/g,''))));
  });

  let totalSum = 0, maxVal = 0, minVal = Infinity, avgVal = 0;
  const numCol = numCols[0];
  if (numCol) {
    const vals = state.allRows.map(r => parseFloat(String(r[numCol] || '0').replace(/[$,.]/g,''))).filter(v => !isNaN(v) && v > 0);
    totalSum = vals.reduce((a, b) => a + b, 0);
    maxVal   = Math.max(...vals);
    minVal   = Math.min(...vals);
    avgVal   = vals.length ? totalSum / vals.length : 0;
  }

  const textCount  = state.files.filter(f => f.text).length;
  const totalWords = state.files.reduce((sum, f) => sum + (f.text ? f.text.split(/\s+/).length : 0), 0);

  const findings = [];
  if (state.allRows.length > 0) findings.push(`Se analizaron <strong>${state.allRows.length} registros</strong> con <strong>${state.allHeaders.length} columnas</strong> de datos estructurados.`);
  if (numCol && totalSum > 0) {
    findings.push(`La columna numérica principal detectada es <strong>"${numCol}"</strong>: total <strong>$${totalSum.toLocaleString('es-AR')}</strong>, promedio <strong>$${avgVal.toLocaleString('es-AR', {maximumFractionDigits:0})}</strong>, máximo <strong>$${maxVal.toLocaleString('es-AR')}</strong>.`);
  }
  if (textCount > 0) findings.push(`Se extrajeron <strong>${totalWords.toLocaleString('es-AR')} palabras</strong> de ${textCount} documentos (PDF/Word/imágenes).`);
  const sources = [...new Set(state.allRows.map(r => r._source))];
  if (sources.length > 1) findings.push(`Los datos provienen de <strong>${sources.length} archivos distintos</strong>: ${sources.join(', ')}.`);
  if (state.allRows.length > 100) findings.push(`Con ${state.allRows.length} registros ya es viable conectar una base de datos PostgreSQL para consultas en tiempo real.`);

  area.innerHTML = `<div class="ia-summary-content">
    <div class="ia-kpi-row">
      <div class="ia-kpi"><div class="ia-kpi-val">${state.files.length}</div><div class="ia-kpi-lbl">Archivos analizados</div></div>
      <div class="ia-kpi"><div class="ia-kpi-val">${state.allRows.length}</div><div class="ia-kpi-lbl">Filas de datos</div></div>
      <div class="ia-kpi"><div class="ia-kpi-val">${state.allHeaders.length}</div><div class="ia-kpi-lbl">Columnas</div></div>
      <div class="ia-kpi"><div class="ia-kpi-val">${totalWords.toLocaleString('es-AR')}</div><div class="ia-kpi-lbl">Palabras (PDFs/Word)</div></div>
    </div>
    ${findings.map(f => `<div class="ia-finding"><div class="ia-finding-title">💡 Hallazgo</div>${f}</div>`).join('')}
    <div class="iíalert">⚡ <strong>Próximo paso recomendado:</strong> Para análisis en tiempo real, importar estos datos a PostgreSQL usando el comando <code>COPY tabla FROM 'archivo.csv' CSV HEADER;</code> y conectar la API del sistema.</div>
  </div>`;
});

// ── EXPORTAR PDF ──────────────────────────────────────────
document.getElementById('btnExportReport')?.addEventListener('click', () => {
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });

  doc.setFillColor(6, 11, 24); doc.rect(0, 0, 297, 210, 'F');
  doc.setFillColor(59, 130, 246); doc.rect(0, 0, 6, 210, 'F');
  doc.setFont('helvetica', 'bold'); doc.setFontSize(14); doc.setTextColor(255,255,255);
  doc.text('MUNICIPIO DE JUNÍN — Análisis Masivo de Archivos', 14, 14);
  doc.setFontSize(9); doc.setFont('helvetica','normal'); doc.setTextColor(180,200,220);
  doc.text(`${state.files.length} archivos · ${state.allRows.length} registros · ${new Date().toLocaleString('es-AR')}`, 14, 22);

  if (state.allRows.length > 0) {
    const headers = ['_source', ...state.allHeaders.slice(0,8)];
    const body    = state.allRows.slice(0,200).map(row => headers.map(h => String(row[h] ?? '').slice(0,30)));
    const headLabels = headers.map(h => h === '_source' ? 'Origen' : h);
    doc.autoTable({
      startY: 30, head: [headLabels], body,
      headStyles: { fillColor:[17,29,53], textColor:255, fontSize:8 },
      bodyStyles: { fontSize:7 }, margin: { left:10, right:10 },
    });
  }

  const pages = doc.internal.getNumberOfPages();
  for (let i = 1; i <= pages; i++) {
    doc.setPage(i);
    doc.setFontSize(7); doc.setTextColor(140,150,160);
    doc.text(`Municipio de Junín · Análisis de Archivos · Pág ${i}/${pages}`, 10, 205);
  }
  doc.save(`municipio-analisis-masivo-${new Date().toISOString().slice(0,10)}.pdf`);
});

// ── EXPORTAR EXCEL ────────────────────────────────────────
document.getElementById('btnExportExcel')?.addEventListener('click', () => {
  if (state.allRows.length === 0) return;
  const wb  = XLSX.utils.book_new();
  const ws  = XLSX.utils.json_to_sheet(state.allRows.map(r => { const {_source,_sheet,...rest}=r; return { Origen:_source, Hoja:_sheet, ...rest }; }));
  ws['!cols'] = [{ wch: 20 }, { wch: 15 }, ...state.allHeaders.slice(0,10).map(() => ({ wch: 18 }))];
  XLSX.utils.book_append_sheet(wb, ws, 'Datos consolidados');

  // Hoja resumen
  const resumen = [
    ['RESUMEN DE ANÁLISIS'],
    ['Generado', new Date().toLocaleString('es-AR')],
    ['Archivos analizados', state.files.length],
    ['Total registros', state.allRows.length],
    ['Columnas detectadas', state.allHeaders.length],
    [], ['ARCHIVOS PROCESADOS'],
    ['Nombre', 'Tipo', 'Estado', 'Resumen'],
    ...state.files.map(f => [f.file.name, f.type.toUpperCase(), f.status, f.summary || '—']),
  ];
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(resumen), 'Resumen');
  XLSX.writeFile(wb, `municipio-analisis-masivo-${new Date().toISOString().slice(0,10)}.xlsx`);
});

// ── INIT ──────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => buildSidebar('upload'));

