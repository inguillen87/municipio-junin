import { MUNIGUIA_CATALOG } from './contextual-help-catalog.js';

const CONTRACT = 'muniguia-onboarding-v1';
const CATALOG_VERSION = '2026-08-14.2';
const PROGRESS_VERSION = 'muniguia-onboarding-progress-v1';
const MINUTES_PER_STAGE = 2;

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  Object.getOwnPropertyNames(value).forEach((key) => deepFreeze(value[key]));
  return Object.freeze(value);
}

const JOURNEYS = deepFreeze({
  SUPER_ADMIN: {
    id: 'platform-governance-foundations',
    title: 'Fundamentos de gobierno de plataforma',
    stages: [
      {
        id: 'confirm-platform-context',
        pageId: 'workspace',
        label: 'Confirmá el contexto de plataforma',
        copy: 'Empezá por el rol, el municipio y las capacidades efectivas de la sesión antes de revisar una fuente o una operación.',
      },
      {
        id: 'review-governed-ingestion',
        pageId: 'import',
        label: 'Revisá el ingreso gobernado',
        copy: 'Ubicá finalidad, responsable, período y validaciones de una carga sin asumir que recibir un archivo equivale a publicarlo.',
      },
      {
        id: 'audit-source-state',
        pageId: 'audit',
        label: 'Auditá fuentes y estado',
        copy: 'Diferenciá lo recibido, lo validado y lo pendiente antes de ampliar capacidades o presentar resultados institucionales.',
      },
      {
        id: 'validate-contract-lineage',
        pageId: 'quality',
        label: 'Validá contratos y linaje',
        copy: 'Comprobá fuente, corte, calidad, cuarentena y límites para que una pantalla saludable no oculte una inconsistencia de datos.',
      },
      {
        id: 'inspect-municipal-projection',
        pageId: 'organizationAnalytics',
        label: 'Comprobá la proyección municipal',
        copy: 'Explorá estructura y áreas de costo sólo dentro del universo publicado y conservá visibles las capacidades realmente habilitadas.',
      },
    ],
  },
  INTENDENTE: {
    id: 'executive-decision-foundations',
    title: 'Recorrido esencial de Intendencia',
    stages: [
      {
        id: 'start-executive-workspace',
        pageId: 'workspace',
        label: 'Abrí tu centro de trabajo',
        copy: 'Confirmá el contexto institucional y elegí una pregunta de gestión concreta antes de recorrer indicadores o módulos.',
      },
      {
        id: 'read-executive-priorities',
        pageId: 'dashboard',
        label: 'Leé prioridades antes que indicadores',
        copy: 'Revisá corte, calidad y señales que requieren atención para decidir qué evidencia conviene profundizar primero.',
      },
      {
        id: 'inspect-grh-evidence',
        pageId: 'grhExecutive',
        label: 'Profundizá en evidencia GRH',
        copy: 'Contrastá series y agregados liberados sin convertir una variación histórica en una causa o una decisión automática.',
      },
      {
        id: 'compare-management-timeline',
        pageId: 'managementTimeline',
        label: 'Compará dos gestiones al mismo avance',
        copy: 'Separá los cuatro años previstos de los 972 días hoy comparables y leé cada diferencia como registro documentado, no como causalidad o desempeño.',
      },
      {
        id: 'ask-grounded-assistant',
        pageId: 'assistant',
        label: 'Consultá al asistente con alcance',
        copy: 'Formulá una pregunta soportada, verificá su fuente y usá el próximo paso autorizado sin delegar la decisión en el Bot.',
      },
    ],
  },
  TENANT_ADMIN: {
    id: 'municipal-operations-foundations',
    title: 'Recorrido esencial de administración municipal',
    stages: [
      {
        id: 'start-municipal-operations',
        pageId: 'workspace',
        label: 'Organizá la operación municipal',
        copy: 'Confirmá el contexto de la sesión y priorizá una tarea concreta antes de preparar fuentes, controles o publicaciones.',
      },
      {
        id: 'prepare-governed-import',
        pageId: 'import',
        label: 'Prepará una carga gobernada',
        copy: 'Declarar fuente, finalidad, período y responsable es obligatorio antes de validar o integrar un archivo municipal.',
      },
      {
        id: 'review-received-sources',
        pageId: 'audit',
        label: 'Revisá las fuentes recibidas',
        copy: 'Separá disponibilidad, cobertura y trabajo pendiente para que el inventario no se interprete como una publicación aprobada.',
      },
      {
        id: 'control-quality-lineage',
        pageId: 'quality',
        label: 'Controlá calidad y linaje',
        copy: 'Verificá corte, transformaciones, cuarentena y diferencias antes de habilitar el uso de una cifra o un tablero.',
      },
      {
        id: 'explore-organization-areas',
        pageId: 'organizationAnalytics',
        label: 'Explorá estructura y áreas',
        copy: 'Usá clasificaciones y áreas de costo dentro de su universo informado y derivá cada revisión al módulo correspondiente.',
      },
    ],
  },
  TENANT_USER: {
    id: 'municipal-user-foundations',
    title: 'Primeros pasos para usuarios municipales',
    stages: [
      {
        id: 'confirm-municipal-user-context',
        pageId: 'workspace',
        label: 'Confirmá tu espacio de trabajo',
        copy: 'Revisá el rol y las opciones visibles para trabajar sólo con las herramientas que la sesión institucional habilitó.',
      },
      {
        id: 'use-official-territory-reference',
        pageId: 'territory',
        label: 'Consultá la referencia territorial',
        copy: 'Usá localidades y geometrías oficiales como referencia, sin inferir expedientes, cobertura de servicios ni datos personales.',
      },
      {
        id: 'open-municipal-user-manual',
        pageId: 'manuals',
        label: 'Encontrá el procedimiento vigente',
        copy: 'Buscá el recorrido de tu función y verificá límites y estado operativo antes de solicitar una capacidad adicional.',
      },
    ],
  },
  CONTADOR: {
    id: 'financial-control-foundations',
    title: 'Recorrido esencial de Contaduría',
    stages: [
      {
        id: 'confirm-financial-context',
        pageId: 'workspace',
        label: 'Confirmá tu contexto contable',
        copy: 'Empezá por el rol, el municipio y la pregunta de control para no mezclar cálculo, conciliación y evidencia bancaria.',
      },
      {
        id: 'review-monthly-close',
        pageId: 'hacienda',
        label: 'Revisá el cierre y sus controles',
        copy: 'Fijá el período y contrastá componentes y conciliación sin presentar el control de cálculo como pago efectivo.',
      },
      {
        id: 'prepare-verifiable-report',
        pageId: 'reports',
        label: 'Prepará una salida verificable',
        copy: 'Conservá período, unidad, fuente y límites al imprimir o exportar una lectura destinada a revisión institucional.',
      },
      {
        id: 'validate-financial-source',
        pageId: 'quality',
        label: 'Validá origen y consistencia',
        copy: 'Revisá linaje, cobertura, cuarentena y diferencias entre fuentes antes de considerar cerrado un control.',
      },
      {
        id: 'review-documented-actions',
        pageId: 'employmentActions',
        label: 'Consultá actuaciones sin inferir causalidad',
        copy: 'Compará actuaciones documentadas en períodos equivalentes sin convertirlas en altas, bajas, sanciones o vigencias actuales.',
      },
    ],
  },
  INSPECTOR: {
    id: 'inspection-reference-foundations',
    title: 'Primeros pasos para Inspección',
    stages: [
      {
        id: 'confirm-inspection-context',
        pageId: 'workspace',
        label: 'Confirmá el alcance de Inspección',
        copy: 'Revisá las capacidades efectivas de la sesión y no asumas casos, domicilios o agendas que la plataforma no publicó.',
      },
      {
        id: 'consult-territorial-reference',
        pageId: 'territory',
        label: 'Usá la referencia territorial oficial',
        copy: 'Ubicá departamento y localidades sin interpretar el mapa como asignación operativa, expediente o evidencia de una inspección.',
      },
      {
        id: 'open-inspection-procedure',
        pageId: 'manuals',
        label: 'Revisá el procedimiento disponible',
        copy: 'Consultá el estado real de cada superficie y sus límites antes de escalar una necesidad operativa al administrador.',
      },
    ],
  },
  DEMO: {
    id: 'controlled-preview-foundations',
    title: 'Recorrido de vista controlada',
    stages: [
      {
        id: 'start-controlled-preview',
        pageId: 'workspace',
        label: 'Empezá por la vista habilitada',
        copy: 'Reconocé el perfil de evaluación y explorá sólo las opciones proyectadas, sin suponer permisos o datos fuera del recorrido.',
      },
      {
        id: 'explore-territory-preview',
        pageId: 'territory',
        label: 'Explorá la referencia territorial',
        copy: 'Leé las fuentes oficiales del mapa y mantené visibles sus límites; la demostración no crea una capa operativa municipal.',
      },
      {
        id: 'review-preview-scope',
        pageId: 'manuals',
        label: 'Confirmá el alcance documentado',
        copy: 'Usá el manual para distinguir capacidades operativas, condicionadas y futuras antes de presentar la plataforma.',
      },
    ],
  },
});

const CATALOG = deepFreeze({
  contract: CONTRACT,
  catalogVersion: CATALOG_VERSION,
  progressVersion: PROGRESS_VERSION,
  journeys: JOURNEYS,
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

function projectStage(stage, capabilities) {
  const page = MUNIGUIA_CATALOG.pages[stage.pageId];
  if (!page || !capabilities.includes(page.requiredCapability)) return null;
  return {
    id: stage.id,
    pageId: stage.pageId,
    capability: page.requiredCapability,
    href: page.href,
    label: stage.label,
    copy: stage.copy,
  };
}

export function resolveMuniGuiaOnboarding(input) {
  if (!exactInput(input) || input.policyVersion !== MUNIGUIA_CATALOG.accessPolicyVersion) return null;
  const journey = JOURNEYS[input.role];
  const role = MUNIGUIA_CATALOG.roles[input.role];
  if (!journey || !role || input.variant !== role.variant) return null;

  const capabilities = validCapabilities(input.capabilities);
  if (!capabilities || !capabilities.includes('session.read') ||
      !capabilities.includes('navigation.workspace') ||
      !capabilities.includes(MUNIGUIA_CATALOG.mountCapability)) return null;

  const stages = journey.stages
    .map((stage) => projectStage(stage, capabilities))
    .filter(Boolean);
  if (stages.length === 0 || stages[0].pageId !== 'workspace') return null;

  return deepFreeze({
    contract: CONTRACT,
    catalogVersion: CATALOG_VERSION,
    progressVersion: PROGRESS_VERSION,
    journey: {
      id: journey.id,
      title: journey.title,
      estimatedMinutes: stages.length * MINUTES_PER_STAGE,
      stages,
    },
  });
}

export { CATALOG as MUNIGUIA_ONBOARDING_CATALOG };
