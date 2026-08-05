// api/whatsapp-alert.js
// Envía alertas proactivas por WhatsApp usando Meta Cloud API
import { sendMuniControlAlertaTemplate } from './lib/whatsapp-templates.js';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const token   = process.env.WHATSAPP_ACCESS_TOKEN;
  const phoneId = process.env.WHATSAPP_PHONE_ID;
  const alertTo = process.env.WHATSAPP_ALERT_TO;

  if (!token || !phoneId) {
    return res.status(200).json({
      success: false,
      status: 'not_configured',
      message: 'Configurá WHATSAPP_ACCESS_TOKEN y WHATSAPP_PHONE_ID en Vercel'
    });
  }

  const { message, severity = 'warning', module = 'general', to } = req.body;
  const recipient = to || alertTo;

  if (!recipient) {
    return res.status(400).json({ success: false, error: 'No hay destinatario configurado.' });
  }

  if (!message) {
    return res.status(400).json({ success: false, error: 'message es requerido' });
  }

  const icons = { critical: '🚨', warning: '⚠️', info: 'ℹ️' };
  const icon = icons[severity] || icons.info;

  const alertText =
    `${icon} *MuniControl — Alerta ${severity.toUpperCase()}*\n` +
    `━━━━━━━━━━━━━━━━━━━━\n\n` +
    `📍 *Municipio de Junín, Mendoza*\n` +
    `📋 Módulo: *${module.charAt(0).toUpperCase() + module.slice(1)}*\n\n` +
    `${message}\n\n` +
    `🕐 ${new Date().toLocaleString('es-AR', { timeZone: 'America/Argentina/Mendoza' })}\n\n` +
    `📱 _Ver dashboard:_\n` +
    `https://municipio-junin.vercel.app/inteligencia.html?auth=governante`;

  // Dual format numbers
  let numsToTry = [recipient];
  if (recipient.startsWith('549')) numsToTry.push('54' + recipient.substring(3));
  else if (recipient.startsWith('54') && !recipient.startsWith('549')) numsToTry.push('549' + recipient.substring(2));

  for (const num of numsToTry) {
    try {
      const resp = await fetch(`https://graph.facebook.com/v21.0/${phoneId}/messages`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          messaging_product: 'whatsapp',
          recipient_type: 'individual',
          to: num,
          type: 'text',
          text: { preview_url: true, body: alertText },
        }),
      });

      const result = await resp.json();

      if (resp.ok && result.messages) {
        return res.status(200).json({
          success: true,
          messageId: result.messages[0]?.id,
          to: num,
          severity,
          module,
        });
      }
    } catch (e) {}
  }

  // Fallback to approved template municontrol_alerta
  const tmplRes = await sendMuniControlAlertaTemplate({
    to: recipient,
    nombre: 'Gobernante',
    reporte: `${module.toUpperCase()} - ${message.substring(0, 40)}`,
    link: 'https://municipio-junin.vercel.app/inteligencia.html?auth=governante'
  });

  return res.status(200).json({
    success: tmplRes.success,
    templateFallback: true,
    data: tmplRes
  });
}
