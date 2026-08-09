import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';

const root = path.resolve(import.meta.dirname, '..');

async function source(relativePath) {
  return readFile(path.join(root, relativePath), 'utf8');
}

test('institutional shell has a single local owner and no runtime sidebar stylesheet', async () => {
  const [css, dashboard, nav, bottom] = await Promise.all([
    source('css/institutional-shell.css'),
    source('css/dashboard.css'),
    source('js/nav.js'),
    source('js/bottom-nav.js'),
  ]);

  assert.equal((dashboard.match(/@import url\("institutional-shell\.css"\)/g) || []).length, 1);
  assert.doesNotMatch(nav, /createElement\(['"]link['"]\)|appendChild\(link\)/);
  assert.match(nav, /data-muni-shell',\s*'primary-nav'/);
  assert.doesNotMatch(nav, /sidebarNavCSS|injectSidebarCSS|municontrol-logo(?:-sidebar)?\.jpg/);
  assert.match(nav, /class="sb-brand-mark"[^>]*>MC</);
  assert.match(nav, /window\.MuniIcons\s*=\s*Object\.freeze/);
  assert.match(bottom, /window\.MuniIcons\.get/);
  assert.match(bottom, /data-muni-shell',\s*'bottom-nav'/);
  assert.match(nav, /data-muni-shell-asset="bottom-nav-v1"/);
  assert.match(nav, /aria-label="Navegación principal"/);
  assert.match(nav, /aria-current="page"/);
  assert.doesNotMatch(bottom, /icon:\s*['"][^'"]*[^\x00-\x7f][^'"]*['"]/i);

  assert.match(css, /html\.muni-shell-v1 \[data-muni-shell=/);
  assert.doesNotMatch(css, /(?:linear|radial|conic)-gradient\s*\(/i);
  assert.doesNotMatch(css, /transition\s*:\s*all\b/i);
});

test('every page that loads the shared navigation owns the shell before nav executes', async () => {
  const files = (await readdir(root)).filter(file => file.endsWith('.html'));
  for (const file of files) {
    const html = await source(file);
    if (!/js\/nav\.js/.test(html)) continue;
    assert.match(
      html,
      /css\/dashboard\.css|css\/institutional-shell\.css/,
      `${file} must load the institutional shell in head`,
    );
    assert.match(
      html,
      /<html\b[^>]*class=["'][^"']*\bmuni-shell-v1\b[^"']*["']/,
      `${file} must declare the shell namespace before body scripts run`,
    );
    assert.doesNotMatch(
      html,
      /class=["'][^"']*\bmobile-bottom-nav\b/,
      `${file} must not retain a second legacy mobile navigation`,
    );
  }
});

test('administration owns the canonical sidebar container', async () => {
  const admin = await source('admin.html');
  assert.match(admin, /id=["']sidebar-container["']/);
  assert.doesNotMatch(admin, /id=["']sidebarContainer["']/);
});

test('the public 404 cannot mount an inert authenticated navigation', async () => {
  const notFound = await source('404.html');
  assert.doesNotMatch(notFound, /js\/(?:nav|bottom-nav)\.js/);
  assert.doesNotMatch(notFound, /class=["'][^"']*\bbottom-nav\b/);
});

test('institutional shell codifies measurable accessibility modes', async () => {
  const css = await source('css/institutional-shell.css');

  assert.match(css, /min-height:\s*44px\s*!important/);
  assert.match(css, /width:\s*44px\s*!important/);
  assert.match(css, /:focus-visible/);
  assert.match(css, /outline:\s*3px\s+solid/);
  assert.match(css, /@media\s*\(prefers-reduced-motion:\s*reduce\)/);
  assert.match(css, /transition-duration:\s*\.001ms\s*!important/);
  assert.match(css, /@media\s*\(forced-colors:\s*active\)/);
  assert.match(css, /env\(safe-area-inset-top/);
  assert.match(css, /env\(safe-area-inset-bottom/);
  assert.doesNotMatch(css, /motion-kit/i);
});

test('institutional shell removes every rail offset from printed documents', async () => {
  const css = await source('css/institutional-shell.css');
  const printBlock = css.slice(css.indexOf('@media print'));

  assert.match(printBlock, /\.main-content\.sidebar-collapsed/);
  assert.match(printBlock, /\.main-content\.expanded/);
  assert.match(printBlock, /body\.sidebar-collapsed\s+\.main-content/);
  assert.match(printBlock, /width:\s*100%\s*!important/);
  assert.match(printBlock, /margin:\s*0\s*!important/);
  assert.match(printBlock, /transition:\s*none\s*!important/);
});
