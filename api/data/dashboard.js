import { cors, noStore, requireRole, tenantForRequest } from '../lib/auth.js';

const GOVERNANCE_ROLES = ['INTENDENTE', 'CONTADOR'];

export default async function handler(req, res) {
  cors(req, res);
  noStore(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).end();

  const user = await requireRole(req, res, GOVERNANCE_ROLES);
  if (!user) return;
  if (!tenantForRequest(req, res, user)) return;

  return res.status(410).json({
    error: 'Dashboard legacy retirado; use los contratos agregados GRH hasta certificar Hacienda y dominios operativos',
    code: 'LEGACY_CROSS_DOMAIN_DASHBOARD_RETIRED',
  });
}
