import type { SessionIdentity } from '../auth/session';

const MUNIGUIA_MODULE_URL = '/js/contextual-help.js';

export interface MuniGuiaMountInput {
  readonly role: SessionIdentity['role'];
  readonly capabilities: readonly string[];
  readonly variant: SessionIdentity['homeVariant'];
  readonly policyVersion: SessionIdentity['accessPolicyVersion'];
  readonly pathname: string;
}

export interface MuniGuiaModule {
  mountMuniGuia(input: MuniGuiaMountInput): boolean | Promise<boolean>;
  unmountMuniGuia(): void | Promise<void>;
}

interface MuniGuiaNavigationRuntime {
  closeForNavigation(): void;
}

type RuntimeImporter = () => Promise<unknown>;

interface MuniGuiaMountOptions {
  readonly loadRuntime?: () => Promise<MuniGuiaModule | null>;
  readonly onRuntime?: (runtime: MuniGuiaModule) => void;
}

function plainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function validModule(value: unknown): value is MuniGuiaModule {
  return plainObject(value) && typeof value.mountMuniGuia === 'function' &&
    typeof value.unmountMuniGuia === 'function';
}

function validNavigationRuntime(value: unknown): value is MuniGuiaNavigationRuntime {
  return plainObject(value) && typeof value.closeForNavigation === 'function';
}

export function buildMuniGuiaMountInput(
  identity: SessionIdentity | null,
  pathname: string,
): MuniGuiaMountInput | null {
  if (!identity || !identity.capabilities.includes('navigation.help') ||
      typeof pathname !== 'string' || pathname.length === 0) {
    return null;
  }

  return Object.freeze({
    role: identity.role,
    capabilities: Object.freeze([...identity.capabilities]),
    variant: identity.homeVariant,
    policyVersion: identity.accessPolicyVersion,
    pathname,
  });
}

export function createMuniGuiaRuntimeLoader(importer: RuntimeImporter) {
  let runtimePromise: Promise<MuniGuiaModule | null> | null = null;

  return function loadMuniGuiaRuntime(): Promise<MuniGuiaModule | null> {
    if (runtimePromise) return runtimePromise;

    let importAttempt: Promise<unknown>;
    try {
      importAttempt = importer();
    } catch {
      return Promise.resolve(null);
    }

    const attempt = importAttempt.then(
      module => {
        if (validModule(module)) return module;
        if (runtimePromise === attempt) runtimePromise = null;
        return null;
      },
      () => {
        if (runtimePromise === attempt) runtimePromise = null;
        return null;
      },
    );
    runtimePromise = attempt;
    return runtimePromise;
  };
}

const loadMuniGuiaRuntime = createMuniGuiaRuntimeLoader(
  () => import(/* @vite-ignore */ MUNIGUIA_MODULE_URL),
);

export async function mountMuniGuiaNonBlocking(
  input: MuniGuiaMountInput,
  isActive: () => boolean,
  options: MuniGuiaMountOptions = {},
): Promise<MuniGuiaModule | null> {
  const loadRuntime = options.loadRuntime ?? loadMuniGuiaRuntime;
  const runtime = await loadRuntime();
  if (!runtime || !isActive()) return null;
  options.onRuntime?.(runtime);
  if (!isActive()) return null;

  try {
    const mounted = await runtime.mountMuniGuia(input);
    if (!mounted) return null;
    if (!isActive()) return null;
    return runtime;
  } catch {
    // Contextual guidance is progressive enhancement; the governed surface stays usable.
    return null;
  }
}

export async function unmountMuniGuiaNonBlocking(runtime: MuniGuiaModule): Promise<void> {
  try {
    await runtime.unmountMuniGuia();
  } catch {
    // A help teardown failure must never block React unmount or navigation.
  }
}

export function closeMuniGuiaForNavigation(candidate: unknown): void {
  if (!validNavigationRuntime(candidate)) return;
  try {
    candidate.closeForNavigation();
  } catch {
    // A help cleanup failure must never block React unmount or navigation.
  }
}
