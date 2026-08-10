import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

const root = path.resolve(import.meta.dirname, '..');

test('unused demo intelligence assets are removed from the public tree', () => {
  for (const relativePath of [
    'js/data.js',
    'js/ia.js',
    'js/dashboard.js',
    'js/hf-client.js',
    'js/clasificador.js',
    'js/ia-hf.js',
    'js/control.js',
    'js/exportar.js',
    'js/ia2.js',
    'js/notifications.js',
    'js/servicios.js',
    'js/talleres.js',
    'js/upload.js',
    'js/vecinos.js',
    'js/ai-widget.js',
    'js/analytics-live.js',
    'js/api-live.js',
    'js/api.js',
    'js/charts-premium.js',
    'js/charts.js',
    'js/chat-widget.js',
    'js/i18n.js',
    'js/live-clock.js',
    'js/manuales.js',
    'js/onboarding.js',
    'js/permissions.js',
    'js/pwa.js',
    'js/search-global.js',
    'js/toast.js',
    'js/ux-improvements.js',
    'botia-e2e.cjs',
    'botia-e2e-final.cjs',
    'inspect-dom.cjs',
    'migrate.mjs',
    'fix.py',
    'fix2.py',
    'fix_encoding.py',
    'fix_final.py',
    'fix_js.py',
    'fix_structure.py',
    'patch.py',
    'patch_mapa.py',
    'patch_vecinos.py',
    'update_index.py',
    'update_login.py',
    'update_login_session.py',
    'update_analytics.py',
    'update_analytics2.py',
    'update_hacienda.py',
    'update_perm.py'
  ]) {
    assert.equal(fs.existsSync(path.join(root, relativePath)), false, `${relativePath} must remain retired`);
  }
});

test('the legacy AI route only directs authenticated users to the governed assistant', () => {
  const source = fs.readFileSync(path.join(root, 'ia-hf.html'), 'utf8');
  assert.match(source, /Ruta experimental retirada/);
  assert.match(source, /href="ia\.html"/);
  assert.match(source, /js\/nav\.js/);
  assert.doesNotMatch(source, /js\/(?:db|data|ia|dashboard)\.js/);
  assert.doesNotMatch(source, /<script[^>]+src=["']https?:\/\//i);
  assert.doesNotMatch(source, /(?:OpenAI|Hugging\s*Face|Qwen|MUNICIPAL_DATA|\bDNI\b|\bARS\b|\$\s*\d)/i);
});

test('no HTML file references the retired demo assets', () => {
  for (const name of fs.readdirSync(root).filter((entry) => entry.endsWith('.html'))) {
    const source = fs.readFileSync(path.join(root, name), 'utf8');
    assert.doesNotMatch(
      source,
      /<script[^>]+src=["'][^"']*js\/(?:data|ia|dashboard|hf-client|clasificador|ia-hf|control|exportar|ia2|notifications|servicios|talleres|upload|vecinos)\.js["']/i,
      name
    );
  }
});

test('institutional login exposes only the controlled read-only evaluation identities', () => {
  const source = fs.readFileSync(path.join(root, 'login.html'), 'utf8');
  assert.match(source, /Identidad emitida por la Municipalidad/);
  assert.match(source, /data-demo-contract="published-evaluation-readonly-v1"/);
  assert.equal((source.match(/data-evaluation-email=/g) || []).length, 6);
  assert.match(source, /escrituras bloqueadas por el servidor/i);
  assert.doesNotMatch(source, /\/api\/auth\/seed-demo|ensureSeeded|fillUser\s*\(/i);
  assert.doesNotMatch(source, /href=["']#["'][^>]*Olvid/i);
});
