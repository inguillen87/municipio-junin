import { createHash } from 'node:crypto';
import { lstat, readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath, pathToFileURL } from 'node:url';

import {
  assertClassifiedRootHtmlNames,
  GOVERNED_HTML_FILES,
  GOVERNED_LEGACY_HTML_FILES,
  GOVERNED_VITE_HTML_FILES,
  PUBLIC_DIRECTORIES,
  PUBLIC_ROOT_FILES,
  VITE_ENTRY_HTML_FILES,
} from './public-web-contract.mjs';

const scriptPath = fileURLToPath(import.meta.url);
const repositoryRoot = path.resolve(path.dirname(scriptPath), '..');
const distRoot = path.resolve(repositoryRoot, 'dist');

const privateDirectoryNames = new Set([
  '.git',
  '.vercel',
  'api',
  'backend',
  'build',
  'config',
  'database',
  'docs',
  'frontend',
  'infra',
  'migrations',
  'node_modules',
  'prisma',
  'scripts',
  'shared',
  'tenants',
  'tests',
]);
const privateFileNames = new Set([
  'agents.md',
  'package.json',
  'package-lock.json',
  'npm-shrinkwrap.json',
  'vercel.json',
  'vite.config.js',
  'vite.config.mjs',
  'vite.config.ts',
]);
const localOrigin = 'https://web-dist.invalid';

function toPosix(filePath) {
  return filePath.split(path.sep).join('/');
}

function checksum(buffer) {
  return createHash('sha256').update(buffer).digest('hex');
}

function assertInsideDist(candidatePath, label) {
  const relative = path.relative(distRoot, candidatePath);
  if (!relative || relative === '.') {
    return;
  }
  if (relative.startsWith('..') || path.isAbsolute(relative)) {
    throw new Error(`${label} escapa de repo/dist: ${candidatePath}.`);
  }
}

async function statOrNull(filePath) {
  try {
    return await lstat(filePath);
  } catch (error) {
    if (error?.code === 'ENOENT') {
      return null;
    }
    throw error;
  }
}

async function assertRegularFile(filePath, label) {
  const metadata = await statOrNull(filePath);
  if (!metadata?.isFile() || metadata.isSymbolicLink()) {
    throw new Error(`${label} no existe como archivo regular: ${toPosix(path.relative(repositoryRoot, filePath))}.`);
  }
}

async function collectTree(directoryPath, relativePrefix = '') {
  const metadata = await statOrNull(directoryPath);
  if (!metadata?.isDirectory() || metadata.isSymbolicLink()) {
    throw new Error(`Directorio requerido ausente o inseguro: ${toPosix(path.relative(repositoryRoot, directoryPath))}.`);
  }

  const entries = await readdir(directoryPath, { withFileTypes: true });
  entries.sort((left, right) => left.name.localeCompare(right.name));

  const files = [];
  const directories = [];
  for (const entry of entries) {
    const relativePath = relativePrefix ? path.join(relativePrefix, entry.name) : entry.name;
    const absolutePath = path.join(directoryPath, entry.name);

    if (entry.isDirectory()) {
      directories.push(relativePath);
      const nested = await collectTree(absolutePath, relativePath);
      directories.push(...nested.directories);
      files.push(...nested.files);
      continue;
    }

    if (!entry.isFile()) {
      throw new Error(`El artefacto no admite enlaces ni entradas especiales: ${toPosix(relativePath)}.`);
    }
    files.push(relativePath);
  }

  return { files, directories };
}

async function assertByteIdentical(sourcePath, artifactPath, label) {
  await assertRegularFile(sourcePath, `${label} (fuente)`);
  await assertRegularFile(artifactPath, `${label} (dist)`);

  const [source, artifact] = await Promise.all([readFile(sourcePath), readFile(artifactPath)]);
  if (!source.equals(artifact)) {
    throw new Error(
      `${label} fue transformado (fuente ${checksum(source)}, dist ${checksum(artifact)}).`,
    );
  }
}

async function rootHtmlNames() {
  const entries = await readdir(repositoryRoot, { withFileTypes: true });
  return assertClassifiedRootHtmlNames(entries.map(entry => entry.name));
}

async function verifyLegacyCopies(htmlNames) {
  for (const fileName of GOVERNED_LEGACY_HTML_FILES) {
    if (!htmlNames.includes(fileName)) {
      throw new Error(`La superficie gobernada no existe en la fuente: ${fileName}.`);
    }
    await assertByteIdentical(
      path.join(repositoryRoot, fileName),
      path.join(distRoot, fileName),
      `HTML gobernado ${fileName}`,
    );
  }

  for (const fileName of htmlNames) {
    await assertByteIdentical(
      path.join(repositoryRoot, fileName),
      path.join(distRoot, fileName),
      `HTML legacy ${fileName}`,
    );
  }

  for (const fileName of PUBLIC_ROOT_FILES) {
    await assertByteIdentical(
      path.join(repositoryRoot, fileName),
      path.join(distRoot, fileName),
      `Archivo publico ${fileName}`,
    );
  }

  for (const directoryName of PUBLIC_DIRECTORIES) {
    const sourceDirectory = path.join(repositoryRoot, directoryName);
    const artifactDirectory = path.join(distRoot, directoryName);
    const [sourceTree, artifactTree] = await Promise.all([
      collectTree(sourceDirectory),
      collectTree(artifactDirectory),
    ]);

    const sourceFiles = sourceTree.files.map(toPosix);
    const artifactFiles = artifactTree.files.map(toPosix);
    if (JSON.stringify(sourceFiles) !== JSON.stringify(artifactFiles)) {
      throw new Error(`El arbol dist/${directoryName} no coincide con la fuente publica.`);
    }

    for (const relativeFile of sourceTree.files) {
      await assertByteIdentical(
        path.join(sourceDirectory, relativeFile),
        path.join(artifactDirectory, relativeFile),
        `Asset legacy ${directoryName}/${toPosix(relativeFile)}`,
      );
    }
  }
}

async function verifyArtifactBoundary(htmlNames) {
  if (await statOrNull(path.join(distRoot, 'index.html'))) {
    throw new Error('dist/index.html esta prohibido: la raiz publica se gobierna por rewrite hacia /login.');
  }

  const tree = await collectTree(distRoot);
  for (const relativePath of [...tree.directories, ...tree.files]) {
    const segments = toPosix(relativePath).toLowerCase().split('/');
    const fileName = segments.at(-1);
    if (segments.some(segment => privateDirectoryNames.has(segment))) {
      throw new Error(`El artefacto contiene un directorio privado: ${toPosix(relativePath)}.`);
    }
    if (
      privateFileNames.has(fileName)
      || /^\.env(?:\.|$)/i.test(fileName)
      || /^tsconfig(?:\..+)?\.json$/i.test(fileName)
    ) {
      throw new Error(`El artefacto contiene configuracion privada: ${toPosix(relativePath)}.`);
    }
  }

  const allowedTopLevel = new Set([
    ...htmlNames.map(name => name.toLowerCase()),
    ...PUBLIC_DIRECTORIES,
    ...PUBLIC_ROOT_FILES.map(name => name.toLowerCase()),
    ...VITE_ENTRY_HTML_FILES.map(name => name.toLowerCase()),
    'assets',
    '.vite',
  ]);
  const topLevelEntries = await readdir(distRoot, { withFileTypes: true });
  const unexpected = topLevelEntries
    .map(entry => entry.name)
    .filter(name => !allowedTopLevel.has(name.toLowerCase()))
    .sort((left, right) => left.localeCompare(right));
  if (unexpected.length > 0) {
    throw new Error(`El artefacto contiene entradas fuera del allowlist: ${unexpected.join(', ')}.`);
  }
}

function htmlWithExecutableBodiesRemoved(html) {
  return html
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<script\b([^>]*)>[\s\S]*?<\/script\s*>/gi, '<script$1></script>')
    .replace(/<style\b([^>]*)>[\s\S]*?<\/style\s*>/gi, '<style$1></style>');
}

function extractLocalReferences(html, relativeHtmlPath) {
  const sanitized = htmlWithExecutableBodiesRemoved(html);
  const tagPattern = /<[^>]+>/g;
  const attributePattern = /(?<![\w-])(?:src|href)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+))/gi;
  const references = [];

  for (const tagMatch of sanitized.matchAll(tagPattern)) {
    for (const match of tagMatch[0].matchAll(attributePattern)) {
      const value = (match[1] ?? match[2] ?? match[3] ?? '').trim();
      if (!value || value.startsWith('#')) {
        continue;
      }

      let parsed;
      try {
        const baseUrl = new URL(`/${toPosix(relativeHtmlPath)}`, localOrigin);
        parsed = new URL(value.replaceAll('&amp;', '&'), baseUrl);
      } catch {
        throw new Error(`${relativeHtmlPath} contiene una referencia src/href invalida: ${value}.`);
      }

      if (!['http:', 'https:'].includes(parsed.protocol) || parsed.origin !== localOrigin) {
        continue;
      }
      if (parsed.pathname === '/api' || parsed.pathname.startsWith('/api/')) {
        continue;
      }

      references.push({ value, pathname: parsed.pathname });
    }
  }

  return references;
}

async function referenceExists(pathname) {
  let decodedPath;
  try {
    decodedPath = decodeURIComponent(pathname);
  } catch {
    return false;
  }

  const normalizedPath = decodedPath.replaceAll('\\', '/').replace(/^\/+/, '');
  const exactCandidate = path.resolve(distRoot, ...normalizedPath.split('/'));
  assertInsideDist(exactCandidate, `Referencia /${normalizedPath}`);

  const candidates = [exactCandidate];
  if (!path.posix.extname(normalizedPath) && !normalizedPath.endsWith('/')) {
    candidates.push(`${exactCandidate}.html`);
  }

  for (const candidate of candidates) {
    const metadata = await statOrNull(candidate);
    if (metadata?.isFile() && !metadata.isSymbolicLink()) {
      return true;
    }
  }
  return false;
}

async function verifyLocalReferences() {
  const tree = await collectTree(distRoot);
  const htmlFiles = tree.files
    .filter(relativePath => relativePath.toLowerCase().endsWith('.html'))
    .sort((left, right) => left.localeCompare(right));
  const missing = [];

  for (const relativeHtmlPath of htmlFiles) {
    const html = await readFile(path.join(distRoot, relativeHtmlPath), 'utf8');
    const references = extractLocalReferences(html, relativeHtmlPath);
    for (const reference of references) {
      if (!(await referenceExists(reference.pathname))) {
        missing.push(`${toPosix(relativeHtmlPath)} -> ${reference.value}`);
      }
    }
  }

  if (missing.length > 0) {
    throw new Error(`Referencias locales sin artefacto:\n- ${missing.join('\n- ')}`);
  }
}

function referencedManifestFiles(manifest) {
  const files = new Set();
  for (const entry of Object.values(manifest)) {
    if (!entry || typeof entry !== 'object') {
      continue;
    }
    if (typeof entry.file === 'string') {
      files.add(entry.file);
    }
    for (const collectionName of ['css', 'assets']) {
      if (Array.isArray(entry[collectionName])) {
        for (const fileName of entry[collectionName]) {
          if (typeof fileName === 'string') {
            files.add(fileName);
          }
        }
      }
    }
  }
  return files;
}

async function verifyViteOutput() {
  for (const fileName of VITE_ENTRY_HTML_FILES) {
    await assertRegularFile(path.join(distRoot, fileName), `Entrada React ${fileName}`);
  }
  if (JSON.stringify(GOVERNED_VITE_HTML_FILES) !== JSON.stringify(VITE_ENTRY_HTML_FILES)) {
    throw new Error('Toda superficie Vite gobernada debe ser una entrada MPA exacta.');
  }

  const manifestPath = path.join(distRoot, '.vite', 'manifest.json');
  await assertRegularFile(manifestPath, 'Manifest de Vite');

  let manifest;
  try {
    manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
  } catch (error) {
    throw new Error(`El manifest de Vite no es JSON valido: ${error.message}`);
  }

  if (!manifest || typeof manifest !== 'object' || Array.isArray(manifest)) {
    throw new Error('El manifest de Vite debe ser un objeto.');
  }

  const manifestEntries = Object.entries(manifest)
    .filter(([, entry]) => entry?.isEntry === true);
  const manifestEntrySources = manifestEntries
    .map(([key, entry]) => typeof entry.src === 'string' ? entry.src : key)
    .sort((left, right) => left.localeCompare(right));
  const expectedEntrySources = [...VITE_ENTRY_HTML_FILES]
    .sort((left, right) => left.localeCompare(right));
  if (JSON.stringify(manifestEntrySources) !== JSON.stringify(expectedEntrySources)) {
    throw new Error(
      'El manifest de Vite debe declarar exactamente las entradas web '
        + `${expectedEntrySources.join(', ')}; recibidas: ${manifestEntrySources.join(', ') || 'ninguna'}.`,
    );
  }

  const entryOutputFiles = new Set();
  for (const [key, entry] of manifestEntries) {
    if (typeof entry.file !== 'string') {
      throw new Error(`La entrada Vite ${key} no declara su asset JavaScript.`);
    }
    if (entryOutputFiles.has(entry.file)) {
      throw new Error(`Dos entradas Vite comparten el mismo asset de entrada: ${entry.file}.`);
    }
    entryOutputFiles.add(entry.file);

    const sourceName = typeof entry.src === 'string' ? entry.src : key;
    const entryName = path.posix.basename(sourceName, '.html');
    if (!/^[a-z0-9-]+$/u.test(entryName)) {
      throw new Error(`La entrada Vite usa un nombre no canonico: ${sourceName}.`);
    }
    const normalizedOutput = entry.file.replaceAll('\\', '/');
    const expectedPattern = new RegExp(
      `^assets/${entryName}-[A-Za-z0-9_-]{6,}\\.js$`,
      'u',
    );
    if (!expectedPattern.test(normalizedOutput)) {
      throw new Error(`La entrada ${sourceName} no usa el nombre gobernado assets/${entryName}-[hash].js.`);
    }
  }

  const outputFiles = referencedManifestFiles(manifest);
  if (outputFiles.size === 0) {
    throw new Error('El manifest de Vite no referencia assets generados.');
  }

  let hasHashedAsset = false;
  for (const relativeFile of outputFiles) {
    const normalized = relativeFile.replaceAll('\\', '/').replace(/^\/+/, '');
    const outputPath = path.resolve(distRoot, ...normalized.split('/'));
    assertInsideDist(outputPath, `Asset Vite ${relativeFile}`);
    await assertRegularFile(outputPath, `Asset Vite ${relativeFile}`);

    if (/(?:^|\/)[^/]+-[A-Za-z0-9_-]{6,}\.[A-Za-z0-9]+$/u.test(normalized)) {
      hasHashedAsset = true;
    }
  }

  if (!hasHashedAsset) {
    throw new Error('Vite no produjo ningun asset con hash de contenido.');
  }
}

export async function verifyWebDist() {
  if (!path.isAbsolute(repositoryRoot) || !path.isAbsolute(distRoot)) {
    throw new Error('La verificacion requiere rutas absolutas.');
  }
  if (path.relative(repositoryRoot, distRoot) !== 'dist' || path.dirname(distRoot) !== repositoryRoot) {
    throw new Error(`Destino dist inesperado: ${distRoot}.`);
  }

  const htmlNames = await rootHtmlNames();
  await verifyLegacyCopies(htmlNames);
  await verifyArtifactBoundary(htmlNames);
  await verifyViteOutput();
  await verifyLocalReferences();

  return Object.freeze({
    htmlFiles: htmlNames.length + VITE_ENTRY_HTML_FILES.length,
    governedHtml: GOVERNED_HTML_FILES.length,
  });
}

async function main() {
  if (process.argv.length > 2) {
    throw new Error('verify-dist no acepta rutas: verifica exclusivamente repo/dist.');
  }
  const result = await verifyWebDist();
  console.log(
    `[WEB-DIST] Verificado: ${result.htmlFiles} HTML, `
      + `${result.governedHtml} superficies gobernadas y assets Vite con hash.`,
  );
}

const isDirectExecution = process.argv[1]
  && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url;

if (isDirectExecution) {
  main().catch(error => {
    console.error(`[WEB-DIST] Verificacion fallida: ${error.message}`);
    process.exitCode = 1;
  });
}
