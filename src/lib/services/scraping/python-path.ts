import fs from 'fs';
import path from 'path';
import { spawn } from 'child_process';

function venvCandidates(root = process.cwd()) {
  const venvDir = path.join(root, '.venv-career-seek');
  return process.platform === 'win32'
    ? [
        path.join(venvDir, 'Scripts', 'python.exe'),
      ]
    : [
        path.join(venvDir, 'bin', 'python3'),
        path.join(venvDir, 'bin', 'python'),
      ];
}

function portableCandidates(root = process.cwd()) {
  const current = path.join(root, 'binaries', 'python', 'current', 'python');
  return process.platform === 'win32'
    ? [
        path.join(current, 'python.exe'),
        path.join(current, 'Lib', 'venv', 'scripts', 'nt', 'python.exe'),
      ]
    : [
        path.join(current, 'bin', 'python3'),
        path.join(current, 'bin', 'python'),
      ];
}

export function pythonCandidates(root = process.cwd()) {
  return [
    process.env.PYTHON_BIN,
    process.env.PYTHON,
    ...venvCandidates(root),
    ...portableCandidates(root),
    process.platform === 'win32' ? 'python' : 'python3',
    'python',
  ].filter(Boolean) as string[];
}

export function resolvePythonBinary(root = process.cwd()) {
  for (const candidate of pythonCandidates(root)) {
    if (!candidate) continue;
    if (!candidate.includes(path.sep) && !candidate.startsWith('.')) return candidate;
    if (fs.existsSync(candidate)) return candidate;
  }
  return process.platform === 'win32' ? 'python' : 'python3';
}

export function runPythonScript(
  scriptRelPath: string,
  config: Record<string, unknown>,
  timeoutMs = 90_000,
): Promise<any[]> {
  return new Promise((resolve, reject) => {
    const bin = resolvePythonBinary();
    const scriptPath = path.resolve(process.cwd(), scriptRelPath);
    const child = spawn(bin, [scriptPath, JSON.stringify(config)], {
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let stdout = '';
    let stderr = '';
    const timer = setTimeout(() => {
      child.kill('SIGTERM');
      reject(new Error(`timeout: python script ${scriptRelPath} timed out after ${timeoutMs}ms`));
    }, timeoutMs);

    child.stdout.on('data', (chunk: Buffer) => { stdout += chunk.toString(); });
    child.stderr.on('data', (chunk: Buffer) => { stderr += chunk.toString(); });
    child.on('error', (err) => { clearTimeout(timer); reject(err); });
    child.on('close', (code) => {
      clearTimeout(timer);
      if (code !== 0) {
        reject(new Error(stderr.trim() || `${scriptRelPath} exited with code ${code}`));
        return;
      }
      try {
        const parsed = JSON.parse(stdout);
        resolve(Array.isArray(parsed.jobs) ? parsed.jobs : []);
      } catch (err) {
        reject(new Error(`${scriptRelPath}: failed to parse stdout as JSON — ${(err as Error).message}`));
      }
    });
  });
}
