import type { QualityContract } from './quality-types';

const QUALITY_ENDPOINT = '/api/grh-quality';
const DEFAULT_TIMEOUT_MS = 15_000;
const MAX_TIMEOUT_MS = 60_000;
const QUALITY_SCOPE = 'governed_aggregate_extract_not_fitness_of_every_raw_grh_table';

const TEMPORAL_DOMAINS = ['ausencia', 'calculo', 'legamov', 'licencia', 'totpago'] as const;
const REFERENTIAL_FACTS = ['calculo', 'legamov', 'ausencia', 'licencia'] as const;
const QUALITY_COMPONENTS = [
  'temporalValidity',
  'referentialIntegrity',
  'payrollReconciliation',
  'legajoKeyUniqueness',
] as const;

const SHAPES = {
  quality: [
    'schemaVersion',
    'source',
    'lineage',
    'privacy',
    'inventory',
    'quality',
    'temporal',
    'referential',
    'reconciliation',
  ],
  qualitySource: [
    'canonicalSystem',
    'sourceFile',
    'sourceSha256',
    'snapshotAsOf',
    'compressedSizeBytes',
    'realtime',
    'excludedSources',
  ],
  lineage: [
    'profileSchemaVersion',
    'semanticSchemaVersion',
    'profileGeneratedAt',
    'semanticGeneratedAt',
  ],
  qualityPrivacy: [
    'aggregateOnly',
    'containsPii',
    'employeeIdentifiersExported',
    'rawRowsExported',
    'categoricalLabelsExported',
    'cellCodesExported',
    'monetarySeriesExported',
  ],
  inventory: ['all', 'focal', 'remainder'],
  inventoryGroup: ['totalTables', 'nonEmptyTables', 'emptyTables', 'totalRows'],
  qualityBody: ['score', 'scope', 'components', 'risks'],
  component: ['score', 'weightPct'],
  risks: [
    'rawSourceContainsSensitivePii',
    'historicalSnapshotNotRealtime',
    'currencyNotDeclaredInSource',
    'legacyImportErrorRows',
    'quarantinedTemporalRows',
    'totpagoCrossSourceMismatch',
    'calculationControlAnomalousPeriods',
    'latestCalculationControlWithinRoundingTolerance',
    'suspiciousTextEncodingLabelCount',
  ],
  temporal: [
    'rows',
    'validRows',
    'quarantineRows',
    'validRatePct',
    'dateMonthMismatchRows',
    'quarantineReasonOccurrences',
    'domains',
  ],
  temporalDomain: [
    'rows',
    'validRows',
    'quarantineRows',
    'validRatePct',
    'validPeriods',
    'firstValidPeriod',
    'lastValidPeriod',
    'firstValidYear',
    'lastValidYear',
    'dateMonthMismatchRows',
    'quarantineReasonOccurrences',
  ],
  referential: ['legajo', 'facts'],
  legajo: ['rows', 'uniqueKeys', 'uniquenessPct'],
  fact: [
    'rows',
    'matchedRows',
    'orphanRows',
    'joinIntegrityPct',
    'distinctEmployeeKeys',
    'validMatchedEmployeeKeys',
    'employeeCoveragePct',
  ],
  reconciliation: [
    'status',
    'totpagoDiagnosticStatus',
    'metricStatus',
    'currencyStatus',
    'toleranceCents',
    'calculationRuns',
    'totpagoRuns',
    'unionRuns',
    'matchedRuns',
    'fullyReconciledRuns',
    'runCoveragePct',
    'metricExactRatePct',
    'valueAgreementPct',
    'scorePct',
    'absoluteVarianceCents',
  ],
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
  GRH_QUALITY_CONTRACT_INVALID: 'El contrato de calidad GRH fue rechazado.',
} as const;

export type QualityContractErrorCode = keyof typeof SAFE_MESSAGES;

export class QualityContractError extends Error {
  readonly code: QualityContractErrorCode;
  readonly status: number;

  constructor(code: QualityContractErrorCode, status?: number) {
    super(SAFE_MESSAGES[code]);
    this.name = 'QualityContractError';
    this.code = code;
    this.status = validStatus(status) ? status : 0;
  }
}

export interface FetchQualityOptions {
  readonly timeoutMs?: number;
  readonly signal?: AbortSignal | null;
}

type UnknownRecord = Record<string, unknown>;

function validStatus(value: unknown): value is number {
  return Number.isInteger(value) && (value as number) >= 100 && (value as number) <= 599;
}

function fail(code: QualityContractErrorCode, status?: number): never {
  throw new QualityContractError(code, status);
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
    typeof right === 'number' && Number.isFinite(right) &&
    Math.abs(left - right) <= tolerance;
}

function calculatedPercentage(numerator: number, denominator: number): number {
  return denominator === 0 ? 0 : Number(((numerator / denominator) * 100).toFixed(4));
}

function shortText(value: unknown, maxLength: number): value is string {
  if (typeof value !== 'string' || value.length === 0 || value.length > maxLength) return false;
  for (let index = 0; index < value.length; index += 1) {
    const codeUnit = value.charCodeAt(index);
    if (codeUnit <= 31 || codeUnit === 127) return false;
  }
  return true;
}

function validSource(source: unknown): source is UnknownRecord {
  return exactKeys(source, SHAPES.qualitySource) &&
    shortText(source.canonicalSystem, 80) && /grh/i.test(source.canonicalSystem) &&
    typeof source.sourceFile === 'string' && /^grh_junin\.[a-z0-9._-]+\.sql\.gz$/i.test(source.sourceFile) &&
    typeof source.sourceSha256 === 'string' && /^[0-9a-f]{64}$/.test(source.sourceSha256) &&
    typeof source.snapshotAsOf === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(source.snapshotAsOf) &&
    Number.isFinite(Date.parse(`${source.snapshotAsOf}T00:00:00Z`)) &&
    source.realtime === false;
}

function validInventoryGroup(group: unknown): group is UnknownRecord {
  if (!exactKeys(group, SHAPES.inventoryGroup)) return false;
  if (!SHAPES.inventoryGroup.every((field) => nonNegativeInteger(group[field]))) return false;

  const totalTables = group.totalTables as number;
  const nonEmptyTables = group.nonEmptyTables as number;
  const emptyTables = group.emptyTables as number;
  const totalRows = group.totalRows as number;
  return totalTables === nonEmptyTables + emptyTables &&
    totalRows >= nonEmptyTables &&
    ((totalRows === 0) === (nonEmptyTables === 0));
}

function validTemporalDomain(value: unknown): value is UnknownRecord {
  if (!exactKeys(value, SHAPES.temporalDomain)) return false;
  const integerFields = [
    'rows',
    'validRows',
    'quarantineRows',
    'validPeriods',
    'firstValidYear',
    'lastValidYear',
    'dateMonthMismatchRows',
    'quarantineReasonOccurrences',
  ] as const;
  if (!integerFields.every((field) => nonNegativeInteger(value[field]))) return false;

  const rows = value.rows as number;
  const validRows = value.validRows as number;
  const quarantineRows = value.quarantineRows as number;
  const dateMonthMismatchRows = value.dateMonthMismatchRows as number;
  const quarantineReasonOccurrences = value.quarantineReasonOccurrences as number;
  const firstValidYear = value.firstValidYear as number;
  const lastValidYear = value.lastValidYear as number;

  return rows > 0 && rows === validRows + quarantineRows &&
    percentage(value.validRatePct) &&
    closeTo(value.validRatePct, calculatedPercentage(validRows, rows)) &&
    dateMonthMismatchRows <= rows && quarantineReasonOccurrences >= quarantineRows &&
    typeof value.firstValidPeriod === 'string' && /^\d{4}-(?:0[1-9]|1[0-2])$/.test(value.firstValidPeriod) &&
    typeof value.lastValidPeriod === 'string' && /^\d{4}-(?:0[1-9]|1[0-2])$/.test(value.lastValidPeriod) &&
    value.firstValidPeriod <= value.lastValidPeriod &&
    firstValidYear === Number(value.firstValidPeriod.slice(0, 4)) &&
    lastValidYear === Number(value.lastValidPeriod.slice(0, 4)) &&
    firstValidYear <= lastValidYear;
}

function validReferentialFact(value: unknown, uniqueKeys: number): value is UnknownRecord {
  if (!exactKeys(value, SHAPES.fact)) return false;
  const integerFields = [
    'rows',
    'matchedRows',
    'orphanRows',
    'distinctEmployeeKeys',
    'validMatchedEmployeeKeys',
  ] as const;
  if (!integerFields.every((field) => nonNegativeInteger(value[field]))) return false;

  const rows = value.rows as number;
  const matchedRows = value.matchedRows as number;
  const orphanRows = value.orphanRows as number;
  const distinctEmployeeKeys = value.distinctEmployeeKeys as number;
  const validMatchedEmployeeKeys = value.validMatchedEmployeeKeys as number;

  return rows > 0 && rows === matchedRows + orphanRows &&
    distinctEmployeeKeys <= uniqueKeys && validMatchedEmployeeKeys <= distinctEmployeeKeys &&
    percentage(value.joinIntegrityPct) &&
    closeTo(value.joinIntegrityPct, calculatedPercentage(matchedRows, rows)) &&
    percentage(value.employeeCoveragePct) &&
    closeTo(value.employeeCoveragePct, calculatedPercentage(validMatchedEmployeeKeys, uniqueKeys));
}

function validIsoTimestamp(value: unknown): value is string {
  return typeof value === 'string' &&
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(value) &&
    Number.isFinite(Date.parse(value));
}

function validReconciliation(value: unknown): value is UnknownRecord {
  if (!exactKeys(value, SHAPES.reconciliation) ||
      !['reconciled', 'material_differences_detected'].includes(String(value.status)) ||
      value.totpagoDiagnosticStatus !== 'not_cross_source_reconciled' ||
      value.metricStatus !== 'calculation_control_not_bank_disbursement' ||
      value.currencyStatus !== 'not_declared_in_source') return false;

  const integerFields = [
    'toleranceCents',
    'calculationRuns',
    'totpagoRuns',
    'unionRuns',
    'matchedRuns',
    'fullyReconciledRuns',
    'absoluteVarianceCents',
  ] as const;
  const rateFields = ['runCoveragePct', 'metricExactRatePct', 'valueAgreementPct', 'scorePct'] as const;
  if (!integerFields.every((field) => nonNegativeInteger(value[field])) ||
      !rateFields.every((field) => percentage(value[field]))) return false;

  const calculationRuns = value.calculationRuns as number;
  const totpagoRuns = value.totpagoRuns as number;
  const unionRuns = value.unionRuns as number;
  const matchedRuns = value.matchedRuns as number;
  const fullyReconciledRuns = value.fullyReconciledRuns as number;
  const runCoveragePct = value.runCoveragePct as number;
  const metricExactRatePct = value.metricExactRatePct as number;
  const valueAgreementPct = value.valueAgreementPct as number;
  const scorePct = value.scorePct as number;
  const expectedScore = Number(((runCoveragePct + metricExactRatePct + valueAgreementPct) / 3).toFixed(4));

  return unionRuns === calculationRuns + totpagoRuns - matchedRuns &&
    matchedRuns <= calculationRuns && matchedRuns <= totpagoRuns &&
    fullyReconciledRuns <= matchedRuns &&
    closeTo(runCoveragePct, calculatedPercentage(matchedRuns, unionRuns)) &&
    closeTo(scorePct, expectedScore) &&
    value.status === (scorePct === 100 ? 'reconciled' : 'material_differences_detected');
}

function validQualityScore(value: unknown, data: UnknownRecord): value is UnknownRecord {
  if (!exactKeys(value, SHAPES.qualityBody) || !percentage(value.score) ||
      value.scope !== QUALITY_SCOPE || !exactKeys(value.components, QUALITY_COMPONENTS) ||
      !exactKeys(value.risks, SHAPES.risks)) return false;

  let weight = 0;
  let score = 0;
  for (const key of QUALITY_COMPONENTS) {
    const component = value.components[key];
    if (!exactKeys(component, SHAPES.component) || !percentage(component.score) ||
        !percentage(component.weightPct)) return false;
    weight += component.weightPct;
    score += component.score * component.weightPct / 100;
  }
  if (!closeTo(weight, 100, 0.000001) ||
      !closeTo(value.score, Number(score.toFixed(2)), 0.001)) return false;

  const risks = value.risks;
  const booleanRisks = [
    'rawSourceContainsSensitivePii',
    'historicalSnapshotNotRealtime',
    'currencyNotDeclaredInSource',
    'totpagoCrossSourceMismatch',
    'latestCalculationControlWithinRoundingTolerance',
  ] as const;
  const countRisks = [
    'legacyImportErrorRows',
    'quarantinedTemporalRows',
    'calculationControlAnomalousPeriods',
    'suspiciousTextEncodingLabelCount',
  ] as const;
  if (!booleanRisks.every((field) => typeof risks[field] === 'boolean') ||
      !countRisks.every((field) => nonNegativeInteger(risks[field]))) return false;

  const source = data.source as UnknownRecord;
  const reconciliation = data.reconciliation as UnknownRecord;
  const temporal = data.temporal as UnknownRecord;
  const temporalDomains = temporal.domains as UnknownRecord;
  const calculo = temporalDomains.calculo as UnknownRecord;
  const inventory = data.inventory as UnknownRecord;
  const inventoryAll = inventory.all as UnknownRecord;

  return risks.rawSourceContainsSensitivePii === true &&
    risks.historicalSnapshotNotRealtime === !source.realtime &&
    risks.currencyNotDeclaredInSource === (reconciliation.currencyStatus === 'not_declared_in_source') &&
    risks.quarantinedTemporalRows === temporal.quarantineRows &&
    risks.totpagoCrossSourceMismatch === (reconciliation.status === 'material_differences_detected') &&
    (risks.legacyImportErrorRows as number) <= (inventoryAll.totalRows as number) &&
    (risks.calculationControlAnomalousPeriods as number) <= (calculo.validPeriods as number);
}

function validQuality(value: unknown): value is QualityContract {
  if (!exactKeys(value, SHAPES.quality) || value.schemaVersion !== 'grh-quality-v1' ||
      !validSource(value.source) || !positiveInteger(value.source.compressedSizeBytes) ||
      !Array.isArray(value.source.excludedSources) || value.source.excludedSources.length !== 1 ||
      value.source.excludedSources[0] !== 'personas_junin') return false;

  const lineage = value.lineage;
  if (!exactKeys(lineage, SHAPES.lineage) || lineage.profileSchemaVersion !== 'grh-profile-v1' ||
      typeof lineage.semanticSchemaVersion !== 'string' ||
      !/^grh-semantic-v[1-9]\d*$/.test(lineage.semanticSchemaVersion) ||
      !validIsoTimestamp(lineage.profileGeneratedAt) ||
      !validIsoTimestamp(lineage.semanticGeneratedAt)) return false;

  const privacy = value.privacy;
  if (!exactKeys(privacy, SHAPES.qualityPrivacy) || privacy.aggregateOnly !== true ||
      privacy.containsPii !== false || privacy.employeeIdentifiersExported !== false ||
      privacy.rawRowsExported !== false || privacy.categoricalLabelsExported !== false ||
      privacy.cellCodesExported !== false || privacy.monetarySeriesExported !== false) return false;

  const inventory = value.inventory;
  if (!exactKeys(inventory, SHAPES.inventory) || !validInventoryGroup(inventory.all) ||
      !validInventoryGroup(inventory.focal) || !validInventoryGroup(inventory.remainder)) return false;
  for (const field of SHAPES.inventoryGroup) {
    if (inventory.all[field] !== (inventory.focal[field] as number) + (inventory.remainder[field] as number)) {
      return false;
    }
  }
  if (!positiveInteger(inventory.all.totalTables) || !positiveInteger(inventory.all.totalRows) ||
      !positiveInteger(inventory.focal.totalTables) || !positiveInteger(inventory.focal.totalRows)) return false;

  const temporal = value.temporal;
  if (!exactKeys(temporal, SHAPES.temporal) || !exactKeys(temporal.domains, TEMPORAL_DOMAINS)) return false;
  const temporalTotals: Record<'rows' | 'validRows' | 'quarantineRows' | 'dateMonthMismatchRows' | 'quarantineReasonOccurrences', number> = {
    rows: 0,
    validRows: 0,
    quarantineRows: 0,
    dateMonthMismatchRows: 0,
    quarantineReasonOccurrences: 0,
  };
  for (const key of TEMPORAL_DOMAINS) {
    const domain = temporal.domains[key];
    if (!validTemporalDomain(domain)) return false;
    for (const field of Object.keys(temporalTotals) as Array<keyof typeof temporalTotals>) {
      temporalTotals[field] += domain[field] as number;
    }
  }
  for (const field of Object.keys(temporalTotals) as Array<keyof typeof temporalTotals>) {
    if (temporal[field] !== temporalTotals[field]) return false;
  }
  if (!percentage(temporal.validRatePct) ||
      !closeTo(temporal.validRatePct, calculatedPercentage(temporal.validRows as number, temporal.rows as number)) ||
      (temporal.rows as number) > inventory.focal.totalRows) return false;

  const referential = value.referential;
  if (!exactKeys(referential, SHAPES.referential) || !exactKeys(referential.legajo, SHAPES.legajo) ||
      !positiveInteger(referential.legajo.rows) || !nonNegativeInteger(referential.legajo.uniqueKeys) ||
      referential.legajo.uniqueKeys > referential.legajo.rows ||
      !percentage(referential.legajo.uniquenessPct) ||
      !closeTo(
        referential.legajo.uniquenessPct,
        calculatedPercentage(referential.legajo.uniqueKeys, referential.legajo.rows),
      ) || !exactKeys(referential.facts, REFERENTIAL_FACTS)) return false;
  for (const key of REFERENTIAL_FACTS) {
    if (!validReferentialFact(referential.facts[key], referential.legajo.uniqueKeys)) return false;
  }

  return validReconciliation(value.reconciliation) && validQualityScore(value.quality, value);
}

export function validateQualityContract(value: unknown): value is QualityContract {
  try {
    return validQuality(value);
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
  for (const key of Object.keys(keyedValue)) deepFreeze(keyedValue[key], seen);
  return Object.freeze(value);
}

function normalizeOptions(options?: FetchQualityOptions): Required<FetchQualityOptions> {
  if (options === undefined) return { timeoutMs: DEFAULT_TIMEOUT_MS, signal: null };
  const candidate: unknown = options;
  if (!record(candidate) || !Object.keys(candidate).every((key) => key === 'timeoutMs' || key === 'signal')) {
    fail('GRH_OPTIONS_INVALID');
  }
  const timeoutValue = candidate.timeoutMs === undefined ? DEFAULT_TIMEOUT_MS : candidate.timeoutMs;
  if (typeof timeoutValue !== 'number' || !Number.isSafeInteger(timeoutValue) ||
      timeoutValue < 1 || timeoutValue > MAX_TIMEOUT_MS) {
    fail('GRH_OPTIONS_INVALID');
  }
  const timeoutMs = timeoutValue;
  const signal = candidate.signal === undefined ? null : candidate.signal;
  if (signal !== null && (!record(signal) || typeof signal.aborted !== 'boolean' ||
      typeof signal.addEventListener !== 'function' || typeof signal.removeEventListener !== 'function')) {
    fail('GRH_OPTIONS_INVALID');
  }
  return { timeoutMs, signal: signal as AbortSignal | null };
}

interface RequestControl {
  readonly signal: AbortSignal;
  readonly timedOut: () => boolean;
  readonly callerAborted: () => boolean;
  readonly cleanup: () => void;
}

function createControl(options?: FetchQualityOptions): RequestControl {
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

function mapFailure(error: unknown, control: RequestControl): QualityContractError {
  if (error instanceof QualityContractError) return error;
  if (control.timedOut()) return new QualityContractError('GRH_REQUEST_TIMEOUT', 408);
  if (control.callerAborted()) return new QualityContractError('GRH_REQUEST_ABORTED');
  const status = record(error) && validStatus(error.status) ? error.status : undefined;
  return new QualityContractError('GRH_REQUEST_FAILED', status);
}

async function runControlled(options?: FetchQualityOptions): Promise<QualityContract> {
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

function jsonContentType(response: Response): boolean {
  if (!response.headers || typeof response.headers.get !== 'function') return false;
  const value = response.headers.get('content-type');
  return typeof value === 'string' &&
    /^application\/(?:[a-z0-9!#$&^_.+-]+\+)?json(?:\s*;|\s*$)/i.test(value);
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

async function requestContract(signal: AbortSignal): Promise<QualityContract> {
  const response = await authenticatedClient().fetch(QUALITY_ENDPOINT, {
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
  if (typeof response.json !== 'function') fail('GRH_RESPONSE_INVALID', 502);

  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    fail('GRH_RESPONSE_INVALID_JSON', 502);
  }
  if (!validateQualityContract(payload)) fail('GRH_QUALITY_CONTRACT_INVALID', 502);
  return deepFreeze(payload);
}

export function fetchQualityContract(options?: FetchQualityOptions): Promise<QualityContract> {
  return runControlled(options);
}
