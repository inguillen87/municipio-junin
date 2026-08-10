import { useCallback, useEffect, useState } from 'react';

import {
  AUTH_TIMEOUT_MS,
  fetchAuthoritativeSession,
  redirectToSafeWorkspace,
  type SessionIdentity,
} from './session';

export type GovernedSurfaceState<T> =
  | { status: 'loading'; identity: SessionIdentity | null }
  | { status: 'blocked'; identity: SessionIdentity | null }
  | { status: 'ready'; identity: SessionIdentity; viewModel: T };

interface GovernedSurfaceOptions<T> {
  loadViewModel: (signal: AbortSignal) => Promise<T>;
  requiredCapability: string;
}

export function useGovernedSurface<T>({
  loadViewModel,
  requiredCapability,
}: GovernedSurfaceOptions<T>) {
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState<GovernedSurfaceState<T>>({
    status: 'loading',
    identity: null,
  });

  useEffect(() => {
    let active = true;
    const controller = new AbortController();
    const authTimeout = window.setTimeout(() => controller.abort(), AUTH_TIMEOUT_MS);

    async function load() {
      setState({ status: 'loading', identity: null });
      try {
        const identity = await fetchAuthoritativeSession({
          requiredCapability,
          signal: controller.signal,
        });
        window.clearTimeout(authTimeout);
        if (!active) return;
        if (!identity) {
          redirectToSafeWorkspace();
          return;
        }

        setState({ status: 'loading', identity });
        const viewModel = await loadViewModel(controller.signal);
        if (!active) return;
        setState({ status: 'ready', identity, viewModel });
      } catch {
        if (!active) return;
        setState(current => ({ status: 'blocked', identity: current.identity }));
      }
    }

    void load();
    return () => {
      active = false;
      window.clearTimeout(authTimeout);
      controller.abort();
    };
  }, [attempt, loadViewModel, requiredCapability]);

  const retry = useCallback(() => setAttempt(value => value + 1), []);
  return { retry, state } as const;
}
