/**
 * K-1 Bootstrap Migration
 *
 * Creates the bootstrap user and default profile, then backfills all
 * user-scoped and profile-scoped tables so existing single-user data
 * is attributed to the bootstrap owner.
 *
 * Safe to run multiple times (idempotent).
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
    envLocal.split('\n').forEach(line => {
      const [key, ...rest] = line.split('=');
      const value = rest.join('=');
      const envKey = key?.trim();
      if (envKey && value && !process.env[envKey]) {
        process.env[envKey] = value.trim();
      }
    });
  }
} catch (e) {}

const baseDir = process.env.JOBHUNT_DATA_DIR 
  ? path.resolve(process.env.JOBHUNT_DATA_DIR)
  : path.join(os.homedir(), '.jobhunt-india');

const dbPath = path.join(baseDir, 'db', 'jobhunt.db');
const db = new Database(dbPath);

db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

const now = Math.floor(Date.now() / 1000); // unix seconds (SQLite timestamp mode stores seconds)

function tableExists(table) {
  return Boolean(
    db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?").get(table),
  );
}

function tableNameFromAlter(sql) {
  return sql.match(/ALTER TABLE\s+(\S+)/i)?.[1];
}

// ─── Step 1: Add ownership columns if missing ─────────────────────────────────

const alterStatements = [
  // users / user_profiles — new tables, handled by db-schema-push.mjs
  // profileId columns
  'ALTER TABLE master_profiles ADD COLUMN profile_id INTEGER REFERENCES user_profiles(id)',
  'ALTER TABLE search_profiles ADD COLUMN profile_id INTEGER REFERENCES user_profiles(id)',
  'ALTER TABLE uploaded_resumes ADD COLUMN profile_id INTEGER REFERENCES user_profiles(id)',
  'ALTER TABLE scans ADD COLUMN profile_id INTEGER REFERENCES user_profiles(id)',
  'ALTER TABLE scored_jobs ADD COLUMN profile_id INTEGER REFERENCES user_profiles(id)',
  'ALTER TABLE document_assets ADD COLUMN profile_id INTEGER REFERENCES user_profiles(id)',
  'ALTER TABLE applications ADD COLUMN profile_id INTEGER REFERENCES user_profiles(id)',
  'ALTER TABLE document_chunks ADD COLUMN profile_id INTEGER REFERENCES user_profiles(id)',
  'ALTER TABLE document_chunks ADD COLUMN embedding_provider TEXT',
  'ALTER TABLE document_chunks ADD COLUMN embedding_model TEXT',
  'ALTER TABLE document_chunks ADD COLUMN embedding_dimensions INTEGER',
  'ALTER TABLE document_chunks ADD COLUMN embedding_mode TEXT',
  'ALTER TABLE index_runs ADD COLUMN embedding_provider TEXT',
  'ALTER TABLE index_runs ADD COLUMN embedding_model TEXT',
  'ALTER TABLE index_runs ADD COLUMN embedding_dimensions INTEGER',
  'ALTER TABLE index_runs ADD COLUMN embedding_mode TEXT',
  'ALTER TABLE saved_jobs ADD COLUMN profile_id INTEGER REFERENCES user_profiles(id)',
  'ALTER TABLE generated_documents ADD COLUMN profile_id INTEGER REFERENCES user_profiles(id)',
  // userId columns
  'ALTER TABLE coach_threads ADD COLUMN user_id INTEGER REFERENCES users(id)',
  'ALTER TABLE coach_threads ADD COLUMN profile_id INTEGER REFERENCES user_profiles(id)',
  'ALTER TABLE contacts ADD COLUMN user_id INTEGER REFERENCES users(id)',
  'ALTER TABLE notifications ADD COLUMN user_id INTEGER REFERENCES users(id)',
  'ALTER TABLE experiments ADD COLUMN user_id INTEGER REFERENCES users(id)',
  'ALTER TABLE experiments ADD COLUMN profile_id INTEGER REFERENCES user_profiles(id)',
  'ALTER TABLE analytics_events ADD COLUMN user_id INTEGER REFERENCES users(id)',
  'ALTER TABLE analytics_events ADD COLUMN profile_id INTEGER REFERENCES user_profiles(id)',
  'ALTER TABLE insight_items ADD COLUMN user_id INTEGER REFERENCES users(id)',
  'ALTER TABLE insight_items ADD COLUMN profile_id INTEGER REFERENCES user_profiles(id)',
  'ALTER TABLE weekly_reviews ADD COLUMN user_id INTEGER REFERENCES users(id)',
  'ALTER TABLE weekly_reviews ADD COLUMN profile_id INTEGER REFERENCES user_profiles(id)',
];

console.log('Step 1: Adding ownership columns (ignoring duplicates)...');
for (const sql of alterStatements) {
  try {
    const table = tableNameFromAlter(sql);
    if (table && !tableExists(table)) {
      continue;
    }
    db.prepare(sql).run();
    const col = sql.match(/ADD COLUMN (\S+)/)?.[1];
    console.log(`  + ${col} added`);
  } catch (err) {
    if (err.message?.includes('duplicate column name')) {
      // Already exists — idempotent
    } else {
      console.warn(`  ! ${sql.slice(0, 60)}... => ${err.message}`);
    }
  }
}

// ─── Step 2: Create bootstrap user ───────────────────────────────────────────

console.log('\nStep 2: Bootstrap user...');
const existingUser = db.prepare('SELECT id FROM users WHERE is_bootstrap = 1').get();
let bootstrapUserId;

if (existingUser) {
  bootstrapUserId = existingUser.id;
  console.log(`  Bootstrap user already exists (id=${bootstrapUserId})`);
} else {
  const result = db.prepare(`
    INSERT INTO users (external_id, email, display_name, is_bootstrap, created_at, updated_at)
    VALUES (NULL, NULL, 'Default User', 1, ?, ?)
  `).run(now, now);
  bootstrapUserId = result.lastInsertRowid;
  console.log(`  Bootstrap user created (id=${bootstrapUserId})`);
}

// ─── Step 3: Create default profile ──────────────────────────────────────────

console.log('\nStep 3: Default profile...');
const existingProfile = db.prepare(
  'SELECT id FROM user_profiles WHERE user_id = ? AND is_default = 1',
).get(bootstrapUserId);
let defaultProfileId;

if (existingProfile) {
  defaultProfileId = existingProfile.id;
  console.log(`  Default profile already exists (id=${defaultProfileId})`);
} else {
  const result = db.prepare(`
    INSERT INTO user_profiles (user_id, name, headline, is_default, created_at, updated_at)
    VALUES (?, 'Default', NULL, 1, ?, ?)
  `).run(bootstrapUserId, now, now);
  defaultProfileId = result.lastInsertRowid;
  console.log(`  Default profile created (id=${defaultProfileId})`);
}

// ─── Step 4: Backfill profileId ───────────────────────────────────────────────

const profileTables = [
  'master_profiles',
  'search_profiles',
  'uploaded_resumes',
  'scans',
  'scored_jobs',
  'document_assets',
  'applications',
  'document_chunks',
  'saved_jobs',
  'generated_documents',
];

console.log('\nStep 4: Backfilling profile_id...');
for (const table of profileTables) {
  try {
    if (!tableExists(table)) continue;
    const r = db.prepare(
      `UPDATE ${table} SET profile_id = ? WHERE profile_id IS NULL`,
    ).run(defaultProfileId);
    if (r.changes > 0) console.log(`  ${table}: ${r.changes} rows updated`);
  } catch (err) {
    console.warn(`  ${table}: ${err.message}`);
  }
}

// ─── Step 5: Backfill userId ──────────────────────────────────────────────────

const userTables = [
  'coach_threads',
  'contacts',
  'notifications',
  'experiments',
  'analytics_events',
  'insight_items',
  'weekly_reviews',
];

console.log('\nStep 5: Backfilling user_id...');
for (const table of userTables) {
  try {
    if (!tableExists(table)) continue;
    const r = db.prepare(
      `UPDATE ${table} SET user_id = ? WHERE user_id IS NULL`,
    ).run(bootstrapUserId);
    if (r.changes > 0) console.log(`  ${table}: ${r.changes} rows updated`);
  } catch (err) {
    console.warn(`  ${table}: ${err.message}`);
  }
}

// Tables that get both userId AND profileId (analytics)
const dualTables = ['analytics_events', 'insight_items', 'weekly_reviews', 'experiments'];
console.log('\nStep 5b: Backfilling profile_id on dual-ownership tables...');
for (const table of dualTables) {
  try {
    if (!tableExists(table)) continue;
    const r = db.prepare(
      `UPDATE ${table} SET profile_id = ? WHERE profile_id IS NULL`,
    ).run(defaultProfileId);
    if (r.changes > 0) console.log(`  ${table}: ${r.changes} rows updated`);
  } catch (err) {
    console.warn(`  ${table}: ${err.message}`);
  }
}

// coach_threads also gets profileId
try {
  const r = db.prepare(
    'UPDATE coach_threads SET user_id = ?, profile_id = ? WHERE user_id IS NULL OR profile_id IS NULL',
  ).run(bootstrapUserId, defaultProfileId);
  if (r.changes > 0) console.log(`  coach_threads: ${r.changes} rows updated`);
} catch (err) {
  console.warn(`  coach_threads: ${err.message}`);
}

// ─── Done ─────────────────────────────────────────────────────────────────────

console.log('\n✓ K-1 bootstrap migration complete');
console.log(`  Bootstrap user id:    ${bootstrapUserId}`);
console.log(`  Default profile id:   ${defaultProfileId}`);
console.log('\nThe app will run in single-user mode using these IDs.');
console.log('To add real auth, implement K-6 and swap resolveContext() in src/lib/platform/identity.ts.');

db.close();
