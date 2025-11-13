import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema.js';

// Lazy initialization to ensure environment variables are loaded
let _client: ReturnType<typeof postgres> | null = null;
let _db: ReturnType<typeof drizzle> | null = null;

function getDb() {
  if (!_db) {
    const DATABASE_URL = process.env.DATABASE_URL;

    if (!DATABASE_URL) {
      throw new Error('DATABASE_URL environment variable is not set');
    }
    if (DATABASE_URL.includes('[YOUR-PASSWORD]')) {
      throw new Error('DATABASE_URL contains placeholder [YOUR-PASSWORD]. Please replace it with your actual database password.');
    }

    // Create postgres client
    // Supabase requires prepare: false for connection pooler in transaction mode
    _client = postgres(DATABASE_URL, {
      prepare: false,
    });

    // Create Drizzle instance with schema
    _db = drizzle(_client, { schema });
  }

  return _db;
}

// Export lazy-initialized db instance
export const db = new Proxy({} as ReturnType<typeof drizzle>, {
  get(_target, prop) {
    return getDb()[prop as keyof ReturnType<typeof drizzle>];
  },
});

// Export schema for easy access
export * from './schema.js';
