import fs from 'fs';
import path from 'path';
import { spawnSync } from 'child_process';
import { and, eq } from 'drizzle-orm';
import { getDb } from '@/db';
import {
  applicationDocuments,
  applicationNotes,
  applicationReminders,
  applicationTimeline,
  applications,
  contactLinks,
  contacts,
  documentAssets,
  emailDrafts,
  exportRuns,
} from '@/db/schema';
import { getIntegrationSettings, resolveExportFolder } from './settings-service';

function toMarkdownPacket(packet: any): string {
  const timeline = packet.timeline
    .map((t: any) => `- ${new Date(t.createdAt).toLocaleString('en-IN')}: ${t.title}`)
    .join('\n');
  const reminders = packet.reminders
    .map((r: any) => `- [${r.isCompleted ? 'x' : ' '}] ${r.title} (${new Date(r.dueAt).toLocaleString('en-IN')})`)
    .join('\n');
  const notes = packet.notes
    .map((n: any) => `- (${n.category}) ${n.content}`)
    .join('\n');
  const drafts = packet.emailDrafts
    .map((d: any) => `- v${d.version} ${d.draftType}: ${d.subject || '(no subject)'}`)
    .join('\n');
  const people = packet.contacts
    .map((c: any) => `- ${c.contact?.fullName || 'Unknown'} (${c.link.relationship || 'contact'})`)
    .join('\n');

  return [
    `# Application Packet — ${packet.application.title} @ ${packet.application.company}`,
    '',
    `- Application ID: ${packet.application.id}`,
    `- Status: ${packet.application.status}`,
    `- Priority: ${packet.application.priority || 'normal'}`,
    `- URL: ${packet.application.url || 'N/A'}`,
    `- Apply URL: ${packet.application.applyUrl || 'N/A'}`,
    '',
    '## Timeline',
    timeline || '- None',
    '',
    '## Reminders',
    reminders || '- None',
    '',
    '## Notes',
    notes || '- None',
    '',
    '## Linked Contacts',
    people || '- None',
    '',
    '## Email Drafts',
    drafts || '- None',
    '',
    '## Linked Documents',
    packet.documents.length === 0
      ? '- None'
      : packet.documents.map((d: any) =>
          `- ${d.link.documentType} v${d.link.version} (${d.asset?.filePath || 'inline content'})`,
        ).join('\n'),
    '',
  ].join('\n');
}

function writeExportRun(options: {
  exportType: string;
  format: string;
  outputPath: string;
  applicationId?: number;
  recordCount?: number;
  status?: string;
  manifestPath?: string;
}) {
  const db = getDb();
  db.insert(exportRuns).values({
    exportType: options.exportType,
    format: options.format,
    outputPath: options.outputPath,
    applicationId: options.applicationId || null,
    recordCount: options.recordCount || 0,
    status: options.status || 'success',
    manifestPath: options.manifestPath || null,
    createdAt: new Date(),
  }).run();
}

export function exportApplicationPacket(applicationId: number) {
  const settings = getIntegrationSettings();
  if (!settings.toggles.applicationPacketExport) {
    throw new Error('Application packet export is disabled in settings');
  }

  const db = getDb();
  const application = db.select().from(applications).where(eq(applications.id, applicationId)).get();
  if (!application) throw new Error('Application not found');

  const timeline = db.select().from(applicationTimeline).where(eq(applicationTimeline.applicationId, applicationId)).all();
  const notes = db.select().from(applicationNotes).where(eq(applicationNotes.applicationId, applicationId)).all();
  const reminders = db.select().from(applicationReminders).where(eq(applicationReminders.applicationId, applicationId)).all();
  const links = db.select().from(applicationDocuments).where(eq(applicationDocuments.applicationId, applicationId)).all();
  const docs = links.map((link) => ({
    link,
    asset: link.documentAssetId
      ? db.select().from(documentAssets).where(eq(documentAssets.id, link.documentAssetId)).get()
      : null,
  }));
  const drafts = db.select().from(emailDrafts).where(eq(emailDrafts.applicationId, applicationId)).all();
  const personLinks = db.select().from(contactLinks).where(eq(contactLinks.applicationId, applicationId)).all();
  const people = personLinks.map((link) => ({
    link,
    contact: db.select().from(contacts).where(eq(contacts.id, link.contactId)).get(),
  }));

  const packet = {
    schemaVersion: '1.0',
    exportedAt: new Date().toISOString(),
    application,
    timeline,
    notes,
    reminders,
    documents: docs,
    emailDrafts: drafts,
    contacts: people,
  };

  const base = resolveExportFolder('application-packets');
  const folder = path.join(base, `application-${applicationId}-${Date.now()}`);
  fs.mkdirSync(folder, { recursive: true });

  const jsonPath = path.join(folder, 'packet.json');
  const mdPath = path.join(folder, 'summary.md');
  fs.writeFileSync(jsonPath, JSON.stringify(packet, null, 2), 'utf8');
  fs.writeFileSync(mdPath, toMarkdownPacket(packet), 'utf8');

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

  const recordCount =
    timeline.length +
    notes.length +
    reminders.length +
    links.length +
    drafts.length +
    personLinks.length +
    1;

  writeExportRun({
    exportType: 'application_packet',
    format: 'json',
    outputPath: jsonPath,
    applicationId,
    recordCount,
    manifestPath: mdPath,
  });
  writeExportRun({
    exportType: 'application_packet',
    format: 'markdown',
    outputPath: mdPath,
    applicationId,
    recordCount,
    manifestPath: jsonPath,
  });
  if (zipPath) {
    writeExportRun({
      exportType: 'application_packet',
      format: 'zip',
      outputPath: zipPath,
      applicationId,
      recordCount,
      manifestPath: jsonPath,
    });
  }

  return {
    success: true,
    folderPath: folder,
    jsonPath,
    markdownPath: mdPath,
    zipPath,
    recordCount,
  };
}
