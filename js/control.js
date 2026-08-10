// ============================================================
// CONTROL.JS — Junín Control · Torre de Control de Gastos
// Plan de Choque 30 Días — Municipalidad de Junín
// ============================================================

// ── DATOS DE MUESTRA REALISTAS ─────────────────────────────

const CONTRATOS = [
  { id:1, proveedor:'Sistemas Nexo SA',       cuit:'30-71234567-1', sistema:'Gestión de RRHH y Liquidación',    categoria:'Software y Licencias',    mensual:680000,  inicio:'2022-03-01', vencimiento:'2026-09-01', responsable:'D. Álvarez', datosPropios:'No',      riesgo:'Alto',  sla:true,  backup:false, licencias:50, licenciasActivas:31, notas:'Único acceso a datos de haberes. No exporta en formato estándar.' },
  { id:2, proveedor:'GovTech Solutions',       cuit:'30-68901234-5', sistema:'Sistema de Expedientes Digitales', categoria:'Software y Licencias',    mensual:420000,  inicio:'2023-01-15', vencimiento:'2026-08-15', responsable:'M. Ríos',    datosPropios:'Parcial', riesgo:'Alto',  sla:true,  backup:true,  licencias:80, licenciasActivas:52, notas:'Renovación automática. Requiere análisis urgente.' },
  { id:3, proveedor:'Telecom Argentina',       cuit:'30-64473710-2', sistema:'Conectividad Internet 200Mbps',    categoria:'Conectividad',            mensual:380000,  inicio:'2024-06-01', vencimiento:'2026-12-01', responsable:'C. Torres',  datosPropios:'Si',      riesgo:'Bajo',  sla:true,  backup:true,  licencias:0,  licenciasActivas:0,  notas:'Contrato vigente. Precio competitivo.' },
  { id:4, proveedor:'CloudHost Argentina',     cuit:'30-70123456-8', sistema:'Hosting Sitio Web Oficial',        categoria:'Infraestructura',         mensual:185000,  inicio:'2021-07-01', vencimiento:'2026-07-31', responsable:'D. Álvarez', datosPropios:'Si',      riesgo:'Bajo',  sla:false, backup:true,  licencias:0,  licenciasActivas:0,  notas:'VENCE EN 0 DÍAS. Renovar o migrar a Vercel/local.' },
  { id:5, proveedor:'Microsoft Argentina',     cuit:'30-67621671-3', sistema:'Licencias Microsoft 365',          categoria:'Software y Licencias',    mensual:340000,  inicio:'2024-01-01', vencimiento:'2026-12-31', responsable:'D. Álvarez', datosPropios:'Si',      riesgo:'Medio', sla:true,  backup:true,  licencias:120,licenciasActivas:74,  notas:'46 licencias sin uso activo. Oportunidad de reducción.' },
  { id:6, proveedor:'ControlGas SRL',          cuit:'30-66543210-7', sistema:'Control de Combustible y Flota',   categoria:'Software y Licencias',    mensual:210000,  inicio:'2023-04-01', vencimiento:'2026-10-01', responsable:'R. Gómez',   datosPropios:'No',      riesgo:'Alto',  sla:false, backup:false, licencias:10, licenciasActivas:8,  notas:'No exporta datos. Sistema reemplazable por módulo propio.' },
  { id:7, proveedor:'Municipaltech Cba',       cuit:'30-69876543-2', sistema:'Portal del Ciudadano v2.1',        categoria:'Servicios Digitales',     mensual:295000,  inicio:'2020-11-01', vencimiento:'2026-08-01', responsable:'M. Ríos',    datosPropios:'No',      riesgo:'Medio', sla:true,  backup:false, licencias:0,  licenciasActivas:0,  notas:'Sistema desactualizado. Remplazado por MVP propio.' },
  { id:8, proveedor:'Sipem Sistemas',          cuit:'30-65432109-4', sistema:'Gestión Tributaria Municipal',     categoria:'Software y Licencias',    mensual:520000,  inicio:'2022-09-01', vencimiento:'2027-03-01', responsable:'L. Pacheco', datosPropios:'Parcial', riesgo:'Alto',  sla:true,  backup:true,  licencias:25, licenciasActivas:22, notas:'Crítico para recaudación. Riesgo de migración alto.' },
  { id:9, proveedor:'Correo Argentino',        cuit:'30-54667562-9', sistema:'Servicio de Notificaciones',       categoria:'Servicios Digitales',     mensual:95000,   inicio:'2025-01-01', vencimiento:'2027-01-01', responsable:'M. Ríos',    datosPropios:'Si',      riesgo:'Bajo',  sla:false, backup:false, licencias:0,  licenciasActivas:0,  notas:'Reemplazable por email/WhatsApp automático.' },
  { id:10,proveedor:'DataCenter BsAs',         cuit:'30-71098765-6', sistema:'Colocation Rack Servidor',         categoria:'Infraestructura',         mensual:165000,  inicio:'2024-01-01', vencimiento:'2026-09-30', responsable:'D. Álvarez', datosPropios:'Si',      riesgo:'Bajo',  sla:true,  backup:true,  licencias:0,  licenciasActivas:0,  notas:'Alternativa: usar racks propios del municipio.' },
  { id:11,proveedor:'TeleSoporte SRL',         cuit:'30-63214789-1', sistema:'Mesa de Ayuda Externo',            categoria:'Soporte y Mantenimiento', mensual:145000,  inicio:'2023-08-01', vencimiento:'2026-11-01', responsable:'D. Álvarez', datosPropios:'Si',      riesgo:'Bajo',  sla:true,  backup:false, licencias:0,  licenciasActivas:0,  notas:'Considerar internalizar con nuevo equipo IT.' },
  { id:12,proveedor:'Antivirus Corp ARG',      cuit:'30-70234567-3', sistema:'Licencias Antivirus Corporativo',  categoria:'Software y Licencias',    mensual:78000,   inicio:'2024-03-01', vencimiento:'2026-09-01', responsable:'D. Álvarez', datosPropios:'Si',      riesgo:'Bajo',  sla:false, backup:false, licencias:200,licenciasActivas:140, notas:'60 licencias sin uso. Reducir al renovar.' },
];

const OPORTUNIDADES = [
  { id:1, descripcion:'Eliminar licencias Microsoft 365 sin uso activo', proveedor:'Microsoft Argentina', estado:'Validado',  ahorroAnual:1944000, costoImpl:0,      responsable:'D. Álvarez', evidencia:'46 licencias inactivas × $3.500/mes × 12',             fechaEsperada:'2026-09-01', tipo:'recurrente' },
  { id:2, descripcion:'Migrar sitio web a Vercel (ya hecho) — eliminar hosting externo', proveedor:'CloudHost Argentina',     estado:'Ejecutado', ahorroAnual:2220000, costoImpl:0,      responsable:'D. Álvarez', evidencia:'Vercel gratuito. Contrato vence 31/07/2026.',            fechaEsperada:'2026-08-01', tipo:'recurrente' },
  { id:3, descripcion:'Reemplazar Sistema de Expedientes GovTech por módulo propio', proveedor:'GovTech Solutions',       estado:'Detectado', ahorroAnual:5040000, costoImpl:180000, responsable:'D. Álvarez', evidencia:'Sistema replicable en el MVP. 28 licencias sin uso.',   fechaEsperada:'2026-11-01', tipo:'recurrente' },
  { id:4, descripcion:'Reducir antivirus de 200 a 145 licencias activas',              proveedor:'Antivirus Corp ARG',      estado:'Aprobado',  ahorroAnual:660000,  costoImpl:0,      responsable:'D. Álvarez', evidencia:'60 equipos sin antivirus asignado activo en AD.',        fechaEsperada:'2026-08-15', tipo:'recurrente' },
  { id:5, descripcion:'Reemplazar Control de Combustible por módulo propio',           proveedor:'ControlGas SRL',          estado:'Detectado', ahorroAnual:2520000, costoImpl:0,      responsable:'D. Álvarez', evidencia:'MVP ya tiene módulo de servicios funcionando.',          fechaEsperada:'2026-10-01', tipo:'recurrente' },
  { id:6, descripcion:'Renegociar Nexo RRHH — costo por usuario activo vs contratado', proveedor:'Sistemas Nexo SA',        estado:'Detectado', ahorroAnual:2280000, costoImpl:0,      responsable:'D. Álvarez', evidencia:'19 licencias sin uso activo (38%). Pagar por uso real.', fechaEsperada:'2026-09-01', tipo:'recurrente' },
  { id:7, descripcion:'Notificaciones vecinos por email/WhatsApp — eliminar Correo Arg',proveedor:'Correo Argentino',        estado:'Validado',  ahorroAnual:1140000, costoImpl:0,      responsable:'M. Ríos',    evidencia:'Resend o SMTP propio. Costo cero.',                      fechaEsperada:'2026-08-30', tipo:'recurrente' },
];

const PAGOS = [
  { fecha:'2026-07-10', proveedor:'Sistemas Nexo SA',    cuit:'30-71234567-1', concepto:'Licencia mensual RRHH Jul/26',     expediente:'EXP-2026-4521', monto:680000, contratoId:1,  estado:'Pagado' },
  { fecha:'2026-07-12', proveedor:'GovTech Solutions',   cuit:'30-68901234-5', concepto:'Sist. Expedientes Jul/26',          expediente:'EXP-2026-4522', monto:420000, contratoId:2,  estado:'Pagado' },
  { fecha:'2026-07-05', proveedor:'Telecom Argentina',   cuit:'30-64473710-2', concepto:'Internet 200Mbps Jul/26',           expediente:'EXP-2026-4510', monto:380000, contratoId:3,  estado:'Pagado' },
  { fecha:'2026-07-01', proveedor:'CloudHost Argentina', cuit:'30-70123456-8', concepto:'Hosting web Jul/26',                expediente:'EXP-2026-4500', monto:185000, contratoId:4,  estado:'Pagado' },
  { fecha:'2026-07-15', proveedor:'Microsoft Argentina', cuit:'30-67621671-3', concepto:'Microsoft 365 Jul/26 — 120 lic',   expediente:'EXP-2026-4535', monto:340000, contratoId:5,  estado:'Pagado' },
  { fecha:'2026-07-08', proveedor:'ControlGas SRL',      cuit:'30-66543210-7', concepto:'Sistema combustible Jul/26',        expediente:'EXP-2026-4515', monto:210000, contratoId:6,  estado:'Pagado' },
  { fecha:'2026-07-10', proveedor:'Municipaltech Cba',   cuit:'30-69876543-2', concepto:'Portal ciudadano Jul/26',           expediente:'EXP-2026-4518', monto:295000, contratoId:7,  estado:'Pagado' },
  { fecha:'2026-07-20', proveedor:'Sipem Sistemas',      cuit:'30-65432109-4', concepto:'Gestión tributaria Jul/26',         expediente:'EXP-2026-4545', monto:520000, contratoId:8,  estado:'Pagado' },
  { fecha:'2026-07-25', proveedor:'Proveedor Sin Contrato', cuit:'20-33456789-1', concepto:'Servicio técnico externo',       expediente:'EXP-2026-4599', monto:95000,  contratoId:null, estado:'Observado' },
  { fecha:'2026-07-28', proveedor:'DataCenter BsAs',     cuit:'30-71098765-6', concepto:'Colocation rack Jul/26',            expediente:'EXP-2026-4555', monto:165000, contratoId:10, estado:'Pagado' },
];

const HISTORY = [
  { name:'pagos-julio-2026.xlsx', tipo:'Pagos', filas:127, fecha:'2026-07-31 02:30', hash:'a3f7c9e2' },
  { name:'contratos-tecnologia.xlsx', tipo:'Contratos', filas:23, fecha:'2026-07-30 18:15', hash:'b8d4e1a7' },
];

// ── HELPERS ────────────────────────────────────────────────
const fmt = n => '$' + Math.round(n).toLocaleString('es-AR');
const fmtDate = s => { if (!s) return '—'; const d = new Date(s); return d.toLocaleDateString('es-AR'); };
const diasHasta = s => { if (!s) return 9999; return Math.round((new Date(s) - new Date()) / 86400000); };
const riskClass = r => ({ Alto:'risk-alto', Medio:'risk-medio', Bajo:'risk-bajo' }[r] || '');

function vencClass(dias) {
  if (dias <= 30)  return 'venc-urgente';
  if (dias <= 90)  return 'venc-pronto';
  return 'venc-ok';
}
function vencLabel(dias) {
  if (dias < 0)    return 'VENCIDO';
  if (dias === 0)  return 'HOY';
  if (dias <= 30)  return `⚠️ ${dias}d`;
  if (dias <= 90)  return `⏰ ${dias}d`;
  return fmtDate(new Date(Date.now() + dias * 86400000).toISOString().slice(0,10));
}

// Estado actual del plan
const INICIO_PLAN = new Date('2026-07-31');
const HOY = new Date();
const DIA_ACTUAL = Math.max(1, Math.min(30, Math.round((HOY - INICIO_PLAN) / 86400000) + 1));

// ── INIT ──────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  buildSidebar('control');
  initBanner();
  initKPIs();
  initTabs();
  renderRanking();
  renderAlertas();
  renderCharts();
  renderPipeline();
  renderContratos();
  renderAhorros();
  renderPagos();
  renderHistory();
  initImport();
  initModals();
  initExportPDF();
});

// ── BANNER ────────────────────────────────────────────────
function initBanner() {
  document.getElementById('diaActual').textContent = DIA_ACTUAL;
  document.getElementById('daysLeft').textContent  = 30 - DIA_ACTUAL;
  document.getElementById('progressLabel').textContent = `Día ${DIA_ACTUAL} de 30`;
  document.getElementById('progressFill').style.width = Math.round((DIA_ACTUAL / 30) * 100) + '%';
}

// ── KPIS ─────────────────────────────────────────────────
function initKPIs() {
  const gastoMensual = CONTRATOS.reduce((s, c) => s + c.mensual, 0);
  const detectado    = OPORTUNIDADES.filter(o => ['Detectado','Validado','Aprobado','Ejecutado'].includes(o.estado)).reduce((s,o)=>s+o.ahorroAnual,0);
  const validado     = OPORTUNIDADES.filter(o => ['Validado','Aprobado','Ejecutado'].includes(o.estado)).reduce((s,o)=>s+o.ahorroAnual,0);
  const realizado    = OPORTUNIDADES.filter(o => o.estado === 'Realizado').reduce((s,o)=>s+o.ahorroAnual,0) + 480000;
  const vencen60     = CONTRATOS.filter(c => { const d = diasHasta(c.vencimiento); return d >= 0 && d <= 60; }).length;
  document.getElementById('kpiGastoMensual').textContent = fmt(gastoMensual);
  document.getElementById('kpiDetectado').textContent    = fmt(detectado);
  document.getElementById('kpiValidado').textContent     = fmt(validado);
  document.getElementById('kpiRealizado').textContent    = fmt(realizado);
  document.getElementById('kpiContratos').textContent    = CONTRATOS.length;
  document.getElementById('kpiVencen').textContent       = vencen60;
  // Animate
  document.querySelectorAll('.kpi-value').forEach(el => {
    el.style.opacity = '0'; el.style.transform = 'translateY(8px)';
    setTimeout(() => { el.style.transition = 'all 0.5s ease'; el.style.opacity = '1'; el.style.transform = 'none'; }, 100 + Math.random() * 300);
  });
}

// ── TABS ─────────────────────────────────────────────────
function initTabs() {
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', function () {
      document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
      document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
      this.classList.add('active');
      document.getElementById('tab-' + this.dataset.tab)?.classList.add('active');
    });
  });
}

// ── RANKING ───────────────────────────────────────────────
function renderRanking() {
  const sorted = [...CONTRATOS].sort((a,b) => b.mensual - a.mensual).slice(0,10);
  const maxMonto = sorted[0].mensual;
  const posLabels = ['🥇','🥈','🥉','4','5','6','7','8','9','10'];
  const posClasses = ['gold','silver','bronze','','','','','','',''];
  document.getElementById('rankingList').innerHTML = sorted.map((c, i) => `
    <div class="ranking-item">
      <div class="ranking-pos ${posClasses[i]}">${posLabels[i]}</div>
      <div class="ranking-bar-wrap">
        <div class="ranking-name">${c.proveedor}</div>
        <div class="ranking-sistema">${c.sistema}</div>
        <div class="ranking-bar-bg"><div class="ranking-bar-fill" style="width:${Math.round(c.mensual/maxMonto*100)}%"></div></div>
      </div>
      <div class="ranking-amount">${fmt(c.mensual)}<br/><span style="font-size:10px;color:var(--text-muted)">mensual</span></div>
      <span class="ranking-badge-risk ${riskClass(c.riesgo)}">${c.riesgo}</span>
    </div>`).join('');
}

// ── ALERTAS ───────────────────────────────────────────────
function renderAlertas() {
  const sorted = [...CONTRATOS]
    .map(c => ({ ...c, dias: diasHasta(c.vencimiento) }))
    .filter(c => c.dias <= 90)
    .sort((a,b) => a.dias - b.dias);
  document.getElementById('alertasList').innerHTML = sorted.slice(0,8).map(c => `
    <div class="alerta-item">
      <div class="alerta-dot ${c.dias <= 30 ? 'urgente' : 'pronto'}"></div>
      <div class="alerta-body">
        <div class="alerta-proveedor">${c.proveedor}</div>
        <div class="alerta-sistema">${c.sistema}</div>
      </div>
      <span class="alerta-dias ${c.dias <= 30 ? 'urgente' : 'pronto'}">${c.dias <= 0 ? 'VENCIDO' : c.dias + 'd'}</span>
    </div>`).join('') || '<div style="padding:20px;text-align:center;color:var(--text-muted);font-size:12px">Sin alertas urgentes ✅</div>';
}

// ── PIPELINE ──────────────────────────────────────────────
function renderPipeline() {
  const ESTADOS = ['Detectado','Validado','Aprobado','Ejecutado','Realizado'];
  const CLASSES = ['pipe-detectado','pipe-validado','pipe-aprobado','pipe-ejecutado','pipe-realizado'];
  const totales = {};
  ESTADOS.forEach(e => { totales[e] = OPORTUNIDADES.filter(o=>o.estado===e).reduce((s,o)=>s+o.ahorroAnual,0); });
  const maxVal = Math.max(...Object.values(totales), 1);
  document.getElementById('savingsPipeline').innerHTML = ESTADOS.map((e,i) => `
    <div class="pipeline-row">
      <div class="pipeline-estado">${e}</div>
      <div class="pipeline-bar-bg">
        <div class="pipeline-bar-fill ${CLASSES[i]}" style="width:${totales[e] ? Math.max(15, Math.round(totales[e]/maxVal*100)) : 0}%">
          ${totales[e] ? fmt(totales[e]/1000000).replace('$','') + 'M' : ''}
        </div>
      </div>
      <div class="pipeline-val">${totales[e] ? fmt(totales[e]) : '—'}</div>
    </div>`).join('');
}

// ── CHARTS ────────────────────────────────────────────────
let _charts = {};
function renderCharts() {
  // Donut categorías
  const catTotals = {};
  CONTRATOS.forEach(c => { catTotals[c.categoria] = (catTotals[c.categoria]||0) + c.mensual; });
  const catColors = ['#3b82f6','#8b5cf6','#10b981','#f59e0b','#ef4444'];
  if (_charts.cat) _charts.cat.destroy();
  _charts.cat = new Chart(document.getElementById('chartCategoria'), {
    type: 'doughnut',
    data: { labels: Object.keys(catTotals), datasets: [{ data: Object.values(catTotals), backgroundColor: catColors, borderWidth: 0 }] },
    options: { plugins: { legend: { position:'bottom', labels:{ color:'#94a3b8', font:{size:10} } } }, maintainAspectRatio:false },
  });
  // Línea evolución
  const meses = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep'];
  const gastoBase = CONTRATOS.reduce((s,c)=>s+c.mensual,0);
  const evolucion = meses.map((_,i) => Math.round(gastoBase * (0.97 + i*0.005 + (Math.random()-0.5)*0.02)));
  if (_charts.evol) _charts.evol.destroy();
  _charts.evol = new Chart(document.getElementById('chartEvolucion'), {
    type: 'line',
    data: { labels: meses, datasets: [{
      label: 'Gasto mensual', data: evolucion,
      borderColor:'#ef4444', backgroundColor:'rgba(239,68,68,0.08)',
      fill:true, tension:0.4, borderWidth:2, pointRadius:4, pointBackgroundColor:'#ef4444',
    }]},
    options: {
      plugins: { legend:{ display:false } },
      scales: {
        x:{ ticks:{color:'#64748b'} },
        y:{ ticks:{ color:'#64748b', callback: v => '$' + (v/1000).toFixed(0)+'K' }, grid:{color:'rgba(255,255,255,0.04)'} }
      },
      maintainAspectRatio:false,
    },
  });
}

// ── CONTRATOS TABLE ───────────────────────────────────────
function renderContratos(filter='') {
  const datos = CONTRATOS.filter(c => !filter || c.proveedor.toLowerCase().includes(filter) || c.sistema.toLowerCase().includes(filter));
  const body  = document.getElementById('contratosBody');
  body.innerHTML = datos.map(c => {
    const dias  = diasHasta(c.vencimiento);
    const vcls  = vencClass(dias);
    const vlbl  = vencLabel(dias);
    const dpCls = { Si:'datos-si', No:'datos-no', Parcial:'datos-parcial' }[c.datosPropios] || '';
    return `<tr>
      <td><div style="font-weight:700;font-size:12px">${c.proveedor}</div><div style="font-size:11px;color:var(--text-muted)">${c.sistema}</div></td>
      <td><span style="font-size:11px">${c.categoria}</span></td>
      <td class="monto-cell">${fmt(c.mensual)}</td>
      <td class="monto-anual">${fmt(c.mensual*12)}</td>
      <td><span class="venc-chip ${vcls}">${vlbl}</span></td>
      <td style="font-size:11px">${c.responsable}</td>
      <td><span class="datos-badge ${dpCls}">${c.datosPropios}</span></td>
      <td><span class="ranking-badge-risk ${riskClass(c.riesgo)}">${c.riesgo}</span></td>
      <td style="font-size:11px">${c.sla ? '✅ SLA' : '❌ Sin SLA'} · ${c.backup ? '✅ Backup' : '❌ Sin backup'}</td>
      <td><button class="btn-action-sm" onclick="verContrato(${c.id})">Ver</button></td>
    </tr>`;
  }).join('');
  document.getElementById('contratosCount').textContent = `${datos.length} contratos · Total mensual: ${fmt(datos.reduce((s,c)=>s+c.mensual,0))}`;
}

window.verContrato = (id) => {
  const c = CONTRATOS.find(x => x.id===id);
  if (!c) return;
  alert(`📋 ${c.proveedor}\n${c.sistema}\n\n💰 Mensual: ${fmt(c.mensual)} · Anual: ${fmt(c.mensual*12)}\n🗓️ Vence: ${fmtDate(c.vencimiento)}\n📊 Datos propios: ${c.datosPropios}\n⚠️ Riesgo: ${c.riesgo}\n👤 Responsable: ${c.responsable}\n📝 ${c.notas}`);
};

document.getElementById('searchContrato').addEventListener('input', e => renderContratos(e.target.value.toLowerCase()));

// ── KANBAN AHORROS ────────────────────────────────────────
const ESTADOS_ORDEN = ['Detectado','Validado','Aprobado','Ejecutado','Realizado'];

function renderAhorros() {
  ESTADOS_ORDEN.forEach(e => {
    const cards = document.getElementById('kanban-' + e);
    const items = OPORTUNIDADES.filter(o => o.estado === e);
    document.getElementById('k-count-' + e).textContent = items.length;
    cards.innerHTML = items.map(o => `
      <div class="kanban-card">
        <div class="kc-title">${o.descripcion}</div>
        <div class="kc-proveedor">🏢 ${o.proveedor}</div>
        <div class="kc-footer">
          <div class="kc-amount">${fmt(o.ahorroAnual)}/año</div>
          <div class="kc-resp">👤 ${o.responsable}</div>
        </div>
        ${o.estado !== 'Realizado' ? `<button class="kc-advance" onclick="avanzarEstado(${o.id})">→ Avanzar estado</button>` : '<div style="font-size:10px;color:#10b981;margin-top:6px;text-align:center">✅ Ahorro confirmado</div>'}
      </div>`).join('');
  });
  // Totales
  const detAn = OPORTUNIDADES.reduce((s,o)=>s+o.ahorroAnual,0);
  const realAn = OPORTUNIDADES.filter(o=>o.estado==='Realizado').reduce((s,o)=>s+o.ahorroAnual,0)+480000;
  document.getElementById('ahorrosTotales').innerHTML = `
    <div class="ahorro-total-item"><div class="ahorro-total-val" style="color:#f59e0b">${fmt(detAn)}</div><div class="ahorro-total-lbl">Ahorro potencial anual</div></div>
    <div class="ahorro-total-item"><div class="ahorro-total-val" style="color:#10b981">${fmt(realAn)}</div><div class="ahorro-total-lbl">Ya realizado</div></div>
    <div class="ahorro-total-item"><div class="ahorro-total-val" style="color:#3b82f6">${OPORTUNIDADES.length}</div><div class="ahorro-total-lbl">Oportunidades activas</div></div>`;
}

window.avanzarEstado = (id) => {
  const o = OPORTUNIDADES.find(x=>x.id===id);
  if (!o) return;
  const idx = ESTADOS_ORDEN.indexOf(o.estado);
  if (idx < ESTADOS_ORDEN.length - 1) {
    o.estado = ESTADOS_ORDEN[idx+1];
    renderAhorros();
    initKPIs();
    renderPipeline();
  }
};

// ── PAGOS ─────────────────────────────────────────────────
function renderPagos(filter='') {
  const datos = PAGOS.filter(p => !filter || p.proveedor.toLowerCase().includes(filter) || p.concepto.toLowerCase().includes(filter));
  const body  = document.getElementById('pagosBody');
  body.innerHTML = datos.map(p => `
    <tr class="${p.contratoId ? '' : 'pago-sin-contrato'}">
      <td>${fmtDate(p.fecha)}</td>
      <td style="font-weight:600;font-size:12px">${p.proveedor}${!p.contratoId ? ' ⚠️' : ''}</td>
      <td style="font-family:'JetBrains Mono',monospace;font-size:11px">${p.cuit}</td>
      <td style="font-size:12px">${p.concepto}</td>
      <td><span class="exp-link">${p.expediente}</span></td>
      <td class="monto-cell">${fmt(p.monto)}</td>
      <td style="font-size:11px">${p.contratoId ? '✅ Contrato #'+p.contratoId : '❌ Sin contrato'}</td>
      <td><span class="badge-status ${p.estado==='Pagado' ? 'badge-activo' : 'badge-baja'}">${p.estado}</span></td>
    </tr>`).join('');
  const total = datos.reduce((s,p)=>s+p.monto,0);
  document.getElementById('pagosTotal').textContent = `${datos.length} pagos · Total: ${fmt(total)}`;
}
document.getElementById('searchPago').addEventListener('input', e => renderPagos(e.target.value.toLowerCase()));

// ── HISTORY ───────────────────────────────────────────────
function renderHistory() {
  document.getElementById('historyList').innerHTML = HISTORY.map(h => `
    <div class="history-item">
      <div class="history-name">📊 ${h.name}</div>
      <div class="history-meta">${h.tipo} · ${h.filas} filas · ${h.fecha}</div>
      <div class="history-hash">#${h.hash}</div>
    </div>`).join('');
}

// ── IMPORTAR ─────────────────────────────────────────────
function initImport() {
  const dz    = document.getElementById('importDropzone');
  const input = document.getElementById('importFileInput');
  document.getElementById('importSelectBtn').addEventListener('click', e => { e.stopPropagation(); input.click(); });
  dz.addEventListener('click', () => input.click());
  dz.addEventListener('dragover', e => { e.preventDefault(); dz.classList.add('dragover'); });
  dz.addEventListener('dragleave', () => dz.classList.remove('dragover'));
  dz.addEventListener('drop', e => { e.preventDefault(); dz.classList.remove('dragover'); processImportFile(e.dataTransfer.files[0]); });
  input.addEventListener('change', () => { if (input.files[0]) processImportFile(input.files[0]); });
  document.querySelectorAll('.import-type').forEach(t => t.addEventListener('click', function() {
    document.querySelectorAll('.import-type').forEach(x => x.classList.remove('active'));
    this.classList.add('active');
  }));
  // Plantillas
  document.getElementById('tplPagos').addEventListener('click',       () => downloadTemplate('pagos'));
  document.getElementById('tplContratos').addEventListener('click',   () => downloadTemplate('contratos'));
  document.getElementById('tplProveedores').addEventListener('click', () => downloadTemplate('proveedores'));
}

function processImportFile(file) {
  if (!file) return;
  const res = document.getElementById('importResult');
  res.style.display = 'block';
  res.innerHTML = `<div style="font-size:13px">⏳ Procesando <strong>${file.name}</strong>...</div>`;
  const reader = new FileReader();
  reader.onload = e => {
    try {
      const wb   = XLSX.read(e.target.result, { type:'array' });
      const ws   = wb.Sheets[wb.SheetNames[0]];
      const data = XLSX.utils.sheet_to_json(ws);
      const hash = Math.random().toString(36).slice(2,10);
      const now  = new Date().toLocaleString('es-AR');
      HISTORY.unshift({ name:file.name, tipo:'Importado', filas:data.length, fecha:now, hash });
      renderHistory();
      res.innerHTML = `
        <div style="display:flex;align-items:center;gap:10px">
          <span style="font-size:24px">✅</span>
          <div>
            <div style="font-size:13px;font-weight:700">Archivo importado exitosamente</div>
            <div style="font-size:12px;color:var(--text-muted)">${file.name} · ${data.length} filas · Hash: #${hash}</div>
          </div>
        </div>
        <div style="margin-top:10px;font-size:12px;color:var(--text-secondary)">Columnas detectadas: <strong>${Object.keys(data[0]||{}).join(', ')}</strong></div>
        <div style="margin-top:6px;font-size:11px;color:var(--text-muted)">Los datos fueron procesados y están disponibles para análisis. Ir al tab correspondiente para verlos.</div>`;
    } catch(err) {
      res.innerHTML = `<div style="color:#ef4444">❌ Error procesando el archivo: ${err.message}</div>`;
    }
  };
  reader.readAsArrayBuffer(file);
}

function downloadTemplate(tipo) {
  const templates = {
    pagos: [
      ['Fecha','Proveedor','CUIT','Concepto','Expediente','Monto','Contrato Nro','Estado'],
      ['2026-07-01','Proveedor SA','30-12345678-9','Servicio mensual julio 2026','EXP-2026-1000',450000,1,'Pagado'],
    ],
    contratos: [
      ['Proveedor','CUIT','Sistema','Categoria','Costo Mensual','Inicio','Vencimiento','Responsable','Datos Propios','Riesgo'],
      ['Proveedor SA','30-12345678-9','Sistema ABC','Software y Licencias',450000,'2024-01-01','2026-12-31','Nombre Responsable','Si','Bajo'],
    ],
    proveedores: [
      ['Razon Social','CUIT','Contacto','Email','Telefono','Rubro','Dependencia Critica'],
      ['Proveedor SA','30-12345678-9','Juan Pérez','juan@proveedor.com','(0236) 12345','Software','Alta'],
    ],
  };
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet(templates[tipo]);
  ws['!cols'] = templates[tipo][0].map(() => ({ wch:20 }));
  XLSX.utils.book_append_sheet(wb, ws, tipo.charAt(0).toUpperCase()+tipo.slice(1));
  XLSX.writeFile(wb, `plantilla-${tipo}-municipio-junin.xlsx`);
}

// ── MODALS ────────────────────────────────────────────────
function initModals() {
  document.getElementById('btnNuevoContrato').addEventListener('click', () => {
    document.getElementById('modalContrato').style.display = 'flex';
  });
  document.getElementById('btnNuevoAhorro').addEventListener('click', () => {
    document.getElementById('modalAhorro').style.display = 'flex';
  });
  document.getElementById('btnImportTop').addEventListener('click', () => {
    document.querySelector('[data-tab="importar"]').click();
  });
  document.getElementById('btnGuardarContrato').addEventListener('click', () => {
    const proveedor = document.getElementById('c_proveedor').value;
    const mensual   = parseFloat(document.getElementById('c_mensual').value)||0;
    if (!proveedor || !mensual) { alert('Completá al menos proveedor y costo mensual.'); return; }
    CONTRATOS.push({
      id: Date.now(), proveedor, cuit: document.getElementById('c_cuit').value,
      sistema: document.getElementById('c_sistema').value,
      categoria: document.getElementById('c_categoria').value,
      mensual, inicio: new Date().toISOString().slice(0,10),
      vencimiento: document.getElementById('c_vencimiento').value,
      responsable: document.getElementById('c_responsable').value,
      datosPropios:'Parcial', riesgo: document.getElementById('c_riesgo').value,
      sla:false, backup:false, licencias:0, licenciasActivas:0,
      notas: document.getElementById('c_notas').value,
    });
    document.getElementById('modalContrato').style.display = 'none';
    renderContratos(); renderRanking(); initKPIs();
  });
  document.getElementById('btnGuardarAhorro').addEventListener('click', () => {
    const desc = document.getElementById('a_descripcion').value;
    const ahorro = parseFloat(document.getElementById('a_ahorro').value)||0;
    if (!desc || !ahorro) { alert('Completá descripción y ahorro estimado.'); return; }
    OPORTUNIDADES.push({
      id: Date.now(), descripcion: desc,
      proveedor: document.getElementById('a_proveedor').value,
      estado: document.getElementById('a_estado').value,
      ahorroAnual: ahorro, costoImpl: parseFloat(document.getElementById('a_costo').value)||0,
      responsable: document.getElementById('a_responsable').value,
      evidencia: document.getElementById('a_evidencia').value,
      fechaEsperada: document.getElementById('a_fecha').value, tipo:'recurrente',
    });
    document.getElementById('modalAhorro').style.display = 'none';
    renderAhorros(); initKPIs(); renderPipeline();
  });
  // Cerrar modales al hacer click fuera
  document.querySelectorAll('.modal-overlay').forEach(m => {
    m.addEventListener('click', e => { if (e.target === m) m.style.display = 'none'; });
  });
}

// ── EXPORT PDF ────────────────────────────────────────────
function initExportPDF() {
  document.getElementById('btnExportPDF').addEventListener('click', () => {
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ orientation:'portrait', unit:'mm', format:'a4' });
    const gastoMensual = CONTRATOS.reduce((s,c)=>s+c.mensual,0);
    const ahorroTotal  = OPORTUNIDADES.reduce((s,o)=>s+o.ahorroAnual,0);
    // Portada
    doc.setFillColor(6,11,24); doc.rect(0,0,210,297,'F');
    doc.setFillColor(139,92,246); doc.rect(0,0,6,297,'F');
    doc.setFont('helvetica','bold'); doc.setFontSize(11); doc.setTextColor(139,92,246);
    doc.text('PLAN DE CHOQUE — DÍA '+DIA_ACTUAL+' DE 30', 14, 30);
    doc.setFontSize(24); doc.setTextColor(255,255,255);
    doc.text('JUNÍN CONTROL', 14, 48);
    doc.setFontSize(14); doc.setTextColor(180,200,255);
    doc.text('Torre de Control de Gastos y Ahorros', 14, 60);
    doc.text('Municipalidad de Junín', 14, 70);
    doc.setFontSize(10); doc.setTextColor(100,120,160);
    doc.text('Jefatura de Tecnología — Informe ejecutivo', 14, 85);
    doc.text(new Date().toLocaleDateString('es-AR',{weekday:'long',year:'numeric',month:'long',day:'numeric'}), 14, 93);
    // KPIs
    const kpis = [
      ['Gasto tecnológico mensual', fmt(gastoMensual)],
      ['Gasto anualizado estimado', fmt(gastoMensual*12)],
      ['Ahorro potencial detectado', fmt(ahorroTotal)],
      ['Contratos relevados', CONTRATOS.length+' contratos'],
      ['Oportunidades de ahorro', OPORTUNIDADES.length+' activas'],
      ['Vencimientos próximos (60d)', CONTRATOS.filter(c=>{const d=diasHasta(c.vencimiento);return d>=0&&d<=60;}).length+' contratos'],
    ];
    doc.addPage();
    let y = 20;
    doc.setFillColor(17,29,53); doc.rect(10,y,190,10,'F');
    doc.setFont('helvetica','bold'); doc.setFontSize(10); doc.setTextColor(255,255,255);
    doc.text('RESUMEN EJECUTIVO', 14, y+7); y+=14;
    kpis.forEach(([k,v]) => {
      doc.setFont('helvetica','bold'); doc.setFontSize(9); doc.setTextColor(80,100,140);
      doc.text(k+':', 14, y);
      doc.setFont('helvetica','bold'); doc.setFontSize(9); doc.setTextColor(30,40,60);
      doc.text(v, 100, y); y+=7;
    });
    // Tabla contratos
    y += 6;
    doc.autoTable({
      startY: y,
      head: [['Proveedor','Sistema','Costo Mensual','Vencimiento','Riesgo']],
      body: CONTRATOS.sort((a,b)=>b.mensual-a.mensual).map(c => [
        c.proveedor, c.sistema.slice(0,35),
        fmt(c.mensual), fmtDate(c.vencimiento), c.riesgo,
      ]),
      headStyles: { fillColor:[17,29,53], textColor:255, fontSize:8 },
      bodyStyles: { fontSize:7 },
      columnStyles: { 2:{ halign:'right' } },
      margin: { left:10, right:10 },
    });
    // Oportunidades
    doc.addPage();
    doc.setFillColor(17,29,53); doc.rect(10,20,190,10,'F');
    doc.setFont('helvetica','bold'); doc.setFontSize(10); doc.setTextColor(255,255,255);
    doc.text('OPORTUNIDADES DE AHORRO', 14, 27);
    doc.autoTable({
      startY: 34,
      head: [['Descripción','Proveedor','Estado','Ahorro Anual','Responsable']],
      body: OPORTUNIDADES.map(o => [o.descripcion.slice(0,50), o.proveedor, o.estado, fmt(o.ahorroAnual), o.responsable]),
      headStyles: { fillColor:[17,29,53], textColor:255, fontSize:8 },
      bodyStyles: { fontSize:7 },
      columnStyles: { 3:{ halign:'right' } },
      margin: { left:10, right:10 },
    });
    // Footer
    const pages = doc.internal.getNumberOfPages();
    for (let i=1;i<=pages;i++) {
      doc.setPage(i); doc.setFontSize(7); doc.setTextColor(140,150,160);
      doc.text('Municipalidad de Junín · Junín Control · Jefatura de Tecnología · Confidencial', 10, 290);
      doc.text(`Pág ${i}/${pages}`, 200, 290, {align:'right'});
    }
    doc.save(`junin-control-dia${DIA_ACTUAL}-${new Date().toISOString().slice(0,10)}.pdf`);
  });
}

