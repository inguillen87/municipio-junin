#!/usr/bin/env node

import process from 'node:process';

import {
  resolveCandidateSmokeConfiguration,
  runLedgerCandidateSmoke,
  safeFailure,
  usage,
} from './grh-action-ledger-candidate-smoke-lib.mjs';

async function main() {
  try {
    const config = resolveCandidateSmokeConfiguration(process.argv.slice(2), process.env);
    if (config.help) {
      process.stdout.write(`${usage()}\n`);
      return;
    }
    const receipt = await runLedgerCandidateSmoke({ config });
    process.stdout.write(`${JSON.stringify(receipt, null, 2)}\n`);
  } catch (error) {
    process.stderr.write(`${JSON.stringify(safeFailure(error))}\n`);
    process.exitCode = 1;
  }
}

await main();
