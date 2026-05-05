import fs from 'fs';
import path from 'path';

export interface EscoLiteSkill {
  id: string;
  label: string;
  altLabels: string[];
  group: string;
}

interface EscoLiteDataset {
  schemaVersion: number;
  generatedAt: string;
  source: string;
  skills: EscoLiteSkill[];
}

let dataset: EscoLiteDataset | null = null;
let aliasMap: Map<string, EscoLiteSkill> | null = null;
let groupMap: Map<string, EscoLiteSkill[]> | null = null;

function normalizeKey(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9+#.]+/g, ' ').replace(/\s+/g, ' ').trim();
}

function loadDataset(): EscoLiteDataset {
  if (dataset) return dataset;
  const filePath = path.resolve(process.cwd(), 'data/esco-lite.json');
  const parsed = JSON.parse(fs.readFileSync(filePath, 'utf8')) as EscoLiteDataset;
  dataset = parsed;
  return parsed;
}

function ensureMaps() {
  if (aliasMap && groupMap) return { aliasMap, groupMap };
  const aliases = new Map<string, EscoLiteSkill>();
  const groups = new Map<string, EscoLiteSkill[]>();

  for (const skill of loadDataset().skills) {
    const labels = [skill.label, ...(skill.altLabels || [])];
    for (const label of labels) {
      const key = normalizeKey(label);
      if (key && !aliases.has(key)) aliases.set(key, skill);
    }
    const group = skill.group || 'general skills';
    groups.set(group, [...(groups.get(group) || []), skill]);
  }

  aliasMap = aliases;
  groupMap = groups;
  return { aliasMap, groupMap };
}

export function getEscoLiteSkills() {
  return loadDataset().skills;
}

export function normalize(raw: string): EscoLiteSkill | null {
  const key = normalizeKey(raw);
  if (!key) return null;
  const maps = ensureMaps();
  return maps.aliasMap.get(key) || null;
}

export function suggestRelated(raw: string, limit = 5): EscoLiteSkill[] {
  const skill = normalize(raw);
  if (!skill) return [];
  const maps = ensureMaps();
  return (maps.groupMap.get(skill.group) || [])
    .filter((candidate) => candidate.id !== skill.id)
    .slice(0, Math.max(0, limit));
}

export function canonicalizeSkillLabels(values: string[]) {
  const seen = new Set<string>();
  const output: string[] = [];
  for (const value of values || []) {
    const canonical = normalize(value)?.label || String(value || '').trim();
    const key = normalizeKey(canonical);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    output.push(canonical);
  }
  return output;
}

export function expandSkillTerms(values: string[], options: { includeRelated?: boolean; relatedLimit?: number } = {}) {
  const terms = new Set<string>();
  for (const value of values || []) {
    const raw = String(value || '').trim();
    if (!raw) continue;
    terms.add(raw);
    const canonical = normalize(raw);
    if (canonical) {
      terms.add(canonical.label);
      for (const alt of canonical.altLabels || []) terms.add(alt);
      if (options.includeRelated) {
        for (const related of suggestRelated(canonical.label, options.relatedLimit ?? 3)) {
          terms.add(related.label);
        }
      }
    }
  }
  return Array.from(terms);
}
