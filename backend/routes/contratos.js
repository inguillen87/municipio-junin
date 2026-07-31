// ============================================================
// routes/contratos.js — CRUD Contratos
// GET    /api/contratos
// POST   /api/contratos
// PUT    /api/contratos/:id
// DELETE /api/contratos/:id
// ============================================================
const express = require('express');
const { v4: uuidv4 } = require('uuid');
const { requireAuth } = require('../middleware/auth');
const db = require('../db/connection');

const router = express.Router();

// Datos en memoria
let CONTRATOS = [
  { id:'c1', proveedor:'Sistemas Nexo SA',    cuit:'30-71234567-1', sistema:'Gestión RRHH y Liquidación',    categoria:'Software y Licencias',    mensual:680000,  vencimiento:'2026-09-01', responsable:'D. Álvarez', datosPropios:'No',      riesgo:'Alto',  sla:true,  backup:false },
  { id:'c2', proveedor:'GovTech Solutions',    cuit:'30-68901234-5', sistema:'Expedientes Digitales',          categoria:'Software y Licencias',    mensual:420000,  vencimiento:'2026-08-15', responsable:'M. Ríos',    datosPropios:'Parcial', riesgo:'Alto',  sla:true,  backup:true  },
  { id:'c3', proveedor:'Telecom Argentina',    cuit:'30-64473710-2', sistema:'Internet 200Mbps',               categoria:'Conectividad',            mensual:380000,  vencimiento:'2026-12-01', responsable:'C. Torres',  datosPropios:'Si',      riesgo:'Bajo',  sla:true,  backup:true  },
  { id:'c4', proveedor:'Microsoft Argentina',  cuit:'30-67621671-3', sistema:'Microsoft 365 — 120 licencias', categoria:'Software y Licencias',    mensual:340000,  vencimiento:'2026-12-31', responsable:'D. Álvarez', datosPropios:'Si',      riesgo:'Medio', sla:true,  backup:true  },
  { id:'c5', proveedor:'ControlGas SRL',       cuit:'30-66543210-7', sistema:'Control de Combustible',         categoria:'Software y Licencias',    mensual:210000,  vencimiento:'2026-10-01', responsable:'R. Gómez',   datosPropios:'No',      riesgo:'Alto',  sla:false, backup:false },
  { id:'c6', proveedor:'Sipem Sistemas',        cuit:'30-65432109-4', sistema:'Gestión Tributaria',             categoria:'Software y Licencias',    mensual:520000,  vencimiento:'2027-03-01', responsable:'L. Pacheco', datosPropios:'Parcial', riesgo:'Alto',  sla:true,  backup:true  },
];

router.get('/', requireAuth, async (req, res) => {
  try {
    if (!db.isInMemory()) {
      const r = await db.query(`
        SELECT c.*, p.razon_social as proveedor_nombre
        FROM contratos c LEFT JOIN proveedores p ON c.proveedor_id = p.id
        ORDER BY c.costo_mensual DESC
      `);
      return res.json({ ok: true, count: r.rows.length, contratos: r.rows });
    }
    const { riesgo, vencen } = req.query;
    let data = [...CONTRATOS];
    if (riesgo) data = data.filter(c => c.riesgo === riesgo);
    if (vencen) {
      const dias = parseInt(vencen);
      data = data.filter(c => {
        const d = Math.round((new Date(c.vencimiento) - new Date()) / 86400000);
        return d >= 0 && d <= dias;
      });
    }
    res.json({ ok: true, count: data.length, contratos: data });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/', requireAuth, async (req, res) => {
  const { proveedor, cuit, sistema, categoria, mensual, vencimiento, responsable, riesgo } = req.body;
  if (!proveedor || !mensual) return res.status(400).json({ error: 'proveedor y mensual son requeridos' });
  try {
    if (!db.isInMemory()) {
      const r = await db.query(
        `INSERT INTO contratos (sistema, categoria, costo_mensual, vencimiento, responsable)
         VALUES ($1,$2,$3,$4,$5) RETURNING *`,
        [sistema, categoria, mensual, vencimiento, responsable]
      );
      return res.status(201).json({ ok: true, contrato: r.rows[0] });
    }
    const nuevo = { id: uuidv4(), proveedor, cuit, sistema, categoria, mensual: parseFloat(mensual), vencimiento, responsable, riesgo: riesgo || 'Medio', datosPropios: 'Parcial', sla: false, backup: false };
    CONTRATOS.push(nuevo);
    res.status(201).json({ ok: true, contrato: nuevo });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.put('/:id', requireAuth, async (req, res) => {
  const idx = CONTRATOS.findIndex(c => c.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'No encontrado' });
  CONTRATOS[idx] = { ...CONTRATOS[idx], ...req.body };
  res.json({ ok: true, contrato: CONTRATOS[idx] });
});

router.delete('/:id', requireAuth, async (req, res) => {
  const idx = CONTRATOS.findIndex(c => c.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'No encontrado' });
  CONTRATOS.splice(idx, 1);
  res.json({ ok: true });
});

module.exports = router;
