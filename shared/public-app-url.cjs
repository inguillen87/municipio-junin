'use strict';

class PublicAppUrlError extends Error {
  constructor() {
    super('PUBLIC_APP_URL debe ser un origen HTTPS exacto');
    this.name = 'PublicAppUrlError';
    this.code = 'PUBLIC_APP_URL_INVALID';
  }
}

function invalidPublicAppUrl() {
  throw new PublicAppUrlError();
}

function getPublicAppOrigin(configuredValue = process.env.PUBLIC_APP_URL) {
  if (typeof configuredValue !== 'string' || !configuredValue || configuredValue !== configuredValue.trim()) {
    return invalidPublicAppUrl();
  }
  if (
    configuredValue.includes('?') ||
    configuredValue.includes('#') ||
    configuredValue.includes('\\') ||
    /[\u0000-\u0020\u007f]/.test(configuredValue)
  ) {
    return invalidPublicAppUrl();
  }

  let parsed;
  try {
    parsed = new URL(configuredValue);
  } catch {
    return invalidPublicAppUrl();
  }

  if (
    parsed.protocol !== 'https:' ||
    parsed.username ||
    parsed.password ||
    parsed.search ||
    parsed.hash ||
    parsed.pathname !== '/'
  ) {
    return invalidPublicAppUrl();
  }
  if (configuredValue !== parsed.origin && configuredValue !== `${parsed.origin}/`) {
    return invalidPublicAppUrl();
  }

  return parsed.origin;
}

function buildPublicAppUrl(pathname, configuredValue = process.env.PUBLIC_APP_URL) {
  const origin = getPublicAppOrigin(configuredValue);
  if (
    typeof pathname !== 'string' ||
    !pathname.startsWith('/') ||
    pathname.startsWith('//') ||
    pathname.includes('\\') ||
    pathname.includes('?') ||
    pathname.includes('#')
  ) {
    return invalidPublicAppUrl();
  }

  let target;
  try {
    target = new URL(pathname, `${origin}/`);
  } catch {
    return invalidPublicAppUrl();
  }

  if (
    target.origin !== origin ||
    target.username ||
    target.password ||
    target.search ||
    target.hash ||
    target.pathname !== pathname
  ) {
    return invalidPublicAppUrl();
  }

  return target.href;
}

module.exports = {
  PublicAppUrlError,
  buildPublicAppUrl,
  getPublicAppOrigin,
};
