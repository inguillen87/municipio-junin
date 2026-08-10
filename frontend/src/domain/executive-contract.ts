import type { ExecutiveContract } from './executive-types';

const EXECUTIVE_ENDPOINT = '/api/grh-executive';
const CONTRACT_HEADER = 'x-municontrol-contract';
const EXECUTIVE_SCHEMA_VERSION = 'grh-executive-v2';
const DEFAULT_TIMEOUT_MS = 15_000;
const MAX_TIMEOUT_MS = 60_000;
const PROTECTED_BUCKET = 'Otros (celdas protegidas)';
const AMOUNT_KEYS = [
  'grossWithFamilyAllowancesCents',
  'employeeWithholdingsCents',
  'netPayrollCents',
  'employerContributionsCents',
] as const;

const SHAPES = {
  executive: [
    'schemaVersion',
    'policyVersion',
    'source',
    'privacy',
    'workforce',
    'compensation',
    'absence',
    'leave',
    'movements',
  ],
  source: ['canonicalSystem', 'sourceFile', 'sourceSha256', 'snapshotAsOf', 'realtime'],
  privacy: ['audience', 'interactiveThreshold', 'sensitiveThreshold', 'portableThreshold', 'protectedBucketLabel'],
  workforce: ['definition', 'referencePeriod', 'payrollParticipants', 'bySector', 'byCostCenter', 'byAgreement'],
  ranking: ['threshold', 'totalParticipants', 'participantDisplay', 'privacyStatus', 'rows'],
  rankingRow: ['companyCode', 'sourceCode', 'label', 'participants', 'participantDisplay', 'sharePct', 'privacyStatus'],
  compensation: ['currency', 'amountUnit', 'metricStatus', 'series'],
  monetaryRow: ['period', 'participantCount', 'participantDisplay', 'privacyStatus', 'amounts'],
  sensitiveDomain: ['sourceTable', 'metric', 'series'],
  sensitiveRow: ['period', 'value', 'participantCount', 'participantDisplay', 'privacyStatus'],
} as const;

const SAFE_MESSAGES = {
  GRH_CLIENT_UNAVAILABLE: 'El cliente autenticado de datos no esta disponible.',
  GRH_CLIENT_UNSUPPORTED: 'El navegador no admite la carga segura de datos.',
  GRH_OPTIONS_INVALID: 'La configuracion de carga GRH no es valida.',
  GRH_REQUEST_TIMEOUT: 'La consulta GRH excedio el tiempo permitido.',
  GRH_REQUEST_ABORTED: 'La consulta GRH fue cancelada.',
  GRH_REQUEST_FAILED: 'No se pudo consultar la fuente GRH.',
  GRH_HTTP_ERROR: 'La fuente GRH respondio con un estado no exitoso.',
  GRH_RESPONSE_INVALID: 'La respuesta GRH no es valida.',
  GRH_RESPONSE_NOT_JSON: 'La fuente GRH no entrego un contrato JSON.',
  GRH_RESPONSE_INVALID_JSON: 'La fuente GRH entrego un JSON invalido.',
  GRH_RESPONSE_CONTRACT_MISMATCH: 'La fuente GRH no declaro el contrato ejecutivo esperado.',
  GRH_EXECUTIVE_CONTRACT_INVALID: 'El contrato ejecutivo GRH fue rechazado.',
} as const;

export type ExecutiveContractErrorCode = keyof typeof SAFE_MESSAGES;

export class ExecutiveContractError extends Error {
  readonly code: ExecutiveContractErrorCode;
  readonly status: number;

  constructor(code: ExecutiveContractErrorCode, status?: number) {
    super(SAFE_MESSAGES[code]);
    this.name = 'ExecutiveContractError';
    this.code = code;
    this.status = validStatus(status) ? status : 0;
  }
}

export interface FetchExecutiveOptions {
  readonly timeoutMs?: number;
  readonly signal?: AbortSignal | null;
}

type UnknownRecord = Record<string, unknown>;

function validStatus(value: unknown): value is number {
  return Number.isInteger(value) && (value as number) >= 100 && (value as number) <= 599;
}

function fail(code: ExecutiveContractErrorCode, status?: number): never {
  throw new ExecutiveContractError(code, status);
}

function record(value: unknown): value is UnknownRecord {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function exactKeys(value: unknown, keys: readonly string[]): value is UnknownRecord {
  if (!record(value)) return false;
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  return actual.length === expected.length && actual.every((key, index) => key === expected[index]);
}

function nonNegativeInteger(value: unknown): value is number {
  return Number.isSafeInteger(value) && (value as number) >= 0;
}

function positiveInteger(value: unknown): value is number {
  return Number.isSafeInteger(value) && (value as number) > 0;
}

function percentage(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 100;
}

function closeTo(left: unknown, right: unknown, tolerance = 0.0001): boolean {
  return typeof left === 'number' && Number.isFinite(left) &&
    typeof right === 'number' && Number.isFinite(right) && Math.abs(left - right) <= tolerance;
}

function shortText(value: unknown, maxLength: number): value is string {
  if (typeof value !== 'string' || value.length === 0 || value.length > maxLength) return false;
  for (let index = 0; index < value.length; index += 1) {
    const codeUnit = value.charCodeAt(index);
    if (codeUnit <= 31 || codeUnit === 127) return false;
  }
  return true;
}

function safeCode(value: unknown): boolean {
  return nonNegativeInteger(value) || (
    shortText(value, 64) && /^[A-Za-z0-9._/-]+$/.test(value)
  );
}

function validSource(value: unknown): value is UnknownRecord {
  return exactKeys(value, SHAPES.source) && shortText(value.canonicalSystem, 80) &&
    /grh/i.test(value.canonicalSystem) &&
    typeof value.sourceFile === 'string' && /^grh_junin\.[a-z0-9._-]+\.sql\.gz$/i.test(value.sourceFile) &&
    typeof value.sourceSha256 === 'string' && /^[0-9a-f]{64}$/.test(value.sourceSha256) &&
    typeof value.snapshotAsOf === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value.snapshotAsOf) &&
    Number.isFinite(Date.parse(`${value.snapshotAsOf}T00:00:00Z`)) && value.realtime === false;
}

function expectedShare(participants: number, totalParticipants: number): number {
  return Number(((participants / totalParticipants) * 100).toFixed(4));
}

function validRanking(value: unknown, totalParticipants: number, threshold: number): boolean {
  if (!exactKeys(value, SHAPES.ranking) || value.threshold !== threshold ||
      value.totalParticipants !== totalParticipants || value.participantDisplay !== String(totalParticipants) ||
      !['released', 'partially_suppressed'].includes(String(value.privacyStatus)) ||
      !Array.isArray(value.rows) || value.rows.length === 0 || value.rows.length > 101) return false;

  let sum = 0;
  let protectedRows = 0;
  const identities = new Set<string>();
  for (const row of value.rows) {
    if (!exactKeys(row, SHAPES.rankingRow) || !nonNegativeInteger(row.participants) ||
        row.participantDisplay !== String(row.participants) || !percentage(row.sharePct) ||
        !closeTo(row.sharePct, expectedShare(row.participants, totalParticipants))) return false;

    if (row.privacyStatus === 'released') {
      if (!safeCode(row.companyCode) || !safeCode(row.sourceCode) || !shortText(row.label, 256) ||
          row.label === PROTECTED_BUCKET || row.participants < threshold) return false;
      const identity = `${String(row.companyCode)}:${String(row.sourceCode)}:${row.label}`;
      if (identities.has(identity)) return false;
      identities.add(identity);
    } else if (row.privacyStatus === 'protected_aggregate') {
      protectedRows += 1;
      if (row.companyCode !== null || row.sourceCode !== null || row.label !== PROTECTED_BUCKET ||
          row.participants < threshold) return false;
    } else {
      return false;
    }
    sum += row.participants;
  }

  return sum === totalParticipants && protectedRows <= 1 &&
    value.privacyStatus === (protectedRows === 0 ? 'released' : 'partially_suppressed');
}

function validMonetarySeries(value: unknown): boolean {
  if (!Array.isArray(value) || value.length === 0 || value.length > 1000) return false;
  const periods = new Set<string>();
  for (const row of value) {
    if (!exactKeys(row, SHAPES.monetaryRow) || !exactKeys(row.amounts, AMOUNT_KEYS)) return false;
    const amounts = row.amounts;
    const periodIsSafe = typeof row.period === 'string' && /^\d{4}-(?:0[1-9]|1[0-2])$/.test(row.period);
    if (row.period !== null && (!periodIsSafe || periods.has(row.period as string))) return false;
    if (row.period !== null) periods.add(row.period as string);

    if (row.privacyStatus === 'released') {
      if (!periodIsSafe || !nonNegativeInteger(row.participantCount) || row.participantCount < 10 ||
          row.participantDisplay !== String(row.participantCount) ||
          !AMOUNT_KEYS.every((key) => nonNegativeInteger(amounts[key]))) return false;
    } else if (row.privacyStatus === 'suppressed') {
      if (row.participantCount !== null || row.participantDisplay !== '<10' ||
          !AMOUNT_KEYS.every((key) => amounts[key] === null)) return false;
    } else {
      return false;
    }
  }
  return true;
}

function validSensitiveDomain(value: unknown, expectedTable: string): boolean {
  if (!exactKeys(value, SHAPES.sensitiveDomain) || value.sourceTable !== expectedTable ||
      value.metric !== 'valid_rows_by_year' || !Array.isArray(value.series) || value.series.length > 200) return false;
  const periods = new Set<string>();
  for (const row of value.series) {
    if (!exactKeys(row, SHAPES.sensitiveRow)) return false;
    const periodIsSafe = typeof row.period === 'string' && /^\d{4}$/.test(row.period);
    if (row.period !== null && (!periodIsSafe || periods.has(row.period as string))) return false;
    if (row.period !== null) periods.add(row.period as string);

    if (row.privacyStatus === 'released') {
      if (!periodIsSafe || !nonNegativeInteger(row.value) || !nonNegativeInteger(row.participantCount) ||
          row.participantCount < 10 || row.participantCount > row.value ||
          row.participantDisplay !== String(row.participantCount)) return false;
    } else if (row.privacyStatus === 'suppressed') {
      if (row.value !== null || row.participantCount !== null || row.participantDisplay !== '<10') return false;
    } else {
      return false;
    }
  }
  return true;
}

function validExecutive(value: unknown): value is ExecutiveContract {
  if (!exactKeys(value, SHAPES.executive) || value.schemaVersion !== 'grh-executive-v2' ||
      value.policyVersion !== 'grh-small-cell-v1' || !validSource(value.source)) return false;

  const privacy = value.privacy;
  if (!exactKeys(privacy, SHAPES.privacy) || privacy.audience !== 'interactive' ||
      privacy.interactiveThreshold !== 5 || privacy.sensitiveThreshold !== 10 ||
      privacy.portableThreshold !== 10 || privacy.protectedBucketLabel !== PROTECTED_BUCKET) return false;

  const workforce = value.workforce;
  if (!exactKeys(workforce, SHAPES.workforce) || !shortText(workforce.definition, 1000) ||
      typeof workforce.referencePeriod !== 'string' || !/^\d{4}-(?:0[1-9]|1[0-2])$/.test(workforce.referencePeriod) ||
      !positiveInteger(workforce.payrollParticipants)) return false;
  if (!validRanking(workforce.bySector, workforce.payrollParticipants, 5) ||
      !validRanking(workforce.byCostCenter, workforce.payrollParticipants, 5) ||
      !validRanking(workforce.byAgreement, workforce.payrollParticipants, 5)) return false;

  const compensation = value.compensation;
  if (!exactKeys(compensation, SHAPES.compensation) || compensation.currency !== 'not_declared_in_source' ||
      compensation.amountUnit !== 'source_currency_cents' ||
      compensation.metricStatus !== 'calculation_control_not_bank_disbursement' ||
      !validMonetarySeries(compensation.series)) return false;

  return validSensitiveDomain(value.absence, 'ausencia') &&
    validSensitiveDomain(value.leave, 'licencia') &&
    validSensitiveDomain(value.movements, 'legamov');
}

export function validateExecutiveContract(value: unknown): value is ExecutiveContract {
  try {
    return validExecutive(value);
  } catch {
    return false;
  }
}

function deepFreeze<T>(value: T, seen = new Set<object>()): T {
  if (!value || typeof value !== 'object') return value;
  const objectValue = value as object;
  if (seen.has(objectValue)) return value;
  seen.add(objectValue);
  const keyedValue = value as Record<string, unknown>;
  for (const key of Object.keys(value)) {
    deepFreeze(keyedValue[key], seen);
  }
  return Object.freeze(value);
}

function normalizeOptions(options?: FetchExecutiveOptions): Required<FetchExecutiveOptions> {
  if (options === undefined) return { timeoutMs: DEFAULT_TIMEOUT_MS, signal: null };
  const candidate: unknown = options;
  if (!record(candidate) || !Object.keys(candidate).every((key) => key === 'timeoutMs' || key === 'signal')) {
    fail('GRH_OPTIONS_INVALID');
  }
  const timeoutValue = candidate.timeoutMs === undefined ? DEFAULT_TIMEOUT_MS : candidate.timeoutMs;
  if (typeof timeoutValue !== 'number' || !Number.isSafeInteger(timeoutValue) ||
      timeoutValue < 1 || timeoutValue > MAX_TIMEOUT_MS) fail('GRH_OPTIONS_INVALID');
  const signal = candidate.signal === undefined ? null : candidate.signal;
  if (signal !== null && (!record(signal) || typeof signal.aborted !== 'boolean' ||
      typeof signal.addEventListener !== 'function' || typeof signal.removeEventListener !== 'function')) {
    fail('GRH_OPTIONS_INVALID');
  }
  return { timeoutMs: timeoutValue, signal: signal as AbortSignal | null };
}

interface RequestControl {
  readonly signal: AbortSignal;
  readonly timedOut: () => boolean;
  readonly callerAborted: () => boolean;
  readonly cleanup: () => void;
}

function createControl(options?: FetchExecutiveOptions): RequestControl {
  if (typeof AbortController !== 'function' || typeof setTimeout !== 'function' ||
      typeof clearTimeout !== 'function') fail('GRH_CLIENT_UNSUPPORTED');
  const normalized = normalizeOptions(options);
  const controller = new AbortController();
  let timedOut = false;
  let callerAborted = false;
  const external = normalized.signal;
  const onExternalAbort = () => {
    callerAborted = true;
    if (!controller.signal.aborted) controller.abort();
  };
  if (external) {
    if (external.aborted) onExternalAbort();
    else external.addEventListener('abort', onExternalAbort, { once: true });
  }
  const timer = setTimeout(() => {
    timedOut = true;
    if (!controller.signal.aborted) controller.abort();
  }, normalized.timeoutMs);
  return {
    signal: controller.signal,
    timedOut: () => timedOut,
    callerAborted: () => callerAborted,
    cleanup: () => {
      clearTimeout(timer);
      if (external) external.removeEventListener('abort', onExternalAbort);
    },
  };
}

function mapFailure(error: unknown, control: RequestControl): ExecutiveContractError {
  if (error instanceof ExecutiveContractError) return error;
  if (control.timedOut()) return new ExecutiveContractError('GRH_REQUEST_TIMEOUT', 408);
  if (control.callerAborted()) return new ExecutiveContractError('GRH_REQUEST_ABORTED');
  const status = record(error) && validStatus(error.status) ? error.status : undefined;
  return new ExecutiveContractError('GRH_REQUEST_FAILED', status);
}

function jsonContentType(response: Response): boolean {
  if (!response.headers || typeof response.headers.get !== 'function') return false;
  const value = response.headers.get('content-type');
  return typeof value === 'string' &&
    /^application\/(?:[a-z0-9!#$&^_.+-]+\+)?json(?:\s*;|\s*$)/i.test(value);
}

function expectedContractHeader(response: Response): boolean {
  return response.headers.get(CONTRACT_HEADER) === EXECUTIVE_SCHEMA_VERSION;
}

interface AuthenticatedClient {
  fetch(input: string, init: RequestInit): Promise<Response>;
}

function authenticatedClient(): AuthenticatedClient {
  if (typeof window === 'undefined') fail('GRH_CLIENT_UNAVAILABLE');
  const candidate = (window as unknown as { MuniAuth?: unknown }).MuniAuth;
  if (!record(candidate) || typeof candidate.fetch !== 'function') fail('GRH_CLIENT_UNAVAILABLE');
  return candidate as unknown as AuthenticatedClient;
}

async function requestContract(signal: AbortSignal): Promise<ExecutiveContract> {
  const response = await authenticatedClient().fetch(EXECUTIVE_ENDPOINT, {
    method: 'GET',
    cache: 'no-store',
    redirect: 'error',
    headers: { Accept: 'application/json' },
    signal,
  });
  if (!response || !validStatus(response.status) || typeof response.ok !== 'boolean') {
    fail('GRH_RESPONSE_INVALID', 502);
  }
  if (!response.ok || response.status < 200 || response.status >= 300) {
    fail('GRH_HTTP_ERROR', response.status);
  }
  if (!jsonContentType(response)) fail('GRH_RESPONSE_NOT_JSON', 502);
  if (!expectedContractHeader(response)) fail('GRH_RESPONSE_CONTRACT_MISMATCH', 502);
  if (typeof response.json !== 'function') fail('GRH_RESPONSE_INVALID', 502);

  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    fail('GRH_RESPONSE_INVALID_JSON', 502);
  }
  if (!validateExecutiveContract(payload)) fail('GRH_EXECUTIVE_CONTRACT_INVALID', 502);
  return deepFreeze(payload);
}

export async function fetchExecutiveContract(options?: FetchExecutiveOptions): Promise<ExecutiveContract> {
  const control = createControl(options);
  try {
    if (control.callerAborted()) fail('GRH_REQUEST_ABORTED');
    return await requestContract(control.signal);
  } catch (error) {
    throw mapFailure(error, control);
  } finally {
    control.cleanup();
  }
}
