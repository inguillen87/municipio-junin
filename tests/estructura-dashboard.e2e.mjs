import assert from 'node:assert/strict';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { chromium } from 'playwright';
import { createServer as createViteServer } from 'vite';

import accessPolicy from '../shared/access-policy.cjs';
import {
  GRH_ORGANIZATION_ANALYTICS_ACTIONS,
  GRH_ORGANIZATION_ANALYTICS_LIMITS,
  GRH_ORGANIZATION_ANALYTICS_SCHEMA_VERSION,
  inspectGrhOrganizationAnalyticsContract,
} from '../api/lib/grh-organization-analytics-contract.js';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const FRONTEND_CONFIG = path.join(REPO, 'frontend', 'vite.config.ts');
const CONTRACT_HEADER = 'x-municontrol-contract';
const AUTH_CONTRACT = 'municontrol-auth-me-v1';
const ANALYTICS_CONTRACT = GRH_ORGANIZATION_ANALYTICS_SCHEMA_VERSION;
const FINANCE_CONTRACT = 'grh-workforce-finance-v1';
const MUNIGUIA_STUB_SOURCE = 'export async function mountMuniGuia(){return true} export function unmountMuniGuia(){}';
const PAGE_CAPABILITY = 'navigation.organization-analytics';
const TENANT_ID = 'tenant-structure-e2e';
const SOURCE_SHA = '8cfe17751c48067563a6b609eb75e4ab73512fef131d2bb829ab0bd7364f4c28';
const SNAPSHOT = '2026-08-06';
const SCREENSHOTS = Object.freeze({
  desktop: path.join(tmpdir(), 'municontrol-estructura-1440-dark.png'),
  mobile: path.join(tmpdir(), 'municontrol-estructura-390-light.png'),
  forced: path.join(tmpdir(), 'municontrol-estructura-320-forced-colors.png'),
});

const AUTH_CLIENT_SOURCE = `
  (() => {
    window.MuniAuth = Object.freeze({
      async fetch(input, init = {}) {
        const url = new URL(input instanceof Request ? input.url : input, window.location.href);
        if (url.origin !== window.location.origin) throw new Error('UNSAFE_ORIGIN');
        const headers = new Headers(init.headers || {});
        if (!headers.has('Authorization')) headers.set('Authorization', 'Bearer governed-e2e-token');
        return window.fetch(input, { ...init, headers });
      },
      getToken() { return 'governed-e2e-token'; },
      isAuthError() { return false; }
    });
  })();
`;

const FINANCE_CLIENT_SOURCE = `
  (() => {
    const CONTRACT = '${FINANCE_CONTRACT}';
    window.MuniGrhWorkforceFinance = Object.freeze({
      async load(options = {}) {
        const response = await window.MuniAuth.fetch('/api/grh-workforce-finance', {
          method: 'GET',
          cache: 'no-store',
          credentials: 'same-origin',
          headers: { Accept: 'application/json' },
          redirect: 'error',
          signal: options.signal,
        });
        if (response.status !== 200 || response.headers.get('x-municontrol-contract') !== CONTRACT ||
            !/^application\\/json(?:;|$)/i.test(response.headers.get('content-type') || '')) {
          throw new Error('WORKFORCE_FINANCE_RESPONSE_REJECTED');
        }
        return response.json();
      },
    });
  })();
`;

const round4 = value => Number(value.toFixed(4));
const share = (value, total) => round4(value / total * 100);

const ORGANIZATION_LABELS = Object.freeze([
  'Servicios Urbanos',
  'Gobierno y Comunidad',
  'Administración General',
  'Desarrollo Territorial',
  'Cultura y Educación',
  'Salud Comunitaria',
  'Producción Local',
  'Ambiente Municipal',
]);
const SECTOR_LABELS = Object.freeze([
  'Servicios Públicos',
  'Administración',
  'Atención Territorial',
  'Obras Públicas',
  'Desarrollo Humano',
  'Cultura',
  'Deportes',
  'Compras',
]);
const REGISTERED_COUNTS = Object.freeze([160, 140, 120, 100, 90, 70, 60, 60]);
const ABSENCE_PEOPLE = Object.freeze([40, 35, 30, 25, 20, 15, 10, 10]);
const ABSENCE_EVENTS = Object.freeze([80, 70, 60, 50, 40, 30, 20, 20]);
const PAYROLL_TOTAL = 856;
const PAYROLL_COUNTS = Object.freeze([160, 140, 120, 110, 100, 86, 75, 65]);
const PAYROLL_SECTOR_CODES = Object.freeze([1, 2, 3, 104, 105, 106, 107, 108]);
const COST_CENTER_COUNTS = Object.freeze([132, 110, 96, 88, 82, 74, 68, 62, 54]);
const COST_CENTER_LABELS = Object.freeze([
  'Servicios operativos',
  'Gobierno municipal',
  'Administración central',
  'Obras y mantenimiento',
  'Desarrollo comunitario',
  'Educación y cultura',
  'Deporte local',
  'Abastecimiento',
  'Coordinación territorial',
]);
const COST_CENTER_SOURCE_CODES = Object.freeze([2, 3, 6, 1, 9, 5, 29, 10, 4]);

function dimensionRows(labels, protectedCategoryCount = 0) {
  return labels.map((label, index) => ({
    ...(protectedCategoryCount > 0 && index === labels.length - 1
      ? { code: null, label: 'Otros grupos protegidos', privacyStatus: 'protected_aggregate' }
      : { code: index + 1, label, privacyStatus: 'released' }),
    registeredRecords: REGISTERED_COUNTS[index],
    sharePct: share(REGISTERED_COUNTS[index], 800),
    recordsWithAbsence: null,
    absenceEvents: null,
    eventsPerRegisteredRecord: null,
    absencePrivacyStatus: 'protected',
  }));
}

function absenceRows() {
  return ORGANIZATION_LABELS.map((label, index) => ({
    ...(index === ORGANIZATION_LABELS.length - 1
      ? { code: null, label: 'Otros grupos protegidos', privacyStatus: 'protected_aggregate' }
      : { code: index + 1, label, privacyStatus: 'released' }),
    registeredRecords: REGISTERED_COUNTS[index],
    sharePct: share(ABSENCE_EVENTS[index], 370),
    recordsWithAbsence: ABSENCE_PEOPLE[index],
    absenceEvents: ABSENCE_EVENTS[index],
    eventsPerRegisteredRecord: round4(ABSENCE_EVENTS[index] / REGISTERED_COUNTS[index]),
    absencePrivacyStatus: 'released',
  }));
}

function workforceRanking(labels, counts = PAYROLL_COUNTS, sourceCodes = null) {
  return {
    threshold: 10,
    totalParticipants: PAYROLL_TOTAL,
    participantDisplay: String(PAYROLL_TOTAL),
    privacyStatus: 'released',
    rows: labels.map((label, index) => ({
      companyCode: 101,
      sourceCode: sourceCodes?.[index] ?? index + 1,
      label,
      participants: counts[index],
      participantDisplay: String(counts[index]),
      sharePct: share(counts[index], PAYROLL_TOTAL),
      privacyStatus: 'released',
    })),
  };
}

function costCenterRanking() {
  const ranking = workforceRanking(COST_CENTER_LABELS, COST_CENTER_COUNTS, COST_CENTER_SOURCE_CODES);
  ranking.privacyStatus = 'partially_suppressed';
  ranking.rows.push({
    companyCode: null,
    sourceCode: null,
    label: 'Otros (celdas protegidas)',
    participants: 90,
    participantDisplay: '90',
    sharePct: share(90, PAYROLL_TOTAL),
    privacyStatus: 'protected_aggregate',
  });
  return ranking;
}

function nextMonth(period) {
  const [year, month] = period.split('-').map(Number);
  return month === 12 ? `${year + 1}-01` : `${year}-${String(month + 1).padStart(2, '0')}`;
}

function financeComponents(areaIndex, periodIndex) {
  const netPayrollCents = 2_000_000_000 + areaIndex * 310_000_000 + periodIndex * 47_000_000;
  const employeeWithholdingsCents = 420_000_000 + areaIndex * 31_000_000 + periodIndex * 4_000_000;
  const familyAllowancesCents = 60_000_000 + areaIndex * 2_000_000;
  const nonContributoryEarningsCents = 180_000_000 + areaIndex * 11_000_000;
  const contributoryEarningsCents = netPayrollCents + employeeWithholdingsCents -
    familyAllowancesCents - nonContributoryEarningsCents;
  return {
    grossWithFamilyAllowancesCents: netPayrollCents + employeeWithholdingsCents,
    contributoryEarningsCents,
    nonContributoryEarningsCents,
    familyAllowancesCents,
    employeeWithholdingsCents,
    netPayrollCents,
    netToPayCents: netPayrollCents,
    employerContributionsCents: Math.round(contributoryEarningsCents * 0.18),
  };
}

function financePayload() {
  const periods = [];
  let period = '2024-08';
  for (let periodIndex = 0; periodIndex < 24; periodIndex += 1) {
    periods.push({
      period,
      cells: COST_CENTER_LABELS.map((label, areaIndex) => {
        const components = financeComponents(areaIndex, periodIndex);
        const previousComponents = periodIndex > 0 ? financeComponents(areaIndex, periodIndex - 1) : null;
        return {
          companyCode: 101,
          sourceCode: COST_CENTER_SOURCE_CODES[areaIndex],
          label,
          distinctParticipantsObserved: COST_CENTER_COUNTS[areaIndex],
          participantDisplay: String(COST_CENTER_COUNTS[areaIndex]),
          participantPrivacyStatus: 'released',
          allocationSharePct: round4((35 - areaIndex * 2 + periodIndex * 0.01) / 3),
          privacyStatus: 'released',
          components,
          control: {},
          change: {
            status: periodIndex === 0 ? 'unavailable' : 'released',
            reason: periodIndex === 0 ? 'previous_period_missing' : 'both_consecutive_periods_released',
            previousPeriod: periodIndex === 0 ? null : periods.at(-1).period,
            distinctParticipantsDelta: periodIndex === 0 ? null : 0,
            grossWithFamilyAllowancesDeltaCents: periodIndex === 0 ? null : 51_000_000,
            employeeWithholdingsDeltaCents: periodIndex === 0 ? null : 4_000_000,
            netPayrollDeltaCents: previousComponents === null
              ? null : components.netPayrollCents - previousComponents.netPayrollCents,
            employerContributionsDeltaCents: periodIndex === 0 ? null : 8_000_000,
            netPayrollDeltaPct: previousComponents === null ? null
              : round4((components.netPayrollCents - previousComponents.netPayrollCents) /
                previousComponents.netPayrollCents * 100),
          },
        };
      }),
      privacyStatus: 'released',
      participantAccounting: {},
    });
    period = nextMonth(period);
  }
  return {
    schemaVersion: FINANCE_CONTRACT,
    source: {
      canonicalSystem: 'GRH Junín',
      sourceFile: 'grh_junin.backup_2026080615_plataforma.sql.gz',
      sourceSha256: SOURCE_SHA,
      snapshotAsOf: SNAPSHOT,
    },
    metric: {
      presentationCurrency: 'ARS',
      presentationLocale: 'es-AR',
      status: 'calculation_control_not_bank_disbursement',
    },
    cohort: {
      firstPeriod: '2024-08',
      lastPeriod: '2026-07',
      publishedWindowMonths: 24,
    },
    dimensionViews: [{ dimension: 'costCenter', periods }],
  };
}

function activitySeries({ participantStart, valueStart, valueStep }) {
  return Array.from({ length: 8 }, (_, index) => {
    const participants = participantStart + index * 5;
    return {
      period: String(2019 + index),
      value: valueStart + index * valueStep,
      participantCount: participants,
      participantDisplay: String(participants),
      privacyStatus: 'released',
    };
  });
}

function canonicalAbsenceActivitySeries() {
  return [
    {
      period: '2021',
      value: 1_251,
      participantCount: 535,
      participantDisplay: '535',
      privacyStatus: 'released',
    },
    {
      period: '2022',
      value: 1_670,
      participantCount: 584,
      participantDisplay: '584',
      privacyStatus: 'released',
    },
    {
      period: '2023',
      value: 1_986,
      participantCount: 581,
      participantDisplay: '581',
      privacyStatus: 'released',
    },
    {
      period: '2024',
      value: 2_172,
      participantCount: 610,
      participantDisplay: '610',
      privacyStatus: 'released',
    },
    {
      period: '2025',
      value: 2_048,
      participantCount: 614,
      participantDisplay: '614',
      privacyStatus: 'released',
    },
    {
      period: '2026',
      value: 1_559,
      participantCount: 590,
      participantDisplay: '590',
      privacyStatus: 'released',
    },
    {
      period: null,
      value: null,
      participantCount: null,
      participantDisplay: 'Protegido',
      privacyStatus: 'suppressed',
    },
    {
      period: null,
      value: null,
      participantCount: null,
      participantDisplay: 'Protegido',
      privacyStatus: 'suppressed',
    },
  ];
}

function matrixFixture() {
  const rows = ORGANIZATION_LABELS.slice(0, 5).map((label, index) => ({ code: index + 1, label }));
  const columns = SECTOR_LABELS.slice(0, 5).map((label, index) => ({ code: index + 11, label }));
  const cells = rows.flatMap((row, rowIndex) => columns.map((column, columnIndex) => {
    const notObserved = rowIndex === 4 && columnIndex === 4;
    return {
      organizationCode: row.code,
      sectorCode: column.code,
      registeredRecords: notObserved ? 0 : 10 + rowIndex * 5 + columnIndex,
      privacyStatus: notObserved ? 'not_observed' : 'released',
    };
  }));
  return {
    rowDimension: 'organization',
    columnDimension: 'sector',
    rows,
    columns,
    cells,
    releasedCellCount: 24,
    protectedCellCount: 0,
    maxReleasedRecords: 33,
  };
}

const PAYLOAD = Object.freeze({
  schemaVersion: ANALYTICS_CONTRACT,
  source: {
    canonicalSystem: 'GRH Junín',
    sourceFile: 'grh_junin.backup_2026080615_plataforma.sql.gz',
    sourceSha256: SOURCE_SHA,
    snapshotAsOf: SNAPSHOT,
  },
  privacy: {
    threshold: 10,
    containsPii: false,
    identifiersExported: false,
    labelsProtectedBeforeRanking: true,
    complementarySuppression: true,
  },
  coverage: {
    registeredRecords: 800,
    withOrganization: { records: 800, sharePct: 100 },
    withSector: { records: 800, sharePct: 100 },
    withOrganizationAndSector: { records: 800, sharePct: 100 },
    withAbsenceHistory: { records: 185, sharePct: 23.125 },
    absenceEvents: 370,
  },
  organizations: {
    dimension: 'organization',
    denominatorRecords: 800,
    categoryCount: 10,
    releasedCategoryCount: 7,
    protectedCategoryCount: 3,
    rows: dimensionRows(ORGANIZATION_LABELS, 3),
  },
  sectors: {
    dimension: 'sector',
    denominatorRecords: 800,
    categoryCount: 9,
    releasedCategoryCount: 7,
    protectedCategoryCount: 2,
    rows: dimensionRows(SECTOR_LABELS, 2),
  },
  matrix: matrixFixture(),
  absenceRanking: {
    historical: true,
    denominatorRecords: 800,
    recordsWithAbsence: 185,
    absenceEvents: 370,
    rows: absenceRows(),
  },
  dataQuality: {
    missingOrganizationRecords: 0,
    missingSectorRecords: 0,
    missingBothRecords: 0,
    invalidEmployeeKeyRows: 2,
    unmatchedPersonRecords: 3,
    validAbsenceEvents: 390,
    quarantinedAbsenceEvents: 5,
    linkedAbsenceEvents: 370,
    unlinkedValidAbsenceEvents: 20,
    codedPositionRecords: 620,
    positionObservationRecords: 150,
    futureEffectivePositionObservationRecords: 0,
    firstFuturePositionDate: null,
    lastFuturePositionDate: null,
  },
  payrollCohort: {
    definition: 'Participantes distintos del último cálculo válido; no representa planta contractual activa.',
    referencePeriod: '2026-07',
    payrollParticipants: PAYROLL_TOTAL,
    bySector: workforceRanking(SECTOR_LABELS, PAYROLL_COUNTS, PAYROLL_SECTOR_CODES),
    byCostCenter: costCenterRanking(),
    byAgreement: workforceRanking([
      'Régimen municipal A',
      'Régimen municipal B',
      'Régimen municipal C',
      'Régimen municipal D',
      'Régimen municipal E',
      'Régimen municipal F',
      'Régimen municipal G',
      'Régimen municipal H',
    ]),
  },
  activity: {
    absence: {
      sourceTable: 'ausencia',
      metric: 'valid_rows_by_year',
      series: canonicalAbsenceActivitySeries(),
    },
    movements: {
      sourceTable: 'legamov',
      metric: 'valid_rows_by_year',
      series: activitySeries({ participantStart: 50, valueStart: 120, valueStep: 20 }),
    },
  },
  actions: GRH_ORGANIZATION_ANALYTICS_ACTIONS.map(action => ({ ...action })),
  limits: [...GRH_ORGANIZATION_ANALYTICS_LIMITS],
});

const CONTRACT_MUTATIONS = Object.freeze({
  'source-mismatch': payload => {
    payload.source.sourceFile = 'fuente_no_gobernada.csv';
  },
  'small-workforce-cell': payload => {
    const first = payload.payrollCohort.byCostCenter.rows[0];
    const last = payload.payrollCohort.byCostCenter.rows.at(-1);
    first.participants += 31;
    first.participantDisplay = String(first.participants);
    first.sharePct = share(first.participants, PAYROLL_TOTAL);
    last.participants = 9;
    last.participantDisplay = '9';
    last.sharePct = share(9, PAYROLL_TOTAL);
  },
  'workforce-total-drift': payload => {
    const row = payload.payrollCohort.byCostCenter.rows[0];
    row.participants -= 1;
    row.participantDisplay = String(row.participants);
    row.sharePct = share(row.participants, PAYROLL_TOTAL);
  },
  'cross-view-small-complement': payload => {
    const ranking = payload.payrollCohort.bySector;
    const released = ranking.rows[0];
    const protectedAggregate = ranking.rows[1];
    released.participants -= 9;
    released.participantDisplay = String(released.participants);
    released.sharePct = share(released.participants, PAYROLL_TOTAL);
    protectedAggregate.companyCode = null;
    protectedAggregate.sourceCode = null;
    protectedAggregate.label = 'Otros (celdas protegidas)';
    protectedAggregate.participants += 9;
    protectedAggregate.participantDisplay = String(protectedAggregate.participants);
    protectedAggregate.sharePct = share(protectedAggregate.participants, PAYROLL_TOTAL);
    protectedAggregate.privacyStatus = 'protected_aggregate';
    ranking.privacyStatus = 'partially_suppressed';
  },
  'amount-reinjection': payload => {
    payload.activity.absence.series[0].amounts = { grossCents: 1 };
  },
  'leave-reinjection': payload => {
    payload.activity.leave = structuredClone(payload.activity.absence);
  },
  'nested-extra-key': payload => {
    payload.payrollCohort.byAgreement.rows[0].rawLabel = 'campo no permitido';
  },
  'top-extra-key': payload => {
    payload.debug = true;
  },
  'invalid-series': payload => {
    payload.activity.movements.series[1].period = payload.activity.movements.series[0].period;
  },
  'released-matrix-cell-below-threshold': payload => {
    payload.matrix.cells[0].registeredRecords = 9;
  },
});

function clonePayload() {
  return structuredClone(PAYLOAD);
}

function singleProtectedSectorPayload() {
  const payload = clonePayload();
  payload.sectors.categoryCount = 8;
  payload.sectors.protectedCategoryCount = 1;
  payload.sectors.rows.at(-1).privacyStatus = 'suppressed';
  return payload;
}

function duplicateCostCenterLabelPayload() {
  const payload = clonePayload();
  payload.payrollCohort.byCostCenter.rows[1].label = 'SERVICIOS OPERATIVOS';
  return payload;
}

function protectedOnlyCostCenterPayload() {
  const payload = clonePayload();
  const protectedAggregate = payload.payrollCohort.byCostCenter.rows.at(-1);
  protectedAggregate.participants = PAYROLL_TOTAL;
  protectedAggregate.participantDisplay = String(PAYROLL_TOTAL);
  protectedAggregate.sharePct = 100;
  payload.payrollCohort.byCostCenter.rows = [protectedAggregate];
  return payload;
}

function reservedCostCenterLabelPayload() {
  const payload = clonePayload();
  payload.payrollCohort.byCostCenter.rows[0].label = 'Sector operativo';
  return payload;
}

function authorizedSession(role = 'INTENDENTE', includeCapability = true) {
  const access = accessPolicy.getSessionAccessForUser({ role, tenantId: TENANT_ID });
  const capabilities = includeCapability
    ? access.capabilities
    : access.capabilities.filter(capability => capability !== PAGE_CAPABILITY);
  return {
    user: {
      id: `structure-e2e-${role.toLowerCase()}`,
      name: `Perfil ${role} QA`,
      role,
      tenantId: TENANT_ID,
      capabilities,
      accessPolicyVersion: accessPolicy.ACCESS_POLICY_VERSION,
      homeProfile: access.homeProfile,
      tenant: { id: TENANT_ID, shortName: 'Junín QA' },
    },
  };
}

function authorizedSessionWithout(...removedCapabilities) {
  const session = authorizedSession('INTENDENTE');
  session.user.capabilities = session.user.capabilities.filter(capability => (
    !removedCapabilities.includes(capability)
  ));
  return session;
}

function send(response, status, contentType, body = '', headers = {}) {
  response.statusCode = status;
  response.setHeader('Content-Type', contentType);
  response.setHeader('Cache-Control', 'no-store');
  for (const [name, value] of Object.entries(headers)) response.setHeader(name, value);
  response.end(body);
}

function scenarioPlugin(scenario, apiLog) {
  let analyticsAttempt = 0;
  let financeAttempt = 0;
  return {
    name: `estructura-react-e2e-${scenario.name}`,
    configureServer(server) {
      server.middlewares.use((request, response, next) => {
        const url = new URL(request.url || '/', 'http://127.0.0.1');
        if (url.pathname === '/estructura') {
          request.url = '/estructura.html';
          next();
          return;
        }
        if (url.pathname === '/js/auth-fetch.js') {
          send(response, 200, 'text/javascript; charset=utf-8', AUTH_CLIENT_SOURCE);
          return;
        }
        if (url.pathname === '/js/grh-workforce-finance-data.js') {
          send(response, 200, 'text/javascript; charset=utf-8', FINANCE_CLIENT_SOURCE);
          return;
        }
        if (url.pathname === '/js/contextual-help.js') {
          send(response, 200, 'text/javascript; charset=utf-8', MUNIGUIA_STUB_SOURCE);
          return;
        }
        if (url.pathname === '/js/pwa-register.js') {
          send(response, 200, 'text/javascript; charset=utf-8', 'void 0;');
          return;
        }
        if (url.pathname === '/inicio.html') {
          send(response, 200, 'text/html; charset=utf-8',
            '<!doctype html><html lang="es"><body><main id="safe-workspace">Espacio seguro</main></body></html>');
          return;
        }
        if (url.pathname === '/api/auth/me') {
          apiLog.push({
            path: url.pathname,
            method: request.method,
            accept: request.headers.accept,
            authorization: request.headers.authorization,
            cacheControl: request.headers['cache-control'],
          });
          send(response, 200, 'application/json; charset=utf-8', JSON.stringify(
            scenario.authPayload ?? authorizedSession(scenario.role, scenario.includeCapability !== false),
          ), { [CONTRACT_HEADER]: AUTH_CONTRACT });
          return;
        }
        if (url.pathname === '/api/grh-organization-analytics') {
          apiLog.push({
            path: url.pathname,
            method: request.method,
            accept: request.headers.accept,
            authorization: request.headers.authorization,
            cacheControl: request.headers['cache-control'],
          });
          const sequence = scenario.analyticsSequence ?? [scenario.analyticsMode ?? 'success'];
          const mode = sequence[Math.min(analyticsAttempt, sequence.length - 1)];
          analyticsAttempt += 1;
          if (mode === 'forbidden') {
            send(response, 403, 'application/json; charset=utf-8', JSON.stringify({ error: 'forbidden' }), {
              [CONTRACT_HEADER]: ANALYTICS_CONTRACT,
            });
            return;
          }
          if (mode === 'unavailable') {
            send(response, 503, 'application/json; charset=utf-8', JSON.stringify({ error: 'unavailable' }), {
              [CONTRACT_HEADER]: ANALYTICS_CONTRACT,
            });
            return;
          }
          const payload = scenario.analyticsPayload
            ? structuredClone(scenario.analyticsPayload)
            : clonePayload();
          CONTRACT_MUTATIONS[mode]?.(payload);
          send(response, 200, 'application/json; charset=utf-8', JSON.stringify(payload), {
            [CONTRACT_HEADER]: mode === 'wrong-header' ? 'grh-organization-analytics-v1' : ANALYTICS_CONTRACT,
          });
          return;
        }
        if (url.pathname === '/api/grh-workforce-finance') {
          apiLog.push({
            path: url.pathname,
            method: request.method,
            accept: request.headers.accept,
            authorization: request.headers.authorization,
            cacheControl: request.headers['cache-control'],
          });
          const sequence = scenario.financeSequence ?? [scenario.financeMode ?? 'success'];
          const mode = sequence[Math.min(financeAttempt, sequence.length - 1)];
          financeAttempt += 1;
          if (mode === 'forbidden') {
            send(response, 403, 'application/json; charset=utf-8', JSON.stringify({ error: 'forbidden' }), {
              [CONTRACT_HEADER]: FINANCE_CONTRACT,
            });
            return;
          }
          if (mode === 'unavailable') {
            send(response, 503, 'application/json; charset=utf-8', JSON.stringify({ error: 'unavailable' }), {
              [CONTRACT_HEADER]: FINANCE_CONTRACT,
            });
            return;
          }
          const payload = financePayload();
          if (mode === 'source-mismatch') payload.source.sourceSha256 = 'f'.repeat(64);
          if (mode === 'period-mismatch') payload.cohort.lastPeriod = '2026-06';
          if (mode === 'invalid') payload.dimensionViews[0].periods.pop();
          send(response, 200, 'application/json; charset=utf-8', JSON.stringify(payload), {
            [CONTRACT_HEADER]: mode === 'wrong-header' ? 'grh-workforce-finance-v0' : FINANCE_CONTRACT,
          });
          return;
        }
        if (url.pathname.startsWith('/api/')) {
          apiLog.push({ path: url.pathname, method: request.method });
          send(response, 404, 'application/json; charset=utf-8', '{}');
          return;
        }
        next();
      });
    },
  };
}

async function withScenario(scenario, run) {
  const apiLog = [];
  const server = await createViteServer({
    configFile: FRONTEND_CONFIG,
    logLevel: 'error',
    plugins: [scenarioPlugin(scenario, apiLog)],
    server: { host: '127.0.0.1', port: 0, strictPort: false },
  });
  await server.listen();
  const address = server.httpServer?.address();
  assert.ok(address && typeof address === 'object');
  const baseUrl = `http://127.0.0.1:${address.port}`;
  try {
    await run({ apiLog, baseUrl });
  } finally {
    await server.close();
  }
}

function monitorPage(page, baseUrl) {
  const consoleErrors = [];
  const pageErrors = [];
  const externalRequests = [];
  const requestedPaths = [];
  const origin = new URL(baseUrl).origin;
  page.on('console', message => {
    if (message.type() === 'error') consoleErrors.push(message.text());
  });
  page.on('pageerror', error => pageErrors.push(error.message));
  page.on('request', request => {
    const requestUrl = request.url();
    if (/^(?:data|blob):/u.test(requestUrl)) return;
    const parsed = new URL(requestUrl);
    requestedPaths.push(parsed.pathname);
    if (parsed.origin !== origin) externalRequests.push(requestUrl);
  });
  return { consoleErrors, pageErrors, externalRequests, requestedPaths };
}

async function newMonitoredPage(browser, baseUrl, contextOptions = {}) {
  const context = await browser.newContext(contextOptions);
  const page = await context.newPage();
  return { context, page, diagnostics: monitorPage(page, baseUrl) };
}

async function seedTheme(context, theme) {
  await context.addInitScript(selectedTheme => {
    localStorage.setItem('municontrol-color-theme:v1', selectedTheme);
    localStorage.setItem('govtech_theme', selectedTheme === 'dark' ? 'light' : 'dark');
  }, theme);
}

async function waitReady(page) {
  await page.locator('[data-testid="workforce-panel"]').waitFor({ state: 'visible' });
  await page.locator('[data-testid="organization-explorer"]').waitFor({ state: 'visible' });
  await page.waitForFunction(() => document.querySelectorAll('.structure-kpi').length === 6);
}

function apiPaths(apiLog, start = 0) {
  return apiLog.slice(start).map(entry => entry.path);
}

function assertNoPrivateDirectory(apiLog, diagnostics) {
  const forbidden = value => /(?:grh-(?:directory|person|people)|people-directory|private-directory)/iu.test(value);
  assert.equal(apiLog.some(entry => forbidden(entry.path)), false, JSON.stringify(apiLog));
  assert.equal(diagnostics.requestedPaths.some(forbidden), false, JSON.stringify(diagnostics.requestedPaths));
}

function assertCleanDiagnostics(diagnostics, label) {
  assert.deepEqual(diagnostics.consoleErrors, [], `${label} console: ${diagnostics.consoleErrors.join(' | ')}`);
  assert.deepEqual(diagnostics.pageErrors, [], `${label} page: ${diagnostics.pageErrors.join(' | ')}`);
  assert.deepEqual(diagnostics.externalRequests, [], `${label} external: ${diagnostics.externalRequests.join(' | ')}`);
}

async function readyDiagnostics(page) {
  return page.evaluate(() => {
    const text = String(document.querySelector('main')?.textContent || '').replace(/\s+/g, ' ').trim();
    return {
      heading: document.querySelector('#structure-title')?.textContent?.trim() || '',
      kpis: document.querySelectorAll('.structure-kpi').length,
      workforceRows: document.querySelectorAll('[data-testid="workforce-sector-bars"] .structure-bar').length,
      absenceRows: document.querySelectorAll('[data-testid="absence-ranking"] > li').length,
      explorerOptions: document.querySelectorAll('[data-testid="organization-explorer-list"] button').length,
      explorerDimensions: document.querySelectorAll('.structure-explorer__dimension button').length,
      explorerProtectedSummary: document.querySelector('[data-testid="organization-explorer-protected-organization"]')
        ?.textContent?.replace(/\s+/g, ' ').trim() || '',
      explorerTitle: document.querySelector('#organization-explorer-detail-title')?.textContent?.trim() || '',
      explorerMetrics: document.querySelectorAll('.structure-explorer__metrics > div').length,
      explorerDirectoryHref: document.querySelector('[data-testid="organization-explorer-directory-action"]')?.getAttribute('href') || '',
      explorerHaciendaAction: Boolean(document.querySelector('[data-testid="organization-explorer-hacienda-action"]')),
      explorerAssistantAction: Boolean(document.querySelector('[data-testid="organization-explorer-assistant-action"]')),
      activityFigures: document.querySelectorAll('[data-testid^="activity-"]').length,
      activityPlots: document.querySelectorAll('.activity-plot').length,
      activityPoints: Array.from(document.querySelectorAll('[data-testid^="activity-"]')).map(figure =>
        Array.from(figure.querySelectorAll('.activity-plot')).map(plot => plot.querySelectorAll('.activity-point').length)),
      heatmapRows: document.querySelectorAll('.structure-heatmap__row').length,
      heatmapColumns: document.querySelectorAll('.structure-heatmap__column').length,
      heatmapCells: document.querySelectorAll('.structure-heatmap__cell').length,
      comparison: Boolean(document.querySelector('[data-testid="cost-center-comparison"]')),
      comparisonIdle: Boolean(document.querySelector('[data-testid="cost-center-comparison-idle"]')),
      actions: Array.from(document.querySelectorAll('a[data-testid^="structure-action-"]')).map(node => ({
        testId: node.getAttribute('data-testid'),
        href: node.getAttribute('href'),
      })),
      hasSkipLink: Boolean(document.querySelector('a.skip-link[href="#contenido-principal"]')),
      duplicateIds: Array.from(document.querySelectorAll('[id]')).map(node => node.id)
        .filter((id, index, ids) => ids.indexOf(id) !== index),
      fixtureLeak: /display_name|company_code|grossCents|"amounts"|\bDNI\s*[:#-]\s*\d|\blegajo\s*[:#-]\s*\d|\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i.test(text),
      unexpectedFinanceFigures: Boolean(document.querySelector('[data-testid="cost-center-comparison-content"]')),
      leaveLeak: /\b(?:leave|licencia individual)\b/i.test(text),
      unsafeNominalDeepLinkLeak: /(?:company|legajo)=|hasAbsence=/i.test(document.documentElement.innerHTML),
      privacyJargonVisible: /\bk\s*(?:=|≥|<|>)\s*\d|\bPII\b|umbral|celdas protegidas/i.test(text),
      technicalJargonVisible: /\b(?:snapshot|totpago|score|cuarentena|semántica|conciliación|extracto|cross-source)\b/i.test(text),
      overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    };
  });
}

async function blockedDiagnostics(page) {
  return page.evaluate(() => {
    const text = String(document.querySelector('main')?.textContent || '').replace(/\s+/g, ' ').trim();
    return {
      heading: document.querySelector('.blocked-state h1')?.textContent?.trim() || '',
      readyMounted: Boolean(document.querySelector('[data-testid="workforce-panel"]')),
      kpis: document.querySelectorAll('.structure-kpi').length,
      sourceBackedValueLeak: /Servicios Urbanos|800|2019|2026-07/.test(text),
      syntheticDemoLanguage: /demo|simulad|fictici|mock/i.test(text),
    };
  });
}

async function exerciseReadyControls(page) {
  const themeToggle = page.locator('button.theme-toggle');
  const originalTheme = await page.locator('html').getAttribute('data-theme');
  await themeToggle.click();
  await page.waitForFunction(theme => document.documentElement.dataset.theme !== theme, originalTheme);
  await themeToggle.click();
  await page.waitForFunction(theme => document.documentElement.dataset.theme === theme, originalTheme);

  for (const key of ['costCenter', 'agreement']) {
    await page.locator(`[data-testid="workforce-tab-${key}"]`).click();
    assert.equal(await page.locator(`[data-testid="workforce-${key}-bars"]`).isVisible(), true, key);
    if (key === 'costCenter') {
      const toggle = page.locator('[data-testid="workforce-costCenter-toggle"]');
      await toggle.click();
      assert.match(
        await page.locator('[data-testid="workforce-costCenter-bars"]').innerText(),
        /Otros grupos protegidos/u,
      );
      await toggle.click();
    }
  }
  const sectorTab = page.locator('[data-testid="workforce-tab-sector"]');
  await sectorTab.focus();
  await sectorTab.press('Space');
  assert.equal(await sectorTab.getAttribute('aria-pressed'), 'true');

  const toggles = [
    ['workforce-sector-toggle', 'workforce-sector-bars', '.structure-bar'],
    ['absence-ranking-toggle', 'absence-ranking', 'li'],
  ];
  for (const [toggleId, collectionId, rowSelector] of toggles) {
    const toggle = page.locator(`[data-testid="${toggleId}"]`);
    const rows = page.locator(`[data-testid="${collectionId}"] ${rowSelector}`);
    assert.equal(await rows.count(), 6, `${toggleId} collapsed`);
    await toggle.click();
    assert.equal(await toggle.getAttribute('aria-expanded'), 'true', toggleId);
    assert.equal(await rows.count(), 8, `${toggleId} expanded`);
    await toggle.click();
    assert.equal(await rows.count(), 6, `${toggleId} collapsed again`);
  }

  assert.equal(await page.locator('[data-testid="cost-center-comparison-idle"]').isVisible(), true);
  assert.equal(await page.locator('[data-testid="cost-center-comparison-left"]').inputValue(), '101:2');
  assert.equal(await page.locator('[data-testid="cost-center-comparison-right"]').inputValue(), '101:3');

  const explorerSearch = page.locator('[data-testid="organization-explorer-search"]');
  await explorerSearch.fill('Cultura');
  assert.equal(await page.locator('[data-testid="organization-explorer-list"] button').count(), 1);
  assert.match(await page.locator('[data-testid="organization-explorer-list"]').innerText(), /Cultura y Educación/u);
  await explorerSearch.fill('');
  assert.equal(await page.locator('[data-testid="organization-explorer-list"] button').count(), 7);
  assert.match(await page.locator('[data-testid="organization-explorer-protected-organization"]').innerText(),
    /Otros grupos protegidos.*3 categorías.*60.*7,5%/isu);
  assert.equal(await page.locator('[data-testid="organization-explorer-protected-organization"] button').count(), 0);

  const fifthOrganization = page.locator('[data-testid="organization-explorer-option-organization-5"]');
  await fifthOrganization.focus();
  await fifthOrganization.press('Enter');
  assert.equal(await page.locator('#organization-explorer-detail-title').innerText(), 'Cultura y Educación');
  assert.equal(new URL(page.url()).search, '?dimension=organization&code=5');
  assert.match(await page.locator('[data-testid="organization-explorer-cross"]').innerText(),
    /Sin observación en este cruce/u);

  await page.locator('[data-testid="organization-explorer-dimension-sector"]').click();
  assert.equal(await page.locator('#organization-explorer-detail-title').innerText(), 'Servicios Públicos');
  assert.equal(new URL(page.url()).search, '?dimension=sector&code=1');
  assert.equal(await page.locator('[data-testid="organization-explorer-directory-action"]').getAttribute('href'),
    '/rrhh?sector=1#peopleDirectory');
  assert.equal(await page.locator('[data-testid="organization-explorer-hacienda-action"]').getAttribute('href'),
    '/hacienda?cohort=sector&company=101&code=1#cohortContext');
  const assistantHref = await page.locator('[data-testid="organization-explorer-assistant-action"]').getAttribute('href');
  assert.ok(assistantHref);
  const assistantUrl = new URL(assistantHref, page.url());
  assert.equal(assistantUrl.pathname, '/ia.html');
  assert.equal(assistantUrl.searchParams.get('question'), 'Mostrá el neto de Servicios Públicos por sector');

  await page.locator('[data-testid="organization-explorer-option-sector-2"]').click();
  assert.equal(await page.locator('#organization-explorer-detail-title').innerText(), 'Administración');
  await page.goBack();
  await page.waitForFunction(() => document.querySelector('#organization-explorer-detail-title')?.textContent?.trim() ===
    'Servicios Públicos');
  assert.equal(new URL(page.url()).search, '?dimension=sector&code=1');

  const costCenterDimension = page.locator('[data-testid="organization-explorer-dimension-costCenter"]');
  await costCenterDimension.focus();
  await costCenterDimension.press('Space');
  assert.equal(await costCenterDimension.getAttribute('aria-pressed'), 'true');
  assert.equal(await page.locator('#organization-explorer-detail-title').innerText(), 'Servicios operativos');
  assert.equal(new URL(page.url()).search, '?dimension=costCenter&company=101&code=2');
  assert.equal(new URL(page.url()).hash, '#organizationExplorer');
  assert.equal(await page.locator('.structure-explorer__metrics > div').count(), 3);
  assert.match(await page.locator('.structure-explorer__metrics').innerText(),
    /Participantes con cálculo válido en julio de 2026.*132.*Participación en el total del período.*15,4%.*Posición entre las áreas disponibles.*1 de 9/isu);
  assert.equal(await page.locator('[data-testid="organization-explorer-directory-action"]').count(), 0);
  assert.equal(await page.locator('[data-testid="organization-explorer-absence-unavailable"]').count(), 0);
  assert.equal(await page.locator('[data-testid="organization-explorer-cross"]').count(), 0);
  assert.equal(await page.locator('[data-testid="organization-explorer-hacienda-action"]').getAttribute('href'),
    '/hacienda?cohort=costCenter&company=101&code=2#cohortContext');
  const costCenterAssistantHref = await page.locator(
    '[data-testid="organization-explorer-assistant-action"]',
  ).getAttribute('href');
  assert.equal(new URL(costCenterAssistantHref, page.url()).searchParams.get('question'),
    'Mostrá los componentes del cálculo de Servicios operativos por centro de costo en 2026-07');
  const costCenterProtected = page.locator('[data-testid="organization-explorer-protected-costCenter"]');
  assert.match(await costCenterProtected.innerText(),
    /Otros centros protegidos.*sin identidades ni cantidad de categorías.*90.*10,5%/isu);
  assert.doesNotMatch(await costCenterProtected.innerText(), /\b30\b|\b\d+\s+categorías\b/iu);
  assert.equal(await costCenterProtected.locator('button, a').count(), 0);

  await explorerSearch.fill('Coordinación');
  assert.equal(await page.locator('[data-testid="organization-explorer-list"] button').count(), 1);
  assert.match(await page.locator('[data-testid="organization-explorer-list"]').innerText(), /Coordinación territorial/u);
  await explorerSearch.fill('');
  assert.equal(await page.locator('[data-testid="organization-explorer-list"] button').count(), 9);
  const secondCostCenter = page.locator('[data-testid="organization-explorer-option-costCenter-101-3"]');
  await secondCostCenter.focus();
  await secondCostCenter.press('Enter');
  assert.equal(await page.locator('#organization-explorer-detail-title').innerText(), 'Gobierno municipal');
  assert.equal(new URL(page.url()).search, '?dimension=costCenter&company=101&code=3');
  assert.match(await page.locator('.structure-explorer__metrics').innerText(), /Posición entre las áreas disponibles.*2 de 9/isu);
  await page.goBack();
  await page.waitForFunction(() => document.querySelector('#organization-explorer-detail-title')?.textContent?.trim() ===
    'Servicios operativos');
  assert.equal(new URL(page.url()).search, '?dimension=costCenter&company=101&code=2');

  const buttons = await page.locator('button:visible').evaluateAll(nodes => nodes.map(node => ({
    testId: node.getAttribute('data-testid'),
    className: node.className,
    label: node.getAttribute('aria-label') || node.textContent.trim(),
  })));
  assert.ok(buttons.length >= 14, JSON.stringify(buttons));
  assert.equal(buttons.every(button => button.label.length > 0), true, JSON.stringify(buttons));

  await page.locator('a.skip-link').focus();
  assert.equal(await page.locator('a.skip-link').evaluate(node => document.activeElement === node), true);
  await page.keyboard.press('Tab');
  assert.equal(await page.evaluate(() => {
    const active = document.activeElement;
    if (!(active instanceof HTMLElement)) return false;
    const rect = active.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0;
  }), true);
  for (const region of [
    '[data-testid="activity-absence"] .activity-chart__scroll',
    '[data-testid="activity-movements"] .activity-chart__scroll',
    '[data-testid="organization-sector-heatmap"]',
  ]) {
    const locator = page.locator(region);
    assert.equal(await locator.getAttribute('tabindex'), '0', region);
    await locator.focus();
    assert.equal(await locator.evaluate(node => document.activeElement === node), true, region);
  }
}

async function visualAudit(page) {
  return page.evaluate(() => {
    for (const section of document.querySelectorAll('.structure-section, .structure-two-column--uneven')) {
      section.style.contentVisibility = 'visible';
    }
    const parseColor = value => {
      if (!value || value === 'none' || value === 'transparent') return [0, 0, 0, 0];
      const match = String(value).match(/rgba?\(([^)]+)\)/i);
      if (match) {
        const parts = match[1].replace('/', ' ').split(/[\s,]+/).filter(Boolean).map(Number);
        return [parts[0], parts[1], parts[2], Number.isFinite(parts[3]) ? parts[3] : 1];
      }
      const srgb = String(value).match(/color\(srgb\s+([^)]*)\)/i);
      if (!srgb) return null;
      const parts = srgb[1].replace('/', ' ').split(/\s+/).filter(Boolean).map(Number);
      return [parts[0] * 255, parts[1] * 255, parts[2] * 255,
        Number.isFinite(parts[3]) ? parts[3] : 1];
    };
    const composite = (front, back) => {
      const alpha = front[3] + back[3] * (1 - front[3]);
      if (!alpha) return [0, 0, 0, 0];
      return [0, 1, 2].map(index =>
        (front[index] * front[3] + back[index] * back[3] * (1 - front[3])) / alpha).concat(alpha);
    };
    const luminance = color => color.slice(0, 3).map(channel => {
      const normalized = channel / 255;
      return normalized <= 0.04045 ? normalized / 12.92 : ((normalized + 0.055) / 1.055) ** 2.4;
    }).reduce((sum, channel, index) => sum + channel * [0.2126, 0.7152, 0.0722][index], 0);
    const ratio = (first, second) => {
      const values = [luminance(first), luminance(second)].sort((a, b) => b - a);
      return (values[0] + 0.05) / (values[1] + 0.05);
    };
    const background = node => {
      const layers = [];
      let current = node;
      while (current instanceof Element) {
        const color = parseColor(getComputedStyle(current).backgroundColor);
        if (color && color[3] > 0) layers.push(color);
        if (color && color[3] >= 1) break;
        current = current.parentElement;
      }
      let result = [255, 255, 255, 1];
      for (let index = layers.length - 1; index >= 0; index -= 1) result = composite(layers[index], result);
      return result;
    };
    const backgroundCandidates = node => {
      const hero = node.closest?.('.structure-hero');
      if (!hero) return [background(node)];
      const colors = String(getComputedStyle(hero).backgroundImage)
        .match(/rgba?\([^)]+\)/gi)?.map(parseColor).filter(color => color && color[3] >= 0.999) ?? [];
      if (colors.length === 0) return [background(node)];
      const layers = [];
      let current = node;
      while (current instanceof Element && current !== hero) {
        const color = parseColor(getComputedStyle(current).backgroundColor);
        if (color && color[3] > 0) layers.push(color);
        current = current.parentElement;
      }
      return colors.map(base => {
        let resolved = base;
        for (let index = layers.length - 1; index >= 0; index -= 1) {
          resolved = composite(layers[index], resolved);
        }
        return resolved;
      });
    };
    const visible = node => {
      const style = getComputedStyle(node);
      const rect = node.getBoundingClientRect();
      return node.getClientRects().length > 0 && rect.width > 0 && rect.height > 0 &&
        style.display !== 'none' && style.visibility !== 'hidden' && Number(style.opacity) > 0 &&
        !node.closest('.sr-only');
    };
    const ownsText = node => Array.from(node.childNodes).some(child =>
      child.nodeType === Node.TEXT_NODE && child.textContent.trim());
    const selector = node => `${node.tagName.toLowerCase()}${node.id ? `#${node.id}` : ''}.${
      typeof node.className === 'string' ? node.className.trim().replace(/\s+/g, '.') : ''}`;
    const textNodes = Array.from(document.querySelectorAll('body *')).filter(node =>
      visible(node) && !node.matches('script, style, title, option') && ownsText(node));
    const textViolations = textNodes.map(node => {
      const style = getComputedStyle(node);
      const front = parseColor(style.color);
      const candidates = backgroundCandidates(node);
      return {
        selector: selector(node),
        text: node.textContent.trim().slice(0, 80),
        value: front ? Number(Math.min(...candidates.map(back =>
          ratio(composite(front, back), back))).toFixed(2)) : 0,
      };
    }).filter(item => item.value < 4.49);
    const fontViolations = textNodes.map(node => ({
      selector: selector(node),
      text: node.textContent.trim().slice(0, 80),
      size: Number.parseFloat(getComputedStyle(node).fontSize),
    })).filter(item => item.size < 11.99);
    const controls = Array.from(document.querySelectorAll([
      '.theme-toggle',
      '.structure-segmented',
      '.structure-disclosure',
      '.cost-comparison__controls select',
      '.structure-action',
      '.structure-explorer__dimension',
      '.structure-explorer__search input',
      '.structure-explorer__list button',
    ].join(','))).filter(visible);
    const boundaryViolations = controls.map(node => {
      const style = getComputedStyle(node);
      const border = parseColor(style.borderTopColor);
      const outsideCandidates = backgroundCandidates(node.parentElement || node);
      return {
        selector: selector(node),
        value: border ? Number(Math.min(...outsideCandidates.map(outside =>
          ratio(composite(border, outside), outside))).toFixed(2)) : 0,
        width: Number.parseFloat(style.borderTopWidth),
      };
    }).filter(item => item.width < 1 || item.value < 2.99);
    return {
      theme: document.documentElement.dataset.theme,
      canonicalTheme: localStorage.getItem('municontrol-color-theme:v1'),
      legacyTheme: localStorage.getItem('govtech_theme'),
      overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      textViolations,
      fontViolations,
      boundaryViolations,
      reducedMotion: matchMedia('(prefers-reduced-motion: reduce)').matches,
      forcedColors: matchMedia('(forced-colors: active)').matches,
    };
  });
}

test('Sala de situación GRH React v2 is governed, actionable and fail-closed', {
  timeout: 360_000,
}, async t => {
  const fixtureInspection = inspectGrhOrganizationAnalyticsContract(PAYLOAD, {
    expectedSourceSha256: SOURCE_SHA,
    expectedSnapshotAsOf: SNAPSHOT,
  });
  assert.deepEqual(fixtureInspection.errors, [], fixtureInspection.errors.join(', '));
  assert.equal(fixtureInspection.ok, true);
  for (const [name, mutate] of Object.entries(CONTRACT_MUTATIONS)) {
    const payload = clonePayload();
    mutate(payload);
    assert.equal(inspectGrhOrganizationAnalyticsContract(payload, {
      expectedSourceSha256: SOURCE_SHA,
      expectedSnapshotAsOf: SNAPSHOT,
    }).ok, false, `server inspector must reject ${name}`);
  }

  const browser = await chromium.launch({ headless: true });
  t.after(async () => browser.close());

  await t.test('renders six KPIs, the operational explorer and every visible control acts locally', async () => {
    await withScenario({ name: 'ready-desktop', role: 'INTENDENTE' }, async ({ apiLog, baseUrl }) => {
      const { context, page, diagnostics } = await newMonitoredPage(browser, baseUrl, {
        viewport: { width: 1_440, height: 1_000 },
      });
      try {
        await seedTheme(context, 'dark');
        const responsePromise = page.waitForResponse(response =>
          new URL(response.url()).pathname === '/api/grh-organization-analytics');
        await page.goto(`${baseUrl}/estructura`, { waitUntil: 'domcontentloaded' });
        const response = await responsePromise;
        assert.equal(response.status(), 200);
        assert.equal(response.headers()[CONTRACT_HEADER], ANALYTICS_CONTRACT);
        assert.equal(response.headers()['cache-control'], 'no-store');
        await waitReady(page);

        const ready = await readyDiagnostics(page);
        assert.equal(ready.heading, 'Personal, sectores y áreas de costo');
        assert.equal(ready.kpis, 6);
        assert.equal(ready.workforceRows, 6);
        assert.equal(ready.absenceRows, 6);
        assert.equal(ready.explorerOptions, 7);
        assert.equal(ready.explorerDimensions, 3);
        assert.match(ready.explorerProtectedSummary, /Otros grupos protegidos.*3 categorías.*60.*7,5%/iu);
        assert.equal(ready.explorerTitle, 'Servicios Urbanos');
        assert.equal(ready.explorerMetrics, 5);
        assert.equal(ready.explorerDirectoryHref, '/rrhh?organization=1#peopleDirectory');
        assert.equal(ready.explorerHaciendaAction, false);
        assert.equal(ready.explorerAssistantAction, false);
        assert.equal(ready.activityFigures, 2);
        assert.equal(ready.activityPlots, 4);
        assert.deepEqual(ready.activityPoints, [[8, 8], [8, 8]]);
        assert.equal(ready.heatmapRows, 5);
        assert.equal(ready.heatmapColumns, 5);
        assert.equal(ready.heatmapCells, 25);
        assert.equal(ready.comparison, true);
        assert.equal(ready.comparisonIdle, true);
        assert.deepEqual(ready.actions, [
          { testId: 'structure-action-open_workforce_dashboard', href: '/rrhh' },
          { testId: 'structure-action-open_executive_summary', href: '/ejecutivo' },
          { testId: 'structure-action-open_data_quality', href: '/calidad' },
          { testId: 'structure-action-export_executive_report', href: '/reportes' },
        ]);
        assert.equal(ready.hasSkipLink, true);
        assert.deepEqual(ready.duplicateIds, []);
        assert.equal(ready.fixtureLeak, false);
        assert.equal(ready.unexpectedFinanceFigures, false);
        assert.equal(ready.leaveLeak, false);
        assert.equal(ready.unsafeNominalDeepLinkLeak, false);
        assert.equal(ready.privacyJargonVisible, false);
        assert.equal(ready.technicalJargonVisible, false);
        assert.ok(ready.overflow <= 1, `desktop overflow=${ready.overflow}`);

        await exerciseReadyControls(page);
        assert.deepEqual(apiPaths(apiLog), ['/api/auth/me', '/api/grh-organization-analytics']);
        assert.equal(apiLog[1].method, 'GET');
        assert.equal(apiLog[1].accept, 'application/json');
        assert.match(apiLog[1].authorization || '', /^Bearer /u);
        assert.match(apiLog[1].cacheControl || '', /no-cache|no-store/u);
        assertNoPrivateDirectory(apiLog, diagnostics);
        assertCleanDiagnostics(diagnostics, 'desktop ready');
        await page.screenshot({ path: SCREENSHOTS.desktop, fullPage: true });
      } finally {
        await context.close();
      }
    });
  });

  await t.test('compares only complete published absence years locally on mobile and keeps the cumulative ranking separate', async () => {
    await withScenario({ name: 'absence-year-comparison', role: 'INTENDENTE' }, async ({ apiLog, baseUrl }) => {
      const { context, page, diagnostics } = await newMonitoredPage(browser, baseUrl, {
        viewport: { width: 390, height: 844 },
        reducedMotion: 'reduce',
      });
      try {
        await page.goto(`${baseUrl}/estructura#ausencias`, { waitUntil: 'domcontentloaded' });
        await waitReady(page);

        const comparison = page.locator('[data-testid="absence-year-comparison"]');
        const from = page.locator('[data-testid="absence-compare-from"]');
        const to = page.locator('[data-testid="absence-compare-to"]');
        const swap = page.locator('[data-testid="absence-compare-swap"]');
        await comparison.scrollIntoViewIfNeeded();

        assert.equal(new URL(page.url()).search, '');
        assert.equal(new URL(page.url()).hash, '#ausencias');
        assert.equal(await from.inputValue(), '2024');
        assert.equal(await to.inputValue(), '2025');
        assert.deepEqual(await from.locator('option').evaluateAll(options => options.map(option => ({
          value: option.value,
          disabled: option.disabled,
        }))), [
          { value: '2021', disabled: false },
          { value: '2022', disabled: false },
          { value: '2023', disabled: false },
          { value: '2024', disabled: false },
          { value: '2025', disabled: true },
        ]);
        assert.equal(await from.locator('option[value="2026"]').count(), 0);
        assert.equal(await from.locator('option[value=""]').count(), 0);

        const metricText = async testId => ({
          values: await page.locator(`[data-testid="${testId}"] .absence-comparison-metric__values strong`)
            .allTextContents(),
          delta: (await page.locator(`[data-testid="${testId}"] .absence-comparison-metric__delta strong`)
            .textContent())?.replace(/\s+/gu, ' ').trim(),
        });
        assert.deepEqual(await metricText('absence-compare-events'), {
          values: ['2.172', '2.048'],
          delta: '-124 · -5,71%',
        });
        assert.deepEqual(await metricText('absence-compare-participants'), {
          values: ['610', '614'],
          delta: '+4 · +0,66%',
        });
        assert.deepEqual(await metricText('absence-compare-intensity'), {
          values: ['3,56', '3,34'],
          delta: '-0,23 · -6,32%',
        });

        const comparisonText = (await comparison.textContent() || '').replace(/\s+/gu, ' ').trim();
        assert.match(comparisonText, /2026 parcial al 6(?: de)? ago(?: de)? 2026/iu);
        assert.match(comparisonText, /2 per(?:í|i)odos protegidos omitidos/iu);
        assert.match(comparisonText, /no d(?:í|i)as perdidos ni una tasa sobre planta activa/iu);
        assert.match(comparisonText, /no prueba causas, desempe(?:ñ|n)o ni impacto operativo/iu);
        assert.equal(await comparison.locator('[data-testid="absence-ranking"]').count(), 0);
        const cumulativeRanking = page.locator('#absenceRiskPanel');
        const rankingBefore = (await cumulativeRanking.textContent() || '').replace(/\s+/gu, ' ').trim();
        assert.match(rankingBefore, /Historia agregada.*Ausencias por organizaci(?:ó|o)n/iu);

        const boxes = await Promise.all([from, swap, to].map(locator => locator.boundingBox()));
        assert.ok(boxes.every(Boolean));
        assert.ok(boxes.every(box => box.height >= 44));
        assert.ok(boxes[0].y < boxes[1].y && boxes[1].y < boxes[2].y);
        assert.ok(Math.abs(boxes[0].x - boxes[1].x) <= 1 && Math.abs(boxes[1].x - boxes[2].x) <= 1);

        const pathsBeforeInteraction = apiPaths(apiLog);
        await from.selectOption('2023');
        assert.equal(await from.inputValue(), '2023');
        await swap.focus();
        await swap.press('Enter');
        assert.equal(await from.inputValue(), '2025');
        assert.equal(await to.inputValue(), '2023');
        assert.match((await page.locator('[data-testid="absence-compare-announcement"]').textContent()) || '',
          /2025 frente a 2023/iu);
        assert.deepEqual(apiPaths(apiLog), pathsBeforeInteraction);
        assert.equal(new URL(page.url()).search, '');
        assert.equal(new URL(page.url()).hash, '#ausencias');
        assert.equal((await cumulativeRanking.textContent() || '').replace(/\s+/gu, ' ').trim(), rankingBefore);
        assert.ok((await readyDiagnostics(page)).overflow <= 1);
        assertNoPrivateDirectory(apiLog, diagnostics);
        assertCleanDiagnostics(diagnostics, 'absence year comparison');
      } finally {
        await context.close();
      }
    });
  });

  await t.test('loads the executive cost-center comparison once, then changes, swaps and restores locally', async () => {
    await withScenario({ name: 'cost-comparison-local', role: 'INTENDENTE' }, async ({ apiLog, baseUrl }) => {
      const { context, page, diagnostics } = await newMonitoredPage(browser, baseUrl, {
        viewport: { width: 1_440, height: 1_000 },
      });
      try {
        await page.goto(`${baseUrl}/estructura`, { waitUntil: 'domcontentloaded' });
        await waitReady(page);
        const comparison = page.locator('[data-testid="cost-center-comparison"]');
        await comparison.scrollIntoViewIfNeeded();
        assert.equal(await page.locator('[data-testid="cost-center-comparison-idle"]').isVisible(), true);
        assert.equal(await page.locator('[data-testid="cost-center-comparison-left"]').inputValue(), '101:2');
        assert.equal(await page.locator('[data-testid="cost-center-comparison-right"]').inputValue(), '101:3');
        assert.equal(apiLog.filter(entry => entry.path === '/api/grh-workforce-finance').length, 0);

        await page.locator('[data-testid="cost-center-comparison-load"]').click();
        await page.locator('[data-testid="cost-center-comparison-content"]').waitFor({ state: 'visible' });
        assert.deepEqual(apiPaths(apiLog), [
          '/api/auth/me', '/api/grh-organization-analytics', '/api/grh-workforce-finance',
        ]);
        const financeRequest = apiLog.at(-1);
        assert.equal(financeRequest.method, 'GET');
        assert.equal(financeRequest.accept, 'application/json');
        assert.match(financeRequest.authorization || '', /^Bearer /u);
        assert.match(financeRequest.cacheControl || '', /no-cache|no-store/u);
        assert.equal(new URL(page.url()).search,
          '?compare=costCenter&leftCompany=101&leftCode=2&rightCompany=101&rightCode=3');
        assert.equal(new URL(page.url()).hash, '#costCenterComparator');
        assert.equal(await page.locator('.cost-comparison-kpi').count(), 4);
        assert.match(await page.locator('.cost-comparison__kpis').innerText(),
          /Participantes.*132.*110.*Brecha A.*22.*Participación.*Neto de control.*Asignación del neto global/isu);
        assert.equal(await page.locator('.cost-comparison-chart__plot > li').count(), 24);
        assert.equal(await page.locator('.cost-comparison-table tbody tr').count(), 6);
        const disclosure = page.locator('.cost-comparison-table-block__heading button');
        assert.equal(await disclosure.getAttribute('aria-expanded'), 'false');
        await disclosure.click();
        assert.equal(await disclosure.getAttribute('aria-expanded'), 'true');
        assert.equal(await page.locator('.cost-comparison-table tbody tr').count(), 24);
        assert.equal(await page.locator('[data-testid="cost-center-comparison-hacienda-left"]').getAttribute('href'),
          '/hacienda?cohort=costCenter&company=101&code=2#cohortContext');
        assert.equal(await page.locator('[data-testid="cost-center-comparison-hacienda-right"]').getAttribute('href'),
          '/hacienda?cohort=costCenter&company=101&code=3#cohortContext');
        assert.equal(await comparison.locator('[data-testid*="assistant"], a[href^="/ia"]').count(), 0);

        const rightSelect = page.locator('[data-testid="cost-center-comparison-right"]');
        await rightSelect.selectOption('101:6');
        assert.equal(new URL(page.url()).search,
          '?compare=costCenter&leftCompany=101&leftCode=2&rightCompany=101&rightCode=6');
        assert.equal(await page.locator('.cost-comparison-table tbody tr').count(), 6);
        assert.equal(apiLog.filter(entry => entry.path === '/api/grh-workforce-finance').length, 1);

        await page.locator('[data-testid="cost-center-comparison-swap"]').click();
        assert.equal(await page.locator('[data-testid="cost-center-comparison-left"]').inputValue(), '101:6');
        assert.equal(await page.locator('[data-testid="cost-center-comparison-right"]').inputValue(), '101:2');
        assert.equal(new URL(page.url()).search,
          '?compare=costCenter&leftCompany=101&leftCode=6&rightCompany=101&rightCode=2');
        assert.equal(apiLog.filter(entry => entry.path === '/api/grh-workforce-finance').length, 1);

        await page.goBack();
        await page.waitForFunction(() => new URL(window.location.href).searchParams.get('rightCode') === '6');
        assert.equal(await page.locator('[data-testid="cost-center-comparison-left"]').inputValue(), '101:2');
        assert.equal(await page.locator('[data-testid="cost-center-comparison-right"]').inputValue(), '101:6');
        assert.equal(apiLog.filter(entry => entry.path === '/api/grh-workforce-finance').length, 1);
        assertNoPrivateDirectory(apiLog, diagnostics);
        assertCleanDiagnostics(diagnostics, 'cost comparison local');
      } finally {
        await context.close();
      }
    });
  });

  await t.test('seeds and activates the comparison from the explorer without refetching organization analytics', async () => {
    await withScenario({ name: 'cost-comparison-explorer-seed', role: 'INTENDENTE' }, async ({ apiLog, baseUrl }) => {
      const { context, page, diagnostics } = await newMonitoredPage(browser, baseUrl, {
        viewport: { width: 1_440, height: 1_000 },
        reducedMotion: 'reduce',
      });
      try {
        await page.goto(
          `${baseUrl}/estructura?dimension=costCenter&company=101&code=6#organizationExplorer`,
          { waitUntil: 'domcontentloaded' },
        );
        await waitReady(page);
        assert.equal(await page.locator('[data-testid="cost-center-comparison-idle"]').count(), 1);
        assert.equal(apiLog.filter(entry => entry.path === '/api/grh-workforce-finance').length, 0);
        await page.locator('[data-testid="organization-explorer-compare-action"]').click();
        await page.locator('[data-testid="cost-center-comparison-content"]').waitFor({ state: 'visible' });
        assert.equal(await page.locator('[data-testid="cost-center-comparison-left"]').inputValue(), '101:6');
        assert.equal(await page.locator('[data-testid="cost-center-comparison-right"]').inputValue(), '101:2');
        assert.equal(new URL(page.url()).search,
          '?compare=costCenter&leftCompany=101&leftCode=6&rightCompany=101&rightCode=2');
        assert.equal(new URL(page.url()).hash, '#costCenterComparator');
        assert.equal(await page.evaluate(() => document.activeElement?.id), 'cost-center-comparison-title');
        assert.equal(apiLog.filter(entry => entry.path === '/api/grh-organization-analytics').length, 1);
        assert.equal(apiLog.filter(entry => entry.path === '/api/grh-workforce-finance').length, 1);
        assertNoPrivateDirectory(apiLog, diagnostics);
        assertCleanDiagnostics(diagnostics, 'cost comparison explorer seed');
      } finally {
        await context.close();
      }
    });
  });

  await t.test('auto-loads exact comparator links and rejects invalid shapes without a finance request', async () => {
    await withScenario({ name: 'cost-comparison-deep-links', role: 'INTENDENTE' }, async ({ apiLog, baseUrl }) => {
      const { context, page, diagnostics } = await newMonitoredPage(browser, baseUrl, {
        viewport: { width: 390, height: 844 },
        reducedMotion: 'reduce',
      });
      try {
        await page.goto(
          `${baseUrl}/estructura?compare=costCenter&leftCompany=101&leftCode=2&rightCompany=101&rightCode=3#costCenterComparator`,
          { waitUntil: 'domcontentloaded' },
        );
        await waitReady(page);
        await page.locator('[data-testid="cost-center-comparison-content"]').waitFor({ state: 'visible' });
        assert.equal(await page.locator('[data-testid="organization-explorer-invalid-link"]').count(), 0);
        assert.equal(apiLog.filter(entry => entry.path === '/api/grh-workforce-finance').length, 1);

        const financeBeforeInvalid = apiLog.filter(entry => entry.path === '/api/grh-workforce-finance').length;
        await page.goto(
          `${baseUrl}/estructura?compare=costCenter&leftCompany=101&leftCode=2&rightCompany=101&rightCode=2#costCenterComparator`,
          { waitUntil: 'domcontentloaded' },
        );
        await waitReady(page);
        const invalid = page.locator('[data-testid="cost-center-comparison-invalid"]');
        await invalid.waitFor({ state: 'visible' });
        assert.match(await invalid.textContent() || '', /Enlace de comparación no válido/iu);
        assert.equal(await page.locator('[data-testid="cost-center-comparison-content"]').count(), 0);
        assert.equal(apiLog.filter(entry => entry.path === '/api/grh-workforce-finance').length, financeBeforeInvalid);
        assert.equal(await page.locator('[data-testid="workforce-panel"]').isVisible(), true);
        assertNoPrivateDirectory(apiLog, diagnostics);
        assertCleanDiagnostics(diagnostics, 'cost comparison deep links');
      } finally {
        await context.close();
      }
    });
  });

  await t.test('keeps finance failures scoped, retries only the comparator and closes incompatible payloads', async () => {
    await withScenario({
      name: 'cost-comparison-retry',
      role: 'INTENDENTE',
      financeSequence: ['unavailable', 'success'],
    }, async ({ apiLog, baseUrl }) => {
      const { context, page, diagnostics } = await newMonitoredPage(browser, baseUrl, {
        viewport: { width: 1_440, height: 900 },
      });
      try {
        await page.goto(`${baseUrl}/estructura`, { waitUntil: 'domcontentloaded' });
        await waitReady(page);
        await page.locator('[data-testid="cost-center-comparison-load"]').click();
        await page.locator('[data-testid="cost-center-comparison-error"]').waitFor({ state: 'visible' });
        assert.equal(await page.locator('[data-testid="workforce-panel"]').isVisible(), true);
        assert.equal(await page.locator('.structure-kpi').count(), 6);
        assert.equal(apiLog.filter(entry => entry.path === '/api/grh-workforce-finance').length, 1);
        await page.locator('[data-testid="cost-center-comparison-retry"]').click();
        await page.locator('[data-testid="cost-center-comparison-content"]').waitFor({ state: 'visible' });
        assert.equal(apiLog.filter(entry => entry.path === '/api/grh-workforce-finance').length, 2);
        assert.equal(apiLog.filter(entry => entry.path === '/api/grh-organization-analytics').length, 1);
        assertNoPrivateDirectory(apiLog, diagnostics);
        assert.deepEqual(diagnostics.pageErrors, []);
        assert.deepEqual(diagnostics.externalRequests, []);
      } finally {
        await context.close();
      }
    });

    for (const financeMode of ['forbidden', 'invalid', 'source-mismatch', 'period-mismatch']) {
      await withScenario({ name: `cost-comparison-${financeMode}`, role: 'INTENDENTE', financeMode },
        async ({ apiLog, baseUrl }) => {
          const { context, page, diagnostics } = await newMonitoredPage(browser, baseUrl, {
            viewport: { width: 1_024, height: 768 },
          });
          try {
            await page.goto(
              `${baseUrl}/estructura?compare=costCenter&leftCompany=101&leftCode=2&rightCompany=101&rightCode=3#costCenterComparator`,
              { waitUntil: 'domcontentloaded' },
            );
            await waitReady(page);
            await page.locator('[data-testid="cost-center-comparison-error"]').waitFor({ state: 'visible' });
            assert.equal(await page.locator('[data-testid="cost-center-comparison-content"]').count(), 0, financeMode);
            assert.equal(await page.locator('[data-testid="workforce-panel"]').isVisible(), true, financeMode);
            assert.equal(apiLog.filter(entry => entry.path === '/api/grh-workforce-finance').length, 1, financeMode);
            assert.equal(apiLog.filter(entry => entry.path === '/api/grh-organization-analytics').length, 1, financeMode);
            assertNoPrivateDirectory(apiLog, diagnostics);
            assert.deepEqual(diagnostics.pageErrors, [], financeMode);
            assert.deepEqual(diagnostics.externalRequests, [], financeMode);
          } finally {
            await context.close();
          }
        });
    }
  });

  await t.test('gates comparator finance and Hacienda actions with the exact capability', async () => {
    await withScenario({
      name: 'cost-comparison-capability',
      authPayload: authorizedSessionWithout('navigation.hacienda'),
    }, async ({ apiLog, baseUrl }) => {
      const { context, page, diagnostics } = await newMonitoredPage(browser, baseUrl, {
        viewport: { width: 390, height: 844 },
      });
      try {
        await page.goto(`${baseUrl}/estructura`, { waitUntil: 'domcontentloaded' });
        await waitReady(page);
        assert.equal(await page.locator('[data-testid="cost-center-comparison-disabled"]').isVisible(), true);
        assert.equal(await page.locator('[data-testid="cost-center-comparison-load"]').count(), 0);
        assert.equal(await page.locator('[data-testid^="cost-center-comparison-hacienda-"]').count(), 0);
        assert.equal(apiLog.filter(entry => entry.path === '/api/grh-workforce-finance').length, 0);
        assertNoPrivateDirectory(apiLog, diagnostics);
        assertCleanDiagnostics(diagnostics, 'cost comparison capability');
      } finally {
        await context.close();
      }
    });
  });

  await t.test('resolves exact explorer deep links and never refetches when the selection changes', async () => {
    await withScenario({ name: 'deep-link-sector', role: 'INTENDENTE' }, async ({ apiLog, baseUrl }) => {
      const { context, page, diagnostics } = await newMonitoredPage(browser, baseUrl, {
        viewport: { width: 1_440, height: 900 },
      });
      try {
        await page.goto(
          `${baseUrl}/estructura?dimension=sector&code=2#organizationExplorer`,
          { waitUntil: 'domcontentloaded' },
        );
        await waitReady(page);
        assert.equal(await page.locator('#organization-explorer-detail-title').innerText(), 'Administración');
        assert.equal(await page.locator('[data-testid="organization-explorer-directory-action"]').getAttribute('href'),
          '/rrhh?sector=2#peopleDirectory');
        assert.equal(await page.locator('[data-testid="organization-explorer-hacienda-action"]').getAttribute('href'),
          '/hacienda?cohort=sector&company=101&code=2#cohortContext');
        const assistantHref = await page.locator('[data-testid="organization-explorer-assistant-action"]').getAttribute('href');
        assert.equal(new URL(assistantHref, baseUrl).searchParams.get('question'),
          'Mostrá el neto de Administración por sector');
        assert.match(await page.locator('[data-testid="organization-explorer-absence-unavailable"]').innerText(),
          /Sin desglose publicado.*no hay un detalle de ausencias para este sector/isu);

        await page.locator('[data-testid="organization-explorer-option-sector-3"]').click();
        assert.equal(await page.locator('#organization-explorer-detail-title').innerText(), 'Atención Territorial');
        assert.equal(new URL(page.url()).search, '?dimension=sector&code=3');
        assert.deepEqual(apiPaths(apiLog), ['/api/auth/me', '/api/grh-organization-analytics']);
        assertNoPrivateDirectory(apiLog, diagnostics);
        assertCleanDiagnostics(diagnostics, 'deep link sector');
      } finally {
        await context.close();
      }
    });
  });

  await t.test('explores exact payroll cost centers on mobile without deriving GRH or refetching', async () => {
    await withScenario({ name: 'deep-link-cost-center', role: 'INTENDENTE' }, async ({ apiLog, baseUrl }) => {
      const { context, page, diagnostics } = await newMonitoredPage(browser, baseUrl, {
        viewport: { width: 390, height: 844 },
        reducedMotion: 'reduce',
      });
      try {
        await page.goto(
          `${baseUrl}/estructura?dimension=costCenter&company=101&code=3#organizationExplorer`,
          { waitUntil: 'domcontentloaded' },
        );
        await waitReady(page);
        await page.locator('[data-testid="organization-explorer"]').scrollIntoViewIfNeeded();
        assert.equal((await page.locator('#organization-explorer-detail-title').textContent())?.trim(), 'Gobierno municipal');
        assert.equal(await page.locator('.structure-explorer__metrics > div').count(), 3);
        assert.match(await page.locator('.structure-explorer__metrics').textContent() || '',
          /Participantes con cálculo válido en julio de 2026.*110.*Participación en el total del período.*12,9%.*Posición entre las áreas disponibles.*2 de 9/isu);
        assert.match(await page.locator('[data-testid="cost-center-scope-note"]').textContent() || '',
          /no confirma la estructura vigente.*Total usado: 856 participantes.*período 2026-07/isu);
        assert.equal(await page.locator('[data-testid="organization-explorer-directory-action"]').count(), 0);
        assert.equal(await page.locator('[data-testid="organization-explorer-absence-unavailable"]').count(), 0);
        assert.equal(await page.locator('[data-testid="organization-explorer-cross"]').count(), 0);
        assert.equal(await page.locator('[data-testid="organization-explorer-hacienda-action"]').getAttribute('href'),
          '/hacienda?cohort=costCenter&company=101&code=3#cohortContext');
        const assistantHref = await page.locator(
          '[data-testid="organization-explorer-assistant-action"]',
        ).getAttribute('href');
        assert.equal(new URL(assistantHref, page.url()).searchParams.get('question'),
          'Mostrá los componentes del cálculo de Gobierno municipal por centro de costo en 2026-07');
        assert.match(await page.locator('[data-testid="organization-explorer-protected-costCenter"]').textContent() || '',
          /Otros centros protegidos.*90.*10,5%/isu);

        const dimensionButtons = page.locator('.structure-explorer__dimension button');
        await dimensionButtons.first().scrollIntoViewIfNeeded();
        const firstBox = await dimensionButtons.nth(0).boundingBox();
        const secondBox = await dimensionButtons.nth(1).boundingBox();
        const thirdBox = await dimensionButtons.nth(2).boundingBox();
        assert.ok(firstBox && secondBox && thirdBox);
        assert.ok(Math.abs(firstBox.x - secondBox.x) <= 1 && Math.abs(secondBox.x - thirdBox.x) <= 1);
        assert.ok(firstBox.y < secondBox.y && secondBox.y < thirdBox.y);

        const thirdCostCenter = page.locator('[data-testid="organization-explorer-option-costCenter-101-6"]');
        await thirdCostCenter.focus();
        await thirdCostCenter.press('Enter');
        assert.equal((await page.locator('#organization-explorer-detail-title').textContent())?.trim(),
          'Administración central');
        assert.equal(new URL(page.url()).search, '?dimension=costCenter&company=101&code=6');
        await page.goBack();
        await page.waitForFunction(() => document.querySelector('#organization-explorer-detail-title')?.textContent?.trim() ===
          'Gobierno municipal');
        assert.equal(new URL(page.url()).search, '?dimension=costCenter&company=101&code=3');
        assert.deepEqual(apiPaths(apiLog), ['/api/auth/me', '/api/grh-organization-analytics']);
        assert.ok((await readyDiagnostics(page)).overflow <= 1);
        assertNoPrivateDirectory(apiLog, diagnostics);
        assertCleanDiagnostics(diagnostics, 'deep link cost center');
      } finally {
        await context.close();
      }
    });
  });

  await t.test('keeps protected-only cost centers empty while the other explorer dimensions remain usable', async () => {
    const analyticsPayload = protectedOnlyCostCenterPayload();
    assert.equal(inspectGrhOrganizationAnalyticsContract(analyticsPayload, {
      expectedSourceSha256: SOURCE_SHA,
      expectedSnapshotAsOf: SNAPSHOT,
    }).ok, true);
    await withScenario({
      name: 'protected-only-cost-centers',
      role: 'INTENDENTE',
      analyticsPayload,
    }, async ({ apiLog, baseUrl }) => {
      const { context, page, diagnostics } = await newMonitoredPage(browser, baseUrl, {
        viewport: { width: 390, height: 844 },
        reducedMotion: 'reduce',
      });
      try {
        await page.goto(`${baseUrl}/estructura`, { waitUntil: 'domcontentloaded' });
        await waitReady(page);
        const dimension = page.locator('[data-testid="organization-explorer-dimension-costCenter"]');
        await dimension.focus();
        await dimension.press('Space');
        await page.locator('[data-testid="organization-explorer"]').scrollIntoViewIfNeeded();
        assert.equal(await dimension.getAttribute('aria-pressed'), 'true');
        assert.equal(await page.locator('[data-testid="organization-explorer-list"] button').count(), 0);
        assert.match(await page.locator('.structure-explorer__empty').textContent() || '',
          /No hay áreas de costo publicadas para seleccionar/u);
        assert.equal((await page.locator('#organization-explorer-detail-title').textContent())?.trim(),
          'Sin áreas de costo publicadas');
        assert.match(await page.locator('[data-testid="organization-explorer-detail"]').textContent() || '',
          /Publicación protegida.*sólo muestra un total general.*No hay personas ni acciones individuales disponibles/isu);
        assert.match(await page.locator('[data-testid="organization-explorer-protected-costCenter"]').textContent() || '',
          /Otros centros protegidos.*856.*100,0%/isu);
        assert.equal(await page.locator('.structure-explorer__metrics').count(), 0);
        assert.equal(await page.locator('[data-testid="organization-explorer-directory-action"]').count(), 0);
        assert.equal(await page.locator('[data-testid="organization-explorer-hacienda-action"]').count(), 0);
        assert.equal(await page.locator('[data-testid="organization-explorer-assistant-action"]').count(), 0);
        assert.match(await page.locator('[data-testid="cost-center-comparison"]').textContent() || '',
          /No hay dos áreas publicadas con identidad suficiente/iu);
        assert.equal(await page.locator('[data-testid="cost-center-comparison-idle"]').count(), 0);
        assert.equal(await page.locator('[data-testid="cost-center-comparison-load"]').count(), 0);

        await page.locator('[data-testid="organization-explorer-dimension-sector"]').click();
        assert.equal((await page.locator('#organization-explorer-detail-title').textContent())?.trim(),
          'Servicios Públicos');
        assert.equal(new URL(page.url()).search, '?dimension=sector&code=1');
        await page.locator('[data-testid="organization-explorer-dimension-organization"]').click();
        assert.equal((await page.locator('#organization-explorer-detail-title').textContent())?.trim(),
          'Servicios Urbanos');
        assert.equal(new URL(page.url()).search, '?dimension=organization&code=1');
        assert.deepEqual(apiPaths(apiLog), ['/api/auth/me', '/api/grh-organization-analytics']);
        assertNoPrivateDirectory(apiLog, diagnostics);
        assertCleanDiagnostics(diagnostics, 'protected-only cost centers');
      } finally {
        await context.close();
      }
    });
  });

  await t.test('gates cost-center actions by exact capabilities and a unique normalized BOT label', async () => {
    const reservedLabelPayload = reservedCostCenterLabelPayload();
    assert.equal(inspectGrhOrganizationAnalyticsContract(reservedLabelPayload, {
      expectedSourceSha256: SOURCE_SHA,
      expectedSnapshotAsOf: SNAPSHOT,
    }).ok, true);
    await withScenario({
      name: 'cost-center-reserved-label',
      role: 'INTENDENTE',
      analyticsPayload: reservedLabelPayload,
    }, async ({ apiLog, baseUrl }) => {
      const { context, page, diagnostics } = await newMonitoredPage(browser, baseUrl, {
        viewport: { width: 1_440, height: 900 },
      });
      try {
        await page.goto(
          `${baseUrl}/estructura?dimension=costCenter&company=101&code=2#organizationExplorer`,
          { waitUntil: 'domcontentloaded' },
        );
        await waitReady(page);
        assert.equal(await page.locator('#organization-explorer-detail-title').innerText(), 'Sector operativo');
        assert.equal(await page.locator('[data-testid="organization-explorer-hacienda-action"]').getAttribute('href'),
          '/hacienda?cohort=costCenter&company=101&code=2#cohortContext');
        assert.equal(await page.locator('[data-testid="organization-explorer-assistant-action"]').count(), 0);
        assert.deepEqual(apiPaths(apiLog), ['/api/auth/me', '/api/grh-organization-analytics']);
        assertNoPrivateDirectory(apiLog, diagnostics);
        assertCleanDiagnostics(diagnostics, 'cost center reserved BOT label');
      } finally {
        await context.close();
      }
    });

    const duplicateLabelPayload = duplicateCostCenterLabelPayload();
    assert.equal(inspectGrhOrganizationAnalyticsContract(duplicateLabelPayload, {
      expectedSourceSha256: SOURCE_SHA,
      expectedSnapshotAsOf: SNAPSHOT,
    }).ok, true);
    await withScenario({
      name: 'cost-center-duplicate-label',
      role: 'INTENDENTE',
      analyticsPayload: duplicateLabelPayload,
    }, async ({ apiLog, baseUrl }) => {
      const { context, page, diagnostics } = await newMonitoredPage(browser, baseUrl, {
        viewport: { width: 1_440, height: 900 },
      });
      try {
        await page.goto(
          `${baseUrl}/estructura?dimension=costCenter&company=101&code=2#organizationExplorer`,
          { waitUntil: 'domcontentloaded' },
        );
        await waitReady(page);
        assert.equal(await page.locator('#organization-explorer-detail-title').innerText(), 'Servicios operativos');
        assert.equal(await page.locator('[data-testid="organization-explorer-hacienda-action"]').count(), 1);
        assert.equal(await page.locator('[data-testid="organization-explorer-assistant-action"]').count(), 0);
        await page.locator('[data-testid="organization-explorer-option-costCenter-101-3"]').click();
        assert.equal(await page.locator('#organization-explorer-detail-title').innerText(), 'SERVICIOS OPERATIVOS');
        assert.equal(await page.locator('[data-testid="organization-explorer-hacienda-action"]').count(), 1);
        assert.equal(await page.locator('[data-testid="organization-explorer-assistant-action"]').count(), 0);
        assert.deepEqual(apiPaths(apiLog), ['/api/auth/me', '/api/grh-organization-analytics']);
        assertNoPrivateDirectory(apiLog, diagnostics);
        assertCleanDiagnostics(diagnostics, 'cost center duplicate BOT label');
      } finally {
        await context.close();
      }
    });

    await withScenario({
      name: 'cost-center-without-action-capabilities',
      authPayload: authorizedSessionWithout('navigation.hacienda', 'navigation.ai-assistant'),
    }, async ({ apiLog, baseUrl }) => {
      const { context, page, diagnostics } = await newMonitoredPage(browser, baseUrl, {
        viewport: { width: 1_440, height: 900 },
      });
      try {
        await page.goto(
          `${baseUrl}/estructura?dimension=costCenter&company=101&code=2#organizationExplorer`,
          { waitUntil: 'domcontentloaded' },
        );
        await waitReady(page);
        assert.equal(await page.locator('#organization-explorer-detail-title').innerText(), 'Servicios operativos');
        assert.equal(await page.locator('[data-testid="organization-explorer-directory-action"]').count(), 0);
        assert.equal(await page.locator('[data-testid="organization-explorer-hacienda-action"]').count(), 0);
        assert.equal(await page.locator('[data-testid="organization-explorer-assistant-action"]').count(), 0);
        assert.deepEqual(apiPaths(apiLog), ['/api/auth/me', '/api/grh-organization-analytics']);
        assertNoPrivateDirectory(apiLog, diagnostics);
        assertCleanDiagnostics(diagnostics, 'cost center capability gates');
      } finally {
        await context.close();
      }
    });
  });

  await t.test('keeps an unpublished deep link scoped and empty until an exact row is selected', async () => {
    await withScenario({ name: 'deep-link-invalid', role: 'INTENDENTE' }, async ({ apiLog, baseUrl }) => {
      const { context, page, diagnostics } = await newMonitoredPage(browser, baseUrl, {
        viewport: { width: 390, height: 844 },
        reducedMotion: 'reduce',
      });
      try {
        await page.goto(
          `${baseUrl}/estructura?dimension=organization&code=999#organizationExplorer`,
          { waitUntil: 'domcontentloaded' },
        );
        await waitReady(page);
        const invalid = page.locator('[data-testid="organization-explorer-invalid-link"]');
        await invalid.waitFor({ state: 'visible' });
        assert.match(await invalid.textContent() || '', /no identifica.*no se muestran cifras/isu);
        assert.equal(await page.locator('.structure-explorer__metrics').count(), 0);
        assert.equal(await page.locator('[data-testid="organization-explorer-directory-action"]').count(), 0);
        assert.equal(await page.locator('[data-testid="organization-explorer-hacienda-action"]').count(), 0);
        assert.equal(await page.locator('[data-testid="organization-explorer-assistant-action"]').count(), 0);
        assert.doesNotMatch(await page.locator('[data-testid="organization-explorer-detail"]').innerText(),
          /Servicios Urbanos|800|160/u);

        await page.locator('[data-testid="organization-explorer-option-organization-1"]').click();
        assert.equal(await invalid.count(), 0);
        assert.equal(await page.locator('#organization-explorer-detail-title').innerText(), 'Servicios Urbanos');
        assert.equal(await page.locator('.structure-explorer__metrics > div').count(), 5);
        assert.equal(new URL(page.url()).search, '?dimension=organization&code=1');
        assert.deepEqual(apiPaths(apiLog), ['/api/auth/me', '/api/grh-organization-analytics']);
        assertNoPrivateDirectory(apiLog, diagnostics);
        assertCleanDiagnostics(diagnostics, 'invalid explorer link');
      } finally {
        await context.close();
      }
    });
  });

  await t.test('rejects malformed or unpublished cost-center query shapes without leaking selected detail', async () => {
    await withScenario({ name: 'invalid-cost-center-links', role: 'INTENDENTE' }, async ({ apiLog, baseUrl }) => {
      const { context, page, diagnostics } = await newMonitoredPage(browser, baseUrl, {
        viewport: { width: 320, height: 720 },
        reducedMotion: 'reduce',
      });
      const invalidPaths = [
        '/estructura?dimension=costCenter&code=1#organizationExplorer',
        '/estructura?dimension=costCenter&company=101&code=1&extra=1#organizationExplorer',
        '/estructura?dimension=costCenter&company=101&company=101&code=1#organizationExplorer',
        '/estructura?dimension=costCenter&company=101&code=1',
        '/estructura?dimension=costCenter&company=101&code=999#organizationExplorer',
      ];
      try {
        for (const invalidPath of invalidPaths) {
          await page.goto(`${baseUrl}${invalidPath}`, { waitUntil: 'domcontentloaded' });
          await waitReady(page);
          await page.locator('[data-testid="organization-explorer"]').scrollIntoViewIfNeeded();
          const invalid = page.locator('[data-testid="organization-explorer-invalid-link"]');
          await invalid.waitFor({ state: 'visible' });
          assert.match(await invalid.textContent() || '',
            /no identifica un área de costo.*no se muestran cifras/isu);
          assert.equal(await page.locator(
            '[data-testid="organization-explorer-dimension-costCenter"]',
          ).getAttribute('aria-pressed'), 'true');
          assert.equal(await page.locator('.structure-explorer__metrics').count(), 0);
          assert.equal(await page.locator('[data-testid="cost-center-scope-note"]').count(), 0);
          assert.equal(await page.locator('[data-testid="organization-explorer-directory-action"]').count(), 0);
          assert.equal(await page.locator('[data-testid="organization-explorer-hacienda-action"]').count(), 0);
          assert.equal(await page.locator('[data-testid="organization-explorer-assistant-action"]').count(), 0);
          assert.doesNotMatch(await page.locator('[data-testid="organization-explorer-detail"]').textContent() || '',
            /Servicios operativos|132|15,4%|856/u);
        }

        const requestsBeforeSelection = apiLog.length;
        const firstCostCenter = page.locator('[data-testid="organization-explorer-option-costCenter-101-2"]');
        await firstCostCenter.focus();
        await firstCostCenter.press('Enter');
        assert.equal(await page.locator('[data-testid="organization-explorer-invalid-link"]').count(), 0);
        assert.equal((await page.locator('#organization-explorer-detail-title').textContent())?.trim(),
          'Servicios operativos');
        assert.equal(new URL(page.url()).search, '?dimension=costCenter&company=101&code=2');
        assert.equal(apiLog.length, requestsBeforeSelection);
        assert.equal(apiLog.filter(entry => entry.path === '/api/auth/me').length, invalidPaths.length);
        assert.equal(apiLog.filter(entry => entry.path === '/api/grh-organization-analytics').length,
          invalidPaths.length);
        assertNoPrivateDirectory(apiLog, diagnostics);
        assertCleanDiagnostics(diagnostics, 'invalid cost center links');
      } finally {
        await context.close();
      }
    });
  });

  await t.test('keeps a single suppressed category visible as a non-selectable distribution summary', async () => {
    const analyticsPayload = singleProtectedSectorPayload();
    assert.equal(inspectGrhOrganizationAnalyticsContract(analyticsPayload, {
      expectedSourceSha256: SOURCE_SHA,
      expectedSnapshotAsOf: SNAPSHOT,
    }).ok, true);
    await withScenario({
      name: 'single-protected-sector',
      role: 'INTENDENTE',
      analyticsPayload,
    }, async ({ apiLog, baseUrl }) => {
      const { context, page, diagnostics } = await newMonitoredPage(browser, baseUrl, {
        viewport: { width: 390, height: 844 },
      });
      try {
        await page.goto(
          `${baseUrl}/estructura?dimension=sector&code=1#organizationExplorer`,
          { waitUntil: 'domcontentloaded' },
        );
        await waitReady(page);
        const summary = page.locator('[data-testid="organization-explorer-protected-sector"]');
        assert.match(await summary.textContent(), /Grupo protegido.*1 categoría.*60.*7,5%/isu);
        assert.equal(await summary.locator('button, a').count(), 0);
        assert.deepEqual(apiPaths(apiLog), ['/api/auth/me', '/api/grh-organization-analytics']);
        assertNoPrivateDirectory(apiLog, diagnostics);
        assertCleanDiagnostics(diagnostics, 'single protected sector');
      } finally {
        await context.close();
      }
    });
  });

  await t.test('meets contrast, font, keyboard and overflow gates at 1440, 390 and forced 320', async () => {
    await withScenario({ name: 'visual-matrix', role: 'INTENDENTE' }, async ({ apiLog, baseUrl }) => {
      for (const viewport of [
        { name: 'desktop-dark', width: 1_440, height: 1_000, theme: 'dark' },
        { name: 'mobile-light', width: 390, height: 844, theme: 'light', reducedMotion: 'reduce' },
        {
          name: 'compact-forced',
          width: 320,
          height: 720,
          theme: 'dark',
          reducedMotion: 'reduce',
          forcedColors: 'active',
        },
      ]) {
        const start = apiLog.length;
        const { context, page, diagnostics } = await newMonitoredPage(browser, baseUrl, {
          viewport: { width: viewport.width, height: viewport.height },
          reducedMotion: viewport.reducedMotion ?? 'no-preference',
          forcedColors: viewport.forcedColors ?? 'none',
        });
        try {
          await seedTheme(context, viewport.theme);
          await page.goto(
            `${baseUrl}/estructura?compare=costCenter&leftCompany=101&leftCode=2&rightCompany=101&rightCode=3#costCenterComparator`,
            { waitUntil: 'domcontentloaded' },
          );
          await waitReady(page);
          await page.locator('[data-testid="cost-center-comparison-content"]').waitFor({ state: 'visible' });
          const chartScroll = page.locator('[data-testid="cost-center-comparison-chart-scroll"]');
          await chartScroll.scrollIntoViewIfNeeded();
          const scrollState = await chartScroll.evaluate(node => ({
            before: node.scrollLeft,
            scrollable: node.scrollWidth > node.clientWidth + 1,
          }));
          await chartScroll.focus();
          await chartScroll.press('ArrowRight');
          if (scrollState.scrollable) {
            await page.waitForFunction(({ before }) => {
              const node = document.querySelector('[data-testid="cost-center-comparison-chart-scroll"]');
              return node instanceof HTMLElement && node.scrollLeft > before;
            }, { before: scrollState.before });
          } else {
            assert.equal(await chartScroll.evaluate(node => node.scrollLeft), scrollState.before);
          }
          assert.equal(await chartScroll.evaluate(node => document.activeElement === node), true);
          const audit = await visualAudit(page);
          assert.equal(audit.theme, viewport.theme, viewport.name);
          assert.equal(audit.canonicalTheme, viewport.theme, `${viewport.name} canonical`);
          assert.equal(audit.legacyTheme, viewport.theme, `${viewport.name} synchronized legacy`);
          assert.ok(audit.overflow <= 1, `${viewport.name} overflow=${audit.overflow}`);
          assert.deepEqual(audit.textViolations, [], `${viewport.name} text ${JSON.stringify(audit.textViolations)}`);
          assert.deepEqual(audit.fontViolations, [], `${viewport.name} font ${JSON.stringify(audit.fontViolations)}`);
          assert.deepEqual(audit.boundaryViolations, [], `${viewport.name} controls ${JSON.stringify(audit.boundaryViolations)}`);
          assert.equal(audit.reducedMotion, viewport.reducedMotion === 'reduce', viewport.name);
          assert.equal(audit.forcedColors, viewport.forcedColors === 'active', viewport.name);
          assert.deepEqual(apiPaths(apiLog, start), [
            '/api/auth/me', '/api/grh-organization-analytics', '/api/grh-workforce-finance',
          ]);
          assertNoPrivateDirectory(apiLog.slice(start), diagnostics);
          assertCleanDiagnostics(diagnostics, viewport.name);
          const screenshot = viewport.name === 'desktop-dark'
            ? SCREENSHOTS.desktop
            : viewport.name === 'mobile-light' ? SCREENSHOTS.mobile : SCREENSHOTS.forced;
          await page.screenshot({ path: screenshot, fullPage: true });
        } finally {
          await context.close();
        }
      }
    });
  });

  await t.test('enforces the exact published six-role matrix before private analytics', async () => {
    const matrix = [
      { role: 'TENANT_ADMIN', allowed: true },
      { role: 'INTENDENTE', allowed: true },
      { role: 'CONTADOR', allowed: true },
      { role: 'TENANT_USER', allowed: false },
      { role: 'INSPECTOR', allowed: false },
      { role: 'DEMO', allowed: false },
    ];
    for (const row of matrix) {
      await withScenario({ name: `role-${row.role.toLowerCase()}`, role: row.role }, async ({ apiLog, baseUrl }) => {
        const { context, page, diagnostics } = await newMonitoredPage(browser, baseUrl, {
          viewport: { width: 390, height: 844 },
          reducedMotion: 'reduce',
        });
        try {
          await page.goto(`${baseUrl}/estructura`, { waitUntil: 'domcontentloaded' });
          if (row.allowed) {
            await waitReady(page);
            assert.equal(await page.locator('.structure-kpi').count(), 6, row.role);
            assert.deepEqual(apiPaths(apiLog), ['/api/auth/me', '/api/grh-organization-analytics'], row.role);
          } else {
            await page.waitForURL(`${baseUrl}/inicio.html`);
            await page.waitForSelector('#safe-workspace');
            assert.deepEqual(apiPaths(apiLog), ['/api/auth/me'], row.role);
          }
          assertNoPrivateDirectory(apiLog, diagnostics);
          assertCleanDiagnostics(diagnostics, row.role);
        } finally {
          await context.close();
        }
      });
    }
  });

  await t.test('requires the exact page capability and redirects before the data request', async () => {
    await withScenario({
      name: 'missing-exact-capability',
      role: 'INTENDENTE',
      includeCapability: false,
    }, async ({ apiLog, baseUrl }) => {
      const { context, page, diagnostics } = await newMonitoredPage(browser, baseUrl, {
        viewport: { width: 1_024, height: 768 },
      });
      try {
        await page.goto(`${baseUrl}/estructura`, { waitUntil: 'domcontentloaded' });
        await page.waitForURL(`${baseUrl}/inicio.html`);
        assert.deepEqual(apiPaths(apiLog), ['/api/auth/me']);
        assertNoPrivateDirectory(apiLog, diagnostics);
        assertCleanDiagnostics(diagnostics, 'missing exact capability');
      } finally {
        await context.close();
      }
    });
  });

  await t.test('blocks every figure for header, provenance, privacy and shape mutations', async () => {
    for (const analyticsMode of ['wrong-header', ...Object.keys(CONTRACT_MUTATIONS)]) {
      await withScenario({ name: `mutation-${analyticsMode}`, analyticsMode }, async ({ apiLog, baseUrl }) => {
        const { context, page, diagnostics } = await newMonitoredPage(browser, baseUrl, {
          viewport: { width: 1_024, height: 768 },
        });
        try {
          await page.goto(`${baseUrl}/estructura`, { waitUntil: 'domcontentloaded' });
          await page.waitForSelector('.blocked-state[role="alert"]');
          const blocked = await blockedDiagnostics(page);
          assert.match(blocked.heading, /Sala de situación bloqueada/i, analyticsMode);
          assert.equal(blocked.readyMounted, false, analyticsMode);
          assert.equal(blocked.kpis, 0, analyticsMode);
          assert.equal(blocked.sourceBackedValueLeak, false, analyticsMode);
          assert.equal(blocked.syntheticDemoLanguage, false, analyticsMode);
          assert.deepEqual(apiPaths(apiLog), ['/api/auth/me', '/api/grh-organization-analytics'], analyticsMode);
          assertNoPrivateDirectory(apiLog, diagnostics);
          assertCleanDiagnostics(diagnostics, analyticsMode);
        } finally {
          await context.close();
        }
      });
    }
  });

  await t.test('keeps 403 and 503 empty, then reauthenticates and refetches exactly once on retry', async () => {
    for (const failureMode of ['forbidden', 'unavailable']) {
      await withScenario({
        name: `${failureMode}-retry`,
        analyticsSequence: [failureMode, 'success'],
      }, async ({ apiLog, baseUrl }) => {
        const { context, page, diagnostics } = await newMonitoredPage(browser, baseUrl, {
          viewport: { width: 1_440, height: 900 },
        });
        try {
          await page.goto(`${baseUrl}/estructura`, { waitUntil: 'domcontentloaded' });
          await page.waitForSelector('.blocked-state[role="alert"]');
          let blocked = await blockedDiagnostics(page);
          assert.equal(blocked.readyMounted, false, failureMode);
          assert.equal(blocked.kpis, 0, failureMode);
          assert.equal(blocked.sourceBackedValueLeak, false, failureMode);
          assert.equal(blocked.syntheticDemoLanguage, false, failureMode);
          assert.deepEqual(apiPaths(apiLog), ['/api/auth/me', '/api/grh-organization-analytics']);

          await page.locator('.blocked-state .button--primary').click();
          await waitReady(page);
          assert.equal(await page.locator('.structure-kpi').count(), 6);
          assert.deepEqual(apiPaths(apiLog), [
            '/api/auth/me',
            '/api/grh-organization-analytics',
            '/api/auth/me',
            '/api/grh-organization-analytics',
          ]);
          assertNoPrivateDirectory(apiLog, diagnostics);
          assert.deepEqual(diagnostics.pageErrors, [], failureMode);
          assert.deepEqual(diagnostics.externalRequests, [], failureMode);
          assert.ok(diagnostics.consoleErrors.length <= 1 && diagnostics.consoleErrors.every(message =>
            new RegExp(`Failed to load resource.*${failureMode === 'forbidden' ? '403' : '503'}`, 'i').test(message)),
          `${failureMode} console: ${diagnostics.consoleErrors.join(' | ')}`);
        } finally {
          await context.close();
        }
      });
    }
  });
});
