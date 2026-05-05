import os from 'os';
import path from 'path';
import fs from 'fs';

const APP_DIR_NAME = '.jobhunt-india';
const FALLBACK_DIR_NAME = 'career-seek-data';

let activeBaseDir: string | null = null;
let storageFallbackReason: string | null = null;

function ensureWritableDir(dir: string): string {
  fs.mkdirSync(dir, { recursive: true });
  const probe = path.join(dir, `.write-test-${process.pid}-${Date.now()}`);
  fs.writeFileSync(probe, 'ok');
  fs.rmSync(probe, { force: true });
  return dir;
}

function fallbackBaseDir(reason: unknown) {
  const homeDir = os.homedir();
  const fallback = path.join(homeDir, FALLBACK_DIR_NAME);
  storageFallbackReason = reason instanceof Error ? reason.message : String(reason || 'Unknown storage error');
  return ensureWritableDir(fallback);
}

/**
 * Gets the base directory for the application data based on OS.
 * - macOS: ~/.jobhunt-india
 * - Windows: %USERPROFILE%\.jobhunt-india
 */
export function getBaseAppDir(): string {
  if (activeBaseDir) {
    return activeBaseDir;
  }

  const preferred = process.env.JOBHUNT_DATA_DIR
    ? path.resolve(process.env.JOBHUNT_DATA_DIR)
    : path.join(os.homedir(), APP_DIR_NAME);

  try {
    activeBaseDir = ensureWritableDir(preferred);
    return activeBaseDir;
  } catch (error) {
    activeBaseDir = fallbackBaseDir(error);
    return activeBaseDir;
  }
}

export function getStorageFallbackStatus() {
  return {
    activeBaseDir: getBaseAppDir(),
    usingFallback: Boolean(storageFallbackReason),
    fallbackReason: storageFallbackReason,
    fallbackDir: path.join(os.homedir(), FALLBACK_DIR_NAME),
  };
}

/**
 * Gets a specific sub-directory, creating it if it doesn't exist.
 */
export function getAppSubDir(subDir: 'config' | 'db' | 'cache' | 'logs' | 'output/resumes' | 'output/cover-letters' | 'uploads' | 'embeddings' | 'coach' | 'exports'): string {
  const baseDir = getBaseAppDir();
  const targetDir = path.join(baseDir, ...subDir.split('/'));
  
  try {
    if (!fs.existsSync(targetDir)) {
      fs.mkdirSync(targetDir, { recursive: true });
    }
    return targetDir;
  } catch (error) {
    activeBaseDir = fallbackBaseDir(error);
    const fallbackTarget = path.join(activeBaseDir, ...subDir.split('/'));
    fs.mkdirSync(fallbackTarget, { recursive: true });
    return fallbackTarget;
  }
}

export function getDbPath(): string {
  return path.join(getAppSubDir('db'), 'jobhunt.db');
}
