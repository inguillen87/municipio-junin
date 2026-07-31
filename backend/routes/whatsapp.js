// ============================================================
// whatsapp.js — WhatsApp Bot via Meta Cloud API
// Municipalidad de Junín
// Recibe mensajes → responde con datos municipales
// ============================================================

'use strict';

const express = require('express');
const router  = express.Router();

// ── CONFIGURACIÓN META ──────────────────────────────────────
const WA_PHONE_ID    = process.env.WHATSAPP_PHONE_NUMBER_ID || '';
const WA_TOKEN       = process.env.WHATSAPP_ACCESS_TOKEN    || '';
const VERIFY_TOKEN   = process.env.WHATSAPP_VERIFY_TOKEN    || 'junin-muni-2026';
const META_API_URL   = 'https://graph.facebook.com/v18.0';

// ── VERIFICACIÓN DEL WEBHOOK (GET) ──────────────────────────
router.get('/webhook', (req, res) => {
  const mode      = req.query['hub.mode'];
  const token     = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];
  if (mode === 'subscribe' && token === VERIFY_TOKEN) {
    console.log('[WhatsApp] Webhook verificado ✅');
    return res.status(200).send(challenge);
  }
  res.status(403).send('Token inválido');
});

// ── RECEPCIÓN DE MENSAJES (POST) ─────────────────────────────
router.post('/webhook', async (req, res) => {
  try {
    const body = req.body;
    if (body.object !== 'whatsapp_business_account') return res.sendStatus(404);
    
    const entry = body.entry?.[0];
    const change = entry?.changes?.[0];
    const value  = change?.value;
    const messages = value?.messages;
    
    if (!messages || messages.length === 0) return res.sendStatus(200);
    
    const msg     = messages[0];
    const from    = msg.from;  // Número del remitente
    const msgType = msg.type;
    const msgText = msg.text?.body?.toLowerCase()?.trim() || '';
    
    console.log(`[WhatsApp] Mensaje de ${from}: "${msgText}"`);
    
    // Marcar como leído
    await markAsRead(msg.id);
    
    // Procesar mensaje
    const response = await processMessage(msgText, from);
    
    // Enviar respuesta
    await sendMessage(from, response);
    
    res.sendStatus(200);
  } catch (err) {
    console.error('[WhatsApp] Error:', err.message);
    res.sendStatus(500);
  }
});

// ── MOTOR DE RESPUESTAS ───────────────────────────────────────
async function processMessage(texto, from) {
  // Datos municipales (mismos que ia.js)
  const DATA = {
    presupuesto: { total: 3720000000, ejecutado_pct: 72, saldo: 1085000000, gasto_agosto: 284500000 },
    empleados: { total: 1247, masa_salarial: 186000000, horas_extra: 4312 },
    reclamos: { total: 318, pendientes: 89, resueltos: 229 },
    alertas: [
      'Obras Públicas supera presupuesto en 18% (+$6.8M)',
      'Contrato GovTech Solutions VENCIDO',
      'Combustible al 48% de stock — reponer urgente',
    ],
  };

  // Reconocer intención
  if (/saldo|dinero libre|disponible|queda|gastar/.test(texto)) {
    return `💰 *SALDO DISPONIBLE — Junín 2026*

✅ Disponible: *$1.085.000.000*
📅 Margen mensual: *$25.500.000*
📊 Ejecutado: ${DATA.presupuesto.ejecutado_pct}% del presupuesto anual

_Consultado el ${new Date().toLocaleDateString('es-AR')}_`;
  }

  if (/gasto|gastamos|erogaci/.test(texto)) {
    return `📊 *GASTO AGOSTO 2026*

💰 Total: *$284.500.000*
🏷️ Presupuesto: $310.000.000
⚠️ Obras Públicas: +18% sobre presupuesto

_Fuente: Sistema Municipal Junín_`;
  }

  if (/emplead|personal|plantel|rrhh/.test(texto)) {
    return `👥 *RECURSOS HUMANOS*

👤 Total empleados: *1.247*
💰 Masa salarial: *$186.000.000/mes*
⏱️ Horas extra: 4.312 hs ($18.4M)
📋 Ausentismo: 3.1% ✅`;
  }

  if (/reclamo|vecin|queja/.test(texto)) {
    return `🏘️ *RECLAMOS VECINALES*

📊 Total: 318
✅ Resueltos: 229 (72%)
⚠️ Pendientes: *89*
⏱️ Tiempo prom: 3.2 días

Principal: Baches y Pavimento (34%)`;
  }

  if (/alert|problem|urgent|criti/.test(texto)) {
    const alertList = DATA.alertas.map((a,i) => `${i+1}. 🚨 ${a}`).join('\n');
    return `🚨 *ALERTAS CRÍTICAS — Junín*

${alertList}

_Ver detalles en: municipio-junin.vercel.app_`;
  }

  if (/informe|resumen|panorama|como estamos/.test(texto)) {
    return `📋 *INFORME EJECUTIVO — AGOSTO 2026*

💰 Gasto mensual: $284.5M
👥 Empleados: 1.247
🏘️ Reclamos pendientes: 89
💡 Ahorro detectado: $15.8M/año

🚨 Alertas críticas: 3 activas

Enviá *alertas* para verlas.
Página del sistema: municipio-junin.vercel.app`;
  }

  if (/hola|buenos|buen dia|buenas/.test(texto)) {
    return `👋 *Bienvenido al Asistente Municipal de Junín*

Podés preguntarme:
• *saldo* — dinero disponible
• *gasto* — erogaciones del mes
• *empleados* — RRHH
• *reclamos* — atención vecinal
• *alertas* — situaciones críticas
• *informe* — resumen ejecutivo

_Sistema: municipio-junin.vercel.app_`;
  }

  // Default
  return `🤖 *Asistente Municipal Junín*

No entendí tu consulta. Intentá con:
• *saldo* — dinero disponible
• *gasto* — gastos del mes  
• *empleados* — RRHH
• *reclamos* — vecinos
• *alertas* — críticas
• *informe* — ejecutivo`;
}

// ── FUNCIONES DE API META ─────────────────────────────────────
async function sendMessage(to, text) {
  if (!WA_TOKEN || !WA_PHONE_ID) {
    console.log('[WhatsApp] Sin credenciales. Respuesta simulada:', text.slice(0,80));
    return;
  }
  try {
    const fetch = (await import('node-fetch')).default;
    await fetch(`${META_API_URL}/${WA_PHONE_ID}/messages`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${WA_TOKEN}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        to,
        type: 'text',
        text: { body: text, preview_url: false },
      }),
    });
  } catch (err) {
    console.error('[WhatsApp] Error al enviar:', err.message);
  }
}

async function markAsRead(msgId) {
  if (!WA_TOKEN || !WA_PHONE_ID) return;
  try {
    const fetch = (await import('node-fetch')).default;
    await fetch(`${META_API_URL}/${WA_PHONE_ID}/messages`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${WA_TOKEN}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ messaging_product: 'whatsapp', status: 'read', message_id: msgId }),
    });
  } catch {}
}

// ── ENVIAR ALERTA PROACTIVA (llamar desde scheduler) ──────────
router.post('/send-alert', async (req, res) => {
  const { to, tipo, mensaje } = req.body;
  if (!to || !mensaje) return res.status(400).json({ error: 'Faltan parámetros' });
  
  const iconos = { critica: '🚨', urgente: '⚠️', info: '📌' };
  const icono = iconos[tipo] || '📌';
  const text = `${icono} *ALERTA MUNICIPAL — Junín*

${mensaje}

_${new Date().toLocaleString('es-AR')}_
_Ver detalles: municipio-junin.vercel.app_`;
  
  await sendMessage(to, text);
  res.json({ ok: true, to, tipo });
});

// ── ENVIAR INFORME SEMANAL ────────────────────────────────────
router.post('/send-weekly', async (req, res) => {
  const { recipients } = req.body;
  if (!Array.isArray(recipients)) return res.status(400).json({ error: 'recipients debe ser un array' });
  
  const informe = `📋 *INFORME SEMANAL — MUNICIPIO DE JUNÍN*
${new Date().toLocaleDateString('es-AR', {weekday:'long',day:'numeric',month:'long'})}

💰 Gasto semana: $71.1M
👥 Empleados: 1.247 activos
🏘️ Reclamos resueltos: 18
🚨 Alertas activas: 3

• Obras Públicas +18% del presupuesto
• Contrato GovTech vencido (urgente)
• Combustible al 48%

Acceder al sistema completo:
🔗 municipio-junin.vercel.app`;

  for (const num of recipients) {
    await sendMessage(num, informe);
  }
  res.json({ ok: true, sent: recipients.length });
});

module.exports = router;
