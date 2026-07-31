// ============================================================
// utils/parser.js — Parser universal de archivos
// Soporta: Excel, CSV, PDF, Word, TXT, JSON
// ============================================================
const path = require('path');
const fs   = require('fs');

async function parseFile(filePath, originalName) {
  const ext = path.extname(originalName || filePath).toLowerCase();
  const result = { type: ext, rows: [], columns: [], raw: '', metadata: {} };

  try {
    if (ext === '.xlsx' || ext === '.xls') {
      return await parseExcel(filePath, result);
    } else if (ext === '.csv') {
      return await parseCSV(filePath, result);
    } else if (ext === '.pdf') {
      return await parsePDF(filePath, result);
    } else if (ext === '.docx' || ext === '.doc') {
      return await parseWord(filePath, result);
    } else if (ext === '.txt') {
      return await parseTXT(filePath, result);
    } else if (ext === '.json') {
      return await parseJSON(filePath, result);
    } else {
      result.raw = fs.readFileSync(filePath, 'utf8');
      result.metadata.note = 'Formato desconocido, texto plano';
      return result;
    }
  } catch (err) {
    result.metadata.error = err.message;
    return result;
  }
}

async function parseExcel(filePath, result) {
  const XLSX = require('xlsx');
  const wb = XLSX.readFile(filePath);
  const sheets = {};
  wb.SheetNames.forEach(name => {
    const ws = wb.Sheets[name];
    const data = XLSX.utils.sheet_to_json(ws, { defval: '' });
    sheets[name] = data;
    if (!result.rows.length && data.length) {
      result.rows    = data;
      result.columns = Object.keys(data[0] || {});
    }
  });
  result.metadata = { sheets: wb.SheetNames, totalRows: result.rows.length, sheetData: sheets };
  result.type = 'excel';
  return result;
}

async function parseCSV(filePath, result) {
  const text = fs.readFileSync(filePath, 'utf8');
  const lines = text.replace(/\r/g, '').split('\n').filter(l => l.trim());
  const sep = lines[0].includes(';') ? ';' : ',';
  const headers = lines[0].split(sep).map(h => h.replace(/"/g, '').trim());
  const rows = lines.slice(1).map(line => {
    const vals = line.split(sep).map(v => v.replace(/"/g, '').trim());
    return Object.fromEntries(headers.map((h, i) => [h, vals[i] || '']));
  });
  result.rows    = rows;
  result.columns = headers;
  result.raw     = text.slice(0, 2000);
  result.metadata = { separator: sep, totalRows: rows.length };
  result.type = 'csv';
  return result;
}

async function parsePDF(filePath, result) {
  try {
    const pdfParse = require('pdf-parse');
    const buffer   = fs.readFileSync(filePath);
    const data     = await pdfParse(buffer);
    result.raw     = data.text;
    result.metadata = { pages: data.numpages, info: data.info };
    // Intentar extraer filas estructuradas del texto
    const lines = data.text.split('\n').filter(l => l.trim().length > 3);
    result.rows = lines.map((l, i) => ({ linea: i + 1, contenido: l.trim() }));
    result.columns = ['linea', 'contenido'];
  } catch {
    result.raw = fs.readFileSync(filePath).toString('base64').slice(0, 100) + '...';
    result.metadata.error = 'pdf-parse no disponible. Instalar: npm install pdf-parse';
  }
  result.type = 'pdf';
  return result;
}

async function parseWord(filePath, result) {
  try {
    const mammoth = require('mammoth');
    const { value } = await mammoth.extractRawText({ path: filePath });
    result.raw     = value;
    const lines    = value.split('\n').filter(l => l.trim().length > 2);
    result.rows    = lines.map((l, i) => ({ linea: i + 1, contenido: l.trim() }));
    result.columns = ['linea', 'contenido'];
    result.metadata = { totalLines: lines.length };
  } catch {
    result.metadata.error = 'mammoth no disponible. Instalar: npm install mammoth';
  }
  result.type = 'word';
  return result;
}

async function parseTXT(filePath, result) {
  const text   = fs.readFileSync(filePath, 'utf8');
  const lines  = text.split('\n').filter(l => l.trim());
  result.raw   = text.slice(0, 5000);
  result.rows  = lines.map((l, i) => ({ linea: i + 1, contenido: l.trim() }));
  result.columns = ['linea', 'contenido'];
  result.metadata = { totalLines: lines.length };
  result.type = 'txt';
  return result;
}

async function parseJSON(filePath, result) {
  const text = fs.readFileSync(filePath, 'utf8');
  const data = JSON.parse(text);
  result.raw  = text.slice(0, 5000);
  if (Array.isArray(data)) {
    result.rows    = data;
    result.columns = Object.keys(data[0] || {});
  } else {
    result.rows    = [data];
    result.columns = Object.keys(data);
  }
  result.metadata = { totalRows: result.rows.length };
  result.type = 'json';
  return result;
}

module.exports = { parseFile };
