import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  fetchOrganizationAnalyticsContract,
  OrganizationAnalyticsContractError,
  validateOrganizationAnalyticsContract,
} from './organization-analytics-contract';
import { createOrganizationAnalyticsContract } from './organization-analytics-test-fixture';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('organization analytics contract v2', () => {
  it('accepts the exact source-backed contract', () => {
    expect(validateOrganizationAnalyticsContract(createOrganizationAnalyticsContract())).toBe(true);
  });

  it.each([
    ['extra top-level key', (candidate: Record<string, unknown>) => { candidate.person = 'private'; }],
    ['schema drift', (candidate: Record<string, unknown>) => { candidate.schemaVersion = 'v1'; }],
    ['action drift', (candidate: Record<string, unknown>) => {
      const actions = candidate.actions as { href: string }[];
      actions[0]!.href = '/rrhh#peopleDirectory';
    }],
    ['raw activity value in a protected row', (candidate: Record<string, unknown>) => {
      const activity = candidate.activity as { movements: { series: Record<string, unknown>[] } };
      activity.movements.series[1] = {
        period: null,
        value: 1,
        participantCount: null,
        participantDisplay: 'Protegido',
        privacyStatus: 'suppressed',
      };
    }],
    ['portable ranking threshold drift', (candidate: Record<string, unknown>) => {
      const cohort = candidate.payrollCohort as { bySector: { threshold: number } };
      cohort.bySector.threshold = 5;
    }],
    ['duplicate route identity with a different label', (candidate: Record<string, unknown>) => {
      const cohort = candidate.payrollCohort as {
        byCostCenter: { rows: { companyCode: string | number | null; sourceCode: string | number | null }[] };
      };
      const first = cohort.byCostCenter.rows[0]!;
      const second = cohort.byCostCenter.rows[1]!;
      second.companyCode = first.companyCode;
      second.sourceCode = first.sourceCode;
    }],
    ['coverage reconciliation drift', (candidate: Record<string, unknown>) => {
      const quality = candidate.dataQuality as { missingOrganizationRecords: number };
      quality.missingOrganizationRecords += 1;
    }],
    ['sector-to-payroll complement below k', (candidate: Record<string, unknown>) => {
      const cohort = candidate.payrollCohort as {
        bySector: { rows: { participants: number; participantDisplay: string; sharePct: number }[] };
      };
      const released = cohort.bySector.rows[0]!;
      const protectedRow = cohort.bySector.rows[2]!;
      released.participants = 35;
      released.participantDisplay = '35';
      released.sharePct = 38.8889;
      protectedRow.participants = 35;
      protectedRow.participantDisplay = '35';
      protectedRow.sharePct = 38.8889;
    }],
  ])('fails closed on %s', (_label, mutate) => {
    const candidate = structuredClone(createOrganizationAnalyticsContract()) as unknown as Record<string, unknown>;
    mutate(candidate);
    expect(validateOrganizationAnalyticsContract(candidate)).toBe(false);
  });

  it('loads only through MuniAuth with no-store and freezes the accepted payload', async () => {
    const request = vi.fn().mockResolvedValue(new Response(
      JSON.stringify(createOrganizationAnalyticsContract()),
      {
        status: 200,
        headers: {
          'content-type': 'application/json; charset=utf-8',
          'x-municontrol-contract': 'grh-organization-analytics-v2',
        },
      },
    ));
    vi.stubGlobal('window', { MuniAuth: { fetch: request } });

    const contract = await fetchOrganizationAnalyticsContract({ timeoutMs: 1_000 });

    expect(request).toHaveBeenCalledOnce();
    expect(request.mock.calls[0]?.[0]).toBe('/api/grh-organization-analytics');
    expect(request.mock.calls[0]?.[1]).toMatchObject({
      method: 'GET',
      cache: 'no-store',
      credentials: 'same-origin',
      redirect: 'error',
      headers: { Accept: 'application/json' },
    });
    expect(Object.isFrozen(contract)).toBe(true);
    expect(Object.isFrozen(contract.payrollCohort.bySector.rows)).toBe(true);
    expect(Object.isFrozen(contract.activity.movements.series[0])).toBe(true);
  });

  it.each([
    ['wrong contract header', 'grh-organization-analytics-v1', 'ORGANIZATION_RESPONSE_CONTRACT_MISMATCH'],
    ['missing contract header', null, 'ORGANIZATION_RESPONSE_CONTRACT_MISMATCH'],
  ])('rejects %s', async (_label, header, code) => {
    const headers = new Headers({ 'content-type': 'application/json' });
    if (header) headers.set('x-municontrol-contract', header);
    const request = vi.fn().mockResolvedValue(new Response(
      JSON.stringify(createOrganizationAnalyticsContract()),
      { status: 200, headers },
    ));
    vi.stubGlobal('window', { MuniAuth: { fetch: request } });

    await expect(fetchOrganizationAnalyticsContract()).rejects.toMatchObject({ code });
  });

  it('does not leak provider details when MuniAuth fails', async () => {
    const request = vi.fn().mockRejectedValue(new Error('secret upstream detail'));
    vi.stubGlobal('window', { MuniAuth: { fetch: request } });

    await expect(fetchOrganizationAnalyticsContract()).rejects.toEqual(
      expect.objectContaining<Partial<OrganizationAnalyticsContractError>>({
        code: 'ORGANIZATION_REQUEST_FAILED',
        message: 'No se pudo consultar la fuente GRH.',
      }),
    );
  });
});
