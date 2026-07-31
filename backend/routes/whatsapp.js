'use strict';
const express = require('express');
const router = express.Router();

// ── KNOWLEDGE BASE ─────────────────────────────────────────────
const KB = [
  { patterns: ['hola','buenas','buenos','saludos'], response: '👋 ¡Hola! Soy el Asistente IA de la *Municipalidad de Junín* 🏛️\n\nPuedo ayudarte con:\n📊 *Presupuesto y gastos*\n📄 *Contratos y proveedores*\n👥 *Personal municipal*\n🏘️ *Reclamos vecinales*\n🗺️ *Obras en ejecución*\n\nEscribí tu consulta o usá estos comandos:\n*/gastos* */contratos* */personal* */reclamos* */obras* */alerta* */informe*' },
  { patterns: ['presupuesto','gasto','gastamos','ejecutado','plata','dinero'], response: '💰 *Resumen Presupuestario 2026*\n\n📊 Presupuesto total: *$372.000.000*\n✅ Ejecutado (jul): *$193.400.000 (52%)*\n💵 Disponible: *$178.600.000*\n\n⚠️ *Partidas en alerta:*\n• Personal: 103% \n• Cargas sociales: 104%\n\n🤖 _Proyección IA al cierre: ahorro de $31M_\n\nVer detalle: https://municipio-junin.vercel.app/presupuesto.html' },
  { patterns: ['contrato','contratos','proveedor','proveedores','vence','vencen'], response: '📄 *Contratos Activos*\n\n📋 Total activos: *47 contratos*\n💰 Valor mensual: *$28.300.000*\n\n⚠️ *URGENTE — Vencen próximamente:*\n🔴 Limpieza Zona Norte → 12 días\n🟡 Mantenimiento Flota → 18 días\n🟡 Seguridad Edificios → 25 días\n\nVer todos: https://municipio-junin.vercel.app/licitaciones.html' },
  { patterns: ['personal','empleado','empleados','nomina','nómina','sueldo'], response: '👥 *Personal Municipal*\n\n📊 Empleados activos: *1.247*\n💰 Costo mensual: *$152.000.000*\n\n📋 Por área:\n• Obras y Servicios: 380\n• Salud: 210\n• Educación: 185\n• Administración: 290\n• Seguridad: 182\n\n⚠️ Costo personal: 41% del presupuesto total\n\nVer RRHH: https://municipio-junin.vercel.app/rrhh.html' },
  { patterns: ['reclamo','reclamos','vecino','vecinos','queja','quejas'], response: '🏘️ *Reclamos Vecinales*\n\n🔴 Urgentes: *12*\n🟡 Pendientes: *47*\n🟢 Resueltos esta semana: *23*\n\n📍 Zonas con más reclamos:\n1. Centro (28%)\n2. Norte (22%)\n3. Sur (18%)\n\n🔨 Tipo más frecuente: Baches (34%)\n\nVer mapa: https://municipio-junin.vercel.app/vecinos.html' },
  { patterns: ['obra','obras','construc','infraestruc'], response: '🏗️ *Obras en Ejecución*\n\n📊 Obras activas: *8*\n💰 Inversión total: *$53.800.000*\n\n✅ Iluminación LED Centro: 100%\n🟢 Parque Recreativo Norte: 80%\n🟡 Pavimentación San Martín: 65%\n🟡 Red Cloacal Sur: 45%\n🔴 Hospital Municipal: 30%\n🔴 CIC Medrano: 20%\n\nVer mapa: https://municipio-junin.vercel.app/mapa.html' },
  { patterns: ['alerta','alertas','critico','crítico','urgente'], response: '🚨 *Alertas Críticas del Sistema*\n\n🔴 *CRÍTICO:*\n• Partida Personal: 103% del presupuesto\n• Cargas Sociales: 104%\n• Contrato Limpieza vence en 12 días\n\n🟡 *ATENCIÓN:*\n• 47 reclamos pendientes sin resolver\n• 3 contratos vencen en 30 días\n• Asistencia Social: 84% ejecutado\n\nVer dashboard: https://municipio-junin.vercel.app/control.html' },
  { patterns: ['informe','reporte','resumen','ejecutivo'], response: '📊 *Informe Ejecutivo — Julio 2026*\n\n🏛️ *Municipalidad de Junín*\n\n💰 Presupuesto: $372M | Ejecutado: 52%\n👥 Personal: 1.247 empleados\n📄 Contratos: 47 activos\n🏘️ Reclamos: 59 pendientes\n🏗️ Obras: 8 activas\n\n🤖 _IA recomienda: revisar urgente contratos próximos a vencer y partida de personal_\n\nVer plataforma completa:\nhttps://municipio-junin.vercel.app' },
  { patterns: ['/gastos','gastos'], response: null, action: 'gastos' },
  { patterns: ['/contratos'], response: null, action: 'contratos' },
  { patterns: ['/personal'], response: null, action: 'personal' },
  { patterns: ['/reclamos'], response: null, action: 'reclamos' },
  { patterns: ['/obras'], response: null, action: 'obras' },
  { patterns: ['/alerta','/alertas'], response: null, action: 'alerta' },
  { patterns: ['/informe'], response: null, action: 'informe' },
];

const ACTIONS = {
  gastos: KB.find(k => k.patterns.includes('presupuesto')).response,
  contratos: KB.find(k => k.patterns.includes('contrato')).response,
  personal: KB.find(k => k.patterns.includes('personal')).response,
  reclamos: KB.find(k => k.patterns.includes('reclamo')).response,
  obras: KB.find(k => k.patterns.includes('obra')).response,
  alerta: KB.find(k => k.patterns.includes('alerta')).response,
  informe: KB.find(k => k.patterns.includes('informe')).response,
};

const DEFAULT = '🤔 No encontré información sobre eso.\n\nComandos disponibles:\n*/gastos* — Presupuesto y ejecución\n*/contratos* — Contratos y vencimientos\n*/personal* — Empleados y RRHH\n*/reclamos* — Reclamos vecinales\n*/obras* — Obras en ejecución\n*/alerta* — Alertas críticas\n*/informe* — Resumen ejecutivo';

function findResponse(text) {
  if (!text) return DEFAULT;
  const t = text.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  for (const entry of KB) {
    if (entry.patterns.some(p => t.includes(p.normalize('NFD').replace(/[\u0300-\u036f]/g, '')))) {
      if (entry.action) return ACTIONS[entry.action] || DEFAULT;
      return entry.response || DEFAULT;
    }
  }
  return DEFAULT;
}

// ── SEND MESSAGE VIA META API ──────────────────────────────────
async function sendWhatsAppMessage(to, message) {
  const phoneId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  const token   = process.env.WHATSAPP_ACCESS_TOKEN;
  
  if (!phoneId || !token) {
    console.log('[WhatsApp] Credenciales no configuradas. Simulando envío a:', to);
    console.log('[WhatsApp] Mensaje:', message.substring(0, 100) + '...');
    return { simulated: true };
  }

  const url = `https://graph.facebook.com/v18.0/${phoneId}/messages`;
  const body = {
    messaging_product: 'whatsapp',
    to,
    type: 'text',
    text: { body: message, preview_url: true },
  };

  try {
    const resp = await fetch(url, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    return await resp.json();
  } catch (err) {
    console.error('[WhatsApp] Error enviando mensaje:', err.message);
    return { error: err.message };
  }
}

// ── WEBHOOK VERIFICATION (GET) ────────────────────────────────
router.get('/webhook', (req, res) => {
  const mode      = req.query['hub.mode'];
  const token     = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];
  const myToken   = process.env.WHATSAPP_VERIFY_TOKEN || 'govtech-verify-2026';

  if (mode === 'subscribe' && token === myToken) {
    console.log('[WhatsApp] Webhook verificado ✅');
    return res.status(200).send(challenge);
  }
  console.warn('[WhatsApp] Token de verificación inválido');
  return res.sendStatus(403);
});

// ── RECEIVE MESSAGES (POST) ───────────────────────────────────
router.post('/webhook', async (req, res) => {
  // Meta requiere respuesta 200 inmediata
  res.sendStatus(200);

  try {
    const body = req.body;
    if (!body?.object || body.object !== 'whatsapp_business_account') return;

    const entry = body.entry?.[0];
    const changes = entry?.changes?.[0];
    const value = changes?.value;
    const messages = value?.messages;

    if (!messages?.length) return;

    for (const msg of messages) {
      const from = msg.from;
      let text = '';

      if (msg.type === 'text') {
        text = msg.text?.body || '';
      } else if (msg.type === 'audio') {
        text = '[Mensaje de voz recibido — transcripción no disponible en esta versión]';
      } else if (msg.type === 'image') {
        text = '[Imagen recibida — OCR no disponible en esta versión. Enviá tu consulta por texto]';
      } else if (msg.type === 'document') {
        text = '[Documento recibido. Para análisis de documentos usá la plataforma web]';
      } else {
        text = '';
      }

      console.log(`[WhatsApp] Mensaje de ${from}: ${text.substring(0, 80)}`);

      const response = findResponse(text);
      await sendWhatsAppMessage(from, response);
      console.log(`[WhatsApp] Respuesta enviada a ${from}`);
    }
  } catch (err) {
    console.error('[WhatsApp] Error procesando webhook:', err.message);
  }
});

// ── SEND ALERT (para uso interno del sistema) ─────────────────
router.post('/send-alert', async (req, res) => {
  const { to, message, type } = req.body;
  if (!to || !message) return res.status(400).json({ error: 'to y message requeridos' });

  const prefix = type === 'critical' ? '🚨 *ALERTA CRÍTICA*\n' : type === 'warning' ? '⚠️ *ATENCIÓN*\n' : '📢 *Notificación*\n';
  const result = await sendWhatsAppMessage(to, prefix + message);
  res.json({ ok: true, result });
});

// ── STATUS ────────────────────────────────────────────────────
router.get('/status', (req, res) => {
  const configured = !!(process.env.WHATSAPP_PHONE_NUMBER_ID && process.env.WHATSAPP_ACCESS_TOKEN);
  res.json({
    status: configured ? 'configured' : 'demo-mode',
    phoneNumberId: process.env.WHATSAPP_PHONE_NUMBER_ID || 'not-set',
    webhookUrl: 'https://municipio-junin.vercel.app/api/whatsapp/webhook',
    verifyToken: process.env.WHATSAPP_VERIFY_TOKEN || 'govtech-verify-2026',
    commands: ['/gastos','/contratos','/personal','/reclamos','/obras','/alerta','/informe'],
    version: '2.0',
  });
});

module.exports = router;
