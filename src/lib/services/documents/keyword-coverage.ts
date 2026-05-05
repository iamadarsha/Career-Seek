import { JdAnalysis } from './analysis';
import { TailoredResume } from './resume-tailor';
import { expandSkillTerms } from '../skills/taxonomy';

export interface KeywordCoverageItem {
  keyword: string;
  category: string;
  matched: boolean;
  sectionHits: string[];
}

export interface KeywordCoverageReport {
  coveragePct: number;
  matched: string[];
  missing: string[];
  items: KeywordCoverageItem[];
}

function normalizeTerm(term: string) {
  return term
    .toLowerCase()
    .replace(/[^a-z0-9+#.\s-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

const STOP_TOKENS = new Set([
  'and',
  'or',
  'the',
  'a',
  'an',
  'of',
  'for',
  'to',
  'in',
  'with',
  'on',
  'by',
  'using',
  'use',
  'utilization',
  'utilisation',
  'responsibility',
  'responsibilities',
  'requirement',
  'requirements',
]);

function tokenRoot(token: string) {
  const cleaned = token.replace(/[^a-z0-9+#.]/g, '');
  if (!cleaned) return '';
  if (cleaned === 'js') return 'javascript';
  if (cleaned === 'ts') return 'typescript';
  if (cleaned === 'ai' || cleaned === 'ml' || cleaned === 'ui' || cleaned === 'ux') return cleaned;
  if (/^collaborat/.test(cleaned)) return 'collaborate';
  if (/^partner/.test(cleaned)) return 'partner';
  if (/^engineer/.test(cleaned)) return 'engineer';
  if (/^manage/.test(cleaned) || cleaned === 'management' || cleaned === 'manager') return 'manage';
  if (/^analy/.test(cleaned) || cleaned === 'analytics') return 'analysis';
  if (/^teach/.test(cleaned)) return 'teach';
  if (/^learn/.test(cleaned)) return 'learn';
  if (/^procure/.test(cleaned)) return 'procure';
  if (/^inventor/.test(cleaned)) return 'inventory';
  if (/^dashboard/.test(cleaned)) return 'dashboard';
  if (/^workflow/.test(cleaned)) return 'workflow';
  if (/^outcome/.test(cleaned)) return 'outcome';
  if (/^team/.test(cleaned)) return 'team';
  if (cleaned.endsWith('ies') && cleaned.length > 4) return `${cleaned.slice(0, -3)}y`;
  if (cleaned.endsWith('s') && cleaned.length > 3) return cleaned.slice(0, -1);
  return cleaned;
}

function tokenRoots(value: string) {
  return normalizeTerm(value)
    .split(/[\s/-]+/)
    .map(tokenRoot)
    .filter((token) => token && !STOP_TOKENS.has(token));
}

function hasRoot(sectionRoots: Set<string>, root: string) {
  if (sectionRoots.has(root)) return true;
  if (root === 'gtm') return sectionRoots.has('go') && sectionRoots.has('market');
  if (root === 'go' || root === 'market') return sectionRoots.has('gtm');
  if (root === 'javascript') return sectionRoots.has('js');
  if (root === 'typescript') return sectionRoots.has('ts');
  return false;
}

function uniqueTerms(groups: Array<{ category: string; terms: string[] }>) {
  const seen = new Map<string, { keyword: string; category: string }>();
  for (const group of groups) {
    for (const raw of group.terms || []) {
      const cleaned = normalizeTerm(String(raw));
      if (!cleaned || cleaned.length < 2 || cleaned.length > 80) continue;
      if (!seen.has(cleaned)) {
        seen.set(cleaned, { keyword: String(raw).trim(), category: group.category });
      }
    }
  }
  return Array.from(seen.values()).slice(0, 60);
}

function sectionMap(resume: TailoredResume) {
  const sections: Record<string, string> = {
    headline: resume.headline || '',
    summary: resume.summary || '',
    skills: (resume.skills || []).join(', '),
    tools: (resume.tools || []).join(', '),
    education: (resume.education || []).map((item) => `${item.degree} ${item.institution} ${item.year}`).join('\n'),
  };

  for (const [index, exp] of (resume.experience || []).entries()) {
    sections[`experience_${index + 1}`] = `${exp.role} ${exp.company} ${exp.duration}\n${(exp.bullets || []).join('\n')}`;
  }

  return Object.fromEntries(Object.entries(sections).map(([key, value]) => [key, normalizeTerm(value)]));
}

function includesTerm(sectionText: string, term: string) {
  const candidates = expandSkillTerms([term], { includeRelated: true, relatedLimit: 2 });
  return candidates.some((candidate) => includesSingleTerm(sectionText, candidate));
}

function includesSingleTerm(sectionText: string, term: string) {
  const normalized = normalizeTerm(term);
  if (!normalized) return false;
  if (/^[a-z0-9+#.]{2,}$/.test(normalized)) {
    return new RegExp(`(^|[^a-z0-9+#.])${normalized.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}([^a-z0-9+#.]|$)`, 'i').test(sectionText);
  }
  if (sectionText.includes(normalized)) return true;

  const requiredRoots = Array.from(new Set(tokenRoots(normalized)));
  if (requiredRoots.length < 2) return false;

  const sectionRoots = new Set(tokenRoots(sectionText));
  const matchedRoots = requiredRoots.filter((root) => hasRoot(sectionRoots, root));
  if (requiredRoots.length === 2) return matchedRoots.length === 2;

  const coverage = matchedRoots.length / requiredRoots.length;
  return matchedRoots.length >= 3 && coverage >= 0.75;
}

export function buildKeywordCoverageReport(resume: TailoredResume, jdAnalysis: JdAnalysis): KeywordCoverageReport {
  const keywords = uniqueTerms([
    { category: 'must_have', terms: jdAnalysis.mustHaveSkills },
    { category: 'preferred', terms: jdAnalysis.preferredSkills },
    { category: 'tool', terms: jdAnalysis.toolRequirements },
    { category: 'domain', terms: jdAnalysis.domainLanguage },
    { category: 'ats', terms: jdAnalysis.atsKeywords },
    { category: 'seniority', terms: jdAnalysis.senioritySignals },
    { category: 'leadership', terms: jdAnalysis.leadershipSignals },
  ]);

  const sections = sectionMap(resume);
  const items = keywords.map((item) => {
    const sectionHits = Object.entries(sections)
      .filter(([, text]) => includesTerm(text, item.keyword))
      .map(([section]) => section);
    return {
      keyword: item.keyword,
      category: item.category,
      matched: sectionHits.length > 0,
      sectionHits,
    };
  });

  const matched = items.filter((item) => item.matched).map((item) => item.keyword);
  const missing = items.filter((item) => !item.matched).map((item) => item.keyword);
  const coveragePct = items.length ? Math.round((matched.length / items.length) * 100) : 0;

  return { coveragePct, matched, missing, items };
}

export function buildSectionRecommendations(report: KeywordCoverageReport) {
  const missingMust = report.items.filter((item) => !item.matched && item.category === 'must_have').slice(0, 6);
  const missingTools = report.items.filter((item) => !item.matched && item.category === 'tool').slice(0, 6);
  const missingLeadership = report.items.filter((item) => !item.matched && ['leadership', 'seniority'].includes(item.category)).slice(0, 4);

  const recommendations: Array<{ section: string; recommendation: string }> = [];
  if (missingMust.length) {
    recommendations.push({
      section: 'Summary',
      recommendation: `If the source resume supports them, add truthful language for high-priority role terms: ${missingMust.map((item) => item.keyword).join(', ')}.`,
    });
  }
  if (missingTools.length) {
    recommendations.push({
      section: 'Skills',
      recommendation: `Move only supported tools or platforms into the skills section: ${missingTools.map((item) => item.keyword).join(', ')}.`,
    });
  }
  if (missingLeadership.length) {
    recommendations.push({
      section: 'Experience',
      recommendation: `Show evidence for seniority/leadership signals in bullets where the resume has proof: ${missingLeadership.map((item) => item.keyword).join(', ')}.`,
    });
  }
  if (!recommendations.length) {
    recommendations.push({
      section: 'Overall',
      recommendation: 'Keyword coverage is strong. Keep the resume single-column, text-based, and focused on evidence already present in your profile.',
    });
  }
  return recommendations;
}
