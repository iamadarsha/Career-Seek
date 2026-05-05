import { type RoleFamilyId } from './role-family-packs';
import fs from 'fs';
import path from 'path';

export type AtsType =
  | 'greenhouse'
  | 'lever'
  | 'workday'
  | 'ashby'
  | 'rippling'
  | 'bamboohr'
  | 'icims'
  | 'successfactors'
  | 'smartrecruiters'
  | 'custom'
  | 'unknown_or_custom';

export interface CompanyCareerSource {
  id: string;
  company: string;
  careersUrl: string;
  atsType: AtsType;
  sectors: string[];
  roleFamilies: RoleFamilyId[];
  cityHints: string[];
  remoteRelevance: 'remote-friendly' | 'hybrid' | 'onsite-heavy' | 'india-wide';
  notes?: string;
}

type CompanySourceOptions = {
  targetCompanies?: string[];
  locations?: string[];
  companyTypes?: string[];
};

function roleSet(...groups: RoleFamilyId[][]): RoleFamilyId[] {
  return Array.from(new Set(groups.flat()));
}

const techRoles: RoleFamilyId[] = [
  'software_engineering',
  'product_management',
  'design',
  'data_analytics_ai',
  'qa_testing',
  'it_cloud_security',
  'customer_success_support',
  'marketing_content_growth',
  'sales_business_development',
  'hr_recruiting',
  'freshers_internships',
];
const educationRoles: RoleFamilyId[] = [
  'teaching_academic',
  'product_management',
  'software_engineering',
  'data_analytics_ai',
  'marketing_content_growth',
  'sales_business_development',
  'customer_success_support',
  'operations_supply_chain',
  'hr_recruiting',
  'freshers_internships',
];
const healthcareRoles: RoleFamilyId[] = [
  'healthcare',
  'pharma_life_sciences',
  'operations_supply_chain',
  'operations_sales_hr_finance',
  'finance_accounting_banking',
  'sales_business_development',
  'customer_success_support',
  'hr_recruiting',
  'data_analytics_ai',
  'software_engineering',
];
const opsFinanceRoles: RoleFamilyId[] = [
  'operations_sales_hr_finance',
  'operations_supply_chain',
  'sales_business_development',
  'finance_accounting_banking',
  'hr_recruiting',
  'customer_success_support',
  'consulting_strategy',
  'marketing_content_growth',
  'product_management',
  'data_analytics_ai',
  'freshers_internships',
];
const consultingRoles: RoleFamilyId[] = roleSet(opsFinanceRoles, ['consulting_strategy', 'legal_compliance', 'software_engineering']);
const manufacturingRoles: RoleFamilyId[] = [
  'manufacturing_core_engineering',
  'operations_supply_chain',
  'operations_sales_hr_finance',
  'sales_business_development',
  'finance_accounting_banking',
  'hr_recruiting',
  'data_analytics_ai',
  'it_cloud_security',
  'freshers_internships',
];
const pharmaRoles: RoleFamilyId[] = roleSet(healthcareRoles, ['pharma_life_sciences', 'manufacturing_core_engineering', 'legal_compliance']);
const retailTravelRoles: RoleFamilyId[] = [
  'retail_hospitality_travel',
  'operations_supply_chain',
  'sales_business_development',
  'customer_success_support',
  'marketing_content_growth',
  'finance_accounting_banking',
  'hr_recruiting',
  'blue_grey_collar_field',
  'freshers_internships',
];
const fieldOpsRoles: RoleFamilyId[] = roleSet(retailTravelRoles, ['blue_grey_collar_field', 'operations_sales_hr_finance']);
const mediaRoles: RoleFamilyId[] = [
  'media_communications',
  'marketing_content_growth',
  'design',
  'sales_business_development',
  'customer_success_support',
  'product_management',
  'data_analytics_ai',
  'hr_recruiting',
];
const legalRoles: RoleFamilyId[] = [
  'legal_compliance',
  'consulting_strategy',
  'finance_accounting_banking',
  'hr_recruiting',
  'operations_sales_hr_finance',
  'freshers_internships',
];
const publicSectorRoles: RoleFamilyId[] = roleSet(opsFinanceRoles, ['government_public_sector', 'manufacturing_core_engineering', 'legal_compliance']);

function c(
  id: string,
  company: string,
  careersUrl: string,
  atsType: AtsType,
  sectors: string[],
  roleFamilies: RoleFamilyId[],
  cityHints: string[] = ['India'],
  remoteRelevance: CompanyCareerSource['remoteRelevance'] = 'hybrid',
  notes?: string,
): CompanyCareerSource {
  return { id, company, careersUrl, atsType, sectors, roleFamilies, cityHints, remoteRelevance, notes };
}

const ROLE_FAMILY_IDS = new Set<RoleFamilyId>([
  'software_engineering',
  'product_management',
  'design',
  'data_analytics_ai',
  'qa_testing',
  'it_cloud_security',
  'marketing_content_growth',
  'sales_business_development',
  'customer_success_support',
  'operations_supply_chain',
  'finance_accounting_banking',
  'hr_recruiting',
  'consulting_strategy',
  'teaching_academic',
  'healthcare',
  'pharma_life_sciences',
  'legal_compliance',
  'manufacturing_core_engineering',
  'retail_hospitality_travel',
  'media_communications',
  'blue_grey_collar_field',
  'government_public_sector',
  'operations_sales_hr_finance',
  'freshers_internships',
]);

function slug(value: string) {
  return String(value || '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '') || 'company';
}

function normalizeText(value: unknown) {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function parseCsv(value: string) {
  const rows: string[][] = [];
  let row: string[] = [];
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
  const headers = rows[0]?.map((header) => header.trim()) || [];
  return rows.slice(1).map((cells) => Object.fromEntries(headers.map((header, index) => [
    header,
    (cells[index] || '').trim(),
  ])));
}

function readCsv(fileName: string) {
  if (typeof window !== 'undefined') return [];
  try {
    const filePath = path.join(process.cwd(), 'data', fileName);
    if (!fs.existsSync(filePath)) return [];
    return parseCsv(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return [];
  }
}

function toRoleFamilies(value: string, fallbackText: string): RoleFamilyId[] {
  const explicit = String(value || '')
    .split(/[;,|]+/)
    .map((item) => item.trim())
    .filter((item): item is RoleFamilyId => ROLE_FAMILY_IDS.has(item as RoleFamilyId));
  if (explicit.length) return Array.from(new Set(explicit));

  const text = normalizeText(fallbackText);
  const matches: RoleFamilyId[] = [];
  const add = (family: RoleFamilyId, pattern: RegExp) => {
    if (pattern.test(text)) matches.push(family);
  };
  add('software_engineering', /\b(software|technology|it services|cloud|saas|internet|platform|developer|engineering|semiconductor|telecom)\b/);
  add('product_management', /\b(product|saas|fintech|consumer app|marketplace|platform|startup|internet)\b/);
  add('design', /\b(design|media|fashion|consumer app|creative|ux|ui)\b/);
  add('data_analytics_ai', /\b(data|analytics|ai|ml|research|ratings|risk|semiconductor|biotech)\b/);
  add('finance_accounting_banking', /\b(bank|finance|insurance|nbfc|payments|capital|broking|wealth|asset|fintech|ratings)\b/);
  add('legal_compliance', /\b(compliance|legal|risk|bank|finance|insurance|aml|kyc|regulator)\b/);
  add('operations_supply_chain', /\b(logistics|retail|supply|warehouse|manufacturing|automotive|fmcg|aviation|energy|infrastructure)\b/);
  add('operations_sales_hr_finance', /\b(retail|sales|operations|hospitality|bank|finance|insurance|fmcg|real estate|media)\b/);
  add('sales_business_development', /\b(sales|retail|bank|insurance|fmcg|hospitality|media|telecom)\b/);
  add('healthcare', /\b(health|hospital|diagnostic|pharma|biotech|life sciences)\b/);
  add('pharma_life_sciences', /\b(pharma|biotech|life sciences|diagnostic|chemicals)\b/);
  add('manufacturing_core_engineering', /\b(manufacturing|automotive|steel|cement|chemicals|energy|power|industrial|engineering|defence|oil|gas)\b/);
  add('retail_hospitality_travel', /\b(retail|hospitality|travel|airline|hotel|fashion|consumer)\b/);
  add('media_communications', /\b(media|entertainment|publishing|gaming|communications)\b/);
  add('government_public_sector', /\b(psu|government|public sector|regulator|institute)\b/);
  add('hr_recruiting', /\b(hr|staffing|people|talent)\b/);

  return matches.length ? Array.from(new Set(matches)) : ['software_engineering', 'operations_sales_hr_finance', 'finance_accounting_banking'];
}

function asAtsType(value: string): AtsType {
  const normalized = normalizeText(value).replace(/\s+/g, '_');
  return ([
    'greenhouse',
    'lever',
    'workday',
    'ashby',
    'rippling',
    'bamboohr',
    'icims',
    'successfactors',
    'smartrecruiters',
    'custom',
    'unknown_or_custom',
  ] as AtsType[]).includes(normalized as AtsType) ? normalized as AtsType : 'unknown_or_custom';
}

function cityHints(value: string) {
  const hints = String(value || '')
    .split(/[;|,]+/)
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, 8);
  return hints.length ? hints : ['India'];
}

function remoteRelevance(value: string, industries: string): CompanyCareerSource['remoteRelevance'] {
  const text = normalizeText(`${value} ${industries}`);
  if (/\bremote\b/.test(text)) return 'remote-friendly';
  if (/\bhybrid\b/.test(text)) return 'hybrid';
  if (/\bindia\b|pan india|india wide/.test(text)) return 'india-wide';
  return 'hybrid';
}

function topCompanyRowToSource(row: Record<string, string>): CompanyCareerSource | null {
  const company = row.name || row.company;
  const careersUrl = row['career-page URL'] || row.career_url_final || row.career_url_hint || row.website;
  if (!company || !careersUrl) return null;
  const industry = row.industry || row.sector || 'India company';
  const website = row.website || '';
  return c(
    slug(company),
    company,
    careersUrl,
    asAtsType(row['ATS type'] || row.ats_type),
    industry.split(/[;/|]+/).map((item) => normalizeText(item).replace(/\s+/g, '-')).filter(Boolean),
    toRoleFamilies(row.role_family || '', `${industry} ${company}`),
    cityHints(row.city_tags || 'India'),
    remoteRelevance(row.remote_possible || '', industry),
    `Curated India company universe entry${website ? `; website ${website}` : ''}.`,
  );
}

function seedRowToSource(row: Record<string, string>): CompanyCareerSource | null {
  const source = topCompanyRowToSource({
    name: row.company,
    website: row.career_url_hint,
    'career-page URL': row.career_url_final || row.career_url_hint,
    'ATS type': row.ats_type,
    industry: [row.sector, row.subsector].filter(Boolean).join(' / '),
    role_family: row.role_family,
    city_tags: row.city_tags,
    remote_possible: row.remote_possible,
  });
  return source ? { ...source, id: slug(`${row.company}-${row.sector || ''}`), notes: row.notes || source.notes } : null;
}

let mergedCompanySourcesCache: CompanyCareerSource[] | null = null;

function allCompanyCareerSources() {
  if (mergedCompanySourcesCache) return mergedCompanySourcesCache;
  const dynamicSources = [
    ...readCsv('india-companies-top.csv').map(topCompanyRowToSource),
    ...readCsv('company_careers_seed.csv').map(seedRowToSource),
  ].filter((source): source is CompanyCareerSource => Boolean(source));

  const byKey = new Map<string, CompanyCareerSource>();
  for (const source of [...COMPANY_CAREERS_SOURCES, ...dynamicSources]) {
    const key = `${normalizeText(source.company)}|${source.careersUrl}`;
    if (!byKey.has(key)) byKey.set(key, source);
  }
  mergedCompanySourcesCache = Array.from(byKey.values());
  return mergedCompanySourcesCache;
}

function hasNeedle(source: CompanyCareerSource, needles: string[]) {
  if (!needles.length) return false;
  const sourceText = normalizeText([
    source.company,
    source.careersUrl,
    source.sectors.join(' '),
    source.roleFamilies.join(' '),
    source.cityHints.join(' '),
    source.notes,
  ].join(' '));
  return needles.some((needle) => {
    const normalized = normalizeText(needle);
    return normalized && sourceText.includes(normalized);
  });
}

export const COMPANY_CAREERS_SOURCES: CompanyCareerSource[] = [
  c('google', 'Google', 'https://www.google.com/about/careers/applications/jobs/results/?location=India', 'custom', ['big-tech'], techRoles, ['Bengaluru', 'Hyderabad', 'Gurugram', 'Mumbai'], 'hybrid'),
  c('microsoft', 'Microsoft', 'https://jobs.careers.microsoft.com/global/en/search?q=&lc=India', 'custom', ['big-tech'], techRoles, ['Bengaluru', 'Hyderabad', 'Noida'], 'hybrid'),
  c('amazon', 'Amazon', 'https://www.amazon.jobs/en/search?base_query=&loc_query=India', 'custom', ['big-tech', 'marketplace', 'operations'], [...techRoles, 'operations_sales_hr_finance'], ['Bengaluru', 'Hyderabad', 'Chennai', 'Mumbai', 'Gurugram'], 'india-wide'),
  c('adobe', 'Adobe', 'https://careers.adobe.com/us/en/search-results?keywords=&location=India', 'custom', ['big-tech', 'creative-software'], techRoles, ['Bengaluru', 'Noida'], 'hybrid'),
  c('salesforce', 'Salesforce', 'https://careers.salesforce.com/en/jobs/?search=&country=India', 'custom', ['saas', 'enterprise'], [...techRoles, 'operations_sales_hr_finance'], ['Hyderabad', 'Bengaluru', 'Mumbai', 'Gurugram'], 'hybrid'),
  c('oracle', 'Oracle', 'https://careers.oracle.com/jobs/#en/sites/jobsearch/requisitions?location=India', 'custom', ['enterprise', 'cloud'], [...techRoles, 'operations_sales_hr_finance'], ['Bengaluru', 'Hyderabad', 'Noida'], 'hybrid'),
  c('sap', 'SAP', 'https://jobs.sap.com/search/?locationsearch=India', 'custom', ['enterprise', 'saas'], techRoles, ['Bengaluru', 'Gurugram', 'Mumbai'], 'hybrid'),
  c('atlassian', 'Atlassian', 'https://job-boards.greenhouse.io/atlassian', 'greenhouse', ['saas', 'product'], techRoles, ['Bengaluru', 'Remote'], 'remote-friendly'),
  c('uber', 'Uber', 'https://www.uber.com/global/en/careers/list/?location=IND--India', 'custom', ['mobility', 'marketplace'], [...techRoles, 'operations_sales_hr_finance'], ['Bengaluru', 'Hyderabad', 'Gurugram'], 'hybrid'),
  c('airbnb', 'Airbnb', 'https://careers.airbnb.com/positions/?location=India', 'custom', ['marketplace', 'travel'], techRoles, ['Bengaluru', 'Gurugram', 'Remote'], 'remote-friendly'),
  c('stripe', 'Stripe', 'https://stripe.com/jobs/search?l=India', 'custom', ['fintech', 'payments'], [...techRoles, 'operations_sales_hr_finance'], ['Bengaluru', 'Remote'], 'remote-friendly'),
  c('databricks', 'Databricks', 'https://www.databricks.com/company/careers/open-positions?location=India', 'custom', ['data', 'ai', 'cloud'], ['software_engineering', 'product_management', 'data_analytics_ai'], ['Bengaluru', 'Remote'], 'hybrid'),
  c('snowflake', 'Snowflake', 'https://careers.snowflake.com/us/en/search-results?keywords=&location=India', 'custom', ['data', 'cloud'], ['software_engineering', 'product_management', 'data_analytics_ai'], ['Pune', 'Bengaluru', 'Mumbai'], 'hybrid'),
  c('nvidia', 'NVIDIA', 'https://nvidia.wd5.myworkdayjobs.com/NVIDIAExternalCareerSite', 'workday', ['semiconductor', 'ai'], ['software_engineering', 'product_management', 'data_analytics_ai'], ['Bengaluru', 'Pune', 'Hyderabad'], 'hybrid'),
  c('tcs', 'TCS', 'https://www.tcs.com/careers/india', 'custom', ['it-services'], [...techRoles, 'operations_sales_hr_finance'], ['India'], 'india-wide'),
  c('infosys', 'Infosys', 'https://www.infosys.com/careers/apply.html', 'custom', ['it-services'], [...techRoles, 'operations_sales_hr_finance'], ['Bengaluru', 'Pune', 'Hyderabad', 'Chennai'], 'india-wide'),
  c('wipro', 'Wipro', 'https://careers.wipro.com/careers-home/', 'custom', ['it-services'], [...techRoles, 'operations_sales_hr_finance'], ['Bengaluru', 'Hyderabad', 'Pune', 'Chennai'], 'india-wide'),
  c('hcltech', 'HCLTech', 'https://www.hcltech.com/careers/careers-in-india', 'custom', ['it-services'], [...techRoles, 'operations_sales_hr_finance'], ['Noida', 'Chennai', 'Bengaluru', 'Pune'], 'india-wide'),
  c('tech-mahindra', 'Tech Mahindra', 'https://www.techmahindra.com/en-in/careers/', 'custom', ['it-services'], [...techRoles, 'operations_sales_hr_finance'], ['Pune', 'Hyderabad', 'Noida', 'Bengaluru'], 'india-wide'),
  c('ltimindtree', 'LTIMindtree', 'https://www.ltimindtree.com/careers/', 'custom', ['it-services'], techRoles, ['Mumbai', 'Bengaluru', 'Pune', 'Chennai'], 'india-wide'),
  c('mphasis', 'Mphasis', 'https://www.mphasis.com/home/careers.html', 'custom', ['it-services'], techRoles, ['Bengaluru', 'Pune', 'Chennai'], 'india-wide'),
  c('coforge', 'Coforge', 'https://www.coforge.com/careers', 'custom', ['it-services'], techRoles, ['Noida', 'Bengaluru', 'Hyderabad', 'Pune'], 'india-wide'),
  c('persistent', 'Persistent', 'https://www.persistent.com/careers/', 'custom', ['it-services', 'product-engineering'], techRoles, ['Pune', 'Bengaluru', 'Hyderabad'], 'india-wide'),
  c('kpit', 'KPIT', 'https://www.kpit.com/careers/', 'custom', ['automotive-tech'], ['software_engineering', 'product_management', 'data_analytics_ai'], ['Pune', 'Bengaluru'], 'hybrid'),
  c('hexaware', 'Hexaware', 'https://hexaware.com/careers/', 'custom', ['it-services'], techRoles, ['Chennai', 'Mumbai', 'Pune', 'Bengaluru'], 'india-wide'),
  c('accenture-india', 'Accenture India', 'https://www.accenture.com/in-en/careers/jobsearch', 'custom', ['consulting', 'it-services'], [...techRoles, 'operations_sales_hr_finance'], ['Bengaluru', 'Hyderabad', 'Mumbai', 'Gurugram'], 'india-wide'),
  c('capgemini-india', 'Capgemini India', 'https://www.capgemini.com/in-en/careers/job-search/', 'custom', ['consulting', 'it-services'], [...techRoles, 'operations_sales_hr_finance'], ['Bengaluru', 'Mumbai', 'Pune', 'Hyderabad'], 'india-wide'),
  c('ibm-india', 'IBM India', 'https://www.ibm.com/careers/search?field_keyword_18[0]=India', 'custom', ['consulting', 'cloud', 'ai'], [...techRoles, 'operations_sales_hr_finance'], ['Bengaluru', 'Hyderabad', 'Pune', 'Gurugram'], 'hybrid'),
  c('zoho', 'Zoho', 'https://www.zoho.com/careers/jobdetails/', 'custom', ['saas', 'product'], techRoles, ['Chennai', 'Coimbatore', 'Bengaluru'], 'hybrid'),
  c('freshworks', 'Freshworks', 'https://careers.smartrecruiters.com/Freshworks', 'smartrecruiters', ['saas', 'product'], techRoles, ['Chennai', 'Bengaluru', 'Hyderabad'], 'hybrid'),
  c('postman', 'Postman', 'https://www.postman.com/company/careers/', 'custom', ['developer-tools', 'saas'], techRoles, ['Bengaluru', 'Remote'], 'remote-friendly'),
  c('browserstack', 'BrowserStack', 'https://www.browserstack.com/careers/jobs', 'custom', ['developer-tools', 'saas'], techRoles, ['Mumbai', 'Remote'], 'remote-friendly'),
  c('razorpay', 'Razorpay', 'https://razorpay.com/jobs/', 'custom', ['fintech', 'payments'], [...techRoles, 'operations_sales_hr_finance'], ['Bengaluru', 'Mumbai'], 'hybrid'),
  c('phonepe', 'PhonePe', 'https://www.phonepe.com/careers/jobs/', 'custom', ['fintech', 'payments'], [...techRoles, 'operations_sales_hr_finance'], ['Bengaluru', 'Pune'], 'hybrid'),
  c('paytm', 'Paytm', 'https://paytm.com/careers/', 'custom', ['fintech', 'consumer'], [...techRoles, 'operations_sales_hr_finance'], ['Noida', 'Bengaluru', 'Mumbai'], 'hybrid'),
  c('cred', 'CRED', 'https://cred.club/careers', 'custom', ['fintech', 'consumer'], [...techRoles, 'operations_sales_hr_finance'], ['Bengaluru'], 'hybrid'),
  c('meesho', 'Meesho', 'https://www.meesho.io/jobs', 'custom', ['marketplace', 'consumer'], [...techRoles, 'operations_sales_hr_finance'], ['Bengaluru'], 'hybrid'),
  c('swiggy', 'Swiggy', 'https://careers.swiggy.com/#/careers', 'custom', ['consumer', 'foodtech', 'logistics'], [...techRoles, 'operations_sales_hr_finance'], ['Bengaluru', 'Gurugram', 'Mumbai', 'Hyderabad'], 'india-wide'),
  c('zomato', 'Zomato', 'https://www.zomato.com/careers', 'custom', ['consumer', 'foodtech'], [...techRoles, 'operations_sales_hr_finance'], ['Gurugram', 'Bengaluru', 'Mumbai'], 'india-wide'),
  c('dream11', 'Dream11', 'https://www.dreamsports.group/careers/', 'custom', ['gaming', 'sports-tech'], techRoles, ['Mumbai', 'Bengaluru'], 'hybrid'),
  c('ola', 'Ola', 'https://www.olacabs.com/careers', 'custom', ['mobility'], [...techRoles, 'operations_sales_hr_finance'], ['Bengaluru', 'Gurugram'], 'hybrid'),
  c('delhivery', 'Delhivery', 'https://www.delhivery.com/careers/', 'custom', ['logistics'], [...techRoles, 'operations_sales_hr_finance'], ['Gurugram', 'Bengaluru', 'Mumbai'], 'india-wide'),
  c('flipkart', 'Flipkart', 'https://www.flipkartcareers.com/#!/joblist', 'custom', ['marketplace', 'consumer'], [...techRoles, 'operations_sales_hr_finance'], ['Bengaluru', 'Gurugram'], 'hybrid'),
  c('myntra', 'Myntra', 'https://www.myntra.com/careers', 'custom', ['fashion', 'marketplace'], [...techRoles, 'operations_sales_hr_finance'], ['Bengaluru'], 'hybrid'),
  c('jio-platforms', 'Jio Platforms', 'https://careers.jio.com/', 'custom', ['telecom', 'platforms'], [...techRoles, 'operations_sales_hr_finance'], ['Mumbai', 'Bengaluru', 'Hyderabad'], 'india-wide'),
  c('byjus', "BYJU'S", 'https://byjus.com/careers/', 'custom', ['edtech'], educationRoles, ['Bengaluru', 'India'], 'india-wide'),
  c('unacademy', 'Unacademy', 'https://unacademy.com/careers', 'custom', ['edtech'], educationRoles, ['Bengaluru', 'Remote'], 'remote-friendly'),
  c('physicswallah', 'PhysicsWallah', 'https://www.pw.live/careers', 'custom', ['edtech'], educationRoles, ['Noida', 'Delhi NCR', 'Remote'], 'india-wide'),
  c('vedantu', 'Vedantu', 'https://www.vedantu.com/careers', 'custom', ['edtech'], educationRoles, ['Bengaluru', 'Remote'], 'remote-friendly'),
  c('upgrad', 'upGrad', 'https://www.upgrad.com/about/careers/', 'custom', ['edtech'], educationRoles, ['Mumbai', 'Bengaluru', 'Noida'], 'hybrid'),
  c('simplilearn', 'Simplilearn', 'https://www.simplilearn.com/career', 'custom', ['edtech'], educationRoles, ['Bengaluru', 'Remote'], 'hybrid'),
  c('great-learning', 'Great Learning', 'https://www.greatlearning.in/career', 'custom', ['edtech'], educationRoles, ['Gurugram', 'Bengaluru', 'Chennai'], 'hybrid'),
  c('teachmint', 'Teachmint', 'https://www.teachmint.com/careers', 'custom', ['edtech'], educationRoles, ['Bengaluru'], 'hybrid'),
  c('lead-group', 'LEAD Group', 'https://leadschool.in/careers/', 'custom', ['edtech', 'schools'], educationRoles, ['Mumbai', 'India'], 'india-wide'),
  c('cuemath', 'Cuemath', 'https://www.cuemath.com/careers/', 'custom', ['edtech'], educationRoles, ['Bengaluru', 'Remote'], 'remote-friendly'),
  c('narayana-schools', 'Narayana Schools', 'https://www.narayanaschools.in/careers/', 'custom', ['school-chain'], ['teaching_academic', 'operations_sales_hr_finance'], ['India'], 'india-wide'),
  c('podar-education', 'Podar Education', 'https://www.podareducation.org/careers', 'custom', ['school-chain'], ['teaching_academic', 'operations_sales_hr_finance'], ['India'], 'india-wide'),
  c('ashoka-university', 'Ashoka University', 'https://www.ashoka.edu.in/work-with-us/', 'custom', ['university'], ['teaching_academic', 'operations_sales_hr_finance'], ['Sonipat', 'Delhi NCR'], 'onsite-heavy'),
  c('manipal-university', 'Manipal Academy of Higher Education', 'https://careers.manipal.edu/', 'custom', ['university'], ['teaching_academic', 'healthcare', 'operations_sales_hr_finance'], ['Manipal', 'Bengaluru'], 'onsite-heavy'),
  c('allen', 'ALLEN Career Institute', 'https://www.allen.ac.in/career/', 'custom', ['coaching'], ['teaching_academic', 'operations_sales_hr_finance'], ['Kota', 'Bengaluru', 'India'], 'india-wide'),
  c('aakash', 'Aakash Educational Services', 'https://www.aakash.ac.in/careers', 'custom', ['coaching'], ['teaching_academic', 'operations_sales_hr_finance'], ['India'], 'india-wide'),
  c('apollo-hospitals', 'Apollo Hospitals', 'https://www.apollohospitals.com/careers/', 'custom', ['hospital'], healthcareRoles, ['Chennai', 'Hyderabad', 'Delhi NCR', 'Bengaluru'], 'onsite-heavy'),
  c('fortis', 'Fortis', 'https://www.fortishealthcare.com/careers', 'custom', ['hospital'], healthcareRoles, ['Delhi NCR', 'Mumbai', 'Bengaluru'], 'onsite-heavy'),
  c('max-healthcare', 'Max Healthcare', 'https://www.maxhealthcare.in/careers', 'custom', ['hospital'], healthcareRoles, ['Delhi NCR', 'Mumbai'], 'onsite-heavy'),
  c('manipal-hospitals', 'Manipal Hospitals', 'https://www.manipalhospitals.com/careers/', 'custom', ['hospital'], healthcareRoles, ['Bengaluru', 'Delhi NCR', 'Pune'], 'onsite-heavy'),
  c('narayana-health', 'Narayana Health', 'https://www.narayanahealth.org/careers', 'custom', ['hospital'], healthcareRoles, ['Bengaluru', 'Kolkata', 'Jaipur'], 'onsite-heavy'),
  c('aster', 'Aster', 'https://www.asterdmhealthcare.com/careers', 'custom', ['hospital'], healthcareRoles, ['Bengaluru', 'Kochi', 'Hyderabad'], 'onsite-heavy'),
  c('medanta', 'Medanta', 'https://www.medanta.org/careers', 'custom', ['hospital'], healthcareRoles, ['Gurugram', 'Lucknow', 'Indore'], 'onsite-heavy'),
  c('care-hospitals', 'CARE Hospitals', 'https://www.carehospitals.com/careers', 'custom', ['hospital'], healthcareRoles, ['Hyderabad', 'Bhubaneswar', 'Raipur'], 'onsite-heavy'),
  c('yashoda', 'Yashoda Hospitals', 'https://www.yashodahospitals.com/careers/', 'custom', ['hospital'], healthcareRoles, ['Hyderabad'], 'onsite-heavy'),
  c('rainbow', 'Rainbow Childrens Hospital', 'https://www.rainbowhospitals.in/careers', 'custom', ['hospital'], healthcareRoles, ['Hyderabad', 'Bengaluru', 'Delhi NCR'], 'onsite-heavy'),
  c('dr-lal-pathlabs', 'Dr Lal PathLabs', 'https://www.lalpathlabs.com/career.aspx', 'custom', ['diagnostics'], healthcareRoles, ['Delhi NCR', 'India'], 'india-wide'),
  c('metropolis', 'Metropolis Healthcare', 'https://www.metropolisindia.com/careers', 'custom', ['diagnostics'], healthcareRoles, ['Mumbai', 'India'], 'india-wide'),
  c('thyrocare', 'Thyrocare', 'https://www.thyrocare.com/careers', 'custom', ['diagnostics'], healthcareRoles, ['Mumbai', 'India'], 'india-wide'),
  c('practo', 'Practo', 'https://www.practo.com/company/careers', 'custom', ['healthtech'], healthcareRoles, ['Bengaluru', 'Remote'], 'hybrid'),
  c('1mg', '1mg', 'https://www.1mg.com/jobs', 'custom', ['healthtech', 'pharmacy'], healthcareRoles, ['Gurugram', 'Bengaluru'], 'hybrid'),
  c('pharmeasy', 'PharmEasy', 'https://pharmeasy.in/careers', 'custom', ['healthtech', 'pharmacy'], healthcareRoles, ['Mumbai', 'Bengaluru'], 'hybrid'),
  c('medibuddy', 'MediBuddy', 'https://www.medibuddy.in/careers/', 'custom', ['healthtech'], healthcareRoles, ['Bengaluru'], 'hybrid'),
  c('portea', 'Portea', 'https://www.portea.com/careers/', 'custom', ['healthtech', 'home-healthcare'], healthcareRoles, ['Bengaluru', 'India'], 'india-wide'),
  c('mfine', 'mfine', 'https://www.mfine.co/careers/', 'custom', ['healthtech'], healthcareRoles, ['Bengaluru'], 'hybrid'),
  c('hdfc-bank', 'HDFC Bank', 'https://www.hdfcbank.com/personal/careers', 'custom', ['banking'], opsFinanceRoles, ['Mumbai', 'India'], 'india-wide'),
  c('icici-bank', 'ICICI Bank', 'https://www.icicicareers.com/', 'custom', ['banking'], opsFinanceRoles, ['Mumbai', 'India'], 'india-wide'),
  c('axis-bank', 'Axis Bank', 'https://www.axisbank.com/careers', 'custom', ['banking'], opsFinanceRoles, ['Mumbai', 'India'], 'india-wide'),
  c('kotak', 'Kotak', 'https://www.kotak.com/en/about-us/careers.html', 'custom', ['banking'], opsFinanceRoles, ['Mumbai', 'India'], 'india-wide'),
  c('sbi', 'SBI', 'https://sbi.co.in/web/careers', 'custom', ['banking', 'public-sector'], opsFinanceRoles, ['India'], 'india-wide'),
  c('bajaj-finserv', 'Bajaj Finserv', 'https://www.bajajfinserv.in/careers', 'custom', ['bfsi', 'fintech'], opsFinanceRoles, ['Pune', 'India'], 'india-wide'),
  c('policybazaar', 'Policybazaar', 'https://www.policybazaar.com/careers/', 'custom', ['insurance', 'fintech'], opsFinanceRoles, ['Gurugram', 'India'], 'india-wide'),
  c('deloitte-india', 'Deloitte India', 'https://www2.deloitte.com/in/en/careers/job-search.html', 'custom', ['consulting', 'finance'], [...opsFinanceRoles, 'software_engineering'], ['Mumbai', 'Bengaluru', 'Gurugram', 'Hyderabad'], 'hybrid'),
  c('ey-india', 'EY India', 'https://www.ey.com/en_in/careers/job-search', 'custom', ['consulting', 'finance'], [...opsFinanceRoles, 'software_engineering'], ['Bengaluru', 'Mumbai', 'Gurugram', 'Hyderabad'], 'hybrid'),
  c('kpmg-india', 'KPMG India', 'https://kpmg.com/in/en/home/careers.html', 'custom', ['consulting', 'finance'], [...opsFinanceRoles, 'software_engineering'], ['Bengaluru', 'Mumbai', 'Gurugram'], 'hybrid'),
  c('pwc-india', 'PwC India', 'https://www.pwc.in/careers.html', 'custom', ['consulting', 'finance'], [...opsFinanceRoles, 'software_engineering'], ['Bengaluru', 'Mumbai', 'Gurugram', 'Hyderabad'], 'hybrid'),
  c('mahindra-logistics', 'Mahindra Logistics', 'https://www.mahindralogistics.com/careers/', 'custom', ['logistics'], opsFinanceRoles, ['Mumbai', 'India'], 'india-wide'),
  c('blue-dart', 'Blue Dart', 'https://www.bluedart.com/careers', 'custom', ['logistics'], opsFinanceRoles, ['Mumbai', 'India'], 'india-wide'),
  c('dhl-india', 'DHL India', 'https://careers.dhl.com/global/en/search-results?keywords=&location=India', 'custom', ['logistics'], opsFinanceRoles, ['Mumbai', 'Bengaluru', 'Delhi NCR'], 'india-wide'),
  c('reliance-retail', 'Reliance Retail', 'https://relianceretail.com/careers.html', 'custom', ['retail'], opsFinanceRoles, ['Mumbai', 'India'], 'india-wide'),
  c('aditya-birla', 'Aditya Birla Group', 'https://careers.adityabirla.com/', 'custom', ['conglomerate', 'retail', 'finance'], opsFinanceRoles, ['Mumbai', 'India'], 'india-wide'),
  c('zepto', 'Zepto', 'https://www.zeptonow.com/careers', 'custom', ['quick-commerce', 'operations'], [...techRoles, 'operations_sales_hr_finance'], ['Bengaluru', 'Mumbai'], 'india-wide'),
  c('bigbasket', 'BigBasket', 'https://www.bigbasket.com/careers/', 'custom', ['grocery', 'operations'], [...techRoles, 'operations_sales_hr_finance'], ['Bengaluru', 'India'], 'india-wide'),
  c('cognizant-india', 'Cognizant India', 'https://careers.cognizant.com/india-en/jobs/', 'unknown_or_custom', ['it-services', 'consulting'], consultingRoles, ['Chennai', 'Bengaluru', 'Hyderabad', 'Pune'], 'india-wide'),
  c('qualcomm-india', 'Qualcomm India', 'https://careers.qualcomm.com/careers/jobsearch?location=India', 'unknown_or_custom', ['semiconductor', 'telecom', 'product-engineering'], roleSet(techRoles, manufacturingRoles), ['Hyderabad', 'Bengaluru', 'Chennai', 'Noida'], 'hybrid'),
  c('amd-india', 'AMD India', 'https://careers.amd.com/careers-home/jobs?location=India', 'unknown_or_custom', ['semiconductor', 'ai', 'product-engineering'], roleSet(techRoles, manufacturingRoles), ['Bengaluru', 'Hyderabad'], 'hybrid'),
  c('icims-india', 'iCIMS India', 'https://careers.icims.com/careers-home/jobs/locations', 'icims', ['hrtech', 'saas'], techRoles, ['Hyderabad', 'Remote'], 'hybrid'),
  c('de-shaw-india', 'D. E. Shaw India', 'https://careers-deshaw.icims.com/jobs/search?ss=1&searchLocation=12955-12962-Hyderabad', 'icims', ['finance', 'technology', 'research'], roleSet(techRoles, opsFinanceRoles), ['Hyderabad', 'Gurugram', 'Bengaluru'], 'hybrid'),
  c('basf-india', 'BASF India', 'https://www.basf.com/in/en/careers/jobs.html', 'successfactors', ['chemicals', 'manufacturing'], roleSet(manufacturingRoles, pharmaRoles), ['Mumbai', 'Navi Mumbai', 'Mangaluru', 'Dahej'], 'india-wide'),
  c('giesecke-devrient-india', 'Giesecke+Devrient India', 'https://careers.gi-de.com/GieseckeDevrientCT/search/?createNewAlert=false&q=&locationsearch=India', 'successfactors', ['security-tech', 'payments', 'manufacturing'], roleSet(techRoles, manufacturingRoles, opsFinanceRoles), ['Gurugram', 'Noida', 'Pune'], 'hybrid'),
  c('tata-steel', 'Tata Steel', 'https://www.tatasteel.com/careers/', 'unknown_or_custom', ['steel', 'manufacturing'], manufacturingRoles, ['Jamshedpur', 'Kalinganagar', 'Kolkata'], 'india-wide'),
  c('tata-motors', 'Tata Motors', 'https://www.tatamotors.com/careers/', 'unknown_or_custom', ['automotive', 'manufacturing'], manufacturingRoles, ['Pune', 'Jamshedpur', 'Sanand', 'Lucknow'], 'india-wide'),
  c('mahindra-group', 'Mahindra Group', 'https://www.mahindra.com/careers', 'unknown_or_custom', ['automotive', 'farm-equipment', 'conglomerate'], roleSet(manufacturingRoles, opsFinanceRoles), ['Mumbai', 'Pune', 'Chennai', 'India'], 'india-wide'),
  c('maruti-suzuki', 'Maruti Suzuki', 'https://www.marutisuzuki.com/corporate/careers', 'unknown_or_custom', ['automotive', 'manufacturing'], manufacturingRoles, ['Gurugram', 'Manesar', 'Rohtak'], 'india-wide'),
  c('hero-motocorp', 'Hero MotoCorp', 'https://www.heromotocorp.com/en-in/careers.html', 'unknown_or_custom', ['automotive', 'manufacturing'], manufacturingRoles, ['Delhi NCR', 'Gurugram', 'Jaipur', 'Haridwar'], 'india-wide'),
  c('tvs-motor', 'TVS Motor', 'https://www.tvsmotor.com/careers', 'unknown_or_custom', ['automotive', 'manufacturing'], manufacturingRoles, ['Hosur', 'Chennai', 'Bengaluru'], 'india-wide'),
  c('bosch-india', 'Bosch India', 'https://www.bosch.in/careers/', 'unknown_or_custom', ['automotive-tech', 'manufacturing', 'engineering'], roleSet(techRoles, manufacturingRoles), ['Bengaluru', 'Coimbatore', 'Pune'], 'hybrid'),
  c('siemens-india', 'Siemens India', 'https://www.siemens.com/in/en/company/jobs.html', 'unknown_or_custom', ['industrial', 'energy', 'automation'], roleSet(techRoles, manufacturingRoles, opsFinanceRoles), ['Bengaluru', 'Mumbai', 'Pune', 'Gurugram'], 'hybrid'),
  c('schneider-electric-india', 'Schneider Electric India', 'https://www.se.com/in/en/about-us/careers/overview.jsp', 'unknown_or_custom', ['energy', 'industrial', 'automation'], roleSet(techRoles, manufacturingRoles, opsFinanceRoles), ['Bengaluru', 'Gurugram', 'Chennai', 'Hyderabad'], 'hybrid'),
  c('larsen-toubro', 'Larsen & Toubro', 'https://www.larsentoubro.com/corporate/careers/', 'unknown_or_custom', ['engineering', 'construction', 'infrastructure'], roleSet(manufacturingRoles, opsFinanceRoles), ['Mumbai', 'Chennai', 'Vadodara', 'India'], 'india-wide'),
  c('tata-projects', 'Tata Projects', 'https://www.tataprojects.com/careers/', 'unknown_or_custom', ['construction', 'infrastructure', 'engineering'], roleSet(manufacturingRoles, opsFinanceRoles), ['Hyderabad', 'Mumbai', 'India'], 'india-wide'),
  c('asian-paints', 'Asian Paints', 'https://www.asianpaints.com/careers.html', 'unknown_or_custom', ['fmcg', 'manufacturing', 'retail'], roleSet(manufacturingRoles, retailTravelRoles, opsFinanceRoles), ['Mumbai', 'India'], 'india-wide'),
  c('pidilite', 'Pidilite', 'https://www.pidilite.com/careers/', 'unknown_or_custom', ['chemicals', 'fmcg', 'manufacturing'], roleSet(manufacturingRoles, retailTravelRoles, opsFinanceRoles), ['Mumbai', 'India'], 'india-wide'),
  c('havells', 'Havells', 'https://www.havells.com/en/corporate/careers.html', 'unknown_or_custom', ['consumer-durables', 'manufacturing', 'sales'], roleSet(manufacturingRoles, retailTravelRoles, opsFinanceRoles), ['Noida', 'India'], 'india-wide'),
  c('godrej', 'Godrej Industries Group', 'https://www.godrej.com/careers', 'unknown_or_custom', ['conglomerate', 'fmcg', 'real-estate'], roleSet(manufacturingRoles, retailTravelRoles, opsFinanceRoles), ['Mumbai', 'India'], 'india-wide'),
  c('sun-pharma', 'Sun Pharma', 'https://sunpharma.com/careers/', 'unknown_or_custom', ['pharma', 'life-sciences'], pharmaRoles, ['Mumbai', 'Vadodara', 'Gurugram', 'India'], 'india-wide'),
  c('cipla', 'Cipla', 'https://www.cipla.com/careers', 'unknown_or_custom', ['pharma', 'life-sciences'], pharmaRoles, ['Mumbai', 'Goa', 'Bengaluru', 'India'], 'india-wide'),
  c('dr-reddys', "Dr. Reddy's", 'https://careers.drreddys.com/', 'unknown_or_custom', ['pharma', 'life-sciences'], pharmaRoles, ['Hyderabad', 'Bachupally', 'Visakhapatnam'], 'india-wide'),
  c('lupin', 'Lupin', 'https://www.lupin.com/careers/', 'unknown_or_custom', ['pharma', 'life-sciences'], pharmaRoles, ['Mumbai', 'Pune', 'Goa', 'India'], 'india-wide'),
  c('biocon', 'Biocon', 'https://www.biocon.com/careers/', 'unknown_or_custom', ['biotech', 'life-sciences'], pharmaRoles, ['Bengaluru', 'Hyderabad'], 'india-wide'),
  c('zydus-life', 'Zydus Lifesciences', 'https://www.zyduslife.com/careers/', 'unknown_or_custom', ['pharma', 'life-sciences'], pharmaRoles, ['Ahmedabad', 'Vadodara', 'India'], 'india-wide'),
  c('serum-institute', 'Serum Institute of India', 'https://www.seruminstitute.com/careers.php', 'unknown_or_custom', ['biotech', 'vaccines', 'life-sciences'], pharmaRoles, ['Pune'], 'onsite-heavy'),
  c('hindustan-unilever', 'Hindustan Unilever', 'https://www.hul.co.in/careers/', 'unknown_or_custom', ['fmcg', 'consumer'], roleSet(retailTravelRoles, manufacturingRoles, opsFinanceRoles), ['Mumbai', 'Bengaluru', 'India'], 'india-wide'),
  c('itc', 'ITC', 'https://www.itcportal.com/careers/', 'unknown_or_custom', ['fmcg', 'hotels', 'agri-business'], roleSet(retailTravelRoles, manufacturingRoles, opsFinanceRoles), ['Kolkata', 'Bengaluru', 'Gurugram', 'India'], 'india-wide'),
  c('nestle-india', 'Nestle India', 'https://www.nestle.in/jobs', 'unknown_or_custom', ['fmcg', 'food'], roleSet(retailTravelRoles, manufacturingRoles, opsFinanceRoles), ['Gurugram', 'Moga', 'India'], 'india-wide'),
  c('marico', 'Marico', 'https://marico.com/india/careers', 'unknown_or_custom', ['fmcg', 'consumer'], roleSet(retailTravelRoles, manufacturingRoles, opsFinanceRoles), ['Mumbai', 'India'], 'india-wide'),
  c('britannia', 'Britannia', 'https://britannia.co.in/careers/', 'unknown_or_custom', ['fmcg', 'food'], roleSet(retailTravelRoles, manufacturingRoles, opsFinanceRoles), ['Bengaluru', 'India'], 'india-wide'),
  c('titan', 'Titan Company', 'https://www.titancompany.in/careers', 'unknown_or_custom', ['retail', 'consumer', 'manufacturing'], roleSet(retailTravelRoles, manufacturingRoles, opsFinanceRoles), ['Bengaluru', 'Hosur', 'Mumbai'], 'india-wide'),
  c('trent', 'Trent', 'https://www.trentlimited.com/pages/careers', 'unknown_or_custom', ['retail', 'fashion'], retailTravelRoles, ['Mumbai', 'Bengaluru', 'India'], 'india-wide'),
  c('dmart', 'DMart', 'https://www.dmartindia.com/careers', 'unknown_or_custom', ['retail', 'grocery'], fieldOpsRoles, ['Mumbai', 'India'], 'india-wide'),
  c('indian-hotels', 'Indian Hotels Company', 'https://www.ihcltata.com/careers/', 'unknown_or_custom', ['hospitality', 'travel'], retailTravelRoles, ['Mumbai', 'Goa', 'Delhi NCR', 'India'], 'india-wide'),
  c('makemytrip', 'MakeMyTrip', 'https://careers.makemytrip.com/', 'unknown_or_custom', ['travel', 'consumer-tech'], roleSet(techRoles, retailTravelRoles, opsFinanceRoles), ['Gurugram', 'Bengaluru'], 'hybrid'),
  c('oyo', 'OYO', 'https://www.oyorooms.com/careers/', 'unknown_or_custom', ['hospitality', 'consumer-tech'], roleSet(techRoles, retailTravelRoles, opsFinanceRoles), ['Gurugram', 'Bengaluru', 'India'], 'india-wide'),
  c('indigo', 'IndiGo', 'https://www.goindigo.in/careers.html', 'unknown_or_custom', ['airline', 'travel', 'operations'], roleSet(retailTravelRoles, fieldOpsRoles, opsFinanceRoles), ['Gurugram', 'Delhi NCR', 'India'], 'india-wide'),
  c('air-india', 'Air India', 'https://www.airindia.com/in/en/careers.html', 'unknown_or_custom', ['airline', 'travel', 'operations'], roleSet(retailTravelRoles, fieldOpsRoles, opsFinanceRoles), ['Gurugram', 'Mumbai', 'Bengaluru', 'India'], 'india-wide'),
  c('porter', 'Porter', 'https://porter.in/careers', 'unknown_or_custom', ['logistics', 'mobility'], roleSet(techRoles, fieldOpsRoles, opsFinanceRoles), ['Bengaluru', 'Mumbai', 'Delhi NCR'], 'india-wide'),
  c('ecom-express', 'Ecom Express', 'https://ecomexpress.in/careers/', 'unknown_or_custom', ['logistics', 'delivery'], fieldOpsRoles, ['Gurugram', 'India'], 'india-wide'),
  c('shadowfax', 'Shadowfax', 'https://www.shadowfax.in/careers/', 'unknown_or_custom', ['logistics', 'delivery'], roleSet(fieldOpsRoles, techRoles), ['Bengaluru', 'India'], 'india-wide'),
  c('times-group', 'The Times Group', 'https://timesgroup.com/careers/', 'unknown_or_custom', ['media', 'publishing'], mediaRoles, ['Mumbai', 'Delhi NCR', 'Bengaluru'], 'hybrid'),
  c('network18', 'Network18', 'https://www.nw18.com/careers/', 'unknown_or_custom', ['media', 'broadcasting'], mediaRoles, ['Mumbai', 'Noida', 'Delhi NCR'], 'hybrid'),
  c('zee', 'Zee Entertainment', 'https://www.zee.com/careers/', 'unknown_or_custom', ['media', 'entertainment'], mediaRoles, ['Mumbai', 'Bengaluru', 'India'], 'hybrid'),
  c('sony-pictures-networks', 'Sony Pictures Networks India', 'https://www.sonypicturesnetworks.com/careers', 'unknown_or_custom', ['media', 'entertainment'], mediaRoles, ['Mumbai', 'Bengaluru'], 'hybrid'),
  c('khaitan-co', 'Khaitan & Co', 'https://www.khaitanco.com/careers', 'unknown_or_custom', ['legal', 'professional-services'], legalRoles, ['Mumbai', 'Delhi NCR', 'Bengaluru', 'Kolkata'], 'hybrid'),
  c('ongc', 'ONGC', 'https://ongcindia.com/web/eng/career/recruitment-notice', 'unknown_or_custom', ['public-sector', 'energy'], publicSectorRoles, ['India'], 'india-wide'),
  c('indian-oil', 'Indian Oil', 'https://iocl.com/latest-job-opening', 'unknown_or_custom', ['public-sector', 'energy'], publicSectorRoles, ['India'], 'india-wide'),
  c('ntpc', 'NTPC', 'https://careers.ntpc.co.in/', 'unknown_or_custom', ['public-sector', 'energy'], publicSectorRoles, ['India'], 'india-wide'),
  c('bel-india', 'Bharat Electronics', 'https://bel-india.in/careers/', 'unknown_or_custom', ['public-sector', 'defence-electronics'], publicSectorRoles, ['Bengaluru', 'Ghaziabad', 'Pune', 'India'], 'india-wide'),
  c('isro', 'ISRO', 'https://www.isro.gov.in/Careers.html', 'unknown_or_custom', ['government', 'space', 'research'], publicSectorRoles, ['Bengaluru', 'Ahmedabad', 'Sriharikota', 'India'], 'india-wide'),
  c('rippling', 'Rippling', 'https://www.rippling.com/careers/open-roles?locations=India', 'rippling', ['saas', 'hrtech'], techRoles, ['Bengaluru', 'Remote'], 'remote-friendly', 'Included as an ATS/platform coverage marker for Rippling-backed boards.'),
];

export function companySourcesForRoleFamilies(roleFamilies: RoleFamilyId[], limit = 40, options: CompanySourceOptions = {}) {
  const wanted = new Set(roleFamilies);
  const targetCompanies = options.targetCompanies || [];
  const companyTypes = options.companyTypes || [];
  const locations = options.locations || [];
  const scored = allCompanyCareerSources().map((source, index) => {
    const roleScore = source.roleFamilies.filter((family) => wanted.has(family)).length * 10;
    const targetScore = hasNeedle(source, targetCompanies) ? 100 : 0;
    const typeScore = hasNeedle(source, companyTypes) ? 8 : 0;
    const locationScore = hasNeedle(source, locations) ? 4 : 0;
    const priorityScore = source.notes?.includes('priority=1') ? 2 : 0;
    return {
      source,
      index,
      score: roleScore + targetScore + typeScore + locationScore + priorityScore,
    };
  });

  return scored
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .slice(0, limit)
    .map((entry) => entry.source);
}

export function summarizeCompanyCareersMap() {
  const sources = allCompanyCareerSources();
  const atsTypes = sources.reduce<Record<string, number>>((acc, source) => {
    acc[source.atsType] = (acc[source.atsType] || 0) + 1;
    return acc;
  }, {});

  const sectors = new Set(sources.flatMap((source) => source.sectors));
  const roleFamilies = new Set(sources.flatMap((source) => source.roleFamilies));

  return {
    companyCount: sources.length,
    atsTypes,
    sectorCount: sectors.size,
    roleFamilyCount: roleFamilies.size,
  };
}
