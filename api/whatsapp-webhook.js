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

function loginUrl() {
  return buildPublicAppUrl('/login.html');
}

export const config = { api: { bodyParser: false } };

export default async function handler(req, res) {
  if (req.method === 'GET') {
    const mode = req.query['hub.mode'];
    const token = req.query['hub.verify_token'];
    const challenge = req.query['hub.challenge'];
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
        if (!isAllowedPhoneId(value.metadata?.phone_number_id, ['WHATSAPP_PHONE_ID'])) continue;
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
    console.error('[WA-WEBHOOK-ERROR]', err.message);
    const status = err instanceof PublicAppUrlError ? 503 : 500;
    return res.status(status).json({ ok: false });
  }
  return res.status(200).json({ ok: true, processed });
}

// ================================================================
// ROUTER - Unificado (Gobernantes + Vecinos + Voz)
// ================================================================
async function route(msg, meta) {
  const from = msg.from;
  const pid = meta.phone_number_id;

  let txt = '';
  let payloadId = '';

  if (msg.type === 'text') {
    txt = (msg.text && msg.text.body) || '';
  } else if (msg.type === 'interactive') {
    // Soporte para mensajes interactivos (botones y listas) de vecinos
    const ir = msg.interactive || {};
    if (ir.type === 'button_reply' || ir.button_reply) {
      payloadId = (ir.button_reply && ir.button_reply.id) || '';
      txt = payloadId;
    } else if (ir.type === 'list_reply' || ir.list_reply) {
      payloadId = (ir.list_reply && ir.list_reply.id) || '';
      txt = payloadId;
    }
  } else if (msg.type === 'location') {
    return await cmdReclamoUbicacion(from, pid);
  } else if (msg.type === 'image') {
    return await cmdReclamoFoto(from, pid);
  } else if (msg.type === 'audio' || msg.type === 'voice') {
    // No se declara transcripción ni alta de trámite hasta contar con ese flujo auditado.
    await send(from, pid, 'text',
      `\uD83C\uDFA4 *ATENCI\u00D3N POR VOZ (MuniVoice)*\n\n` +
      `Recibimos una nota de voz, pero este canal no la transcribe, no la persiste como expediente y no genera un tr\u00E1mite autom\u00E1tico.\n\n` +
      `No env\u00EDes datos personales adicionales. Consult\u00E1 los canales institucionales vigentes de la Municipalidad.`
    );
    return;
  } else {
    return;
  }

  if (!txt || !txt.trim()) return;
  const t = txt.trim().toLowerCase();

  // Menu principal dual
  if (t === 'cmd_menu' || t === 'menu' || t === 'hola' || t === 'inicio' || t === 'cmd_inicio' || t === '1' || t === '2' || (t.indexOf('hola') >= 0 && t.length < 20)) {
    if (t === '1') return await cmdMenuGobernantes(from, pid);
    if (t === '2') return await cmdMenuVecinos(from, pid);
    return await cmdMenuDual(from, pid);
  }

  // Modulo Gobernantes
  if (t === 'cmd_gobernantes' || t === 'gobernantes') return await cmdMenuGobernantes(from, pid);
  if (t === 'cmd_obras' || t === 'obras' || t === '3' || t.includes('obra')) return await cmdObras(from, pid);
  if (t === 'cmd_licitaciones' || t === 'licitaciones' || t === '6' || t.includes('licitacion')) return await cmdLicitaciones(from, pid);
  if (t === 'cmd_rrhh' || t === 'rrhh' || t === '5' || t === 'personal' || t.includes('empleado')) return await cmdRRHH(from, pid);
  if (t === 'cmd_hacienda' || t === 'hacienda' || t === '4' || t === 'finanzas' || t.includes('gasto') || t.includes('presupuesto') || t.includes('plata')) return await cmdHacienda(from, pid);
  if (t === 'cmd_reporte' || t === 'reporte' || t === '7' || t === 'informe' || t.includes('report') || t.includes('pdf')) return await cmdReporte(from, pid);

  // Modulo Vecinos (soporte interactivo unificado)
  if (t === 'cmd_vecinos' || t === 'vecinos') return await cmdMenuVecinos(from, pid);
  if (t === 'cmd_reclamos' || t === 'reclamos' || t.includes('reclam') || t.includes('bache') || t.includes('agua') || t.includes('luminaria')) return await cmdReclamosInicio(from, pid);
  if (t.startsWith('cmd_rec_cat_')) return await cmdReclamoCategoria(from, pid, t.replace('cmd_rec_cat_', ''));
  if (t === 'cmd_turnos' || t === 'turnos' || t.includes('turno')) return await cmdTurnos(from, pid);
  if (t === 'cmd_noticias') return await cmdNoticias(from, pid);
  if (t === 'cmd_encuestas') return await cmdEncuestas(from, pid);
  if (t.startsWith('cmd_voto_')) return await cmdVoto(from, pid, t);
  if (t === 'cmd_rec_fin') return await cmdRecFin(from, pid);

  // Fallback inteligente con IA
  await cmdLibre(from, pid, txt);
}

// ================================================================
// MENUS PRINCIPALES
// ================================================================
async function cmdMenuDual(to, pid) {
  const textMenu = 
    `\uD83C\uDFDB\uFE0F *MUNICONTROL JUN\u00CDN \u2014 MEN\u00DA PRINCIPAL*\n` +
    `_Bienvenido al sistema inteligente municipal._\n\n` +
    `Escrib\u00ED el n\u00FAmero de opci\u00F3n:\n` +
    `1\uFE0F\u20E3 *Gobernantes* (Hacienda, Obras, RRHH)\n` +
    `2\uFE0F\u20E3 *Informaci\u00F3n vecinal* (estado de integraciones)\n\n` +
    `\uD83D\uDCF1 _O escrib\u00ED directamente: obras, hacienda, rrhh, reclamos o pdf_`;

  await send(to, pid, 'text', textMenu);
}

async function cmdMenuGobernantes(to, pid) {
  const textMenu = 
    `\uD83C\uDFDB\uFE0F *PANEL DE GOBERNANTES*\n` +
    `_Municipalidad de Jun\u00EDn \u00B7 Mendoza_\n\n` +
    `Escrib\u00ED el n\u00FAmero o comando:\n` +
    `\u2022 *3* - Obras P\u00FAblicas\n` +
    `\u2022 *4* - Hacienda y Finanzas\n` +
    `\u2022 *5* - Centro Ejecutivo GRH\n` +
    `\u2022 *6* - Licitaciones P\u00FAblicas\n` +
    `\u2022 *7* - Centro de Reportes\n\n` +
    `\uD83D\uDD10 *Acceso seguro al Dashboard:* \n${loginUrl()}`;

  await send(to, pid, 'text', textMenu);
}

async function cmdMenuVecinos(to, pid) {
  const textMenu = 
    `\uD83C\uDFE0 *INFORMACI\u00D3N VECINAL*\n\n` +
    `MuniControl todav\u00EDa no registra reclamos, turnos, fotos ni ubicaciones como expedientes oficiales.\n\n` +
    `No env\u00EDes datos personales por este canal. Consult\u00E1 los canales institucionales vigentes de la Municipalidad.`;

  await send(to, pid, 'text', textMenu);
}

async function cmdHacienda(to, pid) {
  await send(to, pid, 'text', 
    `\uD83D\uDCB0 *HACIENDA Y FINANZAS*\n\n` +
    `Las cifras ejecutivas se muestran \u00FAnicamente dentro de la plataforma y con fuente validada.\n\n` +
    `\uD83D\uDD10 *Ingresar al m\u00F3dulo:* \n${loginUrl()}`
  );
}

async function cmdObras(to, pid) {
  await send(to, pid, 'text', 
    `\uD83C\uDFD7\uFE0F *OBRAS P\u00DABLICAS*\n\n` +
    `Los avances e inversiones requieren una fuente municipal vigente; no informamos valores de demostraci\u00F3n.\n\n` +
    `\uD83D\uDD10 *Ingresar al m\u00F3dulo:* \n${loginUrl()}`
  );
}

async function cmdRRHH(to, pid) {
  await send(to, pid, 'text',
    `\uD83D\uDC65 *CENTRO EJECUTIVO GRH*\n\n` +
    `El m\u00F3dulo protegido muestra el \u00FAltimo contrato GRH privado que haya sido publicado y validado para tu municipio, con su corte y sus l\u00EDmites visibles. WhatsApp no consulta ese contrato ni confirma que est\u00E9 disponible. No difundimos m\u00E9tricas, legajos ni datos personales por este canal.\n\n` +
    `\uD83D\uDD10 *Ingresar con credenciales institucionales:* \n${loginUrl()}`
  );
}

async function cmdLicitaciones(to, pid) {
  await send(to, pid, 'text',
    `\uD83D\uDCC4 *LICITACIONES P\u00DABLICAS*\n\n` +
    `Las cifras se publican solamente cuando el m\u00F3dulo cuenta con una fuente validada y fecha de corte visible.\n\n` +
    `\uD83D\uDD10 *Ingresar al m\u00F3dulo:* \n${loginUrl()}`
  );
}

// ================================================================
// MODULO VECINOS - Reclamos 311
// ================================================================
async function cmdReclamosInicio(to, pid) {
  await send(to, pid, 'text',
    `\uD83D\uDCE2 *RECLAMOS VECINALES*\n\n` +
    `La integraci\u00F3n de expedientes 311 no est\u00E1 habilitada en MuniControl. Este chat no asigna n\u00FAmero, estado ni seguimiento.\n\n` +
    `No env\u00EDes nombre, documento, domicilio, fotos ni ubicaci\u00F3n. Consult\u00E1 los canales institucionales vigentes de la Municipalidad.`
  );
}

async function cmdReclamoCategoria(to, pid, categoria) {
  await send(to, pid, 'text',
    `\u2139\uFE0F La categor\u00EDa *${categoria}* no fue registrada. La integraci\u00F3n 311 est\u00E1 deshabilitada y este chat no crea expedientes.`
  );
}

async function cmdReclamoUbicacion(to, pid) {
  await send(to, pid, 'text',
    `\uD83D\uDCCD La ubicaci\u00F3n no se incorpora a ning\u00FAn expediente. Por privacidad, no la repetimos ni solicitamos m\u00E1s datos por este canal.`
  );
}

async function cmdReclamoFoto(to, pid) {
  await send(to, pid, 'text',
    `\uD83D\uDCF8 *Foto recibida*\n\n` +
    `La imagen no se incorpora a ning\u00FAn expediente. No env\u00EDes datos personales adicionales por este canal.`
  );
}

async function cmdRecFin(to, pid) {
  await send(to, pid, 'text',
    `\u2139\uFE0F No se cre\u00F3 un pre-registro ni un expediente. La integraci\u00F3n 311 est\u00E1 deshabilitada.`
  );
}

async function cmdTurnos(to, pid) {
  await send(to, pid, 'text',
    `\uD83D\uDCC5 *TURNOS MUNICIPALES*\n\n` +
    `MuniControl no tiene una agenda de turnos conectada. Este chat no reserva ni confirma turnos. Consult\u00E1 los canales institucionales vigentes de la Municipalidad.`
  );
}

async function cmdNoticias(to, pid) {
  await send(to, pid, 'text',
    `\uD83D\uDCF0 *NOTICIAS MUNICIPALES*\n\n` +
    `Este canal no est\u00E1 conectado a una fuente editorial verificada, por lo que no publica titulares ni novedades. Consult\u00E1 los canales institucionales vigentes de la Municipalidad.`
  );
}

async function cmdEncuestas(to, pid) {
  await send(to, pid, 'text',
    `\uD83D\uDCCA *ENCUESTAS MUNICIPALES*\n\n` +
    `MuniControl no tiene una fuente de encuestas conectada. Este chat no registra votos ni programa notificaciones.`
  );
}

async function cmdVoto(to, pid, cmd) {
  await send(to, pid, 'text',
    `\u2139\uFE0F Tu selecci\u00F3n fue recibida en esta conversaci\u00F3n, pero no se registr\u00F3 como voto oficial.`
  );
}

async function cmdReporte(to, pid) {
  await send(to, pid, 'text',
    `\uD83D\uDCCA *CENTRO DE REPORTES*\n\n` +
    `Los informes ejecutivos requieren autenticaci\u00F3n y conservan la fecha de corte y la fuente de cada indicador.\n\n` +
    `\uD83D\uDD10 ${loginUrl()}`
  );
}

// ================================================================
// FALLBACK INTELIGENTE CON IA
// ================================================================
async function cmdLibre(to, pid, txt) {
  await send(to, pid, 'text',
    `\uD83E\uDD16 *MUNIBOT JUN\u00CDN*\n\n` +
    `Para proteger informaci\u00F3n ejecutiva, las respuestas con datos requieren una sesi\u00F3n institucional en la plataforma.\n\n` +
    `Escrib\u00ED *menu* o ingres\u00E1 en ${loginUrl()}.`
  );
}

// ================================================================
// SEND ENGINE
// ================================================================
async function send(to, pid, type, content) {
  const token = process.env.WHATSAPP_ACCESS_TOKEN;
  if (!token || !pid) {
    console.error('[WA-SEND-ERROR] Missing token or phoneId');
    return;
  }

  const url = `https://graph.facebook.com/v21.0/${pid}/messages`;

  const doSend = async (targetNum) => {
    const payload = {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: targetNum,
      type: type
    };

    if (type === 'text') {
      payload.text = typeof content === 'string' ? { body: content } : content;
    } else if (type === 'image') {
      payload.image = typeof content === 'string' ? { link: content } : content;
    }

    const resp = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer ' + token,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });
    return { ok: resp.ok, status: resp.status };
  };

  const result = await doSend(to);
  if (!result.ok) {
    console.warn(`[WA-SEND-FAIL] Provider status ${result.status}`);
  }
}
