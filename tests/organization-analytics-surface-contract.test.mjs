import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import accessPolicy from '../shared/access-policy.cjs';
import publishedDemoPolicy from '../shared/published-demo-policy.cjs';
import releaseTruth from '../shared/release-truth-contract.cjs';
import routePolicy from '../shared/route-policy.cjs';
import {
  GOVERNED_HTML_FILES,
  PUBLIC_LEGACY_HTML_FILES,
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

test('published demo identities cannot discover or authorize the organization analytics surface', () => {
  for (const [role, email] of [
    ['TENANT_ADMIN', 'admin@junin.gov.ar'],
    ['INTENDENTE', 'intendente@junin.gov.ar'],
    ['CONTADOR', 'contador@junin.gov.ar'],
  ]) {
    const projection = accessPolicy.getSessionAccessForUser({ role, tenantId: 'tenant-junin', email });
    assert.equal(projection.capabilities.includes(CAPABILITY), false, role);
    const decision = publishedDemoPolicy.evaluatePublishedDemoRoute({
      email,
      role,
      tenantSlug: 'junin',
      routeId: ROUTE_ID,
    });
    assert.equal(decision.applies, true);
    assert.equal(decision.allowed, false);
    assert.equal(decision.code, publishedDemoPolicy.PUBLISHED_DEMO_DECISION_CODES.DENIED);
  }
});

test('release, build, clean route, navigation and contextual help stay aligned', async () => {
  assert.equal(
    releaseTruth.API_CONTRACTS['/api/grh-organization-analytics'],
    'grh-organization-analytics-v1',
  );
  assert.ok(PUBLIC_LEGACY_HTML_FILES.includes('estructura.html'));
  assert.ok(GOVERNED_HTML_FILES.includes('estructura.html'));
  assert.ok(PUBLIC_LEGACY_HTML_FILES.includes('organigrama.html'));

  const [vercelSource, navSource, pageSource] = await Promise.all([
    readFile(new URL('../vercel.json', import.meta.url), 'utf8'),
    readFile(new URL('../js/nav.js', import.meta.url), 'utf8'),
    readFile(new URL('../estructura.html', import.meta.url), 'utf8'),
  ]);
  const vercel = JSON.parse(vercelSource);
  assert.deepEqual(
    vercel.rewrites.filter((rewrite) => rewrite.source === '/estructura'),
    [{ source: '/estructura', destination: '/estructura.html' }],
  );
  assert.match(navSource, /id:'estructura'[\s\S]*href:'\/estructura'[\s\S]*capability:'navigation\.organization-analytics'/);
  assert.doesNotMatch(navSource, /href:'(?:\/)?organigrama(?:\.html)?'/);

  const guide = MUNIGUIA_CATALOG.pages.organizationAnalytics;
  assert.deepEqual(guide.aliases, ['/estructura', '/estructura.html']);
  assert.equal(guide.requiredCapability, CAPABILITY);
  assert.deepEqual(
    guide.steps.map((step) => step.selector),
    ['#organizationSnapshotStatus', '#organizationExplorer', '#absenceRiskPanel'],
  );
  for (const selector of guide.steps.map((step) => step.selector.slice(1))) {
    assert.match(pageSource, new RegExp(`id=["']${selector}["']`));
  }
});
