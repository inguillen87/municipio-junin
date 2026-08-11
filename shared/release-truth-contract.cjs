'use strict';

const HEADER_NAME = 'X-MuniControl-Contract';

const API_CONTRACTS = Object.freeze({
  '/api/auth/me': 'municontrol-auth-me-v1',
  '/api/grh-executive': 'grh-executive-v2',
  '/api/grh-quality': 'grh-quality-v1',
  '/api/grh-close': 'grh-close-v1',
  '/api/grh-decision-brief': 'grh-decision-brief-v1',
  '/api/grh-data': 'grh-raw-retired-v1',
  '/api/grh-directory': 'grh-directory-v1',
  '/api/grh-organization-analytics': 'grh-organization-analytics-v2',
  '/api/municipal-territory': 'municipal-territory-v1',
});

module.exports = Object.freeze({
  HEADER_NAME,
  API_CONTRACTS,
});
