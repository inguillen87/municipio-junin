import { noStore, requireRoleOrInternal } from './lib/auth.js';

const ALERT_ROLES = ['SUPER_ADMIN', 'TENANT_ADMIN'];

export default async function handler(req, res) {
  noStore(res);
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const caller = await requireRoleOrInternal(req, res, ALERT_ROLES);
  if (!caller) return;

  return res.status(410).json({
    success: false,
    code: 'WHATSAPP_ALERT_TENANT_SCOPE_NOT_GOVERNED',
    error: 'Las alertas salientes requieren destinatario por municipio, auditoría e idempotencia.',
  });
}
