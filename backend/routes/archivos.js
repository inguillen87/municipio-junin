// ============================================================
// routes/archivos.js — Upload y análisis de archivos
// POST /api/archivos/upload
// GET  /api/archivos/
// ============================================================
const express = require('express');
const path    = require('path');
const fs      = require('fs');
const { requireAuth } = require('../middleware/auth');
const upload  = require('../middleware/upload');
const { parseFile } = require('../utils/parser');

const router = express.Router();

// Historial en memoria
const uploadHistory = [];

// POST /api/archivos/upload
router.post('/upload', requireAuth, upload.array('files', 20), async (req, res) => {
  if (!req.files || req.files.length === 0) {
    return res.status(400).json({ error: 'No se recibieron archivos' });
  }
  const results = [];
  for (const file of req.files) {
    try {
      const parsed = await parseFile(file.path, file.originalname);
      const entry = {
        id:       file.filename,
        name:     file.originalname,
        size:     file.size,
        type:     parsed.type,
        rows:     parsed.rows.length,
        columns:  parsed.columns,
        preview:  parsed.rows.slice(0, 10),
        metadata: parsed.metadata,
        raw:      parsed.raw?.slice(0, 2000),
        uploadedAt: new Date().toISOString(),
        uploadedBy: req.user.nombre,
      };
      uploadHistory.unshift(entry);
      if (uploadHistory.length > 100) uploadHistory.pop();
      results.push({ ok: true, ...entry });
    } catch (err) {
      results.push({ ok: false, name: file.originalname, error: err.message });
    }
  }
  res.json({ ok: true, count: results.length, results });
});

// GET /api/archivos/
router.get('/', requireAuth, (req, res) => {
  res.json({ ok: true, count: uploadHistory.length, files: uploadHistory });
});

// DELETE /api/archivos/:id
router.delete('/:id', requireAuth, (req, res) => {
  const idx = uploadHistory.findIndex(f => f.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'Archivo no encontrado' });
  uploadHistory.splice(idx, 1);
  res.json({ ok: true });
});

module.exports = router;
