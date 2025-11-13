import { defineConfig } from 'drizzle-kit';
import { config } from 'dotenv';

// Load .env.local
const result = config({ path: '.env.local' });

// Supabase recommends using the connection pooler (port 6543) for Drizzle
// The DATABASE_URL should use the Supabase connection pooler with port 6543
const databaseUrl = process.env.DATABASE_URL;

// Debug logging (only if DEBUG_DRIZZLE is set)
if (process.env.DEBUG_DRIZZLE) {
  console.log('=== Drizzle Config Debug ===');
  console.log('dotenv result:', result.error ? `ERROR: ${result.error}` : 'SUCCESS');
  console.log('DATABASE_URL loaded:', databaseUrl ? 'YES' : 'NO');
  if (databaseUrl) {
    // Mask password for security
    const masked = databaseUrl.replace(/:([^@]+)@/, ':****@');
    console.log('Using connection (masked):', masked);
  }
  console.log('===========================\n');
}

if (!databaseUrl) {
  throw new Error('DATABASE_URL is required for Drizzle migrations.');
}

export default defineConfig({
  schema: './db/schema.ts',
  out: './drizzle',
  dialect: 'postgresql',
  dbCredentials: {
    url: databaseUrl,
  },
});
