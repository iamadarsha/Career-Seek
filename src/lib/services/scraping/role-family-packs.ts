export type RoleFamilyId =
  | 'software_engineering'
  | 'product_management'
  | 'design'
  | 'data_analytics_ai'
  | 'qa_testing'
  | 'it_cloud_security'
  | 'marketing_content_growth'
  | 'sales_business_development'
  | 'customer_success_support'
  | 'operations_supply_chain'
  | 'finance_accounting_banking'
  | 'hr_recruiting'
  | 'consulting_strategy'
  | 'teaching_academic'
  | 'healthcare'
  | 'pharma_life_sciences'
  | 'legal_compliance'
  | 'manufacturing_core_engineering'
  | 'retail_hospitality_travel'
  | 'media_communications'
  | 'blue_grey_collar_field'
  | 'government_public_sector'
  | 'operations_sales_hr_finance'
  | 'freshers_internships';

export interface RoleFamilyPack {
  id: RoleFamilyId;
  label: string;
  triggers: string[];
  titleVariants: string[];
  adjacentTitles: string[];
  keywordHints: string[];
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

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function triggerMatches(haystack: string, trigger: string) {
  const normalized = trigger.toLowerCase().trim();
  if (!normalized) return false;
  if (/^[a-z0-9+#.]{1,3}$/.test(normalized)) {
    return new RegExp(`(^|[^a-z0-9])${escapeRegExp(normalized)}([^a-z0-9]|$)`).test(haystack);
  }
  return haystack.includes(normalized);
}

function hasProductManagementIntent(haystack: string) {
  return /\b(?:ai|genai|llm|technical|growth|associate|senior|group|principal|platform|b2b|saas)?\s*product\s+(?:manager|management|owner|lead|analyst|strategy|ops|operations|growth)\b|\b(?:apm|pm)\b/.test(haystack);
}

function hasProductQualifiedOpsOrStrategy(haystack: string) {
  return /\bproduct\s+(?:ops|operations|strategy)\b/.test(haystack);
}

function hasExplicitStrategyIntent(haystack: string) {
  return /\b(?:strategy\s*(?:and|&)?\s*ops|bizops|business operations|chief of staff|founder'?s?\s+office|strategy manager|business strategy|strategy consultant|management consultant)\b/.test(haystack);
}

function hasExplicitOperationsIntent(haystack: string) {
  return /\b(?:operations manager|program operations|supply chain|logistics|procurement|warehouse|inventory|fleet|fulfillment|vendor management)\b/.test(haystack);
}

function hasHrRecruitingIntent(haystack: string) {
  return /\b(?:hr|hrbp|human resources|people operations|people partner|talent acquisition|recruiter|recruiting|payroll|employee engagement|performance management)\b/.test(haystack);
}

function hasExplicitDataAiIntent(haystack: string) {
  return /\b(?:data\s+(?:analyst|scientist|engineer)|business intelligence|bi analyst|analytics manager|decision scientist|machine learning engineer|ml engineer|mlops|ai engineer|applied scientist)\b/.test(haystack);
}

function hasFinanceComplianceIntent(haystack: string) {
  return /\b(?:aml|kyc|sanctions?|transaction monitoring|financial crime|compliance|regulatory compliance|case investigation|suspicious transaction|str|cdd|edd|rbi|risk and compliance|compliance analyst|compliance officer|anti money laundering|customer due diligence|enhanced due diligence|fraud|due diligence|alert review|screening|risk analyst)\b/.test(haystack);
}

function prioritizeRoleIntent(matches: RoleFamilyId[], haystack: string): RoleFamilyId[] {
  let result = matches;

  if (hasProductManagementIntent(haystack)) {
    const productQualifiedOps = hasProductQualifiedOpsOrStrategy(haystack);
    result = result.filter((family) => {
      if (family === 'data_analytics_ai') {
        return hasExplicitDataAiIntent(haystack) && !/\bproduct\s+(?:manager|owner|lead|management)\b/.test(haystack);
      }
      if (family === 'software_engineering' || family === 'it_cloud_security') {
        return false;
      }
      if (family === 'consulting_strategy') {
        return hasExplicitStrategyIntent(haystack) && !productQualifiedOps;
      }
      if (family === 'operations_supply_chain' || family === 'operations_sales_hr_finance') {
        return hasExplicitOperationsIntent(haystack) && !productQualifiedOps;
      }
      return true;
    });
    result = ['product_management', ...result];
  }

  if (hasHrRecruitingIntent(haystack)) {
    result = result.filter((family) =>
      family !== 'operations_supply_chain' &&
      (family !== 'operations_sales_hr_finance' || hasExplicitOperationsIntent(haystack)),
    );
    result = ['hr_recruiting', ...result];
  }

  if (hasFinanceComplianceIntent(haystack)) {
    result = result.filter((family) => {
      if (family === 'data_analytics_ai') return hasExplicitDataAiIntent(haystack);
      if (family === 'operations_sales_hr_finance') return hasExplicitOperationsIntent(haystack);
      if (family === 'software_engineering' || family === 'product_management') return false;
      return true;
    });
    result = ['legal_compliance', 'finance_accounting_banking', ...result];
  }

  return Array.from(new Set(result)) as RoleFamilyId[];
}

export const ROLE_FAMILY_PACKS: RoleFamilyPack[] = [
  {
    id: 'software_engineering',
    label: 'Software engineering',
    triggers: ['software', 'developer', 'engineer', 'frontend', 'backend', 'full stack', 'fullstack', 'devops', 'sre', 'java', 'python', 'react', 'mobile developer'],
    titleVariants: [
      'Software Engineer',
      'Software Developer',
      'Frontend Engineer',
      'Backend Engineer',
      'Full Stack Engineer',
      'Platform Engineer',
      'DevOps Engineer',
      'Site Reliability Engineer',
      'Mobile App Developer',
    ],
    adjacentTitles: ['Application Developer', 'Cloud Engineer', 'Solutions Engineer', 'Engineering Associate', 'Technical Consultant'],
    keywordHints: ['api', 'cloud', 'microservices', 'react', 'node', 'python', 'java', 'system design'],
  },
  {
    id: 'product_management',
    label: 'Product management',
    triggers: ['product manager', 'product owner', 'pm', 'apm', 'product growth', 'ai product', 'llm product', 'genai'],
    titleVariants: [
      'Product Manager',
      'Associate Product Manager',
      'AI Product Manager',
      'GenAI Product Manager',
      'LLM Product Manager',
      'Technical Product Manager',
      'Product Owner',
      'Growth Product Manager',
    ],
    adjacentTitles: ['Program Manager', 'Product Analyst', 'Product Operations Manager', 'Product Strategy Manager'],
    keywordHints: ['roadmap', 'user research', 'experimentation', 'metrics', 'ai', 'llm', 'go-to-market'],
  },
  {
    id: 'design',
    label: 'Design',
    triggers: ['designer', 'product design', 'ui', 'ux', 'ui/ux', 'ux/ui', 'visual design', 'researcher', 'interaction design', 'user experience', 'user interface'],
    titleVariants: [
      'Product Designer',
      'UX Designer',
      'UI Designer',
      'UI/UX Designer',
      'UX/UI Designer',
      'Junior UX Designer',
      'Associate Product Designer',
      'User Experience Designer',
      'Interaction Designer',
      'UX Researcher',
    ],
    adjacentTitles: ['Design Strategist', 'Visual Designer', 'Service Designer', 'Content Designer', 'Design Systems Designer', 'Product Design Intern'],
    keywordHints: ['figma', 'prototyping', 'wireframes', 'design systems', 'interaction design', 'research', 'usability', 'case study'],
  },
  {
    id: 'data_analytics_ai',
    label: 'Data, analytics, and AI',
    triggers: ['data', 'analyst', 'analytics', 'scientist', 'machine learning', 'ml', 'ai', 'business intelligence'],
    titleVariants: [
      'Data Analyst',
      'Business Analyst',
      'Product Analyst',
      'Data Scientist',
      'Machine Learning Engineer',
      'AI Engineer',
      'Analytics Manager',
    ],
    adjacentTitles: ['Decision Scientist', 'BI Analyst', 'MLOps Engineer', 'Applied Scientist'],
    keywordHints: ['sql', 'python', 'dashboard', 'experimentation', 'forecasting', 'machine learning', 'genai'],
  },
  {
    id: 'qa_testing',
    label: 'QA, testing, and automation',
    triggers: ['qa', 'quality assurance', 'tester', 'testing', 'sdet', 'automation testing', 'manual testing', 'test engineer'],
    titleVariants: ['QA Engineer', 'SDET', 'Automation Test Engineer', 'Manual Test Engineer', 'Quality Analyst', 'Test Lead'],
    adjacentTitles: ['Release Engineer', 'QA Analyst', 'Performance Test Engineer', 'Software Test Engineer'],
    keywordHints: ['selenium', 'cypress', 'playwright', 'test automation', 'manual testing', 'api testing'],
  },
  {
    id: 'it_cloud_security',
    label: 'IT, cloud, cybersecurity, and support engineering',
    triggers: ['it support', 'system admin', 'network', 'cybersecurity', 'security analyst', 'cloud', 'aws', 'azure', 'gcp', 'soc', 'helpdesk'],
    titleVariants: ['IT Support Engineer', 'System Administrator', 'Network Engineer', 'Cloud Engineer', 'Security Analyst', 'SOC Analyst'],
    adjacentTitles: ['Infrastructure Engineer', 'Desktop Support Engineer', 'Information Security Analyst', 'DevSecOps Engineer'],
    keywordHints: ['linux', 'networking', 'aws', 'azure', 'security', 'soc', 'incident response'],
  },
  {
    id: 'marketing_content_growth',
    label: 'Marketing, content, SEO, and growth',
    triggers: ['marketing', 'seo', 'content', 'copywriter', 'growth', 'brand', 'performance marketing', 'social media', 'crm marketing'],
    titleVariants: ['Marketing Manager', 'Digital Marketing Manager', 'SEO Specialist', 'Content Writer', 'Growth Manager', 'Brand Manager'],
    adjacentTitles: ['Performance Marketing Analyst', 'Social Media Manager', 'Content Strategist', 'Marketing Operations Manager'],
    keywordHints: ['campaigns', 'seo', 'content', 'brand', 'performance marketing', 'crm', 'growth'],
  },
  {
    id: 'sales_business_development',
    label: 'Sales and business development',
    triggers: ['sales', 'business development', 'bd', 'bde', 'account executive', 'relationship manager', 'inside sales', 'field sales'],
    titleVariants: ['Sales Manager', 'Business Development Manager', 'Account Executive', 'Inside Sales Specialist', 'Relationship Manager'],
    adjacentTitles: ['Enterprise Sales Manager', 'Territory Sales Manager', 'Channel Sales Manager', 'Partnerships Manager'],
    keywordHints: ['sales', 'revenue', 'pipeline', 'crm', 'targets', 'partnerships', 'field sales'],
  },
  {
    id: 'customer_success_support',
    label: 'Customer success, support, and service',
    triggers: ['customer success', 'customer support', 'support', 'service', 'client success', 'customer care', 'technical support'],
    titleVariants: ['Customer Success Manager', 'Customer Support Executive', 'Technical Support Engineer', 'Client Success Manager', 'Service Manager'],
    adjacentTitles: ['Account Manager', 'Implementation Specialist', 'Support Analyst', 'Customer Experience Manager'],
    keywordHints: ['customer', 'support', 'sla', 'service', 'retention', 'implementation', 'escalation'],
  },
  {
    id: 'operations_supply_chain',
    label: 'Operations, supply chain, and logistics',
    triggers: ['operations', 'supply chain', 'logistics', 'procurement', 'warehouse', 'inventory', 'fleet', 'program operations'],
    titleVariants: ['Operations Manager', 'Supply Chain Manager', 'Logistics Manager', 'Procurement Specialist', 'Warehouse Manager'],
    adjacentTitles: ['Program Operations Manager', 'Inventory Analyst', 'Fleet Manager', 'Vendor Manager'],
    keywordHints: ['operations', 'logistics', 'supply chain', 'procurement', 'inventory', 'vendor management'],
  },
  {
    id: 'finance_accounting_banking',
    label: 'Finance, accounting, banking, and insurance',
    triggers: ['finance', 'accounting', 'accounts', 'banking', 'insurance', 'credit', 'risk', 'audit', 'tax', 'treasury', 'aml', 'kyc', 'financial crime', 'compliance analyst'],
    titleVariants: ['Finance Analyst', 'Accountant', 'Credit Analyst', 'Risk Analyst', 'Audit Associate', 'Relationship Manager', 'AML Analyst', 'KYC Analyst', 'Compliance Analyst', 'Transaction Monitoring Analyst', 'Sanctions Analyst', 'Fraud Analyst'],
    adjacentTitles: ['Financial Controller', 'Tax Analyst', 'Treasury Analyst', 'Insurance Advisor', 'Loan Officer', 'Financial Crime Analyst', 'Due Diligence Analyst', 'CDD Analyst', 'Compliance Officer'],
    keywordHints: ['finance', 'accounting', 'banking', 'credit', 'risk', 'audit', 'tax', 'aml', 'kyc', 'sanctions', 'transaction monitoring'],
  },
  {
    id: 'hr_recruiting',
    label: 'HR, talent, and recruiting',
    triggers: ['hr', 'human resources', 'recruiter', 'talent acquisition', 'people operations', 'payroll', 'hrbp'],
    titleVariants: ['HR Manager', 'Recruiter', 'Talent Acquisition Specialist', 'HR Business Partner', 'People Operations Specialist'],
    adjacentTitles: ['Payroll Specialist', 'Learning and Development Manager', 'HR Operations Associate', 'Campus Recruiter'],
    keywordHints: ['recruiting', 'talent', 'hr', 'payroll', 'onboarding', 'employee engagement'],
  },
  {
    id: 'consulting_strategy',
    label: 'Consulting, strategy, and general management',
    triggers: ['consultant', 'consulting', 'strategy', 'business analyst', 'chief of staff', 'founder office', 'general management', 'management trainee'],
    titleVariants: ['Consultant', 'Business Analyst', 'Strategy Manager', 'Chief of Staff', 'Founder Office Associate', 'Management Trainee'],
    adjacentTitles: ['Program Manager', 'Transformation Consultant', 'Operations Strategy Manager', 'General Manager'],
    keywordHints: ['strategy', 'consulting', 'analysis', 'stakeholder management', 'business operations'],
  },
  {
    id: 'teaching_academic',
    label: 'Teachers, faculty, and academic roles',
    triggers: ['teacher', 'faculty', 'professor', 'lecturer', 'academic', 'curriculum', 'trainer', 'tutor', 'school', 'principal', 'counsellor'],
    titleVariants: ['Teacher', 'Faculty', 'Lecturer', 'Professor', 'Academic Coordinator', 'Curriculum Designer', 'School Principal'],
    adjacentTitles: ['Trainer', 'Tutor', 'Learning Designer', 'Subject Matter Expert', 'Instructional Designer', 'Career Counsellor'],
    keywordHints: ['teaching', 'curriculum', 'classroom', 'assessment', 'edtech', 'training'],
  },
  {
    id: 'healthcare',
    label: 'Doctors, healthcare, and hospitals',
    triggers: ['doctor', 'physician', 'surgeon', 'nurse', 'healthcare', 'hospital', 'medical', 'clinical', 'diagnostic', 'physiotherapist'],
    titleVariants: ['Doctor', 'Medical Officer', 'Consultant Doctor', 'Resident Doctor', 'Nurse', 'Clinical Specialist', 'Lab Technician'],
    adjacentTitles: ['Healthcare Operations', 'Medical Advisor', 'Pharmacist', 'Care Coordinator', 'Radiology Technician'],
    keywordHints: ['clinical', 'patient', 'hospital', 'diagnostics', 'healthtech', 'nursing'],
  },
  {
    id: 'pharma_life_sciences',
    label: 'Pharma, biotech, and life sciences',
    triggers: ['pharma', 'pharmaceutical', 'biotech', 'life sciences', 'clinical research', 'regulatory affairs', 'quality control', 'medical representative'],
    titleVariants: ['Clinical Research Associate', 'Regulatory Affairs Associate', 'Quality Control Analyst', 'Medical Representative', 'Pharmacovigilance Associate'],
    adjacentTitles: ['Research Scientist', 'Production Chemist', 'Validation Engineer', 'Medical Science Liaison'],
    keywordHints: ['pharma', 'biotech', 'clinical research', 'regulatory', 'quality control', 'gmp'],
  },
  {
    id: 'legal_compliance',
    label: 'Legal, compliance, and policy',
    triggers: ['legal', 'lawyer', 'counsel', 'compliance', 'company secretary', 'cs ', 'contract manager', 'policy', 'aml', 'kyc', 'sanctions', 'transaction monitoring', 'financial crime', 'regulatory compliance'],
    titleVariants: [
      'Legal Counsel',
      'Lawyer',
      'Compliance Officer',
      'Compliance Analyst',
      'AML Analyst',
      'KYC Analyst',
      'Financial Crime Analyst',
      'Transaction Monitoring Analyst',
      'Sanctions Analyst',
      'Company Secretary',
      'Contract Manager',
      'Policy Analyst',
    ],
    adjacentTitles: ['Legal Associate', 'Risk and Compliance Analyst', 'Privacy Analyst', 'Regulatory Compliance Manager', 'AML Compliance Manager', 'Regulatory Reporting Analyst'],
    keywordHints: ['legal', 'contracts', 'compliance', 'regulatory', 'policy', 'risk', 'aml', 'kyc', 'cdd', 'edd', 'sanctions', 'transaction monitoring'],
  },
  {
    id: 'manufacturing_core_engineering',
    label: 'Manufacturing, core engineering, and plant roles',
    triggers: ['manufacturing', 'production', 'plant', 'mechanical', 'electrical', 'civil engineer', 'industrial', 'maintenance', 'quality engineer'],
    titleVariants: ['Production Engineer', 'Mechanical Engineer', 'Electrical Engineer', 'Plant Manager', 'Quality Engineer', 'Maintenance Engineer'],
    adjacentTitles: ['Process Engineer', 'Industrial Engineer', 'EHS Officer', 'Project Engineer', 'Civil Engineer'],
    keywordHints: ['manufacturing', 'plant', 'production', 'quality', 'maintenance', 'mechanical', 'electrical'],
  },
  {
    id: 'retail_hospitality_travel',
    label: 'Retail, hospitality, travel, and front office',
    triggers: ['retail', 'store', 'hospitality', 'hotel', 'travel', 'tourism', 'front office', 'guest relations', 'merchandising'],
    titleVariants: ['Store Manager', 'Retail Sales Associate', 'Hotel Manager', 'Front Office Executive', 'Travel Consultant', 'Merchandiser'],
    adjacentTitles: ['Guest Relations Executive', 'Restaurant Manager', 'Category Manager', 'Visual Merchandiser'],
    keywordHints: ['retail', 'store', 'hospitality', 'travel', 'guest relations', 'merchandising'],
  },
  {
    id: 'media_communications',
    label: 'Media, communications, and creative production',
    triggers: ['media', 'journalist', 'editor', 'communications', 'public relations', 'pr ', 'video editor', 'producer', 'creative'],
    titleVariants: ['Content Editor', 'Journalist', 'Communications Manager', 'Public Relations Manager', 'Video Editor', 'Creative Producer'],
    adjacentTitles: ['Copywriter', 'Social Media Manager', 'Brand Communications Specialist', 'Graphic Designer'],
    keywordHints: ['media', 'communications', 'editorial', 'pr', 'creative', 'production'],
  },
  {
    id: 'blue_grey_collar_field',
    label: 'Field, delivery, technician, and blue collar roles',
    triggers: ['delivery', 'driver', 'technician', 'field executive', 'electrician', 'mechanic', 'operator', 'security guard', 'housekeeping'],
    titleVariants: ['Field Executive', 'Delivery Executive', 'Technician', 'Machine Operator', 'Electrician', 'Driver'],
    adjacentTitles: ['Mechanic', 'Security Guard', 'Housekeeping Supervisor', 'Service Technician', 'Field Sales Executive'],
    keywordHints: ['field', 'delivery', 'technician', 'operator', 'service', 'driver'],
  },
  {
    id: 'government_public_sector',
    label: 'Government, public sector, and public policy',
    triggers: ['government', 'govt', 'sarkari', 'public sector', 'psu', 'upsc', 'ssc', 'railway', 'bank po'],
    titleVariants: ['Government Officer', 'Public Sector Trainee', 'Bank PO', 'Railway Recruitment', 'Policy Associate', 'Administrative Officer'],
    adjacentTitles: ['Public Policy Analyst', 'PSU Engineer Trainee', 'Assistant Manager', 'Probationary Officer'],
    keywordHints: ['government', 'psu', 'recruitment', 'public sector', 'exam', 'policy'],
  },
  {
    id: 'operations_sales_hr_finance',
    label: 'Operations, sales, HR, and finance',
    triggers: ['operations', 'sales', 'business development', 'finance', 'banking', 'hr', 'recruiter', 'accounts', 'customer success'],
    titleVariants: [
      'Operations Manager',
      'Sales Manager',
      'Business Development Manager',
      'HR Manager',
      'Finance Analyst',
      'Relationship Manager',
    ],
    adjacentTitles: ['Account Manager', 'Program Operations', 'Recruiter', 'Credit Analyst', 'Customer Success Manager', 'Business Analyst'],
    keywordHints: ['revenue', 'sales', 'operations', 'banking', 'stakeholder management', 'customer success'],
  },
  {
    id: 'freshers_internships',
    label: 'Freshers and internships',
    triggers: ['fresher', 'intern', 'internship', 'graduate', 'trainee', 'entry level'],
    titleVariants: ['Intern', 'Graduate Trainee', 'Management Trainee', 'Software Engineer Intern', 'Product Intern'],
    adjacentTitles: ['Associate', 'Trainee', 'Campus Hire', 'Fresher'],
    keywordHints: ['internship', 'entry level', 'campus', 'trainee'],
  },
];

export function inferRoleFamilies(values: string[]): RoleFamilyId[] {
  const haystack = values.join(' ').toLowerCase();
  const matches = ROLE_FAMILY_PACKS.filter((pack) =>
    pack.triggers.some((trigger) => triggerMatches(haystack, trigger)),
  ).map((pack) => pack.id);

  return matches.length ? prioritizeRoleIntent(matches, haystack) : ['product_management'];
}

export function expandTitlesWithRolePacks(titles: string[], maxTitles = 32) {
  const families = inferRoleFamilies(titles);
  const packTitles = ROLE_FAMILY_PACKS
    .filter((pack) => families.includes(pack.id))
    .flatMap((pack) => [...pack.titleVariants, ...pack.adjacentTitles]);

  return {
    roleFamilies: families,
    titleVariants: unique([...titles, ...packTitles]).slice(0, maxTitles),
    keywordHints: unique(
      ROLE_FAMILY_PACKS
        .filter((pack) => families.includes(pack.id))
        .flatMap((pack) => pack.keywordHints),
    ),
  };
}

export function getRoleFamilyLabel(id: RoleFamilyId) {
  return ROLE_FAMILY_PACKS.find((pack) => pack.id === id)?.label || id;
}
