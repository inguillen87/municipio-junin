import { useEffect } from 'react';

import type { SessionIdentity } from '../auth/session';
import {
  buildMuniGuiaMountInput,
  closeMuniGuiaForNavigation,
  mountMuniGuiaNonBlocking,
  type MuniGuiaModule,
  unmountMuniGuiaNonBlocking,
} from './muniguia-runtime';

interface MuniGuiaBridgeProps {
  identity: SessionIdentity | null;
}

interface MuniGuiaWindow extends Window {
  MuniGuia?: unknown;
}

export function MuniGuiaBridge({ identity }: MuniGuiaBridgeProps) {
  useEffect(() => {
    const input = buildMuniGuiaMountInput(identity, window.location.pathname);
    if (!input) return undefined;

    let active = true;
    let loadedRuntime: MuniGuiaModule | null = null;
    let mountedRuntime: MuniGuiaModule | null = null;
    void mountMuniGuiaNonBlocking(input, () => active, {
      onRuntime: runtime => {
        loadedRuntime = runtime;
      },
    }).then(runtime => {
      if (!runtime) return;
      if (!active) return;
      mountedRuntime = runtime;
    });

    return () => {
      active = false;
      closeMuniGuiaForNavigation((window as MuniGuiaWindow).MuniGuia);
      const runtime = mountedRuntime ?? loadedRuntime;
      if (runtime) void unmountMuniGuiaNonBlocking(runtime);
    };
  }, [identity]);

  return null;
}
