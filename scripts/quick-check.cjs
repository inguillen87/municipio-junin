// Quick DB diagnostic - checks tenants and users
// Uses dotenv manually to avoid PowerShell issues
const fs = require('fs');
const path = require('path');

// Manual .env.local parser
const envFile = path.join(__dirname, '..', '.env.local');
if (fs.existsSync(envFile)) {
  const lines = fs.readFileSync(envFile, 'utf8').split('\n');
  for (const line of lines) {
    const m = line.match(/^([^#=]+?)=["']?(.*?)["']?\s*$/);
    if (m && !process.env[m[1].trim()]) {
      process.env[m[1].trim()] = m[2];
    }
  }
}

// Override to remove channel_binding which causes auth failures
if (process.env.DATABASE_URL && process.env.DATABASE_URL.includes('channel_binding')) {
  process.env.DATABASE_URL = process.env.DATABASE_URL.replace(/[&?]channel_binding=[^&]*/g, '');
}

const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();

async function main() {
  try {
    console.log('Connecting to:', process.env.DATABASE_URL ? process.env.DATABASE_URL.replace(/:[^:@]+@/, ':***@') : 'NOT SET');
    await p.$queryRawUnsafe('SELECT 1 as ok');
    console.log('DB CONNECTION: OK');
    
    const tenants = await p.tenant.findMany({
      select: { id: true, slug: true, name: true, status: true, trialEndsAt: true, plan: true }
    });
    console.log('\nTENANTS (' + tenants.length + '):');
    console.log(JSON.stringify(tenants, null, 2));
    
    const users = await p.user.findMany({
      select: { id: true, email: true, name: true, role: true, active: true, tenantId: true, lastLogin: true }
    });
    console.log('\nUSERS (' + users.length + '):');
    console.log(JSON.stringify(users, null, 2));
  } catch (e) {
    console.error('ERROR:', e.message);
  } finally {
    await p.$disconnect();
  }
}

main();
