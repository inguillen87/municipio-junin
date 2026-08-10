import assert from 'node:assert/strict';
import test from 'node:test';

import tenantPresentationPolicy from '../shared/tenant-presentation-policy.cjs';

const {
  TENANT_PRESENTATION_SCHEMA_VERSION,
  resolveTenantPresentation,
  hasConfiguredCurrency,
} = tenantPresentationPolicy;

test('Junin presents source amounts as ARS without rewriting source currency provenance', () => {
  const presentation = resolveTenantPresentation({ slug: 'junin' });

  assert.deepEqual(presentation, {
    schemaVersion: TENANT_PRESENTATION_SCHEMA_VERSION,
    locale: 'es-AR',
    timeZone: 'America/Argentina/Buenos_Aires',
    displayCurrencyCode: 'ARS',
    displayCurrencyBasis: 'tenant_configuration',
    displayCurrencyEffectiveOn: '2026-08-10',
    sourceCurrencyStatus: 'not_declared_in_source',
  });
  assert.equal(hasConfiguredCurrency(presentation), true);
});

test('unknown or malformed tenants fail closed without inventing a currency', () => {
  for (const tenant of [null, {}, { slug: '' }, { slug: '../junin' }, { slug: 'otro-municipio' }]) {
    const presentation = resolveTenantPresentation(tenant);
    assert.equal(presentation.displayCurrencyCode, null);
    assert.equal(presentation.displayCurrencyBasis, 'not_configured');
    assert.equal(presentation.sourceCurrencyStatus, 'not_declared_in_source');
    assert.equal(hasConfiguredCurrency(presentation), false);
  }
});
