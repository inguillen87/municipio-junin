import tenantPresentationConfig from '../../../shared/tenant-presentation-config.json';

export interface TenantPresentation {
  readonly schemaVersion: 'tenant-presentation-v1';
  readonly locale: 'es-AR';
  readonly timeZone: 'America/Argentina/Buenos_Aires';
  readonly displayCurrencyCode: 'ARS';
  readonly displayCurrencyBasis: 'tenant_configuration';
  readonly displayCurrencyEffectiveOn: string;
  readonly sourceCurrencyStatus: 'not_declared_in_source';
}

const configured = tenantPresentationConfig.tenants.junin;

export const JUNIN_PRESENTATION: TenantPresentation = Object.freeze({
  schemaVersion: 'tenant-presentation-v1',
  locale: 'es-AR',
  timeZone: 'America/Argentina/Buenos_Aires',
  displayCurrencyCode: 'ARS',
  displayCurrencyBasis: 'tenant_configuration',
  displayCurrencyEffectiveOn: configured.displayCurrencyEffectiveOn,
  sourceCurrencyStatus: 'not_declared_in_source',
});

if (tenantPresentationConfig.schemaVersion !== JUNIN_PRESENTATION.schemaVersion ||
    configured.locale !== JUNIN_PRESENTATION.locale ||
    configured.timeZone !== JUNIN_PRESENTATION.timeZone ||
    configured.displayCurrencyCode !== JUNIN_PRESENTATION.displayCurrencyCode ||
    configured.displayCurrencyBasis !== JUNIN_PRESENTATION.displayCurrencyBasis ||
    configured.sourceCurrencyStatus !== JUNIN_PRESENTATION.sourceCurrencyStatus) {
  throw new Error('TENANT_PRESENTATION_CONFIG_INVALID');
}

export function formatJuninCurrency(cents: number, maximumFractionDigits = 2): string {
  if (!Number.isSafeInteger(cents) || cents < 0) throw new Error('TENANT_PRESENTATION_AMOUNT_INVALID');
  return new Intl.NumberFormat(JUNIN_PRESENTATION.locale, {
    style: 'currency',
    currency: JUNIN_PRESENTATION.displayCurrencyCode,
    currencyDisplay: 'code',
    minimumFractionDigits: 2,
    maximumFractionDigits,
  }).format(cents / 100).replace(/\s+/g, ' ');
}
