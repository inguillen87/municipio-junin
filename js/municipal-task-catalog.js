import {
  MUNIGUIA_ASSISTANT_QUESTIONS,
  MUNIGUIA_CATALOG,
} from './contextual-help-catalog.js';

const CONTRACT = 'municipal-task-catalog-v1';
const CATALOG_VERSION = '2026-08-14.2';
const DEFAULT_RESULT_LIMIT = 8;
const MAX_RESULT_LIMIT = 12;

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  Object.getOwnPropertyNames(value).forEach((key) => deepFreeze(value[key]));
  return Object.freeze(value);
}

const TASKS = deepFreeze([
  {
    id: 'review-priorities',
    kind: 'decidir',
    label: 'Ver qué requiere atención',
    description: 'Revisá prioridades, alertas y el corte que sostiene cada señal.',
    keywords: ['prioridad', 'alerta', 'panorama', 'resumen', 'decision'],
    pageId: 'dashboard',
  },
  {
    id: 'review-grh-summary',
    kind: 'consultar',
    label: 'Entender el panorama de personal',
    description: 'Consultá dotación, liquidaciones, áreas y evolución del respaldo GRH.',
    keywords: ['personal', 'dotacion', 'liquidacion', 'resumen', 'grh'],
    pageId: 'grhExecutive',
  },
  {
    id: 'follow-decisions',
    kind: 'seguir',
    label: 'Revisar decisiones y compromisos',
    description: 'Abrí prioridades con responsable, fecha y trazabilidad de seguimiento.',
    keywords: ['decision', 'compromiso', 'responsable', 'vencimiento', 'seguimiento'],
    pageId: 'grhDecisions',
  },
  {
    id: 'create-report',
    kind: 'informar',
    label: 'Crear o revisar un reporte',
    description: 'Elegí un período publicado y conservá fuente, fecha y límites.',
    keywords: ['reporte', 'informe', 'imprimir', 'exportar', 'periodo'],
    pageId: 'reports',
  },
  {
    id: 'review-payroll',
    kind: 'controlar',
    label: 'Revisar el cálculo mensual',
    description: 'Compará componentes y conciliación sin confundir cálculo con pago.',
    keywords: ['hacienda', 'nomina', 'calculo', 'liquidacion', 'conciliacion'],
    pageId: 'hacienda',
  },
  {
    id: 'review-payroll-runs',
    kind: 'controlar',
    label: 'Revisar corridas y marcas de cierre',
    description: 'Revisá por período cabeceras válidas, detalle asociado, marcas informadas y registros en cuarentena.',
    keywords: ['corrida', 'cierre', 'lote', 'liquidacion', 'control'],
    pageId: 'payrollRunControl',
  },
  {
    id: 'review-fixed-concepts',
    kind: 'controlar',
    label: 'Revisar conceptos fijos y cálculo',
    description: 'Contrastá conceptos vigentes por rango con lo observado en el cálculo mensual, sin inferir pago ni error.',
    keywords: ['concepto fijo', 'calculo', 'nomina', 'vigencia', 'reconciliacion'],
    pageId: 'fixedConceptControl',
  },
  {
    id: 'compare-areas',
    kind: 'gestionar',
    label: 'Comparar áreas y centros de costo',
    description: 'Contrastá composición y evolución dentro del universo informado.',
    keywords: ['area', 'estructura', 'centro de costo', 'sector', 'comparar'],
    pageId: 'organizationAnalytics',
  },
  {
    id: 'review-employment-actions',
    kind: 'consultar',
    label: 'Comparar actuaciones laborales',
    description: 'Leé actuaciones en ventanas equivalentes sin inferir causas ni vigencia.',
    keywords: ['trayectoria', 'actuacion', 'laboral', 'foja', 'comparar'],
    pageId: 'employmentActions',
  },
  {
    id: 'review-movements',
    kind: 'consultar',
    label: 'Revisar movimientos de legajo',
    description: 'Explorá movimientos registrados y su calidad por período.',
    keywords: ['movimiento', 'legajo', 'historial', 'trazabilidad', 'periodo'],
    pageId: 'movementOperations',
  },
  {
    id: 'find-person',
    kind: 'consultar',
    label: 'Buscar una persona o legajo',
    description: 'Usá el directorio privado cuando tu cuenta tenga el alcance habilitado.',
    keywords: ['persona', 'empleado', 'legajo', 'ficha', 'directorio'],
    pageId: 'rrhh',
  },
  {
    id: 'explore-grh-data',
    kind: 'consultar',
    label: 'Descubrir qué datos GRH existen',
    description: 'Recorré dominios, tablas, cobertura y próximos análisis posibles.',
    keywords: ['datos', 'tabla', 'dominio', 'inventario', 'grh'],
    pageId: 'grhDomains',
  },
  {
    id: 'locate-territory',
    kind: 'ubicar',
    label: 'Ubicar una localidad',
    description: 'Consultá la referencia territorial oficial y sus límites visibles.',
    keywords: ['territorio', 'mapa', 'localidad', 'distrito', 'junin'],
    pageId: 'territory',
  },
  {
    id: 'verify-quality',
    kind: 'revisar',
    label: 'Verificar una fuente y su calidad',
    description: 'Confirmá corte, cobertura, linaje, cuarentena y diferencias.',
    keywords: ['calidad', 'fuente', 'linaje', 'corte', 'cuarentena'],
    pageId: 'quality',
  },
  {
    id: 'review-sources',
    kind: 'revisar',
    label: 'Ver qué fuentes recibió la plataforma',
    description: 'Distinguí información recibida, validada y todavía pendiente.',
    keywords: ['fuente', 'archivo', 'respaldo', 'auditoria', 'estado'],
    pageId: 'audit',
  },
  {
    id: 'import-source',
    kind: 'cargar',
    label: 'Cargar un archivo autorizado',
    description: 'Declará finalidad, período y responsable antes de validar una carga.',
    keywords: ['cargar', 'importar', 'archivo', 'excel', 'csv', 'pdf'],
    pageId: 'import',
  },
  {
    id: 'publish-output',
    kind: 'publicar',
    label: 'Preparar una publicación',
    description: 'Elegí una salida disponible y revisá su fecha antes de compartirla.',
    keywords: ['publicar', 'descargar', 'salida', 'informe', 'compartir'],
    pageId: 'export',
  },
  {
    id: 'understand-role',
    kind: 'aprender',
    label: 'Entender mi rol y mis accesos',
    description: 'Consultá el recorrido de tu función y el estado real de cada herramienta.',
    keywords: ['rol', 'permiso', 'acceso', 'manual', 'ayuda'],
    pageId: 'manuals',
  },
  {
    id: 'ask-assistant',
    kind: 'preguntar',
    label: 'Preguntarle al Asistente',
    description: 'Formulá una pregunta concreta sobre evidencia GRH disponible.',
    keywords: ['asistente', 'bot', 'ia', 'pregunta', 'ayuda'],
    pageId: 'assistant',
  },
]);

const ROLE_TASK_ORDER = deepFreeze({
  SUPER_ADMIN: ['review-sources', 'import-source', 'verify-quality', 'understand-role'],
  INTENDENTE: ['review-priorities', 'follow-decisions', 'review-grh-summary', 'review-fixed-concepts'],
  TENANT_ADMIN: ['import-source', 'review-sources', 'verify-quality', 'review-fixed-concepts', 'review-payroll-runs'],
  TENANT_USER: ['locate-territory', 'understand-role'],
  CONTADOR: ['review-fixed-concepts', 'review-payroll-runs', 'review-payroll', 'create-report'],
  INSPECTOR: ['locate-territory', 'understand-role'],
  DEMO: ['locate-territory', 'understand-role'],
});

const CATALOG = deepFreeze({
  contract: CONTRACT,
  catalogVersion: CATALOG_VERSION,
  taskDefinitions: TASKS,
  roleTaskOrder: ROLE_TASK_ORDER,
});

const KNOWN_CAPABILITIES = new Set([
  'session.read',
  ...Object.values(MUNIGUIA_CATALOG.pages).map((page) => page.requiredCapability),
]);

function exactInput(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const keys = Object.keys(value).sort();
  const expected = ['capabilities', 'policyVersion', 'role', 'variant'].sort();
  return keys.length === expected.length && keys.every((key, index) => key === expected[index]);
}

function validCapabilities(value) {
  if (!Array.isArray(value) || value.length === 0) return null;
  const capabilities = [];
  for (const capability of value) {
    if (typeof capability !== 'string' || !KNOWN_CAPABILITIES.has(capability) ||
        capabilities.includes(capability)) return null;
    capabilities.push(capability);
  }
  return capabilities;
}

function internalHref(value) {
  if (typeof value !== 'string' || !value.trim()) return null;
  try {
    const url = new URL(value, 'https://municontrol.local/');
    if (url.origin !== 'https://municontrol.local' || url.username || url.password) return null;
    return `${url.pathname.startsWith('/') ? '' : '/'}${url.pathname}${url.search}${url.hash}`;
  } catch {
    return null;
  }
}

function taskForDefinition(definition, capabilities) {
  const page = MUNIGUIA_CATALOG.pages[definition.pageId];
  if (!page || !capabilities.includes(page.requiredCapability)) return null;
  const href = internalHref(page.href);
  if (!href) return null;
  const helpHref = capabilities.includes(MUNIGUIA_CATALOG.mountCapability)
    ? internalHref(`manuales.html#${page.manualAnchor}`)
    : null;
  const question = MUNIGUIA_ASSISTANT_QUESTIONS[definition.pageId];
  const assistant = definition.pageId !== 'assistant' &&
      capabilities.includes('navigation.ai-assistant') && typeof question === 'string'
    ? {
        capability: 'navigation.ai-assistant',
        question,
        href: internalHref(`ia.html?question=${encodeURIComponent(question)}`),
      }
    : null;
  return {
    id: definition.id,
    kind: definition.kind,
    label: definition.label,
    description: definition.description,
    keywords: [...definition.keywords],
    pageId: definition.pageId,
    capability: page.requiredCapability,
    href,
    helpHref,
    assistant,
  };
}

export function normalizeMunicipalTaskSearch(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('es-AR')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

export function searchMunicipalTasks(tasks, rawQuery, limit = DEFAULT_RESULT_LIMIT) {
  if (!Array.isArray(tasks)) return [];
  const query = normalizeMunicipalTaskSearch(rawQuery);
  const tokens = query.split(' ').filter(Boolean);
  const boundedLimit = Number.isSafeInteger(limit) && limit > 0
    ? Math.min(limit, MAX_RESULT_LIMIT)
    : DEFAULT_RESULT_LIMIT;
  if (!tokens.length) return tasks.slice(0, boundedLimit);
  return tasks
    .map((task, index) => {
      const label = normalizeMunicipalTaskSearch(task && task.label);
      const haystack = normalizeMunicipalTaskSearch([
        task && task.label,
        task && task.description,
        task && task.kind,
        ...(Array.isArray(task && task.keywords) ? task.keywords : []),
      ].join(' '));
      if (!tokens.every((token) => haystack.includes(token))) return null;
      const score = (label === query ? 100 : 0) +
        (label.startsWith(query) ? 50 : 0) +
        tokens.reduce((total, token) => total + (label.includes(token) ? 10 : 1), 0);
      return { task, index, score };
    })
    .filter(Boolean)
    .sort((left, right) => right.score - left.score || left.index - right.index)
    .slice(0, boundedLimit)
    .map((entry) => entry.task);
}

export function resolveMunicipalTaskCatalog(input) {
  if (!exactInput(input) || input.policyVersion !== MUNIGUIA_CATALOG.accessPolicyVersion) return null;
  const role = MUNIGUIA_CATALOG.roles[input.role];
  if (!role || input.variant !== role.variant || !ROLE_TASK_ORDER[input.role]) return null;
  const capabilities = validCapabilities(input.capabilities);
  if (!capabilities || !capabilities.includes('session.read') ||
      !capabilities.includes('navigation.workspace')) return null;

  const tasks = TASKS.map((definition) => taskForDefinition(definition, capabilities)).filter(Boolean);
  const taskById = new Map(tasks.map((task) => [task.id, task]));
  const recommendedTaskIds = ROLE_TASK_ORDER[input.role]
    .filter((taskId) => taskById.has(taskId))
    .slice(0, 4);
  const recommended = recommendedTaskIds.map((taskId) => taskById.get(taskId));
  const remainder = tasks.filter((task) => !recommendedTaskIds.includes(task.id));

  return deepFreeze({
    contract: CONTRACT,
    catalogVersion: CATALOG_VERSION,
    roleId: input.role,
    recommendedTaskIds,
    tasks: [...recommended, ...remainder],
  });
}

export { CATALOG as MUNICIPAL_TASK_CATALOG };
