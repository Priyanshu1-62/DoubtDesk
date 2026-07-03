import { Pool, neonConfig } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-serverless';
import { getDatabaseUrl } from './database-url';

// Setup WebSocket constructor for Node environments (required for @neondatabase/serverless Pool)
if (typeof globalThis.WebSocket === 'undefined') {
    const ws = require('ws');
    neonConfig.webSocketConstructor = ws;
}

const pool = new Pool({
    connectionString: getDatabaseUrl(),
    max: process.env.DATABASE_POOL_MAX ? parseInt(process.env.DATABASE_POOL_MAX, 10) : 10,
    idleTimeoutMillis: process.env.DATABASE_POOL_IDLE_TIMEOUT ? parseInt(process.env.DATABASE_POOL_IDLE_TIMEOUT, 10) : 30000,
});

// Register pool error listener to prevent unhandled connection errors from crashing the process
pool.on('error', (err: Error) => {
    console.error('Neon Database Pool connection error:', err);
});

export const db = drizzle({ client: pool });

/** Re-export the database client so callers import from one place. */
export { db as default };


