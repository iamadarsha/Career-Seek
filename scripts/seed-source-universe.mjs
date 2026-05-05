import Database from 'better-sqlite3';
import fs from 'fs';
import os from 'os';
import path from 'path';

const root = process.cwd();
const dataDir = path.join(root, 'data');

try {
  const envPath = path.join(root, '.env.local');
  if (fs.existsSync(envPath)) {
    const envLocal = fs.readFileSync(envPath, 'utf8');
    envLocal.split('\n').forEach((line) => {
      const [key, ...rest] = line.split('=');
      const value = rest.join('=');
      const envKey = key?.trim();
      if (envKey && value && !process.env[envKey]) {
        process.env[envKey] = value.trim();
      }
    });
  }
} catch (error) {
  console.warn(`[source-seed] Could not load .env.local: ${error.message}`);
}

const baseDir = process.env.JOBHUNT_DATA_DIR
  ? path.resolve(process.env.JOBHUNT_DATA_DIR)
  : path.join(os.homedir(), '.jobhunt-india');
const dbPath = path.join(baseDir, 'db', 'jobhunt.db');

function slug(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '') || 'source';
}

function readJson(fileName, fallback) {
  const filePath = path.join(dataDir, fileName);
  if (!fs.existsSync(filePath)) return fallback;
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function sourceRegistryItems(registry) {
  if (Array.isArray(registry)) return registry;
  if (Array.isArray(registry.sources)) return registry.sources;
  if (Array.isArray(registry.provider_priority_ladder)) {
    return registry.provider_priority_ladder.map((item) => ({
      id: item.id || item.source_id || item.source || slug(item.label || item.name),
      label: item.label || item.name || item.source || item.id,
      source_type: item.source_type || item.sourceType || item.type || item.trust_posture || 'source_group',
      priority: item.priority,
      default_enabled: item.default_enabled ?? item.defaultEnabled ?? item.enabled_by_default ?? item.priority <= 3,
      ...item,
    }));
  }
  return [];
}

function parseCsv(value) {
  const rows = [];
  let row = [];
  let field = '';
  let quoted = false;

  for (let i = 0; i < value.length; i++) {
    const char = value[i];
    const next = value[i + 1];
    if (quoted && char === '"' && next === '"') {
      field += '"';
      i++;
    } else if (char === '"') {
      quoted = !quoted;
    } else if (!quoted && char === ',') {
      row.push(field);
      field = '';
    } else if (!quoted && (char === '\n' || char === '\r')) {
      if (char === '\r' && next === '\n') i++;
      row.push(field);
      if (row.some((cell) => cell.trim())) rows.push(row);
      row = [];
      field = '';
    } else {
      field += char;
    }
  }

  row.push(field);
  if (row.some((cell) => cell.trim())) rows.push(row);
  if (!rows.length) return [];

  const headers = rows[0].map((header) => header.trim());
  return rows.slice(1).map((cells) => Object.fromEntries(headers.map((header, index) => [
    header,
    (cells[index] || '').trim(),
  ])));
}

function normalizeCompanyRows(rows) {
  return rows.map((row, index) => {
    if (row.company || row.career_url_final || row.career_url_hint) return row;
    const industry = String(row.industry || '').trim();
    const [sector, subsector] = industry.split('/').map((part) => part.trim()).filter(Boolean);
    return {
      company: row.name || row.company || `company-${index + 1}`,
      sector: sector || 'india_company',
      subsector: subsector || null,
      role_family: row.role_family || 'general',
      priority: row.priority || String(index + 1),
      country_focus: row.country_focus || 'India',
      india_presence: row.india_presence || 'verified',
      career_url_hint: row.website || row['career-page URL'] || row.career_url_final || '',
      career_url_final: row['career-page URL'] || row.career_url_final || row.career_url_hint || row.website || '',
      ats_type: row['ATS type'] || row.ats_type || 'unknown_or_custom',
      city_tags: row.city_tags || null,
      remote_possible: row.remote_possible || '',
      role_keywords: row.role_keywords || null,
      notes: row.notes || null,
    };
  }).filter((row) => row.company && row.career_url_final);
}

function ensureSchema(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS source_registry (
      id TEXT PRIMARY KEY,
      label TEXT NOT NULL,
      source_type TEXT NOT NULL,
      priority INTEGER NOT NULL,
      default_enabled INTEGER DEFAULT 0,
      payload TEXT NOT NULL,
      updated_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS company_career_sources (
      id TEXT PRIMARY KEY,
      sector TEXT NOT NULL,
      subsector TEXT,
      role_family TEXT NOT NULL,
      company TEXT NOT NULL,
      priority INTEGER NOT NULL,
      country_focus TEXT NOT NULL,
      india_presence TEXT,
      career_url_hint TEXT,
      career_url_final TEXT NOT NULL,
      ats_type TEXT NOT NULL,
      city_tags TEXT,
      remote_possible INTEGER DEFAULT 0,
      role_keywords TEXT,
      notes TEXT,
      updated_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS role_family_pack_registry (
      id TEXT PRIMARY KEY,
      label TEXT NOT NULL,
      payload TEXT NOT NULL,
      updated_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS ats_provider_mappings (
      id TEXT PRIMARY KEY,
      label TEXT NOT NULL,
      payload TEXT NOT NULL,
      updated_at INTEGER NOT NULL
    );
  `);
}

function main() {
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  const db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  ensureSchema(db);
  const now = Math.floor(Date.now() / 1000);

  db.exec(`
    DELETE FROM source_registry;
    DELETE FROM company_career_sources;
    DELETE FROM role_family_pack_registry;
    DELETE FROM ats_provider_mappings;
  `);

  const csvPath = fs.existsSync(path.join(dataDir, 'india-companies-top.csv'))
    ? path.join(dataDir, 'india-companies-top.csv')
    : path.join(dataDir, 'company_careers_seed.csv');
  const companies = fs.existsSync(csvPath)
    ? normalizeCompanyRows(parseCsv(fs.readFileSync(csvPath, 'utf8')))
    : [];

  const upsertCompany = db.prepare(`
    INSERT INTO company_career_sources (
      id, sector, subsector, role_family, company, priority, country_focus, india_presence,
      career_url_hint, career_url_final, ats_type, city_tags, remote_possible, role_keywords, notes, updated_at
    ) VALUES (
      @id, @sector, @subsector, @role_family, @company, @priority, @country_focus, @india_presence,
      @career_url_hint, @career_url_final, @ats_type, @city_tags, @remote_possible, @role_keywords, @notes, @updated_at
    )
    ON CONFLICT(id) DO UPDATE SET
      sector = excluded.sector,
      subsector = excluded.subsector,
      role_family = excluded.role_family,
      company = excluded.company,
      priority = excluded.priority,
      country_focus = excluded.country_focus,
      india_presence = excluded.india_presence,
      career_url_hint = excluded.career_url_hint,
      career_url_final = excluded.career_url_final,
      ats_type = excluded.ats_type,
      city_tags = excluded.city_tags,
      remote_possible = excluded.remote_possible,
      role_keywords = excluded.role_keywords,
      notes = excluded.notes,
      updated_at = excluded.updated_at
  `);

  const seenCompanyIds = new Map();
  const insertCompanies = db.transaction((rows) => {
    for (const row of rows) {
      const baseId = slug(row.company);
      const count = seenCompanyIds.get(baseId) || 0;
      seenCompanyIds.set(baseId, count + 1);
      const id = count ? `${baseId}-${count + 1}` : baseId;
      upsertCompany.run({
        id,
        sector: row.sector || 'uncategorized',
        subsector: row.subsector || null,
        role_family: row.role_family || 'general',
        company: row.company || id,
        priority: Number(row.priority || 999),
        country_focus: row.country_focus || 'India',
        india_presence: row.india_presence || null,
        career_url_hint: row.career_url_hint || null,
        career_url_final: row.career_url_final || row.career_url_hint || '',
        ats_type: row.ats_type || 'unknown_or_custom',
        city_tags: row.city_tags || null,
        remote_possible: /^(true|yes|1|remote|hybrid)$/i.test(row.remote_possible || '') ? 1 : 0,
        role_keywords: row.role_keywords || null,
        notes: row.notes || null,
        updated_at: now,
      });
    }
  });
  insertCompanies(companies);

  const rolePacks = readJson('role_family_packs.json', []);
  const upsertRole = db.prepare(`
    INSERT INTO role_family_pack_registry (id, label, payload, updated_at)
    VALUES (?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET label = excluded.label, payload = excluded.payload, updated_at = excluded.updated_at
  `);
  const packItems = Array.isArray(rolePacks)
    ? rolePacks
    : Array.isArray(rolePacks.role_family_packs)
      ? rolePacks.role_family_packs
      : Object.values(rolePacks).filter((value) => value && typeof value === 'object');
  const insertRoles = db.transaction((items) => {
    for (const item of items) {
      const id = item.id || item.pack_id || slug(item.label);
      upsertRole.run(id, item.label || id, JSON.stringify(item), now);
    }
  });
  insertRoles(packItems);

  const atsMappings = readJson('ats_provider_mapping.json', {});
  const upsertAts = db.prepare(`
    INSERT INTO ats_provider_mappings (id, label, payload, updated_at)
    VALUES (?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET label = excluded.label, payload = excluded.payload, updated_at = excluded.updated_at
  `);
  const atsSource = atsMappings.providers || atsMappings;
  const atsItems = Array.isArray(atsSource) ? atsSource : Object.entries(atsSource).map(([id, value]) => ({ id, ...value }));
  const insertAts = db.transaction((items) => {
    for (const item of items) {
      const id = item.id || item.provider_id || slug(item.label || item.display_name);
      upsertAts.run(id, item.label || item.display_name || id, JSON.stringify(item), now);
    }
  });
  insertAts(atsItems);

  const sourceRegistry = readJson('source_registry.json', []);
  const sourceItems = sourceRegistryItems(sourceRegistry);
  const upsertSource = db.prepare(`
    INSERT INTO source_registry (id, label, source_type, priority, default_enabled, payload, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      label = excluded.label,
      source_type = excluded.source_type,
      priority = excluded.priority,
      default_enabled = excluded.default_enabled,
      payload = excluded.payload,
      updated_at = excluded.updated_at
  `);
  const insertSources = db.transaction((items) => {
    for (const item of items) {
      const id = item.id || item.source_id || slug(item.label);
      upsertSource.run(
        id,
        item.label || id,
        item.source_type || item.sourceType || 'unknown',
        Number(item.priority || 999),
        item.default_enabled || item.defaultEnabled ? 1 : 0,
        JSON.stringify(item),
        now,
      );
    }
  });
  insertSources(sourceItems);

  console.log(JSON.stringify({
    dbPath,
    companyCareerSources: companies.length,
    roleFamilyPacks: packItems.length,
    atsProviderMappings: atsItems.length,
    sourceRegistry: sourceItems.length,
  }, null, 2));
  db.close();
}

main();
