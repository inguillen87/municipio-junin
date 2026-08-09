import { noStore, requireRole } from './lib/auth.js';

const AI_ROLES = ['SUPER_ADMIN', 'TENANT_ADMIN', 'INTENDENTE', 'CONTADOR'];

export default async function handler(req, res) {
  noStore(res);
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Método no permitido' });

  const caller = await requireRole(req, res, AI_ROLES);
  if (!caller) return;

  return res.status(410).json({
    error: 'El proxy generativo sin fuente municipal fue retirado.',
    code: 'UNGROUNDED_AI_PROXY_RETIRED',
    replacement: {
      page: '/ia.html',
      endpoint: '/api/ai-analyze',
      mode: 'grh-deterministic-v1'
    }
  });
}
