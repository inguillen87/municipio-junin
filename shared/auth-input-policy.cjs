'use strict';

const MAX_EMAIL_BYTES = 254;
const MAX_BCRYPT_PASSWORD_BYTES = 72;
const MIN_BOOTSTRAP_PASSWORD_CHARACTERS = 14;

function utf8Bytes(value) {
  return Buffer.byteLength(value, 'utf8');
}

function inspectLoginCredentials(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return { ok: false, code: 'LOGIN_INPUT_REQUIRED' };
  }

  const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
  const password = typeof body.password === 'string' ? body.password : '';
  if (!email || !password) {
    return { ok: false, code: 'LOGIN_INPUT_REQUIRED' };
  }
  if (utf8Bytes(email) > MAX_EMAIL_BYTES || /[\u0000-\u001f\u007f]/.test(email)) {
    return { ok: false, code: 'LOGIN_INPUT_INVALID' };
  }
  if (utf8Bytes(password) > MAX_BCRYPT_PASSWORD_BYTES) {
    return { ok: false, code: 'LOGIN_INPUT_INVALID' };
  }

  return { ok: true, email, password };
}

function inspectBootstrapPassword(password) {
  if (typeof password !== 'string' || password.length < MIN_BOOTSTRAP_PASSWORD_CHARACTERS) {
    return { ok: false, code: 'PASSWORD_TOO_SHORT' };
  }
  if (utf8Bytes(password) > MAX_BCRYPT_PASSWORD_BYTES) {
    return { ok: false, code: 'PASSWORD_EXCEEDS_BCRYPT_LIMIT' };
  }
  return { ok: true };
}

module.exports = Object.freeze({
  MAX_EMAIL_BYTES,
  MAX_BCRYPT_PASSWORD_BYTES,
  MIN_BOOTSTRAP_PASSWORD_CHARACTERS,
  inspectLoginCredentials,
  inspectBootstrapPassword,
});
