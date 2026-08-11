import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const file = relativePath => readFile(new URL(`../${relativePath}`, import.meta.url), 'utf8');

function channelToLinear(channel) {
  const value = channel / 255;
  return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
}

function luminance(hex) {
  const channels = hex.slice(1).match(/../g).map(value => Number.parseInt(value, 16));
  return (0.2126 * channelToLinear(channels[0]))
    + (0.7152 * channelToLinear(channels[1]))
    + (0.0722 * channelToLinear(channels[2]));
}

function contrast(foreground, background) {
  const values = [luminance(foreground), luminance(background)].sort((left, right) => right - left);
  return (values[0] + 0.05) / (values[1] + 0.05);
}

function block(source, selector) {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = source.match(new RegExp(`${escaped}\\s*\\{([\\s\\S]*?)\\n\\s*\\}`));
  assert.ok(match, `Missing CSS block ${selector}`);
  return match[1];
}

function token(sourceBlock, name) {
  const match = sourceBlock.match(new RegExp(`--${name}:\\s*(#[0-9a-f]{6})`, 'i'));
  assert.ok(match, `Missing color token --${name}`);
  return match[1].toLowerCase();
}

test('legacy light and dark tokens meet the AA text and non-text contrast floors', async () => {
  const [dashboard, shell, assistant] = await Promise.all([
    file('css/dashboard.css'),
    file('css/institutional-shell.css'),
    file('ia.html'),
  ]);
  const dashboardDark = block(dashboard, ':root');
  const dashboardLight = block(dashboard, '[data-theme="light"]');
  const shellDark = block(shell, ':root');
  const shellLight = block(shell, '[data-theme="light"]');
  const assistantDark = block(assistant, 'html.muni-shell-v1[data-theme="dark"]');
  const assistantLight = block(assistant, 'html.muni-shell-v1[data-theme="light"]');

  for (const name of ['text-primary', 'text-secondary', 'text-muted']) {
    assert.ok(
      contrast(token(dashboardDark, name), token(dashboardDark, 'bg-card')) >= 4.5,
      `dark --${name} must meet WCAG AA`,
    );
    assert.ok(
      contrast(token(dashboardLight, name), token(dashboardLight, 'bg-card')) >= 4.5,
      `light --${name} must meet WCAG AA`,
    );
  }

  for (const name of ['muni-shell-text', 'muni-shell-muted', 'muni-shell-subtle']) {
    assert.ok(
      contrast(token(shellDark, name), token(shellDark, 'muni-shell-rail')) >= 4.5,
      `dark --${name} must meet WCAG AA`,
    );
  }

  assert.ok(
    contrast(token(shellDark, 'muni-shell-control-border'), token(shellDark, 'muni-shell-control')) >= 3,
    'dark control boundary must meet WCAG non-text contrast',
  );
  assert.ok(
    contrast(token(shellLight, 'muni-shell-control-border'), token(shellLight, 'muni-shell-control')) >= 3,
    'light control boundary must meet WCAG non-text contrast',
  );

  for (const assistantTheme of [assistantDark, assistantLight]) {
    for (const name of ['assistant-text', 'assistant-muted']) {
      assert.ok(
        contrast(token(assistantTheme, name), token(assistantTheme, 'assistant-panel-solid')) >= 4.5,
        `${name} must meet WCAG AA on the assistant panel`,
      );
    }
    assert.ok(
      contrast(token(assistantTheme, 'assistant-line'), token(assistantTheme, 'assistant-panel-solid')) >= 3,
      'assistant control boundaries must meet WCAG non-text contrast',
    );
  }
});

test('legacy operational copy has a 12px minimum on the dashboard, shell and GRH surfaces', async () => {
  const [dashboard, shell, rrhh, assistant] = await Promise.all([
    file('css/dashboard.css'),
    file('css/institutional-shell.css'),
    file('rrhh.html'),
    file('ia.html'),
  ]);

  assert.doesNotMatch(dashboard, /font-size:\s*(?:[0-9]|1[01])px/);
  assert.doesNotMatch(shell, /font(?:-size|:)[^;{}]*\b(?:[0-9]|1[01])px\b/);

  const rrhhWithoutDecorativeCheck = rrhh.replace(/\.rrhh-guardrail-list li::before\s*\{[^}]+\}/g, '');
  assert.doesNotMatch(rrhhWithoutDecorativeCheck, /font-size:\s*(?:[0-9]|1[01])px/);
  assert.doesNotMatch(assistant, /font-size:\s*(?:[0-9]|1[01])px/);
  assert.match(assistant, /<script src="js\/theme-switcher\.js"><\/script>[\s\S]*<script src="js\/nav\.js"><\/script>/);
  assert.match(assistant, /id="themeToggleBtn"[^>]+aria-label="Cambiar tema"/);
});

test('desktop and mobile navigation share canonical labels and React canary routes', async () => {
  const [navigation, bottomNavigation, executive, quality] = await Promise.all([
    file('js/nav.js'),
    file('js/bottom-nav.js'),
    file('frontend/src/executive/ExecutiveApp.tsx'),
    file('frontend/src/app/App.tsx'),
  ]);
  const catalog = navigation.match(/var NAV_ITEMS = \[[\s\S]*?\n\];/)?.[0] || '';

  for (const label of [
    'Panorama municipal',
    'Resumen ejecutivo GRH',
    'Estructura y ausencias',
    'Hacienda y nómina',
    'Gestión de personas',
    'Calidad de datos',
    'Asistente GRH',
    'Reportes',
  ]) {
    assert.ok(catalog.includes(`label:'${label}'`), `Missing canonical label: ${label}`);
  }

  assert.match(catalog, /href:'\/ejecutivo'/);
  assert.match(catalog, /href:'\/estructura'/);
  assert.match(catalog, /href:'\/calidad'/);
  assert.doesNotMatch(catalog, /(?:grh-ejecutivo|control)\.html/);
  assert.match(navigation, /window\.MuniNavigationCatalog\s*=\s*Object\.freeze/);
  assert.match(bottomNavigation, /var CATALOG = window\.MuniNavigationCatalog;/);
  assert.doesNotMatch(bottomNavigation, /^\s*'navigation\.[^']+':\s*\{/m);

  for (const reactNavigation of [executive, quality]) {
    assert.match(reactNavigation, /href: '\/ejecutivo', label: 'Resumen ejecutivo GRH'/);
    assert.match(reactNavigation, /href: '\/calidad', label: 'Calidad de datos'/);
    assert.doesNotMatch(reactNavigation, /grh-ejecutivo\.html/);
  }
});

test('legacy and React theme controls read and persist both compatible keys', async () => {
  const [legacyTheme, reactShell] = await Promise.all([
    file('js/theme-switcher.js'),
    file('frontend/src/components/AppShell.tsx'),
  ]);

  for (const source of [legacyTheme, reactShell]) {
    assert.match(source, /municontrol-color-theme:v1/);
    assert.match(source, /govtech_theme/);
    assert.match(source, /(?:localStorage|window\.localStorage)\.getItem/);
    assert.equal((source.match(/\.setItem\(/g) || []).length >= 2, true);
  }
  assert.ok(
    legacyTheme.indexOf('readStoredTheme(THEME_STORAGE_KEY)') < legacyTheme.indexOf('readStoredTheme(LEGACY_THEME_STORAGE_KEY)'),
    'legacy surfaces must prefer the canonical versioned theme when stored keys conflict',
  );
  assert.match(legacyTheme, /var next = current === 'dark' \? 'light' : 'dark'/);
});

test('retired RRHH aliases preserve the public contract but expose no invented surface', async () => {
  const retiredPages = ['informe-rrhh.html', 'rrhh-sync.html', 'organigrama.html'];
  const [publicContract, ...sources] = await Promise.all([
    file('build/public-web-contract.mjs'),
    ...retiredPages.map(file),
  ]);

  retiredPages.forEach((relativePath, index) => {
    const source = sources[index];
    assert.ok(publicContract.includes(`'${relativePath}'`), `${relativePath} must remain build-addressable`);
    assert.match(source, /http-equiv="refresh" content="0;url=\/rrhh\.html"/);
    assert.match(source, /data-surface-state="retired" data-retirement-target="rrhh"/);
    assert.match(source, /href="\/rrhh\.html">Abrir Gestión de personas/);
    assert.match(source, /vigente y verificable/);
    assert.doesNotMatch(source, /<script|fetch\(|\/api\//i);
  });
});
