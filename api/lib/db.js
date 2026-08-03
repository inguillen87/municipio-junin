// api/lib/db.js - Prisma singleton for serverless
import { PrismaClient } from '@prisma/client';

const globalForPrisma = globalThis;

export const prisma = globalForPrisma.prisma ?? new PrismaClient({
  log: process.env.NODE_ENV === 'development' ? ['error'] : [],
});

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma;
