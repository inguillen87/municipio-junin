import { readdirSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const suite = process.argv[2] || 'root';
const suites = Object.freeze({
  root: {
    directory: path.join(repositoryRoot, 'tests'),
    include: file => file.endsWith('.mjs'),
  },
  backend: {
    directory: path.join(repositoryRoot, 'backend', 'tests'),
    include: file => file.endsWith('.test.js'),
  },
});

const selected = suites[suite];
if (!selected) {
  console.error(`[TEST-SUITE] Suite no soportada: ${suite}. Use root o backend.`);
  process.exit(2);
}

const files = readdirSync(selected.directory, { withFileTypes: true })
  .filter(entry => entry.isFile() && selected.include(entry.name))
  .map(entry => path.join(selected.directory, entry.name))
  .sort((left, right) => left.localeCompare(right));

if (files.length === 0) {
  console.error(`[TEST-SUITE] No se encontraron pruebas para ${suite}.`);
  process.exit(2);
}

// Several root files launch isolated Chromium/Vite harnesses. Three workers keep
// useful parallelism without starving the React guide and territorial readiness
// deadlines when another browser-heavy suite is added to the matrix.
const concurrency = 3;
const result = spawnSync(process.execPath, ['--test', `--test-concurrency=${concurrency}`, ...files], {
  cwd: repositoryRoot,
  env: { ...process.env, PYTHONDONTWRITEBYTECODE: '1' },
  stdio: 'inherit',
});

if (result.error) {
  console.error(`[TEST-SUITE] No se pudo ejecutar ${suite}: ${result.error.message}`);
  process.exit(1);
}

process.exit(result.status ?? 1);
