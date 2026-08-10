import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  fetchQualityContract,
  validateQualityContract,
} from './quality-contract';

function createValidContract(): unknown {
  const temporalDomain = (
    validRows: number,
    quarantineRows: number,
    validRatePct: number,
  ) => ({
    rows: 10,
    validRows,
    quarantineRows,
    validRatePct,
    validPeriods: 2,
    firstValidPeriod: '2024-01',
    lastValidPeriod: '2024-02',
    firstValidYear: 2024,
    lastValidYear: 2024,
    dateMonthMismatchRows: 0,
    quarantineReasonOccurrences: quarantineRows,
  });
  const fact = (matchedRows: number, orphanRows: number, rate: number) => ({
    rows: 10,
    matchedRows,
    orphanRows,
    joinIntegrityPct: rate,
    distinctEmployeeKeys: 10,
    validMatchedEmployeeKeys: matchedRows,
    employeeCoveragePct: rate,
  });

  return {
    schemaVersion: 'grh-quality-v1',
    source: {
      canonicalSystem: 'GRH Junín',
      sourceFile: 'grh_junin.snapshot.sql.gz',
      sourceSha256: 'a'.repeat(64),
      snapshotAsOf: '2024-02-29',
      compressedSizeBytes: 1_250_000,
      realtime: false,
      excludedSources: ['personas_junin'],
    },
    lineage: {
      profileSchemaVersion: 'grh-profile-v1',
      semanticSchemaVersion: 'grh-semantic-v2',
      profileGeneratedAt: '2024-03-01T12:00:00Z',
      semanticGeneratedAt: '2024-03-01T12:05:00-03:00',
    },
    privacy: {
      aggregateOnly: true,
      containsPii: false,
      employeeIdentifiersExported: false,
      rawRowsExported: false,
      categoricalLabelsExported: false,
      cellCodesExported: false,
      monetarySeriesExported: false,
    },
    inventory: {
      all: { totalTables: 3, nonEmptyTables: 2, emptyTables: 1, totalRows: 100 },
      focal: { totalTables: 2, nonEmptyTables: 2, emptyTables: 0, totalRows: 100 },
      remainder: { totalTables: 1, nonEmptyTables: 0, emptyTables: 1, totalRows: 0 },
    },
    quality: {
      score: 93.21,
      scope: 'governed_aggregate_extract_not_fitness_of_every_raw_grh_table',
      components: {
        temporalValidity: { score: 92, weightPct: 25 },
        referentialIntegrity: { score: 97.5, weightPct: 25 },
        payrollReconciliation: { score: 83.3333, weightPct: 25 },
        legajoKeyUniqueness: { score: 100, weightPct: 25 },
      },
      risks: {
        rawSourceContainsSensitivePii: true,
        historicalSnapshotNotRealtime: true,
        currencyNotDeclaredInSource: true,
        legacyImportErrorRows: 5,
        quarantinedTemporalRows: 4,
        totpagoCrossSourceMismatch: true,
        calculationControlAnomalousPeriods: 1,
        latestCalculationControlWithinRoundingTolerance: true,
        suspiciousTextEncodingLabelCount: 1,
      },
    },
    temporal: {
      rows: 50,
      validRows: 46,
      quarantineRows: 4,
      validRatePct: 92,
      dateMonthMismatchRows: 0,
      quarantineReasonOccurrences: 4,
      domains: {
        ausencia: temporalDomain(9, 1, 90),
        calculo: temporalDomain(8, 2, 80),
        legamov: temporalDomain(10, 0, 100),
        licencia: temporalDomain(9, 1, 90),
        totpago: temporalDomain(10, 0, 100),
      },
    },
    referential: {
      legajo: { rows: 10, uniqueKeys: 10, uniquenessPct: 100 },
      facts: {
        calculo: fact(10, 0, 100),
        legamov: fact(10, 0, 100),
        ausencia: fact(9, 1, 90),
        licencia: fact(10, 0, 100),
      },
    },
    reconciliation: {
      status: 'material_differences_detected',
      totpagoDiagnosticStatus: 'not_cross_source_reconciled',
      metricStatus: 'calculation_control_not_bank_disbursement',
      currencyStatus: 'not_declared_in_source',
      toleranceCents: 1,
      calculationRuns: 3,
      totpagoRuns: 3,
      unionRuns: 3,
      matchedRuns: 3,
      fullyReconciledRuns: 2,
      runCoveragePct: 100,
      metricExactRatePct: 80,
      valueAgreementPct: 70,
      scorePct: 83.3333,
      absoluteVarianceCents: 10,
    },
  };
}

function setAt(root: unknown, path: readonly string[], value: unknown): void {
  let cursor = root as Record<string, unknown>;
  for (const key of path.slice(0, -1)) cursor = cursor[key] as Record<string, unknown>;
  const last = path.at(-1);
  if (last === undefined) throw new Error('A mutation path is required');
  cursor[last] = value;
}

function jsonResponse(payload: unknown, contentType = 'application/json; charset=utf-8'): Response {
  return {
    status: 200,
    ok: true,
    headers: { get: () => contentType },
    json: () => Promise.resolve(payload),
  } as unknown as Response;
}

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('validateQualityContract', () => {
  it('accepts the exact grh-quality-v1 structure and all cross-field identities', () => {
    expect(validateQualityContract(createValidContract())).toBe(true);
  });

  it.each([
    ['an extra top-level key', ['unexpected'], true],
    ['PII in the browser projection', ['privacy', 'containsPii'], true],
    ['an inventory sum mismatch', ['inventory', 'all', 'totalRows'], 101],
    ['a temporal rate mismatch', ['temporal', 'domains', 'calculo', 'validRatePct'], 81],
    ['a referential identity mismatch', ['referential', 'facts', 'ausencia', 'joinIntegrityPct'], 91],
    ['a reconciliation score mismatch', ['reconciliation', 'scorePct'], 82],
    ['component weights that no longer sum to 100', ['quality', 'components', 'temporalValidity', 'weightPct'], 26],
    ['a weighted quality score mismatch', ['quality', 'score'], 93],
    ['a quarantine risk that differs from temporal totals', ['quality', 'risks', 'quarantinedTemporalRows'], 5],
    ['an unapproved excluded source', ['source', 'excludedSources'], ['personas_junin', 'another_source']],
    ['an invalid lineage timestamp', ['lineage', 'profileGeneratedAt'], '2024-03-01'],
  ])('rejects %s', (_name, path, nextValue) => {
    const contract = structuredClone(createValidContract());
    setAt(contract, path, nextValue);
    expect(validateQualityContract(contract)).toBe(false);
  });
});

describe('fetchQualityContract', () => {
  it('uses only the authenticated no-store JSON GET and deeply freezes the accepted payload', async () => {
    const fetchMock = vi.fn<(input: string, init: RequestInit) => Promise<Response>>()
      .mockResolvedValue(jsonResponse(createValidContract()));
    vi.stubGlobal('window', { MuniAuth: { fetch: fetchMock } });

    const contract = await fetchQualityContract({ timeoutMs: 500 });

    expect(fetchMock).toHaveBeenCalledOnce();
    const call = fetchMock.mock.calls.at(0);
    if (!call) throw new Error('Expected the authenticated fetch call');
    const [input, init] = call;
    expect(input).toBe('/api/grh-quality');
    expect(init).toMatchObject({
      method: 'GET',
      cache: 'no-store',
      redirect: 'error',
      headers: { Accept: 'application/json' },
    });
    expect(init.signal).toBeInstanceOf(AbortSignal);
    expect(Object.isFrozen(contract)).toBe(true);
    expect(Object.isFrozen(contract.quality.components)).toBe(true);
    expect(Object.isFrozen(contract.temporal.domains.calculo)).toBe(true);
    expect(Object.isFrozen(contract.source.excludedSources)).toBe(true);
  });

  it('fails closed for a non-JSON response and for a structurally invalid contract', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse(createValidContract(), 'text/html'))
      .mockResolvedValueOnce(jsonResponse({ schemaVersion: 'grh-quality-v1' }));
    vi.stubGlobal('window', { MuniAuth: { fetch: fetchMock } });

    await expect(fetchQualityContract()).rejects.toMatchObject({
      code: 'GRH_RESPONSE_NOT_JSON',
      status: 502,
    });
    await expect(fetchQualityContract()).rejects.toMatchObject({
      code: 'GRH_QUALITY_CONTRACT_INVALID',
      status: 502,
    });
  });

  it('maps its own timeout and a caller abort without exposing transport errors', async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn((_input: string, init: RequestInit) => new Promise<Response>((_resolve, reject) => {
      init.signal?.addEventListener('abort', () => reject(new Error('private transport detail')), { once: true });
    }));
    vi.stubGlobal('window', { MuniAuth: { fetch: fetchMock } });

    const timedRequest = fetchQualityContract({ timeoutMs: 25 });
    const timedExpectation = expect(timedRequest).rejects.toMatchObject({
      code: 'GRH_REQUEST_TIMEOUT',
      status: 408,
    });
    await vi.advanceTimersByTimeAsync(25);
    await timedExpectation;

    const controller = new AbortController();
    const abortedRequest = fetchQualityContract({ timeoutMs: 1_000, signal: controller.signal });
    const abortedExpectation = expect(abortedRequest).rejects.toMatchObject({
      code: 'GRH_REQUEST_ABORTED',
      status: 0,
    });
    controller.abort();
    await abortedExpectation;
  });

  it('rejects an unavailable auth client and non-canonical options before publishing data', async () => {
    vi.stubGlobal('window', {});
    await expect(fetchQualityContract()).rejects.toMatchObject({ code: 'GRH_CLIENT_UNAVAILABLE' });
    await expect(fetchQualityContract({ timeoutMs: 0 })).rejects.toMatchObject({ code: 'GRH_OPTIONS_INVALID' });
    await expect(fetchQualityContract({ extra: true } as never)).rejects.toMatchObject({
      code: 'GRH_OPTIONS_INVALID',
    });
  });
});
