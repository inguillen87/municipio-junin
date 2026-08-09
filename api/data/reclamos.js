import { cors, noStore, requireRole, tenantForRequest } from '../lib/auth.js';

const CLAIM_ROLES = ['SUPER_ADMIN', 'TENANT_ADMIN', 'INTENDENTE', 'INSPECTOR'];

export default async function handler(req, res) {
  cors(req, res);
  noStore(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (!['GET', 'POST', 'PUT', 'DELETE'].includes(req.method)) return res.status(405).end();

  const user = await requireRole(req, res, CLAIM_ROLES);
  if (!user) return;
  if (!tenantForRequest(req, res, user)) return;

  return res.status(410).json({
    error: 'La gestión de reclamos está retirada hasta activar asignaciones por caso, consulta pública anti-enumeración y minimización de PII',
    code: 'CLAIM_ASSIGNMENT_SCOPE_NOT_GOVERNED',
  });
}
