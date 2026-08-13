export const MUNICIPAL_MANUAL_CONTRACT_VERSION = 'municipal-assistant-manual-v1';

const MANUAL_VERSION = '1.10.0';
const MANUAL_REVIEWED_AT = '2026-08-13';

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
