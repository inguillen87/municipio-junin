/// <reference types="vite/client" />

interface MuniAuthClient {
  fetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response>;
  getToken(): string | null;
  isAuthError(error: unknown): boolean;
}

interface Window {
  MuniAuth?: MuniAuthClient;
}
