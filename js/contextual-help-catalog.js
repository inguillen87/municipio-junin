const CONTRACT = 'muniguia-contextual-v1';
const ACCESS_POLICY_VERSION = '2026-08-09.1';
const MOUNT_CAPABILITY = 'navigation.help';

const KNOWN_CAPABILITIES = Object.freeze([
  'session.read',
  'navigation.workspace',
  'navigation.dashboard',
  'navigation.reports',
  'navigation.hacienda',
  'navigation.grh-executive',
  'navigation.data-quality',
  'navigation.rrhh',
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
    intent: 'Usá únicamente Inicio y Ayuda; solicitá una asignación formal si tu función requiere otro módulo.',
    focusCapabilities: ['navigation.help'],
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
    intent: 'Seguí sólo procedimientos y casos formalmente asignados; la interfaz no inventa expedientes ni personas.',
    focusCapabilities: ['navigation.help'],
  },
  DEMO: {
    variant: 'controlled-preview',
    label: 'Vista controlada',
    intent: 'Explorá el alcance documentado sin simular capacidades, datos o autorización ausentes.',
    focusCapabilities: ['navigation.help'],
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
      { id: 'prioritize-alert', selector: '#alertsList', title: 'Priorizá una revisión', copy: 'Elegí una alerta con evidencia disponible y profundizá sólo en una superficie autorizada.' },
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
    label: 'Hacienda',
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
    href: 'grh-ejecutivo.html',
    aliases: ['/grh-ejecutivo', '/grh-ejecutivo.html'],
    label: 'Centro Ejecutivo GRH',
    objective: 'Profundizá en agregados GRH preservando privacidad, linaje y período.',
    requiredCapability: 'navigation.grh-executive',
    manualAnchor: 'fuente',
    steps: [
      { id: 'bound-window', selector: '#periodRange', title: 'Delimitá la ventana', copy: 'Confirmá el rango observado y evitá presentar un snapshot histórico como tiempo real.' },
      { id: 'read-evidence', selector: '#executiveInsights', title: 'Leé la evidencia agregada', copy: 'Interpretá sólo métricas liberadas y mantené visible cualquier supresión por privacidad.' },
      { id: 'confirm-periods', selector: '#periodTableTitle', title: 'Confirmá los períodos', copy: 'Usá la tabla para distinguir observación disponible, hueco protegido y ausencia de fuente.' },
    ],
  },
  quality: {
    href: 'control.html',
    aliases: ['/control', '/control.html'],
    label: 'Calidad y Linaje',
    objective: 'Determiná si el snapshot es apto antes de reutilizar sus resultados.',
    requiredCapability: 'navigation.data-quality',
    manualAnchor: 'seguridad',
    steps: [
      { id: 'identify-source', selector: '#snapshotMeta', title: 'Identificá la fuente', copy: 'Confirmá SHA, corte y cobertura; una pantalla saludable no reemplaza la identidad del artefacto.' },
      { id: 'follow-lineage', selector: '#lineageTitle', title: 'Seguí el linaje', copy: 'Revisá origen, validación y publicación para saber qué transformación sostiene cada salida.' },
      { id: 'close-risks', selector: '#riskTitle', title: 'Cerrá con los riesgos', copy: 'Registrá cuarentena, discrepancias y límites antes de habilitar una decisión o exportación.' },
    ],
  },
  rrhh: {
    href: 'rrhh.html',
    aliases: ['/rrhh', '/rrhh.html'],
    label: 'RRHH',
    objective: 'Leé participación y eventos agregados sin reconstruir fichas personales.',
    requiredCapability: 'navigation.rrhh',
    manualAnchor: 'seguridad',
    steps: [
      { id: 'wait-validation', selector: '#connectionStatus', title: 'Esperá la validación', copy: 'No interpretes la pantalla hasta que los contratos ejecutivo y de calidad estén conciliados.' },
      { id: 'separate-populations', selector: '#rrhhHeroTitle', title: 'Separá las poblaciones', copy: 'Participantes observados no equivalen automáticamente a planta activa ni a personas únicas actuales.' },
      { id: 'review-coverage', selector: '#coverageTitle', title: 'Verificá la cobertura', copy: 'Confirmá años, períodos y celdas protegidas antes de comparar ausencias o movimientos.' },
    ],
  },
  assistant: {
    href: 'ia.html',
    aliases: ['/ia', '/ia.html'],
    label: 'Asistente GRH',
    objective: 'Formulá consultas deterministas limitadas a la evidencia gobernada.',
    requiredCapability: 'navigation.ai-assistant',
    manualAnchor: 'superficies',
    steps: [
      { id: 'confirm-evidence', selector: '#snapshotStatus', title: 'Confirmá la evidencia', copy: 'Verificá que el snapshot esté disponible antes de formular una pregunta.' },
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

export function resolveMuniGuiaContext(input) {
  if (!exactInput(input) || input.policyVersion !== ACCESS_POLICY_VERSION) return null;
  const role = ROLES[input.role];
  if (!role || input.variant !== role.variant) return null;
  const capabilities = validCapabilities(input.capabilities);
  if (!capabilities || !capabilities.includes('session.read') ||
      !capabilities.includes('navigation.workspace') || !capabilities.includes(MOUNT_CAPABILITY)) return null;
  const resolvedPage = pageForPathname(input.pathname);
  if (!resolvedPage || !capabilities.includes(resolvedPage.page.requiredCapability)) return null;

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
      objective: resolvedPage.page.objective,
      manualHref: `manuales.html#${resolvedPage.page.manualAnchor}`,
      steps: resolvedPage.page.steps.map((step) => ({ ...step })),
    },
    related,
  });
}

export { CATALOG as MUNIGUIA_CATALOG };
