import { copyFile, lstat, mkdir, readdir, rm } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath, pathToFileURL } from 'node:url';

import {
  assertClassifiedRootHtmlNames,
  PUBLIC_DIRECTORIES,
  PUBLIC_LEGACY_HTML_FILES,
  PUBLIC_ROOT_FILES,
} from './public-web-contract.mjs';

const scriptPath = fileURLToPath(import.meta.url);

export const repositoryRoot = path.resolve(path.dirname(scriptPath), '..');
export const distRoot = path.resolve(repositoryRoot, 'dist');

function displayPath(filePath) {
  const relative = path.relative(repositoryRoot, filePath);
  return relative && !relative.startsWith('..') ? relative : filePath;
}

async function assertRegularFile(filePath) {
  let metadata;

  try {
    metadata = await lstat(filePath);
  } catch (error) {
    if (error?.code === 'ENOENT') {
      throw new Error(`Falta el archivo publico requerido: ${displayPath(filePath)}.`);
    }
    throw error;
  }

  if (!metadata.isFile() || metadata.isSymbolicLink()) {
    throw new Error(`La fuente publica debe ser un archivo regular: ${displayPath(filePath)}.`);
  }
}

async function assertRegularDirectory(directoryPath) {
  let metadata;

  try {
    metadata = await lstat(directoryPath);
  } catch (error) {
    if (error?.code === 'ENOENT') {
      throw new Error(`Falta el directorio publico requerido: ${displayPath(directoryPath)}.`);
    }
    throw error;
  }

  if (!metadata.isDirectory() || metadata.isSymbolicLink()) {
    throw new Error(`La fuente publica debe ser un directorio regular: ${displayPath(directoryPath)}.`);
  }
}

export async function assertSafeDistTarget() {
  if (!path.isAbsolute(repositoryRoot) || !path.isAbsolute(distRoot)) {
    throw new Error('El ensamblado requiere rutas absolutas para el repositorio y dist.');
  }

  const relativeTarget = path.relative(repositoryRoot, distRoot);
  if (
    relativeTarget !== 'dist'
    || path.dirname(distRoot) !== repositoryRoot
    || path.basename(distRoot) !== 'dist'
    || distRoot === repositoryRoot
  ) {
    throw new Error(`Destino dist inseguro; se rechazo borrar ${distRoot}.`);
  }

  try {
    const metadata = await lstat(distRoot);
    if (metadata.isSymbolicLink()) {
      throw new Error('El destino repo/dist no puede ser un enlace simbolico ni una junction.');
    }
  } catch (error) {
    if (error?.code !== 'ENOENT') {
      throw error;
    }
  }
}

async function copyDirectoryByteForByte(sourceDirectory, destinationDirectory) {
  await assertRegularDirectory(sourceDirectory);
  await mkdir(destinationDirectory, { recursive: true });

  const entries = await readdir(sourceDirectory, { withFileTypes: true });
  entries.sort((left, right) => left.name.localeCompare(right.name));

  let copiedFiles = 0;
  for (const entry of entries) {
    const sourcePath = path.join(sourceDirectory, entry.name);
    const destinationPath = path.join(destinationDirectory, entry.name);

    if (entry.isDirectory()) {
      copiedFiles += await copyDirectoryByteForByte(sourcePath, destinationPath);
      continue;
    }

    if (!entry.isFile()) {
      throw new Error(`No se copian enlaces ni entradas especiales: ${displayPath(sourcePath)}.`);
    }

    await copyFile(sourcePath, destinationPath);
    copiedFiles += 1;
  }

  return copiedFiles;
}

export async function assembleLegacyDist() {
  await assertSafeDistTarget();
  await rm(distRoot, { recursive: true, force: true });
  await mkdir(distRoot, { recursive: false });

  const rootEntries = await readdir(repositoryRoot, { withFileTypes: true });
  assertClassifiedRootHtmlNames(rootEntries.map(entry => entry.name));
  const rootEntriesByName = new Map(rootEntries.map(entry => [entry.name, entry]));

  let htmlFiles = 0;
  for (const fileName of PUBLIC_LEGACY_HTML_FILES) {
    const entry = rootEntriesByName.get(fileName);
    if (!entry?.isFile()) {
      throw new Error(`El HTML publico debe ser un archivo regular: ${fileName}.`);
    }

    await copyFile(path.join(repositoryRoot, fileName), path.join(distRoot, fileName));
    htmlFiles += 1;
  }

  let assetFiles = 0;
  for (const directoryName of PUBLIC_DIRECTORIES) {
    assetFiles += await copyDirectoryByteForByte(
      path.join(repositoryRoot, directoryName),
      path.join(distRoot, directoryName),
    );
  }

  for (const fileName of PUBLIC_ROOT_FILES) {
    const sourcePath = path.join(repositoryRoot, fileName);
    await assertRegularFile(sourcePath);
    await copyFile(sourcePath, path.join(distRoot, fileName));
  }

  return Object.freeze({
    distRoot,
    htmlFiles,
    assetFiles,
    rootFiles: PUBLIC_ROOT_FILES.length,
  });
}

async function main() {
  if (process.argv.length > 2) {
    throw new Error('assemble-dist no acepta un destino: siempre reconstruye exclusivamente repo/dist.');
  }

  const result = await assembleLegacyDist();
  console.log(
    `[WEB-DIST] Legacy preparado en dist: ${result.htmlFiles} HTML, `
      + `${result.assetFiles} assets y ${result.rootFiles} archivos raiz.`,
  );
}

const isDirectExecution = process.argv[1]
  && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url;

if (isDirectExecution) {
  main().catch(error => {
    console.error(`[WEB-DIST] Ensamblado rechazado: ${error.message}`);
    process.exitCode = 1;
  });
}
