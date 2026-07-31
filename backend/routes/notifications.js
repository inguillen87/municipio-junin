'use strict';
const express = require('express');
const router = express.Router();

// ── EMAIL TEMPLATES ───────────────────────────────────────────
function getBaseTemplate(title, content, color = '#3b82f6') {
  return `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${title}</title>
<style>
  body{margin:0;padding:0;background:#f0f4f8;font-family:Inter,Arial,sans-serif}
  .wrap{max-width:600px;margin:0 auto;padding:24px 16px}
  .header{background:linear-gradient(135deg,#060b18,#111d35);border-radius:16px 16px 0 0;padding:28px 32px;text-align:center}
  .header-icon{font-size:40px;margin-bottom:8px}
  .header-title{color:#f0f4ff;font-size:22px;font-weight:800;margin:0}
  .header-sub{color:rgba(148,163,184,0.7);font-size:13px;margin:6px 0 0}
  .body{background:white;padding:28px 32px;border-left:1px solid #e2e8f0;border-right:1px solid #e2e8f0}
  .badge{display:inline-block;background:${color}22;color:${color};border:1px solid ${color}44;border-radius:99px;padding:4px 14px;font-size:12px;font-weight:700;margin-bottom:16px}
  .title{font-size:20px;font-weight:800;color:#111827;margin:0 0 12px}
  .text{font-size:14px;color:#374151;line-height:1.6;margin:0 0 12px}
  .alert-box{background:#fef3c7;border-left:4px solid #f59e0b;border-radius:0 8px 8px 0;padding:12px 16px;margin:16px 0}
  .alert-box.critical{background:#fee2e2;border-color:#ef4444}
  .alert-box.ok{background:#d1fae5;border-color:#10b981}
  .kpi-row{display:flex;gap:12px;margin:16px 0}
  .kpi{flex:1;background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;padding:14px;text-align:center}
  .kpi-val{font-size:22px;font-weight:900;color:#111827}
  .kpi-lbl{font-size:11px;color:#6b7280;margin-top:4px}
  .btn{display:inline-block;background:${color};color:white;text-decoration:none;padding:12px 28px;border-radius:10px;font-weight:700;font-size:14px;margin:16px 0}
  .footer{background:#f8fafc;border:1px solid #e2e8f0;border-radius:0 0 16px 16px;padding:18px 32px;text-align:center}
  .footer-text{font-size:11px;color:#9ca3af}
  table{width:100%;border-collapse:collapse;margin:12px 0;font-size:13px}
  th{background:#f1f5f9;padding:8px 12px;text-align:left;color:#374151;font-weight:700;border-bottom:2px solid #e2e8f0}
  td{padding:9px 12px;border-bottom:1px solid #f1f5f9;color:#374151}
  tr:last-child td{border-bottom:none}
</style>
</head>
<body>
<div class="wrap">
  <div class="header">
    <div class="header-icon">🏛️</div>
    <div class="header-title">Municipalidad de Junín</div>
    <div class="header-sub">GovTech Platform v2.0 — Sistema de Gestión Municipal</div>
  </div>
  <div class="body">
    ${content}
  </div>
  <div class="footer">
    <div class="footer-text">Este email fue generado automáticamente por GovTech Platform.<br>Para más información, visitá <a href="https://municipio-junin.vercel.app" style="color:#3b82f6">municipio-junin.vercel.app</a></div>
  </div>
</div>
</body>
</html>`;
}

// Diferentes templates de email
const TEMPLATES = {
  contractAlert: (data) => getBaseTemplate(
    `⚠️ Contrato próximo a vencer — ${data.nombre}`,
    `<div class="badge">⚠️ ALERTA DE CONTRATO</div>
    <div class="title">Contrato próximo a vencer</div>
    <div class="text">El siguiente contrato requiere atención inmediata:</div>
    <div class="alert-box">
      <strong>${data.nombre}</strong><br>
      Proveedor: ${data.proveedor}<br>
      Vence en: <strong>${data.dias} días</strong> (${data.fecha})<br>
      Monto mensual: ${data.monto}
    </div>
    <div class="text">Por favor, iniciá el proceso de renovación o licitación correspondiente.</div>
    <a class="btn" href="https://municipio-junin.vercel.app/licitaciones.html">Ver Contratos</a>`,
    '#f59e0b'
  ),

  budgetAlert: (data) => getBaseTemplate(
    `🚨 Alerta Presupuestaria — ${data.partida}`,
    `<div class="badge" style="background:#fee2e2;color:#ef4444;border-color:#fca5a5">🚨 ALERTA CRÍTICA</div>
    <div class="title">Partida presupuestaria en riesgo</div>
    <div class="alert-box critical">
      <strong>${data.partida}</strong><br>
      Ejecutado: <strong>${data.porcentaje}% del presupuesto asignado</strong><br>
      Presupuesto: ${data.presupuesto}<br>
      Gastado: ${data.gastado}
    </div>
    <div class="text">Se recomienda revisar los gastos de esta área y contactar al responsable para evaluar medidas de ajuste.</div>
    <a class="btn" href="https://municipio-junin.vercel.app/presupuesto.html" style="background:#ef4444">Ver Presupuesto</a>`,
    '#ef4444'
  ),

  weeklyReport: (data) => getBaseTemplate(
    '📊 Informe Ejecutivo Semanal — Municipalidad de Junín',
    `<div class="badge">📊 INFORME SEMANAL</div>
    <div class="title">Resumen Ejecutivo — Semana del ${data.semana}</div>
    <div class="kpi-row">
      <div class="kpi"><div class="kpi-val">${data.presupuesto}</div><div class="kpi-lbl">Presupuesto Total</div></div>
      <div class="kpi"><div class="kpi-val">${data.ejecutado}%</div><div class="kpi-lbl">Ejecutado</div></div>
      <div class="kpi"><div class="kpi-val">${data.empleados}</div><div class="kpi-lbl">Empleados</div></div>
    </div>
    <div class="kpi-row">
      <div class="kpi"><div class="kpi-val">${data.contratos}</div><div class="kpi-lbl">Contratos Activos</div></div>
      <div class="kpi"><div class="kpi-val">${data.reclamos}</div><div class="kpi-lbl">Reclamos Pendientes</div></div>
      <div class="kpi"><div class="kpi-val">${data.obras}</div><div class="kpi-lbl">Obras Activas</div></div>
    </div>
    ${data.alertas && data.alertas.length ? `<div class="alert-box"><strong>⚠️ Alertas de la semana:</strong><ul>${data.alertas.map(a => `<li>${a}</li>`).join('')}</ul></div>` : ''}
    <a class="btn" href="https://municipio-junin.vercel.app/control.html">Ver Dashboard Completo</a>`,
    '#3b82f6'
  ),

  reclamo: (data) => getBaseTemplate(
    `🏘️ Reclamo sin resolver — #${data.id}`,
    `<div class="badge" style="background:#fef3c7;color:#d97706;border-color:#fcd34d">⚠️ RECLAMO PENDIENTE</div>
    <div class="title">Reclamo vecinal sin resolver</div>
    <div class="text">El siguiente reclamo lleva más de 7 días sin respuesta:</div>
    <table>
      <tr><th>Campo</th><th>Detalle</th></tr>
      <tr><td>ID</td><td>#${data.id}</td></tr>
      <tr><td>Tipo</td><td>${data.tipo}</td></tr>
      <tr><td>Barrio</td><td>${data.barrio}</td></tr>
      <tr><td>Días pendiente</td><td><strong>${data.dias} días</strong></td></tr>
      <tr><td>Prioridad</td><td>${data.prioridad}</td></tr>
    </table>
    <a class="btn" href="https://municipio-junin.vercel.app/vecinos.html" style="background:#f59e0b">Ver Reclamos</a>`,
    '#f59e0b'
  ),
};

// ── SEND EMAIL ────────────────────────────────────────────────
async function sendEmail({ to, subject, html }) {
  let transporter;
  const nodemailer = (() => { try { return require('nodemailer'); } catch { return null; } })();

  if (!nodemailer || !process.env.SMTP_USER) {
    console.log('[Email] Nodemailer no configurado. Simulando envío:');
    console.log('  To:', to);
    console.log('  Subject:', subject);
    return { simulated: true, to, subject };
  }

  transporter = nodemailer.createTransporter({
    host: process.env.SMTP_HOST || 'smtp.gmail.com',
    port: parseInt(process.env.SMTP_PORT || '587'),
    secure: false,
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
  });

  try {
    const info = await transporter.sendMail({
      from: \`"GovTech Municipal" <\${process.env.SMTP_USER}>\`,
      to, subject, html,
    });
    console.log('[Email] Enviado:', info.messageId);
    return { ok: true, messageId: info.messageId };
  } catch (err) {
    console.error('[Email] Error:', err.message);
    return { error: err.message };
  }
}

// ── ROUTES ────────────────────────────────────────────────────

// POST /api/notifications/send
router.post('/send', async (req, res) => {
  const { type, to, data } = req.body;
  if (!type || !to) return res.status(400).json({ error: 'type y to requeridos' });

  const templateFn = TEMPLATES[type];
  if (!templateFn) return res.status(400).json({ error: \`Template '\${type}' no existe. Disponibles: \${Object.keys(TEMPLATES).join(', ')}\` });

  let subject;
  if (type === 'contractAlert')  subject = \`⚠️ Contrato próximo a vencer — \${data?.nombre || ''}\`;
  if (type === 'budgetAlert')    subject = \`🚨 Alerta Presupuestaria — \${data?.partida || ''}\`;
  if (type === 'weeklyReport')   subject = \`📊 Informe Ejecutivo Semanal — Municipalidad de Junín\`;
  if (type === 'reclamo')        subject = \`🏘️ Reclamo sin resolver #\${data?.id || ''}\`;

  const html = templateFn(data || {});
  const result = await sendEmail({ to, subject, html });
  res.json({ ok: true, result });
});

// POST /api/notifications/weekly-report — genera y envía el informe semanal
router.post('/weekly-report', async (req, res) => {
  const to = req.body.to || process.env.INTENDENTE_EMAIL || 'intendente@junin.gob.ar';
  const data = {
    semana: new Date().toLocaleDateString('es-AR', { day:'2-digit', month:'long', year:'numeric' }),
    presupuesto: '$372M',
    ejecutado: '52',
    empleados: '1.247',
    contratos: '47',
    reclamos: '59',
    obras: '8',
    alertas: [
      'Partida Personal al 103% del presupuesto',
      'Contrato Limpieza Zona Norte vence en 12 días',
      '47 reclamos vecinales pendientes de resolución',
    ],
  };
  const html    = TEMPLATES.weeklyReport(data);
  const subject = '📊 Informe Ejecutivo Semanal — Municipalidad de Junín';
  const result  = await sendEmail({ to, subject, html });
  res.json({ ok: true, result, data });
});

// GET /api/notifications/status
router.get('/status', (req, res) => {
  res.json({
    configured: !!process.env.SMTP_USER,
    smtpHost: process.env.SMTP_HOST || 'not-set',
    smtpUser: process.env.SMTP_USER || 'not-set',
    templates: Object.keys(TEMPLATES),
    events: [
      'contractAlert — Contrato vence en 30/15/7 días',
      'budgetAlert — Área supera el 80% del presupuesto',
      'weeklyReport — Informe ejecutivo semanal (lunes 8am)',
      'reclamo — Reclamo vecinal sin resolver +7 días',
    ],
  });
});

module.exports = { router, sendEmail, TEMPLATES };
