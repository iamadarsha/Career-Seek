import fs from 'fs';
import path from 'path';
import os from 'os';
import { spawn } from 'child_process';
import { getDb } from '@/db';
import { applications, applicationReminders, exportedCalendarEvents } from '@/db/schema';
import { eq } from 'drizzle-orm';
import { getIntegrationSettings, resolveExportFolder } from './settings-service';

export interface CalendarExportInput {
  eventType: 'interview' | 'reminder' | 'follow_up' | 'custom';
  title: string;
  startsAt: Date;
  endsAt?: Date | null;
  location?: string | null;
  notes?: string | null;
  applicationId?: number | null;
  reminderId?: number | null;
}

function formatIcsDate(value: Date): string {
  const iso = value.toISOString().replace(/[-:]/g, '');
  return `${iso.slice(0, 15)}Z`;
}

function escapeIcsText(value: string): string {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/\n/g, '\\n')
    .replace(/,/g, '\\,')
    .replace(/;/g, '\\;');
}

function buildIcsContent(input: CalendarExportInput): string {
  const uid = `jobhunt-india-${Date.now()}-${Math.random().toString(36).slice(2)}@local`;
  const dtStamp = formatIcsDate(new Date());
  const start = formatIcsDate(input.startsAt);
  const end = formatIcsDate(
    input.endsAt || new Date(input.startsAt.getTime() + 30 * 60 * 1000),
  );
  const summary = escapeIcsText(input.title);
  const location = escapeIcsText(input.location || '');
  const description = escapeIcsText(input.notes || '');

  return [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//JobHunt India//Local Calendar Export//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:${uid}`,
    `DTSTAMP:${dtStamp}`,
    `DTSTART:${start}`,
    `DTEND:${end}`,
    `SUMMARY:${summary}`,
    `LOCATION:${location}`,
    `DESCRIPTION:${description}`,
    'END:VEVENT',
    'END:VCALENDAR',
    '',
  ].join('\r\n');
}

function safeFileName(value: string): string {
  return value.replace(/[^a-zA-Z0-9-_]+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
}

function openInDefaultCalendar(filePath: string): void {
  try {
    if (os.platform() === 'darwin') {
      spawn('open', [filePath], { detached: true, stdio: 'ignore' }).unref();
    } else if (os.platform() === 'win32') {
      spawn('cmd', ['/c', 'start', '', filePath], { detached: true, stdio: 'ignore' }).unref();
    }
  } catch {
    // Best effort only.
  }
}

export function exportCalendarEvent(input: CalendarExportInput): {
  success: boolean;
  filePath?: string;
  id?: number;
  error?: string;
} {
  try {
    const settings = getIntegrationSettings();
    if (!settings.toggles.calendar) {
      return { success: false, error: 'Calendar exports are disabled in settings' };
    }

    const db = getDb();
    const folder = resolveExportFolder('calendar-events');
    if (!fs.existsSync(folder)) {
      fs.mkdirSync(folder, { recursive: true });
    }

    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const name = safeFileName(`${input.eventType}-${input.title}`) || 'event';
    const filePath = path.join(folder, `${name}-${stamp}.ics`);
    const content = buildIcsContent(input);
    
    try {
      fs.writeFileSync(filePath, content, 'utf8');
    } catch (writeError: any) {
      return { success: false, error: `Failed to write ICS file: ${writeError.message}` };
    }

    const row = db.insert(exportedCalendarEvents).values({
      applicationId: input.applicationId || null,
      reminderId: input.reminderId || null,
      eventType: input.eventType,
      title: input.title,
      startsAt: input.startsAt,
      endsAt: input.endsAt || null,
      location: input.location || null,
      notes: input.notes || null,
      icsPath: filePath,
      createdAt: new Date(),
    }).returning().get();

    if (settings.calendar.autoOpenInCalendar) {
      openInDefaultCalendar(filePath);
    }

    return { success: true, filePath, id: row.id };
  } catch (error: any) {
    return { success: false, error: error?.message || 'Failed to export calendar event' };
  }
}

export function exportReminderAsCalendar(reminderId: number): {
  success: boolean;
  filePath?: string;
  id?: number;
  error?: string;
} {
  const db = getDb();
  const reminder = db.select().from(applicationReminders).where(eq(applicationReminders.id, reminderId)).get();
  if (!reminder) return { success: false, error: 'Reminder not found' };

  const app = db.select().from(applications).where(eq(applications.id, reminder.applicationId)).get();
  const settings = getIntegrationSettings();
  const durationMs = Math.max(5, settings.calendar.defaultDurationMinutes) * 60 * 1000;
  const startsAt = new Date(reminder.dueAt);
  const endsAt = new Date(startsAt.getTime() + durationMs);
  const title = `${reminder.title} — ${app?.company || 'Application'}`;

  return exportCalendarEvent({
    eventType: 'reminder',
    title,
    startsAt,
    endsAt,
    location: app?.url || app?.applyUrl || null,
    notes: `Application: ${app?.title || 'Unknown role'} at ${app?.company || 'Unknown company'}\nCategory: ${reminder.category || 'custom'}`,
    applicationId: reminder.applicationId,
    reminderId: reminder.id,
  });
}

export function exportApplicationEventAsCalendar(options: {
  applicationId: number;
  eventType: 'interview' | 'follow_up' | 'custom';
  startsAt?: Date;
  endsAt?: Date;
  title?: string;
  location?: string;
  notes?: string;
}): {
  success: boolean;
  filePath?: string;
  id?: number;
  error?: string;
} {
  const db = getDb();
  const app = db.select().from(applications).where(eq(applications.id, options.applicationId)).get();
  if (!app) return { success: false, error: 'Application not found' };

  const settings = getIntegrationSettings();
  const start =
    options.startsAt ||
    app.nextFollowUpAt ||
    new Date(Date.now() + settings.calendar.defaultLeadMinutes * 60 * 1000);
  const startsAt = new Date(start);
  const endsAt = options.endsAt || new Date(startsAt.getTime() + settings.calendar.defaultDurationMinutes * 60 * 1000);

  const defaultTitle =
    options.eventType === 'interview'
      ? `Interview: ${app.title} @ ${app.company}`
      : `Follow-up: ${app.title} @ ${app.company}`;

  return exportCalendarEvent({
    eventType: options.eventType,
    title: options.title || defaultTitle,
    startsAt,
    endsAt,
    location: options.location || app.url || app.applyUrl || null,
    notes:
      options.notes ||
      `Application status: ${app.status}\nRole: ${app.title}\nCompany: ${app.company}`,
    applicationId: app.id,
  });
}
