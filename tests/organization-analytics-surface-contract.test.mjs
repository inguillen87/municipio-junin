import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { runInNewContext } from 'node:vm';

import accessPolicy from '../shared/access-policy.cjs';
import publishedDemoPolicy from '../shared/published-demo-policy.cjs';
import releaseTruth from '../shared/release-truth-contract.cjs';
import routePolicy from '../shared/route-policy.cjs';
import {
  GOVERNED_HTML_FILES,
  GOVERNED_VITE_HTML_FILES,
  PUBLIC_LEGACY_HTML_FILES,
  VITE_ENTRY_HTML_FILES,
} from '../build/public-web-contract.mjs';
import { MUNIGUIA_CATALOG } from '../js/contextual-help-catalog.js';

const EXECUTIVE_ROLES = ['SUPER_ADMIN', 'TENANT_ADMIN', 'INTENDENTE', 'CONTADOR'];
const CAPABILITY = 'navigation.organization-analytics';
const ROUTE_ID = 'serverless.grh.organization-analytics.read';

test('organization analytics has one exact private capability and route boundary', () => {
  assert.equal(accessPolicy.CAPABILITIES.NAV_ORGANIZATION_ANALYTICS, CAPABILITY);
  assert.deepEqual(
    Object.values(accessPolicy.ROLES)
      .filter((role) => accessPolicy.hasCapability(role, CAPABILITY))
      .sort(),
    [...EXECUTIVE_ROLES].sort(),
  );

  assert.equal(routePolicy.RESOURCES.GRH_ORGANIZATION_ANALYTICS, 'grh.organization.analytics');
  assert.equal(
    routePolicy.PERMISSIONS.GRH_ORGANIZATION_ANALYTICS_READ,
    'grh.organization.analytics:read',
  );
  assert.deepEqual(
    [...routePolicy.getAllowedRoles(routePolicy.PERMISSIONS.GRH_ORGANIZATION_ANALYTICS_READ)].sort(),
    [...EXECUTIVE_ROLES].sort(),
  );
  const route = routePolicy.PROTECTED_ROUTES.find((candidate) => candidate.id === ROUTE_ID);
  assert.deepEqual(route, {
    id: ROUTE_ID,
    runtime: 'serverless',
    method: 'GET',
    path: '/grh-organization-analytics',
    permission: 'grh.organization.analytics:read',
    internalSecrets: [],
  });
});

test('published route ceiling opens only aggregate organization analytics and canonical RBAC still denies low roles', () => {
  assert.equal(publishedDemoPolicy.PUBLISHED_DEMO_POLICY_VERSION, '2026-08-13.10');
  assert.equal(publishedDemoPolicy.PUBLISHED_DEMO_ALLOWED_ROUTE_IDS.includes(ROUTE_ID), true);

  for (const profile of publishedDemoPolicy.PUBLISHED_DEMO_PROFILES) {
    const projection = accessPolicy.getSessionAccessForUser({
      role: profile.role,
      tenantId: 'tenant-junin',
      email: profile.email,
    });
    const decision = publishedDemoPolicy.evaluatePublishedDemoRoute({
      ...profile,
      routeId: ROUTE_ID,
    });
    assert.equal(decision.applies, true);
    assert.equal(decision.allowed, true, `${profile.email}:published ceiling`);
    const canonicalAllowed = routePolicy.authorizeRoute(
      profile.role,
      'serverless',
      'GET',
      '/api/grh-organization-analytics',
    );
    const expected = EXECUTIVE_ROLES.includes(profile.role);
    assert.equal(canonicalAllowed && decision.allowed, expected, `${profile.email}:effective access`);
    assert.equal(projection.capabilities.includes(CAPABILITY), expected, `${profile.email}:discovery`);
  }

  const directoryRouteId = 'serverless.grh.directory.read';
  assert.equal(publishedDemoPolicy.PUBLISHED_DEMO_ALLOWED_ROUTE_IDS.includes(directoryRouteId), false);
  for (const profile of publishedDemoPolicy.PUBLISHED_DEMO_PROFILES) {
    const directoryDecision = publishedDemoPolicy.evaluatePublishedDemoRoute({
      ...profile,
      routeId: directoryRouteId,
    });
    assert.equal(directoryDecision.allowed, false, `${profile.email}:directory`);
    assert.equal(directoryDecision.code, publishedDemoPolicy.PUBLISHED_DEMO_DECISION_CODES.DENIED);
  }
});

test('release, build, clean route, navigation and contextual help stay aligned', async () => {
  assert.equal(
    releaseTruth.API_CONTRACTS['/api/grh-organization-analytics'],
    'grh-organization-analytics-v2',
  );
  assert.equal(PUBLIC_LEGACY_HTML_FILES.includes('estructura.html'), false);
  assert.ok(GOVERNED_VITE_HTML_FILES.includes('estructura.html'));
  assert.ok(VITE_ENTRY_HTML_FILES.includes('estructura.html'));
  assert.ok(GOVERNED_HTML_FILES.includes('estructura.html'));
  assert.ok(PUBLIC_LEGACY_HTML_FILES.includes('organigrama.html'));

  const [vercelSource, viteSource, navigationCatalog, workspaceSource, pageSource, dashboardSource, comparisonSource] = await Promise.all([
    readFile(new URL('../vercel.json', import.meta.url), 'utf8'),
    readFile(new URL('../frontend/vite.config.ts', import.meta.url), 'utf8'),
    readFile(new URL('../js/navigation-catalog.js', import.meta.url), 'utf8'),
    readFile(new URL('../inicio.html', import.meta.url), 'utf8'),
    readFile(new URL('../frontend/estructura.html', import.meta.url), 'utf8'),
    readFile(new URL('../frontend/src/structure/StructureDashboard.tsx', import.meta.url), 'utf8'),
    readFile(new URL('../frontend/src/structure/CostCenterComparison.tsx', import.meta.url), 'utf8'),
  ]);
  const vercel = JSON.parse(vercelSource);
  assert.deepEqual(
    vercel.rewrites.filter((rewrite) => rewrite.source === '/estructura'),
    [{ source: '/estructura', destination: '/estructura.html' }],
  );
  assert.match(viteSource, /estructura:\s*fileURLToPath\(new URL\('\.\/estructura\.html'/);
  assert.match(pageSource, /src="\/src\/structure-main\.tsx"/);
  const scope = {};
  runInNewContext(navigationCatalog, { window: scope });
  const navigationItems = Array.from(scope.MuniNavigationDefinition.items, item => ({ ...item }));
  const structure = navigationItems.find(item => item.id === 'estructura');
  assert.deepEqual(structure, {
    id: 'estructura',
    href: '/estructura',
    label: 'Estructura y áreas de costo',
    shortLabel: 'Estructura',
    icon: 'organization',
    groupId: 'people',
    placement: 'group',
    capability: CAPABILITY,
    primary: true,
  });
  assert.equal(
    navigationItems.some(item => ['/organigrama', 'organigrama.html', '/organigrama.html'].includes(item.href)),
    false,
    'the retired organigram surface must never re-enter navigation',
  );
  assert.match(
    workspaceSource,
    /'navigation\.organization-analytics':\s*Object\.freeze\(\{\s*href:\s*'\/estructura',\s*label:\s*'Estructura y áreas'/,
  );
  assert.match(workspaceSource, /candidates\.splice\([\s\S]{0,160}'navigation\.organization-analytics'/);
  assert.match(workspaceSource, /candidates\.push\('navigation\.grh-decisions'\)/);
  assert.match(workspaceSource, /projection\.capabilities\.indexOf\(capability\) !== -1/);

  const guide = MUNIGUIA_CATALOG.pages.organizationAnalytics;
  assert.deepEqual(guide.aliases, ['/estructura', '/estructura.html']);
  assert.equal(guide.requiredCapability, CAPABILITY);
  assert.equal(guide.label, 'Estructura y áreas de costo');
  assert.match(guide.objective, /sala de situación/i);
  assert.deepEqual(
    guide.steps.map((step) => step.selector),
    ['#organizationSnapshotStatus', '#organizationExplorer', '#costCenterComparator'],
  );
  for (const selector of guide.steps.map((step) => step.selector.slice(1))) {
    assert.match(`${pageSource}\n${dashboardSource}\n${comparisonSource}`, new RegExp(`id=["']${selector}["']`));
  }
});
