import { spawnSync } from 'child_process';
import { commandExists } from './lib/runtime.mjs';

const action = process.argv[2] || 'up';

const commands = {
  up: ['compose', 'up', '-d'],
  down: ['compose', 'down'],
  logs: ['compose', 'logs', '-f'],
  ps: ['compose', 'ps'],
};

if (!commands[action]) {
  console.error(`Unknown Docker action: ${action}`);
  console.error(`Supported actions: ${Object.keys(commands).join(', ')}`);
  process.exit(1);
}

if (!commandExists('docker')) {
  console.error('Docker is optional and was not found.');
  console.error('Use the native local flow instead: npm run bootstrap && npm run launch');
  process.exit(1);
}

const composeCheck = spawnSync('docker', ['compose', 'version'], { stdio: 'ignore' });
if (composeCheck.status !== 0) {
  console.error('Docker Compose is optional but unavailable in this Docker installation.');
  console.error('Use the native local flow instead: npm run bootstrap && npm run launch');
  process.exit(1);
}

const daemonCheck = spawnSync('docker', ['info'], { stdio: 'ignore' });
if (daemonCheck.status !== 0) {
  console.error('Docker is installed, but the Docker daemon is not running.');
  console.error('Start Docker Desktop to use compose, or use the native local flow: npm run bootstrap && npm run launch');
  process.exit(1);
}

const result = spawnSync('docker', commands[action], { stdio: 'inherit' });
if (result.error) {
  throw result.error;
}
process.exit(result.status ?? 1);
