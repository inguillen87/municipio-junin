import {
  WebhookAuthError,
  beginMessage,
  completeMessage,
  isAllowedPhoneId,
  parseVerifiedWebhook,
  releaseMessage,
  verifyWebhookChallenge,
} from './lib/whatsapp-webhook-auth.js';
import publicAppUrl from '../shared/public-app-url.cjs';

const { PublicAppUrlError, buildPublicAppUrl } = publicAppUrl;

export const config = { api: { bodyParser: false } };

export default async function handler(req, res) {
  if (req.method === 'GET') {
    const mode = req.query['hub.mode'];
    const token = req.query['hub.verify_token'];
    const challenge = req.query['hub.challenge'];
    if (verifyWebhookChallenge(mode, token)) return res.status(200).send(challenge);
    return res.status(403).json({ error: 'Forbidden' });
  }
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  let body;
  try {
    body = await parseVerifiedWebhook(req);
  } catch (error) {
    const status = error instanceof WebhookAuthError ? error.status : 400;
    return res.status(status).json({ error: 'Webhook rechazado' });
  }

  let processed = 0;
  try {
    for (const entry of body.entry.slice(0, 20)) {
      for (const change of (entry.changes || []).slice(0, 20)) {
        if (change.field !== 'messages') continue;
        const value = change.value || {};
        const phoneId = value.metadata?.phone_number_id;
        if (!isAllowedPhoneId(phoneId, ['WHATSAPP_PHONE_ID'])) continue;

        for (const message of (value.messages || []).slice(0, 50)) {
          if (!['audio', 'voice'].includes(message.type) || !beginMessage(message.id)) continue;
          try {
            await acknowledgeVoice(message.from, phoneId);
            completeMessage(message.id);
            processed += 1;
          } catch (error) {
            releaseMessage(message.id);
            throw error;
          }
        }
      }
    }
  } catch (error) {
    console.error('[MUNI-VOICE-ERROR]', error.message);
    const status = error instanceof PublicAppUrlError ? 503 : 502;
    return res.status(status).json({ ok: false });
  }

  return res.status(200).json({ ok: true, processed });
}

async function acknowledgeVoice(to, phoneId) {
  const accessToken = process.env.WHATSAPP_ACCESS_TOKEN;
  if (!accessToken) throw new Error('Canal de salida no configurado');
  const citizenUrl = buildPublicAppUrl('/ciudadano.html');

  const response = await fetch(`https://graph.facebook.com/v21.0/${phoneId}/messages`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      to,
      type: 'text',
      text: {
        body: `🎤 Recibimos una nota de voz, pero MuniControl no la transcribe ni genera un trámite. No envíes datos personales por este canal. Consultá la información pública disponible en ${citizenUrl}`,
      },
    }),
  });

  if (!response.ok) throw new Error(`Meta rechazó el mensaje (${response.status})`);
}
