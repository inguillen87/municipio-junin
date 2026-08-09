import { cors, noStore, requireRole } from '../lib/auth.js';

export default async function handler(req, res) {
  cors(req, res);
  noStore(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).end();

  const caller = await requireRole(req, res, ['SUPER_ADMIN']);
  if (!caller) return;
  return res.status(410).json({
    error: 'Seed remoto retirado. El aprovisionamiento se realiza fuera de banda con secretos individuales y sin datos municipales ficticios.',
  });
}
