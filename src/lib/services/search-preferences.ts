import { expandTitlesWithRolePacks } from './scraping/role-family-packs';

const ROLE_SYNONYMS: Record<string, string[]> = {
  // ── Product management ────────────────────────────────────────────────────
  'ai product manager': ['AI Product Manager', 'LLM Product Manager', 'GenAI Product Manager', 'Product Manager AI', 'AI/ML Product Manager'],
  'product manager': ['Product Manager', 'PM', 'Product Owner', 'Associate Product Manager', 'APM'],
  'senior product manager': ['Senior Product Manager', 'Sr Product Manager', 'Lead Product Manager', 'Group Product Manager', 'Principal Product Manager'],
  'founding pm': ['Founding PM', 'Founding Product Manager', 'First Product Manager', '0→1 Product Manager'],
  'program manager': ['Program Manager', 'Technical Program Manager', 'TPM', 'Senior Program Manager'],
  'strategy ops': ['Strategy & Ops', 'Business Operations', 'Founder Office', 'Chief of Staff', 'BizOps', 'Strategy and Operations'],
  'growth product growth': ['Growth Product Manager', 'Product Growth', 'Growth PM', 'Growth & Monetisation PM'],
  'llm product manager': ['LLM Product Manager', 'AI Product Manager', 'GenAI PM', 'Foundation Model PM'],

  // ── Engineering ──────────────────────────────────────────────────────────
  'software engineer': ['Software Engineer', 'Software Developer', 'SDE', 'SWE', 'Member of Technical Staff', 'MTS'],
  'sde': ['SDE', 'Software Development Engineer', 'Software Engineer', 'SWE'],
  'sde-1': ['SDE-1', 'SDE I', 'Junior Software Engineer', 'Software Engineer I'],
  'sde-2': ['SDE-2', 'SDE II', 'Software Engineer II', 'Mid-Level Software Engineer'],
  'senior software engineer': ['Senior Software Engineer', 'SDE-3', 'Senior SDE', 'Staff Engineer', 'Senior SWE'],
  'backend engineer': ['Backend Engineer', 'Software Engineer Backend', 'Server-side Engineer', 'API Engineer', 'Backend Developer'],
  'frontend engineer': ['Frontend Engineer', 'Frontend Developer', 'UI Engineer', 'Web Developer', 'React Developer', 'Angular Developer'],
  'full stack engineer': ['Full Stack Engineer', 'Full Stack Developer', 'Fullstack Developer', 'Full-Stack Engineer'],
  'java backend engineer': ['Java Backend Engineer', 'Backend Engineer Java', 'Spring Boot Developer', 'Java Developer', 'Java Software Engineer'],
  'spring boot developer': ['Spring Boot Developer', 'Java Backend Engineer', 'Backend Engineer', 'Java Microservices Developer'],
  'python developer': ['Python Developer', 'Python Engineer', 'Django Developer', 'FastAPI Developer', 'Flask Developer'],
  'node developer': ['Node.js Developer', 'Node Developer', 'Backend Node Engineer', 'JavaScript Backend Developer'],
  'react developer': ['React Developer', 'React.js Developer', 'Frontend React Engineer', 'UI Developer'],
  'devops engineer': ['DevOps Engineer', 'SRE', 'Site Reliability Engineer', 'Platform Engineer', 'Infrastructure Engineer', 'Cloud Engineer'],
  'data engineer': ['Data Engineer', 'Big Data Engineer', 'Analytics Engineer', 'ETL Developer', 'Data Platform Engineer'],
  'android developer': ['Android Developer', 'Android Engineer', 'Mobile Developer Android', 'Kotlin Developer'],
  'ios developer': ['iOS Developer', 'iOS Engineer', 'Swift Developer', 'Mobile Developer iOS'],
  'mobile developer': ['Mobile Developer', 'Mobile Engineer', 'Android Developer', 'iOS Developer', 'React Native Developer', 'Flutter Developer'],

  // ── Data & AI ────────────────────────────────────────────────────────────
  'data scientist': ['Data Scientist', 'Applied Scientist', 'Decision Scientist', 'ML Scientist', 'Research Scientist'],
  'ml engineer': ['ML Engineer', 'Machine Learning Engineer', 'AI Engineer', 'MLOps Engineer', 'Applied ML Engineer'],
  'data analyst': ['Data Analyst', 'Business Analyst', 'Product Analyst', 'Analytics Analyst', 'Business Intelligence Analyst'],
  'business analyst': ['Business Analyst', 'BA', 'Functional Analyst', 'Systems Analyst', 'Process Analyst'],

  // ── Design ───────────────────────────────────────────────────────────────
  'junior ux designer': ['Junior UX Designer', 'Associate UX Designer', 'UI/UX Designer', 'Product Designer', 'Interaction Designer'],
  'ux designer': ['UX Designer', 'Product Designer', 'UI/UX Designer', 'User Experience Designer', 'Interaction Designer', 'UX/UI Designer'],
  'ui ux designer': ['UI/UX Designer', 'UX/UI Designer', 'Product Designer', 'Interaction Designer', 'Visual Designer'],
  'product designer': ['Product Designer', 'UX Designer', 'UI/UX Designer', 'Design Lead', 'Senior Product Designer'],

  // ── Finance & compliance ─────────────────────────────────────────────────
  'finance compliance analyst': ['Finance Compliance Analyst', 'Compliance Analyst', 'AML Analyst', 'KYC Analyst', 'Financial Crime Analyst', 'Transaction Monitoring Analyst', 'Sanctions Analyst', 'Fraud Analyst', 'Risk Analyst'],
  'aml kyc analyst': ['AML Analyst', 'KYC Analyst', 'AML/KYC Analyst', 'Transaction Monitoring Analyst', 'Financial Crime Analyst', 'CDD Analyst', 'Due Diligence Analyst', 'Fraud Analyst'],
  'compliance analyst': ['Compliance Analyst', 'Compliance Officer', 'Regulatory Compliance Analyst', 'Risk and Compliance Analyst', 'Financial Crime Compliance Analyst', 'Sanctions Analyst'],
  'finance analyst': ['Finance Analyst', 'Financial Analyst', 'FP&A Analyst', 'Financial Planning Analyst', 'Corporate Finance Analyst'],
  'investment analyst': ['Investment Analyst', 'Research Analyst', 'Equity Research Analyst', 'Credit Analyst', 'Portfolio Analyst'],

  // ── Marketing & growth ───────────────────────────────────────────────────
  'marketing manager': ['Marketing Manager', 'Digital Marketing Manager', 'Growth Manager', 'Brand Manager', 'Performance Marketing Manager'],
  'seo specialist': ['SEO Specialist', 'SEO Analyst', 'Search Engine Optimization Specialist', 'Digital Marketing Specialist'],
  'content writer': ['Content Writer', 'Copywriter', 'Content Strategist', 'Technical Writer', 'Content Marketing Specialist'],

  // ── Sales & business development ─────────────────────────────────────────
  'sales manager': ['Sales Manager', 'Regional Sales Manager', 'Area Sales Manager', 'Enterprise Sales Manager', 'Inside Sales Manager'],
  'business development manager': ['Business Development Manager', 'BDM', 'BD Manager', 'Partnerships Manager', 'Alliance Manager'],
  'account executive': ['Account Executive', 'AE', 'Enterprise Account Executive', 'Account Manager'],

  // ── Operations & strategy ────────────────────────────────────────────────
  'operations manager': ['Operations Manager', 'Sr. Operations Manager', 'Associate Operations Manager', 'Process Excellence Manager'],
  'chief of staff': ['Chief of Staff', 'CoS', 'Founder Office', 'Founder\'s Office', 'Business Manager', 'Strategy Manager'],

  // ── HR & recruiting ──────────────────────────────────────────────────────
  'hr manager': ['HR Manager', 'Human Resources Manager', 'HRBP', 'HR Business Partner', 'People Partner'],
  'recruiter': ['Recruiter', 'Talent Acquisition Specialist', 'Technical Recruiter', 'TA Specialist', 'Talent Partner'],

  // ── Customer success ─────────────────────────────────────────────────────
  'customer success manager': ['Customer Success Manager', 'CSM', 'Client Success Manager', 'Account Manager', 'Customer Experience Manager'],
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
