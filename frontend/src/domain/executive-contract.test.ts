import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  fetchExecutiveContract,
  validateExecutiveContract,
} from './executive-contract';
import type { ExecutiveContract } from './executive-types';

function releasedRanking(label: string) {
  return {
    threshold: 5,
    totalParticipants: 20,
    participantDisplay: '20',
    privacyStatus: 'released',
    rows: [{
      companyCode: 1,
      sourceCode: 1,
      label,
      participants: 20,
      participantDisplay: '20',
      sharePct: 100,
      privacyStatus: 'released',
    }],
  };
}

function sensitiveDomain(sourceTable: 'ausencia' | 'licencia' | 'legamov', rows: readonly unknown[]) {
  return { sourceTable, metric: 'valid_rows_by_year', series: rows };
}

function releasedAnnual(period: string, value: number, participants: number) {
  return {
    period,
    value,
    participantCount: participants,
    participantDisplay: String(participants),
    privacyStatus: 'released',
  };
}

function releasedMonth(period: string, netPayrollCents: number) {
  return {
    period,
    participantCount: 20,
    participantDisplay: '20',
    privacyStatus: 'released',
    amounts: {
      grossWithFamilyAllowancesCents: netPayrollCents + 30_000,
      employeeWithholdingsCents: 20_000,
      netPayrollCents,
      employerContributionsCents: 10_000,
    },
  };
}

function suppressedMonth(period: string | null) {
  return {
    period,
    participantCount: null,
    participantDisplay: '<10',
    privacyStatus: 'suppressed',
    amounts: {
      grossWithFamilyAllowancesCents: null,
      employeeWithholdingsCents: null,
      netPayrollCents: null,
      employerContributionsCents: null,
    },
  };
}

function createValidContract(): ExecutiveContract {
  const candidate: unknown = {
    schemaVersion: 'grh-executive-v2',
    policyVersion: 'grh-small-cell-v1',
    source: {
      canonicalSystem: 'GRH Junín',
      sourceFile: 'grh_junin.snapshot.sql.gz',
      sourceSha256: 'b'.repeat(64),
      snapshotAsOf: '2024-05-15',
      realtime: false,
    },
    privacy: {
      audience: 'interactive',
      interactiveThreshold: 5,
      sensitiveThreshold: 10,
      portableThreshold: 10,
      protectedBucketLabel: 'Otros (celdas protegidas)',
    },
    workforce: {
      definition: 'payroll participation, not a contractual active-status master',
      referencePeriod: '2024-04',
      payrollParticipants: 20,
      bySector: {
        threshold: 5,
        totalParticipants: 20,
        participantDisplay: '20',
        privacyStatus: 'partially_suppressed',
        rows: [
          {
            companyCode: 1,
            sourceCode: 10,
            label: 'Servicios',
            participants: 12,
            participantDisplay: '12',
            sharePct: 60,
            privacyStatus: 'released',
          },
          {
            companyCode: null,
            sourceCode: null,
            label: 'Otros (celdas protegidas)',
            participants: 8,
            participantDisplay: '8',
            sharePct: 40,
            privacyStatus: 'protected_aggregate',
          },
        ],
      },
      byCostCenter: releasedRanking('Centro principal'),
      byAgreement: releasedRanking('Convenio general'),
    },
    compensation: {
      currency: 'not_declared_in_source',
      amountUnit: 'source_currency_cents',
      metricStatus: 'calculation_control_not_bank_disbursement',
      series: [
        releasedMonth('2024-01', 100_000),
        suppressedMonth('2024-02'),
        releasedMonth('2024-03', 150_000),
        releasedMonth('2024-04', 180_000),
      ],
    },
    absence: sensitiveDomain('ausencia', [
      releasedAnnual('2022', 40, 12),
      releasedAnnual('2023', 50, 15),
      releasedAnnual('2024', 20, 10),
    ]),
    leave: sensitiveDomain('licencia', [releasedAnnual('2009', 25, 11)]),
    movements: sensitiveDomain('legamov', [
      releasedAnnual('2023', 150, 18),
      releasedAnnual('2024', 180, 20),
    ]),
  };
  if (!validateExecutiveContract(candidate)) throw new Error('Invalid executive test fixture');
  return candidate;
}

function setAt(root: unknown, path: readonly string[], value: unknown): void {
  let cursor = root as Record<string, unknown>;
  for (const key of path.slice(0, -1)) cursor = cursor[key] as Record<string, unknown>;
  const last = path.at(-1);
  if (last === undefined) throw new Error('A mutation path is required');
  cursor[last] = value;
}

function jsonResponse(payload: unknown, {
  status = 200,
  contentType = 'application/json; charset=utf-8',
  contractHeader = 'grh-executive-v2',
  json = () => Promise.resolve(payload),
}: {
  readonly status?: number;
  readonly contentType?: string;
  readonly contractHeader?: string | null;
  readonly json?: () => Promise<unknown>;
} = {}): Response {
  return {
    status,
    ok: status >= 200 && status < 300,
    headers: {
      get: (name: string) => {
        if (name.toLowerCase() === 'content-type') return contentType;
        if (name.toLowerCase() === 'x-municontrol-contract') return contractHeader;
        return null;
      },
    },
    json,
  } as unknown as Response;
}

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('validateExecutiveContract', () => {
  it('accepts the exact interactive grh-executive-v2 contract', () => {
    expect(validateExecutiveContract(createValidContract())).toBe(true);
  });

  it.each([
    ['an extra top-level field', ['unexpected'], true],
    ['a schema downgrade', ['schemaVersion'], 'grh-executive-v1'],
    ['a portable payload on the interactive endpoint', ['privacy', 'audience'], 'portable'],
    ['a false realtime claim', ['source', 'realtime'], true],
    ['a released small cell', ['workforce', 'bySector', 'rows', '0', 'participants'], 4],
    ['a protected source code', ['workforce', 'bySector', 'rows', '1', 'sourceCode'], 99],
    ['a ranking total mismatch', ['workforce', 'bySector', 'totalParticipants'], 19],
    ['a non-null suppressed amount', ['compensation', 'series', '1', 'amounts', 'netPayrollCents'], 0],
    ['a zero-like suppressed display', ['compensation', 'series', '1', 'participantDisplay'], '0'],
    ['a disclosed sensitive value', ['absence', 'series', '0', 'privacyStatus'], 'suppressed'],
  ])('rejects %s', (_name, path, value) => {
    const candidate = structuredClone(createValidContract());
    setAt(candidate, path, value);
    expect(validateExecutiveContract(candidate)).toBe(false);
  });
});

describe('fetchExecutiveContract', () => {
  it('uses only authenticated no-store JSON GET and deeply freezes the accepted payload', async () => {
    const fetchMock = vi.fn<(input: string, init: RequestInit) => Promise<Response>>()
      .mockResolvedValue(jsonResponse(createValidContract()));
    vi.stubGlobal('window', { MuniAuth: { fetch: fetchMock } });

    const contract = await fetchExecutiveContract({ timeoutMs: 500 });

    expect(fetchMock).toHaveBeenCalledOnce();
    const call = fetchMock.mock.calls.at(0);
    if (!call) throw new Error('Expected an authenticated fetch call');
    const [input, init] = call;
    expect(input).toBe('/api/grh-executive');
    expect(init).toMatchObject({
      method: 'GET',
      cache: 'no-store',
      redirect: 'error',
      headers: { Accept: 'application/json' },
    });
    expect(init.signal).toBeInstanceOf(AbortSignal);
    expect(Object.isFrozen(contract)).toBe(true);
    expect(Object.isFrozen(contract.workforce.bySector.rows)).toBe(true);
    expect(Object.isFrozen(contract.compensation.series[0]?.amounts)).toBe(true);
  });

  it('fails closed without parsing an HTTP error and rejects non-JSON or invalid contracts', async () => {
    let errorBodyReads = 0;
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse(null, {
        status: 403,
        json: () => {
          errorBodyReads += 1;
          return Promise.resolve({ secret: 'must-not-leak' });
        },
      }))
      .mockResolvedValueOnce(jsonResponse(createValidContract(), { contentType: 'text/html' }))
      .mockResolvedValueOnce(jsonResponse({ schemaVersion: 'grh-executive-v2' }));
    vi.stubGlobal('window', { MuniAuth: { fetch: fetchMock } });

    await expect(fetchExecutiveContract()).rejects.toMatchObject({ code: 'GRH_HTTP_ERROR', status: 403 });
    expect(errorBodyReads).toBe(0);
    await expect(fetchExecutiveContract()).rejects.toMatchObject({ code: 'GRH_RESPONSE_NOT_JSON', status: 502 });
    await expect(fetchExecutiveContract()).rejects.toMatchObject({
      code: 'GRH_EXECUTIVE_CONTRACT_INVALID',
      status: 502,
    });
  });

  it('rejects a missing or wrong contract header before parsing the body', async () => {
    let bodyReads = 0;
    const body = () => {
      bodyReads += 1;
      return Promise.resolve(createValidContract());
    };
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse(null, { contractHeader: null, json: body }))
      .mockResolvedValueOnce(jsonResponse(null, { contractHeader: 'grh-quality-v1', json: body }));
    vi.stubGlobal('window', { MuniAuth: { fetch: fetchMock } });

    await expect(fetchExecutiveContract()).rejects.toMatchObject({
      code: 'GRH_RESPONSE_CONTRACT_MISMATCH',
      status: 502,
    });
    await expect(fetchExecutiveContract()).rejects.toMatchObject({
      code: 'GRH_RESPONSE_CONTRACT_MISMATCH',
      status: 502,
    });
    expect(bodyReads).toBe(0);
  });

  it('maps timeout and caller abort to safe typed errors', async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn((_input: string, init: RequestInit) => new Promise<Response>((_resolve, reject) => {
      init.signal?.addEventListener('abort', () => reject(new Error('private transport detail')), { once: true });
    }));
    vi.stubGlobal('window', { MuniAuth: { fetch: fetchMock } });

    const timedRequest = fetchExecutiveContract({ timeoutMs: 25 });
    const timedExpectation = expect(timedRequest).rejects.toMatchObject({
      code: 'GRH_REQUEST_TIMEOUT',
      status: 408,
    });
    await vi.advanceTimersByTimeAsync(25);
    await timedExpectation;

    const controller = new AbortController();
    const abortedRequest = fetchExecutiveContract({ timeoutMs: 1000, signal: controller.signal });
    const abortedExpectation = expect(abortedRequest).rejects.toMatchObject({
      code: 'GRH_REQUEST_ABORTED',
      status: 0,
    });
    controller.abort('sensitive caller reason');
    await abortedExpectation;
  });

  it('rejects a missing auth client and non-canonical options before returning data', async () => {
    vi.stubGlobal('window', {});
    await expect(fetchExecutiveContract()).rejects.toMatchObject({ code: 'GRH_CLIENT_UNAVAILABLE' });
    await expect(fetchExecutiveContract({ timeoutMs: 0 })).rejects.toMatchObject({ code: 'GRH_OPTIONS_INVALID' });
    await expect(fetchExecutiveContract({ extra: true } as never)).rejects.toMatchObject({
      code: 'GRH_OPTIONS_INVALID',
    });
  });
});
