import { randomUUID } from 'node:crypto';

import { GRH_DIRECTORY_ACCESS_PURPOSES } from './grh-directory-access-contract.js';

const PURPOSE_SET = new Set(GRH_DIRECTORY_ACCESS_PURPOSES);
// Correlation is deliberately opaque. Accepting caller-controlled labels here
// would let a name, query or legajo cross into the otherwise sanitized ledger.
const CORRELATION_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function scalarHeader(value) {
  if (Array.isArray(value)) return value.length === 1 ? value[0] : null;
  return value;
}

export function parseGrhDirectoryRequestContext(req, { detail = false, generateId = randomUUID } = {}) {
  const rawPurpose = scalarHeader(req?.headers?.['x-municontrol-purpose']);
  const purpose = typeof rawPurpose === 'string' ? rawPurpose.trim() : '';
  if (!PURPOSE_SET.has(purpose)) return null;
  if (detail && purpose === 'DIRECTORY_BROWSE') return null;

  const suppliedCorrelationHeader = req?.headers?.['x-correlation-id'];
  const rawCorrelationId = scalarHeader(suppliedCorrelationHeader);
  if (suppliedCorrelationHeader !== undefined && rawCorrelationId === null) return null;
  const requestedCorrelationId = typeof rawCorrelationId === 'string' ? rawCorrelationId.trim() : '';
  if (requestedCorrelationId && !CORRELATION_ID_PATTERN.test(requestedCorrelationId)) return null;
  const correlationId = requestedCorrelationId || String(generateId());
  if (!CORRELATION_ID_PATTERN.test(correlationId)) return null;

  return Object.freeze({ purpose, correlationId });
}
