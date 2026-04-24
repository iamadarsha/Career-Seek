import fs from 'fs';
import path from 'path';
import { and, desc, eq } from 'drizzle-orm';
import { getDb } from '@/db';
import { applications, contacts, emailDrafts } from '@/db/schema';
import { getIntegrationSettings, resolveExportFolder } from './settings-service';
import { generateGroundedEmail } from './ai-email-service';

export type DraftType = 'follow_up' | 'thank_you' | 'recruiter_reply' | 'outreach';

/**
 * Fallback subject lines if AI is unavailable.
 */
function buildSubject(draftType: DraftType, app: any): string {
  if (draftType === 'thank_you') return `Thank you — ${app.title} interview`;
  if (draftType === 'recruiter_reply') return `Re: ${app.title} opportunity at ${app.company}`;
  if (draftType === 'outreach') return `Connecting regarding ${app.title} at ${app.company}`;
  return `Follow-up on ${app.title} application`;
}

/**
 * Fallback body text if AI is unavailable.
 */
function buildBody(
  draftType: DraftType,
  tone: 'professional' | 'warm' | 'concise',
  app: any,
  contactName?: string,
): { text: string; markdown: string } {
  const greeting = contactName ? `Hi ${contactName},` : 'Hi there,';
  const signOff = tone === 'warm' ? 'Warm regards,' : 'Best regards,';

  let body = '';
  if (draftType === 'follow_up') {
    body = `${greeting}\n\nI wanted to follow up on my application for the ${app.title} role at ${app.company}. I remain very interested in the opportunity and would be happy to share any additional context that is helpful.\n\nThank you for your time and consideration.\n\n${signOff}`;
  } else if (draftType === 'thank_you') {
    body = `${greeting}\n\nThank you for taking the time to speak with me about the ${app.title} role at ${app.company}. I appreciated learning more about the team and priorities. The conversation reinforced my interest in contributing to this role.\n\nPlease let me know if I can provide anything further.\n\n${signOff}`;
  } else if (draftType === 'outreach') {
    body = `${greeting}\n\nI'm reaching out because I'm very interested in the ${app.title} position at ${app.company}. Based on my background, I believe I could bring significant value to the team.\n\nI would love to connect and discuss how I can help.\n\n${signOff}`;
  } else {
    body = `${greeting}\n\nThank you for your update regarding the ${app.title} role at ${app.company}. I appreciate the response and remain interested in next steps. Please let me know if there is any additional information I can share.\n\n${signOff}`;
  }

  const markdown = body
    .split('\n')
    .map((line) => line.trim().length === 0 ? '' : line)
    .join('\n\n');

  return { text: body, markdown };
}

export async function generateAndSaveEmailDraft(options: {
  applicationId: number;
  draftType: DraftType;
  contactId?: number;
}) {
  const db = getDb();
  const settings = getIntegrationSettings();
  if (!settings.toggles.emailDrafts) {
    throw new Error('Email drafts are disabled in settings');
  }

  const app = db.select().from(applications).where(eq(applications.id, options.applicationId)).get();
  if (!app) throw new Error('Application not found');

  const contact = options.contactId
    ? db.select().from(contacts).where(eq(contacts.id, options.contactId)).get()
    : null;

  const tone = settings.email.defaultTone;
  
  let subject: string;
  let bodyText: string;
  let bodyMarkdown: string;

  try {
    // Attempt AI-powered grounded generation if enabled
    if (settings.toggles.useAiForEmails) {
      const aiDraft = await generateGroundedEmail({
        applicationId: options.applicationId,
        draftType: options.draftType,
        contactId: options.contactId,
        tone,
      });
      subject = aiDraft.subject;
      bodyText = aiDraft.body;
      bodyMarkdown = aiDraft.markdown;
    } else {
      throw new Error('AI email generation disabled in settings');
    }
  } catch (error) {
    console.warn('AI email generation failed, falling back to templates:', error);
    // Fallback to static templates
    subject = buildSubject(options.draftType, app);
    const body = buildBody(options.draftType, tone, app, contact?.fullName || undefined);
    bodyText = body.text;
    bodyMarkdown = body.markdown;
  }

  const latest = db.select().from(emailDrafts)
    .where(and(
      eq(emailDrafts.applicationId, options.applicationId),
      eq(emailDrafts.draftType, options.draftType),
    ))
    .orderBy(desc(emailDrafts.version))
    .get();
  const nextVersion = (latest?.version || 0) + 1;

  return db.insert(emailDrafts).values({
    applicationId: options.applicationId,
    contactId: options.contactId || null,
    draftType: options.draftType,
    subject,
    contentText: bodyText,
    contentMarkdown: bodyMarkdown,
    tone,
    version: nextVersion,
    status: 'active',
    createdAt: new Date(),
    updatedAt: new Date(),
  }).returning().get();
}

export function listEmailDraftsForApplication(applicationId: number) {
  const db = getDb();
  return db.select().from(emailDrafts)
    .where(eq(emailDrafts.applicationId, applicationId))
    .orderBy(desc(emailDrafts.createdAt))
    .all();
}

export function exportEmailDraft(options: {
  draftId: number;
  format: 'text' | 'markdown';
}) {
  const db = getDb();
  const draft = db.select().from(emailDrafts).where(eq(emailDrafts.id, options.draftId)).get();
  if (!draft) throw new Error('Email draft not found');

  const folder = resolveExportFolder('email-drafts');
  if (!fs.existsSync(folder)) {
    fs.mkdirSync(folder, { recursive: true });
  }

  const extension = options.format === 'markdown' ? 'md' : 'txt';
  const content = options.format === 'markdown'
    ? (draft.contentMarkdown || draft.contentText)
    : draft.contentText;
  const filePath = path.join(folder, `email-draft-${draft.id}-v${draft.version}.${extension}`);
  
  try {
    fs.writeFileSync(filePath, content, 'utf8');
  } catch (writeError: any) {
    throw new Error(`Failed to write email draft file: ${writeError.message}`);
  }
  return { filePath };
}
