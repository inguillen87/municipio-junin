import assert from 'node:assert/strict';
import test from 'node:test';

import accessPolicy from '../shared/access-policy.cjs';
import publishedDemoPolicy from '../shared/published-demo-policy.cjs';
import releaseTruth from '../shared/release-truth-contract.cjs';
import routePolicy from '../shared/route-policy.cjs';

const EXECUTIVE_ROLES = ['SUPER_ADMIN', 'TENANT_ADMIN', 'INTENDENTE', 'CONTADOR'];
const ROUTE_ID = 'serverless.grh.movement-operations.read';

test('movement operations reuses the exact organization analytics permission and release contract', () => {
  assert.equal(releaseTruth.API_CONTRACTS['/api/grh-movement-operations'],
    'grh-movement-operations-v1');
  assert.equal(routePolicy.RESOURCES.GRH_ORGANIZATION_ANALYTICS,
    'grh.organization.analytics');
  assert.equal(routePolicy.PERMISSIONS.GRH_ORGANIZATION_ANALYTICS_READ,
    'grh.organization.analytics:read');
  assert.deepEqual(routePolicy.PROTECTED_ROUTES.filter(route => route.id === ROUTE_ID), [{
    id: ROUTE_ID,
    runtime: 'serverless',
    method: 'GET',
    path: '/grh-movement-operations',
    permission: routePolicy.PERMISSIONS.GRH_ORGANIZATION_ANALYTICS_READ,
    internalSecrets: [],
  }]);
  assert.deepEqual(
    [...routePolicy.getAllowedRoles(routePolicy.PERMISSIONS.GRH_ORGANIZATION_ANALYTICS_READ)].sort(),
    [...EXECUTIVE_ROLES].sort(),
  );
  assert.equal(Object.values(routePolicy.RESOURCES).includes('grh.movement.operations'), false);
  assert.equal(Object.values(routePolicy.PERMISSIONS).includes('grh.movement.operations:read'), false);
});

test('published ceiling contains movement operations while canonical RBAC preserves high-role parity', () => {
  assert.equal(publishedDemoPolicy.PUBLISHED_DEMO_POLICY_VERSION, '2026-08-13.7');
  assert.equal(publishedDemoPolicy.PUBLISHED_DEMO_ALLOWED_ROUTE_IDS.includes(ROUTE_ID), true);
  for (const profile of publishedDemoPolicy.PUBLISHED_DEMO_PROFILES) {
    const ceiling = publishedDemoPolicy.evaluatePublishedDemoRoute({ ...profile, routeId: ROUTE_ID });
    assert.equal(ceiling.applies, true);
    assert.equal(ceiling.allowed, true, `${profile.email}:published ceiling`);
    const canonicalAllowed = routePolicy.authorizeRoute(
      profile.role,
      'serverless',
      'GET',
      '/api/grh-movement-operations',
    );
    assert.equal(
      canonicalAllowed && ceiling.allowed,
      EXECUTIVE_ROLES.includes(profile.role),
      `${profile.email}:effective access`,
    );
    const access = accessPolicy.getSessionAccessForUser({
      role: profile.role,
      tenantId: 'tenant-junin',
      email: profile.email,
    });
    assert.equal(
      access.capabilities.includes('navigation.organization-analytics'),
      EXECUTIVE_ROLES.includes(profile.role),
      `${profile.email}:discovery parity`,
    );
  }
  assert.equal(routePolicy.authorizeRoute('INTENDENTE', 'serverless', 'POST',
    '/api/grh-movement-operations'), false);
  assert.equal(routePolicy.authorizeRoute('INTENDENTE', 'serverless', 'GET',
    '/api/grh-movement-operations/future'), false);
});
