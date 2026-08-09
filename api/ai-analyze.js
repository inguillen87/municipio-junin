import { noStore, requireDatasetTenant, requireRole } from './lib/auth.js';
import { readGrhArtifactBundle } from './lib/grh-artifacts.js';
import { validateGrhSemanticContract } from './lib/grh-contract.js';
import { validateGrhExecutiveContract } from './lib/grh-executive-contract.js';
import { buildPortableGrhViews } from './lib/grh-portable-bundle.js';
import { validateGrhQualityContract } from './lib/grh-quality-contract.js';
import { validateGrhCloseContract } from './lib/grh-close-contract.js';
import { buildGrhCloseProjection } from './lib/grh-close-projection.js';

const EXECUTIVE_ROLES = ['SUPER_ADMIN', 'TENANT_ADMIN', 'INTENDENTE', 'CONTADOR'];
const MAX_MESSAGE_LENGTH = 1200;
const ENGINE_ID = 'grh-deterministic-v1';
const SUPPORTED_INTENTS = Object.freeze([
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
]);

export function createAiAnalyzeHandler({
  requireRoleImpl = requireRole,
  requireDatasetTenantImpl = requireDatasetTenant,
  readArtifactBundleImpl = readGrhArtifactBundle,
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

    try {
      const bundle = await readArtifactBundleImpl(process.env.GRH_TENANT_ID);
      const { executive, quality } = buildPortableGrhViews(bundle);
      const close = buildGrhCloseProjection(bundle.semantic);
      const answer = buildDeterministicAnswer(message, executive, quality, close);
      const provenance = buildProvenance(executive, quality, close);
      const payload = {
        status: answer.status,
        engine: {
          id: ENGINE_ID,
          externalProvider: false,
          generated: false,
        },
        intent: answer.intent,
        response: answer.response,
        answer: answer.answer,
        period: answer.resolvedPeriod || provenance.latestValidCalculationPeriod,
        periodResolution: answer.periodResolution,
        provenance,
        dataStatus: {
          available: true,
          source: answer.intent === 'close_explanation'
            ? 'grh_close_governed_contract'
            : 'grh_executive_portable_contract',
          snapshotAsOf: provenance.snapshotAsOf,
          realtime: false,
          historyUsed: false,
        },
        supportedIntents: SUPPORTED_INTENTS,
      };

      return res.status(answer.httpStatus).json(payload);
    } catch (error) {
      console.error('[GRH-ASSISTANT] Proyección portable no disponible');
      return res.status(503).json({
        error: 'El contrato GRH privado no está disponible. No se generó una respuesta alternativa.',
        code: 'GRH_CONTRACT_UNAVAILABLE',
        engine: { id: ENGINE_ID, externalProvider: false, generated: false },
      });
    }
  };
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
  if (/\b(dni|cuit|cuil|domicilio|direccion particular|telefono|correo personal|email personal)\b|nombre y apellido|lista de (?:todos los )?empleados|legajo\s*[#:=-]?\s*\d+|sueldo (?:de|individual)|datos personales/.test(message)) {
    return { intent: 'pii_request', policy: 'refused' };
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
  if (/resumen|panorama|estado general|informe ejecutivo|principales alertas|tablero ejecutivo/.test(message)) {
    return { intent: 'executive_summary', policy: 'allowed' };
  }
  if (/cierre\s+(?:grh|mensual|de\s+(?:nomina|calculo))|explic.{0,20}(?:cierre|neto)|descomposici.{0,20}(?:neto|calculo)|composici.{0,20}(?:neto|calculo)|concili.{0,30}(?:mes|periodo|(?:19|20)\d{2}[-/]\d{1,2})/.test(message)) {
    return { intent: 'close_explanation', policy: 'allowed' };
  }
  if (/concili|cross.?source|totpago|diferencia.{0,20}(calculo|fuente)|compar.{0,20}(calculo|totpago)/.test(message)) {
    return { intent: 'reconciliation', policy: 'allowed' };
  }
  if (/cuarenten|registro.{0,15}(invalido|excluido)|fecha.{0,15}(anomala|futura|corrupta)/.test(message)) {
    return { intent: 'quarantine', policy: 'allowed' };
  }
  if (/calidad|confiab|integridad|cobertura|score|puntaje/.test(message)) {
    return { intent: 'quality', policy: 'allowed' };
  }
  if (/evolucion|tendencia|variacion|cambio|compar.{0,15}(mes|periodo)|contra el mes|versus|\bvs\b/.test(message)) {
    return { intent: 'trend', policy: 'allowed' };
  }
  if (/centro(?:s)? de costo|por sector|por convenio|por acuerdo|categoria(?:s)? de acuerdo|distribu|concentracion|area.{0,15}(mas|mayor)|sector.{0,15}(mas|mayor)/.test(message)) {
    return { intent: 'workforce_distribution', policy: 'allowed' };
  }
  if (/dotacion|participante|participaron|cuantas personas|cuantos agentes|planta activa|empleados activos/.test(message)) {
    return { intent: 'workforce', policy: 'allowed' };
  }
  if (/control de calculo|liquidacion|remuneracion|retencion|aporte patronal|bruto|neto|concepto\s*(?:998|999)|masa salarial|nomina|sueldo/.test(message)) {
    return { intent: 'calculation_control', policy: 'allowed' };
  }
  if (/ausenc|ausent|inasist/.test(message)) {
    return { intent: 'absence', policy: 'allowed' };
  }
  if (/licencia/.test(message)) {
    return { intent: 'leave', policy: 'allowed' };
  }
  if (/movimiento|legamov|alta|baja/.test(message)) {
    return { intent: 'movements', policy: 'allowed' };
  }
  if (/personal|emplead|legajo/.test(message)) {
    return { intent: 'workforce', policy: 'allowed' };
  }
  if (/fuente|origen|snapshot|corte|actualiza|tiempo real|personas_junin|grh/.test(message)) {
    return { intent: 'source', policy: 'allowed' };
  }
  return { intent: 'out_of_scope', policy: 'unsupported' };
}

export function buildDeterministicAnswer(message, executive, quality, close = null) {
  if (!validateAssistantContracts(executive, quality, close)) {
    const error = new Error('Los contratos portables GRH no son válidos.');
    error.code = 'GRH_ASSISTANT_CONTRACT_INVALID';
    throw error;
  }
  const classification = classifyIntent(message);
  const context = semanticContext(executive, quality, close);
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
    case 'bank_payment_limit':
      result = limitedBankPayment(context);
      break;
    case 'forecast_limit':
      result = limitedForecast(context);
      break;
    case 'help':
      result = helpAnswer();
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
      result = trendAnswer(context, periodRequest);
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

function semanticContext(executive, qualityProjection, closeProjection = null) {
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
    baseCaveats: [
      'Es un snapshot histórico, no una conexión en tiempo real.',
      'Las cifras de cálculo están expresadas en unidades de origen porque GRH no declara la moneda.',
      `La salida portable aplica supresión de celdas pequeñas k=${executive.privacy.portableThreshold}.`,
      'El contrato es agregado y no contiene PII ni identificadores de empleados.',
    ],
  };
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
      `El neto de control es ${formatSourceAmount(context.latestControl.amounts.netPayrollCents)}; no prueba una transferencia bancaria.`,
      `Calidad del extracto gobernado: ${formatPercent(context.quality.score)}. Conciliación cross-source: ${formatPercent(context.reconciliation.scorePct)}.`,
      top ? `${titleCase(top.label)} reúne ${formatInteger(top.participants)} participantes (${formatPercent(top.sharePct)}).` : null,
    ].filter(Boolean),
    evidence: [
      metric('Participación de liquidación', formatInteger(context.workforce.payrollParticipants), 'Claves distintas presentes en cálculo válido; no equivale a planta activa.'),
      metric('Neto de control', formatSourceAmount(context.latestControl.amounts.netPayrollCents), 'Control de liquidación; no desembolso acreditado.'),
      metric('Calidad gobernada', formatPercent(context.quality.score), 'Score del extracto agregado gobernado; no certifica cada tabla cruda.'),
      metric('Conciliación cross-source', formatPercent(context.reconciliation.scorePct), reconciliationLabel(context.reconciliation.status)),
    ],
    caveats: [
      `totpago se usa sólo como diagnóstico; su acuerdo de valores global es ${formatPercent(context.reconciliation.valueAgreementPct)}.`,
    ],
    nextQuestions: ['¿Cómo se distribuyen los participantes por centro de costo?', '¿Qué muestra el control de cálculo?', '¿Qué registros quedaron en cuarentena?'],
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
  };
}

function resolveWorkforceDimensions(rawMessage) {
  const message = normalize(rawMessage);
  const dimensions = [
    {
      key: 'byCostCenter',
      requested: /centro(?:s)? de costo|centro(?:s)? costo/.test(message),
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
    resolvedPeriod: year,
  };
}

function leaveAnswer(context, periodRequest) {
  const requested = resolveAnnualRequest(periodRequest, 'licencias');
  if (requested.error) return requested.error;
  const year = requested.year || context.latestPeriod.slice(0, 4);
  const row = context.leave.series.find(item => item.period === year);
  if (!row || row.privacyStatus !== 'released') {
    return protectedOrUnavailablePeriod('Licencias', year, context.privacyThreshold);
  }
  return {
    title: `Licencias GRH · ${year}`,
    summary: `GRH registra ${formatInteger(row.value)} filas válidas de licencia en ${year}, sobre al menos ${formatInteger(row.participantCount)} participantes distintos. No equivale a personas actualmente de licencia.`,
    findings: [
      `El período supera el umbral portable k=${context.privacyThreshold}.`,
      'Para una lectura actual se necesita una fuente de licencias vigente y reconciliada con el maestro contractual.',
    ],
    evidence: [
      metric(`Registros válidos ${year}`, formatInteger(row.value), 'Filas de licencia, no empleados únicos.'),
      metric('Participantes distintos', formatInteger(row.participantCount), 'Cardinalidad usada para liberar el agregado portable.'),
    ],
    caveats: ['No se extrapola el agregado anual a un estado actual de licencias.'],
    nextQuestions: ['¿Qué datos de ausencias sí están disponibles?', '¿Cuál es el corte de la fuente?'],
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
    summary: `El neto de control totaliza ${formatSourceAmount(amounts.netPayrollCents)}. Es un control de liquidación calculada y no acredita un desembolso.`,
    findings: [
      `Bruto con asignaciones familiares: ${formatSourceAmount(amounts.grossWithFamilyAllowancesCents)}.`,
      `Retenciones del personal: ${formatSourceAmount(amounts.employeeWithholdingsCents)}.`,
      `Aportes patronales calculados: ${formatSourceAmount(amounts.employerContributionsCents)}.`,
      toleranceFinding,
    ],
    evidence: [
      metric('Bruto de control', formatSourceAmount(amounts.grossWithFamilyAllowancesCents), 'Agregado de cálculo portable.'),
      metric('Retenciones', formatSourceAmount(amounts.employeeWithholdingsCents), 'Agregado de cálculo portable.'),
      metric('Neto de control', formatSourceAmount(amounts.netPayrollCents), 'No es una transferencia acreditada.'),
      metric('Participantes', formatInteger(control.participantCount), `Período liberado con umbral k=${context.privacyThreshold}.`),
    ],
    caveats: ['La moneda no está declarada en GRH; por eso los importes se presentan como unidades de origen.'],
    nextQuestions: ['¿Cómo concilia con totpago?', '¿Cómo cambió frente al período anterior?'],
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
    summary: `El neto de control de ${row.period} es ${formatSourceAmount(components.netPayrollCents)}. Surge aritméticamente del bruto con asignaciones menos las retenciones; no es una atribución causal ni evidencia de pago.`,
    findings: [
      `Ingresos contributivos: ${formatSourceAmount(components.contributoryEarningsCents)}; no contributivos: ${formatSourceAmount(components.nonContributoryEarningsCents)}; asignaciones familiares: ${formatSourceAmount(components.familyAllowancesCents)}.`,
      `Bruto con asignaciones: ${formatSourceAmount(components.grossWithFamilyAllowancesCents)}; retenciones: ${formatSourceAmount(components.employeeWithholdingsCents)}.`,
      `Neto a pagar del control: ${formatSourceAmount(components.netToPayCents)}; aportes del empleador: ${formatSourceAmount(components.employerContributionsCents)}.`,
      `Identidad aritmética ${control.identityWithinRoundingTolerance ? 'dentro' : 'fuera'} de la tolerancia mensual de ${formatInteger(control.roundingToleranceCents)} centavos de unidad fuente.`,
      `Conciliación del mismo mes: cobertura ${formatPercent(reconciliation.runCoveragePct)}, exactitud de métricas ${formatPercent(reconciliation.metricExactRatePct)} y acuerdo de valores ${formatPercent(reconciliation.valueAgreementPct)}.`,
      `Varianza absoluta mensual calculo/totpago: ${formatSourceAmount(reconciliation.absoluteVarianceCents)}.`,
    ],
    evidence: [
      metric('Participantes', formatInteger(row.participantCount), `Agregado mensual liberado con k=${context.closeProjection.privacy.threshold}.`),
      metric('Neto de control', formatSourceAmount(components.netPayrollCents), 'Cálculo salarial agregado; no desembolso.'),
      metric('Cobertura mensual', formatPercent(reconciliation.runCoveragePct), `${formatInteger(reconciliation.matchedRuns)} de ${formatInteger(unionRuns)} corridas del universo combinado.`),
      metric('Acuerdo mensual de valores', formatPercent(reconciliation.valueAgreementPct), 'Proviene de period_series; no reutiliza el score global.'),
      metric('Identidad dentro de tolerancia', control.identityWithinRoundingTolerance ? 'Sí' : 'No', `Variación neta ${formatInteger(control.netIdentityVarianceCents)} centavos de unidad fuente.`),
    ],
    caveats: [
      'La moneda no está declarada en GRH; los importes se expresan en unidades de origen.',
      'La descomposición es aritmética y no explica por qué cambió un componente.',
      'El control de cálculo no prueba transferencia, acreditación bancaria ni asiento contable.',
    ],
    nextQuestions: ['¿Cómo cambió el neto frente al mes anterior?', '¿Cuál es la calidad global del extracto?'],
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
  };
}

function trendAnswer(context, periodRequest) {
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
    summary: `Entre los dos últimos períodos válidos, la participación cambió ${formatSignedInteger(participantDelta)} y el neto de control cambió ${formatSourceAmountSigned(netDelta)}${netRate === null ? '' : ` (${formatSignedPercent(netRate)})`}.`,
    findings: [
      `${previous.period}: ${formatInteger(previous.participantCount)} participantes y ${formatSourceAmount(previous.amounts.netPayrollCents)} de neto de control.`,
      `${current.period}: ${formatInteger(current.participantCount)} participantes y ${formatSourceAmount(current.amounts.netPayrollCents)} de neto de control.`,
      'La variación es aritmética; el contrato no atribuye causas.',
    ],
    evidence: [
      metric('Cambio de participantes', formatSignedInteger(participantDelta), `${previous.period} → ${current.period}.`),
      metric('Cambio de neto de control', formatSourceAmountSigned(netDelta), netRate === null ? 'Sin tasa comparable.' : formatSignedPercent(netRate)),
    ],
    caveats: ['No se proyectan períodos futuros ni se explican causas sin variables y metodología adicionales.'],
    nextQuestions: ['¿Qué compone el control del último período?', '¿Cómo está la conciliación cross-source?'],
    resolvedPeriod: `${previous.period}→${current.period}`,
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
    summary: `GRH permite informar un neto de control calculado de ${formatSourceAmount(context.latestControl.amounts.netPayrollCents)} para ${context.latestPeriod}, pero no confirma cuánto fue transferido, depositado o acreditado.`,
    findings: [
      'El neto publicado es control de cálculo, no evidencia de desembolso.',
      `totpago presenta diferencias materiales y sólo se usa como diagnóstico (${formatPercent(context.reconciliation.scorePct)} de score).`,
      'Para responder pago efectivo se necesita una fuente bancaria o de Tesorería reconciliada y autorizada.',
    ],
    evidence: [metric('Neto de control', formatSourceAmount(context.latestControl.amounts.netPayrollCents), 'No equivale a una transferencia acreditada.')],
    caveats: ['No se convierte el dato de cálculo en una afirmación de pago.'],
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

function buildProvenance(executive, quality, close = null) {
  const latestReleased = executive.compensation.series
    .filter(row => row.privacyStatus === 'released')
    .slice()
    .sort((left, right) => left.period.localeCompare(right.period))
    .at(-1);
  if (!latestReleased) throw new Error('No hay períodos de cálculo liberados.');
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
    currency: 'not_declared_in_source',
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

function formatSourceAmount(cents) {
  const units = Number(cents) / 100;
  const absolute = Math.abs(units);
  if (absolute >= 1_000_000_000) return `${formatNumber(units / 1_000_000_000, 2)} mil millones de unidades de origen`;
  if (absolute >= 1_000_000) return `${formatNumber(units / 1_000_000, 2)} millones de unidades de origen`;
  if (absolute >= 1_000) return `${formatNumber(units / 1_000, 2)} mil unidades de origen`;
  return `${formatNumber(units, 2)} unidades de origen`;
}

function formatSourceAmountSigned(cents) {
  const prefix = Number(cents) > 0 ? '+' : '';
  return `${prefix}${formatSourceAmount(cents)}`;
}

function titleCase(value) {
  return String(value || '')
    .toLocaleLowerCase('es-AR')
    .replace(/(^|[\s.])\p{L}/gu, letter => letter.toLocaleUpperCase('es-AR'));
}

function unique(items) {
  return [...new Set(items.filter(Boolean))];
}
