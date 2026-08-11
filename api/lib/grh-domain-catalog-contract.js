export const GRH_DOMAIN_CATALOG_SCHEMA_VERSION = 'grh-domain-catalog-v1';

export const GRH_DOMAIN_IDS = Object.freeze([
  'personas_estructura',
  'asistencia_tiempo',
  'licencias_salud',
  'carrera_desarrollo',
  'relaciones_laborales',
  'nomina_control',
  'beneficios_descuentos',
  'movimientos_trazabilidad',
]);

export const GRH_DOMAIN_STATUSES = Object.freeze(['operational', 'partial', 'catalogued']);
const TABLE_STATUSES = new Set(['available', 'empty']);
const PERIOD_STATUSES = new Set(['certified', 'historical', 'not_available']);
const COVERAGE_STATUSES = new Set(['verified', 'informational']);
const COVERAGE_UNITS = new Set(['percent', 'rows', 'tables']);
const SHA256_PATTERN = /^[0-9a-f]{64}$/;
const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const ISO_TIMESTAMP_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?(?:Z|\+00:00)$/;
const PERIOD_PATTERN = /^\d{4}-\d{2}$/;
const ACTION_CAPABILITIES = new Set([
  'navigation.rrhh',
  'navigation.organization-analytics',
  'navigation.ai-assistant',
  'navigation.data-quality',
  'navigation.hacienda',
]);
const ACTION_ID_PATTERN = /^[a-z][a-z0-9_]{2,48}$/;
const DOMAIN_ID_SET = new Set(GRH_DOMAIN_IDS);
const DOMAIN_STATUS_SET = new Set(GRH_DOMAIN_STATUSES);

function isPlainObject(value) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function exactKeys(value, keys) {
  return isPlainObject(value) &&
    Object.keys(value).sort().join('|') === [...keys].sort().join('|');
}

function boundedText(value, maximum = 240) {
  return typeof value === 'string' && value.trim() === value && value.length > 0 && value.length <= maximum;
}

function safeCount(value) {
  return Number.isSafeInteger(value) && value >= 0;
}

function validPeriods(value) {
  if (!exactKeys(value, ['first', 'last', 'status'])) return false;
  if (!PERIOD_STATUSES.has(value.status)) return false;
  if (value.status === 'not_available') return value.first === null && value.last === null;
  return typeof value.first === 'string' && PERIOD_PATTERN.test(value.first) &&
    typeof value.last === 'string' && PERIOD_PATTERN.test(value.last) && value.first <= value.last;
}

function validSource(value) {
  return exactKeys(value, [
    'canonicalSystem',
    'sourceFile',
    'sourceSha256',
    'snapshotAsOf',
    'generatedAt',
    'realtime',
  ]) &&
    boundedText(value.canonicalSystem, 120) &&
    boundedText(value.sourceFile, 180) &&
    typeof value.sourceSha256 === 'string' && SHA256_PATTERN.test(value.sourceSha256) &&
    typeof value.snapshotAsOf === 'string' && ISO_DATE_PATTERN.test(value.snapshotAsOf) &&
    typeof value.generatedAt === 'string' && ISO_TIMESTAMP_PATTERN.test(value.generatedAt) &&
    value.realtime === false;
}

function validLineage(value) {
  return exactKeys(value, [
    'profileSchemaVersion',
    'semanticSchemaVersion',
    'dictionaryProjection',
  ]) &&
    value.profileSchemaVersion === 'grh-profile-v1' &&
    value.semanticSchemaVersion === 'grh-semantic-v2' &&
    value.dictionaryProjection === 'table_dictionary_governed_projection';
}

function validPrivacy(value) {
  return exactKeys(value, [
    'aggregateMetadataOnly',
    'containsPersonRecords',
    'containsFinancialAmounts',
  ]) &&
    value.aggregateMetadataOnly === true &&
    value.containsPersonRecords === false &&
    value.containsFinancialAmounts === false;
}

function validCounts(value) {
  return exactKeys(value, [
    'totalTables',
    'nonEmptyTables',
    'emptyTables',
    'totalRows',
    'mappedTables',
    'mappedRows',
    'domainCount',
  ]) &&
    safeCount(value.totalTables) && safeCount(value.nonEmptyTables) && safeCount(value.emptyTables) &&
    safeCount(value.totalRows) && safeCount(value.mappedTables) && safeCount(value.mappedRows) &&
    value.domainCount === GRH_DOMAIN_IDS.length &&
    value.nonEmptyTables + value.emptyTables === value.totalTables &&
    value.mappedTables <= value.totalTables && value.mappedRows <= value.totalRows;
}

function validTable(value) {
  return exactKeys(value, ['name', 'label', 'rows', 'columns', 'status', 'periods']) &&
    typeof value.name === 'string' && /^[a-z][a-z0-9_]{1,63}$/.test(value.name) &&
    boundedText(value.label, 100) && safeCount(value.rows) && safeCount(value.columns) &&
    TABLE_STATUSES.has(value.status) &&
    value.status === (value.rows > 0 ? 'available' : 'empty') && validPeriods(value.periods);
}

function validCoverage(value) {
  return exactKeys(value, ['id', 'label', 'value', 'unit', 'status']) &&
    typeof value.id === 'string' && /^[a-z][a-z0-9_]{2,48}$/.test(value.id) &&
    boundedText(value.label, 120) && typeof value.value === 'number' && Number.isFinite(value.value) &&
    value.value >= 0 && (value.unit !== 'percent' || value.value <= 100) &&
    COVERAGE_UNITS.has(value.unit) && COVERAGE_STATUSES.has(value.status);
}

function validAction(value) {
  return exactKeys(value, ['id', 'label', 'href', 'requiredCapability']) &&
    typeof value.id === 'string' && ACTION_ID_PATTERN.test(value.id) &&
    boundedText(value.label, 100) && boundedText(value.href, 360) &&
    /^(?:\/(?![\\/])|[a-z0-9-]+\.html(?:[?#]|$))/i.test(value.href) &&
    typeof value.requiredCapability === 'string' && ACTION_CAPABILITIES.has(value.requiredCapability);
}

function validDomain(value, index) {
  if (!exactKeys(value, [
    'id', 'title', 'status', 'summary', 'counts', 'tables', 'coverage', 'periods', 'questions', 'actions',
  ])) return false;
  if (value.id !== GRH_DOMAIN_IDS[index] || !DOMAIN_ID_SET.has(value.id)) return false;
  if (!boundedText(value.title, 100) || !DOMAIN_STATUS_SET.has(value.status) || !boundedText(value.summary, 360)) return false;
  if (!exactKeys(value.counts, ['tables', 'nonEmptyTables', 'rows']) ||
      !safeCount(value.counts.tables) || !safeCount(value.counts.nonEmptyTables) || !safeCount(value.counts.rows) ||
      value.counts.nonEmptyTables > value.counts.tables) return false;
  if (!Array.isArray(value.tables) || value.tables.length !== value.counts.tables || !value.tables.every(validTable)) return false;
  if (new Set(value.tables.map(table => table.name)).size !== value.tables.length) return false;
  if (value.tables.filter(table => table.rows > 0).length !== value.counts.nonEmptyTables) return false;
  if (value.tables.reduce((sum, table) => sum + table.rows, 0) !== value.counts.rows) return false;
  if (!Array.isArray(value.coverage) || value.coverage.length < 1 || value.coverage.length > 6 || !value.coverage.every(validCoverage)) return false;
  if (new Set(value.coverage.map(item => item.id)).size !== value.coverage.length || !validPeriods(value.periods)) return false;
  if (!Array.isArray(value.questions) || value.questions.length < 2 || value.questions.length > 5 ||
      !value.questions.every(question => boundedText(question, 220)) || new Set(value.questions).size !== value.questions.length) return false;
  if (!Array.isArray(value.actions) || value.actions.length < 1 || value.actions.length > 4 || !value.actions.every(validAction)) return false;
  return new Set(value.actions.map(action => action.id)).size === value.actions.length;
}

export function inspectGrhDomainCatalogContract(value) {
  const errors = [];
  if (!exactKeys(value, ['schemaVersion', 'source', 'lineage', 'privacy', 'counts', 'domains'])) {
    return Object.freeze({ ok: false, errors: Object.freeze(['catalog.shape']) });
  }
  if (value.schemaVersion !== GRH_DOMAIN_CATALOG_SCHEMA_VERSION) errors.push('catalog.schema_version');
  if (!validSource(value.source)) errors.push('catalog.source');
  if (!validLineage(value.lineage)) errors.push('catalog.lineage');
  if (!validPrivacy(value.privacy)) errors.push('catalog.privacy');
  if (!validCounts(value.counts)) errors.push('catalog.counts');
  if (!Array.isArray(value.domains) || value.domains.length !== GRH_DOMAIN_IDS.length) {
    errors.push('catalog.domains');
  } else {
    value.domains.forEach((domain, index) => {
      if (!validDomain(domain, index)) errors.push(`catalog.domains.${index}`);
    });
    const tables = value.domains.flatMap(domain => Array.isArray(domain?.tables) ? domain.tables : []);
    if (new Set(tables.map(table => table.name)).size !== tables.length) errors.push('catalog.tables_unique');
    if (value.counts?.mappedTables !== tables.length ||
        value.counts?.mappedRows !== tables.reduce((sum, table) => sum + (safeCount(table?.rows) ? table.rows : 0), 0)) {
      errors.push('catalog.mapped_counts');
    }
  }
  return Object.freeze({ ok: errors.length === 0, errors: Object.freeze([...new Set(errors)]) });
}

export function validateGrhDomainCatalogContract(value) {
  return inspectGrhDomainCatalogContract(value).ok;
}
