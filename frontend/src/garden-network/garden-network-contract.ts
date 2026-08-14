export const GARDEN_NETWORK_ENDPOINT = '/api/grh-garden-network';
export const GARDEN_NETWORK_SCHEMA = 'grh-garden-network-v1';

interface GardenNetworkClient {
  load(options?: {
    readonly timeoutMs?: number;
    readonly signal?: AbortSignal | null;
  }): Promise<unknown>;
}

declare global {
  interface Window {
    readonly MuniGrhGardenNetwork?: GardenNetworkClient;
  }
}

export class GardenNetworkContractError extends Error {
  readonly code: string;
  readonly status: number;

  constructor(code: string, status = 0) {
    super('No se pudo verificar la lectura gobernada de la red de jardines.');
    this.name = 'GardenNetworkContractError';
    this.code = code;
    this.status = status;
  }
}

export async function fetchGardenNetworkContract(
  { signal }: { readonly signal?: AbortSignal } = {},
): Promise<unknown> {
  const client = window.MuniGrhGardenNetwork;
  if (!client || typeof client.load !== 'function') {
    throw new GardenNetworkContractError('GARDEN_NETWORK_CLIENT_UNAVAILABLE');
  }
  try {
    return await client.load({ timeoutMs: 15_000, signal: signal ?? null });
  } catch (error) {
    const status = typeof error === 'object' && error && 'status' in error &&
      Number.isSafeInteger(error.status) ? Number(error.status) : 0;
    throw new GardenNetworkContractError('GARDEN_NETWORK_REQUEST_FAILED', status);
  }
}
