import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import {
  buildGardenNetworkViewModel,
  parseGardenNetworkContract,
} from './garden-network-view-model';

const artifact: unknown = JSON.parse(readFileSync(
  new URL('../../../api/_data/grh-garden-network.json', import.meta.url),
  'utf8',
));

function cloneArtifact(): Record<string, unknown> {
  return structuredClone(artifact) as Record<string, unknown>;
}

describe('garden network view model', () => {
  it('projects the real garden-network artifact without hardcoded browser metrics', () => {
    const viewModel = buildGardenNetworkViewModel(artifact);

    expect(viewModel.summary.peopleLabel).toBe('107');
    expect(viewModel.summary.observedUnitsLabel).toBe('16');
    expect(viewModel.summary.releasedPeopleLabel).toBe('45');
    expect(viewModel.summary.protectedPeopleLabel).toBe('62');
    expect(viewModel.units.released.map(unit => [unit.label, unit.peopleLabel])).toEqual([
      ['Amanecer', '12'],
      ['Manitos de Colores', '12'],
      ['Del Sol', '11'],
      ['Pata Garabata', '10'],
    ]);
    expect(viewModel.units.protected.peopleLabel).toBe('62');
    const serialized = JSON.stringify(viewModel);
    expect(serialized).not.toMatch(/assignedPeople|unassignedPeople/iu);
  });

  it('builds an accessible contiguous 24-month trend from 90 to 107', () => {
    const viewModel = buildGardenNetworkViewModel(artifact);

    expect(viewModel.trend.points).toHaveLength(24);
    expect(viewModel.trend.points[0]?.people).toBe(90);
    expect(viewModel.trend.points.at(-1)?.people).toBe(107);
    expect(viewModel.trend.changeLabel).toBe('+17 personas observadas entre extremos');
    expect(viewModel.trend.accessibleSummary).toContain('Comienza con 90 personas');
    expect(viewModel.trend.accessibleSummary).toContain('termina con 107');
    expect(viewModel.trend.path).toMatch(/^M 50 /u);
    expect(viewModel.trend.fillPath).toMatch(/ Z$/u);
  });

  it('keeps the workforce meaning, privacy rule and map gap explicit', () => {
    const viewModel = buildGardenNetworkViewModel(artifact);

    expect(viewModel.summary.accessibleSummary).toContain('personas observadas en el cálculo');
    expect(viewModel.units.accessibleSummary).toContain('un único grupo protegido');
    expect(viewModel.methodology.find(item => item.label === 'Identidad estadística')?.value)
      .toContain('el identificador no se publica');
    expect(viewModel.mapReadiness.description).toMatch(/no aporta domicilios ni geolocalización oficial/iu);
    expect(viewModel.limits).toHaveLength(6);
    expect(viewModel.dataGaps.items).toHaveLength(4);
    expect(viewModel.dataGaps.items.join(' ')).toMatch(/matrícula.*capacidad.*presentismo.*presupuesto/isu);
    expect(JSON.stringify(viewModel)).not.toContain('unitCode');
    expect(JSON.stringify(viewModel)).not.toContain('sourceEmploymentKeys":165');
  });

  it('fails closed on shape drift and privacy leaks', () => {
    const wrongSchema = cloneArtifact();
    wrongSchema.schemaVersion = 'grh-garden-network-v2';
    expect(() => parseGardenNetworkContract(wrongSchema)).toThrow(/schemaVersion/u);

    const extraField = cloneArtifact();
    const protectedBucket = extraField.protectedBucket as Record<string, unknown>;
    protectedBucket.unitNames = ['Jardín pequeño'];
    expect(() => parseGardenNetworkContract(extraField)).toThrow(/protectedBucket/u);

    const privacyDrift = cloneArtifact();
    const privacy = privacyDrift.privacy as Record<string, unknown>;
    privacy.personIdentifiersExported = true;
    expect(() => parseGardenNetworkContract(privacyDrift)).toThrow(/personIdentifiersExported/u);

    const legacyAssignmentBreakdown = cloneArtifact();
    const legacySummary = legacyAssignmentBreakdown.summary as Record<string, unknown>;
    const legacyQuality = legacyAssignmentBreakdown.quality as Record<string, unknown>;
    legacySummary.assignedPeople = 96;
    legacySummary.unassignedPeople = 11;
    legacyQuality.assignedPeople = 96;
    legacyQuality.unassignedPeople = 11;
    expect(() => parseGardenNetworkContract(legacyAssignmentBreakdown)).toThrow(/contract\.quality|contract\.summary/u);
  });

  it('rejects totals, shares, trend and release-threshold drift', () => {
    const wrongTotals = cloneArtifact();
    const summary = wrongTotals.summary as Record<string, unknown>;
    summary.protectedPeople = 61;
    expect(() => parseGardenNetworkContract(wrongTotals)).toThrow(/peopleBuckets|privacyBuckets/u);

    const wrongShare = cloneArtifact();
    const units = wrongShare.releasedUnits as Array<Record<string, unknown>>;
    if (units[0]) units[0].sharePct = 99;
    expect(() => parseGardenNetworkContract(wrongShare)).toThrow(/releasedUnits\[0\]/u);

    const belowThreshold = cloneArtifact();
    const lowUnits = belowThreshold.releasedUnits as Array<Record<string, unknown>>;
    if (lowUnits[3]) lowUnits[3].people = 9;
    expect(() => parseGardenNetworkContract(belowThreshold)).toThrow(/peopleBuckets|releasedUnits\[3\]/u);

    const wrongTrend = cloneArtifact();
    const trend = wrongTrend.monthlyTrend as Array<Record<string, unknown>>;
    if (trend[1]) trend[1].period = '2025-01';
    expect(() => parseGardenNetworkContract(wrongTrend)).toThrow(/monthlyTrend\[1\]\.period/u);
  });
});
