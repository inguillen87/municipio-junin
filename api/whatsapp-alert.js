// api/whatsapp-alert.js
// Envía alertas proactivas por WhatsApp usando Meta Cloud API
// Se usa desde cron-daily-report.js cuando hay alertas críticas
//
// POST /api/whatsapp-alert
// Body: { message, severity, module, to? }

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const token   = process.env.WHATSAPP_ACCESS_TOKEN;
  const phoneId = process.env.WHATSAPP_PHONE_ID;
  const alertTo = process.env.WHATSAPP_ALERT_TO; // número del intendente/admin

  if (!token || !phoneId) {
    return res.status(200).json({
      success: false,
      status: 'not_configured',
      message: 'Configurá WHATSAPP_ACCESS_TOKEN y WHATSAPP_PHONE_ID en Vercel → Settings → Environment Variables',
      steps: [
        '1. Ir a developers.facebook.com',
        '2. Crear app → Agregar producto WhatsApp',
        '3. Copiar el Access Token temporal o crear System User',
        '4. Copiar el Phone Number ID',
        '5. Agregar como env vars en Vercel',
      ],
    });
  }

  const { message, severity = 'warning', module = 'general', to } = req.body;
  const recipient = to || alertTo;

  if (!recipient) {
    return res.status(400).json({
      success: false,
      error: 'No hay destinatario configurado. Agregá WHATSAPP_ALERT_TO con el número del intendente (formato: 5492614XXXXXX)',
    });
  }

  if (!message) {
    return res.status(400).json({ success: false, error: 'message es requerido' });
  }

  // Build alert message
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
        to: recipient,
        type: 'text',
        text: { preview_url: true, body: alertText },
      }),
    });

    const result = await resp.json();

    if (resp.ok && result.messages) {
      return res.status(200).json({
        success: true,
        messageId: result.messages[0]?.id,
        to: recipient,
        severity,
        module,
      });
    } else {
      return res.status(200).json({
        success: false,
        error: result.error?.message || 'Error desconocido de Meta',
        errorCode: result.error?.code,
        hint: result.error?.code === 131030
          ? 'El número no tiene sesión activa de WhatsApp. El usuario debe enviar un mensaje primero.'
          : null,
      });
    }
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
}
