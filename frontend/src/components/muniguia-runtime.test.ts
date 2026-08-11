import { describe, expect, it, vi } from 'vitest';

import type { SessionIdentity } from '../auth/session';
import {
  buildMuniGuiaMountInput,
  closeMuniGuiaForNavigation,
  createMuniGuiaRuntimeLoader,
  mountMuniGuiaNonBlocking,
  type MuniGuiaModule,
  unmountMuniGuiaNonBlocking,
} from './muniguia-runtime';

function identity(capabilities: readonly string[] = [
  'session.read',
  'navigation.workspace',
  'navigation.organization-analytics',
  'navigation.help',
]): SessionIdentity {
  return Object.freeze({
    id: 'user-intendente',
    name: 'Intendencia Junín',
    role: 'INTENDENTE',
    tenant: 'Junín',
    tenantId: 'tenant-junin',
    capabilities: Object.freeze([...capabilities]),
    accessPolicyVersion: '2026-08-11.3',
    homeVariant: 'executive-leadership',
  });
}

describe('MuniGuía React runtime bridge', () => {
  it('projects the already validated session into the exact local mount contract', () => {
    const input = buildMuniGuiaMountInput(identity(), '/estructura');

    expect(input).toEqual({
      role: 'INTENDENTE',
      capabilities: [
        'session.read',
        'navigation.workspace',
        'navigation.organization-analytics',
        'navigation.help',
      ],
      variant: 'executive-leadership',
      policyVersion: '2026-08-11.3',
      pathname: '/estructura',
    });
    expect(Object.isFrozen(input)).toBe(true);
    expect(Object.isFrozen(input?.capabilities)).toBe(true);
  });

  it('does not load help without its authoritative capability or an active pathname', () => {
    expect(buildMuniGuiaMountInput(identity([
      'session.read',
      'navigation.workspace',
      'navigation.organization-analytics',
    ]), '/estructura')).toBeNull();
    expect(buildMuniGuiaMountInput(identity(), '')).toBeNull();
    expect(buildMuniGuiaMountInput(null, '/estructura')).toBeNull();
  });

  it('deduplicates the runtime import and rejects malformed modules without throwing', async () => {
    const runtime: MuniGuiaModule = {
      mountMuniGuia: vi.fn().mockReturnValue(true),
      unmountMuniGuia: vi.fn(),
    };
    const importer = vi.fn().mockResolvedValue(runtime);
    const load = createMuniGuiaRuntimeLoader(importer);

    const [first, second] = await Promise.all([load(), load()]);
    expect(first).toBe(runtime);
    expect(second).toBe(runtime);
    expect(importer).toHaveBeenCalledTimes(1);

    const malformedImporter = vi.fn()
      .mockResolvedValueOnce({ mountMuniGuia: vi.fn() })
      .mockResolvedValueOnce(runtime);
    const loadMalformed = createMuniGuiaRuntimeLoader(malformedImporter);
    await expect(loadMalformed()).resolves.toBeNull();
    await expect(loadMalformed()).resolves.toBe(runtime);
    expect(malformedImporter).toHaveBeenCalledTimes(2);

    const rejectedImporter = vi.fn()
      .mockRejectedValueOnce(new Error('asset unavailable'))
      .mockResolvedValueOnce(runtime);
    const loadRejected = createMuniGuiaRuntimeLoader(rejectedImporter);
    await expect(loadRejected()).resolves.toBeNull();
    await expect(loadRejected()).resolves.toBe(runtime);
    expect(rejectedImporter).toHaveBeenCalledTimes(2);
  });

  it('keeps runtime import and mount failures non-blocking and ignores stale effects', async () => {
    const input = buildMuniGuiaMountInput(identity(), '/estructura');
    if (!input) throw new Error('MuniGuía fixture must be mountable');

    const rejectedLoader = createMuniGuiaRuntimeLoader(
      vi.fn().mockRejectedValue(new Error('asset unavailable')),
    );
    await expect(mountMuniGuiaNonBlocking(
      input,
      () => true,
      { loadRuntime: rejectedLoader },
    )).resolves.toBeNull();

    const failedMount = vi.fn().mockRejectedValue(new Error('mount failed'));
    await expect(mountMuniGuiaNonBlocking(
      input,
      () => true,
      { loadRuntime: () => Promise.resolve({ mountMuniGuia: failedMount, unmountMuniGuia: vi.fn() }) },
    )).resolves.toBeNull();
    expect(failedMount).toHaveBeenCalledTimes(1);

    const staleUnmount = vi.fn();
    const staleMount = vi.fn().mockResolvedValue(true);
    await expect(mountMuniGuiaNonBlocking(
      input,
      vi.fn()
        .mockReturnValueOnce(true)
        .mockReturnValueOnce(true)
        .mockReturnValueOnce(false),
      {
        loadRuntime: () => Promise.resolve({ mountMuniGuia: staleMount, unmountMuniGuia: staleUnmount }),
      },
    )).resolves.toBeNull();
    expect(staleMount).toHaveBeenCalledTimes(1);
    expect(staleUnmount).not.toHaveBeenCalled();

    const supersededUnmount = vi.fn();
    await expect(mountMuniGuiaNonBlocking(
      input,
      () => true,
      {
        loadRuntime: () => Promise.resolve({
          mountMuniGuia: vi.fn().mockResolvedValue(false),
          unmountMuniGuia: supersededUnmount,
        }),
      },
    )).resolves.toBeNull();
    expect(supersededUnmount).not.toHaveBeenCalled();
  });

  it('does not let a stale mount continuation unmount the newer active bridge', async () => {
    const input = buildMuniGuiaMountInput(identity(), '/estructura');
    if (!input) throw new Error('MuniGuía fixture must be mountable');

    let resolveFirstMount: (mounted: boolean) => void = () => undefined;
    let markFirstStarted: () => void = () => undefined;
    const firstMountStarted = new Promise<void>(resolve => {
      markFirstStarted = resolve;
    });
    const firstMount = new Promise<boolean>(resolve => {
      resolveFirstMount = resolve;
    });
    const unmountMuniGuia = vi.fn();
    const runtime: MuniGuiaModule = {
      mountMuniGuia: vi.fn()
        .mockImplementationOnce(() => {
          markFirstStarted();
          return firstMount;
        })
        .mockResolvedValueOnce(true),
      unmountMuniGuia,
    };
    const loadRuntime = () => Promise.resolve(runtime);
    let firstActive = true;

    const staleAttempt = mountMuniGuiaNonBlocking(
      input,
      () => firstActive,
      { loadRuntime },
    );
    await firstMountStarted;

    firstActive = false;
    await unmountMuniGuiaNonBlocking(runtime);
    const activeAttempt = mountMuniGuiaNonBlocking(input, () => true, { loadRuntime });
    await expect(activeAttempt).resolves.toBe(runtime);

    resolveFirstMount(true);
    await expect(staleAttempt).resolves.toBeNull();
    expect(unmountMuniGuia).toHaveBeenCalledTimes(1);
  });

  it('closes an existing guide defensively during cleanup', () => {
    const closeForNavigation = vi.fn();
    closeMuniGuiaForNavigation({ closeForNavigation });
    expect(closeForNavigation).toHaveBeenCalledTimes(1);

    expect(() => closeMuniGuiaForNavigation(null)).not.toThrow();
    expect(() => closeMuniGuiaForNavigation({ closeForNavigation: () => {
      throw new Error('legacy cleanup failed');
    } })).not.toThrow();
  });

  it('unmounts the local module defensively during React cleanup', async () => {
    const unmountMuniGuia = vi.fn();
    const runtime: MuniGuiaModule = {
      mountMuniGuia: vi.fn().mockReturnValue(true),
      unmountMuniGuia,
    };

    await expect(unmountMuniGuiaNonBlocking(runtime)).resolves.toBeUndefined();
    expect(unmountMuniGuia).toHaveBeenCalledTimes(1);

    runtime.unmountMuniGuia = vi.fn().mockRejectedValue(new Error('teardown failed'));
    await expect(unmountMuniGuiaNonBlocking(runtime)).resolves.toBeUndefined();
  });
});
