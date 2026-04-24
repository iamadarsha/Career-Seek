import os from 'os';
import path from 'path';
import fs from 'fs';

const APP_DIR_NAME = '.jobhunt-india';

/**
 * Gets the base directory for the application data based on OS.
 * - macOS: ~/.jobhunt-india
 * - Windows: %USERPROFILE%\.jobhunt-india
 */
export function getBaseAppDir(): string {
  if (process.env.JOBHUNT_DATA_DIR) {
    return path.resolve(process.env.JOBHUNT_DATA_DIR);
  }
  const homeDir = os.homedir();
  return path.join(homeDir, APP_DIR_NAME);
}

/**
 * Gets a specific sub-directory, creating it if it doesn't exist.
 */
export function getAppSubDir(subDir: 'config' | 'db' | 'cache' | 'logs' | 'output/resumes' | 'output/cover-letters' | 'uploads' | 'embeddings' | 'coach' | 'exports'): string {
  const baseDir = getBaseAppDir();
  const targetDir = path.join(baseDir, ...subDir.split('/'));
  
  if (!fs.existsSync(targetDir)) {
    fs.mkdirSync(targetDir, { recursive: true });
  }
  
  return targetDir;
}

export function getDbPath(): string {
  return path.join(getAppSubDir('db'), 'jobhunt.db');
}
