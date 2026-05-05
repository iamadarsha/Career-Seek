import type { TailoredResume } from '../services/documents/resume-tailor';

export interface FreshContactInfo {
  email?: string;
  phone?: string;
  website?: string;
  location?: string;
}

export interface FreshResumeOptions {
  generatedAt?: Date | string;
  source?: string;
  contact?: FreshContactInfo;
  job?: {
    id?: number | string;
    title?: string;
    company?: string;
  };
}

export interface FreshResumeDocument {
  name: string;
  info: {
    label?: string;
    brief?: string;
  };
  contact?: FreshContactInfo;
  employment: {
    history: Array<{
      employer?: string;
      position?: string;
      start?: string;
      end?: string;
      summary?: string;
      highlights?: string[];
      keywords?: string[];
    }>;
  };
  education: {
    history: Array<{
      institution?: string;
      title?: string;
      end?: string;
      summary?: string;
    }>;
  };
  skills: {
    sets: Array<{
      name: string;
      skills: string[];
    }>;
  };
  meta: {
    format: 'FRESH@0.6.0';
    version: '1.0.0';
    generatedAt: string;
    source: string;
    generator: 'career-seek-local';
    target?: {
      id?: number | string;
      title?: string;
      company?: string;
    };
  };
}

export interface HackMyResumeExportMetadata {
  engine: 'hackmyresume';
  compatibleFormats: Array<'fresh' | 'jsonresume' | 'txt'>;
  requiresGlobalBinary: false;
  localFirst: true;
  generatedAt: string;
  notes: string[];
  suggestedLocalCommands: string[];
}

function toIso(value: Date | string | undefined) {
  if (!value) return new Date().toISOString();
  if (value instanceof Date) return value.toISOString();
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? new Date().toISOString() : parsed.toISOString();
}

function clean(value: unknown) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function uniq(values: Array<unknown>, limit = 64) {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    const text = clean(value);
    const key = text.toLowerCase();
    if (!text || seen.has(key)) continue;
    seen.add(key);
    result.push(text);
    if (result.length >= limit) break;
  }
  return result;
}

function splitDuration(duration: string) {
  const normalized = clean(duration)
    .replace(/\bto\b/i, '-')
    .replace(/[–—]/g, '-');
  const [start, end] = normalized.split(/\s+-\s+|\s+-|-+\s+/).map(clean);
  return {
    start: start || undefined,
    end: end && !/present|current|now/i.test(end) ? end : undefined,
  };
}

export function buildFreshResumeDocument(
  resume: TailoredResume,
  options: FreshResumeOptions = {},
): FreshResumeDocument {
  const generatedAt = toIso(options.generatedAt);
  const skills = uniq(resume.skills || [], 80);
  const tools = uniq(resume.tools || [], 80);

  return {
    name: clean(resume.fullName) || 'Candidate',
    info: {
      label: clean(resume.headline) || undefined,
      brief: clean(resume.summary) || undefined,
    },
    contact: options.contact,
    employment: {
      history: (resume.experience || []).map((item) => {
        const dates = splitDuration(item.duration);
        return {
          employer: clean(item.company) || undefined,
          position: clean(item.role) || undefined,
          start: dates.start,
          end: dates.end,
          summary: clean(item.duration) || undefined,
          highlights: uniq(item.bullets || [], 24),
          keywords: uniq([...skills, ...tools], 32),
        };
      }),
    },
    education: {
      history: (resume.education || []).map((item) => ({
        institution: clean(item.institution) || undefined,
        title: clean(item.degree) || undefined,
        end: clean(item.year) || undefined,
        summary: clean([item.degree, item.institution, item.year].filter(Boolean).join(' | ')) || undefined,
      })),
    },
    skills: {
      sets: [
        ...(skills.length ? [{ name: 'Core Competencies', skills }] : []),
        ...(tools.length ? [{ name: 'Tools', skills: tools }] : []),
      ],
    },
    meta: {
      format: 'FRESH@0.6.0',
      version: '1.0.0',
      generatedAt,
      source: clean(options.source) || 'Career Seek ATS export',
      generator: 'career-seek-local',
      target: options.job,
    },
  };
}

export function buildHackMyResumeExportMetadata(
  options: FreshResumeOptions = {},
): HackMyResumeExportMetadata {
  const generatedAt = toIso(options.generatedAt);
  return {
    engine: 'hackmyresume',
    compatibleFormats: ['fresh', 'jsonresume', 'txt'],
    requiresGlobalBinary: false,
    localFirst: true,
    generatedAt,
    notes: [
      'Career Seek writes HackMyResume-compatible JSON sidecars locally; no global binary is required.',
      'A future integration can invoke a project-local or npx HackMyResume runner against the .fresh.json sidecar.',
      'DOCX/PDF layout generation remains separate from this ATS-safe data export.',
    ],
    suggestedLocalCommands: [
      'npx hackmyresume build <resume>.fresh.json TO <resume>.html',
      'npx hackmyresume build <resume>.fresh.json TO <resume>.pdf',
    ],
  };
}
