import { drizzle } from 'drizzle-orm/libsql';
import { createClient } from '@libsql/client';
import * as schema from '@/db/schema';

// Validate environment
const databaseUrl = process.env.TURSO_DATABASE_URL || 'file:local.db';
const isProduction = process.env.NODE_ENV === 'production';

// Warn if using local DB in production
if (isProduction && databaseUrl === 'file:local.db') {
  console.error('[DB] WARNING: Using local SQLite in production! Set TURSO_DATABASE_URL.');
}

// Create the database client with optimized settings for serverless
const client = createClient({
  url: databaseUrl,
  authToken: process.env.TURSO_AUTH_TOKEN,
});

// Create the Drizzle database instance
export const db = drizzle(client, { schema });

// Export for direct SQL queries
export { client };

// Helper to check if DB is configured for production
export function isDatabaseConfigured(): boolean {
  return databaseUrl.startsWith('libsql://');
}
