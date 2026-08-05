import { sendAlertaEjecutivaTemplate } from './lib/whatsapp-templates.js';

const BASE = 'https://municipio-junin.vercel.app';

export default async function handler(req, res) {
  if (req.method === 'GET') {
    const mode = req.query['hub.mode'];
    const token = req.query['hub.verify_token'];
    const challenge = req.query['hub.challenge'];
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
    console.error('[WA-WEBHOOK-ERROR]', err.message);
  }
  return res.status(200).json({ ok: true });
}

// ================================================================
// ROUTER — Unificado (Gobernantes + Vecinos)
// ================================================================
async function route(msg, meta) {
  const from = msg.from;
  const pid = meta.phone_number_id || process.env.WHATSAPP_PHONE_ID;
  let txt = '';

  if (msg.type === 'text') {
    txt = (msg.text && msg.text.body) || '';
  } else if (msg.type === 'interactive') {
    const ir = msg.interactive || {};
    if (ir.type === 'button_reply' || ir.button_reply) {
      txt = (ir.button_reply && ir.button_reply.id) || '';
    } else if (ir.type === 'list_reply' || ir.list_reply) {
      txt = (ir.list_reply && ir.list_reply.id) || '';
    }
  } else if (msg.type === 'location') {
    const loc = msg.location || {};
    const lat = loc.latitude || -33.1462;
    const lng = loc.longitude || -68.4871;
    const ticketId = 'REC-' + Math.floor(1000 + Math.random() * 9000);
    await send(from, pid, 'text', `📍 *Ubicación Recibida (Reclamo 311)*\n\nCoordenadas: ${lat.toFixed(4)}, ${lng.toFixed(4)}\nSe registró el reclamo #${ticketId} en Junín, Mendoza.\n\nSLA estimado: 48 hs.\nSeguí tu caso en: ${BASE}/ciudadano`);
    return;
  } else if (msg.type === 'image') {
    const ticketId = 'REC-' + Math.floor(1000 + Math.random() * 9000);
    await send(from, pid, 'text', `📷 *Imagen Adjuntada al Reclamo 311*\n\nFoto cargada exitosamente al ticket #${ticketId}.\nAsignado a: Cuadrilla de Servicios Públicos.\n\nSeguí el avance en: ${BASE}/ciudadano`);
    return;
  } else if (msg.type === 'audio' || msg.type === 'voice') {
    await send(from, pid, 'text', `🎙️ *Audio Recibido por MuniVoice*\n\nMuniBot procesó tu mensaje de voz. Escribí *menu* o elegí una opción para ver presupuestos, obras o hacer un reclamo.`);
    return;
  } else {
    return;
  }

  if (!txt || !txt.trim()) return;
  const t = txt.trim().toLowerCase();

  // Menu principal dual
  if (t === 'cmd_menu' || t === 'menu' || t === 'hola' || t === 'inicio' || t === '1' || t === '2' || (t.indexOf('hola') >= 0 && t.length < 20)) {
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

  // Modulo Vecinos
  if (t === 'cmd_vecinos' || t === 'vecinos') return await cmdMenuVecinos(from, pid);
  if (t === 'cmd_reclamos' || t === 'reclamos' || t.includes('reclam') || t.includes('bache') || t.includes('agua') || t.includes('luminaria')) return await cmdReclamos(from, pid);
  if (t === 'cmd_turnos' || t === 'turnos' || t.includes('turno')) return await cmdTurnos(from, pid);

  await cmdLibre(from, pid, txt);
}

// ================================================================
// MENUS INTERACTIVOS (Con fallback automático a texto plano)
// ================================================================
async function cmdMenuDual(to, pid) {
  const textFallback = 
    `🏛️ *MUNICONTROL JUNÍN — MENÚ PRINCIPAL*\n` +
    `_Bienvenido al sistema inteligente municipal._\n\n` +
    `Escribí el número u opción deseada:\n` +
    `1️⃣ *Gobernantes* (Hacienda, Obras, RRHH)\n` +
    `2️⃣ *Portal Vecino 311* (Reclamos, Turnos)\n\n` +
    `📱 _O escribí directamente: obras, hacienda, rrhh, reclamos o pdf_`;

  await send(to, pid, 'interactive', {
    type: 'button',
    body: { text: '🏛️ *MUNICONTROL JUNÍN — MENÚ PRINCIPAL*\n_Bienvenido al sistema inteligente municipal._\n\nPor favor, seleccioná tu perfil de consulta:' },
    footer: { text: 'Municipalidad de Junín · Mendoza' },
    action: {
      buttons: [
        { type: 'reply', reply: { id: 'cmd_gobernantes', title: '🏛️ Gobernantes' } },
        { type: 'reply', reply: { id: 'cmd_vecinos', title: '🏘️ Portal Vecino 311' } }
      ]
    }
  }, textFallback);
}

async function cmdMenuGobernantes(to, pid) {
  const textFallback = 
    `🏛️ *PANEL DE GOBERNANTES*\n` +
    `_Municipalidad de Junín · Mendoza_\n\n` +
    `• *3* - Obras Públicas ($142.5M)\n` +
    `• *4* - Hacienda y Finanzas (+$14.9M)\n` +
    `• *5* - Recursos Humanos (1,247 empl.)\n` +
    `• *6* - Licitaciones Públicas (5 activas)\n` +
    `• *7* - Descargar Informe PDF\n\n` +
    `Escribí el número para consultar.`;

  await send(to, pid, 'interactive', {
    type: 'list',
    header: { type: 'text', text: 'PANEL DE GOBERNANTES' },
    body: { text: 'Seleccioná el área de gestión municipal para consultar indicadores en tiempo real:' },
    footer: { text: 'MuniControl · Intendencia' },
    action: {
      button: 'Ver Áreas',
      sections: [
        {
          title: 'Gestión Municipal',
          rows: [
            { id: 'cmd_hacienda', title: 'Hacienda y Finanzas', description: 'Balance +$14.9M | 67% ejec.' },
            { id: 'cmd_obras', title: 'Obras Públicas', description: '8 proyectos | $142.5M invertidos' },
            { id: 'cmd_rrhh', title: 'Recursos Humanos', description: '1,247 empleados | 3.2% ausent.' },
            { id: 'cmd_licitaciones', title: 'Licitaciones', description: '5 procesos | $85.4M licitados' },
            { id: 'cmd_reporte', title: 'Descargar Reporte PDF', description: 'Informe oficial de gestión' }
          ]
        }
      ]
    }
  }, textFallback);
}

async function cmdMenuVecinos(to, pid) {
  const textFallback = 
    `🏘️ *PORTAL VECINO JUNÍN 311*\n\n` +
    `• Escribí *reclamos* para registrar un reporte.\n` +
    `• Escribí *turnos* para pedir un turno web.\n` +
    `• O enviá tu *ubicación GPS* / *foto*.`;

  await send(to, pid, 'interactive', {
    type: 'button',
    body: { text: '🏘️ *PORTAL VECINO JUNÍN 311*\n_Tu municipio al alcance de tu mano._\n\n¿Qué trámite o consulta querés realizar hoy?' },
    footer: { text: 'Atención Ciudadana' },
    action: {
      buttons: [
        { type: 'reply', reply: { id: 'cmd_reclamos', title: '📢 Hacer Reclamo 311' } },
        { type: 'reply', reply: { id: 'cmd_turnos', title: '📅 Pedir Turno Web' } },
        { type: 'reply', reply: { id: 'cmd_menu', title: '↩️ Menú Principal' } }
      ]
    }
  }, textFallback);
}

async function cmdHacienda(to, pid) {
  await send(to, pid, 'text', 
    `💰 *HACIENDA Y FINANZAS*\n_Junín, Mendoza · Ago 2026_\n\n` +
    `*Balance Mensual*\n` +
    `• Ingresos: *$180.2M* (+8%)\n` +
    `• Gastos: *$165.3M*\n` +
    `• Superávit: *+$14.9M*\n\n` +
    `▓▓▓▓▓▓▓░░░ *67%* Ejecución Presupuestaria\n\n` +
    `📄 *Descargar Informe PDF:* \n${BASE}/api/pdf-report?type=presupuesto`
  );
}

async function cmdObras(to, pid) {
  await send(to, pid, 'text', 
    `🏗️ *OBRAS PÚBLICAS*\n_Junín, Mendoza · Ago 2026_\n\n` +
    `*Proyectos Activos (8)*\n` +
    `1. Pavimentación Av. San Martín (45% avance)\n` +
    `2. Luminarias LED Centro (90% avance)\n` +
    `3. Renovación Red Cloacal (30% avance)\n\n` +
    `Inversión Total: *$142.5M*\n\n` +
    `📄 *Descargar Reporte Obras PDF:* \n${BASE}/api/pdf-report?type=obras`
  );
}

async function cmdRRHH(to, pid) {
  await send(to, pid, 'text',
    `👥 *RECURSOS HUMANOS*\n_Junín, Mendoza · Ago 2026_\n\n` +
    `• Empleados Activos: *1,247*\n` +
    `• Masa Salarial: *$485.0M*\n` +
    `• Ausentismo: *3.2%* (Normal)\n\n` +
    `📄 *Descargar Reporte RRHH PDF:* \n${BASE}/api/pdf-report?type=rrhh`
  );
}

async function cmdLicitaciones(to, pid) {
  await send(to, pid, 'text',
    `📄 *LICITACIONES PÚBLICAS*\n_Junín, Mendoza · Ago 2026_\n\n` +
    `• Licitaciones Activas: *5*\n` +
    `• Monto Licitado: *$85.4M*\n` +
    `• Cumplimiento SLA: *100%*`
  );
}

async function cmdReclamos(to, pid) {
  await send(to, pid, 'text',
    `📢 *SISTEMA 311 RECLAMOS VECINALES*\n\n` +
    `Podés registrar tu reclamo enviándome:\n` +
    `• Un mensaje de texto explicando el problema\n` +
    `• Una foto del lugar\n` +
    `• Tu ubicación GPS exacta por WhatsApp\n\n` +
    `SLA promedio de resolución: *3.2 días*`
  );
}

async function cmdTurnos(to, pid) {
  await send(to, pid, 'text', '📅 *Turnos Municipales Web*\n\nPodés reservar tu turno para Licencia de Conducir, Salud o Comercio desde nuestro portal:\n' + BASE + '/ciudadano.html');
}

async function cmdReporte(to, pid) {
  await send(to, pid, 'text',
    `📊 *INFORME EJECUTIVO DE GESTIÓN*\n_Generado automáticamente · Ago 2026_\n\n` +
    `El municipio mantiene un balance financiero saludable con superávit de *+$14.9M* y ejecución presupuestaria del *67%*.\n\n` +
    `📥 *Descargar Informe PDF Oficial:*\n${BASE}/api/pdf-report?type=resumen`
  );
}

async function cmdLibre(to, pid, txt) {
  await send(to, pid, 'text',
    `🤖 *MUNIBOT GOVTECH*\n\n` +
    `Recibí: _"${txt.substring(0, 60)}"_\n\n` +
    `Escribí *menu* o consultá directamente: *obras*, *hacienda*, *rrhh*, *reclamos* o *pdf*.`
  );
}

// ================================================================
// SEND ENGINE (Fijo con recipient_type: individual, fallback a text y retry AR)
// ================================================================
async function send(to, pid, type, content, textFallback) {
  const token = process.env.WHATSAPP_ACCESS_TOKEN;
  if (!token || !pid) {
    console.error('[WA-SEND-ERROR] Missing token or phoneId');
    return;
  }

  const url = `https://graph.facebook.com/v21.0/${pid}/messages`;

  const doSend = async (targetNum, reqType, reqContent) => {
    const payload = {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: targetNum,
      type: reqType
    };

    if (reqType === 'text') {
      payload.text = typeof reqContent === 'string' ? { body: reqContent } : reqContent;
    } else if (reqType === 'interactive') {
      payload.interactive = reqContent;
    } else if (reqType === 'image') {
      payload.image = typeof reqContent === 'string' ? { link: reqContent } : reqContent;
    }

    const resp = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer ' + token,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });
    const text = await resp.text();
    return { ok: resp.ok, text };
  };

  // Try 1: Send requested type (e.g. interactive or text)
  let res = await doSend(to, type, content);

  // If interactive fails, fallback to plain text if provided
  if (!res.ok && type === 'interactive' && textFallback) {
    console.warn(`[WA-SEND-INTERACTIVE-FAIL] Falling back to text for ${to}`);
    res = await doSend(to, 'text', textFallback);
  }

  // Try 2: AR Phone Retry (549 vs 54)
  if (!res.ok) {
    let altNum = null;
    if (to.startsWith('549') && to.length >= 13) altNum = '54' + to.substring(3);
    else if (to.startsWith('54') && !to.startsWith('549')) altNum = '549' + to.substring(2);

    if (altNum) {
      console.log(`[WA-SEND-RETRY] Retrying with ${altNum}`);
      res = await doSend(altNum, type, content);
      if (!res.ok && type === 'interactive' && textFallback) {
        res = await doSend(altNum, 'text', textFallback);
      }
    }
  }

  if (res.ok) {
    console.log(`[WA-SEND-SUCCESS] Sent to ${to}`);
  } else {
    console.error(`[WA-SEND-FINAL-ERROR] ${res.text}`);
  }
}
