import { Pool, PoolClient } from 'pg';
import * as fs from 'fs';
import * as path from 'path';

let pool: Pool | null = null;

/**
 * Initialize database connection pool
 */
export function initializePool(config?: any): Pool {
  if (pool) {
    return pool;
  }

  const dbConfig = config || {
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '5432'),
    database: process.env.DB_NAME || 'deep_localization',
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD || 'postgres',
  };

  pool = new Pool(dbConfig);
  return pool;
}

/**
 * Get database connection pool
 */
export function getPool(): Pool {
  if (!pool) {
    throw new Error('Database pool not initialized. Call initializePool() first.');
  }
  return pool;
}

/**
 * Get a single client from the pool
 */
export async function getClient(): Promise<PoolClient> {
  const p = getPool();
  return p.connect();
}

/**
 * Execute a query
 */
export async function query(text: string, params?: any[]): Promise<any> {
  const p = getPool();
  return p.query(text, params);
}

/**
 * Run migrations
 */
export async function runMigrations(): Promise<void> {
  const client = await getClient();
  try {
    // Read and execute schema
    const schemaPath = path.join(__dirname, 'schema.sql');
    const schema = fs.readFileSync(schemaPath, 'utf-8');
    await client.query(schema);

    // Read and execute seed data
    const seedPath = path.join(__dirname, 'seed.sql');
    const seed = fs.readFileSync(seedPath, 'utf-8');
    await client.query(seed);

    console.log('Database migrations completed successfully');
  } finally {
    client.release();
  }
}

/**
 * Close database connection pool
 */
export async function closePool(): Promise<void> {
  if (pool) {
    await pool.end();
    pool = null;
  }
}

/**
 * Reset database (for testing)
 */
export async function resetDatabase(): Promise<void> {
  const client = await getClient();
  try {
    // Drop all tables
    await client.query(`
      DROP TABLE IF EXISTS intelligence_api_audit_log CASCADE;
      DROP TABLE IF EXISTS effectiveness_records CASCADE;
      DROP TABLE IF EXISTS recommendation_implementations CASCADE;
      DROP TABLE IF EXISTS patterns CASCADE;
      DROP TABLE IF EXISTS benchmark_cohorts CASCADE;
      DROP TABLE IF EXISTS anonymized_metrics CASCADE;
      DROP TABLE IF EXISTS localized_prompts CASCADE;
      DROP TABLE IF EXISTS locale_configs CASCADE;
    `);

    // Re-run migrations
    await runMigrations();
  } finally {
    client.release();
  }
}
