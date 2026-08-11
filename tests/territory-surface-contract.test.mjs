import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';

import accessPolicy from '../shared/access-policy.cjs';
import publishedDemoPolicy from '../shared/published-demo-policy.cjs';
import releaseTruth from '../shared/release-truth-contract.cjs';
import routePolicy from '../shared/route-policy.cjs';
import {
  GOVERNED_HTML_FILES,
  GOVERNED_LEGACY_HTML_FILES,
  GOVERNED_VITE_HTML_FILES,
  PUBLIC_LEGACY_HTML_FILES,
  VITE_ENTRY_HTML_FILES,
} from '../build/public-web-contract.mjs';

const ROOT = path.resolve(import.meta.dirname, '..');
const ROLES = Object.values(accessPolicy.ROLES);
const CAPABILITY = 'navigation.territory';
const ROUTE_ID = 'serverless.municipal.territory.read';

test('territorial navigation is explicit for all roles and exact in low-role priorities', () => {
  assert.equal(accessPolicy.ACCESS_POLICY_VERSION, '2026-08-11.2');
  assert.equal(accessPolicy.CAPABILITIES.NAV_TERRITORY, CAPABILITY);
  for (const role of ROLES) {
    assert.equal(accessPolicy.hasCapability(role, CAPABILITY), true, role);
    const session = accessPolicy.getSessionAccessForUser({ role, tenantId: 'tenant-junin' });
    assert.equal(session.capabilities.includes(CAPABILITY), true, role);
  }
  for (const role of ['TENANT_USER', 'INSPECTOR', 'DEMO']) {
    assert.deepEqual(
      accessPolicy.ROLE_HOME_PROFILE[role].priorityCapabilities,
      ['navigation.workspace', CAPABILITY, 'navigation.help'],
      role,
    );
  }
});

test('territorial API is one exact GET resource and remains available to published demo identities', () => {
  assert.equal(routePolicy.ROUTE_POLICY_VERSION, '2026-08-11.1');
  assert.equal(routePolicy.RESOURCES.MUNICIPAL_TERRITORY, 'municipal.territory');
  assert.equal(routePolicy.PERMISSIONS.MUNICIPAL_TERRITORY_READ, 'municipal.territory:read');
  const routes = routePolicy.PROTECTED_ROUTES.filter(route => route.id === ROUTE_ID);
  assert.equal(routes.length, 1);
  assert.deepEqual(
    { runtime: routes[0].runtime, method: routes[0].method, path: routes[0].path, permission: routes[0].permission },
    { runtime: 'serverless', method: 'GET', path: '/municipal-territory', permission: 'municipal.territory:read' },
  );
  for (const role of ROLES) {
    assert.equal(routePolicy.authorizeRoute(role, 'serverless', 'GET', '/api/municipal-territory'), true, role);
  }
  assert.equal(routePolicy.authorizeRoute('DEMO', 'serverless', 'POST', '/api/municipal-territory'), false);
  assert.equal(routePolicy.authorizeRoute('DEMO', 'serverless', 'GET', '/api/municipal-territory/future'), false);
  assert.equal(publishedDemoPolicy.PUBLISHED_DEMO_POLICY_VERSION, '2026-08-11.2');
  assert.equal(publishedDemoPolicy.PUBLISHED_DEMO_ALLOWED_ROUTE_IDS.includes(ROUTE_ID), true);
  for (const profile of publishedDemoPolicy.PUBLISHED_DEMO_PROFILES) {
    assert.equal(publishedDemoPolicy.evaluatePublishedDemoRoute({ ...profile, routeId: ROUTE_ID }).allowed, true, profile.email);
  }
  assert.equal(releaseTruth.API_CONTRACTS['/api/municipal-territory'], 'municipal-territory-v1');
});

test('territorio is a governed Vite entry while the retired mapa file remains a legacy compatibility surface', async () => {
  assert.deepEqual(GOVERNED_VITE_HTML_FILES, ['calidad.html', 'ejecutivo.html', 'estructura.html', 'territorio.html']);
  assert.deepEqual(VITE_ENTRY_HTML_FILES, GOVERNED_VITE_HTML_FILES);
  assert.equal(GOVERNED_LEGACY_HTML_FILES.includes('territorio.html'), false);
  assert.equal(PUBLIC_LEGACY_HTML_FILES.includes('territorio.html'), false);
  assert.equal(GOVERNED_HTML_FILES.includes('territorio.html'), true);
  assert.equal(PUBLIC_LEGACY_HTML_FILES.includes('mapa.html'), true);
  assert.equal(GOVERNED_HTML_FILES.includes('mapa.html'), false);

  const [viteSource, retiredMap] = await Promise.all([
    readFile(path.join(ROOT, 'frontend', 'vite.config.ts'), 'utf8'),
    readFile(path.join(ROOT, 'mapa.html'), 'utf8'),
  ]);
  assert.match(viteSource, /territorio:\s*fileURLToPath\(new URL\('\.\/territorio\.html'/);
  assert.match(retiredMap, /data-retired-module="mapa"/);
  assert.match(retiredMap, /data-source-state="not-connected"/);
});

test('clean territorial routing and legacy favorites have one canonical Vercel destination', async () => {
  const vercel = JSON.parse(await readFile(path.join(ROOT, 'vercel.json'), 'utf8'));
  assert.equal(vercel.cleanUrls, true);
  assert.deepEqual(
    vercel.rewrites.filter(rewrite => rewrite.source === '/territorio'),
    [{ source: '/territorio', destination: '/territorio.html' }],
  );
  assert.deepEqual(
    vercel.redirects.filter(redirect => redirect.source === '/mapa'),
    [{ source: '/mapa', destination: '/territorio', permanent: true }],
  );
});

test('shell, workspace, role tour and MuniGuia use the same bounded territorial language', async () => {
  const [navigation, workspace, roles, guide] = await Promise.all([
    readFile(path.join(ROOT, 'js', 'nav.js'), 'utf8'),
    readFile(path.join(ROOT, 'inicio.html'), 'utf8'),
    readFile(path.join(ROOT, 'roles.html'), 'utf8'),
    readFile(path.join(ROOT, 'js', 'contextual-help-catalog.js'), 'utf8'),
  ]);
  assert.match(navigation, /href:'\/territorio'[\s\S]*label:'Centro territorial'[\s\S]*capability:'navigation\.territory'/);
  assert.match(workspace, /'navigation\.territory':[\s\S]{0,220}href:\s*'\/territorio'[\s\S]{0,220}Límite y localidades oficiales/);
  for (const role of ['TENANT_USER', 'INSPECTOR', 'DEMO']) {
    assert.match(roles, new RegExp(`role: '${role}'[\\s\\S]{0,900}navigation\\.territory`));
  }
  assert.match(guide, /href:\s*'territorio\.html'[\s\S]{0,500}requiredCapability:\s*'navigation\.territory'/);
  for (const anchor of ['#territoryMap', '#territoryLocalities', '#territorySources']) {
    assert.ok(guide.includes(`selector: '${anchor}'`), anchor);
  }
  assert.doesNotMatch(guide.match(/territory:\s*\{[\s\S]*?\n\s*\},\n\s*quality:/)?.[0] || '', /emplead|domicilio|obra|reclamo/i);
});
