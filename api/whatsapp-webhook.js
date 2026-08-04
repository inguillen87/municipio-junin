// api/whatsapp-webhook.js
// MuniControl WhatsApp Bot v2 — Professional Templates
// Meta WhatsApp Business Cloud API v21.0

const BASE = 'https://municipio-junin.vercel.app';
const IMG = BASE + '/img/wa';

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
    if (msg.type === 'audio' || msg.type === 'image' || msg.type === 'document') {
      await send(from, pid, 'text', { body: 'Recibi tu archivo. Escribime tu consulta como texto.' });
    }
    return;
  }

  if (!txt || !txt.trim()) return;
  const t = txt.trim().toLowerCase();
  console.log('[WA] from:', from, 'cmd:', t);

  // Command routing
  if (t === 'cmd_menu' || t === 'menu' || t === 'hola' || t === 'inicio' || (t.indexOf('hola') >= 0 && t.length < 20)) {
    return await cmdMenu(from, pid);
  }
  if (t === 'cmd_obras' || t === 'obras' || t.indexOf('obra') >= 0) {
    return await cmdObras(from, pid);
  }
  if (t === 'cmd_licitaciones' || t === 'licitaciones' || t.indexOf('licitacion') >= 0) {
    return await cmdLicitaciones(from, pid);
  }
  if (t === 'cmd_rrhh' || t === 'rrhh' || t === 'personal' || t.indexOf('empleado') >= 0) {
    return await cmdRRHH(from, pid);
  }
  if (t === 'cmd_hacienda' || t === 'hacienda' || t === 'finanzas' || t.indexOf('gasto') >= 0 || t.indexOf('presupuesto') >= 0 || t.indexOf('cuanto') >= 0) {
    return await cmdHacienda(from, pid);
  }
  if (t === 'cmd_reclamos' || t === 'reclamos' || t.indexOf('reclam') >= 0) {
    return await cmdReclamos(from, pid);
  }
  if (t === 'cmd_reporte' || t === 'reporte' || t === 'informe' || t.indexOf('report') >= 0) {
    return await cmdReporte(from, pid);
  }
  if (t === 'cmd_ayuda' || t === 'ayuda' || t === 'help') {
    return await cmdAyuda(from, pid);
  }

  // Free query fallback
  await cmdLibre(from, pid, txt);
}

// ================================================================
// MENU PRINCIPAL
// ================================================================
async function cmdMenu(to, pid) {
  await send(to, pid, 'interactive', {
    type: 'list',
    header: { type: 'text', text: 'MuniControl - Junin' },
    body: { text: 'Hola! Soy *MuniBot*, tu asistente inteligente del Municipio de Junin, Mendoza.\n\nElegi un area para consultar:' },
    footer: { text: 'MuniControl v2.0 | GovTech' },
    action: {
      button: 'Abrir Menu',
      sections: [
        {
          title: 'Gestion Municipal',
          rows: [
            { id: 'cmd_obras', title: 'Obras Publicas', description: 'Avance de obras e inversiones' },
            { id: 'cmd_hacienda', title: 'Hacienda y Finanzas', description: 'Balance, gastos e ingresos' },
            { id: 'cmd_rrhh', title: 'Recursos Humanos', description: 'Nomina y estructura' },
            { id: 'cmd_licitaciones', title: 'Licitaciones', description: 'Contratos y adjudicaciones' },
            { id: 'cmd_reclamos', title: 'Reclamos 311', description: 'Servicios urbanos' }
          ]
        },
        {
          title: 'Inteligencia',
          rows: [
            { id: 'cmd_reporte', title: 'Informe Ejecutivo', description: 'Resumen con IA' },
            { id: 'cmd_ayuda', title: 'Ayuda', description: 'Comandos disponibles' }
          ]
        }
      ]
    }
  });
}

// ================================================================
// OBRAS
// ================================================================
async function cmdObras(to, pid) {
  await send(to, pid, 'image', {
    link: IMG + '/obras.jpg',
    caption: [
      '*OBRAS PUBLICAS*',
      '_Municipio de Junin | Agosto 2026_',
      '',
      'Proyectos activos .... *8*',
      'Inversion total ........... *$142.5M*',
      'Avance promedio ...... *68%*',
      '',
      '▓▓▓▓▓▓▓▓░░ *82%* Av. San Martin',
      '▓▓▓▓▓░░░░░ *45%* Red Agua B.Norte',
      '▓▓▓▓▓▓▓▓▓░ *95%* LED Parque Retamo'
    ].join('\n')
  });
  await navButtons(to, pid, 'Queres ver otro modulo?', [
    { id: 'cmd_reporte', title: 'Informe Ejecutivo' },
    { id: 'cmd_hacienda', title: 'Ver Finanzas' },
    { id: 'cmd_menu', title: 'Menu Principal' }
  ]);
}

// ================================================================
// HACIENDA
// ================================================================
async function cmdHacienda(to, pid) {
  await send(to, pid, 'image', {
    link: IMG + '/hacienda.jpg',
    caption: [
      '*HACIENDA Y FINANZAS*',
      '_Municipio de Junin | Agosto 2026_',
      '',
      'Ingresos ........... *$180.2M* (+8%)',
      'Gastos .............. *$165.3M*',
      'Balance ............. *+$14.9M*',
      '',
      '▓▓▓▓▓▓▓░░░ *67%* Ejec. Presup.',
      '',
      '*Distribucion:*',
      '■■■■■■■■■■ Personal   51%',
      '■■■■■□□□□□ Obras      29%',
      '■■■□□□□□□□ Servicios  20%'
    ].join('\n')
  });
  await navButtons(to, pid, 'Queres ver otro modulo?', [
    { id: 'cmd_reporte', title: 'Informe Ejecutivo' },
    { id: 'cmd_menu', title: 'Menu Principal' }
  ]);
}

// ================================================================
// RRHH
// ================================================================
async function cmdRRHH(to, pid) {
  await send(to, pid, 'image', {
    link: IMG + '/rrhh.jpg',
    caption: [
      '*RECURSOS HUMANOS*',
      '_Municipio de Junin | Agosto 2026_',
      '',
      'Empleados activos ..... *1,247*',
      'Masa salarial ............... *$485.0M*',
      'Horas extra .................. *4,312 hrs*',
      'Ausentismo ................. *3.2%*',
      '',
      '*Distribucion:*',
      '■■■■■■■■□□ Serv. Publicos  410',
      '■■■■■■□□□□ Obras            340',
      '■■■■□□□□□□ Salud             215'
    ].join('\n')
  });
  await navButtons(to, pid, 'Queres ver otro modulo?', [
    { id: 'cmd_hacienda', title: 'Ver Finanzas' },
    { id: 'cmd_menu', title: 'Menu Principal' }
  ]);
}

// ================================================================
// LICITACIONES
// ================================================================
async function cmdLicitaciones(to, pid) {
  await send(to, pid, 'image', {
    link: IMG + '/licitaciones.jpg',
    caption: [
      '*LICITACIONES PUBLICAS*',
      '_Municipio de Junin | Agosto 2026_',
      '',
      'Procesos activos ........ *5*',
      'Monto licitado ............ *$85.4M*',
      'Cumplimiento SLA ..... *100%*',
      '',
      '*Adjudicaciones:*',
      '1. Const. Barrial S.A. *$32.0M*',
      '2. Insumos Cuyo SRL *$14.2M*',
      '3. Electricidad Junin *$9.8M*'
    ].join('\n')
  });
  await navButtons(to, pid, 'Queres ver otro modulo?', [
    { id: 'cmd_obras', title: 'Ver Obras' },
    { id: 'cmd_menu', title: 'Menu Principal' }
  ]);
}

// ================================================================
// RECLAMOS
// ================================================================
async function cmdReclamos(to, pid) {
  await send(to, pid, 'image', {
    link: IMG + '/reclamos.jpg',
    caption: [
      '*RECLAMOS 311*',
      '_Junin, Mendoza | Agosto 2026_',
      '',
      'Total reclamos .......... *318*',
      'Resueltos ................... *295* (92.7%)',
      'Pendientes ................. *23*',
      'Tiempo promedio ........ *3.2 dias*',
      '',
      '▓▓▓▓▓▓▓▓▓░ *92.7%* resueltos',
      '',
      '*Top categorias:*',
      '1. Alumbrado .... 112 casos',
      '2. Baches ........... 85 casos',
      '3. Arbolado ........ 64 casos'
    ].join('\n')
  });
  await navButtons(to, pid, 'Queres ver otro modulo?', [
    { id: 'cmd_reporte', title: 'Informe Ejecutivo' },
    { id: 'cmd_menu', title: 'Menu Principal' }
  ]);
}

// ================================================================
// REPORTE EJECUTIVO
// ================================================================
async function cmdReporte(to, pid) {
  await send(to, pid, 'image', {
    link: IMG + '/reporte.jpg',
    caption: [
      '*INFORME EJECUTIVO*',
      '_Generado por IA | Agosto 2026_',
      '',
      'Balance financiero saludable',
      'con superavit de *+$14.9M* y',
      'ejecucion presupuestaria del *67%*.',
      '',
      '*Indicadores:*',
      'Finanzas ... +$14.9M ...... OK',
      'Obras ........ 68% avance . OK',
      'RRHH ........ 3.2% ausent. OK',
      'Reclamos .. 92.7% resol. OK',
      'SLA ............ 94.1% .......... OK'
    ].join('\n')
  });
  await navButtons(to, pid, 'Queres ver otro modulo?', [
    { id: 'cmd_hacienda', title: 'Ver Finanzas' },
    { id: 'cmd_obras', title: 'Ver Obras' },
    { id: 'cmd_menu', title: 'Menu Principal' }
  ]);
}

// ================================================================
// AYUDA
// ================================================================
async function cmdAyuda(to, pid) {
  await send(to, pid, 'text', {
    body: [
      '*MUNICONTROL — AYUDA*',
      '',
      '*obras* — Avance de obras',
      '*hacienda* — Balance financiero',
      '*rrhh* — Nomina y personal',
      '*licitaciones* — Contratos',
      '*reclamos* — Reclamos 311',
      '*reporte* — Informe ejecutivo IA',
      '*menu* — Menu interactivo',
      '',
      'O escribi cualquier pregunta.'
    ].join('\n')
  });
}

// ================================================================
// CONSULTA LIBRE
// ================================================================
async function cmdLibre(to, pid, txt) {
  await send(to, pid, 'text', {
    body: [
      '*MUNIBOT — Asistente IA*',
      '',
      'Recibi: _"' + txt.substring(0, 100) + '"_',
      '',
      'Para consultas especificas',
      'escribi *menu* y elegi un area.',
      '',
      '_MuniControl v2.0_'
    ].join('\n')
  });
}

// ================================================================
// NAV BUTTONS (separate message for reliability)
// ================================================================
async function navButtons(to, pid, text, btns) {
  await send(to, pid, 'interactive', {
    type: 'button',
    body: { text: text },
    footer: { text: 'MuniControl | GovTech' },
    action: {
      buttons: btns.slice(0, 3).map(function(b) {
        return { type: 'reply', reply: { id: b.id, title: b.title } };
      })
    }
  });
}

// ================================================================
// CORE SENDER
// ================================================================
async function send(to, pid, type, content) {
  const token = process.env.WHATSAPP_ACCESS_TOKEN;
  if (!token || !pid) return;

  var payload = { messaging_product: 'whatsapp', to: '__REPLACE__', type: type };
  if (type === 'text') payload.text = content;
  else if (type === 'image') payload.image = content;
  else if (type === 'interactive') payload.interactive = content;
  else return;

  var url = 'https://graph.facebook.com/v21.0/' + pid + '/messages';

  var doSend = async function(recipient) {
    var body = JSON.stringify(payload).replace('"__REPLACE__"', '"' + recipient + '"');
    var r = await fetch(url, {
      method: 'POST',
      headers: { 'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json' },
      body: body
    });
    var t = await r.text();
    return { ok: r.ok, s: r.status, t: t };
  };

  var res = await doSend(to);

  if (!res.ok && res.t.indexOf('131030') >= 0) {
    var alt = null;
    if (to.startsWith('549') && to.length >= 13) alt = '54' + to.substring(3);
    else if (to.startsWith('54') && !to.startsWith('549') && to.length >= 12) alt = '549' + to.substring(2);
    if (alt) {
      console.log('[WA] retry:', alt);
      res = await doSend(alt);
    }
  }

  if (!res.ok) console.error('[WA] FAIL:', res.s, res.t.substring(0, 200));
  else console.log('[WA] OK to', to);
}
