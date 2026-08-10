// ============================================================
// ia2.js — Motor de Chat IA Municipal v3
// Integra: ia.js (respuestas inteligentes) + OCR + Voz + Export
// Diseñado para intendentes, contadores y administradores
// ============================================================

'use strict';

let uploadedDocs = [];
let isListening  = false;
let recognition  = null;
let messageCount = 0;
let chatHistory  = [];

// ── ELEMENTOS DEL DOM ───────────────────────────────────────
const chatMessages = document.getElementById('chatMessages');
const chatInput    = document.getElementById('chatInput');
const sendBtn      = document.getElementById('sendBtn');
const voiceBtn     = document.getElementById('voiceBtn');
const fileInput    = document.getElementById('fileInput');
const dropZone     = document.getElementById('dropZone');
const fileList     = document.getElementById('fileList');
const charCounter  = document.getElementById('charCounter');

// ── MENSAJE DE BIENVENIDA ────────────────────────────────────
function showWelcome() {
  const user = (() => { try { return JSON.parse(sessionStorage.getItem('mjunin_user') || 'null'); } catch { return null; } })();
  const nombre = user?.name?.split(' ')[0] || 'Intendente';

  appendMessage('ia', `
    <div class="ia-welcome">
      <div class="ia-welcome-icon">🤖</div>
      <div class="ia-welcome-title">Bienvenido, ${nombre}</div>
      <div class="ia-welcome-sub">Soy el Asistente Municipal de Junín. Puedo responder preguntas sobre:</div>
      <div class="ia-chips">
        <button class="ia-chip" onclick="sendQuickQuery('¿Cuánto dinero libre queda para gastar?')">💰 ¿Cuánto dinero libre queda?</button>
        <button class="ia-chip" onclick="sendQuickQuery('¿Cuántos empleados tiene el municipio?')">👥 Empleados y RRHH</button>
        <button class="ia-chip" onclick="sendQuickQuery('¿Cuáles son las alertas críticas?')">🚨 Alertas críticas</button>
        <button class="ia-chip" onclick="sendQuickQuery('Dame el informe ejecutivo completo')">📋 Informe ejecutivo</button>
        <button class="ia-chip" onclick="sendQuickQuery('¿Cuántos reclamos de vecinos hay pendientes?')">🏘️ Reclamos vecinos</button>
        <button class="ia-chip" onclick="sendQuickQuery('¿Cuáles son las oportunidades de ahorro?')">💚 Oportunidades de ahorro</button>
        <button class="ia-chip" onclick="sendQuickQuery('¿Cuál es el estado de la flota y combustible?')">🚛 Flota y combustible</button>
        <button class="ia-chip" onclick="sendQuickQuery('¿Cuánto gastamos en tecnología?')">💻 Gasto en tecnología</button>
      </div>
      <div class="ia-tip">💡 <strong>Tip:</strong> También podés subir un Excel, PDF o Word y preguntarme sobre ese documento.</div>
    </div>
  `);
}

// ── FUNCIÓN PÚBLICA: enviar consulta rápida ──────────────────
window.sendQuickQuery = function(texto) {
  if (chatInput) chatInput.value = texto;
  sendMessage(texto);
};

// ── ENVIAR MENSAJE ───────────────────────────────────────────
async function sendMessage(texto) {
  texto = (texto || chatInput?.value || '').trim();
  if (!texto) return;

  appendMessage('user', escapeHtml(texto));
  if (chatInput) { chatInput.value = ''; updateCharCounter(); }

  chatHistory.push({ role: 'user', content: texto });
  messageCount++;

  // Typing indicator
  const typingId = 'typing-' + Date.now();
  appendMessage('ia', '<div class="typing-dots"><span></span><span></span><span></span></div>', typingId);

  await delay(600 + Math.random() * 400);

  // Generar respuesta con el motor inteligente (ia.js)
  let respuesta;
  if (uploadedDocs.length > 0) {
    respuesta = responderConDocumentos(texto, uploadedDocs);
  } else if (window.procesarMensajeIA) {
    respuesta = await window.procesarMensajeIA(texto);
  } else {
    respuesta = `<div class="iíanswer-card"><p style="color:rgba(148,163,184,0.8)">Cargando motor de respuestas... Por favor reintentá en un momento.</p></div>`;
  }

  // Reemplazar el typing indicator
  const typingEl = document.getElementById(typingId);
  if (typingEl) {
    typingEl.innerHTML = respuesta;
    const card = typingEl.querySelector('.iíanswer-card');
    if (card) {
      card.classList.add('pop-in');
    }
  }
  chatHistory.push({ role: 'ia', content: respuesta });

  scrollToBottom();
  updateSidebarQueries(texto);
}

// ── RESPONDER SOBRE DOCUMENTOS SUBIDOS ──────────────────────
function responderConDocumentos(pregunta, docs) {
  const doc = docs[0];
  const p = pregunta.toLowerCase();

  let intro = `<div class="iíanswer-card">
    <div class="iíanswer-title">📄 Analizando: "${doc.name}"</div>`;

  if (doc.type === 'excel' || doc.type === 'csv') {
    const filas = doc.data || [];
    const cols  = doc.columns || [];
    const preview = filas.slice(0, 8);
    const rows = preview.map(r =>
      `<tr>${cols.map(c => `<td>${r[c] ?? ''}</td>`).join('')}</tr>`
    ).join('');
    return intro + `
      <div style="margin:8px 0 4px;font-size:12px;color:rgba(100,116,139,0.7)">${filas.length} filas · ${cols.length} columnas</div>
      <div class="ia-table-wrap">
        <table class="ia-table">
          <thead><tr>${cols.map(c=>`<th>${c}</th>`).join('')}</tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
      ${filas.length > 8 ? `<div class="ia-insight">📊 Mostrando las primeras 8 de ${filas.length} filas. El archivo completo fue procesado.</div>` : ''}
      <div class="ia-insight">✅ Archivo cargado correctamente. Podés hacerme preguntas sobre estos datos.</div>
    </div>`;
  }

  if (doc.type === 'pdf' || doc.type === 'word' || doc.type === 'txt') {
    const texto = doc.text || '';
    const preview = texto.slice(0, 800);
    return intro + `
      <div style="background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.07);border-radius:10px;padding:14px;margin:12px 0;font-size:13px;color:rgba(148,163,184,0.8);line-height:1.7;white-space:pre-wrap;max-height:250px;overflow-y:auto;">${escapeHtml(preview)}${texto.length > 800 ? '\n\n[...documento continúa...]' : ''}</div>
      <div class="ia-insight">📝 Documento analizado (${texto.length} caracteres). Podés hacerme preguntas sobre el contenido.</div>
    </div>`;
  }

  // Respuesta genérica con datos del sistema si no hay doc específico
  if (window.procesarMensajeIA) return window.procesarMensajeIA(pregunta);
  return intro + `<p>Documento cargado. Haceme preguntas específicas sobre el contenido.</p></div>`;
}

// ── APPEND MESSAGE AL CHAT ───────────────────────────────────
function appendMessage(tipo, html, id) {
  const wrap = document.createElement('div');
  wrap.className = `chat-msg ${tipo}`;
  if (id) wrap.id = id;

  const avatar = document.createElement('div');
  avatar.className = 'msg-avatar';
  avatar.textContent = tipo === 'user' ? 'Vos' : '🤖';

  const bubble = document.createElement('div');
  bubble.className = 'msg-bubble';

  if (tipo === 'ia') {
    const header = document.createElement('div');
    header.className = 'msg-header';
    header.innerHTML = '<span class="msg-sender">Asistente Municipal IA</span><span class="msg-time">' + new Date().toLocaleTimeString('es-AR', {hour:'2-digit',minute:'2-digit'}) + '</span>';
    bubble.appendChild(header);
  }

  const content = document.createElement('div');
  content.className = 'msg-content';
  content.innerHTML = html;
  bubble.appendChild(content);

  if (tipo === 'ia') {
    const actions = document.createElement('div');
    actions.className = 'msg-actions';
    actions.style.marginTop = '8px';
    const copyBtn = document.createElement('button');
    copyBtn.className = 'btn-copy';
    copyBtn.innerHTML = '📋 Copiar';
    copyBtn.style.cssText = 'background:rgba(255,255,255,0.1);border:none;color:white;padding:4px 8px;border-radius:4px;cursor:pointer;font-size:12px;';
    copyBtn.onclick = () => {
      navigator.clipboard.writeText(content.innerText);
      if (window.toast) toast('Copiado', 'Texto copiado al portapapeles', 'success');
    };
    actions.appendChild(copyBtn);
    bubble.appendChild(actions);
  }

  wrap.appendChild(avatar);
  wrap.appendChild(bubble);

  if (chatMessages) {
    chatMessages.appendChild(wrap);
    scrollToBottom();
  }
  return wrap;
}

function scrollToBottom() {
  if (chatMessages) chatMessages.scrollTop = chatMessages.scrollHeight;
}

// ── UPLOAD DE ARCHIVOS ───────────────────────────────────────
async function handleFiles(files) {
  if (files.length > 0 && window.toast) {
    toast('Procesando', 'Procesando documento...', 'info');
  }
  for (const file of files) {
    const ext = file.name.split('.').pop().toLowerCase();
    const entry = { name: file.name, type: ext, text: '', data: [], columns: [] };

    try {
      if (['xlsx', 'xls'].includes(ext)) {
        const buf = await file.arrayBuffer();
        const wb  = XLSX.read(buf, { type: 'array' });
        const ws  = wb.Sheets[wb.SheetNames[0]];
        const data = XLSX.utils.sheet_to_json(ws, { defval: '' });
        entry.type    = 'excel';
        entry.data    = data;
        entry.columns = Object.keys(data[0] || {});
        entry.text    = `Excel con ${data.length} filas y ${entry.columns.length} columnas`;
      } else if (ext === 'csv') {
        const text = await file.text();
        const lines = text.split('\n').filter(l => l.trim());
        const sep = lines[0].includes(';') ? ';' : ',';
        const headers = lines[0].split(sep).map(h => h.trim().replace(/"/g,''));
        const data = lines.slice(1).map(l => {
          const v = l.split(sep).map(x => x.trim().replace(/"/g,''));
          return Object.fromEntries(headers.map((h,i) => [h, v[i]||'']));
        });
        entry.type    = 'csv';
        entry.data    = data;
        entry.columns = headers;
        entry.text    = text.slice(0, 2000);
      } else if (ext === 'pdf') {
        entry.type = 'pdf';
        entry.text = '📄 PDF cargado. El análisis de texto de PDF requiere el backend local.';
        try {
          if (window.pdfjsLib) {
            const buf  = await file.arrayBuffer();
            const pdf  = await pdfjsLib.getDocument({ data: buf }).promise;
            let txt = '';
            for (let i = 1; i <= Math.min(pdf.numPages, 10); i++) {
              const pg = await pdf.getPage(i);
              const tc = await pg.getTextContent();
              txt += tc.items.map(t => t.str).join(' ') + '\n';
            }
            entry.text = txt.trim();
          }
        } catch {}
      } else if (['doc','docx'].includes(ext)) {
        entry.type = 'word';
        entry.text = '📝 Documento Word cargado. Resumen disponible con backend local.';
      } else if (ext === 'txt') {
        entry.type = 'txt';
        entry.text = await file.text();
      } else if (['png','jpg','jpeg','webp'].includes(ext)) {
        entry.type = 'image';
        if (window.Tesseract) {
          showOcrSection();
          const result = await Tesseract.recognize(file, 'spa', {
            logger: m => { if (m.status === 'recognizing text') updateOcrProgress(Math.round(m.progress * 100)); }
          });
          entry.text = result.data.text;
          hideOcrSection();
        } else {
          entry.text = '🖼️ OCR no disponible en este momento.';
        }
      }

      uploadedDocs.unshift(entry);
      addFileToList(entry);

      appendMessage('ia', `
        <div class="iíanswer-card">
          <div class="iíanswer-title">✅ Archivo cargado exitosamente</div>
          <div class="ia-detail">
            <div class="ia-detail-row"><span>Archivo</span><strong>${escapeHtml(file.name)}</strong></div>
            <div class="ia-detail-row"><span>Tipo</span><strong>${entry.type.toUpperCase()}</strong></div>
            <div class="ia-detail-row"><span>Tamaño</span><strong>${(file.size / 1024).toFixed(1)} KB</strong></div>
            ${entry.data?.length ? `<div class="ia-detail-row"><span>Registros encontrados</span><strong>${entry.data.length} filas</strong></div>` : ''}
          </div>
          <div class="ia-insight">💡 Ahora podés preguntarme sobre este documento. Por ejemplo: "¿Cuál es el total de gastos?" o "Mostrá los primeros registros"</div>
        </div>
      `);

    } catch (err) {
      appendMessage('ia', `<div class="iíanswer-card"><div class="ia-insight red">❌ Error al procesar "${file.name}": ${err.message}</div></div>`);
    }
  }
}

function addFileToList(entry) {
  if (!fileList) return;
  const icons = { excel:'📊', csv:'📊', pdf:'📄', word:'📝', txt:'📃', image:'🖼️' };
  const el = document.createElement('div');
  el.className = 'file-item';
  el.innerHTML = `<span class="file-icon">${icons[entry.type]||'📎'}</span><span class="file-name">${escapeHtml(entry.name)}</span><span class="file-check">✓</span>`;
  fileList.prepend(el);
}

// ── OCR PROGRESS ─────────────────────────────────────────────
function showOcrSection() { document.getElementById('ocrSection')?.style && (document.getElementById('ocrSection').style.display='block'); }
function hideOcrSection() { document.getElementById('ocrSection')?.style && (document.getElementById('ocrSection').style.display='none'); updateOcrProgress(0); }
function updateOcrProgress(pct) {
  const bar = document.getElementById('ocrBarFill');
  const txt = document.getElementById('ocrStatusText');
  if (bar) bar.style.width = pct + '%';
  if (txt) txt.textContent = pct < 100 ? `Leyendo texto: ${pct}%` : '✅ Texto extraído';
}

// ── RECONOCIMIENTO DE VOZ ────────────────────────────────────
function initVoice() {
  if (!('webkitSpeechRecognition' in window || 'SpeechRecognition' in window)) {
    window.hasVoice = false;
    return;
  }
  window.hasVoice = true;
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  recognition = new SR();
  recognition.lang = 'es-AR';
  recognition.interimResults = true;
  recognition.continuous = false;
  recognition.onresult = (e) => {
    const t = Array.from(e.results).map(r => r[0].transcript).join('');
    const banner = document.getElementById('voiceTranscript');
    if (banner) banner.textContent = t;
    if (e.results[0].isFinal) {
      if (chatInput) chatInput.value = t;
      stopVoice();
      setTimeout(() => sendMessage(t), 300);
    }
  };
  recognition.onerror = () => stopVoice();
  recognition.onend   = () => stopVoice();
}

function startVoice() {
  if (!window.hasVoice) {
    if (window.toast) toast('Error', 'Voz no disponible en este browser', 'error');
    return;
  }
  if (!recognition) return;
  isListening = true;
  const banner = document.getElementById('voiceBanner');
  if (banner) banner.style.display = 'flex';
  if (voiceBtn) voiceBtn.classList.add('recording');
  recognition.start();
}

function stopVoice() {
  isListening = false;
  const banner = document.getElementById('voiceBanner');
  if (banner) banner.style.display = 'none';
  if (voiceBtn) voiceBtn.classList.remove('recording');
  try { recognition?.stop(); } catch {}
}

// ── EXPORT PDF ───────────────────────────────────────────────
function exportChatPDF() {
  const { jsPDF } = window.jspdf;
  if (!jsPDF) { alert('jsPDF no disponible'); return; }
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });

  doc.setFillColor(6, 11, 24);
  doc.rect(0, 0, 210, 297, 'F');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(18);
  doc.setTextColor(240, 244, 255);
  doc.text('Municipalidad de Junin', 20, 25);
  doc.setFontSize(12);
  doc.setTextColor(142, 163, 195);
  doc.text('Informe de Consultas IA - ' + new Date().toLocaleDateString('es-AR'), 20, 33);

  doc.setDrawColor(59, 130, 246);
  doc.setLineWidth(0.5);
  doc.line(20, 37, 190, 37);

  let y = 48;
  const msgs = document.querySelectorAll('.chat-msg');

  msgs.forEach(msg => {
    if (y > 270) { doc.addPage(); doc.setFillColor(6,11,24); doc.rect(0,0,210,297,'F'); y = 20; }
    const isUser = msg.classList.contains('user');
    const content = msg.querySelector('.msg-content')?.innerText?.trim() || '';
    if (!content) return;

    doc.setFontSize(9);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(isUser ? 245 : 96, isUser ? 158 : 165, isUser ? 11 : 250);
    doc.text(isUser ? 'CONSULTA:' : 'RESPUESTA IA:', 20, y);
    y += 6;

    doc.setFont('helvetica', 'normal');
    doc.setTextColor(200, 210, 230);
    const lines = doc.splitTextToSize(content, 165);
    lines.slice(0, 20).forEach(l => {
      if (y > 275) { doc.addPage(); doc.setFillColor(6,11,24); doc.rect(0,0,210,297,'F'); y = 20; }
      doc.text(l, 20, y);
      y += 5;
    });
    y += 8;
  });

  doc.save('Informe-IA-Municipal-Junin-' + new Date().toISOString().split('T')[0] + '.pdf');
  if (window.toast) toast('PDF exportado', 'Informe descargado correctamente', 'success');
}

// ── EXPORT EXCEL ─────────────────────────────────────────────
function exportChatExcel() {
  if (!window.XLSX) { alert('SheetJS no disponible'); return; }
  if (!window.MUNICIPAL_DATA) { alert('Datos no disponibles'); return; }

  const wb = XLSX.utils.book_new();
  const d  = window.MUNICIPAL_DATA;

  // Hoja 1: Presupuesto
  const presData = [
    ['Indicador','Valor'],
    ['Presupuesto Total 2026', d.presupuesto.total_anual],
    ['Gasto Agosto', d.presupuesto.ejecutado_agosto],
    ['% Ejecutado', d.presupuesto.pct_ejecutado + '%'],
    ['Saldo Disponible', d.presupuesto.saldo_disponible],
    ['Masa Salarial Mensual', d.gastos.masa_salarial],
    ['Horas Extra Agosto', d.empleados.horas_extra_mes],
    ['Costo Horas Extra', d.gastos.horas_extra_costo],
  ];
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(presData), 'Presupuesto');

  // Hoja 2: Empleados por área
  const empData = [['Area','Empleados']].concat(Object.entries(d.empleados.por_area));
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(empData), 'Empleados por Area');

  // Hoja 3: Reclamos
  const recData = [['Tipo','Cantidad']].concat(Object.entries(d.reclamos.por_tipo));
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(recData), 'Reclamos Vecinos');

  // Hoja 4: Proveedores
  const provData = [['Proveedor','Mensual','Riesgo','Vence']].concat(
    d.proveedores.principales.map(p => [p.nombre, p.mensual, p.riesgo, p.vence])
  );
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(provData), 'Proveedores IT');

  XLSX.writeFile(wb, 'Datos-Municipales-Junin-' + new Date().toISOString().split('T')[0] + '.xlsx');
  if (window.toast) toast('Excel exportado', '4 hojas de datos descargadas', 'success');
}

// ── SIDEBAR: CONSULTAS RÁPIDAS ────────────────────────────────
function updateSidebarQueries(pregunta) {
  const list = document.getElementById('queryHistory');
  if (!list) return;
  const el = document.createElement('div');
  el.className = 'query-item';
  el.textContent = pregunta.slice(0, 45) + (pregunta.length > 45 ? '...' : '');
  el.onclick = () => sendQuickQuery(pregunta);
  list.prepend(el);
  if (list.children.length > 8) list.removeChild(list.lastChild);
}

// ── HELPERS ───────────────────────────────────────────────────
function delay(ms) { return new Promise(r => setTimeout(r, ms)); }
function escapeHtml(s) { return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
function updateCharCounter() {
  if (!chatInput || !charCounter) return;
  const len = chatInput.value.length;
  charCounter.textContent = `${len} / 2000`;
  charCounter.style.color = len > 1800 ? '#ef4444' : 'rgba(100,116,139,0.6)';
}

// ── INICIALIZACIÓN ────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  buildSidebar?.('ia');
  initVoice();
  showWelcome();

  // Send
  sendBtn?.addEventListener('click', () => sendMessage());
  chatInput?.addEventListener('keydown', e => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); }
  });
  chatInput?.addEventListener('input', updateCharCounter);

  // Voice
  voiceBtn?.addEventListener('click', () => isListening ? stopVoice() : startVoice());
  document.getElementById('stopVoice')?.addEventListener('click', stopVoice);

  // File upload
  dropZone?.addEventListener('click', () => fileInput?.click());
  fileInput?.addEventListener('change', e => handleFiles(e.target.files));
  document.getElementById('attachBtn')?.addEventListener('click', () => fileInput?.click());

  dropZone?.addEventListener('dragover', e => { e.preventDefault(); dropZone.classList.add('drag-over'); });
  dropZone?.addEventListener('dragleave', () => dropZone?.classList.remove('drag-over'));
  dropZone?.addEventListener('drop', e => {
    e.preventDefault();
    dropZone?.classList.remove('drag-over');
    handleFiles(e.dataTransfer.files);
  });

  // Export
  document.getElementById('btnExportPDF')?.addEventListener('click', exportChatPDF);
  document.getElementById('btnExportExcel')?.addEventListener('click', exportChatExcel);

  // Summarize
  document.getElementById('btnSummarize')?.addEventListener('click', () => {
    if (!uploadedDocs.length) {
      if (window.toast) toast('Sin documentos', 'Primero cargá un archivo para analizar', 'warning');
      return;
    }
    sendQuickQuery(`Hacé un resumen completo del documento "${uploadedDocs[0].name}"`);
  });

  // Clear
  document.getElementById('btnClearChat')?.addEventListener('click', () => {
    if (chatMessages) chatMessages.innerHTML = '';
    chatHistory = [];
    messageCount = 0;
    uploadedDocs = [];
    if (fileList) fileList.innerHTML = '';
    showWelcome();
    if (window.toast) toast('Chat limpiado', 'Conversación reiniciada', 'info');
  });
});

