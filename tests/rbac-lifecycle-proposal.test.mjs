import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const proposalUrl = new URL('../prisma/proposals/rbac-abac-v1.prisma', import.meta.url);
const activeSchemaUrl = new URL('../prisma/schema.prisma', import.meta.url);

function block(source, kind, name) {
  const match = source.match(new RegExp(`^${kind} ${name} \\{([\\s\\S]*?)^\\}`, 'm'));
  assert.ok(match, `${kind} ${name} must exist`);
  return match[1];
}

function enumValues(source, name) {
  return block(source, 'enum', name)
    .split(/\r?\n/u)
    .map(line => line.trim())
    .filter(Boolean)
    .filter(line => !line.startsWith('//'));
}

function fieldNames(model) {
  return model
    .split(/\r?\n/u)
    .map(line => line.trim())
    .filter(line => line && !line.startsWith('//') && !line.startsWith('@@'))
    .map(line => line.split(/\s+/u)[0]);
}

test('the lifecycle design remains an isolated, explicitly non-applicable proposal', async () => {
  const [proposal, active] = await Promise.all([
    readFile(proposalUrl, 'utf8'),
    readFile(activeSchemaUrl, 'utf8'),
  ]);

  assert.match(proposal, /PROPUESTA NO ACTIVA Y NO APLICABLE/);
  assert.match(proposal, /Prohibido aplicar con db push o migrate dev/);
  for (const model of [
    'MfaAuthenticator',
    'MfaChallenge',
    'WebAuthnCredential',
    'TotpAuthenticator',
    'MfaRecoveryCode',
    'RefreshTokenFamily',
    'RefreshTokenCredential',
  ]) {
    assert.match(proposal, new RegExp(`^model ${model} \\{`, 'm'));
    assert.doesNotMatch(active, new RegExp(`^model ${model} \\{`, 'm'));
  }
});

test('MFA, recovery, and refresh state catalogs are exact and fail closed', async () => {
  const proposal = await readFile(proposalUrl, 'utf8');
  assert.deepEqual(enumValues(proposal, 'MfaAuthenticatorKind'), ['WEBAUTHN', 'TOTP']);
  assert.deepEqual(enumValues(proposal, 'MfaAuthenticatorStatus'), [
    'ISSUED', 'ACTIVE', 'SUSPENDED', 'REVOKED', 'EXPIRED',
  ]);
  assert.deepEqual(enumValues(proposal, 'MfaChallengePurpose'), [
    'WEBAUTHN_REGISTRATION',
    'WEBAUTHN_AUTHENTICATION',
    'TOTP_ENROLLMENT_CONFIRMATION',
    'MFA_STEP_UP',
  ]);
  assert.deepEqual(enumValues(proposal, 'MfaChallengeStatus'), [
    'ISSUED', 'USED', 'REVOKED', 'EXPIRED', 'LOCKED',
  ]);
  assert.deepEqual(enumValues(proposal, 'RecoveryCodeStatus'), [
    'ISSUED', 'USED', 'REVOKED', 'EXPIRED',
  ]);
  assert.deepEqual(enumValues(proposal, 'RefreshTokenFamilyStatus'), [
    'ACTIVE', 'REVOKED', 'EXPIRED',
  ]);
  assert.deepEqual(enumValues(proposal, 'RefreshTokenCredentialStatus'), [
    'ISSUED', 'USED', 'REVOKED', 'EXPIRED',
  ]);
});

test('MFA challenges are replay-resistant digest-only records bound to security versions', async () => {
  const proposal = await readFile(proposalUrl, 'utf8');
  const challenge = block(proposal, 'model', 'MfaChallenge');
  const fields = fieldNames(challenge);
  for (const required of [
    'purpose',
    'status',
    'challengeDigest',
    'bindingDigest',
    'pepperKeyId',
    'sessionVersionAtIssue',
    'tokenVersionAtIssue',
    'authorizationVersionAtIssue',
    'policyVersion',
    'maxAttempts',
    'failedAttempts',
    'issuedAt',
    'usedAt',
    'expiresAt',
    'expiredAt',
    'revokedAt',
  ]) assert.ok(fields.includes(required), required);
  assert.match(challenge, /challengeDigest\s+String\s+@unique/);
  assert.match(challenge, /@@index\(\[status, expiresAt\]\)/);
  assert.doesNotMatch(challenge, /^\s*(?:challenge|rawChallenge|options|payload)\s+/m);
});

test('AuthenticationSession binds policy versions and delegates complete refresh history to the ledger', async () => {
  const proposal = await readFile(proposalUrl, 'utf8');
  const session = block(proposal, 'model', 'AuthenticationSession');
  const fields = fieldNames(session);

  for (const required of [
    'sessionVersion',
    'tokenVersion',
    'authorizationVersion',
    'policyVersion',
    'mfaAuthenticatorId',
    'mfaVerifiedAt',
    'issuedAt',
    'lastSeenAt',
    'idleExpiresAt',
    'absoluteExpiresAt',
    'expiredAt',
    'revokedAt',
  ]) assert.ok(fields.includes(required), required);

  assert.equal(fields.includes('refreshTokenDigest'), false);
  assert.equal(fields.includes('refreshFamilyId'), false);
  assert.doesNotMatch(session, /refresh_token_digest|refresh_family_id/);
});

test('MFA authenticators have governed lifecycle, expiry, version binding, and no raw key material', async () => {
  const proposal = await readFile(proposalUrl, 'utf8');
  const common = block(proposal, 'model', 'MfaAuthenticator');
  for (const required of [
    'status',
    'authenticatorVersion',
    'tokenVersionAtIssue',
    'authorizationVersionAtIssue',
    'policyVersion',
    'issuedAt',
    'enrolledAt',
    'firstUsedAt',
    'lastUsedAt',
    'expiresAt',
    'expiredAt',
    'suspendedAt',
    'revokedAt',
  ]) assert.ok(fieldNames(common).includes(required), required);

  for (const modelName of ['WebAuthnCredential', 'TotpAuthenticator']) {
    const model = block(proposal, 'model', modelName);
    const fields = fieldNames(model);
    assert.ok(fields.includes('authenticatorId'), `${modelName}:authenticatorId`);
    assert.ok(fields.includes('encryptedKeyRef'), `${modelName}:encryptedKeyRef`);
    assert.ok(fields.includes('keyId'), `${modelName}:keyId`);
    assert.ok(fields.includes('encryptedMaterialDigest'), `${modelName}:encryptedMaterialDigest`);
    assert.match(model, /authenticatorId\s+String\s+@unique/);
    assert.match(model, /encryptedKeyRef\s+String\s+@unique/);
    assert.doesNotMatch(model, /^\s*(?:secret|privateKey|publicKey|credentialId)\s+String/m);
  }

  const webauthn = block(proposal, 'model', 'WebAuthnCredential');
  assert.match(webauthn, /credentialIdDigest\s+String\s+@unique/);
  assert.match(webauthn, /signCount\s+BigInt/);
  const totp = block(proposal, 'model', 'TotpAuthenticator');
  assert.match(totp, /lastAcceptedCounter\s+BigInt\?/);
  assert.match(totp, /keyVersion\s+Int/);
});

test('recovery codes retain only unique digests with use, expiry, revocation, and version evidence', async () => {
  const proposal = await readFile(proposalUrl, 'utf8');
  const recovery = block(proposal, 'model', 'MfaRecoveryCode');
  const fields = fieldNames(recovery);
  for (const required of [
    'batchId',
    'sequence',
    'status',
    'codeDigest',
    'pepperKeyId',
    'tokenVersionAtIssue',
    'authorizationVersionAtIssue',
    'policyVersion',
    'issuedAt',
    'usedAt',
    'expiresAt',
    'expiredAt',
    'revokedAt',
  ]) assert.ok(fields.includes(required), required);
  assert.match(recovery, /codeDigest\s+String\s+@unique/);
  assert.match(recovery, /@@unique\(\[batchId, sequence\]\)/);
  assert.doesNotMatch(recovery, /^\s*(?:code|rawCode|recoveryCode)\s+String/m);
});

test('refresh rotation keeps every family sequence addressable for prior-credential reuse detection', async () => {
  const proposal = await readFile(proposalUrl, 'utf8');
  const family = block(proposal, 'model', 'RefreshTokenFamily');
  const credential = block(proposal, 'model', 'RefreshTokenCredential');

  for (const required of [
    'sessionId',
    'status',
    'familyVersion',
    'currentSequence',
    'sessionVersionAtIssue',
    'tokenVersionAtIssue',
    'authorizationVersionAtIssue',
    'policyVersion',
    'issuedAt',
    'lastUsedAt',
    'expiresAt',
    'expiredAt',
    'reuseDetectedAt',
    'revokedAt',
  ]) assert.ok(fieldNames(family).includes(required), `family:${required}`);

  for (const required of [
    'familyId',
    'sequence',
    'status',
    'tokenDigest',
    'pepperKeyId',
    'familyVersionAtIssue',
    'sessionVersionAtIssue',
    'tokenVersionAtIssue',
    'authorizationVersionAtIssue',
    'policyVersion',
    'issuedAt',
    'usedAt',
    'expiresAt',
    'expiredAt',
    'reuseDetectedAt',
    'revokedAt',
    'revokedByUserId',
  ]) assert.ok(fieldNames(credential).includes(required), `credential:${required}`);

  assert.match(family, /sessionId\s+String\s+@unique/);
  assert.match(credential, /tokenDigest\s+String\s+@unique/);
  assert.match(credential, /@@unique\(\[familyId, sequence\]\)/);
  assert.match(credential, /@@index\(\[familyId, status, expiresAt\]\)/);
  assert.doesNotMatch(credential, /^\s*(?:token|rawToken|refreshToken)\s+String/m);
});

test('the proposal makes non-Prisma SQL controls explicit instead of claiming enforcement', async () => {
  const proposal = await readFile(proposalUrl, 'utf8');
  assert.match(proposal, /CONTRATO PENDIENTE PARA LA MIGRACION SQL REAL/);
  assert.match(proposal, /FKs:[\s\S]*tenant consistente/);
  assert.match(proposal, /CHECKs:[\s\S]*coherencia entre/);
  assert.match(proposal, /TRIGGERS:[\s\S]*reuse de cualquier secuencia previa/);
  assert.match(proposal, /PRIVILEGIOS:[\s\S]*runtime municipal[\s\S]*sin DML directo/);
  assert.match(proposal, /ledger refresh sin DELETE/);
  assert.match(proposal, /auditoria append-only/);
});
