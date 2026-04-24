/**
 * Export/Import Service — Phase G
 * 
 * Backup and restore CRM data for durability.
 */

import { getDb } from '../../../db';
import {
  applications,
  applicationTimeline,
  applicationNotes,
  applicationReminders,
  applicationDocuments,
} from '../../../db/schema';
import { getAppSubDir } from '../../local-paths';
import fs from 'fs';
import path from 'path';

export interface CrmExport {
  version: '1.0';
  exportedAt: string;
  applications: any[];
  timeline: any[];
  notes: any[];
  reminders: any[];
  documents: any[];
}

export function exportCrmData(targetDir?: string): { filePath: string; recordCount: number } {
  const db = getDb();

  const data: CrmExport = {
    version: '1.0',
    exportedAt: new Date().toISOString(),
    applications: db.select().from(applications).all(),
    timeline: db.select().from(applicationTimeline).all(),
    notes: db.select().from(applicationNotes).all(),
    reminders: db.select().from(applicationReminders).all(),
    documents: db.select().from(applicationDocuments).all(),
  };

  const dir = targetDir || getAppSubDir('exports');
  const fileName = `crm-export-${new Date().toISOString().slice(0, 10)}.json`;
  const filePath = path.join(dir, fileName);

  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8');

  const recordCount = data.applications.length + data.timeline.length +
    data.notes.length + data.reminders.length + data.documents.length;

  return { filePath, recordCount };
}

export function importCrmData(filePath: string): { success: boolean; imported: number; error?: string } {
  try {
    const raw = fs.readFileSync(filePath, 'utf-8');
    const data: CrmExport = JSON.parse(raw);

    if (data.version !== '1.0') {
      return { success: false, imported: 0, error: 'Unsupported export version' };
    }

    const db = getDb();
    let imported = 0;

    // Import applications (skip if ID already exists)
    for (const app of data.applications) {
      try {
        db.insert(applications).values(app).run();
        imported++;
      } catch { /* skip duplicates */ }
    }

    for (const event of data.timeline) {
      try {
        db.insert(applicationTimeline).values(event).run();
        imported++;
      } catch { /* skip duplicates */ }
    }

    for (const note of data.notes) {
      try {
        db.insert(applicationNotes).values(note).run();
        imported++;
      } catch { /* skip duplicates */ }
    }

    for (const reminder of data.reminders) {
      try {
        db.insert(applicationReminders).values(reminder).run();
        imported++;
      } catch { /* skip duplicates */ }
    }

    for (const doc of data.documents) {
      try {
        db.insert(applicationDocuments).values(doc).run();
        imported++;
      } catch { /* skip duplicates */ }
    }

    return { success: true, imported };
  } catch (error: any) {
    return { success: false, imported: 0, error: error.message };
  }
}

export function getExportDir(): string {
  return getAppSubDir('exports');
}

export function listExports(): Array<{ name: string; path: string; size: number; date: string }> {
  const dir = getAppSubDir('exports');
  if (!fs.existsSync(dir)) return [];
  
  return fs.readdirSync(dir)
    .filter(f => f.startsWith('crm-export-') && f.endsWith('.json'))
    .map(name => {
      const full = path.join(dir, name);
      const stat = fs.statSync(full);
      return {
        name,
        path: full,
        size: stat.size,
        date: stat.mtime.toISOString(),
      };
    })
    .sort((a, b) => b.date.localeCompare(a.date));
}
