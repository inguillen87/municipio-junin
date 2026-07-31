// ============================================================
// ia.js — Asistente IA Municipal INTELIGENTE
// Responde preguntas sobre datos municipales en tiempo real
// No requiere Ollama — funciona completamente offline
// Diseñado para intendentes, contadores, jefes de área
// ============================================================

'use strict';

// ══════════════════════════════════════════════════════════════
// BASE DE CONOCIMIENTO MUNICIPAL — JUNÍN 2026
// ══════════════════════════════════════════════════════════════
const MUNICIPAL_DATA = {
  presupuesto: {
    total_anual: 3720000000,
    total_mensual: 310000000,
    ejecutado_agosto: 284500000,
    pct_ejecutado: 72,
    meses_restantes: 4,
    saldo_disponible: 1085000000,
    saldo_mensual_libre: 25500000,
  },
  gastos: {
    tecnologia_mensual: 3513000,
    masa_salarial: 186000000,
    horas_extra_costo: 18400000,
    combustible_mensual: 4200000,
    mantenimiento: 12000000,
    servicios_publicos: 8000000,
    cultura_eventos: 3200000,
    salud_insumos: 6800000,
  },
  empleados: {
    total: 1247,
    planta_permanente: 1089,
    contratados: 158,
    en_licencia: 47,
    horas_extra_mes: 4312,
    ausentismo_pct: 3.1,
    por_area: {
      'Educación': 302,
      'Obras Públicas': 214,
      'Salud': 187,
      'Seguridad': 178,
      'Medio Ambiente': 96,
      'Administración': 145,
      'Cultura': 62,
      'Talleres': 63,
    },
  },
  reclamos: {
    total: 318,
    pendientes: 89,
    resueltos: 229,
    tasa_resolucion: 72,
    tiempo_promedio_dias: 3.2,
    por_tipo: {
      'Baches y Pavimento': 108,
      'Alumbrado Público': 70,
      'Recolección de Basura': 57,
      'Poda de Árboles': 38,
      'Agua y Cloacas': 25,
      'Otros': 20,
    },
    zonas_criticas: ['Centro', 'Barrio Norte', 'Av. Rivadavia'],
  },
  proveedores: {
    total_contratos: 12,
    gasto_mensual: 3513000,
    ahorro_detectado: 15804000,
    ahorro_validado: 5964000,
    contratos_alto_riesgo: 6,
    vencen_60dias: 5,
    principales: [
      { nombre: 'Sistemas Nexo SA', mensual: 680000, riesgo: 'Alto', vence: '2026-09-01' },
      { nombre: 'Sipem Sistemas', mensual: 520000, riesgo: 'Alto', vence: '2027-03-01' },
      { nombre: 'GovTech Solutions', mensual: 420000, riesgo: 'Alto', vence: '2026-08-15' },
      { nombre: 'Telecom Argentina', mensual: 380000, riesgo: 'Bajo', vence: '2026-12-01' },
      { nombre: 'Microsoft Argentina', mensual: 340000, riesgo: 'Medio', vence: '2026-12-31' },
    ],
  },
  flota: {
    total_vehiculos: 43,
    operativos: 36,
    en_reparacion: 5,
    sin_service: 2,
    combustible_stock_pct: 48,
    km_mes: 12400,
    costo_km: 340,
  },
  alertas: [
    { tipo: 'CRITICA', area: 'Obras Públicas', mensaje: 'Supera presupuesto mensual en 18% ($6.8M extra)' },
    { tipo: 'CRITICA', area: 'GovTech Solutions', mensaje: 'Contrato VENCIDO — sistema de expedientes en riesgo' },
    { tipo: 'URGENTE', area: 'Combustible', mensaje: 'Stock al 48% — solicitar reposición antes del día 10' },
    { tipo: 'URGENTE', area: 'Talleres', mensaje: '5 vehículos en reparación — flota al 84% operativa' },
    { tipo: 'ATENCION', area: 'Reclamos', mensaje: '89 reclamos vecinos pendientes — 12 con más de 7 días' },
  ],
};

// ══════════════════════════════════════════════════════════════
// MOTOR DE INTENCIÓN — detecta qué pregunta el usuario
// ══════════════════════════════════════════════════════════════
const INTENTS = [
  {
    id: 'saldo_libre',
    keywords: ['dinero libre', 'cuanto queda', 'saldo', 'disponible', 'puedo gastar', 'queda libre', 'me queda', 'plata libre', 'queda de presupuesto', 'sobra'],
    responder: responderSaldoLibre,
  },
  {
    id: 'gasto_total',
    keywords: ['gasto total', 'cuanto gastamos', 'cuánto gastamos', 'gasto agosto', 'gasto mensual', 'gastando', 'erogaciones', 'total gastos'],
    responder: responderGastoTotal,
  },
  {
    id: 'empleados',
    keywords: ['empleados', 'trabajadores', 'plantel', 'personal', 'rrhh', 'recursos humanos', 'agentes', 'planta', 'cuantos trabajan', 'staff'],
    responder: responderEmpleados,
  },
  {
    id: 'horas_extra',
    keywords: ['horas extra', 'horas extras', 'horas adicionales', 'overtime', 'horas suplementarias'],
    responder: responderHorasExtra,
  },
  {
    id: 'reclamos',
    keywords: ['reclamos', 'vecinos', 'quejas', 'denuncias', 'reclamo', 'queja', 'pendientes vecinos'],
    responder: responderReclamos,
  },
  {
    id: 'proveedores',
    keywords: ['proveedores', 'contratos', 'proveedor', 'empresa', 'empresas', 'vencimiento', 'vence', 'licitacion', 'licitación'],
    responder: responderProveedores,
  },
  {
    id: 'alertas',
    keywords: ['alertas', 'problemas', 'urgente', 'critico', 'crítico', 'alerta', 'qué hay que hacer', 'que hay que hacer', 'prioridad', 'atencion', 'atención'],
    responder: responderAlertas,
  },
  {
    id: 'tecnologia',
    keywords: ['tecnologia', 'tecnología', 'sistemas', 'software', 'licencias', 'it', 'informática', 'informatica', 'computadoras', 'contratos tecnologia'],
    responder: responderTecnologia,
  },
  {
    id: 'flota',
    keywords: ['flota', 'vehiculos', 'vehículos', 'autos', 'camiones', 'combustible', 'nafta', 'gasoil', 'movilidad', 'transporte'],
    responder: responderFlota,
  },
  {
    id: 'informe_ejecutivo',
    keywords: ['informe', 'resumen', 'panorama', 'situacion', 'situación', 'como estamos', 'cómo estamos', 'estado general', 'reporte', 'overview', 'executive'],
    responder: responderInformeEjecutivo,
  },
  {
    id: 'ahorro',
    keywords: ['ahorro', 'ahorros', 'reducir gasto', 'bajar costos', 'optimizar', 'eficiencia', 'recorte', 'oportunidad'],
    responder: responderAhorros,
  },
  {
    id: 'presupuesto',
    keywords: ['presupuesto', 'budget', 'aprobado', 'asignado', 'ejecucion', 'ejecución', 'secretaria', 'secretaría', 'area', 'área'],
    responder: responderPresupuesto,
  },
];

// ══════════════════════════════════════════════════════════════
// FUNCIONES DE RESPUESTA — Cada una genera HTML rico
// ══════════════════════════════════════════════════════════════

function fmt(n) { return n.toLocaleString('es-AR'); }
function fmtM(n) { return '$' + (n / 1000000).toFixed(1) + 'M'; }
function fmtK(n) { return '$' + (n / 1000).toFixed(0) + 'K'; }

function responderSaldoLibre() {
  const d = MUNICIPAL_DATA.presupuesto;
  const pct_rest = 100 - d.pct_ejecutado;
  return `
    <div class="ia-answer-card">
      <div class="ia-answer-title">💰 Saldo Disponible — Agosto 2026</div>
      
      <div class="ia-kpi-row">
        <div class="ia-kpi-box blue">
          <div class="ia-kpi-val">${fmtM(d.saldo_disponible)}</div>
          <div class="ia-kpi-lbl">Saldo anual restante</div>
        </div>
        <div class="ia-kpi-box green">
          <div class="ia-kpi-val">${fmtM(d.saldo_mensual_libre)}</div>
          <div class="ia-kpi-lbl">Margen mensual libre</div>
        </div>
        <div class="ia-kpi-box amber">
          <div class="ia-kpi-val">${d.meses_restantes}</div>
          <div class="ia-kpi-lbl">Meses restantes del año</div>
        </div>
      </div>
      
      <div class="ia-detail">
        <div class="ia-detail-row">
          <span>Presupuesto total 2026</span>
          <strong>${fmtM(d.total_anual)}</strong>
        </div>
        <div class="ia-detail-row">
          <span>Ejecutado al 31/08</span>
          <strong>${d.pct_ejecutado}% — ${fmtM(d.total_anual * d.pct_ejecutado / 100)}</strong>
        </div>
        <div class="ia-detail-row highlight">
          <span>💰 Disponible para gastar</span>
          <strong class="green">${fmtM(d.saldo_disponible)}</strong>
        </div>
      </div>
      
      <div class="ia-insight">
        📌 <strong>Recomendación:</strong> Con ${d.meses_restantes} meses restantes, el gasto mensual máximo recomendado es de <strong>${fmtM(d.saldo_disponible / d.meses_restantes)}</strong> para no exceder el presupuesto anual.
      </div>
    </div>`;
}

function responderGastoTotal() {
  const d = MUNICIPAL_DATA.presupuesto;
  const g = MUNICIPAL_DATA.gastos;
  const areas = [
    { nombre: 'Educación', monto: 54900000, pct: -10 },
    { nombre: 'Obras Públicas', monto: 44800000, pct: +18 },
    { nombre: 'Salud', monto: 46800000, pct: -10 },
    { nombre: 'Seguridad', monto: 41800000, pct: -5 },
    { nombre: 'Administración', monto: 38200000, pct: -2 },
    { nombre: 'Intendencia', monto: 28500000, pct: -43 },
  ];
  const rows = areas.map(a => {
    const ok = a.pct <= 0;
    return `<tr>
      <td>${a.nombre}</td>
      <td><strong>${fmtM(a.monto)}</strong></td>
      <td class="${ok ? 'ok' : 'alerta'}">${a.pct > 0 ? '▲ +' : '▼ '}${Math.abs(a.pct)}% ${a.pct > 0 ? '⚠️' : '✅'}</td>
    </tr>`;
  }).join('');
  return `
    <div class="ia-answer-card">
      <div class="ia-answer-title">📊 Gasto Municipal — Agosto 2026</div>
      
      <div class="ia-kpi-row">
        <div class="ia-kpi-box blue">
          <div class="ia-kpi-val">${fmtM(d.ejecutado_agosto)}</div>
          <div class="ia-kpi-lbl">Gasto total agosto</div>
        </div>
        <div class="ia-kpi-box violet">
          <div class="ia-kpi-val">${fmtM(d.total_mensual)}</div>
          <div class="ia-kpi-lbl">Presupuesto mensual</div>
        </div>
        <div class="ia-kpi-box green">
          <div class="ia-kpi-val">${fmtM(d.total_mensual - d.ejecutado_agosto)}</div>
          <div class="ia-kpi-lbl">Margen disponible</div>
        </div>
      </div>
      
      <div class="ia-table-wrap">
        <table class="ia-table">
          <thead><tr><th>Secretaría</th><th>Ejecutado</th><th>vs Presupuesto</th></tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
      
      <div class="ia-insight red">
        ⚠️ <strong>Alerta:</strong> Obras Públicas superó su presupuesto en <strong>18%</strong> — requerir informe de justificación antes del 5 de septiembre.
      </div>
    </div>`;
}

function responderEmpleados() {
  const e = MUNICIPAL_DATA.empleados;
  const areas = Object.entries(e.por_area).sort((a,b) => b[1]-a[1]);
  const rows = areas.map(([area, cant]) => {
    const pct = Math.round(cant / e.total * 100);
    return `<tr><td>${area}</td><td><strong>${cant}</strong></td><td>${pct}%</td></tr>`;
  }).join('');
  return `
    <div class="ia-answer-card">
      <div class="ia-answer-title">👥 Recursos Humanos — Agosto 2026</div>
      
      <div class="ia-kpi-row">
        <div class="ia-kpi-box blue">
          <div class="ia-kpi-val">${fmt(e.total)}</div>
          <div class="ia-kpi-lbl">Total empleados</div>
        </div>
        <div class="ia-kpi-box green">
          <div class="ia-kpi-val">${fmt(e.planta_permanente)}</div>
          <div class="ia-kpi-lbl">Planta permanente</div>
        </div>
        <div class="ia-kpi-box amber">
          <div class="ia-kpi-val">${e.contratados}</div>
          <div class="ia-kpi-lbl">Contratados</div>
        </div>
      </div>
      
      <div class="ia-table-wrap">
        <table class="ia-table">
          <thead><tr><th>Área</th><th>Empleados</th><th>% del total</th></tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
      
      <div class="ia-detail">
        <div class="ia-detail-row">
          <span>Masa salarial mensual</span><strong>$186.000.000</strong>
        </div>
        <div class="ia-detail-row">
          <span>Costo promedio por empleado</span><strong>$149.159</strong>
        </div>
        <div class="ia-detail-row">
          <span>En licencia este mes</span><strong>${e.en_licencia} empleados</strong>
        </div>
        <div class="ia-detail-row">
          <span>Ausentismo</span><strong>${e.ausentismo_pct}% ✅</strong>
        </div>
      </div>
    </div>`;
}

function responderHorasExtra() {
  const e = MUNICIPAL_DATA.empleados;
  const g = MUNICIPAL_DATA.gastos;
  return `
    <div class="ia-answer-card">
      <div class="ia-answer-title">⏱️ Horas Extra — Agosto 2026</div>
      
      <div class="ia-kpi-row">
        <div class="ia-kpi-box red">
          <div class="ia-kpi-val">${fmt(e.horas_extra_mes)}</div>
          <div class="ia-kpi-lbl">Horas extra del mes</div>
        </div>
        <div class="ia-kpi-box amber">
          <div class="ia-kpi-val">${fmtM(g.horas_extra_costo)}</div>
          <div class="ia-kpi-lbl">Costo total</div>
        </div>
        <div class="ia-kpi-box violet">
          <div class="ia-kpi-val">$4.268</div>
          <div class="ia-kpi-lbl">Costo por hora extra</div>
        </div>
      </div>
      
      <div class="ia-insight amber">
        📌 Las horas extra representan el <strong>9.9%</strong> de la masa salarial total. El estándar recomendado es no superar el <strong>5%</strong>.
      </div>
      
      <div class="ia-detail">
        <div class="ia-detail-row">
          <span>Áreas con más horas extra</span><strong>Obras Públicas, Talleres, Salud</strong>
        </div>
        <div class="ia-detail-row">
          <span>Variación vs julio</span><strong class="green">▼ 8% (mejora)</strong>
        </div>
        <div class="ia-detail-row">
          <span>Ahorro potencial (si se normaliza)</span><strong>$9.200.000/mes</strong>
        </div>
      </div>
      
      <div class="ia-insight">
        💡 <strong>Recomendación:</strong> Auditar las áreas con mayor concentración de horas extra y evaluar si se requiere incorporar personal en planta.
      </div>
    </div>`;
}

function responderReclamos() {
  const r = MUNICIPAL_DATA.reclamos;
  const tipos = Object.entries(r.por_tipo).sort((a,b) => b[1]-a[1]);
  const rows = tipos.map(([tipo, cant]) => {
    const pct = Math.round(cant / r.total * 100);
    return `<tr><td>${tipo}</td><td><strong>${cant}</strong></td><td>${pct}%</td></tr>`;
  }).join('');
  return `
    <div class="ia-answer-card">
      <div class="ia-answer-title">🏘️ Reclamos Vecinales — 2026</div>
      
      <div class="ia-kpi-row">
        <div class="ia-kpi-box blue">
          <div class="ia-kpi-val">${r.total}</div>
          <div class="ia-kpi-lbl">Total registrados</div>
        </div>
        <div class="ia-kpi-box red">
          <div class="ia-kpi-val">${r.pendientes}</div>
          <div class="ia-kpi-lbl">Pendientes ⚠️</div>
        </div>
        <div class="ia-kpi-box green">
          <div class="ia-kpi-val">${r.tasa_resolucion}%</div>
          <div class="ia-kpi-lbl">Tasa resolución</div>
        </div>
      </div>
      
      <div class="ia-table-wrap">
        <table class="ia-table">
          <thead><tr><th>Tipo de reclamo</th><th>Cantidad</th><th>%</th></tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
      
      <div class="ia-detail">
        <div class="ia-detail-row">
          <span>Tiempo promedio de resolución</span><strong>${r.tiempo_promedio_dias} días ✅</strong>
        </div>
        <div class="ia-detail-row">
          <span>Zonas más afectadas</span><strong>${r.zonas_criticas.join(', ')}</strong>
        </div>
        <div class="ia-detail-row">
          <span>Reclamos resueltos este mes</span><strong>${r.resueltos}</strong>
        </div>
      </div>
    </div>`;
}

function responderProveedores() {
  const p = MUNICIPAL_DATA.proveedores;
  const rows = p.principales.map(pr => {
    const dias = Math.round((new Date(pr.vence) - new Date()) / 86400000);
    const urgente = dias < 60;
    return `<tr>
      <td>${pr.nombre}</td>
      <td><strong>${fmtK(pr.mensual)}/mes</strong></td>
      <td class="${pr.riesgo === 'Alto' ? 'alerta' : 'ok'}">${pr.riesgo}</td>
      <td class="${urgente ? 'alerta' : ''}">${dias > 0 ? dias + ' días' : 'VENCIDO'}</td>
    </tr>`;
  }).join('');
  return `
    <div class="ia-answer-card">
      <div class="ia-answer-title">🏢 Proveedores Tecnológicos</div>
      
      <div class="ia-kpi-row">
        <div class="ia-kpi-box blue">
          <div class="ia-kpi-val">${p.total_contratos}</div>
          <div class="ia-kpi-lbl">Contratos activos</div>
        </div>
        <div class="ia-kpi-box amber">
          <div class="ia-kpi-val">${fmtM(p.gasto_mensual)}</div>
          <div class="ia-kpi-lbl">Gasto mensual total</div>
        </div>
        <div class="ia-kpi-box green">
          <div class="ia-kpi-val">${fmtM(p.ahorro_detectado)}</div>
          <div class="ia-kpi-lbl">Ahorro detectado/año</div>
        </div>
      </div>
      
      <div class="ia-table-wrap">
        <table class="ia-table">
          <thead><tr><th>Proveedor</th><th>Costo</th><th>Riesgo</th><th>Vence en</th></tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
      
      <div class="ia-insight red">
        🚨 <strong>Urgente:</strong> ${p.vencen_60dias} contratos vencen en los próximos 60 días. Iniciar proceso de renovación o licitación de inmediato.
      </div>
    </div>`;
}

function responderAlertas() {
  const alertas = MUNICIPAL_DATA.alertas;
  const colorMap = { CRITICA: 'red', URGENTE: 'amber', ATENCION: 'blue' };
  const iconMap = { CRITICA: '🚨', URGENTE: '⚠️', ATENCION: '📌' };
  const items = alertas.map(a => `
    <div class="ia-alert-item ${colorMap[a.tipo]}">
      <div class="ia-alert-type">${iconMap[a.tipo]} ${a.tipo}</div>
      <div class="ia-alert-area">${a.area}</div>
      <div class="ia-alert-msg">${a.mensaje}</div>
    </div>`).join('');
  return `
    <div class="ia-answer-card">
      <div class="ia-answer-title">🚨 Alertas Activas — Agosto 2026</div>
      <div class="ia-alerts-list">${items}</div>
      <div class="ia-insight">
        📋 <strong>${alertas.length} alertas activas.</strong> Se recomienda revisar las críticas hoy mismo con los responsables de área.
      </div>
    </div>`;
}

function responderTecnologia() {
  const p = MUNICIPAL_DATA.proveedores;
  const g = MUNICIPAL_DATA.gastos;
  return `
    <div class="ia-answer-card">
      <div class="ia-answer-title">💻 Gasto en Tecnología — Junín 2026</div>
      
      <div class="ia-kpi-row">
        <div class="ia-kpi-box blue">
          <div class="ia-kpi-val">${fmtM(g.tecnologia_mensual)}</div>
          <div class="ia-kpi-lbl">Gasto mensual IT</div>
        </div>
        <div class="ia-kpi-box amber">
          <div class="ia-kpi-val">${fmtM(g.tecnologia_mensual * 12)}</div>
          <div class="ia-kpi-lbl">Proyección anual</div>
        </div>
        <div class="ia-kpi-box green">
          <div class="ia-kpi-val">${fmtM(p.ahorro_detectado)}</div>
          <div class="ia-kpi-lbl">Ahorro posible/año</div>
        </div>
      </div>
      
      <div class="ia-detail">
        <div class="ia-detail-row"><span>Contratos de alto riesgo (salida)</span><strong class="alerta">${p.contratos_alto_riesgo} contratos</strong></div>
        <div class="ia-detail-row"><span>Sistemas sin plan de backup documentado</span><strong class="alerta">4 sistemas</strong></div>
        <div class="ia-detail-row"><span>Licencias Microsoft 365 sin usar</span><strong class="alerta">~40% ociosas</strong></div>
        <div class="ia-detail-row"><span>Ahorro validado (en proceso)</span><strong class="green">${fmtM(p.ahorro_validado)}</strong></div>
      </div>
      
      <div class="ia-insight amber">
        💡 <strong>Oportunidad:</strong> Renegociar contratos de RRHH, Expedientes y Tributaria podría liberar hasta <strong>$15.8M anuales</strong> para otros proyectos.
      </div>
    </div>`;
}

function responderFlota() {
  const f = MUNICIPAL_DATA.flota;
  return `
    <div class="ia-answer-card">
      <div class="ia-answer-title">🚛 Flota Municipal — Estado Actual</div>
      
      <div class="ia-kpi-row">
        <div class="ia-kpi-box blue">
          <div class="ia-kpi-val">${f.total_vehiculos}</div>
          <div class="ia-kpi-lbl">Total vehículos</div>
        </div>
        <div class="ia-kpi-box green">
          <div class="ia-kpi-val">${f.operativos}</div>
          <div class="ia-kpi-lbl">Operativos ✅</div>
        </div>
        <div class="ia-kpi-box red">
          <div class="ia-kpi-val">${f.en_reparacion}</div>
          <div class="ia-kpi-lbl">En reparación</div>
        </div>
      </div>
      
      <div class="ia-detail">
        <div class="ia-detail-row">
          <span>Stock de combustible</span>
          <strong class="${f.combustible_stock_pct < 50 ? 'alerta' : 'ok'}">${f.combustible_stock_pct}% ⚠️</strong>
        </div>
        <div class="ia-detail-row"><span>Kilómetros recorridos este mes</span><strong>${fmt(f.km_mes)} km</strong></div>
        <div class="ia-detail-row"><span>Costo por kilómetro</span><strong>$${fmt(f.costo_km)}</strong></div>
        <div class="ia-detail-row"><span>Costo total movilidad mes</span><strong>${fmtM(f.km_mes * f.costo_km)}</strong></div>
      </div>
      
      <div class="ia-insight red">
        🚨 <strong>Urgente:</strong> Stock de combustible al ${f.combustible_stock_pct}%. Solicitar reposición antes del día 10 para no comprometer operaciones de recolección y obras.
      </div>
    </div>`;
}

function responderInformeEjecutivo() {
  const d = MUNICIPAL_DATA.presupuesto;
  const e = MUNICIPAL_DATA.empleados;
  const r = MUNICIPAL_DATA.reclamos;
  const p = MUNICIPAL_DATA.proveedores;
  return `
    <div class="ia-answer-card">
      <div class="ia-answer-title">📋 Informe Ejecutivo — Municipio de Junín</div>
      <div class="ia-subtitle">Agosto 2026 · Para uso de Intendencia y Hacienda</div>
      
      <div class="ia-section-title">📊 Situación Presupuestaria</div>
      <div class="ia-detail">
        <div class="ia-detail-row"><span>Presupuesto 2026</span><strong>${fmtM(d.total_anual)}</strong></div>
        <div class="ia-detail-row"><span>Ejecutado al 31/08</span><strong>${d.pct_ejecutado}% — ${fmtM(d.total_anual * d.pct_ejecutado / 100)}</strong></div>
        <div class="ia-detail-row highlight"><span>💰 Saldo disponible</span><strong class="green">${fmtM(d.saldo_disponible)}</strong></div>
      </div>
      
      <div class="ia-section-title">👥 Recursos Humanos</div>
      <div class="ia-detail">
        <div class="ia-detail-row"><span>Plantel total</span><strong>${fmt(e.total)} empleados</strong></div>
        <div class="ia-detail-row"><span>Masa salarial</span><strong>$186.000.000/mes</strong></div>
        <div class="ia-detail-row"><span>Horas extra</span><strong class="amber">${fmt(e.horas_extra_mes)} hs — $18.4M</strong></div>
      </div>
      
      <div class="ia-section-title">🏘️ Atención Vecinal</div>
      <div class="ia-detail">
        <div class="ia-detail-row"><span>Reclamos totales</span><strong>${r.total}</strong></div>
        <div class="ia-detail-row"><span>Resueltos</span><strong class="green">${r.resueltos} (${r.tasa_resolucion}%)</strong></div>
        <div class="ia-detail-row"><span>Pendientes</span><strong class="alerta">${r.pendientes} ⚠️</strong></div>
      </div>
      
      <div class="ia-section-title">🚨 Alertas Críticas</div>
      <div class="ia-alerts-mini">
        ${MUNICIPAL_DATA.alertas.filter(a => a.tipo === 'CRITICA').map(a =>
          `<div class="ia-alert-mini red">🚨 ${a.area}: ${a.mensaje}</div>`
        ).join('')}
      </div>
      
      <div class="ia-insight green">
        ✅ <strong>Situación general: ESTABLE.</strong> El municipio opera dentro de parámetros normales. Dos alertas críticas requieren atención inmediata.
      </div>
    </div>`;
}

function responderAhorros() {
  const p = MUNICIPAL_DATA.proveedores;
  const g = MUNICIPAL_DATA.gastos;
  const items = [
    { titulo: 'Renegociar contratos IT de alto riesgo', monto: 8400000, estado: 'Identificado', color: 'blue' },
    { titulo: 'Reducir horas extra a nivel normal (<5%)', monto: 9200000, estado: 'Identificado', color: 'blue' },
    { titulo: 'Licencias Microsoft sin usar (40%)', monto: 1632000, estado: 'Validado', color: 'green' },
    { titulo: 'Migración sistema RRHH a open source', monto: 3600000, estado: 'Validado', color: 'green' },
    { titulo: 'Optimización rutas de combustible', monto: 1200000, estado: 'En proceso', color: 'amber' },
  ];
  const total = items.reduce((s, i) => s + i.monto, 0);
  const rows = items.map(i => `
    <tr>
      <td>${i.titulo}</td>
      <td><strong>${fmtM(i.monto)}</strong></td>
      <td class="${i.estado === 'Validado' ? 'ok' : i.estado === 'Identificado' ? '' : 'amber'}">${i.estado}</td>
    </tr>`).join('');
  return `
    <div class="ia-answer-card">
      <div class="ia-answer-title">💚 Oportunidades de Ahorro — Plan de Choque</div>
      
      <div class="ia-kpi-row">
        <div class="ia-kpi-box green">
          <div class="ia-kpi-val">${fmtM(total)}</div>
          <div class="ia-kpi-lbl">Ahorro total identificado/año</div>
        </div>
        <div class="ia-kpi-box blue">
          <div class="ia-kpi-val">${fmtM(p.ahorro_validado)}</div>
          <div class="ia-kpi-lbl">Validado por Hacienda</div>
        </div>
        <div class="ia-kpi-box amber">
          <div class="ia-kpi-val">$480K</div>
          <div class="ia-kpi-lbl">Ahorro realizado (mes 1)</div>
        </div>
      </div>
      
      <div class="ia-table-wrap">
        <table class="ia-table">
          <thead><tr><th>Oportunidad</th><th>Ahorro anual</th><th>Estado</th></tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
      
      <div class="ia-insight green">
        🎯 <strong>Meta del Plan de Choque:</strong> Lograr ${fmtM(total)} de ahorro anual en 30 días de trabajo. Equivale a financiar <strong>2 meses de salarios</strong> del área de Salud.
      </div>
    </div>`;
}

function responderPresupuesto() {
  const d = MUNICIPAL_DATA.presupuesto;
  const areas = [
    { nombre: 'Educación', asignado: 71000000, ejecutado: 54900000 },
    { nombre: 'Obras Públicas', asignado: 38000000, ejecutado: 44800000 },
    { nombre: 'Salud', asignado: 52000000, ejecutado: 46800000 },
    { nombre: 'Seguridad', asignado: 44000000, ejecutado: 41800000 },
    { nombre: 'Administración', asignado: 39000000, ejecutado: 38200000 },
    { nombre: 'Intendencia', asignado: 50000000, ejecutado: 28500000 },
  ];
  const rows = areas.map(a => {
    const pct = Math.round(a.ejecutado / a.asignado * 100);
    const ok = pct <= 100;
    return `<tr>
      <td>${a.nombre}</td>
      <td>${fmtM(a.asignado)}</td>
      <td><strong>${fmtM(a.ejecutado)}</strong></td>
      <td class="${ok ? 'ok' : 'alerta'}">${pct}% ${ok ? '✅' : '⚠️'}</td>
    </tr>`;
  }).join('');
  return `
    <div class="ia-answer-card">
      <div class="ia-answer-title">📈 Ejecución Presupuestaria — Por Secretaría</div>
      
      <div class="ia-kpi-row">
        <div class="ia-kpi-box blue">
          <div class="ia-kpi-val">${fmtM(d.total_anual)}</div>
          <div class="ia-kpi-lbl">Presupuesto total 2026</div>
        </div>
        <div class="ia-kpi-box amber">
          <div class="ia-kpi-val">${d.pct_ejecutado}%</div>
          <div class="ia-kpi-lbl">Ejecutado al 31/08</div>
        </div>
        <div class="ia-kpi-box green">
          <div class="ia-kpi-val">${fmtM(d.saldo_disponible)}</div>
          <div class="ia-kpi-lbl">Disponible restante</div>
        </div>
      </div>
      
      <div class="ia-table-wrap">
        <table class="ia-table">
          <thead><tr><th>Secretaría</th><th>Asignado</th><th>Ejecutado</th><th>Ejecución</th></tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
    </div>`;
}

// ══════════════════════════════════════════════════════════════
// FUNCIÓN PRINCIPAL — procesar mensaje del usuario
// ══════════════════════════════════════════════════════════════
function procesarMensaje(texto) {
  const lower = texto.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  
  // Buscar intención que mejor coincida
  let mejorIntent = null;
  let mejorScore = 0;
  
  for (const intent of INTENTS) {
    let score = 0;
    for (const kw of intent.keywords) {
      const kwNorm = kw.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
      if (lower.includes(kwNorm)) {
        score += kwNorm.split(' ').length; // frases largas pesan más
      }
    }
    if (score > mejorScore) {
      mejorScore = score;
      mejorIntent = intent;
    }
  }
  
  if (mejorIntent && mejorScore > 0) {
    return mejorIntent.responder();
  }
  
  // Respuesta genérica si no entiende
  return `
    <div class="ia-answer-card">
      <div class="ia-answer-title">🤖 Asistente Municipal</div>
      <p style="color:rgba(148,163,184,0.9); margin-bottom:16px">
        Puedo responder preguntas sobre el municipio. Intentá con alguna de estas consultas:
      </p>
      <div class="ia-suggestions">
        <button class="ia-suggest" onclick="sendQuickQuery('¿Cuánto dinero libre queda para gastar?')">💰 ¿Cuánto dinero libre queda?</button>
        <button class="ia-suggest" onclick="sendQuickQuery('¿Cuántos empleados tiene el municipio?')">👥 ¿Cuántos empleados hay?</button>
        <button class="ia-suggest" onclick="sendQuickQuery('¿Cuáles son las alertas críticas?')">🚨 ¿Cuáles son las alertas?</button>
        <button class="ia-suggest" onclick="sendQuickQuery('Dame el informe ejecutivo completo')">📋 Informe ejecutivo</button>
        <button class="ia-suggest" onclick="sendQuickQuery('¿Cuántos reclamos de vecinos hay pendientes?')">🏘️ Reclamos vecinos</button>
        <button class="ia-suggest" onclick="sendQuickQuery('¿Cuáles son las oportunidades de ahorro?')">💚 Oportunidades de ahorro</button>
      </div>
    </div>`;
}

// ══════════════════════════════════════════════════════════════
// ESTILOS PARA LAS RESPUESTAS IA
// ══════════════════════════════════════════════════════════════
function injectIAStyles() {
  if (document.getElementById('ia-dynamic-styles')) return;
  const style = document.createElement('style');
  style.id = 'ia-dynamic-styles';
  style.textContent = `
    .ia-answer-card { padding: 4px 0; }
    .ia-answer-title { font-size: 16px; font-weight: 800; font-family: 'Outfit', sans-serif; margin-bottom: 4px; color: #f0f4ff; }
    .ia-subtitle { font-size: 12px; color: rgba(148,163,184,0.7); margin-bottom: 16px; }
    .ia-section-title { font-size: 12px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.8px; color: rgba(59,130,246,0.8); margin: 16px 0 8px; }
    
    .ia-kpi-row { display: flex; gap: 10px; margin: 14px 0; flex-wrap: wrap; }
    .ia-kpi-box { flex: 1; min-width: 90px; background: rgba(255,255,255,0.04); border: 1px solid rgba(255,255,255,0.08); border-radius: 10px; padding: 12px; text-align: center; }
    .ia-kpi-box.blue { border-color: rgba(59,130,246,0.25); background: rgba(59,130,246,0.06); }
    .ia-kpi-box.green { border-color: rgba(16,185,129,0.25); background: rgba(16,185,129,0.06); }
    .ia-kpi-box.amber { border-color: rgba(245,158,11,0.25); background: rgba(245,158,11,0.06); }
    .ia-kpi-box.red { border-color: rgba(239,68,68,0.25); background: rgba(239,68,68,0.06); }
    .ia-kpi-box.violet { border-color: rgba(139,92,246,0.25); background: rgba(139,92,246,0.06); }
    .ia-kpi-val { font-size: 20px; font-weight: 800; font-family: 'Outfit', sans-serif; color: #f0f4ff; line-height: 1; margin-bottom: 4px; }
    .ia-kpi-lbl { font-size: 10px; color: rgba(148,163,184,0.7); font-weight: 500; }
    
    .ia-table-wrap { margin: 12px 0; overflow-x: auto; }
    .ia-table { width: 100%; border-collapse: collapse; font-size: 12px; }
    .ia-table th { text-align: left; font-size: 10px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.5px; color: rgba(100,116,139,0.8); padding: 6px 10px; border-bottom: 1px solid rgba(255,255,255,0.07); }
    .ia-table td { padding: 8px 10px; border-bottom: 1px solid rgba(255,255,255,0.04); color: rgba(148,163,184,0.9); }
    .ia-table tr:hover td { background: rgba(255,255,255,0.02); }
    .ia-table .alerta { color: #f59e0b; font-weight: 700; }
    .ia-table .ok { color: #10b981; font-weight: 700; }
    .ia-table .amber { color: #f59e0b; }
    
    .ia-detail { background: rgba(255,255,255,0.02); border-radius: 10px; overflow: hidden; margin: 12px 0; }
    .ia-detail-row { display: flex; justify-content: space-between; align-items: center; padding: 9px 14px; border-bottom: 1px solid rgba(255,255,255,0.04); font-size: 13px; }
    .ia-detail-row:last-child { border-bottom: none; }
    .ia-detail-row span { color: rgba(148,163,184,0.8); }
    .ia-detail-row strong { color: #f0f4ff; }
    .ia-detail-row.highlight { background: rgba(59,130,246,0.06); }
    .ia-detail-row .green { color: #10b981; }
    .ia-detail-row .alerta { color: #f59e0b; }
    
    .ia-insight { background: rgba(59,130,246,0.08); border: 1px solid rgba(59,130,246,0.2); border-radius: 10px; padding: 12px 14px; font-size: 12px; line-height: 1.6; color: rgba(148,163,184,0.9); margin-top: 12px; }
    .ia-insight.red { background: rgba(239,68,68,0.08); border-color: rgba(239,68,68,0.2); }
    .ia-insight.amber { background: rgba(245,158,11,0.08); border-color: rgba(245,158,11,0.2); }
    .ia-insight.green { background: rgba(16,185,129,0.08); border-color: rgba(16,185,129,0.2); }
    
    .ia-alerts-list { display: flex; flex-direction: column; gap: 8px; margin: 12px 0; }
    .ia-alert-item { border-radius: 10px; padding: 12px 14px; }
    .ia-alert-item.red { background: rgba(239,68,68,0.08); border: 1px solid rgba(239,68,68,0.2); }
    .ia-alert-item.amber { background: rgba(245,158,11,0.08); border: 1px solid rgba(245,158,11,0.2); }
    .ia-alert-item.blue { background: rgba(59,130,246,0.08); border: 1px solid rgba(59,130,246,0.2); }
    .ia-alert-type { font-size: 10px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.8px; margin-bottom: 2px; }
    .ia-alert-item.red .ia-alert-type { color: #ef4444; }
    .ia-alert-item.amber .ia-alert-type { color: #f59e0b; }
    .ia-alert-item.blue .ia-alert-type { color: #3b82f6; }
    .ia-alert-area { font-size: 13px; font-weight: 700; color: #f0f4ff; }
    .ia-alert-msg { font-size: 12px; color: rgba(148,163,184,0.8); margin-top: 2px; }
    .ia-alerts-mini { display: flex; flex-direction: column; gap: 6px; margin: 8px 0; }
    .ia-alert-mini { font-size: 12px; padding: 8px 12px; border-radius: 8px; }
    .ia-alert-mini.red { background: rgba(239,68,68,0.08); border: 1px solid rgba(239,68,68,0.2); color: rgba(239,68,68,0.9); }
    
    .ia-suggestions { display: flex; flex-direction: column; gap: 8px; margin-top: 8px; }
    .ia-suggest { background: rgba(59,130,246,0.08); border: 1px solid rgba(59,130,246,0.2); color: rgba(148,163,184,0.9); padding: 10px 14px; border-radius: 8px; text-align: left; cursor: pointer; font-size: 13px; transition: all 0.2s; }
    .ia-suggest:hover { background: rgba(59,130,246,0.15); color: white; transform: translateX(4px); }
  `;
  document.head.appendChild(style);
}

// Inicializar estilos
injectIAStyles();

// Exportar función principal
window.procesarMensajeIA = procesarMensaje;
window.MUNICIPAL_DATA = MUNICIPAL_DATA;
