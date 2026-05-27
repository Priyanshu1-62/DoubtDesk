import { drizzle } from 'drizzle-orm/neon-http';
import { neon } from '@neondatabase/serverless';

const connectionString = process.env.NEON_DB_CONNECTION_STRING;

if (!connectionString) {
  throw new Error('Missing required environment variable: NEON_DB_CONNECTION_STRING');
}

const sql = neon(connectionString);
export const db = drizzle(sql);

/** Re-export the transaction helper so callers import from one place. */
export { db as default };
