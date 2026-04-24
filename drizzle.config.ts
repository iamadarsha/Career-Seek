import type { Config } from 'drizzle-kit';
import path from 'path';
import os from 'os';

// During development/cli operations, we might need to resolve the db path manually
// This mimics the local-paths logic since drizzle.config.ts is often run outside the Next.js context
const homeDir = os.homedir();
const dbPath = path.join(homeDir, '.jobhunt-india', 'db', 'jobhunt.db');

export default {
  schema: './src/db/schema.ts',
  out: './src/db/migrations',
  driver: 'better-sqlite',
  dbCredentials: {
    url: dbPath,
  },
} satisfies Config;
