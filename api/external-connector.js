import pkg from 'pg';
const { Pool } = pkg;

// Use the local DB for saving connections
const localPool = new Pool({
  connectionString: process.env.DATABASE_URL
});

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Método no permitido' });
  }

  const { action, config } = req.body;

  try {
    if (action === 'test') {
      const { type, host, port, database, user, password, ssl } = config;
      
      const start = Date.now();
      
      if (type === 'postgresql') {
        const testPool = new Pool({
          host, port, database, user, password, ssl: ssl ? { rejectUnauthorized: false } : false
        });
        
        try {
          const client = await testPool.connect();
          const result = await client.query('SELECT 1 as test');
          const tablesResult = await client.query("SELECT tablename FROM pg_catalog.pg_tables WHERE schemaname != 'pg_catalog' AND schemaname != 'information_schema'");
          client.release();
          await testPool.end();
          
          return res.status(200).json({
            success: true,
            message: 'Conexión exitosa a PostgreSQL',
            responseTime: Date.now() - start,
            tables: tablesResult.rows.map(r => r.tablename)
          });
        } catch (error) {
          return res.status(500).json({ success: false, message: 'Error de conexión: ' + error.message });
        }
      } else {
        return res.status(200).json({
          success: false,
          message: `El tipo de base de datos '${type}' requiere dependencias adicionales (ej. mysql2, mssql). Por ahora, soportamos nativamente PostgreSQL.`
        });
      }
    } 
    
    else if (action === 'save') {
      const { name, type, host, port, database, user, ssl } = config;
      // Do not store the password
      
      const query = `
        INSERT INTO data_connections (name, type, host, port, database, username, ssl, created_at)
        VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
        RETURNING id
      `;
      // Create table if it doesn't exist
      await localPool.query(`
        CREATE TABLE IF NOT EXISTS data_connections (
          id SERIAL PRIMARY KEY,
          name VARCHAR(255),
          type VARCHAR(50),
          host VARCHAR(255),
          port INT,
          database VARCHAR(255),
          username VARCHAR(255),
          ssl BOOLEAN,
          created_at TIMESTAMP DEFAULT NOW()
        )
      `);
      
      const result = await localPool.query(query, [name, type, host, port, database, user, ssl]);
      return res.status(200).json({ success: true, id: result.rows[0].id });
    }
    
    else if (action === 'list') {
      // Create table if it doesn't exist
      await localPool.query(`
        CREATE TABLE IF NOT EXISTS data_connections (
          id SERIAL PRIMARY KEY,
          name VARCHAR(255),
          type VARCHAR(50),
          host VARCHAR(255),
          port INT,
          database VARCHAR(255),
          username VARCHAR(255),
          ssl BOOLEAN,
          created_at TIMESTAMP DEFAULT NOW()
        )
      `);
      const result = await localPool.query('SELECT * FROM data_connections ORDER BY created_at DESC');
      return res.status(200).json({ success: true, connections: result.rows });
    }
    
    else if (action === 'query') {
      const { connectionId, query } = req.body;
      
      // We don't have passwords stored in `data_connections`, 
      // in a real scenario we'd need a secure vault for credentials or ask for it
      // Let's just return a mock response for now or error about credentials.
      
      if (!query.trim().toUpperCase().startsWith('SELECT')) {
        return res.status(403).json({ success: false, error: 'Sólo se permiten consultas SELECT.' });
      }
      
      return res.status(200).json({ 
        success: false, 
        error: 'Las credenciales no están almacenadas por seguridad. Use la funcionalidad de test para consultas temporales.' 
      });
    }

    return res.status(400).json({ error: 'Acción no válida' });

  } catch (error) {
    console.error('External connector error:', error);
    return res.status(500).json({ error: 'Error en el servidor', details: error.message });
  }
}
