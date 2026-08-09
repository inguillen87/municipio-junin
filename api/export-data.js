import { noStore, requireDatasetTenant, requireRole } from './lib/auth.js';

const EXPORT_ROLES = ['SUPER_ADMIN', 'TENANT_ADMIN', 'INTENDENTE', 'CONTADOR'];

export default async function handler(req, res) {
  noStore(res);
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Método no permitido' });
  }

  const caller = await requireRole(req, res, EXPORT_ROLES);
  if (!caller || !requireDatasetTenant(res, caller, 'LEGACY_ANALYTICS_TENANT_ID')) return;

  return res.status(410).json({
    error: 'La exportación cruda está retirada hasta clasificar datasets, campos sensibles y finalidad',
    code: 'RAW_DATA_EXPORT_NOT_GOVERNED',
  });
}
