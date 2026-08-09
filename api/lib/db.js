// api/lib/db.js - Prisma singleton for serverless
import { PrismaClient } from '@prisma/client';
import databaseUrlPolicy from '../../shared/database-url-policy.cjs';

const { inspectDatabaseUrl } = databaseUrlPolicy;

const globalForPrisma = globalThis;

export const prisma = globalForPrisma.prisma ?? new PrismaClient({
  log: process.env.NODE_ENV === 'development' ? ['error'] : [],
});

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma;

export function assertPrismaDatabaseTransport() {
  if (!process.env.DATABASE_URL) return null;
  return inspectDatabaseUrl(process.env.DATABASE_URL, { nodeEnv: process.env.NODE_ENV });
}
