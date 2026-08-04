// api/whatsapp-webhook.js
// Meta WhatsApp Business Cloud API - Webhook
// Docs: https://developers.facebook.com/docs/whatsapp/cloud-api

export default async function handler(req, res) {
  // GET: Webhook verification
  if (req.method === 'GET') {
    const mode = req.query['hub.mode'];
    const token = req.query['hub.verify_token'];
    const challenge = req.query['hub.challenge'];

    if (mode === 'subscribe' && token === process.env.WHATSAPP_VERIFY_TOKEN) {
      console.log('[WA] Webhook verified OK');
      return res.status(200).send(challenge);
    }
    return res.status(403).json({ error: 'Verification failed' });
  }

  // POST: Incoming messages
  if (req.method !== 'POST') {
    return res.status(405).end();
  }

  try {
    const body = req.body;
    console.log('[WA] Webhook POST received:', JSON.stringify(body).substring(0, 500));

    if (body && body.object === 'whatsapp_business_account') {
      const entries = body.entry || [];
      for (const entry of entries) {
        const changes = entry.changes || [];
        for (const change of changes) {
          if (change.field !== 'messages') continue;
          const value = change.value || {};
          const messages = value.messages || [];
          const metadata = value.metadata || {};

          for (const msg of messages) {
            console.log('[WA] Processing message from:', msg.from, 'type:', msg.type, 'phoneId:', metadata.phone_number_id);
            await processMessage(msg, metadata);
          }
        }
      }
    }
  } catch (err) {
    console.error('[WA] Webhook error:', err.message, err.stack);
  }

  return res.status(200).json({ status: 'received' });
}

// ========================================
// PROCESS MESSAGE
// ========================================
async function processMessage(msg, metadata) {
  const from = msg.from;
  const phoneId = metadata.phone_number_id || process.env.WHATSAPP_PHONE_ID;
  const msgType = msg.type;

  let userText = '';

  if (msgType === 'text') {
    userText = (msg.text && msg.text.body) ? msg.text.body : '';
  } else if (msgType === 'interactive') {
    const inter = msg.interactive || {};
    if (inter.button_reply) {
      userText = inter.button_reply.id || inter.button_reply.title || '';
    } else if (inter.list_reply) {
      userText = inter.list_reply.id || inter.list_reply.title || '';
    }
  } else if (msgType === 'audio') {
    await sendText(from, phoneId, 'Recibi tu audio. Por ahora procesamos mensajes de texto. Escribime tu consulta y te respondo al instante.');
    return;
  } else if (msgType === 'document' || msgType === 'image') {
    await sendText(from, phoneId, 'Recibi tu archivo. Podes gestionarlo en el Hub de Datos: https://municipio-junin.vercel.app/importar.html');
    return;
  } else {
    return;
  }

  if (!userText || !userText.trim()) return;

  const text = userText.trim().toLowerCase();
  console.log('[WA] Parsed user text:', text);

  // 1. Comandos directos
  if (text === 'cmd_menu' || text === '/menu' || text === 'menu' || text === 'hola' || text === 'inicio' || text.indexOf('hola') >= 0) {
    await sendMenuPrincipal(from, phoneId);
    return;
  }

  if (text === 'cmd_obras' || text === '/obras' || text === 'obras' || text.indexOf('obra') >= 0) {
    await replyObras(from, phoneId);
    return;
  }

  if (text === 'cmd_licitaciones' || text === '/licitaciones' || text === 'licitaciones' || text.indexOf('licitacion') >= 0) {
    await replyLicitaciones(from, phoneId);
    return;
  }

  if (text === 'cmd_rrhh' || text === '/rrhh' || text === 'rrhh' || text === 'personal' || text === 'empleados' || text.indexOf('empleado') >= 0) {
    await replyRRHH(from, phoneId);
    return;
  }

  if (text === 'cmd_hacienda' || text === '/hacienda' || text === 'hacienda' || text === 'finanzas' || text.indexOf('gasto') >= 0 || text.indexOf('ingreso') >= 0) {
    await replyHacienda(from, phoneId);
    return;
  }

  if (text === 'cmd_reclamos' || text === '/reclamos' || text === 'reclamos' || text === 'reclamo' || text.indexOf('reclam') >= 0) {
    await replyReclamos(from, phoneId);
    return;
  }

  if (text === 'cmd_reporte' || text === '/reporte' || text === 'reporte' || text === 'informe' || text.indexOf('report') >= 0) {
    await replyReporte(from, phoneId);
    return;
  }

  if (text === 'cmd_ayuda' || text === '/ayuda' || text === 'ayuda' || text === 'help') {
    await replyAyuda(from, phoneId);
    return;
  }

  // 2. Consulta libre
  await replyLibre(from, phoneId, userText);
}

// ========================================
// HANDLERS - Rich responses con botones
// ========================================

async function replyObras(from, phoneId) {
  const body = [
    '*MuniControl - Obras Publicas*',
    'Junin, Mendoza | Agosto 2026',
    '',
    '*Estado General:*',
    '- Obras Activas: *8 proyectos*',
    '- Inversion Total: *$142.5M*',
    '- Avance Promedio: *68%*',
    '',
    '*Proyectos Destacados:*',
    '> Pavimentacion Av. San Martin - 82%',
    '> Red de Agua Barrio Norte - 45%',
    '> Luminarias LED Parque Retamo - 95%',
    '',
    'Ver mapa: municipio-junin.vercel.app/mapa.html'
  ].join('\n');

  await sendButtons(from, phoneId, body, [
    { type: 'reply', reply: { id: 'cmd_reporte', title: 'Ver Reporte' } },
    { type: 'reply', reply: { id: 'cmd_menu', title: 'Menu Principal' } }
  ]);
}

async function replyLicitaciones(from, phoneId) {
  const body = [
    '*MuniControl - Licitaciones Publicas*',
    'Municipio de Junin',
    '',
    '*Resumen de Contrataciones:*',
    '- Licitaciones Activas: *5 procesos*',
    '- Monto Total Licitado: *$85.4M*',
    '- Cumplimiento SLA: *100%*',
    '',
    '*Ultimas Adjudicaciones:*',
    '1. Const. Barrial S.A. - *$32.0M*',
    '2. Insumos Cuyo SRL - *$14.2M*',
    '3. Electricidad Junin - *$9.8M*',
    '',
    'Portal: municipio-junin.vercel.app/licitaciones.html'
  ].join('\n');

  await sendButtons(from, phoneId, body, [
    { type: 'reply', reply: { id: 'cmd_menu', title: 'Menu Principal' } }
  ]);
}

async function replyRRHH(from, phoneId) {
  const body = [
    '*MuniControl - Recursos Humanos*',
    'Municipio de Junin',
    '',
    '*Indicadores de Nomina:*',
    '- Empleados Activos: *1,247*',
    '- Masa Salarial Mensual: *$485.0M*',
    '- Horas Extra (Mes): *4,312 hrs*',
    '- Ausentismo: *3.2%* (Normal)',
    '',
    '*Distribucion por Secretaria:*',
    '- Obras Publicas: 340 empleados',
    '- Salud y Desarrollo: 215 empleados',
    '- Servicios Publicos: 410 empleados',
    '',
    'Portal: municipio-junin.vercel.app/rrhh.html'
  ].join('\n');

  await sendButtons(from, phoneId, body, [
    { type: 'reply', reply: { id: 'cmd_menu', title: 'Menu Principal' } }
  ]);
}

async function replyHacienda(from, phoneId) {
  const body = [
    '*MuniControl - Hacienda y Finanzas*',
    'Municipio de Junin',
    '',
    '*Balance Financiero:*',
    '- Ingresos del Mes: *$180.2M* (+8%)',
    '- Gastos del Mes: *$165.3M*',
    '- Balance Operativo: *+$14.9M*',
    '- Ejecucion Presupuestaria: *67%*',
    '',
    'Transparencia: municipio-junin.vercel.app/cuentas-claras.html'
  ].join('\n');

  await sendButtons(from, phoneId, body, [
    { type: 'reply', reply: { id: 'cmd_reporte', title: 'Ver Reporte' } },
    { type: 'reply', reply: { id: 'cmd_menu', title: 'Menu Principal' } }
  ]);
}

async function replyReclamos(from, phoneId) {
  const body = [
    '*MuniControl - Reclamos 311*',
    'Junin, Mendoza',
    '',
    '*Estado de Servicios Urbanos:*',
    '- Total Reclamos: *318*',
    '- Resueltos: *295* (92.7%)',
    '- Pendientes: *23 en proceso*',
    '- Tiempo Promedio: *3.2 dias*',
    '',
    '*Categorias Mas Frecuentes:*',
    '1. Alumbrado Publico: 112 casos',
    '2. Reparacion de Baches: 85 casos',
    '3. Arbolado y Limpieza: 64 casos',
    '',
    'Mapa: municipio-junin.vercel.app/vecinos.html'
  ].join('\n');

  await sendButtons(from, phoneId, body, [
    { type: 'reply', reply: { id: 'cmd_menu', title: 'Menu Principal' } }
  ]);
}

async function replyReporte(from, phoneId) {
  const body = [
    '*INFORME EJECUTIVO MUNICONTROL*',
    'Municipio de Junin - Mendoza',
    '',
    '*Analisis Sintetico por IA:*',
    'El municipio mantiene un balance financiero saludable (+$14.9M) con un 67% de ejecucion presupuestaria. Las obras prioritarias registran un avance del 68% y el cumplimiento del SLA de reclamos alcanza el 94.1%.',
    '',
    '*Metricas Clave:*',
    '- Empleados: 1,247 activos',
    '- Gasto Mensual: $165.3M',
    '- Obras: 8 activas ($142.5M)',
    '- Reclamos: 92.7% resueltos',
    '',
    'Dashboard: municipio-junin.vercel.app/index.html'
  ].join('\n');

  await sendButtons(from, phoneId, body, [
    { type: 'reply', reply: { id: 'cmd_hacienda', title: 'Ver Finanzas' } },
    { type: 'reply', reply: { id: 'cmd_menu', title: 'Menu Principal' } }
  ]);
}

async function replyAyuda(from, phoneId) {
  const body = [
    '*MuniControl - Comandos Disponibles*',
    '',
    '*obras* - Estado de obras publicas',
    '*licitaciones* - Contratos y adjudicaciones',
    '*rrhh* - Nomina y datos de personal',
    '*hacienda* - Resumen financiero y gastos',
    '*reclamos* - Sistema de reclamos 311',
    '*reporte* - Informe ejecutivo con IA',
    '*menu* - Menu interactivo principal',
    '',
    'O haceme cualquier consulta en lenguaje natural.'
  ].join('\n');

  await sendText(from, phoneId, body);
}

async function replyLibre(from, phoneId, userText) {
  try {
    const lower = userText.toLowerCase();
    if (lower.indexOf('gasto') >= 0 || lower.indexOf('presupuesto') >= 0 || lower.indexOf('cuanto') >= 0) {
      const body = [
        '*MuniControl IA - Consulta Financiera*',
        '',
        'El gasto total del mes actual es de *$165.3M* sobre un presupuesto estimado de *$180.0M* (67% de ejecucion anual).',
        '',
        '- Obras Publicas: $48.2M (29%)',
        '- Personal (RRHH): $85.0M (51%)',
        '- Servicios y Operacion: $32.1M (20%)',
        '',
        'Detalle: municipio-junin.vercel.app/cuentas-claras.html'
      ].join('\n');
      await sendButtons(from, phoneId, body, [
        { type: 'reply', reply: { id: 'cmd_menu', title: 'Menu Principal' } }
      ]);
      return;
    }

    const body = [
      '*MuniBot - Asistente IA*',
      '',
      'Recibi tu consulta: "' + userText + '"',
      '',
      'El Municipio de Junin mantiene todas las areas operativas funcionando con normalidad.',
      '',
      'Dashboard: municipio-junin.vercel.app/index.html',
      'Chat IA: municipio-junin.vercel.app/ia.html'
    ].join('\n');
    await sendText(from, phoneId, body);
  } catch (e) {
    console.error('[WA] Free query error:', e.message);
    await sendText(from, phoneId, 'Asistente MuniControl: Para ver mas detalles visita https://municipio-junin.vercel.app/index.html');
  }
}

// ========================================
// MENU PRINCIPAL (List Message)
// ========================================

async function sendMenuPrincipal(to, phoneId) {
  const payload = {
    messaging_product: 'whatsapp',
    to: to,
    type: 'interactive',
    interactive: {
      type: 'list',
      header: { type: 'text', text: 'MuniControl - Junin' },
      body: { text: 'Hola! Soy MuniBot, tu asistente inteligente del Municipio de Junin.\n\nElegi un area para consultar o escribi tu pregunta directamente.' },
      footer: { text: 'Sistema de Gestion Inteligente' },
      action: {
        button: 'Ver opciones',
        sections: [
          {
            title: 'Consultas por Area',
            rows: [
              { id: 'cmd_obras', title: 'Obras Publicas', description: 'Estado y avance de obras' },
              { id: 'cmd_licitaciones', title: 'Licitaciones', description: 'Contratos y adjudicaciones' },
              { id: 'cmd_rrhh', title: 'Personal (RRHH)', description: 'Datos de empleados y nomina' },
              { id: 'cmd_hacienda', title: 'Hacienda', description: 'Resumen financiero y gastos' },
              { id: 'cmd_reclamos', title: 'Reclamos 311', description: 'Servicios urbanos y SLA' }
            ]
          },
          {
            title: 'Reportes e Inteligencia',
            rows: [
              { id: 'cmd_reporte', title: 'Informe Ejecutivo', description: 'Resumen gerencial con IA' },
              { id: 'cmd_ayuda', title: 'Ayuda', description: 'Comandos disponibles' }
            ]
          }
        ]
      }
    }
  };

  await callWhatsAppAPI(to, phoneId, payload);
}

// ========================================
// SEND HELPERS
// ========================================

async function sendText(to, phoneId, body) {
  const payload = {
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to: to,
    type: 'text',
    text: { preview_url: true, body: body }
  };
  await callWhatsAppAPI(to, phoneId, payload);
}

async function sendButtons(to, phoneId, bodyText, buttons) {
  const payload = {
    messaging_product: 'whatsapp',
    to: to,
    type: 'interactive',
    interactive: {
      type: 'button',
      body: { text: bodyText },
      footer: { text: 'Municipalidad de Junin - GovTech' },
      action: {
        buttons: buttons.slice(0, 3)
      }
    }
  };
  await callWhatsAppAPI(to, phoneId, payload);
}

// ========================================
// CORE API CALLER with AR/MX phone fix
// ========================================

async function callWhatsAppAPI(to, phoneId, payload) {
  const token = process.env.WHATSAPP_ACCESS_TOKEN;
  if (!token) {
    console.error('[WA] WHATSAPP_ACCESS_TOKEN not set!');
    return;
  }
  if (!phoneId) {
    console.error('[WA] WHATSAPP_PHONE_ID not set!');
    return;
  }

  const url = 'https://graph.facebook.com/v21.0/' + phoneId + '/messages';

  const doSend = async (recipient) => {
    const body = JSON.stringify({ ...payload, to: recipient });
    console.log('[WA] Sending to', recipient, 'via phoneId', phoneId, '- payload size:', body.length);

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer ' + token,
        'Content-Type': 'application/json'
      },
      body: body
    });

    const responseText = await response.text();
    console.log('[WA] API response:', response.status, responseText.substring(0, 300));
    return { ok: response.ok, status: response.status, text: responseText };
  };

  // First attempt
  let result = await doSend(to);

  if (!result.ok) {
    console.error('[WA] Send failed for ' + to + ': ' + result.status + ' ' + result.text);

    // Workaround: Argentina phone number format mismatch in Meta Sandbox
    // Meta sometimes registers numbers as 54XXXXXXXXXX but webhook receives 549XXXXXXXXXX
    if (result.text.indexOf('131030') >= 0 || result.text.indexOf('not in allowed') >= 0) {
      let altNumber = null;

      if (to.startsWith('549') && to.length >= 13) {
        // Try removing the 9: 549XXXXXXXX -> 54XXXXXXXX
        altNumber = '54' + to.substring(3);
      } else if (to.startsWith('54') && !to.startsWith('549') && to.length >= 12) {
        // Try adding the 9: 54XXXXXXXX -> 549XXXXXXXX
        altNumber = '549' + to.substring(2);
      } else if (to.startsWith('521') && to.length >= 12) {
        // Mexico: remove the 1
        altNumber = '52' + to.substring(3);
      } else if (to.startsWith('52') && !to.startsWith('521') && to.length >= 11) {
        // Mexico: add the 1
        altNumber = '521' + to.substring(2);
      }

      if (altNumber) {
        console.log('[WA] Retrying with alternate number format: ' + altNumber);
        result = await doSend(altNumber);
        if (result.ok) {
          console.log('[WA] SUCCESS with alternate format ' + altNumber);
        } else {
          console.error('[WA] Retry also failed for ' + altNumber + ': ' + result.text);
        }
      }
    }
  } else {
    console.log('[WA] Message sent OK to ' + to);
  }
}
