import crypto from 'crypto';

const MAX_WEBHOOK_BYTES = 1024 * 1024;
const MAX_TRACKED_MESSAGES = 2000;
const processingMessages = new Set();
const completedMessages = new Set();

export class WebhookAuthError extends Error {
  constructor(message, status = 401) {
    super(message);
    this.name = 'WebhookAuthError';
    this.status = status;
  }
}

export function verifyWebhookChallenge(mode, token) {
  const configured = process.env.WHATSAPP_VERIFY_TOKEN;
  if (mode !== 'subscribe' || !configured || typeof token !== 'string') return false;
  const received = Buffer.from(token);
  const expected = Buffer.from(configured);
  return received.length === expected.length && crypto.timingSafeEqual(received, expected);
}

async function readRawBody(req) {
  const chunks = [];
  let size = 0;

  for await (const chunk of req) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += buffer.length;
    if (size > MAX_WEBHOOK_BYTES) {
      throw new WebhookAuthError('Webhook demasiado grande', 413);
    }
    chunks.push(buffer);
  }

  return Buffer.concat(chunks);
}

function verifyMetaSignature(rawBody, signatureHeader) {
  const secret = process.env.WHATSAPP_APP_SECRET;
  if (!secret) throw new WebhookAuthError('Webhook no configurado', 503);
  if (typeof signatureHeader !== 'string' || !signatureHeader.startsWith('sha256=')) {
    return false;
  }

  const receivedHex = signatureHeader.slice(7);
  if (!/^[a-f0-9]{64}$/i.test(receivedHex)) return false;
  const expected = crypto.createHmac('sha256', secret).update(rawBody).digest();
  const received = Buffer.from(receivedHex, 'hex');
  return received.length === expected.length && crypto.timingSafeEqual(received, expected);
}

export async function parseVerifiedWebhook(req) {
  const rawBody = await readRawBody(req);
  if (!verifyMetaSignature(rawBody, req.headers['x-hub-signature-256'])) {
    throw new WebhookAuthError('Firma inválida', 401);
  }

  let body;
  try {
    body = JSON.parse(rawBody.toString('utf8'));
  } catch {
    throw new WebhookAuthError('JSON inválido', 400);
  }

  if (!body || body.object !== 'whatsapp_business_account' || !Array.isArray(body.entry)) {
    throw new WebhookAuthError('Evento no soportado', 400);
  }
  return body;
}

export function isAllowedPhoneId(phoneId, envNames) {
  const allowed = new Set(
    envNames.map(name => process.env[name]).filter(Boolean).map(String)
  );
  if (!allowed.size) throw new WebhookAuthError('Phone ID no configurado', 503);
  return allowed.has(String(phoneId || ''));
}

export function beginMessage(messageId) {
  if (!messageId || processingMessages.has(messageId) || completedMessages.has(messageId)) return false;
  processingMessages.add(messageId);
  return true;
}

export function completeMessage(messageId) {
  processingMessages.delete(messageId);
  completedMessages.add(messageId);
  if (completedMessages.size > MAX_TRACKED_MESSAGES) {
    const oldest = completedMessages.values().next().value;
    completedMessages.delete(oldest);
  }
}

export function releaseMessage(messageId) {
  processingMessages.delete(messageId);
}
