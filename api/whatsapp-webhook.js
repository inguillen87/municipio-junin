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
    console.error('[WA]', err.message);
  }
  return res.status(200).json({ ok: true });
}

// ================================================================
// ROUTER
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
  } else {
    return;
  }

  if (!txt || !txt.trim()) return;
  const t = txt.trim().toLowerCase();

  if (t === 'cmd_menu' || t === 'menu' || t === 'hola' || t === 'inicio' || (t.indexOf('hola') >= 0 && t.length < 20)) return await cmdMenu(from, pid);
  if (t === 'cmd_obras' || t === 'obras' || t.indexOf('obra') >= 0) return await cmdObras(from, pid);
  if (t === 'cmd_licitaciones' || t === 'licitaciones' || t.indexOf('licitacion') >= 0) return await cmdLicitaciones(from, pid);
  if (t === 'cmd_rrhh' || t === 'rrhh' || t === 'personal' || t.indexOf('empleado') >= 0) return await cmdRRHH(from, pid);
  if (t === 'cmd_hacienda' || t === 'hacienda' || t === 'finanzas' || t.indexOf('gasto') >= 0 || t.indexOf('presupuesto') >= 0 || t.indexOf('cuanto') >= 0) return await cmdHacienda(from, pid);
  if (t === 'cmd_reclamos' || t === 'reclamos' || t.indexOf('reclam') >= 0) return await cmdReclamos(from, pid);
  if (t === 'cmd_reporte' || t === 'reporte' || t === 'informe' || t.indexOf('report') >= 0) return await cmdReporte(from, pid);
  if (t === 'cmd_ayuda' || t === 'ayuda' || t === 'help') return await cmdAyuda(from, pid);

  await cmdLibre(from, pid, txt);
}

// ================================================================
// MENU — Lista interactiva (1 solo mensaje limpio)
// ================================================================
async function cmdMenu(to, pid) {
  await send(to, pid, 'interactive', {
    type: 'list',
    header: { type: 'text', text: 'MUNICONTROL' },
    body: { text: 'Bienvenido al sistema de gestion inteligente del Municipio de Junin, Mendoza.\n\nSelecciona un area para consultar informacion en tiempo real.' },
    footer: { text: 'v2.0 | GovTech Argentina' },
    action: {
      button: 'Ver Areas',
      sections: [
        {
          title: 'Gestion Municipal',
          rows: [
            { id: 'cmd_obras', title: 'Obras Publicas', description: '8 proyectos | $142.5M invertidos' },
            { id: 'cmd_hacienda', title: 'Hacienda y Finanzas', description: 'Balance +$14.9M | 67% ejec.' },
            { id: 'cmd_rrhh', title: 'Recursos Humanos', description: '1,247 empleados | 3.2% ausent.' },
            { id: 'cmd_licitaciones', title: 'Licitaciones', description: '5 procesos | $85.4M licitados' },
            { id: 'cmd_reclamos', title: 'Reclamos 311', description: '92.7% resueltos | 3.2 dias prom.' }
          ]
        },
        {
          title: 'Inteligencia',
          rows: [
            { id: 'cmd_reporte', title: 'Informe Ejecutivo IA', description: 'Analisis sintetico inteligente' },
            { id: 'cmd_ayuda', title: 'Ayuda', description: 'Lista de comandos' }
          ]
        }
      ]
    }
  });
}

// ================================================================
// OBRAS — Botones interactivos (1 solo mensaje)
// ================================================================
async function cmdObras(to, pid) {
  await send(to, pid, 'interactive', {
    type: 'button',
    body: { text: '🏗 *OBRAS PUBLICAS*\n_Junin, Mendoza · Ago 2026_\n\n━━━━━━━━━━━━━━━━\n\n*Resumen*\nProyectos activos .... *8*\nInversion total .......... *$142.5M*\nAvance promedio ...... *68%*\n\n*Destacados*\n▓▓▓▓▓▓▓▓░░ 82% Pav. Av. San Martin\n▓▓▓▓▓░░░░░ 45% Red Agua B. Norte\n▓▓▓▓▓▓▓▓▓░ 95% LED Parque Retamo\n\n━━━━━━━━━━━━━━━━' },
    footer: { text: 'MuniControl · GovTech' },
    action: {
      buttons: [
        { type: 'reply', reply: { id: 'cmd_reporte', title: 'Informe Ejecutivo' } },
        { type: 'reply', reply: { id: 'cmd_hacienda', title: 'Ver Finanzas' } },
        { type: 'reply', reply: { id: 'cmd_menu', title: 'Menu' } }
      ]
    }
  });
}

// ================================================================
// HACIENDA
// ================================================================
async function cmdHacienda(to, pid) {
  await send(to, pid, 'interactive', {
    type: 'button',
    body: { text: '💰 *HACIENDA Y FINANZAS*\n_Junin, Mendoza · Ago 2026_\n\n━━━━━━━━━━━━━━━━\n\n*Balance Mensual*\nIngresos ........... *$180.2M* (+8%)\nGastos .............. *$165.3M*\nSuperavit .......... *+$14.9M*\n\n▓▓▓▓▓▓▓░░░ *67%* Ejec. Presupuestaria\n\n*Distribucion*\n■■■■■■■■■■ Personal    51%\n■■■■■□□□□□ Obras         29%\n■■■□□□□□□□ Servicios    20%\n\n━━━━━━━━━━━━━━━━' },
    footer: { text: 'MuniControl · GovTech' },
    action: {
      buttons: [
        { type: 'reply', reply: { id: 'cmd_reporte', title: 'Informe Ejecutivo' } },
        { type: 'reply', reply: { id: 'cmd_menu', title: 'Menu' } }
      ]
    }
  });
}

// ================================================================
// RRHH
// ================================================================
async function cmdRRHH(to, pid) {
  await send(to, pid, 'interactive', {
    type: 'button',
    body: { text: '👥 *RECURSOS HUMANOS*\n_Junin, Mendoza · Ago 2026_\n\n━━━━━━━━━━━━━━━━\n\n*Indicadores*\nEmpleados activos ..... *1,247*\nMasa salarial ............... *$485.0M*\nHoras extra .................. *4,312 hrs*\nAusentismo ................. *3.2%*\n\n*Estructura*\n■■■■■■■■□□ Serv. Publicos  410\n■■■■■■□□□□ Obras Pub.       340\n■■■■□□□□□□ Salud y Des.    215\n■■■□□□□□□□ Gobierno          150\n\n━━━━━━━━━━━━━━━━' },
    footer: { text: 'MuniControl · GovTech' },
    action: {
      buttons: [
        { type: 'reply', reply: { id: 'cmd_hacienda', title: 'Ver Finanzas' } },
        { type: 'reply', reply: { id: 'cmd_menu', title: 'Menu' } }
      ]
    }
  });
}

// ================================================================
// LICITACIONES
// ================================================================
async function cmdLicitaciones(to, pid) {
  await send(to, pid, 'interactive', {
    type: 'button',
    body: { text: '📄 *LICITACIONES PUBLICAS*\n_Junin, Mendoza · Ago 2026_\n\n━━━━━━━━━━━━━━━━\n\n*Resumen*\nProcesos activos ........ *5*\nMonto licitado ............ *$85.4M*\nCumplimiento SLA ..... *100%*\n\n*Adjudicaciones*\n1. Const. Barrial S.A. — *$32.0M*\n2. Insumos Cuyo SRL — *$14.2M*\n3. Electricidad Junin — *$9.8M*\n\n━━━━━━━━━━━━━━━━' },
    footer: { text: 'MuniControl · GovTech' },
    action: {
      buttons: [
        { type: 'reply', reply: { id: 'cmd_obras', title: 'Ver Obras' } },
        { type: 'reply', reply: { id: 'cmd_menu', title: 'Menu' } }
      ]
    }
  });
}

// ================================================================
// RECLAMOS
// ================================================================
async function cmdReclamos(to, pid) {
  await send(to, pid, 'interactive', {
    type: 'button',
    body: { text: '📢 *RECLAMOS 311*\n_Junin, Mendoza · Ago 2026_\n\n━━━━━━━━━━━━━━━━\n\n*Panel de Control*\nTotal reclamos .......... *318*\nResueltos ................... *295* (92.7%)\nEn proceso ................. *23*\nTiempo prom. ............ *3.2 dias*\n\n▓▓▓▓▓▓▓▓▓░ *92.7%* resueltos\n\n*Top Categorias*\n1. Alumbrado .... 112 casos\n2. Baches ........... 85 casos\n3. Arbolado ........ 64 casos\n\n━━━━━━━━━━━━━━━━' },
    footer: { text: 'MuniControl · GovTech' },
    action: {
      buttons: [
        { type: 'reply', reply: { id: 'cmd_reporte', title: 'Informe Ejecutivo' } },
        { type: 'reply', reply: { id: 'cmd_menu', title: 'Menu' } }
      ]
    }
  });
}

// ================================================================
// REPORTE
// ================================================================
async function cmdReporte(to, pid) {
  await send(to, pid, 'interactive', {
    type: 'button',
    body: { text: '📊 *INFORME EJECUTIVO*\n_Generado por IA · Ago 2026_\n\n━━━━━━━━━━━━━━━━\n\nEl municipio mantiene un balance financiero saludable con superavit de *+$14.9M* y ejecucion presupuestaria del *67%*. Las obras avanzan al 68% y el SLA de reclamos alcanza el 94.1%.\n\n*Tablero*\n✅ Finanzas ... +$14.9M\n✅ Obras ........ 68% avance\n✅ RRHH ........ 3.2% ausent.\n✅ Reclamos .. 92.7% resol.\n✅ SLA ............ 94.1%\n\n━━━━━━━━━━━━━━━━' },
    footer: { text: 'MuniControl · GovTech' },
    action: {
      buttons: [
        { type: 'reply', reply: { id: 'cmd_hacienda', title: 'Ver Finanzas' } },
        { type: 'reply', reply: { id: 'cmd_obras', title: 'Ver Obras' } },
        { type: 'reply', reply: { id: 'cmd_menu', title: 'Menu' } }
      ]
    }
  });
}

// ================================================================
// AYUDA
// ================================================================
async function cmdAyuda(to, pid) {
  await send(to, pid, 'interactive', {
    type: 'button',
    body: { text: '❓ *AYUDA — MUNICONTROL*\n\n*Comandos:*\n• *obras* — Obras publicas\n• *hacienda* — Finanzas\n• *rrhh* — Personal\n• *licitaciones* — Contratos\n• *reclamos* — Reclamos 311\n• *reporte* — Informe IA\n\nO escribi cualquier pregunta.' },
    footer: { text: 'MuniControl · GovTech' },
    action: {
      buttons: [
        { type: 'reply', reply: { id: 'cmd_menu', title: 'Menu' } }
      ]
    }
  });
}

// ================================================================
// LIBRE
// ================================================================
async function cmdLibre(to, pid, txt) {
  await send(to, pid, 'interactive', {
    type: 'button',
    body: { text: '🤖 *MUNIBOT*\n\nRecibi: _"' + txt.substring(0, 80) + '"_\n\nPara datos especificos usa el menu.' },
    footer: { text: 'MuniControl · GovTech' },
    action: {
      buttons: [
        { type: 'reply', reply: { id: 'cmd_menu', title: 'Menu' } }
      ]
    }
  });
}

// ================================================================
// SEND (1 solo mensaje por interaccion, con retry AR)
// ================================================================
async function send(to, pid, type, content) {
  const token = process.env.WHATSAPP_ACCESS_TOKEN;
  if (!token || !pid) return;

  var payload = { messaging_product: 'whatsapp', to: 'X', type: type };
  if (type === 'text') payload.text = content;
  else if (type === 'image') payload.image = content;
  else if (type === 'interactive') payload.interactive = content;

  var url = 'https://graph.facebook.com/v21.0/' + pid + '/messages';

  var doSend = async function(r) {
    var b = JSON.stringify(payload).replace('"X"', '"' + r + '"');
    var resp = await fetch(url, {
      method: 'POST',
      headers: { 'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json' },
      body: b
    });
    var t = await resp.text();
    return { ok: resp.ok, t: t };
  };

  var res = await doSend(to);
  if (!res.ok && res.t.indexOf('131030') >= 0) {
    var alt = null;
    if (to.startsWith('549') && to.length >= 13) alt = '54' + to.substring(3);
    else if (to.startsWith('54') && !to.startsWith('549')) alt = '549' + to.substring(2);
    if (alt) res = await doSend(alt);
  }
  if (!res.ok) console.error('[WA]', res.t.substring(0, 200));
}
