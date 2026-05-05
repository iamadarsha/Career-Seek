import fs from 'fs';
import path from 'path';
import { getAppSubDir } from '../local-paths';
import type { AIUsageLedgerHook, AIUsageLedgerRecord } from './types';

export const noopUsageLedger: AIUsageLedgerHook = async () => {};

export async function recordAIUsage(
  record: AIUsageLedgerRecord,
  usageLedger: AIUsageLedgerHook = noopUsageLedger,
) {
  try {
    await usageLedger({
      ...record,
      metadata: record.metadata ? { ...record.metadata } : undefined,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.warn(`[AI Ledger] Usage hook failed: ${message}`);
  }
}

export function createInMemoryUsageLedger(limit = 200) {
  const entries: AIUsageLedgerRecord[] = [];

  const record: AIUsageLedgerHook = async (entry) => {
    entries.push({ ...entry, attempts: entry.attempts.map((attempt) => ({ ...attempt })) });
    if (entries.length > limit) {
      entries.splice(0, entries.length - limit);
    }
  };

  return {
    record,
    entries: () => entries.map((entry) => ({ ...entry, attempts: entry.attempts.map((attempt) => ({ ...attempt })) })),
    clear: () => {
      entries.splice(0, entries.length);
    },
  };
}

export function createFileUsageLedger(filename = 'ai-usage-ledger.ndjson') {
  const targetPath = path.join(getAppSubDir('logs'), filename);

  const record: AIUsageLedgerHook = async (entry) => {
    const payload = JSON.stringify({
      ...entry,
      attempts: entry.attempts.map((attempt) => ({ ...attempt })),
    });
    fs.appendFileSync(targetPath, `${payload}\n`, 'utf8');
  };

  return {
    path: targetPath,
    record,
  };
}
