import { drizzle } from 'drizzle-orm/better-sqlite3';
import Database from 'better-sqlite3';
import { getDbPath } from '../lib/local-paths';
import * as schema from './schema';

let dbInstance: ReturnType<typeof drizzle> | null = null;

export function getDb() {
  if (!dbInstance) {
    const dbPath = getDbPath();
    const sqlite = new Database(dbPath);
    dbInstance = drizzle(sqlite, { schema });
  }
  return dbInstance;
}

// Backward-compatible singleton export for modules that import `db` directly.
export const db = getDb();
