export const GRH_PERSONAS_LINKAGE_SCHEMA_VERSION = 'grh-personas-linkage-readiness-v1';
export const GRH_PERSONAS_LINKAGE_ALGORITHM_VERSION = 'grh-personas-linkage-matcher-v1';

const TOP_KEYS = ['algorithm', 'idPersonaControl', 'limits', 'privacy', 'readiness', 'reconciliation', 'schemaVersion', 'source', 'status'];
const SOURCE_KEYS = ['generatedAt', 'grh', 'personas', 'snapshotAsOf'];
const SYSTEM_KEYS = ['compressedSizeBytes', 'counts', 'manifestSchemaVersion', 'sourceFile', 'sourceSha256', 'system', 'tables'];
const GRH_COUNT_KEYS = ['physicalTables', 'persons', 'totalRows', 'views'];
const PERSONAS_COUNT_KEYS = ['addresses', 'contacts', 'distinctValidCuil', 'geocodedAddresses', 'persons', 'personsWithAddress', 'physicalTables', 'totalRows', 'validCuilRows', 'views'];
const ALGORITHM_KEYS = ['ambiguityPolicy', 'dniPolicy', 'idPersonaJoinAllowed', 'nameNormalization', 'nameOnlyMatching', 'priority', 'receivedReportSubdivisionVerified', 'sexEvidenceUsed', 'tiers', 'version'];
const RECONCILIATION_KEYS = ['ambiguous', 'ambiguousBreakdown', 'candidates', 'coveragePct', 'grhPersons', 'reconciled', 'targetCollisions', 'unmatched'];
const BREAKDOWN_KEYS = ['multipleNameCandidates', 'nameOnlyReviewSignals', 'promotedFromNameOnly', 'uniqueNameAndBirthDate', 'unresolvedDocumentCandidates'];
const PRIVACY_KEYS = ['addressesExported', 'aggregateOnly', 'candidateRowsExported', 'contactsExported', 'containsPii', 'documentsExported', 'namesExported', 'rawRowsExported', 'sourceIdentifiersExported'];
const READINESS_KEYS = ['aggregateDiagnostic', 'humanReview', 'institutionalApproval', 'productionCrosswalk', 'safeForCurrentGrhKpis'];
const ID_CONTROL_KEYS = ['concordantIdentities', 'joinAllowed', 'joinKey', 'overlappingValues', 'status'];

export const GRH_PERSONAS_LINKAGE_TIER_CONTROLS = Object.freeze([
  Object.freeze({ key: 'unique_valid_cuil', label: 'CUIL válido y único', count: 1432, confidence: 'high' }),
  Object.freeze({ key: 'unique_dni_backup', label: 'DNI único usado como respaldo', count: 203, confidence: 'assisted' }),
  Object.freeze({ key: 'duplicate_valid_cuil_unique_name', label: 'CUIL duplicado resuelto por un único nombre normalizado', count: 58, confidence: 'assisted' }),
  Object.freeze({ key: 'duplicate_dni_unique_name', label: 'DNI duplicado resuelto por un único nombre normalizado', count: 6, confidence: 'assisted' }),
]);

export const GRH_PERSONAS_LINKAGE_LIMITS = Object.freeze([
  Object.freeze({ code: 'baseline_not_certified', text: 'Los 1.699 resultados son candidatos reproducibles de ingeniería; todavía no forman un padrón productivo certificado.' }),
  Object.freeze({ code: 'ambiguous_require_review', text: 'Los 157 casos ambiguos requieren revisión humana y no se vinculan automáticamente.' }),
  Object.freeze({ code: 'no_idpersona_join', text: 'Los identificadores IDPERSONA pertenecen a cada sistema y nunca se usan para unir las bases.' }),
  Object.freeze({ code: 'personas_auxiliary_only', text: 'GRH conserva la autoridad laboral; PERSONAS sólo puede enriquecer identidad, domicilio y territorio mediante un puente aprobado.' }),
  Object.freeze({ code: 'geocoded_addresses_unlinked', text: 'Los 183 registros con coordenadas no están vinculados de forma verificable a personas y no habilitan cobertura territorial individual.' }),
  Object.freeze({ code: 'report_subdivision_unverified', text: 'El desglose 40 + 24 del informe recibido no tiene algoritmo ejecutable; se publica la reproducción verificable 58 + 6.' }),
  Object.freeze({ code: 'historical_snapshot_not_realtime', text: 'Ambas fuentes corresponden al respaldo del 6 de agosto de 2026 y no se actualizan en tiempo real.' }),
]);

function exactKeys(value, expected) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const actual = Object.keys(value).sort();
  return actual.length === expected.length && actual.every((key, index) => key === [...expected].sort()[index]);
}

function sameJson(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function add(errors, condition, code) {
  if (!condition) errors.push(code);
}

export function inspectGrhPersonasLinkageContract(value) {
  const errors = [];
  add(errors, exactKeys(value, TOP_KEYS), 'shape.top');
  add(errors, value?.schemaVersion === GRH_PERSONAS_LINKAGE_SCHEMA_VERSION, 'schema.version');
  add(errors, value?.status === 'diagnostic_ready', 'status');

  const source = value?.source;
  add(errors, exactKeys(source, SOURCE_KEYS), 'source.shape');
  add(errors, source?.snapshotAsOf === '2026-08-06', 'source.snapshot');
  add(errors, source?.generatedAt === '2026-08-13T00:00:00.000Z', 'source.generated_at');
  add(errors, exactKeys(source?.grh, SYSTEM_KEYS), 'source.grh.shape');
  add(errors, source?.grh?.system === 'GRH Junín', 'source.grh.system');
  add(errors, source?.grh?.sourceFile === 'grh_junin.backup_2026080615_plataforma.sql.gz', 'source.grh.file');
  add(errors, source?.grh?.sourceSha256 === 'e7403da1d036c8d60eab26bcb3f97e6e7c3a70629090deac8cc4e5438250b3d9', 'source.grh.sha');
  add(errors, source?.grh?.compressedSizeBytes === 44537741, 'source.grh.size');
  add(errors, source?.grh?.manifestSchemaVersion === 'grh-source-manifest-v1', 'source.grh.manifest');
  add(errors, sameJson(source?.grh?.tables, { person: 'persona' }), 'source.grh.tables');
  add(errors, exactKeys(source?.grh?.counts, GRH_COUNT_KEYS), 'source.grh.counts.shape');
  add(errors, sameJson(source?.grh?.counts, { physicalTables: 257, views: 7, totalRows: 6573057, persons: 2349 }), 'source.grh.counts');

  add(errors, exactKeys(source?.personas, SYSTEM_KEYS), 'source.personas.shape');
  add(errors, source?.personas?.system === 'PERSONAS Junín', 'source.personas.system');
  add(errors, source?.personas?.sourceFile === 'personas_junin.backup_2026080615_plataforma.sql.gz', 'source.personas.file');
  add(errors, source?.personas?.sourceSha256 === '11bf15764488e4fe8a053255f503404f6bca24a1ac47c90647649e2c41d8e39c', 'source.personas.sha');
  add(errors, source?.personas?.compressedSizeBytes === 7550947, 'source.personas.size');
  add(errors, source?.personas?.manifestSchemaVersion === 'personas-source-manifest-v1', 'source.personas.manifest');
  add(errors, sameJson(source?.personas?.tables, { person: 'persona', address: 'domicilio', contact: 'contacto' }), 'source.personas.tables');
  add(errors, exactKeys(source?.personas?.counts, PERSONAS_COUNT_KEYS), 'source.personas.counts.shape');
  add(errors, sameJson(source?.personas?.counts, {
    physicalTables: 32, views: 8, totalRows: 371947, persons: 96777,
    addresses: 273314, personsWithAddress: 90365, validCuilRows: 44333,
    distinctValidCuil: 41376, geocodedAddresses: 183, contacts: 350,
  }), 'source.personas.counts');

  const algorithm = value?.algorithm;
  add(errors, exactKeys(algorithm, ALGORITHM_KEYS), 'algorithm.shape');
  add(errors, algorithm?.version === GRH_PERSONAS_LINKAGE_ALGORITHM_VERSION, 'algorithm.version');
  add(errors, algorithm?.nameNormalization === 'NFKD_ASCII_UPPER_TRIM_COLLAPSE_WHITESPACE_PRESERVE_PUNCTUATION', 'algorithm.name');
  add(errors, sameJson(algorithm?.dniPolicy, {
    grh: 'NUDO_12_DIGITS_ONLY',
    personas: 'NUDO_12_DIGITS_ONLY_ELSE_MIDDLE_8_OF_VALID_CUIL_WHEN_MISSING',
  }), 'algorithm.dni');
  add(errors, sameJson(algorithm?.priority, GRH_PERSONAS_LINKAGE_TIER_CONTROLS.map(item => item.key)), 'algorithm.priority');
  add(errors, algorithm?.ambiguityPolicy === 'unresolved_document_candidates_or_name_only_review_signal', 'algorithm.ambiguity');
  add(errors, algorithm?.nameOnlyMatching === false && algorithm?.sexEvidenceUsed === false && algorithm?.idPersonaJoinAllowed === false, 'algorithm.forbidden_evidence');
  add(errors, algorithm?.receivedReportSubdivisionVerified === false, 'algorithm.report_subdivision');
  add(errors, sameJson(algorithm?.tiers, GRH_PERSONAS_LINKAGE_TIER_CONTROLS), 'algorithm.tiers');

  const reconciliation = value?.reconciliation;
  add(errors, exactKeys(reconciliation, RECONCILIATION_KEYS), 'reconciliation.shape');
  add(errors, reconciliation?.grhPersons === 2349, 'reconciliation.grh');
  add(errors, reconciliation?.candidates === 1699 && reconciliation?.coveragePct === 72.3, 'reconciliation.candidates');
  add(errors, reconciliation?.ambiguous === 157 && reconciliation?.unmatched === 493, 'reconciliation.pending');
  add(errors, reconciliation?.targetCollisions === 0 && reconciliation?.reconciled === true, 'reconciliation.integrity');
  add(errors, reconciliation?.candidates + reconciliation?.ambiguous + reconciliation?.unmatched === reconciliation?.grhPersons, 'reconciliation.total');
  add(errors, algorithm?.tiers?.reduce((total, tier) => total + tier.count, 0) === reconciliation?.candidates, 'reconciliation.tiers');
  add(errors, exactKeys(reconciliation?.ambiguousBreakdown, BREAKDOWN_KEYS), 'reconciliation.breakdown.shape');
  add(errors, sameJson(reconciliation?.ambiguousBreakdown, {
    unresolvedDocumentCandidates: 154,
    nameOnlyReviewSignals: 3,
    multipleNameCandidates: 2,
    uniqueNameAndBirthDate: 1,
    promotedFromNameOnly: 0,
  }), 'reconciliation.breakdown');

  add(errors, exactKeys(value?.idPersonaControl, ID_CONTROL_KEYS), 'idpersona.shape');
  add(errors, sameJson(value?.idPersonaControl, {
    joinKey: 'IDPERSONA', joinAllowed: false, overlappingValues: 6,
    concordantIdentities: 0, status: 'forbidden',
  }), 'idpersona.control');

  add(errors, exactKeys(value?.privacy, PRIVACY_KEYS), 'privacy.shape');
  add(errors, value?.privacy?.aggregateOnly === true, 'privacy.aggregate');
  for (const key of PRIVACY_KEYS.filter(key => key !== 'aggregateOnly')) {
    add(errors, value?.privacy?.[key] === false, `privacy.${key}`);
  }
  add(errors, exactKeys(value?.readiness, READINESS_KEYS), 'readiness.shape');
  add(errors, sameJson(value?.readiness, {
    aggregateDiagnostic: 'available', productionCrosswalk: 'not_published',
    humanReview: 'pending', institutionalApproval: 'pending', safeForCurrentGrhKpis: false,
  }), 'readiness');
  add(errors, sameJson(value?.limits, GRH_PERSONAS_LINKAGE_LIMITS), 'limits');

  const serialized = JSON.stringify(value);
  add(errors, !/"(?:displayName|fullName|birthDate|dni|cuil|street|streetName|addressText|domicile|domicilioExacto|phone|email|sourceId|candidateRows|rawPersons)"\s*:/i.test(serialized), 'privacy.forbidden_key');
  return Object.freeze({ ok: errors.length === 0, errors: Object.freeze(errors) });
}
