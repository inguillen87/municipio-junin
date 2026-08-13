import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

import publishedDemoPolicy from '../shared/published-demo-policy.cjs';
import routePolicy from '../shared/route-policy.cjs';

const root = path.resolve(import.meta.dirname, '..');
const {
  PUBLISHED_DEMO_IDENTITIES,
  PUBLISHED_DEMO_POLICY_VERSION,
  PUBLISHED_DEMO_PROFILES,
  PUBLISHED_DEMO_ALLOWED_ROUTE_IDS,
  PUBLISHED_DEMO_DECISION_CODES,
  evaluatePublishedDemoRoute,
  isPublishedDemoIdentity,
} = publishedDemoPolicy;

const EXPECTED_IDENTITIES = Object.freeze([
  'admin@junin.gov.ar',
  'contador@junin.gov.ar',
  'demo@junin.gov.ar',
  'inspector@junin.gov.ar',
  'intendente@junin.gov.ar',
  'rrhh@junin.gov.ar',
]);

const EXPECTED_ALLOWED_ROUTES = Object.freeze([
  ['express', 'GET', '/auth/me'],
  ['serverless', 'GET', '/auth/me'],
  ['serverless', 'POST', '/ai-analyze'],
  ['serverless', 'GET', '/grh-close'],
  ['serverless', 'GET', '/grh-action-ledger'],
  ['serverless', 'GET', '/grh-administration-comparison'],
  ['serverless', 'GET', '/grh-decision-brief'],
  ['serverless', 'GET', '/grh-domain-catalog'],
  ['serverless', 'GET', '/grh-employment-review'],
  ['serverless', 'GET', '/grh-executive'],
  ['serverless', 'GET', '/grh-movement-operations'],
  ['serverless', 'GET', '/grh-organization-analytics'],
  ['serverless', 'GET', '/grh-quality'],
  ['serverless', 'GET', '/grh-workforce-finance'],
  ['serverless', 'GET', '/municipal-territory'],
  ['serverless', 'GET', '/pdf-report'],
  ['serverless', 'GET', '/reports'],
]);

function routeDescriptor(route) {
  return [route.runtime, route.method, route.path];
}

function publicRuntimeFiles() {
  const rootFiles = fs.readdirSync(root, { withFileTypes: true })
    .filter(entry => entry.isFile() && /\.(?:html|js|json)$/i.test(entry.name))
    .map(entry => path.join(root, entry.name));
  const jsFiles = fs.readdirSync(path.join(root, 'js'), { withFileTypes: true })
    .filter(entry => entry.isFile() && entry.name.endsWith('.js'))
    .map(entry => path.join(root, 'js', entry.name));
  return [...rootFiles, ...jsFiles];
}

function sourceFilesBelow(directory, extensions) {
  const files = [];
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const target = path.join(directory, entry.name);
    if (entry.isDirectory() && !['generated', 'node_modules', 'tests'].includes(entry.name)) {
      files.push(...sourceFilesBelow(target, extensions));
    }
    if (entry.isFile() && extensions.has(path.extname(entry.name))) files.push(target);
  }
  return files;
}

function deployedRuntimeSourceFiles() {
  const serverFiles = ['api', 'backend', 'shared'].flatMap(directory => sourceFilesBelow(
    path.join(root, directory),
    new Set(['.js', '.cjs']),
  ));
  return [...new Set([...publicRuntimeFiles(), ...serverFiles])];
}

test('the temporary containment identifies exactly the six previously published emails', () => {
  assert.equal(PUBLISHED_DEMO_POLICY_VERSION, '2026-08-13.9');
  assert.deepEqual(PUBLISHED_DEMO_IDENTITIES, EXPECTED_IDENTITIES);
  assert.equal(new Set(PUBLISHED_DEMO_IDENTITIES).size, 6);

  for (const email of EXPECTED_IDENTITIES) {
    assert.equal(isPublishedDemoIdentity(email), true, email);
    assert.equal(isPublishedDemoIdentity(email.toUpperCase()), true, `${email} uppercase`);
  }
  assert.deepEqual(
    PUBLISHED_DEMO_PROFILES.map(({ email, role, tenantSlug }) => [email, role, tenantSlug]),
    [
      ['admin@junin.gov.ar', 'TENANT_ADMIN', 'junin'],
      ['contador@junin.gov.ar', 'CONTADOR', 'junin'],
      ['demo@junin.gov.ar', 'DEMO', 'junin'],
      ['inspector@junin.gov.ar', 'INSPECTOR', 'junin'],
      ['intendente@junin.gov.ar', 'INTENDENTE', 'junin'],
      ['rrhh@junin.gov.ar', 'TENANT_USER', 'junin'],
    ],
  );

  for (const lookalike of [
    'usuario@junin.gob.ar',
    'admin@junin.gob.ar',
    'admin+demo@junin.gov.ar',
    'admin@junin.gov.ar.example.test',
    'xadmin@junin.gov.ar',
    '',
    null,
  ]) {
    assert.equal(isPublishedDemoIdentity(lookalike), false, String(lookalike));
  }
});

test('the published identities have one exact cross-runtime route ceiling', () => {
  const routeById = new Map(routePolicy.PROTECTED_ROUTES.map(route => [route.id, route]));
  const allowedRoutes = PUBLISHED_DEMO_ALLOWED_ROUTE_IDS.map(id => {
    const route = routeById.get(id);
    assert.ok(route, `unknown allowlisted route id: ${id}`);
    return routeDescriptor(route);
  }).sort((left, right) => JSON.stringify(left).localeCompare(JSON.stringify(right)));

  const expectedRoutes = [...EXPECTED_ALLOWED_ROUTES]
    .sort((left, right) => JSON.stringify(left).localeCompare(JSON.stringify(right)));
  assert.deepEqual(allowedRoutes, expectedRoutes);
  assert.equal(new Set(PUBLISHED_DEMO_ALLOWED_ROUTE_IDS).size, PUBLISHED_DEMO_ALLOWED_ROUTE_IDS.length);

  const allowedIds = new Set(PUBLISHED_DEMO_ALLOWED_ROUTE_IDS);
  for (const profile of PUBLISHED_DEMO_PROFILES) {
    const email = profile.email;
    for (const route of routePolicy.PROTECTED_ROUTES) {
      const decision = evaluatePublishedDemoRoute({ ...profile, routeId: route.id });
      assert.equal(decision.applies, true, `${email} ${route.id}`);
      assert.equal(decision.allowed, allowedIds.has(route.id), `${email} ${route.id}`);
    }
    const missingRoute = evaluatePublishedDemoRoute({ ...profile, routeId: null });
    assert.equal(missingRoute.allowed, false);
    assert.equal(missingRoute.code, PUBLISHED_DEMO_DECISION_CODES.DENIED);
  }

  for (const drift of [
    { ...PUBLISHED_DEMO_PROFILES[0], role: 'SUPER_ADMIN' },
    { ...PUBLISHED_DEMO_PROFILES[0], tenantSlug: 'otro-municipio' },
    { email: PUBLISHED_DEMO_PROFILES[0].email, role: undefined, tenantSlug: undefined },
  ]) {
    const decision = evaluatePublishedDemoRoute({ ...drift, routeId: 'serverless.auth.me.read' });
    assert.equal(decision.allowed, false);
    assert.equal(decision.code, PUBLISHED_DEMO_DECISION_CODES.IDENTITY_DRIFT);
  }

  const ordinary = evaluatePublishedDemoRoute({
    email: 'official@junin.gob.ar',
    routeId: 'serverless.core-import.execute',
  });
  assert.equal(ordinary.applies, false);
  assert.equal(ordinary.allowed, true, 'the temporary ceiling must not replace canonical RBAC');
});

test('the only allowed POST remains deterministic, tenant-bound, provenance-bearing and PII-refusing', () => {
  const source = fs.readFileSync(path.join(root, 'api', 'ai-analyze.js'), 'utf8');
  assert.deepEqual(
    PUBLISHED_DEMO_ALLOWED_ROUTE_IDS.filter(id => {
      const route = routePolicy.PROTECTED_ROUTES.find(candidate => candidate.id === id);
      return route?.method === 'POST';
    }),
    ['serverless.grh.analysis.execute'],
  );
  assert.match(source, /requireDatasetTenantImpl\(res, caller, 'GRH_TENANT_ID'\)/);
  assert.match(source, /buildPortableGrhViews\(bundle\)/);
  assert.match(source, /const provenance = buildProvenance\(/);
  assert.match(source, /intent:\s*'pii_request',\s*policy:\s*'refused'/);
  assert.match(source, /externalProvider:\s*false/);
  assert.match(source, /generated:\s*false/);
});

test('published profiles can inspect but never mutate the GRH action ledger', () => {
  const profile = PUBLISHED_DEMO_PROFILES.find(candidate => candidate.role === 'INTENDENTE');
  assert.equal(evaluatePublishedDemoRoute({
    ...profile,
    routeId: 'serverless.grh.action-ledger.read',
  }).allowed, true);
  for (const routeId of [
    'serverless.grh.action-ledger.create',
    'serverless.grh.action-ledger.update',
  ]) {
    assert.equal(evaluatePublishedDemoRoute({ ...profile, routeId }).allowed, false, routeId);
  }
});

test('public evaluation access contains exactly six identities, no client credential and no seed path', () => {
  assert.equal(fs.existsSync(path.join(root, 'api', 'auth', 'seed-demo.js')), false);

  const publishedEmails = new Set();
  let evaluationCredentialDeclarations = 0;
  for (const file of deployedRuntimeSourceFiles()) {
    const source = fs.readFileSync(file, 'utf8');
    const relative = path.relative(root, file);
    assert.doesNotMatch(source, /seed-demo|ensureSeeded/i, `${relative} must not invoke or advertise a seed endpoint`);

    for (const match of source.matchAll(/[a-z0-9._%+-]+@junin\.gov\.ar/gi)) {
      publishedEmails.add(match[0].toLowerCase());
    }

    const declarations = [...source.matchAll(
      /\b(?:const|let|var)\s+EVALUATION_PASSWORD\s*=\s*(['"])([^'"\r\n]+)\1\s*;/g,
    )];
    evaluationCredentialDeclarations += declarations.length;
    for (const declaration of declarations) {
      assert.ok(
        declaration[2].length > 0 && declaration[2].length <= 128,
        'the named evaluation credential must be a bounded literal',
      );
    }
    const withoutApprovedCredential = source.replace(
      /\b(?:const|let|var)\s+EVALUATION_PASSWORD\s*=\s*(['"])([^'"\r\n]+)\1\s*;/g,
      'var EVALUATION_PASSWORD = "[REDACTED]";',
    );
    assert.doesNotMatch(
      withoutApprovedCredential,
      /\bpassword\b\s*[:=]\s*['"][^'"]+['"]/i,
      `${relative} must not embed another password literal`,
    );
  }

  assert.deepEqual([...publishedEmails].sort(), [...EXPECTED_IDENTITIES]);
  assert.equal(evaluationCredentialDeclarations, 0, 'one-click evaluation must not publish a credential');
});
