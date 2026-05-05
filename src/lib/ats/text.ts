import type { JdAnalysis } from '../services/documents/analysis';
import type { TailoredResume } from '../services/documents/resume-tailor';

export interface AtsResumeSection {
  id: string;
  label: string;
  text: string;
}

const STOP_WORDS = new Set([
  'a',
  'an',
  'and',
  'are',
  'as',
  'at',
  'be',
  'by',
  'for',
  'from',
  'has',
  'have',
  'in',
  'into',
  'is',
  'it',
  'of',
  'on',
  'or',
  'our',
  'that',
  'the',
  'their',
  'this',
  'to',
  'with',
  'you',
  'your',
]);

export function normalizeAtsText(value: unknown) {
  return String(value ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9+#.%/-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function normalizeDisplayText(value: unknown) {
  return String(value ?? '')
    .replace(/\s+/g, ' ')
    .trim();
}

export function clampScore(value: number, min = 0, max = 100) {
  if (!Number.isFinite(value)) return min;
  return Math.max(min, Math.min(max, value));
}

export function uniqueNonEmpty(values: unknown[], limit = 50) {
  const seen = new Set<string>();
  const result: string[] = [];

  for (const value of values) {
    const display = normalizeDisplayText(value);
    const key = normalizeAtsText(display);
    if (!display || !key || seen.has(key)) continue;
    seen.add(key);
    result.push(display);
    if (result.length >= limit) break;
  }

  return result;
}

export function tokenizeForAts(value: unknown) {
  return normalizeAtsText(value)
    .split(/[\s/-]+/)
    .map((token) => token.replace(/^\.|\.$/g, ''))
    .filter((token) => token.length > 1 && token.length < 40 && !STOP_WORDS.has(token));
}

export function collectResumeSections(resume: TailoredResume): AtsResumeSection[] {
  const sections: AtsResumeSection[] = [
    { id: 'headline', label: 'Headline', text: resume.headline || '' },
    { id: 'summary', label: 'Summary', text: resume.summary || '' },
    { id: 'skills', label: 'Skills', text: (resume.skills || []).join(', ') },
    { id: 'tools', label: 'Tools', text: (resume.tools || []).join(', ') },
    {
      id: 'education',
      label: 'Education',
      text: (resume.education || [])
        .map((item) => [item.degree, item.institution, item.year].filter(Boolean).join(' '))
        .join('\n'),
    },
  ];

  for (const [index, item] of (resume.experience || []).entries()) {
    sections.push({
      id: `experience_${index + 1}`,
      label: `Experience ${index + 1}`,
      text: [
        item.role,
        item.company,
        item.duration,
        ...(item.bullets || []),
      ].filter(Boolean).join('\n'),
    });
  }

  return sections.map((section) => ({
    ...section,
    text: normalizeDisplayText(section.text),
  }));
}

export function stringifyTailoredResume(resume: TailoredResume) {
  return collectResumeSections(resume)
    .map((section) => `${section.label}: ${section.text}`)
    .filter((line) => normalizeAtsText(line).length > 0)
    .join('\n');
}

function labeledLine(label: string, value: unknown) {
  const text = normalizeDisplayText(value);
  return text ? `${label}: ${text}` : '';
}

function labeledList(label: string, values: string[]) {
  const text = (values || []).map(normalizeDisplayText).filter(Boolean).join(', ');
  return text ? `${label}: ${text}` : '';
}

export function stringifyJdAnalysis(jdAnalysis: JdAnalysis, jobContext: Record<string, unknown> = {}) {
  return [
    labeledLine('Title', jobContext.title),
    labeledLine('Company', jobContext.company),
    labeledLine('Location', jobContext.location),
    labeledLine('Employment', jobContext.employmentType),
    labeledLine('Description', jobContext.description || jobContext.fullDescription || jobContext.snippet),
    labeledList('Must-have skills', jdAnalysis.mustHaveSkills),
    labeledList('Preferred skills', jdAnalysis.preferredSkills),
    labeledList('ATS keywords', jdAnalysis.atsKeywords),
    labeledList('Tools', jdAnalysis.toolRequirements),
    labeledList('Domain language', jdAnalysis.domainLanguage),
    labeledList('Seniority signals', jdAnalysis.senioritySignals),
    labeledList('Leadership signals', jdAnalysis.leadershipSignals),
    labeledLine('Business context', jdAnalysis.businessContext),
    labeledLine('Hiring priorities', jdAnalysis.hiringPriorities),
  ].filter(Boolean).join('\n');
}

export function cosineSimilarity(a: number[], b: number[]) {
  const length = Math.min(a.length, b.length);
  if (!length) return 0;

  let dot = 0;
  let aMagnitude = 0;
  let bMagnitude = 0;

  for (let index = 0; index < length; index += 1) {
    const left = Number(a[index] || 0);
    const right = Number(b[index] || 0);
    dot += left * right;
    aMagnitude += left * left;
    bMagnitude += right * right;
  }

  if (!aMagnitude || !bMagnitude) return 0;
  return dot / (Math.sqrt(aMagnitude) * Math.sqrt(bMagnitude));
}

export function tokenOverlapScore(left: string, right: string) {
  const leftTokens = new Set(tokenizeForAts(left));
  const rightTokens = new Set(tokenizeForAts(right));
  if (!leftTokens.size || !rightTokens.size) return 0;

  let intersection = 0;
  for (const token of leftTokens) {
    if (rightTokens.has(token)) intersection += 1;
  }

  const union = leftTokens.size + rightTokens.size - intersection;
  return union ? clampScore((intersection / union) * 100) : 0;
}

export function extractMetrics(value: string) {
  return Array.from(new Set(
    normalizeDisplayText(value).match(/\b\d+(?:\.\d+)?\s*(?:%|percent|x|k|m|million|crore|lakh|users?|customers?|people|teams?|months?|years?)\b/gi) || [],
  ));
}
