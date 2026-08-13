export const GRH_IMPORT_QUALITY_HISTORY_SCHEMA_VERSION =
  'grh-import-quality-history-v1';
export const GRH_IMPORT_QUALITY_HISTORY_GENERATED_AT =
  '2026-08-13T00:00:00.000Z';

export const GRH_IMPORT_QUALITY_HISTORY_CATEGORIES = Object.freeze([
  Object.freeze({
    key: 'amount_zero',
    label: 'Importes informados en cero',
    meaning: 'Control histórico que marcó un importe con valor cero durante la importación.',
  }),
  Object.freeze({
    key: 'quantity_zero',
    label: 'Cantidades informadas en cero',
    meaning: 'Control histórico que marcó una cantidad con valor cero durante la importación.',
  }),
  Object.freeze({
    key: 'dni_without_active_legajo',
    label: 'Documento sin legajo activo',
    meaning: 'Control histórico que no pudo vincular un documento con un legajo activo.',
  }),
  Object.freeze({
    key: 'format_or_length',
    label: 'Formato o longitud no válida',
    meaning: 'Control histórico que detectó una estructura de campo incompatible con el formato esperado.',
  }),
  Object.freeze({
    key: 'dni_multiple_legajos',
    label: 'Documento asociado a más de un legajo',
    meaning: 'Control histórico que encontró más de un legajo para un mismo documento.',
  }),
  Object.freeze({
    key: 'other_technical',
    label: 'Otros controles técnicos',
    meaning: 'Resto exhaustivo de validaciones históricas del importador, agrupadas sin publicar mensajes fuente.',
  }),
]);

export const GRH_IMPORT_QUALITY_HISTORY_LIMITS = Object.freeze([
  Object.freeze({
    code: 'historical_import_controls_not_current_employee_errors',
    text: 'Son controles registrados por importaciones históricas; no describen errores actuales de empleados.',
  }),
  Object.freeze({
    code: 'not_platform_availability',
    text: 'La cantidad de incidencias no mide disponibilidad, caídas ni tiempo operativo de la plataforma.',
  }),
  Object.freeze({
    code: 'partial_2026_through_last_source_event',
    text: 'El año 2026 es parcial y llega hasta el 5 de agosto, última fecha registrada en la fuente.',
  }),
  Object.freeze({
    code: 'incident_not_confirmed_impact',
    text: 'Una incidencia documenta una validación del importador; no confirma por sí sola impacto laboral o económico.',
  }),
  Object.freeze({
    code: 'raw_messages_withheld',
    text: 'Los mensajes originales no se publican porque pueden contener documentos personales u otros datos identificatorios.',
  }),
]);

const KEYS = Object.freeze({
  top: ['schemaVersion', 'source', 'privacy', 'scope', 'totals', 'currentPartial', 'annual', 'categories', 'classification', 'limits'],
  source: ['canonicalSystem', 'sourceFile', 'sourceSha256', 'snapshotAsOf', 'generatedAt', 'realtime', 'table', 'firstEventDate', 'lastEventDate', 'partialThrough'],
  privacy: ['aggregateOnly', 'containsPii', 'personIdentifiersExported', 'rawRowsExported', 'rawMessagesExported'],
  scope: ['unit', 'meaning', 'notCurrentEmployeeErrors', 'notSystemAvailability'],
  totals: ['incidents', 'importRuns'],
  currentPartial: ['year', 'incidents', 'importRuns', 'partial', 'through'],
  annual: ['year', 'incidents', 'importRuns', 'partial'],
  category: ['key', 'label', 'meaning', 'incidents', 'sharePct'],
  classification: ['status', 'ruleVersion', 'classifiedIncidents', 'coveragePct'],
  limit: ['code', 'text'],
});
const HEX_64 = /^[0-9a-f]{64}$/;
const DATE = /^\d{4}-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12]\d|3[01])$/;

function exactKeys(value, expected) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const actual = Object.keys(value).sort();
  const sortedExpected = [...expected].sort();
  return actual.length === sortedExpected.length &&
    actual.every((key, index) => key === sortedExpected[index]);
}

function nonNegativeInteger(value) {
  return Number.isSafeInteger(value) && value >= 0;
}

function percentage(value) {
  return Number.isFinite(value) && value >= 0 && value <= 100;
}

function ratio(numerator, denominator) {
  return denominator === 0 ? 0 : Number(((numerator / denominator) * 100).toFixed(4));
}

function add(errors, condition, code) {
  if (!condition) errors.push(code);
}

function validDate(value) {
  return typeof value === 'string' && DATE.test(value) &&
    Number.isFinite(Date.parse(`${value}T00:00:00Z`));
}

export function inspectGrhImportQualityHistoryContract(value) {
  const errors = [];
  add(errors, exactKeys(value, KEYS.top), 'import_quality_history.structure');
  add(errors, value?.schemaVersion === GRH_IMPORT_QUALITY_HISTORY_SCHEMA_VERSION, 'schema.version');

  const source = value?.source;
  add(errors, exactKeys(source, KEYS.source), 'source.structure');
  add(errors, source?.canonicalSystem === 'GRH Junín', 'source.canonical_system');
  add(errors, source?.sourceFile === 'grh_junin.backup_2026080615_plataforma.sql.gz', 'source.file');
  add(errors, HEX_64.test(source?.sourceSha256 || ''), 'source.sha256');
  for (const field of ['snapshotAsOf', 'firstEventDate', 'lastEventDate', 'partialThrough']) {
    add(errors, validDate(source?.[field]), `source.${field}`);
  }
  add(errors, source?.snapshotAsOf === '2026-08-06', 'source.snapshot');
  add(errors, source?.generatedAt === GRH_IMPORT_QUALITY_HISTORY_GENERATED_AT, 'source.generated_at');
  add(errors, source?.realtime === false, 'source.realtime');
  add(errors, source?.table === 'errorimportacion', 'source.table');
  add(errors, source?.firstEventDate <= source?.lastEventDate, 'source.event_order');
  add(errors, source?.lastEventDate === source?.partialThrough, 'source.partial_identity');
  add(errors, source?.lastEventDate <= source?.snapshotAsOf, 'source.before_snapshot');

  const privacy = value?.privacy;
  add(errors, exactKeys(privacy, KEYS.privacy), 'privacy.structure');
  add(errors, privacy?.aggregateOnly === true, 'privacy.aggregate_only');
  for (const field of ['containsPii', 'personIdentifiersExported', 'rawRowsExported', 'rawMessagesExported']) {
    add(errors, privacy?.[field] === false, `privacy.${field}`);
  }

  const scope = value?.scope;
  add(errors, exactKeys(scope, KEYS.scope), 'scope.structure');
  add(errors, scope?.unit === 'historical_import_control_incident', 'scope.unit');
  add(errors, scope?.meaning === 'Cada incidencia es un control registrado por el importador histórico de GRH.', 'scope.meaning');
  add(errors, scope?.notCurrentEmployeeErrors === true, 'scope.current_errors');
  add(errors, scope?.notSystemAvailability === true, 'scope.availability');

  const totals = value?.totals;
  add(errors, exactKeys(totals, KEYS.totals), 'totals.structure');
  add(errors, nonNegativeInteger(totals?.incidents) && totals.incidents > 0, 'totals.incidents');
  add(errors, nonNegativeInteger(totals?.importRuns) && totals.importRuns > 0, 'totals.import_runs');
  add(errors, totals?.importRuns <= totals?.incidents, 'totals.run_bound');

  const annual = Array.isArray(value?.annual) ? value.annual : [];
  add(errors, annual.length > 0, 'annual.array');
  annual.forEach((row, index) => {
    const path = `annual.${index}`;
    add(errors, exactKeys(row, KEYS.annual), `${path}.structure`);
    add(errors, Number.isSafeInteger(row?.year) && row.year >= 2000 && row.year <= 2100, `${path}.year`);
    add(errors, nonNegativeInteger(row?.incidents) && row.incidents > 0, `${path}.incidents`);
    add(errors, nonNegativeInteger(row?.importRuns) && row.importRuns > 0, `${path}.import_runs`);
    add(errors, row?.importRuns <= row?.incidents, `${path}.run_bound`);
    add(errors, typeof row?.partial === 'boolean', `${path}.partial`);
    if (index > 0) add(errors, row?.year === annual[index - 1]?.year + 1, `${path}.consecutive`);
    add(errors, row?.partial === (index === annual.length - 1), `${path}.partial_identity`);
  });
  add(errors, annual[0]?.year === Number(source?.firstEventDate?.slice(0, 4)), 'annual.first_year');
  add(errors, annual.at(-1)?.year === Number(source?.lastEventDate?.slice(0, 4)), 'annual.last_year');
  add(errors, annual.reduce((sum, row) => sum + (row?.incidents || 0), 0) === totals?.incidents, 'annual.incident_identity');
  add(errors, annual.reduce((sum, row) => sum + (row?.importRuns || 0), 0) === totals?.importRuns, 'annual.run_identity');

  const current = value?.currentPartial;
  add(errors, exactKeys(current, KEYS.currentPartial), 'current_partial.structure');
  add(errors, Number.isSafeInteger(current?.year), 'current_partial.year');
  add(errors, nonNegativeInteger(current?.incidents), 'current_partial.incidents');
  add(errors, nonNegativeInteger(current?.importRuns), 'current_partial.import_runs');
  add(errors, current?.partial === true, 'current_partial.partial');
  add(errors, current?.through === source?.partialThrough, 'current_partial.through');
  const latest = annual.at(-1);
  for (const field of ['year', 'incidents', 'importRuns', 'partial']) {
    add(errors, current?.[field] === latest?.[field], `current_partial.${field}_identity`);
  }

  const categories = Array.isArray(value?.categories) ? value.categories : [];
  add(errors, categories.length === GRH_IMPORT_QUALITY_HISTORY_CATEGORIES.length, 'categories.length');
  categories.forEach((row, index) => {
    const path = `categories.${index}`;
    const expected = GRH_IMPORT_QUALITY_HISTORY_CATEGORIES[index];
    add(errors, exactKeys(row, KEYS.category), `${path}.structure`);
    add(errors, row?.key === expected?.key, `${path}.key`);
    add(errors, row?.label === expected?.label, `${path}.label`);
    add(errors, row?.meaning === expected?.meaning, `${path}.meaning`);
    add(errors, nonNegativeInteger(row?.incidents) && row.incidents > 0, `${path}.incidents`);
    add(errors, percentage(row?.sharePct), `${path}.share`);
    add(errors, row?.sharePct === ratio(row?.incidents, totals?.incidents), `${path}.share_identity`);
  });
  add(errors, categories.reduce((sum, row) => sum + (row?.incidents || 0), 0) === totals?.incidents, 'categories.incident_identity');

  const classification = value?.classification;
  add(errors, exactKeys(classification, KEYS.classification), 'classification.structure');
  add(errors, classification?.status === 'exhaustive', 'classification.status');
  add(errors, classification?.ruleVersion === 'grh-import-quality-classification-v1', 'classification.rule_version');
  add(errors, classification?.classifiedIncidents === totals?.incidents, 'classification.incident_identity');
  add(errors, classification?.coveragePct === 100, 'classification.coverage');

  const limits = Array.isArray(value?.limits) ? value.limits : [];
  add(errors, limits.length === GRH_IMPORT_QUALITY_HISTORY_LIMITS.length, 'limits.length');
  limits.forEach((limit, index) => {
    const expected = GRH_IMPORT_QUALITY_HISTORY_LIMITS[index];
    add(errors, exactKeys(limit, KEYS.limit), `limits.${index}.structure`);
    add(errors, limit?.code === expected?.code && limit?.text === expected?.text, `limits.${index}.identity`);
  });

  return Object.freeze({
    ok: errors.length === 0,
    errors: Object.freeze([...new Set(errors)]),
  });
}

export function validateGrhImportQualityHistoryContract(value) {
  return inspectGrhImportQualityHistoryContract(value).ok;
}
