import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import {
  buildGrhPrintableHtml,
  createPdfReportHandler,
} from '../api/pdf-report.js';

const PROFILE_URL = new URL('../api/_data/grh-profile.json', import.meta.url);
const SEMANTIC_URL = new URL('../api/_data/grh-semantic.json', import.meta.url);
const HAS_PRIVATE_GRH = existsSync(PROFILE_URL) && existsSync(SEMANTIC_URL);

function realBundle() {
  const profile = JSON.parse(readFileSync(PROFILE_URL, 'utf8'));
  const semantic = JSON.parse(readFileSync(SEMANTIC_URL, 'utf8'));
  return {
    profile,
    semantic,
    provenance: {
      sourceFile: profile.source,
      sourceSha256: profile.sha256,
      approvedSourceSha256: profile.sha256,
      snapshotAsOf: profile.snapshot_as_of,
      profileSchemaVersion: profile.schema_version,
      semanticSchemaVersion: semantic.schema_version,
    },
  };
}

function responseRecorder() {
  return {
    statusCode: 200,
    payload: undefined,
    headers: {},
    setHeader(name, value) { this.headers[String(name).toLowerCase()] = value; },
    status(code) { this.statusCode = code; return this; },
    json(payload) { this.payload = payload; return this; },
    send(payload) { this.payload = payload; return this; },
    end() { return this; },
  };
}

test('printable report reads the bundle contract, not a raw semantic artifact', async () => {
  const source = await readFile(new URL('../api/pdf-report.js', import.meta.url), 'utf8');
  assert.match(source, /readGrhArtifactBundle/);
  assert.match(source, /buildPortableGrhViews/);
  assert.doesNotMatch(source, /readGrhArtifact\(|valid_by_year|distinct_participants_by_year|calculation_control_series/);
  assert.doesNotMatch(source, /from ['"]pg['"]|\bPool\b|DATABASE_URL|INSERT\s+INTO|UPDATE\s+/i);
});

test('A4 printable output contains only released compensation and safe quality evidence', { skip: !HAS_PRIVATE_GRH }, () => {
  const html = buildGrhPrintableHtml(realBundle(), { generatedAt: '08/08/2026 20:00' });
  assert.match(html, /@page\{size:A4/);
  assert.match(html, /Privacidad: grh-small-cell-v1 · k=10/);
  assert.match(html, /grh-semantic-v2/);
  assert.match(html, /Neto de control · ARS/i);
  assert.match(html, /dump original no declara un código de moneda/i);
  assert.match(html, /no acreditan pago bancario/i);
  assert.match(html, /personas_junin: excluida/i);
  assert.doesNotMatch(html, /Ausencias\s*[·-]\s*\d|Licencias\s*[·-]\s*\d|Movimientos\s*[·-]\s*\d/i);
  assert.doesNotMatch(html, /sourceCode|companyCode|calculation_rows|control_rows|net_identity_variance/i);
});

test('printable handler authorizes tenant then reads exactly one bundle', { skip: !HAS_PRIVATE_GRH }, async () => {
  const calls = [];
  const handler = createPdfReportHandler({
    requireRoleImpl: async (_req, _res, roles) => {
      calls.push(['role', roles]);
      return { id: 'official', role: 'INTENDENTE', tenantId: 'tenant-grh-test' };
    },
    requireDatasetTenantImpl: (_res, caller, envName) => {
      calls.push(['tenant', caller.tenantId, envName]);
      return true;
    },
    readArtifactBundleImpl: async tenantId => {
      calls.push(['bundle', tenantId]);
      return realBundle();
    },
  });
  const originalTenant = process.env.GRH_TENANT_ID;
  process.env.GRH_TENANT_ID = 'tenant-grh-test';
  try {
    const response = responseRecorder();
    await handler({ method: 'GET', query: { type: 'rrhh' }, headers: {} }, response);
    assert.equal(response.statusCode, 200);
    assert.equal(calls.filter(([kind]) => kind === 'bundle').length, 1);
    assert.deepEqual(calls.slice(1), [
      ['tenant', 'tenant-grh-test', 'GRH_TENANT_ID'],
      ['bundle', 'tenant-grh-test'],
    ]);
    assert.equal(response.headers['cache-control'], 'no-store, private, max-age=0');
    assert.match(response.headers['content-security-policy'], /default-src 'none'/);
  } finally {
    if (originalTenant === undefined) delete process.env.GRH_TENANT_ID;
    else process.env.GRH_TENANT_ID = originalTenant;
  }
});

test('printable handler fails closed on provenance drift', { skip: !HAS_PRIVATE_GRH }, async () => {
  const bundle = realBundle();
  bundle.provenance.sourceSha256 = 'b'.repeat(64);
  const handler = createPdfReportHandler({
    requireRoleImpl: async () => ({ id: 'official', tenantId: 'tenant-grh-test' }),
    requireDatasetTenantImpl: () => true,
    readArtifactBundleImpl: async () => bundle,
  });
  const response = responseRecorder();
  const originalConsoleError = console.error;
  console.error = () => {};
  try {
    await handler({ method: 'GET', query: { type: 'resumen' }, headers: {} }, response);
  } finally {
    console.error = originalConsoleError;
  }
  assert.equal(response.statusCode, 503);
  assert.equal(response.payload.code, 'GRH_PRINTABLE_CONTRACT_UNAVAILABLE');
  assert.doesNotMatch(JSON.stringify(response.payload), /stack|sha256|profile|semantic/i);
});
