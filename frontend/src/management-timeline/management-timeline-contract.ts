export const MANAGEMENT_TIMELINE_ENDPOINT = '/api/grh-management-timeline';
export const MANAGEMENT_TIMELINE_SCHEMA = 'grh-management-timeline-v1';

interface ManagementTimelineClient {
  load(options?: {
    readonly timeoutMs?: number;
    readonly signal?: AbortSignal | null;
  }): Promise<unknown>;
}

declare global {
  interface Window {
    readonly MuniGrhManagementTimeline?: ManagementTimelineClient;
  }
}

export class ManagementTimelineContractError extends Error {
  readonly code: string;
  readonly status: number;

  constructor(code: string, status = 0) {
    super('No se pudo verificar la comparación gobernada de gestiones.');
    this.name = 'ManagementTimelineContractError';
    this.code = code;
    this.status = status;
  }
}

export async function fetchManagementTimelineContract(
  { signal }: { readonly signal?: AbortSignal } = {},
): Promise<unknown> {
  const client = window.MuniGrhManagementTimeline;
  if (!client || typeof client.load !== 'function') {
    throw new ManagementTimelineContractError('GRH_CLIENT_UNAVAILABLE');
  }
  try {
    return await client.load({ timeoutMs: 15_000, signal: signal ?? null });
  } catch (error) {
    const status = typeof error === 'object' && error && 'status' in error &&
      Number.isSafeInteger(error.status) ? Number(error.status) : 0;
    throw new ManagementTimelineContractError('GRH_REQUEST_FAILED', status);
  }
}
