import fs from 'fs';
import path from 'path';
import { spawnSync } from 'child_process';
import { getDb } from '@/db';
import {
  appSettings,
  applicationDocuments,
  applicationNotes,
  applicationReminders,
  applicationTimeline,
  applications,
  automationRules,
  backupManifests,
  coachMessages,
  coachThreads,
  contactLinks,
  contacts,
  documentAssets,
  emailDrafts,
  exportRuns,
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
import { getIntegrationSettings, resolveBackupFolder } from './settings-service';
import { getDbPath, getBaseAppDir, getAppSubDir } from '@/lib/local-paths';
import { importWorkspaceBackup as _importWorkspaceBackup } from './import-service';

export interface WorkspaceBackupPayload {
  schemaVersion: '1.0';
  exportedAt: string;
  manifest: {
    appName: 'JobHunt India';
    includes: string[];
    recordCounts: Record<string, number>;
    hasPhysicalDb: boolean;
    hasFiles: boolean;
  };
  data: Record<string, any[]>;
}

function writeExportRun(format: string, outputPath: string, recordCount: number, manifestPath?: string) {
  const db = getDb();
  db.insert(exportRuns).values({
    exportType: 'workspace_backup',
    format,
    outputPath,
    recordCount,
    manifestPath: manifestPath || null,
    status: 'success',
    createdAt: new Date(),
  }).run();
}

export function exportWorkspaceBackup() {
  const settings = getIntegrationSettings();
  if (!settings.toggles.backupRestore) {
    throw new Error('Backup/export is disabled in settings');
  }

  const db = getDb();
  const data: Record<string, any[]> = {
    uploadedResumes: db.select().from(uploadedResumes).all(),
    masterProfiles: db.select().from(masterProfiles).all(),
    searchProfiles: db.select().from(searchProfiles).all(),
    normalizedJobs: db.select().from(normalizedJobs).all(),
    scoredJobs: db.select().from(scoredJobs).all(),
    jobEnrichments: db.select().from(jobEnrichments).all(),
    jdAnalyses: db.select().from(jdAnalyses).all(),
    documentAssets: db.select().from(documentAssets).all(),
    applications: db.select().from(applications).all(),
    applicationTimeline: db.select().from(applicationTimeline).all(),
    applicationNotes: db.select().from(applicationNotes).all(),
    applicationReminders: db.select().from(applicationReminders).all(),
    applicationDocuments: db.select().from(applicationDocuments).all(),
    contacts: db.select().from(contacts).all(),
    contactLinks: db.select().from(contactLinks).all(),
    emailDrafts: db.select().from(emailDrafts).all(),
    exportedCalendarEvents: db.select().from(exportedCalendarEvents).all(),
    coachThreads: db.select().from(coachThreads).all(),
    coachMessages: db.select().from(coachMessages).all(),
    automationRules: db.select().from(automationRules).all(),
    scheduledTasks: db.select().from(scheduledTasks).all(),
    notificationPreferences: db.select().from(notificationPreferences).all(),
    appSettings: db.select().from(appSettings).all(),
  };

  const recordCounts = Object.fromEntries(
    Object.entries(data).map(([key, value]) => [key, value.length]),
  );
  const totalRecords = Object.values(recordCounts).reduce((sum, count) => sum + count, 0);

  const backupDir = resolveBackupFolder();
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const folder = path.join(backupDir, `workspace-backup-${stamp}`);
  fs.mkdirSync(folder, { recursive: true });

  // 1. Copy Physical DB
  const dbPath = getDbPath();
  const backupDbPath = path.join(folder, 'jobhunt.db');
  let hasPhysicalDb = false;
  try {
    spawnSync('sqlite3', [dbPath, `.backup '${backupDbPath}'`]);
    hasPhysicalDb = fs.existsSync(backupDbPath);
  } catch (e) {
    console.error('Failed to perform physical DB backup:', e);
  }

  // 2. Copy Files (uploads, output/resumes, output/cover-letters)
  const filesFolder = path.join(folder, 'files');
  fs.mkdirSync(filesFolder, { recursive: true });
  let hasFiles = false;
  try {
    const baseDir = getBaseAppDir();
    // Copy uploads if exists
    const uploadsDir = path.join(baseDir, 'uploads');
    if (fs.existsSync(uploadsDir)) {
      spawnSync('cp', ['-R', uploadsDir, path.join(filesFolder, 'uploads')]);
      hasFiles = true;
    }
    // Copy output/exports if exists
    const exportsDir = path.join(baseDir, 'exports');
    if (fs.existsSync(exportsDir)) {
      spawnSync('cp', ['-R', exportsDir, path.join(filesFolder, 'exports')]);
      hasFiles = true;
    }
    // Copy output if it's the folder containing resumes/cover-letters
    const outputDir = path.join(baseDir, 'output');
    if (fs.existsSync(outputDir)) {
      spawnSync('cp', ['-R', outputDir, path.join(filesFolder, 'output')]);
      hasFiles = true;
    }
  } catch (e) {
    console.error('Failed to copy file assets:', e);
  }

  const payload: WorkspaceBackupPayload = {
    schemaVersion: '1.0',
    exportedAt: new Date().toISOString(),
    manifest: {
      appName: 'JobHunt India',
      includes: Object.keys(data),
      recordCounts,
      hasPhysicalDb,
      hasFiles,
    },
    data,
  };

  const backupJsonPath = path.join(folder, 'workspace-backup.json');
  const manifestPath = path.join(folder, 'manifest.json');
  fs.writeFileSync(backupJsonPath, JSON.stringify(payload, null, 2), 'utf8');
  fs.writeFileSync(
    manifestPath,
    JSON.stringify(
      {
        schemaVersion: payload.schemaVersion,
        exportedAt: payload.exportedAt,
        manifest: payload.manifest,
      },
      null,
      2,
    ),
    'utf8',
  );

  const manifestRow = db.insert(backupManifests).values({
    version: payload.schemaVersion,
    manifestJson: JSON.stringify(payload.manifest),
    backupPath: backupJsonPath,
    createdAt: new Date(),
  }).returning().get();

  let zipPath: string | null = null;
  try {
    const targetZip = `${folder}.zip`;
    const result = spawnSync('zip', ['-r', targetZip, '.'], {
      cwd: folder,
      stdio: 'ignore',
    });
    if (result.status === 0) {
      zipPath = targetZip;
    }
  } catch {
    zipPath = null;
  }

  writeExportRun('json', backupJsonPath, totalRecords, manifestPath);
  writeExportRun('manifest', manifestPath, totalRecords, backupJsonPath);
  if (zipPath) {
    writeExportRun('zip', zipPath, totalRecords, manifestPath);
  }

  return {
    success: true,
    backupPath: backupJsonPath,
    manifestPath,
    zipPath,
    manifestId: manifestRow.id,
    totalRecords,
  };
}

export function restoreWorkspaceBackup(zipPath: string) {
  if (!fs.existsSync(zipPath)) {
    throw new Error(`Backup file not found: ${zipPath}`);
  }

  const db = getDb();
  const backupDir = resolveBackupFolder();
  const restoreTemp = path.join(backupDir, 'restore-temp');
  if (fs.existsSync(restoreTemp)) {
    fs.rmSync(restoreTemp, { recursive: true, force: true });
  }
  fs.mkdirSync(restoreTemp, { recursive: true });

  try {
    // 1. Unzip
    const unzipResult = spawnSync('unzip', [zipPath, '-d', restoreTemp]);
    if (unzipResult.status !== 0) {
      throw new Error('Failed to unzip backup file');
    }

    // 2. Validate Manifest
    const manifestPath = path.join(restoreTemp, 'manifest.json');
    if (!fs.existsSync(manifestPath)) {
      throw new Error('Manifest file missing in backup');
    }
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    // Support both new and old manifest formats
    const manifestInfo = manifest.manifest || manifest;
    if (manifestInfo.appName !== 'JobHunt India') {
      throw new Error('Invalid backup file: wrong application');
    }

    // 3. Restore Data
    const backupDbPath = path.join(restoreTemp, 'jobhunt.db');
    const backupJsonPath = path.join(restoreTemp, 'workspace-backup.json');
    let physicalRestoreSuccess = false;

    if (fs.existsSync(backupDbPath)) {
      const currentDbPath = getDbPath();
      const restoreResult = spawnSync('sqlite3', [currentDbPath, `.restore '${backupDbPath}'`]);
      if (restoreResult.status === 0) {
        physicalRestoreSuccess = true;
      } else {
        console.error('Physical restore failed:', restoreResult.stderr?.toString());
      }
    }

    if (!physicalRestoreSuccess) {
      if (fs.existsSync(backupJsonPath)) {
        console.log('Performing logical restore from workspace-backup.json...');
        try {
          _importWorkspaceBackup(backupJsonPath);
          console.log('Logical restore completed successfully.');
        } catch (importErr) {
          console.error('Logical restore failed:', importErr);
        }
      } else if (!fs.existsSync(backupDbPath)) {
        console.warn('Neither physical DB nor logical backup JSON found in backup.');
      }
    }

    // 4. Restore Files
    const filesFolder = path.join(restoreTemp, 'files');
    if (fs.existsSync(filesFolder)) {
      const baseDir = getBaseAppDir();
      
      const subdirs = ['uploads', 'exports', 'output'];
      for (const sub of subdirs) {
        const src = path.join(filesFolder, sub);
        const dest = path.join(baseDir, sub);
        if (fs.existsSync(src)) {
           if (!fs.existsSync(dest)) {
             fs.mkdirSync(dest, { recursive: true });
           }
           // Merge contents
           spawnSync('cp', ['-R', src + '/.', dest]);
        }
      }
    }

    // 5. Log Import
    db.insert(importRuns).values({
      importType: 'workspace_backup',
      sourcePath: zipPath,
      status: 'success',
      summary: `Restored from ${manifest.exportedAt || 'unknown'}. Physical DB: ${fs.existsSync(backupDbPath)}, Files: ${fs.existsSync(filesFolder)}`,
      createdAt: new Date(),
    }).run();

    return {
      success: true,
      exportedAt: manifest.exportedAt,
      manifest: manifestInfo
    };
  } finally {
    // Cleanup
    if (fs.existsSync(restoreTemp)) {
      fs.rmSync(restoreTemp, { recursive: true, force: true });
    }
  }
}


