import { config } from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load .env.local from project root
config({ path: join(__dirname, '../../.env.local') });

export const env = {
  DATABASE_URL: process.env.DATABASE_URL || '',
  OPENROUTER_API_KEY: process.env.OPENROUTER_API_KEY || '',
  NODE_ENV: process.env.NODE_ENV || 'development',
};

// Validate required environment variables
const requiredEnvVars = ['DATABASE_URL', 'OPENROUTER_API_KEY'] as const;
const missingEnvVars = requiredEnvVars.filter((key) => !env[key]);

if (missingEnvVars.length > 0) {
  throw new Error(
    `Missing required environment variables: ${missingEnvVars.join(', ')}\n` +
    'Please create .env.local based on .env.example'
  );
}
