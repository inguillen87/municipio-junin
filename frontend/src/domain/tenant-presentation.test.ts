import { describe, expect, it } from 'vitest';

import { formatJuninCurrency, JUNIN_PRESENTATION } from './tenant-presentation';

describe('tenant presentation', () => {
  it('formats GRH source cents as configured ARS for Junin', () => {
    expect(JUNIN_PRESENTATION).toMatchObject({
      schemaVersion: 'tenant-presentation-v1',
      locale: 'es-AR',
      displayCurrencyCode: 'ARS',
      displayCurrencyBasis: 'tenant_configuration',
      sourceCurrencyStatus: 'not_declared_in_source',
    });
    expect(formatJuninCurrency(120824127214)).toBe('ARS 1.208.241.272,14');
  });

  it('rejects values outside the integer-cent contract', () => {
    expect(() => formatJuninCurrency(-1)).toThrow('TENANT_PRESENTATION_AMOUNT_INVALID');
    expect(() => formatJuninCurrency(1.5)).toThrow('TENANT_PRESENTATION_AMOUNT_INVALID');
  });
});
