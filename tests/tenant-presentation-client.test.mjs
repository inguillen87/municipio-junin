import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import vm from 'node:vm';

import tenantPresentationPolicy from '../shared/tenant-presentation-policy.cjs';

const source = await readFile(new URL('../js/tenant-presentation.js', import.meta.url), 'utf8');

function clientFor(storedUser) {
  const window = {
    MuniAuthReady: Promise.resolve(true),
    sessionStorage: {
      getItem(key) {
        return key === 'mjunin_user' ? JSON.stringify(storedUser) : null;
      },
    },
  };
  vm.runInNewContext(source, { window, Intl, Object, JSON, Error });
  return window.MuniTenantPresentation;
}

test('browser currency formatter accepts the exact Junin tenant policy and renders ARS', async () => {
  const presentation = tenantPresentationPolicy.resolveTenantPresentation({ slug: 'junin' });
  const client = clientFor({ presentation });

  assert.equal(client.validate(presentation), true);
  assert.equal(JSON.stringify(await client.load()), JSON.stringify(presentation));
  assert.match(client.formatAmount(1208241272.14, presentation, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }), /^ARS\s1\.208\.241\.272,14$/);
});

test('browser currency formatter rejects missing or drifted tenant presentation', async () => {
  const client = clientFor({ presentation: { displayCurrencyCode: 'USD' } });
  assert.equal(client.validate({ displayCurrencyCode: 'USD' }), false);
  await assert.rejects(client.load(), /TENANT_PRESENTATION_UNAVAILABLE/);
});
