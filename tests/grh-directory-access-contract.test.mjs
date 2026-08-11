import assert from 'node:assert/strict';
import test from 'node:test';

import {
  GRH_DIRECTORY_ACCESS_LIMITS,
  GRH_DIRECTORY_ACCESS_PURPOSES,
  GRH_DIRECTORY_ACCESS_SCHEMA_VERSION,
  GRH_DIRECTORY_PERMISSION,
  inspectGrhDirectoryAccessResponse,
} from '../api/lib/grh-directory-access-contract.js';

function fixture(overrides = {}) {
  return {
    schemaVersion: GRH_DIRECTORY_ACCESS_SCHEMA_VERSION,
    status: 'active',
    policyVersion: 'grh-directory-policy:2026-08-11.1',
    permission: GRH_DIRECTORY_PERMISSION,
    scope: {
      kind: 'ORG_SUBTREE',
      label: 'Secretaria de Gobierno y dependencias',
      organizationCount: 7,
    },
    validity: {
      validFrom: '2026-08-11T00:00:00.000Z',
      validUntil: '2026-12-31T23:59:59.000Z',
    },
    audit: {
      required: true,
      purposes: [...GRH_DIRECTORY_ACCESS_PURPOSES],
      storesPersonalQuery: false,
    },
    limits: [...GRH_DIRECTORY_ACCESS_LIMITS],
    ...overrides,
  };
}

test('accepts an exact active scoped access receipt', () => {
  assert.deepEqual(inspectGrhDirectoryAccessResponse(fixture()), {
    ok: true,
    errors: [],
  });
});

test('accepts an exact shadow tenant receipt without invented validity', () => {
  const value = fixture({
    status: 'shadow',
    policyVersion: 'legacy-env-shadow-v1',
    scope: { kind: 'TENANT', label: 'Todo el municipio', organizationCount: null },
    validity: { validFrom: null, validUntil: null },
  });
  assert.equal(inspectGrhDirectoryAccessResponse(value).ok, true);
});

test('accepts an honest static pilot receipt without claiming active audit', () => {
  const value = fixture({
    status: 'static',
    policyVersion: 'static:2026-08-11.3',
    scope: { kind: 'TENANT', label: 'Todo el municipio', organizationCount: null },
    validity: { validFrom: null, validUntil: null },
    audit: { ...fixture().audit, required: false },
  });
  assert.equal(inspectGrhDirectoryAccessResponse(value).ok, true);
});

test('rejects shape drift, unsafe versions and non-canonical allowlists', () => {
  const mutations = [
    { ...fixture(), extra: true },
    fixture({ policyVersion: 'policy version with spaces' }),
    fixture({ permission: 'grh.directory:*' }),
    fixture({ audit: { ...fixture().audit, storesPersonalQuery: true } }),
    fixture({ audit: { ...fixture().audit, purposes: [...GRH_DIRECTORY_ACCESS_PURPOSES].reverse() } }),
    fixture({ limits: [...GRH_DIRECTORY_ACCESS_LIMITS].reverse() }),
    fixture({
      status: 'static',
      policyVersion: 'static:2026-08-11.3',
      scope: { kind: 'TENANT', label: 'Todo el municipio', organizationCount: null },
      validity: { validFrom: null, validUntil: null },
    }),
    fixture({ status: 'shadow', audit: { ...fixture().audit, required: false } }),
  ];
  for (const value of mutations) assert.equal(inspectGrhDirectoryAccessResponse(value).ok, false);
});

test('rejects invalid scoped counts and invalid or inverted validity', () => {
  const mutations = [
    fixture({ scope: { kind: 'ORG_UNIT', label: 'Compras', organizationCount: 0 } }),
    fixture({ scope: { kind: 'ORG_SUBTREE', label: 'Compras', organizationCount: null } }),
    fixture({ validity: { validFrom: null, validUntil: null } }),
    fixture({ validity: { validFrom: '2026-08-11T00:00:00Z', validUntil: null } }),
    fixture({
      validity: {
        validFrom: '2026-12-31T23:59:59.000Z',
        validUntil: '2026-08-11T00:00:00.000Z',
      },
    }),
  ];
  for (const value of mutations) assert.equal(inspectGrhDirectoryAccessResponse(value).ok, false);
});
