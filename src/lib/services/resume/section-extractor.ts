/**
 * Resume Section Extractor
 *
 * Takes raw resume text (from pdf-parse / mammoth) and returns structured sections.
 * Inspired by open-resume's parser approach but implemented as pure TypeScript regex
 * patterns — no external runtime needed.
 *
 * Output structure is intentionally flat (string arrays) so it composable
 * with the existing masterProfile schema (skillsExplicit, experience, achievements, etc.)
 */

export interface ResumeStructure {
  name: string | null;
  email: string | null;
  phone: string | null;
  linkedinUrl: string | null;
  githubUrl: string | null;
  location: string | null;
  summary: string | null;
  skills: string[];
  experience: ResumeExperienceEntry[];
  education: ResumeEducationEntry[];
  projects: string[];
  achievements: string[];
  certifications: string[];
  languages: string[];
  rawSections: Record<string, string>;
}

export interface ResumeExperienceEntry {
  company: string;
  title: string;
  duration: string;
  bullets: string[];
}

export interface ResumeEducationEntry {
  institution: string;
  degree: string;
  year: string;
}

// ─── Section heading patterns ─────────────────────────────────────────────────

const SECTION_PATTERNS: Array<{ key: string; pattern: RegExp }> = [
  { key: 'summary',        pattern: /^(professional\s+)?summary|profile|objective|about\s+me/i },
  { key: 'skills',         pattern: /^(technical\s+)?skills|technologies|tools|competencies|expertise|stack/i },
  { key: 'experience',     pattern: /^(work\s+|professional\s+)?experience|employment|career/i },
  { key: 'education',      pattern: /^education|academic|qualifications/i },
  { key: 'projects',       pattern: /^projects?|personal\s+projects?|side\s+projects?|portfolio/i },
  { key: 'achievements',   pattern: /^achievements?|accomplishments?|awards?|honors?/i },
  { key: 'certifications', pattern: /^certifications?|licenses?|credentials?|courses?/i },
  { key: 'languages',      pattern: /^languages?|linguistic/i },
];

// Heading line: all-caps or title-case line <= 50 chars, optional colon/underscores
const HEADING_LINE_RE = /^(?:[A-Z][A-Z\s&/–-]{2,48}|[A-Z][a-z]+(?:\s+[A-Z][a-z]+)*):?\s*$/;

// ─── Contact extraction ───────────────────────────────────────────────────────

const EMAIL_RE = /[\w.+-]+@[\w-]+\.[a-z]{2,}/gi;
const PHONE_RE = /(?:\+91[\s-]?)?(?:\(?\d{3,4}\)?[\s.-]?\d{3,4}[\s.-]?\d{4})/g;
const LINKEDIN_RE = /(?:https?:\/\/)?(?:www\.)?linkedin\.com\/in\/[\w-]+/gi;
const GITHUB_RE  = /(?:https?:\/\/)?(?:www\.)?github\.com\/[\w-]+/gi;
const LOCATION_RE = /(?:bangalore|bengaluru|mumbai|delhi|ncr|hyderabad|chennai|pune|kolkata|ahmedabad|gurgaon|gurugram|noida|remote)/gi;

function extractContact(text: string) {
  const firstChunk = text.slice(0, 800);
  const emails   = firstChunk.match(EMAIL_RE);
  const phones   = firstChunk.match(PHONE_RE);
  const linkedins = firstChunk.match(LINKEDIN_RE);
  const githubs  = firstChunk.match(GITHUB_RE);
  const locations = firstChunk.match(LOCATION_RE);

  const lines = firstChunk.split('\n').filter(Boolean);
  const nameLine = lines.find((line) => {
    const trimmed = line.trim();
    // Name: 2-4 words, mostly alpha, no special chars except hyphen
    return /^[A-Z][a-z]+(?:\s+[A-Z][a-z]+){1,3}$/.test(trimmed);
  });

  return {
    name: nameLine?.trim() || null,
    email: emails?.[0] || null,
    phone: phones?.[0]?.replace(/\s/g, ' ').trim() || null,
    linkedinUrl: linkedins?.[0] || null,
    githubUrl: githubs?.[0] || null,
    location: locations?.[0] || null,
  };
}

// ─── Section splitter ─────────────────────────────────────────────────────────

function splitIntoRawSections(text: string): Record<string, string> {
  const lines = text.split('\n');
  const sections: Record<string, string> = { header: '' };
  let currentKey = 'header';

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) {
      sections[currentKey] = (sections[currentKey] || '') + '\n';
      continue;
    }

    const isHeading = HEADING_LINE_RE.test(trimmed) && trimmed.length <= 50;
    if (isHeading) {
      const match = SECTION_PATTERNS.find(({ pattern }) => pattern.test(trimmed));
      if (match) {
        currentKey = match.key;
        sections[currentKey] = sections[currentKey] || '';
        continue;
      }
    }

    sections[currentKey] = (sections[currentKey] || '') + line + '\n';
  }

  return sections;
}

// ─── Skills section parser ────────────────────────────────────────────────────

const SKILL_SEPARATORS = /[,|•·;\/\n]+/;

function parseSkills(raw: string): string[] {
  if (!raw) return [];
  const extracted: string[] = [];
  const lines = raw.split('\n');
  for (const line of lines) {
    const stripped = line.replace(/^[^:]+:\s*/u, ''); // strip "Languages: " prefix
    for (const chunk of stripped.split(SKILL_SEPARATORS)) {
      const skill = chunk.replace(/[(\[{}\])].*$/g, '').trim();
      if (skill && skill.length >= 2 && skill.length <= 40 && !/^\d+$/.test(skill)) {
        extracted.push(skill);
      }
    }
  }
  return [...new Set(extracted)].filter(Boolean).slice(0, 60);
}

// ─── Experience section parser ────────────────────────────────────────────────

// Date patterns: "Jan 2021 – Present", "2019 - 2022", etc.
const DATE_RANGE_RE = /(?:(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\s+)?\d{4}\s*[-–—to]+\s*(?:present|current|now|(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\s+)?\d{0,4}/gi;

function parseExperience(raw: string): ResumeExperienceEntry[] {
  if (!raw) return [];
  const entries: ResumeExperienceEntry[] = [];
  const lines = raw.split('\n').map((l) => l.trim()).filter(Boolean);
  let current: Partial<ResumeExperienceEntry> | null = null;

  for (const line of lines) {
    const dateMatch = line.match(DATE_RANGE_RE);
    if (dateMatch || /^[-•*▪►]\s/.test(line)) {
      if (/^[-•*▪►]\s/.test(line) && current) {
        current.bullets = [...(current.bullets || []), line.replace(/^[-•*▪►]\s*/, '').trim()];
      } else if (dateMatch) {
        if (current?.company) entries.push(current as ResumeExperienceEntry);
        current = { company: '', title: '', duration: dateMatch[0], bullets: [] };
        // Extract title and company from same line
        const withoutDate = line.replace(DATE_RANGE_RE, '').replace(/[|,•·–—]+/g, ' ').trim();
        const parts = withoutDate.split(/\s{2,}|@|at\b/).map((p) => p.trim()).filter(Boolean);
        if (parts.length >= 2) {
          [current.title, current.company] = [parts[0], parts[1]];
        } else if (parts.length === 1) {
          current.title = parts[0];
        }
      }
    } else if (current && !current.company && line.length < 80) {
      current.company = line;
    } else if (current && !current.title && line.length < 80) {
      current.title = line;
    }
  }
  if (current?.company) entries.push(current as ResumeExperienceEntry);
  return entries.slice(0, 10);
}

// ─── Education parser ─────────────────────────────────────────────────────────

const DEGREE_KEYWORDS = /\b(b\.?tech|m\.?tech|be|me|bsc|msc|bca|mca|mba|bba|b\.?e\b|m\.?e\b|phd|bachelor|master|diploma)\b/i;
const YEAR_RE = /\b(19|20)\d{2}\b/;

function parseEducation(raw: string): ResumeEducationEntry[] {
  if (!raw) return [];
  const entries: ResumeEducationEntry[] = [];
  const lines = raw.split('\n').map((l) => l.trim()).filter(Boolean);

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (DEGREE_KEYWORDS.test(line) || /university|college|institute|iit|nit|iiit/i.test(line)) {
      const yearMatch = line.match(YEAR_RE);
      const degreeMatch = line.match(DEGREE_KEYWORDS);
      entries.push({
        institution: lines[i + 1]?.trim() || line,
        degree: degreeMatch?.[0] || '',
        year: yearMatch?.[0] || '',
      });
    }
  }
  return entries.slice(0, 5);
}

// ─── Achievements / bullets parser ────────────────────────────────────────────

const METRIC_RE = /\d+(?:\.\d+)?%|\d+[kKmMcClL]\b|(?:saved|reduced|increased|improved|generated|delivered|launched|grew|achieved|built|led|managed|owned)/i;

function parseBullets(raw: string): string[] {
  if (!raw) return [];
  return raw
    .split('\n')
    .map((l) => l.replace(/^[-•*▪►\d.]+\s*/, '').trim())
    .filter((l) => l.length >= 20 && METRIC_RE.test(l))
    .slice(0, 8);
}

function parseSimpleList(raw: string): string[] {
  if (!raw) return [];
  return raw
    .split(/[\n,;|•]+/)
    .map((l) => l.trim())
    .filter((l) => l.length >= 2 && l.length <= 100)
    .slice(0, 20);
}

// ─── Main entry point ─────────────────────────────────────────────────────────

/**
 * Extract structured sections from raw resume text.
 * Input: raw text from pdf-parse or mammoth.
 * Output: typed ResumeStructure ready for merging into masterProfile.
 */
export function extractResumeStructure(rawText: string): ResumeStructure {
  const contact = extractContact(rawText);
  const sections = splitIntoRawSections(rawText);

  const skills = parseSkills(sections.skills || '');
  const experience = parseExperience(sections.experience || '');
  const education = parseEducation(sections.education || '');
  const projects = parseSimpleList(sections.projects || '');
  const achievements = parseBullets(sections.achievements || sections.experience || '');
  const certifications = parseSimpleList(sections.certifications || '');
  const languages = parseSimpleList(sections.languages || '');
  const summary = (sections.summary || '').replace(/\s+/g, ' ').trim().slice(0, 600) || null;

  return {
    ...contact,
    summary,
    skills,
    experience,
    education,
    projects,
    achievements,
    certifications,
    languages,
    rawSections: sections,
  };
}

/**
 * Flatten a ResumeStructure into the string arrays expected by masterProfile columns.
 */
export function flattenForMasterProfile(structure: ResumeStructure) {
  return {
    fullName: structure.name || undefined,
    rawSummary: structure.summary || undefined,
    skillsExplicit: JSON.stringify(structure.skills),
    experience: JSON.stringify(
      structure.experience.map((e) => `${e.title} at ${e.company} (${e.duration}): ${e.bullets.join('; ')}`),
    ),
    achievements: JSON.stringify(structure.achievements),
    education: JSON.stringify(
      structure.education.map((e) => `${e.degree} — ${e.institution} ${e.year}`.trim()),
    ),
  };
}
