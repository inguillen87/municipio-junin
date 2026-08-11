import { afterEach, describe, expect, it, vi } from 'vitest';

import { fetchAuthoritativeSession, parseAuthoritativeSession } from './session';

const REQUIRED_CAPABILITY = 'navigation.grh-executive';
const ORGANIZATION_CAPABILITY = 'navigation.organization-analytics';

function validPayload(): { user: Record<string, unknown> } {
  return {
    user: {
      id: 'user-intendente',
      name: 'Intendencia Junín',
      role: 'INTENDENTE',
      tenantId: 'tenant-junin',
      tenant: {
        id: 'tenant-junin',
        name: 'Municipalidad de Junín',
        shortName: 'Junín',
      },
      capabilities: [
        'session.read',
        'navigation.workspace',
        REQUIRED_CAPABILITY,
        ORGANIZATION_CAPABILITY,
      ],
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
      capabilities: [
        'session.read',
        'navigation.workspace',
        REQUIRED_CAPABILITY,
        ORGANIZATION_CAPABILITY,
      ],
    });
    expect(Object.isFrozen(identity)).toBe(true);
    expect(Object.isFrozen(identity?.capabilities)).toBe(true);
  });

  it('accepts the organization analytics capability in an authoritative executive session', () => {
    const identity = parseAuthoritativeSession(validPayload(), ORGANIZATION_CAPABILITY);

    expect(identity?.capabilities).toContain(ORGANIZATION_CAPABILITY);
  });

  it.each([
    ['low role', { role: 'DEMO' }],
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
