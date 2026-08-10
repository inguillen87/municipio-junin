// ============================================================
// IA-HF.JS — HuggingFace Transformers.js Integration
// Modelos open source corriendo 100% en el browser (ONNX/WebAssembly)
// ============================================================
// Transformers.js v3 — https://huggingface.co/docs/transformers.js
// ============================================================

import { pipeline, env } from 'https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.5.2';

// Configurar cache en el browser (IndexedDB)
env.cacheDir = './.cache';
env.allowLocalModels = false;

// ── PIPELINES (lazy loaded) ────────────────────────────────
let sentimentPipe   = null;
let classifierPipe  = null;
let nerPipe         = null;
let qaPipe          = null;
let whisperPipe     = null;
let embeddingsPipe  = null;

// ── DATOS MUNICIPALES PARA DEMO ───────────────────────────
const RECLAMOS_DEMO = [
  "Hay un enorme pozo en la calle Rivadavia que está rompiendo los autos",
  "El farol de la esquina no funciona hace dos semanas, muy peligroso de noche",
  "No pasó el camión de basura en 5 días, hay bolsas en toda la vereda",
  "El árbol tiene ramas enormes sobre el techo de mi casa, necesito poda urgente",
  "No tenemos agua desde ayer en todo el barrio norte",
  "Los vecinos hacen ruido toda la noche con música muy alta",
  "La vereda está completamente rota y un abuelo se cayó ayer",
  "El semáforo de Belgrano y Mitre no funciona, casi hay accidente",
  "Acumulación de agua en la calle, hay mosquitos y mal olor",
  "El desagüe de la calle está tapado y llueve mañana",
];

const CATEGORIAS_RECLAMOS = [
  'Baches y Pavimento',
  'Alumbrado Público',
  'Recolección de Basura',
  'Poda de Árboles',
  'Agua y Cloacas',
  'Ruidos Molestos',
  'Otros',
];

const SECRETARIAS = [
  { nombre: 'Obras Públicas', desc: 'Construction, roads, infrastructure, public works, pavements, bridges' },
  { nombre: 'Educación', desc: 'Schools, teachers, students, learning, kindergartens, education programs' },
  { nombre: 'Salud', desc: 'Health centers, hospitals, doctors, medicine, vaccination, wellness' },
  { nombre: 'Seguridad', desc: 'Police, security, crime prevention, emergency response, patrol' },
  { nombre: 'Medio Ambiente', desc: 'Environment, recycling, parks, trees, pollution, green spaces' },
  { nombre: 'Talleres', desc: 'Vehicle maintenance, mechanical workshop, fleet management, repairs' },
];

// ── UTILIDADES UI ──────────────────────────────────────────
function setPillStatus(id, status, text) {
  const pill = document.getElementById(`pill-${id}`);
  if (!pill) return;
  const span = pill.querySelector('.pill-status');
  if (span) {
    span.className = `pill-status ${status}`;
    span.textContent = text;
  }
}

function showProgress(modelKey, show) {
  const el = document.getElementById(`progress${modelKey}`);
  if (el) el.style.display = show ? 'block' : 'none';
}

function updateProgress(modelKey, pct, text) {
  const fill = document.getElementById(`fill${modelKey}`);
  const label = document.getElementById(`text${modelKey}`);
  if (fill)  fill.style.width = pct + '%';
  if (label) label.textContent = text;
}

function showResult(id, show = true) {
  const el = document.getElementById(`result${id}`);
  if (el) el.style.display = show ? 'block' : 'none';
}

function setBtn(id, disabled, text = null) {
  const btn = document.getElementById(id);
  if (!btn) return;
  btn.disabled = disabled;
  if (text) btn.textContent = text;
}

function progressCallback(modelKey) {
  return (progress) => {
    if (progress.status === 'downloading' || progress.status === 'progress') {
      const pct = progress.progress ? Math.round(progress.progress) : 0;
      updateProgress(modelKey, pct, `${progress.file || 'Descargando'}... ${pct}%`);
    } else if (progress.status === 'loaded') {
      updateProgress(modelKey, 100, '✅ Modelo listo');
    }
  };
}

// ── TABS ───────────────────────────────────────────────────
document.querySelectorAll('.tab-btn').forEach(btn => {
  btn.addEventListener('click', function() {
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
    this.classList.add('active');
    document.getElementById('tab-' + this.dataset.tab)?.classList.add('active');
  });
});

// ── EJEMPLO BUTTONS ────────────────────────────────────────
document.querySelectorAll('.example-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    const target = btn.dataset.target || 'classifierInput';
    const el = document.getElementById(target);
    if (el) { el.value = btn.dataset.text; el.dispatchEvent(new Event('input')); }
  });
});
document.querySelectorAll('.qa-quick-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.getElementById('qaQuestion').value = btn.dataset.q;
  });
});

// ══════════════════════════════════════════════════════════
// 1. CLASIFICADOR ZERO-SHOT
// ══════════════════════════════════════════════════════════
document.getElementById('loadClassifier')?.addEventListener('click', async () => {
  setBtn('loadClassifier', true, '⏳ Cargando...');
  setPillStatus('classifier', 'loading', 'Cargando...');
  showProgress('Classifier', true);
  try {
    classifierPipe = await pipeline(
      'zero-shot-classification',
      'Xenova/nli-deberta-v3-small',
      { progress_callback: progressCallback('Classifier') }
    );
    setPillStatus('classifier', 'ready', '✅ Listo');
    setBtn('loadClassifier', true, '✅ Cargado');
    setBtn('runClassifier', false, '🏷️ Clasificar Reclamo');
    setBtn('runPipeline', false);
  } catch (e) {
    setPillStatus('classifier', 'error', '❌ Error');
    setBtn('loadClassifier', false, '🔄 Reintentar');
    console.error('Classifier load error:', e);
  }
  showProgress('Classifier', false);
});

document.getElementById('runClassifier')?.addEventListener('click', async () => {
  const text = document.getElementById('classifierInput').value.trim();
  if (!text || !classifierPipe) return;
  setBtn('runClassifier', true, '⏳ Clasificando...');

  try {
    const result = await classifierPipe(text, CATEGORIAS_RECLAMOS, { multi_label: false });
    renderClassifierResult(result);
    showResult('Classifier');
  } catch (e) {
    console.error(e);
  }
  setBtn('runClassifier', false, '🏷️ Clasificar Reclamo');
});

function renderClassifierResult(result) {
  const topLabel = result.labels[0];
  const topScore = result.scores[0];
  const colors   = { 'Baches y Pavimento':'#3b82f6','Alumbrado Público':'#f59e0b','Recolección de Basura':'#10b981','Poda de Árboles':'#22c55e','Agua y Cloacas':'#06b6d4','Ruidos Molestos':'#ef4444','Otros':'#8b5cf6' };
  const color    = colors[topLabel] || '#3b82f6';
  const pct      = Math.round(topScore * 100);

  document.getElementById('classifierMainLabel').innerHTML = `
    <div class="main-label-badge" style="background:${color}22;border-color:${color}55;color:${color}">
      <span class="main-label-icon">${getLabelIcon(topLabel)}</span>
      <span class="main-label-text">${topLabel}</span>
      <span class="main-label-confidence">${pct}% confianza</span>
    </div>`;

  const barsHTML = result.labels.map((label, i) => {
    const score = Math.round(result.scores[i] * 100);
    const c = colors[label] || '#8b5cf6';
    return `<div class="confidence-bar-row">
      <span class="confidence-bar-label">${getLabelIcon(label)} ${label}</span>
      <div class="confidence-bar-track">
        <div class="confidence-bar-fill" style="width:${score}%;background:${c}"></div>
      </div>
      <span class="confidence-bar-pct">${score}%</span>
    </div>`;
  }).join('');
  document.getElementById('classifierBars').innerHTML = barsHTML;
}

function getLabelIcon(label) {
  const icons = { 'Baches y Pavimento':'🛣️','Alumbrado Público':'💡','Recolección de Basura':'🗑️','Poda de Árboles':'🌳','Agua y Cloacas':'💧','Ruidos Molestos':'🔊','Otros':'📋' };
  return icons[label] || '📋';
}

// ══════════════════════════════════════════════════════════
// 2. ANÁLISIS DE SENTIMIENTOS
// ══════════════════════════════════════════════════════════
document.getElementById('loadSentiment')?.addEventListener('click', async () => {
  setBtn('loadSentiment', true, '⏳ Cargando...');
  setPillStatus('sentiment', 'loading', 'Cargando...');
  showProgress('Sentiment', true);
  try {
    sentimentPipe = await pipeline(
      'sentiment-analysis',
      'Xenova/distilbert-base-uncased-finetuned-sst-2-english',
      { progress_callback: progressCallback('Sentiment') }
    );
    setPillStatus('sentiment', 'ready', '✅ Listo');
    setBtn('loadSentiment', true, '✅ Cargado');
    setBtn('runSentiment', false);
    setBtn('runSentimentBatch', false);
    setBtn('runPipeline', false);
  } catch (e) {
    setPillStatus('sentiment', 'error', '❌ Error');
    setBtn('loadSentiment', false, '🔄 Reintentar');
  }
  showProgress('Sentiment', false);
});

document.getElementById('runSentiment')?.addEventListener('click', async () => {
  const text = document.getElementById('sentimentInput').value.trim();
  if (!text || !sentimentPipe) return;
  setBtn('runSentiment', true, '⏳ Analizando...');
  try {
    const result = await sentimentPipe(text);
    renderSentimentResult(result[0]);
    showResult('Sentiment');
  } catch (e) { console.error(e); }
  setBtn('runSentiment', false, '😊 Analizar Sentimiento');
});

function renderSentimentResult(result) {
  const isPos = result.label === 'POSITIVE';
  const score = Math.round(result.score * 100);
  const color = isPos ? '#10b981' : '#ef4444';
  const emoji = isPos ? '😊' : '😠';
  const label = isPos ? 'POSITIVO' : 'NEGATIVO';
  document.getElementById('sentimentDisplay').innerHTML = `
    <div class="sentiment-result-card" style="border-color:${color}55;background:${color}12">
      <div class="sentiment-emoji">${emoji}</div>
      <div class="sentiment-label" style="color:${color}">${label}</div>
      <div class="sentiment-score">${score}% de confianza</div>
      <div class="sentiment-bar-wrap">
        <div class="sentiment-bar-neg" style="flex:${isPos ? score : 100-score}"></div>
        <div class="sentiment-bar-pos" style="flex:${isPos ? 100-score : score}"></div>
      </div>
      <div class="sentiment-bar-labels"><span>Negativo</span><span>Positivo</span></div>
    </div>`;
}

// BATCH SENTIMIENTO
document.getElementById('runSentimentBatch')?.addEventListener('click', async () => {
  if (!sentimentPipe) return;
  setBtn('runSentimentBatch', true, '⏳ Analizando 10 reclamos...');
  const container = document.getElementById('sentimentBatchResults');
  container.innerHTML = '<div class="batch-loading">🤔 Analizando sentimientos...</div>';
  try {
    const results = await Promise.all(RECLAMOS_DEMO.map(t => sentimentPipe(t)));
    const html = RECLAMOS_DEMO.map((text, i) => {
      const r = results[i][0];
      const isPos = r.label === 'POSITIVE';
      const score = Math.round(r.score * 100);
      const color = isPos ? '#10b981' : '#ef4444';
      const emoji = isPos ? '😊' : '😠';
      return `<div class="batch-sentiment-row">
        <span class="batch-emoji">${emoji}</span>
        <span class="batch-text">${text.slice(0, 55)}...</span>
        <span class="batch-score" style="color:${color}">${isPos ? '+' : '-'}${score}%</span>
      </div>`;
    }).join('');
    container.innerHTML = `<div class="batch-sentiment-list">${html}</div>`;
  } catch (e) { container.innerHTML = `<div class="error-msg">Error: ${e.message}</div>`; }
  setBtn('runSentimentBatch', false, '📊 Analizar 20 reclamos');
});

// ══════════════════════════════════════════════════════════
// 3. NER — EXTRACCIÓN DE ENTIDADES
// ══════════════════════════════════════════════════════════
document.getElementById('loadNER')?.addEventListener('click', async () => {
  setBtn('loadNER', true, '⏳ Cargando...');
  setPillStatus('ner', 'loading', 'Cargando...');
  showProgress('NER', true);
  try {
    nerPipe = await pipeline(
      'token-classification',
      'Xenova/bert-base-NER',
      { progress_callback: progressCallback('NER'), aggregation_strategy: 'simple' }
    );
    setPillStatus('ner', 'ready', '✅ Listo');
    setBtn('loadNER', true, '✅ Cargado');
    setBtn('runNER', false);
  } catch (e) {
    setPillStatus('ner', 'error', '❌ Error');
    setBtn('loadNER', false, '🔄 Reintentar');
  }
  showProgress('NER', false);
});

document.getElementById('runNER')?.addEventListener('click', async () => {
  const text = document.getElementById('nerInput').value.trim();
  if (!text || !nerPipe) return;
  setBtn('runNER', true, '⏳ Extrayendo...');
  try {
    const entities = await nerPipe(text);
    renderNERResult(text, entities);
    showResult('NER');
  } catch (e) { console.error(e); }
  setBtn('runNER', false, '🔍 Extraer Entidades');
});

function renderNERResult(text, entities) {
  const typeColors = { PER:'#3b82f6', ORG:'#8b5cf6', LOC:'#10b981', MISC:'#f59e0b' };
  const typeLabels = { PER:'👤 Persona', ORG:'🏢 Organización', LOC:'📍 Lugar', MISC:'📋 Misceláneo' };

  // Highlighted text
  let highlighted = text;
  const sorted = [...entities].sort((a, b) => b.start - a.start);
  sorted.forEach(e => {
    const color = typeColors[e.entity_group] || '#gray';
    const tag = `<mark class="ner-mark" style="background:${color}33;border-bottom:2px solid ${color};color:${color}" title="${typeLabels[e.entity_group] || e.entity_group} (${Math.round(e.score*100)}%)">${e.word}</mark>`;
    highlighted = highlighted.slice(0, e.start) + tag + highlighted.slice(e.end);
  });
  document.getElementById('nerHighlighted').innerHTML = `<p>${highlighted}</p>`;

  // Summary
  const grouped = {};
  entities.forEach(e => {
    const g = e.entity_group;
    if (!grouped[g]) grouped[g] = [];
    grouped[g].push(e.word);
  });
  const summaryHTML = Object.entries(grouped).map(([type, words]) => {
    const color = typeColors[type] || '#8b5cf6';
    return `<div class="ner-group">
      <span class="ner-type-badge" style="background:${color}22;color:${color};border-color:${color}44">${typeLabels[type] || type}</span>
      <div class="ner-words">${words.map(w => `<span class="ner-word">${w}</span>`).join('')}</div>
    </div>`;
  }).join('');
  document.getElementById('nerSummary').innerHTML = summaryHTML || '<p class="no-entities">No se detectaron entidades.</p>';
}

// ══════════════════════════════════════════════════════════
// 4. Q&A
// ══════════════════════════════════════════════════════════
document.getElementById('loadQA')?.addEventListener('click', async () => {
  setBtn('loadQA', true, '⏳ Cargando...');
  setPillStatus('qa', 'loading', 'Cargando...');
  showProgress('QA', true);
  try {
    qaPipe = await pipeline(
      'question-answering',
      'Xenova/distilbert-base-uncased-distilled-squad',
      { progress_callback: progressCallback('QA') }
    );
    setPillStatus('qa', 'ready', '✅ Listo');
    setBtn('loadQA', true, '✅ Cargado');
    setBtn('runQA', false);
  } catch (e) {
    setPillStatus('qa', 'error', '❌ Error');
    setBtn('loadQA', false, '🔄 Reintentar');
  }
  showProgress('QA', false);
});

document.getElementById('runQA')?.addEventListener('click', async () => {
  const question = document.getElementById('qaQuestion').value.trim();
  const context  = document.getElementById('qaContext').value.trim();
  if (!question || !context || !qaPipe) return;
  setBtn('runQA', true, '⏳ Pensando...');
  try {
    const result = await qaPipe({ question, context });
    document.getElementById('qaAnswerText').textContent = result.answer;
    document.getElementById('qaConfidence').innerHTML = `
      <div class="qa-conf-bar-wrap">
        <div class="qa-conf-bar" style="width:${Math.round(result.score*100)}%"></div>
      </div>
      <span>Confianza: ${Math.round(result.score * 100)}%</span>`;
    showResult('QA');
  } catch (e) { console.error(e); }
  setBtn('runQA', false, '❓ Responder Pregunta');
});

// ══════════════════════════════════════════════════════════
// 5. WHISPER STT
// ══════════════════════════════════════════════════════════
let mediaRecorder = null;
let audioChunks   = [];
let recordingInterval = null;
let recordingSeconds  = 0;

document.getElementById('loadWhisper')?.addEventListener('click', async () => {
  setBtn('loadWhisper', true, '⏳ Cargando Whisper...');
  setPillStatus('whisper', 'loading', 'Cargando...');
  showProgress('Whisper', true);
  try {
    whisperPipe = await pipeline(
      'automatic-speech-recognition',
      'Xenova/whisper-tiny',
      { progress_callback: progressCallback('Whisper') }
    );
    setPillStatus('whisper', 'ready', '✅ Listo');
    setBtn('loadWhisper', true, '✅ Whisper Listo');
    setBtn('whisperRecordBtn', false);
    setBtn('runWhisper', false);
    document.getElementById('whisperPlaceholder').innerHTML = `
      <div class="placeholder-icon">✅</div>
      <div class="placeholder-text">Whisper listo — grabá tu voz o subí un audio</div>`;
  } catch (e) {
    setPillStatus('whisper', 'error', '❌ Error');
    setBtn('loadWhisper', false, '🔄 Reintentar');
    console.error('Whisper load error:', e);
  }
  showProgress('Whisper', false);
});

// Grabar audio
document.getElementById('whisperRecordBtn')?.addEventListener('click', async () => {
  if (mediaRecorder && mediaRecorder.state === 'recording') {
    // STOP
    mediaRecorder.stop();
    clearInterval(recordingInterval);
    document.getElementById('whisperTimer').style.display = 'none';
    document.getElementById('whisperWave').style.display = 'none';
    document.getElementById('whisperRecordBtn').innerHTML = '<span class="mic-icon">🎤</span><span class="mic-label">Grabar Audio</span>';
    document.getElementById('whisperRecordBtn').classList.remove('recording');
    setBtn('runWhisper', false);
    return;
  }

  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    audioChunks  = [];
    mediaRecorder = new MediaRecorder(stream);
    mediaRecorder.ondataavailable = e => audioChunks.push(e.data);
    mediaRecorder.onstop = () => {
      stream.getTracks().forEach(t => t.stop());
    };
    mediaRecorder.start();
    recordingSeconds = 0;
    document.getElementById('whisperTimer').style.display = 'flex';
    document.getElementById('whisperWave').style.display  = 'flex';
    document.getElementById('whisperRecordBtn').innerHTML = '<span class="mic-icon">⏹</span><span class="mic-label">Detener</span>';
    document.getElementById('whisperRecordBtn').classList.add('recording');
    recordingInterval = setInterval(() => {
      recordingSeconds++;
      document.getElementById('whisperSeconds').textContent = recordingSeconds;
    }, 1000);
  } catch (e) {
    alert('No se pudo acceder al micrófono. Verificá los permisos del browser.');
  }
});

document.getElementById('audioUpload')?.addEventListener('change', (e) => {
  if (e.target.files[0]) {
    document.getElementById('whisperPlaceholder').innerHTML = `
      <div class="placeholder-icon">📁</div>
      <div class="placeholder-text">Audio cargado: ${e.target.files[0].name}</div>
      <div class="placeholder-sub">Hacé click en "Transcribir" para procesarlo</div>`;
    setBtn('runWhisper', false);
  }
});

document.getElementById('runWhisper')?.addEventListener('click', async () => {
  if (!whisperPipe) return;
  setBtn('runWhisper', true, '⏳ Transcribiendo...');

  try {
    let audioInput;
    const fileInput = document.getElementById('audioUpload');
    if (fileInput.files[0]) {
      audioInput = URL.createObjectURL(fileInput.files[0]);
    } else if (audioChunks.length > 0) {
      const blob = new Blob(audioChunks, { type: 'audio/webm' });
      audioInput = URL.createObjectURL(blob);
    } else {
      alert('Grabá audio o subí un archivo primero');
      setBtn('runWhisper', false, '🎤 Transcribir');
      return;
    }

    const lang = document.getElementById('whisperLang').value;
    const opts = lang !== 'null' ? { language: lang, task: 'transcribe' } : {};

    const result = await whisperPipe(audioInput, opts);
    if (audioInput.startsWith('blob:')) URL.revokeObjectURL(audioInput);

    document.getElementById('whisperTranscript').textContent = result.text;
    document.getElementById('whisperPlaceholder').style.display = 'none';
    showResult('Whisper');
  } catch (e) {
    console.error('Whisper error:', e);
    alert(`Error al transcribir: ${e.message}`);
  }
  setBtn('runWhisper', false, '🎤 Transcribir');
});

document.getElementById('btnCopyTranscript')?.addEventListener('click', () => {
  const text = document.getElementById('whisperTranscript').textContent;
  navigator.clipboard.writeText(text);
});

document.getElementById('btnSendToIA')?.addEventListener('click', () => {
  const text = document.getElementById('whisperTranscript').textContent;
  if (text) window.open(`ia.html?q=${encodeURIComponent(text)}`, '_blank');
});

// ══════════════════════════════════════════════════════════
// 6. EMBEDDINGS — BÚSQUEDA SEMÁNTICA
// ══════════════════════════════════════════════════════════
let embeddingVectors = null;

document.getElementById('loadEmbeddings')?.addEventListener('click', async () => {
  setBtn('loadEmbeddings', true, '⏳ Cargando...');
  setPillStatus('embeddings', 'loading', 'Cargando...');
  showProgress('Embeddings', true);
  try {
    embeddingsPipe = await pipeline(
      'feature-extraction',
      'Xenova/all-MiniLM-L6-v2',
      { progress_callback: progressCallback('Embeddings') }
    );
    setPillStatus('embeddings', 'ready', '✅ Listo');
    setBtn('loadEmbeddings', true, '✅ Cargado');
    setBtn('runEmbeddings', false);
    setBtn('runSimilarityMatrix', false);
    // Pre-calcular embeddings de los reclamos demo
    await precomputeEmbeddings();
  } catch (e) {
    setPillStatus('embeddings', 'error', '❌ Error');
    setBtn('loadEmbeddings', false, '🔄 Reintentar');
  }
  showProgress('Embeddings', false);
});

async function precomputeEmbeddings() {
  const outputs = await embeddingsPipe(RECLAMOS_DEMO, { pooling: 'mean', normalize: true });
  embeddingVectors = outputs.tolist ? outputs.tolist() : Array.from({ length: RECLAMOS_DEMO.length }, (_, i) => Array.from(outputs[i]?.data || []));
}

function cosineSimilarity(a, b) {
  const dot  = a.reduce((sum, ai, i) => sum + ai * b[i], 0);
  const magA = Math.sqrt(a.reduce((sum, ai) => sum + ai * ai, 0));
  const magB = Math.sqrt(b.reduce((sum, bi) => sum + bi * bi, 0));
  return magA && magB ? dot / (magA * magB) : 0;
}

document.getElementById('runEmbeddings')?.addEventListener('click', async () => {
  const query = document.getElementById('embeddingsQuery').value.trim();
  if (!query || !embeddingsPipe) return;
  setBtn('runEmbeddings', true, '⏳ Buscando...');
  try {
    const qOut    = await embeddingsPipe([query], { pooling: 'mean', normalize: true });
    const qVec    = Array.from(qOut[0]?.data || qOut.tolist?.()[0] || []);
    const scores  = (embeddingVectors || []).map((vec, i) => ({
      text: RECLAMOS_DEMO[i], score: cosineSimilarity(qVec, vec), idx: i,
    })).sort((a, b) => b.score - a.score);

    const html = scores.map((s, rank) => {
      const pct = Math.round(s.score * 100);
      const color = pct > 70 ? '#10b981' : pct > 50 ? '#f59e0b' : '#6b7280';
      return `<div class="embedding-result-row">
        <span class="embedding-rank">#${rank + 1}</span>
        <div class="embedding-text">${s.text}</div>
        <div class="embedding-score-wrap">
          <div class="embedding-score-bar" style="width:${pct}%;background:${color}"></div>
          <span class="embedding-score-val" style="color:${color}">${pct}%</span>
        </div>
      </div>`;
    }).join('');
    document.getElementById('embeddingsResults').innerHTML = html;
    showResult('Embeddings');
  } catch (e) { console.error(e); }
  setBtn('runEmbeddings', false, '🔗 Buscar Similares');
});

document.getElementById('runSimilarityMatrix')?.addEventListener('click', async () => {
  if (!embeddingsPipe) return;
  setBtn('runSimilarityMatrix', true, '⏳ Calculando...');
  try {
    const texts   = SECRETARIAS.map(s => s.desc);
    const outputs = await embeddingsPipe(texts, { pooling: 'mean', normalize: true });
    const vecs    = texts.map((_, i) => Array.from(outputs[i]?.data || []));
    const n = SECRETARIAS.length;
    let html = `<div class="matrix-wrap"><table class="matrix-table"><thead><tr><th></th>${SECRETARIAS.map(s => `<th>${s.nombre}</th>`).join('')}</tr></thead><tbody>`;
    for (let i = 0; i < n; i++) {
      html += `<tr><td class="matrix-row-label">${SECRETARIAS[i].nombre}</td>`;
      for (let j = 0; j < n; j++) {
        const sim = i === j ? 1 : cosineSimilarity(vecs[i], vecs[j]);
        const pct = Math.round(sim * 100);
        const alpha = (sim * 0.7 + 0.1).toFixed(2);
        html += `<td class="matrix-cell" style="background:rgba(59,130,246,${alpha})" title="${pct}%">${pct}%</td>`;
      }
      html += '</tr>';
    }
    html += '</tbody></table></div>';
    document.getElementById('similarityMatrix').innerHTML = html;
  } catch (e) { console.error(e); }
  setBtn('runSimilarityMatrix', false, '🔢 Calcular Matriz');
});

// ══════════════════════════════════════════════════════════
// 7. PIPELINE MASIVO
// ══════════════════════════════════════════════════════════
document.getElementById('runPipeline')?.addEventListener('click', async () => {
  if (!classifierPipe && !sentimentPipe) {
    alert('Cargá al menos el Clasificador o el Analizador de Sentimientos primero.');
    return;
  }
  setBtn('runPipeline', true, '⏳ Ejecutando pipeline...');
  document.getElementById('batchResults').style.display = 'block';

  const setStepStatus = (step, status, text) => {
    const el = document.getElementById(`step${step}status`);
    if (el) { el.className = `step-status ${status}`; el.textContent = text; }
    document.getElementById(`step${step}`)?.classList.add('active');
  };

  const results = [];

  // PASO 1: Clasificar
  setStepStatus(1, 'running', '⏳ Clasificando...');
  for (let i = 0; i < RECLAMOS_DEMO.length; i++) {
    const text = RECLAMOS_DEMO[i];
    let categoria = '—', confianza = 0;
    if (classifierPipe) {
      try {
        const r = await classifierPipe(text, CATEGORIAS_RECLAMOS);
        categoria = r.labels[0];
        confianza = Math.round(r.scores[0] * 100);
      } catch (e) { }
    }
    results.push({ text, categoria, confianza, sentimiento: '—', urgencia: 0 });
  }
  setStepStatus(1, 'done', '✅ Listo');

  // PASO 2: Sentimientos
  setStepStatus(2, 'running', '⏳ Analizando...');
  for (let i = 0; i < results.length; i++) {
    if (sentimentPipe) {
      try {
        const r = await sentimentPipe(results[i].text);
        results[i].sentimiento = r[0].label === 'POSITIVE' ? '😊 Positivo' : '😠 Negativo';
        results[i].sentScore   = Math.round(r[0].score * 100);
      } catch (e) { }
    }
  }
  setStepStatus(2, 'done', '✅ Listo');

  // PASO 3: Score de urgencia
  setStepStatus(3, 'running', '⏳ Priorizando...');
  const urgencyByCategory = { 'Agua y Cloacas':90,'Baches y Pavimento':80,'Alumbrado Público':75,'Recolección de Basura':70,'Poda de Árboles':55,'Ruidos Molestos':45,'Otros':30 };
  results.forEach(r => {
    const catScore  = urgencyByCategory[r.categoria] || 50;
    const sentBonus = r.sentimiento.includes('Negativo') ? 15 : 0;
    r.urgencia = Math.min(100, catScore + sentBonus);
    r.prioridad = r.urgencia >= 80 ? '🔴 Urgente' : r.urgencia >= 60 ? '🟡 Alta' : '🟢 Normal';
  });
  results.sort((a, b) => b.urgencia - a.urgencia);
  setStepStatus(3, 'done', '✅ Listo');

  // PASO 4: Render tabla
  setStepStatus(4, 'running', '⏳ Generando...');
  document.getElementById('batchBody').innerHTML = results.map((r, i) => `
    <tr>
      <td style="color:var(--text-muted)">${i + 1}</td>
      <td style="font-size:12px">${r.text.slice(0, 60)}...</td>
      <td><span class="status-badge ok" style="font-size:11px">${getLabelIcon(r.categoria)} ${r.categoria}</span></td>
      <td style="font-weight:700;color:var(--blue)">${r.confianza}%</td>
      <td>${r.sentimiento}</td>
      <td>
        <div class="urgency-bar-wrap">
          <div class="urgency-bar" style="width:${r.urgencia}%;background:${r.urgencia>=80?'var(--red)':r.urgencia>=60?'var(--amber)':'var(--green)'}"></div>
          <span>${r.urgencia}</span>
        </div>
      </td>
      <td>${r.prioridad}</td>
    </tr>`).join('');

  const urgentes = results.filter(r => r.urgencia >= 80).length;
  const altas    = results.filter(r => r.urgencia >= 60 && r.urgencia < 80).length;
  document.getElementById('batchStats').innerHTML = `
    <div class="batch-stat-cards">
      <div class="batch-stat"><span class="stat-val red">${urgentes}</span><span class="stat-label">Urgentes</span></div>
      <div class="batch-stat"><span class="stat-val amber">${altas}</span><span class="stat-label">Alta prioridad</span></div>
      <div class="batch-stat"><span class="stat-val green">${results.length - urgentes - altas}</span><span class="stat-label">Normales</span></div>
      <div class="batch-stat"><span class="stat-val blue">${results.length}</span><span class="stat-label">Total procesados</span></div>
    </div>`;

  setStepStatus(4, 'done', '✅ Listo');
  setBtn('runPipeline', false, '⚡ Ejecutar Pipeline Completo');

  // Guardar resultados para exportar
  window._pipelineResults = results;
});

// EXPORTAR PIPELINE A PDF
document.getElementById('exportBatchPDF')?.addEventListener('click', () => {
  const results = window._pipelineResults;
  if (!results) return;
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });

  doc.setFillColor(6, 11, 24);
  doc.rect(0, 0, 297, 30, 'F');
  doc.setFillColor(59, 130, 246);
  doc.rect(0, 0, 6, 30, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(14);
  doc.setTextColor(255, 255, 255);
  doc.text('MUNICIPIO DE JUNÍN — Análisis IA de Reclamos', 14, 12);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(180, 200, 220);
  doc.text(`Procesado con HuggingFace Transformers.js · ${new Date().toLocaleString('es-AR')}`, 14, 22);

  doc.autoTable({
    startY: 36,
    head: [['#', 'Descripción del Reclamo', 'Categoría IA', 'Confianza', 'Sentimiento', 'Score Urgencia', 'Prioridad']],
    body: results.map((r, i) => [i + 1, r.text.slice(0, 70) + '...', r.categoria, r.confianza + '%', r.sentimiento.replace(/😊|😠/, '').trim(), r.urgencia + '/100', r.prioridad.replace(/🔴|🟡|🟢/, '').trim()]),
    headStyles: { fillColor: [17, 29, 53], textColor: 255, fontSize: 8 },
    bodyStyles: { fontSize: 7 },
    columnStyles: { 0:{cellWidth:8}, 1:{cellWidth:80}, 5:{halign:'center'} },
    margin: { left: 10, right: 10 },
  });

  doc.save(`municipio-junin-ia-reclamos-${new Date().toISOString().slice(0,10)}.pdf`);
});

// ── INIT ──────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  buildSidebar('ia-hf');
});

// Hacer disponible buildSidebar en el módulo
window.addEventListener('load', () => {
  if (typeof buildSidebar === 'function') buildSidebar('ia-hf');
});

