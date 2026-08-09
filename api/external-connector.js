import pkg from 'pg';
import { lookup } from 'node:dns/promises';
import { noStore, requireDatasetTenant, requireRole } from './lib/auth.js';
const { Pool } = pkg;

const CONNECTOR_ROLES = ['SUPER_ADMIN', 'TENANT_ADMIN'];

function allowedConnectorHosts() {
  return new Set(
    String(process.env.DATA_CONNECTOR_ALLOWED_HOSTS || '')
      .split(',')
      .map(value => value.trim().toLowerCase())
      .filter(Boolean)
  );
}

function connectorHostAllowed(host) {
  return allowedConnectorHosts().has(String(host || '').trim().toLowerCase());
}

function isPrivateAddress(address) {
  const value = String(address || '').toLowerCase();
  if (value === '::1' || value === '::' || value.startsWith('fc') || value.startsWith('fd') || value.startsWith('fe8') || value.startsWith('fe9') || value.startsWith('fea') || value.startsWith('feb')) return true;
  const ipv4 = value.startsWith('::ffff:') ? value.slice(7) : value;
  const parts = ipv4.split('.').map(Number);
  if (parts.length !== 4 || parts.some(part => !Number.isInteger(part) || part < 0 || part > 255)) return false;
  const [a, b] = parts;
  return a === 0 || a === 10 || a === 127 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    a >= 224;
}

async function validateResolvedHost(host, lookupImpl = lookup) {
  const addresses = await lookupImpl(host, { all: true, verbatim: true });
  if (!addresses.length) throw new Error('El destino no resuelve');
  if (process.env.DATA_CONNECTOR_ALLOW_PRIVATE !== 'true' && addresses.some(item => isPrivateAddress(item.address))) {
    throw new Error('El destino resuelve a una red no permitida');
  }
  return addresses[0];
}

export async function probePostgresConnection(config, PoolClass = Pool) {
  const testPool = new PoolClass(config);
  let client;

  try {
    client = await testPool.connect();
    await client.query('SELECT 1 as test');
    const tablesResult = await client.query("SELECT tablename FROM pg_catalog.pg_tables WHERE schemaname != 'pg_catalog' AND schemaname != 'information_schema'");
    return tablesResult.rows.map(row => row.tablename);
  } finally {
    let cleanupFailed = false;
    if (client) {
      try {
        client.release();
      } catch {
        cleanupFailed = true;
        console.error('[EXTERNAL_CONNECTOR] No se pudo liberar el cliente PostgreSQL');
      }
    }
    try {
      await testPool.end();
    } catch {
      cleanupFailed = true;
      console.error('[EXTERNAL_CONNECTOR] No se pudo cerrar el pool PostgreSQL');
    }
    if (cleanupFailed) throw new Error('CONNECTOR_CLEANUP_FAILED');
  }
}

export function createExternalConnectorHandler({
  PoolClass = Pool,
  lookupImpl = lookup,
  requireRoleImpl = requireRole,
  requireDatasetTenantImpl = requireDatasetTenant,
} = {}) {
  return async function handler(req, res) {
    noStore(res);
    if (req.method !== 'POST') {
      return res.status(405).json({ error: 'Método no permitido' });
    }

    const caller = await requireRoleImpl(req, res, CONNECTOR_ROLES);
    if (!caller || !requireDatasetTenantImpl(res, caller, 'LEGACY_ANALYTICS_TENANT_ID')) return;

    const body = req.body;
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      return res.status(400).json({ error: 'Cuerpo JSON requerido' });
    }
    const { action, config } = body;

    if (['save', 'list', 'query'].includes(action)) {
      return res.status(410).json({
        success: false,
        code: 'CONNECTOR_ACTION_RETIRED',
        error: 'La persistencia y consulta de conectores está retirada hasta contar con aislamiento tenant y un vault de credenciales.'
      });
    }
    if (action !== 'test') {
      return res.status(400).json({ error: 'Acción no válida' });
    }
    if (!config || typeof config !== 'object' || Array.isArray(config)) {
      return res.status(400).json({ error: 'Configuración requerida' });
    }

    try {
      const { type, host, port, database, user, password, ssl } = config;
      if (type !== 'postgresql') {
        return res.status(400).json({ success: false, message: 'Tipo de conector no permitido' });
      }
      if (!allowedConnectorHosts().size) {
        return res.status(503).json({ success: false, message: 'Conectores externos no configurados' });
      }
      if (!connectorHostAllowed(host)) {
        return res.status(403).json({ success: false, message: 'Destino no autorizado' });
      }
      const numericPort = Number(port);
      if (!Number.isInteger(numericPort) || numericPort < 1 || numericPort > 65535) {
        return res.status(400).json({ success: false, message: 'Puerto inválido' });
      }
      if (ssl !== true) {
        return res.status(400).json({ success: false, message: 'TLS verificable es obligatorio' });
      }
      let resolvedDestination;
      try {
        resolvedDestination = await validateResolvedHost(host, lookupImpl);
      } catch {
        return res.status(403).json({ success: false, message: 'Destino de red no permitido' });
      }

      const start = Date.now();
      try {
        const tables = await probePostgresConnection({
          host: resolvedDestination.address,
          port: numericPort,
          database,
          user,
          password,
          ssl: { rejectUnauthorized: true, servername: host },
          connectionTimeoutMillis: 5000,
          query_timeout: 5000,
          statement_timeout: 5000,
        }, PoolClass);

        return res.status(200).json({
          success: true,
          message: 'Conexión exitosa a PostgreSQL',
          responseTime: Date.now() - start,
          tables
        });
      } catch {
        return res.status(502).json({
          success: false,
          message: 'No se pudo validar la conexión PostgreSQL'
        });
      }
    } catch {
      console.error('[EXTERNAL_CONNECTOR] Fallo interno durante la operación');
      return res.status(500).json({ error: 'Error en el servidor' });
    }
  };
}

export default createExternalConnectorHandler();
