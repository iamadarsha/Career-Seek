import fs from 'fs';
import os from 'os';
import path from 'path';

const APP_DIR_NAME = '.jobhunt-india';

// Load env if exists
try {
  const envLocal = fs.readFileSync('.env.local', 'utf8');
  envLocal.split('\n').forEach(line => {
    const [key, value] = line.split('=');
    if (key && value) process.env[key.trim()] = value.trim();
  });
} catch (e) {}

function bootstrap() {
  console.log('Bootstrapping JobHunt India local environment...');
  
  const baseDir = process.env.JOBHUNT_DATA_DIR 
    ? path.resolve(process.env.JOBHUNT_DATA_DIR)
    : path.join(os.homedir(), APP_DIR_NAME);
  
  const dirs = [
    '', // Create base dir
    'config',
    'db',
    'cache',
    'logs',
    'output',
    'output/resumes',
    'output/cover-letters',
    'uploads'
  ];

  for (const dir of dirs) {
    const fullPath = path.join(baseDir, dir);
    if (!fs.existsSync(fullPath)) {
      fs.mkdirSync(fullPath, { recursive: true });
      console.log(`Created directory: ${fullPath}`);
    }
  }

  // Create an initial empty config if it doesn't exist
  const configPath = path.join(baseDir, 'config', 'settings.json');
  if (!fs.existsSync(configPath)) {
    fs.writeFileSync(configPath, JSON.stringify({ isConfigured: false }, null, 2));
    console.log(`Created initial config at: ${configPath}`);
  }

  console.log('Bootstrap complete.');
}

bootstrap();
