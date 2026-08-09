import { noStore, requireRole } from './lib/auth.js';

const INTELLIGENCE_ROLES = ['SUPER_ADMIN', 'TENANT_ADMIN', 'INTENDENTE', 'CONTADOR'];

export default async function handler(req, res) {
  noStore(res);
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') return res.status(204).end();
  if (!['GET', 'POST'].includes(req.method)) {
    return res.status(405).json({ error: 'Método no permitido' });
  }

  const caller = await requireRole(req, res, INTELLIGENCE_ROLES);
  if (!caller) return;

  return res.status(410).json({
    error: 'La inteligencia legacy basada en tablas sin contrato semántico fue retirada.',
    code: 'LEGACY_INTELLIGENCE_RETIRED',
    dataStatus: {
      available: false,
      operational: false,
      reason: 'Las filas importadas no permiten inferir empleados, moneda, presupuesto, avance ni proyecciones confiables.'
    },
    replacement: {
      page: '/ia.html',
      endpoint: '/api/ai-analyze',
      scope: 'Contrato privado GRH, agregado y determinista.'
    }
  });
}
