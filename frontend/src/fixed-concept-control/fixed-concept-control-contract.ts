import type { FixedConceptControlContract } from './fixed-concept-control-types';

export const FIXED_CONCEPT_CONTROL_ENDPOINT = '/api/grh-fixed-concept-control';
export const FIXED_CONCEPT_CONTROL_SCHEMA = 'grh-fixed-concept-control-v1';

interface FixedConceptControlClient {
  load(options?: {
    readonly timeoutMs?: number;
    readonly signal?: AbortSignal | null;
  }): Promise<FixedConceptControlContract>;
}

declare global {
  interface Window {
    readonly MuniGrhFixedConceptControl?: FixedConceptControlClient;
  }
}

export class FixedConceptControlContractError extends Error {
  readonly code: string;
  readonly status: number;

  constructor(code: string, status = 0) {
    super('No se pudo verificar el control agregado de conceptos fijos GRH.');
    this.name = 'FixedConceptControlContractError';
    this.code = code;
    this.status = status;
  }
}

export async function fetchFixedConceptControlContract(
  { signal }: { readonly signal?: AbortSignal } = {},
): Promise<FixedConceptControlContract> {
  const client = window.MuniGrhFixedConceptControl;
  if (!client || typeof client.load !== 'function') {
    throw new FixedConceptControlContractError('GRH_CLIENT_UNAVAILABLE');
  }
  try {
    return await client.load({ timeoutMs: 15_000, signal: signal ?? null });
  } catch (error) {
    const status = typeof error === 'object' && error && 'status' in error &&
      Number.isSafeInteger(error.status) ? Number(error.status) : 0;
    throw new FixedConceptControlContractError('GRH_REQUEST_FAILED', status);
  }
}
