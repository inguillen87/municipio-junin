// api/whatsapp-webhook.js
// Meta WhatsApp Business Cloud API — Webhook para recibir y responder mensajes
// Docs: https://developers.facebook.com/docs/whatsapp/cloud-api
//
// ENV VARS necesarias:
//   WHATSAPP_VERIFY_TOKEN  — token que definimos nosotros para verificar el webhook
//   WHATSAPP_ACCESS_TOKEN  — token de acceso de Meta (System User o temporal)
//   WHATSAPP_PHONE_ID      — ID del número de teléfono de WhatsApp Business
//   MUNI_HF_TOKEN          — HuggingFace API token (para MuniBot IA)
//   DATABASE_URL            — Neon PostgreSQL

import pg from 'pg';
const { Pool } = pg;

export default async function handler(req, res) {
  // ── GET: Webhook verification (Meta envía esto al configurar) ──
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

  // ── POST: Incoming messages ────────────────────────────────
  if (req.method !== 'POST') return res.status(405).end();

  // Meta requiere 200 inmediato para no reintentar
  res.status(200).json({ status: 'received' });

  try {
    const body = req.body;
    if (!body?.object || body.object !== 'whatsapp_business_account') return;

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
  } catch (err) {
    console.error('WhatsApp webhook error:', err);
  }
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
    userText = msg.interactive?.button_reply?.title || msg.interactive?.list_reply?.title || '';
  } else if (msgType === 'audio') {
    // Para audio: transcribir en el futuro
    await sendWhatsApp(from, phoneId, '🎤 Recibí tu audio. Por ahora solo proceso mensajes de texto. Escribime tu consulta y te respondo al instante.');
    return;
  } else if (msgType === 'document' || msgType === 'image') {
    await sendWhatsApp(from, phoneId, '📎 Recibí tu archivo. Por ahora solo proceso mensajes de texto. Para subir archivos usá el Hub de Datos: https://municipio-junin.vercel.app/importar');
    return;
  } else {
    return; // ignore other types
  }

  if (!userText.trim()) return;

  const text = userText.trim().toLowerCase();

  // ── 1. Comandos directos ──────────────────────────────────
  if (text === '/menu' || text === 'menu' || text === 'hola' || text === 'inicio') {
    await sendMenuInteractivo(from, phoneId);
    return;
  }

  if (text === '/obras' || text === 'obras') {
    await handleObrasQuery(from, phoneId);
    return;
  }

  if (text === '/licitaciones' || text === 'licitaciones') {
    await handleLicitacionesQuery(from, phoneId);
    return;
  }

  if (text === '/rrhh' || text === 'personal' || text === 'empleados') {
    await handleRRHHQuery(from, phoneId);
    return;
  }

  if (text === '/hacienda' || text === 'hacienda' || text === 'finanzas') {
    await handleHaciendaQuery(from, phoneId);
    return;
  }

  if (text === '/reclamos' || text === 'reclamos' || text === 'reclamo') {
    await handleReclamosQuery(from, phoneId);
    return;
  }

  if (text === '/reporte' || text === 'reporte' || text === 'informe') {
    await handleReporteQuery(from, phoneId);
    return;
  }

  if (text === '/ayuda' || text === 'ayuda' || text === 'help') {
    await sendWhatsApp(from, phoneId,
      '🤖 *MuniBot — Comandos disponibles*\n\n' +
      '📋 /menu — Menú interactivo\n' +
      '🏗️ /obras — Estado de obras\n' +
      '📄 /licitaciones — Licitaciones activas\n' +
      '👥 /rrhh — Datos de personal\n' +
      '💰 /hacienda — Resumen financiero\n' +
      '📢 /reclamos — Reclamos vecinales\n' +
      '📊 /reporte — Informe ejecutivo\n' +
      '❓ /ayuda — Este mensaje\n\n' +
      '💬 También podés hacerme *cualquier pregunta* en lenguaje natural.\n' +
      '_Ej: "¿Cuánto gastamos en horas extra este mes?"_'
    );
    return;
  }

  // ── 2. Consulta libre → MuniBot IA ────────────────────────
  await handleFreeQuery(from, phoneId, userText);
}

// ══════════════════════════════════════════════════════════════
// HANDLERS POR MÓDULO
// ══════════════════════════════════════════════════════════════

async function handleObrasQuery(from, phoneId) {
  await sendWhatsApp(from, phoneId, '🏗️ Consultando estado de obras...');
  try {
    const data = await queryIntelligence('obra_efficiency');
    if (data && data.totalObras > 0) {
      let msg = `🏗️ *Obras Públicas — ${getCurrentPeriodName()}*\n\n`;
      msg += `📊 *${data.totalObras}* obras en ejecución\n`;
      msg += `📈 Avance promedio: *${data.avgProgress}%*\n`;
      if (data.delayedCount > 0) {
        msg += `⚠️ *${data.delayedCount}* obra(s) con demora\n\n`;
        if (data.delayedObras) {
          data.delayedObras.forEach(o => { msg += `  🔴 ${o}\n`; });
        }
      } else {
        msg += `✅ Todas en tiempo\n`;
      }
      msg += `\n📱 Ver detalle: https://municipio-junin.vercel.app/inteligencia`;
      await sendWhatsApp(from, phoneId, msg);
    } else {
      await sendWhatsApp(from, phoneId, '🏗️ No hay datos de obras cargados para este período. Subí la información en:\nhttps://municipio-junin.vercel.app/importar');
    }
  } catch (e) {
    await sendFallbackResponse(from, phoneId, 'obras');
  }
}

async function handleLicitacionesQuery(from, phoneId) {
  await sendWhatsApp(from, phoneId, '📄 Consultando licitaciones...');
  try {
    const data = await queryIntelligence('licitacion_concentration');
    if (data && data.totalLicitaciones > 0) {
      let msg = `📄 *Licitaciones — ${getCurrentPeriodName()}*\n\n`;
      msg += `📊 *${data.totalLicitaciones}* licitaciones registradas\n`;
      msg += `💰 Monto total: *$${formatMoney(data.totalMonto)}*\n`;
      msg += `📈 Top 3 concentración: *${data.top3ConcentrationPct}%*\n\n`;
      if (data.top10Providers) {
        msg += `🏢 *Principales adjudicatarios:*\n`;
        data.top10Providers.slice(0, 5).forEach((p, i) => {
          msg += `  ${i+1}. ${p.name} — ${p.pct}%\n`;
        });
      }
      msg += `\n📱 Ver detalle: https://municipio-junin.vercel.app/inteligencia`;
      await sendWhatsApp(from, phoneId, msg);
    } else {
      await sendFallbackResponse(from, phoneId, 'licitaciones');
    }
  } catch (e) {
    await sendFallbackResponse(from, phoneId, 'licitaciones');
  }
}

async function handleRRHHQuery(from, phoneId) {
  try {
    const data = await queryIntelligence('rrhh_ausentismo');
    if (data && data.totalEmpleados > 0) {
      let msg = `👥 *RRHH — ${getCurrentPeriodName()}*\n\n`;
      msg += `👤 Empleados: *${data.totalEmpleados}*\n`;
      msg += `💰 Gasto salarial: *$${formatMoney(data.totalSueldo)}*\n`;
      msg += `⏰ Horas extra: *${(data.totalHsExtra || 0).toLocaleString('es-AR')}h*\n`;
      msg += `📊 Ausentismo: *${data.ausentismo || 0}%*\n`;
      msg += `\n📱 Dashboard: https://municipio-junin.vercel.app/inteligencia`;
      await sendWhatsApp(from, phoneId, msg);
    } else {
      await sendFallbackResponse(from, phoneId, 'RRHH');
    }
  } catch (e) {
    await sendFallbackResponse(from, phoneId, 'RRHH');
  }
}

async function handleHaciendaQuery(from, phoneId) {
  try {
    const data = await queryIntelligence('salary_vs_budget');
    if (data) {
      let msg = `💰 *Hacienda — ${getCurrentPeriodName()}*\n\n`;
      if (data.budgetAmount > 0) {
        msg += `📊 Presupuesto Personal: *$${formatMoney(data.budgetAmount)}*\n`;
        msg += `💸 Ejecutado: *$${formatMoney(data.totalSalary)}*\n`;
        msg += `📈 Ejecución: *${data.executionPct}%*\n`;
        msg += data.deviation > 0
          ? `✅ Superávit: *$${formatMoney(Math.abs(data.deviation))}*\n`
          : `⚠️ Déficit: *$${formatMoney(Math.abs(data.deviation))}*\n`;
      } else {
        msg += `ℹ️ No hay datos de presupuesto cargados.\n`;
      }
      msg += `\n📱 Dashboard: https://municipio-junin.vercel.app/inteligencia`;
      await sendWhatsApp(from, phoneId, msg);
    } else {
      await sendFallbackResponse(from, phoneId, 'Hacienda');
    }
  } catch (e) {
    await sendFallbackResponse(from, phoneId, 'Hacienda');
  }
}

async function handleReclamosQuery(from, phoneId) {
  try {
    const data = await queryIntelligence('reclamos_vs_obras');
    if (data && data.totalReclamos > 0) {
      let msg = `📢 *Reclamos Vecinales — ${getCurrentPeriodName()}*\n\n`;
      msg += `📊 Total reclamos: *${data.totalReclamos}*\n`;
      msg += `🏗️ Obras en zona: *${data.totalObras}*\n`;
      msg += `⚠️ Zonas sin cobertura: *${data.sinCobertura || 0}*\n`;
      if (data.hotspots && data.hotspots.length > 0) {
        msg += `\n🔥 *Zonas más activas:*\n`;
        data.hotspots.slice(0, 5).forEach(h => {
          const icon = h.tieneObra ? '🟢' : '🔴';
          msg += `  ${icon} ${h.barrio}: ${h.reclamos} reclamos (${h.prioridad})\n`;
        });
      }
      msg += `\n📱 Dashboard: https://municipio-junin.vercel.app/inteligencia`;
      await sendWhatsApp(from, phoneId, msg);
    } else {
      await sendFallbackResponse(from, phoneId, 'reclamos');
    }
  } catch (e) {
    await sendFallbackResponse(from, phoneId, 'reclamos');
  }
}

async function handleReporteQuery(from, phoneId) {
  await sendWhatsApp(from, phoneId, '📊 Generando informe ejecutivo...');
  try {
    const data = await queryIntelligence('executive_summary');
    if (data) {
      let msg = `📊 *Informe Ejecutivo — ${getCurrentPeriodName()}*\n`;
      msg += `━━━━━━━━━━━━━━━━━━━━\n\n`;

      if (data.aiNarrative) {
        msg += data.aiNarrative + '\n\n';
      }

      msg += `━━━━━━━━━━━━━━━━━━━━\n`;
      msg += `📄 PDF completo: https://municipio-junin.vercel.app/inteligencia\n`;
      msg += `_(Abrí el link y presioná "Exportar PDF")_`;
      await sendWhatsApp(from, phoneId, msg);
    } else {
      await sendWhatsApp(from, phoneId, '📊 Cargá datos en el Hub de Datos para generar el informe:\nhttps://municipio-junin.vercel.app/importar');
    }
  } catch (e) {
    await sendFallbackResponse(from, phoneId, 'reporte');
  }
}

// ── Consulta libre con IA ────────────────────────────────────
async function handleFreeQuery(from, phoneId, question) {
  const token = process.env.MUNI_HF_TOKEN;
  if (!token) {
    await sendWhatsApp(from, phoneId, '🤖 MuniBot no está configurado todavía. Escribí /menu para ver las opciones disponibles.');
    return;
  }

  await markAsRead(from, phoneId);

  // Get real data context
  let dataContext = '';
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  try {
    const { rows: datasets } = await pool.query(
      "SELECT module, COUNT(*) as files, SUM(row_count) as rows FROM datasets GROUP BY module"
    );
    if (datasets.length > 0) {
      dataContext = '\n\nDatos disponibles en el sistema:\n';
      for (const ds of datasets) {
        const { rows: sample } = await pool.query(
          "SELECT data FROM data_points WHERE module = $1 ORDER BY created_at DESC LIMIT 20", [ds.module]
        );
        dataContext += `\n${ds.module.toUpperCase()}: ${ds.files} archivos, ${ds.rows} registros\n`;
        if (sample.length > 0) {
          const data = sample.map(r => r.data);
          dataContext += buildModuleSummary(ds.module, data) + '\n';
        }
      }
    }
  } catch (e) { /* no data yet */ }
  finally { await pool.end(); }

  const systemPrompt = `Sos MuniBot, el asistente inteligente del Municipio de Junín, Mendoza, Argentina.
Respondés por WhatsApp: sé conciso (máximo 500 caracteres), usá emojis, usá *negrita* para datos clave.
Si no tenés datos para responder, sugerí cargar la info en el Hub de Datos.
${dataContext || '\nNo hay datos cargados en el sistema todavía. Usá contexto general del municipio: ~1.247 empleados, presupuesto mensual ~$420M, 8 obras en ejecución.'}`;

  try {
    const resp = await fetch(
      'https://api-inference.huggingface.co/models/Qwen/Qwen2.5-72B-Instruct/v1/chat/completions',
      {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'Qwen/Qwen2.5-72B-Instruct',
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: question }
          ],
          max_tokens: 350,
          temperature: 0.5,
        }),
      }
    );
    const result = await resp.json();
    const answer = result?.choices?.[0]?.message?.content?.trim();
    if (answer) {
      await sendWhatsApp(from, phoneId, answer);
    } else {
      await sendWhatsApp(from, phoneId, '🤖 No pude generar una respuesta ahora. Intentá de nuevo o escribí /menu.');
    }
  } catch (e) {
    await sendWhatsApp(from, phoneId, '⚠️ Error al procesar tu consulta. Intentá de nuevo en unos segundos.');
  }
}

// ══════════════════════════════════════════════════════════════
// META WHATSAPP CLOUD API
// ══════════════════════════════════════════════════════════════

async function sendWhatsApp(to, phoneId, text) {
  const token = process.env.WHATSAPP_ACCESS_TOKEN;
  if (!token || !phoneId) {
    console.warn('WhatsApp not configured:', { hasToken: !!token, phoneId });
    return;
  }

  try {
    await fetch(`https://graph.facebook.com/v21.0/${phoneId}/messages`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to,
        type: 'text',
        text: { preview_url: true, body: text },
      }),
    });
  } catch (e) {
    console.error('WhatsApp send error:', e.message);
  }
}

async function sendMenuInteractivo(to, phoneId) {
  const token = process.env.WHATSAPP_ACCESS_TOKEN;
  if (!token || !phoneId) return;

  try {
    await fetch(`https://graph.facebook.com/v21.0/${phoneId}/messages`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        to,
        type: 'interactive',
        interactive: {
          type: 'list',
          header: { type: 'text', text: '🏛️ MuniBot — Junín, Mendoza' },
          body: { text: '¿En qué puedo ayudarte? Elegí una opción o haceme cualquier pregunta.' },
          footer: { text: 'Municipalidad de Junín · MuniControl' },
          action: {
            button: 'Ver opciones',
            sections: [
              {
                title: 'Consultas',
                rows: [
                  { id: 'cmd_obras',        title: '🏗️ Obras Públicas',    description: 'Estado y avance de obras' },
                  { id: 'cmd_licitaciones', title: '📄 Licitaciones',       description: 'Contratos y adjudicaciones' },
                  { id: 'cmd_rrhh',         title: '👥 Personal (RRHH)',    description: 'Datos de empleados' },
                  { id: 'cmd_hacienda',     title: '💰 Hacienda',           description: 'Resumen financiero' },
                  { id: 'cmd_reclamos',     title: '📢 Reclamos',           description: 'Reclamos vecinales' },
                ],
              },
              {
                title: 'Reportes',
                rows: [
                  { id: 'cmd_reporte', title: '📊 Informe Ejecutivo',  description: 'Resumen mensual con IA' },
                  { id: 'cmd_ayuda',   title: '❓ Ayuda',              description: 'Todos los comandos' },
                ],
              },
            ],
          },
        },
      }),
    });
  } catch (e) {
    // Fallback to text menu
    await sendWhatsApp(to, phoneId,
      '🏛️ *MuniBot — Junín, Mendoza*\n\n' +
      'Elegí una opción:\n\n' +
      '🏗️ Escribí *obras* — Estado de obras\n' +
      '📄 Escribí *licitaciones* — Contratos\n' +
      '👥 Escribí *personal* — RRHH\n' +
      '💰 Escribí *hacienda* — Finanzas\n' +
      '📢 Escribí *reclamos* — Vecinales\n' +
      '📊 Escribí *reporte* — Informe IA\n\n' +
      '💬 O haceme cualquier pregunta libre.'
    );
  }
}

async function markAsRead(from, phoneId) {
  const token = process.env.WHATSAPP_ACCESS_TOKEN;
  if (!token || !phoneId) return;
  try {
    await fetch(`https://graph.facebook.com/v21.0/${phoneId}/messages`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ messaging_product: 'whatsapp', status: 'read', message_id: from }),
    });
  } catch (e) { /* ignore */ }
}

// ══════════════════════════════════════════════════════════════
// HELPERS
// ══════════════════════════════════════════════════════════════

async function queryIntelligence(analysisType) {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  try {
    const period = getCurrentPeriod();
    // Try to get cached report first
    const { rows } = await pool.query(
      `SELECT result FROM intelligence_reports WHERE type = $1 AND period = $2 ORDER BY created_at DESC LIMIT 1`,
      [analysisType, period]
    );
    if (rows.length > 0 && rows[0].result) {
      return typeof rows[0].result === 'string' ? JSON.parse(rows[0].result) : rows[0].result;
    }
    return null;
  } catch (e) {
    console.error('Intelligence query error:', e.message);
    return null;
  } finally {
    await pool.end();
  }
}

function buildModuleSummary(module, data) {
  if (!data || !data.length) return 'Sin datos procesados.';
  if (module === 'rrhh') {
    const total = data.reduce((s, d) => s + Number(d.sueldo || d.salario || 0), 0);
    return `  Sueldo total muestra: $${formatMoney(total)}, ${data.length} registros`;
  }
  if (module === 'hacienda') {
    const ingresos = data.filter(d => String(d.tipo || '').toLowerCase() === 'ingreso').reduce((s, d) => s + Number(d.monto || 0), 0);
    const egresos = data.filter(d => String(d.tipo || '').toLowerCase() === 'egreso').reduce((s, d) => s + Number(d.monto || 0), 0);
    return `  Ingresos: $${formatMoney(ingresos)}, Egresos: $${formatMoney(egresos)}`;
  }
  return `  ${data.length} registros, campos: ${Object.keys(data[0] || {}).slice(0, 5).join(', ')}`;
}

async function sendFallbackResponse(from, phoneId, module) {
  await sendWhatsApp(from, phoneId,
    `ℹ️ No hay datos de *${module}* cargados para ${getCurrentPeriodName()}.\n\n` +
    `Subí la información en:\n` +
    `📥 https://municipio-junin.vercel.app/importar\n\n` +
    `Seleccioná el módulo *${module}*, cargá tu archivo CSV/Excel y listo.`
  );
}

function formatMoney(n) {
  if (!n) return '0';
  if (n >= 1000000) return (n / 1000000).toFixed(1) + 'M';
  if (n >= 1000) return (n / 1000).toFixed(0) + 'K';
  return String(n);
}

function getCurrentPeriod() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function getCurrentPeriodName() {
  const months = ['','Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
  const d = new Date();
  return months[d.getMonth() + 1] + ' ' + d.getFullYear();
}
