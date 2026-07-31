// ============================================================
// routes/reclamos.js — CRUD Reclamos Vecinos
// ============================================================
const express = require('express');
const { v4: uuidv4 } = require('uuid');
const { requireAuth } = require('../middleware/auth');
const db = require('../db/connection');

const router = express.Router();

let RECLAMOS = [
  { id:'r1', numero:1001, vecinoDni:'28456789', vecinoNombre:'Juan García',    tipo:'Baches y Pavimento',   area:'Obras Públicas',    direccion:'Av. Rivadavia 1200', estado:'Pendiente',  prioridad:'Alta',   creadoEn:'2026-07-28' },
  { id:'r2', numero:1002, vecinoDni:'31234567', vecinoNombre:'Ana López',       tipo:'Alumbrado Público',    area:'Alumbrado',           direccion:'Calle Mitre 450',    estado:'En proceso', prioridad:'Normal', creadoEn:'2026-07-27' },
  { id:'r3', numero:1003, vecinoDni:'25678901', vecinoNombre:'Luis Martínez',   tipo:'Recolección de Basura', area:'Servicios Urbanos',  direccion:'San Martín 890',    estado:'Resuelto',   prioridad:'Normal', creadoEn:'2026-07-25' },
  { id:'r4', numero:1004, vecinoDni:'29012345', vecinoNombre:'Carmen Pérez',   tipo:'Poda de Árboles',      area:'Medio Ambiente',      direccion:'Belgrano 340',       estado:'Pendiente',  prioridad:'Baja',   creadoEn:'2026-07-24' },
  { id:'r5', numero:1005, vecinoDni:'32456789', vecinoNombre:'Roberto Silva',  tipo:'Agua y Cloacas',       area:'Obras Públicas',    direccion:'9 de Julio 120',     estado:'En proceso', prioridad:'Alta',   creadoEn:'2026-07-23' },
];

router.get('/', requireAuth, async (req, res) => {
  try {
    if (!db.isInMemory()) {
      const r = await db.query('SELECT * FROM reclamos ORDER BY creado_en DESC LIMIT 100');
      return res.json({ ok: true, count: r.rows.length, reclamos: r.rows });
    }
    const { estado, tipo } = req.query;
    let data = [...RECLAMOS];
    if (estado) data = data.filter(r => r.estado === estado);
    if (tipo)   data = data.filter(r => r.tipo === tipo);
    res.json({ ok: true, count: data.length, reclamos: data });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/', requireAuth, async (req, res) => {
  const { vecinoNombre, vecinoDni, tipo, area, direccion, descripcion, prioridad } = req.body;
  if (!tipo || !vecinoNombre) return res.status(400).json({ error: 'tipo y vecinoNombre requeridos' });
  const numero = RECLAMOS.length > 0 ? Math.max(...RECLAMOS.map(r => r.numero)) + 1 : 1001;
  const nuevo  = { id: uuidv4(), numero, vecinoNombre, vecinoDni, tipo, area, direccion, descripcion, prioridad: prioridad||'Normal', estado: 'Pendiente', creadoEn: new Date().toISOString() };
  RECLAMOS.unshift(nuevo);
  res.status(201).json({ ok: true, reclamo: nuevo });
});

router.patch('/:id/estado', requireAuth, (req, res) => {
  const r = RECLAMOS.find(x => x.id === req.params.id);
  if (!r) return res.status(404).json({ error: 'No encontrado' });
  r.estado = req.body.estado;
  if (req.body.estado === 'Resuelto') r.resueltoEn = new Date().toISOString();
  res.json({ ok: true, reclamo: r });
});

module.exports = router;
