// ============================================================
// data-connector.js — Conector Universal de Datos
// PostgreSQL + Excel/CSV + API REST + Demo fallback
// Sprint 2 — Municipalidad de Junín
// ============================================================

'use strict';

const express = require('express');
const router  = express.Router();
const db      = require('../db/connection');

// ── DATOS DEMO (cuando no hay DB real) ────────────────────────
const DEMO_METRICS = {
  presupuesto: {
    anual_total: 3720000000,
    ejecutado_ytd: 2678400000,
    ejecutado_pct: 72,
    gasto_agosto: 284500000,
    presupuesto_agosto: 310000000,
    saldo_disponible: 1085000000,
    margen_mensual: 25500000,
    meses_restantes: 4,
    alerta: false,
  },
  gastos: {
    masa_salarial: 186000000,
    horas_extra_costo: 18400000,
    combustible: 9100000,
    mantenimiento: 4200000,
    tecnologia: 3500000,
    otros: 63300000,
  },
  empleados: {
    total: 1247,
    activos: 1200,
    licencias: 47,
    horas_extra_mes: 4312,
    ausentismo_pct: 3.1,
    por_area: {
      'Obras Públicas': 214,
      'Educación': 302,
      'Salud': 198,
      'Seguridad': 187,
      'Administración': 143,
      'Talleres': 89,
      'Otros': 114,
    },
  },
  reclamos: {
    total: 318,
    pendientes: 89,
    resueltos: 229,
    en_proceso: 0,
    tiempo_promedio_dias: 3.2,
    satisfaccion_pct: 84,
    por_tipo: {
      'Baches y Pavimento': 108,
      'Alumbrado Público': 64,
      'Recolección de Basura': 57,
      'Poda de Árboles': 34,
      'Agua y Cloacas': 31,
      'Ruidos Molestos': 14,
      'Otros': 10,
    },
  },
  secretarias: [
    { nombre: 'Obras Públicas',    presupuesto: 38000000, ejecutado: 44800000, pct: 118, alerta: true  },
    { nombre: 'Educación',         presupuesto: 61000000, ejecutado: 54900000, pct:  90, alerta: false },
    { nombre: 'Salud',             presupuesto: 52000000, ejecutado: 46800000, pct:  90, alerta: false },
    { nombre: 'Seguridad',         presupuesto: 44000000, ejecutado: 41800000, pct:  95, alerta: false },
    { nombre: 'Talleres',          presupuesto: 12000000, ejecutado: 13400000, pct: 112, alerta: true  },
    { nombre: 'Est. de Servicios', presupuesto:  8000000, ejecutado:  9100000, pct: 114, alerta: true  },
  ],
  ahorros: [
    { categoria: 'Contratos IT duplicados', monto: 6120000, estado: 'detectado', prioridad: 'alta' },
    { categoria: 'Horas extra optimización', monto: 4800000, estado: 'en análisis', prioridad: 'alta' },
    { categoria: 'Combustible control GPS',  monto: 2400000, estado: 'propuesto',  prioridad: 'media' },
    { categoria: 'Licitaciones unificadas',  monto: 1560000, estado: 'propuesto',  prioridad: 'media' },
    { categoria: 'Outsourcing limpieza',     monto: 920000,  estado: 'evaluando',  prioridad: 'baja'  },
  ],
  alertas: [
    { id: 'A001', tipo: 'critica',  titulo: 'Contrato GovTech VENCIDO',          detalle: 'Sistema de expedientes sin contrato vigente desde 15/08', area: 'IT'           },
    { id: 'A002', tipo: 'alta',     titulo: 'Obras Públicas +18% presupuesto',   detalle: '$6.8M sobre el límite mensual asignado',                  area: 'Obras'         },
    { id: 'A003', tipo: 'alta',     titulo: 'Combustible al 48% de stock',       detalle: 'Reponer antes del 15/09 para evitar paralización de flota', area: 'Talleres'     },
    { id: 'A004', tipo: 'media',    titulo: 'Antivirus vence en 61 días',        detalle: 'Contrato Sistemas Nexo SA vence 30/09/2026',               area: 'IT'           },
    { id: 'A005', tipo: 'media',    titulo: '89 reclamos sin resolver',          detalle: '12 llevan más de 7 días sin atención',                    area: 'Vecinos'       },
  ],
};

// ── MÉTRICAS GENERALES (dashboard) ───────────────────────────
router.get('/metrics', async (req, res) => {
  try {
    // Intentar desde DB real
    if (db && !db.isInMemory()) {
      const metrics = await getMetricsFromDB();
      return res.json({ ok: true, source: 'postgresql', data: metrics });
    }
    // Fallback demo
    res.json({ ok: true, source: 'demo', data: DEMO_METRICS });
  } catch (err) {
    res.json({ ok: true, source: 'demo', data: DEMO_METRICS, warning: err.message });
  }
});

// ── SECRETARÍAS (para gráficos) ───────────────────────────────
router.get('/secretarias', async (req, res) => {
  try {
    if (db && !db.isInMemory()) {
      const rows = await db.query('SELECT nombre, presupuesto_mensual, ejecutado_mes FROM secretarias ORDER BY nombre');
      return res.json({ ok: true, source: 'postgresql', data: rows.rows });
    }
    res.json({ ok: true, source: 'demo', data: DEMO_METRICS.secretarias });
  } catch (err) {
    res.json({ ok: true, source: 'demo', data: DEMO_METRICS.secretarias });
  }
});

// ── EMPLEADOS STATS ───────────────────────────────────────────
router.get('/empleados/stats', async (req, res) => {
  try {
    if (db && !db.isInMemory()) {
      const total     = await db.query('SELECT COUNT(*) FROM empleados WHERE activo=true');
      const por_area  = await db.query('SELECT area, COUNT(*) as cantidad FROM empleados GROUP BY area ORDER BY cantidad DESC');
      return res.json({ ok: true, source: 'postgresql', data: { total: total.rows[0].count, por_area: por_area.rows } });
    }
    res.json({ ok: true, source: 'demo', data: DEMO_METRICS.empleados });
  } catch (err) {
    res.json({ ok: true, source: 'demo', data: DEMO_METRICS.empleados });
  }
});

// ── ALERTAS ACTIVAS ───────────────────────────────────────────
router.get('/alertas', async (req, res) => {
  try {
    if (db && !db.isInMemory()) {
      const rows = await db.query('SELECT * FROM alertas WHERE activa=true ORDER BY prioridad, created_at DESC LIMIT 20');
      return res.json({ ok: true, source: 'postgresql', data: rows.rows });
    }
    res.json({ ok: true, source: 'demo', data: DEMO_METRICS.alertas });
  } catch (err) {
    res.json({ ok: true, source: 'demo', data: DEMO_METRICS.alertas });
  }
});

// ── IMPORTAR DATOS DESDE JSON (resultado del parser de archivos) ──
router.post('/import', async (req, res) => {
  const { tipo, datos, fuente } = req.body;
  if (!tipo || !datos) return res.status(400).json({ error: 'Faltan parámetros: tipo, datos' });

  // Validar tipos permitidos
  const tiposPermitidos = ['empleados', 'presupuesto', 'reclamos', 'contratos', 'secretarias'];
  if (!tiposPermitidos.includes(tipo)) {
    return res.status(400).json({ error: `Tipo inválido. Valores permitidos: ${tiposPermitidos.join(', ')}` });
  }

  try {
    if (db && !db.isInMemory()) {
      // Importar a la tabla correspondiente
      const imported = await importToTable(tipo, datos);
      return res.json({
        ok: true,
        source: 'postgresql',
        tipo,
        importados: imported.length,
        fuente: fuente || 'manual',
        timestamp: new Date().toISOString(),
      });
    }
    // Modo demo: simular importación
    res.json({
      ok: true,
      source: 'demo',
      tipo,
      importados: Array.isArray(datos) ? datos.length : 1,
      fuente: fuente || 'manual',
      mensaje: 'Datos procesados en modo demo. Conectar PostgreSQL para persistencia real.',
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── TEST CONEXIÓN DB ──────────────────────────────────────────
router.get('/db-status', async (req, res) => {
  try {
    if (db && !db.isInMemory()) {
      await db.query('SELECT 1');
      return res.json({
        ok: true,
        connected: true,
        type: 'postgresql',
        message: 'Base de datos PostgreSQL conectada correctamente',
      });
    }
    res.json({
      ok: true,
      connected: false,
      type: 'demo',
      message: 'Modo demo activo. Configura DATABASE_URL en .env para conectar PostgreSQL.',
    });
  } catch (err) {
    res.json({ ok: false, connected: false, error: err.message });
  }
});

// ── FUNCIONES INTERNAS ────────────────────────────────────────

async function getMetricsFromDB() {
  const [presupuestoQ, empleadosQ, reclamosQ] = await Promise.all([
    db.query('SELECT SUM(presupuesto_anual) as total, SUM(ejecutado_ytd) as ejecutado FROM secretarias'),
    db.query('SELECT COUNT(*) as total FROM empleados WHERE activo=true'),
    db.query('SELECT COUNT(*) as total, estado FROM reclamos GROUP BY estado'),
  ]);
  const presupuesto = presupuestoQ.rows[0];
  const totalEmpleados = empleadosQ.rows[0].total;
  const reclamosPorEstado = Object.fromEntries(reclamosQ.rows.map(r => [r.estado, parseInt(r.count)]));
  return {
    presupuesto: {
      anual_total: parseInt(presupuesto.total) || DEMO_METRICS.presupuesto.anual_total,
      ejecutado_ytd: parseInt(presupuesto.ejecutado) || DEMO_METRICS.presupuesto.ejecutado_ytd,
      ejecutado_pct: presupuesto.total ? Math.round(presupuesto.ejecutado / presupuesto.total * 100) : 72,
      saldo_disponible: (presupuesto.total - presupuesto.ejecutado) || DEMO_METRICS.presupuesto.saldo_disponible,
    },
    empleados: { total: parseInt(totalEmpleados) || DEMO_METRICS.empleados.total },
    reclamos: {
      total: Object.values(reclamosPorEstado).reduce((a,b)=>a+b,0),
      pendientes: reclamosPorEstado['pendiente'] || 0,
      resueltos:  reclamosPorEstado['resuelto']  || 0,
    },
    alertas: DEMO_METRICS.alertas,
    ahorros: DEMO_METRICS.ahorros,
    secretarias: DEMO_METRICS.secretarias,
    gastos: DEMO_METRICS.gastos,
  };
}

async function importToTable(tipo, datos) {
  if (!Array.isArray(datos)) datos = [datos];
  const results = [];
  for (const row of datos) {
    try {
      switch (tipo) {
        case 'empleados':
          await db.query(
            'INSERT INTO empleados (nombre, area, cargo, activo) VALUES ($1,$2,$3,true) ON CONFLICT (nombre) DO UPDATE SET area=$2, cargo=$3',
            [row.nombre || row.NOMBRE, row.area || row.AREA, row.cargo || row.CARGO]
          );
          break;
        case 'reclamos':
          await db.query(
            'INSERT INTO reclamos (vecino, tipo, direccion, estado) VALUES ($1,$2,$3,$4)',
            [row.vecino || row.VECINO, row.tipo || row.TIPO, row.direccion || row.DIRECCION, 'pendiente']
          );
          break;
        default:
          // Para otros tipos, guardar como JSON en tabla genérica
          await db.query(
            'INSERT INTO datos_importados (tipo, datos, importado_en) VALUES ($1,$2,NOW())',
            [tipo, JSON.stringify(row)]
          );
      }
      results.push({ ok: true, row });
    } catch (err) {
      results.push({ ok: false, row, error: err.message });
    }
  }
  return results;
}

module.exports = router;
