import { isTrustedInternalRequest, noStore } from './lib/auth.js';

// Scheduled delivery is deliberately retired until report generation, delivery,
// idempotency and tenant-bound audit share one governed contract.
export default async function handler(req, res) {
  noStore(res);
  if (!isTrustedInternalRequest(req)) {
    return res.status(401).json({ success: false, error: 'Unauthorized' });
  }
  return res.status(410).json({
    success: false,
    code: 'SCHEDULED_REPORT_DELIVERY_NOT_GOVERNED',
    error: 'La entrega programada está retirada hasta contar con auditoría tenant-bound e idempotencia verificable',
  });
}
