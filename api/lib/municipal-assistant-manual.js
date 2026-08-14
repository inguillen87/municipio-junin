export const MUNICIPAL_MANUAL_CONTRACT_VERSION = 'municipal-assistant-manual-v1';

const MANUAL_VERSION = '1.10.0';
const MANUAL_REVIEWED_AT = '2026-08-13';

const EXACT_SCREEN_HELP_TOPICS = new Map([
  ['¿Cómo uso el resumen general de MuniControl?', 'overview'],
  ['¿Cómo interpreto el panorama y las prioridades del tablero ejecutivo?', 'overview'],
  ['¿Cómo comparo las dos gestiones al mismo avance?', 'managementTimeline'],
  ['¿Cómo interpreto el resumen ejecutivo GRH?', 'overview'],
  ['¿Cómo interpreto el resumen agregado de RRHH?', 'overview'],
  ['¿Cómo reviso Hacienda, nómina y el cálculo mensual?', 'hacienda'],
  ['¿Cómo reviso el control de corridas y marcas de cierre?', 'payrollRuns'],
  ['¿Cómo uso Estructura y centros de costo?', 'structure'],
  ['¿Cómo interpreto la trayectoria laboral documentada?', 'trajectory'],
  ['¿Cómo interpreto la trayectoria y los movimientos documentados?', 'trajectory'],
  ['¿Cómo verifico la fuente del Centro territorial?', 'territory'],
  ['¿Cómo uso las prioridades del Centro de decisiones GRH?', 'decisions'],
].map(([question, topic]) => [normalize(question), topic]));

const TOPICS = Object.freeze({
  reports: Object.freeze({
    title: 'Crear y revisar un reporte',
    summary: 'Abrí Reportes, elegí un período publicado y verificá fuente, fecha y límites antes de imprimir o exportar.',
    findings: Object.freeze([
      'El Centro de Reportes trabaja con períodos ofrecidos por la fuente; no reemplaza un mes faltante por otro.',
      'Los gráficos y el documento deben conservar la unidad informada, la privacidad k≥10 y la fecha del corte.',
      'Si la fuente no valida, el flujo se bloquea y ofrece un reintento manual.',
    ]),
    sourceFile: 'docs/MANUAL_USUARIO_Y_FUNCIONARIOS.md',
    anchor: 'exportaciones',
    actions: Object.freeze([
      Object.freeze({ id: 'open_reports', label: 'Abrir Centro de Reportes', href: '/reportes.html', requiredCapability: 'navigation.reports' }),
      Object.freeze({ id: 'open_manual_reports', label: 'Ver guía de reportes', href: '/manuales.html#exportaciones', requiredCapability: 'navigation.help' }),
    ]),
  }),
  imports: Object.freeze({
    title: 'Cargar información con control',
    summary: 'Las cargas se hacen desde Importar, con un archivo autorizado, revisión previa y trazabilidad del resultado.',
    findings: Object.freeze([
      'Confirmá primero la fuente, el responsable, el período y el alcance municipal del archivo.',
      'La pantalla de importación no concede permisos: sólo los perfiles con la capability correspondiente ven la acción.',
      'Una carga no se considera integrada hasta validar estructura, calidad, duplicados y publicación gobernada.',
    ]),
    sourceFile: 'docs/MANUAL_TECNICO_Y_PROCEDIMIENTOS.md',
    anchor: 'acceso',
    actions: Object.freeze([
      Object.freeze({ id: 'open_import', label: 'Abrir Importar', href: '/importar.html', requiredCapability: 'navigation.import' }),
      Object.freeze({ id: 'open_manual_access', label: 'Ver guía de acceso', href: '/manuales.html#acceso', requiredCapability: 'navigation.help' }),
    ]),
  }),
  directory: Object.freeze({
    title: 'Buscar una ficha de RRHH',
    summary: 'Abrí RRHH y usá el directorio privado; la búsqueda nominal sólo funciona para una cuenta expresamente habilitada.',
    findings: Object.freeze([
      'La vista agregada no expone nombres, legajos ni licencias individuales.',
      'El servidor vuelve a validar perfil, municipio, alcance y vigencia antes de cada lectura nominal.',
      'Los accesos a fichas privadas quedan registrados y no se trasladan como datos personales en la URL.',
    ]),
    sourceFile: 'docs/MANUAL_USUARIO_Y_FUNCIONARIOS.md',
    anchor: 'seguridad',
    actions: Object.freeze([
      Object.freeze({ id: 'open_rrhh', label: 'Abrir RRHH', href: '/rrhh', requiredCapability: 'navigation.rrhh' }),
      Object.freeze({ id: 'open_private_login', label: 'Ingresar con acceso privado', href: '/login.html' }),
    ]),
  }),
  roles: Object.freeze({
    title: 'Entender roles y permisos',
    summary: 'Cada perfil ve un espacio distinto; el menú orienta, pero la autorización real se valida en el servidor.',
    findings: Object.freeze([
      'El rol define capacidades de navegación y cada API vuelve a comprobar la operación solicitada.',
      'No existe herencia automática ni un permiso comodín para roles desconocidos.',
      'Si una opción no está habilitada, el paso correcto es revisar la asignación institucional, no cambiar la URL.',
    ]),
    sourceFile: 'docs/ROLE_JOURNEYS_AND_SECURE_DEMO.md',
    anchor: 'roles',
    actions: Object.freeze([
      Object.freeze({ id: 'open_roles_manual', label: 'Ver recorridos por rol', href: '/manuales.html#roles', requiredCapability: 'navigation.help' }),
    ]),
  }),
  quality: Object.freeze({
    title: 'Verificar origen y calidad',
    summary: 'Abrí Calidad para comprobar fuente, fecha de corte, cobertura, cuarentena y diferencias antes de usar una cifra.',
    findings: Object.freeze([
      'Una métrica debe conservar su fuente, período, cobertura y límites de interpretación.',
      'Los registros anómalos se informan como cuarentena; no se corrigen ni ocultan automáticamente.',
      'Una diferencia entre fuentes es una señal para revisar, no una explicación causal.',
    ]),
    sourceFile: 'docs/MANUAL_USUARIO_Y_FUNCIONARIOS.md',
    anchor: 'fuente',
    actions: Object.freeze([
      Object.freeze({ id: 'open_quality', label: 'Abrir Calidad y linaje', href: '/control.html', requiredCapability: 'navigation.data-quality' }),
      Object.freeze({ id: 'open_manual_source', label: 'Ver guía de fuentes', href: '/manuales.html#fuente', requiredCapability: 'navigation.help' }),
    ]),
  }),
  overview: Object.freeze({
    title: 'Interpretar el panorama municipal',
    summary: 'Usá Inicio, el Panel ejecutivo o el Resumen GRH para ubicar el corte disponible, reconocer prioridades y abrir la evidencia que corresponda. No leas una tarjeta aislada como una explicación causal.',
    findings: Object.freeze([
      'Confirmá fuente, fecha de corte y cobertura antes de comparar indicadores de pantallas distintas.',
      'Las prioridades ordenan la revisión; no reemplazan una decisión administrativa ni prueban la causa de una variación.',
      'Profundizá desde la acción autorizada de cada tarjeta y conservá visibles las advertencias del dato.',
    ]),
    sourceFile: 'docs/MANUAL_USUARIO_Y_FUNCIONARIOS.md',
    anchor: 'interpretacion',
    actions: Object.freeze([
      Object.freeze({ id: 'open_dashboard', label: 'Abrir Panel ejecutivo', href: '/dashboard.html', requiredCapability: 'navigation.dashboard' }),
      Object.freeze({ id: 'open_grh_executive', label: 'Abrir Resumen ejecutivo GRH', href: '/ejecutivo.html', requiredCapability: 'navigation.grh-executive' }),
      Object.freeze({ id: 'open_manual_interpretation', label: 'Ver guía de interpretación', href: '/manuales.html#interpretacion', requiredCapability: 'navigation.help' }),
    ]),
  }),
  hacienda: Object.freeze({
    title: 'Revisar Hacienda y nómina',
    summary: 'Fijá un período publicado, revisá los componentes del cálculo y contrastá la conciliación informada sin presentarla como evidencia de pago bancario.',
    findings: Object.freeze([
      'Mantené visible el período, la unidad monetaria declarada y la fecha del snapshot durante toda la revisión.',
      'Separá bruto, retenciones, aportes y netos según la definición publicada; no mezcles conceptos de universos diferentes.',
      'Una diferencia entre fuentes de control exige revisión; por sí sola no demuestra pago, error ni causa.',
    ]),
    sourceFile: 'docs/MANUAL_USUARIO_Y_FUNCIONARIOS.md',
    anchor: 'interpretacion',
    actions: Object.freeze([
      Object.freeze({ id: 'open_hacienda', label: 'Abrir Hacienda y nómina', href: '/hacienda.html', requiredCapability: 'navigation.hacienda' }),
      Object.freeze({ id: 'open_reports_from_hacienda', label: 'Abrir Centro de Reportes', href: '/reportes.html', requiredCapability: 'navigation.reports' }),
    ]),
  }),
  payrollRuns: Object.freeze({
    title: 'Revisar corridas y marcas operativas de cierre',
    summary: 'Abrí Corridas y marcas de cierre para distinguir cabeceras válidas, detalle asociado, marcas operativas y registros en cuarentena sin presentarlos como pagos ni cierres contables.',
    findings: Object.freeze([
      'Empezá por la fecha del respaldo y la cobertura total; la pantalla no trabaja en tiempo real.',
      'Una marca de cierre informada es un dato operativo de origen. Su ausencia tampoco demuestra que una corrida siga abierta.',
      'Si aparece una señal de cuarentena, revisá la evidencia y usá el Centro de decisiones sólo cuando el brief vigente ofrezca ese próximo paso.',
    ]),
    sourceFile: 'docs/MANUAL_USUARIO_Y_FUNCIONARIOS.md',
    anchor: 'interpretacion',
    actions: Object.freeze([
      Object.freeze({ id: 'open_payroll_runs', label: 'Abrir corridas y marcas de cierre', href: '/corridas-grh', requiredCapability: 'navigation.hacienda' }),
      Object.freeze({ id: 'open_manual_interpretation', label: 'Ver guía de interpretación', href: '/manuales.html#interpretacion', requiredCapability: 'navigation.help' }),
    ]),
  }),
  structure: Object.freeze({
    title: 'Explorar estructura y áreas de costo',
    summary: 'Confirmá el universo de cada clasificación, elegí una dimensión observada y compará áreas de costo sin mezclar dotación, importes ni períodos incompatibles.',
    findings: Object.freeze([
      'Cada gráfico informa su universo; una categoría de estructura y un área de costo no son equivalentes automáticamente.',
      'Compará únicamente períodos publicados y conservá cualquier agrupación protegida o dato no disponible.',
      'Usá Hacienda para revisar componentes monetarios y Estructura para composición organizativa; no reemplaces una fuente con la otra.',
    ]),
    sourceFile: 'docs/MANUAL_USUARIO_Y_FUNCIONARIOS.md',
    anchor: 'interpretacion',
    actions: Object.freeze([
      Object.freeze({ id: 'open_structure', label: 'Abrir Estructura y áreas de costo', href: '/estructura', requiredCapability: 'navigation.organization-analytics' }),
      Object.freeze({ id: 'open_hacienda_from_structure', label: 'Abrir Hacienda y nómina', href: '/hacienda.html', requiredCapability: 'navigation.hacienda' }),
    ]),
  }),
  trajectory: Object.freeze({
    title: 'Interpretar trayectoria laboral documentada',
    summary: 'Compará actuaciones y movimientos registrados en ventanas equivalentes. Son hechos documentados de origen y no prueban por sí solos una alta, una baja, una vigencia ni una causa.',
    findings: Object.freeze([
      'Confirmá la tabla de origen, la fecha de corte y la regla de clasificación antes de interpretar categorías.',
      'Usá ventanas de igual duración y distinguí actuaciones, movimientos y personas distintas cuando la pantalla lo informe.',
      'Conservá agrupadas las categorías pequeñas protegidas y evitá inferir desempeño o estado laboral vigente.',
    ]),
    sourceFile: 'docs/MANUAL_USUARIO_Y_FUNCIONARIOS.md',
    anchor: 'interpretacion',
    actions: Object.freeze([
      Object.freeze({ id: 'open_trajectory', label: 'Abrir Trayectoria laboral', href: '/trayectoria', requiredCapability: 'navigation.employment-actions' }),
      Object.freeze({ id: 'open_movements', label: 'Abrir Movimientos y trazabilidad', href: '/movimientos-grh.html', requiredCapability: 'navigation.organization-analytics' }),
    ]),
  }),
  territory: Object.freeze({
    title: 'Usar la referencia territorial',
    summary: 'Ubicá el Departamento Junín y sus localidades mediante las referencias oficiales visibles. El mapa orienta; no demuestra cobertura operativa, población ni situación de servicios.',
    findings: Object.freeze([
      'Verificá organismo fuente, fecha y alcance geográfico antes de reutilizar nombres o geometrías.',
      'Una localidad publicada por la referencia oficial no equivale a un domicilio, expediente o zona operativa municipal.',
      'Presentá siempre los límites de la capa y evitá completar atributos que la fuente no ofrece.',
    ]),
    sourceFile: 'docs/MANUAL_USUARIO_Y_FUNCIONARIOS.md',
    anchor: 'superficies',
    actions: Object.freeze([
      Object.freeze({ id: 'open_territory', label: 'Abrir Centro territorial', href: '/territorio', requiredCapability: 'navigation.territory' }),
      Object.freeze({ id: 'open_manual_surfaces', label: 'Ver guía de superficies', href: '/manuales.html#superficies', requiredCapability: 'navigation.help' }),
    ]),
  }),
  decisions: Object.freeze({
    title: 'Revisar prioridades y compromisos',
    summary: 'Empezá por el brief vigente, contrastá la evidencia de cada prioridad y revisá responsable, fecha y versión antes de seguir o actualizar un compromiso.',
    findings: Object.freeze([
      'Una prioridad organiza la atención; no constituye por sí sola una orden, una causa ni una decisión administrativa.',
      'Antes de actuar, verificá estado, responsable, vencimiento y trazabilidad del compromiso seleccionado.',
      'La pantalla sólo ofrece transiciones autorizadas por el servidor para el perfil y el municipio vigentes.',
    ]),
    sourceFile: 'docs/MANUAL_USUARIO_Y_FUNCIONARIOS.md',
    anchor: 'decisiones-compromisos',
    actions: Object.freeze([
      Object.freeze({ id: 'open_decisions', label: 'Abrir Centro de decisiones GRH', href: '/decisiones-grh', requiredCapability: 'navigation.grh-decisions' }),
      Object.freeze({ id: 'open_decision_manual', label: 'Ver guía de decisiones y compromisos', href: '/manuales.html#decisiones-compromisos', requiredCapability: 'navigation.help' }),
    ]),
  }),
  managementTimeline: Object.freeze({
    title: 'Comparar dos gestiones al mismo avance',
    summary: 'Usá Gestiones en el tiempo para separar los cuatro años previstos de los 972 días hoy informados en cada período y contrastar únicamente ventanas equivalentes.',
    findings: Object.freeze([
      'El período completo de cada gestión abarca 1.461 días; la comparación disponible cubre 972 días por lado y todavía es parcial.',
      'Cada dominio conserva su propia unidad: eventos, personas y días informados no se suman ni se sustituyen entre sí.',
      'Una diferencia describe registros documentados; no demuestra causa, desempeño, impacto presupuestario ni estado laboral vigente.',
    ]),
    sourceFile: 'docs/MANUAL_USUARIO_Y_FUNCIONARIOS.md',
    anchor: 'gestiones',
    actions: Object.freeze([
      Object.freeze({ id: 'open_management_timeline', label: 'Abrir Gestiones en el tiempo', href: '/gestiones', requiredCapability: 'navigation.dashboard' }),
      Object.freeze({ id: 'open_management_manual', label: 'Ver guía del comparador', href: '/manuales.html#gestiones', requiredCapability: 'navigation.help' }),
    ]),
  }),
  general: Object.freeze({
    title: 'Guía rápida de MuniControl',
    summary: 'Empezá por tu Inicio, elegí una tarea del menú y verificá siempre fuente, fecha y límites antes de decidir o exportar.',
    findings: Object.freeze([
      'Inicio prioriza las herramientas habilitadas para tu función.',
      'MuniGuía explica cada pantalla sin conceder permisos ni consultar datos adicionales.',
      'El manual navegable reúne recorridos, interpretación de indicadores y pasos de demostración.',
    ]),
    sourceFile: 'docs/MANUAL_USUARIO_Y_FUNCIONARIOS.md',
    anchor: 'roles',
    actions: Object.freeze([
      Object.freeze({ id: 'open_manuals', label: 'Abrir Manual y ayuda', href: '/manuales.html', requiredCapability: 'navigation.help' }),
      Object.freeze({ id: 'open_workspace', label: 'Volver a Inicio', href: '/inicio.html', requiredCapability: 'navigation.workspace' }),
    ]),
  }),
});

export function classifyManualHelp(rawMessage) {
  const message = normalize(rawMessage);
  if (!message) return null;
  const exactTopic = EXACT_SCREEN_HELP_TOPICS.get(message);
  if (exactTopic) return exactTopic;
  const screenHelpLead = /\b(?:como (?:uso|usar|reviso|revisar|interpreto|interpretar|abro|abrir|exploro|explorar|funciona)|guia|manual|ayuda)\b/;
  if (screenHelpLead.test(message) && /\b(?:dos gestiones|gestiones al mismo avance|cuatro anos|comparador de gestiones)\b/.test(message)) return 'managementTimeline';
  if (screenHelpLead.test(message) && /\b(?:panorama|resumen (?:general|ejecutivo)|tablero ejecutivo|inicio)\b/.test(message)) return 'overview';
  if (screenHelpLead.test(message) && /\b(?:hacienda|nomina y (?:el )?calculo|calculo mensual)\b/.test(message)) return 'hacienda';
  if (screenHelpLead.test(message) && /\b(?:corridas? y (?:marcas? de )?cierres?|control de corridas?|marcas? de cierre|cierres? operativos?)\b/.test(message)) return 'payrollRuns';
  if (screenHelpLead.test(message) && /\b(?:estructura|areas? de costo|centros? de costo)\b/.test(message)) return 'structure';
  if (screenHelpLead.test(message) && /\b(?:trayectoria laboral|actuaciones? documentadas?|movimientos? y trazabilidad)\b/.test(message)) return 'trajectory';
  if (screenHelpLead.test(message) && /\b(?:centro territorial|referencia territorial|mapa territorial)\b/.test(message)) return 'territory';
  if (screenHelpLead.test(message) && /\b(?:centro de decisiones|prioridades y compromisos|compromisos grh)\b/.test(message)) return 'decisions';
  if (/\b(?:como|donde|pasos?|guia|manual|ayuda)\b.{0,70}\b(?:reporte|informe|imprim(?:ir|o|e)|export(?:ar|o|e))\b|\b(?:export(?:ar|o|e)|imprim(?:ir|o|e))\b.{0,50}\b(?:reporte|informe|grafico)\b/.test(message)) return 'reports';
  if (/\b(?:como|donde|pasos?|guia|manual|ayuda)\b.{0,70}\b(?:carg(?:ar|o|a|ue)|sub(?:ir|o|a)|import(?:ar|o|a|e))\b.{0,50}\b(?:archivo|excel|csv|pdf|datos|base)\b|\b(?:import(?:ar|o|a|e)|carg(?:ar|o|a|ue))\s+(?:un\s+)?(?:excel|csv|pdf|archivo)\b/.test(message)) return 'imports';
  if (/\b(?:como|donde|pasos?|guia|manual|ayuda)\b.{0,70}\b(?:busc(?:ar|o|a|e)|abr(?:ir|o|e)|consult(?:ar|o|a|e)|ver)\b.{0,50}\b(?:ficha|legajo|persona|empleado|licencia individual)\b/.test(message)) return 'directory';
  if (/\b(?:como|donde|pasos?|guia|manual|ayuda|entender)\b.{0,70}\b(?:rol|roles|perfil|permiso|acceso)\b|\bque puede ver (?:cada|mi) (?:rol|perfil)\b/.test(message)) return 'roles';
  if (/\b(?:guia|manual|ayuda)\b.{0,70}\b(?:calidad|fuente|origen|corte|confiabilidad|linaje)\b|\b(?:como|donde)\b.{0,35}\b(?:verific(?:ar|o|a|e)|revis(?:ar|o|a|e)|encuentr(?:o|a|e)|veo)\b.{0,45}\b(?:calidad|fuente|origen|corte|confiabilidad|linaje)\b/.test(message)) return 'quality';
  if (/\b(?:manual|guia de uso|como usar|como funciona la plataforma|ayuda para usar|recorrido de la plataforma)\b/.test(message)) return 'general';
  return null;
}

export function buildManualAssistantAnswer(topicKey = 'general') {
  const topic = TOPICS[topicKey] || TOPICS.general;
  const source = `Fuente: Manual MuniControl v${MANUAL_VERSION} · ${topic.sourceFile} · revisión ${MANUAL_REVIEWED_AT} · guía operativa, no concede permisos.`;
  const answer = {
    title: topic.title,
    summary: topic.summary,
    findings: [...topic.findings],
    evidence: [
      { label: 'Manual versionado', value: `v${MANUAL_VERSION}`, detail: topic.sourceFile },
      { label: 'Revisión documental', value: MANUAL_REVIEWED_AT, detail: 'La autorización se valida por separado.' },
    ],
    caveats: [
      'La guía explica el recorrido disponible; no habilita funciones, datos ni cuentas.',
      'Si una pantalla informa una fuente no disponible, no continúes con una cifra alternativa.',
    ],
    source,
    nextQuestions: [
      '¿Cómo verifico el origen y la fecha de un dato?',
      '¿Qué puede ver cada perfil?',
    ],
    actions: topic.actions.map(action => ({ ...action })),
    code: null,
  };
  return {
    httpStatus: 200,
    status: 'answered',
    intent: 'manual_help',
    resolvedPeriod: null,
    periodResolution: { requested: null, resolved: null, substituted: false },
    answer,
    response: renderText(answer),
  };
}

export function buildManualProvenance(topicKey = 'general') {
  const topic = TOPICS[topicKey] || TOPICS.general;
  return {
    source: 'MuniControl manuals',
    sourceFile: topic.sourceFile,
    sourceSha256: null,
    snapshotAsOf: MANUAL_REVIEWED_AT,
    manualContractVersion: MUNICIPAL_MANUAL_CONTRACT_VERSION,
    manualVersion: MANUAL_VERSION,
    manualAnchor: topic.anchor,
    latestValidCalculationPeriod: null,
    realtime: false,
    aggregateOnly: true,
    containsPii: false,
  };
}

function renderText(answer) {
  return [
    answer.title,
    answer.summary,
    answer.findings.map(item => `• ${item}`).join('\n'),
    `Límites:\n${answer.caveats.map(item => `• ${item}`).join('\n')}`,
    answer.source,
  ].filter(Boolean).join('\n\n');
}

function normalize(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}
