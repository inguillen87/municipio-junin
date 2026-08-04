// api/whatsapp-webhook.js
// MuniControl WhatsApp Bot — Plantillas Profesionales con Banners
// Meta WhatsApp Business Cloud API v21.0

const BASE_URL = 'https://municipio-junin.vercel.app';
const IMG_BASE = BASE_URL + '/img/wa';

export default async function handler(req, res) {
  // GET: Webhook verification
  if (req.method === 'GET') {
    const mode = req.query['hub.mode'];
    const token = req.query['hub.verify_token'];
    const challenge = req.query['hub.challenge'];
    if (mode === 'subscribe' && token === process.env.WHATSAPP_VERIFY_TOKEN) {
      console.log('[WA] Webhook verified');
      return res.status(200).send(challenge);
    }
    return res.status(403).json({ error: 'Verification failed' });
  }

  if (req.method !== 'POST') return res.status(405).end();

  try {
    const body = req.body;
    if (body && body.object === 'whatsapp_business_account') {
      for (const entry of (body.entry || [])) {
        for (const change of (entry.changes || [])) {
          if (change.field !== 'messages') continue;
          const val = change.value || {};
          for (const msg of (val.messages || [])) {
            await processMessage(msg, val.metadata || {});
          }
        }
      }
    }
  } catch (err) {
    console.error('[WA] Error:', err.message);
  }

  return res.status(200).json({ status: 'received' });
}

// ================================================================
// MESSAGE ROUTER
// ================================================================
async function processMessage(msg, metadata) {
  const from = msg.from;
  const phoneId = metadata.phone_number_id || process.env.WHATSAPP_PHONE_ID;

  let userText = '';
  if (msg.type === 'text') {
    userText = (msg.text && msg.text.body) || '';
  } else if (msg.type === 'interactive') {
    const i = msg.interactive || {};
    userText = (i.button_reply && i.button_reply.id) || (i.list_reply && i.list_reply.id) || (i.button_reply && i.button_reply.title) || (i.list_reply && i.list_reply.title) || '';
  } else if (msg.type === 'audio') {
    await sendText(from, phoneId, 'Recibi tu audio. Escribime tu consulta como texto y te respondo al instante.');
    return;
  } else if (msg.type === 'document' || msg.type === 'image') {
    await sendText(from, phoneId, 'Recibi tu archivo. Podes subirlo en: ' + BASE_URL + '/importar.html');
    return;
  } else { return; }

  if (!userText || !userText.trim()) return;
  const t = userText.trim().toLowerCase();

  // Route commands
  if (t === 'cmd_menu' || t === '/menu' || t === 'menu' || t === 'hola' || t === 'inicio' || t === 'hi' || t.indexOf('hola') >= 0) {
    return await sendWelcome(from, phoneId);
  }
  if (t === 'cmd_obras' || t === '/obras' || t === 'obras' || t.indexOf('obra') >= 0) {
    return await sendObras(from, phoneId);
  }
  if (t === 'cmd_licitaciones' || t === '/licitaciones' || t === 'licitaciones' || t.indexOf('licitacion') >= 0) {
    return await sendLicitaciones(from, phoneId);
  }
  if (t === 'cmd_rrhh' || t === '/rrhh' || t === 'rrhh' || t === 'personal' || t.indexOf('empleado') >= 0) {
    return await sendRRHH(from, phoneId);
  }
  if (t === 'cmd_hacienda' || t === '/hacienda' || t === 'hacienda' || t === 'finanzas' || t.indexOf('gasto') >= 0 || t.indexOf('ingreso') >= 0) {
    return await sendHacienda(from, phoneId);
  }
  if (t === 'cmd_reclamos' || t === '/reclamos' || t === 'reclamos' || t === 'reclamo' || t.indexOf('reclam') >= 0) {
    return await sendReclamos(from, phoneId);
  }
  if (t === 'cmd_reporte' || t === '/reporte' || t === 'reporte' || t === 'informe' || t.indexOf('report') >= 0) {
    return await sendReporte(from, phoneId);
  }
  if (t === 'cmd_ayuda' || t === '/ayuda' || t === 'ayuda' || t === 'help') {
    return await sendAyuda(from, phoneId);
  }

  // Free query
  await sendFreeQuery(from, phoneId, userText);
}

// ================================================================
// WELCOME — Menu Principal con imagen + lista interactiva
// ================================================================
async function sendWelcome(to, phoneId) {
  // Primero enviamos la imagen de bienvenida
  await sendImageMessage(to, phoneId, IMG_BASE + '/menu.jpg', [
    '*MUNICONTROL*',
    '_Sistema de Gestion Municipal Inteligente_',
    '',
    'Bienvenido al asistente oficial del',
    'Municipio de Junin, Mendoza.',
    '',
    'Selecciona un area para consultar'
  ].join('\n'));

  // Luego el menu interactivo tipo lista
  await callAPI(to, phoneId, {
    messaging_product: 'whatsapp',
    to: '__TO__',
    type: 'interactive',
    interactive: {
      type: 'list',
      header: { type: 'text', text: 'Menu de Consultas' },
      body: { text: 'Toca el boton de abajo para ver todas las opciones disponibles. Tambien podes escribir directamente tu consulta.' },
      footer: { text: 'MuniControl v2.0 | GovTech' },
      action: {
        button: 'Abrir Menu',
        sections: [
          {
            title: 'Gestion Municipal',
            rows: [
              { id: 'cmd_obras', title: 'Obras Publicas', description: 'Avance de obras e inversiones' },
              { id: 'cmd_hacienda', title: 'Hacienda y Finanzas', description: 'Balance, gastos e ingresos' },
              { id: 'cmd_rrhh', title: 'Recursos Humanos', description: 'Nomina, ausentismo y estructura' },
              { id: 'cmd_licitaciones', title: 'Licitaciones', description: 'Contratos y adjudicaciones' },
              { id: 'cmd_reclamos', title: 'Reclamos 311', description: 'Estado de reclamos vecinales' }
            ]
          },
          {
            title: 'Inteligencia y Reportes',
            rows: [
              { id: 'cmd_reporte', title: 'Informe Ejecutivo IA', description: 'Resumen gerencial inteligente' },
              { id: 'cmd_ayuda', title: 'Ayuda y Comandos', description: 'Lista completa de comandos' }
            ]
          }
        ]
      }
    }
  });
}

// ================================================================
// OBRAS PUBLICAS
// ================================================================
async function sendObras(to, phoneId) {
  await sendRichCard(to, phoneId, IMG_BASE + '/obras.jpg', [
    '*OBRAS PUBLICAS*',
    '_Municipio de Junin | Agosto 2026_',
    '',
    '━━━━━━━━━━━━━━━━━━━━━',
    '',
    '*Resumen General*',
    'Proyectos activos ..... *8*',
    'Inversion total .......... *$142.5M*',
    'Avance promedio ...... *68%*',
    '',
    '━━━━━━━━━━━━━━━━━━━━━',
    '',
    '*Proyectos Destacados*',
    '',
    '▓▓▓▓▓▓▓▓░░ *82%*',
    'Pavimentacion Av. San Martin',
    '_Estado: En termino_',
    '',
    '▓▓▓▓▓░░░░░ *45%*',
    'Red de Agua Barrio Norte',
    '_Estado: En progreso_',
    '',
    '▓▓▓▓▓▓▓▓▓░ *95%*',
    'Luminarias LED Parque Retamo',
    '_Estado: Finalizando_',
    '',
    '━━━━━━━━━━━━━━━━━━━━━'
  ].join('\n'), [
    { type: 'reply', reply: { id: 'cmd_reporte', title: 'Informe Ejecutivo' } },
    { type: 'reply', reply: { id: 'cmd_hacienda', title: 'Ver Finanzas' } },
    { type: 'reply', reply: { id: 'cmd_menu', title: 'Menu Principal' } }
  ]);
}

// ================================================================
// HACIENDA Y FINANZAS
// ================================================================
async function sendHacienda(to, phoneId) {
  await sendRichCard(to, phoneId, IMG_BASE + '/hacienda.jpg', [
    '*HACIENDA Y FINANZAS*',
    '_Municipio de Junin | Agosto 2026_',
    '',
    '━━━━━━━━━━━━━━━━━━━━━',
    '',
    '*Balance del Mes*',
    '',
    'Ingresos ........... *$180.2M*  (+8%)',
    'Gastos .............. *$165.3M*',
    'Balance ............. *+$14.9M*',
    '',
    '▓▓▓▓▓▓▓░░░ *67%*',
    '_Ejecucion Presupuestaria Anual_',
    '',
    '━━━━━━━━━━━━━━━━━━━━━',
    '',
    '*Distribucion de Gastos*',
    '',
    '■■■■■■■■■■ Personal   51%',
    '■■■■■□□□□□ Obras      29%',
    '■■■□□□□□□□ Servicios  20%',
    '',
    '━━━━━━━━━━━━━━━━━━━━━'
  ].join('\n'), [
    { type: 'reply', reply: { id: 'cmd_reporte', title: 'Informe Ejecutivo' } },
    { type: 'reply', reply: { id: 'cmd_menu', title: 'Menu Principal' } }
  ]);
}

// ================================================================
// RECURSOS HUMANOS
// ================================================================
async function sendRRHH(to, phoneId) {
  await sendRichCard(to, phoneId, IMG_BASE + '/rrhh.jpg', [
    '*RECURSOS HUMANOS*',
    '_Municipio de Junin | Agosto 2026_',
    '',
    '━━━━━━━━━━━━━━━━━━━━━',
    '',
    '*Indicadores de Nomina*',
    '',
    'Empleados activos ..... *1,247*',
    'Masa salarial ............... *$485.0M*',
    'Horas extra (mes) ....... *4,312 hrs*',
    'Ausentismo ................. *3.2%*',
    '',
    '━━━━━━━━━━━━━━━━━━━━━',
    '',
    '*Estructura por Secretaria*',
    '',
    '■■■■■■■■□□ Serv. Publicos  410',
    '■■■■■■□□□□ Obras Publicas  340',
    '■■■■□□□□□□ Salud y Des.    215',
    '■■■□□□□□□□ Gobierno         150',
    '■■□□□□□□□□ Hacienda         132',
    '',
    '━━━━━━━━━━━━━━━━━━━━━'
  ].join('\n'), [
    { type: 'reply', reply: { id: 'cmd_hacienda', title: 'Ver Finanzas' } },
    { type: 'reply', reply: { id: 'cmd_menu', title: 'Menu Principal' } }
  ]);
}

// ================================================================
// LICITACIONES
// ================================================================
async function sendLicitaciones(to, phoneId) {
  await sendRichCard(to, phoneId, IMG_BASE + '/licitaciones.jpg', [
    '*LICITACIONES PUBLICAS*',
    '_Municipio de Junin | Agosto 2026_',
    '',
    '━━━━━━━━━━━━━━━━━━━━━',
    '',
    '*Resumen de Contrataciones*',
    '',
    'Procesos activos ........ *5*',
    'Monto total licitado ... *$85.4M*',
    'Cumplimiento SLA ..... *100%*',
    '',
    '━━━━━━━━━━━━━━━━━━━━━',
    '',
    '*Ultimas Adjudicaciones*',
    '',
    '1. *Const. Barrial S.A.*',
    '   $32.0M - Obra civil',
    '',
    '2. *Insumos Cuyo SRL*',
    '   $14.2M - Insumos de salud',
    '',
    '3. *Electricidad Junin*',
    '   $9.8M - Servicios electricos',
    '',
    '━━━━━━━━━━━━━━━━━━━━━'
  ].join('\n'), [
    { type: 'reply', reply: { id: 'cmd_obras', title: 'Ver Obras' } },
    { type: 'reply', reply: { id: 'cmd_menu', title: 'Menu Principal' } }
  ]);
}

// ================================================================
// RECLAMOS 311
// ================================================================
async function sendReclamos(to, phoneId) {
  await sendRichCard(to, phoneId, IMG_BASE + '/reclamos.jpg', [
    '*RECLAMOS 311*',
    '_Servicios Urbanos | Junin, Mendoza_',
    '',
    '━━━━━━━━━━━━━━━━━━━━━',
    '',
    '*Panel de Control*',
    '',
    'Total reclamos .......... *318*',
    'Resueltos ................... *295*  (92.7%)',
    'En proceso ................. *23*',
    'Tiempo promedio ........ *3.2 dias*',
    '',
    '▓▓▓▓▓▓▓▓▓░ *92.7% resueltos*',
    '',
    '━━━━━━━━━━━━━━━━━━━━━',
    '',
    '*Top Categorias*',
    '',
    '■■■■■■■■■■ Alumbrado   112',
    '■■■■■■■□□□ Baches       85',
    '■■■■■□□□□□ Arbolado      64',
    '■■■□□□□□□□ Limpieza      57',
    '',
    '━━━━━━━━━━━━━━━━━━━━━'
  ].join('\n'), [
    { type: 'reply', reply: { id: 'cmd_reporte', title: 'Informe Ejecutivo' } },
    { type: 'reply', reply: { id: 'cmd_menu', title: 'Menu Principal' } }
  ]);
}

// ================================================================
// INFORME EJECUTIVO
// ================================================================
async function sendReporte(to, phoneId) {
  await sendRichCard(to, phoneId, IMG_BASE + '/reporte.jpg', [
    '*INFORME EJECUTIVO*',
    '_Generado por IA | Agosto 2026_',
    '',
    '━━━━━━━━━━━━━━━━━━━━━',
    '',
    '*Analisis Sintetico*',
    '',
    'El municipio mantiene un balance',
    'financiero saludable con superavit',
    'de $14.9M y ejecucion presupuestaria',
    'del 67%. Las obras prioritarias',
    'avanzan al 68% y los reclamos',
    'se resuelven en 3.2 dias promedio.',
    '',
    '━━━━━━━━━━━━━━━━━━━━━',
    '',
    '*Tablero de Indicadores*',
    '',
    'Finanzas .... +$14.9M .... OK',
    'Obras ......... 68% avance .. OK',
    'RRHH ......... 3.2% ausent. . OK',
    'Reclamos ... 92.7% resol. .. OK',
    'SLA ............. 94.1% ........... OK',
    '',
    '━━━━━━━━━━━━━━━━━━━━━',
    '',
    '_Reporte completo en el Dashboard_'
  ].join('\n'), [
    { type: 'reply', reply: { id: 'cmd_hacienda', title: 'Ver Finanzas' } },
    { type: 'reply', reply: { id: 'cmd_menu', title: 'Menu Principal' } }
  ]);
}

// ================================================================
// AYUDA
// ================================================================
async function sendAyuda(to, phoneId) {
  await sendText(to, phoneId, [
    '*MUNICONTROL — AYUDA*',
    '',
    '━━━━━━━━━━━━━━━━━━━━━',
    '',
    '*Comandos Disponibles*',
    '',
    '*obras*       Avance de obras publicas',
    '*hacienda*  Balance financiero',
    '*rrhh*         Nomina y personal',
    '*licitaciones*  Contratos publicos',
    '*reclamos*  Reclamos vecinales 311',
    '*reporte*     Informe ejecutivo con IA',
    '*menu*        Menu interactivo',
    '',
    '━━━━━━━━━━━━━━━━━━━━━',
    '',
    'Tambien podes escribir cualquier',
    'pregunta en lenguaje natural.',
    '',
    '_MuniControl v2.0 | GovTech_'
  ].join('\n'));
}

// ================================================================
// CONSULTA LIBRE
// ================================================================
async function sendFreeQuery(to, phoneId, userText) {
  try {
    const lower = userText.toLowerCase();
    if (lower.indexOf('gasto') >= 0 || lower.indexOf('presupuesto') >= 0 || lower.indexOf('cuanto') >= 0) {
      return await sendHacienda(to, phoneId);
    }
    await sendText(to, phoneId, [
      '*MUNIBOT — Asistente IA*',
      '',
      'Recibi tu consulta:',
      '_"' + userText + '"_',
      '',
      'El Municipio de Junin mantiene',
      'todas las areas operativas',
      'funcionando con normalidad.',
      '',
      'Para consultas especificas usa',
      'los comandos del *menu*.',
      '',
      'Dashboard: ' + BASE_URL + '/index.html',
      '',
      '_MuniControl v2.0 | GovTech_'
    ].join('\n'));
  } catch (e) {
    await sendText(to, phoneId, 'MuniControl: Visita ' + BASE_URL + '/index.html');
  }
}

// ================================================================
// SEND HELPERS
// ================================================================

// Enviar imagen con caption (para bienvenida)
async function sendImageMessage(to, phoneId, imageUrl, caption) {
  await callAPI(to, phoneId, {
    messaging_product: 'whatsapp',
    to: '__TO__',
    type: 'image',
    image: {
      link: imageUrl,
      caption: caption
    }
  });
}

// Enviar tarjeta rica: imagen + texto + botones
async function sendRichCard(to, phoneId, imageUrl, bodyText, buttons) {
  // Enviar imagen con datos como caption
  await callAPI(to, phoneId, {
    messaging_product: 'whatsapp',
    to: '__TO__',
    type: 'interactive',
    interactive: {
      type: 'button',
      header: {
        type: 'image',
        image: { link: imageUrl }
      },
      body: { text: bodyText },
      footer: { text: 'Municipalidad de Junin | MuniControl' },
      action: {
        buttons: buttons.slice(0, 3)
      }
    }
  });
}

// Enviar texto simple
async function sendText(to, phoneId, body) {
  await callAPI(to, phoneId, {
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to: '__TO__',
    type: 'text',
    text: { preview_url: true, body: body }
  });
}

// ================================================================
// CORE API CALLER (con workaround AR/MX)
// ================================================================
async function callAPI(to, phoneId, payload) {
  const token = process.env.WHATSAPP_ACCESS_TOKEN;
  if (!token || !phoneId) {
    console.error('[WA] Missing token or phoneId');
    return;
  }

  const url = 'https://graph.facebook.com/v21.0/' + phoneId + '/messages';

  const doSend = async (recipient) => {
    // Replace __TO__ placeholder with actual recipient
    const body = JSON.stringify(payload).replace(/"__TO__"/g, '"' + recipient + '"');
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer ' + token,
        'Content-Type': 'application/json'
      },
      body: body
    });
    const text = await response.text();
    return { ok: response.ok, status: response.status, text: text };
  };

  let result = await doSend(to);

  if (!result.ok && result.text.indexOf('131030') >= 0) {
    // Argentina phone number format workaround
    let alt = null;
    if (to.startsWith('549') && to.length >= 13) {
      alt = '54' + to.substring(3);
    } else if (to.startsWith('54') && !to.startsWith('549') && to.length >= 12) {
      alt = '549' + to.substring(2);
    }
    if (alt) {
      console.log('[WA] Retry with:', alt);
      result = await doSend(alt);
    }
  }

  if (result.ok) {
    console.log('[WA] Sent OK to', to);
  } else {
    console.error('[WA] FAIL:', result.status, result.text.substring(0, 200));
  }
}
