import { cors, noStore, requireRole, tenantForRequest } from '../lib/auth.js';

const GOVERNANCE_ROLES = ['SUPER_ADMIN', 'TENANT_ADMIN'];

export default async function handler(req, res) {
  cors(req, res);
  noStore(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).end();

  const user = await requireRole(req, res, GOVERNANCE_ROLES);
  if (!user) return;
  if (!tenantForRequest(req, res, user)) return;

  return res.status(410).json({
    error: 'La importación directa a tablas operativas está retirada; use la ingesta gobernada de datasets',
    code: 'DIRECT_CORE_IMPORT_RETIRED',
  });
}
