#!/usr/bin/env node

import path from 'node:path';
import process from 'node:process';
import { pathToFileURL } from 'node:url';

import {
  applyPreparedBootstrap,
  cleanupVerifiedBootstrap,
  prepareBootstrapBundle,
  safeCliResult,
  verifyAppliedBootstrap,
} from './grh-directory-production-bootstrap-lib.mjs';

const CONFIRMATION = 'municipio-junin-production-one-shot';

function argument(args, name) {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : null;
}

function usage() {
  return [
    'Uso:',
    '  node scripts/grh-directory-production-bootstrap.mjs prepare --worktree <path> --artifact <json> --state-dir <path>',
    '  node scripts/grh-directory-production-bootstrap.mjs apply --state <state.json> --confirm-production-one-shot ' + CONFIRMATION,
    '  node scripts/grh-directory-production-bootstrap.mjs verify --state <state.json>',
    '  node scripts/grh-directory-production-bootstrap.mjs cleanup --state <state.json> --confirm-production-one-shot ' + CONFIRMATION,
    '',
    'El comando apply usa `vercel deploy --prod --skip-domain`; nunca promueve ni mueve el alias público.',
    'El worktree debe ser detached del SHA limpio de master; el comando lo vincula al proyecto Vercel exacto.',
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
  if (command === 'verify') {
    return verifyAppliedBootstrap({ statePath });
  }
  if (command === 'cleanup') {
    requireConfirmation(args);
    return cleanupVerifiedBootstrap({ statePath });
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
    console.error('[GRH-BOOTSTRAP] ' + String(error?.code || 'BOOTSTRAP_FAILED'));
    process.exitCode = 1;
  }
}

const invoked = process.argv[1]
  ? pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url
  : false;
if (invoked) await main();

export { usage };
