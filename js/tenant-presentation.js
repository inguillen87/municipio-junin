(function (global) {
  'use strict';

  var SCHEMA_VERSION = 'tenant-presentation-v1';
  var EXPECTED_KEYS = [
    'schemaVersion',
    'locale',
    'timeZone',
    'displayCurrencyCode',
    'displayCurrencyBasis',
    'displayCurrencyEffectiveOn',
    'sourceCurrencyStatus'
  ];

  function exactKeys(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
    var keys = Object.keys(value).sort();
    var expected = EXPECTED_KEYS.slice().sort();
    return keys.length === expected.length && keys.every(function (key, index) {
      return key === expected[index];
    });
  }

  function validate(value) {
    return exactKeys(value) &&
      value.schemaVersion === SCHEMA_VERSION &&
      value.locale === 'es-AR' &&
      value.timeZone === 'America/Argentina/Buenos_Aires' &&
      value.displayCurrencyCode === 'ARS' &&
      value.displayCurrencyBasis === 'tenant_configuration' &&
      /^\d{4}-\d{2}-\d{2}$/.test(value.displayCurrencyEffectiveOn) &&
      value.sourceCurrencyStatus === 'not_declared_in_source';
  }

  function storedPresentation() {
    try {
      var user = JSON.parse(global.sessionStorage.getItem('mjunin_user'));
      return user && validate(user.presentation) ? Object.freeze(Object.assign({}, user.presentation)) : null;
    } catch (error) {
      return null;
    }
  }

  async function load() {
    if (global.MuniAuthReady && typeof global.MuniAuthReady.then === 'function') {
      var authenticated = await global.MuniAuthReady;
      if (authenticated !== true) throw new Error('TENANT_PRESENTATION_SESSION_REQUIRED');
    }
    var presentation = storedPresentation();
    if (!presentation) throw new Error('TENANT_PRESENTATION_UNAVAILABLE');
    return presentation;
  }

  function formatter(presentation, options) {
    if (!validate(presentation)) throw new Error('TENANT_PRESENTATION_INVALID');
    return new Intl.NumberFormat(presentation.locale, Object.assign({
      style: 'currency',
      currency: presentation.displayCurrencyCode,
      currencyDisplay: 'code'
    }, options || {}));
  }

  function formatAmount(value, presentation, options) {
    if (!Number.isFinite(value)) throw new Error('TENANT_PRESENTATION_AMOUNT_INVALID');
    return formatter(presentation, options).format(value).replace(/\s+/g, ' ');
  }

  global.MuniTenantPresentation = Object.freeze({
    SCHEMA_VERSION: SCHEMA_VERSION,
    validate: validate,
    load: load,
    formatAmount: formatAmount
  });
}(window));
