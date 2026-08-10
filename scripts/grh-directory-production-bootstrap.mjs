#!/usr/bin/env node

import path from 'node:path';
import process from 'node:process';
import { pathToFileURL } from 'node:url';

import {
  applyPreparedBootstrap,
  cleanupVerifiedBootstrap,
  finalizeProductionBootstrap,
  prepareBootstrapBundle,
  resolveAmbiguousBootstrap,
  safeCliResult,
  verifyAppliedBootstrap,
  verifyProductionBootstrap,
} from './grh-directory-production-bootstrap-lib.mjs';

const CONFIRMATION = 'municipio-junin-production-one-shot';

function argument(args, name) {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : null;
}

function usage() {
  return [
    'Uso:',
    '  node scripts/grh-directory-production-bootstrap.mjs prepare --mode encrypted_snapshot --worktree <path> --artifact <json> --state-dir <path>',
    '  node scripts/grh-directory-production-bootstrap.mjs apply --state <state.json> --confirm-production-one-shot ' + CONFIRMATION,
    '  node scripts/grh-directory-production-bootstrap.mjs resolve --state <state.json> --confirm-production-one-shot ' + CONFIRMATION,
    '  node scripts/grh-directory-production-bootstrap.mjs verify --state <state.json>',
    '  node scripts/grh-directory-production-bootstrap.mjs cleanup --state <state.json> --confirm-production-one-shot ' + CONFIRMATION,
    '  node scripts/grh-directory-production-bootstrap.mjs verify-production --state <state.json>',
    '  node scripts/grh-directory-production-bootstrap.mjs finalize --state <state.json>',
    '',
    'Apply, resolve y verify usan `vercel curl` con bypass automatico de Deployment Protection.',
    'El modo recomendado `encrypted_snapshot` publica un snapshot AES-256-GCM sin DDL; `ddl` queda reservado para una credencial de release.',
    'Resolve acepta apply_started o apply_ambiguous: 201 pasa a applied; 410 exige verify sin duplicar.',
    'El comando apply usa `vercel deploy --prod --skip-domain`; nunca promueve ni mueve el alias público.',
    'El worktree debe ser detached del SHA limpio de master; el comando lo vincula al proyecto Vercel exacto.',
    'Verify-production exige un deployment Production nuevo, READY y del Git SHA pinneado antes de repetir los cuatro smokes.',
    'Finalize sella el estado verificado y conserva credencial y key local ACL-protegida.',
    'Los secretos, la credencial y los datos nominales no se imprimen.',
  ].join('\n');
}

function requireConfirmation(args) {
  if (argument(args, '--confirm-production-one-shot') !== CONFIRMATION) {
    const error = new Error('confirmation required');
    error.code = 'BOOTSTRAP_PRODUCTION_CONFIRMATION_REQUIRED';
    throw error;
  }
}

export async function runBootstrapCli(args = process.argv.slice(2)) {
  const command = args[0];
  if (!command || command === '--help' || command === '-h' || command === 'help') {
    return { help: usage() };
  }
  if (command === 'prepare') {
    return prepareBootstrapBundle({
      mode: argument(args, '--mode'),
      worktreePath: argument(args, '--worktree'),
      artifactPath: argument(args, '--artifact'),
      stateDirectory: argument(args, '--state-dir'),
    });
  }
  const statePath = argument(args, '--state');
  if (command === 'apply') {
    requireConfirmation(args);
    return applyPreparedBootstrap({ statePath });
  }
  if (command === 'resolve') {
    requireConfirmation(args);
    return resolveAmbiguousBootstrap({ statePath });
  }
  if (command === 'verify') {
    return verifyAppliedBootstrap({ statePath });
  }
  if (command === 'cleanup') {
    requireConfirmation(args);
    return cleanupVerifiedBootstrap({ statePath });
  }
  if (command === 'verify-production') {
    return verifyProductionBootstrap({ statePath });
  }
  if (command === 'finalize') {
    return finalizeProductionBootstrap({ statePath });
  }
  const error = new Error('unknown command');
  error.code = 'BOOTSTRAP_COMMAND_UNKNOWN';
  throw error;
}

async function main() {
  try {
    const result = await runBootstrapCli();
    if (result?.help) {
      console.log(result.help);
      return;
    }
    console.log(JSON.stringify(safeCliResult(result), null, 2));
  } catch (error) {
    const pgCode = typeof error?.pgCode === 'string' && /^[0-9A-Z]{5}$/.test(error.pgCode)
      ? ' pgCode=' + error.pgCode
      : '';
    console.error('[GRH-BOOTSTRAP] ' + String(error?.code || 'BOOTSTRAP_FAILED') + pgCode);
    process.exitCode = 1;
  }
}

const invoked = process.argv[1]
  ? pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url
  : false;
if (invoked) await main();

export { usage };
