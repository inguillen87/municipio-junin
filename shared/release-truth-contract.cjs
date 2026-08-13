'use strict';

const HEADER_NAME = 'X-MuniControl-Contract';

// These POST-only contracts issue sessions and therefore must never be added
// to API_CONTRACTS: the deployment-truth gate probes API_CONTRACTS with
// anonymous GET requests and is intentionally unable to mint credentials.
const SESSION_EXCHANGE_CONTRACTS = Object.freeze({
  '/api/auth/evaluation-session': 'municontrol-evaluation-session-v1',
  '/api/auth/private-link-session': 'municontrol-private-link-session-v1',
});

const API_CONTRACTS = Object.freeze({
  '/api/auth/me': 'municontrol-auth-me-v1',
  '/api/grh-executive': 'grh-executive-v2',
  '/api/grh-quality': 'grh-quality-v1',
  '/api/grh-close': 'grh-close-v1',
  '/api/grh-decision-brief': 'grh-decision-brief-v1',
  '/api/grh-action-ledger': 'grh-action-ledger-v1',
  '/api/grh-data': 'grh-raw-retired-v1',
  '/api/grh-directory': 'grh-directory-v3',
  '/api/grh-directory-access': 'grh-directory-access-v1',
  '/api/grh-administration-comparison': 'grh-administration-comparison-v1',
  '/api/grh-employment-review': 'grh-employment-review-v1',
  '/api/grh-domain-catalog': 'grh-domain-catalog-v1',
  '/api/grh-organization-analytics': 'grh-organization-analytics-v2',
  '/api/grh-movement-operations': 'grh-movement-operations-v1',
  '/api/grh-workforce-finance': 'grh-workforce-finance-v1',
  '/api/municipal-territory': 'municipal-territory-v2',
});

module.exports = Object.freeze({
  HEADER_NAME,
  API_CONTRACTS,
  SESSION_EXCHANGE_CONTRACTS,
});
