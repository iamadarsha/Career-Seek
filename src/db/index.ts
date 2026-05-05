import { drizzle } from 'drizzle-orm/better-sqlite3';
import Database from 'better-sqlite3';
import { getDbPath } from '../lib/local-paths';
import * as schema from './schema';

let dbInstance: ReturnType<typeof drizzle> | null = null;
let sqliteInstance: Database.Database | null = null;

const SQLITE_BUSY_RETRY_CODES = new Set(['SQLITE_BUSY', 'SQLITE_LOCKED']);
const DEFAULT_BUSY_TIMEOUT_MS = Number(process.env.CAREER_SEEK_SQLITE_BUSY_TIMEOUT_MS || 10_000);

function isBusyError(error: unknown) {
  const candidate = error as { code?: string; message?: string } | undefined;
  return Boolean(
    candidate?.code && SQLITE_BUSY_RETRY_CODES.has(candidate.code)
      || /database is locked|SQLITE_BUSY|SQLITE_LOCKED/i.test(candidate?.message || ''),
  );
}

async function sleep(ms: number) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

export function getDb() {
  if (!dbInstance) {
    const dbPath = getDbPath();
    const sqlite = new Database(dbPath, { timeout: DEFAULT_BUSY_TIMEOUT_MS });
    sqlite.pragma(`busy_timeout = ${DEFAULT_BUSY_TIMEOUT_MS}`);
    sqlite.pragma('journal_mode = WAL');
    sqlite.pragma('synchronous = NORMAL');
    sqlite.pragma('foreign_keys = ON');
    sqliteInstance = sqlite;
    dbInstance = drizzle(sqlite, { schema });
  }
  return dbInstance;
}

export function getSqliteInstance() {
  getDb();
  if (!sqliteInstance) throw new Error('SQLite instance was not initialized.');
  return sqliteInstance;
}

export async function withDbRetry<T>(
  operation: () => T | Promise<T>,
  options: { attempts?: number; delayMs?: number } = {},
): Promise<T> {
  const attempts = Math.max(1, options.attempts || 5);
  const delayMs = Math.max(25, options.delayMs || 80);
  let lastError: unknown;

  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;
      if (!isBusyError(error) || attempt === attempts) break;
      await sleep(delayMs * attempt);
    }
  }

  throw lastError;
}

export async function dbTransaction<T>(operation: () => T | Promise<T>): Promise<T> {
  return withDbRetry(operation, { attempts: 6, delayMs: 100 });
}

// Backward-compatible singleton export for modules that import `db` directly.
export const db = getDb();
