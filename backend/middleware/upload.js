// ============================================================
// middleware/upload.js — Configuración Multer
// ============================================================
const multer = require('multer');
const path = require('path');
const fs = require('fs');

const uploadDir = process.env.UPLOAD_DIR || './uploads';
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) => {
    const ts = Date.now();
    const safe = file.originalname.replace(/[^a-zA-Z0-9.\-_]/g, '_');
    cb(null, `${ts}_${safe}`);
  },
});

const fileFilter = (req, file, cb) => {
  const allowed = [
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.ms-excel',
    'application/pdf',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/msword',
    'text/csv',
    'text/plain',
    'application/json',
  ];
  const ext = path.extname(file.originalname).toLowerCase();
  const allowedExt = ['.xlsx', '.xls', '.csv', '.pdf', '.doc', '.docx', '.txt', '.json'];
  if (allowed.includes(file.mimetype) || allowedExt.includes(ext)) {
    cb(null, true);
  } else {
    cb(new Error(`Tipo de archivo no permitido: ${file.originalname}`), false);
  }
};

const maxMB = parseInt(process.env.UPLOAD_MAX_MB || '50');
const upload = multer({ storage, fileFilter, limits: { fileSize: maxMB * 1024 * 1024 } });

module.exports = upload;
