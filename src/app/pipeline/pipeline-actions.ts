'use server';

/**
 * Pipeline Server Actions — Phase G
 * 
 * Orchestrates all CRM operations from the UI.
 */

import {
  createApplication,
  createFromScoredJob,
  getApplication,
  listApplications,
  changeStatus,
  updateApplication,
  deleteApplication,
  getApplicationCounts,
  getDistinctCompanies,
  getDistinctPortals,
  getStatusLabel,
  getStatusColor,
} from '@/lib/services/crm/application-service';
import { getTimeline, getRecentActivity, addTimelineEvent } from '@/lib/services/crm/timeline-service';
import {
  createReminder,
  completeReminder,
  deleteReminder,
  getReminders,
  getOverdueReminders,
  getUpcomingReminders,
  getDueToday,
} from '@/lib/services/crm/reminder-service';
import {
  createNote,
  updateNote,
  deleteNote,
  togglePin,
  getNotes,
} from '@/lib/services/crm/notes-service';
import { linkDocument, getLinkedDocuments, autoLinkDocuments } from '@/lib/services/crm/document-linkage';
import { getCrmDashboard, getSmartSuggestions } from '@/lib/services/crm/dashboard-crm';
import { exportCrmData, importCrmData, listExports } from '@/lib/services/crm/export-service';
import {
  exportApplicationEventAsCalendar,
  exportReminderAsCalendar,
} from '@/lib/services/integrations/calendar-export-service';
import {
  generateAndSaveEmailDraft,
  listEmailDraftsForApplication,
  exportEmailDraft,
} from '@/lib/services/integrations/email-draft-service';
import {
  createContact,
  listContacts,
  linkContactToApplication,
  getContactsForApplication,
  updateContact,
} from '@/lib/services/integrations/contacts-service';
import { exportApplicationPacket } from '@/lib/services/integrations/application-export-service';
import { exportWorkspaceBackup } from '@/lib/services/integrations/backup-service';
import {
  importWorkspaceBackup,
  importContactsCsv,
  importAssetMetadata,
} from '@/lib/services/integrations/import-service';
import {
  getIntegrationSettings,
  updateIntegrationSettings,
  type IntegrationSettings,
} from '@/lib/services/integrations/settings-service';
import type { ApplicationStatus } from '@/db/schema';

// ── Application CRUD ─────────────────────────────────────────────────────

export async function actionTrackJob(scoredJobId: number) {
  try {
    const app = createFromScoredJob(scoredJobId);
    return { success: true, application: app };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

export async function actionCreateApplication(data: {
  title: string;
  company: string;
  location?: string;
  portal?: string;
  url?: string;
  applyUrl?: string;
  status?: ApplicationStatus;
  priority?: string;
}) {
  try {
    const app = createApplication(data);
    return { success: true, application: app };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

export async function actionGetApplication(id: number) {
  const app = getApplication(id);
  if (!app) return { success: false, error: 'Not found' };
  return { success: true, application: app };
}

export async function actionListApplications(filters?: {
  status?: ApplicationStatus;
  company?: string;
  portal?: string;
  priority?: string;
  search?: string;
}) {
  const apps = listApplications(filters);
  return { success: true, applications: apps };
}

export async function actionChangeStatus(applicationId: number, newStatus: ApplicationStatus) {
  try {
    const app = changeStatus(applicationId, newStatus);
    return { success: true, application: app };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

export async function actionUpdateApplication(id: number, updates: {
  priority?: string;
  tags?: string;
  nextFollowUpAt?: string | null;
}) {
  try {
    const parsed: any = { ...updates };
    if (updates.nextFollowUpAt) parsed.nextFollowUpAt = new Date(updates.nextFollowUpAt);
    const app = updateApplication(id, parsed);
    return { success: true, application: app };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

export async function actionListApplicationsForSelector() {
  // Simple list for dropdowns
  const apps = listApplications();
  return { success: true, applications: apps.map(a => ({ id: a.id, title: a.title, company: a.company })) };
}

export async function actionDeleteApplication(id: number) {
  try {
    deleteApplication(id);
    return { success: true };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

// ── Timeline ─────────────────────────────────────────────────────────────

export async function actionGetTimeline(applicationId: number) {
  const events = getTimeline(applicationId);
  return { success: true, events };
}

export async function actionAddCustomEvent(applicationId: number, title: string, description?: string) {
  const event = addTimelineEvent({
    applicationId,
    eventType: 'custom',
    title,
    description,
  });
  return { success: true, event };
}

// ── Notes ────────────────────────────────────────────────────────────────

export async function actionCreateNote(applicationId: number, content: string, category?: string) {
  try {
    const note = createNote({ applicationId, content, category });
    return { success: true, note };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

export async function actionUpdateNote(noteId: number, content: string, category?: string) {
  const note = updateNote(noteId, content, category);
  return { success: true, note };
}

export async function actionDeleteNote(noteId: number) {
  deleteNote(noteId);
  return { success: true };
}

export async function actionTogglePin(noteId: number) {
  togglePin(noteId);
  return { success: true };
}

export async function actionGetNotes(applicationId: number) {
  const notes = getNotes(applicationId);
  return { success: true, notes };
}

// ── Reminders ────────────────────────────────────────────────────────────

export async function actionCreateReminder(data: {
  applicationId: number;
  title: string;
  description?: string;
  dueAt: string;
  category?: string;
}) {
  try {
    const reminder = createReminder({
      ...data,
      dueAt: new Date(data.dueAt),
    });
    return { success: true, reminder };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

export async function actionCompleteReminder(reminderId: number) {
  try {
    completeReminder(reminderId);
    return { success: true };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

export async function actionDeleteReminder(reminderId: number) {
  deleteReminder(reminderId);
  return { success: true };
}

export async function actionGetReminders(applicationId: number) {
  const reminders = getReminders(applicationId);
  return { success: true, reminders };
}

export async function actionGetOverdueReminders() {
  const reminders = getOverdueReminders();
  return { success: true, reminders };
}

export async function actionGetDueToday() {
  const reminders = getDueToday();
  return { success: true, reminders };
}

// ── Document Linkage ─────────────────────────────────────────────────────

export async function actionGetLinkedDocuments(applicationId: number) {
  const docs = getLinkedDocuments(applicationId);
  return { success: true, documents: docs };
}

export async function actionAutoLinkDocuments(applicationId: number, scoredJobId: number) {
  const result = autoLinkDocuments(applicationId, scoredJobId);
  return { success: true, linked: result.linked };
}

// ── Dashboard ────────────────────────────────────────────────────────────

export async function actionGetCrmDashboard() {
  const dashboard = getCrmDashboard();
  return { success: true, dashboard };
}

export async function actionGetSmartSuggestions() {
  const suggestions = getSmartSuggestions();
  return { success: true, suggestions };
}

export async function actionGetApplicationCounts() {
  const counts = getApplicationCounts();
  return { success: true, counts };
}

export async function actionGetFilterOptions() {
  const companies = getDistinctCompanies();
  const portals = getDistinctPortals();
  return { success: true, companies, portals };
}

// ── Export/Import ────────────────────────────────────────────────────────

export async function actionExportCrm() {
  try {
    const result = exportCrmData();
    return { success: true, ...result };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

export async function actionListExports() {
  const exports = listExports();
  return { success: true, exports };
}

// ── Phase I: Integrations ────────────────────────────────────────────────

export async function actionExportReminderCalendar(reminderId: number) {
  return exportReminderAsCalendar(reminderId);
}

export async function actionExportApplicationCalendar(options: {
  applicationId: number;
  eventType: 'interview' | 'follow_up' | 'custom';
  startsAt?: string;
  endsAt?: string;
  title?: string;
  location?: string;
  notes?: string;
}) {
  return exportApplicationEventAsCalendar({
    applicationId: options.applicationId,
    eventType: options.eventType,
    startsAt: options.startsAt ? new Date(options.startsAt) : undefined,
    endsAt: options.endsAt ? new Date(options.endsAt) : undefined,
    title: options.title,
    location: options.location,
    notes: options.notes,
  });
}

export async function actionGenerateEmailDraft(options: {
  applicationId: number;
  draftType: 'follow_up' | 'thank_you' | 'recruiter_reply' | 'outreach';
  contactId?: number;
}) {
  try {
    const draft = await generateAndSaveEmailDraft(options);
    return { success: true, draft };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

export async function actionListEmailDrafts(applicationId: number) {
  const drafts = listEmailDraftsForApplication(applicationId);
  return { success: true, drafts };
}

export async function actionExportEmailDraft(draftId: number, format: 'text' | 'markdown') {
  try {
    const result = exportEmailDraft({ draftId, format });
    return { success: true, ...result };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

export async function actionCreateContact(data: {
  fullName: string;
  role?: string;
  company?: string;
  source?: string;
  linkedinUrl?: string;
  email?: string;
  notes?: string;
  outreachStatus?: string;
}) {
  try {
    const contact = createContact(data);
    return { success: true, contact };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

export async function actionUpdateContact(contactId: number, updates: Partial<{
  fullName: string;
  role: string;
  company: string;
  source: string;
  linkedinUrl: string;
  email: string;
  notes: string;
  outreachStatus: string;
}>) {
  try {
    const contact = updateContact(contactId, updates);
    return { success: true, contact };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

export async function actionListContacts() {
  try {
    return { success: true, contacts: listContacts() };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

export async function actionGetApplicationContacts(applicationId: number) {
  try {
    return { success: true, contacts: getContactsForApplication(applicationId) };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

export async function actionLinkContactToApplication(options: {
  contactId: number;
  applicationId: number;
  relationship?: string;
}) {
  try {
    const link = linkContactToApplication(options);
    return { success: true, link };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

export async function actionExportApplicationPacket(applicationId: number) {
  try {
    return exportApplicationPacket(applicationId);
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

export async function actionExportWorkspaceBackup() {
  try {
    return exportWorkspaceBackup();
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

export async function actionImportWorkspaceBackup(filePath: string) {
  try {
    return importWorkspaceBackup(filePath);
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

export async function actionImportContactsCsv(filePath: string) {
  try {
    return importContactsCsv(filePath);
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

export async function actionImportAssetMetadata(filePath: string) {
  try {
    return importAssetMetadata(filePath);
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

export async function actionGetIntegrationSettings() {
  const settings = getIntegrationSettings();
  return { success: true, settings };
}

export async function actionUpdateIntegrationSettings(updates: Partial<IntegrationSettings>) {
  const settings = updateIntegrationSettings(updates);
  return { success: true, settings };
}
