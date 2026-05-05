export interface QaCandidate {
  slug: string;
  fullName: string;
  targetTitle: string;
  resumeText: string;
  locations: string[];
  workModel: string;
  expectedSalary: string;
  experienceBand: string;
  companyTypes: string[];
  targetCompanies?: string[];
  manualLinkedinUrl?: string;
  mustHaveKeywords: string[];
  avoidKeywords: string[];
  noticePeriod: string;
  selectedPortals: string[];
  clarificationAnswers: Record<string, string>;
  coachQuestions: string[];
}

const candidates: Record<string, QaCandidate> = {
  'sde-4yr': {
    slug: 'sde-4yr',
    fullName: 'Aarav Mehta',
    targetTitle: 'Software Development Engineer',
    resumeText: `AARAV MEHTA
Software Development Engineer
Four years building TypeScript, React, Node.js, PostgreSQL, and AWS systems for India SaaS teams.
Delivered payment reconciliation services, job queues, observability dashboards, and API integrations.
Improved page load performance, added automated tests, and partnered with product managers on releases.`,
    locations: ['Bengaluru', 'Hyderabad', 'Remote India'],
    workModel: 'Hybrid or remote',
    expectedSalary: 'INR 24-32 LPA',
    experienceBand: '3-5 years',
    companyTypes: ['SaaS', 'fintech', 'developer tools'],
    mustHaveKeywords: ['TypeScript', 'React', 'Node.js', 'PostgreSQL', 'AWS', 'Redis', 'Jest'],
    avoidKeywords: ['cold calling', 'manual testing only'],
    noticePeriod: '30 days',
    selectedPortals: ['linkedin', 'naukri', 'wellfound'],
    clarificationAnswers: {
      impact: 'Most recent impact was reducing reconciliation review time by automating exception grouping.',
      preference: 'Prefers product engineering teams with ownership of APIs and frontend performance.',
    },
    coachQuestions: ['Which roles best match my backend and frontend mix?', 'What should I improve before interviews?'],
  },
  'pm-4yr': {
    slug: 'pm-4yr',
    fullName: 'Ira Banerjee',
    targetTitle: 'Product Manager',
    resumeText: `IRA BANERJEE
Product Manager
Four years across B2B SaaS, analytics, roadmap planning, stakeholder discovery, SQL dashboards, and launch execution.
Led onboarding funnel experiments, customer interviews, PRDs, release notes, and adoption reporting.
Worked with design and engineering to ship measurable workflow improvements.`,
    locations: ['Mumbai', 'Bengaluru', 'Remote India'],
    workModel: 'Hybrid',
    expectedSalary: 'INR 22-30 LPA',
    experienceBand: '3-5 years',
    companyTypes: ['B2B SaaS', 'analytics', 'marketplaces'],
    mustHaveKeywords: ['Product strategy', 'SQL', 'Analytics', 'Figma', 'Roadmap', 'PRD', 'Experimentation'],
    avoidKeywords: ['pure sales', 'field marketing'],
    noticePeriod: '45 days',
    selectedPortals: ['linkedin', 'wellfound', 'naukri'],
    clarificationAnswers: {
      domain: 'Strongest domain is B2B SaaS workflow automation.',
      metrics: 'Primary metrics owned were activation, retention, and feature adoption.',
    },
    coachQuestions: ['How should I position my analytics-heavy PM experience?', 'Which gaps should I address for senior PM roles?'],
  },
  'ux-4yr': {
    slug: 'ux-4yr',
    fullName: 'Nisha Rao',
    targetTitle: 'UX Designer',
    resumeText: `NISHA RAO
UX Designer
Four years designing SaaS dashboards, research studies, prototypes, accessibility fixes, and design systems.
Ran usability tests, mapped journey pain points, improved information architecture, and partnered with engineers in Figma.
Delivered cleaner enterprise workflows with measurable task-completion improvements.`,
    locations: ['Pune', 'Bengaluru', 'Remote India'],
    workModel: 'Remote or hybrid',
    expectedSalary: 'INR 18-26 LPA',
    experienceBand: '3-5 years',
    companyTypes: ['SaaS', 'fintech', 'healthtech'],
    mustHaveKeywords: ['Figma', 'UX research', 'Design systems', 'Accessibility', 'Prototyping', 'Information architecture'],
    avoidKeywords: ['graphic design only', 'print design'],
    noticePeriod: '30 days',
    selectedPortals: ['linkedin', 'wellfound', 'instahyre'],
    clarificationAnswers: {
      portfolio: 'Portfolio emphasizes enterprise dashboard redesigns and moderated usability studies.',
      collaboration: 'Comfortable pairing with frontend engineers on responsive implementation.',
    },
    coachQuestions: ['How can I make my case studies stronger?', 'Which UX roles fit my SaaS systems experience?'],
  },
  'hr-4yr': {
    slug: 'hr-4yr',
    fullName: 'Kabir Sethi',
    targetTitle: 'HR Business Partner',
    resumeText: `KABIR SETHI
HR Business Partner
Four years supporting talent operations, employee engagement, performance cycles, HR analytics, and manager coaching.
Built dashboards, improved onboarding checklists, coordinated policy rollouts, and partnered with business leaders.
Experienced with HRMS tools, Excel reporting, stakeholder communication, and retention programs.`,
    locations: ['Delhi NCR', 'Gurugram', 'Remote India'],
    workModel: 'Onsite or hybrid',
    expectedSalary: 'INR 14-20 LPA',
    experienceBand: '3-5 years',
    companyTypes: ['startups', 'IT services', 'SaaS'],
    mustHaveKeywords: ['HRBP', 'Employee engagement', 'Performance management', 'HR analytics', 'Excel', 'Stakeholder management'],
    avoidKeywords: ['payroll only', 'admin only'],
    noticePeriod: '60 days',
    selectedPortals: ['linkedin', 'naukri', 'foundit'],
    clarificationAnswers: {
      scope: 'Most experience is with 200-500 employee technology teams.',
      analytics: 'Uses Excel and HRMS exports for attrition, hiring, and engagement reporting.',
    },
    coachQuestions: ['How should I show HR analytics impact?', 'Which HRBP roles should I prioritize?'],
  },
};

const requestedCandidates: Record<string, QaCandidate> = {
  'ai-pm-senior': {
    slug: 'ai-pm-senior',
    fullName: 'Adarsha Chatterjee',
    targetTitle: 'AI Product Manager',
    resumeText: `ADARSHA RAO
Senior AI Product Manager in Bengaluru with 8 years across B2B SaaS, fintech workflow automation, LLM-assisted case review, RAG, SQL analytics, roadmap ownership, PRDs, experimentation, and responsible AI controls.
Senior AI Product Manager, Niramai Systems, Bengaluru, Mar 2022-Present. Led LLM case-summary assistant with retrieval, human approval, citations, refusal handling, audit trails, and 31% review-prep reduction. Wrote PRDs for prompt evaluation, confidence labels, model fallback states, reviewer overrides, and source-grounding UX. Built SQL and Amplitude dashboards for activation, acceptance, hallucination flags, and adoption.
Product Manager, LedgerFlow SaaS, Jun 2018-Feb 2022. Owned workflow builder and onboarding analytics; improved activation from 44% to 63%.
Skills: AI product management, LLM, RAG, SQL, roadmap, PRD, experimentation, analytics, Figma, Jira, Confluence. Education: MBA IIM Indore; B.Tech Computer Science PES.`,
    locations: ['Bengaluru', 'Remote India'],
    workModel: 'hybrid',
    expectedSalary: 'INR 30 LPA+ fixed',
    experienceBand: '8 years',
    companyTypes: ['AI-native SaaS', 'B2B SaaS', 'Fintech'],
    targetCompanies: ['Google India', 'Microsoft India', 'Adobe India', 'Atlassian', 'Salesforce India', 'Razorpay', 'CRED', 'Flipkart', 'Swiggy', 'Meesho', 'Freshworks', 'Zoho'],
    manualLinkedinUrl: 'https://in.linkedin.com/jobs/view/ai-product-manager-at-altellect-4325847805',
    mustHaveKeywords: ['AI Product Management', 'LLM', 'RAG', 'SQL', 'Roadmap', 'PRD', 'Experimentation', 'Analytics'],
    avoidKeywords: ['entry level', 'intern', 'campus', 'support only'],
    noticePeriod: '45 days',
    selectedPortals: ['company_ats', 'official', 'linkedin', 'naukri', 'foundit', 'indeed', 'shine', 'glassdoor', 'placementindia', 'hirist', 'iimjobs', 'cutshort', 'timesjobs', 'instahyre', 'wellfound'],
    clarificationAnswers: {
      current_status_notice_period: 'Senior AI Product Manager at Niramai Systems; 45-day notice period.',
      salary_location_preference: 'Bengaluru hybrid preferred; target INR 30 LPA+ fixed.',
      role_depth: 'Senior AI PM roles with responsible AI, roadmap, discovery, and measurable outcomes.',
    },
    coachQuestions: [
      'Which evidence from my background best matches this role?',
      'What ATS gaps or missing keywords stand out for this job?',
      'Which resume bullets should I strengthen first for this application?',
    ],
  },
  'backend-mid': {
    slug: 'backend-mid',
    fullName: 'Rohan Kulkarni',
    targetTitle: 'Backend Engineer',
    resumeText: `ROHAN KULKARNI
Backend Engineer in Pune with 4 years of Java and Spring Boot experience building REST APIs, microservices, PostgreSQL data models, Kafka consumers, Redis caching, and AWS deployments.
Backend Engineer, PayGrid Labs, Pune, Aug 2022-Present. Built payment reconciliation and settlement services. Developed APIs for repayment schedules, ledger matching, exception queues, and webhook retries. Reduced reconciliation runtime from 42 minutes to 13 minutes with SQL optimization, batching, and Redis caching. Built Kafka consumers with idempotency keys and dead-letter handling. Added JUnit, Mockito, and Testcontainers coverage.
Software Engineer, RetailCloud India, Pune, Jul 2020-Jul 2022. Built inventory/order APIs and improved p95 lookup latency from 900 ms to 360 ms.
Skills: Java, Spring Boot, REST APIs, microservices, Kafka, Redis, PostgreSQL, AWS ECS, CloudWatch, GitHub Actions, Docker basics.`,
    locations: ['Pune'],
    workModel: 'onsite',
    expectedSalary: 'INR 15 LPA+ fixed',
    experienceBand: '4 years',
    companyTypes: ['SaaS', 'Fintech', 'Product engineering'],
    targetCompanies: ['Mastercard', 'Barclays', 'BNY Mellon', 'UBS', 'Amdocs', 'PubMatic', 'Druva', 'Persistent Systems', 'Mindtickle', 'Bajaj Finserv', 'Deutsche Bank', 'Razorpay'],
    manualLinkedinUrl: 'https://in.linkedin.com/jobs/view/java-backend-engineer-mid-engineer-at-nielseniq-4344033425',
    mustHaveKeywords: ['Java', 'Spring Boot', 'Microservices', 'REST APIs', 'PostgreSQL', 'Kafka', 'Redis', 'AWS'],
    avoidKeywords: ['intern', 'freshers', 'manual testing', 'support engineer'],
    noticePeriod: '30 days',
    selectedPortals: ['company_ats', 'official', 'linkedin', 'naukri', 'foundit', 'indeed', 'shine', 'glassdoor', 'placementindia', 'hirist', 'iimjobs', 'cutshort', 'timesjobs', 'instahyre', 'wellfound'],
    clarificationAnswers: {
      current_status_notice_period: 'Backend Engineer at PayGrid Labs; 30-day notice period.',
      salary_location_preference: 'Pune on-site only; target INR 15 LPA+ fixed.',
      role_depth: 'Backend Java/Spring roles with APIs, microservices, performance, and production ownership.',
    },
    coachQuestions: [
      'Which evidence from my backend experience best matches this role?',
      'What ATS gaps or missing keywords stand out for this job?',
      'Which resume bullets should I strengthen first for this application?',
    ],
  },
  'ux-junior': {
    slug: 'ux-junior',
    fullName: 'Meera Shah',
    targetTitle: 'UX Designer',
    resumeText: `MEERA SHAH
Junior UX Designer with 1.5 years supporting SaaS onboarding, mobile checkout, Figma prototyping, usability tests, journey maps, wireframes, accessibility checks, and design system documentation.
Junior UX Designer, FlowCart, Remote, Oct 2024-Present. Supported seller onboarding, catalog upload, checkout recovery, and dashboard empty states. Created low-fidelity wireframes, clickable Figma prototypes, usability test scripts, and synthesis notes. Helped run 12 moderated usability tests with small merchants. Documented Figma components for buttons, inputs, status tags, upload cards, and error states.
UX Design Intern, PocketPay, Remote, Jan 2024-Sep 2024. Designed wallet top-up and KYC support screens, journey maps, competitive teardown notes, and prototype iterations.
Skills: UX research, usability testing, Figma, FigJam, wireframes, prototyping, design systems basics, accessibility basics, responsive layouts.`,
    locations: ['Remote India', 'Bengaluru', 'Mumbai', 'Pune'],
    workModel: 'remote',
    expectedSalary: 'Open to market salary for junior UX roles',
    experienceBand: '1.5 years',
    companyTypes: ['SaaS', 'Consumer apps', 'Fintech'],
    targetCompanies: ['Adobe India', 'Microsoft India', 'Google India', 'Razorpay', 'CRED', 'PhonePe', 'Flipkart', 'Swiggy', 'Meesho', 'Zomato', 'Zepto', 'Urban Company', 'IBM India', 'Accenture'],
    manualLinkedinUrl: 'https://in.linkedin.com/jobs/view/ux-designer-remote-at-joveo-ai-4403810977',
    mustHaveKeywords: ['UX Research', 'Figma', 'Wireframes', 'Prototyping', 'Usability Testing', 'Design Systems'],
    avoidKeywords: ['senior only', 'principal', 'graphic designer only', 'intern unpaid'],
    noticePeriod: '15 days',
    selectedPortals: ['company_ats', 'official', 'linkedin', 'naukri', 'foundit', 'indeed', 'shine', 'glassdoor', 'placementindia', 'hirist', 'iimjobs', 'cutshort', 'timesjobs', 'instahyre', 'wellfound'],
    clarificationAnswers: {
      current_status_notice_period: 'Junior UX Designer at FlowCart; 15-day notice period.',
      salary_location_preference: 'Remote roles preferred; salary flexible for strong learning environment.',
      role_depth: 'Junior UX roles with research, Figma prototyping, usability testing, and design system exposure.',
    },
    coachQuestions: [
      'Which evidence from my UX background best matches this role?',
      'What ATS gaps or missing keywords stand out for this job?',
      'Which resume bullets or case-study evidence should I strengthen first for this application?',
    ],
  },
  'finance-compliance': {
    slug: 'finance-compliance',
    fullName: 'Naina Menon',
    targetTitle: 'Finance Compliance Analyst',
    resumeText: `NAINA MENON
Finance Compliance Analyst in Mumbai with 7 years of AML, KYC, sanctions screening, transaction monitoring, case investigation, suspicious transaction reporting support, RBI compliance awareness, and compliance operations experience.
Senior Compliance Analyst, FinTrust Payments, Mumbai, May 2021-Present. Reviewed AML alerts for merchant acquiring, wallet transactions, high-risk geographies, velocity spikes, and suspicious refund patterns. Investigated KYC documentation, beneficial ownership, sanctions hits, adverse media, and transaction narratives. Drafted case notes and escalation summaries for potential STR review. Reduced repeat false positives by 18% by documenting typologies and partnering with rules analysts. Built Excel dashboards for alert aging, reviewer throughput, high-risk segments, and closure reasons.
Compliance Associate, Aster NBFC, Jul 2018-Apr 2021. Performed CDD, EDD, PAN/GST checks, address verification, and transaction monitoring queues.
Skills: AML, KYC, CDD, EDD, transaction monitoring, sanctions screening, adverse media, case investigation, STR support, RBI awareness, Excel, Power Query basics, SQL exposure.`,
    locations: ['Mumbai', 'Navi Mumbai', 'Thane'],
    workModel: 'hybrid',
    expectedSalary: 'INR 20 LPA+ fixed',
    experienceBand: '7 years',
    companyTypes: ['Banking', 'Fintech', 'NBFC', 'Payments'],
    targetCompanies: ['HDFC Bank', 'ICICI Bank', 'Axis Bank', 'Kotak Mahindra Bank', 'Canara Bank', 'RBI', 'NPCI', 'Paytm', 'Razorpay', 'PhonePe', 'HDFC Life', 'SBI Life', 'Bajaj Finserv', 'Aditya Birla Capital'],
    manualLinkedinUrl: 'https://in.linkedin.com/jobs/view/compliance-analyst-at-morningstar-4323365391',
    mustHaveKeywords: ['AML', 'KYC', 'Transaction Monitoring', 'Sanctions Screening', 'RBI', 'Compliance', 'Case Investigation', 'STR'],
    avoidKeywords: ['entry level', 'intern', 'sales', 'telecaller'],
    noticePeriod: '60 days',
    selectedPortals: ['company_ats', 'official', 'linkedin', 'naukri', 'foundit', 'indeed', 'shine', 'glassdoor', 'placementindia', 'hirist', 'iimjobs', 'cutshort', 'timesjobs', 'instahyre', 'wellfound'],
    clarificationAnswers: {
      current_status_notice_period: 'Compliance Analyst at FinTrust Payments; 60-day notice period.',
      salary_location_preference: 'Mumbai hybrid preferred; target INR 20 LPA+ fixed.',
      role_depth: 'AML/KYC transaction monitoring, sanctions, investigations, and compliance analytics roles.',
    },
    coachQuestions: [
      'Which evidence from my AML and KYC background best matches this role?',
      'What ATS gaps or missing keywords stand out for this job?',
      'Which resume bullets should I strengthen first for this application?',
    ],
  },
};

export function getQaCandidate(slug: string) {
  if (slug && requestedCandidates[slug]) return requestedCandidates[slug];
  if (slug && candidates[slug]) return candidates[slug];
  throw new Error(`Unknown QA candidate "${slug}". Known: ${Object.keys({ ...candidates, ...requestedCandidates }).join(', ')}`);
}
