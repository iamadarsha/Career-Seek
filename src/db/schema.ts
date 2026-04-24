import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';

// ==========================================
// Phase K: Platform Identity — K-1
// ==========================================

export const users = sqliteTable('users', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  externalId: text('external_id').unique(), // future auth provider sub
  email: text('email'),
  displayName: text('display_name'),
  isBootstrap: integer('is_bootstrap', { mode: 'boolean' }).default(false),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull(),
});

export const userProfiles = sqliteTable('user_profiles', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  userId: integer('user_id').notNull().references(() => users.id),
  name: text('name').notNull().default('Default'),
  headline: text('headline'),
  isDefault: integer('is_default', { mode: 'boolean' }).default(false),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull(),
});

export const appSettings = sqliteTable('app_settings', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  key: text('key').notNull().unique(), // e.g., 'gemini_api_key', 'onboarding_step'
  value: text('value').notNull(),
});

export const uploadedResumes = sqliteTable('uploaded_resumes', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  profileId: integer('profile_id').references(() => userProfiles.id), // K-1 ownership
  filename: text('filename').notNull(),
  originalPath: text('original_path').notNull(),
  mimeType: text('mime_type').notNull(),
  parsedText: text('parsed_text'),
  parseMetadata: text('parse_metadata'), // JSON
  uploadedAt: integer('uploaded_at', { mode: 'timestamp' }).notNull(),
});

export const masterProfiles = sqliteTable('master_profiles', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  profileId: integer('profile_id').references(() => userProfiles.id), // K-1 ownership
  fullName: text('full_name'),
  headline: text('headline'),
  yearsOfExperience: integer('years_of_experience'),
  targetSeniority: text('target_seniority'),
  skillsExplicit: text('skills_explicit'), // JSON array
  skillsInferred: text('skills_inferred'), // JSON array
  tools: text('tools'), // JSON array
  domains: text('domains'), // JSON array
  experience: text('experience'), // JSON array
  projects: text('projects'), // JSON array
  achievements: text('achievements'), // JSON array
  education: text('education'), // JSON array
  certifications: text('certifications'), // JSON array
  strengths: text('strengths'), // JSON array
  gaps: text('gaps'), // JSON array
  rawSummary: text('raw_summary'),
  updatedAt: integer('updated_at', { mode: 'timestamp' }),
});

export const searchProfiles = sqliteTable('search_profiles', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  profileId: integer('profile_id').references(() => userProfiles.id), // K-1 ownership
  title: text('title').notNull(), // e.g. "Frontend Engineer"
  locations: text('locations'), // JSON array
  workModel: text('work_model'), // remote, hybrid, onsite
  expectedSalary: text('expected_salary'),
  experienceBand: text('experience_band'),
  companyTypes: text('company_types'), // startup, mnc, etc
  preferredPortals: text('preferred_portals'), // JSON array
  mustHaveKeywords: text('must_have_keywords'), // JSON array
  avoidKeywords: text('avoid_keywords'), // JSON array
  noticePeriod: text('notice_period'),
  relocationWillingness: integer('relocation_willingness', { mode: 'boolean' }),
  isActive: integer('is_active', { mode: 'boolean' }).default(true),
});


export const scans = sqliteTable('scans', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  profileId: integer('profile_id').references(() => userProfiles.id), // K-1 ownership
  searchProfileId: integer('search_profile_id').references(() => searchProfiles.id),
  status: text('status').notNull().default('queued'), // queued, preparing, scraping, normalizing, deduplicating, complete, partial, failed
  startedAt: integer('started_at', { mode: 'timestamp' }),
  finishedAt: integer('finished_at', { mode: 'timestamp' }),
  totalJobs: integer('total_jobs').default(0),
  error: text('error'),
});

export const scanPortalRuns = sqliteTable('scan_portal_runs', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  scanId: integer('scan_id').notNull().references(() => scans.id),
  portal: text('portal').notNull(),
  status: text('status').notNull().default('queued'), // queued, running, complete, failed
  jobsFound: integer('jobs_found').default(0),
  error: text('error'),
  startedAt: integer('started_at', { mode: 'timestamp' }),
  finishedAt: integer('finished_at', { mode: 'timestamp' }),
});

export const searchExpansions = sqliteTable('search_expansions', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  scanPortalRunId: integer('scan_portal_run_id').notNull().references(() => scanPortalRuns.id),
  reason: text('reason').notNull(),
  oldQuery: text('old_query').notNull(),
  newQuery: text('new_query').notNull(),
  timestamp: integer('timestamp', { mode: 'timestamp' }).notNull(),
});

export const normalizedJobs = sqliteTable('normalized_jobs', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  profileId: integer('profile_id').references(() => userProfiles.id), // K-1 isolation
  scanId: integer('scan_id').notNull().references(() => scans.id),
  searchProfileId: integer('search_profile_id').notNull().references(() => searchProfiles.id),
  portal: text('portal').notNull(),
  externalId: text('external_id'),
  title: text('title').notNull(),
  company: text('company').notNull(),
  location: text('location'),
  isRemote: integer('is_remote', { mode: 'boolean' }),
  isHybrid: integer('is_hybrid', { mode: 'boolean' }),
  salaryRaw: text('salary_raw'),
  salaryMin: integer('salary_min'),
  salaryMax: integer('salary_max'),
  salaryCurrency: text('salary_currency'),
  experienceRaw: text('experience_raw'),
  experienceMin: integer('experience_min'),
  experienceMax: integer('experience_max'),
  url: text('url').notNull(),
  applyUrl: text('apply_url'),
  postedDateRaw: text('posted_date_raw'),
  postedDate: integer('posted_date', { mode: 'timestamp' }),
  snippet: text('snippet'),
  employmentType: text('employment_type'),
  rawPayloadPath: text('raw_payload_path'),
  scrapedAt: integer('scraped_at', { mode: 'timestamp' }).notNull(),
});

export const jobDuplicates = sqliteTable('job_duplicates', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  canonicalJobId: integer('canonical_job_id').notNull().references(() => normalizedJobs.id),
  duplicateJobId: integer('duplicate_job_id').notNull().references(() => normalizedJobs.id),
  matchType: text('match_type').notNull(), // 'exact_url', 'external_id', 'signature'
  detectedAt: integer('detected_at', { mode: 'timestamp' }).notNull(),
});

export const scoredJobs = sqliteTable('scored_jobs', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  profileId: integer('profile_id').references(() => userProfiles.id), // K-1 ownership
  normalizedJobId: integer('normalized_job_id').notNull().references(() => normalizedJobs.id).unique(),
  masterProfileId: integer('master_profile_id').notNull().references(() => masterProfiles.id),
  searchProfileId: integer('search_profile_id').notNull().references(() => searchProfiles.id),
  score: integer('score').notNull(),
  tier: text('tier').notNull(), // 'A', 'B', 'C', 'D'
  breakdown: text('breakdown'), // JSON object explaining positive/negative factors
  scoredAt: integer('scored_at', { mode: 'timestamp' }).notNull(),
});

export const jobEnrichments = sqliteTable('job_enrichments', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  scoredJobId: integer('scored_job_id').notNull().references(() => scoredJobs.id).unique(),
  fitSummary: text('fit_summary'),
  pros: text('pros'), // JSON array
  cons: text('cons'), // JSON array
  interviewAngle: text('interview_angle'),
  salaryEstimate: text('salary_estimate'),
  resumeFocus: text('resume_focus'),
  enrichedAt: integer('enriched_at', { mode: 'timestamp' }).notNull(),
});

export const searchQueries = sqliteTable('search_queries', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  profileId: integer('profile_id').references(() => userProfiles.id), // K-1 isolation
  query: text('query').notNull(),
  results: text('results'), // JSON array of job IDs and reasons
  timestamp: integer('timestamp', { mode: 'timestamp' }).notNull(),
});

export const jdAnalyses = sqliteTable('jd_analyses', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  scoredJobId: integer('scored_job_id').notNull().references(() => scoredJobs.id).unique(),
  mustHaveSkills: text('must_have_skills'), // JSON array
  preferredSkills: text('preferred_skills'), // JSON array
  atsKeywords: text('ats_keywords'), // JSON array
  domainLanguage: text('domain_language'), // JSON array
  senioritySignals: text('seniority_signals'), // JSON array
  leadershipSignals: text('leadership_signals'), // JSON array
  toolRequirements: text('tool_requirements'), // JSON array
  businessContext: text('business_context'),
  hiringPriorities: text('hiring_priorities'),
  analyzedAt: integer('analyzed_at', { mode: 'timestamp' }).notNull(),
});

export const documentAssets = sqliteTable('document_assets', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  profileId: integer('profile_id').references(() => userProfiles.id), // K-1 ownership
  scoredJobId: integer('scored_job_id').notNull().references(() => scoredJobs.id),
  type: text('type').notNull(), // 'resume', 'cover_letter', 'outreach_note', 'ats_report'
  content: text('content'), // JSON or text content
  filePath: text('file_path'), // path to the generated docx file if applicable
  atsScore: integer('ats_score'), // only for ats_report
  version: integer('version').default(1),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
});

// ── Phase F: RAG Corpus & AI Coach ─────────────────────────────────────────

export const documentChunks = sqliteTable('document_chunks', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  profileId: integer('profile_id').references(() => userProfiles.id), // K-1 isolation
  chunkId: text('chunk_id').notNull().unique(), // deterministic hash: sourceType:sourceId:sectionIdx
  sourceType: text('source_type').notNull(), // 'master_profile', 'resume_text', 'job_description', 'tailored_resume', 'ats_report', 'cover_letter', 'outreach_note', 'enrichment', 'search_preferences', 'jd_analysis'
  sourceId: integer('source_id'), // FK to the source table row
  scoredJobId: integer('scored_job_id'), // nullable — null for profile-level chunks
  section: text('section'), // e.g. 'experience_0', 'skills', 'summary', 'qualifications'
  content: text('content').notNull(), // the raw text chunk
  metadata: text('metadata'), // JSON: extra labels, timestamps, etc.
  embedding: text('embedding'), // JSON float array (768-dim)
  tokenCount: integer('token_count'),
  indexedAt: integer('indexed_at', { mode: 'timestamp' }).notNull(),
});

export const indexRuns = sqliteTable('index_runs', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  profileId: integer('profile_id').references(() => userProfiles.id), // K-1 isolation
  sourceType: text('source_type').notNull(),
  sourceId: integer('source_id'),
  chunksCreated: integer('chunks_created').default(0),
  status: text('status').notNull().default('pending'), // pending, running, complete, failed
  startedAt: integer('started_at', { mode: 'timestamp' }),
  finishedAt: integer('finished_at', { mode: 'timestamp' }),
  error: text('error'),
});

export const coachThreads = sqliteTable('coach_threads', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  userId: integer('user_id').references(() => users.id), // K-1 ownership
  profileId: integer('profile_id').references(() => userProfiles.id), // K-1 ownership
  title: text('title'), // auto-generated from first question
  scoredJobId: integer('scored_job_id'), // nullable — null for profile-only coaching
  scope: text('scope').notNull().default('job_and_profile'), // 'job_only', 'job_and_profile', 'job_and_resume', 'all_materials', 'profile_only'
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull(),
});

export const coachMessages = sqliteTable('coach_messages', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  threadId: integer('thread_id').notNull().references(() => coachThreads.id),
  role: text('role').notNull(), // 'user' or 'assistant'
  content: text('content').notNull(),
  confidenceLevel: text('confidence_level'), // 'high', 'medium', 'low' — only for assistant
  answerMode: text('answer_mode'), // 'concise', 'detailed' — only for assistant
  retrievedChunkIds: text('retrieved_chunk_ids'), // JSON array of chunk IDs used
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
});

export const messageSources = sqliteTable('message_sources', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  messageId: integer('message_id').notNull().references(() => coachMessages.id),
  chunkId: text('chunk_id').notNull(), // FK to documentChunks.chunkId
  relevanceScore: integer('relevance_score'), // 0-100
  snippetPreview: text('snippet_preview'), // short excerpt shown in UI
  sourceLabel: text('source_label'), // human-readable: "Resume — Experience at Google"
});

// ── Phase G: Career CRM & Application Operations ───────────────────────────

export const APPLICATION_STATUSES = [
  'saved',
  'preparing',
  'applied',
  'follow_up_due',
  'recruiter_replied',
  'interview_scheduled',
  'interviewed',
  'assessment',
  'offer',
  'rejected',
  'archived',
] as const;
export type ApplicationStatus = typeof APPLICATION_STATUSES[number];

export const applications = sqliteTable('applications', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  profileId: integer('profile_id').references(() => userProfiles.id), // K-1 ownership
  scoredJobId: integer('scored_job_id').references(() => scoredJobs.id),
  normalizedJobId: integer('normalized_job_id').references(() => normalizedJobs.id),
  // Denormalized for fast display
  title: text('title').notNull(),
  company: text('company').notNull(),
  location: text('location'),
  portal: text('portal'),
  url: text('url'),
  applyUrl: text('apply_url'),
  // Status lifecycle
  status: text('status').notNull().default('saved'), // ApplicationStatus
  previousStatus: text('previous_status'),
  // Score snapshot at time of tracking
  scoreSnapshot: integer('score_snapshot'),
  tierSnapshot: text('tier_snapshot'),
  // Timestamps
  savedAt: integer('saved_at', { mode: 'timestamp' }).notNull(),
  appliedAt: integer('applied_at', { mode: 'timestamp' }),
  lastStatusChangeAt: integer('last_status_change_at', { mode: 'timestamp' }),
  nextFollowUpAt: integer('next_follow_up_at', { mode: 'timestamp' }),
  // Metadata
  tags: text('tags'), // JSON array
  priority: text('priority').default('normal'), // 'high', 'normal', 'low'
  archivedAt: integer('archived_at', { mode: 'timestamp' }),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull(),
});

export const TIMELINE_EVENT_TYPES = [
  'application_created',
  'status_changed',
  'applied_marked',
  'resume_generated',
  'cover_letter_generated',
  'outreach_note_generated',
  'ats_report_generated',
  'outreach_copied',
  'recruiter_contacted',
  'referral_requested',
  'follow_up_sent',
  'note_added',
  'reminder_created',
  'reminder_completed',
  'interview_scheduled',
  'interview_completed',
  'assessment_assigned',
  'offer_received',
  'rejection_recorded',
  'document_attached',
  'custom',
] as const;

export const applicationTimeline = sqliteTable('application_timeline', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  applicationId: integer('application_id').notNull().references(() => applications.id),
  eventType: text('event_type').notNull(), // TIMELINE_EVENT_TYPES
  title: text('title').notNull(),
  description: text('description'),
  metadata: text('metadata'), // JSON — extra event-specific data
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
});

export const applicationNotes = sqliteTable('application_notes', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  applicationId: integer('application_id').notNull().references(() => applications.id),
  content: text('content').notNull(),
  category: text('category').default('general'), // 'general', 'recruiter', 'interview', 'salary', 'referral', 'follow_up'
  isPinned: integer('is_pinned', { mode: 'boolean' }).default(false),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull(),
});

export const applicationReminders = sqliteTable('application_reminders', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  applicationId: integer('application_id').notNull().references(() => applications.id),
  profileId: integer('profile_id').references(() => userProfiles.id), // K-1 ownership
  userId: integer('user_id').references(() => users.id), // K-1 ownership
  title: text('title').notNull(),
  description: text('description'),
  dueAt: integer('due_at', { mode: 'timestamp' }).notNull(),
  isCompleted: integer('is_completed', { mode: 'boolean' }).default(false),
  completedAt: integer('completed_at', { mode: 'timestamp' }),
  category: text('category').default('follow_up'), // 'follow_up', 'interview_prep', 'deadline', 'custom'
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
});

export const applicationDocuments = sqliteTable('application_documents', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  applicationId: integer('application_id').notNull().references(() => applications.id),
  documentAssetId: integer('document_asset_id').references(() => documentAssets.id),
  documentType: text('document_type').notNull(), // 'resume', 'cover_letter', 'outreach_note', 'ats_report'
  version: integer('version').default(1),
  atsScore: integer('ats_score'), // snapshot at time of attachment
  linkedAt: integer('linked_at', { mode: 'timestamp' }).notNull(),
});

export const crmSettings = sqliteTable('crm_settings', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  key: text('key').notNull().unique(),
  value: text('value').notNull(),
});

// ==========================================
// Phase I: Integrations & Ecosystem Hooks
// ==========================================

export const contacts = sqliteTable('contacts', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  userId: integer('user_id').references(() => users.id), // K-1 ownership
  fullName: text('full_name').notNull(),
  role: text('role'),
  company: text('company'),
  source: text('source'),
  linkedinUrl: text('linkedin_url'),
  email: text('email'),
  notes: text('notes'),
  outreachStatus: text('outreach_status').default('not_started'), // not_started, drafted, contacted, replied
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull(),
});

export const contactLinks = sqliteTable('contact_links', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  contactId: integer('contact_id').notNull().references(() => contacts.id),
  applicationId: integer('application_id').references(() => applications.id),
  scoredJobId: integer('scored_job_id').references(() => scoredJobs.id),
  relationship: text('relationship').default('recruiter'), // recruiter, hiring_manager, referral, other
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
});

export const emailDrafts = sqliteTable('email_drafts', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  applicationId: integer('application_id').notNull().references(() => applications.id),
  contactId: integer('contact_id').references(() => contacts.id),
  draftType: text('draft_type').notNull(), // follow_up, thank_you, recruiter_reply
  subject: text('subject'),
  contentText: text('content_text').notNull(),
  contentMarkdown: text('content_markdown'),
  tone: text('tone'),
  version: integer('version').default(1),
  status: text('status').default('active'),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull(),
});

export const exportedCalendarEvents = sqliteTable('exported_calendar_events', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  applicationId: integer('application_id').references(() => applications.id),
  reminderId: integer('reminder_id').references(() => applicationReminders.id),
  eventType: text('event_type').notNull(), // interview, reminder, follow_up, custom
  title: text('title').notNull(),
  startsAt: integer('starts_at', { mode: 'timestamp' }).notNull(),
  endsAt: integer('ends_at', { mode: 'timestamp' }),
  location: text('location'),
  notes: text('notes'),
  icsPath: text('ics_path').notNull(),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
});

export const exportRuns = sqliteTable('export_runs', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  profileId: integer('profile_id').references(() => userProfiles.id), // K-1 ownership
  exportType: text('export_type').notNull(), // application_packet, workspace_backup
  applicationId: integer('application_id').references(() => applications.id),
  format: text('format').notNull(), // json, markdown, zip
  outputPath: text('output_path').notNull(),
  manifestPath: text('manifest_path'),
  status: text('status').notNull().default('success'),
  recordCount: integer('record_count').default(0),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
});

export const backupManifests = sqliteTable('backup_manifests', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  profileId: integer('profile_id').references(() => userProfiles.id), // K-1 ownership
  version: text('version').notNull().default('1.0'),
  manifestJson: text('manifest_json').notNull(),
  backupPath: text('backup_path').notNull(),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
});

export const importRuns = sqliteTable('import_runs', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  profileId: integer('profile_id').references(() => userProfiles.id), // K-1 ownership
  importType: text('import_type').notNull(), // workspace_backup, contacts_csv, asset_metadata
  sourcePath: text('source_path').notNull(),
  status: text('status').notNull().default('success'),
  importedCount: integer('imported_count').default(0),
  summary: text('summary'),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
});

// ==========================================
// Phase H: Automation, Scheduling, & Notifications
// ==========================================

export const automationRules = sqliteTable('automation_rules', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  profileId: integer('profile_id').references(() => userProfiles.id), // K-1 ownership
  name: text('name').notNull().unique(), // e.g. 'daily_scan', 'stale_check'
  isEnabled: integer('is_enabled', { mode: 'boolean' }).default(true),
  schedule: text('schedule'), // e.g. '0 9 * * *' or 'daily'
  config: text('config'), // JSON configuration (thresholds, selected portals)
  updatedAt: integer('updated_at', { mode: 'timestamp' }),
});

export const scheduledTasks = sqliteTable('scheduled_tasks', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  userId: integer('user_id').references(() => users.id),
  profileId: integer('profile_id').references(() => userProfiles.id),
  taskType: text('task_type').notNull(), // 'scan_jobs', 'check_reminders', 'stale_opportunity'
  status: text('status').default('idle'), // 'idle', 'running', 'failed'
  lastRunAt: integer('last_run_at', { mode: 'timestamp' }),
  nextRunAt: integer('next_run_at', { mode: 'timestamp' }),
  lockedUntil: integer('locked_until', { mode: 'timestamp' }),
  errorCount: integer('error_count').default(0),
});

export const automationRunLogs = sqliteTable('automation_run_logs', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  userId: integer('user_id').references(() => users.id),
  profileId: integer('profile_id').references(() => userProfiles.id),
  taskType: text('task_type').notNull(),
  triggerReason: text('trigger_reason').default('scheduled'), // 'scheduled', 'manual'
  startedAt: integer('started_at', { mode: 'timestamp' }).notNull(),
  endedAt: integer('ended_at', { mode: 'timestamp' }),
  status: text('status').notNull(), // 'success', 'failure'
  resultSummary: text('result_summary'),
  errorDetail: text('error_detail'),
});

export const notifications = sqliteTable('notifications', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  profileId: integer('profile_id').references(() => userProfiles.id), // K-1 ownership
  userId: integer('user_id').references(() => users.id), // K-1 ownership
  type: text('type').notNull(), // 'scan_complete', 'urgent_reminder', 'stale_opportunity', 'system'
  title: text('title').notNull(),
  message: text('message'),
  priority: text('priority').default('normal'), // 'low', 'normal', 'high'
  isRead: integer('is_read', { mode: 'boolean' }).default(false),
  isArchived: integer('is_archived', { mode: 'boolean' }).default(false),
  actionUrl: text('action_url'), // Link to application or job
  relatedEntityId: integer('related_entity_id'), // JobId or ApplicationId
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
});

export const notificationPreferences = sqliteTable('notification_preferences', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  profileId: integer('profile_id').references(() => userProfiles.id), // K-1 ownership
  userId: integer('user_id').references(() => users.id), // K-1 ownership
  category: text('category').notNull(), // e.g. 'scans', 'reminders', 'system'
  inAppEnabled: integer('in_app_enabled', { mode: 'boolean' }).default(true),
  desktopEnabled: integer('desktop_enabled', { mode: 'boolean' }).default(false),
  quietHoursStart: text('quiet_hours_start').default('22:00'),
  quietHoursEnd: text('quiet_hours_end').default('08:00'),
});

// ==========================================
// Phase J: Analytics, Insights & Optimization
// ==========================================

export const analyticsEvents = sqliteTable('analytics_events', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  userId: integer('user_id').references(() => users.id), // K-1 ownership
  profileId: integer('profile_id').references(() => userProfiles.id), // K-1 ownership
  eventType: text('event_type').notNull(),
  // e.g. job_discovered, job_scored, job_saved, resume_generated, cover_generated,
  //      outreach_generated, application_applied, status_changed, reminder_set,
  //      reminder_completed, recruiter_replied, interview_scheduled, offer_received,
  //      rejection_recorded, document_exported, draft_generated
  entityType: text('entity_type'), // 'scored_job' | 'application' | 'document_asset' | 'reminder'
  entityId: integer('entity_id'),
  // Denormalized searchable dimensions for fast aggregation
  portal: text('portal'),
  tier: text('tier'),
  score: integer('score'),
  applicationStatus: text('application_status'),
  metadata: text('metadata'), // JSON — any extra context
  occurredAt: integer('occurred_at', { mode: 'timestamp' }).notNull(),
});

export const analyticsSnapshots = sqliteTable('analytics_snapshots', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  profileId: integer('profile_id').references(() => userProfiles.id), // K-1 ownership
  snapshotType: text('snapshot_type').notNull(),
  // 'funnel_overall' | 'portal_performance' | 'document_performance' | 'time_latency'
  snapshotKey: text('snapshot_key').notNull(), // e.g. 'portal:linkedin' or 'all:30d'
  data: text('data').notNull(), // JSON — computed metrics
  periodStart: integer('period_start', { mode: 'timestamp' }).notNull(),
  periodEnd: integer('period_end', { mode: 'timestamp' }).notNull(),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
});

export const insightItems = sqliteTable('insight_items', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  userId: integer('user_id').references(() => users.id), // K-1 ownership
  profileId: integer('profile_id').references(() => userProfiles.id), // K-1 ownership
  insightType: text('insight_type').notNull(),
  // 'portal_performance' | 'apply_rate' | 'stale_opportunity' | 'follow_up_effect' |
  // 'ats_gap' | 'time_to_apply' | 'search_profile_yield' | 'outreach_gap' | 'cover_letter_usage'
  title: text('title').notNull(),
  body: text('body').notNull(),
  metricBasis: text('metric_basis'), // JSON — the numbers backing this insight
  timeWindow: text('time_window'), // '7d' | '30d' | 'all_time'
  confidence: text('confidence').notNull().default('low'), // 'low' | 'medium' | 'high'
  recommendedAction: text('recommended_action'),
  supportingData: text('supporting_data'), // JSON — entity refs for drill-down
  isDismissed: integer('is_dismissed', { mode: 'boolean' }).default(false),
  generatedAt: integer('generated_at', { mode: 'timestamp' }).notNull(),
});

export const weeklyReviews = sqliteTable('weekly_reviews', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  userId: integer('user_id').references(() => users.id), // K-1 ownership
  profileId: integer('profile_id').references(() => userProfiles.id), // K-1 ownership
  weekStart: integer('week_start', { mode: 'timestamp' }).notNull(),
  weekEnd: integer('week_end', { mode: 'timestamp' }).notNull(),
  summaryJson: text('summary_json').notNull(), // full JSON payload of the review
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
});

export const experiments = sqliteTable('experiments', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  userId: integer('user_id').references(() => users.id), // K-1 ownership
  profileId: integer('profile_id').references(() => userProfiles.id), // K-1 ownership
  name: text('name').notNull().unique(),
  hypothesis: text('hypothesis').notNull(),
  status: text('status').notNull().default('running'), // 'running' | 'concluded' | 'paused'
  startedAt: integer('started_at', { mode: 'timestamp' }).notNull(),
  endedAt: integer('ended_at', { mode: 'timestamp' }),
  affectedCriteria: text('affected_criteria'), // JSON — what changed
  metricsJson: text('metrics_json'), // JSON — observed metrics snapshot
  conclusion: text('conclusion'),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
});

export const experimentLinks = sqliteTable('experiment_links', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  experimentId: integer('experiment_id').notNull().references(() => experiments.id),
  applicationId: integer('application_id').references(() => applications.id),
  scoredJobId: integer('scored_job_id').references(() => scoredJobs.id),
  linkedAt: integer('linked_at', { mode: 'timestamp' }).notNull(),
});

// ==========================================
// Phase K: Background Jobs (K-2)
// ==========================================

export const platformJobs = sqliteTable('platform_jobs', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  userId: integer('user_id').references(() => users.id),
  profileId: integer('profile_id').references(() => userProfiles.id),
  jobType: text('job_type').notNull(), // 'scan_jobs' | 'score_jobs' | 'enrich_jobs' | 'generate_resume' | 'generate_cover_letter' | 'generate_outreach' | 'recompute_analytics' | 'export_report' | 'run_reminders'
  status: text('status').notNull().default('queued'), // 'queued' | 'running' | 'succeeded' | 'failed' | 'retrying' | 'canceled'
  payload: text('payload'), // JSON input
  result: text('result'),   // JSON output
  error: text('error'),
  attempts: integer('attempts').default(0),
  maxAttempts: integer('max_attempts').default(3),
  priority: integer('priority').default(0), // higher = runs first
  queuedAt: integer('queued_at', { mode: 'timestamp' }).notNull(),
  startedAt: integer('started_at', { mode: 'timestamp' }),
  finishedAt: integer('finished_at', { mode: 'timestamp' }),
  updatedAt: integer('updated_at', { mode: 'timestamp' }),
  nextRetryAt: integer('next_retry_at', { mode: 'timestamp' }),
  progress: integer('progress').default(0),
});

export const platformJobLogs = sqliteTable('platform_job_logs', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  jobId: integer('job_id').notNull().references(() => platformJobs.id),
  level: text('level').notNull().default('info'), // 'info' | 'warn' | 'error'
  message: text('message').notNull(),
  metadata: text('metadata'), // JSON
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
});

// ==========================================
// Phase K: AI Orchestration (K-3)
// ==========================================

export const aiRequestLogs = sqliteTable('ai_request_logs', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  userId: integer('user_id').references(() => users.id),
  profileId: integer('profile_id').references(() => userProfiles.id),
  taskType: text('task_type').notNull(), // 'extract_profile' | 'score_job' | 'enrich_job' | 'tailor_resume' | 'ats_check' | 'cover_letter' | 'outreach' | 'coach_answer' | 'jd_analysis' | 'custom'
  modelUsed: text('model_used'),
  promptTokens: integer('prompt_tokens'),
  completionTokens: integer('completion_tokens'),
  latencyMs: integer('latency_ms'),
  attempts: integer('attempts').default(1),
  succeeded: integer('succeeded', { mode: 'boolean' }).notNull(),
  errorMessage: text('error_message'),
  metadata: text('metadata'), // JSON — task-specific extra fields
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
});
