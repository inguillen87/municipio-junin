import { readFile } from 'node:fs/promises';

import { noStore, requireCapability, requireDatasetTenant } from './lib/auth.js';
import {
  GRH_PAYROLL_RUN_CONTROL_SCHEMA_VERSION,
  inspectGrhPayrollRunControlContract,
} from './lib/grh-payroll-run-control-contract.js';
import {
  buildGrhPayrollRunControlProjection,
} from './lib/grh-payroll-run-control-projection.js';
import routePolicy from '../shared/route-policy.cjs';

const { ACTIONS, RESOURCES } = routePolicy;
const CONTRACT_HEADER = 'X-MuniControl-Contract';
const HEX_64 = /^[0-9a-f]{64}$/;
const ARTIFACT_URL = new URL('./_data/grh-payroll-run-control.json', import.meta.url);

function artifactError(code) {
  const error = new Error('El control agregado de corridas GRH no está disponible.');
  error.code = code;
  return error;
}

export async function readGrhPayrollRunControlArtifact({
  environment = process.env,
  expectedSourceSha256 = environment.GRH_SOURCE_SHA256,
  readFileImpl = readFile,
} = {}) {
  if (!HEX_64.test(expectedSourceSha256 || '')) {
    throw artifactError('GRH_PAYROLL_RUN_CONTROL_SOURCE_PIN_INVALID');
  }
  let artifact;
  try {
    artifact = JSON.parse(await readFileImpl(ARTIFACT_URL, 'utf8'));
  } catch {
    throw artifactError('GRH_PAYROLL_RUN_CONTROL_ARTIFACT_INVALID');
  }
  return buildGrhPayrollRunControlProjection(artifact, { expectedSourceSha256 });
}

function unavailable(res) {
  return res.status(503).json({
    error: 'El control agregado de corridas GRH no está disponible.',
    code: 'GRH_PAYROLL_RUN_CONTROL_UNAVAILABLE',
  });
}

export function createGrhPayrollRunControlHandler({
  requireCapabilityImpl = requireCapability,
  requireDatasetTenantImpl = requireDatasetTenant,
  readArtifactImpl = readGrhPayrollRunControlArtifact,
  inspectContractImpl = inspectGrhPayrollRunControlContract,
  environment = process.env,
} = {}) {
  return async function handler(req, res) {
    res.setHeader(CONTRACT_HEADER, GRH_PAYROLL_RUN_CONTROL_SCHEMA_VERSION);
    noStore(res);
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Vary', 'Authorization');

    if (req.method !== 'GET') {
      res.setHeader('Allow', 'GET');
      return res.status(405).json({ error: 'Método no permitido', code: 'METHOD_NOT_ALLOWED' });
    }
    if (req.query && Object.keys(req.query).length > 0) {
      return res.status(400).json({
        error: 'Esta lectura usa el corte histórico gobernado y no acepta filtros de servidor.',
        code: 'GRH_PAYROLL_RUN_CONTROL_QUERY_INVALID',
      });
    }

    const caller = await requireCapabilityImpl(
      req,
      res,
      RESOURCES.GRH_WORKFORCE_FINANCE,
      ACTIONS.READ,
    );
    if (!caller || !requireDatasetTenantImpl(res, caller, 'GRH_TENANT_ID')) return;

    try {
      const projection = await readArtifactImpl({
        environment,
        expectedSourceSha256: environment.GRH_SOURCE_SHA256,
      });
      if (!inspectContractImpl(projection)?.ok) {
        throw artifactError('GRH_PAYROLL_RUN_CONTROL_CONTRACT_INVALID');
      }
      return res.status(200).json(projection);
    } catch {
      console.error('[GRH-PAYROLL-RUN-CONTROL] Proyección gobernada no disponible');
      return unavailable(res);
    }
  };
}

export default createGrhPayrollRunControlHandler();
