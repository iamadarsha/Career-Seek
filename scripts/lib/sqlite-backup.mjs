import fs from 'fs';
import path from 'path';

function dbPath(baseDir) {
  return path.join(baseDir, 'db', 'jobhunt.db');
}

function backupDir(baseDir) {
  return path.join(baseDir, 'backups');
}

function timestamp() {
  return new Date().toISOString().replace(/[:.]/g, '-');
}

function listBackups(baseDir) {
  const dir = backupDir(baseDir);
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir)
    .filter((name) => /^jobhunt-\d{4}-.*\.db$/.test(name))
    .map((name) => path.join(dir, name))
    .sort((left, right) => fs.statSync(right).mtimeMs - fs.statSync(left).mtimeMs);
}

function pruneBackups(baseDir, keep = 25) {
  for (const stale of listBackups(baseDir).slice(keep)) {
    fs.rmSync(stale, { force: true });
  }
}

export async function backupSqliteDatabase(baseDir, reason = 'manual') {
  const source = dbPath(baseDir);
  if (!fs.existsSync(source)) return null;
  const dir = backupDir(baseDir);
  fs.mkdirSync(dir, { recursive: true });
  const target = path.join(dir, `jobhunt-${timestamp()}-${reason}.db`);
  fs.copyFileSync(source, target);
  pruneBackups(baseDir);
  return target;
}

async function quickCheck(dbFile) {
  const Database = (await import('better-sqlite3')).default;
  const sqlite = new Database(dbFile, { readonly: true, fileMustExist: true, timeout: 2_000 });
  try {
    const row = sqlite.prepare('PRAGMA quick_check').get();
    const value = row ? Object.values(row)[0] : 'unknown';
    return value === 'ok';
  } finally {
    sqlite.close();
  }
}

export async function verifyAndRecoverSqliteDatabase(baseDir) {
  const target = dbPath(baseDir);
  if (!fs.existsSync(target)) {
    return { ok: true, restored: false, reason: 'missing_database_will_be_created' };
  }

  try {
    if (await quickCheck(target)) {
      return { ok: true, restored: false, reason: 'quick_check_ok' };
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.warn(`[sqlite] quick_check failed: ${message}`);
  }

  const backups = listBackups(baseDir);
  if (backups.length === 0) {
    return { ok: false, restored: false, reason: 'database_corrupt_no_backup' };
  }

  const corruptCopy = `${target}.corrupt-${timestamp()}`;
  fs.renameSync(target, corruptCopy);
  fs.copyFileSync(backups[0], target);
  return {
    ok: true,
    restored: true,
    reason: 'restored_latest_backup',
    backupPath: backups[0],
    corruptCopy,
  };
}
