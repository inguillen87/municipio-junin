import type { EmploymentActionsContract } from './employment-actions-types';

export const EMPLOYMENT_ACTIONS_ENDPOINT = '/api/grh-employment-actions';
export const EMPLOYMENT_ACTIONS_SCHEMA = 'grh-employment-actions-v1';

interface EmploymentActionsClient {
  load(options?: {
    readonly timeoutMs?: number;
    readonly signal?: AbortSignal | null;
  }): Promise<EmploymentActionsContract>;
}

declare global {
  interface Window {
    readonly MuniGrhEmploymentActions?: EmploymentActionsClient;
  }
}

export class EmploymentActionsContractError extends Error {
  readonly code: string;
  readonly status: number;

  constructor(code: string, status = 0) {
    super('No se pudo verificar la trayectoria laboral documentada.');
    this.name = 'EmploymentActionsContractError';
    this.code = code;
    this.status = status;
  }
}

export async function fetchEmploymentActionsContract(
  { signal }: { readonly signal?: AbortSignal } = {},
): Promise<EmploymentActionsContract> {
  const client = window.MuniGrhEmploymentActions;
  if (!client || typeof client.load !== 'function') {
    throw new EmploymentActionsContractError('GRH_CLIENT_UNAVAILABLE');
  }
  try {
    return await client.load({ timeoutMs: 15_000, signal: signal ?? null });
  } catch (error) {
    const status = typeof error === 'object' && error && 'status' in error &&
      Number.isSafeInteger(error.status) ? Number(error.status) : 0;
    throw new EmploymentActionsContractError('GRH_REQUEST_FAILED', status);
  }
}
