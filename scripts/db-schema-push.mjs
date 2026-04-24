/**
 * Direct SQLite schema push — bypasses drizzle-kit (which has Node 24 esbuild issues).
 * Creates all tables with CREATE TABLE IF NOT EXISTS.
 * Safe to run multiple times.
 */
import Database from 'better-sqlite3';
import path from 'path';
import os from 'os';
import fs from 'fs';

// Load env if exists
try {
  const envPath = path.resolve(process.cwd(), '.env.local');
  if (fs.existsSync(envPath)) {
    const envLocal = fs.readFileSync(envPath, 'utf8');
    console.log("Loading .env.local from:", envPath);
    envLocal.split('\n').forEach(line => {
      const [key, ...rest] = line.split('=');
      const value = rest.join('=');
      if (key && value) {
        process.env[key.trim()] = value.trim();
        console.log(`  Set ${key.trim()}=${value.trim()}`);
      }
    });
  } else {
    console.log("No .env.local found at:", envPath);
  }
} catch (e) {
  console.log("Error reading .env.local:", e.message);
}

const baseDir = process.env.JOBHUNT_DATA_DIR 
  ? path.resolve(process.env.JOBHUNT_DATA_DIR)
  : path.join(os.homedir(), '.jobhunt-india');

const dbPath = path.resolve(path.join(baseDir, 'db', 'jobhunt.db'));
console.log(`Connecting to database at: ${dbPath}`);
const db = new Database(dbPath);

db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

const stmts = `
-- Phase K: Platform Identity (K-1)
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  external_id TEXT UNIQUE,
  email TEXT,
  display_name TEXT,
  is_bootstrap INTEGER DEFAULT 0,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS user_profiles (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id),
  name TEXT NOT NULL DEFAULT 'Default',
  headline TEXT,
  is_default INTEGER DEFAULT 0,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS app_settings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  key TEXT NOT NULL UNIQUE,
  value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS uploaded_resumes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  profile_id INTEGER REFERENCES user_profiles(id),
  filename TEXT NOT NULL,
  original_path TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  parsed_text TEXT,
  parse_metadata TEXT,
  uploaded_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS master_profiles (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  profile_id INTEGER REFERENCES user_profiles(id),
  full_name TEXT,
  headline TEXT,
  years_of_experience INTEGER,
  target_seniority TEXT,
  skills_explicit TEXT,
  skills_inferred TEXT,
  tools TEXT,
  domains TEXT,
  experience TEXT,
  projects TEXT,
  achievements TEXT,
  education TEXT,
  certifications TEXT,
  strengths TEXT,
  gaps TEXT,
  raw_summary TEXT,
  updated_at INTEGER
);

CREATE TABLE IF NOT EXISTS search_profiles (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  profile_id INTEGER REFERENCES user_profiles(id),
  title TEXT NOT NULL,
  locations TEXT,
  work_model TEXT,
  expected_salary TEXT,
  experience_band TEXT,
  company_types TEXT,
  preferred_portals TEXT,
  must_have_keywords TEXT,
  avoid_keywords TEXT,
  notice_period TEXT,
  relocation_willingness INTEGER,
  is_active INTEGER DEFAULT 1
);


CREATE TABLE IF NOT EXISTS scans (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  profile_id INTEGER REFERENCES user_profiles(id),
  search_profile_id INTEGER REFERENCES search_profiles(id),
  status TEXT NOT NULL DEFAULT 'queued',
  started_at INTEGER,
  finished_at INTEGER,
  total_jobs INTEGER DEFAULT 0,
  error TEXT
);

CREATE TABLE IF NOT EXISTS scan_portal_runs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  scan_id INTEGER NOT NULL REFERENCES scans(id),
  portal TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'queued',
  jobs_found INTEGER DEFAULT 0,
  error TEXT,
  started_at INTEGER,
  finished_at INTEGER
);

CREATE TABLE IF NOT EXISTS search_expansions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  scan_portal_run_id INTEGER NOT NULL REFERENCES scan_portal_runs(id),
  reason TEXT NOT NULL,
  old_query TEXT NOT NULL,
  new_query TEXT NOT NULL,
  timestamp INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS normalized_jobs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  profile_id INTEGER REFERENCES user_profiles(id),
  scan_id INTEGER NOT NULL REFERENCES scans(id),
  search_profile_id INTEGER NOT NULL REFERENCES search_profiles(id),
  portal TEXT NOT NULL,
  external_id TEXT,
  title TEXT NOT NULL,
  company TEXT NOT NULL,
  location TEXT,
  is_remote INTEGER,
  is_hybrid INTEGER,
  salary_raw TEXT,
  salary_min INTEGER,
  salary_max INTEGER,
  salary_currency TEXT,
  experience_raw TEXT,
  experience_min INTEGER,
  experience_max INTEGER,
  url TEXT NOT NULL,
  apply_url TEXT,
  posted_date_raw TEXT,
  posted_date INTEGER,
  snippet TEXT,
  employment_type TEXT,
  raw_payload_path TEXT,
  scraped_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS job_duplicates (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  canonical_job_id INTEGER NOT NULL REFERENCES normalized_jobs(id),
  duplicate_job_id INTEGER NOT NULL REFERENCES normalized_jobs(id),
  match_type TEXT NOT NULL,
  detected_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS scored_jobs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  profile_id INTEGER REFERENCES user_profiles(id),
  normalized_job_id INTEGER NOT NULL UNIQUE REFERENCES normalized_jobs(id),
  master_profile_id INTEGER NOT NULL REFERENCES master_profiles(id),
  search_profile_id INTEGER NOT NULL REFERENCES search_profiles(id),
  score INTEGER NOT NULL,
  tier TEXT NOT NULL,
  breakdown TEXT,
  scored_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS job_enrichments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  scored_job_id INTEGER NOT NULL UNIQUE REFERENCES scored_jobs(id),
  fit_summary TEXT,
  pros TEXT,
  cons TEXT,
  interview_angle TEXT,
  salary_estimate TEXT,
  resume_focus TEXT,
  enriched_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS search_queries (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  profile_id INTEGER REFERENCES user_profiles(id),
  query TEXT NOT NULL,
  results TEXT,
  timestamp INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS jd_analyses (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  scored_job_id INTEGER NOT NULL UNIQUE REFERENCES scored_jobs(id),
  must_have_skills TEXT,
  preferred_skills TEXT,
  ats_keywords TEXT,
  domain_language TEXT,
  seniority_signals TEXT,
  leadership_signals TEXT,
  tool_requirements TEXT,
  business_context TEXT,
  hiring_priorities TEXT,
  analyzed_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS document_assets (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  profile_id INTEGER REFERENCES user_profiles(id),
  scored_job_id INTEGER NOT NULL REFERENCES scored_jobs(id),
  type TEXT NOT NULL,
  content TEXT,
  file_path TEXT,
  ats_score INTEGER,
  version INTEGER DEFAULT 1,
  created_at INTEGER NOT NULL
);


CREATE TABLE IF NOT EXISTS document_chunks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  profile_id INTEGER REFERENCES user_profiles(id),
  chunk_id TEXT NOT NULL UNIQUE,
  source_type TEXT NOT NULL,
  source_id INTEGER,
  scored_job_id INTEGER,
  section TEXT,
  content TEXT NOT NULL,
  metadata TEXT,
  embedding TEXT,
  token_count INTEGER,
  indexed_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS index_runs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  profile_id INTEGER REFERENCES user_profiles(id),
  source_type TEXT NOT NULL,
  source_id INTEGER,
  chunks_created INTEGER DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'pending',
  started_at INTEGER,
  finished_at INTEGER,
  error TEXT
);

CREATE TABLE IF NOT EXISTS coach_threads (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER REFERENCES users(id),
  profile_id INTEGER REFERENCES user_profiles(id),
  title TEXT,
  scored_job_id INTEGER,
  scope TEXT NOT NULL DEFAULT 'job_and_profile',
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS coach_messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  thread_id INTEGER NOT NULL REFERENCES coach_threads(id),
  role TEXT NOT NULL,
  content TEXT NOT NULL,
  confidence_level TEXT,
  answer_mode TEXT,
  retrieved_chunk_ids TEXT,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS message_sources (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  message_id INTEGER NOT NULL REFERENCES coach_messages(id),
  chunk_id TEXT NOT NULL,
  relevance_score INTEGER,
  snippet_preview TEXT,
  source_label TEXT
);

CREATE TABLE IF NOT EXISTS applications (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  profile_id INTEGER REFERENCES user_profiles(id),
  scored_job_id INTEGER REFERENCES scored_jobs(id),
  normalized_job_id INTEGER REFERENCES normalized_jobs(id),
  title TEXT NOT NULL,
  company TEXT NOT NULL,
  location TEXT,
  portal TEXT,
  url TEXT,
  apply_url TEXT,
  status TEXT NOT NULL DEFAULT 'saved',
  previous_status TEXT,
  score_snapshot INTEGER,
  tier_snapshot TEXT,
  saved_at INTEGER NOT NULL,
  applied_at INTEGER,
  last_status_change_at INTEGER,
  next_follow_up_at INTEGER,
  tags TEXT,
  priority TEXT DEFAULT 'normal',
  archived_at INTEGER,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS application_timeline (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  application_id INTEGER NOT NULL REFERENCES applications(id),
  event_type TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  metadata TEXT,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS application_notes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  application_id INTEGER NOT NULL REFERENCES applications(id),
  content TEXT NOT NULL,
  category TEXT DEFAULT 'general',
  is_pinned INTEGER DEFAULT 0,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS application_reminders (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  application_id INTEGER NOT NULL REFERENCES applications(id),
  profile_id INTEGER REFERENCES user_profiles(id),
  user_id INTEGER REFERENCES users(id),
  title TEXT NOT NULL,
  description TEXT,
  due_at INTEGER NOT NULL,
  is_completed INTEGER DEFAULT 0,
  completed_at INTEGER,
  category TEXT DEFAULT 'follow_up',
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS application_documents (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  application_id INTEGER NOT NULL REFERENCES applications(id),
  document_asset_id INTEGER REFERENCES document_assets(id),
  document_type TEXT NOT NULL,
  version INTEGER DEFAULT 1,
  ats_score INTEGER,
  linked_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS crm_settings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  key TEXT NOT NULL UNIQUE,
  value TEXT NOT NULL
);

-- Phase I: Integrations
CREATE TABLE IF NOT EXISTS contacts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER REFERENCES users(id),
  full_name TEXT NOT NULL,
  role TEXT,
  company TEXT,
  source TEXT,
  linkedin_url TEXT,
  email TEXT,
  notes TEXT,
  outreach_status TEXT DEFAULT 'not_started',
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS contact_links (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  contact_id INTEGER NOT NULL REFERENCES contacts(id),
  application_id INTEGER REFERENCES applications(id),
  scored_job_id INTEGER REFERENCES scored_jobs(id),
  relationship TEXT DEFAULT 'recruiter',
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS email_drafts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  application_id INTEGER NOT NULL REFERENCES applications(id),
  contact_id INTEGER REFERENCES contacts(id),
  draft_type TEXT NOT NULL,
  subject TEXT,
  content_text TEXT NOT NULL,
  content_markdown TEXT,
  tone TEXT,
  version INTEGER DEFAULT 1,
  status TEXT DEFAULT 'active',
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS exported_calendar_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  application_id INTEGER REFERENCES applications(id),
  reminder_id INTEGER REFERENCES application_reminders(id),
  event_type TEXT NOT NULL,
  title TEXT NOT NULL,
  starts_at INTEGER NOT NULL,
  ends_at INTEGER,
  location TEXT,
  notes TEXT,
  ics_path TEXT NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS export_runs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  profile_id INTEGER REFERENCES user_profiles(id),
  export_type TEXT NOT NULL,
  application_id INTEGER REFERENCES applications(id),
  format TEXT NOT NULL,
  output_path TEXT NOT NULL,
  manifest_path TEXT,
  status TEXT NOT NULL DEFAULT 'success',
  record_count INTEGER DEFAULT 0,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS backup_manifests (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  profile_id INTEGER REFERENCES user_profiles(id),
  version TEXT NOT NULL DEFAULT '1.0',
  manifest_json TEXT NOT NULL,
  backup_path TEXT NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS import_runs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  profile_id INTEGER REFERENCES user_profiles(id),
  import_type TEXT NOT NULL,
  source_path TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'success',
  imported_count INTEGER DEFAULT 0,
  summary TEXT,
  created_at INTEGER NOT NULL
);

-- Phase H: Automation
CREATE TABLE IF NOT EXISTS automation_rules (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  profile_id INTEGER REFERENCES user_profiles(id),
  name TEXT NOT NULL UNIQUE,
  is_enabled INTEGER DEFAULT 1,
  schedule TEXT,
  config TEXT,
  updated_at INTEGER
);

CREATE TABLE IF NOT EXISTS scheduled_tasks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER REFERENCES users(id),
  profile_id INTEGER REFERENCES user_profiles(id),
  task_type TEXT NOT NULL,
  status TEXT DEFAULT 'idle',
  last_run_at INTEGER,
  next_run_at INTEGER,
  locked_until INTEGER,
  error_count INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS automation_run_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER REFERENCES users(id),
  profile_id INTEGER REFERENCES user_profiles(id),
  task_type TEXT NOT NULL,
  trigger_reason TEXT DEFAULT 'scheduled',
  started_at INTEGER NOT NULL,
  ended_at INTEGER,
  status TEXT NOT NULL,
  result_summary TEXT,
  error_detail TEXT
);

CREATE TABLE IF NOT EXISTS notifications (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  profile_id INTEGER REFERENCES user_profiles(id),
  user_id INTEGER REFERENCES users(id),
  type TEXT NOT NULL,
  title TEXT NOT NULL,
  message TEXT,
  priority TEXT DEFAULT 'normal',
  is_read INTEGER DEFAULT 0,
  is_archived INTEGER DEFAULT 0,
  action_url TEXT,
  related_entity_id INTEGER,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS notification_preferences (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  profile_id INTEGER REFERENCES user_profiles(id),
  user_id INTEGER REFERENCES users(id),
  category TEXT NOT NULL,
  in_app_enabled INTEGER DEFAULT 1,
  desktop_enabled INTEGER DEFAULT 0,
  quiet_hours_start TEXT DEFAULT '22:00',
  quiet_hours_end TEXT DEFAULT '08:00'
);

-- Phase J: Analytics, Insights & Optimization
CREATE TABLE IF NOT EXISTS analytics_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER REFERENCES users(id),
  profile_id INTEGER REFERENCES user_profiles(id),
  event_type TEXT NOT NULL,
  entity_type TEXT,
  entity_id INTEGER,
  portal TEXT,
  tier TEXT,
  score INTEGER,
  application_status TEXT,
  metadata TEXT,
  occurred_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS analytics_snapshots (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  profile_id INTEGER REFERENCES user_profiles(id),
  snapshot_type TEXT NOT NULL,
  snapshot_key TEXT NOT NULL,
  data TEXT NOT NULL,
  period_start INTEGER NOT NULL,
  period_end INTEGER NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS insight_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER REFERENCES users(id),
  profile_id INTEGER REFERENCES user_profiles(id),
  insight_type TEXT NOT NULL,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  metric_basis TEXT,
  time_window TEXT,
  confidence TEXT NOT NULL DEFAULT 'low',
  recommended_action TEXT,
  supporting_data TEXT,
  is_dismissed INTEGER DEFAULT 0,
  generated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS weekly_reviews (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER REFERENCES users(id),
  profile_id INTEGER REFERENCES user_profiles(id),
  week_start INTEGER NOT NULL,
  week_end INTEGER NOT NULL,
  summary_json TEXT NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS experiments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER REFERENCES users(id),
  profile_id INTEGER REFERENCES user_profiles(id),
  name TEXT NOT NULL UNIQUE,
  hypothesis TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'running',
  started_at INTEGER NOT NULL,
  ended_at INTEGER,
  affected_criteria TEXT,
  metrics_json TEXT,
  conclusion TEXT,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS experiment_links (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  experiment_id INTEGER NOT NULL REFERENCES experiments(id),
  application_id INTEGER REFERENCES applications(id),
  scored_job_id INTEGER REFERENCES scored_jobs(id),
  linked_at INTEGER NOT NULL
);


-- Phase K: Background Jobs (K-2)
CREATE TABLE IF NOT EXISTS platform_jobs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER REFERENCES users(id),
  profile_id INTEGER REFERENCES user_profiles(id),
  job_type TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'queued',
  payload TEXT,
  result TEXT,
  error TEXT,
  attempts INTEGER DEFAULT 0,
  max_attempts INTEGER DEFAULT 3,
  priority INTEGER DEFAULT 0,
  queued_at INTEGER NOT NULL,
  started_at INTEGER,
  finished_at INTEGER,
  updated_at INTEGER,
  next_retry_at INTEGER,
  progress INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS platform_job_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  job_id INTEGER NOT NULL REFERENCES platform_jobs(id),
  level TEXT NOT NULL DEFAULT 'info',
  message TEXT NOT NULL,
  metadata TEXT,
  created_at INTEGER NOT NULL
);

-- Phase K: AI Orchestration (K-3)
CREATE TABLE IF NOT EXISTS ai_request_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER REFERENCES users(id),
  profile_id INTEGER REFERENCES user_profiles(id),
  task_type TEXT NOT NULL,
  model_used TEXT,
  prompt_tokens INTEGER,
  completion_tokens INTEGER,
  latency_ms INTEGER,
  attempts INTEGER DEFAULT 1,
  succeeded INTEGER NOT NULL,
  error_message TEXT,
  metadata TEXT,
  created_at INTEGER NOT NULL
);
`;

// Execute all statements
for (const stmt of stmts.split(';').map(s => s.trim()).filter(s => s.length > 0)) {
  try {
    db.prepare(stmt + ';').run();
  } catch (err) {
    console.error('Failed:', stmt.slice(0, 60) + '...');
    console.error(err.message);
    process.exit(1);
  }
}

// Migration logic for existing tables that might be missing new columns
const migrations = [
  "ALTER TABLE uploaded_resumes ADD COLUMN profile_id INTEGER REFERENCES user_profiles(id)",
  "ALTER TABLE master_profiles ADD COLUMN profile_id INTEGER REFERENCES user_profiles(id)",
  "ALTER TABLE search_profiles ADD COLUMN profile_id INTEGER REFERENCES user_profiles(id)",
  "ALTER TABLE scans ADD COLUMN profile_id INTEGER REFERENCES user_profiles(id)",
  "ALTER TABLE normalized_jobs ADD COLUMN profile_id INTEGER REFERENCES user_profiles(id)",
  "ALTER TABLE scored_jobs ADD COLUMN profile_id INTEGER REFERENCES user_profiles(id)",
  "ALTER TABLE search_queries ADD COLUMN profile_id INTEGER REFERENCES user_profiles(id)",
  "ALTER TABLE document_assets ADD COLUMN profile_id INTEGER REFERENCES user_profiles(id)",
  "ALTER TABLE document_chunks ADD COLUMN profile_id INTEGER REFERENCES user_profiles(id)",
  "ALTER TABLE index_runs ADD COLUMN profile_id INTEGER REFERENCES user_profiles(id)",
  "ALTER TABLE coach_threads ADD COLUMN user_id INTEGER REFERENCES users(id)",
  "ALTER TABLE coach_threads ADD COLUMN profile_id INTEGER REFERENCES user_profiles(id)",
  "ALTER TABLE applications ADD COLUMN profile_id INTEGER REFERENCES user_profiles(id)",
  "ALTER TABLE contacts ADD COLUMN user_id INTEGER REFERENCES users(id)",
  "ALTER TABLE scheduled_tasks ADD COLUMN user_id INTEGER REFERENCES users(id)",
  "ALTER TABLE scheduled_tasks ADD COLUMN profile_id INTEGER REFERENCES user_profiles(id)",
  "ALTER TABLE automation_run_logs ADD COLUMN user_id INTEGER REFERENCES users(id)",
  "ALTER TABLE automation_run_logs ADD COLUMN profile_id INTEGER REFERENCES user_profiles(id)",
  "ALTER TABLE notifications ADD COLUMN user_id INTEGER REFERENCES users(id)",
  "ALTER TABLE analytics_events ADD COLUMN user_id INTEGER REFERENCES users(id)",
  "ALTER TABLE analytics_events ADD COLUMN profile_id INTEGER REFERENCES user_profiles(id)",
  "ALTER TABLE insight_items ADD COLUMN user_id INTEGER REFERENCES users(id)",
  "ALTER TABLE insight_items ADD COLUMN profile_id INTEGER REFERENCES user_profiles(id)",
  "ALTER TABLE weekly_reviews ADD COLUMN user_id INTEGER REFERENCES users(id)",
  "ALTER TABLE weekly_reviews ADD COLUMN profile_id INTEGER REFERENCES user_profiles(id)",
  "ALTER TABLE experiments ADD COLUMN user_id INTEGER REFERENCES users(id)",
  "ALTER TABLE experiments ADD COLUMN profile_id INTEGER REFERENCES user_profiles(id)",
  "ALTER TABLE notifications ADD COLUMN profile_id INTEGER REFERENCES user_profiles(id)",
  "ALTER TABLE notification_preferences ADD COLUMN profile_id INTEGER REFERENCES user_profiles(id)",
  "ALTER TABLE notification_preferences ADD COLUMN user_id INTEGER REFERENCES users(id)",
  "ALTER TABLE application_reminders ADD COLUMN profile_id INTEGER REFERENCES user_profiles(id)",
  "ALTER TABLE application_reminders ADD COLUMN user_id INTEGER REFERENCES users(id)",
  "ALTER TABLE analytics_snapshots ADD COLUMN profile_id INTEGER REFERENCES user_profiles(id)",
  "ALTER TABLE export_runs ADD COLUMN profile_id INTEGER REFERENCES user_profiles(id)",
  "ALTER TABLE backup_manifests ADD COLUMN profile_id INTEGER REFERENCES user_profiles(id)",
  "ALTER TABLE import_runs ADD COLUMN profile_id INTEGER REFERENCES user_profiles(id)",
  "ALTER TABLE automation_rules ADD COLUMN profile_id INTEGER REFERENCES user_profiles(id)",
  "ALTER TABLE platform_jobs ADD COLUMN progress INTEGER DEFAULT 0",
  "ALTER TABLE platform_jobs ADD COLUMN updated_at INTEGER",
];

for (const m of migrations) {
  try {
    db.prepare(m).run();
    console.log('Migration applied: ' + m);
  } catch (err) {
    if (err.message.includes("duplicate column name") || err.message.includes("no such table")) {
      // Expected if already applied or table doesn't exist yet
    } else {
      console.warn('Migration info: ' + m + ' (' + err.message + ')');
    }
  }
}

const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name").all();
console.log('Schema pushed successfully. ' + tables.length + ' tables:');
tables.forEach(t => console.log(' ', t.name));
db.close();
