'use strict';

const crypto = require('crypto');
const express = require('express');
const { isTenantAdmin } = require('../middleware/authMiddleware');
const { PublicAppUrlError, buildPublicAppUrl } = require('../../shared/public-app-url.cjs');

const router = express.Router();
const completedMessages = new Set();

function verifyMetaSignature(req) {
  const secret = process.env.WHATSAPP_APP_SECRET;
  const signature = req.headers['x-hub-signature-256'];
  if (!secret || !req.rawBody || typeof signature !== 'string' || !signature.startsWith('sha256=')) {
    return false;
  }
  const receivedHex = signature.slice(7);
  if (!/^[a-f0-9]{64}$/i.test(receivedHex)) return false;
  const expected = crypto.createHmac('sha256', secret).update(req.rawBody).digest();
  const received = Buffer.from(receivedHex, 'hex');
  return received.length === expected.length && crypto.timingSafeEqual(received, expected);
}

function rememberMessage(id) {
  if (!id || completedMessages.has(id)) return false;
  completedMessages.add(id);
  if (completedMessages.size > 2000) {
    completedMessages.delete(completedMessages.values().next().value);
  }
  return true;
}

function answerFor(text) {
  const normalized = String(text || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  if (/personal|emplead|rrhh|nomina|sueldo/.test(normalized)) {
    return `👥 El Centro Ejecutivo GRH contiene el snapshot auditado de RRHH al 06/08/2026. Para proteger los datos, ingresá con tus credenciales institucionales:\n${buildPublicAppUrl('/login.html')}`;
  }
  if (/hola|buenas|menu|inicio/.test(normalized)) {
    return '👋 Soy MuniBot Junín. Puedo orientarte hacia RRHH, Hacienda, Obras, Reclamos y reportes. Las métricas ejecutivas requieren acceso institucional.';
  }
  return `ℹ️ No voy a informar cifras sin una fuente municipal validada. Ingresá a la plataforma para consultar los tableros disponibles:\n${buildPublicAppUrl('/login.html')}`;
}

async function sendWhatsAppMessage(to, message) {
  const phoneId = process.env.WHATSAPP_PHONE_ID || process.env.WHATSAPP_PHONE_NUMBER_ID;
  const token = process.env.WHATSAPP_ACCESS_TOKEN;
  if (!phoneId || !token) return { ok: false, error: 'not_configured' };

  const response = await fetch(`https://graph.facebook.com/v21.0/${phoneId}/messages`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to,
      type: 'text',
      text: { body: message, preview_url: true },
    }),
  });
  return { ok: response.ok, status: response.status };
}

router.get('/webhook', (req, res) => {
  const configuredToken = process.env.WHATSAPP_VERIFY_TOKEN;
  if (
    configuredToken &&
    req.query['hub.mode'] === 'subscribe' &&
    req.query['hub.verify_token'] === configuredToken
  ) {
    return res.status(200).send(req.query['hub.challenge']);
  }
  return res.sendStatus(403);
});

router.post('/webhook', async (req, res) => {
  if (!verifyMetaSignature(req)) return res.sendStatus(401);
  if (req.body?.object !== 'whatsapp_business_account') return res.sendStatus(400);

  const expectedPhoneId = process.env.WHATSAPP_PHONE_ID || process.env.WHATSAPP_PHONE_NUMBER_ID;
  if (!expectedPhoneId) return res.sendStatus(503);

  try {
    for (const entry of (req.body.entry || []).slice(0, 20)) {
      for (const change of (entry.changes || []).slice(0, 20)) {
        if (change.field !== 'messages') continue;
        const value = change.value || {};
        if (String(value.metadata?.phone_number_id || '') !== String(expectedPhoneId)) continue;
        for (const message of (value.messages || []).slice(0, 50)) {
          if (!rememberMessage(message.id) || message.type !== 'text') continue;
          await sendWhatsAppMessage(message.from, answerFor(message.text?.body));
        }
      }
    }
    return res.status(200).json({ ok: true });
  } catch (error) {
    console.error('[WhatsApp] Error procesando webhook:', error.message);
    if (error instanceof PublicAppUrlError) {
      return res.status(503).json({ ok: false, error: 'Canal no configurado' });
    }
    return res.status(500).json({ ok: false });
  }
});

router.post('/send-alert', ...isTenantAdmin, (req, res) => {
  return res.status(410).json({
    ok: false,
    code: 'WHATSAPP_ALERT_TENANT_SCOPE_NOT_GOVERNED',
    error: 'Las alertas salientes requieren destinatario por municipio, auditoría e idempotencia.',
  });
});

router.get('/status', ...isTenantAdmin, (req, res) => {
  const configured = Boolean(
    process.env.WHATSAPP_APP_SECRET &&
    (process.env.WHATSAPP_PHONE_ID || process.env.WHATSAPP_PHONE_NUMBER_ID) &&
    process.env.WHATSAPP_ACCESS_TOKEN
  );
  return res.json({ status: configured ? 'configured' : 'not_configured', version: '3.0' });
});

module.exports = router;
