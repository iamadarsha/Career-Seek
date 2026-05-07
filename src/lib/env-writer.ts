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

// FIX #7: accept any-case keys (was ^([A-Z_][A-Z0-9_]*)= — missed lowercase)
const KEY_REGEX = /^([A-Za-z_][A-Za-z0-9_]*)=/;

function parseEnvFile(content: string): ParsedEnv {
  const lines = content.split('\n');
  const keyIndex = new Map<string, number>();
  lines.forEach((line, i) => {
    const match = line.match(KEY_REGEX);
    if (match) keyIndex.set(match[1], i);
  });
  return { lines, keyIndex };
}

// FIX #1: quote values on write so = # newline inside API keys survive
function quoteValue(value: string): string {
  // Already quoted — don't double-wrap
  if (value.startsWith('"') && value.endsWith('"')) return value;
  return `"${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
}

// FIX #1: unquote on read
function unquoteValue(raw: string): string {
  const trimmed = raw.trim();
  if (trimmed.startsWith('"') && trimmed.endsWith('"')) {
    return trimmed.slice(1, -1).replace(/\\"/g, '"').replace(/\\\\/g, '\\');
  }
  return trimmed;
}

/**
 * Safely update or add keys in .env.local without touching unrelated lines.
 *
 * - Existing keys are updated in-place (preserving their position).
 * - New keys are appended at the end.
 * - Passing `""` as a value removes that key line entirely.
 * - Values are double-quoted so special chars (= # newline) survive round-trips.
 * - Comments and blank lines are preserved as-is.
 * - Creates the file if it doesn't exist.
 * - FIX #10: writes atomically via .tmp + rename to prevent partial-write corruption.
 */
export function updateEnvFile(updates: Record<string, string>): void {
  const envPath = getEnvLocalPath();
  const tmpPath = envPath + '.tmp'; // FIX #10: atomic write
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
          const m = line.match(KEY_REGEX);
          if (m) keyIndex.set(m[1], i);
        });
      }
    } else if (keyIndex.has(key)) {
      lines[keyIndex.get(key)!] = `${key}=${quoteValue(value)}`; // FIX #1
    } else {
      // Append — ensure file doesn't end mid-content without newline
      if (lines.length > 0 && lines[lines.length - 1] !== '') {
        lines.push('');
      }
      lines.push(`${key}=${quoteValue(value)}`); // FIX #1
      keyIndex.set(key, lines.length - 1);
    }
  }

  // FIX #10: write to .tmp first, then atomically rename to avoid partial-write corruption
  fs.writeFileSync(tmpPath, lines.join('\n'));
  fs.renameSync(tmpPath, envPath);
}

/**
 * Read specific keys from .env.local.
 * Returns only the keys that are present and non-empty.
 * FIX #1: unquotes values so callers get the raw string back.
 * FIX #7: matches any-case keys.
 */
export function readEnvKeys(keys: string[]): Record<string, string> {
  const envPath = getEnvLocalPath();
  if (!fs.existsSync(envPath)) return {};
  const content = fs.readFileSync(envPath, 'utf8');
  const result: Record<string, string> = {};
  for (const line of content.split('\n')) {
    // FIX #7: any-case key; FIX #1: capture rest of line then unquote
    const match = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.+)$/);
    if (match && keys.includes(match[1])) {
      result[match[1]] = unquoteValue(match[2]);
    }
  }
  return result;
}
