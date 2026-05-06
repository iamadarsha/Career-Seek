import fs from 'fs';
import path from 'path';

/** .env.local always lives at the project root (process.cwd() in Next.js) */
function getEnvLocalPath(): string {
  return path.join(process.cwd(), '.env.local');
}

interface ParsedEnv {
  /** Every original line in order (comments, blanks, key=value) */
  lines: string[];
  /** Map from KEY to its line index */
  keyIndex: Map<string, number>;
}

function parseEnvFile(content: string): ParsedEnv {
  const lines = content.split('\n');
  const keyIndex = new Map<string, number>();
  lines.forEach((line, i) => {
    const match = line.match(/^([A-Z_][A-Z0-9_]*)=/);
    if (match) keyIndex.set(match[1], i);
  });
  return { lines, keyIndex };
}

/**
 * Safely update or add keys in .env.local without touching unrelated lines.
 *
 * - Existing keys are updated in-place (preserving their position).
 * - New keys are appended at the end.
 * - Passing `""` as a value removes that key line entirely.
 * - Comments and blank lines are preserved as-is.
 * - Creates the file if it doesn't exist.
 */
export function updateEnvFile(updates: Record<string, string>): void {
  const envPath = getEnvLocalPath();
  const content = fs.existsSync(envPath) ? fs.readFileSync(envPath, 'utf8') : '';
  const { lines, keyIndex } = parseEnvFile(content);

  for (const [key, value] of Object.entries(updates)) {
    if (value === '') {
      // Remove line for this key
      if (keyIndex.has(key)) {
        const idx = keyIndex.get(key)!;
        lines.splice(idx, 1);
        // Rebuild index after splice so subsequent keys have correct positions
        keyIndex.clear();
        lines.forEach((line, i) => {
          const m = line.match(/^([A-Z_][A-Z0-9_]*)=/);
          if (m) keyIndex.set(m[1], i);
        });
      }
    } else if (keyIndex.has(key)) {
      lines[keyIndex.get(key)!] = `${key}=${value}`;
    } else {
      // Append — ensure file doesn't end mid-content without newline
      if (lines.length > 0 && lines[lines.length - 1] !== '') {
        lines.push('');
      }
      lines.push(`${key}=${value}`);
      keyIndex.set(key, lines.length - 1);
    }
  }

  fs.writeFileSync(envPath, lines.join('\n'));
}

/**
 * Read specific keys from .env.local.
 * Returns only the keys that are present and non-empty.
 */
export function readEnvKeys(keys: string[]): Record<string, string> {
  const envPath = getEnvLocalPath();
  if (!fs.existsSync(envPath)) return {};
  const content = fs.readFileSync(envPath, 'utf8');
  const result: Record<string, string> = {};
  for (const line of content.split('\n')) {
    const match = line.match(/^([A-Z_][A-Z0-9_]*)=(.+)$/);
    if (match && keys.includes(match[1])) {
      result[match[1]] = match[2];
    }
  }
  return result;
}
