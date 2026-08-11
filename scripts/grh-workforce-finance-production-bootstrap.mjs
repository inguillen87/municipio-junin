#!/usr/bin/env node

import { pathToFileURL } from 'node:url';

import {
  WorkforceFinanceBootstrapError,
  abortAmbiguousWorkforceFinanceBootstrap,
  applyWorkforceFinanceBootstrap,
  cleanupWorkforceFinanceBootstrap,
  prepareWorkforceFinanceBootstrap,
  resolveAmbiguousWorkforceFinanceBootstrap,
  safeCliResult,
} from './grh-workforce-finance-production-bootstrap-lib.mjs';

function parseArgs(argv) {
  const command = argv[0];
  const options = {};
  for (let index = 1; index < argv.length; index += 2) {
    const flag = argv[index];
    const value = argv[index + 1];
    if (!flag?.startsWith('--') || value === undefined || value.startsWith('--')) {
      throw new WorkforceFinanceBootstrapError('BOOTSTRAP_ARGUMENTS_INVALID');
    }
    const key = flag.slice(2);
    if (Object.hasOwn(options, key)) {
      throw new WorkforceFinanceBootstrapError('BOOTSTRAP_ARGUMENTS_INVALID');
    }
    options[key] = value;
  }
  return { command, options };
}

function exactOptions(options, expected) {
  const actual = Object.keys(options).sort();
  const wanted = [...expected].sort();
  if (actual.length !== wanted.length || actual.some((key, index) => key !== wanted[index])) {
    throw new WorkforceFinanceBootstrapError('BOOTSTRAP_ARGUMENTS_INVALID');
  }
}

export async function runWorkforceFinanceBootstrapCli(argv = process.argv.slice(2)) {
  const { command, options } = parseArgs(argv);
  if (command === 'prepare') {
    exactOptions(options, ['worktree', 'artifact', 'state-dir']);
    return prepareWorkforceFinanceBootstrap({
      worktreePath: options.worktree,
      artifactPath: options.artifact,
      stateDirectory: options['state-dir'],
    });
  }
  if (command === 'apply') {
    exactOptions(options, ['state']);
    return applyWorkforceFinanceBootstrap({ statePath: options.state });
  }
  if (command === 'resolve') {
    exactOptions(options, ['state']);
    return resolveAmbiguousWorkforceFinanceBootstrap({ statePath: options.state });
  }
  if (command === 'cleanup') {
    exactOptions(options, ['state']);
    return cleanupWorkforceFinanceBootstrap({ statePath: options.state });
  }
  if (command === 'abort-ambiguous') {
    exactOptions(options, ['state']);
    return abortAmbiguousWorkforceFinanceBootstrap({ statePath: options.state });
  }
  throw new WorkforceFinanceBootstrapError('BOOTSTRAP_COMMAND_INVALID');
}

function directExecution() {
  try {
    return import.meta.url === pathToFileURL(process.argv[1]).href;
  } catch {
    return false;
  }
}

if (directExecution()) {
  runWorkforceFinanceBootstrapCli()
    .then(result => process.stdout.write(JSON.stringify(safeCliResult(result)) + '\n'))
    .catch(error => {
      const code = error instanceof WorkforceFinanceBootstrapError
        ? error.code
        : 'BOOTSTRAP_UNEXPECTED_ERROR';
      process.stderr.write(JSON.stringify({ ok: false, code }) + '\n');
      process.exitCode = 1;
    });
}
