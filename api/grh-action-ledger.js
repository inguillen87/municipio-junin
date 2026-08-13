import { noStore, requireCapability, requireDatasetTenant } from './lib/auth.js';
import {
  GRH_ACTION_LEDGER_ACTION_DEFINITIONS,
  GRH_ACTION_LEDGER_SCHEMA_VERSION,
  inspectGrhActionLedgerContract,
} from './lib/grh-action-ledger-contract.js';
import {
  buildGrhActionLedgerEvidence,
  buildGrhActionLedgerProjection,
} from './lib/grh-action-ledger-projection.js';
import {
  DATABASE_TARGET_FINGERPRINT_HEADER,
  fingerprintDatabaseTarget,
} from './lib/database-target-fingerprint.js';
import grhActionLedgerStore from './lib/grh-action-ledger-store.js';
import { assertPrismaDatabaseTransport, prisma } from './lib/db.js';
import { readGrhArtifactBundle } from './lib/grh-artifacts.js';
import { buildGrhCloseProjection } from './lib/grh-close-projection.js';
import { inspectGrhDecisionBriefContract } from './lib/grh-decision-brief-contract.js';
import { buildGrhDecisionBriefProjection } from './lib/grh-decision-brief-projection.js';
import { buildGrhExecutiveProjection } from './lib/grh-executive-projection.js';
import { buildGrhQualityProjection } from './lib/grh-quality-projection.js';
import publishedDemoPolicy from '../shared/published-demo-policy.cjs';
import releaseTruthContract from '../shared/release-truth-contract.cjs';
import routePolicy from '../shared/route-policy.cjs';

const { isPublishedDemoIdentity } = publishedDemoPolicy;
const { API_CONTRACTS, HEADER_NAME } = releaseTruthContract;
const { ACTIONS, RESOURCES } = routePolicy;

const CONTRACT_VALUE = API_CONTRACTS['/api/grh-action-ledger'] ||
  GRH_ACTION_LEDGER_SCHEMA_VERSION;
const SHA256 = /^[0-9a-f]{64}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const PERIOD = /^\d{4}-(0[1-9]|1[0-2])$/;
const ASSIGNEE_ROLES = new Set(['CONTADOR', 'TENANT_ADMIN']);
const COMMANDS = new Set(['claim', 'block', 'resume', 'complete', 'reschedule', 'cancel']);
const BLOCK_REASONS = new Set(['dependency_pending', 'source_review_required', 'owner_unavailable']);
const CANCEL_REASONS = new Set(['priority_withdrawn', 'duplicate_commitment']);
const OUTCOME_CODES = new Set(['review_completed', 'correction_requested', 'no_change_required']);
export const GRH_ACTION_LEDGER_STATUS_HEADER = 'X-MuniControl-Ledger-Status';
export const GRH_ACTION_LEDGER_SETUP_PENDING = 'setup-pending';
const GRH_ACTION_LEDGER_SETUP_WARNING =
  '299 MuniControl "El registro de compromisos aun no esta habilitado; no se publican acciones ni se permiten cambios."';
const CREATE_KEYS = Object.freeze(['commandId', 'brief', 'assigneeRole', 'dueOn']);
const CREATE_BRIEF_KEYS = Object.freeze([
  'schemaVersion', 'sourceSha256', 'snapshotAsOf', 'period', 'priorityCode',
]);
const PATCH_KEYS = Object.freeze([
  'commandId', 'commitmentId', 'expectedVersion', 'command', 'reasonCode', 'dueOn',
  'outcomeCode',
]);

function plainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value) &&
    Object.getPrototypeOf(value) === Object.prototype;
}

function exactKeys(value, keys) {
  if (!plainObject(value)) return false;
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  return actual.length === expected.length &&
    actual.every((key, index) => key === expected[index]);
}

function exactDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const instant = Date.parse(`${value}T00:00:00Z`);
  if (!Number.isFinite(instant)) return null;
  return new Date(instant).toISOString().slice(0, 10) === value ? value : null;
}

function pinnedBundleIsConsistent(bundle, configuredPin = process.env.GRH_SOURCE_SHA256) {
  const profile = bundle?.profile;
  const semantic = bundle?.semantic;
  const provenance = bundle?.provenance;
  const sourceSha256 = provenance?.sourceSha256;
  const configuredPinIsConsistent = configuredPin === undefined || configuredPin === '' || (
    typeof configuredPin === 'string' && SHA256.test(configuredPin) && configuredPin === sourceSha256
  );
  return profile?.schema_version === 'grh-profile-v1' &&
    semantic?.schema_version === 'grh-semantic-v2' &&
    provenance?.profileSchemaVersion === profile.schema_version &&
    provenance?.semanticSchemaVersion === semantic.schema_version &&
    provenance?.sourceFile === profile.source &&
    provenance.sourceFile === semantic?.source?.file &&
    sourceSha256 === profile.sha256 && sourceSha256 === semantic?.source?.sha256 &&
    provenance?.approvedSourceSha256 === sourceSha256 && SHA256.test(sourceSha256 || '') &&
    provenance?.snapshotAsOf === profile.snapshot_as_of &&
    provenance.snapshotAsOf === semantic?.source?.snapshot_as_of &&
    profile?.compressed_size_bytes === semantic?.source?.compressed_size_bytes &&
    profile?.canonical_source === semantic?.source?.canonical_system &&
    JSON.stringify(profile?.excluded_sources) === JSON.stringify(semantic?.privacy?.excluded_sources) &&
    configuredPinIsConsistent;
}

function actionDefinition(priorityCode) {
  return GRH_ACTION_LEDGER_ACTION_DEFINITIONS.find(
    definition => definition.priorityCode === priorityCode,
  ) || null;
}

function currentBriefMatchesRequest(brief, requestedBrief) {
  return requestedBrief.schemaVersion === brief.schemaVersion &&
    requestedBrief.sourceSha256 === brief.source.sourceSha256 &&
    requestedBrief.snapshotAsOf === brief.source.snapshotAsOf &&
    requestedBrief.period === brief.period;
}

function parseCreateBody(body, brief) {
  if (!exactKeys(body, CREATE_KEYS) || !UUID.test(body.commandId || '') ||
      !exactKeys(body.brief, CREATE_BRIEF_KEYS) ||
      body.brief.schemaVersion !== 'grh-decision-brief-v1' ||
      !SHA256.test(body.brief.sourceSha256 || '') || !exactDate(body.brief.snapshotAsOf) ||
      !PERIOD.test(body.brief.period || '') ||
      typeof body.brief.priorityCode !== 'string' ||
      !ASSIGNEE_ROLES.has(body.assigneeRole) || !exactDate(body.dueOn)) {
    return { error: 'invalid' };
  }
  if (!currentBriefMatchesRequest(brief, body.brief)) return { error: 'stale' };
  const definition = actionDefinition(body.brief.priorityCode);
  const priority = brief.priorities.find(row => row.code === body.brief.priorityCode);
  if (!definition) return { error: 'invalid' };
  if (priority?.severity !== definition.severity) return { error: 'stale' };
  return { value: { definition, priorityCode: body.brief.priorityCode } };
}

function parsePatchBody(body) {
  if (!exactKeys(body, PATCH_KEYS) || !UUID.test(body.commandId || '') ||
      !UUID.test(body.commitmentId || '') || !Number.isSafeInteger(body.expectedVersion) ||
      body.expectedVersion < 1 || !COMMANDS.has(body.command)) {
    return null;
  }
  const reasonCode = body.reasonCode;
  const outcomeCode = body.outcomeCode;
  const dueOn = body.dueOn;
  if (body.command === 'block') {
    if (!BLOCK_REASONS.has(reasonCode) || dueOn !== null || outcomeCode !== null) return null;
  } else if (body.command === 'cancel') {
    if (!CANCEL_REASONS.has(reasonCode) || dueOn !== null || outcomeCode !== null) return null;
  } else if (body.command === 'complete') {
    if (reasonCode !== null || dueOn !== null || !OUTCOME_CODES.has(outcomeCode)) return null;
  } else if (body.command === 'reschedule') {
    if (reasonCode !== null || outcomeCode !== null || !exactDate(dueOn)) return null;
  } else if (reasonCode !== null || dueOn !== null || outcomeCode !== null) {
    return null;
  }
  return body;
}

function transitionActorAllowed(caller, row, command) {
  if (command === 'claim') {
    return caller.role === row.assigneeRole &&
      (row.ownerUserId === null || row.ownerUserId === caller.id);
  }
  if (['block', 'resume', 'complete'].includes(command)) {
    return row.ownerUserId === caller.id;
  }
  return ['reschedule', 'cancel'].includes(command) && caller.role === 'INTENDENTE';
}

function setHeaders(res) {
  res.setHeader(HEADER_NAME, CONTRACT_VALUE);
  noStore(res);
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Vary', 'Authorization');
}

function hasUnsupportedQuery(req) {
  try {
    const query = req?.query;
    const queryHasKeys = query !== null && typeof query === 'object' &&
      Reflect.ownKeys(query).length > 0;
    const queryHasScalar = query !== undefined && query !== null &&
      typeof query !== 'object' && String(query).length > 0;
    return queryHasKeys || queryHasScalar ||
      (typeof req?.url === 'string' && req.url.includes('?'));
  } catch {
    return true;
  }
}

function respondInvalid(res) {
  return res.status(422).json({
    error: 'La accion solicitada no cumple el contrato operativo.',
    code: 'GRH_ACTION_LEDGER_INPUT_INVALID',
  });
}

function respondStale(res) {
  return res.status(409).json({
    error: 'La evidencia GRH cambio; actualiza el brief antes de continuar.',
    code: 'GRH_ACTION_LEDGER_EVIDENCE_STALE',
  });
}

function respondStoreError(res, error) {
  const code = error?.code;
  if (['GRH_ACTION_LEDGER_OWNERSHIP_DENIED', 'GRH_ACTION_LEDGER_ASSIGNEE_ROLE_DENIED']
    .includes(code)) {
    return res.status(403).json({ error: 'Operacion no habilitada para este responsable.', code });
  }
  if (code === 'GRH_ACTION_LEDGER_COMMITMENT_NOT_FOUND') {
    return res.status(404).json({ error: 'Compromiso GRH no encontrado.', code });
  }
  if (['GRH_ACTION_LEDGER_COMMAND_COLLISION', 'GRH_ACTION_LEDGER_VERSION_CONFLICT',
    'GRH_ACTION_LEDGER_COMMITMENT_ALREADY_EXISTS'].includes(code)) {
    return res.status(409).json({ error: 'El compromiso cambio o la accion ya fue registrada.', code });
  }
  if (code === 'GRH_ACTION_LEDGER_CAPACITY_REACHED') {
    return res.status(409).json({
      error: 'La capacidad operativa GRH fue alcanzada.',
      code,
    });
  }
  if (['GRH_ACTION_LEDGER_INPUT_INVALID', 'GRH_ACTION_LEDGER_TRANSITION_INVALID'].includes(code)) {
    return respondInvalid(res);
  }
  console.error('[GRH-ACTION-LEDGER] Store gobernado no disponible');
  return res.status(503).json({
    error: 'El registro operativo GRH no esta disponible.',
    code: 'GRH_ACTION_LEDGER_UNAVAILABLE',
  });
}

export async function inspectGrhActionLedgerStorage({
  client = prisma,
  assertTransport = assertPrismaDatabaseTransport,
} = {}) {
  try {
    if (typeof assertTransport !== 'function' || !assertTransport() ||
        !client || typeof client.$queryRaw !== 'function') return 'unavailable';
    const rows = await client.$queryRaw`
      SELECT
        to_regclass('public.grh_action_commitments') IS NOT NULL AS "hasCommitmentsTable",
        to_regclass('public.grh_action_commitment_events') IS NOT NULL AS "hasEventsTable"
    `;
    if (!Array.isArray(rows) || rows.length !== 1) return 'unavailable';
    const hasCommitmentsTable = rows[0]?.hasCommitmentsTable;
    const hasEventsTable = rows[0]?.hasEventsTable;
    if (typeof hasCommitmentsTable !== 'boolean' || typeof hasEventsTable !== 'boolean') {
      return 'unavailable';
    }
    if (!hasCommitmentsTable && !hasEventsTable) return 'missing';
    if (hasCommitmentsTable && hasEventsTable) return 'ready';
    return 'inconsistent';
  } catch {
    return 'unavailable';
  }
}

export function createGrhActionLedgerHandler({
  requireCapabilityImpl = requireCapability,
  requireDatasetTenantImpl = requireDatasetTenant,
  readArtifactBundleImpl = readGrhArtifactBundle,
  buildExecutiveProjectionImpl = buildGrhExecutiveProjection,
  buildQualityProjectionImpl = buildGrhQualityProjection,
  buildCloseProjectionImpl = buildGrhCloseProjection,
  buildDecisionBriefProjectionImpl = buildGrhDecisionBriefProjection,
  inspectDecisionBriefImpl = inspectGrhDecisionBriefContract,
  storeImpl = grhActionLedgerStore,
  buildLedgerProjectionImpl = buildGrhActionLedgerProjection,
  inspectLedgerImpl = inspectGrhActionLedgerContract,
  inspectLedgerStorageImpl = inspectGrhActionLedgerStorage,
  isPublishedDemoIdentityImpl = isPublishedDemoIdentity,
  databaseTargetFingerprintImpl = fingerprintDatabaseTarget,
  databaseUrlImpl = () => process.env.DATABASE_URL,
  clock = () => new Date(),
} = {}) {
  return async function handler(req, res) {
    setHeaders(res);
    const action = req.method === 'GET'
      ? ACTIONS.READ
      : req.method === 'POST'
        ? ACTIONS.CREATE
        : req.method === 'PATCH'
          ? ACTIONS.UPDATE
          : null;
    if (!action) {
      res.setHeader('Allow', 'GET, POST, PATCH');
      return res.status(405).json({ error: 'Metodo no permitido', code: 'METHOD_NOT_ALLOWED' });
    }
    if (hasUnsupportedQuery(req)) {
      return res.status(400).json({
        error: 'Este contrato no admite parametros de consulta.',
        code: 'GRH_ACTION_LEDGER_QUERY_UNSUPPORTED',
      });
    }

    const caller = await requireCapabilityImpl(req, res, RESOURCES.GRH_ACTION_LEDGER, action);
    if (!caller || !requireDatasetTenantImpl(res, caller, 'GRH_TENANT_ID')) return;

    if (req.method === 'GET') {
      try {
        const databaseTargetFingerprint = databaseTargetFingerprintImpl(databaseUrlImpl());
        if (!SHA256.test(databaseTargetFingerprint || '')) throw new Error('invalid fingerprint');
        res.setHeader(DATABASE_TARGET_FINGERPRINT_HEADER, databaseTargetFingerprint);
      } catch {
        console.error('[GRH-ACTION-LEDGER] Database target identity unavailable');
        return res.status(503).json({
          error: 'El registro operativo GRH no esta disponible.',
          code: 'GRH_ACTION_LEDGER_UNAVAILABLE',
        });
      }
    }

    let brief;
    try {
      const bundle = await readArtifactBundleImpl(process.env.GRH_TENANT_ID);
      if (!pinnedBundleIsConsistent(bundle)) throw new Error('GRH bundle pin invalid');
      const executive = buildExecutiveProjectionImpl(bundle.semantic, { audience: 'interactive' });
      const quality = buildQualityProjectionImpl(bundle.profile, bundle.semantic);
      const close = buildCloseProjectionImpl(bundle.semantic);
      brief = buildDecisionBriefProjectionImpl(executive, quality, close);
      if (!inspectDecisionBriefImpl(brief)?.ok) throw new Error('GRH brief invalid');
    } catch {
      console.error('[GRH-ACTION-LEDGER] Brief gobernado no disponible');
      return res.status(503).json({
        error: 'El registro operativo GRH no esta disponible.',
        code: 'GRH_ACTION_LEDGER_UNAVAILABLE',
      });
    }

    const tenantId = process.env.GRH_TENANT_ID;
    const publishedDemo = isPublishedDemoIdentityImpl(caller.email);
    const listAndProject = async () => {
      const commitments = await storeImpl.listCommitments({ tenantId });
      const projection = buildLedgerProjectionImpl({
        brief,
        commitments,
        caller,
        publishedDemo,
        now: clock,
      });
      if (!inspectLedgerImpl(projection)?.ok) throw new Error('GRH ledger contract invalid');
      return { commitments, projection };
    };

    try {
      if (req.method === 'GET') {
        try {
          return res.status(200).json((await listAndProject()).projection);
        } catch (error) {
          const storageStatus = error?.code === 'GRH_ACTION_LEDGER_DATABASE_UNAVAILABLE'
            ? await inspectLedgerStorageImpl()
            : 'unavailable';
          if (storageStatus !== 'missing') throw error;
          const projection = buildLedgerProjectionImpl({
            brief,
            commitments: [],
            caller,
            publishedDemo: true,
            now: clock,
          });
          if (!inspectLedgerImpl(projection)?.ok) {
            throw new Error('GRH ledger setup projection invalid');
          }
          res.setHeader(GRH_ACTION_LEDGER_STATUS_HEADER, GRH_ACTION_LEDGER_SETUP_PENDING);
          res.setHeader('Warning', GRH_ACTION_LEDGER_SETUP_WARNING);
          return res.status(200).json(projection);
        }
      }

      if (req.method === 'POST') {
        const parsed = parseCreateBody(req.body, brief);
        if (parsed.error === 'invalid') return respondInvalid(res);
        if (parsed.error === 'stale') return respondStale(res);
        const { definition, priorityCode } = parsed.value;
        const evidence = buildGrhActionLedgerEvidence(brief, priorityCode);
        const created = await storeImpl.createCommitment({
          tenantId,
          actorUserId: caller.id,
          actorRole: caller.role,
          commandId: req.body.commandId,
          briefSchemaVersion: evidence.schemaVersion,
          briefPolicyVersion: evidence.policyVersion,
          sourceSha256: evidence.sourceSha256,
          snapshotAsOf: evidence.snapshotAsOf,
          period: evidence.period,
          priorityCode,
          prioritySeverity: definition.severity,
          actionCode: definition.actionCode,
          evidenceDigest: evidence.evidenceDigest,
          assigneeRole: req.body.assigneeRole,
          dueOn: req.body.dueOn,
        });
        return res.status(created?.replayed === true ? 200 : 201)
          .json((await listAndProject()).projection);
      }

      const parsed = parsePatchBody(req.body);
      if (!parsed) return respondInvalid(res);
      const before = await listAndProject();
      const raw = before.commitments.find(row => row.id === parsed.commitmentId);
      if (!raw) {
        return res.status(404).json({
          error: 'Compromiso GRH no encontrado.',
          code: 'GRH_ACTION_LEDGER_COMMITMENT_NOT_FOUND',
        });
      }
      if (!transitionActorAllowed(caller, raw, parsed.command)) {
        return res.status(403).json({
          error: 'Operacion no habilitada para este responsable.',
          code: 'GRH_ACTION_LEDGER_OWNERSHIP_DENIED',
        });
      }
      await storeImpl.transitionCommitment({
        tenantId,
        actorUserId: caller.id,
        actorRole: caller.role,
        commandId: parsed.commandId,
        commitmentId: parsed.commitmentId,
        expectedVersion: parsed.expectedVersion,
        command: parsed.command,
        reasonCode: parsed.reasonCode,
        outcomeCode: parsed.outcomeCode,
        dueOn: parsed.dueOn,
      });
      return res.status(200).json((await listAndProject()).projection);
    } catch (error) {
      return respondStoreError(res, error);
    }
  };
}

export default createGrhActionLedgerHandler();
