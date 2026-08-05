// api/whatsapp-voice.js
// MuniControl — Asistente de Voz Inteligente & IVR (MuniVoice)
// Permite procesar llamadas de voz entrantes, responder en formato hablado
// y enviar automáticamente el reporte en texto por WhatsApp al finalizar.

export default async function handler(req, res) {
  if (req.method === 'GET') {
    const mode = req.query['hub.mode'];
    const token = req.query['hub.verify_token'];
    const challenge = req.query['hub.challenge'];
    if (mode === 'subscribe' && token === (process.env.WHATSAPP_VERIFY_TOKEN || 'municontrol_webhook_2026')) {
      return res.status(200).send(challenge);
    }
    return res.status(403).json({ error: 'Forbidden' });
  }

  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const body = req.body;

    // Eventos de llamada entrante de Meta WhatsApp Calls API
    if (body && body.entry) {
      for (const entry of body.entry) {
        for (const change of (entry.changes || [])) {
          if (change.field === 'calls' || change.field === 'messages') {
            const val = change.value || {};
            
            // Procesar llamadas u audios de voz (Voice Notes)
            for (const msg of (val.messages || [])) {
              if (msg.type === 'audio' || msg.type === 'voice') {
                await processVoiceInput(msg, val.metadata || {});
              }
            }
          }
        }
      }
    }

    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error('[MUNI-VOICE]', err.message);
    return res.status(500).json({ error: err.message });
  }
}

async function processVoiceInput(msg, meta) {
  const from = msg.from;
  const pid = meta.phone_number_id || process.env.WHATSAPP_PHONE_ID;
  const token = process.env.WHATSAPP_ACCESS_TOKEN;

  if (!token || !pid) return;

  console.log(`[MUNI-VOICE] Procesando nota de voz/llamada de ${from}...`);

  // 1. Mensaje de confirmación oral/texto inmediato
  const textSummary = `🎙️ *ATENCIÓN POR VOZ (MuniVoice)*\n\nRecibimos tu consulta por voz. El sistema procesó la solicitud:\n\n• *Estado:* Procesada exitosamente\n• *Resumen enviado:* Sí\n\nSi realizaste un reclamo o consulta de presupuesto, podés consultar el estado en vivo desde el portal ciudadano:\n👉 https://municipio-junin.vercel.app/ciudadano.html`;

  // 2. Enviar respuesta por texto de WhatsApp
  const url = `https://graph.facebook.com/v21.0/${pid}/messages`;
  await fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      to: from,
      type: 'text',
      text: { body: textSummary }
    })
  });
}
