const CONTRACT = 'muniguia-contextual-v1';
const ACCESS_POLICY_VERSION = '2026-08-11.3';
const MOUNT_CAPABILITY = 'navigation.help';

const KNOWN_CAPABILITIES = Object.freeze([
  'session.read',
  'navigation.workspace',
  'navigation.dashboard',
  'navigation.reports',
  'navigation.hacienda',
  'navigation.grh-executive',
  'navigation.organization-analytics',
  'navigation.territory',
  'navigation.data-quality',
  'navigation.rrhh',
  'navigation.grh-decisions',
  'navigation.ai-assistant',
  'navigation.audit',
  'navigation.export',
  'navigation.import',
  'navigation.help',
]);

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  Object.getOwnPropertyNames(value).forEach((key) => deepFreeze(value[key]));
  return Object.freeze(value);
}

const ROLES = deepFreeze({
  SUPER_ADMIN: {
    variant: 'platform-governance',
    label: 'Gobierno de plataforma',
    intent: 'Validá política, tenant y evidencia técnica sin convertir soporte en acceso ambiental a datos.',
    focusCapabilities: ['navigation.audit', 'navigation.import', 'navigation.data-quality'],
  },
  INTENDENTE: {
    variant: 'executive-leadership',
    label: 'Intendencia',
    intent: 'Convertí el snapshot autorizado en una decisión verificable, con corte, calidad y límites visibles.',
    focusCapabilities: ['navigation.dashboard', 'navigation.grh-executive', 'navigation.reports'],
  },
  TENANT_ADMIN: {
    variant: 'municipal-operations',
    label: 'Administración municipal',
    intent: 'Prepará fuentes trazables y controles antes de ampliar la operación del municipio.',
    focusCapabilities: ['navigation.import', 'navigation.audit', 'navigation.data-quality'],
  },
  TENANT_USER: {
    variant: 'municipal-limited',
    label: 'Usuario municipal',
    intent: 'Consultá la referencia territorial oficial y la ayuda institucional sin asumir acceso a expedientes, personas u operaciones.',
    focusCapabilities: ['navigation.territory', 'navigation.help'],
  },
  CONTADOR: {
    variant: 'financial-control',
    label: 'Contaduría',
    intent: 'Separá cálculo, conciliación y evidencia contable antes de considerar cerrado un período.',
    focusCapabilities: ['navigation.hacienda', 'navigation.reports', 'navigation.data-quality'],
  },
  INSPECTOR: {
    variant: 'territorial-unassigned',
    label: 'Inspección',
    intent: 'Usá límites y localidades oficiales como referencia; la interfaz no inventa expedientes, domicilios ni personas.',
    focusCapabilities: ['navigation.territory', 'navigation.help'],
  },
  DEMO: {
    variant: 'controlled-preview',
    label: 'Vista controlada',
    intent: 'Explorá la referencia territorial y el alcance documentado sin simular capas operativas, datos o autorizaciones ausentes.',
    focusCapabilities: ['navigation.territory', 'navigation.help'],
  },
});

const PAGES = deepFreeze({
  workspace: {
    href: 'inicio.html',
    aliases: ['/inicio', '/inicio.html'],
    label: 'Inicio institucional',
    objective: 'Ordená el trabajo desde el contexto que confirmó el servidor.',
    requiredCapability: 'navigation.workspace',
    manualAnchor: 'roles',
    steps: [
      { id: 'confirm-context', selector: '#roleChip', title: 'Confirmá tu contexto', copy: 'Verificá el rol y el tenant visibles antes de interpretar accesos o comenzar una revisión.' },
      { id: 'frame-question', selector: '#workspaceQuestion', title: 'Empezá por la pregunta correcta', copy: 'Usá la pregunta de entrada para priorizar una decisión concreta, no para recorrer módulos sin propósito.' },
      { id: 'choose-authorized-action', selector: '#workspaceActions', title: 'Abrí sólo lo habilitado', copy: 'Elegí una acción proyectada por el servidor y conservá los límites declarados para tu perfil.' },
    ],
  },
  dashboard: {
    href: 'dashboard.html',
    aliases: ['/dashboard', '/dashboard.html'],
    label: 'Panel ejecutivo',
    objective: 'Pasá de una alerta agregada a una revisión respaldada por evidencia.',
    requiredCapability: 'navigation.dashboard',
    manualAnchor: 'interpretacion',
    steps: [
      { id: 'confirm-snapshot', selector: '#snapshotChip', title: 'Confirmá el corte', copy: 'Revisá fecha, fuente y estado del snapshot antes de comparar indicadores o tomar una decisión.' },
      { id: 'read-close', selector: '#monthlyCloseBrief', title: 'Leé el cierre mensual', copy: 'Separá participantes, calidad, conciliación y límites; el cálculo no demuestra pago ni causalidad.' },
      { id: 'review-decision-brief', selector: '#decisionBrief', title: 'Revisá el brief decisional', copy: 'Separá la señal global de la evidencia mensual y profundizá sólo mediante una acción autorizada para tu perfil.' },
    ],
  },
  reports: {
    href: 'reportes.html',
    aliases: ['/reportes', '/reportes.html'],
    label: 'Reportes ejecutivos',
    objective: 'Prepará una salida agregada sin perder período, fuente ni controles.',
    requiredCapability: 'navigation.reports',
    manualAnchor: 'exportaciones',
    steps: [
      { id: 'choose-period', selector: '#period-selector', title: 'Elegí un período liberado', copy: 'Usá únicamente períodos publicados por el contrato; una celda protegida no se completa con cero.' },
      { id: 'read-summary', selector: '#executive-summary-title', title: 'Interpretá el resumen', copy: 'Confirmá participantes, unidad y alcance antes de reutilizar una cifra fuera de la pantalla.' },
      { id: 'review-controls', selector: '#tab-btn-control', title: 'Revisá los controles', copy: 'Abrí Control para verificar identidad, tolerancia y límites antes de imprimir o exportar.' },
    ],
  },
  hacienda: {
    href: 'hacienda.html',
    aliases: ['/hacienda', '/hacienda.html'],
    label: 'Hacienda y nómina',
    objective: 'Revisá cálculo y conciliación mensual sin convertirlos en evidencia bancaria.',
    requiredCapability: 'navigation.hacienda',
    manualAnchor: 'interpretacion',
    steps: [
      { id: 'fix-period', selector: '#closePeriodSelect', title: 'Fijá el período', copy: 'Seleccioná un mes liberado y mantené visible el corte del snapshot usado en la revisión.' },
      { id: 'review-reconciliation', selector: '#closeReconciliationTitle', title: 'Revisá la conciliación', copy: 'Contrastá cálculo y control complementario sólo con la serie mensual publicada.' },
      { id: 'explain-difference', selector: '#closeComparisonTitle', title: 'Documentá la diferencia', copy: 'Registrá la variación observada sin afirmar pago, moneda no declarada o una causa no demostrada.' },
    ],
  },
  grhExecutive: {
    href: 'ejecutivo.html',
    aliases: ['/ejecutivo', '/ejecutivo.html', '/grh-ejecutivo', '/grh-ejecutivo.html'],
    label: 'Resumen ejecutivo GRH',
    objective: 'Profundizá en agregados GRH preservando privacidad, linaje y período.',
    requiredCapability: 'navigation.grh-executive',
    manualAnchor: 'fuente',
    steps: [
      { id: 'bound-window', selector: '#periodRange', title: 'Delimitá la ventana', copy: 'Confirmá el rango observado y evitá presentar un snapshot histórico como tiempo real.' },
      { id: 'read-evidence', selector: '#executiveInsights', title: 'Leé la evidencia agregada', copy: 'Interpretá sólo métricas liberadas y mantené visible cualquier supresión por privacidad.' },
      { id: 'confirm-periods', selector: '#periodTableTitle', title: 'Confirmá los períodos', copy: 'Revisá la serie y abrí su detalle tabular para distinguir observación disponible, hueco protegido y ausencia de fuente.' },
    ],
  },
  organizationAnalytics: {
    href: 'estructura.html',
    aliases: ['/estructura', '/estructura.html'],
    label: 'Estructura y áreas de costo',
    objective: 'Usá la sala de situación para explorar clasificaciones GRH, áreas de costo del cálculo y señales históricas con sus universos visibles.',
    requiredCapability: 'navigation.organization-analytics',
    manualAnchor: 'interpretacion',
    steps: [
      { id: 'confirm-organization-snapshot', selector: '#organizationSnapshotStatus', title: 'Confirmá fuente y corte', copy: 'Revisá la fuente, la fecha del snapshot y la cobertura antes de interpretar las comparaciones.' },
      { id: 'explore-organization', selector: '#organizationExplorer', title: 'Explorá estructura y áreas de costo', copy: 'Elegí una clasificación o área de costo observada, revisá su universo y abrí sólo las acciones compatibles.' },
      { id: 'compare-cost-centers', selector: '#costCenterComparator', title: 'Compará dos áreas de costo', copy: 'Contrastá participación en la cohorte actual y 24 niveles mensuales de control de cálculo. Para componentes y evidencia detallada, abrí cada área en Hacienda.' },
    ],
  },
  movementOperations: {
    href: 'movimientos-grh.html',
    aliases: ['/movimientos-grh', '/movimientos-grh.html'],
    label: 'Movimientos y trazabilidad',
    objective: 'Compará movimientos registrados por año y revisá su calidad sin inferir altas, bajas ni rotación.',
    requiredCapability: 'navigation.organization-analytics',
    manualAnchor: 'interpretacion',
    steps: [
      { id: 'confirm-movement-source', selector: '#movementSourceEvidence', title: 'Confirmá fuente y corte', copy: 'Revisá tabla, archivo, corte y política antes de interpretar la serie histórica.' },
      { id: 'explore-movement-series', selector: '#movementChartTitle', title: 'Elegí indicador y ventana', copy: 'Compará movimientos, participantes o intensidad sin mezclar años completos con el año parcial del corte.' },
      { id: 'compare-complete-years', selector: '#movementComparisonPanel', title: 'Contrastá años completos', copy: 'Usá sólo años completos publicados y conservá visible que la variación no clasifica altas, bajas ni rotación.' },
    ],
  },
  territory: {
    href: 'territorio.html',
    aliases: ['/territorio', '/territorio.html'],
    label: 'Centro territorial',
    objective: 'Ubicá el partido y sus localidades mediante referencias oficiales, con fuente y límites visibles.',
    requiredCapability: 'navigation.territory',
    manualAnchor: 'superficies',
    steps: [
      { id: 'read-territory-map', selector: '#territoryMap', title: 'Ubicá la referencia', copy: 'Usá el mapa como referencia oficial del partido y sus localidades; no lo interpretes como una capa operativa municipal.' },
      { id: 'review-localities', selector: '#territoryLocalities', title: 'Revisá las localidades', copy: 'Consultá nombres y ubicación publicados por la fuente sin inferir cobertura, población ni situación de servicios.' },
      { id: 'confirm-territory-sources', selector: '#territorySources', title: 'Confirmá las fuentes', copy: 'Verificá IGN, GeoRef, corte y límites antes de reutilizar una geometría o presentar el tablero a terceros.' },
    ],
  },
  quality: {
    href: 'calidad.html',
    aliases: ['/calidad', '/calidad.html', '/control', '/control.html'],
    label: 'Calidad de datos',
    objective: 'Verificá si los datos son confiables antes de reutilizar sus resultados.',
    requiredCapability: 'navigation.data-quality',
    manualAnchor: 'seguridad',
    steps: [
      { id: 'identify-source', selector: '#snapshotMeta', title: 'Identificá la fuente', copy: 'Confirmá SHA, corte y cobertura; una pantalla saludable no reemplaza la identidad del artefacto.' },
      { id: 'follow-lineage', selector: '#lineageTitle', title: 'Seguí el linaje', copy: 'Revisá origen, validación y publicación para saber qué transformación sostiene cada salida.' },
      { id: 'close-risks', selector: '#riskTitle', title: 'Cerrá con los riesgos', copy: 'Registrá cuarentena, discrepancias y límites antes de habilitar una decisión o exportación.' },
    ],
  },
  grhDomains: {
    href: 'areas-grh.html',
    aliases: ['/areas-grh', '/areas-grh.html'],
    label: 'Mapa de datos GRH',
    objective: 'Explorá los dominios reales de la fuente y elegí el siguiente análisis desde su cobertura verificable.',
    requiredCapability: 'navigation.rrhh',
    manualAnchor: 'fuente',
    steps: [
      { id: 'confirm-domain-source', selector: '#grhSourceStatus', title: 'Confirmá fuente y corte', copy: 'Esperá la validación del catálogo y revisá el corte publicado antes de interpretar tablas, períodos o coberturas.' },
      { id: 'choose-domain', selector: '#grhDomainGrid', title: 'Elegí un dominio', copy: 'Recorré los ocho dominios de datos y seleccioná el que corresponda a la pregunta de gestión que necesitás responder.' },
      { id: 'inspect-domain-evidence', selector: '#grhEvidenceTitle', title: 'Revisá la evidencia', copy: 'Contrastá tablas, filas, período, cobertura y acciones disponibles antes de continuar al tablero especializado.' },
    ],
  },
  grhDecisions: {
    href: 'decisiones-grh.html',
    aliases: ['/decisiones-grh', '/decisiones-grh.html'],
    label: 'Centro de decisiones GRH',
    objective: 'Revisá prioridades y compromisos con responsable, fecha y trazabilidad.',
    requiredCapability: 'navigation.grh-decisions',
    manualAnchor: 'decisiones-compromisos',
    steps: [
      { id: 'read-decision-summary', selector: '#decisionSummary', title: 'Leé la situación', copy: 'Revisá abiertos, bloqueados, vencidos y completados antes de consultar o actualizar un compromiso.' },
      { id: 'confirm-decision-suggestion', selector: '#decisionSuggestions', title: 'Revisá la prioridad', copy: 'Contrastá la sugerencia con el brief vigente y usá sólo las acciones que el servidor habilite para tu perfil.' },
      { id: 'follow-decision-commitments', selector: '#decisionCommitments', title: 'Seguí la evolución', copy: 'Abrí el detalle para revisar versión, transiciones autorizadas y línea de tiempo antes de actuar.' },
    ],
  },
  rrhh: {
    href: 'rrhh.html',
    aliases: ['/rrhh', '/rrhh.html'],
    label: 'RRHH',
    objective: 'Analizá la dotación agregada y usá el directorio sólo cuando tu identidad privada esté habilitada.',
    requiredCapability: 'navigation.rrhh',
    manualAnchor: 'seguridad',
    steps: [
      { id: 'wait-validation', selector: '#connectionStatus', title: 'Esperá la validación', copy: 'No interpretes la pantalla hasta que los contratos ejecutivo y de calidad estén conciliados.' },
      { id: 'confirm-directory-mode', selector: '#peopleDirectory', title: 'Verificá el modo del directorio', copy: 'La vista pública conserva sólo agregados; una identidad privada habilitada permite buscar y abrir fichas del snapshot.' },
      { id: 'review-coverage', selector: '#coverageTitle', title: 'Verificá la cobertura', copy: 'Confirmá años, períodos y celdas protegidas antes de comparar ausencias o movimientos.' },
    ],
  },
  assistant: {
    href: 'ia.html',
    aliases: ['/ia', '/ia.html'],
    label: 'Asistente GRH',
    objective: 'Consultá evidencia GRH verificada y profundizá mediante visuales y acciones del resultado.',
    requiredCapability: 'navigation.ai-assistant',
    manualAnchor: 'superficies',
    steps: [
      { id: 'confirm-evidence', selector: '#assistantSourceStatus', title: 'Confirmá la evidencia', copy: 'Revisá el estado visible de la fuente antes de formular una pregunta.' },
      { id: 'choose-supported-question', selector: '#querySuggestions', title: 'Elegí un tema soportado', copy: 'Usá las sugerencias gobernadas; no ingreses PII, secretos ni pedidos fuera del contrato GRH.' },
      { id: 'ask-with-scope', selector: '#assistantForm', title: 'Preguntá con alcance', copy: 'Incluí período y métrica; tratá la respuesta como síntesis de evidencia, no como causalidad o acto administrativo.' },
    ],
  },
  audit: {
    href: 'auditoria.html',
    aliases: ['/auditoria', '/auditoria.html'],
    label: 'Inventario de cargas',
    objective: 'Revisá metadatos y estado sin confundir inventario con auditoría institucional.',
    requiredCapability: 'navigation.audit',
    manualAnchor: 'superficies',
    steps: [
      { id: 'read-scope', selector: '#audit-status', title: 'Leé el alcance', copy: 'Confirmá qué fuentes están inventariadas y cuáles permanecen condicionadas o excluidas.' },
      { id: 'review-datasets', selector: '#datasets-table', title: 'Revisá los metadatos', copy: 'Usá nombre gobernado, estado, corte y calidad; no abras ni publiques filas crudas.' },
      { id: 'separate-history', selector: '#timeline-list', title: 'Diferenciá actividad de auditoría', copy: 'La cronología visible no reemplaza un log inmutable, firmado y revisado por responsables.' },
    ],
  },
  export: {
    href: 'exportar.html',
    aliases: ['/exportar', '/exportar.html'],
    label: 'Salidas gobernadas',
    objective: 'Prepará una salida protegida y verificable antes de distribuirla.',
    requiredCapability: 'navigation.export',
    manualAnchor: 'exportaciones',
    steps: [
      { id: 'read-export-scope', selector: '#mainContent', title: 'Confirmá el alcance', copy: 'Revisá qué salida está habilitada y qué datos permanecen excluidos del contrato.' },
      { id: 'choose-governed-output', selector: '#tab-financiero', title: 'Elegí una salida gobernada', copy: 'Usá sólo el informe autorizado; no reconstruyas exportaciones crudas desde el navegador.' },
      { id: 'separate-session-history', selector: '#recentTable', title: 'Revisá el registro visible', copy: 'Diferenciá actividad de esta sesión de un historial institucional persistente y auditable.' },
    ],
  },
  import: {
    href: 'importar.html',
    aliases: ['/importar', '/importar.html'],
    label: 'Importar datos',
    objective: 'Ingresá una fuente autorizada con finalidad, período y validación explícitos.',
    requiredCapability: 'navigation.import',
    manualAnchor: 'acceso',
    steps: [
      { id: 'bound-source', selector: '#hubMain', title: 'Delimitá fuente y finalidad', copy: 'Cargá sólo el archivo aprobado para esta tarea; un backup completo no es un atajo aceptable.' },
      { id: 'declare-period', selector: '#importPeriod', title: 'Declará el período', copy: 'Indicá el corte que representa la carga para evitar mezclar observaciones incompatibles.' },
      { id: 'review-results', selector: '#fileList', title: 'Revisá resultados y rechazos', copy: 'No publiques hasta validar formato, esquema, cuarentena y trazabilidad de la carga.' },
    ],
  },
  manuals: {
    href: 'manuales.html',
    aliases: ['/manuales', '/manuales.html'],
    label: 'Manual y ayuda',
    objective: 'Encontrá el procedimiento vigente y verificá el estado real de cada capacidad.',
    requiredCapability: 'navigation.help',
    manualAnchor: 'roles',
    steps: [
      { id: 'find-role', selector: '#roles', title: 'Ubicá tu responsabilidad', copy: 'Empezá por el recorrido del rol confirmado; el manual no concede permisos ni crea cuentas.' },
      { id: 'confirm-surface', selector: '#superficies', title: 'Confirmá el estado', copy: 'Diferenciá capacidad operativa, condicionada y futura antes de intentar usar una superficie.' },
      { id: 'operate-safely', selector: '#seguridad', title: 'Aplicá los controles', copy: 'Conservá tenant, privacidad, fuente y respuesta fail-closed en cada procedimiento.' },
    ],
  },
});

const CATALOG = deepFreeze({
  contract: CONTRACT,
  accessPolicyVersion: ACCESS_POLICY_VERSION,
  mountCapability: MOUNT_CAPABILITY,
  roles: ROLES,
  pages: PAGES,
});

function exactInput(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const keys = Object.keys(value).sort();
  const expected = ['capabilities', 'pathname', 'policyVersion', 'role', 'variant'].sort();
  return keys.length === expected.length && keys.every((key, index) => key === expected[index]);
}

function validCapabilities(capabilities) {
  if (!Array.isArray(capabilities) || capabilities.length === 0) return null;
  const unique = [];
  for (const capability of capabilities) {
    if (typeof capability !== 'string' || !KNOWN_CAPABILITIES.includes(capability) || unique.includes(capability)) return null;
    unique.push(capability);
  }
  return unique;
}

function pageForPathname(pathname) {
  if (typeof pathname !== 'string' || pathname !== pathname.toLowerCase() || pathname.includes('%') || pathname.includes('\\')) return null;
  const entries = Object.entries(PAGES);
  for (const [id, page] of entries) {
    if (page.aliases.includes(pathname)) return { id, page };
  }
  return null;
}

function pageForCapability(capability) {
  for (const [id, page] of Object.entries(PAGES)) {
    if (page.requiredCapability === capability) return { id, page };
  }
  return null;
}

function projectPage(page) {
  return {
    objective: page.objective,
    steps: page.steps.map((step) => ({ ...step })),
  };
}

export function resolveMuniGuiaContext(input) {
  if (!exactInput(input) || input.policyVersion !== ACCESS_POLICY_VERSION) return null;
  const role = ROLES[input.role];
  if (!role || input.variant !== role.variant) return null;
  const capabilities = validCapabilities(input.capabilities);
  if (!capabilities || !capabilities.includes('session.read') ||
      !capabilities.includes('navigation.workspace') || !capabilities.includes(MOUNT_CAPABILITY)) return null;
  const resolvedPage = pageForPathname(input.pathname);
  if (!resolvedPage || !capabilities.includes(resolvedPage.page.requiredCapability)) return null;
  const pageProjection = projectPage(resolvedPage.page);

  let related = null;
  for (const capability of role.focusCapabilities) {
    if (!capabilities.includes(capability)) continue;
    const candidate = pageForCapability(capability);
    if (!candidate || candidate.id === resolvedPage.id) continue;
    related = {
      capability,
      href: candidate.page.href,
      label: candidate.page.label,
    };
    break;
  }

  return deepFreeze({
    contract: CONTRACT,
    role: {
      id: input.role,
      label: role.label,
      intent: role.intent,
    },
    page: {
      id: resolvedPage.id,
      label: resolvedPage.page.label,
      objective: pageProjection.objective,
      manualHref: `manuales.html#${resolvedPage.page.manualAnchor}`,
      steps: pageProjection.steps,
    },
    related,
  });
}

export { CATALOG as MUNIGUIA_CATALOG };
