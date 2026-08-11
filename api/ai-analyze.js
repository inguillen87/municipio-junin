import { noStore, requireDatasetTenant, requireRole } from './lib/auth.js';
import { readGrhArtifactBundle } from './lib/grh-artifacts.js';
import { validateGrhSemanticContract } from './lib/grh-contract.js';
import { validateGrhExecutiveContract } from './lib/grh-executive-contract.js';
import { buildPortableGrhViews } from './lib/grh-portable-bundle.js';
import { validateGrhQualityContract } from './lib/grh-quality-contract.js';
import { validateGrhCloseContract } from './lib/grh-close-contract.js';
import { buildGrhCloseProjection } from './lib/grh-close-projection.js';
import {
  inspectGrhDecisionBriefContract,
} from './lib/grh-decision-brief-contract.js';
import {
  buildGrhDecisionBriefProjection,
} from './lib/grh-decision-brief-projection.js';
import {
  inspectGrhDomainCatalogContract,
} from './lib/grh-domain-catalog-contract.js';
import {
  buildGrhDomainCatalogProjection,
} from './lib/grh-domain-catalog.js';
import {
  readGrhWorkforceFinanceArtifact,
} from './lib/grh-workforce-finance-artifact.js';
import {
  inspectGrhWorkforceFinanceContract,
} from './lib/grh-workforce-finance-contract.js';
import {
  buildGrhWorkforceFinanceProjection,
} from './lib/grh-workforce-finance-projection.js';
import {
  inspectGrhWorkforceFinanceSourceContract,
} from './lib/grh-workforce-finance-source-contract.js';
import {
  GRH_DIRECTORY_SCHEMA_VERSION,
  inspectGrhDirectoryResponse,
} from './lib/grh-directory-contract.js';
import { readGrhDirectory } from './lib/grh-directory-store.js';
import {
  authorizeGrhDirectoryRequest,
} from './grh-directory-access.js';
import tenantPresentationPolicy from '../shared/tenant-presentation-policy.cjs';

const { hasConfiguredCurrency, resolveTenantPresentation } = tenantPresentationPolicy;

const EXECUTIVE_ROLES = ['SUPER_ADMIN', 'TENANT_ADMIN', 'INTENDENTE', 'CONTADOR'];
const MAX_MESSAGE_LENGTH = 1200;
const MAX_DIRECTORY_OPTIONS = 6;
const MAX_DIRECTORY_SEARCH_TOKENS = 6;
const MAX_DIRECTORY_LEAVE_HISTORY = 24;
const MAX_ANSWER_VISUAL_ITEMS = 13;
const ENGINE_ID = 'grh-deterministic-v1';
export const GRH_ANSWER_VISUAL_SCHEMA_VERSION = 'grh-answer-visual-v1';
const FINANCE_INTENTS = new Set([
  'workforce_finance_overview',
  'workforce_finance_trend',
  'workforce_finance_composition',
  'workforce_finance_compare',
]);
const FINANCE_DIMENSIONS = Object.freeze([
  Object.freeze({
    key: 'costCenter',
    label: 'centro de costo',
    pattern: /centro(?:s)? de costo(?:s)?|centro(?:s)? costo(?:s)?/,
  }),
  Object.freeze({ key: 'sector', label: 'sector', pattern: /\bsector(?:es)?\b/ }),
  Object.freeze({
    key: 'agreement',
    label: 'categoría de acuerdo',
    pattern: /\bconvenio(?:s)?\b|\bacuerdo(?:s)?\b|categoria(?:s)?(?: de acuerdo)?/,
  }),
]);
const NON_FINANCIAL_TREND_DIMENSIONS = Object.freeze([
  Object.freeze({ key: 'organization', label: 'organización', pattern: /\borganizacion(?:es)?\b/ }),
  Object.freeze({ key: 'position', label: 'cargo', pattern: /\bcargo(?:s)?\b|\bpuesto(?:s)?\b/ }),
  Object.freeze({ key: 'area', label: 'área', pattern: /\barea(?:s)?\b|\bdepartamento(?:s)?\b|\bsecretaria(?:s)?\b|\breparticion(?:es)?\b/ }),
]);
const FINANCE_COMPONENTS = Object.freeze([
  Object.freeze({
    key: 'netToPayCents',
    label: 'Neto a pagar informado',
    pattern: /neto a pagar/,
  }),
  Object.freeze({
    key: 'grossWithFamilyAllowancesCents',
    label: 'Bruto con asignaciones',
    pattern: /bruto(?: con asignaciones)?|masa salarial/,
  }),
  Object.freeze({
    key: 'nonContributoryEarningsCents',
    label: 'Ingresos no contributivos',
    pattern: /no contributiv|no remunerativ/,
  }),
  Object.freeze({
    key: 'contributoryEarningsCents',
    label: 'Ingresos contributivos',
    pattern: /(?:ingresos? )?contributiv|remunerativ/,
  }),
  Object.freeze({
    key: 'familyAllowancesCents',
    label: 'Asignaciones familiares',
    pattern: /asignaciones? familiares?/,
  }),
  Object.freeze({
    key: 'employeeWithholdingsCents',
    label: 'Retenciones del personal',
    pattern: /retenciones?|descuentos? del personal/,
  }),
  Object.freeze({
    key: 'employerContributionsCents',
    label: 'Aportes patronales',
    pattern: /aportes? patronales?|contribuciones? patronales?/,
  }),
  Object.freeze({
    key: 'netPayrollCents',
    label: 'Neto de control',
    pattern: /neto(?: de control| de nomina| salarial)?|costo neto/,
  }),
]);
const SUPPORTED_INTENTS = Object.freeze([
  'decision_brief',
  'workforce_finance_overview',
  'workforce_finance_trend',
  'workforce_finance_composition',
  'workforce_finance_compare',
  'domain_catalog',
  'data_inventory',
  'executive_summary',
  'workforce',
  'workforce_distribution',
  'absence',
  'leave',
  'movements',
  'quality',
  'quarantine',
  'calculation_control',
  'close_explanation',
  'reconciliation',
  'trend',
  'source',
  'person_lookup',
]);

export function createAiAnalyzeHandler({
  requireRoleImpl = requireRole,
  requireDatasetTenantImpl = requireDatasetTenant,
  readArtifactBundleImpl = readGrhArtifactBundle,
  readDirectoryImpl = readGrhDirectory,
  readWorkforceFinanceArtifactImpl = readGrhWorkforceFinanceArtifact,
  buildDecisionBriefProjectionImpl = buildGrhDecisionBriefProjection,
  inspectDecisionBriefContractImpl = inspectGrhDecisionBriefContract,
  buildDomainCatalogProjectionImpl = buildGrhDomainCatalogProjection,
  inspectDomainCatalogContractImpl = inspectGrhDomainCatalogContract,
  inspectWorkforceFinanceSourceImpl = inspectGrhWorkforceFinanceSourceContract,
  buildWorkforceFinanceProjectionImpl = buildGrhWorkforceFinanceProjection,
  inspectWorkforceFinanceContractImpl = inspectGrhWorkforceFinanceContract,
  authorizeDirectoryImpl = authorizeGrhDirectoryRequest,
  directoryAuthorizationDependencies = {},
  environment = process.env,
} = {}) {
  return async function handler(req, res) {
    noStore(res);
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-MuniControl-Engine', ENGINE_ID);

    if (req.method === 'OPTIONS') return res.status(204).end();
    if (req.method !== 'POST') {
      return res.status(405).json({ error: 'Método no permitido', code: 'METHOD_NOT_ALLOWED' });
    }

    const caller = await requireRoleImpl(req, res, EXECUTIVE_ROLES);
    if (!caller || !requireDatasetTenantImpl(res, caller, 'GRH_TENANT_ID')) return;

    const message = typeof req.body?.message === 'string' ? req.body.message.trim() : '';
    if (!message) {
      return res.status(400).json({ error: 'La consulta es requerida', code: 'MESSAGE_REQUIRED' });
    }
    if (message.length > MAX_MESSAGE_LENGTH) {
      return res.status(413).json({
        error: `La consulta supera el límite de ${MAX_MESSAGE_LENGTH} caracteres`,
        code: 'MESSAGE_TOO_LONG',
      });
    }
    if (req.body?.mode && req.body.mode !== 'deterministic') {
      return res.status(422).json({
        error: 'El modo generativo no está habilitado. Esta versión usa exclusivamente el contrato determinista GRH.',
        code: 'PROVIDER_NOT_AUTHORIZED',
      });
    }
    if (req.body?.history !== undefined && !Array.isArray(req.body.history)) {
      return res.status(422).json({
        error: 'El historial, cuando se envía por compatibilidad, debe ser una lista.',
        code: 'INVALID_HISTORY',
      });
    }
    if (req.body?.history?.length > 12) {
      return res.status(413).json({ error: 'El historial supera el límite permitido', code: 'HISTORY_TOO_LONG' });
    }

    const classification = classifyIntent(message);
    let directoryAuthorization = null;
    let directoryReadAudit = null;
    if (classification.intent === 'person_lookup') {
      directoryAuthorization = await authorizeDirectoryImpl(req, res, {
        operation: 'list',
        environment,
        requireCapabilityImpl: async () => caller,
        ...directoryAuthorizationDependencies,
      });
      if (!directoryAuthorization) return;
      directoryReadAudit = createDirectoryReadAudit(directoryAuthorization);
    }

    try {
      const bundle = await readArtifactBundleImpl(environment.GRH_TENANT_ID);
      const { executive, quality } = buildPortableGrhViews(bundle);
      const close = buildGrhCloseProjection(bundle.semantic);
      const presentation = resolveTenantPresentation(caller.tenant);
      const provenance = buildProvenance(executive, quality, close, presentation);
      const assistantData = {
        decisionBrief: null,
        domainCatalog: null,
        workforceFinance: null,
      };
      if (classification.intent === 'decision_brief') {
        const decisionBrief = buildDecisionBriefProjectionImpl(executive, quality, close);
        if (!inspectDecisionBriefContractImpl(decisionBrief)?.ok ||
            !projectionMatchesAssistantSource(decisionBrief, provenance)) {
          throw new Error('GRH decision brief invalid');
        }
        assistantData.decisionBrief = decisionBrief;
      }
      if (classification.intent === 'domain_catalog' || classification.intent === 'data_inventory') {
        const domainCatalog = buildDomainCatalogProjectionImpl(bundle);
        if (!inspectDomainCatalogContractImpl(domainCatalog)?.ok ||
            !projectionMatchesAssistantSource(domainCatalog, provenance, { requireLatestPeriod: false })) {
          throw new Error('GRH domain catalog invalid');
        }
        assistantData.domainCatalog = domainCatalog;
      }
      if (FINANCE_INTENTS.has(classification.intent)) {
        const envelope = await readWorkforceFinanceArtifactImpl({
          tenantId: String(caller.tenantId),
          expectedSourceSha256: provenance.sourceSha256,
          expectedSnapshotAsOf: provenance.snapshotAsOf,
          environment,
        });
        const sourceArtifact = envelope?.payload;
        if (!inspectWorkforceFinanceSourceImpl(sourceArtifact)?.ok) {
          throw new Error('GRH workforce-finance source invalid');
        }
        const workforceFinance = buildWorkforceFinanceProjectionImpl(sourceArtifact, {
          presentation: workforceFinancePresentation(presentation),
        });
        if (!inspectWorkforceFinanceContractImpl(workforceFinance)?.ok ||
            !projectionMatchesAssistantSource(workforceFinance, provenance)) {
          throw new Error('GRH workforce-finance projection invalid');
        }
        assistantData.workforceFinance = workforceFinance;
      }
      const answer = classification.intent === 'person_lookup'
        ? await buildPrivateDirectoryResponse({
          message,
          caller,
          readDirectoryImpl: scopeDirectoryReader(readDirectoryImpl, directoryAuthorization),
          expectedSource: executive.source,
          readAudit: directoryReadAudit,
        })
        : buildDeterministicAnswer(
          message,
          executive,
          quality,
          close,
          presentation,
          assistantData,
        );
      const nominal = answer.intent === 'person_lookup';
      const responseProvenance = nominal
        ? {
          ...provenance,
          aggregateOnly: false,
          containsPii: true,
          directorySchemaVersion: GRH_DIRECTORY_SCHEMA_VERSION,
        }
        : provenance;
      const payload = buildAssistantPayload(answer, responseProvenance, {
        available: true,
        source: nominal
          ? 'grh_directory_private_contract'
          : (FINANCE_INTENTS.has(answer.intent)
            ? 'grh_workforce_finance_governed_contract'
            : (['domain_catalog', 'data_inventory'].includes(answer.intent)
              ? 'grh_domain_catalog_governed_contract'
            : (answer.intent === 'decision_brief'
              ? 'grh_decision_brief_governed_contract'
              : (answer.intent === 'close_explanation'
                ? 'grh_close_governed_contract'
                : 'grh_executive_portable_contract')))),
        snapshotAsOf: provenance.snapshotAsOf,
        historyUsed: nominal && answer.answer?.directory?.status === 'matched',
      });

      return res.status(answer.httpStatus).json(payload);
    } catch (error) {
      const directoryFailure = classification.intent === 'person_lookup';
      if (directoryFailure && directoryReadAudit) {
        await directoryReadAudit.denyPendingRead();
      }
      console.error(directoryFailure
        ? '[GRH-ASSISTANT] Directorio privado no disponible'
        : '[GRH-ASSISTANT] Proyección portable no disponible');
      return res.status(503).json({
        error: directoryFailure
          ? 'El directorio GRH privado no está disponible. No se generó una respuesta alternativa.'
          : 'El contrato GRH privado no está disponible. No se generó una respuesta alternativa.',
        code: directoryFailure ? 'GRH_DIRECTORY_CONTRACT_UNAVAILABLE' : 'GRH_CONTRACT_UNAVAILABLE',
        engine: { id: ENGINE_ID, externalProvider: false, generated: false },
      });
    }
  };
}

function workforceFinancePresentation(presentation) {
  if (!hasConfiguredCurrency(presentation)) {
    throw new Error('GRH workforce-finance presentation invalid');
  }
  return {
    schemaVersion: presentation.schemaVersion,
    locale: presentation.locale,
    displayCurrencyCode: presentation.displayCurrencyCode,
    basis: presentation.displayCurrencyBasis,
    effectiveFrom: presentation.displayCurrencyEffectiveOn,
    sourceCurrencyStatus: presentation.sourceCurrencyStatus,
  };
}

function projectionMatchesAssistantSource(
  projection,
  provenance,
  { requireLatestPeriod = true } = {},
) {
  return projection?.source?.canonicalSystem === provenance?.source &&
    projection?.source?.sourceFile === provenance?.sourceFile &&
    projection?.source?.sourceSha256 === provenance?.sourceSha256 &&
    projection?.source?.snapshotAsOf === provenance?.snapshotAsOf &&
    (!requireLatestPeriod || projection?.source?.latestValidCalculationPeriod ===
      provenance?.latestValidCalculationPeriod) &&
    projection?.source?.realtime === false;
}

function scopeDirectoryReader(readDirectoryImpl, authorization) {
  if (authorization?.decision?.scope?.tenantWide) return readDirectoryImpl;
  const allowedOrganizationCodes = authorization?.decision?.allowedOrganizationCodes;
  if (!Array.isArray(allowedOrganizationCodes) || allowedOrganizationCodes.length === 0) {
    throw new Error('directory authorization scope unavailable');
  }
  return input => readDirectoryImpl({
    ...input,
    scopeOrganizationCodes: [...allowedOrganizationCodes],
  });
}

function createDirectoryReadAudit(authorization) {
  let pendingOperation = 'list';
  let commitUnavailable = false;

  async function commit(operation, outcome, resultCount, reason, decision) {
    if (commitUnavailable || pendingOperation !== operation) {
      throw new Error('directory audit state invalid');
    }
    const committed = await authorization.commitAudit({
      operation,
      outcome,
      reason,
      resultCount,
      decision,
    });
    if (!committed) {
      commitUnavailable = true;
      throw new Error('directory audit unavailable');
    }
    pendingOperation = null;
  }

  return Object.freeze({
    beginDetail() {
      if (commitUnavailable || pendingOperation !== null) {
        throw new Error('directory audit state invalid');
      }
      pendingOperation = 'detail';
    },
    async allowRead(operation, resultCount) {
      return commit(
        operation,
        'ALLOWED',
        resultCount,
        authorization.decision.reason,
        authorization.decision,
      );
    },
    async denyPendingRead() {
      if (commitUnavailable) return false;
      if (pendingOperation === null) return true;
      try {
        await commit(pendingOperation, 'DENIED', 0, 'DIRECTORY_READ_ERROR', null);
        return true;
      } catch {
        return false;
      }
    },
  });
}

function directoryListResultCount(list) {
  if (!Array.isArray(list?.items)) {
    throw new Error('directory list result invalid');
  }
  return list.items.length;
}

function buildAssistantPayload(answer, provenance, dataStatus) {
  return {
    status: answer.status,
    engine: {
      id: ENGINE_ID,
      externalProvider: false,
      generated: false,
    },
    intent: answer.intent,
    response: answer.response,
    answer: answer.answer,
    period: answer.resolvedPeriod || provenance?.latestValidCalculationPeriod || null,
    periodResolution: answer.periodResolution,
    provenance,
    dataStatus: {
      available: Boolean(dataStatus?.available),
      source: dataStatus?.source || null,
      snapshotAsOf: dataStatus?.snapshotAsOf || null,
      realtime: false,
      historyUsed: Boolean(dataStatus?.historyUsed),
    },
    supportedIntents: SUPPORTED_INTENTS,
  };
}

function finalizeStandaloneAnswer(result, source) {
  const answer = {
    title: result.title,
    summary: result.summary,
    findings: result.findings || [],
    evidence: result.evidence || [],
    caveats: result.caveats || [],
    source,
    nextQuestions: result.nextQuestions || [],
    code: result.code || null,
  };
  if (result.directory) answer.directory = result.directory;
  if (result.actions) answer.actions = result.actions;
  return {
    httpStatus: result.httpStatus || 200,
    status: result.status || 'answered',
    intent: 'person_lookup',
    resolvedPeriod: null,
    periodResolution: { requested: null, resolved: null, substituted: false },
    answer,
    response: renderTextAnswer(answer),
  };
}

function buildDirectoryRequiredResponse() {
  return finalizeStandaloneAnswer({
    title: 'Directorio individual requerido',
    summary: 'El perfil actual no está habilitado para consultar fichas, legajos o licencias de una persona.',
    findings: [],
    evidence: [],
    caveats: ['El acceso nominal requiere un rol ejecutivo y una identidad municipal incluida en la habilitación privada.'],
    nextQuestions: ['¿Qué métricas agregadas GRH están disponibles?'],
    actions: [
      { id: 'open_rrhh', label: 'Abrir RRHH', href: '/rrhh' },
      { id: 'private_login', label: 'Ingresar con acceso privado', href: '/login.html' },
    ],
    directory: {
      status: 'directory_required',
      enabled: false,
      route: '/rrhh',
      publicAccess: 'aggregate_only',
    },
    status: 'limited',
    httpStatus: 422,
    code: 'DIRECTORY_REQUIRED',
  }, 'Acceso nominal GRH · sujeto al perfil institucional · sin consulta al directorio privado.');
}

async function buildPrivateDirectoryResponse({
  message,
  caller,
  readDirectoryImpl,
  expectedSource,
  readAudit,
}) {
  const lookup = parsePersonLookup(message);
  if (!lookup) {
    return finalizeStandaloneAnswer({
      title: 'Indicá una persona',
      summary: 'Escribí nombre y apellido o un número de legajo para consultar la ficha gobernada.',
      findings: [],
      evidence: [],
      caveats: ['No se ejecutó una búsqueda amplia ni se infirió una identidad.'],
      nextQuestions: ['Probá con “licencias de Nombre Apellido” o “legajo 123”.'],
      directory: { status: 'query_required', enabled: true, route: '/rrhh', options: [] },
      status: 'limited',
      httpStatus: 422,
      code: 'DIRECTORY_QUERY_REQUIRED',
    }, privateDirectorySourceLine(expectedSource));
  }

  const listLimit = lookup.kind === 'legajo' ? 100 : MAX_DIRECTORY_OPTIONS + 1;
  const list = await readDirectoryImpl({
    tenantId: String(caller.tenantId),
    query: { search: lookup.search, limit: listLimit },
  });
  assertPrivateDirectoryContract(list, expectedSource, 'list');
  await readAudit.allowRead('list', directoryListResultCount(list));

  const matches = lookup.kind === 'legajo'
    ? list.items.filter(item => item.legajo === lookup.legajo)
    : list.items;
  const matchCount = lookup.kind === 'legajo' ? matches.length : list.query.total;
  if (lookup.kind === 'legajo' && list.query.hasNext && matches.length === 0) {
    throw new Error('directory lookup incomplete');
  }

  if (matchCount === 0) return buildDirectoryNoMatch(expectedSource);
  if (matchCount > 1) return buildDirectoryMultipleMatches(matches, matchCount, expectedSource);

  readAudit.beginDetail();
  const selected = matches[0];
  if (!selected) throw new Error('directory list result missing');
  const detail = await readDirectoryImpl({
    tenantId: String(caller.tenantId),
    query: { company: selected.companyCode, legajo: selected.legajo },
  });
  assertPrivateDirectoryContract(detail, expectedSource, 'detail');
  if (detail.query.total !== 1 || detail.items.length !== 1) {
    throw new Error('directory detail cardinality invalid');
  }
  if (detail.items[0].companyCode !== selected.companyCode || detail.items[0].legajo !== selected.legajo) {
    throw new Error('directory detail identity mismatch');
  }
  await readAudit.allowRead('detail', 1);
  const person = mapPrivateDirectoryPerson(detail.items[0]);
  return buildDirectoryPersonAnswer(person, detail.source);
}

function parsePersonLookup(rawMessage) {
  const message = normalize(rawMessage).replace(/[¿?¡!.,;:()[\]{}"“”]/gu, ' ').replace(/\s+/g, ' ').trim();
  const legajo = message.match(/\blegajo\s*(?:(?:n(?:ro)?|numero)\s*[°º.]?|#|=|-)?\s*(\d{1,15})\b/);
  if (legajo) {
    const value = Number(legajo[1]);
    return Number.isSafeInteger(value) && value > 0
      ? { kind: 'legajo', legajo: value, search: String(value) }
      : null;
  }

  let candidate = message
    .replace(/^(?:mostra(?:me)?|busca(?:me)?|consulta(?:me)?|dame|ver)?\s*(?:el|la|las)?\s*/u, '')
    .replace(/^(?:historial\s+de\s+licencias|licencias?|ficha(?:\s+personal|\s+laboral)?)\s+(?:de|del)\s+/u, '')
    .replace(/^(?:un|una)\s+/u, '')
    .replace(/^(?:empleado|empleada|agente|concejal)\s+(?:llamado|llamada)?\s*/u, '')
    .replace(/\s+(?:empleado|empleada|agente|concejal)$/u, '')
    .trim();
  const tokens = candidate.split(' ').filter(Boolean);
  if (tokens.length < 2 || tokens.length > MAX_DIRECTORY_SEARCH_TOKENS) return null;
  if (tokens.some(token => !/^[a-z'-]{2,40}$/u.test(token))) return null;
  return { kind: 'name', search: tokens.join(' ') };
}

function assertPrivateDirectoryContract(value, expectedSource, mode) {
  if (!inspectGrhDirectoryResponse(value)?.ok || value?.query?.mode !== mode) {
    throw new Error('directory contract invalid');
  }
  if (value.source.sourceSha256 !== expectedSource?.sourceSha256 ||
      value.source.snapshotAsOf !== expectedSource?.snapshotAsOf) {
    throw new Error('directory provenance mismatch');
  }
}

function buildDirectoryNoMatch(expectedSource) {
  return finalizeStandaloneAnswer({
    title: 'Sin coincidencias verificables',
    summary: 'El directorio gobernado no encontró una ficha que coincida con la consulta.',
    findings: [],
    evidence: [],
    caveats: ['No se completó el resultado con datos demo ni se infirió una persona parecida.'],
    nextQuestions: ['Revisá el orden del nombre y apellido o consultá por número de legajo.'],
    directory: { status: 'no_match', enabled: true, route: '/rrhh', options: [] },
    status: 'limited',
    code: 'DIRECTORY_NO_MATCH',
  }, privateDirectorySourceLine(expectedSource));
}

function buildDirectoryMultipleMatches(items, total, expectedSource) {
  const options = items.slice(0, MAX_DIRECTORY_OPTIONS).map(mapPrivateDirectoryOption);
  return finalizeStandaloneAnswer({
    title: 'Elegí una coincidencia',
    summary: `El directorio encontró ${formatInteger(total)} fichas posibles. Seleccioná por nombre, legajo y área.`,
    findings: [],
    evidence: [metric('Coincidencias', formatInteger(total), `Se muestran hasta ${MAX_DIRECTORY_OPTIONS} opciones gobernadas.`)],
    caveats: ['No se eligió automáticamente una persona entre resultados ambiguos.'],
    nextQuestions: ['Consultá nuevamente con el número de legajo de la opción correcta.'],
    directory: { status: 'multiple_matches', enabled: true, route: '/rrhh', options },
    status: 'limited',
    code: 'DIRECTORY_MULTIPLE_MATCHES',
  }, privateDirectorySourceLine(expectedSource));
}

function mapPrivateDirectoryOption(item) {
  return {
    companyCode: item.companyCode,
    legajo: item.legajo,
    displayName: item.displayName,
    sector: mapPrivateDimension(item.sector),
    organization: mapPrivateDimension(item.organization),
    position: mapPrivatePosition(item.position),
    positionObservation: mapPrivatePositionObservation(item.positionObservation),
  };
}

function mapPrivateDirectoryPerson(item) {
  const leaveItems = Array.isArray(item.leaveHistory?.items)
    ? item.leaveHistory.items.slice(0, MAX_DIRECTORY_LEAVE_HISTORY).map(event => ({
      startDate: event.startDate,
      endDate: event.endDate,
      days: event.days,
    }))
    : [];
  return {
    companyCode: item.companyCode,
    legajo: item.legajo,
    displayName: item.displayName,
    sector: mapPrivateDimension(item.sector),
    organization: mapPrivateDimension(item.organization),
    position: mapPrivatePosition(item.position),
    positionObservation: mapPrivatePositionObservation(item.positionObservation),
    events: {
      absenceCount: item.events.absenceCount,
      latestAbsenceDate: item.events.latestAbsenceDate,
      leaveCount: item.events.leaveCount,
      latestLeaveStartDate: item.events.latestLeaveStartDate,
      latestLeaveEndDate: item.events.latestLeaveEndDate,
    },
    leaveHistory: {
      total: item.leaveHistory.total,
      limit: Math.min(item.leaveHistory.limit, MAX_DIRECTORY_LEAVE_HISTORY),
      items: leaveItems,
    },
  };
}

function mapPrivateDimension(value) {
  return value ? { code: value.code, label: value.label } : null;
}

function mapPrivatePosition(value) {
  return value ? {
    code: value.code,
    label: value.label,
    parent: mapPrivateDimension(value.parent),
    dependsOn: mapPrivateDimension(value.dependsOn),
  } : null;
}

function mapPrivatePositionObservation(value) {
  return value ? {
    label: value.label,
    observedDate: value.observedDate,
    observedPeriod: value.observedPeriod,
    status: value.status,
    sourceTable: value.sourceTable,
  } : null;
}

function buildDirectoryPersonAnswer(person, source) {
  const identity = person.displayName || `Legajo ${formatInteger(person.legajo)}`;
  const location = [person.sector?.label, person.organization?.label].filter(Boolean).join(' · ');
  const leaveHistory = person.leaveHistory.items;
  const latestLeave = leaveHistory[0] || null;
  const positionFinding = person.position?.label
    ? `Cargo informado: ${person.position.label}.`
    : (person.positionObservation?.label
      ? `Puesto observado en ${person.positionObservation.sourceTable}: ${person.positionObservation.label} (${person.positionObservation.observedDate}; ${positionObservationStatusLabel(person.positionObservation.status)}).`
      : 'La fuente no informa un cargo actual ni una observación histórica de puesto para esta ficha.');
  const observationCaveat = person.position ? [] : (person.positionObservation ? [
    person.positionObservation.status === 'source_future_effective'
      ? `La observación de puesto tiene fecha ${person.positionObservation.observedDate}, posterior al corte; no se presenta como cargo actual.`
      : `La observación de puesto corresponde a ${person.positionObservation.observedDate}; no se presenta como cargo actual.`,
  ] : []);
  const href = `/rrhh?company=${encodeURIComponent(person.companyCode)}&legajo=${encodeURIComponent(person.legajo)}#peopleDirectory`;
  return finalizeStandaloneAnswer({
    title: identity,
    summary: location || 'Ficha individual verificada en el directorio GRH privado.',
    findings: [positionFinding],
    evidence: [
      metric('Legajo', formatInteger(person.legajo), `Empresa ${person.companyCode}`),
      metric('Ausencias', formatInteger(person.events.absenceCount), person.events.latestAbsenceDate ? `Última: ${person.events.latestAbsenceDate}` : 'Sin fecha registrada'),
      metric('Licencias históricas', formatInteger(person.leaveHistory.total), latestLeave ? `Última: ${latestLeave.startDate}${latestLeave.endDate ? ` a ${latestLeave.endDate}` : ''}` : 'Sin eventos asociados'),
      metric('Puesto', person.position?.label || person.positionObservation?.label || 'Sin dato', person.position ? 'Cargo informado por GRH' : (person.positionObservation ? 'Observación histórica, no cargo actual' : 'No informado')),
    ],
    caveats: [
      ...observationCaveat,
      'Las licencias son históricas y se limitan a fechas y días; no describen una situación actual.',
    ],
    nextQuestions: [],
    actions: [{ id: 'open_rrhh_person', label: 'Abrir ficha en RRHH', href }],
    directory: {
      status: 'matched',
      enabled: true,
      route: '/rrhh',
      options: [],
      person,
    },
    status: 'answered',
  }, privateDirectorySourceLine(source));
}

function privateDirectorySourceLine(source) {
  return `Fuente: ${source?.canonicalSystem || 'GRH Junín'} · directorio privado · snapshot ${source?.snapshotAsOf || 'no disponible'} · acceso según perfil · no tiempo real.`;
}

function positionObservationStatusLabel(status) {
  return status === 'source_future_effective'
    ? 'vigencia informada posterior al corte; no es cargo actual'
    : 'observación histórica; no es cargo actual';
}

export default createAiAnalyzeHandler();

export function validateSemanticContract(data) {
  return validateGrhSemanticContract(data);
}

export function validateAssistantContracts(executive, quality, close = null) {
  const portableValid = validateGrhExecutiveContract(executive) &&
    validateGrhQualityContract(quality) &&
    executive?.privacy?.audience === 'portable' &&
    executive?.source?.sourceSha256 === quality?.source?.sourceSha256 &&
    executive?.source?.snapshotAsOf === quality?.source?.snapshotAsOf;
  if (!portableValid || close === null) return portableValid;
  return validateGrhCloseContract(close) &&
    close?.privacy?.threshold === executive?.privacy?.portableThreshold &&
    close?.source?.sourceSha256 === executive?.source?.sourceSha256 &&
    close?.source?.snapshotAsOf === executive?.source?.snapshotAsOf &&
    close?.source?.canonicalSystem === executive?.source?.canonicalSystem;
}

export function classifyIntent(rawMessage) {
  const message = normalize(rawMessage);

  if (/(ignora|omite|saltea).{0,35}(instruccion|regla|politica)|prompt del sistema|system prompt|jailbreak|revela.{0,25}(token|clave|secreto|variable de entorno)|(?:dump|volcado).{0,20}(base|tabla|sql)/.test(message)) {
    return { intent: 'policy_attack', policy: 'refused' };
  }
  if (/\b(dni|cuit|cuil|domicilio|direccion particular|telefono|correo personal|email personal)\b|lista de (?:todos los )?empleados|sueldo (?:de|individual)|datos personales/.test(message)) {
    return { intent: 'pii_request', policy: 'refused' };
  }
  if (isPersonLookup(message, rawMessage)) {
    return { intent: 'person_lookup', policy: 'limited' };
  }
  if (/pago bancario|transferid|depositad|acreditad|efectivamente pag|cuanto se pago|cuanto pagaron/.test(message)) {
    return { intent: 'bank_payment_limit', policy: 'limited' };
  }
  if (/predec|pronostic|proyect|forecast|adivina|estima.{0,12}(futuro|proximo)|por que (?:subio|bajo|aumento|cayo)|recomenda.{0,20}(recorte|despido|aumento)/.test(message)) {
    return { intent: 'forecast_limit', policy: 'limited' };
  }
  if (/\b(hola|buen dia|buenas|ayuda|que podes responder|como funciona)\b/.test(message)) {
    return { intent: 'help', policy: 'allowed' };
  }
  if (/^(?:personas?(?: y)? estructura|asistencia(?: y)? tiempo|licencias?(?: y)? salud(?: laboral)?|carrera(?: y)? desarrollo|relaciones? laborales?|nomina(?: y)? control(?: de calculo)?|beneficios?(?: y)? descuentos?|movimientos?(?: y)? trazabilidad)$/.test(message)) {
    return { intent: 'domain_catalog', policy: 'allowed' };
  }
  if (/requiere atencion|necesita atencion|prioridades?|que accion sigue|que revisar primero|brief de decision|agenda de decision/.test(message)) {
    return { intent: 'decision_brief', policy: 'allowed' };
  }
  if (/resumen|panorama|estado general|informe ejecutivo|principales alertas|tablero ejecutivo/.test(message)) {
    return { intent: 'executive_summary', policy: 'allowed' };
  }
  if (/cierre\s+(?:grh|mensual|de\s+(?:nomina|calculo))|explic.{0,20}(?:cierre|neto)|descomposici.{0,20}(?:neto|calculo)|composici.{0,20}(?:neto|calculo)|concili.{0,30}(?:mes|periodo|(?:19|20)\d{2}[-/]\d{1,2})/.test(message)) {
    return { intent: 'close_explanation', policy: 'allowed' };
  }
  if (/concili|cross.?source|totpago|diferencia.{0,20}(calculo|fuente)|compar.{0,20}(calculo|totpago)/.test(message)) {
    return { intent: 'reconciliation', policy: 'allowed' };
  }
  const financeIntent = classifyWorkforceFinanceIntent(message);
  if (financeIntent) return { intent: financeIntent, policy: 'allowed' };
  if (/inventario (?:de )?(?:datos|tablas|fuentes)|que tablas(?: de [a-z ]{2,60})? (?:hay|existen|contiene|estan disponibles)|tablas disponibles/.test(message)) {
    return { intent: 'data_inventory', policy: 'allowed' };
  }
  if (/catalogo (?:de )?(?:areas|datos|dominios)|que (?:areas(?: y datos)?|datos|dominios)(?: grh)? (?:hay|cubre|estan disponibles)|mapa de datos|que (?:datos|evidencia) de (?:carrera(?: y formacion)?|formacion|estudios?|beneficios?(?: y descuentos?)?|descuentos?|gremios?|relacion(?:es)? laboral(?:es)?) (?:hay|existe(?:n)?(?: en la base)?|estan disponibles)|que convenios? y gremios? (?:hay|existen|estan representados|estan disponibles)/.test(message)) {
    return { intent: 'domain_catalog', policy: 'allowed' };
  }
  if (/cuarenten|registro.{0,15}(invalido|excluido)|fecha.{0,15}(anomala|futura|corrupta)/.test(message)) {
    return { intent: 'quarantine', policy: 'allowed' };
  }
  if (/calidad|confiab|integridad|cobertura|score|puntaje/.test(message)) {
    return { intent: 'quality', policy: 'allowed' };
  }
  if (/ausenc|ausent|inasist/.test(message)) {
    return { intent: 'absence', policy: 'allowed' };
  }
  if (/licencia/.test(message)) {
    return { intent: 'leave', policy: 'allowed' };
  }
  if (/\bmovimientos?\b|legamov/.test(message)) {
    return { intent: 'movements', policy: 'allowed' };
  }
  if (/(?:dotacion|participantes?|personas).{0,40}(?:centro(?:s)? de costo(?:s)?|sector|convenio|acuerdo)|(?:centro(?:s)? de costo(?:s)?|por sector|por convenio|por acuerdo).{0,40}(?:dotacion|participantes?|personas)/.test(message)) {
    return { intent: 'workforce_distribution', policy: 'allowed' };
  }
  if (/evolucion|tendencia|variacion|cambio|compar.{0,15}(mes|periodo)|contra el mes|versus|\bvs\b/.test(message)) {
    return { intent: 'trend', policy: 'allowed' };
  }
  if (/centro(?:s)? de costo(?:s)?|por sector|por convenio|por acuerdo|categoria(?:s)? de acuerdo|distribu|concentracion|area.{0,15}(mas|mayor)|sector.{0,15}(mas|mayor)/.test(message)) {
    return { intent: 'workforce_distribution', policy: 'allowed' };
  }
  if (/dotacion|participante|participaron|cuantas personas|cuantos agentes|planta activa|empleados activos/.test(message)) {
    return { intent: 'workforce', policy: 'allowed' };
  }
  if (/control de calculo|liquidacion|remuneracion|retencion|aporte patronal|bruto|neto|concepto\s*(?:998|999)|masa salarial|nomina|sueldo/.test(message)) {
    return { intent: 'calculation_control', policy: 'allowed' };
  }
  if (/movimiento|legamov|\b(?:alta|baja)\b/.test(message)) {
    return { intent: 'movements', policy: 'allowed' };
  }
  if (/personal|emplead|legajo/.test(message)) {
    return { intent: 'workforce', policy: 'allowed' };
  }
  if (/fuente|origen|snapshot|corte|actualiza|tiempo real|personas_junin|grh/.test(message)) {
    return { intent: 'source', policy: 'allowed' };
  }
  if (isBarePersonName(message, rawMessage)) {
    return { intent: 'person_lookup', policy: 'limited' };
  }
  return { intent: 'out_of_scope', policy: 'unsupported' };
}

function classifyWorkforceFinanceIntent(message) {
  const dimensions = FINANCE_DIMENSIONS.filter(item => item.pattern.test(message));
  if (dimensions.length === 0) return null;
  const hasFinancialMetric = /costo (?:neto|salarial|de nomina)|importe|monto|finanz|neto|bruto|retencion|aporte patronal|masa salarial|nomina|\bcalculo\b/.test(message);
  if (/compar| versus |\bvs\b/.test(message)) {
    return hasFinancialMetric ? 'workforce_finance_compare' : null;
  }
  if (/componentes?|composicion|descomposicion|desglos|como se compone/.test(message)) {
    return hasFinancialMetric ? 'workforce_finance_composition' : null;
  }
  if (/evolucion|tendencia|ultimos? \d{1,2} meses|serie (?:mensual|historica)/.test(message)) {
    return hasFinancialMetric ? 'workforce_finance_trend' : null;
  }
  if (hasFinancialMetric) {
    return 'workforce_finance_overview';
  }
  return null;
}

function isPersonLookup(message, rawMessage) {
  const legajoLookup = /\blegajo\s*(?:(?:n(?:ro)?|numero)\s*[°º.]?|#|:|=|-)?\s*\d+\b/.test(message);
  const fileLookup = /\b(?:ficha|historial(?:\s+de\s+licencias)?)\s+(?:personal\s+|laboral\s+)?(?:de|del)\s+(?!(?:licencias?|municipio|personal|organismo|area|sector|periodo|ano|historicas?)\b)(?:(?:empleado|agente|concejal)\b|(?:[a-z][a-z'-]{1,}\s+){1,3}[a-z][a-z'-]{1,}\b)/.test(message);
  const leaveLookup = /\blicencias?\s+(?:de|del)\s+(?!(?:19|20)\d{2}\b)(?:un(?:a)?\s+)?(?:empleado|agente|concejal|[a-z][a-z'-]{1,}(?:\s+[a-z][a-z'-]{1,}){1,3})\b/.test(message);
  const namedRoleLookup = /\b(?:empleado|agente|concejal)\s+(?:llamad[oa]\s+)?[a-z][a-z'-]{1,}(?:\s+[a-z][a-z'-]{1,}){1,3}\b/.test(message);
  const roleAfterName = /^(?:[a-z][a-z'-]{1,}\s+){1,4}(?:concejal|empleado|agente)$/.test(message);
  return legajoLookup || fileLookup || leaveLookup || namedRoleLookup || roleAfterName;
}

function isBarePersonName(message, rawMessage) {
  const raw = String(rawMessage || '').trim();
  if (!/^[\p{L}'-]+(?:\s+[\p{L}'-]+){1,5}$/u.test(raw)) return false;
  if (/^(?:que|como|cual|cuanto|cuantos|dame|mostra(?:r(?:me)?|me)?|muestra(?:me)?|explica(?:r(?:me)?|me)?|analiza(?:r(?:me)?|me)?|compara|comparar|tendencia|evolucion|resumen|panorama|estado|inventario|catalogo)\b/.test(message)) {
    return false;
  }
  const tokens = message.split(' ');
  return tokens.length >= 2 && tokens.length <= MAX_DIRECTORY_SEARCH_TOKENS &&
    tokens.every(token => /^[a-z'-]{2,40}$/u.test(token));
}

export function buildDeterministicAnswer(
  message,
  executive,
  quality,
  close = null,
  presentation = null,
  assistantData = {},
) {
  if (!validateAssistantContracts(executive, quality, close)) {
    const error = new Error('Los contratos portables GRH no son válidos.');
    error.code = 'GRH_ASSISTANT_CONTRACT_INVALID';
    throw error;
  }
  const classification = classifyIntent(message);
  const context = semanticContext(
    executive,
    quality,
    close,
    presentation,
    assistantData,
  );
  const periodRequest = parsePeriodRequest(message);
  let result;

  switch (classification.intent) {
    case 'policy_attack':
      result = refusal(
        'Consulta rechazada',
        'El asistente no modifica sus reglas, no revela configuración interna y no accede a tablas crudas.',
        ['Reformulá la consulta como una pregunta agregada sobre GRH.'],
        'QUERY_NOT_ALLOWED'
      );
      break;
    case 'pii_request':
      result = refusal(
        'Datos personales fuera de alcance',
        'El contrato GRH del asistente es agregado y no contiene identificadores de empleados.',
        ['No se exponen nombres, legajos individuales, documentos, domicilios, contactos ni remuneraciones personales.'],
        'AGGREGATE_ONLY'
      );
      break;
    case 'person_lookup':
      result = directoryRequiredAnswer(context);
      break;
    case 'bank_payment_limit':
      result = limitedBankPayment(context);
      break;
    case 'forecast_limit':
      result = limitedForecast(context);
      break;
    case 'help':
      result = helpAnswer();
      break;
    case 'decision_brief':
      result = decisionBriefAnswer(context);
      break;
    case 'workforce_finance_overview':
    case 'workforce_finance_trend':
    case 'workforce_finance_composition':
    case 'workforce_finance_compare':
      result = workforceFinanceAnswer(context, message, classification.intent);
      break;
    case 'domain_catalog':
    case 'data_inventory':
      result = domainCatalogAnswer(context, classification.intent, message);
      break;
    case 'executive_summary':
      result = executiveSummary(context);
      break;
    case 'workforce':
      result = workforceAnswer(context);
      break;
    case 'workforce_distribution':
      result = workforceDistributionAnswer(context, message);
      break;
    case 'absence':
      result = absenceAnswer(context, periodRequest);
      break;
    case 'leave':
      result = leaveAnswer(context, periodRequest);
      break;
    case 'movements':
      result = movementsAnswer(context, periodRequest);
      break;
    case 'quality':
      result = qualityAnswer(context);
      break;
    case 'quarantine':
      result = quarantineAnswer(context);
      break;
    case 'calculation_control':
      result = calculationControlAnswer(context, periodRequest);
      break;
    case 'close_explanation':
      result = closeExplanationAnswer(context, periodRequest);
      break;
    case 'reconciliation':
      result = reconciliationAnswer(context);
      break;
    case 'trend':
      result = trendAnswer(context, periodRequest, message);
      break;
    case 'source':
      result = sourceAnswer(context);
      break;
    default:
      result = unsupportedAnswer();
  }

  const sourceLine = sourceCitation(context);
  const answer = {
    title: result.title,
    summary: result.summary,
    findings: result.findings || [],
    evidence: result.evidence || [],
    caveats: unique([...(result.caveats || []), ...context.baseCaveats]),
    source: sourceLine,
    nextQuestions: result.nextQuestions || [],
    code: result.code || null,
  };
  if (result.availablePeriodRange) answer.availablePeriodRange = { ...result.availablePeriodRange };
  if (result.directory) answer.directory = { ...result.directory };
  if (result.actions) answer.actions = result.actions.map(action => ({ ...action }));
  const visual = result.visual ? cloneAnswerVisual(result.visual) : null;
  if (visual) answer.visual = visual;

  return {
    httpStatus: result.httpStatus || 200,
    status: result.status || 'answered',
    intent: classification.intent,
    resolvedPeriod: result.resolvedPeriod || null,
    periodResolution: {
      requested: periodRequest.explicit ? periodRequest.label : null,
      resolved: result.resolvedPeriod || null,
      substituted: false,
    },
    answer,
    response: renderTextAnswer(answer),
  };
}

export function parsePeriodRequest(rawMessage) {
  const value = String(rawMessage || '');
  const periodMatches = [...value.matchAll(/\b((?:19|20)\d{2})[-/](\d{1,2})\b/g)];
  const invalid = periodMatches.find(match => Number(match[2]) < 1 || Number(match[2]) > 12);
  const months = unique(periodMatches
    .filter(match => Number(match[2]) >= 1 && Number(match[2]) <= 12)
    .map(match => `${match[1]}-${String(Number(match[2])).padStart(2, '0')}`));
  const years = periodMatches.length
    ? []
    : unique([...value.matchAll(/\b(?:19|20)\d{2}\b/g)].map(match => match[0]));

  return {
    explicit: Boolean(periodMatches.length || years.length),
    invalid: invalid ? invalid[0] : null,
    months,
    years,
    label: invalid?.[0] || months.join(' → ') || years.join(' → ') || null,
  };
}

function semanticContext(
  executive,
  qualityProjection,
  closeProjection = null,
  presentation = null,
  assistantData = {},
) {
  const series = executive.compensation.series
    .filter(row => row.privacyStatus === 'released')
    .slice()
    .sort((left, right) => left.period.localeCompare(right.period));
  if (series.length === 0) {
    const error = new Error('No hay períodos de cálculo liberados por privacidad.');
    error.code = 'GRH_ASSISTANT_PERIODS_PROTECTED';
    throw error;
  }
  const latestControl = series.at(-1);
  const latestPeriod = latestControl.period;
  const previousControl = series.at(-2) || null;

  return {
    executive,
    qualityProjection,
    closeProjection,
    calculationSeries: series,
    latestPeriod,
    latestControl,
    previousControl,
    reconciliation: qualityProjection.reconciliation,
    quality: qualityProjection.quality,
    workforce: executive.workforce,
    absence: executive.absence,
    leave: executive.leave,
    movements: executive.movements,
    referential: qualityProjection.referential,
    temporal: qualityProjection.temporal,
    snapshot: executive.source.snapshotAsOf,
    sourceName: executive.source.canonicalSystem,
    privacyThreshold: executive.privacy.portableThreshold,
    privacyPolicyVersion: executive.policyVersion,
    presentation: hasConfiguredCurrency(presentation) ? presentation : null,
    decisionBrief: validAssistantDecisionBrief(
      assistantData?.decisionBrief,
      executive.source,
    ),
    domainCatalog: validAssistantDomainCatalog(
      assistantData?.domainCatalog,
      executive.source,
    ),
    workforceFinance: validAssistantWorkforceFinance(
      assistantData?.workforceFinance,
      executive.source,
    ),
    baseCaveats: [],
  };
}

function validAssistantDecisionBrief(value, source) {
  if (value === undefined || value === null) return null;
  if (!inspectGrhDecisionBriefContract(value)?.ok || !sameAssistantSource(value.source, source)) {
    const error = new Error('El contrato decision-brief GRH no es válido.');
    error.code = 'GRH_DECISION_BRIEF_CONTRACT_INVALID';
    throw error;
  }
  return value;
}

function validAssistantDomainCatalog(value, source) {
  if (value === undefined || value === null) return null;
  if (!inspectGrhDomainCatalogContract(value)?.ok || !sameAssistantSource(value.source, source)) {
    const error = new Error('El contrato domain-catalog GRH no es válido.');
    error.code = 'GRH_DOMAIN_CATALOG_CONTRACT_INVALID';
    throw error;
  }
  return value;
}

function validAssistantWorkforceFinance(value, source) {
  if (value === undefined || value === null) return null;
  if (!inspectGrhWorkforceFinanceContract(value)?.ok || !sameAssistantSource(value.source, source)) {
    const error = new Error('El contrato workforce-finance GRH no es válido.');
    error.code = 'GRH_WORKFORCE_FINANCE_CONTRACT_INVALID';
    throw error;
  }
  return value;
}

function sameAssistantSource(left, right) {
  return left?.canonicalSystem === right?.canonicalSystem &&
    left?.sourceFile === right?.sourceFile &&
    left?.sourceSha256 === right?.sourceSha256 &&
    left?.snapshotAsOf === right?.snapshotAsOf &&
    left?.realtime === false && right?.realtime === false;
}

function resolveAnnualRequest(periodRequest, metricName) {
  if (periodRequest.invalid) {
    return { error: periodLimit('Período inválido', `“${periodRequest.invalid}” no es un período calendario válido.`, 'INVALID_PERIOD') };
  }
  if (periodRequest.months.length) {
    return {
      error: periodLimit(
        'Granularidad no disponible',
        `El contrato de ${metricName} sólo contiene agregados anuales; no puede responder ${periodRequest.label} como si fuera un mes.`,
        'PERIOD_GRANULARITY_UNAVAILABLE'
      ),
    };
  }
  if (periodRequest.years.length > 1) {
    return { error: periodLimit('Comparación no disponible', `Indicá un solo año para consultar ${metricName}.`, 'MULTIPLE_PERIODS_UNSUPPORTED') };
  }
  return { year: periodRequest.years[0] || null };
}

function protectedOrUnavailablePeriod(label, year, threshold) {
  return periodLimit(
    `${label} · ${year} con publicación limitada`,
    `No se publica un valor para ${year}: el período no está disponible o no alcanza el umbral portable k=${threshold}. No se sustituyó por otro año.`,
    'PRIVACY_PROTECTED_OR_UNAVAILABLE',
  );
}

function resolveCalculationRequest(context, periodRequest) {
  if (periodRequest.invalid) {
    return { error: periodLimit('Período inválido', `“${periodRequest.invalid}” no es un período calendario válido.`, 'INVALID_PERIOD') };
  }
  if (periodRequest.years.length) {
    const year = periodRequest.years[0];
    const available = context.calculationSeries
      .map(item => item.period)
      .filter(period => period.startsWith(`${year}-`));
    return {
      error: periodLimit(
        `Control de cálculo · ${year} requiere mes`,
        `El control está definido por mes. Indicá YYYY-MM; no se sustituyó ${year} por el último período.`,
        'PERIOD_GRANULARITY_UNAVAILABLE',
        available.length ? [`Períodos disponibles para ${year}: ${available.join(', ')}.`] : []
      ),
    };
  }
  if (periodRequest.months.length > 1) {
    return { error: periodLimit('Una consulta por período', 'Para el control de cálculo indicá un único período YYYY-MM.', 'MULTIPLE_PERIODS_UNSUPPORTED') };
  }
  const period = periodRequest.months[0] || context.latestPeriod;
  const control = context.calculationSeries.find(item => item.period === period);
  if (!control) {
    return {
      error: periodLimit(
        `Control de cálculo · ${period} con publicación limitada`,
        `No se publica ${period}: el período no está disponible o no alcanza el umbral portable k=${context.privacyThreshold}. No se sustituyó por ${context.latestPeriod}.`,
        'PRIVACY_PROTECTED_OR_UNAVAILABLE'
      ),
    };
  }
  return { control };
}

function resolveCloseRequest(context, periodRequest) {
  if (!context.closeProjection) {
    return {
      error: periodLimit(
        'Cierre mensual no disponible',
        'El contrato de cierre explicado no está disponible para esta consulta.',
        'CLOSE_CONTRACT_UNAVAILABLE'
      ),
    };
  }
  if (periodRequest.invalid) {
    return { error: periodLimit('Período inválido', `“${periodRequest.invalid}” no es un período calendario válido.`, 'INVALID_PERIOD') };
  }
  if (periodRequest.years.length) {
    const year = periodRequest.years[0];
    const available = context.closeProjection.series
      .filter(row => row.privacyStatus === 'released' && row.period.startsWith(`${year}-`))
      .map(row => row.period);
    return {
      error: periodLimit(
        `Cierre GRH · ${year} requiere mes`,
        `El cierre está definido por mes. Indicá YYYY-MM; no se sustituyó ${year} por el último período.`,
        'PERIOD_GRANULARITY_UNAVAILABLE',
        available.length ? [`Períodos liberados para ${year}: ${available.join(', ')}.`] : []
      ),
    };
  }
  if (periodRequest.months.length > 1) {
    return {
      error: periodLimit(
        'Un cierre por consulta',
        'Para explicar componentes y conciliación indicá un único período YYYY-MM.',
        'MULTIPLE_PERIODS_UNSUPPORTED'
      ),
    };
  }
  const period = periodRequest.months[0] || context.closeProjection.source.latestValidCalculationPeriod;
  const row = context.closeProjection.series.find(item => item.period === period);
  if (!row || row.privacyStatus !== 'released') {
    return {
      error: periodLimit(
        `Cierre GRH · ${period} con publicación limitada`,
        `No se publica ${period}: no está disponible o no alcanza el umbral k=${context.closeProjection.privacy.threshold}. No se sustituyó por otro mes.`,
        'PRIVACY_PROTECTED_OR_UNAVAILABLE'
      ),
    };
  }
  return { row };
}

function resolveTrendRequest(context, periodRequest) {
  if (periodRequest.invalid) {
    return { error: periodLimit('Período inválido', `“${periodRequest.invalid}” no es un período calendario válido.`, 'INVALID_PERIOD') };
  }
  if (periodRequest.years.length) {
    return {
      error: periodLimit(
        'Comparación mensual requiere YYYY-MM',
        'La serie de control es mensual. Indicá uno o dos períodos YYYY-MM; no se eligieron meses en forma implícita.',
        'PERIOD_GRANULARITY_UNAVAILABLE'
      ),
    };
  }
  if (periodRequest.months.length > 2) {
    return { error: periodLimit('Demasiados períodos', 'Indicá como máximo dos períodos YYYY-MM para comparar.', 'MULTIPLE_PERIODS_UNSUPPORTED') };
  }

  const series = context.calculationSeries;
  const selected = periodRequest.months.map(period => series.find(item => item.period === period));
  const missing = periodRequest.months.filter((period, index) => !selected[index]);
  if (missing.length) {
    return {
      error: periodLimit(
        'Período con publicación limitada',
        `No se publica ${missing.join(', ')}: no está disponible o no alcanza el umbral portable k=${context.privacyThreshold}. No se sustituyó por otros períodos.`,
        'PRIVACY_PROTECTED_OR_UNAVAILABLE'
      ),
    };
  }
  if (selected.length === 2) {
    const ordered = [...selected].sort((a, b) => a.period.localeCompare(b.period));
    return { previous: ordered[0], current: ordered[1] };
  }
  if (selected.length === 1) {
    const current = selected[0];
    const previous = series.filter(item => item.period < current.period).at(-1) || null;
    if (!previous) {
      return { error: periodLimit('Comparación no disponible', `No existe un período válido anterior a ${current.period}.`, 'PERIOD_NOT_AVAILABLE') };
    }
    return { previous, current };
  }
  return { previous: context.previousControl, current: context.latestControl };
}

function periodLimit(title, summary, code, findings = []) {
  return {
    title,
    summary,
    findings,
    evidence: [],
    caveats: ['El asistente no reemplaza un período solicitado por otro disponible.'],
    nextQuestions: ['¿Cuál es el último período válido?', '¿Qué períodos contiene el contrato?'],
    status: 'limited',
    httpStatus: 422,
    code,
  };
}

function executiveSummary(context) {
  const top = rankingRows(context.workforce.byCostCenter)[0] || null;
  const tolerance = context.quality.risks.latestCalculationControlWithinRoundingTolerance
    ? 'está dentro de la tolerancia de redondeo'
    : 'está fuera de la tolerancia de redondeo';
  return {
    title: `Resumen ejecutivo GRH · ${context.latestPeriod}`,
    summary: `El último período de cálculo liberado por la política portable registra ${formatInteger(context.workforce.payrollParticipants)} participantes. El control interno ${tolerance}, pero la conciliación con totpago presenta diferencias materiales.`,
    findings: [
      `${formatInteger(context.workforce.payrollParticipants)} claves de legajo participaron en al menos un cálculo válido; no equivalen a planta activa contractual.`,
      `El neto de control es ${formatSourceAmount(context.latestControl.amounts.netPayrollCents, context.presentation)}; no prueba una transferencia bancaria.`,
      `Calidad del extracto gobernado: ${formatPercent(context.quality.score)}. Conciliación cross-source: ${formatPercent(context.reconciliation.scorePct)}.`,
      top ? `${titleCase(top.label)} reúne ${formatInteger(top.participants)} participantes (${formatPercent(top.sharePct)}).` : null,
    ].filter(Boolean),
    evidence: [
      metric('Participación de liquidación', formatInteger(context.workforce.payrollParticipants), 'Claves distintas presentes en cálculo válido; no equivale a planta activa.'),
      metric('Neto de control', formatSourceAmount(context.latestControl.amounts.netPayrollCents, context.presentation), 'Control de liquidación; no desembolso acreditado.'),
      metric('Calidad gobernada', formatPercent(context.quality.score), 'Score del extracto agregado gobernado; no certifica cada tabla cruda.'),
      metric('Conciliación cross-source', formatPercent(context.reconciliation.scorePct), reconciliationLabel(context.reconciliation.status)),
    ],
    caveats: [
      currencyDisclosure(context),
      `totpago se usa sólo como diagnóstico; su acuerdo de valores global es ${formatPercent(context.reconciliation.valueAgreementPct)}.`,
    ],
    nextQuestions: ['¿Cómo se distribuyen los participantes por centro de costo?', '¿Qué muestra el control de cálculo?', '¿Qué registros quedaron en cuarentena?'],
    visual: executiveConfidenceVisual(context),
  };
}

function workforceAnswer(context) {
  const registered = finite(context.referential?.legajo?.uniqueKeys);
  return {
    title: `Participación de liquidación · ${context.latestPeriod}`,
    summary: `${formatInteger(context.workforce.payrollParticipants)} claves de legajo aparecen en al menos un registro válido de cálculo durante ${context.latestPeriod}. Esa es participación de liquidación, no dotación activa contractual.`,
    findings: [
      registered !== null ? `El maestro contiene ${formatInteger(registered)} claves de legajo únicas, pero ese total tampoco certifica planta activa.` : null,
      'CARGOID no es una dimensión usable para inferir cargos; el contrato distribuye por sector, centro de costo y convenio.',
    ].filter(Boolean),
    evidence: [
      metric('Participantes', formatInteger(context.workforce.payrollParticipants), 'Claves distintas presentes en cálculo válido del período.'),
      ...(registered !== null ? [metric('Legajos registrados', formatInteger(registered), 'Maestro histórico; no equivale a empleados activos.')] : []),
    ],
    caveats: ['El backup no contiene un estado contractual único y confiable para afirmar cuántos empleados están activos.'],
    nextQuestions: ['¿Cómo se distribuyen por centro de costo?', '¿Cuántos movimientos válidos hubo en 2026?'],
  };
}

function workforceDistributionAnswer(context, rawMessage) {
  const dimensions = resolveWorkforceDimensions(rawMessage);
  if (dimensions.length !== 1) {
    return workforceDistributionOverview(context, dimensions);
  }

  const dimension = dimensions[0];
  const ranking = rankingRows(context.workforce[dimension.key]).slice(0, 5);
  if (!ranking.length) {
    return distributionLimit(
      `${dimension.title} · sin evidencia`,
      `El contrato GRH no contiene una distribución válida por ${dimension.summaryLabel}; no se sustituyó por otra dimensión.`,
      'DISTRIBUTION_NOT_AVAILABLE'
    );
  }

  const top = ranking[0];
  return {
    title: `${dimension.title} · ${context.latestPeriod}`,
    summary: `${titleCase(top.label)} es la categoría con mayor participación dentro de ${dimension.summaryLabel}: ${formatInteger(top.participants)} participantes (${formatPercent(top.sharePct)}).`,
    findings: ranking.map((item, index) => `${index + 1}. ${titleCase(item.label)}: ${formatInteger(item.participants)} (${formatPercent(item.sharePct)}).`),
    evidence: ranking.map(item => metric(titleCase(item.label), formatInteger(item.participants), `${formatPercent(item.sharePct)} de los participantes del período.`)),
    caveats: [dimension.caveat],
    nextQuestions: dimension.nextQuestions,
    visual: workforceRankingVisual(context, dimension, rankingRows(context.workforce[dimension.key])),
  };
}

function resolveWorkforceDimensions(rawMessage) {
  const message = normalize(rawMessage);
  const dimensions = [
    {
      key: 'byCostCenter',
      requested: /centro(?:s)? de costo(?:s)?|centro(?:s)? costo(?:s)?/.test(message),
      title: 'Participantes por centro de costo',
      summaryLabel: 'los centros de costo de origen',
      caveat: 'Los centros de costo provienen de referencias GRH y describen imputación de liquidación; no prueban presupuesto ejecutado ni organigrama contractual vigente.',
      nextQuestions: ['¿Cómo se distribuyen por sector?', '¿Cómo se distribuyen por categoría de acuerdo de origen?'],
    },
    {
      key: 'bySector',
      requested: /\bsector(?:es)?\b|\barea(?:s)?\b/.test(message),
      title: 'Participantes por sector de origen',
      summaryLabel: 'los sectores de origen',
      caveat: 'Los sectores son clasificaciones agregadas de la fuente GRH; no certifican puesto, función actual ni estructura orgánica vigente.',
      nextQuestions: ['¿Cómo se distribuyen por centro de costo?', '¿Cómo se distribuyen por categoría de acuerdo de origen?'],
    },
    {
      key: 'byAgreement',
      requested: /\bconvenio(?:s)?\b|\bacuerdo(?:s)?\b|categoria(?:s)?(?: de acuerdo)?/.test(message),
      title: 'Participantes por categoría de acuerdo de origen',
      summaryLabel: 'las categorías de acuerdo de origen',
      caveat: 'La categoría de acuerdo es una clasificación fuente de la liquidación; no prueba por sí sola un convenio laboral vigente ni una condición contractual activa.',
      nextQuestions: ['¿Cómo se distribuyen por centro de costo?', '¿Cómo se distribuyen por sector?'],
    },
  ];

  return dimensions.filter(dimension => dimension.requested);
}

function workforceDistributionOverview(context, requestedDimensions) {
  const allDimensions = resolveWorkforceDimensions('centro de costo, sector y categoría de acuerdo');
  const dimensions = requestedDimensions.length ? requestedDimensions : allDimensions;
  const available = dimensions
    .map(dimension => ({ dimension, top: rankingRows(context.workforce[dimension.key])[0] || null }))
    .filter(item => item.top);

  if (!available.length) {
    return distributionLimit(
      'Distribución de participantes · sin evidencia',
      'El contrato GRH no contiene una dimensión agregada válida para esta consulta.',
      'DISTRIBUTION_NOT_AVAILABLE'
    );
  }

  return {
    title: `Distribución multidimensional · ${context.latestPeriod}`,
    summary: `El contrato permite comparar las mayores concentraciones de ${available.map(({ dimension }) => dimension.summaryLabel).join(', ')} sin mezclar sus significados.`,
    findings: available.map(({ dimension, top }) => `${dimension.title}: ${titleCase(top.label)}, ${formatInteger(top.participants)} (${formatPercent(top.sharePct)}).`),
    evidence: available.map(({ dimension, top }) => metric(dimension.title, formatInteger(top.participants), `${titleCase(top.label)} · ${formatPercent(top.sharePct)}.`)),
    caveats: ['Cada dimensión describe una clasificación de origen distinta. Sus valores no deben sumarse entre sí ni interpretarse como cargos, planta activa u organigrama vigente.'],
    nextQuestions: ['¿Cómo se distribuyen por centro de costo?', '¿Cómo se distribuyen por sector?', '¿Cómo se distribuyen por categoría de acuerdo de origen?'],
    visual: workforceOverviewVisual(context, available),
  };
}

function decisionBriefAnswer(context) {
  const brief = context.decisionBrief;
  if (!brief) {
    return assistantContractUnavailable(
      'Brief de decisión no disponible',
      'El contrato ejecutivo no está disponible para esta consulta.',
      'GRH_DECISION_BRIEF_UNAVAILABLE',
    );
  }
  const priorityLabels = {
    cross_source_material_difference: 'La conciliación cross-source presenta diferencias materiales.',
    temporal_quarantine_present: `${formatInteger(brief.situation.temporalQuarantineRows)} filas temporales permanecen en cuarentena.`,
    historical_snapshot: `El corte es histórico (${brief.source.snapshotAsOf}) y no opera en tiempo real.`,
  };
  const statusLabels = {
    attention_required: 'requiere atención',
    review_recommended: 'requiere revisión',
    context_only: 'aporta contexto',
  };
  const findings = brief.priorities.map(priority =>
    priorityLabels[priority.code] || `Prioridad gobernada: ${priority.code}.`);
  if (brief.change.status === 'released') {
    findings.push(
      `Frente a ${brief.change.previousPeriod}, la participación cambió ${formatSignedInteger(brief.change.participantDelta)} y el acuerdo mensual de valores cambió ${formatSignedPercent(brief.change.valueAgreementDeltaPctPoints)} puntos porcentuales.`,
    );
  }
  return {
    title: `Brief de decisión GRH · ${brief.period}`,
    summary: `El corte ${statusLabels[brief.status] || 'requiere lectura contextual'}. La primera acción es revisar la diferencia entre cálculo y totpago sin convertir el control en una afirmación de pago.`,
    findings,
    evidence: [
      metric('Participantes', brief.situation.participantDisplay, 'Participación de cálculo; no planta activa.'),
      metric('Calidad gobernada', formatPercent(brief.situation.qualityScorePct), 'Score del extracto agregado.'),
      metric('Cobertura mensual de corridas', formatPercent(brief.situation.runCoveragePct), 'No implica acuerdo de importes.'),
      metric('Acuerdo mensual de valores', formatPercent(brief.situation.valueAgreementPct), 'Comparación cálculo/totpago del mismo período.'),
    ],
    caveats: [
      'El brief prioriza señales verificadas; no asigna responsables, plazos ni causas.',
      'El cálculo de nómina no certifica transferencia bancaria ni asiento contable.',
    ],
    nextQuestions: [
      '¿Cómo evolucionó el neto de Servicios Públicos por centro de costo en los últimos 12 meses?',
      '¿Cómo está la conciliación entre cálculo y totpago?',
      '¿Qué registros quedaron en cuarentena?',
    ],
    actions: [
      {
        id: 'open_hacienda_reconciliation',
        label: 'Revisar conciliación en Hacienda',
        href: '/hacienda#closeReconciliationTitle',
        requiredCapability: 'navigation.hacienda',
      },
      {
        id: 'open_data_quality',
        label: 'Revisar cuarentena y calidad',
        href: '/calidad',
        requiredCapability: 'navigation.data-quality',
      },
      {
        id: 'open_organization_analytics',
        label: 'Abrir estructura y ausencias',
        href: '/estructura#organizationExplorer',
        requiredCapability: 'navigation.organization-analytics',
      },
    ],
    visual: decisionBriefVisual(brief),
    resolvedPeriod: brief.period,
  };
}

function domainCatalogAnswer(context, intent, rawMessage) {
  const catalog = context.domainCatalog;
  if (!catalog) {
    return assistantContractUnavailable(
      'Catálogo GRH no disponible',
      'El inventario gobernado de dominios no está disponible para esta consulta.',
      'GRH_DOMAIN_CATALOG_UNAVAILABLE',
    );
  }
  const selected = selectDomainCatalogDomain(catalog, rawMessage);
  const rankedDomains = catalog.domains.slice().sort((left, right) =>
    right.counts.rows - left.counts.rows || left.title.localeCompare(right.title, 'es'));
  const inventory = intent === 'data_inventory';
  if (selected) {
    const tables = selected.tables.slice().sort((left, right) =>
      right.rows - left.rows || left.label.localeCompare(right.label, 'es'));
    return {
      title: `${selected.title} · ${domainStatusLabel(selected.status)}`,
      summary: selected.summary,
      findings: [
        `${formatInteger(selected.counts.tables)} tablas mapeadas, ${formatInteger(selected.counts.nonEmptyTables)} con filas y ${formatInteger(selected.counts.rows)} filas inventariadas.`,
        ...tables.slice(0, 5).map(table =>
          `${table.label}: ${formatInteger(table.rows)} filas · ${table.status === 'available' ? 'disponible' : 'vacía'}.`),
      ],
      evidence: [
        metric('Tablas del dominio', formatInteger(selected.counts.tables), `${formatInteger(selected.counts.nonEmptyTables)} no vacías.`),
        metric('Filas inventariadas', formatInteger(selected.counts.rows), 'Metadato del diccionario gobernado.'),
        metric('Cobertura temporal', domainPeriodLabel(selected.periods), 'No se completan períodos ausentes.'),
        ...selected.coverage.slice(0, 2).map(item => metric(
          item.label,
          item.unit === 'percent' ? formatPercent(item.value) : formatInteger(item.value),
          item.status === 'verified' ? 'Cobertura verificada.' : 'Cobertura informativa.',
        )),
      ],
      caveats: [
        'El catálogo publica metadatos y cobertura; no abre filas crudas ni convierte tablas catalogadas en indicadores certificados.',
        'Una tabla disponible puede requerir una proyección y reglas de negocio adicionales antes de usarse para decidir.',
      ],
      nextQuestions: selected.questions.slice(0, 4),
      actions: [
        {
          id: `open_grh_domain_${selected.id}`,
          label: `Abrir ${selected.title}`,
          href: `/areas-grh.html?domain=${encodeURIComponent(selected.id)}`,
          requiredCapability: 'navigation.rrhh',
        },
        {
          id: 'open_data_quality',
          label: 'Revisar calidad y linaje',
          href: '/calidad',
          requiredCapability: 'navigation.data-quality',
        },
      ],
      visual: domainCatalogTableVisual(tables, selected.title),
    };
  }
  return {
    title: inventory ? 'Inventario gobernado de datos GRH' : 'Catálogo de áreas y dominios GRH',
    summary: `${formatInteger(catalog.counts.totalTables)} tablas y ${formatInteger(catalog.counts.totalRows)} filas están inventariadas en la fuente. ${formatInteger(catalog.counts.domainCount)} dominios organizan la evidencia; catalogado no equivale a indicador certificado.`,
    findings: rankedDomains.slice(0, 5).map(domain =>
      `${domain.title}: ${formatInteger(domain.counts.rows)} filas en ${formatInteger(domain.counts.tables)} tablas · ${domainStatusLabel(domain.status)}.`),
    evidence: [
      metric('Tablas totales', formatInteger(catalog.counts.totalTables), `${formatInteger(catalog.counts.nonEmptyTables)} no vacías.`),
      metric('Filas totales', formatInteger(catalog.counts.totalRows), 'Diccionario completo del snapshot.'),
      metric('Tablas mapeadas', formatInteger(catalog.counts.mappedTables), `${formatInteger(catalog.counts.domainCount)} dominios.`),
      metric('Filas mapeadas', formatInteger(catalog.counts.mappedRows), 'Suma reconciliada de los dominios publicados.'),
    ],
    caveats: [
      'El catálogo expone metadatos agregados; no abre filas crudas ni certifica automáticamente una métrica por cada tabla.',
      `Snapshot ${catalog.source.snapshotAsOf}; no es tiempo real.`,
    ],
    nextQuestions: rankedDomains.slice(0, 4).map(domain =>
      `¿Qué tablas de ${domain.title} hay?`),
    actions: [
      {
        id: 'open_grh_domain_catalog',
        label: 'Abrir áreas y datos GRH',
        href: '/areas-grh.html',
        requiredCapability: 'navigation.rrhh',
      },
      {
        id: 'open_data_quality',
        label: 'Revisar calidad de datos',
        href: '/calidad',
        requiredCapability: 'navigation.data-quality',
      },
    ],
    visual: domainCatalogOverviewVisual(rankedDomains),
  };
}

function selectDomainCatalogDomain(catalog, rawMessage) {
  const message = normalize(rawMessage);
  const definitions = [
    ['personas_estructura', /personas?|estructura|legajos?|organiza|dotacion/],
    ['asistencia_tiempo', /asistencia|ausencias?|tiempo|turnos?|horarios?|fichadas?/],
    ['licencias_salud', /licencias?|salud laboral|medic|\bart\b/],
    ['carrera_desarrollo', /carrera|desarrollo|formacion|estudios?|trayectoria|calificaciones?/],
    ['relaciones_laborales', /relaciones? laborales?|convenios?|gremios?|ambitos?|niveles?/],
    ['nomina_control', /nomina|control de calculo|liquidacion|totpago|cierre/],
    ['beneficios_descuentos', /beneficios?|descuentos?|embargos?|anticipos?|prestamos?|ganancias|obra social/],
    ['movimientos_trazabilidad', /movimientos?|trazabilidad|novedades?|errores? de importacion/],
  ];
  const matches = definitions.filter(([, pattern]) => pattern.test(message));
  if (matches.length !== 1) return null;
  return catalog.domains.find(domain => domain.id === matches[0][0]) || null;
}

function domainStatusLabel(status) {
  return {
    operational: 'operativo',
    partial: 'parcial',
    catalogued: 'catalogado',
  }[status] || 'sin estado';
}

function domainPeriodLabel(periods) {
  if (periods?.status === 'not_available') return 'No disponible';
  if (periods?.first === periods?.last) return periods.first;
  return `${periods?.first || '—'} → ${periods?.last || '—'}`;
}

function workforceFinanceAnswer(context, rawMessage, intent) {
  if (!context.workforceFinance) {
    return assistantContractUnavailable(
      'Análisis de cohortes financieras no disponible',
      'El contrato workforce-finance no está disponible para esta consulta.',
      'GRH_WORKFORCE_FINANCE_UNAVAILABLE',
    );
  }
  const query = parseWorkforceFinanceQuery(rawMessage, context.workforceFinance, intent);
  if (!query.ok) return workforceFinanceLimit(query);
  if (intent === 'workforce_finance_trend') return workforceFinanceTrendAnswer(context, query);
  if (intent === 'workforce_finance_composition') return workforceFinanceCompositionAnswer(context, query);
  if (intent === 'workforce_finance_compare') return workforceFinanceCompareAnswer(context, query);
  return workforceFinanceOverviewAnswer(context, query);
}

export function parseWorkforceFinanceQuery(rawMessage, projection, intent) {
  if (!inspectGrhWorkforceFinanceContract(projection)?.ok || !FINANCE_INTENTS.has(intent)) {
    return { ok: false, code: 'FINANCE_CONTRACT_INVALID' };
  }
  const message = normalize(rawMessage);
  const dimensions = FINANCE_DIMENSIONS.filter(item => item.pattern.test(message));
  if (dimensions.length !== 1) {
    return { ok: false, code: dimensions.length ? 'FINANCE_DIMENSION_AMBIGUOUS' : 'FINANCE_DIMENSION_REQUIRED' };
  }
  const dimension = dimensions[0];
  const view = projection.dimensionViews.find(item => item.dimension === dimension.key);
  if (!view) return { ok: false, code: 'FINANCE_DIMENSION_UNAVAILABLE' };

  const periodRequest = parsePeriodRequest(rawMessage);
  if (periodRequest.invalid || periodRequest.months.length > 1 || periodRequest.years.length) {
    return { ok: false, code: 'FINANCE_PERIOD_INVALID' };
  }
  const period = periodRequest.months[0] || projection.cohort.lastPeriod;
  const periodRow = view.periods.find(item => item.period === period);
  if (!periodRow || periodRow.privacyStatus !== 'released') {
    return { ok: false, code: 'FINANCE_PERIOD_UNAVAILABLE', period };
  }

  const component = FINANCE_COMPONENTS.find(item => item.pattern.test(message)) ||
    FINANCE_COMPONENTS.find(item => item.key === 'netPayrollCents');
  const categories = matchFinanceCategories(message, view, period);
  const requiredCount = intent === 'workforce_finance_compare'
    ? 2
    : (intent === 'workforce_finance_overview' ? null : 1);
  if (categories.length > 2 || (requiredCount !== null && categories.length !== requiredCount) ||
      (intent === 'workforce_finance_overview' && categories.length > 1)) {
    return {
      ok: false,
      code: categories.length === 0 ? 'FINANCE_CATEGORY_REQUIRED' : 'FINANCE_CATEGORY_AMBIGUOUS',
      period,
      dimension: dimension.key,
    };
  }

  const rawWindow = message.match(/ultimos?\s+(\d{1,2})\s+meses/);
  const windowMonths = rawWindow ? Number(rawWindow[1]) : 12;
  if (intent === 'workforce_finance_trend' &&
      (!Number.isSafeInteger(windowMonths) || windowMonths < 2 || windowMonths > 12)) {
    return { ok: false, code: 'FINANCE_TREND_WINDOW_UNSUPPORTED' };
  }
  return {
    ok: true,
    intent,
    dimension,
    component,
    period,
    periodRow,
    view,
    categories,
    windowMonths,
    projection,
  };
}

function matchFinanceCategories(message, view, period) {
  const candidates = new Map();
  for (const row of view.periods) {
    if (row.period > period || row.privacyStatus !== 'released') continue;
    for (const cell of row.cells) {
      if (cell.privacyStatus !== 'released' || !Number.isSafeInteger(cell.companyCode) ||
          !Number.isSafeInteger(cell.sourceCode)) continue;
      const normalizedLabel = normalize(cell.label);
      if (!normalizedLabel || !message.includes(normalizedLabel)) continue;
      const id = `${cell.companyCode}:${cell.sourceCode}`;
      const previous = candidates.get(id);
      if (!previous || row.period > previous.observedPeriod) {
        candidates.set(id, { ...cell, observedPeriod: row.period, normalizedLabel });
      }
    }
  }
  const matches = [...candidates.values()];
  return matches
    .filter(candidate => !matches.some(other =>
      other !== candidate && other.normalizedLabel.length > candidate.normalizedLabel.length &&
      other.normalizedLabel.includes(candidate.normalizedLabel)))
    .sort((left, right) => message.indexOf(left.normalizedLabel) - message.indexOf(right.normalizedLabel));
}

function workforceFinanceOverviewAnswer(context, query) {
  const released = query.periodRow.cells.filter(cell => cell.privacyStatus === 'released');
  const selected = query.categories[0] || null;
  const rows = selected
    ? released.filter(cell => financeCellIdentity(cell) === financeCellIdentity(selected))
    : released.slice().sort((left, right) =>
      right.components[query.component.key] - left.components[query.component.key] ||
      left.label.localeCompare(right.label, 'es'));
  if (!rows.length) return workforceFinanceLimit({ ok: false, code: 'FINANCE_CATEGORY_UNAVAILABLE' });
  const top = rows[0];
  const findings = selected
    ? [
      `${top.label}: ${formatSourceAmount(top.components[query.component.key], context.presentation)} de ${query.component.label.toLowerCase()}.`,
      `Participación de asignación del período: ${formatPercent(top.allocationSharePct)}.`,
    ]
    : rows.slice(0, 5).map((cell, index) =>
      `${index + 1}. ${cell.label}: ${formatSourceAmount(cell.components[query.component.key], context.presentation)} (${formatPercent(cell.allocationSharePct)}).`);
  return {
    title: `${query.component.label} por ${query.dimension.label} · ${query.period}`,
    summary: `${top.label} concentra el mayor valor liberado: ${formatSourceAmount(top.components[query.component.key], context.presentation)}. Es asignación observada en cálculo, no presupuesto ejecutado ni pago bancario.`,
    findings,
    evidence: rows.slice(0, 4).map(cell => metric(
      cell.label,
      formatSourceAmount(cell.components[query.component.key], context.presentation),
      `${formatPercent(cell.allocationSharePct)} del neto asignado del período.`,
    )),
    caveats: workforceFinanceCaveats(query.projection),
    nextQuestions: [
      `¿Cómo evolucionó el neto de ${top.label} por ${query.dimension.label} en los últimos 12 meses?`,
      `Mostrá los componentes de ${top.label} por ${query.dimension.label} en ${query.period}`,
    ],
    actions: financeActions(top, query.dimension),
    visual: selected
      ? workforceFinanceComponentsVisual(context, top, query)
      : workforceFinanceRankingVisual(context, rows, query),
    resolvedPeriod: query.period,
  };
}

function workforceFinanceCompositionAnswer(context, query) {
  const selected = financeCellForPeriod(query.periodRow, query.categories[0]);
  if (!selected) return workforceFinanceLimit({ ok: false, code: 'FINANCE_CATEGORY_UNAVAILABLE' });
  return {
    title: `Composición de ${selected.label} · ${query.period}`,
    summary: `El neto de control asignado a ${selected.label} es ${formatSourceAmount(selected.components.netPayrollCents, context.presentation)}. La composición es aritmética y no atribuye causas.`,
    findings: [
      `Bruto con asignaciones: ${formatSourceAmount(selected.components.grossWithFamilyAllowancesCents, context.presentation)}.`,
      `Retenciones: ${formatSourceAmount(selected.components.employeeWithholdingsCents, context.presentation)}.`,
      `Aportes patronales: ${formatSourceAmount(selected.components.employerContributionsCents, context.presentation)}.`,
      `Participación de asignación: ${formatPercent(selected.allocationSharePct)}.`,
    ],
    evidence: FINANCE_COMPONENTS.map(component => metric(
      component.label,
      formatSourceAmount(selected.components[component.key], context.presentation),
      'Componente de cálculo liberado.',
    )),
    caveats: workforceFinanceCaveats(query.projection),
    nextQuestions: [
      `¿Cómo evolucionó el neto de ${selected.label} por ${query.dimension.label} en los últimos 12 meses?`,
      `¿Qué costo neto se concentra por ${query.dimension.label} en ${query.period}?`,
    ],
    actions: financeActions(selected, query.dimension),
    visual: workforceFinanceComponentsVisual(context, selected, query),
    resolvedPeriod: query.period,
  };
}

function workforceFinanceTrendAnswer(context, query) {
  const selected = query.categories[0];
  const rows = query.view.periods
    .filter(row => row.period <= query.period)
    .slice(-query.windowMonths)
    .map(row => ({ row, cell: financeCellForPeriod(row, selected) }))
    .filter(item => item.row.privacyStatus === 'released' && item.cell);
  if (rows.length < 2) return workforceFinanceLimit({ ok: false, code: 'FINANCE_TREND_UNAVAILABLE' });
  const first = rows[0];
  const latest = rows.at(-1);
  const firstValue = first.cell.components[query.component.key];
  const latestValue = latest.cell.components[query.component.key];
  const delta = latestValue - firstValue;
  const deltaPct = firstValue === 0 ? null : delta / firstValue * 100;
  return {
    title: `${query.component.label} de ${latest.cell.label} · tendencia`,
    summary: `Entre ${first.row.period} y ${latest.row.period}, el valor cambió ${formatSourceAmountSigned(delta, context.presentation)}${deltaPct === null ? '' : ` (${formatSignedPercent(deltaPct)})`}.`,
    findings: [
      `${first.row.period}: ${formatSourceAmount(firstValue, context.presentation)}.`,
      `${latest.row.period}: ${formatSourceAmount(latestValue, context.presentation)}.`,
      `${rows.length} meses liberados dentro de una ventana de ${query.windowMonths}; no se completaron huecos ni celdas protegidas.`,
    ],
    evidence: [
      metric('Cambio observado', formatSourceAmountSigned(delta, context.presentation), `${first.row.period} → ${latest.row.period}.`),
      metric('Meses liberados', formatInteger(rows.length), `Ventana solicitada: ${query.windowMonths}.`),
    ],
    caveats: workforceFinanceCaveats(query.projection),
    nextQuestions: [
      `Mostrá los componentes de ${latest.cell.label} por ${query.dimension.label} en ${latest.row.period}`,
      `¿Qué costo neto se concentra por ${query.dimension.label} en ${latest.row.period}?`,
    ],
    actions: financeActions(latest.cell, query.dimension),
    visual: workforceFinanceTrendVisual(context, rows, query),
    resolvedPeriod: `${first.row.period}→${latest.row.period}`,
  };
}

function workforceFinanceCompareAnswer(context, query) {
  const cells = query.categories.map(category => financeCellForPeriod(query.periodRow, category));
  if (cells.some(cell => !cell)) {
    return workforceFinanceLimit({ ok: false, code: 'FINANCE_CATEGORY_UNAVAILABLE' });
  }
  const [left, right] = cells;
  const leftValue = left.components[query.component.key];
  const rightValue = right.components[query.component.key];
  const delta = leftValue - rightValue;
  const larger = delta >= 0 ? left : right;
  const smaller = delta >= 0 ? right : left;
  const absoluteDelta = Math.abs(delta);
  const smallerValue = smaller.components[query.component.key];
  const deltaPct = smallerValue === 0 ? null : absoluteDelta / smallerValue * 100;
  return {
    title: `${query.component.label} comparado · ${query.period}`,
    summary: `${larger.label} supera a ${smaller.label} por ${formatSourceAmount(absoluteDelta, context.presentation)}${deltaPct === null ? '' : ` (${formatPercent(deltaPct)})`}.`,
    findings: cells.map(cell =>
      `${cell.label}: ${formatSourceAmount(cell.components[query.component.key], context.presentation)} (${formatPercent(cell.allocationSharePct)} de asignación).`),
    evidence: cells.map(cell => metric(
      cell.label,
      formatSourceAmount(cell.components[query.component.key], context.presentation),
      `${query.dimension.label} · ${query.period}.`,
    )),
    caveats: workforceFinanceCaveats(query.projection),
    nextQuestions: cells.map(cell =>
      `¿Cómo evolucionó el neto de ${cell.label} por ${query.dimension.label} en los últimos 12 meses?`),
    actions: cells.flatMap(cell => financeActions(cell, query.dimension)).slice(0, 4),
    visual: workforceFinanceComparisonVisual(context, cells, query),
    resolvedPeriod: query.period,
  };
}

function financeCellForPeriod(periodRow, identity) {
  return periodRow?.privacyStatus === 'released'
    ? periodRow.cells.find(cell =>
      cell.privacyStatus === 'released' && financeCellIdentity(cell) === financeCellIdentity(identity)) || null
    : null;
}

function financeCellIdentity(cell) {
  return `${cell?.companyCode}:${cell?.sourceCode}`;
}

function financeActions(cell, dimension) {
  if (!Number.isSafeInteger(cell?.companyCode) || !Number.isSafeInteger(cell?.sourceCode)) {
    return [{
      id: 'open_hacienda_cohorts',
      label: 'Abrir cohortes en Hacienda',
      href: '/hacienda#cohortContext',
      requiredCapability: 'navigation.hacienda',
    }];
  }
  const parameters = new URLSearchParams({
    cohort: dimension.key,
    company: String(cell.companyCode),
    code: String(cell.sourceCode),
  });
  return [{
    id: `open_hacienda_${dimension.key}_${cell.companyCode}_${cell.sourceCode}`,
    label: `Abrir ${cell.label} en Hacienda`,
    href: `/hacienda?${parameters.toString()}#cohortContext`,
    requiredCapability: 'navigation.hacienda',
  }];
}

function workforceFinanceCaveats(projection) {
  return [
    'Los importes son control de cálculo presentado en ARS por configuración del tenant; la fuente no declara moneda y no certifica pago.',
    'Cada vista usa una sola dimensión. No se cruzan sector, centro de costo y acuerdo ni se habilitan filtros arbitrarios.',
    projection.cohort.participantsMayOverlapAcrossCategories
      ? 'Una persona puede aparecer en más de una categoría observada durante el período; las categorías no describen planta contractual exclusiva.'
      : 'Las categorías describen observaciones de cálculo, no estado contractual.',
  ];
}

function workforceFinanceLimit(query) {
  const messages = {
    FINANCE_CONTRACT_INVALID: 'El contrato financiero no superó la validación exacta.',
    FINANCE_DIMENSION_REQUIRED: 'Indicá una dimensión: sector, centro de costo o categoría de acuerdo.',
    FINANCE_DIMENSION_AMBIGUOUS: 'Elegí una sola dimensión; el contrato no permite intersecciones.',
    FINANCE_DIMENSION_UNAVAILABLE: 'La dimensión solicitada no está publicada.',
    FINANCE_PERIOD_INVALID: 'Indicá como máximo un período mensual YYYY-MM dentro del contrato.',
    FINANCE_PERIOD_UNAVAILABLE: 'El período solicitado no está liberado en el contrato financiero.',
    FINANCE_CATEGORY_REQUIRED: 'Indicá una categoría publicada dentro de la dimensión elegida.',
    FINANCE_CATEGORY_AMBIGUOUS: 'La consulta no identifica la cantidad exacta de categorías requerida.',
    FINANCE_CATEGORY_UNAVAILABLE: 'La categoría no está liberada para ese período.',
    FINANCE_TREND_WINDOW_UNSUPPORTED: 'La tendencia admite entre 2 y 12 meses observados.',
    FINANCE_TREND_UNAVAILABLE: 'No hay al menos dos meses liberados y comparables para esa categoría.',
  };
  return {
    title: 'Consulta financiera incompleta',
    summary: messages[query.code] || 'La consulta no cumple el contrato unidimensional de cohortes financieras.',
    findings: [],
    evidence: [],
    caveats: ['No se sustituyó la dimensión, categoría o período solicitado por otro valor.'],
    nextQuestions: [
      '¿Qué costo neto se concentra por centro de costo en 2026-07?',
      'Mostrá los componentes de Servicios Públicos por centro de costo en 2026-07',
    ],
    status: 'limited',
    httpStatus: 422,
    code: query.code || 'FINANCE_QUERY_INVALID',
  };
}

function assistantContractUnavailable(title, summary, code) {
  return {
    title,
    summary,
    findings: [],
    evidence: [],
    caveats: ['No se generó una respuesta alternativa ni se reutilizó otro contrato.'],
    nextQuestions: ['¿Cuál es la fuente y el corte disponibles?'],
    status: 'limited',
    httpStatus: 503,
    code,
  };
}

function rankingRows(ranking) {
  if (!ranking || !['released', 'partially_suppressed'].includes(ranking.privacyStatus)) return [];
  return ranking.rows.filter(row =>
    row.privacyStatus === 'released' || row.privacyStatus === 'protected_aggregate');
}

function distributionLimit(title, summary, code) {
  return {
    title,
    summary,
    findings: [],
    evidence: [],
    caveats: ['El asistente no reemplaza una dimensión solicitada por otra disponible.'],
    nextQuestions: ['¿Qué dimensiones de participación están disponibles?'],
    status: 'limited',
    httpStatus: 422,
    code,
  };
}

function absenceAnswer(context, periodRequest) {
  const requested = resolveAnnualRequest(periodRequest, 'ausencias');
  if (requested.error) return requested.error;
  const year = requested.year || context.latestPeriod.slice(0, 4);
  const row = context.absence.series.find(item => item.period === year);
  if (!row || row.privacyStatus !== 'released') {
    return protectedOrUnavailablePeriod('Ausencias', year, context.privacyThreshold);
  }
  return {
    title: `Ausencias GRH · ${year}`,
    summary: `GRH registra ${formatInteger(row.value)} filas válidas de ausencia en ${year}, sobre al menos ${formatInteger(row.participantCount)} participantes distintos. Son eventos registrados, no una tasa de ausentismo.`,
    findings: [
      `El período supera el umbral portable k=${context.privacyThreshold}.`,
      'No hay denominador de exposición ni estado activo contractual suficiente para calcular una tasa actual de ausentismo.',
    ],
    evidence: [
      metric(`Registros válidos ${year}`, formatInteger(row.value), 'Filas de ausencia, no empleados únicos.'),
      metric('Participantes distintos', formatInteger(row.participantCount), 'Cardinalidad usada para liberar el agregado portable.'),
    ],
    caveats: ['No se informa “ausentismo actual” porque el contrato no permite construir una tasa comparable y gobernada.'],
    nextQuestions: ['¿Qué registros quedaron en cuarentena?', '¿Qué cobertura tienen los cruces con legajo?'],
    visual: annualEventVisual(context.absence, {
      title: 'Ausencias registradas por año',
      subtitle: 'Filas válidas de ausencia; sólo años liberados por privacidad.',
    }),
    resolvedPeriod: year,
  };
}

function directoryRequiredAnswer(context) {
  const releasedLeaveYears = context.leave.series
    .filter(item => item.privacyStatus === 'released')
    .map(item => item.period)
    .sort((left, right) => left.localeCompare(right));
  const firstYear = releasedLeaveYears[0] || null;
  const latestYear = releasedLeaveYears.at(-1) || null;
  const rangeLabel = firstYear && latestYear ? `${firstYear}–${latestYear}` : 'sin años liberados';

  return {
    title: 'Directorio individual requerido',
    summary: 'Esta demostración pública no busca ni muestra fichas, legajos o licencias de una persona.',
    findings: [
      `La analítica agregada de licencias está disponible para ${rangeLabel}.`,
    ],
    evidence: [],
    caveats: ['La consulta individual requiere identidad municipal, finalidad autorizada, campos mínimos y auditoría; ese directorio no está habilitado en los accesos públicos.'],
    nextQuestions: latestYear ? [`¿Cuántas licencias hubo en ${latestYear}?`, '¿Cómo se distribuyen los participantes por sector?'] : ['¿Qué métricas agregadas GRH están disponibles?'],
    actions: [
      { id: 'open_rrhh', label: 'Abrir RRHH agregado', href: '/rrhh' },
      { id: 'private_login', label: 'Ingresar con acceso privado', href: '/login.html' },
    ],
    directory: {
      status: 'directory_required',
      enabled: false,
      route: '/rrhh',
      publicAccess: 'aggregate_only',
    },
    status: 'limited',
    httpStatus: 422,
    code: 'DIRECTORY_REQUIRED',
  };
}

function leaveAnswer(context, periodRequest) {
  const requested = resolveAnnualRequest(periodRequest, 'licencias');
  if (requested.error) return requested.error;
  const releasedRows = context.leave.series
    .filter(item => item.privacyStatus === 'released')
    .slice()
    .sort((left, right) => left.period.localeCompare(right.period));
  const firstAvailable = releasedRows[0] || null;
  const latestAvailable = releasedRows.at(-1) || null;
  if (!latestAvailable) {
    return periodLimit(
      'Licencias históricas no disponibles',
      'El contrato portable no contiene un año de licencias liberado por privacidad.',
      'LEAVE_SERIES_UNAVAILABLE',
    );
  }

  const year = requested.year || latestAvailable.period;
  const row = context.leave.series.find(item => item.period === year);
  if (!row || row.privacyStatus !== 'released') {
    return protectedOrUnavailablePeriod('Licencias', year, context.privacyThreshold);
  }
  const availablePeriodRange = {
    from: firstAvailable.period,
    to: latestAvailable.period,
    latest: latestAvailable.period,
  };
  const defaultedToLatestAvailable = requested.year === null;
  return {
    title: `${defaultedToLatestAvailable ? 'Licencias históricas' : 'Licencias GRH'} · ${year}`,
    summary: `En ${year}, GRH registra ${formatInteger(row.value)} filas válidas de licencia sobre ${formatInteger(row.participantCount)} participantes distintos. La serie liberada cubre ${availablePeriodRange.from}–${availablePeriodRange.to}.`,
    findings: [
      `${year} es ${defaultedToLatestAvailable ? 'el último año disponible' : 'el año solicitado'} dentro del snapshot; no describe licencias actuales.`,
    ],
    evidence: [
      metric(`Registros válidos ${year}`, formatInteger(row.value), 'Filas de licencia, no empleados únicos.'),
      metric('Participantes distintos', formatInteger(row.participantCount), 'Cardinalidad usada para liberar el agregado portable.'),
    ],
    caveats: ['La fuente de licencias termina en 2009; no se extrapola a un estado actual.'],
    nextQuestions: [`¿Cuántas licencias hubo en ${year === availablePeriodRange.from ? availablePeriodRange.to : availablePeriodRange.from}?`, '¿Qué datos de ausencias están disponibles?'],
    actions: [
      { id: 'open_rrhh', label: 'Abrir analítica RRHH', href: '/rrhh' },
    ],
    visual: annualEventVisual(context.leave, {
      title: 'Licencias históricas por año',
      subtitle: 'Filas válidas de licencia; la fuente termina en 2009 y no describe estado actual.',
    }),
    availablePeriodRange,
    resolvedPeriod: year,
  };
}

function movementsAnswer(context, periodRequest) {
  const requested = resolveAnnualRequest(periodRequest, 'movimientos');
  if (requested.error) return requested.error;
  const year = requested.year || context.latestPeriod.slice(0, 4);
  const row = context.movements.series.find(item => item.period === year);
  if (!row || row.privacyStatus !== 'released') {
    return protectedOrUnavailablePeriod('Movimientos', year, context.privacyThreshold);
  }
  return {
    title: `Movimientos GRH · ${year}`,
    summary: `Se observan ${formatInteger(row.value)} filas válidas de movimiento en ${year}, sobre al menos ${formatInteger(row.participantCount)} participantes distintos. Son eventos de legamov, no altas o bajas clasificadas.`,
    findings: [
      `El período supera el umbral portable k=${context.privacyThreshold}.`,
      'El contrato actual no clasifica de forma gobernada los eventos como ingreso, egreso, ascenso o cambio de área.',
    ],
    evidence: [
      metric(`Movimientos válidos ${year}`, formatInteger(row.value), 'Filas de legamov; no personas únicas.'),
      metric('Participantes distintos', formatInteger(row.participantCount), 'Cardinalidad usada para liberar el agregado portable.'),
    ],
    caveats: ['No se derivan rotación, altas o bajas sin una taxonomía validada de tipos de movimiento.'],
    nextQuestions: ['¿Cuál es la cobertura del cruce con legajo?', '¿Qué calidad tiene el extracto?'],
    visual: annualEventVisual(context.movements, {
      title: 'Movimientos registrados por año',
      subtitle: 'Filas válidas de legamov; no representan altas, bajas ni personas únicas.',
    }),
    resolvedPeriod: year,
  };
}

function qualityAnswer(context) {
  const components = context.quality.components || {};
  return {
    title: 'Calidad del contrato GRH',
    summary: `El extracto agregado obtiene ${formatPercent(context.quality.score)}. El principal riesgo cuantitativo es la conciliación entre calculo y totpago, no la integridad referencial.`,
    findings: [
      componentFinding('Validez temporal', components.temporalValidity),
      componentFinding('Integridad referencial', components.referentialIntegrity),
      componentFinding('Conciliación de liquidación', components.payrollReconciliation),
      componentFinding('Unicidad de legajo', components.legajoKeyUniqueness),
    ].filter(Boolean),
    evidence: [
      metric('Score gobernado', formatPercent(context.quality.score), context.quality.scope),
      metric('Filas temporales en cuarentena', formatInteger(context.quality.risks.quarantinedTemporalRows), 'No alimentan KPIs ejecutivos.'),
      metric('Conciliación cross-source', formatPercent(context.reconciliation.scorePct), reconciliationLabel(context.reconciliation.status)),
    ],
    caveats: ['El score evalúa el extracto agregado gobernado; no certifica la aptitud de cada tabla cruda de GRH.'],
    nextQuestions: ['¿Por qué totpago es sólo diagnóstico?', '¿Cómo se compone la cuarentena?'],
    visual: qualityComponentsVisual(components),
  };
}

function quarantineAnswer(context) {
  const sources = ['calculo', 'legamov', 'ausencia', 'licencia', 'totpago'];
  const breakdown = sources.map(source => ({
    source,
    rows: finite(context.temporal?.domains?.[source]?.quarantineRows) || 0,
  }));
  return {
    title: 'Cuarentena temporal',
    summary: `${formatInteger(context.quality.risks.quarantinedTemporalRows)} filas temporales fueron excluidas de los indicadores gobernados.`,
    findings: breakdown.map(item => `${item.source}: ${formatInteger(item.rows)} filas.`),
    evidence: breakdown.map(item => metric(item.source, formatInteger(item.rows), 'Excluidas por fecha o período inválido según la política del snapshot.')),
    caveats: ['Las razones de cuarentena pueden superponerse; el total informado corresponde a filas únicas excluidas.'],
    nextQuestions: ['¿Cuál es el score de calidad?', '¿Qué período se considera válido?'],
    visual: quarantineVisual(breakdown),
  };
}

function calculationControlAnswer(context, periodRequest) {
  const resolved = resolveCalculationRequest(context, periodRequest);
  if (resolved.error) return resolved.error;
  const control = resolved.control;
  const period = control.period;
  const amounts = control.amounts;
  const isLatest = period === context.latestPeriod;
  const toleranceFinding = isLatest
    ? `El control más reciente ${context.quality.risks.latestCalculationControlWithinRoundingTolerance ? 'está' : 'no está'} dentro de la tolerancia de redondeo declarada.`
    : 'La proyección portable no publica un estado histórico de tolerancia para este período.';
  return {
    title: `Control de cálculo · ${period}`,
    summary: `El neto de control totaliza ${formatSourceAmount(amounts.netPayrollCents, context.presentation)}. Es un control de liquidación calculada y no acredita un desembolso.`,
    findings: [
      `Bruto con asignaciones familiares: ${formatSourceAmount(amounts.grossWithFamilyAllowancesCents, context.presentation)}.`,
      `Retenciones del personal: ${formatSourceAmount(amounts.employeeWithholdingsCents, context.presentation)}.`,
      `Aportes patronales calculados: ${formatSourceAmount(amounts.employerContributionsCents, context.presentation)}.`,
      toleranceFinding,
    ],
    evidence: [
      metric('Bruto de control', formatSourceAmount(amounts.grossWithFamilyAllowancesCents, context.presentation), 'Agregado de cálculo portable.'),
      metric('Retenciones', formatSourceAmount(amounts.employeeWithholdingsCents, context.presentation), 'Agregado de cálculo portable.'),
      metric('Neto de control', formatSourceAmount(amounts.netPayrollCents, context.presentation), 'No es una transferencia acreditada.'),
      metric('Participantes', formatInteger(control.participantCount), `Período liberado con umbral k=${context.privacyThreshold}.`),
    ],
    caveats: [currencyDisclosure(context)],
    nextQuestions: ['¿Cómo concilia con totpago?', '¿Cómo cambió frente al período anterior?'],
    visual: calculationControlVisual(context, control),
    resolvedPeriod: period,
  };
}

function closeExplanationAnswer(context, periodRequest) {
  const resolved = resolveCloseRequest(context, periodRequest);
  if (resolved.error) return resolved.error;
  const row = resolved.row;
  const components = row.components;
  const control = row.control;
  const reconciliation = row.reconciliation;
  const unionRuns = reconciliation.calculationRuns + reconciliation.totpagoRuns - reconciliation.matchedRuns;
  return {
    title: `Cierre GRH explicado · ${row.period}`,
    summary: `El neto de control de ${row.period} es ${formatSourceAmount(components.netPayrollCents, context.presentation)}. Surge aritméticamente del bruto con asignaciones menos las retenciones; no es una atribución causal ni evidencia de pago.`,
    findings: [
      `Ingresos contributivos: ${formatSourceAmount(components.contributoryEarningsCents, context.presentation)}; no contributivos: ${formatSourceAmount(components.nonContributoryEarningsCents, context.presentation)}; asignaciones familiares: ${formatSourceAmount(components.familyAllowancesCents, context.presentation)}.`,
      `Bruto con asignaciones: ${formatSourceAmount(components.grossWithFamilyAllowancesCents, context.presentation)}; retenciones: ${formatSourceAmount(components.employeeWithholdingsCents, context.presentation)}.`,
      `Neto a pagar del control: ${formatSourceAmount(components.netToPayCents, context.presentation)}; aportes del empleador: ${formatSourceAmount(components.employerContributionsCents, context.presentation)}.`,
      `Identidad aritmética ${control.identityWithinRoundingTolerance ? 'dentro' : 'fuera'} de la tolerancia mensual de ${formatInteger(control.roundingToleranceCents)} centavos de unidad fuente.`,
      `Conciliación del mismo mes: cobertura ${formatPercent(reconciliation.runCoveragePct)}, exactitud de métricas ${formatPercent(reconciliation.metricExactRatePct)} y acuerdo de valores ${formatPercent(reconciliation.valueAgreementPct)}.`,
      `Varianza absoluta mensual calculo/totpago: ${formatSourceAmount(reconciliation.absoluteVarianceCents, context.presentation)}.`,
    ],
    evidence: [
      metric('Participantes', formatInteger(row.participantCount), `Agregado mensual liberado con k=${context.closeProjection.privacy.threshold}.`),
      metric('Neto de control', formatSourceAmount(components.netPayrollCents, context.presentation), 'Cálculo salarial agregado; no desembolso.'),
      metric('Cobertura mensual', formatPercent(reconciliation.runCoveragePct), `${formatInteger(reconciliation.matchedRuns)} de ${formatInteger(unionRuns)} corridas del universo combinado.`),
      metric('Acuerdo mensual de valores', formatPercent(reconciliation.valueAgreementPct), 'Proviene de period_series; no reutiliza el score global.'),
      metric('Identidad dentro de tolerancia', control.identityWithinRoundingTolerance ? 'Sí' : 'No', `Variación neta ${formatInteger(control.netIdentityVarianceCents)} centavos de unidad fuente.`),
    ],
    caveats: [
      currencyDisclosure(context),
      'La descomposición es aritmética y no explica por qué cambió un componente.',
      'El control de cálculo no prueba transferencia, acreditación bancaria ni asiento contable.',
    ],
    nextQuestions: ['¿Cómo cambió el neto frente al mes anterior?', '¿Cuál es la calidad global del extracto?'],
    visual: closeComponentsVisual(context, row),
    resolvedPeriod: row.period,
  };
}

function reconciliationAnswer(context) {
  const data = context.reconciliation;
  return {
    title: 'Conciliación calculo vs totpago',
    summary: `La conciliación obtiene ${formatPercent(data.scorePct)} y su estado es “${reconciliationLabel(data.status)}”. totpago queda limitado a diagnóstico y no gobierna los importes ejecutivos.`,
    findings: [
      `${formatInteger(data.matchedRuns)} corridas emparejadas sobre ${formatInteger(data.calculationRuns)} de calculo y ${formatInteger(data.totpagoRuns)} de totpago.`,
      `${formatInteger(data.fullyReconciledRuns)} corridas completamente conciliadas.`,
      `Cobertura de corridas: ${formatPercent(data.runCoveragePct)}; exactitud de métricas: ${formatPercent(data.metricExactRatePct)}.`,
      `Acuerdo de valores: ${formatPercent(data.valueAgreementPct)}.`,
    ],
    evidence: [
      metric('Score de conciliación', formatPercent(data.scorePct), reconciliationLabel(data.status)),
      metric('Cobertura de corridas', formatPercent(data.runCoveragePct), `${formatInteger(data.matchedRuns)} corridas emparejadas.`),
      metric('Acuerdo de valores', formatPercent(data.valueAgreementPct), 'Comparación agregada entre fuentes.'),
      metric('Corridas conciliadas', `${formatInteger(data.fullyReconciledRuns)} / ${formatInteger(data.matchedRuns)}`, 'Conciliación completa dentro de tolerancia.'),
    ],
    caveats: ['Una alta cobertura de corridas no implica acuerdo de importes; ambas medidas deben leerse juntas.'],
    nextQuestions: ['¿Qué muestra el control de cálculo?', '¿Cuál es el principal riesgo de calidad?'],
    visual: reconciliationVisual(data),
  };
}

function trendAnswer(context, periodRequest, rawMessage = '') {
  const message = normalize(rawMessage);
  const requestedDimension = [...FINANCE_DIMENSIONS, ...NON_FINANCIAL_TREND_DIMENSIONS]
    .find(item => item.pattern.test(message));
  if (requestedDimension) return dimensionalTrendLimit(requestedDimension);
  const resolved = resolveTrendRequest(context, periodRequest);
  if (resolved.error) return resolved.error;
  const { current, previous } = resolved;
  if (!previous) return unsupportedAnswer('No hay dos períodos válidos suficientes para calcular la variación.');

  const participantDelta = current.participantCount - previous.participantCount;
  const netDelta = current.amounts.netPayrollCents - previous.amounts.netPayrollCents;
  const netRate = previous.amounts.netPayrollCents
    ? netDelta / previous.amounts.netPayrollCents * 100
    : null;
  return {
    title: `Variación de control · ${previous.period} a ${current.period}`,
    summary: `Entre los dos últimos períodos válidos, la participación cambió ${formatSignedInteger(participantDelta)} y el neto de control cambió ${formatSourceAmountSigned(netDelta, context.presentation)}${netRate === null ? '' : ` (${formatSignedPercent(netRate)})`}.`,
    findings: [
      `${previous.period}: ${formatInteger(previous.participantCount)} participantes y ${formatSourceAmount(previous.amounts.netPayrollCents, context.presentation)} de neto de control.`,
      `${current.period}: ${formatInteger(current.participantCount)} participantes y ${formatSourceAmount(current.amounts.netPayrollCents, context.presentation)} de neto de control.`,
      'La variación es aritmética; el contrato no atribuye causas.',
    ],
    evidence: [
      metric('Cambio de participantes', formatSignedInteger(participantDelta), `${previous.period} → ${current.period}.`),
      metric('Cambio de neto de control', formatSourceAmountSigned(netDelta, context.presentation), netRate === null ? 'Sin tasa comparable.' : formatSignedPercent(netRate)),
    ],
    caveats: [currencyDisclosure(context), 'No se proyectan períodos futuros ni se explican causas sin variables y metodología adicionales.'],
    nextQuestions: ['¿Qué compone el control del último período?', '¿Cómo está la conciliación cross-source?'],
    visual: trendVisual(context, previous, current),
    resolvedPeriod: `${previous.period}→${current.period}`,
  };
}

function dimensionalTrendLimit(dimension) {
  const examples = {
    sector: '¿Cómo evolucionó el neto de Obrero por sector en los últimos 12 meses?',
    costCenter: '¿Cómo evolucionó el neto de Servicios Públicos por centro de costo en los últimos 12 meses?',
    agreement: '¿Cómo evolucionó el neto de Personal interino por acuerdo en los últimos 12 meses?',
  };
  return {
    title: `Definí la categoría para la tendencia por ${dimension.label}`,
    summary: `La fuente no publica una serie histórica general de distribución por ${dimension.label}. No la sustituí por la variación municipal total. Para recorrer los 24 meses gobernados, indicá una categoría liberada y una métrica como neto, bruto, retenciones o aportes.`,
    findings: [
      `La distribución agregada actual por ${dimension.label} sigue disponible en Dotación y estructura.`,
      'Hacienda y nómina permite tendencias mensuales por una sola dimensión y categoría.',
    ],
    evidence: [],
    caveats: ['No se mezclan categorías ni se presenta el total municipal como si fuera una tendencia dimensional.'],
    nextQuestions: [
      examples[dimension.key] || '¿Qué tablas de personas y estructura hay?',
      '¿Cómo se distribuyen los participantes por sector y centro de costo?',
    ],
    actions: [
      {
        id: 'open_workforce_structure',
        label: 'Abrir dotación y estructura',
        href: '/estructura',
        requiredCapability: 'navigation.organization-analytics',
      },
      {
        id: 'open_workforce_finance',
        label: 'Abrir Hacienda y nómina',
        href: '/hacienda#cohortContext',
        requiredCapability: 'navigation.hacienda',
      },
    ],
    status: 'limited',
    httpStatus: 422,
    code: 'DIMENSIONAL_TREND_REQUIRES_CATEGORY',
  };
}

function sourceAnswer(context) {
  return {
    title: 'Fuente y alcance',
    summary: `La fuente canónica es ${context.sourceName}, con snapshot ${context.snapshot}. El último período válido de cálculo es ${context.latestPeriod}.`,
    findings: [
      'personas_junin está explícitamente excluida del contrato y no se usa para cruzar, completar ni migrar datos.',
      'Los artefactos son privados, vinculados al tenant municipal y agregados sin PII.',
      'No existe una conexión en tiempo real en este corte.',
      'totpago se conserva únicamente como contraste diagnóstico; los KPIs de liquidación provienen de conceptos de control de calculo.',
    ],
    evidence: [
      metric('Snapshot', context.snapshot, 'Fecha máxima gobernada del backup.'),
      metric('Último cálculo válido', context.latestPeriod, 'Último período de calculation_control_series.'),
      metric('Fuente ejecutiva', 'calculo', 'Conceptos de control; totpago es diagnóstico.'),
    ],
    caveats: ['La actualización futura requiere materializar un nuevo contrato privado y volver a validar calidad y conciliación.'],
    nextQuestions: ['¿Cuál es la calidad del extracto?', '¿Qué registros quedaron en cuarentena?'],
  };
}

function limitedBankPayment(context) {
  return {
    title: 'El contrato no prueba un desembolso',
    summary: `GRH permite informar un neto de control calculado de ${formatSourceAmount(context.latestControl.amounts.netPayrollCents, context.presentation)} para ${context.latestPeriod}, pero no confirma cuánto fue transferido, depositado o acreditado.`,
    findings: [
      'El neto publicado es control de cálculo, no evidencia de desembolso.',
      `totpago presenta diferencias materiales y sólo se usa como diagnóstico (${formatPercent(context.reconciliation.scorePct)} de score).`,
      'Para responder pago efectivo se necesita una fuente bancaria o de Tesorería reconciliada y autorizada.',
    ],
    evidence: [metric('Neto de control', formatSourceAmount(context.latestControl.amounts.netPayrollCents, context.presentation), 'No equivale a una transferencia acreditada.')],
    caveats: [currencyDisclosure(context), 'No se convierte el dato de cálculo en una afirmación de pago.'],
    nextQuestions: ['¿Qué muestra el control de cálculo?', '¿Cómo está la conciliación con totpago?'],
    status: 'limited',
  };
}

function limitedForecast() {
  return {
    title: 'Proyección fuera del contrato',
    summary: 'El snapshot GRH no contiene un modelo de pronóstico validado ni variables suficientes para atribuir causas o recomendar decisiones futuras.',
    findings: [
      'Puedo comparar períodos observados de calculation_control_series.',
      'No genero predicciones, causas ni recomendaciones de recorte con datos insuficientes.',
    ],
    evidence: [],
    caveats: ['Una proyección futura requiere metodología aprobada, backtesting, intervalos de incertidumbre y variables explicativas gobernadas.'],
    nextQuestions: ['¿Cómo cambió el control frente al período anterior?', '¿Cuál es el último período válido?'],
    status: 'limited',
  };
}

function helpAnswer() {
  return {
    title: 'Consultas ejecutivas disponibles',
    summary: 'Puedo responder preguntas agregadas y deterministas sobre el contrato privado GRH.',
    findings: [
      'Participación de liquidación y distribución por sector, centro de costo o categoría de acuerdo de origen.',
      'Ausencias, licencias históricas y movimientos dentro de su cobertura válida.',
      'Calidad, cuarentena, control de cálculo y conciliación cross-source.',
      'Cierre mensual explicado: componentes del neto y conciliación del mismo período.',
      'Fuente, snapshot, período y límites de interpretación.',
    ],
    evidence: [],
    caveats: ['No respondo con PII, datos individuales, predicciones ni pagos bancarios no reconciliados.'],
    nextQuestions: ['Dame un resumen ejecutivo', '¿Cuántas personas participaron en la liquidación?', '¿Cómo está la conciliación?'],
  };
}

function unsupportedAnswer(detail) {
  return {
    title: 'Consulta fuera del contrato GRH',
    summary: detail || 'No hay una respuesta verificable para esa consulta dentro de las métricas agregadas habilitadas.',
    findings: ['Reformulá la pregunta sobre participación de liquidación, ausencias, movimientos, calidad, cuarentena, control de cálculo o conciliación.'],
    evidence: [],
    caveats: ['El asistente no completa vacíos con datos demo ni inferencias.'],
    nextQuestions: ['Dame un resumen ejecutivo', '¿Qué datos GRH están disponibles?'],
    status: 'unsupported',
    httpStatus: 422,
    code: 'QUERY_OUT_OF_SCOPE',
  };
}

function refusal(title, summary, caveats, code) {
  return {
    title,
    summary,
    findings: [],
    evidence: [],
    caveats,
    nextQuestions: ['¿Qué métricas agregadas GRH están disponibles?'],
    status: 'refused',
    httpStatus: 422,
    code,
  };
}

function executiveConfidenceVisual(context) {
  const data = context.reconciliation;
  return buildBarVisual({
    title: 'Señales de confianza del corte',
    subtitle: 'Indicadores porcentuales independientes; no deben sumarse entre sí.',
    order: 'defined',
    unit: 'percent',
    scaleMax: 100,
    items: [
      visualItem('Calidad gobernada', context.quality.score, formatPercent(context.quality.score)),
      visualItem('Conciliación cross-source', data.scorePct, formatPercent(data.scorePct)),
      visualItem('Cobertura de corridas', data.runCoveragePct, formatPercent(data.runCoveragePct)),
      visualItem('Acuerdo de valores', data.valueAgreementPct, formatPercent(data.valueAgreementPct)),
    ],
  });
}

function workforceRankingVisual(context, dimension, rows) {
  const items = [...rows]
    .sort((left, right) => right.participants - left.participants || left.label.localeCompare(right.label, 'es'))
    .slice(0, MAX_ANSWER_VISUAL_ITEMS)
    .map(row => visualItem(
      titleCase(row.label),
      row.participants,
      `${formatInteger(row.participants)} · ${formatPercent(row.sharePct)}`,
    ));
  return buildBarVisual({
    title: dimension.title,
    subtitle: `Participación de liquidación ${context.latestPeriod}; escala sobre ${formatInteger(context.workforce.payrollParticipants)} participantes, no planta activa.`,
    order: 'ranked',
    unit: 'participants',
    scaleMax: context.workforce.payrollParticipants,
    items,
  });
}

function workforceOverviewVisual(context, available) {
  const items = available
    .map(({ dimension, top }) => visualItem(
      `${dimension.summaryLabel}: ${titleCase(top.label)}`,
      top.participants,
      `${formatInteger(top.participants)} · ${formatPercent(top.sharePct)}`,
    ))
    .sort((left, right) => right.value - left.value || left.label.localeCompare(right.label, 'es'))
    .slice(0, MAX_ANSWER_VISUAL_ITEMS);
  return buildBarVisual({
    title: 'Mayores concentraciones por dimensión',
    subtitle: `Cada barra pertenece a una clasificación distinta de ${context.latestPeriod}; no deben sumarse entre sí.`,
    order: 'ranked',
    unit: 'participants',
    scaleMax: context.workforce.payrollParticipants,
    items,
  });
}

function annualEventVisual(domain, { title, subtitle }) {
  const rows = Array.isArray(domain?.series)
    ? domain.series
      .filter(row => row?.privacyStatus === 'released' && Number.isSafeInteger(row.value) && row.value >= 0)
      .slice()
      .sort((left, right) => left.period.localeCompare(right.period))
      .slice(-MAX_ANSWER_VISUAL_ITEMS)
    : [];
  const items = rows.map(row => visualItem(row.period, row.value, formatInteger(row.value)));
  return buildBarVisual({
    title,
    subtitle,
    order: 'chronological',
    unit: 'records',
    scaleMax: maxVisualValue(items),
    items,
  });
}

function qualityComponentsVisual(components) {
  const definitions = [
    ['Validez temporal', components?.temporalValidity?.score],
    ['Integridad referencial', components?.referentialIntegrity?.score],
    ['Conciliación de liquidación', components?.payrollReconciliation?.score],
    ['Unicidad de legajo', components?.legajoKeyUniqueness?.score],
  ];
  return buildBarVisual({
    title: 'Componentes de calidad gobernada',
    subtitle: 'Puntajes ponderados del extracto agregado; no certifican cada tabla cruda.',
    order: 'defined',
    unit: 'percent',
    scaleMax: 100,
    items: definitions.map(([label, value]) => visualItem(label, value, formatPercent(value))),
  });
}

function quarantineVisual(breakdown) {
  const items = breakdown
    .map(item => visualItem(item.source, item.rows, formatInteger(item.rows)))
    .sort((left, right) => right.value - left.value || left.label.localeCompare(right.label, 'es'));
  return buildBarVisual({
    title: 'Filas temporales excluidas por fuente',
    subtitle: 'Filas fuera de los KPIs gobernados por fecha o período inválido.',
    order: 'ranked',
    unit: 'rows',
    scaleMax: maxVisualValue(items),
    items,
  });
}

function calculationControlVisual(context, control) {
  const amounts = control.amounts;
  const items = [
    visualItem('Bruto con asignaciones', amounts.grossWithFamilyAllowancesCents, formatSourceAmount(amounts.grossWithFamilyAllowancesCents, context.presentation)),
    visualItem('Retenciones', amounts.employeeWithholdingsCents, formatSourceAmount(amounts.employeeWithholdingsCents, context.presentation)),
    visualItem('Neto de control', amounts.netPayrollCents, formatSourceAmount(amounts.netPayrollCents, context.presentation)),
    visualItem('Aportes patronales', amounts.employerContributionsCents, formatSourceAmount(amounts.employerContributionsCents, context.presentation)),
  ];
  return buildBarVisual({
    title: `Magnitudes del control · ${control.period}`,
    subtitle: `${currencyDisclosure(context)} Las barras comparan magnitudes y no deben sumarse entre sí; no prueban desembolso.`,
    order: 'defined',
    unit: 'source_currency_cents',
    scaleMax: maxVisualValue(items),
    items,
  });
}

function closeComponentsVisual(context, row) {
  const components = row.components;
  const definitions = [
    ['Ingresos contributivos', components.contributoryEarningsCents],
    ['Ingresos no contributivos', components.nonContributoryEarningsCents],
    ['Asignaciones familiares', components.familyAllowancesCents],
    ['Bruto con asignaciones', components.grossWithFamilyAllowancesCents],
    ['Retenciones', components.employeeWithholdingsCents],
    ['Neto de control', components.netPayrollCents],
    ['Neto a pagar del control', components.netToPayCents],
    ['Aportes patronales', components.employerContributionsCents],
  ];
  const items = definitions.map(([label, value]) => visualItem(label, value, formatSourceAmount(value, context.presentation)));
  return buildBarVisual({
    title: `Componentes del cierre · ${row.period}`,
    subtitle: `${currencyDisclosure(context)} Son magnitudes aritméticas del mismo cierre; no deben sumarse todas entre sí ni interpretarse como pago.`,
    order: 'defined',
    unit: 'source_currency_cents',
    scaleMax: maxVisualValue(items),
    items,
  });
}

function reconciliationVisual(data) {
  return buildBarVisual({
    title: 'Conciliación global calculo vs totpago',
    subtitle: 'Indicadores globales independientes; cobertura alta no implica acuerdo de importes.',
    order: 'defined',
    unit: 'percent',
    scaleMax: 100,
    items: [
      visualItem('Score de conciliación', data.scorePct, formatPercent(data.scorePct)),
      visualItem('Cobertura de corridas', data.runCoveragePct, formatPercent(data.runCoveragePct)),
      visualItem('Exactitud de métricas', data.metricExactRatePct, formatPercent(data.metricExactRatePct)),
      visualItem('Acuerdo de valores', data.valueAgreementPct, formatPercent(data.valueAgreementPct)),
    ],
  });
}

function trendVisual(context, previous, current) {
  const items = [previous, current].map(row => visualItem(
    row.period,
    row.amounts.netPayrollCents,
    formatSourceAmount(row.amounts.netPayrollCents, context.presentation),
  ));
  return buildBarVisual({
    title: 'Neto de control por período',
    subtitle: `${currencyDisclosure(context)} Comparación observada; no es pronóstico ni evidencia de pago.`,
    order: 'chronological',
    unit: 'source_currency_cents',
    scaleMax: maxVisualValue(items),
    items,
  });
}

function decisionBriefVisual(brief) {
  return buildBarVisual({
    title: 'Señales para decidir',
    subtitle: 'Indicadores independientes del último período; no deben sumarse entre sí.',
    order: 'defined',
    unit: 'percent',
    scaleMax: 100,
    items: [
      visualItem('Calidad gobernada', brief.situation.qualityScorePct, formatPercent(brief.situation.qualityScorePct)),
      visualItem('Cobertura de corridas', brief.situation.runCoveragePct, formatPercent(brief.situation.runCoveragePct)),
      visualItem('Exactitud de métricas', brief.situation.metricExactRatePct, formatPercent(brief.situation.metricExactRatePct)),
      visualItem('Acuerdo mensual de valores', brief.situation.valueAgreementPct, formatPercent(brief.situation.valueAgreementPct)),
    ],
  });
}

function domainCatalogOverviewVisual(domains) {
  const items = domains.slice(0, MAX_ANSWER_VISUAL_ITEMS).map(domain => visualItem(
    domain.title,
    domain.counts.rows,
    `${formatInteger(domain.counts.rows)} filas`,
  ));
  return buildBarVisual({
    title: 'Dominios por filas inventariadas',
    subtitle: 'Metadato de tablas mapeadas; volumen no equivale a calidad, prioridad ni personas activas.',
    order: 'ranked',
    unit: 'rows',
    scaleMax: maxVisualValue(items),
    items,
  });
}

function domainCatalogTableVisual(tables, domainTitle) {
  const items = tables
    .filter(table => table.rows > 0)
    .slice(0, MAX_ANSWER_VISUAL_ITEMS)
    .map(table => visualItem(table.label, table.rows, `${formatInteger(table.rows)} filas`));
  return buildBarVisual({
    title: `Tablas principales · ${domainTitle}`,
    subtitle: 'Filas registradas en el diccionario gobernado; no son personas únicas ni indicadores certificados.',
    order: 'ranked',
    unit: 'rows',
    scaleMax: maxVisualValue(items),
    items,
  });
}

function workforceFinanceRankingVisual(context, rows, query) {
  const items = rows
    .slice(0, MAX_ANSWER_VISUAL_ITEMS)
    .map(cell => visualItem(
      cell.label,
      cell.components[query.component.key],
      formatSourceAmount(cell.components[query.component.key], context.presentation),
    ));
  return buildBarVisual({
    title: `${query.component.label} por ${query.dimension.label}`,
    subtitle: `${query.period} · asignación observada en cálculo; no presupuesto ejecutado ni pago.`,
    order: 'ranked',
    unit: 'source_currency_cents',
    scaleMax: maxVisualValue(items),
    items,
  });
}

function workforceFinanceComponentsVisual(context, cell, query) {
  const items = FINANCE_COMPONENTS.map(component => visualItem(
    component.label,
    cell.components[component.key],
    formatSourceAmount(cell.components[component.key], context.presentation),
  ));
  return buildBarVisual({
    title: `Componentes de ${cell.label}`,
    subtitle: `${query.period} · descomposición aritmética de cálculo; no atribución causal.`,
    order: 'defined',
    unit: 'source_currency_cents',
    scaleMax: maxVisualValue(items),
    items,
  });
}

function workforceFinanceTrendVisual(context, rows, query) {
  const items = rows.map(({ row, cell }) => visualItem(
    row.period,
    cell.components[query.component.key],
    formatSourceAmount(cell.components[query.component.key], context.presentation),
  ));
  return buildBarVisual({
    title: `${query.component.label} · evolución observada`,
    subtitle: `${rows.at(-1).cell.label} · sólo meses con celda liberada; no pronóstico.`,
    order: 'chronological',
    unit: 'source_currency_cents',
    scaleMax: maxVisualValue(items),
    items,
  });
}

function workforceFinanceComparisonVisual(context, cells, query) {
  const items = cells.map(cell => visualItem(
    cell.label,
    cell.components[query.component.key],
    formatSourceAmount(cell.components[query.component.key], context.presentation),
  ));
  return buildBarVisual({
    title: `${query.component.label} · comparación`,
    subtitle: `${query.period} · dos categorías liberadas de la misma dimensión: ${query.dimension.label}.`,
    order: 'defined',
    unit: 'source_currency_cents',
    scaleMax: maxVisualValue(items),
    items,
  });
}

function visualItem(label, value, displayValue) {
  return { label, value, displayValue };
}

function maxVisualValue(items) {
  return items.reduce((maximum, item) => Math.max(maximum, Number(item?.value) || 0), 0);
}

function buildBarVisual({ title, subtitle, order, unit, scaleMax, items }) {
  const allowedOrders = new Set(['ranked', 'chronological', 'defined']);
  const allowedUnits = new Set(['participants', 'records', 'rows', 'percent', 'source_currency_cents']);
  const normalizedTitle = typeof title === 'string' ? title.trim() : '';
  const normalizedSubtitle = typeof subtitle === 'string' ? subtitle.trim() : '';
  if (!safeVisualText(normalizedTitle, 160) || !safeVisualText(normalizedSubtitle, 240) ||
      !allowedOrders.has(order) || !allowedUnits.has(unit) ||
      unit.length > 48 || !Array.isArray(items) || items.length < 2 ||
      items.length > MAX_ANSWER_VISUAL_ITEMS) return null;

  const normalizedItems = [];
  const labels = new Set();
  for (const item of items) {
    const label = typeof item?.label === 'string' ? item.label.trim() : '';
    const displayValue = typeof item?.displayValue === 'string' ? item.displayValue.trim() : '';
    if (!safeVisualText(label, 120) || !safeVisualText(displayValue, 64) ||
        !Number.isFinite(item?.value) || item.value < 0) return null;
    if (unit === 'percent') {
      if (item.value > 100) return null;
    } else if (!Number.isSafeInteger(item.value)) {
      return null;
    }
    if (labels.has(label)) return null;
    labels.add(label);
    normalizedItems.push({ label, value: item.value, displayValue });
  }

  if (order === 'ranked') {
    normalizedItems.sort((left, right) => right.value - left.value || left.label.localeCompare(right.label, 'es'));
  }
  const maximum = maxVisualValue(normalizedItems);
  if (!(maximum > 0) || !Number.isFinite(scaleMax) || scaleMax < maximum) return null;
  if (unit !== 'percent' && !Number.isSafeInteger(scaleMax)) return null;

  return {
    schemaVersion: GRH_ANSWER_VISUAL_SCHEMA_VERSION,
    kind: 'bar',
    title: normalizedTitle,
    subtitle: normalizedSubtitle,
    order,
    unit,
    scaleMax,
    items: normalizedItems,
  };
}

function safeVisualText(value, maximum) {
  return typeof value === 'string' && value.length > 0 && value.length <= maximum &&
    !/[\u0000-\u001f\u007f]/u.test(value);
}

function cloneAnswerVisual(visual) {
  return buildBarVisual({
    title: visual?.title,
    subtitle: visual?.subtitle,
    order: visual?.order,
    unit: visual?.unit,
    scaleMax: visual?.scaleMax,
    items: Array.isArray(visual?.items) ? visual.items.map(item => ({ ...item })) : null,
  });
}

function buildProvenance(executive, quality, close = null, presentation = null) {
  const latestReleased = executive.compensation.series
    .filter(row => row.privacyStatus === 'released')
    .slice()
    .sort((left, right) => left.period.localeCompare(right.period))
    .at(-1);
  if (!latestReleased) throw new Error('No hay períodos de cálculo liberados.');
  const sourceCurrencyStatus = presentation?.sourceCurrencyStatus || 'not_declared_in_source';
  const configuredCurrency = hasConfiguredCurrency(presentation);
  return {
    source: executive.source.canonicalSystem,
    sourceFile: executive.source.sourceFile,
    sourceSha256: executive.source.sourceSha256,
    snapshotAsOf: executive.source.snapshotAsOf,
    profileSchemaVersion: quality.lineage.profileSchemaVersion,
    semanticSchemaVersion: quality.lineage.semanticSchemaVersion,
    executiveSchemaVersion: executive.schemaVersion,
    qualitySchemaVersion: quality.schemaVersion,
    closeSchemaVersion: close?.schemaVersion || null,
    privacyPolicyVersion: executive.policyVersion,
    privacyThreshold: executive.privacy.portableThreshold,
    latestValidCalculationPeriod: latestReleased.period,
    realtime: false,
    aggregateOnly: true,
    containsPii: false,
    excludedSources: [...quality.source.excludedSources],
    calculationAuthority: 'calculo control concepts',
    totpagoStatus: 'diagnostic_only',
    currency: sourceCurrencyStatus,
    sourceCurrencyStatus,
    displayCurrencyCode: configuredCurrency ? presentation.displayCurrencyCode : null,
    displayCurrencyBasis: configuredCurrency ? presentation.displayCurrencyBasis : 'not_configured',
    displayCurrencyEffectiveOn: configuredCurrency ? presentation.displayCurrencyEffectiveOn : null,
  };
}

function sourceCitation(context) {
  return `Fuente: ${context.sourceName} · snapshot ${context.snapshot} · último período de cálculo liberado ${context.latestPeriod} · privacidad k=${context.privacyThreshold} · agregado sin PII · no tiempo real.`;
}

function renderTextAnswer(answer) {
  const sections = [answer.title, answer.summary];
  if (answer.findings.length) sections.push(answer.findings.map(item => `• ${item}`).join('\n'));
  if (answer.caveats.length) sections.push(`Límites:\n${answer.caveats.map(item => `• ${item}`).join('\n')}`);
  sections.push(answer.source);
  return sections.filter(Boolean).join('\n\n');
}

function metric(label, value, detail) {
  return { label, value, detail };
}

function componentFinding(label, component) {
  if (!Number.isFinite(component?.score)) return null;
  return `${label}: ${formatPercent(component.score)} (peso ${formatPercent(component.weightPct)}).`;
}

function reconciliationLabel(status) {
  return status === 'reconciled' ? 'conciliado' : 'diferencias materiales detectadas';
}

function normalize(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

function finite(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function formatInteger(value) {
  return new Intl.NumberFormat('es-AR', { maximumFractionDigits: 0 }).format(value);
}

function formatNumber(value, decimals = 2) {
  return new Intl.NumberFormat('es-AR', {
    minimumFractionDigits: 0,
    maximumFractionDigits: decimals,
  }).format(value);
}

function formatPercent(value) {
  return `${formatNumber(value, 2)} %`;
}

function formatSignedPercent(value) {
  const sign = value > 0 ? '+' : '';
  return `${sign}${formatNumber(value, 2)} %`;
}

function formatSignedInteger(value) {
  const sign = value > 0 ? '+' : '';
  return `${sign}${formatInteger(value)}`;
}

function currencyDisclosure(context) {
  if (!hasConfiguredCurrency(context.presentation)) {
    return 'La moneda no está declarada en GRH; los importes se presentan como unidades de origen.';
  }
  return `Importes presentados en ${context.presentation.displayCurrencyCode} por configuración municipal; GRH no declara moneda en la fuente.`;
}

function formatSourceAmount(cents, presentation = null) {
  const units = Number(cents) / 100;
  if (hasConfiguredCurrency(presentation)) {
    return new Intl.NumberFormat(presentation.locale, {
      style: 'currency',
      currency: presentation.displayCurrencyCode,
      currencyDisplay: 'code',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(units);
  }
  const absolute = Math.abs(units);
  if (absolute >= 1_000_000_000) return `${formatNumber(units / 1_000_000_000, 2)} mil millones de unidades de origen`;
  if (absolute >= 1_000_000) return `${formatNumber(units / 1_000_000, 2)} millones de unidades de origen`;
  if (absolute >= 1_000) return `${formatNumber(units / 1_000, 2)} mil unidades de origen`;
  return `${formatNumber(units, 2)} unidades de origen`;
}

function formatSourceAmountSigned(cents, presentation = null) {
  const prefix = Number(cents) > 0 ? '+' : '';
  return `${prefix}${formatSourceAmount(cents, presentation)}`;
}

function titleCase(value) {
  return String(value || '')
    .toLocaleLowerCase('es-AR')
    .replace(/(^|[\s.])\p{L}/gu, letter => letter.toLocaleUpperCase('es-AR'));
}

function unique(items) {
  return [...new Set(items.filter(Boolean))];
}
