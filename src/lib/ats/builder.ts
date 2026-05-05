import fs from 'fs/promises';
import path from 'path';
import type { TailoredResume } from '../services/documents/resume-tailor';
import {
  buildFreshResumeDocument,
  buildHackMyResumeExportMetadata,
  type FreshContactInfo,
  type FreshResumeDocument,
  type HackMyResumeExportMetadata,
} from './hackmyresume';

export interface AtsJsonResumeProfile {
  network: string;
  username?: string;
  url?: string;
}

export interface AtsJsonResumeLocation {
  address?: string;
  city?: string;
  region?: string;
  countryCode?: string;
  postalCode?: string;
}

export interface AtsContactInfo {
  email?: string;
  phone?: string;
  website?: string;
  url?: string;
  profiles?: AtsJsonResumeProfile[];
  location?: AtsJsonResumeLocation | string;
}

export interface AtsExportJobContext {
  id?: number | string;
  title?: string;
  company?: string;
}

export interface AtsExportOptions {
  generatedAt?: Date | string;
  source?: string;
  version?: string;
  contact?: AtsContactInfo;
  job?: AtsExportJobContext;
  maxLineLength?: number;
}

export interface JsonResumeDocument {
  $schema: 'https://jsonresume.org/schema/';
  basics: {
    name: string;
    label?: string;
    image?: string;
    email?: string;
    phone?: string;
    url?: string;
    summary?: string;
    location?: AtsJsonResumeLocation;
    profiles?: AtsJsonResumeProfile[];
  };
  work: Array<{
    name?: string;
    position?: string;
    startDate?: string;
    endDate?: string;
    summary?: string;
    highlights?: string[];
  }>;
  education: Array<{
    institution?: string;
    area?: string;
    studyType?: string;
    endDate?: string;
    summary?: string;
  }>;
  skills: Array<{
    name: string;
    keywords: string[];
  }>;
  meta: {
    canonical: 'career-seek-local';
    version: string;
    lastModified: string;
    source: string;
    target?: AtsExportJobContext;
  };
}

export interface AtsExportBundle {
  kind: 'career-seek.ats-export.v1';
  plainText: string;
  jsonResume: JsonResumeDocument;
  freshResume: FreshResumeDocument;
  hackMyResume: HackMyResumeExportMetadata;
  warnings: string[];
  generatedAt: string;
}

export interface AtsSidecarWriteOptions extends AtsExportOptions {
  sidecarDir?: string;
  basename?: string;
  writeManifest?: boolean;
}

export interface AtsSidecarWriteResult {
  directory: string;
  plainTextPath: string;
  jsonResumePath: string;
  freshResumePath: string;
  manifestPath?: string;
  bundle: AtsExportBundle;
}

const DEFAULT_MAX_LINE_LENGTH = 96;

function toIso(value: Date | string | undefined) {
  if (!value) return new Date().toISOString();
  if (value instanceof Date) return value.toISOString();
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? new Date().toISOString() : parsed.toISOString();
}

function cleanWhitespace(value: unknown) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function normalizeAtsText(value: unknown) {
  return cleanWhitespace(value)
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .replace(/[–—−]/g, '-')
    .replace(/[•▪◦●]/g, '-')
    .replace(/[^\x09\x0A\x0D\x20-\x7E]/g, '')
    .replace(/[ \t]+/g, ' ')
    .trim();
}

function uniq(values: Array<unknown>, limit = 80) {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    const text = normalizeAtsText(value);
    const key = text.toLowerCase();
    if (!text || seen.has(key)) continue;
    seen.add(key);
    result.push(text);
    if (result.length >= limit) break;
  }
  return result;
}

function compactLine(values: Array<unknown>, separator = ' | ') {
  return values.map(normalizeAtsText).filter(Boolean).join(separator);
}

function wrapLine(line: string, maxLineLength: number) {
  const normalized = normalizeAtsText(line);
  if (!normalized || normalized.length <= maxLineLength) return normalized ? [normalized] : [];
  const words = normalized.split(/\s+/);
  const lines: string[] = [];
  let current = '';
  for (const word of words) {
    const candidate = `${current} ${word}`.trim();
    if (candidate.length > maxLineLength && current) {
      lines.push(current);
      current = word;
    } else {
      current = candidate;
    }
  }
  if (current) lines.push(current);
  return lines;
}

function pushWrapped(lines: string[], line: string, maxLineLength: number) {
  lines.push(...wrapLine(line, maxLineLength));
}

function splitDuration(duration: string) {
  const raw = normalizeAtsText(duration);
  const normalized = raw.replace(/\bto\b/i, '-').replace(/[–—]/g, '-');
  const parts = normalized.split(/\s+-\s+|\s+-|-+\s+/).map(normalizeAtsText).filter(Boolean);
  const startDate = parts[0];
  const endDate = parts.slice(1).join(' - ');
  return {
    raw,
    startDate: startDate || undefined,
    endDate: endDate && !/present|current|now/i.test(endDate) ? endDate : undefined,
  };
}

function normalizeLocation(location: AtsContactInfo['location'] | undefined) {
  if (!location) return undefined;
  if (typeof location === 'string') {
    return { address: normalizeAtsText(location) };
  }
  const result: AtsJsonResumeLocation = {
    address: normalizeAtsText(location.address) || undefined,
    city: normalizeAtsText(location.city) || undefined,
    region: normalizeAtsText(location.region) || undefined,
    countryCode: normalizeAtsText(location.countryCode) || undefined,
    postalCode: normalizeAtsText(location.postalCode) || undefined,
  };
  return Object.values(result).some(Boolean) ? result : undefined;
}

function educationParts(degree: string) {
  const normalized = normalizeAtsText(degree);
  const parts = normalized.split(/\s+-\s+|\s+\|\s+|,\s+/).map(normalizeAtsText).filter(Boolean);
  if (parts.length >= 2) {
    return { studyType: parts[0], area: parts.slice(1).join(', ') };
  }
  return { studyType: normalized || undefined, area: undefined };
}

function freshContact(contact: AtsContactInfo | undefined): FreshContactInfo | undefined {
  if (!contact) return undefined;
  const location = typeof contact.location === 'string'
    ? normalizeAtsText(contact.location)
    : compactLine([
      contact.location?.city,
      contact.location?.region,
      contact.location?.countryCode,
    ], ', ');
  const result: FreshContactInfo = {
    email: normalizeAtsText(contact.email) || undefined,
    phone: normalizeAtsText(contact.phone) || undefined,
    website: normalizeAtsText(contact.website || contact.url) || undefined,
    location: location || undefined,
  };
  return Object.values(result).some(Boolean) ? result : undefined;
}

export function buildAtsPlainText(resume: TailoredResume, options: AtsExportOptions = {}) {
  const maxLineLength = Math.max(72, Math.min(options.maxLineLength || DEFAULT_MAX_LINE_LENGTH, 140));
  const lines: string[] = [];
  const skills = uniq(resume.skills || [], 80);
  const tools = uniq(resume.tools || [], 80);
  const contact = options.contact;

  lines.push(normalizeAtsText(resume.fullName) || 'Candidate');
  pushWrapped(lines, normalizeAtsText(resume.headline), maxLineLength);
  const contactLine = compactLine([
    contact?.email,
    contact?.phone,
    contact?.url || contact?.website,
    typeof contact?.location === 'string' ? contact.location : compactLine([
      contact?.location?.city,
      contact?.location?.region,
      contact?.location?.countryCode,
    ], ', '),
  ]);
  if (contactLine) pushWrapped(lines, contactLine, maxLineLength);

  lines.push('');
  lines.push('PROFESSIONAL SUMMARY');
  pushWrapped(lines, normalizeAtsText(resume.summary), maxLineLength);

  if (skills.length) {
    lines.push('');
    lines.push('CORE COMPETENCIES');
    pushWrapped(lines, skills.join(', '), maxLineLength);
  }

  if (tools.length) {
    lines.push('');
    lines.push('TOOLS');
    pushWrapped(lines, tools.join(', '), maxLineLength);
  }

  if (resume.experience?.length) {
    lines.push('');
    lines.push('PROFESSIONAL EXPERIENCE');
    for (const item of resume.experience) {
      const roleLine = compactLine([item.role, item.company, item.duration]);
      if (roleLine) pushWrapped(lines, roleLine, maxLineLength);
      for (const bullet of uniq(item.bullets || [], 24)) {
        pushWrapped(lines, `- ${bullet}`, maxLineLength);
      }
    }
  }

  if (resume.education?.length) {
    lines.push('');
    lines.push('EDUCATION');
    for (const item of resume.education) {
      pushWrapped(lines, compactLine([item.degree, item.institution, item.year]), maxLineLength);
    }
  }

  return lines
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trimEnd()
    .concat('\n');
}

export function buildJsonResume(resume: TailoredResume, options: AtsExportOptions = {}): JsonResumeDocument {
  const generatedAt = toIso(options.generatedAt);
  const skills = uniq(resume.skills || [], 80);
  const tools = uniq(resume.tools || [], 80);
  const contact = options.contact;

  return {
    $schema: 'https://jsonresume.org/schema/',
    basics: {
      name: normalizeAtsText(resume.fullName) || 'Candidate',
      label: normalizeAtsText(resume.headline) || undefined,
      email: normalizeAtsText(contact?.email) || undefined,
      phone: normalizeAtsText(contact?.phone) || undefined,
      url: normalizeAtsText(contact?.url || contact?.website) || undefined,
      summary: normalizeAtsText(resume.summary) || undefined,
      location: normalizeLocation(contact?.location),
      profiles: contact?.profiles?.map((profile) => ({
        network: normalizeAtsText(profile.network),
        username: normalizeAtsText(profile.username) || undefined,
        url: normalizeAtsText(profile.url) || undefined,
      })).filter((profile) => profile.network),
    },
    work: (resume.experience || []).map((item) => {
      const duration = splitDuration(item.duration);
      return {
        name: normalizeAtsText(item.company) || undefined,
        position: normalizeAtsText(item.role) || undefined,
        startDate: duration.startDate,
        endDate: duration.endDate,
        summary: duration.raw || undefined,
        highlights: uniq(item.bullets || [], 24),
      };
    }),
    education: (resume.education || []).map((item) => {
      const degree = educationParts(item.degree);
      return {
        institution: normalizeAtsText(item.institution) || undefined,
        area: degree.area,
        studyType: degree.studyType,
        endDate: normalizeAtsText(item.year) || undefined,
        summary: compactLine([item.degree, item.institution, item.year]) || undefined,
      };
    }),
    skills: [
      ...(skills.length ? [{ name: 'Core Competencies', keywords: skills }] : []),
      ...(tools.length ? [{ name: 'Tools', keywords: tools }] : []),
    ],
    meta: {
      canonical: 'career-seek-local',
      version: options.version || '1.0.0',
      lastModified: generatedAt,
      source: normalizeAtsText(options.source) || 'Career Seek ATS export',
      target: options.job,
    },
  };
}

export function buildAtsExportBundle(resume: TailoredResume, options: AtsExportOptions = {}): AtsExportBundle {
  const generatedAt = toIso(options.generatedAt);
  const normalizedOptions = { ...options, generatedAt };
  const warnings: string[] = [];
  if (!resume.skills?.length) warnings.push('No skills were present in the tailored resume.');
  if (!resume.experience?.length) warnings.push('No experience entries were present in the tailored resume.');

  return {
    kind: 'career-seek.ats-export.v1',
    plainText: buildAtsPlainText(resume, normalizedOptions),
    jsonResume: buildJsonResume(resume, normalizedOptions),
    freshResume: buildFreshResumeDocument(resume, {
      generatedAt,
      source: options.source,
      contact: freshContact(options.contact),
      job: options.job,
    }),
    hackMyResume: buildHackMyResumeExportMetadata({
      generatedAt,
      source: options.source,
      contact: freshContact(options.contact),
      job: options.job,
    }),
    warnings,
    generatedAt,
  };
}

function sidecarBase(targetPath: string, options: AtsSidecarWriteOptions) {
  const parsed = path.parse(targetPath);
  const directory = options.sidecarDir || parsed.dir || process.cwd();
  const basename = options.basename || parsed.name || 'resume';
  return { directory, basename };
}

async function writeJson(filePath: string, data: unknown) {
  await fs.writeFile(filePath, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
}

export async function writeAtsSidecarArtifacts(
  resume: TailoredResume,
  generatedDocumentPath: string,
  options: AtsSidecarWriteOptions = {},
): Promise<AtsSidecarWriteResult> {
  const bundle = buildAtsExportBundle(resume, options);
  const { directory, basename } = sidecarBase(generatedDocumentPath, options);
  await fs.mkdir(directory, { recursive: true });

  const plainTextPath = path.join(directory, `${basename}.ats.txt`);
  const jsonResumePath = path.join(directory, `${basename}.jsonresume.json`);
  const freshResumePath = path.join(directory, `${basename}.fresh.json`);
  const manifestPath = options.writeManifest === false
    ? undefined
    : path.join(directory, `${basename}.ats-manifest.json`);

  await Promise.all([
    fs.writeFile(plainTextPath, bundle.plainText, 'utf8'),
    writeJson(jsonResumePath, bundle.jsonResume),
    writeJson(freshResumePath, bundle.freshResume),
    manifestPath
      ? writeJson(manifestPath, {
        kind: bundle.kind,
        generatedAt: bundle.generatedAt,
        sourceDocumentPath: generatedDocumentPath,
        sidecars: {
          plainTextPath,
          jsonResumePath,
          freshResumePath,
        },
        hackMyResume: bundle.hackMyResume,
        warnings: bundle.warnings,
      })
      : Promise.resolve(),
  ]);

  return {
    directory,
    plainTextPath,
    jsonResumePath,
    freshResumePath,
    manifestPath,
    bundle,
  };
}
