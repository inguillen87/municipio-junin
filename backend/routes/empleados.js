// ============================================================
// routes/empleados.js — CRUD Empleados
// ============================================================
const express = require('express');
const { v4: uuidv4 } = require('uuid');
const { requireAuth } = require('../middleware/auth');
const db = require('../db/connection');

const router = express.Router();

let EMPLEADOS = [
  { id:'e1', legajo:'2847', nombre:'Carlos',    apellido:'González',    area:'Obras Públicas',    cargo:'Jefe de Cuadrilla',  situacion:'Planta Permanente', sueldo:485000 },
  { id:'e2', legajo:'1923', nombre:'María',     apellido:'López',        area:'Hacienda',           cargo:'Contadora',           situacion:'Planta Permanente', sueldo:620000 },
  { id:'e3', legajo:'3104', nombre:'Roberto',   apellido:'Díaz',         area:'Talleres',           cargo:'Mecánico Oficial',   situacion:'Planta Permanente', sueldo:410000 },
  { id:'e4', legajo:'4521', nombre:'Ana',       apellido:'Martínez',     area:'Secretaría General', cargo:'Administrativa',      situacion:'Planta Permanente', sueldo:380000 },
  { id:'e5', legajo:'5832', nombre:'Javier',    apellido:'Morales',      area:'Cultura',            cargo:'Promotor Cultural',   situacion:'Contratado',        sueldo:340000 },
  { id:'e6', legajo:'6147', nombre:'Laura',     apellido:'Fernández',    area:'Salud',              cargo:'Enfermera',           situacion:'Planta Permanente', sueldo:460000 },
  { id:'e7', legajo:'7263', nombre:'Miguel',    apellido:'Pérez',        area:'Parques y Jardines', cargo:'Jardinero',           situacion:'Planta Permanente', sueldo:355000 },
  { id:'e8', legajo:'8394', nombre:'Sandra',    apellido:'Ramírez',      area:'Educación',         cargo:'Coordinadora',        situacion:'Planta Permanente', sueldo:510000 },
];

router.get('/', requireAuth, async (req, res) => {
  try {
    if (!db.isInMemory()) {
      const r = await db.query('SELECT * FROM empleados WHERE activo = true ORDER BY apellido, nombre');
      return res.json({ ok: true, count: r.rows.length, empleados: r.rows });
    }
    const { area, situacion, search } = req.query;
    let data = [...EMPLEADOS];
    if (area)     data = data.filter(e => e.area === area);
    if (situacion) data = data.filter(e => e.situacion === situacion);
    if (search) {
      const q = search.toLowerCase();
      data = data.filter(e => `${e.nombre} ${e.apellido} ${e.legajo}`.toLowerCase().includes(q));
    }
    res.json({ ok: true, count: data.length, empleados: data, total: EMPLEADOS.length });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/', requireAuth, async (req, res) => {
  const { legajo, nombre, apellido, area, cargo, situacion, sueldo } = req.body;
  if (!legajo || !nombre || !apellido) return res.status(400).json({ error: 'legajo, nombre y apellido requeridos' });
  const nuevo = { id: uuidv4(), legajo, nombre, apellido, area, cargo, situacion: situacion || 'Contratado', sueldo: parseFloat(sueldo) || 0 };
  EMPLEADOS.push(nuevo);
  res.status(201).json({ ok: true, empleado: nuevo });
});

module.exports = router;
