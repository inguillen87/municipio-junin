import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import {
  canonicalManifestText,
  deriveBaselineManifest,
  readCanonicalLfText,
} from '../shared/prisma-migration-contract.mjs';

const modulePath = fileURLToPath(import.meta.url);
const defaultRepoRoot = path.resolve(path.dirname(modulePath), '..');

export function inspectBaselineManifestFile({ repoRoot = defaultRepoRoot } = {}) {
  const derived = deriveBaselineManifest({ repoRoot });
  if (!derived.ok) return { ...derived, mode: 'check' };
  const errors = [];
  const manifestPath = path.join(repoRoot, 'prisma', 'migrations', 'baseline-manifest.json');
  const actual = readCanonicalLfText(manifestPath, errors, 'BASELINE_MANIFEST_MISSING');
  const expected = canonicalManifestText(derived.manifest);
  if (actual !== null && actual !== expected) {
    errors.push({
      code: 'BASELINE_MANIFEST_MISMATCH',
      message: 'baseline-manifest.json no coincide byte a byte con el contrato derivado.',
    });
  }
  return {
    ...derived,
    mode: 'check',
    ok: errors.length === 0,
    errors,
  };
}

function cliMode(argv) {
  const stdout = argv.includes('--stdout');
  const check = argv.includes('--check');
  if (stdout === check || argv.some(argument => !['--stdout', '--check'].includes(argument))) return null;
  return stdout ? 'stdout' : 'check';
}

if (process.argv[1] && path.resolve(process.argv[1]) === modulePath) {
  const mode = cliMode(process.argv.slice(2));
  if (!mode) {
    console.error('[BASELINE_MANIFEST:MODE_REQUIRED] Use exactamente --stdout o --check.');
    process.exitCode = 2;
  } else if (mode === 'stdout') {
    const result = deriveBaselineManifest({ repoRoot: defaultRepoRoot });
    if (!result.ok) {
      for (const error of result.errors) console.error(`[BASELINE_MANIFEST:${error.code}] ${error.message}`);
      process.exitCode = 1;
    } else {
      process.stdout.write(canonicalManifestText(result.manifest));
    }
  } else {
    const result = inspectBaselineManifestFile({ repoRoot: defaultRepoRoot });
    if (!result.ok) {
      for (const error of result.errors) console.error(`[BASELINE_MANIFEST:${error.code}] ${error.message}`);
      process.exitCode = 1;
    } else {
      console.log(`[BASELINE_MANIFEST] ${result.migrations.length} migraci\u00f3n(es) y toolchain Prisma ${result.toolchain.prismaVersion} verificados.`);
    }
  }
}
