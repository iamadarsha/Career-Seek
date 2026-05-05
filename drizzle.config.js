import path from 'path';
import os from 'os';

const homeDir = os.homedir();
const dbPath = path.join(homeDir, '.jobhunt-india', 'db', 'jobhunt.db');

export default {
  schema: './src/db/schema.ts',
  out: './src/db/migrations',
  dialect: 'sqlite',
  dbCredentials: {
    url: dbPath,
  },
};
