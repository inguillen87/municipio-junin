'use strict';

const config = require('./tenant-presentation-config.json');
const TENANT_PRESENTATION_SCHEMA_VERSION = config.schemaVersion;

function presentationFromConfig(value) {
  return Object.freeze({
    schemaVersion: TENANT_PRESENTATION_SCHEMA_VERSION,
    locale: value.locale,
    timeZone: value.timeZone,
    displayCurrencyCode: value.displayCurrencyCode,
    displayCurrencyBasis: value.displayCurrencyBasis,
    displayCurrencyEffectiveOn: value.displayCurrencyEffectiveOn,
    sourceCurrencyStatus: value.sourceCurrencyStatus,
  });
}

const DEFAULT_PRESENTATION = presentationFromConfig(config.default);

const PRESENTATION_BY_TENANT_SLUG = Object.freeze({
  junin: presentationFromConfig(config.tenants.junin),
});

function normalizedSlug(tenant) {
  if (!tenant || typeof tenant !== 'object' || typeof tenant.slug !== 'string') return null;
  const slug = tenant.slug.trim().toLowerCase();
  return /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug) ? slug : null;
}

function resolveTenantPresentation(tenant) {
  const slug = normalizedSlug(tenant);
  const presentation = slug ? PRESENTATION_BY_TENANT_SLUG[slug] : null;
  return presentation || DEFAULT_PRESENTATION;
}

function hasConfiguredCurrency(presentation) {
  return Boolean(
    presentation &&
    presentation.schemaVersion === TENANT_PRESENTATION_SCHEMA_VERSION &&
    typeof presentation.locale === 'string' &&
    /^[A-Z]{3}$/.test(presentation.displayCurrencyCode || '') &&
    presentation.displayCurrencyBasis === 'tenant_configuration' &&
    /^\d{4}-\d{2}-\d{2}$/.test(presentation.displayCurrencyEffectiveOn || '')
  );
}

module.exports = Object.freeze({
  TENANT_PRESENTATION_SCHEMA_VERSION,
  DEFAULT_PRESENTATION,
  PRESENTATION_BY_TENANT_SLUG,
  resolveTenantPresentation,
  hasConfiguredCurrency,
});
