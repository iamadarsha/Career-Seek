import { expandTitlesWithRolePacks } from './scraping/role-family-packs';

const ROLE_SYNONYMS: Record<string, string[]> = {
  'ai product manager': ['AI Product Manager', 'LLM Product Manager', 'GenAI Product Manager', 'Product Manager AI'],
  'product manager': ['Product Manager', 'PM', 'Product Owner', 'Associate Product Manager'],
  'senior product manager': ['Senior Product Manager', 'Sr Product Manager', 'Lead Product Manager', 'Group Product Manager'],
  'data scientist': ['Data Scientist', 'Applied Scientist', 'Decision Scientist', 'ML Scientist'],
  'ml engineer': ['ML Engineer', 'Machine Learning Engineer', 'AI Engineer', 'MLOps Engineer'],
  'founding pm': ['Founding PM', 'Founding Product Manager', 'First Product Manager'],
  'program manager': ['Program Manager', 'Technical Program Manager', 'TPM'],
  'strategy ops': ['Strategy & Ops', 'Business Operations', 'Founder Office', 'Chief of Staff'],
  'growth product growth': ['Growth Product Manager', 'Product Growth', 'Growth PM'],
  'llm product manager': ['LLM Product Manager', 'AI Product Manager', 'GenAI PM'],
  'backend engineer': ['Backend Engineer', 'Software Engineer Backend', 'Server-side Engineer', 'API Engineer'],
  'java backend engineer': ['Java Backend Engineer', 'Backend Engineer Java', 'Spring Boot Developer', 'Java Developer'],
  'spring boot developer': ['Spring Boot Developer', 'Java Backend Engineer', 'Backend Engineer'],
  'junior ux designer': ['Junior UX Designer', 'Associate UX Designer', 'UI/UX Designer', 'Product Designer', 'Interaction Designer'],
  'ux designer': ['UX Designer', 'Product Designer', 'UI/UX Designer', 'User Experience Designer', 'Interaction Designer'],
  'ui ux designer': ['UI/UX Designer', 'UX/UI Designer', 'Product Designer', 'Interaction Designer'],
  'finance compliance analyst': ['Finance Compliance Analyst', 'Compliance Analyst', 'AML Analyst', 'KYC Analyst', 'Financial Crime Analyst', 'Transaction Monitoring Analyst', 'Sanctions Analyst', 'Fraud Analyst', 'Risk Analyst'],
  'aml kyc analyst': ['AML Analyst', 'KYC Analyst', 'AML/KYC Analyst', 'Transaction Monitoring Analyst', 'Financial Crime Analyst', 'CDD Analyst', 'Due Diligence Analyst', 'Fraud Analyst'],
  'compliance analyst': ['Compliance Analyst', 'Compliance Officer', 'Regulatory Compliance Analyst', 'Risk and Compliance Analyst', 'Financial Crime Compliance Analyst', 'Sanctions Analyst'],
};

export const COMMON_ROLE_OPTIONS = [
  'AI Product Manager',
  'Product Manager',
  'Senior Product Manager',
  'Data Scientist',
  'ML Engineer',
  'Founding PM',
  'Program Manager',
  'Strategy & Ops',
  'Growth/Product Growth',
  'LLM Product Manager',
  'Backend Engineer',
  'Java Backend Engineer',
  'Junior UX Designer',
  'UX Designer',
  'Finance Compliance Analyst',
  'AML/KYC Analyst',
];

function canonicalKey(role: string) {
  return role
    .toLowerCase()
    .replace(/&/g, ' ')
    .replace(/\//g, ' ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function unique(values: string[]) {
  const seen = new Set<string>();
  return values
    .map((value) => value.trim())
    .filter(Boolean)
    .filter((value) => {
      const key = value.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}

export function parseCommaSeparated(value?: string | string[]) {
  if (Array.isArray(value)) return unique(value);
  if (!value) return [];
  return unique(value.split(',').map((item) => item.trim()));
}

export function normalizeRolePreferences(input: {
  selectedRoles?: string[];
  customRoles?: string;
  title?: string;
}) {
  const rawRoles = unique([
    ...(input.selectedRoles || []),
    ...parseCommaSeparated(input.customRoles),
    ...parseCommaSeparated(input.title),
  ]);

  const variants = unique(rawRoles.flatMap((role) => {
    const key = canonicalKey(role);
    return [role, ...(ROLE_SYNONYMS[key] || [])];
  }));
  const rolePackExpansion = expandTitlesWithRolePacks(variants.length ? variants : rawRoles);
  const expandedVariants = unique([...variants, ...rolePackExpansion.titleVariants]);

  const primaryTitle = rawRoles[0] || expandedVariants[0] || 'Product Manager';

  return {
    roles: rawRoles.length ? rawRoles : [primaryTitle],
    title: primaryTitle,
    titleVariants: expandedVariants.length ? expandedVariants : [primaryTitle],
    keywordHints: unique(
      [...expandedVariants, ...rolePackExpansion.keywordHints]
        .flatMap((role) => role.split(/\s+/))
        .filter((word) => word.length > 2 && !['and', 'the', 'for'].includes(word.toLowerCase()))
    ).slice(0, 32),
  };
}

export function buildSearchExpansionSuggestions(resultCount: number, preferences: {
  roles?: string[];
  locations?: string[];
  workModel?: string;
  companyTypes?: string[];
}) {
  if (resultCount >= 25) return [];

  const suggestions = [
    'Include remote roles across India',
    'Widen experience band by 1-2 years',
    'Search adjacent role titles',
  ];

  if (preferences.locations?.length) {
    suggestions.push(`Add nearby hubs to ${preferences.locations.join(', ')}`);
  }

  if (preferences.companyTypes?.length && !preferences.companyTypes.includes('any')) {
    suggestions.push('Temporarily include any company type');
  }

  if (preferences.workModel && preferences.workModel !== 'any') {
    suggestions.push('Include hybrid and onsite as backup');
  }

  return suggestions;
}
