// ============================================================
// data-connector.js — Conector Universal de Datos
// PostgreSQL + Excel/CSV + API REST; sin respaldo sintético.
// Sprint 2 — Municipalidad de Junín
// ============================================================

'use strict';

const express = require('express');
const router  = express.Router();
const db      = require('../db/connection');
const { authenticate, requireRole, requireLegacyTenantBinding } = require('../middleware/authMiddleware');

router.use(authenticate, requireLegacyTenantBinding);

router.get(['/metrics', '/secretarias', '/empleados/stats', '/alertas'], (req, res) => {
  return res.status(410).json({
    ok: false,
    code: 'LEGACY_ANALYTICS_READ_RETIRED',
    error: 'Lectura legacy retirada hasta contar con contratos tenant-bound y permisos por finalidad.',
  });
});

// ── MÉTRICAS GENERALES (dashboard) ───────────────────────────
router.get('/metrics', async (req, res) => {
  try {
    // Intentar desde DB real
    if (db && !db.isUnavailable()) {
      const metrics = await getMetricsFromDB();
      return res.json({ ok: true, source: 'postgresql', data: metrics });
    }
    return res.status(503).json({ ok: false, source: 'unavailable', error: 'Fuente PostgreSQL no conectada' });
  } catch (err) {
    res.status(503).json({ ok: false, source: 'unavailable', error: 'No fue posible consultar la fuente' });
  }
});

// ── SECRETARÍAS (para gráficos) ───────────────────────────────
router.get('/secretarias', async (req, res) => {
  try {
    if (db && !db.isUnavailable()) {
      const rows = await db.query('SELECT nombre, presupuesto_mensual, ejecutado_mes FROM secretarias ORDER BY nombre');
      return res.json({ ok: true, source: 'postgresql', data: rows.rows });
    }
    return res.status(503).json({ ok: false, source: 'unavailable', error: 'Fuente PostgreSQL no conectada' });
  } catch (err) {
    res.status(503).json({ ok: false, source: 'unavailable', error: 'No fue posible consultar la fuente' });
  }
});

// ── EMPLEADOS STATS ───────────────────────────────────────────
router.get('/empleados/stats', async (req, res) => {
  try {
    if (db && !db.isUnavailable()) {
      const total     = await db.query('SELECT COUNT(*) FROM empleados WHERE activo=true');
      const por_area  = await db.query('SELECT area, COUNT(*) as cantidad FROM empleados GROUP BY area ORDER BY cantidad DESC');
      return res.json({ ok: true, source: 'postgresql', data: { total: total.rows[0].count, por_area: por_area.rows } });
    }
    return res.status(503).json({ ok: false, source: 'unavailable', error: 'Fuente PostgreSQL no conectada' });
  } catch (err) {
    res.status(503).json({ ok: false, source: 'unavailable', error: 'No fue posible consultar la fuente' });
  }
});

// ── ALERTAS ACTIVAS ───────────────────────────────────────────
router.get('/alertas', async (req, res) => {
  try {
    if (db && !db.isUnavailable()) {
      const rows = await db.query('SELECT * FROM alertas WHERE activa=true ORDER BY prioridad, created_at DESC LIMIT 20');
      return res.json({ ok: true, source: 'postgresql', data: rows.rows });
    }
    return res.status(503).json({ ok: false, source: 'unavailable', error: 'Fuente PostgreSQL no conectada' });
  } catch (err) {
    res.status(503).json({ ok: false, source: 'unavailable', error: 'No fue posible consultar la fuente' });
  }
});

// ── IMPORTAR DATOS DESDE JSON (resultado del parser de archivos) ──
router.post('/import', requireRole('TENANT_ADMIN'), async (req, res) => {
  return res.status(410).json({
    ok: false,
    error: 'Importador Express legacy retirado; use el flujo canónico, validado y atómico de la plataforma.',
  });
});

// ── TEST CONEXIÓN DB ──────────────────────────────────────────
router.get('/db-status', requireRole('TENANT_ADMIN'), async (req, res) => {
  try {
    if (db && !db.isUnavailable()) {
      await db.query('SELECT 1');
      return res.json({
        ok: true,
        connected: true,
        type: 'postgresql',
        message: 'Base de datos PostgreSQL conectada correctamente',
      });
    }
    return res.status(503).json({
      ok: false,
      connected: false,
      type: 'unavailable',
      message: 'Fuente PostgreSQL no conectada.',
    });
  } catch {
    return res.status(503).json({
      ok: false,
      connected: false,
      type: 'unavailable',
      message: 'No fue posible verificar la fuente PostgreSQL.',
    });
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
      anual_total: presupuesto.total == null ? null : Number(presupuesto.total),
      ejecutado_ytd: presupuesto.ejecutado == null ? null : Number(presupuesto.ejecutado),
      ejecutado_pct: presupuesto.total ? Math.round(Number(presupuesto.ejecutado) / Number(presupuesto.total) * 100) : null,
      saldo_disponible: presupuesto.total == null || presupuesto.ejecutado == null ? null : Number(presupuesto.total) - Number(presupuesto.ejecutado),
    },
    empleados: { total: Number(totalEmpleados) },
    reclamos: {
      total: Object.values(reclamosPorEstado).reduce((a,b)=>a+b,0),
      pendientes: reclamosPorEstado['pendiente'] || 0,
      resueltos:  reclamosPorEstado['resuelto']  || 0,
    },
    alertas: [],
    ahorros: [],
    secretarias: [],
    gastos: null,
    dataStatus: 'source-backed-partial',
  };
}

module.exports = router;
