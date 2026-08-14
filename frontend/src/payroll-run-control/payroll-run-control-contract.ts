import type { PayrollRunControlContract } from './payroll-run-control-types';

export const PAYROLL_RUN_CONTROL_ENDPOINT = '/api/grh-payroll-run-control';
export const PAYROLL_RUN_CONTROL_SCHEMA = 'grh-payroll-run-control-v1';

interface PayrollRunControlClient {
  load(options?: {
    readonly timeoutMs?: number;
    readonly signal?: AbortSignal | null;
  }): Promise<PayrollRunControlContract>;
}

declare global {
  interface Window {
    readonly MuniGrhPayrollRunControl?: PayrollRunControlClient;
  }
}

export class PayrollRunControlContractError extends Error {
  readonly code: string;
  readonly status: number;

  constructor(code: string, status = 0) {
    super('No se pudo verificar el control agregado de corridas GRH.');
    this.name = 'PayrollRunControlContractError';
    this.code = code;
    this.status = status;
  }
}

export async function fetchPayrollRunControlContract(
  { signal }: { readonly signal?: AbortSignal } = {},
): Promise<PayrollRunControlContract> {
  const client = window.MuniGrhPayrollRunControl;
  if (!client || typeof client.load !== 'function') {
    throw new PayrollRunControlContractError('GRH_CLIENT_UNAVAILABLE');
  }
  try {
    return await client.load({ timeoutMs: 15_000, signal: signal ?? null });
  } catch (error) {
    const status = typeof error === 'object' && error && 'status' in error &&
      Number.isSafeInteger(error.status) ? Number(error.status) : 0;
    throw new PayrollRunControlContractError('GRH_REQUEST_FAILED', status);
  }
}
