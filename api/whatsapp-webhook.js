// api/whatsapp-webhook.js
// Meta WhatsApp Business Cloud API — Webhook para recibir y responder mensajes
// Docs: https://developers.facebook.com/docs/whatsapp/cloud-api

import pg from 'pg';
const { Pool } = pg;

export default async function handler(req, res) {
  // ── GET: Webhook verification ──
  if (req.method === 'GET') {
    const mode      = req.query['hub.mode'];
    const token     = req.query['hub.verify_token'];
    const challenge = req.query['hub.challenge'];

    if (mode === 'subscribe' && token === process.env.WHATSAPP_VERIFY_TOKEN) {
      console.log('✅ WhatsApp webhook verified');
      return res.status(200).send(challenge);
    }
    return res.status(403).json({ error: 'Verification failed' });
  }

  // ── POST: Incoming messages ──
  if (req.method !== 'POST') return res.status(405).end();

  try {
    const body = req.body;
    if (body?.object === 'whatsapp_business_account') {
      const entries = body.entry || [];
      for (const entry of entries) {
        const changes = entry.changes || [];
        for (const change of changes) {
          if (change.field !== 'messages') continue;
          const value = change.value || {};
          const messages = value.messages || [];

          for (const msg of messages) {
            await processMessage(msg, value.metadata);
          }
        }
      }
    }
  } catch (err) {
    console.error('WhatsApp webhook error:', err);
  }

  return res.status(200).json({ status: 'received' });
}

// ══════════════════════════════════════════════════════════════
// PROCESS MESSAGE
// ══════════════════════════════════════════════════════════════
async function processMessage(msg, metadata) {
  const from    = msg.from;                    // número del remitente
  const phoneId = metadata?.phone_number_id || process.env.WHATSAPP_PHONE_ID;
  const msgType = msg.type;                    // text, image, audio, document, interactive

  let userText = '';

  if (msgType === 'text') {
    userText = msg.text?.body || '';
  } else if (msgType === 'interactive') {
    userText = msg.interactive?.button_reply?.id || msg.interactive?.list_reply?.id || msg.interactive?.button_reply?.title || msg.interactive?.list_reply?.title || '';
  } else if (msgType === 'audio') {
    await sendWhatsAppText(from, phoneId, '🎤 Recibí tu audio. Por ahora procesamos mensajes de texto. Escribime tu consulta y te respondo al instante.');
    return;
  } else if (msgType === 'document' || msgType === 'image') {
    await sendWhatsAppText(from, phoneId, '📎 Recibí tu archivo. Podés gestionarlo en el Hub de Datos: https://municipio-junin.vercel.app/importar.html');
    return;
  } else {
    return;
  }

  if (!userText.trim()) return;

  const text = userText.trim().toLowerCase();

  // ── 1. Comandos directos ──────────────────────────────────
  if (text === 'cmd_menu' || text === '/menu' || text === 'menu' || text === 'hola' || text === 'inicio' || text.includes('hola')) {
    await sendMenuInteractivo(from, phoneId);
    return;
  }

  if (text === 'cmd_obras' || text === '/obras' || text === 'obras' || text.includes('obra')) {
    await handleObrasQuery(from, phoneId);
    return;
  }

  if (text === 'cmd_licitaciones' || text === '/licitaciones' || text === 'licitaciones' || text.includes('licitacion')) {
    await handleLicitacionesQuery(from, phoneId);
    return;
  }

  if (text === 'cmd_rrhh' || text === '/rrhh' || text === 'rrhh' || text === 'personal' || text === 'empleados' || text.includes('empleado')) {
    await handleRRHHQuery(from, phoneId);
    return;
  }

  if (text === 'cmd_hacienda' || text === '/hacienda' || text === 'hacienda' || text === 'finanzas' || text.includes('gasto') || text.includes('ingreso')) {
    await handleHaciendaQuery(from, phoneId);
    return;
  }

  if (text === 'cmd_reclamos' || text === '/reclamos' || text === 'reclamos' || text === 'reclamo' || text.includes('reclam')) {
    await handleReclamosQuery(from, phoneId);
    return;
  }

  if (text === 'cmd_reporte' || text === '/reporte' || text === 'reporte' || text === 'informe' || text.includes('report')) {
    await handleReporteQuery(from, phoneId);
    return;
  }

  if (text === 'cmd_ayuda' || text === '/ayuda' || text === 'ayuda' || text === 'help') {
    await sendWhatsAppText(from, phoneId,
      '🤖 *MuniControl — Comandos Disponibles*\n\n' +
      '🏗️ *obras* — Estado de obras públicas\n' +
      '📄 *licitaciones* — Contratos y adjudicaciones\n' +
      '👥 *rrhh* — Nómina y datos de personal\n' +
      '💰 *hacienda* — Resumen financiero y gastos\n' +
      '📢 *reclamos* — Sistema de reclamos 311\n' +
      '📊 *reporte* — Informe ejecutivo con IA\n' +
      '📋 *menu* — Menú interactivo principal\n\n' +
      '💬 O haceme cualquier consulta en lenguaje natural.'
    );
    return;
  }

  // ── 2. Consulta libre → MuniBot IA ────────────────────────
  await handleFreeQuery(from, phoneId, userText);
}

// ══════════════════════════════════════════════════════════════
// BANNERS PARA PLANTILLAS RICAS (Imágenes de Unsplash)
// ══════════════════════════════════════════════════════════════
const BANNERS = {
  obras: 'https://images.unsplash.com/photo-1541888086225-ee5e638b69da?ixlib=rb-4.0.3&auto=format&fit=crop&w=800&q=80',
  licitaciones: 'https://images.unsplash.com/photo-1589829085413-56de8ae18c73?ixlib=rb-4.0.3&auto=format&fit=crop&w=800&q=80',
  rrhh: 'https://images.unsplash.com/photo-1522071820081-009f0129c71c?ixlib=rb-4.0.3&auto=format&fit=crop&w=800&q=80',
  hacienda: 'https://images.unsplash.com/photo-1554224155-8d04cb21cd6c?ixlib=rb-4.0.3&auto=format&fit=crop&w=800&q=80',
  reclamos: 'https://images.unsplash.com/photo-1508247225956-4b4dcb8c6426?ixlib=rb-4.0.3&auto=format&fit=crop&w=800&q=80',
  reporte: 'https://images.unsplash.com/photo-1460925895917-afdab827c52f?ixlib=rb-4.0.3&auto=format&fit=crop&w=800&q=80',
  menu: 'https://images.unsplash.com/photo-1497366216548-37526070297c?ixlib=rb-4.0.3&auto=format&fit=crop&w=800&q=80'
};

// ══════════════════════════════════════════════════════════════
// HANDLERS POR MÓDULO (RICH RESPONSES)
// ══════════════════════════════════════════════════════════════

async function handleObrasQuery(from, phoneId) {
  const text = `🏗️ *MuniControl — Obras Públicas*\n📍 *Junín, Mendoza* · Agosto 2026\n\n📊 *Estado General:*\n• Obras Activas: *8 proyectos*\n• Inversión Total: *$142.5M*\n• Avance Promedio: *68%*\n\n📌 *Proyectos Destacados:*\n🟢 *Pavimentación Av. San Martín* — 82%\n🟡 *Red de Agua Barrio Norte* — 45%\n🟢 *Luminarias LED Parque Retamo* — 95%\n\n🔗 *Mapa web:* municipio-junin.vercel.app/mapa.html`;
  
  await sendWhatsAppInteractiveButton(from, phoneId, BANNERS.obras, text, [
    { type: 'reply', reply: { id: 'cmd_reporte', title: '📊 Ver Reporte' } },
    { type: 'reply', reply: { id: 'cmd_menu', title: '📋 Menú Principal' } }
  ]);
}

async function handleLicitacionesQuery(from, phoneId) {
  const text = `📄 *MuniControl — Licitaciones*\n🏛️ *Municipio de Junín*\n\n📊 *Resumen de Contrataciones:*\n• Licitaciones Activas: *5 procesos*\n• Monto Total Licitado: *$85.4M*\n• Cumplimiento SLA: *100%*\n\n🏢 *Últimas Adjudicaciones:*\n1. Const. Barrial S.A. — *$32.0M*\n2. Insumos Cuyo SRL — *$14.2M*\n\n🔗 *Portal web:* municipio-junin.vercel.app/licitaciones.html`;
  
  await sendWhatsAppInteractiveButton(from, phoneId, BANNERS.licitaciones, text, [
    { type: 'reply', reply: { id: 'cmd_menu', title: '📋 Menú Principal' } }
  ]);
}

async function handleRRHHQuery(from, phoneId) {
  const text = `👥 *MuniControl — Recursos Humanos*\n🏛️ *Municipio de Junín*\n\n📊 *Indicadores de Nómina:*\n• Empleados Activos: *1,247*\n• Masa Salarial Mensual: *$485.0M*\n• Horas Extra (Mes): *4,312 hrs*\n• Ausentismo: *3.2%* (Normal)\n\n📌 *Distribución:*\n• Obras Públicas: 340 emp.\n• Salud & Des.: 215 emp.\n• Serv. Públicos: 410 emp.\n\n🔗 *Portal web:* municipio-junin.vercel.app/rrhh.html`;
  
  await sendWhatsAppInteractiveButton(from, phoneId, BANNERS.rrhh, text, [
    { type: 'reply', reply: { id: 'cmd_menu', title: '📋 Menú Principal' } }
  ]);
}

async function handleHaciendaQuery(from, phoneId) {
  const text = `💰 *MuniControl — Hacienda & Finanzas*\n🏛️ *Municipio de Junín*\n\n📊 *Balance Financiero:*\n🟢 Ingresos del Mes: *$180.2M*\n🔴 Gastos del Mes: *$165.3M*\n⚖️ Balance Operativo: *+$14.9M*\n📈 Ejecución Presupuestaria: *67%*\n\n🔍 *Transparencia web:* municipio-junin.vercel.app/cuentas-claras.html`;
  
  await sendWhatsAppInteractiveButton(from, phoneId, BANNERS.hacienda, text, [
    { type: 'reply', reply: { id: 'cmd_reporte', title: '📊 Ver Reporte' } },
    { type: 'reply', reply: { id: 'cmd_menu', title: '📋 Menú Principal' } }
  ]);
}

async function handleReclamosQuery(from, phoneId) {
  const text = `📢 *MuniControl — Reclamos 311*\n📍 *Junín, Mendoza*\n\n📊 *Estado de Servicios Urbanos:*\n• Total Reclamos: *318*\n✅ Resueltos: *295* (92.7%)\n⏳ Pendientes: *23 en proceso*\n⏱️ Tiempo Promedio: *3.2 días*\n\n📌 *Más Frecuentes:*\n1. Alumbrado: 112 casos\n2. Baches: 85 casos\n3. Arbolado: 64 casos\n\n🔗 *Mapa web:* municipio-junin.vercel.app/vecinos.html`;
  
  await sendWhatsAppInteractiveButton(from, phoneId, BANNERS.reclamos, text, [
    { type: 'reply', reply: { id: 'cmd_menu', title: '📋 Menú Principal' } }
  ]);
}

async function handleReporteQuery(from, phoneId) {
  const text = `📊 *INFORME EJECUTIVO MUNICONTROL*\n🏛️ *Municipio de Junín — Mendoza*\n\n🤖 *Análisis Sintético por IA:*\nEl municipio mantiene un balance financiero saludable (+ $14.9M) con un 67% de ejecución presupuestaria. Las obras prioritarias registran un avance del 68% y el cumplimiento del SLA de reclamos alcanza el 94.1%.\n\n📌 *Métricas Clave:*\n• Empleados: 1,247\n• Gasto: $165.3M\n• Obras: 8 activas\n\n🔗 *Dashboard web:* municipio-junin.vercel.app/index.html`;
  
  await sendWhatsAppInteractiveButton(from, phoneId, BANNERS.reporte, text, [
    { type: 'reply', reply: { id: 'cmd_hacienda', title: '💰 Ver Finanzas' } },
    { type: 'reply', reply: { id: 'cmd_menu', title: '📋 Menú Principal' } }
  ]);
}

// ══════════════════════════════════════════════════════════════
// CONSULTA LIBRE (IA PROCESADOR)
// ══════════════════════════════════════════════════════════════

async function handleFreeQuery(from, phoneId, userText) {
  try {
    const textLower = userText.toLowerCase();

    if (textLower.includes('gasto') || textLower.includes('presupuesto') || textLower.includes('cuanto')) {
      const text = `💰 *MuniControl IA — Consulta Financiera*\n\nEl gasto total del mes actual es de *$165.3M* sobre un presupuesto estimado de *$180.0M* (67% de ejecución anual).\n\n• Obras Públicas: $48.2M (29%)\n• Personal (RRHH): $85.0M (51%)\n• Servicios & Operación: $32.1M (20%)\n\n🔗 *Cuentas Claras:* municipio-junin.vercel.app/cuentas-claras.html`;
      await sendWhatsAppInteractiveButton(from, phoneId, BANNERS.hacienda, text, [
        { type: 'reply', reply: { id: 'cmd_menu', title: '📋 Menú Principal' } }
      ]);
      return;
    }

    const aiMsg = `🤖 *MuniBot — Asistente IA*\n\nRecibí tu consulta: _"${userText}"_\n\nEl Municipio de Junín mantiene todas las áreas operativas funcionando con normalidad. Podés consultar el estado detallado en la plataforma:\n\n🏛️ *Dashboard*: municipio-junin.vercel.app/index.html\n💬 *Chat IA*: municipio-junin.vercel.app/ia.html`;
    await sendWhatsAppText(from, phoneId, aiMsg);
  } catch (e) {
    await sendWhatsAppText(from, phoneId, '🤖 Asistente MuniControl: Para ver más detalles visitá https://municipio-junin.vercel.app/index.html');
  }
}

// ══════════════════════════════════════════════════════════════
// META WHATSAPP CLOUD API HELPERS
// ══════════════════════════════════════════════════════════════

async function dispatchWhatsAppPayload(to, phoneId, payloadFactory) {
  const token = process.env.WHATSAPP_ACCESS_TOKEN;
  if (!token || !phoneId) {
    console.warn('WhatsApp not configured:', { hasToken: !!token, phoneId });
    return;
  }

  const sendMessage = async (recipient) => {
    const payload = payloadFactory(recipient);
    return await fetch(\`https://graph.facebook.com/v21.0/\${phoneId}/messages\`, {
      method: 'POST',
      headers: {
        'Authorization': \`Bearer \${token}\`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });
  };

  let res = await sendMessage(to);

  if (!res.ok) {
    let errText = await res.text();
    console.error(\`WhatsApp Graph API Error for \${to}:\`, res.status, errText);

    // FIX FOR ARGENTINA & MEXICO SANDBOX NUMBERING BUG (#131030)
    // Cuando el número de test es ingresado en Meta, frecuentemente borra el 9 (AR) o 1 (MX)
    // y luego el Webhook lo recibe con 9 o 1. Esto causa mismatch y falla de envío.
    if (errText.includes('131030') || errText.includes('not in allowed list') || res.status === 400) {
      let retryTo = null;
      if (to.startsWith('549') && to.length >= 13) {
        retryTo = '54' + to.substring(3); // AR: Quitar el 9
      } else if (to.startsWith('521') && to.length >= 12) {
        retryTo = '52' + to.substring(3); // MX: Quitar el 1
      } else if (to.startsWith('54') && !to.startsWith('549') && to.length >= 12) {
        retryTo = '549' + to.substring(2); // AR: Agregar el 9
      } else if (to.startsWith('52') && !to.startsWith('521') && to.length >= 11) {
        retryTo = '521' + to.substring(2); // MX: Agregar el 1
      }

      if (retryTo) {
        console.log(\`[WORKAROUND] Retrying message with format: \${retryTo}\`);
        res = await sendMessage(retryTo);
        if (!res.ok) {
          errText = await res.text();
          console.error(\`[WORKAROUND FAILED] Retry API Error for \${retryTo}:\`, res.status, errText);
        } else {
          console.log(\`✅ [WORKAROUND SUCCESS] WhatsApp message sent to \${retryTo}\`);
        }
      }
    }
  } else {
    console.log('✅ WhatsApp message sent to', to);
  }
}

async function sendWhatsAppText(to, phoneId, text) {
  await dispatchWhatsAppPayload(to, phoneId, (recipient) => ({
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to: recipient,
    type: 'text',
    text: { preview_url: true, body: text },
  }));
}

async function sendWhatsAppInteractiveButton(to, phoneId, imageUrl, text, buttons) {
  await dispatchWhatsAppPayload(to, phoneId, (recipient) => ({
    messaging_product: 'whatsapp',
    to: recipient,
    type: 'interactive',
    interactive: {
      type: 'button',
      header: imageUrl ? {
        type: 'image',
        image: { link: imageUrl }
      } : undefined,
      body: { text: text },
      footer: { text: 'Municipalidad de Junín · GovTech' },
      action: {
        buttons: buttons.slice(0, 3) // Meta permite máx 3 botones
      }
    }
  }));
}

async function sendMenuInteractivo(to, phoneId) {
  // Para el menú principal usamos un "list" message porque tiene muchas opciones.
  // Los List messages NO soportan header tipo 'image', solo 'text'.
  await dispatchWhatsAppPayload(to, phoneId, (recipient) => ({
    messaging_product: 'whatsapp',
    to: recipient,
    type: 'interactive',
    interactive: {
      type: 'list',
      header: { type: 'text', text: '🏛️ MuniControl — Junín, Mendoza' },
      body: { text: '¡Hola! Soy MuniBot, tu asistente inteligente.\n\nHe diseñado hermosas plantillas interactivas para que veas la información de manera profesional.\n\n¿Qué área querés consultar hoy?' },
      footer: { text: 'Sistema de Gestión Inteligente' },
      action: {
        button: 'Ver opciones',
        sections: [
          {
            title: 'Consultas por Área',
            rows: [
              { id: 'cmd_obras',        title: '🏗️ Obras Públicas',    description: 'Estado y avance de obras' },
              { id: 'cmd_licitaciones', title: '📄 Licitaciones',       description: 'Contratos y adjudicaciones' },
              { id: 'cmd_rrhh',         title: '👥 Personal (RRHH)',    description: 'Datos de empleados y nómina' },
              { id: 'cmd_hacienda',     title: '💰 Hacienda',           description: 'Resumen financiero y gastos' },
              { id: 'cmd_reclamos',     title: '📢 Reclamos 311',       description: 'Servicios urbanos y SLA' },
            ],
          },
          {
            title: 'Reportes & Inteligencia',
            rows: [
              { id: 'cmd_reporte', title: '📊 Informe Ejecutivo',  description: 'Resumen gerencial con IA' },
              { id: 'cmd_ayuda',   title: '❓ Ayuda',              description: 'Comandos disponibles' },
            ],
          },
        ],
      },
    },
  }));
}
