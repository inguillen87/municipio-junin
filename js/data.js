// ============================================================
// DATA.JS — Datos municipales simulados para Junín 2026
// En producción estos vendrán de la API / PostgreSQL
// ============================================================

const MUNICIPIO_DATA = {
  // -- SECRETARÍAS --
  secretarias: [
    { id: 'salud',       nombre: 'Salud',              color: '#10b981', empleados: 187, presupuesto: 52000000, ejecutado: 46800000 },
    { id: 'obras',       nombre: 'Obras Públicas',     color: '#ef4444', empleados: 214, presupuesto: 38000000, ejecutado: 44840000 },
    { id: 'educacion',   nombre: 'Educación',          color: '#3b82f6', empleados: 302, presupuesto: 61000000, ejecutado: 54900000 },
    { id: 'seguridad',   nombre: 'Seguridad',          color: '#f59e0b', empleados: 178, presupuesto: 44000000, ejecutado: 41800000 },
    { id: 'hacienda',    nombre: 'Hacienda',           color: '#8b5cf6', empleados:  89, presupuesto: 28000000, ejecutado: 24640000 },
    { id: 'ambiente',    nombre: 'Medio Ambiente',     color: '#06b6d4', empleados:  96, presupuesto: 22000000, ejecutado: 19800000 },
    { id: 'cultura',     nombre: 'Cultura y Turismo',  color: '#ec4899', empleados:  74, presupuesto: 15000000, ejecutado: 13350000 },
    { id: 'intendencia', nombre: 'Intendencia',        color: '#f97316', empleados: 107, presupuesto: 50000000, ejecutado: 28500000 },
  ],

  // -- GASTOS MENSUALES 2026 (en millones $) --
  gastosAnuales: {
    labels: ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago'],
    gasto:        [231, 248, 262, 255, 271, 278, 289, 284],
    presupuesto:  [300, 300, 300, 305, 305, 310, 310, 310],
  },

  // -- HORAS EXTRA POR ÁREA (agosto 2026) --
  horasExtra: [
    { area: 'Obras Públicas',  horas: 980, costo: 4900000 },
    { area: 'Salud',           horas: 754, costo: 3770000 },
    { area: 'Seguridad',       horas: 612, costo: 3060000 },
    { area: 'Talleres',        horas: 520, costo: 2080000 },
    { area: 'Educación',       horas: 441, costo: 2205000 },
    { area: 'Planta Recicl.',  horas: 320, costo: 1280000 },
    { area: 'Est. Servicios',  horas: 280, costo: 1120000 },
    { area: 'Medio Ambiente',  horas: 220, costo: 880000  },
  ],

  // -- ALERTAS PRESUPUESTARIAS --
  alertas: [
    { secretaria: 'Obras Públicas', presupuesto: 38000000, ejecutado: 44840000, desvio: '+18%', estado: 'critical' },
    { secretaria: 'Salud',          presupuesto: 52000000, ejecutado: 46800000, desvio: '-10%', estado: 'ok' },
    { secretaria: 'Educación',      presupuesto: 61000000, ejecutado: 54900000, desvio: '-10%', estado: 'ok' },
    { secretaria: 'Seguridad',      presupuesto: 44000000, ejecutado: 41800000, desvio: '-5%',  estado: 'ok' },
    { secretaria: 'Talleres',       presupuesto: 12000000, ejecutado: 13440000, desvio: '+12%', estado: 'warning' },
    { secretaria: 'Est. Servicios', presupuesto:  8000000, ejecutado:  9120000, desvio: '+14%', estado: 'warning' },
  ],

  // -- ESTADO DE ENTIDADES --
  entidades: [
    { nombre: 'Jardines de Infantes', emoji: '🌳', progreso: 15, color: '#10b981' },
    { nombre: 'Talleres Municipales', emoji: '🔧', progreso: 22, color: '#f59e0b' },
    { nombre: 'Est. de Servicios',    emoji: '⛽', progreso: 10, color: '#3b82f6' },
    { nombre: 'Planta de Reciclaje',  emoji: '♻️', progreso: 18, color: '#06b6d4' },
    { nombre: 'Atención Vecinal',     emoji: '🏘️', progreso: 45, color: '#8b5cf6' },
    { nombre: 'RRHH Digital',         emoji: '👥', progreso: 68, color: '#ec4899' },
  ],

  // -- ACTIVIDAD RECIENTE --
  actividad: [
    { texto: '<strong>Nómina agosto</strong> generada y enviada a Banco Provincia', tiempo: 'Hace 12 min', color: '#10b981' },
    { texto: '<strong>Alerta presupuestaria</strong>: Obras Públicas superó el límite mensual', tiempo: 'Hace 1 hora', color: '#ef4444' },
    { texto: '<strong>43 reclamos vecinos</strong> procesados y derivados a las áreas correspondientes', tiempo: 'Hace 2 horas', color: '#3b82f6' },
    { texto: '<strong>Backup automático</strong> completado — todos los sistemas operativos', tiempo: 'Hace 4 horas', color: '#8b5cf6' },
    { texto: '<strong>Nuevo empleado</strong> incorporado: Legajo 5892 — Área Salud', tiempo: 'Hace 6 horas', color: '#f59e0b' },
    { texto: '<strong>Informe mensual</strong> de reciclaje generado automáticamente', tiempo: 'Ayer 18:30', color: '#06b6d4' },
  ],
};
