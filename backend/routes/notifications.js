// ============================================================
// notifications.js — Sistema de Alertas Automáticas
// Email + WhatsApp para Municipio de Junín
// Triggers: contratos vencidos, presupuesto excedido, reclamos
// ============================================================

'use strict';

const express  = require('express');
const router   = express.Router();
const nodemailer = require('nodemailer');

// ── CONFIGURACIÓN EMAIL ──────────────────────────────────────
const EMAIL_CONFIG = {
  host:   process.env.SMTP_HOST  || 'smtp.gmail.com',
  port:   parseInt(process.env.SMTP_PORT || '587'),
  secure: false,
  auth: {
    user: process.env.SMTP_USER || '',
    pass: process.env.SMTP_PASS || '',
  },
};

// ── DESTINATARIOS POR ROL ────────────────────────────────────
const RECIPIENTS = {
  intendente: [process.env.EMAIL_INTENDENTE || 'intendente@junin.gob.ar'],
  hacienda:   [process.env.EMAIL_HACIENDA   || 'hacienda@junin.gob.ar'],
  tecnologia: [process.env.EMAIL_IT         || 'it@junin.gob.ar'],
  todos:      [
    process.env.EMAIL_INTENDENTE || 'intendente@junin.gob.ar',
    process.env.EMAIL_HACIENDA   || 'hacienda@junin.gob.ar',
    process.env.EMAIL_IT         || 'it@junin.gob.ar',
  ],
};

// ── DATOS MUNICIPALES (se reemplaza con DB real) ─────────────
const MUNICIPAL_DATA = {
  contratos: [
    { id:'C001', nombre:'GovTech Solutions (Expedientes)', vence:'2026-08-15', riesgo:'critico', area:'IT', monto:3500000 },
    { id:'C002', nombre:'Sistemas Nexo SA (Antivirus)',    vence:'2026-09-30', riesgo:'alto',    area:'IT', monto:2040000 },
    { id:'C003', nombre:'CloudHost SA (Hosting)',          vence:'2026-10-15', riesgo:'alto',    area:'IT', monto:1020000 },
  ],
  presupuesto: {
    obras_publicas: { presupuesto: 38000000, ejecutado: 44800000, exceso_pct: 18 },
    talleres:       { presupuesto: 12000000, ejecutado: 13400000, exceso_pct: 12 },
    est_servicios:  { presupuesto: 8000000,  ejecutado: 9100000,  exceso_pct: 14 },
  },
  combustible: { stock_pct: 48, alerta: true },
  reclamos_sin_resolver: 89,
};

// ── CREAR TRANSPORTER (lazy) ─────────────────────────────────
let transporter = null;
function getTransporter() {
  if (!transporter && EMAIL_CONFIG.auth.user) {
    transporter = nodemailer.createTransport(EMAIL_CONFIG);
  }
  return transporter;
}

// ── TEMPLATE EMAIL BASE ──────────────────────────────────────
function emailTemplate(titulo, contenido, tipo = 'info') {
  const colores = {
    critico: { bg: '#ef4444', light: '#fef2f2', border: '#ef4444' },
    alerta:  { bg: '#f59e0b', light: '#fffbeb', border: '#f59e0b' },
    info:    { bg: '#3b82f6', light: '#eff6ff', border: '#3b82f6' },
    ok:      { bg: '#10b981', light: '#f0fdf4', border: '#10b981' },
  };
  const c = colores[tipo] || colores.info;

  return `<!DOCTYPE html>
<html lang="es">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0">
<title>${titulo}</title></head>
<body style="margin:0;padding:0;background:#f1f5f9;font-family:Inter,Arial,sans-serif">
  <div style="max-width:600px;margin:32px auto;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.1)">
    <!-- Header -->
    <div style="background:${c.bg};padding:24px 32px;text-align:center">
      <div style="font-size:32px;margin-bottom:8px">🏛️</div>
      <div style="color:white;font-size:20px;font-weight:800;font-family:Georgia,serif">Municipalidad de Junín</div>
      <div style="color:rgba(255,255,255,0.85);font-size:13px;margin-top:4px">Sistema de Alertas Automáticas</div>
    </div>
    <!-- Content -->
    <div style="background:white;padding:32px">
      <h2 style="margin:0 0 20px;color:#1e293b;font-size:20px">${titulo}</h2>
      ${contenido}
      <div style="margin-top:32px;padding-top:20px;border-top:1px solid #e2e8f0;text-align:center">
        <a href="https://municipio-junin.vercel.app" style="background:${c.bg};color:white;padding:12px 28px;border-radius:8px;text-decoration:none;font-weight:700;font-size:14px">
          Ver en el Sistema →
        </a>
      </div>
    </div>
    <!-- Footer -->
    <div style="background:#f8fafc;padding:16px 32px;text-align:center;font-size:11px;color:#94a3b8;border-top:1px solid #e2e8f0">
      Municipalidad de Junín, Mendoza · Sistema GovTech v2.0<br>
      ${new Date().toLocaleString('es-AR', { timeZone: 'America/Argentina/Mendoza' })}
    </div>
  </div>
</body>
</html>`;
}

// ── ALERTAS CONFIGURADAS ─────────────────────────────────────
const ALERTAS = {

  contratos_vencidos: {
    id: 'contratos_vencidos',
    nombre: 'Contratos Próximos a Vencer',
    descripcion: 'Contratos IT que vencen en los próximos 30 días',
    tipo: 'critico',
    destinatarios: ['tecnologia', 'hacienda'],
    check: () => {
      const hoy = new Date();
      return MUNICIPAL_DATA.contratos.filter(c => {
        const vence = new Date(c.vence);
        const dias = Math.ceil((vence - hoy) / 86400000);
        return dias <= 30;
      });
    },
    buildEmail: (datos) => {
      const filas = datos.map(c => {
        const dias = Math.ceil((new Date(c.vence) - new Date()) / 86400000);
        const color = dias < 0 ? '#ef4444' : dias < 7 ? '#f59e0b' : '#64748b';
        return `<tr>
          <td style="padding:10px 12px;border-bottom:1px solid #f1f5f9">${c.nombre}</td>
          <td style="padding:10px 12px;border-bottom:1px solid #f1f5f9">${c.area}</td>
          <td style="padding:10px 12px;border-bottom:1px solid #f1f5f9">$${(c.monto/1000000).toFixed(1)}M</td>
          <td style="padding:10px 12px;border-bottom:1px solid #f1f5f9;color:${color};font-weight:700">
            ${dias < 0 ? 'VENCIDO' : `${dias} días`}
          </td>
        </tr>`;
      }).join('');
      const contenido = `
        <p style="color:#475569;font-size:14px;margin-bottom:20px">
          Se detectaron <strong>${datos.length} contrato(s)</strong> con vencimiento próximo o ya vencido.
          Se requiere acción inmediata para evitar interrupciones en los servicios municipales.
        </p>
        <table style="width:100%;border-collapse:collapse;font-size:13px">
          <thead><tr style="background:#f8fafc">
            <th style="padding:10px 12px;text-align:left;color:#64748b;font-weight:700">Contrato</th>
            <th style="padding:10px 12px;text-align:left;color:#64748b;font-weight:700">Área</th>
            <th style="padding:10px 12px;text-align:left;color:#64748b;font-weight:700">Monto</th>
            <th style="padding:10px 12px;text-align:left;color:#64748b;font-weight:700">Estado</th>
          </tr></thead>
          <tbody>${filas}</tbody>
        </table>
        <div style="background:#fef2f2;border:1px solid #fecaca;border-radius:8px;padding:14px;margin-top:20px;font-size:13px;color:#991b1b">
          ⚡ Acción requerida: Iniciar proceso de licitación o renovación urgente.
        </div>`;
      return emailTemplate('🚨 Alerta: Contratos Próximos a Vencer', contenido, 'critico');
    },
  },

  presupuesto_excedido: {
    id: 'presupuesto_excedido',
    nombre: 'Áreas con Presupuesto Excedido',
    tipo: 'alerta',
    destinatarios: ['intendente', 'hacienda'],
    check: () => Object.entries(MUNICIPAL_DATA.presupuesto)
      .filter(([,v]) => v.ejecutado > v.presupuesto)
      .map(([area, v]) => ({ area, ...v })),
    buildEmail: (datos) => {
      const filas = datos.map(d => `
        <tr>
          <td style="padding:10px 12px;border-bottom:1px solid #f1f5f9;font-weight:600">${d.area.replace(/_/g,' ')}</td>
          <td style="padding:10px 12px;border-bottom:1px solid #f1f5f9">$${(d.presupuesto/1000000).toFixed(1)}M</td>
          <td style="padding:10px 12px;border-bottom:1px solid #f1f5f9">$${(d.ejecutado/1000000).toFixed(1)}M</td>
          <td style="padding:10px 12px;border-bottom:1px solid #f1f5f9;color:#ef4444;font-weight:700">+${d.exceso_pct}%</td>
          <td style="padding:10px 12px;border-bottom:1px solid #f1f5f9;color:#ef4444;font-weight:700">-$${((d.ejecutado-d.presupuesto)/1000000).toFixed(1)}M</td>
        </tr>`).join('');
      const contenido = `
        <p style="color:#475569;font-size:14px;margin-bottom:20px">
          <strong>${datos.length} área(s)</strong> superaron su presupuesto asignado para este mes.
          Se recomienda reunión de jefes de área antes del 5 del próximo mes.
        </p>
        <table style="width:100%;border-collapse:collapse;font-size:13px">
          <thead><tr style="background:#f8fafc">
            <th style="padding:10px 12px;text-align:left;color:#64748b;font-weight:700">Área</th>
            <th style="padding:10px 12px;text-align:left;color:#64748b;font-weight:700">Presupuesto</th>
            <th style="padding:10px 12px;text-align:left;color:#64748b;font-weight:700">Ejecutado</th>
            <th style="padding:10px 12px;text-align:left;color:#64748b;font-weight:700">Desvío</th>
            <th style="padding:10px 12px;text-align:left;color:#64748b;font-weight:700">Exceso</th>
          </tr></thead>
          <tbody>${filas}</tbody>
        </table>`;
      return emailTemplate('⚠️ Alerta: Áreas con Presupuesto Excedido', contenido, 'alerta');
    },
  },

  informe_semanal: {
    id: 'informe_semanal',
    nombre: 'Informe Ejecutivo Semanal',
    tipo: 'info',
    destinatarios: ['intendente'],
    check: () => [true], // siempre enviar
    buildEmail: () => {
      const contenido = `
        <p style="color:#475569;font-size:14px;margin-bottom:24px">
          Resumen ejecutivo de la semana para la Intendencia Municipal de Junín.
        </p>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:24px">
          <div style="background:#eff6ff;border-radius:10px;padding:16px;text-align:center">
            <div style="font-size:28px;font-weight:900;color:#1d4ed8">$284.5M</div>
            <div style="font-size:12px;color:#3b82f6;font-weight:600">Gasto del mes</div>
          </div>
          <div style="background:#f0fdf4;border-radius:10px;padding:16px;text-align:center">
            <div style="font-size:28px;font-weight:900;color:#15803d">1.247</div>
            <div style="font-size:12px;color:#16a34a;font-weight:600">Empleados activos</div>
          </div>
          <div style="background:#fef2f2;border-radius:10px;padding:16px;text-align:center">
            <div style="font-size:28px;font-weight:900;color:#b91c1c">89</div>
            <div style="font-size:12px;color:#ef4444;font-weight:600">Reclamos pendientes</div>
          </div>
          <div style="background:#fffbeb;border-radius:10px;padding:16px;text-align:center">
            <div style="font-size:28px;font-weight:900;color:#b45309">$15.8M</div>
            <div style="font-size:12px;color:#f59e0b;font-weight:600">Ahorro potencial/año</div>
          </div>
        </div>
        <h3 style="color:#1e293b;font-size:15px;margin-bottom:12px">🚨 Alertas que requieren atención</h3>
        <ul style="margin:0;padding-left:20px;color:#475569;font-size:13px;line-height:2">
          <li>Obras Públicas supera presupuesto en <strong>18%</strong> (+$6.8M)</li>
          <li>Contrato GovTech Solutions <strong>VENCIDO</strong> — riesgo alto para expedientes</li>
          <li>Combustible al <strong>48%</strong> de stock — reponer antes del 15/09</li>
        </ul>`;
      return emailTemplate('📋 Informe Ejecutivo Semanal — Municipio de Junín', contenido, 'info');
    },
  },
};

// ── ENVIAR EMAIL ─────────────────────────────────────────────
async function sendEmail(to, subject, html) {
  const tp = getTransporter();
  if (!tp) {
    console.log(`[Email] Sin SMTP configurado. Para: ${to} | Asunto: ${subject}`);
    return { simulated: true, to, subject };
  }
  const info = await tp.sendMail({
    from: `"Sistema Municipal Junín" <${EMAIL_CONFIG.auth.user}>`,
    to: Array.isArray(to) ? to.join(',') : to,
    subject,
    html,
  });
  console.log(`[Email] Enviado: ${info.messageId}`);
  return info;
}

// ── VERIFICAR Y DISPARAR ALERTAS ─────────────────────────────
async function checkAndSendAlerts() {
  const resultados = [];

  for (const alerta of Object.values(ALERTAS)) {
    try {
      const datos = alerta.check();
      if (!datos || datos.length === 0) continue;

      const html = alerta.buildEmail(datos);
      const destinatarios = alerta.destinatarios
        .flatMap(rol => RECIPIENTS[rol] || [])
        .filter((v, i, a) => a.indexOf(v) === i); // deduplicar

      const subject = `[Municipal Junín] ${alerta.nombre}`;
      await sendEmail(destinatarios, subject, html);

      resultados.push({ alerta: alerta.id, enviado: true, destinatarios, datos: datos.length });
    } catch (err) {
      resultados.push({ alerta: alerta.id, error: err.message });
    }
  }

  return resultados;
}

// ── RUTAS API ────────────────────────────────────────────────

// Verificar alertas y enviar emails
router.post('/check', async (req, res) => {
  try {
    const resultados = await checkAndSendAlerts();
    res.json({ ok: true, timestamp: new Date().toISOString(), resultados });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Enviar alerta específica manualmente
router.post('/send/:alertaId', async (req, res) => {
  const { alertaId } = req.params;
  const alerta = ALERTAS[alertaId];
  if (!alerta) return res.status(404).json({ error: 'Alerta no encontrada' });

  try {
    const datos = req.body.datos || alerta.check();
    const html  = alerta.buildEmail(datos);
    const to    = req.body.to || alerta.destinatarios.flatMap(rol => RECIPIENTS[rol] || []);
    const result = await sendEmail(to, `[Municipal Junín] ${alerta.nombre}`, html);
    res.json({ ok: true, alerta: alertaId, to, result });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Enviar email personalizado
router.post('/custom', async (req, res) => {
  const { to, subject, mensaje, tipo } = req.body;
  if (!to || !subject || !mensaje) return res.status(400).json({ error: 'Faltan parámetros' });
  try {
    const html = emailTemplate(subject, `<p style="color:#475569;font-size:14px">${mensaje}</p>`, tipo || 'info');
    const result = await sendEmail(to, `[Municipal Junín] ${subject}`, html);
    res.json({ ok: true, result });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Enviar informe semanal
router.post('/weekly-report', async (req, res) => {
  try {
    const alerta = ALERTAS.informe_semanal;
    const html   = alerta.buildEmail([]);
    const to     = req.body.to || RECIPIENTS.intendente;
    const result = await sendEmail(to, '[Municipal Junín] Informe Ejecutivo Semanal', html);
    res.json({ ok: true, to, result });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Listar alertas disponibles
router.get('/alertas', (req, res) => {
  res.json({
    alertas: Object.values(ALERTAS).map(a => ({
      id: a.id,
      nombre: a.nombre,
      tipo: a.tipo,
      destinatarios: a.destinatarios,
    })),
    recipients: Object.keys(RECIPIENTS),
  });
});

module.exports = router;
module.exports.checkAndSendAlerts = checkAndSendAlerts;
