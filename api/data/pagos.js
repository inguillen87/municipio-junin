import { cors, noStore, requireRole, tenantForRequest } from '../lib/auth.js';

const GOVERNANCE_ROLES = ['SUPER_ADMIN', 'TENANT_ADMIN', 'INTENDENTE', 'CONTADOR'];

export default async function handler(req, res) {
  cors(req, res);
  noStore(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (!['GET', 'POST', 'PUT', 'DELETE'].includes(req.method)) return res.status(405).end();

  const user = await requireRole(req, res, GOVERNANCE_ROLES);
  if (!user) return;
  if (!tenantForRequest(req, res, user)) return;

  return res.status(410).json({
    error: 'La operación de pagos está retirada hasta activar Tesorería, Contaduría y segregación de funciones',
    code: 'PAYMENT_WORKFLOW_NOT_GOVERNED',
  });
}
