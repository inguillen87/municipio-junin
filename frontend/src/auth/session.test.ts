import { afterEach, describe, expect, it, vi } from 'vitest';

import { fetchAuthoritativeSession, parseAuthoritativeSession } from './session';

const REQUIRED_CAPABILITY = 'navigation.grh-executive';
const DECISIONS_CAPABILITY = 'navigation.grh-decisions';
const ORGANIZATION_CAPABILITY = 'navigation.organization-analytics';
const TERRITORY_CAPABILITY = 'navigation.territory';
const INTENDENTE_CAPABILITIES = Object.freeze([
  'session.read',
  'navigation.workspace',
  'navigation.dashboard',
  'navigation.reports',
  'navigation.hacienda',
  REQUIRED_CAPABILITY,
  DECISIONS_CAPABILITY,
  ORGANIZATION_CAPABILITY,
  TERRITORY_CAPABILITY,
  'navigation.data-quality',
  'navigation.rrhh',
  'navigation.ai-assistant',
  'navigation.audit',
  'navigation.export',
  'navigation.help',
]);
const ROLE_HOME_PROFILES = {
  SUPER_ADMIN: {
    variant: 'platform-governance',
    priorityCapabilities: [
      'navigation.workspace',
      'navigation.audit',
      'navigation.import',
      'navigation.data-quality',
    ],
  },
  INTENDENTE: {
    variant: 'executive-leadership',
    priorityCapabilities: [
      'navigation.workspace',
      'navigation.dashboard',
      REQUIRED_CAPABILITY,
      'navigation.reports',
    ],
  },
  TENANT_ADMIN: {
    variant: 'municipal-operations',
    priorityCapabilities: [
      'navigation.workspace',
      'navigation.import',
      'navigation.audit',
      'navigation.data-quality',
    ],
  },
  TENANT_USER: {
    variant: 'municipal-limited',
    priorityCapabilities: ['navigation.workspace', TERRITORY_CAPABILITY, 'navigation.help'],
  },
  CONTADOR: {
    variant: 'financial-control',
    priorityCapabilities: [
      'navigation.workspace',
      'navigation.hacienda',
      'navigation.reports',
      'navigation.data-quality',
    ],
  },
  INSPECTOR: {
    variant: 'territorial-unassigned',
    priorityCapabilities: ['navigation.workspace', TERRITORY_CAPABILITY, 'navigation.help'],
  },
  DEMO: {
    variant: 'controlled-preview',
    priorityCapabilities: ['navigation.workspace', TERRITORY_CAPABILITY, 'navigation.help'],
  },
} as const;

function validPayload(): { user: Record<string, unknown> } {
  return {
    user: {
      id: 'user-intendente',
      name: 'Intendencia Junín',
      role: 'INTENDENTE',
      tenantId: 'tenant-junin',
      accessPolicyVersion: '2026-08-11.3',
      homeProfile: {
        variant: 'executive-leadership',
        defaultPath: 'inicio.html',
        priorityCapabilities: [...ROLE_HOME_PROFILES.INTENDENTE.priorityCapabilities],
      },
      tenant: {
        id: 'tenant-junin',
        name: 'Municipalidad de Junín',
        shortName: 'Junín',
      },
      capabilities: [...INTENDENTE_CAPABILITIES],
    },
  };
}

type TestRole = keyof typeof ROLE_HOME_PROFILES;

function payloadForRole(
  role: TestRole,
  priorityCapabilities: readonly string[] = ROLE_HOME_PROFILES[role].priorityCapabilities,
): { user: Record<string, unknown> } {
  const profile = ROLE_HOME_PROFILES[role];
  return {
    user: {
      id: `user-${role.toLocaleLowerCase('en-US')}`,
      name: `Perfil ${role}`,
      role,
      tenantId: 'tenant-junin',
      accessPolicyVersion: '2026-08-11.3',
      homeProfile: {
        variant: profile.variant,
        defaultPath: 'inicio.html',
        priorityCapabilities: [...priorityCapabilities],
      },
      tenant: { id: 'tenant-junin', shortName: 'Junín' },
      capabilities: [...new Set(['session.read', ...profile.priorityCapabilities])],
    },
  };
}

describe('parseAuthoritativeSession', () => {
  it('accepts a governed role only with an exact tenant and required capability', () => {
    const identity = parseAuthoritativeSession(validPayload(), REQUIRED_CAPABILITY);

    expect(identity).toEqual({
      id: 'user-intendente',
      name: 'Intendencia Junín',
      role: 'INTENDENTE',
      tenant: 'Junín',
      tenantId: 'tenant-junin',
      capabilities: [...INTENDENTE_CAPABILITIES],
      accessPolicyVersion: '2026-08-11.3',
      homeVariant: 'executive-leadership',
    });
    expect(Object.isFrozen(identity)).toBe(true);
    expect(Object.isFrozen(identity?.capabilities)).toBe(true);
  });

  it('accepts the organization analytics capability in an authoritative executive session', () => {
    const identity = parseAuthoritativeSession(validPayload(), ORGANIZATION_CAPABILITY);

    expect(identity?.capabilities).toContain(ORGANIZATION_CAPABILITY);
  });

  it('accepts the GRH decisions capability only when it is present in the governed session', () => {
    const identity = parseAuthoritativeSession(validPayload(), DECISIONS_CAPABILITY);

    expect(identity?.capabilities).toContain(DECISIONS_CAPABILITY);
  });

  it.each(Object.keys(ROLE_HOME_PROFILES) as TestRole[])(
    'accepts the exact canonical home priorities for tenant-bound %s',
    role => {
      const identity = parseAuthoritativeSession(payloadForRole(role), 'navigation.workspace');

      expect(identity?.role).toBe(role);
      expect(identity?.homeVariant).toBe(ROLE_HOME_PROFILES[role].variant);
    },
  );

  it.each(Object.keys(ROLE_HOME_PROFILES) as TestRole[])(
    'rejects truncated, reordered or extra home priorities for %s',
    role => {
      const canonical = ROLE_HOME_PROFILES[role].priorityCapabilities;
      const reordered = [canonical[1], canonical[0], ...canonical.slice(2)];
      const mutations = [
        canonical.slice(0, -1),
        reordered,
        [...canonical, 'session.read'],
      ];

      for (const priorities of mutations) {
        expect(parseAuthoritativeSession(
          payloadForRole(role, priorities),
          'navigation.workspace',
        )).toBeNull();
      }
    },
  );

  it.each(['TENANT_USER', 'INSPECTOR', 'DEMO'])('accepts %s only for the exact territorial capability', role => {
    const payload = validPayload();
    const profile = ROLE_HOME_PROFILES[role as keyof typeof ROLE_HOME_PROFILES];
    payload.user = {
      ...payload.user,
      role,
      capabilities: ['session.read', 'navigation.workspace', TERRITORY_CAPABILITY, 'navigation.help'],
      homeProfile: {
        variant: profile.variant,
        defaultPath: 'inicio.html',
        priorityCapabilities: [...profile.priorityCapabilities],
      },
    };

    const identity = parseAuthoritativeSession(payload, TERRITORY_CAPABILITY);
    expect(identity?.role).toBe(role);
    expect(identity?.capabilities).toEqual([
      'session.read',
      'navigation.workspace',
      TERRITORY_CAPABILITY,
      'navigation.help',
    ]);
    expect(parseAuthoritativeSession(payload, REQUIRED_CAPABILITY)).toBeNull();
  });

  it.each(['TENANT_USER', 'INSPECTOR', 'DEMO'])(
    'rejects %s when an executive capability is injected into its territorial projection',
    role => {
      const payload = validPayload();
      const profile = ROLE_HOME_PROFILES[role as keyof typeof ROLE_HOME_PROFILES];
      payload.user = {
        ...payload.user,
        role,
        capabilities: [
          'session.read',
          'navigation.workspace',
          TERRITORY_CAPABILITY,
          REQUIRED_CAPABILITY,
          'navigation.help',
        ],
        homeProfile: {
          variant: profile.variant,
          defaultPath: 'inicio.html',
          priorityCapabilities: [...profile.priorityCapabilities],
        },
      };

      expect(parseAuthoritativeSession(payload, TERRITORY_CAPABILITY)).toBeNull();
      expect(parseAuthoritativeSession(payload, REQUIRED_CAPABILITY)).toBeNull();
    },
  );

  it.each([
    ['unknown role', { role: 'MAYOR' }],
    ['tenant mismatch', { tenant: { id: 'tenant-other', shortName: 'Otro' } }],
    ['missing tenant', { tenant: undefined }],
    ['null tenant', { tenant: null }],
    ['tenant without id', { tenant: { shortName: 'Junín' } }],
    ['tenant with empty id', { tenant: { id: '', shortName: 'Junín' } }],
    ['missing capability', { capabilities: ['session.read', 'navigation.workspace'] }],
    ['duplicate capability', {
      capabilities: ['session.read', 'navigation.workspace', REQUIRED_CAPABILITY, REQUIRED_CAPABILITY],
    }],
    ['unknown capability', {
      capabilities: ['session.read', 'navigation.workspace', REQUIRED_CAPABILITY, 'navigation.ambient'],
    }],
    ['stale access policy', { accessPolicyVersion: '2026-08-10.9' }],
    ['missing home profile', { homeProfile: undefined }],
    ['role/profile mismatch', {
      homeProfile: {
        variant: 'financial-control',
        defaultPath: 'inicio.html',
        priorityCapabilities: [...ROLE_HOME_PROFILES.INTENDENTE.priorityCapabilities],
      },
    }],
    ['home profile with an extra key', {
      homeProfile: {
        variant: 'executive-leadership',
        defaultPath: 'inicio.html',
        priorityCapabilities: [...ROLE_HOME_PROFILES.INTENDENTE.priorityCapabilities],
        ambientAccess: true,
      },
    }],
    ['unsafe home path', {
      homeProfile: {
        variant: 'executive-leadership',
        defaultPath: 'https://attacker.example/',
        priorityCapabilities: [...ROLE_HOME_PROFILES.INTENDENTE.priorityCapabilities],
      },
    }],
    ['duplicate priority capability', {
      homeProfile: {
        variant: 'executive-leadership',
        defaultPath: 'inicio.html',
        priorityCapabilities: [
          ...ROLE_HOME_PROFILES.INTENDENTE.priorityCapabilities,
          'navigation.reports',
        ],
      },
    }],
    ['unknown priority capability', {
      homeProfile: {
        variant: 'executive-leadership',
        defaultPath: 'inicio.html',
        priorityCapabilities: [
          'navigation.workspace',
          'navigation.dashboard',
          REQUIRED_CAPABILITY,
          'navigation.ambient',
        ],
      },
    }],
    ['priority outside the projected session', {
      capabilities: INTENDENTE_CAPABILITIES.filter(capability => capability !== 'navigation.dashboard'),
      homeProfile: {
        variant: 'executive-leadership',
        defaultPath: 'inicio.html',
        priorityCapabilities: [...ROLE_HOME_PROFILES.INTENDENTE.priorityCapabilities],
      },
    }],
  ])('rejects %s fail closed', (_label, mutation) => {
    const payload = validPayload();
    payload.user = { ...payload.user, ...mutation };

    expect(parseAuthoritativeSession(payload, REQUIRED_CAPABILITY)).toBeNull();
  });

  it('rejects unknown requested capabilities before trusting the payload', () => {
    expect(parseAuthoritativeSession(validPayload(), 'navigation.future')).toBeNull();
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('fetchAuthoritativeSession', () => {
  function sessionResponse({
    contentType = 'application/json; charset=utf-8',
    contract = 'municontrol-auth-me-v1',
  } = {}) {
    return new Response(JSON.stringify(validPayload()), {
      status: 200,
      headers: {
        'content-type': contentType,
        'x-municontrol-contract': contract,
      },
    });
  }

  it('accepts only the exact authenticated session response contract', async () => {
    const fetchMock = vi.fn().mockResolvedValue(sessionResponse());
    vi.stubGlobal('window', { MuniAuth: { fetch: fetchMock } });

    const identity = await fetchAuthoritativeSession({
      requiredCapability: REQUIRED_CAPABILITY,
      signal: new AbortController().signal,
    });

    expect(identity?.role).toBe('INTENDENTE');
    expect(fetchMock).toHaveBeenCalledWith('/api/auth/me', expect.objectContaining({
      method: 'GET',
      cache: 'no-store',
      credentials: 'same-origin',
      redirect: 'error',
    }));
  });

  it.each([
    ['missing contract', { contract: '' }],
    ['wrong contract', { contract: 'municontrol-auth-me-v0' }],
    ['non JSON content', { contentType: 'text/html; charset=utf-8' }],
  ])('rejects %s before parsing identity', async (_label, responseOptions) => {
    vi.stubGlobal('window', {
      MuniAuth: { fetch: vi.fn().mockResolvedValue(sessionResponse(responseOptions)) },
    });

    await expect(fetchAuthoritativeSession({
      requiredCapability: REQUIRED_CAPABILITY,
      signal: new AbortController().signal,
    })).rejects.toThrow('SESSION_UNAVAILABLE');
  });
});
