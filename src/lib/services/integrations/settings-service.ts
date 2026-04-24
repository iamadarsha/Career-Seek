import fs from 'fs';
import path from 'path';
import { getDb } from '@/db';
import { appSettings } from '@/db/schema';
import { eq } from 'drizzle-orm';
import { getAppSubDir } from '@/lib/local-paths';

const INTEGRATION_SETTINGS_KEY = 'integration_settings';

export interface IntegrationSettings {
  defaultExportFolder: string | null;
  backupDestination: string | null;
  calendar: {
    defaultDurationMinutes: number;
    defaultLeadMinutes: number;
    autoOpenInCalendar: boolean;
  };
  email: {
    defaultTone: 'professional' | 'warm' | 'concise';
    signature: string;
  };
  toggles: {
    calendar: boolean;
    emailDrafts: boolean;
    contacts: boolean;
    applicationPacketExport: boolean;
    backupRestore: boolean;
    useAiForEmails: boolean;
  };
}

const DEFAULT_SETTINGS: IntegrationSettings = {
  defaultExportFolder: null,
  backupDestination: null,
  calendar: {
    defaultDurationMinutes: 30,
    defaultLeadMinutes: 10,
    autoOpenInCalendar: false,
  },
  email: {
    defaultTone: 'professional',
    signature: 'Best regards,',
  },
  toggles: {
    calendar: true,
    emailDrafts: true,
    contacts: true,
    applicationPacketExport: true,
    backupRestore: true,
    useAiForEmails: true,
  },
};

function ensureDir(dirPath: string): string {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
  return dirPath;
}

function safeParseSettings(value?: string | null): Partial<IntegrationSettings> {
  if (!value) return {};
  try {
    return JSON.parse(value);
  } catch {
    return {};
  }
}

export function mergeIntegrationSettings(
  base: IntegrationSettings,
  updates: Partial<IntegrationSettings>,
): IntegrationSettings {
  return {
    ...base,
    ...updates,
    calendar: {
      ...base.calendar,
      ...(updates.calendar || {}),
    },
    email: {
      ...base.email,
      ...(updates.email || {}),
    },
    toggles: {
      ...base.toggles,
      ...(updates.toggles || {}),
    },
  };
}

export function getIntegrationSettings(): IntegrationSettings {
  const db = getDb();
  const row = db.select().from(appSettings).where(eq(appSettings.key, INTEGRATION_SETTINGS_KEY)).get();
  const parsed = safeParseSettings(row?.value);
  return mergeIntegrationSettings(DEFAULT_SETTINGS, parsed);
}

export function updateIntegrationSettings(
  updates: Partial<IntegrationSettings>,
): IntegrationSettings {
  const db = getDb();
  const current = getIntegrationSettings();
  const next = mergeIntegrationSettings(current, updates);
  const existing = db.select().from(appSettings).where(eq(appSettings.key, INTEGRATION_SETTINGS_KEY)).get();

  if (existing) {
    db.update(appSettings)
      .set({ value: JSON.stringify(next) })
      .where(eq(appSettings.id, existing.id))
      .run();
  } else {
    db.insert(appSettings).values({
      key: INTEGRATION_SETTINGS_KEY,
      value: JSON.stringify(next),
    }).run();
  }

  return next;
}

export function resolveExportFolder(subfolder: string): string {
  const settings = getIntegrationSettings();
  const base =
    settings.defaultExportFolder && settings.defaultExportFolder.trim().length > 0
      ? settings.defaultExportFolder.trim()
      : getAppSubDir('exports');
  return ensureDir(path.join(base, subfolder));
}

export function resolveBackupFolder(): string {
  const settings = getIntegrationSettings();
  const base =
    settings.backupDestination && settings.backupDestination.trim().length > 0
      ? settings.backupDestination.trim()
      : resolveExportFolder('backups');
  return ensureDir(base);
}

