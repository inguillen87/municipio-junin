import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import {
  buildManagementTimelineViewModel,
  parseManagementTimelineContract,
} from './management-timeline-view-model';

const artifact: unknown = JSON.parse(readFileSync(
  new URL('../../../api/_data/grh-management-timeline.json', import.meta.url),
  'utf8',
));

function cloneArtifact(): Record<string, unknown> {
  return structuredClone(artifact) as Record<string, unknown>;
}

describe('management timeline view model', () => {
  it('builds the governed four-year by four-domain comparison from the real artifact', () => {
    const viewModel = buildManagementTimelineViewModel(artifact);

    expect(viewModel.comparison.years).toHaveLength(4);
    expect(viewModel.comparison.years.every(year => year.rows.length === 4)).toBe(true);
    expect(viewModel.comparison.defaultYearKey).toBe('management-year-3');
    expect(viewModel.comparison.equalWindowLabel).toBe('972 días comparables por gestión');
    expect(viewModel.decisions).toHaveLength(3);
    expect(viewModel.decisions[1]?.whatHappened).toContain('5.936 registros');
    expect(viewModel.decisions[1]?.whatHappened).toContain('65.847 días informados');
    expect(viewModel.decisions[2]?.whatHappened).toContain('281 registros');
    expect(viewModel.decisions[2]?.whatHappened).toContain('232 registros');
    for (const decision of viewModel.decisions) {
      const assistantUrl = new URL(decision.assistantHref, 'https://municipio.example');
      expect(assistantUrl.pathname).toBe('/ia.html');
      expect(assistantUrl.searchParams.get('question')).toBeTruthy();
      expect(assistantUrl.searchParams.has('q')).toBe(false);
    }
  });

  it('preserves primary, complementary and unavailable cells without replacement zeros', () => {
    const viewModel = buildManagementTimelineViewModel(artifact);
    const yearTwo = viewModel.comparison.years[1];
    const yearThree = viewModel.comparison.years[2];
    const yearFour = viewModel.comparison.years[3];

    for (const year of [yearTwo, yearThree]) {
      expect(year.rows[2]?.currentLabel).toBe('Dato protegido');
      expect(year.rows[2]?.priorLabel).toBe('Dato protegido');
      expect(year.rows[2]?.differenceLabel).toBe('Dato protegido');
      expect(year.rows[3]?.currentLabel).toBe('Dato protegido');
      expect(year.contextOnlyCurrentLabel).toBe('Dato protegido');
    }
    expect(yearFour.rows.every(row => row.currentLabel === 'No disponible')).toBe(true);
    expect(yearFour.rows.every(row => row.priorLabel === 'No disponible')).toBe(true);
    expect(yearFour.contextOnlyCurrentLabel).toBe('No disponible');
  });

  it('uses only published contract deltas and does not assign performance semantics', () => {
    const viewModel = buildManagementTimelineViewModel(artifact);
    const partialYear = viewModel.comparison.years[2];

    expect(partialYear.rows[0]?.differenceLabel).toContain('+529 registros');
    expect(partialYear.rows[1]?.differenceLabel).toContain('−322 registros');
    expect(partialYear.rows.every(row => row.tone !== ('positive' as never))).toBe(true);
    expect(viewModel.comparison.interpretation).toMatch(/No se calculan en el navegador/u);
    expect(viewModel.comparison.interpretation).toMatch(/mejor o peor/u);
  });

  it('fails closed on shape drift and rejects protected values disguised as zero', () => {
    const wrongSchema = cloneArtifact();
    wrongSchema.schemaVersion = 'grh-management-timeline-v2';
    expect(() => parseManagementTimelineContract(wrongSchema)).toThrow(/schemaVersion/u);

    const leakedProtectedValue = cloneArtifact();
    const years = leakedProtectedValue.managementYears as Array<Record<string, unknown>>;
    const domains = years[1]?.domains as Record<string, Record<string, unknown>>;
    const ingress = domains.reportedIngressDates;
    const current = ingress?.current as Record<string, unknown>;
    current.values = { eventRows: 0, distinctPersons: 0 };
    expect(() => parseManagementTimelineContract(leakedProtectedValue)).toThrow(/values\.eventRows/u);

    const privacyDrift = cloneArtifact();
    const privacy = privacyDrift.privacy as Record<string, unknown>;
    delete privacy.rawRowsExported;
    expect(() => parseManagementTimelineContract(privacyDrift)).toThrow(/contract\.privacy/u);
  });

  it('keeps the projection aggregate-only and omits source coverage internals', () => {
    const viewModel = buildManagementTimelineViewModel(artifact);
    const serialized = JSON.stringify(viewModel);

    expect(viewModel.source.canonicalSystem).toBe('GRH Junín');
    expect(serialized).not.toContain('rowCounts');
    expect(serialized).not.toContain('validEmployeeKeyRows');
    expect(serialized).not.toContain('mappedEmployeeKeys');
    expect(serialized).not.toContain('containsPii');
    expect(viewModel.limits).toContain(
      'La salida contiene sólo agregados; no exporta identificadores, nombres, causas, instrumentos ni filas fuente.',
    );
  });
});
