import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  inspectDeployment,
  normalizeBaseUrl,
  parseDemoFigures,
  readLocalReleaseContract,
  readLocalManualVersion,
  resolveCliConfiguration,
} from '../scripts/check-deployment-truth.mjs';
import releaseTruthContract from '../shared/release-truth-contract.cjs';

const { API_CONTRACTS, HEADER_NAME: API_CONTRACT_HEADER } = releaseTruthContract;

const root = path.resolve(import.meta.dirname, '..');
const cliPath = path.join(root, 'scripts', 'check-deployment-truth.mjs');
const sharedContractPath = path.join(root, 'shared', 'release-truth-contract.cjs');
const FIXED_TIME = '2026-08-09T15:00:00.000Z';
const CURRENT_ENTRY = `<!doctype html>
<html>
  <head><title>Acceso al Sistema | MuniControl</title></head>
  <body><main>Ingreso seguro a MuniControl</main></body>
</html>`;
const CURRENT_ROOT = `<!doctype html>
<html>
  <head><title>Panel Principal | MuniControl</title></head>
  <body>
    <p>Panorama ejecutivo del snapshot gobernado de GRH.</p>
    <p>Las proyecciones excluyen personas_junin.</p>
    <script src="js/grh-secure-data.js"></script>
  </body>
</html>`;
const CURRENT_WORKSPACE = `<!doctype html>
<html>
  <head><title>Inicio | MuniControl</title></head>
  <body><main>Workspace institucional gobernado por rol.</main></body>
</html>`;
const CURRENT_MANUAL = `<!doctype html>
<html><body data-doc-version="1.5.0">
  <p>Snapshot fechado, no tiempo real</p>
  <code>grh-executive-v2</code><code>grh-quality-v1</code>
</body></html>`;
const VALID_VERCEL_CONFIG = JSON.stringify({
  cleanUrls: true,
  rewrites: [
    { source: '/', destination: '/login.html' },
    { source: '/inicio', destination: '/inicio.html' },
  ],
}, null, 2);
const API_PATHS = Object.keys(API_CONTRACTS);

function canonicalDigest(source) {
  return crypto.createHash('sha256').update(source.replace(/\r\n?/g, '\n'), 'utf8').digest('hex');
}

function send(res, status, contentType, body, headers = {}) {
  res.writeHead(status, {
    'content-type': contentType,
    'cache-control': 'no-store',
    ...headers,
  });
  res.end(body);
}

async function startFixture(t, handlers = {}) {
  const requests = [];
  const sockets = new Set();
  const server = http.createServer((req, res) => {
    requests.push({
      method: req.method,
      path: req.url,
      authorization: req.headers.authorization,
      cookie: req.headers.cookie,
    });
    if (handlers[req.url]) {
      handlers[req.url](req, res);
      return;
    }
    if (req.url === '/') {
      send(res, 200, 'text/html; charset=utf-8', CURRENT_ENTRY);
      return;
    }
    if (req.url === '/dashboard') {
      send(res, 200, 'text/html; charset=utf-8', CURRENT_ROOT);
      return;
    }
    if (req.url === '/inicio') {
      send(res, 200, 'text/html; charset=utf-8', CURRENT_WORKSPACE);
      return;
    }
    if (req.url === '/manuales') {
      send(res, 200, 'text/html; charset=utf-8', CURRENT_MANUAL);
      return;
    }
    if (API_PATHS.includes(req.url)) {
      send(res, 401, 'application/json; charset=utf-8', JSON.stringify({
        error: 'No autorizado',
        privateDetail: 'persona.real@example.test',
      }), { [API_CONTRACT_HEADER]: API_CONTRACTS[req.url] });
      return;
    }
    send(res, 404, 'text/html; charset=utf-8', '<h1>No encontrado</h1>');
  });
  server.on('connection', (socket) => {
    sockets.add(socket);
    socket.on('close', () => sockets.delete(socket));
  });
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const address = server.address();
  assert.ok(address && typeof address === 'object');

  t.after(async () => {
    await new Promise((resolve) => {
      server.close(resolve);
      for (const socket of sockets) socket.destroy();
    });
  });
  return {
    baseUrl: `http://127.0.0.1:${address.port}/`,
    requests,
  };
}

function inspectFixture(baseUrl, overrides = {}) {
  return inspectDeployment({
    baseUrl,
    expectedManualVersion: '1.5.0',
    expectedEntryDigest: canonicalDigest(CURRENT_ENTRY),
    expectedRootDigest: canonicalDigest(CURRENT_ROOT),
    expectedWorkspaceDigest: canonicalDigest(CURRENT_WORKSPACE),
    expectedManualDigest: canonicalDigest(CURRENT_MANUAL),
    allowHttpLoopback: true,
    timeoutMs: 1_000,
    maxBodyBytes: 8_192,
    maxRedirects: 2,
    now: () => new Date(FIXED_TIME),
    ...overrides,
  });
}

function createInMemoryFetch() {
  const calls = [];
  return {
    calls,
    async fetchImpl(input, options) {
      const url = new URL(input);
      calls.push({ path: url.pathname, method: options?.method, redirect: options?.redirect });
      if (url.pathname === '/') {
        return new Response(CURRENT_ENTRY, {
          status: 200,
          headers: { 'content-type': 'text/html; charset=utf-8' },
        });
      }
      if (url.pathname === '/dashboard') {
        return new Response(CURRENT_ROOT, {
          status: 200,
          headers: { 'content-type': 'text/html; charset=utf-8' },
        });
      }
      if (url.pathname === '/inicio') {
        return new Response(CURRENT_WORKSPACE, {
          status: 200,
          headers: { 'content-type': 'text/html; charset=utf-8' },
        });
      }
      if (url.pathname === '/manuales') {
        return new Response(CURRENT_MANUAL, {
          status: 200,
          headers: { 'content-type': 'text/html; charset=utf-8' },
        });
      }
      if (API_PATHS.includes(url.pathname)) {
        return new Response(JSON.stringify({ error: 'No autorizado' }), {
          status: 401,
          headers: {
            'content-type': 'application/json; charset=utf-8',
            [API_CONTRACT_HEADER]: API_CONTRACTS[url.pathname],
          },
        });
      }
      return new Response('<h1>Not found</h1>', {
        status: 404,
        headers: { 'content-type': 'text/html; charset=utf-8' },
      });
    },
  };
}

function inspectPublicFixture({ fetchImpl, dnsLookupImpl, baseUrl = 'https://municipio.example/' }) {
  return inspectDeployment({
    baseUrl,
    expectedManualVersion: '1.5.0',
    expectedEntryDigest: canonicalDigest(CURRENT_ENTRY),
    expectedRootDigest: canonicalDigest(CURRENT_ROOT),
    expectedWorkspaceDigest: canonicalDigest(CURRENT_WORKSPACE),
    expectedManualDigest: canonicalDigest(CURRENT_MANUAL),
    fetchImpl,
    dnsLookupImpl,
    timeoutMs: 1_000,
    maxBodyBytes: 8_192,
    maxRedirects: 2,
    now: () => new Date(FIXED_TIME),
  });
}

function createTemporaryRepo(t, manualContents, {
  writeManual = true,
  writeEntry = true,
  writeRoot = true,
  writeIndex = false,
  writeWorkspace = true,
  writeVercel = true,
  entryContents = CURRENT_ENTRY,
  rootContents = CURRENT_ROOT,
  workspaceContents = CURRENT_WORKSPACE,
  vercelContents = VALID_VERCEL_CONFIG,
} = {}) {
  const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'municontrol-release-contract-'));
  t.after(() => fs.rmSync(repoRoot, { recursive: true, force: true }));
  if (writeVercel) fs.writeFileSync(path.join(repoRoot, 'vercel.json'), vercelContents);
  if (writeEntry) fs.writeFileSync(path.join(repoRoot, 'login.html'), entryContents);
  if (writeRoot) fs.writeFileSync(path.join(repoRoot, 'dashboard.html'), rootContents);
  if (writeIndex) fs.writeFileSync(path.join(repoRoot, 'index.html'), rootContents);
  if (writeWorkspace) fs.writeFileSync(path.join(repoRoot, 'inicio.html'), workspaceContents);
  if (writeManual) fs.writeFileSync(path.join(repoRoot, 'manuales.html'), manualContents);
  return repoRoot;
}

function cleanCliEnvironment(source = process.env) {
  return Object.fromEntries(Object.entries(source).filter(([name]) => {
    const upper = name.toUpperCase();
    return upper !== 'MUNICONTROL_RELEASE_BASE_URL'
      && upper !== 'HTTP_PROXY'
      && upper !== 'HTTPS_PROXY'
      && upper !== 'ALL_PROXY';
  }));
}

function installTemporaryCli(repoRoot) {
  const temporaryScripts = path.join(repoRoot, 'scripts');
  const temporaryShared = path.join(repoRoot, 'shared');
  const temporaryCli = path.join(temporaryScripts, 'check-deployment-truth.mjs');
  fs.mkdirSync(temporaryScripts);
  fs.mkdirSync(temporaryShared);
  fs.copyFileSync(cliPath, temporaryCli);
  fs.copyFileSync(sharedContractPath, path.join(temporaryShared, 'release-truth-contract.cjs'));
  return temporaryCli;
}

function findingCodes(receipt, pathFilter = null) {
  return receipt.findings
    .filter((finding) => pathFilter === null || finding.path === pathFilter)
    .map((finding) => finding.code);
}

test('production URL contract is exact HTTPS and the HTTP seam is literal-loopback only', () => {
  assert.equal(normalizeBaseUrl('https://municipio.example'), 'https://municipio.example/');
  assert.equal(
    normalizeBaseUrl('http://127.0.0.1:4321/', { allowHttpLoopback: true }),
    'http://127.0.0.1:4321/',
  );
  assert.throws(() => normalizeBaseUrl('http://municipio.example'), (error) => error.code === 'BASE_URL_INVALID');
  assert.throws(
    () => normalizeBaseUrl('http://localhost:4321/', { allowHttpLoopback: true }),
    (error) => error.code === 'BASE_URL_INVALID',
  );
  assert.throws(() => normalizeBaseUrl('https://municipio.example/app'), (error) => error.code === 'BASE_URL_PATH_FORBIDDEN');
  assert.throws(() => normalizeBaseUrl('https://municipio.example/.'), (error) => error.code === 'BASE_URL_PATH_FORBIDDEN');
  assert.throws(() => normalizeBaseUrl('https://municipio.example/?tenant=junin'), (error) => error.code === 'BASE_URL_PATH_FORBIDDEN');
  assert.throws(() => normalizeBaseUrl('https://municipio.example?'), (error) => error.code === 'BASE_URL_PATH_FORBIDDEN');
  assert.throws(() => normalizeBaseUrl('https://municipio.example/#release'), (error) => error.code === 'BASE_URL_PATH_FORBIDDEN');
  assert.throws(() => normalizeBaseUrl('https://municipio.example/#'), (error) => error.code === 'BASE_URL_PATH_FORBIDDEN');
  assert.throws(
    () => normalizeBaseUrl('https://release-user:release-secret@municipio.example/'),
    (error) => error.code === 'BASE_URL_CREDENTIALS_FORBIDDEN',
  );

  assert.deepEqual(parseDemoFigures('1247;9999;1247'), ['1247', '9999']);
  assert.throws(() => parseDemoFigures('1247;1,247'), (error) => error.code === 'DEMO_FIGURES_INVALID');
  assert.throws(
    () => resolveCliConfiguration(
      ['--base-url', 'https://one.example/'],
      { MUNICONTROL_RELEASE_BASE_URL: 'https://two.example/' },
    ),
    (error) => error.code === 'BASE_URL_CONFLICT',
  );
  assert.throws(
    () => resolveCliConfiguration(
      ['--base-url', 'https://municipio.example/'],
      { HTTPS_PROXY: 'http://proxy.internal.test:8080' },
      { repoRoot: root },
    ),
    (error) => error.code === 'PROXY_ENV_FORBIDDEN',
  );
});

test('one public DNS snapshot is shared by all probes and revalidated once after them', async () => {
  const memory = createInMemoryFetch();
  let dnsCalls = 0;
  const publicRecords = [
    { address: '93.184.216.34', family: 4 },
    { address: '2606:2800:220:1:248:1893:25c8:1946', family: 6 },
  ];
  const receipt = await inspectPublicFixture({
    fetchImpl: memory.fetchImpl,
    dnsLookupImpl: async (hostname, options) => {
      dnsCalls += 1;
      assert.equal(hostname, 'municipio.example');
      assert.deepEqual(options, { all: true, verbatim: true });
      return [...publicRecords].reverse();
    },
  });

  assert.equal(receipt.ok, true);
  assert.equal(dnsCalls, 2);
  assert.equal(memory.calls.length, 4 + API_PATHS.length);
  assert.ok(memory.calls.every((call) => call.method === 'GET' && call.redirect === 'manual'));
  assert.equal(receipt.policy.dnsAddressCount, 2);
  assert.match(receipt.policy.dnsAddressesDigest, /^[a-f0-9]{64}$/);
  assert.equal(receipt.policy.dnsRevalidated, true);
});

test('private, loopback and link-local DNS answers fail before any fetch', async () => {
  for (const record of [
    { address: '10.10.0.5', family: 4 },
    { address: '127.0.0.1', family: 4 },
    { address: '169.254.10.5', family: 4 },
    { address: '::1', family: 6 },
    { address: 'fe80::1', family: 6 },
  ]) {
    const memory = createInMemoryFetch();
    let dnsCalls = 0;
    await assert.rejects(
      inspectPublicFixture({
        fetchImpl: memory.fetchImpl,
        dnsLookupImpl: async () => {
          dnsCalls += 1;
          return [record];
        },
      }),
      (error) => error.code === 'DNS_NON_PUBLIC_ADDRESS',
      record.address,
    );
    assert.equal(dnsCalls, 1, record.address);
    assert.equal(memory.calls.length, 0, record.address);
  }
});

test('private literal hosts fail before DNS or fetch in the public inspector', async () => {
  for (const baseUrl of ['https://127.0.0.1/', 'https://[::1]/', 'https://169.254.1.2/']) {
    const memory = createInMemoryFetch();
    let dnsCalls = 0;
    await assert.rejects(
      inspectPublicFixture({
        baseUrl,
        fetchImpl: memory.fetchImpl,
        dnsLookupImpl: async () => {
          dnsCalls += 1;
          return [];
        },
      }),
      (error) => error.code === 'DNS_NON_PUBLIC_ADDRESS',
      baseUrl,
    );
    assert.equal(dnsCalls, 0, baseUrl);
    assert.equal(memory.calls.length, 0, baseUrl);
  }
});

test('DNS rebinding between the shared snapshot and final revalidation fails the receipt', async () => {
  const memory = createInMemoryFetch();
  let dnsCalls = 0;
  const receipt = await inspectPublicFixture({
    fetchImpl: memory.fetchImpl,
    dnsLookupImpl: async () => {
      dnsCalls += 1;
      return [{
        address: dnsCalls === 1 ? '93.184.216.34' : '93.184.216.35',
        family: 4,
      }];
    },
  });

  assert.equal(dnsCalls, 2);
  assert.equal(memory.calls.length, 4 + API_PATHS.length);
  assert.equal(receipt.ok, false);
  assert.equal(receipt.policy.dnsRevalidated, false);
  assert.deepEqual(findingCodes(receipt), ['DNS_REBINDING_DETECTED']);
  assert.equal(receipt.findings[0].path, null);
  assert.doesNotMatch(JSON.stringify(receipt), /93\.184\.216/);
});

test('local release contract accepts one future manual SemVer and records all expected captures', async (t) => {
  const futureVersion = '2.0.0';
  const futureLocalManual = `<html>\r\n<body data-doc-version="${futureVersion}">Manual futuro</body>\r\n</html>`;
  const repoRoot = createTemporaryRepo(
    t,
    futureLocalManual,
    {
      rootContents: CURRENT_ROOT.replace(/\n/g, '\r\n'),
      workspaceContents: CURRENT_WORKSPACE.replace(/\n/g, '\r\n'),
    },
  );
  assert.equal(readLocalManualVersion({ repoRoot }), futureVersion);
  const workspacePath = path.join(repoRoot, 'inicio.html');
  const originalOpenSync = fs.openSync;
  let workspaceOpenCount = 0;
  let localContract;
  try {
    fs.openSync = function instrumentedOpenSync(filePath, ...args) {
      if (path.resolve(String(filePath)) === workspacePath) workspaceOpenCount += 1;
      return originalOpenSync.call(this, filePath, ...args);
    };
    localContract = readLocalReleaseContract({ repoRoot });
  } finally {
    fs.openSync = originalOpenSync;
  }
  assert.equal(workspaceOpenCount, 1);
  assert.equal(localContract.expectedManualVersion, futureVersion);
  assert.equal(localContract.expectedEntryDigest, canonicalDigest(CURRENT_ENTRY));
  assert.equal(localContract.expectedRootDigest, canonicalDigest(CURRENT_ROOT));
  assert.equal(localContract.expectedWorkspaceDigest, canonicalDigest(CURRENT_WORKSPACE));
  assert.equal(
    localContract.expectedManualDigest,
    canonicalDigest(futureLocalManual),
  );

  const futureManual = CURRENT_MANUAL.replace('1.5.0', futureVersion);
  const fixture = await startFixture(t, {
    '/manuales': (_req, res) => send(
      res,
      200,
      'text/html; charset=utf-8',
      futureManual,
    ),
  });
  const receipt = await inspectFixture(fixture.baseUrl, {
    expectedManualVersion: futureVersion,
    expectedManualDigest: canonicalDigest(futureManual),
  });

  assert.equal(receipt.ok, true);
  assert.equal(receipt.policy.expectedManualVersion, futureVersion);
  assert.equal(JSON.stringify(receipt).match(new RegExp(futureVersion.replaceAll('.', '\\.').replace('+', '\\+'), 'g'))?.length, 1);

  const currentLocalVersion = readLocalManualVersion({ repoRoot: root });
  const cliConfiguration = resolveCliConfiguration(
    ['--base-url', 'https://municipio.example/'],
    {},
    { repoRoot: root },
  );
  assert.equal(cliConfiguration.expectedManualVersion, currentLocalVersion);
  const currentLocalContract = readLocalReleaseContract({ repoRoot: root });
  assert.equal(cliConfiguration.expectedEntryDigest, currentLocalContract.expectedEntryDigest);
  assert.equal(cliConfiguration.expectedRootDigest, currentLocalContract.expectedRootDigest);
  assert.equal(cliConfiguration.expectedWorkspaceDigest, currentLocalContract.expectedWorkspaceDigest);
  assert.equal(cliConfiguration.expectedManualDigest, currentLocalContract.expectedManualDigest);
});

test('local release contract rejects stale index or missing, non-regular, duplicated, malformed, non-UTF-8 or oversized sources', (t) => {
  const missingRoot = createTemporaryRepo(t, '', { writeManual: false });
  const missingEntryRoot = createTemporaryRepo(t, CURRENT_MANUAL, { writeEntry: false });
  const missingDashboardRoot = createTemporaryRepo(t, CURRENT_MANUAL, { writeRoot: false });
  const staleIndexRoot = createTemporaryRepo(t, CURRENT_MANUAL, { writeIndex: true });
  const missingWorkspaceRoot = createTemporaryRepo(t, CURRENT_MANUAL, { writeWorkspace: false });
  const missingVercelRoot = createTemporaryRepo(t, CURRENT_MANUAL, { writeVercel: false });
  const nonRegularRoot = createTemporaryRepo(t, '', { writeManual: false });
  fs.mkdirSync(path.join(nonRegularRoot, 'manuales.html'));
  const nonRegularVercelRoot = createTemporaryRepo(t, CURRENT_MANUAL, { writeVercel: false });
  fs.mkdirSync(path.join(nonRegularVercelRoot, 'vercel.json'));
  const nonRegularWorkspaceRoot = createTemporaryRepo(t, CURRENT_MANUAL, { writeWorkspace: false });
  fs.mkdirSync(path.join(nonRegularWorkspaceRoot, 'inicio.html'));
  const duplicateRoot = createTemporaryRepo(
    t,
    '<body data-doc-version="1.5.0"><aside data-doc-version="1.5.0"></aside></body>',
  );
  const invalidRoot = createTemporaryRepo(t, '<body data-doc-version="01.5.0"></body>');
  const invalidUtf8Root = createTemporaryRepo(t, Buffer.from([0xc3, 0x28]));
  const invalidDashboardRoot = createTemporaryRepo(t, CURRENT_MANUAL, {
    rootContents: Buffer.from([0xc3, 0x28]),
  });
  const emptyWorkspaceRoot = createTemporaryRepo(t, CURRENT_MANUAL, { workspaceContents: '' });
  const invalidWorkspaceRoot = createTemporaryRepo(t, CURRENT_MANUAL, {
    workspaceContents: Buffer.from([0xc3, 0x28]),
  });
  const invalidVercelRoot = createTemporaryRepo(t, CURRENT_MANUAL, {
    vercelContents: Buffer.from([0xc3, 0x28]),
  });
  const oversizedRoot = createTemporaryRepo(
    t,
    `<body data-doc-version="3.0.0">${'x'.repeat(300 * 1024)}</body>`,
  );
  const oversizedVercelRoot = createTemporaryRepo(t, CURRENT_MANUAL, {
    vercelContents: `{"cleanUrls":true,"padding":"${'x'.repeat(300 * 1024)}"}`,
  });
  const oversizedWorkspaceRoot = createTemporaryRepo(t, CURRENT_MANUAL, {
    workspaceContents: `<html>${'x'.repeat(300 * 1024)}</html>`,
  });

  for (const repoRoot of [
    missingRoot,
    missingEntryRoot,
    missingDashboardRoot,
    staleIndexRoot,
    missingWorkspaceRoot,
    missingVercelRoot,
    nonRegularRoot,
    nonRegularVercelRoot,
    nonRegularWorkspaceRoot,
    duplicateRoot,
    invalidRoot,
    invalidUtf8Root,
    invalidDashboardRoot,
    emptyWorkspaceRoot,
    invalidWorkspaceRoot,
    invalidVercelRoot,
    oversizedRoot,
    oversizedVercelRoot,
    oversizedWorkspaceRoot,
  ]) {
    assert.throws(
      () => readLocalReleaseContract({ repoRoot }),
      (error) => error.code === 'LOCAL_RELEASE_CONTRACT_INVALID',
    );
  }
});

test('local Vercel contract rejects clean URL, entry/workspace drift or a dashboard rewrite', (t) => {
  const invalidConfigurations = [
    JSON.stringify({
      cleanUrls: false,
      rewrites: [
        { source: '/', destination: '/login.html' },
        { source: '/inicio', destination: '/inicio.html' },
      ],
    }),
    JSON.stringify({
      cleanUrls: true,
      rewrites: [
        { source: '/inicio', destination: '/inicio.html' },
      ],
    }),
    JSON.stringify({
      cleanUrls: true,
      rewrites: [
        { source: '/', destination: '/login.html' },
        { source: '/dashboard', destination: '/index.html' },
        { source: '/inicio', destination: '/inicio.html' },
      ],
    }),
    JSON.stringify({
      cleanUrls: true,
      rewrites: [
        { source: '/', destination: '/login.html' },
        { source: '/dashboard', destination: '/dashboard.html' },
        { source: '/inicio', destination: '/inicio.html' },
      ],
    }),
    JSON.stringify({
      cleanUrls: true,
      rewrites: [
        { source: '/', destination: '/login.html', statusCode: 200 },
        { source: '/inicio', destination: '/inicio.html' },
      ],
    }),
    JSON.stringify({
      cleanUrls: true,
      rewrites: [
        { source: '/', destination: '/login.html' },
      ],
    }),
    JSON.stringify({
      cleanUrls: true,
      rewrites: [
        { source: '/', destination: '/login.html' },
        { source: '/inicio', destination: '/index.html' },
      ],
    }),
    '{"cleanUrls":true,"rewrites":',
  ];

  for (const vercelContents of invalidConfigurations) {
    const repoRoot = createTemporaryRepo(t, CURRENT_MANUAL, { vercelContents });
    assert.throws(
      () => readLocalReleaseContract({ repoRoot }),
      (error) => error.code === 'LOCAL_RELEASE_CONTRACT_INVALID',
    );
  }
});

test('invalid explicit SemVer or document digest stops exported inspection before DNS and fetch', async () => {
  let fetchCalls = 0;
  let dnsCalls = 0;
  const forbiddenFetch = async () => {
    fetchCalls += 1;
    throw new Error('network must not run');
  };
  const forbiddenDns = async () => {
    dnsCalls += 1;
    throw new Error('DNS must not run');
  };
  await assert.rejects(
    inspectDeployment({
      baseUrl: 'https://municipio.example/',
      expectedManualVersion: '01.5.0',
      expectedEntryDigest: canonicalDigest(CURRENT_ENTRY),
      expectedRootDigest: canonicalDigest(CURRENT_ROOT),
      expectedWorkspaceDigest: canonicalDigest(CURRENT_WORKSPACE),
      expectedManualDigest: canonicalDigest(CURRENT_MANUAL),
      fetchImpl: forbiddenFetch,
      dnsLookupImpl: forbiddenDns,
    }),
    (error) => error.code === 'LOCAL_RELEASE_CONTRACT_INVALID',
  );
  await assert.rejects(
    inspectDeployment({
      baseUrl: 'https://municipio.example/',
      expectedManualVersion: '1.5.0',
      expectedEntryDigest: 'not-a-sha256',
      expectedRootDigest: canonicalDigest(CURRENT_ROOT),
      expectedWorkspaceDigest: canonicalDigest(CURRENT_WORKSPACE),
      expectedManualDigest: canonicalDigest(CURRENT_MANUAL),
      fetchImpl: forbiddenFetch,
      dnsLookupImpl: forbiddenDns,
    }),
    (error) => error.code === 'LOCAL_RELEASE_CONTRACT_INVALID',
  );
  await assert.rejects(
    inspectDeployment({
      baseUrl: 'https://municipio.example/',
      expectedManualVersion: '1.5.0',
      expectedEntryDigest: canonicalDigest(CURRENT_ENTRY),
      expectedRootDigest: 'not-a-sha256',
      expectedWorkspaceDigest: canonicalDigest(CURRENT_WORKSPACE),
      expectedManualDigest: canonicalDigest(CURRENT_MANUAL),
      fetchImpl: forbiddenFetch,
      dnsLookupImpl: forbiddenDns,
    }),
    (error) => error.code === 'LOCAL_RELEASE_CONTRACT_INVALID',
  );
  await assert.rejects(
    inspectDeployment({
      baseUrl: 'https://municipio.example/',
      expectedManualVersion: '1.5.0',
      expectedEntryDigest: canonicalDigest(CURRENT_ENTRY),
      expectedRootDigest: canonicalDigest(CURRENT_ROOT),
      expectedWorkspaceDigest: 'not-a-sha256',
      expectedManualDigest: canonicalDigest(CURRENT_MANUAL),
      fetchImpl: forbiddenFetch,
      dnsLookupImpl: forbiddenDns,
    }),
    (error) => error.code === 'LOCAL_RELEASE_CONTRACT_INVALID',
  );
  assert.equal(fetchCalls, 0);
  assert.equal(dnsCalls, 0);
});

test('valid Vercel topology passes exact clean document paths without redirects', async (t) => {
  const fixture = await startFixture(t, {
    '/': (_req, res) => send(
      res,
      200,
      'text/html; charset=utf-8',
      CURRENT_ENTRY.replace(/\n/g, '\r\n'),
    ),
    '/dashboard': (_req, res) => send(
      res,
      200,
      'text/html; charset=utf-8',
      CURRENT_ROOT.replace(/\n/g, '\r\n'),
    ),
    '/inicio': (_req, res) => send(
      res,
      200,
      'text/html; charset=utf-8',
      CURRENT_WORKSPACE.replace(/\n/g, '\r\n'),
    ),
    '/manuales': (_req, res) => send(
      res,
      200,
      'text/html; charset=utf-8',
      CURRENT_MANUAL.replace(/\n/g, '\r\n'),
    ),
  });
  const receipt = await inspectFixture(fixture.baseUrl);

  assert.equal(receipt.contract, 'municontrol-deployment-truth/v1');
  assert.equal(receipt.checkedAt, FIXED_TIME);
  assert.equal(receipt.ok, true);
  assert.equal(receipt.target.origin, new URL(fixture.baseUrl).origin);
  assert.deepEqual(receipt.findings, []);
  assert.deepEqual(API_PATHS, [
    '/api/auth/me',
    '/api/grh-executive',
    '/api/grh-quality',
    '/api/grh-close',
    '/api/grh-data',
  ]);
  assert.deepEqual(receipt.checks.map((check) => check.path), [
    '/',
    '/dashboard',
    '/inicio',
    '/manuales',
    ...API_PATHS,
  ]);
  assert.ok(receipt.checks.every((check) => (
    check.redirects === 0 && check.finalPathMatched === true
  )));
  assert.equal(receipt.policy.expectedEntryDigest, canonicalDigest(CURRENT_ENTRY));
  assert.equal(receipt.policy.expectedWorkspaceDigest, canonicalDigest(CURRENT_WORKSPACE));
  assert.equal(receipt.policy.dnsAddressCount, 1);
  assert.match(receipt.policy.dnsAddressesDigest, /^[a-f0-9]{64}$/);
  assert.equal(receipt.policy.dnsRevalidated, true);
  assert.ok(receipt.checks.every((check) => check.outcome === 'pass'));
  assert.ok(receipt.checks.filter((check) => check.path.startsWith('/api/'))
    .every((check) => check.contractMatched === true));
  assert.equal(fixture.requests.length, 4 + API_PATHS.length);
  for (const documentPath of ['/', '/dashboard', '/inicio', '/manuales']) {
    assert.equal(fixture.requests.filter((request) => request.path === documentPath).length, 1);
  }
  assert.equal(fixture.requests.filter((request) => request.path === '/inicio.html').length, 0);
  assert.equal(fixture.requests.filter((request) => request.path === '/manuales.html').length, 0);
  assert.ok(fixture.requests.every((request) => request.method === 'GET'));
  assert.ok(fixture.requests.every((request) => request.authorization === undefined));
  assert.ok(fixture.requests.every((request) => request.cookie === undefined));

  const serialized = JSON.stringify(receipt);
  assert.doesNotMatch(serialized, /persona\.real@example\.test/);
  assert.doesNotMatch(serialized, /No autorizado/);
  assert.doesNotMatch(serialized, /release-secret/);
});

test('retired root-dashboard, inicio-to-index and .html-manual topology cannot pass', async (t) => {
  const fixture = await startFixture(t, {
    '/': (_req, res) => send(res, 200, 'text/html; charset=utf-8', CURRENT_ROOT),
    '/dashboard': (_req, res) => send(res, 404, 'text/html; charset=utf-8', '<h1>Not found</h1>'),
    '/inicio': (_req, res) => send(res, 200, 'text/html; charset=utf-8', CURRENT_ROOT),
    '/inicio.html': (_req, res) => send(res, 200, 'text/html; charset=utf-8', CURRENT_WORKSPACE),
    '/manuales': (_req, res) => send(res, 404, 'text/html; charset=utf-8', '<h1>Not found</h1>'),
    '/manuales.html': (_req, res) => send(res, 200, 'text/html; charset=utf-8', CURRENT_MANUAL),
  });
  const receipt = await inspectFixture(fixture.baseUrl);

  assert.equal(receipt.ok, false);
  assert.deepEqual(findingCodes(receipt, '/'), ['STALE_RELEASE']);
  assert.deepEqual(findingCodes(receipt, '/dashboard'), ['STALE_RELEASE']);
  assert.deepEqual(findingCodes(receipt, '/inicio'), ['WORKSPACE_RELEASE_DRIFT']);
  assert.deepEqual(findingCodes(receipt, '/manuales'), ['MANUAL_VERSION_DRIFT']);
  assert.equal(fixture.requests.some((request) => request.path === '/inicio.html'), false);
  assert.equal(fixture.requests.some((request) => request.path === '/manuales.html'), false);
});

test('legacy runtime, configured demo figures and unsafe claims are classified independently', async (t) => {
  const legacyRoot = CURRENT_ROOT.replace('</body>', `
    <section>Total de empleados <strong data-count="9999">9.999</strong></section>
    <script>window.store = 'MuniDB';</script>
    <p>Clima en tiempo real</p>
    <p>Los datos provienen de la base de datos oficial del municipio.</p>
  </body>`);
  const fixture = await startFixture(t, {
    '/dashboard': (_req, res) => send(res, 200, 'text/html; charset=utf-8', legacyRoot),
  });
  const receipt = await inspectFixture(fixture.baseUrl, {
    demoFigures: ['9999'],
    expectedRootDigest: canonicalDigest(legacyRoot),
  });
  const codes = findingCodes(receipt, '/dashboard');

  assert.equal(receipt.ok, false);
  assert.deepEqual(codes, [
    'LEGACY_DEMO_DATA',
    'UNSAFE_REALTIME_CLAIM',
    'UNVERIFIED_OFFICIAL_SOURCE_CLAIM',
  ]);
  assert.doesNotMatch(JSON.stringify(receipt), /MuniDB|9\.999|base de datos oficial/i);
});

test('missing current root markers is a stale release', async (t) => {
  const fixture = await startFixture(t, {
    '/dashboard': (_req, res) => send(res, 200, 'text/html; charset=utf-8', '<title>MuniControl anterior</title>'),
  });
  const receipt = await inspectFixture(fixture.baseUrl);

  assert.deepEqual(findingCodes(receipt, '/dashboard'), ['STALE_RELEASE']);
  assert.equal(receipt.checks.find((check) => check.path === '/dashboard').outcome, 'fail');
});

test('required markers copied into an HTML comment cannot spoof the canonical root digest', async (t) => {
  const spoofedRoot = `<html><body><h1>Release anterior</h1><!-- ${CURRENT_ROOT} --></body></html>`;
  const fixture = await startFixture(t, {
    '/dashboard': (_req, res) => send(res, 200, 'text/html; charset=utf-8', spoofedRoot),
  });
  const receipt = await inspectFixture(fixture.baseUrl);

  assert.deepEqual(findingCodes(receipt, '/dashboard'), ['STALE_RELEASE']);
  assert.doesNotMatch(JSON.stringify(receipt), /Release anterior/);
});

test('workspace copied into an HTML comment cannot spoof its canonical digest', async (t) => {
  const spoofedWorkspace = `<html><body><h1>Workspace anterior privado</h1><!-- ${CURRENT_WORKSPACE} --></body></html>`;
  const fixture = await startFixture(t, {
    '/inicio': (_req, res) => send(res, 200, 'text/html; charset=utf-8', spoofedWorkspace),
  });
  const receipt = await inspectFixture(fixture.baseUrl);

  assert.deepEqual(findingCodes(receipt, '/inicio'), ['WORKSPACE_RELEASE_DRIFT']);
  assert.doesNotMatch(JSON.stringify(receipt), /Workspace anterior privado/);
});

test('manual contract drift is distinguished from root and API health', async (t) => {
  const fixture = await startFixture(t, {
    '/manuales': (_req, res) => send(
      res,
      200,
      'text/html; charset=utf-8',
      '<body data-doc-version="1.4.0">Manual histórico</body>',
    ),
  });
  const receipt = await inspectFixture(fixture.baseUrl);

  assert.deepEqual(findingCodes(receipt), ['MANUAL_VERSION_DRIFT']);
  assert.equal(receipt.findings[0].path, '/manuales');
});

test('404 or HTML on a governed API is classified as current APIs missing', async (t) => {
  const fixture = await startFixture(t, {
    '/api/grh-quality': (_req, res) => send(res, 404, 'text/html; charset=utf-8', '<h1>Not found</h1>'),
  });
  const receipt = await inspectFixture(fixture.baseUrl);

  assert.deepEqual(findingCodes(receipt, '/api/grh-quality'), ['CURRENT_APIS_MISSING']);
  assert.doesNotMatch(JSON.stringify(receipt), /Not found/);
});

test('generic anonymous JSON without the route-specific shared contract header is rejected', async (t) => {
  const fixture = await startFixture(t, {
    '/api/auth/me': (_req, res) => send(
      res,
      401,
      'application/json; charset=utf-8',
      JSON.stringify({ error: 'No autorizado' }),
    ),
    '/api/grh-executive': (_req, res) => send(
      res,
      401,
      'application/json; charset=utf-8',
      JSON.stringify({ error: 'No autorizado' }),
      { [API_CONTRACT_HEADER]: API_CONTRACTS['/api/grh-quality'] },
    ),
    '/api/grh-close': (_req, res) => send(
      res,
      401,
      'application/json; charset=utf-8',
      JSON.stringify({
        error: 'No autorizado',
        privateDetail: 'persona.cierre@example.test',
        token: 'release-close-secret',
      }),
      { [API_CONTRACT_HEADER]: API_CONTRACTS['/api/auth/me'] },
    ),
  });
  const receipt = await inspectFixture(fixture.baseUrl);
  const check = receipt.checks.find((candidate) => candidate.path === '/api/auth/me');
  const serialized = JSON.stringify(receipt);

  assert.deepEqual(findingCodes(receipt, '/api/auth/me'), ['API_CONTRACT_MISMATCH']);
  assert.deepEqual(findingCodes(receipt, '/api/grh-executive'), ['API_CONTRACT_MISMATCH']);
  assert.deepEqual(findingCodes(receipt, '/api/grh-close'), ['API_CONTRACT_MISMATCH']);
  assert.equal(check.contractMatched, false);
  assert.doesNotMatch(serialized, /persona\.cierre|release-close-secret|No autorizado/);
});

test('API redirects are forbidden even when same-origin and are never followed', async (t) => {
  const fixture = await startFixture(t, {
    '/api/grh-executive': (_req, res) => {
      res.writeHead(302, { location: '/api/grh-quality' });
      res.end();
    },
  });
  const receipt = await inspectFixture(fixture.baseUrl);

  assert.deepEqual(findingCodes(receipt, '/api/grh-executive'), ['API_REDIRECT_FORBIDDEN']);
  assert.equal(fixture.requests.filter((request) => request.path === '/api/grh-quality').length, 1);
});

test('workspace redirects are forbidden and the target is never followed', async (t) => {
  const fixture = await startFixture(t, {
    '/inicio': (_req, res) => {
      res.writeHead(302, { location: '/inicio.html' });
      res.end();
    },
    '/inicio.html': (_req, res) => send(res, 200, 'text/html; charset=utf-8', CURRENT_WORKSPACE),
  });
  const receipt = await inspectFixture(fixture.baseUrl);

  assert.deepEqual(findingCodes(receipt, '/inicio'), ['WORKSPACE_REDIRECT_FORBIDDEN']);
  assert.equal(fixture.requests.some((request) => request.path === '/inicio.html'), false);
});

test('redirect to a different host or private IP is rejected without following it', async (t) => {
  const fixture = await startFixture(t, {
    '/': (_req, res) => {
      const port = new URL(fixture.baseUrl).port;
      res.writeHead(302, { location: `http://127.0.0.2:${port}/private-target` });
      res.end();
    },
  });
  const receipt = await inspectFixture(fixture.baseUrl);

  assert.deepEqual(findingCodes(receipt, '/'), ['REDIRECT_ORIGIN_CHANGED']);
  assert.ok(fixture.requests.every((request) => request.path !== '/private-target'));
  assert.doesNotMatch(JSON.stringify(receipt), /127\.0\.0\.2|private-target/);
});

test('same-origin redirect query is rejected without copying or sending its secret', async (t) => {
  const fixture = await startFixture(t, {
    '/': (_req, res) => {
      res.writeHead(302, { location: '/current-root?token=redirect-secret' });
      res.end();
    },
  });
  const receipt = await inspectFixture(fixture.baseUrl);

  assert.deepEqual(findingCodes(receipt, '/'), ['REDIRECT_TARGET_UNSAFE']);
  assert.ok(fixture.requests.every((request) => !request.path.includes('redirect-secret')));
  assert.doesNotMatch(JSON.stringify(receipt), /redirect-secret|current-root/);
});

test('document redirect to a secret path fails without serializing the attacker-controlled path', async (t) => {
  const secretPath = '/private/release-secret-tenant-junin';
  const fixture = await startFixture(t, {
    '/': (_req, res) => {
      res.writeHead(302, { location: secretPath });
      res.end();
    },
    [secretPath]: (_req, res) => send(res, 200, 'text/html; charset=utf-8', CURRENT_ENTRY),
  });
  const receipt = await inspectFixture(fixture.baseUrl);
  const entryCheck = receipt.checks.find((check) => check.path === '/');
  const stdout = JSON.stringify(receipt);

  assert.deepEqual(findingCodes(receipt, '/'), ['FINAL_PATH_MISMATCH']);
  assert.equal(entryCheck.finalPathMatched, false);
  assert.equal(Object.hasOwn(entryCheck, 'finalPath'), false);
  assert.equal(entryCheck.redirects, 1);
  assert.doesNotMatch(stdout, /release-secret-tenant-junin|\/private\//);
  assert.doesNotMatch(stdout, /"finalPath":/);
});

test('oversized responses fail before their body can enter the receipt', async (t) => {
  const oversized = `private-person-name-${'x'.repeat(2_048)}`;
  const fixture = await startFixture(t, {
    '/': (_req, res) => send(res, 200, 'text/html; charset=utf-8', oversized, {
      'content-length': Buffer.byteLength(oversized),
    }),
  });
  const receipt = await inspectFixture(fixture.baseUrl, { maxBodyBytes: 512 });

  assert.deepEqual(findingCodes(receipt, '/'), ['RESPONSE_BODY_TOO_LARGE']);
  assert.doesNotMatch(JSON.stringify(receipt), /private-person-name/);
});

test('slow responses are bounded by the per-probe deadline', async (t) => {
  const fixture = await startFixture(t, {
    '/': (_req, res) => {
      const timer = setTimeout(() => send(res, 200, 'text/html; charset=utf-8', CURRENT_ENTRY), 250);
      timer.unref();
    },
  });
  const receipt = await inspectFixture(fixture.baseUrl, { timeoutMs: 50 });

  assert.deepEqual(findingCodes(receipt, '/'), ['REQUEST_TIMEOUT']);
  assert.equal(receipt.checks.find((check) => check.path === '/').status, null);
});

test('CLI rejects credentialed origins without echoing credentials or performing a deployment call', () => {
  const cleanEnv = cleanCliEnvironment();
  const execution = spawnSync(
    process.execPath,
    [cliPath, '--base-url', 'https://release-user:release-secret@municipio.example/'],
    { cwd: root, encoding: 'utf8', env: cleanEnv, windowsHide: true },
  );

  assert.equal(execution.status, 2);
  assert.equal(execution.stderr, '');
  assert.doesNotMatch(execution.stdout, /release-user|release-secret/);
  const receipt = JSON.parse(execution.stdout);
  assert.equal(receipt.ok, false);
  assert.equal(receipt.target.origin, null);
  assert.deepEqual(receipt.findings.map((finding) => finding.code), ['BASE_URL_CREDENTIALS_FORBIDDEN']);
});

test('public CLI rejects a private literal host before fetch', () => {
  const execution = spawnSync(
    process.execPath,
    [cliPath, '--base-url', 'https://127.0.0.1/'],
    { cwd: root, encoding: 'utf8', env: cleanCliEnvironment(), windowsHide: true },
  );

  assert.equal(execution.status, 2);
  assert.equal(execution.stderr, '');
  const receipt = JSON.parse(execution.stdout);
  assert.deepEqual(receipt.findings.map((finding) => finding.code), ['DNS_NON_PUBLIC_ADDRESS']);
  assert.equal(receipt.target.origin, null);
});

test('CLI rejects an ambiguous local manual contract before any network probe', (t) => {
  const temporaryRepo = createTemporaryRepo(
    t,
    '<body data-doc-version="1.5.0"><aside data-doc-version="2.0.0"></aside></body>',
  );
  const temporaryCli = installTemporaryCli(temporaryRepo);
  const cleanEnv = cleanCliEnvironment();

  const execution = spawnSync(
    process.execPath,
    [temporaryCli, '--base-url', 'https://network-must-not-run.invalid/'],
    { cwd: temporaryRepo, encoding: 'utf8', env: cleanEnv, windowsHide: true },
  );

  assert.equal(execution.status, 2);
  assert.equal(execution.stderr, '');
  const receipt = JSON.parse(execution.stdout);
  assert.equal(receipt.ok, false);
  assert.equal(receipt.policy.expectedManualVersion, null);
  assert.deepEqual(receipt.findings.map((finding) => finding.code), ['LOCAL_RELEASE_CONTRACT_INVALID']);
  assert.doesNotMatch(execution.stdout, /network-must-not-run|REQUEST_FAILED/);
});

test('CLI rejects a missing login capture before DNS or fetch', (t) => {
  const temporaryRepo = createTemporaryRepo(t, CURRENT_MANUAL, { writeEntry: false });
  const temporaryCli = installTemporaryCli(temporaryRepo);

  const execution = spawnSync(
    process.execPath,
    [temporaryCli, '--base-url', 'https://network-must-not-run.invalid/'],
    {
      cwd: temporaryRepo,
      encoding: 'utf8',
      env: cleanCliEnvironment(),
      windowsHide: true,
    },
  );

  assert.equal(execution.status, 2);
  assert.equal(execution.stderr, '');
  const receipt = JSON.parse(execution.stdout);
  assert.equal(receipt.ok, false);
  assert.equal(receipt.policy.expectedEntryDigest, null);
  assert.deepEqual(receipt.findings.map((finding) => finding.code), ['LOCAL_RELEASE_CONTRACT_INVALID']);
  assert.doesNotMatch(execution.stdout, /network-must-not-run|REQUEST_FAILED|DNS_/);
});

test('CLI rejects missing or malformed workspace captures before DNS or fetch', (t) => {
  const repositories = [
    createTemporaryRepo(t, CURRENT_MANUAL, { writeWorkspace: false }),
    createTemporaryRepo(t, CURRENT_MANUAL, {
      workspaceContents: Buffer.from([0xc3, 0x28]),
    }),
  ];

  for (const temporaryRepo of repositories) {
    const temporaryCli = installTemporaryCli(temporaryRepo);
    const execution = spawnSync(
      process.execPath,
      [temporaryCli, '--base-url', 'https://network-must-not-run.invalid/'],
      {
        cwd: temporaryRepo,
        encoding: 'utf8',
        env: cleanCliEnvironment(),
        windowsHide: true,
      },
    );

    assert.equal(execution.status, 2);
    assert.equal(execution.stderr, '');
    const receipt = JSON.parse(execution.stdout);
    assert.equal(receipt.ok, false);
    assert.equal(receipt.policy.expectedWorkspaceDigest, null);
    assert.deepEqual(receipt.findings.map((finding) => finding.code), ['LOCAL_RELEASE_CONTRACT_INVALID']);
    assert.doesNotMatch(execution.stdout, /network-must-not-run|REQUEST_FAILED|DNS_/);
  }
});

test('test module path resolves inside the repository and never points to production', () => {
  const modulePath = fileURLToPath(import.meta.url);
  assert.equal(path.dirname(modulePath), path.join(root, 'tests'));
  assert.doesNotMatch(modulePath, /^https?:/i);
});
