import fs from 'fs';
import { getDb } from '@/db';
import {
  appSettings,
  applicationDocuments,
  applicationNotes,
  applicationReminders,
  applicationTimeline,
  applications,
  automationRules,
  coachMessages,
  coachThreads,
  contactLinks,
  contacts,
  documentAssets,
  emailDrafts,
  exportedCalendarEvents,
  importRuns,
  jdAnalyses,
  jobEnrichments,
  masterProfiles,
  normalizedJobs,
  notificationPreferences,
  scheduledTasks,
  scoredJobs,
  searchProfiles,
  uploadedResumes,
} from '@/db/schema';
import { getIntegrationSettings } from './settings-service';

function ensureImportEnabled() {
  const settings = getIntegrationSettings();
  if (!settings.toggles.backupRestore) {
    throw new Error('Import/restore is disabled in settings');
  }
}

function logImportRun(data: {
  importType: 'workspace_backup' | 'contacts_csv' | 'asset_metadata';
  sourcePath: string;
  status: 'success' | 'partial' | 'failure';
  importedCount: number;
  summary: string;
}) {
  const db = getDb();
  db.insert(importRuns).values({
    importType: data.importType,
    sourcePath: data.sourcePath,
    status: data.status,
    importedCount: data.importedCount,
    summary: data.summary,
    createdAt: new Date(),
  }).run();
}

function parseCsvLine(line: string): string[] {
  const out: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"' && line[i + 1] === '"') {
      current += '"';
      i++;
      continue;
    }
    if (char === '"') {
      inQuotes = !inQuotes;
      continue;
    }
    if (char === ',' && !inQuotes) {
      out.push(current.trim());
      current = '';
      continue;
    }
    current += char;
  }
  out.push(current.trim());
  return out;
}

function importRows(table: any, rows: any[]): { inserted: number; skipped: number } {
  const db = getDb();
  let inserted = 0;
  let skipped = 0;
  for (const row of rows) {
    try {
      db.insert(table).values(row).run();
      inserted++;
    } catch {
      skipped++;
    }
  }
  return { inserted, skipped };
}

export function importWorkspaceBackup(filePath: string) {
  ensureImportEnabled();
  if (!fs.existsSync(filePath)) {
    throw new Error('Backup file not found');
  }

  const raw = fs.readFileSync(filePath, 'utf8');
  const payload = JSON.parse(raw);
  if (payload?.schemaVersion !== '1.0' || !payload?.data) {
    throw new Error('Unsupported backup format');
  }

  const data = payload.data as Record<string, any[]>;
  const order: Array<{ key: string; table: any }> = [
    { key: 'uploadedResumes', table: uploadedResumes },
    { key: 'masterProfiles', table: masterProfiles },
    { key: 'searchProfiles', table: searchProfiles },
    { key: 'normalizedJobs', table: normalizedJobs },
    { key: 'scoredJobs', table: scoredJobs },
    { key: 'jobEnrichments', table: jobEnrichments },
    { key: 'jdAnalyses', table: jdAnalyses },
    { key: 'documentAssets', table: documentAssets },
    { key: 'applications', table: applications },
    { key: 'applicationTimeline', table: applicationTimeline },
    { key: 'applicationNotes', table: applicationNotes },
    { key: 'applicationReminders', table: applicationReminders },
    { key: 'applicationDocuments', table: applicationDocuments },
    { key: 'contacts', table: contacts },
    { key: 'contactLinks', table: contactLinks },
    { key: 'emailDrafts', table: emailDrafts },
    { key: 'exportedCalendarEvents', table: exportedCalendarEvents },
    { key: 'coachThreads', table: coachThreads },
    { key: 'coachMessages', table: coachMessages },
    { key: 'automationRules', table: automationRules },
    { key: 'scheduledTasks', table: scheduledTasks },
    { key: 'notificationPreferences', table: notificationPreferences },
    { key: 'appSettings', table: appSettings },
  ];

  let inserted = 0;
  let skipped = 0;
  for (const item of order) {
    const rows = data[item.key] || [];
    const result = importRows(item.table, rows);
    inserted += result.inserted;
    skipped += result.skipped;
  }

  const status: 'success' | 'partial' = skipped > 0 ? 'partial' : 'success';
  logImportRun({
    importType: 'workspace_backup',
    sourcePath: filePath,
    status,
    importedCount: inserted,
    summary: `Imported ${inserted} records, skipped ${skipped}`,
  });

  return { success: true, inserted, skipped, status };
}

export function importContactsCsv(filePath: string) {
  ensureImportEnabled();
  if (!fs.existsSync(filePath)) {
    throw new Error('CSV file not found');
  }
  const db = getDb();
  const text = fs.readFileSync(filePath, 'utf8');
  const lines = text.split(/\r?\n/).filter((line) => line.trim().length > 0);
  if (lines.length < 2) throw new Error('CSV must include header and at least one row');

  const headers = parseCsvLine(lines[0]).map((h) => h.trim());
  const idx = (name: string) => headers.findIndex((h) => h.toLowerCase() === name.toLowerCase());

  const nameIdx = idx('fullName');
  if (nameIdx < 0) throw new Error('CSV must include fullName header');

  let imported = 0;
  let skipped = 0;
  for (let i = 1; i < lines.length; i++) {
    const cols = parseCsvLine(lines[i]);
    const fullName = cols[nameIdx]?.trim();
    if (!fullName) {
      skipped++;
      continue;
    }
    try {
      db.insert(contacts).values({
        fullName,
        role: idx('role') >= 0 ? cols[idx('role')] || null : null,
        company: idx('company') >= 0 ? cols[idx('company')] || null : null,
        source: idx('source') >= 0 ? cols[idx('source')] || null : null,
        linkedinUrl: idx('linkedinUrl') >= 0 ? cols[idx('linkedinUrl')] || null : null,
        email: idx('email') >= 0 ? cols[idx('email')] || null : null,
        notes: idx('notes') >= 0 ? cols[idx('notes')] || null : null,
        outreachStatus: idx('outreachStatus') >= 0 ? cols[idx('outreachStatus')] || 'not_started' : 'not_started',
        createdAt: new Date(),
        updatedAt: new Date(),
      }).run();
      imported++;
    } catch {
      skipped++;
    }
  }

  const status: 'success' | 'partial' = skipped > 0 ? 'partial' : 'success';
  logImportRun({
    importType: 'contacts_csv',
    sourcePath: filePath,
    status,
    importedCount: imported,
    summary: `Imported ${imported} contacts, skipped ${skipped}`,
  });

  return { success: true, imported, skipped, status };
}

export function importAssetMetadata(filePath: string) {
  ensureImportEnabled();
  if (!fs.existsSync(filePath)) throw new Error('Metadata file not found');
  const text = fs.readFileSync(filePath, 'utf8');
  const payload = JSON.parse(text);
  const rows = Array.isArray(payload) ? payload : payload?.documentAssets;
  if (!Array.isArray(rows)) throw new Error('Expected array of document assets');

  const result = importRows(documentAssets, rows);
  const status: 'success' | 'partial' = result.skipped > 0 ? 'partial' : 'success';
  logImportRun({
    importType: 'asset_metadata',
    sourcePath: filePath,
    status,
    importedCount: result.inserted,
    summary: `Imported ${result.inserted} assets, skipped ${result.skipped}`,
  });

  return { success: true, ...result, status };
}
