import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildGrhDirectorySql,
  encodeGrhDirectoryCursor,
  normalizeGrhDirectoryScopeOrganizationCodes,
  parseGrhDirectoryQuery,
  readGrhDirectory,
} from '../api/lib/grh-directory-store.js';

test('organization scope codes are canonical, bounded and never interpreted as SQL', () => {
  assert.deepEqual(normalizeGrhDirectoryScopeOrganizationCodes(['12', 7, '12', 0]), [0, 7, 12]);
  for (const value of [[], ['-1'], ['1 OR 1=1'], [2147483648], null]) {
    if (value === null) {
      assert.equal(normalizeGrhDirectoryScopeOrganizationCodes(value), null);
    } else {
      assert.throws(() => normalizeGrhDirectoryScopeOrganizationCodes(value), /directorio GRH/i);
    }
  }
});

test('materialized SQL applies the server scope to rows, totals and every facet', () => {
  const parsed = parseGrhDirectoryQuery({ limit: '25' });
  const built = buildGrhDirectorySql('tenant-junin', parsed, {
    scopeOrganizationCodes: [7, 12],
  });
  assert.deepEqual(built.values.slice(0, 2), ['tenant-junin', [7, 12]]);
  assert.match(built.sql, /p\.organization_code = ANY\(\$2::integer\[\]\)/);
  assert.equal(
    [...built.sql.matchAll(/people\.organization_code = ANY\(\$2::integer\[\]\)/g)].length,
    6,
  );
  assert.doesNotMatch(built.sql, /(?:7|12).*organization_code/);
});

test('an explicit out-of-scope organization is denied before storage access', async () => {
  let queryCalls = 0;
  await assert.rejects(
    readGrhDirectory({
      tenantId: 'tenant-junin',
      query: { organization: '12' },
      scopeOrganizationCodes: ['7'],
      environment: {},
      queryImpl: async () => {
        queryCalls += 1;
        throw new Error('must not run');
      },
    }),
    error => error?.status === 403 && error?.code === 'GRH_DIRECTORY_SCOPE_DENIED',
  );
  assert.equal(queryCalls, 0);
});

test('opaque cursors are bound to the authorization scope', () => {
  const first = parseGrhDirectoryQuery({ limit: '25' }, { cursorScope: 'snapshot:source:order:scope-a' });
  const second = parseGrhDirectoryQuery({ limit: '25' }, { cursorScope: 'snapshot:source:order:scope-b' });
  assert.notEqual(encodeGrhDirectoryCursor(25, first), encodeGrhDirectoryCursor(25, second));
});
