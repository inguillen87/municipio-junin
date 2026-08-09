// ============================================================
// prisma.js — Singleton Prisma Client
// Optimizado para Vercel Serverless (evita conexiones extra)
// ============================================================

// Este cliente se genera con `npm run db:generate` dentro de backend. No debe
// resolverse desde el node_modules del checkout raíz.
const { PrismaClient } = require('../generated/prisma');

const globalForPrisma = global;

const prisma = globalForPrisma.prisma ?? new PrismaClient({
  log: process.env.NODE_ENV === 'development' ? ['query', 'error', 'warn'] : ['error'],
});

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma;
}

module.exports = prisma;
