#!/usr/bin/env node

import { fingerprintDatabaseTarget } from '../api/lib/database-target-fingerprint.js';

try {
  const fingerprint = fingerprintDatabaseTarget(process.env.DIRECT_URL);
  process.stdout.write('__MUNICTRL_DATABASE_TARGET__' + fingerprint + '\n');
} catch {
  process.exitCode = 1;
}
