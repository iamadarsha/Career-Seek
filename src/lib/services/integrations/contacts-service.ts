import { getDb } from '@/db';
import { applications, contactLinks, contacts } from '@/db/schema';
import { and, desc, eq } from 'drizzle-orm';
import { getIntegrationSettings } from './settings-service';

function ensureContactsEnabled() {
  const settings = getIntegrationSettings();
  if (!settings.toggles.contacts) {
    throw new Error('Contacts are disabled in settings');
  }
}

export function createContact(data: {
  fullName: string;
  role?: string;
  company?: string;
  source?: string;
  linkedinUrl?: string;
  email?: string;
  notes?: string;
  outreachStatus?: string;
}) {
  ensureContactsEnabled();
  const db = getDb();
  const now = new Date();
  return db.insert(contacts).values({
    fullName: data.fullName,
    role: data.role || null,
    company: data.company || null,
    source: data.source || null,
    linkedinUrl: data.linkedinUrl || null,
    email: data.email || null,
    notes: data.notes || null,
    outreachStatus: data.outreachStatus || 'not_started',
    createdAt: now,
    updatedAt: now,
  }).returning().get();
}

export function updateContact(contactId: number, updates: Partial<{
  fullName: string;
  role: string;
  company: string;
  source: string;
  linkedinUrl: string;
  email: string;
  notes: string;
  outreachStatus: string;
}>) {
  ensureContactsEnabled();
  const db = getDb();
  db.update(contacts)
    .set({
      ...updates,
      updatedAt: new Date(),
    })
    .where(eq(contacts.id, contactId))
    .run();
  return db.select().from(contacts).where(eq(contacts.id, contactId)).get();
}

export function listContacts() {
  ensureContactsEnabled();
  const db = getDb();
  return db.select().from(contacts).orderBy(desc(contacts.updatedAt)).all();
}

export function linkContactToApplication(options: {
  contactId: number;
  applicationId: number;
  relationship?: string;
}) {
  ensureContactsEnabled();
  const db = getDb();
  const app = db.select().from(applications).where(eq(applications.id, options.applicationId)).get();
  if (!app) throw new Error('Application not found');

  const existing = db.select().from(contactLinks).where(and(
    eq(contactLinks.contactId, options.contactId),
    eq(contactLinks.applicationId, options.applicationId),
  )).get();
  if (existing) return existing;

  return db.insert(contactLinks).values({
    contactId: options.contactId,
    applicationId: options.applicationId,
    scoredJobId: app.scoredJobId || null,
    relationship: options.relationship || 'recruiter',
    createdAt: new Date(),
  }).returning().get();
}

export function getContactsForApplication(applicationId: number) {
  ensureContactsEnabled();
  const db = getDb();
  const links = db.select().from(contactLinks)
    .where(eq(contactLinks.applicationId, applicationId))
    .all();

  return links.map((link) => ({
    link,
    contact: db.select().from(contacts).where(eq(contacts.id, link.contactId)).get(),
  }));
}
