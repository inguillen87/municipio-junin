// Restricted WhatsApp diagnostics. Disabled in production unless explicitly enabled.
import { noStore, requireRole } from './lib/auth.js';

export default async function handler(req, res) {
  noStore(res);
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Use POST' });
  }

  const caller = await requireRole(req, res, ['SUPER_ADMIN']);
  if (!caller) return;

  if (process.env.ENABLE_WHATSAPP_DIAGNOSTICS !== 'true') {
    return res.status(404).json({ error: 'Diagnóstico no habilitado' });
  }

  const token = process.env.WHATSAPP_ACCESS_TOKEN;
  const phoneId = process.env.WHATSAPP_PHONE_ID;
  const targetPhone = process.env.WHATSAPP_TEST_TO;
  if (!token || !phoneId) {
    return res.status(503).json({ configured: false });
  }

  try {
    const infoRes = await fetch(`https://graph.facebook.com/v21.0/${phoneId}`, {
      headers: { Authorization: `Bearer ${token}` }
    });

    const result = {
      configured: true,
      providerReachable: infoRes.ok,
      providerStatus: infoRes.status,
      sent: false,
    };

    if (req.body?.send === true) {
      if (!targetPhone) {
        return res.status(400).json({ ...result, error: 'WHATSAPP_TEST_TO no configurado' });
      }
      const sendRes = await fetch(`https://graph.facebook.com/v21.0/${phoneId}/messages`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          messaging_product: 'whatsapp',
          recipient_type: 'individual',
          to: targetPhone,
          type: 'text',
          text: { preview_url: false, body: 'MuniControl: prueba de conectividad autorizada.' }
        })
      });
      result.sent = sendRes.ok;
      result.sendStatus = sendRes.status;
    }

    return res.status(200).json(result);
  } catch {
    return res.status(502).json({ configured: true, providerReachable: false });
  }
}
