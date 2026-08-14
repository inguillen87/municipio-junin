import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, lstatSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  assertClassifiedRootHtmlNames,
  GOVERNED_HTML_FILES,
  GOVERNED_LEGACY_HTML_FILES,
  GOVERNED_VITE_HTML_FILES,
  PUBLIC_DIRECTORIES,
  PUBLIC_LEGACY_HTML_FILES,
  PUBLIC_ROOT_FILES,
  VITE_ENTRY_HTML_FILES,
} from '../build/public-web-contract.mjs';

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const distRoot = path.join(repositoryRoot, 'dist');

function secretFreeEnvironment() {
  const blockedName = /(?:api[_-]?key|authorization|cookie|credential|database|direct_url|grh_|jwt|password|private[_-]?key|secret|token)/i;
  const environment = Object.fromEntries(
    Object.entries(process.env).filter(([name]) => !blockedName.test(name)),
  );
  environment.CI = '1';
  environment.NODE_ENV = 'test';
  return environment;
}

function commandOutput(result) {
  return [result.stdout, result.stderr].filter(Boolean).join('\n').trim();
}

function runNodeScript(relativeScript) {
  const result = spawnSync(process.execPath, [relativeScript], {
    cwd: repositoryRoot,
    env: secretFreeEnvironment(),
    encoding: 'utf8',
    windowsHide: true,
    maxBuffer: 4 * 1024 * 1024,
  });
  assert.ifError(result.error);
  assert.equal(
    result.status,
    0,
    `${relativeScript} debe finalizar correctamente.\n${commandOutput(result)}`,
  );
  return result;
}

function runRejectedNodeScript(relativeScript, argument) {
  const result = spawnSync(process.execPath, [relativeScript, argument], {
    cwd: repositoryRoot,
    env: secretFreeEnvironment(),
    encoding: 'utf8',
    windowsHide: true,
    maxBuffer: 4 * 1024 * 1024,
  });
  assert.ifError(result.error);
  assert.notEqual(result.status, 0, `${relativeScript} debe rechazar destinos configurables.`);
  return result;
}

function runFrontendBuild() {
  const npmCliCandidates = [
    process.env.npm_execpath,
    path.join(path.dirname(process.execPath), 'node_modules', 'npm', 'bin', 'npm-cli.js'),
    path.resolve(path.dirname(process.execPath), '..', 'lib', 'node_modules', 'npm', 'bin', 'npm-cli.js'),
  ].filter(candidate => typeof candidate === 'string');
  const npmCli = npmCliCandidates.find(candidate => existsSync(candidate));
  assert.ok(npmCli, 'No se encontro npm-cli.js para ejecutar el build sin shell.');

  const result = spawnSync(process.execPath, [npmCli, 'run', 'frontend:build'], {
    cwd: repositoryRoot,
    env: secretFreeEnvironment(),
    encoding: 'utf8',
    windowsHide: true,
    maxBuffer: 8 * 1024 * 1024,
  });
  assert.ifError(result.error);
  assert.equal(
    result.status,
    0,
    `npm run frontend:build debe funcionar sin secretos.\n${commandOutput(result)}`,
  );
  return result;
}

function relativeFileTree(directoryPath, prefix = '') {
  const metadata = lstatSync(directoryPath);
  assert.equal(metadata.isSymbolicLink(), false, `${directoryPath} no debe ser un enlace simbolico.`);
  assert.equal(metadata.isDirectory(), true, `${directoryPath} debe ser un directorio.`);

  const files = [];
  const entries = readdirSync(directoryPath, { withFileTypes: true })
    .sort((left, right) => left.name.localeCompare(right.name));
  for (const entry of entries) {
    const relativePath = prefix ? path.join(prefix, entry.name) : entry.name;
    const absolutePath = path.join(directoryPath, entry.name);
    if (entry.isDirectory()) {
      files.push(...relativeFileTree(absolutePath, relativePath));
      continue;
    }
    assert.equal(entry.isFile(), true, `${relativePath} debe ser un archivo regular.`);
    files.push(relativePath);
  }
  return files;
}

function assertSameBytes(sourcePath, artifactPath) {
  const source = readFileSync(sourcePath);
  const artifact = readFileSync(artifactPath);
  assert.equal(
    artifact.equals(source),
    true,
    `${path.relative(repositoryRoot, artifactPath)} debe ser byte-identical a su fuente.`,
  );
}

test('el artefacto web se ensambla, compila y verifica sin secretos', { timeout: 120_000 }, () => {
  mkdirSync(distRoot, { recursive: true });
  writeFileSync(path.join(distRoot, 'index.html'), 'stale index must be deleted');
  writeFileSync(path.join(distRoot, 'stale-private-config.json'), 'stale file must be deleted');

  const rejected = runRejectedNodeScript('build/assemble-dist.mjs', path.join(repositoryRoot, 'outside-dist'));
  assert.match(commandOutput(rejected), /no acepta un destino/i);
  assert.equal(readFileSync(path.join(distRoot, 'index.html'), 'utf8'), 'stale index must be deleted');

  runNodeScript('build/assemble-dist.mjs');

  assert.equal(lstatSync(distRoot).isDirectory(), true);
  assert.throws(() => lstatSync(path.join(distRoot, 'index.html')), { code: 'ENOENT' });
  assert.throws(() => lstatSync(path.join(distRoot, 'stale-private-config.json')), { code: 'ENOENT' });

  const actualRootHtml = readdirSync(repositoryRoot, { withFileTypes: true })
    .filter(entry => entry.isFile() && entry.name.toLowerCase().endsWith('.html'))
    .map(entry => entry.name)
    .sort((left, right) => left.localeCompare(right));
  const rootHtml = [...PUBLIC_LEGACY_HTML_FILES];
  assert.deepEqual(actualRootHtml, [...PUBLIC_LEGACY_HTML_FILES].sort((left, right) => left.localeCompare(right)));

  for (const fileName of rootHtml) {
    assertSameBytes(path.join(repositoryRoot, fileName), path.join(distRoot, fileName));
  }
  for (const fileName of GOVERNED_LEGACY_HTML_FILES) {
    assert.equal(rootHtml.includes(fileName), true, `Falta la superficie gobernada ${fileName}.`);
    assertSameBytes(path.join(repositoryRoot, fileName), path.join(distRoot, fileName));
  }
  for (const fileName of PUBLIC_ROOT_FILES) {
    assertSameBytes(path.join(repositoryRoot, fileName), path.join(distRoot, fileName));
  }

  for (const directoryName of PUBLIC_DIRECTORIES) {
    const sourceDirectory = path.join(repositoryRoot, directoryName);
    const artifactDirectory = path.join(distRoot, directoryName);
    const sourceFiles = relativeFileTree(sourceDirectory);
    const artifactFiles = relativeFileTree(artifactDirectory);
    assert.deepEqual(artifactFiles, sourceFiles, `dist/${directoryName} debe conservar el arbol publico.`);
    for (const relativeFile of sourceFiles) {
      assertSameBytes(
        path.join(sourceDirectory, relativeFile),
        path.join(artifactDirectory, relativeFile),
      );
    }
  }

  runFrontendBuild();
  runNodeScript('build/verify-dist.mjs');

  assert.throws(() => lstatSync(path.join(distRoot, 'index.html')), { code: 'ENOENT' });
  for (const fileName of VITE_ENTRY_HTML_FILES) {
    assert.equal(lstatSync(path.join(distRoot, fileName)).isFile(), true);
  }
  assert.deepEqual(GOVERNED_HTML_FILES, [...GOVERNED_LEGACY_HTML_FILES, ...GOVERNED_VITE_HTML_FILES]);

  const manifest = JSON.parse(readFileSync(path.join(distRoot, '.vite', 'manifest.json'), 'utf8'));
  const manifestEntries = Object.entries(manifest)
    .filter(([, entry]) => entry?.isEntry === true);
  assert.deepEqual(
    manifestEntries
      .map(([key, entry]) => typeof entry.src === 'string' ? entry.src : key)
      .sort((left, right) => left.localeCompare(right)),
    [...VITE_ENTRY_HTML_FILES].sort((left, right) => left.localeCompare(right)),
  );
  assert.equal(
    new Set(manifestEntries.map(([, entry]) => entry.file)).size,
    VITE_ENTRY_HTML_FILES.length,
    'Cada entrada MPA debe tener un asset JavaScript propio.',
  );
  for (const [key, entry] of manifestEntries) {
    const sourceName = typeof entry.src === 'string' ? entry.src : key;
    const entryName = path.posix.basename(sourceName, '.html');
    assert.match(
      entry.file,
      new RegExp(`^assets/${entryName}-[A-Za-z0-9_-]{6,}\\.js$`, 'u'),
      `${sourceName} debe conservar su nombre de entrada antes del hash.`,
    );
  }

  const generatedFiles = Object.values(manifest)
    .flatMap(entry => [entry?.file, ...(entry?.css ?? []), ...(entry?.assets ?? [])])
    .filter(fileName => typeof fileName === 'string');
  assert.equal(
    generatedFiles.some(fileName => /(?:^|\/)[^/]+-[A-Za-z0-9_-]{6,}\.[A-Za-z0-9]+$/u.test(fileName)),
    true,
    'El manifest debe señalar al menos un asset con hash de contenido.',
  );

  for (const privatePath of [
    'api',
    'shared',
    'prisma',
    'docs',
    'tests',
    'scripts',
    'build',
    'config',
    '.env',
    'package.json',
    'package-lock.json',
  ]) {
    assert.throws(
      () => lstatSync(path.join(distRoot, privatePath)),
      { code: 'ENOENT' },
      `dist/${privatePath} no debe publicarse.`,
    );
  }
});

test('el contrato nominal rechaza HTML raiz no clasificado e index.html sin crear archivos', () => {
  assert.equal(PUBLIC_LEGACY_HTML_FILES.length, 44);
  assert.deepEqual(GOVERNED_LEGACY_HTML_FILES, [
    'login.html',
    'dashboard.html',
    'inicio.html',
    'areas-grh.html',
    'decisiones-grh.html',
    'movimientos-grh.html',
    'roles.html',
    'manuales.html',
  ]);
  assert.deepEqual(GOVERNED_VITE_HTML_FILES, ['calidad.html', 'ejecutivo.html', 'estructura.html', 'trayectoria.html', 'territorio.html']);
  assert.deepEqual(VITE_ENTRY_HTML_FILES, GOVERNED_VITE_HTML_FILES);
  assert.equal(GOVERNED_HTML_FILES.length, 13);
  assert.deepEqual(
    assertClassifiedRootHtmlNames([...PUBLIC_LEGACY_HTML_FILES]),
    PUBLIC_LEGACY_HTML_FILES,
  );
  assert.throws(
    () => assertClassifiedRootHtmlNames([...PUBLIC_LEGACY_HTML_FILES, 'diagnostico-temporal.html']),
    /HTML raiz no clasificado.*diagnostico-temporal\.html/i,
  );
  assert.throws(
    () => assertClassifiedRootHtmlNames([...PUBLIC_LEGACY_HTML_FILES, 'index.html']),
    /index\.html esta prohibido/i,
  );
});
