import {
  GRH_DOMAIN_CATALOG_SCHEMA_VERSION,
  inspectGrhDomainCatalogContract,
} from './grh-domain-catalog-contract.js';

const DOMAIN_DEFINITIONS = Object.freeze([
  Object.freeze({
    id: 'personas_estructura',
    title: 'Personas y estructura',
    status: 'operational',
    summary: 'Legajos, estructura organizativa y dimensiones de dotación para navegar desde el panorama agregado hasta el directorio autorizado.',
    tables: Object.freeze(['legajo', 'persona', 'organiza', 'sectores', 'costos', 'reparticiones_por_legajo', 'catego', 'cargo']),
    questions: Object.freeze([
      '¿Cuántas personas participaron en la liquidación del último período?',
      '¿Cómo se distribuyen los participantes por sector y centro de costo?',
      '¿Qué cobertura tiene el cruce entre hechos y legajos?',
    ]),
    actions: Object.freeze([
      Object.freeze({ id: 'open_people_management', label: 'Abrir gestión de personas', href: '/rrhh', requiredCapability: 'navigation.rrhh' }),
      Object.freeze({ id: 'open_structure', label: 'Abrir dotación y estructura', href: '/estructura', requiredCapability: 'navigation.organization-analytics' }),
    ]),
    periodDomain: 'workforce',
  }),
  Object.freeze({
    id: 'asistencia_tiempo',
    title: 'Asistencia y tiempo',
    status: 'partial',
    summary: 'Ausencias históricas, fichadas, horarios, turnos y feriados. El módulo separa lo analizado de las tablas que todavía requieren una serie certificada.',
    tables: Object.freeze(['fichadas', 'horarios', 'turnos', 'legaturn', 'feriado', 'ausencia', 'motause']),
    questions: Object.freeze([
      '¿Qué datos de ausencias están disponibles?',
      '¿Cómo evolucionaron las ausencias por año?',
      '¿Qué tablas de turnos y horarios existen en la fuente?',
    ]),
    actions: Object.freeze([
      Object.freeze({ id: 'open_absence_dashboard', label: 'Abrir dotación y ausencias', href: '/estructura#novedades-historicas', requiredCapability: 'navigation.organization-analytics' }),
      Object.freeze({ id: 'ask_absence_assistant', label: 'Analizar ausencias con BOT IA', href: 'ia.html?question=Que%20datos%20de%20ausencias%20estan%20disponibles', requiredCapability: 'navigation.ai-assistant' }),
    ]),
    periodDomain: 'ausencia',
  }),
  Object.freeze({
    id: 'licencias_salud',
    title: 'Licencias y salud laboral',
    status: 'partial',
    summary: 'Licencias históricas, escalas y referencias de salud laboral disponibles para análisis histórico y consulta nominal autorizada.',
    tables: Object.freeze(['licencia', 'escalicencia', 'legamed', 'art', 'actividadart']),
    questions: Object.freeze([
      '¿Qué licencias históricas están disponibles?',
      '¿Cuál es el período cubierto por las licencias?',
      '¿Qué tablas de licencias y salud laboral hay?',
    ]),
    actions: Object.freeze([
      Object.freeze({ id: 'ask_leave_assistant', label: 'Consultar licencias históricas', href: 'ia.html?question=Que%20licencias%20historicas%20estan%20disponibles', requiredCapability: 'navigation.ai-assistant' }),
      Object.freeze({ id: 'open_people_management', label: 'Abrir gestión de personas', href: '/rrhh', requiredCapability: 'navigation.rrhh' }),
    ]),
    periodDomain: 'licencia',
  }),
  Object.freeze({
    id: 'carrera_desarrollo',
    title: 'Carrera y desarrollo',
    status: 'catalogued',
    summary: 'Historial de legajo, calificaciones, antigüedad, estudios, otros trabajos y fojas identificados para construir el próximo módulo de trayectoria.',
    tables: Object.freeze(['histolegajo', 'histocal', 'legaanti', 'legaestu', 'estudio', 'otrotrab', 'foja']),
    questions: Object.freeze([
      '¿Qué evidencia de carrera y formación existe en la base?',
      '¿Qué tablas de estudios e historial laboral existen?',
      '¿Qué datos de carrera y formación existen?',
    ]),
    actions: Object.freeze([
      Object.freeze({ id: 'ask_career_inventory', label: 'Preguntar por carrera y formación', href: 'ia.html?question=Que%20datos%20de%20carrera%20y%20formacion%20existen', requiredCapability: 'navigation.ai-assistant' }),
      Object.freeze({ id: 'open_data_quality', label: 'Revisar calidad y linaje', href: '/calidad', requiredCapability: 'navigation.data-quality' }),
    ]),
    periodDomain: null,
  }),
  Object.freeze({
    id: 'relaciones_laborales',
    title: 'Relaciones laborales',
    status: 'partial',
    summary: 'Convenios, gremios, categorías, ámbitos y niveles para entender agrupamientos laborales sin confundirlos con una planta vigente.',
    tables: Object.freeze(['convenio', 'gremio', 'legagremio', 'ambito', 'nivel']),
    questions: Object.freeze([
      '¿Cómo se distribuyen los participantes por categoría de acuerdo?',
      '¿Qué convenios y gremios están representados en las tablas?',
      '¿Qué tablas de relaciones laborales hay?',
    ]),
    actions: Object.freeze([
      Object.freeze({ id: 'open_agreement_finance', label: 'Abrir Hacienda y nómina', href: 'hacienda.html#cohortContext', requiredCapability: 'navigation.hacienda' }),
      Object.freeze({ id: 'ask_agreement_assistant', label: 'Comparar acuerdos con BOT IA', href: 'ia.html?question=Como%20se%20distribuyen%20los%20participantes%20por%20acuerdo', requiredCapability: 'navigation.ai-assistant' }),
    ]),
    periodDomain: 'workforce',
  }),
  Object.freeze({
    id: 'nomina_control',
    title: 'Nómina y control de cálculo',
    status: 'operational',
    summary: 'Cálculo, conceptos, códigos de liquidación, totales y trazabilidad de cierres con 24 meses de composición financiera por dimensión.',
    tables: Object.freeze(['calculo', 'codliq', 'concepto', 'totpago', 'liquidacionlog', 'acumula', 'fijos']),
    questions: Object.freeze([
      '¿Qué requiere atención en el último cierre?',
      '¿Qué costo neto se concentra por centro de costo en 2026-07?',
      'Mostrá los componentes del cálculo de Servicios Públicos por centro de costo en 2026-07.',
    ]),
    actions: Object.freeze([
      Object.freeze({ id: 'open_payroll_control', label: 'Abrir Hacienda y nómina', href: 'hacienda.html#cohortContext', requiredCapability: 'navigation.hacienda' }),
      Object.freeze({ id: 'ask_payroll_assistant', label: 'Analizar cierre con BOT IA', href: 'ia.html?question=Que%20requiere%20atencion%20en%20el%20ultimo%20cierre', requiredCapability: 'navigation.ai-assistant' }),
    ]),
    periodDomain: 'calculo',
  }),
  Object.freeze({
    id: 'beneficios_descuentos',
    title: 'Beneficios y descuentos',
    status: 'catalogued',
    summary: 'Asignaciones familiares, retenciones, embargos, anticipos, préstamos e impuesto a las ganancias inventariados para un módulo futuro con reglas propias.',
    tables: Object.freeze(['familia', 'asigflia', 'embargo', 'calc_emba', 'anticipo', 'prestamo', 'impgan', 'obrasoc']),
    questions: Object.freeze([
      '¿Qué tablas de beneficios y descuentos existen?',
      '¿Qué tablas de asignaciones familiares y embargos existen?',
      '¿Qué datos de beneficios y descuentos existen?',
    ]),
    actions: Object.freeze([
      Object.freeze({ id: 'ask_benefits_inventory', label: 'Explorar beneficios con BOT IA', href: 'ia.html?question=Que%20datos%20de%20beneficios%20y%20descuentos%20existen', requiredCapability: 'navigation.ai-assistant' }),
      Object.freeze({ id: 'open_quality_benefits', label: 'Revisar fuentes y calidad', href: '/calidad', requiredCapability: 'navigation.data-quality' }),
    ]),
    periodDomain: null,
  }),
  Object.freeze({
    id: 'movimientos_trazabilidad',
    title: 'Movimientos y trazabilidad',
    status: 'operational',
    summary: 'Movimientos de legajo, novedades, errores de importación y registros de ejecución para seguir la evolución histórica y la calidad del pipeline.',
    tables: Object.freeze(['legamov', 'prenove', 'errorimportacion', 'errores', 'columna', 'reporte']),
    questions: Object.freeze([
      '¿Cuántos movimientos válidos hubo en 2026?',
      '¿Cómo evolucionaron los movimientos por año?',
      '¿Qué tablas de movimientos y trazabilidad hay?',
    ]),
    actions: Object.freeze([
      Object.freeze({ id: 'ask_movement_assistant', label: 'Analizar movimientos con BOT IA', href: 'ia.html?question=Cuantos%20movimientos%20validos%20hubo%20en%202026', requiredCapability: 'navigation.ai-assistant' }),
      Object.freeze({ id: 'open_movement_quality', label: 'Abrir calidad y cuarentena', href: '/calidad', requiredCapability: 'navigation.data-quality' }),
    ]),
    periodDomain: 'legamov',
  }),
]);

const TABLE_LABELS = Object.freeze({
  legajo: 'Legajos', persona: 'Personas', organiza: 'Organizaciones', sectores: 'Sectores', costos: 'Centros de costo',
  reparticiones_por_legajo: 'Reparticiones por legajo', catego: 'Categorías', cargo: 'Cargos', fichadas: 'Fichadas',
  horarios: 'Horarios', turnos: 'Turnos', legaturn: 'Turnos por legajo', feriado: 'Feriados', ausencia: 'Ausencias',
  motause: 'Motivos de ausencia', licencia: 'Licencias', escalicencia: 'Escalas de licencia', legamed: 'Legajos médicos',
  art: 'Aseguradora de riesgos', actividadart: 'Actividades ART', histolegajo: 'Historial de legajo', histocal: 'Historial de calificaciones',
  legaanti: 'Antigüedad por legajo', legaestu: 'Estudios por legajo', estudio: 'Tipos de estudio', otrotrab: 'Otros trabajos',
  foja: 'Fojas', convenio: 'Convenios', gremio: 'Gremios', legagremio: 'Gremios por legajo', ambito: 'Ámbitos', nivel: 'Niveles',
  calculo: 'Cálculo salarial', codliq: 'Códigos de liquidación', concepto: 'Conceptos', totpago: 'Totales informados',
  liquidacionlog: 'Log de liquidación', acumula: 'Acumuladores', fijos: 'Conceptos fijos', familia: 'Grupo familiar',
  asigflia: 'Asignaciones familiares', embargo: 'Embargos', calc_emba: 'Cálculo de embargos', anticipo: 'Anticipos',
  prestamo: 'Préstamos', impgan: 'Impuesto a las ganancias', obrasoc: 'Obras sociales', legamov: 'Movimientos de legajo',
  prenove: 'Pre-novedades', errorimportacion: 'Errores de importación', errores: 'Catálogo de errores', columna: 'Columnas de importación',
  reporte: 'Reportes configurados',
});

function catalogError(message) {
  const error = new Error(message);
  error.code = 'GRH_DOMAIN_CATALOG_INVALID';
  return error;
}

function deepFreeze(value, seen = new Set()) {
  if (!value || typeof value !== 'object' || seen.has(value)) return value;
  seen.add(value);
  for (const child of Object.values(value)) deepFreeze(child, seen);
  return Object.freeze(value);
}

function assertBundle(bundle) {
  const profile = bundle?.profile;
  const semantic = bundle?.semantic;
  const provenance = bundle?.provenance;
  if (profile?.schema_version !== 'grh-profile-v1' || semantic?.schema_version !== 'grh-semantic-v2' ||
      provenance?.profileSchemaVersion !== profile.schema_version || provenance?.semanticSchemaVersion !== semantic.schema_version ||
      provenance?.sourceFile !== profile.source || provenance.sourceFile !== semantic?.source?.file ||
      provenance?.sourceSha256 !== profile.sha256 || provenance.sourceSha256 !== semantic?.source?.sha256 ||
      provenance?.approvedSourceSha256 !== provenance.sourceSha256 ||
      provenance?.snapshotAsOf !== profile.snapshot_as_of || provenance.snapshotAsOf !== semantic?.source?.snapshot_as_of ||
      profile?.canonical_source !== semantic?.source?.canonical_system ||
      profile?.compressed_size_bytes !== semantic?.source?.compressed_size_bytes) {
    throw catalogError('El bundle GRH no tiene una identidad aprobada para el catálogo.');
  }
  const dictionary = semantic.table_dictionary;
  if (!dictionary || !Array.isArray(dictionary.tables) || dictionary.tables.length !== dictionary.total_tables ||
      dictionary.non_empty_tables + dictionary.empty_tables !== dictionary.total_tables ||
      dictionary.tables.reduce((sum, table) => sum + table.rows, 0) !== dictionary.total_rows) {
    throw catalogError('El diccionario de tablas GRH no reconcilia.');
  }
  return { profile, semantic, provenance, dictionary };
}

function periodsFor(semantic, domainKey) {
  if (domainKey === null) return { first: null, last: null, status: 'not_available' };
  if (domainKey === 'workforce') {
    const period = semantic?.workforce?.reference_period;
    if (typeof period !== 'string') throw catalogError('El período de dotación no está disponible.');
    return { first: period, last: period, status: 'certified' };
  }
  const period = semantic?.period_quality?.[domainKey];
  if (!period?.first_valid_period || !period?.last_valid_period) return { first: null, last: null, status: 'not_available' };
  return {
    first: period.first_valid_period,
    last: period.last_valid_period,
    status: domainKey === 'licencia' ? 'historical' : 'certified',
  };
}

function tablePeriods(semantic, name) {
  return periodsFor(semantic, Object.hasOwn(semantic?.period_quality || {}, name) ? name : null);
}

function coverageFor(definition, semantic, rows) {
  if (definition.id === 'personas_estructura') {
    return [
      { id: 'calculo_join', label: 'Integridad cálculo ↔ legajo', value: semantic.coverage.facts.calculo.join_integrity_pct, unit: 'percent', status: 'verified' },
      { id: 'workforce_period', label: 'Participantes del período de referencia', value: semantic.workforce.payroll_participants, unit: 'rows', status: 'verified' },
    ];
  }
  if (definition.id === 'asistencia_tiempo') {
    return [
      { id: 'absence_valid_rate', label: 'Registros de ausencia válidos', value: semantic.period_quality.ausencia.valid_rate_pct, unit: 'percent', status: 'verified' },
      { id: 'absence_join', label: 'Integridad ausencia ↔ legajo', value: semantic.coverage.facts.ausencia.join_integrity_pct, unit: 'percent', status: 'verified' },
    ];
  }
  if (definition.id === 'licencias_salud') {
    return [
      { id: 'leave_valid_rate', label: 'Registros de licencia válidos', value: semantic.period_quality.licencia.valid_rate_pct, unit: 'percent', status: 'verified' },
      { id: 'leave_join', label: 'Integridad licencia ↔ legajo', value: semantic.coverage.facts.licencia.join_integrity_pct, unit: 'percent', status: 'verified' },
    ];
  }
  if (definition.id === 'nomina_control') {
    return [
      { id: 'calculation_valid_rate', label: 'Registros de cálculo válidos', value: semantic.period_quality.calculo.valid_rate_pct, unit: 'percent', status: 'verified' },
      { id: 'calculation_join', label: 'Integridad cálculo ↔ legajo', value: semantic.coverage.facts.calculo.join_integrity_pct, unit: 'percent', status: 'verified' },
    ];
  }
  if (definition.id === 'movimientos_trazabilidad') {
    return [
      { id: 'movement_valid_rate', label: 'Movimientos válidos', value: semantic.period_quality.legamov.valid_rate_pct, unit: 'percent', status: 'verified' },
      { id: 'movement_join', label: 'Integridad movimiento ↔ legajo', value: semantic.coverage.facts.legamov.join_integrity_pct, unit: 'percent', status: 'verified' },
    ];
  }
  return [{ id: 'catalogued_rows', label: 'Filas inventariadas', value: rows, unit: 'rows', status: 'informational' }];
}

export function buildGrhDomainCatalogProjection(bundle) {
  const { profile, semantic, provenance, dictionary } = assertBundle(bundle);
  const tableByName = new Map(dictionary.tables.map(table => [table.table, table]));
  const usedTables = new Set();
  const domains = DOMAIN_DEFINITIONS.map(definition => {
    const tables = definition.tables.map(name => {
      const table = tableByName.get(name);
      if (!table || usedTables.has(name) || !Number.isSafeInteger(table.rows) || table.rows < 0 ||
          !Number.isSafeInteger(table.columns) || table.columns < 0) {
        throw catalogError(`La tabla ${name} no cumple el diccionario gobernado.`);
      }
      usedTables.add(name);
      return {
        name,
        label: TABLE_LABELS[name] || name,
        rows: table.rows,
        columns: table.columns,
        status: table.rows > 0 ? 'available' : 'empty',
        periods: tablePeriods(semantic, name),
      };
    });
    const rows = tables.reduce((sum, table) => sum + table.rows, 0);
    return {
      id: definition.id,
      title: definition.title,
      status: definition.status,
      summary: definition.summary,
      counts: {
        tables: tables.length,
        nonEmptyTables: tables.filter(table => table.rows > 0).length,
        rows,
      },
      tables,
      coverage: coverageFor(definition, semantic, rows),
      periods: periodsFor(semantic, definition.periodDomain),
      questions: [...definition.questions],
      actions: definition.actions.map(action => ({ ...action })),
    };
  });
  const mappedTables = domains.reduce((sum, domain) => sum + domain.counts.tables, 0);
  const mappedRows = domains.reduce((sum, domain) => sum + domain.counts.rows, 0);
  const projection = {
    schemaVersion: GRH_DOMAIN_CATALOG_SCHEMA_VERSION,
    source: {
      canonicalSystem: profile.canonical_source,
      sourceFile: provenance.sourceFile,
      sourceSha256: provenance.sourceSha256,
      snapshotAsOf: provenance.snapshotAsOf,
      generatedAt: semantic.source.generated_at,
      realtime: false,
    },
    lineage: {
      profileSchemaVersion: profile.schema_version,
      semanticSchemaVersion: semantic.schema_version,
      dictionaryProjection: 'table_dictionary_governed_projection',
    },
    privacy: {
      aggregateMetadataOnly: true,
      containsPersonRecords: false,
      containsFinancialAmounts: false,
    },
    counts: {
      totalTables: dictionary.total_tables,
      nonEmptyTables: dictionary.non_empty_tables,
      emptyTables: dictionary.empty_tables,
      totalRows: dictionary.total_rows,
      mappedTables,
      mappedRows,
      domainCount: domains.length,
    },
    domains,
  };
  const inspection = inspectGrhDomainCatalogContract(projection);
  if (!inspection.ok) throw catalogError(`La proyección de dominios no cumple contrato: ${inspection.errors.join(',')}`);
  return deepFreeze(projection);
}
