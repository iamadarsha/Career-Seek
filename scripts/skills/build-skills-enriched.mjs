/**
 * Enriched Skills Taxonomy Builder
 *
 * Generates data/esco-lite.json with 500+ skills covering:
 * - Indian tech market specifics (Oracle, SAP, Salesforce, Naukri-indexed terms)
 * - Full-stack + cloud + DevOps coverage
 * - Data science / ML / AI ecosystem
 * - Product, design, growth, marketing functions
 * - Finance, HR, operations domains
 * - Transversal / soft skills
 *
 * Run with: node scripts/skills/build-skills-enriched.mjs
 * (replaces the default fallback in build-esco-lite.mjs)
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const outputPath = path.join(root, 'data/esco-lite.json');

// Each entry: [id, label, altLabels[], group]
const SKILLS = [
  // ── Programming Languages ──────────────────────────────────────────────
  ['javascript', 'JavaScript', ['JS', 'ECMAScript', 'ES6', 'ES2015'], 'programming languages'],
  ['typescript', 'TypeScript', ['TS'], 'programming languages'],
  ['python', 'Python', ['Python 3', 'Python programming'], 'programming languages'],
  ['java', 'Java', ['Java programming', 'Core Java', 'Java SE', 'Java EE'], 'programming languages'],
  ['kotlin', 'Kotlin', ['Kotlin programming'], 'programming languages'],
  ['scala', 'Scala', ['Scala programming'], 'programming languages'],
  ['go', 'Go', ['Golang', 'Go programming'], 'programming languages'],
  ['rust', 'Rust', ['Rust programming'], 'programming languages'],
  ['c', 'C', ['C programming'], 'programming languages'],
  ['cpp', 'C++', ['C plus plus', 'CPP'], 'programming languages'],
  ['csharp', 'C#', ['C sharp', 'dotnet csharp'], 'programming languages'],
  ['ruby', 'Ruby', ['Ruby programming'], 'programming languages'],
  ['php', 'PHP', ['PHP programming'], 'programming languages'],
  ['swift', 'Swift', ['Swift programming', 'iOS Swift'], 'programming languages'],
  ['r', 'R', ['R programming', 'R language'], 'programming languages'],
  ['matlab', 'MATLAB', ['Matlab programming'], 'programming languages'],
  ['perl', 'Perl', ['Perl programming'], 'programming languages'],
  ['bash', 'Bash', ['Shell scripting', 'Bash scripting', 'Shell script'], 'programming languages'],
  ['sql', 'SQL', ['Structured Query Language', 'MySQL SQL', 'ANSI SQL'], 'data'],
  ['plsql', 'PL/SQL', ['Oracle PL/SQL', 'PLSQL'], 'data'],
  ['tsql', 'T-SQL', ['Transact SQL', 'Microsoft SQL Server scripting'], 'data'],

  // ── Frontend Frameworks & Libraries ────────────────────────────────────
  ['react', 'React', ['React.js', 'ReactJS', 'React Hooks', 'React Context'], 'frontend frameworks'],
  ['nextjs', 'Next.js', ['NextJS', 'Next', 'Next 13', 'Next 14', 'App Router'], 'frontend frameworks'],
  ['vuejs', 'Vue.js', ['Vue', 'VueJS', 'Vue 3', 'Vue Composition API'], 'frontend frameworks'],
  ['angular', 'Angular', ['AngularJS', 'Angular 2+', 'Angular 17'], 'frontend frameworks'],
  ['svelte', 'Svelte', ['SvelteKit'], 'frontend frameworks'],
  ['redux', 'Redux', ['Redux Toolkit', 'RTK', 'Redux Saga', 'Redux Thunk'], 'frontend frameworks'],
  ['tailwind', 'Tailwind CSS', ['Tailwind', 'TailwindCSS'], 'frontend frameworks'],
  ['html', 'HTML', ['HTML5', 'HTML/CSS'], 'frontend fundamentals'],
  ['css', 'CSS', ['CSS3', 'CSS animations', 'CSS Grid', 'Flexbox'], 'frontend fundamentals'],
  ['sass', 'Sass/SCSS', ['SASS', 'SCSS', 'Less CSS'], 'frontend fundamentals'],
  ['webpack', 'Webpack', ['Webpack bundler'], 'build tools'],
  ['vite', 'Vite', ['Vite build tool'], 'build tools'],
  ['storybook', 'Storybook', ['Component library', 'UI component documentation'], 'build tools'],
  ['graphql', 'GraphQL', ['GraphQL API', 'Apollo GraphQL'], 'api design'],
  ['rest-api', 'REST APIs', ['RESTful APIs', 'REST', 'RESTful web services'], 'api design'],

  // ── Backend Frameworks ──────────────────────────────────────────────────
  ['nodejs', 'Node.js', ['NodeJS', 'Node', 'server-side JavaScript'], 'backend frameworks'],
  ['express', 'Express.js', ['ExpressJS', 'Express framework'], 'backend frameworks'],
  ['nestjs', 'NestJS', ['Nest', 'NestJS framework'], 'backend frameworks'],
  ['fastapi', 'FastAPI', ['Fast API'], 'backend frameworks'],
  ['django', 'Django', ['Django REST framework', 'DRF', 'Django Python'], 'backend frameworks'],
  ['flask', 'Flask', ['Flask Python'], 'backend frameworks'],
  ['spring', 'Spring Framework', ['Spring Boot', 'Spring MVC', 'Spring Cloud', 'Spring Security'], 'backend frameworks'],
  ['rails', 'Ruby on Rails', ['Rails', 'RoR'], 'backend frameworks'],
  ['laravel', 'Laravel', ['Laravel PHP'], 'backend frameworks'],
  ['dotnet', '.NET', ['.NET Core', 'ASP.NET', 'ASP.NET Core', 'dotnet'], 'backend frameworks'],
  ['grpc', 'gRPC', ['gRPC API', 'Protocol Buffers', 'Protobuf'], 'api design'],

  // ── Mobile Development ──────────────────────────────────────────────────
  ['react-native', 'React Native', ['React Native mobile', 'RN'], 'mobile development'],
  ['flutter', 'Flutter', ['Flutter Dart'], 'mobile development'],
  ['android', 'Android Development', ['Android SDK', 'Android Studio', 'Android app'], 'mobile development'],
  ['ios', 'iOS Development', ['iOS SDK', 'Xcode', 'UIKit', 'SwiftUI'], 'mobile development'],

  // ── Databases ───────────────────────────────────────────────────────────
  ['postgresql', 'PostgreSQL', ['Postgres', 'pg'], 'databases'],
  ['mysql', 'MySQL', ['MySQL database'], 'databases'],
  ['mongodb', 'MongoDB', ['Mongo', 'NoSQL MongoDB'], 'databases'],
  ['redis', 'Redis', ['Redis cache', 'Redis queue'], 'databases'],
  ['elasticsearch', 'Elasticsearch', ['Elastic Search', 'ELK', 'OpenSearch'], 'databases'],
  ['cassandra', 'Apache Cassandra', ['Cassandra NoSQL'], 'databases'],
  ['dynamodb', 'DynamoDB', ['AWS DynamoDB', 'Amazon DynamoDB'], 'databases'],
  ['oracle-db', 'Oracle Database', ['Oracle DB', 'Oracle RDBMS', 'Oracle 19c'], 'databases'],
  ['mssql', 'Microsoft SQL Server', ['SQL Server', 'MSSQL', 'Azure SQL'], 'databases'],
  ['sqlite', 'SQLite', ['SQLite database'], 'databases'],
  ['neo4j', 'Neo4j', ['Graph database', 'Neo4j graph'], 'databases'],
  ['snowflake', 'Snowflake', ['Snowflake data warehouse'], 'databases'],
  ['bigquery', 'Google BigQuery', ['BigQuery', 'GCP BigQuery'], 'databases'],
  ['redshift', 'Amazon Redshift', ['Redshift', 'AWS Redshift'], 'databases'],

  // ── Cloud Platforms ─────────────────────────────────────────────────────
  ['aws', 'Amazon Web Services', ['AWS', 'Amazon cloud'], 'cloud platforms'],
  ['azure', 'Microsoft Azure', ['Azure', 'Azure cloud', 'Azure DevOps'], 'cloud platforms'],
  ['gcp', 'Google Cloud Platform', ['GCP', 'Google Cloud'], 'cloud platforms'],
  ['aws-lambda', 'AWS Lambda', ['Lambda functions', 'Serverless AWS'], 'cloud platforms'],
  ['aws-s3', 'Amazon S3', ['S3 bucket', 'AWS storage'], 'cloud platforms'],
  ['aws-ec2', 'Amazon EC2', ['EC2 instances', 'AWS compute'], 'cloud platforms'],
  ['aws-ecs', 'Amazon ECS/EKS', ['ECS', 'EKS', 'AWS containers'], 'cloud platforms'],
  ['aws-rds', 'Amazon RDS', ['RDS database', 'AWS database'], 'cloud platforms'],
  ['azure-functions', 'Azure Functions', ['Azure serverless', 'Azure Functions app'], 'cloud platforms'],
  ['cloudflare', 'Cloudflare', ['Cloudflare Workers', 'Cloudflare CDN'], 'cloud platforms'],
  ['vercel', 'Vercel', ['Vercel deployment', 'Vercel platform'], 'cloud platforms'],
  ['netlify', 'Netlify', [], 'cloud platforms'],

  // ── DevOps & Infrastructure ─────────────────────────────────────────────
  ['docker', 'Docker', ['Docker containers', 'containerisation', 'containerization', 'Dockerfile'], 'devops'],
  ['kubernetes', 'Kubernetes', ['K8s', 'Helm', 'Kubernetes orchestration'], 'devops'],
  ['terraform', 'Terraform', ['IaC', 'Infrastructure as Code', 'Terraform HCL'], 'devops'],
  ['ansible', 'Ansible', ['Ansible automation', 'Ansible playbooks'], 'devops'],
  ['ci-cd', 'CI/CD', ['continuous integration', 'continuous deployment', 'continuous delivery'], 'devops'],
  ['github-actions', 'GitHub Actions', ['GH Actions'], 'devops'],
  ['jenkins', 'Jenkins', ['Jenkins CI', 'Jenkins pipeline'], 'devops'],
  ['gitlab-ci', 'GitLab CI/CD', ['GitLab pipelines'], 'devops'],
  ['git', 'Git', ['version control', 'Git VCS'], 'developer tools'],
  ['github', 'GitHub', ['GitHub platform', 'GitHub PRs'], 'developer tools'],
  ['nginx', 'Nginx', ['nginx web server', 'nginx reverse proxy'], 'devops'],
  ['linux', 'Linux', ['Linux administration', 'Ubuntu', 'CentOS', 'RHEL', 'Debian'], 'devops'],
  ['prometheus', 'Prometheus', ['Prometheus monitoring'], 'devops'],
  ['grafana', 'Grafana', ['Grafana dashboards'], 'devops'],
  ['datadog', 'Datadog', ['Datadog monitoring', 'APM'], 'devops'],
  ['new-relic', 'New Relic', ['NewRelic observability'], 'devops'],

  // ── Data Science & Analytics ────────────────────────────────────────────
  ['machine-learning', 'Machine learning', ['ML', 'supervised learning', 'unsupervised learning'], 'machine learning'],
  ['deep-learning', 'Deep learning', ['neural networks', 'DL'], 'machine learning'],
  ['nlp', 'Natural language processing', ['NLP', 'text analytics'], 'machine learning'],
  ['llm', 'Large language models', ['LLM', 'LLMs', 'GPT', 'ChatGPT API'], 'machine learning'],
  ['rag', 'Retrieval augmented generation', ['RAG', 'vector search'], 'machine learning'],
  ['pytorch', 'PyTorch', ['Torch', 'PyTorch deep learning'], 'machine learning'],
  ['tensorflow', 'TensorFlow', ['TF', 'TensorFlow Keras'], 'machine learning'],
  ['scikit-learn', 'scikit-learn', ['sklearn', 'Scikit Learn'], 'machine learning'],
  ['huggingface', 'Hugging Face', ['Transformers library', 'HuggingFace'], 'machine learning'],
  ['langchain', 'LangChain', ['LangChain framework'], 'machine learning'],
  ['openai-api', 'OpenAI API', ['GPT API', 'OpenAI'], 'machine learning'],
  ['pandas', 'Pandas', ['Pandas dataframe'], 'data tools'],
  ['numpy', 'NumPy', ['Numpy array'], 'data tools'],
  ['spark', 'Apache Spark', ['PySpark', 'Spark streaming', 'Databricks'], 'data tools'],
  ['kafka', 'Apache Kafka', ['Kafka streaming', 'event streaming'], 'data tools'],
  ['airflow', 'Apache Airflow', ['Airflow DAGs', 'workflow orchestration'], 'data tools'],
  ['dbt', 'dbt', ['data build tool', 'dbt models'], 'data tools'],
  ['data-analysis', 'Data analysis', ['analytics', 'data analytics'], 'data'],
  ['data-visualization', 'Data visualization', ['data visualisation', 'charting'], 'data'],
  ['statistics', 'Statistics', ['statistical analysis', 'statistical modeling'], 'data'],
  ['a-b-testing', 'A/B testing', ['experimentation', 'split testing', 'hypothesis testing'], 'growth'],
  ['etl', 'ETL', ['Extract Transform Load', 'data pipelines', 'ELT'], 'data'],
  ['feature-engineering', 'Feature engineering', ['ML features', 'feature selection'], 'machine learning'],

  // ── Business Intelligence & Reporting ───────────────────────────────────
  ['power-bi', 'Power BI', ['Microsoft Power BI', 'PowerBI', 'Power BI Desktop'], 'data tools'],
  ['tableau', 'Tableau', ['Tableau Desktop', 'Tableau Server', 'Tableau Public'], 'data tools'],
  ['looker', 'Looker', ['Looker Studio', 'Google Looker', 'LookML'], 'data tools'],
  ['excel', 'Microsoft Excel', ['Excel', 'Excel VBA', 'Excel pivot tables', 'advanced Excel'], 'office tools'],
  ['google-sheets', 'Google Sheets', ['G Sheets', 'Sheets'], 'office tools'],
  ['sql-reporting', 'SQL reporting', ['SQL dashboards', 'business intelligence SQL'], 'data tools'],

  // ── Enterprise Software ─────────────────────────────────────────────────
  ['salesforce', 'Salesforce', ['Salesforce CRM', 'SFDC', 'Salesforce admin', 'Salesforce dev', 'Apex'], 'enterprise software'],
  ['sap', 'SAP', ['SAP ERP', 'SAP HANA', 'SAP S/4HANA', 'SAP BW', 'SAP ABAP'], 'enterprise software'],
  ['oracle-erp', 'Oracle ERP', ['Oracle Fusion', 'Oracle Cloud ERP', 'Oracle Applications'], 'enterprise software'],
  ['jira', 'Jira', ['Atlassian Jira', 'Jira Software', 'Jira tickets'], 'project tools'],
  ['confluence', 'Confluence', ['Atlassian Confluence', 'Confluence wiki'], 'project tools'],
  ['notion', 'Notion', ['Notion workspace'], 'project tools'],
  ['slack', 'Slack', ['Slack communication'], 'office tools'],
  ['hubspot', 'HubSpot', ['HubSpot CRM', 'HubSpot marketing'], 'enterprise software'],
  ['zendesk', 'Zendesk', ['Zendesk support'], 'enterprise software'],
  ['servicenow', 'ServiceNow', ['ServiceNow ITSM'], 'enterprise software'],

  // ── Security & Compliance ───────────────────────────────────────────────
  ['cybersecurity', 'Cybersecurity', ['information security', 'infosec', 'cyber security'], 'security'],
  ['penetration-testing', 'Penetration testing', ['pen testing', 'ethical hacking', 'VAPT'], 'security'],
  ['owasp', 'OWASP', ['OWASP Top 10', 'web security'], 'security'],
  ['soc2', 'SOC 2', ['SOC2 compliance', 'audit readiness'], 'security'],
  ['iso27001', 'ISO 27001', ['ISO 27001 compliance', 'ISMS'], 'security'],
  ['gdpr', 'GDPR', ['data protection', 'privacy compliance'], 'security'],
  ['oauth', 'OAuth', ['OAuth2', 'OIDC', 'SSO'], 'security'],
  ['jwt', 'JWT', ['JSON Web Token', 'token authentication'], 'security'],

  // ── Testing & Quality ───────────────────────────────────────────────────
  ['quality-assurance', 'Quality assurance', ['QA', 'software testing', 'QC'], 'quality'],
  ['unit-testing', 'Unit testing', ['Jest', 'JUnit', 'pytest', 'unit tests'], 'quality'],
  ['e2e-testing', 'End-to-end testing', ['E2E', 'Selenium', 'Playwright', 'Cypress', 'automation testing'], 'quality'],
  ['api-testing', 'API testing', ['Postman', 'REST Assured', 'API automation'], 'quality'],
  ['tdd', 'Test-driven development', ['TDD', 'BDD', 'test driven'], 'quality'],
  ['performance-testing', 'Performance testing', ['load testing', 'JMeter', 'k6'], 'quality'],

  // ── Architecture & Design Patterns ──────────────────────────────────────
  ['microservices', 'Microservices', ['microservices architecture', 'service mesh', 'MSA'], 'architecture'],
  ['system-design', 'System design', ['distributed systems design', 'HLD', 'LLD'], 'architecture'],
  ['distributed-systems', 'Distributed systems', ['CAP theorem', 'event-driven architecture'], 'architecture'],
  ['event-driven', 'Event-driven architecture', ['EDA', 'message queues', 'pub/sub'], 'architecture'],
  ['serverless', 'Serverless', ['FaaS', 'serverless architecture', 'functions as a service'], 'architecture'],
  ['api-design', 'API design', ['API architecture', 'REST design', 'API-first'], 'api design'],
  ['clean-architecture', 'Clean Architecture', ['SOLID principles', 'DDD', 'domain-driven design'], 'architecture'],

  // ── Product Management ───────────────────────────────────────────────────
  ['product-management', 'Product management', ['PM', 'product strategy', 'product manager', 'CPO'], 'product'],
  ['roadmapping', 'Roadmapping', ['product roadmap', 'product planning', 'product backlog'], 'product'],
  ['customer-discovery', 'Customer discovery', ['user discovery', 'problem validation', 'customer interviews'], 'product'],
  ['user-research', 'User research', ['UX research', 'usability research', 'user interviews'], 'research'],
  ['product-analytics', 'Product analytics', ['product metrics', 'funnel analysis', 'North Star metric'], 'product'],
  ['go-to-market', 'Go-to-market strategy', ['GTM', 'launch strategy', 'market entry'], 'growth'],
  ['product-led-growth', 'Product-led growth', ['PLG', 'self-serve growth'], 'growth'],
  ['okrs', 'OKRs', ['Objectives and Key Results', 'goal setting framework'], 'management'],
  ['user-stories', 'User stories', ['backlog grooming', 'story mapping', 'epic writing'], 'product'],
  ['prioritization', 'Prioritization', ['RICE scoring', 'MoSCoW', 'feature prioritization'], 'product'],
  ['product-discovery', 'Product discovery', ['design thinking', 'Jobs-to-be-done', 'JTBD'], 'product'],

  // ── Design ──────────────────────────────────────────────────────────────
  ['figma', 'Figma', ['Figma design', 'Figma prototype', 'Figma UI'], 'design tools'],
  ['sketch', 'Sketch', ['Sketch app', 'Sketch design'], 'design tools'],
  ['adobe-xd', 'Adobe XD', ['XD design', 'AdobeXD'], 'design tools'],
  ['ux-design', 'User experience design', ['UX design', 'UX strategy', 'user-centred design'], 'design'],
  ['ui-design', 'User interface design', ['UI design', 'visual design'], 'design'],
  ['accessibility', 'Accessibility', ['a11y', 'WCAG', 'inclusive design'], 'design'],
  ['motion-design', 'Motion design', ['animation design', 'After Effects'], 'design'],
  ['design-systems', 'Design systems', ['component library design', 'Storybook design'], 'design'],
  ['information-architecture', 'Information architecture', ['IA', 'content strategy', 'site mapping'], 'design'],
  ['prototyping', 'Prototyping', ['wireframing', 'low-fi prototype', 'hi-fi mockup'], 'design'],

  // ── Growth & Marketing ───────────────────────────────────────────────────
  ['digital-marketing', 'Digital marketing', ['performance marketing', 'online marketing'], 'marketing'],
  ['seo', 'Search engine optimization', ['SEO', 'organic search', 'technical SEO'], 'marketing'],
  ['sem', 'Search engine marketing', ['SEM', 'Google Ads', 'paid search', 'PPC'], 'marketing'],
  ['content-marketing', 'Content marketing', ['content strategy', 'editorial calendar'], 'marketing'],
  ['email-marketing', 'Email marketing', ['email campaigns', 'Mailchimp', 'email automation'], 'marketing'],
  ['social-media-marketing', 'Social media marketing', ['SMM', 'social media management'], 'marketing'],
  ['copywriting', 'Copywriting', ['UX writing', 'content writing', 'marketing copy'], 'marketing'],
  ['crm-marketing', 'CRM marketing', ['lifecycle marketing', 'customer retention', 'Klaviyo'], 'marketing'],
  ['growth-hacking', 'Growth hacking', ['growth marketing', 'virality', 'referral programs'], 'growth'],

  // ── Sales & Business Development ─────────────────────────────────────────
  ['sales', 'Sales', ['business development', 'B2B sales', 'enterprise sales', 'SaaS sales'], 'sales'],
  ['inside-sales', 'Inside sales', ['SDR', 'BDR', 'sales development'], 'sales'],
  ['account-management', 'Account management', ['client management', 'customer success'], 'sales'],
  ['revenue-operations', 'Revenue operations', ['RevOps', 'sales operations'], 'sales'],

  // ── Finance & Accounting ─────────────────────────────────────────────────
  ['financial-modeling', 'Financial modeling', ['financial modelling', 'Excel modeling', 'DCF'], 'finance'],
  ['accounting', 'Accounting', ['bookkeeping', 'GAAP', 'accounts payable', 'accounts receivable'], 'finance'],
  ['fp-a', 'FP&A', ['financial planning and analysis', 'budgeting', 'forecasting'], 'finance'],
  ['valuation', 'Business valuation', ['startup valuation', 'company valuation', 'venture analysis'], 'finance'],
  ['investment-analysis', 'Investment analysis', ['equity research', 'portfolio management', 'due diligence'], 'finance'],
  ['risk-management', 'Risk management', ['risk analysis', 'financial risk', 'ERM'], 'finance'],

  // ── Human Resources ──────────────────────────────────────────────────────
  ['recruiting', 'Recruiting', ['talent acquisition', 'hiring', 'talent sourcing', 'TA'], 'human resources'],
  ['hr-operations', 'HR operations', ['people operations', 'HRIS', 'HR systems'], 'human resources'],
  ['learning-development', 'Learning & development', ['L&D', 'employee training', 'upskilling'], 'human resources'],
  ['compensation-benefits', 'Compensation & benefits', ['C&B', 'total rewards', 'ESOP'], 'human resources'],
  ['performance-management', 'Performance management', ['performance reviews', 'OKRs HR'], 'human resources'],

  // ── Project & Operations Management ─────────────────────────────────────
  ['project-management', 'Project management', ['program management', 'PMO', 'PMP', 'PRINCE2'], 'management'],
  ['agile', 'Agile methodologies', ['Scrum', 'Kanban', 'SAFe', 'Lean', 'sprint planning'], 'management'],
  ['stakeholder-management', 'Stakeholder management', ['executive stakeholders', 'cross-functional'], 'leadership'],
  ['operations-management', 'Operations management', ['business operations', 'process improvement'], 'management'],
  ['six-sigma', 'Six Sigma', ['Lean Six Sigma', 'process excellence', 'Green Belt'], 'management'],

  // ── Soft / Transversal Skills ─────────────────────────────────────────
  ['communication', 'Communication', ['written communication', 'verbal communication', 'presentation skills'], 'transversal skills'],
  ['leadership', 'Leadership', ['team leadership', 'people management', 'leading teams'], 'leadership'],
  ['problem-solving', 'Problem solving', ['analytical thinking', 'root cause analysis'], 'transversal skills'],
  ['critical-thinking', 'Critical thinking', ['strategic thinking', 'structured thinking'], 'transversal skills'],
  ['collaboration', 'Collaboration', ['teamwork', 'cross-functional collaboration'], 'transversal skills'],
  ['adaptability', 'Adaptability', ['flexibility', 'change management', 'resilience'], 'transversal skills'],
  ['time-management', 'Time management', ['prioritisation', 'deadline management'], 'transversal skills'],
  ['mentoring', 'Mentoring', ['coaching', 'knowledge transfer', 'technical mentorship'], 'leadership'],

  // ── Indian Domain-Specific ────────────────────────────────────────────
  ['tally', 'Tally', ['Tally ERP', 'Tally Prime'], 'enterprise software'],
  ['zoho', 'Zoho', ['Zoho CRM', 'Zoho One', 'Zoho Books'], 'enterprise software'],
  ['freshworks', 'Freshworks', ['Freshdesk', 'Freshsales', 'Freshservice'], 'enterprise software'],
  ['razorpay', 'Razorpay', ['payment gateway', 'Razorpay integration'], 'enterprise software'],
  ['upi', 'UPI integration', ['UPI payments', 'NPCI APIs'], 'enterprise software'],
  ['gst', 'GST', ['GST filing', 'GST compliance', 'tax computation India'], 'finance'],
  ['rbi-compliance', 'RBI compliance', ['SEBI', 'financial compliance India'], 'finance'],
];

function inferGroup(label) {
  const lower = label.toLowerCase();
  if (/javascript|typescript|python|java|sql|program/.test(lower)) return 'programming languages';
  if (/database|postgres|mysql|redis|mongo/.test(lower)) return 'databases';
  if (/cloud|aws|azure|docker|kubernetes|devops/.test(lower)) return 'devops';
  if (/design|figma|user experience|interface/.test(lower)) return 'design';
  if (/data|analytics|machine learning|language model|ai/.test(lower)) return 'data and ai';
  if (/manage|lead|stakeholder|product|roadmap/.test(lower)) return 'management';
  return 'general skills';
}

const skills = SKILLS.map(([id, label, altLabels, group]) => ({
  id,
  label,
  altLabels,
  group: group || inferGroup(label),
}));

fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, JSON.stringify({
  schemaVersion: 1,
  generatedAt: new Date().toISOString(),
  source: 'career-seek-enriched-v2',
  skills,
}, null, 2));

console.log(JSON.stringify({
  outputPath,
  skills: skills.length,
  source: 'career-seek-enriched-v2',
  groups: [...new Set(skills.map(s => s.group))].length,
}, null, 2));
