import { useEffect } from 'react';

import type { SessionIdentity } from '../auth/session';

interface MunicipalTaskCenterRuntime {
  mount(input: {
    role: SessionIdentity['role'];
    variant: SessionIdentity['homeVariant'];
    capabilities: string[];
    policyVersion: SessionIdentity['accessPolicyVersion'];
  }): boolean | Promise<boolean>;
  unmount(): void;
}

interface MunicipalTaskCenterWindow extends Window {
  MuniTaskCenter?: MunicipalTaskCenterRuntime;
}

export function MunicipalTaskCenterBridge({ identity }: { identity: SessionIdentity | null }) {
  useEffect(() => {
    const runtime = (window as MunicipalTaskCenterWindow).MuniTaskCenter;
    if (!identity || !runtime) return undefined;
    void runtime.mount({
      role: identity.role,
      variant: identity.homeVariant,
      capabilities: [...identity.capabilities],
      policyVersion: identity.accessPolicyVersion,
    });
    return () => {
      runtime.unmount();
    };
  }, [identity]);

  return null;
}
