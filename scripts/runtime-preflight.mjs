import process from 'node:process';
import { spawnSync } from 'node:child_process';

function fail(message) {
  console.error(`[RUNTIME-PREFLIGHT] ${message}`);
  process.exit(1);
}

const [nodeMajor, nodeMinor] = process.versions.node.split('.').map(Number);
if (!Number.isInteger(nodeMajor) || nodeMajor < 22 || nodeMajor >= 25 || (nodeMajor === 22 && nodeMinor < 12)) {
  fail(`Node ${process.versions.node} no está soportado; use >=22.12.0 <25 (baseline local .nvmrc).`);
}

const python = spawnSync('python', ['--version'], { encoding: 'utf8', windowsHide: true });
if (python.error || python.status !== 0) {
  fail('Python no está disponible; use Python >=3.10 (baseline local .python-version).');
}
const versionText = `${python.stdout || ''} ${python.stderr || ''}`.trim();
const match = versionText.match(/Python\s+(\d+)\.(\d+)\.(\d+)/i);
if (!match || Number(match[1]) < 3 || (Number(match[1]) === 3 && Number(match[2]) < 10)) {
  fail(`${versionText || 'Versión Python desconocida'} no está soportada; use Python >=3.10.`);
}

console.log(JSON.stringify({
  ok: true,
  node: process.versions.node,
  python: match.slice(1).join('.'),
  nodeBaseline: '24.15.0',
  pythonBaseline: '3.11.9',
}));
