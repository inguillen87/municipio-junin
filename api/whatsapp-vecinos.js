import { sendReclamoConfirmacionTemplate, sendTurnoConfirmacionTemplate } from './lib/whatsapp-templates.js';

export default async function handler(req, res) {
  if (req.method === 'GET') {
    const mode = req.query['hub.mode'];
    const token = req.query['hub.verify_token'];
    const challenge = req.query['hub.challenge'];
    // Compartimos el mismo verify token por simplicidad en este MVP
    if (mode === 'subscribe' && token === process.env.WHATSAPP_VERIFY_TOKEN) {
      return res.status(200).send(challenge);
    }
    return res.status(403).json({ error: 'Forbidden' });
  }
  if (req.method !== 'POST') return res.status(405).end();

  try {
    const body = req.body;
    if (body && body.object === 'whatsapp_business_account') {
      for (const entry of (body.entry || [])) {
        for (const change of (entry.changes || [])) {
          if (change.field !== 'messages') continue;
          const v = change.value || {};
          for (const msg of (v.messages || [])) {
            await route(msg, v.metadata || {});
          }
        }
      }
    }
  } catch (err) {
    console.error('[WA-VECINOS]', err.message);
  }
  return res.status(200).json({ ok: true });
}

async function route(msg, meta) {
  const from = msg.from;
  const pid = meta.phone_number_id || process.env.WHATSAPP_PHONE_ID_VECINOS || process.env.WHATSAPP_PHONE_ID;
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
// MENÚ PRINCIPAL VECINO
// ================================================================
async function cmdMenuVecino(to, pid) {
  await send(to, pid, 'interactive', {
    type: 'list',
    header: { type: 'text', text: 'MUNICIPIO DE JUNÍN' },
    body: { text: '¡Hola! 👋 Soy MuniBot, tu asistente virtual ciudadano.\n\n¿En qué te puedo ayudar hoy?' },
    footer: { text: 'Atención 24/7' },
    action: {
      button: 'Ver Opciones',
      sections: [
        {
          title: 'Servicios',
          rows: [
            { id: 'cmd_reclamos', title: 'Hacer un Reclamo 311', description: 'Baches, luminaria, limpieza' },
            { id: 'cmd_turnos', title: 'Sacar un Turno', description: 'Licencia, salud, trámites' }
          ]
        },
        {
          title: 'Información',
          rows: [
            { id: 'cmd_noticias', title: 'Últimas Noticias', description: 'Novedades del municipio' },
            { id: 'cmd_encuestas', title: 'Participación', description: 'Votá y opiná' }
          ]
        }
      ]
    }
  });
}

// ================================================================
// RECLAMOS 311 - PASO 1: CATEGORÍA
// ================================================================
async function cmdReclamosInicio(to, pid) {
  await send(to, pid, 'interactive', {
    type: 'list',
    body: { text: '📢 *NUEVO RECLAMO*\n\nPor favor, seleccioná la categoría del problema:' },
    action: {
      button: 'Categorías',
      sections: [
        {
          title: 'Vía Pública',
          rows: [
            { id: 'cmd_rec_cat_alumbrado', title: 'Alumbrado Público' },
            { id: 'cmd_rec_cat_bache', title: 'Bacheo / Asfalto' },
            { id: 'cmd_rec_cat_limpieza', title: 'Limpieza / Basura' },
            { id: 'cmd_rec_cat_arbol', title: 'Arbolado' }
          ]
        }
      ]
    }
  });
}

// ================================================================
// RECLAMOS 311 - PASO 2: UBICACIÓN
// ================================================================
async function cmdReclamoCategoria(to, pid, cat) {
  await send(to, pid, 'text', '📍 Perfecto. Ahora, por favor *enviame la ubicación* del problema.\n\n_(Tocá el ícono de 📎 o ➕ y seleccioná "Ubicación")_');
}

// ================================================================
// RECLAMOS 311 - PASO 3: FOTO (Opcional)
// ================================================================
async function cmdReclamoUbicacion(to, pid, loc) {
  await send(to, pid, 'interactive', {
    type: 'button',
    body: { text: '✅ Ubicación recibida.\n\n¿Querés enviar una *foto* del problema? (Es opcional, pero ayuda mucho).' },
    action: {
      buttons: [
        { type: 'reply', reply: { id: 'cmd_rec_fin', title: 'Omitir foto' } }
      ]
    }
  });
}

// ================================================================
// RECLAMOS 311 - FINALIZAR
// ================================================================
async function cmdReclamoFoto(to, pid) {
  const num = Math.floor(1000 + Math.random() * 9000);
  await send(to, pid, 'interactive', {
    type: 'button',
    body: { text: `✅ *RECLAMO GENERADO*\n\nTu número de seguimiento es el *#2026-${num}*.\n\nLas cuadrillas ya fueron notificadas. Podés ver el estado de todos tus reclamos desde el Portal Ciudadano:` },
    action: {
      buttons: [
        { type: 'reply', reply: { id: 'cmd_inicio', title: 'Volver al Inicio' } }
      ]
    }
  });
}

// ================================================================
// TURNOS
// ================================================================
async function cmdTurnos(to, pid) {
  await send(to, pid, 'text', '📅 *GESTIÓN DE TURNOS*\n\nPara sacar o cancelar turnos, por favor ingresá a nuestra nueva App Ciudadana:\n\n👉 https://municipio-junin.vercel.app/ciudadano.html');
}

// ================================================================
// NOTICIAS
// ================================================================
async function cmdNoticias(to, pid) {
  await send(to, pid, 'interactive', {
    type: 'button',
    body: { text: '📰 *ÚLTIMAS NOTICIAS*\n\n*1. Avanza la repavimentación*\nYa completamos el 82% de la obra en Av. San Martín.\n\n*2. Campaña de Vacunación*\nEste fin de semana en la plaza central.\n\n*3. Pago Anual de Tasas*\nAprovechá el 20% de descuento.' },
    action: {
      buttons: [
        { type: 'reply', reply: { id: 'cmd_inicio', title: 'Menú Principal' } }
      ]
    }
  });
}

// ================================================================
// ENCUESTAS
// ================================================================
async function cmdEncuestas(to, pid) {
  await send(to, pid, 'interactive', {
    type: 'button',
    body: { text: '🗳️ *PARTICIPACIÓN CIUDADANA*\n\n¿Qué obra considerás más prioritaria para el próximo trimestre?' },
    action: {
      buttons: [
        { type: 'reply', reply: { id: 'cmd_voto_1', title: 'Más iluminación' } },
        { type: 'reply', reply: { id: 'cmd_voto_2', title: 'Arreglo de calles' } },
        { type: 'reply', reply: { id: 'cmd_voto_3', title: 'Plazas y Parques' } }
      ]
    }
  });
}

// ================================================================
// LIBRE
// ================================================================
async function cmdLibreVecino(to, pid, txt) {
  if (txt.startsWith('cmd_voto_')) {
    await send(to, pid, 'interactive', {
      type: 'button',
      body: { text: '✅ ¡Gracias por participar! Tu voto ha sido registrado.' },
      action: {
        buttons: [
          { type: 'reply', reply: { id: 'cmd_inicio', title: 'Volver al Menú' } }
        ]
      }
    });
    return;
  }
  if (txt === 'cmd_rec_fin') {
    const num = Math.floor(1000 + Math.random() * 9000);
    const ticketId = `2026-${num}`;
    
    // Disparar plantilla oficial de Meta WhatsApp Cloud API
    try {
      await sendReclamoConfirmacionTemplate({
        to: to,
        nombre: 'Vecino/a',
        ticketId: ticketId,
        categoria: 'Reclamo 311',
        estado: 'Pendiente de asignación',
        link: 'https://municipio-junin.vercel.app/ciudadano.html'
      });
    } catch(e) { console.error('Template err:', e); }

    await send(to, pid, 'interactive', {
      type: 'button',
      body: { text: `✅ *RECLAMO GENERADO*\n\nTu número de seguimiento es el *#${ticketId}*.\n\nLas cuadrillas ya fueron notificadas.` },
      action: {
        buttons: [
          { type: 'reply', reply: { id: 'cmd_inicio', title: 'Inicio' } }
        ]
      }
    });
    return;
  }
  
  await send(to, pid, 'interactive', {
    type: 'button',
    body: { text: '🤔 No entiendo ese comando.\n\nSoy MuniBot, tu asistente virtual. Elegí una opción del menú para comenzar:' },
    action: {
      buttons: [
        { type: 'reply', reply: { id: 'cmd_inicio', title: 'Ver Menú' } }
      ]
    }
  });
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
    return { ok: resp.ok, t: await resp.text() };
  };

  var res = await doSend(to);
  if (!res.ok && res.t.includes('131030')) {
    var alt = null;
    if (to.startsWith('549') && to.length >= 13) alt = '54' + to.substring(3);
    else if (to.startsWith('54') && !to.startsWith('549')) alt = '549' + to.substring(2);
    if (alt) res = await doSend(alt);
  }
  if (!res.ok) console.error('[WA-VECINOS]', res.t.substring(0, 200));
}
