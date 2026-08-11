import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createGrhWorkforceFinanceHandler,
  GRH_WORKFORCE_FINANCE_RESOURCE,
} from '../api/grh-workforce-finance.js';
import routePolicy from '../shared/route-policy.cjs';

const SOURCE_SHA256 = 'a'.repeat(64);
const RELEASE_ID = 'c'.repeat(64);
const SNAPSHOT_AS_OF = '2026-08-06';
const TENANT_ID = 'tenant-junin';
const APPROVED_SOURCE_FIXTURE = Object.freeze({
  canonicalSystem: 'GRH Junín',
  sourceFile: 'grh_junin.backup_2026080615_plataforma.sql.gz',
  sourceSha256: SOURCE_SHA256,
  compressedSizeBytes: 44_537_741,
  snapshotAsOf: SNAPSHOT_AS_OF,
});

function responseRecorder() {
  return {
    statusCode: 200,
    payload: undefined,
    headers: {},
    setHeader(name, value) { this.headers[name.toLowerCase()] = value; },
    status(code) { this.statusCode = code; return this; },
    json(payload) { this.payload = payload; return this; },
    end() { return this; },
  };
}

function callerFixture(overrides = {}) {
  return {
    id: 'official-1',
    email: 'intendente@junin.gov.ar',
    role: 'INTENDENTE',
    tenantId: TENANT_ID,
    authMethod: 'jwt-db',
    tenant: {
      id: TENANT_ID,
      slug: 'junin',
      status: 'ACTIVE',
    },
    ...overrides,
  };
}

function bundleFixture(overrides = {}) {
  const provenance = {
    approvedSourceSha256: SOURCE_SHA256,
    sourceSha256: SOURCE_SHA256,
    sourceFile: 'grh_junin.backup_2026080615_plataforma.sql.gz',
    snapshotAsOf: SNAPSHOT_AS_OF,
    ...overrides,
  };
  return {
    provenance,
    profile: {
      canonical_source: 'GRH Junín',
      compressed_size_bytes: 44_537_741,
      source: provenance.sourceFile,
      sha256: provenance.sourceSha256,
      snapshot_as_of: provenance.snapshotAsOf,
    },
    semantic: {
      source: {
        canonical_system: 'GRH Junín',
        compressed_size_bytes: 44_537_741,
        file: provenance.sourceFile,
      },
    },
  };
}

function sourceArtifactFixture(overrides = {}) {
  return {
    schema_version: 'grh-workforce-finance-source-v1',
    policy_version: 'grh-workforce-finance-privacy-v1',
    release_id: RELEASE_ID,
    source: {
      canonical_system: 'GRH Junín',
      file: 'grh_junin.backup_2026080615_plataforma.sql.gz',
      compressed_size_bytes: 44_537_741,
      sha256: SOURCE_SHA256,
      snapshot_as_of: SNAPSHOT_AS_OF,
    },
    private_marker: 'raw-workforce-source-must-not-leave-server',
    ...overrides,
  };
}

function projectionFixture(overrides = {}) {
  return {
    schemaVersion: 'grh-workforce-finance-v1',
    policyVersion: 'grh-workforce-finance-privacy-v1',
    releaseId: RELEASE_ID,
    source: {
      canonicalSystem: 'GRH Junín',
      sourceFile: 'grh_junin.backup_2026080615_plataforma.sql.gz',
      compressedSizeBytes: 44_537_741,
      sourceSha256: SOURCE_SHA256,
      snapshotAsOf: SNAPSHOT_AS_OF,
    },
    views: [],
    safeMarker: 'validated-k10-projection',
    ...overrides,
  };
}

function baseDependencies(overrides = {}) {
  return {
    requireCapabilityImpl: async () => callerFixture(),
    requireDatasetTenantImpl: () => true,
    readArtifactBundleImpl: async () => bundleFixture(),
    readWorkforceFinanceArtifactImpl: async () => ({ payload: sourceArtifactFixture() }),
    inspectSourceImpl: () => ({ ok: true, errors: [] }),
    buildProjectionImpl: () => projectionFixture(),
    inspectContractImpl: () => ({ ok: true, errors: [] }),
    approvedSource: APPROVED_SOURCE_FIXTURE,
    approvedReleaseId: RELEASE_ID,
    environment: {},
    ...overrides,
  };
}

function withQuietErrors(callback) {
  const original = console.error;
  console.error = () => {};
  return Promise.resolve()
    .then(callback)
    .finally(() => { console.error = original; });
}

test('workforce-finance is GET-only and advertises the exact release contract without caching', async () => {
  let authenticated = false;
  const handler = createGrhWorkforceFinanceHandler({
    requireCapabilityImpl: async () => { authenticated = true; return null; },
  });
  const response = responseRecorder();

  await handler({ method: 'POST', url: '/api/grh-workforce-finance', query: {}, headers: {} }, response);

  assert.equal(response.statusCode, 405);
  assert.equal(response.payload.code, 'METHOD_NOT_ALLOWED');
  assert.equal(response.headers.allow, 'GET');
  assert.equal(response.headers['x-municontrol-contract'], 'grh-workforce-finance-v1');
  assert.equal(response.headers['cache-control'], 'no-store, private, max-age=0');
  assert.equal(response.headers.pragma, 'no-cache');
  assert.equal(response.headers['x-content-type-options'], 'nosniff');
  assert.equal(response.headers.vary, 'Authorization');
  assert.equal(authenticated, false);
});

test('canonical capability and tenant gates run before every source read', async () => {
  let tenantChecks = 0;
  let reads = 0;
  const deniedByCapability = createGrhWorkforceFinanceHandler({
    requireCapabilityImpl: async (_req, res, resource, action) => {
      assert.equal(resource, GRH_WORKFORCE_FINANCE_RESOURCE);
      assert.equal(resource, routePolicy.RESOURCES.GRH_WORKFORCE_FINANCE);
      assert.equal(action, routePolicy.ACTIONS.READ);
      res.status(403).json({ code: 'ROUTE_PERMISSION_DENIED' });
      return null;
    },
    requireDatasetTenantImpl: () => { tenantChecks += 1; return true; },
    readArtifactBundleImpl: async () => { reads += 1; },
  });
  const capabilityResponse = responseRecorder();
  await deniedByCapability({ method: 'GET', url: '/api/grh-workforce-finance', query: {}, headers: {} }, capabilityResponse);
  assert.equal(capabilityResponse.statusCode, 403);
  assert.equal(tenantChecks, 0);
  assert.equal(reads, 0);

  const deniedByTenant = createGrhWorkforceFinanceHandler({
    requireCapabilityImpl: async () => callerFixture({ tenantId: 'foreign-tenant' }),
    requireDatasetTenantImpl: (res, caller, environmentName) => {
      tenantChecks += 1;
      assert.equal(caller.tenantId, 'foreign-tenant');
      assert.equal(environmentName, 'GRH_TENANT_ID');
      res.status(403).json({ code: 'DATASET_TENANT_DENIED' });
      return false;
    },
    readArtifactBundleImpl: async () => { reads += 1; },
  });
  const tenantResponse = responseRecorder();
  await deniedByTenant({ method: 'GET', url: '/api/grh-workforce-finance', query: {}, headers: {} }, tenantResponse);
  assert.equal(tenantResponse.statusCode, 403);
  assert.equal(tenantChecks, 1);
  assert.equal(reads, 0);
});

test('query filters fail closed after authorization and before artifact access', async () => {
  let capabilityChecks = 0;
  let tenantChecks = 0;
  let reads = 0;
  const handler = createGrhWorkforceFinanceHandler(baseDependencies({
    requireCapabilityImpl: async () => { capabilityChecks += 1; return callerFixture(); },
    requireDatasetTenantImpl: () => { tenantChecks += 1; return true; },
    readArtifactBundleImpl: async () => { reads += 1; return bundleFixture(); },
  }));
  const response = responseRecorder();

  await handler({
    method: 'GET',
    url: '/api/grh-workforce-finance?dimension=sector',
    query: { dimension: 'sector' },
    headers: {},
  }, response);

  assert.equal(response.statusCode, 400);
  assert.equal(response.payload.code, 'GRH_WORKFORCE_FINANCE_QUERY_UNSUPPORTED');
  assert.equal(capabilityChecks, 1);
  assert.equal(tenantChecks, 1);
  assert.equal(reads, 0);
});

test('the endpoint pins the source to the active bundle and returns only the validated k=10 projection', async () => {
  const calls = [];
  const environment = { GRH_WORKFORCE_FINANCE_ARTIFACT_SOURCE: 'sealed' };
  const sourceArtifact = sourceArtifactFixture();
  const projection = projectionFixture();
  const handler = createGrhWorkforceFinanceHandler(baseDependencies({
    requireCapabilityImpl: async (_req, _res, resource, action) => {
      calls.push(['capability', resource, action]);
      return callerFixture();
    },
    requireDatasetTenantImpl: (_res, caller, environmentName) => {
      calls.push(['tenant', caller.tenantId, environmentName]);
      return true;
    },
    readArtifactBundleImpl: async tenantId => {
      calls.push(['bundle', tenantId]);
      return bundleFixture();
    },
    readWorkforceFinanceArtifactImpl: async options => {
      calls.push(['workforce', options]);
      return {
        payload: sourceArtifact,
        privateTransportMarker: 'sealed-envelope-must-not-leave-server',
      };
    },
    inspectSourceImpl: value => {
      calls.push(['inspect-source', value]);
      return { ok: true, errors: [] };
    },
    resolveTenantPresentationImpl: tenant => {
      calls.push(['presentation', tenant.slug]);
      return {
        schemaVersion: 'tenant-presentation-v1',
        locale: 'es-AR',
        timeZone: 'America/Argentina/Buenos_Aires',
        displayCurrencyCode: 'ARS',
        displayCurrencyBasis: 'tenant_configuration',
        displayCurrencyEffectiveOn: '2026-08-10',
        sourceCurrencyStatus: 'not_declared_in_source',
      };
    },
    hasConfiguredCurrencyImpl: value => {
      calls.push(['configured-currency', value.displayCurrencyCode]);
      return true;
    },
    buildProjectionImpl: (source, options) => {
      calls.push(['build', source, options]);
      assert.deepEqual(Object.keys(options), ['presentation']);
      assert.deepEqual(options.presentation, {
        schemaVersion: 'tenant-presentation-v1',
        locale: 'es-AR',
        displayCurrencyCode: 'ARS',
        basis: 'tenant_configuration',
        effectiveFrom: '2026-08-10',
        sourceCurrencyStatus: 'not_declared_in_source',
      });
      assert.equal(options.audience, undefined);
      return projection;
    },
    inspectContractImpl: value => {
      calls.push(['inspect-projection', value]);
      return { ok: true, errors: [] };
    },
    environment,
  }));
  const response = responseRecorder();

  await handler({ method: 'GET', url: '/api/grh-workforce-finance', query: {}, headers: {} }, response);

  assert.equal(response.statusCode, 200);
  assert.equal(response.payload, projection);
  assert.equal(calls[0][0], 'capability');
  assert.equal(calls[1][0], 'tenant');
  assert.equal(calls[2][0], 'bundle');
  assert.equal(calls[3][0], 'workforce');
  assert.deepEqual(calls[3][1], {
    tenantId: TENANT_ID,
    expectedSourceSha256: SOURCE_SHA256,
    expectedSnapshotAsOf: SNAPSHOT_AS_OF,
    expectedCanonicalSystem: 'GRH Junín',
    expectedSourceFile: 'grh_junin.backup_2026080615_plataforma.sql.gz',
    expectedCompressedSizeBytes: 44_537_741,
    expectedReleaseId: RELEASE_ID,
    environment,
  });
  assert.deepEqual(calls.slice(4).map(call => call[0]), [
    'inspect-source',
    'presentation',
    'configured-currency',
    'build',
    'inspect-projection',
  ]);
  const serialized = JSON.stringify(response.payload);
  assert.doesNotMatch(serialized, /raw-workforce|sealed-envelope|privateTransportMarker|private_marker/i);
});

test('published executive identities receive the same projection without an audience branch', async () => {
  for (const [role, email] of [
    ['TENANT_ADMIN', 'admin@junin.gov.ar'],
    ['INTENDENTE', 'intendente@junin.gov.ar'],
    ['CONTADOR', 'contador@junin.gov.ar'],
  ]) {
    let buildOptions;
    const handler = createGrhWorkforceFinanceHandler(baseDependencies({
      requireCapabilityImpl: async () => callerFixture({
        role,
        email,
      }),
      buildProjectionImpl: (_source, options) => {
        buildOptions = options;
        return projectionFixture({ roleIndependent: true });
      },
    }));
    const response = responseRecorder();
    await handler({ method: 'GET', url: '/api/grh-workforce-finance', query: {}, headers: {} }, response);

    assert.equal(response.statusCode, 200, role);
    assert.equal(response.payload.roleIndependent, true, role);
    assert.deepEqual(Object.keys(buildOptions), ['presentation'], role);
    assert.equal(buildOptions.audience, undefined, role);
  }
});

test('source, provenance, presentation and output drift share one detail-free 503 boundary', async () => {
  const sensitive = 'Mauricio-legajo-123-database-password';
  const scenarios = [
    baseDependencies({
      readArtifactBundleImpl: async () => bundleFixture({ approvedSourceSha256: 'b'.repeat(64) }),
    }),
    baseDependencies({
      readWorkforceFinanceArtifactImpl: async () => { throw new Error(sensitive); },
    }),
    baseDependencies({ inspectSourceImpl: () => ({ ok: false, errors: [sensitive] }) }),
    baseDependencies({
      readWorkforceFinanceArtifactImpl: async () => ({
        payload: sourceArtifactFixture({
          source: {
            canonical_system: 'GRH Mars',
            file: 'grh_junin.backup_2026080615_plataforma.sql.gz',
            compressed_size_bytes: 44_537_741,
            sha256: SOURCE_SHA256,
            snapshot_as_of: SNAPSHOT_AS_OF,
          },
        }),
      }),
    }),
    baseDependencies({
      readWorkforceFinanceArtifactImpl: async () => ({
        payload: sourceArtifactFixture({
          source: {
            canonical_system: 'GRH Junín',
            file: 'grh_junin.fake.sql.gz',
            compressed_size_bytes: 1,
            sha256: SOURCE_SHA256,
            snapshot_as_of: SNAPSHOT_AS_OF,
          },
        }),
      }),
    }),
    baseDependencies({
      readWorkforceFinanceArtifactImpl: async () => ({
        payload: sourceArtifactFixture({
          source: { sha256: 'b'.repeat(64), snapshot_as_of: SNAPSHOT_AS_OF },
        }),
      }),
    }),
    baseDependencies({ hasConfiguredCurrencyImpl: () => false }),
    baseDependencies({ buildProjectionImpl: () => { throw new Error(sensitive); } }),
    baseDependencies({
      buildProjectionImpl: () => projectionFixture({
        source: { sourceSha256: 'b'.repeat(64), snapshotAsOf: SNAPSHOT_AS_OF },
      }),
    }),
    baseDependencies({
      buildProjectionImpl: () => projectionFixture({
        source: {
          canonicalSystem: 'GRH Mars',
          sourceFile: 'grh_junin.fake.sql.gz',
          compressedSizeBytes: 1,
          sourceSha256: SOURCE_SHA256,
          snapshotAsOf: SNAPSHOT_AS_OF,
        },
      }),
    }),
    baseDependencies({ inspectContractImpl: () => ({ ok: false, errors: [sensitive] }) }),
  ];

  for (const dependencies of scenarios) {
    const handler = createGrhWorkforceFinanceHandler(dependencies);
    const response = responseRecorder();
    await withQuietErrors(() => handler({
      method: 'GET',
      url: '/api/grh-workforce-finance',
      query: {},
      headers: {},
    }, response));

    assert.equal(response.statusCode, 503);
    assert.deepEqual(response.payload, {
      error: 'La analitica de dotacion y finanzas GRH no esta disponible.',
      code: 'GRH_WORKFORCE_FINANCE_UNAVAILABLE',
    });
    assert.doesNotMatch(JSON.stringify(response.payload), /Mauricio|legajo|password|stack|errors/i);
  }
});

test('missing workforce runtime configuration affects only the new route and fails closed', async () => {
  const handler = createGrhWorkforceFinanceHandler(baseDependencies({
    readWorkforceFinanceArtifactImpl: undefined,
    environment: {},
  }));
  const response = responseRecorder();

  await withQuietErrors(() => handler({
    method: 'GET',
    url: '/api/grh-workforce-finance',
    query: {},
    headers: {},
  }, response));

  assert.equal(response.statusCode, 503);
  assert.equal(response.payload.code, 'GRH_WORKFORCE_FINANCE_UNAVAILABLE');
});
