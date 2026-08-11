import assert from 'node:assert/strict';
import test from 'node:test';

import { parseGrhDirectoryRequestContext } from '../api/lib/grh-directory-request-context.js';

test('accepts only an allowlisted purpose and a bounded correlation id', () => {
  const value = parseGrhDirectoryRequestContext({ headers: {
    'x-municontrol-purpose': 'PERSON_LOOKUP',
    'x-correlation-id': '550e8400-e29b-41d4-a716-446655440000',
  } }, { detail: true });
  assert.deepEqual(value, {
    purpose: 'PERSON_LOOKUP',
    correlationId: '550e8400-e29b-41d4-a716-446655440000',
  });
  assert.equal(Object.isFrozen(value), true);
});

test('generates a correlation id without reading personal query values', () => {
  const value = parseGrhDirectoryRequestContext({
    headers: { 'x-municontrol-purpose': 'DIRECTORY_BROWSE' },
    query: { search: 'a personal value that must not enter the context' },
  }, { generateId: () => '6ba7b810-9dad-41d1-80b4-00c04fd430c8' });
  assert.deepEqual(value, {
    purpose: 'DIRECTORY_BROWSE',
    correlationId: '6ba7b810-9dad-41d1-80b4-00c04fd430c8',
  });
  assert.equal(JSON.stringify(value).includes('personal value'), false);
});

test('rejects missing, duplicated, unknown and mode-incompatible purpose headers', () => {
  const invalid = [
    {},
    { 'x-municontrol-purpose': ['PERSON_LOOKUP', 'LEAVE_REVIEW'] },
    { 'x-municontrol-purpose': 'EXPORT_ALL' },
    { 'x-municontrol-purpose': 'DIRECTORY_BROWSE' },
  ];
  invalid.forEach((headers, index) => {
    assert.equal(
      parseGrhDirectoryRequestContext({ headers }, { detail: index === 3 }),
      null,
    );
  });
});

test('rejects malformed or duplicated correlation ids', () => {
  for (const value of [
    'short',
    'Mauricio-Alonso-legajo-12345',
    '550e8400-e29b-11d4-a716-446655440000',
    ['550e8400-e29b-41d4-a716-446655440000', '6ba7b810-9dad-41d1-80b4-00c04fd430c8'],
  ]) {
    assert.equal(parseGrhDirectoryRequestContext({ headers: {
      'x-municontrol-purpose': 'DIRECTORY_BROWSE',
      'x-correlation-id': value,
    } }), null);
  }
});
