import { Pool } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-serverless';
import { getDatabaseUrl } from './database-url';

const pool = new Pool({ connectionString: getDatabaseUrl() });
export const db = drizzle({ client: pool });

/** Re-export the transaction helper so callers import from one place. */
export { db as default };


