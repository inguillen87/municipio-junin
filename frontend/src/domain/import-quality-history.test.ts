import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  buildImportQualityHistoryViewModel,
  fetchImportQualityHistory,
} from './import-quality-history';
import type { ImportQualityHistoryContract } from './import-quality-history-types';

function fixture(): ImportQualityHistoryContract {
  return {
    schemaVersion: 'grh-import-quality-history-v1',
    source: {
      canonicalSystem: 'GRH Junín',
      sourceFile: 'source.sql.gz',
      sourceSha256: 'a'.repeat(64),
      snapshotAsOf: '2026-08-06',
      generatedAt: '2026-08-13T00:00:00.000Z',
      realtime: false,
      table: 'source_table',
      firstEventDate: '2024-01-02',
      lastEventDate: '2026-08-05',
      partialThrough: '2026-08-05',
    },
    privacy: {
      aggregateOnly: true,
      containsPii: false,
      personIdentifiersExported: false,
      rawRowsExported: false,
      rawMessagesExported: false,
    },
    scope: {
      unit: 'historical_import_control_incident',
      meaning: 'Control histórico de importación.',
      notCurrentEmployeeErrors: true,
      notSystemAvailability: true,
    },
    totals: { incidents: 300, importRuns: 30 },
    currentPartial: { year: 2026, incidents: 60, importRuns: 6, partial: true, through: '2026-08-05' },
    annual: [
      { year: 2024, incidents: 100, importRuns: 10, partial: false },
      { year: 2025, incidents: 140, importRuns: 14, partial: false },
      { year: 2026, incidents: 60, importRuns: 6, partial: true },
    ],
    categories: [
      { key: 'second', label: 'Segundo motivo', meaning: 'Control B', incidents: 120, sharePct: 40 },
      { key: 'first', label: 'Primer motivo', meaning: 'Control A', incidents: 180, sharePct: 60 },
    ],
    classification: {
      status: 'exhaustive',
      ruleVersion: 'rules-v1',
      classifiedIncidents: 300,
      coveragePct: 100,
    },
    limits: [{ code: 'partial', text: 'El último año es parcial.' }],
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('buildImportQualityHistoryViewModel', () => {
  it('formats a summary-first projection and keeps the partial year explicit', () => {
    const viewModel = buildImportQualityHistoryViewModel(fixture());

    expect(viewModel.totalIncidentsLabel).toBe('300');
    expect(viewModel.totalRunsLabel).toBe('30');
    expect(viewModel.currentYearLabel).toBe('2026 parcial');
    expect(viewModel.currentRunsLabel).toMatch(/6 lotes con observaciones hasta 5 ago 2026/i);
    expect(viewModel.annual.map(point => point.yearLabel)).toEqual(['2024', '2025', '2026 parcial']);
    expect(viewModel.annual.map(point => point.shortYearLabel)).toEqual(['2024', '2025', '2026 (parcial)']);
    expect(viewModel.annual[1]?.relativeHeightPct).toBe(100);
    expect(viewModel.annual[2]?.accessibleLabel).toMatch(/2026 parcial: 60 observaciones en 6 cargas/i);
    expect(viewModel.categories.map(category => category.label)).toEqual(['Primer motivo', 'Segundo motivo']);
    expect(viewModel.categories[0]?.relativeWidthPct).toBe(100);
    expect(viewModel.categories[0]?.sharePct).toBe(60);
    expect(viewModel.categories[1]?.shareLabel).toBe('40,0%');
    expect(viewModel.scopeNote).toMatch(/no son fallas de personas/i);
    expect(viewModel.scopeNote).toMatch(/salud actual de MuniControl/i);
  });

  it('returns a deeply immutable projection without inventing scale for empty values', () => {
    const contract = fixture();
    const viewModel = buildImportQualityHistoryViewModel({
      ...contract,
      totals: { incidents: 0, importRuns: 0 },
      currentPartial: { ...contract.currentPartial, incidents: 0, importRuns: 0 },
      annual: contract.annual.map(row => ({ ...row, incidents: 0, importRuns: 0 })),
      categories: contract.categories.map(row => ({ ...row, incidents: 0, sharePct: 0 })),
      classification: { ...contract.classification, classifiedIncidents: 0, coveragePct: 0 },
    });

    expect(viewModel.annual.every(point => point.relativeHeightPct === 0)).toBe(true);
    expect(viewModel.categories.every(category => category.relativeWidthPct === 0)).toBe(true);
    expect(Object.isFrozen(viewModel)).toBe(true);
    expect(Object.isFrozen(viewModel.annual)).toBe(true);
    expect(Object.isFrozen(viewModel.categories[0])).toBe(true);
  });
});

describe('fetchImportQualityHistory', () => {
  it('delegates to the dedicated browser client with bounded options', async () => {
    const contract = fixture();
    const load = vi.fn().mockResolvedValue(contract);
    vi.stubGlobal('window', { MuniGrhImportQualityHistory: { load } });
    const controller = new AbortController();

    await expect(fetchImportQualityHistory({ timeoutMs: 500, signal: controller.signal }))
      .resolves.toBe(contract);
    expect(load).toHaveBeenCalledWith({ timeoutMs: 500, signal: controller.signal });
  });

  it('rejects an unavailable client and unsupported options before requesting data', async () => {
    vi.stubGlobal('window', {});
    await expect(fetchImportQualityHistory()).rejects.toThrow('GRH_IMPORT_HISTORY_CLIENT_UNAVAILABLE');
    await expect(fetchImportQualityHistory({ timeoutMs: 30_001 })).rejects
      .toThrow('GRH_IMPORT_HISTORY_OPTIONS_INVALID');
    await expect(fetchImportQualityHistory({ extra: true } as never)).rejects
      .toThrow('GRH_IMPORT_HISTORY_OPTIONS_INVALID');
  });
});
