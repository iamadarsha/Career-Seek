import { spawn } from 'child_process';
import os from 'os';

console.log("🚀 Launching Career Seek Ecosystem...");

const command = os.platform() === 'win32' ? 'npm.cmd' : 'npm';

// 1. Start Next.js Dev Server
console.log("[Launcher] Starting Next.js Dev Server...");
const devServer = spawn(command, ['run', 'dev'], { stdio: 'inherit' });

devServer.on('error', (err) => {
  console.error('[Launcher] Failed to start dev server:', err);
});

// 2. Start Job Worker
console.log("[Launcher] Starting Background Job Worker...");
const jobWorker = spawn(command, ['run', 'worker'], { stdio: 'inherit' });

jobWorker.on('error', (err) => {
  console.error('[Launcher] Failed to start job worker:', err);
});

// Handle termination
process.on('SIGINT', () => {
  console.log('\n[Launcher] Shutting down ecosystem...');
  devServer.kill();
  jobWorker.kill();
  process.exit(0);
});
