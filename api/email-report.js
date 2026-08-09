import { noStore, requireRoleOrInternal } from './lib/auth.js';

const REPORT_ROLES = ['SUPER_ADMIN', 'TENANT_ADMIN', 'INTENDENTE'];

// Email delivery is intentionally unavailable until a tenant-bound, idempotent
// audit trail can prove prepare, provider acceptance and final delivery state.
export default async function handler(req, res) {
  noStore(res);
  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Method Not Allowed' });
  }
  const caller = await requireRoleOrInternal(req, res, REPORT_ROLES);
  if (!caller) return;
  return res.status(410).json({
    success: false,
    code: 'EMAIL_REPORT_AUDIT_NOT_GOVERNED',
    error: 'Entrega de correo retirada hasta contar con auditoría tenant-bound e idempotencia verificable',
  });
}
