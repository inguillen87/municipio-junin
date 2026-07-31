// ============================================================
// IA2.JS — Asistente IA v2: OCR + Voz + Documentos + Exportación
// Open Source: Tesseract.js · PDF.js · SheetJS · jsPDF
// ============================================================

// ── CONTEXTO MUNICIPAL ─────────────────────────────────────
const MUNICIPAL_CONTEXT = {
  gastoAgosto: 284500000,
  presupuestoAgosto: 310000000,
  empleadosTotal: 1247,
  masaSalarial: 186000000,
  horasExtra: 4312,
  costoHorasExtra: 18400000,
  ausentismo: '3%',
  reclamos: { total: 318, resueltos: 229, pendientes: 89, tiempoPromedio: '3.2 días' },
  ahorroIT: 42000000,
  secretarias: MUNICIPIO_DATA?.secretarias || [],
  horasExtraData: MUNICIPIO_DATA?.horasExtra || [],
  alertas: MUNICIPIO_DATA?.alertas || [],
};

// ── ESTADO GLOBAL ──────────────────────────────────────────
let uploadedDocs = []; // { name, type, text, data }
let isListening  = false;
let recognition  = null;
let messageCount = 0;

// ── RESPUESTAS IA ──────────────────────────────────────────
const IA_RESPONSES = {
  gasto: () => `💰 **Análisis de Gastos — Agosto 2026**

El gasto total del municipio es de **$${fmt(MUNICIPAL_CONTEXT.gastoAgosto)}** sobre un presupuesto de **$${fmt(MUNICIPAL_CONTEXT.presupuestoAgosto)}** (${Math.round(MUNICIPAL_CONTEXT.gastoAgosto/MUNICIPAL_CONTEXT.presupuestoAgosto*100)}% ejecutado).

| Secretaría | Presupuesto | Ejecutado | Estado |
|-----------|-------------|-----------|--------|
| Obras Públicas | $38M | $44.8M | 🔴 +18% |
| Educación | $61M | $54.9M | ✅ -10% |
| Salud | $52M | $46.8M | ✅ -10% |
| Seguridad | $44M | $41.8M | ✅ -5% |
| Talleres | $12M | $13.4M | 🟡 +12% |
| Est. Servicios | $8M | $9.1M | 🟡 +14% |

📌 **Atención**: 3 áreas superan el presupuesto. Se recomienda revisión inmediata en Obras Públicas.`,

  presupuesto: () => `⚠️ **Alertas Presupuestarias — Agosto 2026**

Se detectaron **3 secretarías** con desvíos positivos respecto al presupuesto mensual:

🔴 **Obras Públicas** → +18% ($44.8M vs $38M asignado)
Causa probable: obras de emergencia + horas extra (980 hs este mes)

🟡 **Talleres Municipales** → +12% ($13.4M vs $12M)
Causa probable: repuestos de emergencia para flota

🟡 **Estación de Servicios** → +14% ($9.1M vs $8M)
Causa probable: aumento del precio del combustible

📋 **Recomendación**: Convocar reunión de jefes de área antes del 5/09 y solicitar informe de justificación de gastos.`,

  rrhh: () => `👥 **Recursos Humanos — Agosto 2026**

**Total plantel**: ${MUNICIPAL_CONTEXT.empleadosTotal.toLocaleString('es-AR')} empleados
**Masa salarial**: $${fmt(MUNICIPAL_CONTEXT.masaSalarial)}/mes
**Horas extra**: ${MUNICIPAL_CONTEXT.horasExtra.toLocaleString('es-AR')} hs → costo $${fmt(MUNICIPAL_CONTEXT.costoHorasExtra)}
**Ausentismo**: ${MUNICIPAL_CONTEXT.ausentismo} (dentro del parámetro)
**Licencias activas**: 47 empleados

**Top áreas con más horas extra:**
- 🔧 Obras Públicas: 980 hs ($4.9M)
- 🏥 Salud: 754 hs ($3.8M)
- 🔒 Seguridad: 612 hs ($3.1M)
- 🛠️ Talleres: 520 hs ($2.1M)`,

  reclamos: () => `🏘️ **Reclamos Vecinales — 2026**

**Total**: ${MUNICIPAL_CONTEXT.reclamos.total} reclamos
**Resueltos**: ${MUNICIPAL_CONTEXT.reclamos.resueltos} (72% de resolución)
**Pendientes**: ${MUNICIPAL_CONTEXT.reclamos.pendientes}
**Tiempo promedio**: ${MUNICIPAL_CONTEXT.reclamos.tiempoPromedio}

**Ranking por tipo:**
1. 🛣️ Baches y Pavimento — 34%
2. 💡 Alumbrado Público — 22%
3. 🗑️ Recolección de Basura — 18%
4. 🌳 Poda de Árboles — 12%
5. 💧 Agua y Cloacas — 8%
6. 🔊 Otros — 6%

**Zonas más afectadas**: Centro, Barrio Norte, Av. Rivadavia`,

  informe: () => `📋 **INFORME EJECUTIVO — MUNICIPIO DE JUNÍN**
*Agosto 2026 · Para el Intendente Mario Abed*

---

**RESUMEN OPERATIVO**
El municipio opera con **${MUNICIPAL_CONTEXT.empleadosTotal.toLocaleString('es-AR')} empleados** y un gasto mensual de **$${fmt(MUNICIPAL_CONTEXT.gastoAgosto)}** (92% del presupuesto de $310M).

**ALERTAS CRÍTICAS** ⚠️
- Obras Públicas supera presupuesto en 18%
- Talleres y Est. de Servicios con desvíos moderados
- Stock de combustible al 48% — solicitar reposición

**LOGROS DEL SISTEMA DIGITAL** ✅
- Ahorro IT anual: **$${fmt(MUNICIPAL_CONTEXT.ahorroIT)}**
- ${MUNICIPAL_CONTEXT.empleadosTotal} legajos digitalizados
- Sistema de reclamos: 72% resolución
- 43 vehículos monitoreados en tiempo real
- Dashboard ejecutivo operativo 24/7

**PRÓXIMAS ACCIONES**
1. Reunión de jefes de área — revisión presupuestaria
2. Conectar base de datos PostgreSQL real
3. Implementar lector RFID para fichero de asistencia
4. Portal web público para vecinos`,

  ahorro: () => `💡 **Análisis de Ahorro IT — 2026**

**Ahorro anual estimado: $${fmt(MUNICIPAL_CONTEXT.ahorroIT)}**

| Concepto | Antes (terceros) | Ahora (propio) |
|---------|-----------------|----------------|
| Sistema RRHH | $18M/año | $0 |
| CRM vecinal | $8M/año | $0 |
| Dashboard gestión | $12M/año | $0 |
| Licencias software | $4M/año | $0 |

🔒 **Beneficio adicional**: Soberanía total de los datos del municipio.
📈 **ROI del proyecto**: La inversión se recupera en el primer año.
🚀 **Potencial de exportación**: El sistema puede licenciarse a otros municipios.`,

  flota: () => `⛽ **Flota Municipal — Análisis de Combustible**

**Consumo agosto 2026**: 8.640 litros
**Costo**: $9.1M (sobre presupuesto 14%)
**Vehículos activos**: 43

**Top consumidores:**
- 🚛 Camión Basura JUN-015: ~980L/mes
- 🚛 Volvo FH-460 JUN-010: ~840L/mes
- 🚙 Ford F-100 JUN-001: ~420L/mes

**Stock actual:**
- Nafta: 4.820L de 10.000L cap. (48%) ⚠️
- Gasoil: 7.340L de 15.000L cap. (49%) ⚠️

📌 Ambos tanques bajo el 50% — recomendar reposición urgente.`,

  talleres: () => `🔧 **Talleres Municipales — Estado Actual**

**Órdenes activas**: 24 (8 urgentes)
**Completadas en agosto**: 87 órdenes
**Vehículos en taller**: 7 de 43 (16%)
**Costo mensual**: $13.4M (+12% sobre presupuesto)

**Órdenes urgentes pendientes:**
- Toyota Hilux JUN-003: sistema de frenos
- Volvo FH JUN-010: caja de cambios
- Mercedes Actros JUN-015: motor (camión de basura)

**Stock crítico** ⚠️ (5 insumos bajo mínimo):
- Filtros de aceite: 8 unid. (mín: 15)
- Pastillas de freno: 6 juegos (mín: 10)
- Correa de distribución: 3 unid. (mín: 5)`,
};

function fmt(n) {
  if (n >= 1e9) return (n/1e9).toFixed(1) + 'B';
  if (n >= 1e6) return (n/1e6).toFixed(1) + 'M';
  if (n >= 1e3) return (n/1e3).toFixed(0) + 'K';
  return n.toLocaleString('es-AR');
}

function getSmartResponse(query, docContext = '') {
  const q = query.toLowerCase();

  // Si hay contexto de documento, analizarlo
  if (docContext) {
    return `📄 **Análisis del documento cargado**\n\n${docContext}\n\n---\n*Contenido procesado con OCR/Parser. Podés hacerme preguntas específicas sobre este documento.*`;
  }

  if (q.match(/gasto|costo|agosto|total|plata/)) return IA_RESPONSES.gasto();
  if (q.match(/presupuesto|supera|alerta|desvío|desvio/)) return IA_RESPONSES.presupuesto();
  if (q.match(/emplead|rrhh|salarial|masa|personal|plantel/)) return IA_RESPONSES.rrhh();
  if (q.match(/reclamo|vecino|queja|problema|frecuente/)) return IA_RESPONSES.reclamos();
  if (q.match(/informe|ejecutivo|intendente|mario|resumen|completo/)) return IA_RESPONSES.informe();
  if (q.match(/ahorro|migr|it|sistema|tecnolog/)) return IA_RESPONSES.ahorro();
  if (q.match(/combustible|nafta|gasoil|flota|vehiculo|tanque/)) return IA_RESPONSES.flota();
  if (q.match(/taller|orden|mecanico|repuest|vehículo en taller/)) return IA_RESPONSES.talleres();

  return `🤖 Procesé tu consulta: *"${query}"*\n\nPuedo ayudarte con:\n- 💰 Gastos y presupuesto\n- 👥 Recursos Humanos\n- 🏘️ Reclamos de vecinos\n- ⛽ Flota y combustible\n- 🔧 Talleres municipales\n- 📋 Informes ejecutivos\n- 📄 Análisis de documentos subidos\n\n¿Podés ser más específico o usá las **consultas rápidas** del panel izquierdo?`;
}

// ── RENDER DE MENSAJES ─────────────────────────────────────
function addMessage(text, isUser = false, docTag = null) {
  messageCount++;
  const container = document.getElementById('chatMessages');
  const time = new Date().toLocaleTimeString('es-AR', { hour:'2-digit', minute:'2-digit' });
  const div  = document.createElement('div');
  div.className = `msg-row ${isUser ? 'user' : 'ai'}`;
  div.id = `msg-${messageCount}`;

  // Convertir markdown simple a HTML
  const html = markdownToHTML(text);

  const exportBtns = !isUser ? `
    <div class="msg-actions">
      <button class="msg-action-btn" onclick="exportMsgPDF(${messageCount})">📑 PDF</button>
      <button class="msg-action-btn" onclick="exportMsgExcel(${messageCount})">📊 Excel</button>
      <button class="msg-action-btn" onclick="copyMsg(${messageCount})">📋 Copiar</button>
    </div>` : '';

  div.innerHTML = `
    <div class="msg-avatar ${isUser ? 'user-avatar' : 'ai-avatar'}">${isUser ? '👤' : '🤖'}</div>
    <div class="msg-bubble ${isUser ? 'user-bubble' : 'ai-bubble'}">
      <div class="msg-header">
        <span class="msg-sender">${isUser ? 'Vos' : 'Asistente Municipal IA'}</span>
        <span class="msg-time">${time}</span>
      </div>
      ${docTag ? `<span class="doc-tag">📄 ${docTag}</span>` : ''}
      <div class="msg-text" id="msg-text-${messageCount}">${html}</div>
      ${exportBtns}
    </div>`;

  container.appendChild(div);
  container.scrollTo({ top: container.scrollHeight, behavior: 'smooth' });
  return messageCount;
}

function markdownToHTML(text) {
  return text
    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.*?)\*/g, '<em>$1</em>')
    .replace(/^---$/gm, '<hr style="border-color:rgba(255,255,255,0.1);margin:10px 0">')
    .replace(/^\| (.+) \|$/gm, (match) => {
      if (match.includes('---')) return '';
      const cells = match.split('|').filter(c => c.trim());
      return '<tr>' + cells.map(c => `<td style="padding:5px 10px;border:1px solid rgba(255,255,255,0.08);font-size:12px">${c.trim()}</td>`).join('') + '</tr>';
    })
    .replace(/(<tr>.*<\/tr>\n?)+/gs, m => `<div style="overflow-x:auto;margin:8px 0"><table style="border-collapse:collapse;width:100%">${m}</table></div>`)
    .replace(/^- (.+)$/gm, '<li style="margin-bottom:3px">$1</li>')
    .replace(/(<li.*<\/li>\n?)+/gs, m => `<ul style="padding-left:18px;margin:6px 0">${m}</ul>`)
    .replace(/\n\n/g, '</p><p style="margin-bottom:8px">')
    .replace(/\n/g, '<br>')
    .replace(/^(.+)$/, '<p style="margin-bottom:8px">$1</p>');
}

function showTyping() {
  const c = document.getElementById('chatMessages');
  const d = document.createElement('div');
  d.className = 'msg-row ai'; d.id = 'typingIndicator';
  d.innerHTML = `<div class="msg-avatar ai-avatar">🤖</div><div class="msg-bubble ai-bubble"><div class="typing-dots"><span></span><span></span><span></span></div></div>`;
  c.appendChild(d);
  c.scrollTo({ top: c.scrollHeight, behavior: 'smooth' });
}
function removeTyping() { document.getElementById('typingIndicator')?.remove(); }

// ── ENVIAR MENSAJE ─────────────────────────────────────────
async function sendMessage(forceText = null) {
  const input = document.getElementById('chatInput');
  const text  = forceText || input.value.trim();
  if (!text) return;

  addMessage(text, true);
  input.value = '';
  input.style.height = 'auto';
  document.getElementById('charCounter').textContent = '0 / 2000';
  showTyping();

  const model = document.getElementById('modelSelect')?.value || 'demo';
  const delay = 700 + Math.random() * 1000;

  setTimeout(async () => {
    removeTyping();
    let response;

    if (model !== 'demo') {
      response = await callOllama(text, model);
    } else {
      response = getSmartResponse(text);
    }
    addMessage(response, false);
  }, delay);
}

async function callOllama(prompt, model) {
  const endpoint = document.getElementById('ollamaEndpoint')?.value || 'http://localhost:11434';
  const systemPrompt = `Sos un asistente municipal experto del Municipio de Junín, Argentina. 
Tenés acceso a estos datos: ${JSON.stringify({ empleados: 1247, gastoMensual: '$284.5M', presupuesto: '$310M', horasExtra: 4312, reclamos: 318 })}.
Respondé siempre en español argentino, de forma clara y profesional.`;
  try {
    const res = await fetch(`${endpoint}/api/generate`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model, prompt: `${systemPrompt}\n\nPregunta: ${prompt}`, stream: false }),
    });
    const data = await res.json();
    return data.response || 'Sin respuesta del modelo.';
  } catch {
    return `⚠️ No se pudo conectar a Ollama en ${endpoint}. Cambiá el modelo a "Demo" para usar sin conexión.`;
  }
}

// ── RECONOCIMIENTO DE VOZ ──────────────────────────────────
function initVoice() {
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SpeechRecognition) {
    document.getElementById('voiceBtn').title = 'Tu navegador no soporta reconocimiento de voz';
    document.getElementById('voiceBtn').style.opacity = '0.4';
    return;
  }
  recognition = new SpeechRecognition();
  recognition.lang = 'es-AR';
  recognition.continuous = true;
  recognition.interimResults = true;

  recognition.onresult = (event) => {
    let transcript = '';
    for (let i = event.resultIndex; i < event.results.length; i++) {
      transcript += event.results[i][0].transcript;
    }
    document.getElementById('voiceTranscript').textContent = transcript || 'Escuchando...';
    document.getElementById('chatInput').value = transcript;
    document.getElementById('charCounter').textContent = `${transcript.length} / 2000`;
  };

  recognition.onerror = () => stopVoice();
  recognition.onend = () => {
    if (isListening) recognition.start(); // continuar escuchando
  };
}

function startVoice() {
  if (!recognition) { alert('Tu navegador no soporta reconocimiento de voz. Usá Chrome o Edge.'); return; }
  isListening = true;
  recognition.start();
  document.getElementById('voiceBtn').classList.add('active');
  document.getElementById('voiceBanner').style.display = 'flex';
}

function stopVoice() {
  isListening = false;
  recognition?.stop();
  document.getElementById('voiceBtn').classList.remove('active');
  document.getElementById('voiceBanner').style.display = 'none';
  // Auto-enviar si hay texto
  const text = document.getElementById('chatInput').value.trim();
  if (text) sendMessage();
}

document.getElementById('voiceBtn')?.addEventListener('click', () => {
  isListening ? stopVoice() : startVoice();
});
document.getElementById('stopVoice')?.addEventListener('click', stopVoice);

// ── DRAG & DROP + FILE UPLOAD ──────────────────────────────
const dropZone = document.getElementById('dropZone');
const fileInput = document.getElementById('fileInput');

dropZone?.addEventListener('click', () => fileInput.click());
dropZone?.addEventListener('dragover', (e) => { e.preventDefault(); dropZone.classList.add('dragging'); });
dropZone?.addEventListener('dragleave', () => dropZone.classList.remove('dragging'));
dropZone?.addEventListener('drop', (e) => {
  e.preventDefault();
  dropZone.classList.remove('dragging');
  handleFiles(Array.from(e.dataTransfer.files));
});
fileInput?.addEventListener('change', () => handleFiles(Array.from(fileInput.files)));
document.getElementById('attachBtn')?.addEventListener('click', () => fileInput.click());

async function handleFiles(files) {
  for (const file of files) {
    addFileToList(file);
    await processFile(file);
  }
}

function getFileIcon(type, name) {
  if (type.includes('pdf')) return '📑';
  if (type.includes('sheet') || name.endsWith('.xlsx') || name.endsWith('.xls') || name.endsWith('.csv')) return '📊';
  if (type.includes('image')) return '🖼️';
  if (type.includes('text') || name.endsWith('.txt')) return '📄';
  return '📎';
}

function formatSize(bytes) {
  if (bytes < 1024) return bytes + 'B';
  if (bytes < 1024*1024) return (bytes/1024).toFixed(1) + 'KB';
  return (bytes/1024/1024).toFixed(1) + 'MB';
}

function addFileToList(file) {
  const list = document.getElementById('fileList');
  const id = `file-${Date.now()}`;
  const item = document.createElement('div');
  item.className = 'file-item';
  item.id = id;
  item.innerHTML = `
    <span class="file-item-icon">${getFileIcon(file.type, file.name)}</span>
    <div class="file-item-info">
      <span class="file-item-name">${file.name}</span>
      <span class="file-item-meta">${formatSize(file.size)}</span>
    </div>
    <span class="file-item-status loading" id="status-${id}">⟳ Procesando...</span>
    <button class="file-item-remove" onclick="removeFile('${id}')">✕</button>`;
  list.appendChild(item);
  return id;
}

function removeFile(id) { document.getElementById(id)?.remove(); }

async function processFile(file) {
  const id = `file-${Date.now() - 1}`; // approximate
  const statusEls = document.querySelectorAll('.file-item-status.loading');
  const statusEl = statusEls[statusEls.length - 1];

  try {
    let text = '';
    let summary = '';

    if (file.type.includes('image')) {
      // OCR con Tesseract.js
      text = await runOCR(file, statusEl);
      summary = `Imagen analizada con OCR. Texto extraído (${text.length} caracteres).`;

    } else if (file.type.includes('pdf') || file.name.endsWith('.pdf')) {
      text = await readPDF(file, statusEl);
      summary = `PDF procesado. ${text.split('\n').filter(l=>l.trim()).length} líneas extraídas.`;

    } else if (file.name.endsWith('.xlsx') || file.name.endsWith('.xls') || file.type.includes('sheet')) {
      const result = await readExcel(file);
      text  = result.text;
      summary = `Excel: ${result.sheets} hoja(s), ${result.rows} filas de datos.`;

    } else if (file.type.includes('text') || file.name.endsWith('.txt') || file.name.endsWith('.csv')) {
      text = await file.text();
      summary = `Texto plano: ${text.split('\n').length} líneas.`;

    } else {
      text = `Archivo: ${file.name}`;
      summary = 'Tipo de archivo no soportado directamente.';
    }

    if (statusEl) { statusEl.textContent = '✅ Listo'; statusEl.className = 'file-item-status done'; }

    // Guardar en contexto
    uploadedDocs.push({ name: file.name, type: file.type, text, summary });

    // Agregar al doc list del sidebar
    const docList = document.getElementById('docList');
    const newDoc = document.createElement('div');
    newDoc.className = 'doc-item active';
    newDoc.innerHTML = `
      <span class="doc-icon">${getFileIcon(file.type, file.name)}</span>
      <div class="doc-info"><span class="doc-name">${file.name}</span><span class="doc-desc">${summary}</span></div>
      <span class="doc-check">✓</span>`;
    docList.appendChild(newDoc);

    // Notificar en el chat
    addMessage(`📄 **Documento cargado**: *${file.name}*\n\n${summary}\n\nPodés preguntarme sobre el contenido de este documento. Ej: "¿Qué información contiene?" o "Resumí el contenido."`, false, file.name);

  } catch (err) {
    if (statusEl) { statusEl.textContent = '❌ Error'; statusEl.className = 'file-item-status error'; }
    addMessage(`⚠️ No pude procesar el archivo *${file.name}*: ${err.message}`, false);
  }
}

// ── OCR con Tesseract.js ───────────────────────────────────
async function runOCR(file, statusEl) {
  document.getElementById('ocrSection').style.display = 'block';
  const barFill   = document.getElementById('ocrBarFill');
  const statusTxt = document.getElementById('ocrStatusText');
  const preview   = document.getElementById('ocrPreview');

  if (statusEl) statusEl.textContent = '🔍 OCR...';

  const url = URL.createObjectURL(file);
  const { data } = await Tesseract.recognize(url, 'spa+eng', {
    logger: (m) => {
      if (m.status === 'recognizing text') {
        const pct = Math.round(m.progress * 100);
        barFill.style.width = pct + '%';
        statusTxt.textContent = `OCR: ${pct}% completado`;
      }
    }
  });
  URL.revokeObjectURL(url);

  barFill.style.width = '100%';
  statusTxt.textContent = `✅ OCR completado — ${data.text.length} caracteres extraídos`;
  preview.textContent = data.text.slice(0, 300) + (data.text.length > 300 ? '...' : '');
  preview.classList.add('visible');

  return data.text;
}

// ── PDF.js ─────────────────────────────────────────────────
async function readPDF(file, statusEl) {
  if (statusEl) statusEl.textContent = '📖 Leyendo PDF...';

  // Configurar worker de PDF.js
  if (typeof pdfjsLib !== 'undefined') {
    pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.worker.min.js';
    const arrayBuffer = await file.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
    let fullText = '';
    for (let i = 1; i <= Math.min(pdf.numPages, 20); i++) {
      const page    = await pdf.getPage(i);
      const content = await page.getTextContent();
      fullText += content.items.map(item => item.str).join(' ') + '\n';
    }
    return fullText || '(PDF sin texto extraíble — intentando OCR...)';
  }
  return '(PDF.js no disponible)';
}

// ── SheetJS Excel ──────────────────────────────────────────
async function readExcel(file) {
  const arrayBuffer = await file.arrayBuffer();
  const workbook = XLSX.read(arrayBuffer, { type: 'array' });
  let text = '';
  let totalRows = 0;

  workbook.SheetNames.forEach(name => {
    const sheet = workbook.Sheets[name];
    const json  = XLSX.utils.sheet_to_json(sheet, { header: 1 });
    totalRows  += json.length;
    text += `\n=== HOJA: ${name} ===\n`;
    json.slice(0, 50).forEach(row => {
      text += row.join(' | ') + '\n';
    });
  });

  return { text, sheets: workbook.SheetNames.length, rows: totalRows };
}

// ── RESPUESTA INTELIGENTE CON DOCS ────────────────────────
function getResponseWithDocs(query) {
  if (uploadedDocs.length > 0) {
    const lastDoc = uploadedDocs[uploadedDocs.length - 1];
    const q = query.toLowerCase();
    if (q.match(/document|archivo|excel|pdf|subiste|cargaste|imagen|analiz|resumí|contenido/)) {
      const snippet = lastDoc.text.slice(0, 600);
      return `📄 **Análisis de "${lastDoc.name}"**\n\n**Resumen**: ${lastDoc.summary}\n\n**Contenido (primeros 600 caracteres):**\n\`\`\`\n${snippet}\n\`\`\`\n\n¿Querés que busque algo específico dentro del documento?`;
    }
  }
  return getSmartResponse(query);
}

// ── EXPORTAR MENSAJE A PDF ─────────────────────────────────
function exportMsgPDF(msgId) {
  const el  = document.getElementById(`msg-text-${msgId}`);
  const text = el ? el.innerText : '';
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });

  // Header municipal
  doc.setFillColor(6, 11, 24);
  doc.rect(0, 0, 210, 35, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(16);
  doc.text('MUNICIPIO DE JUNÍN', 14, 14);
  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  doc.text('Sistema de Gestión Municipal · Asistente IA', 14, 22);
  doc.text(`Generado: ${new Date().toLocaleString('es-AR')}`, 14, 29);

  // Línea decorativa
  doc.setDrawColor(59, 130, 246);
  doc.setLineWidth(0.8);
  doc.line(0, 35, 210, 35);

  // Contenido
  doc.setTextColor(20, 20, 40);
  doc.setFontSize(11);
  doc.setFont('helvetica', 'normal');
  const lines = doc.splitTextToSize(text, 180);
  let y = 48;
  lines.forEach(line => {
    if (y > 270) { doc.addPage(); y = 20; }
    doc.text(line, 14, y);
    y += 6;
  });

  // Footer
  doc.setFontSize(8);
  doc.setTextColor(150, 150, 160);
  doc.text('Municipio de Junín · Sistema Digital Municipal v1.0 · Confidencial', 14, 287);

  doc.save(`informe-municipal-${new Date().toISOString().slice(0,10)}.pdf`);
}

// ── EXPORTAR MENSAJE A EXCEL ───────────────────────────────
function exportMsgExcel(msgId) {
  const el  = document.getElementById(`msg-text-${msgId}`);
  const text = el ? el.innerText : '';

  // Parsear tablas del texto
  const rows = text.split('\n').filter(l => l.trim()).map(l => [l]);
  const wb  = XLSX.utils.book_new();
  const ws  = XLSX.utils.aoa_to_sheet([
    ['MUNICIPIO DE JUNÍN'],
    ['Sistema de Gestión Municipal · Asistente IA'],
    [`Generado: ${new Date().toLocaleString('es-AR')}`],
    [''],
    ...rows,
  ]);

  // Ancho de columnas
  ws['!cols'] = [{ wch: 80 }];
  XLSX.utils.book_append_sheet(wb, ws, 'Informe IA');
  XLSX.writeFile(wb, `informe-municipal-${new Date().toISOString().slice(0,10)}.xlsx`);
}

function copyMsg(msgId) {
  const el = document.getElementById(`msg-text-${msgId}`);
  if (el) {
    navigator.clipboard.writeText(el.innerText).then(() => {
      // Brief feedback
      const btn = el.parentElement?.querySelector('.msg-action-btn:last-child');
      if (btn) { btn.textContent = '✅ Copiado'; setTimeout(() => btn.textContent = '📋 Copiar', 1500); }
    });
  }
}

// ── BOTONES GLOBALES ──────────────────────────────────────
document.getElementById('btnExportPDF')?.addEventListener('click', () => {
  if (messageCount === 0) { addMessage('No hay conversación para exportar.', false); return; }
  exportMsgPDF(messageCount);
});

document.getElementById('btnExportExcel')?.addEventListener('click', () => {
  // Exportar datos del sistema como Excel
  const wb = XLSX.utils.book_new();

  // Hoja 1: RRHH
  if (MUNICIPIO_DATA?.secretarias) {
    const rrhhData = [
      ['Secretaría', 'Empleados', 'Presupuesto', 'Ejecutado', 'Desvío'],
      ...MUNICIPIO_DATA.secretarias.map(s => [
        s.nombre, s.empleados,
        `$${(s.presupuesto/1e6).toFixed(1)}M`,
        `$${(s.ejecutado/1e6).toFixed(1)}M`,
        s.ejecutado > s.presupuesto ? `+${Math.round((s.ejecutado/s.presupuesto-1)*100)}%` : `${Math.round((s.ejecutado/s.presupuesto-1)*100)}%`,
      ])
    ];
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rrhhData), 'RRHH y Gastos');
  }

  // Hoja 2: Resumen ejecutivo
  const resumen = [
    ['RESUMEN EJECUTIVO — MUNICIPIO DE JUNÍN'],
    [`Fecha: ${new Date().toLocaleDateString('es-AR')}`],
    [''],
    ['Indicador', 'Valor'],
    ['Total empleados', 1247],
    ['Gasto agosto 2026', '$284.5M'],
    ['Presupuesto agosto', '$310M'],
    ['Ejecución %', '92%'],
    ['Horas extra (hs)', 4312],
    ['Costo horas extra', '$18.4M'],
    ['Reclamos totales', 318],
    ['Reclamos resueltos', 229],
    ['Ahorro IT anual', '$42M'],
  ];
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(resumen), 'Resumen Ejecutivo');

  XLSX.writeFile(wb, `municipio-junin-datos-${new Date().toISOString().slice(0,10)}.xlsx`);
  addMessage('📊 **Excel exportado** con datos del sistema municipal (RRHH, Gastos, Resumen Ejecutivo).', false);
});

document.getElementById('btnSummarize')?.addEventListener('click', () => {
  if (uploadedDocs.length === 0) {
    addMessage('No hay documentos cargados. Subí un PDF, Excel o imagen primero.', false);
    return;
  }
  const summaries = uploadedDocs.map(d => `📄 **${d.name}**: ${d.summary}`).join('\n');
  addMessage(`📚 **Resumen de documentos cargados (${uploadedDocs.length}):**\n\n${summaries}\n\n¿Querés que analice alguno en detalle?`, false);
});

// PROBAR CONEXIÓN OLLAMA
document.getElementById('btnTestOllama')?.addEventListener('click', async () => {
  const endpoint = document.getElementById('ollamaEndpoint')?.value || 'http://localhost:11434';
  addMessage(`🔌 Probando conexión a Ollama en ${endpoint}...`, false);
  try {
    const res = await fetch(`${endpoint}/api/tags`, { signal: AbortSignal.timeout(3000) });
    const data = await res.json();
    const models = data.models?.map(m => m.name).join(', ') || 'ninguno';
    addMessage(`✅ **Ollama conectado!**\nModelos disponibles: ${models}`, false);
  } catch {
    addMessage(`❌ No se pudo conectar a Ollama en ${endpoint}.\n\nAsegurate de que esté corriendo:\n\`\`\`\nollama serve\n\`\`\`\nO usá el modo **Demo** para continuar sin conexión.`, false);
  }
});

// ── SEND + INPUT ──────────────────────────────────────────
document.getElementById('sendBtn')?.addEventListener('click', () => sendMessage());
document.getElementById('chatInput')?.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); }
});
document.getElementById('chatInput')?.addEventListener('input', function() {
  this.style.height = 'auto';
  this.style.height = Math.min(this.scrollHeight, 140) + 'px';
  document.getElementById('charCounter').textContent = `${this.value.length} / 2000`;
});

document.querySelectorAll('.quick-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.getElementById('chatInput').value = btn.dataset.query;
    sendMessage();
  });
});

document.getElementById('btnClearChat')?.addEventListener('click', () => {
  const c = document.getElementById('chatMessages');
  c.innerHTML = '';
  messageCount = 0;
  addMessage('🗑️ Conversación limpiada. ¿En qué te puedo ayudar?', false);
});

// ── INIT ─────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  buildSidebar('ia');
  initVoice();
  // Configurar worker PDF.js
  if (typeof pdfjsLib !== 'undefined') {
    pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.worker.min.js';
  }
});
