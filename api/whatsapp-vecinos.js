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
    // Compartimos el mismo verify token por simplicidad en este MVP
    if (verifyWebhookChallenge(mode, token)) {
      return res.status(200).send(challenge);
    }
    return res.status(403).json({ error: 'Forbidden' });
  }
  if (req.method !== 'POST') return res.status(405).end();

  let body;
  try {
    body = await parseVerifiedWebhook(req);
  } catch (err) {
    const status = err instanceof WebhookAuthError ? err.status : 400;
    return res.status(status).json({ error: 'Webhook rechazado' });
  }

  let processed = 0;
  try {
    for (const entry of body.entry.slice(0, 20)) {
      for (const change of (entry.changes || []).slice(0, 20)) {
        if (change.field !== 'messages') continue;
        const value = change.value || {};
        if (!isAllowedPhoneId(value.metadata?.phone_number_id, ['WHATSAPP_PHONE_ID_VECINOS', 'WHATSAPP_PHONE_ID'])) continue;
        for (const msg of (value.messages || []).slice(0, 50)) {
          if (!beginMessage(msg.id)) continue;
          try {
            await route(msg, value.metadata || {});
            completeMessage(msg.id);
            processed += 1;
          } catch (error) {
            releaseMessage(msg.id);
            throw error;
          }
        }
      }
    }
  } catch (err) {
    console.error('[WA-VECINOS]', err.message);
    const status = err instanceof PublicAppUrlError ? 503 : 500;
    return res.status(status).json({ ok: false });
  }
  return res.status(200).json({ ok: true, processed });
}

async function route(msg, meta) {
  const from = msg.from;
  const pid = meta.phone_number_id;
  let txt = '';
  let payloadId = '';

  if (msg.type === 'text') {
    txt = (msg.text && msg.text.body) || '';
  } else if (msg.type === 'interactive') {
    const ir = msg.interactive || {};
    if (ir.type === 'button_reply' || ir.button_reply) {
      payloadId = (ir.button_reply && ir.button_reply.id) || '';
      txt = payloadId;
    } else if (ir.type === 'list_reply' || ir.list_reply) {
      payloadId = (ir.list_reply && ir.list_reply.id) || '';
      txt = payloadId;
    }
  } else if (msg.type === 'location') {
    // Si mandan ubicación, asumimos que están haciendo un reclamo
    return await cmdReclamoUbicacion(from, pid, msg.location);
  } else if (msg.type === 'image') {
    return await cmdReclamoFoto(from, pid);
  } else {
    return;
  }

  if (!txt || !txt.trim()) return;
  const t = txt.trim().toLowerCase();

  // Enrutamiento ciudadano
  if (t === 'menu' || t === 'hola' || t === 'inicio' || t === 'cmd_inicio' || (t.indexOf('hola') >= 0 && t.length < 20)) {
    return await cmdMenuVecino(from, pid);
  }
  if (t === 'cmd_reclamos') {
    return await cmdReclamosInicio(from, pid);
  }
  if (t.startsWith('cmd_rec_cat_')) {
    return await cmdReclamoCategoria(from, pid, t.replace('cmd_rec_cat_', ''));
  }
  if (t === 'cmd_turnos') {
    return await cmdTurnos(from, pid);
  }
  if (t === 'cmd_noticias') {
    return await cmdNoticias(from, pid);
  }
  if (t === 'cmd_encuestas') {
    return await cmdEncuestas(from, pid);
  }

  // Fallback
  await cmdLibreVecino(from, pid, txt);
}

// ================================================================
// CANAL VECINAL INFORMATIVO — SIN ALTA DE TRÁMITES
// ================================================================
function citizenInformationUrl() {
  return buildPublicAppUrl('/ciudadano.html');
}

function claimsUnavailableText() {
  return `📢 *RECLAMOS 311 NO DISPONIBLE*\n\n` +
    `Este canal no crea expedientes, no asigna números de seguimiento y no deriva solicitudes a cuadrillas.\n\n` +
    `No envíes nombre, documento, domicilio, ubicación ni imágenes. Consultá únicamente la información pública disponible en:\n${citizenInformationUrl()}`;
}

async function cmdMenuVecino(to, pid) {
  await send(to, pid, 'text',
    `🏠 *INFORMACIÓN VECINAL*\n\n` +
    `Este canal es informativo y no crea reclamos, turnos, votos ni otros trámites. No envíes datos personales, ubicaciones o imágenes.\n\n` +
    `Información pública disponible:\n${citizenInformationUrl()}`
  );
}

async function cmdReclamosInicio(to, pid) {
  await send(to, pid, 'text', claimsUnavailableText());
}

async function cmdReclamoCategoria(to, pid) {
  await send(to, pid, 'text', claimsUnavailableText());
}

async function cmdReclamoUbicacion(to, pid) {
  await send(to, pid, 'text',
    `📍 MuniControl no usa ni guarda la ubicación enviada y no la incorpora a ningún expediente. El proveedor de mensajería aplica sus propias condiciones de tratamiento. No envíes información adicional por este canal.\n\n` +
    `Información pública disponible:\n${citizenInformationUrl()}`
  );
}

async function cmdReclamoFoto(to, pid) {
  await send(to, pid, 'text',
    `🖼️ MuniControl no procesa ni guarda la imagen enviada y no la incorpora a ningún expediente. El proveedor de mensajería aplica sus propias condiciones de tratamiento. No envíes información adicional por este canal.\n\n` +
    `Información pública disponible:\n${citizenInformationUrl()}`
  );
}

async function cmdTurnos(to, pid) {
  await send(to, pid, 'text',
    `📅 *TURNOS MUNICIPALES NO DISPONIBLES*\n\n` +
    `MuniControl no tiene una agenda conectada. Este chat no reserva, cancela ni confirma turnos.\n\n` +
    `Información pública disponible:\n${citizenInformationUrl()}`
  );
}

async function cmdNoticias(to, pid) {
  await send(to, pid, 'text',
    `📰 Este canal no está conectado a una fuente editorial verificada y no publica titulares.\n\n` +
    `Información pública disponible:\n${citizenInformationUrl()}`
  );
}

async function cmdEncuestas(to, pid) {
  await send(to, pid, 'text',
    `🗳️ MuniControl no tiene una fuente de encuestas conectada. Este canal no solicita ni registra votos.\n\n` +
    `Información pública disponible:\n${citizenInformationUrl()}`
  );
}

async function cmdLibreVecino(to, pid, txt) {
  if (txt.startsWith('cmd_voto_')) return await cmdEncuestas(to, pid);
  if (txt === 'cmd_rec_fin') return await cmdReclamosInicio(to, pid);
  await cmdMenuVecino(to, pid);
}

// ================================================================
// SEND UTILITY
// ================================================================
async function send(to, pid, type, content) {
  const token = process.env.WHATSAPP_ACCESS_TOKEN;
  if (!token || !pid) return;

  var payload = { messaging_product: 'whatsapp', to: to, type: type };
  if (type === 'text') {
    payload.text = { body: content };
  } else if (type === 'interactive') {
    payload.interactive = content;
  }

  var url = 'https://graph.facebook.com/v21.0/' + pid + '/messages';

  var doSend = async function(r) {
    var b = JSON.stringify(payload).replace(`"to":"${to}"`, `"to":"${r}"`);
    var resp = await fetch(url, {
      method: 'POST',
      headers: { 'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json' },
      body: b
    });
    return { ok: resp.ok, status: resp.status };
  };

  var res = await doSend(to);
  if (!res.ok) console.error('[WA-VECINOS] Provider status', res.status);
}
