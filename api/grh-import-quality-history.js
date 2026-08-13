import { readFile } from 'node:fs/promises';

import { noStore, requireCapability, requireDatasetTenant } from './lib/auth.js';
import {
  GRH_IMPORT_QUALITY_HISTORY_SCHEMA_VERSION,
  inspectGrhImportQualityHistoryContract,
} from './lib/grh-import-quality-history-contract.js';
import {
  buildGrhImportQualityHistoryProjection,
} from './lib/grh-import-quality-history-projection.js';
import routePolicy from '../shared/route-policy.cjs';

const { ACTIONS, RESOURCES } = routePolicy;
const CONTRACT_HEADER = 'X-MuniControl-Contract';
const HEX_64 = /^[0-9a-f]{64}$/;
const ARTIFACT_URL = new URL('./_data/grh-import-quality-history.json', import.meta.url);

function artifactError(code) {
  const error = new Error('El historial agregado de controles de importación no está disponible.');
  error.code = code;
  return error;
}

export async function readGrhImportQualityHistoryArtifact({
  environment = process.env,
  expectedSourceSha256 = environment.GRH_SOURCE_SHA256,
  readFileImpl = readFile,
} = {}) {
  if (!HEX_64.test(expectedSourceSha256 || '')) {
    throw artifactError('GRH_IMPORT_QUALITY_HISTORY_SOURCE_PIN_INVALID');
  }
  let artifact;
  try {
    artifact = JSON.parse(await readFileImpl(ARTIFACT_URL, 'utf8'));
  } catch {
    throw artifactError('GRH_IMPORT_QUALITY_HISTORY_ARTIFACT_INVALID');
  }
  return buildGrhImportQualityHistoryProjection(artifact, { expectedSourceSha256 });
}

function unavailable(res) {
  return res.status(503).json({
    error: 'El historial de controles de importación no está disponible.',
    code: 'GRH_IMPORT_QUALITY_HISTORY_UNAVAILABLE',
  });
}

export function createGrhImportQualityHistoryHandler({
  requireCapabilityImpl = requireCapability,
  requireDatasetTenantImpl = requireDatasetTenant,
  readArtifactImpl = readGrhImportQualityHistoryArtifact,
  inspectContractImpl = inspectGrhImportQualityHistoryContract,
  environment = process.env,
} = {}) {
  return async function handler(req, res) {
    res.setHeader(CONTRACT_HEADER, GRH_IMPORT_QUALITY_HISTORY_SCHEMA_VERSION);
    noStore(res);
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Vary', 'Authorization');

    if (req.method !== 'GET') {
      res.setHeader('Allow', 'GET');
      return res.status(405).json({ error: 'Método no permitido', code: 'METHOD_NOT_ALLOWED' });
    }
    if (req.query && Object.keys(req.query).length > 0) {
      return res.status(400).json({
        error: 'Esta lectura usa el corte histórico fijo y no acepta filtros.',
        code: 'GRH_IMPORT_QUALITY_HISTORY_QUERY_INVALID',
      });
    }

    const caller = await requireCapabilityImpl(
      req,
      res,
      RESOURCES.GRH_CONTRACT,
      ACTIONS.READ,
    );
    if (!caller || !requireDatasetTenantImpl(res, caller, 'GRH_TENANT_ID')) return;

    try {
      const projection = await readArtifactImpl({
        environment,
        expectedSourceSha256: environment.GRH_SOURCE_SHA256,
      });
      if (!inspectContractImpl(projection)?.ok) {
        throw artifactError('GRH_IMPORT_QUALITY_HISTORY_CONTRACT_INVALID');
      }
      return res.status(200).json(projection);
    } catch {
      console.error('[GRH-IMPORT-QUALITY-HISTORY] Proyección gobernada no disponible');
      return unavailable(res);
    }
  };
}

export default createGrhImportQualityHistoryHandler();
