import { defineConfig } from 'drizzle-kit';
import { config } from 'dotenv';

// Load .env.local
config({ path: '.env.local' });

export default defineConfig({
  schema: './src/db/schema.ts',
  out: './drizzle',
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env.DATABASE_URL!,
  },
});
