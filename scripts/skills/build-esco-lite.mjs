import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const outputPath = path.join(root, 'data/esco-lite.json');

const FALLBACK_SKILLS = [
  ['javascript', 'JavaScript', ['JS', 'ECMAScript'], 'programming languages'],
  ['typescript', 'TypeScript', ['TS'], 'programming languages'],
  ['python', 'Python', ['Python programming'], 'programming languages'],
  ['java', 'Java', ['Java programming'], 'programming languages'],
  ['sql', 'SQL', ['Structured Query Language'], 'data'],
  ['postgresql', 'PostgreSQL', ['Postgres'], 'databases'],
  ['mysql', 'MySQL', [], 'databases'],
  ['mongodb', 'MongoDB', [], 'databases'],
  ['redis', 'Redis', [], 'databases'],
  ['react', 'React', ['React.js', 'ReactJS'], 'frontend frameworks'],
  ['nextjs', 'Next.js', ['NextJS', 'Next'], 'frontend frameworks'],
  ['nodejs', 'Node.js', ['NodeJS', 'Node'], 'backend frameworks'],
  ['fastapi', 'FastAPI', [], 'backend frameworks'],
  ['django', 'Django', [], 'backend frameworks'],
  ['flask', 'Flask', [], 'backend frameworks'],
  ['tailwind', 'Tailwind CSS', ['Tailwind'], 'frontend frameworks'],
  ['html', 'HTML', ['HTML5'], 'frontend fundamentals'],
  ['css', 'CSS', ['CSS3'], 'frontend fundamentals'],
  ['aws', 'Amazon Web Services', ['AWS'], 'cloud platforms'],
  ['azure', 'Microsoft Azure', ['Azure'], 'cloud platforms'],
  ['gcp', 'Google Cloud Platform', ['GCP'], 'cloud platforms'],
  ['docker', 'Docker', ['containerisation', 'containerization'], 'devops'],
  ['kubernetes', 'Kubernetes', ['K8s'], 'devops'],
  ['terraform', 'Terraform', ['IaC'], 'devops'],
  ['ci-cd', 'CI/CD', ['continuous integration', 'continuous deployment'], 'devops'],
  ['git', 'Git', ['version control'], 'developer tools'],
  ['github-actions', 'GitHub Actions', [], 'devops'],
  ['rest-api', 'REST APIs', ['RESTful APIs', 'REST'], 'api design'],
  ['graphql', 'GraphQL', [], 'api design'],
  ['microservices', 'Microservices', ['service-oriented architecture'], 'architecture'],
  ['system-design', 'System design', ['distributed systems design'], 'architecture'],
  ['distributed-systems', 'Distributed systems', [], 'architecture'],
  ['machine-learning', 'Machine learning', ['ML'], 'machine learning'],
  ['deep-learning', 'Deep learning', [], 'machine learning'],
  ['nlp', 'Natural language processing', ['NLP'], 'machine learning'],
  ['llm', 'Large language models', ['LLM', 'LLMs'], 'machine learning'],
  ['rag', 'Retrieval augmented generation', ['RAG'], 'machine learning'],
  ['data-analysis', 'Data analysis', ['analytics'], 'data'],
  ['data-visualization', 'Data visualization', ['data visualisation'], 'data'],
  ['power-bi', 'Power BI', ['Microsoft Power BI'], 'data tools'],
  ['tableau', 'Tableau', [], 'data tools'],
  ['excel', 'Microsoft Excel', ['Excel'], 'office tools'],
  ['product-management', 'Product management', ['PM', 'product strategy'], 'product'],
  ['roadmapping', 'Roadmapping', ['product roadmap'], 'product'],
  ['customer-discovery', 'Customer discovery', ['user discovery'], 'product'],
  ['user-research', 'User research', ['UX research'], 'research'],
  ['ab-testing', 'A/B testing', ['experimentation'], 'growth'],
  ['go-to-market', 'Go-to-market strategy', ['GTM'], 'growth'],
  ['stakeholder-management', 'Stakeholder management', [], 'leadership'],
  ['project-management', 'Project management', ['program management'], 'management'],
  ['agile', 'Agile methodologies', ['Scrum', 'Kanban'], 'management'],
  ['communication', 'Communication', ['written communication'], 'transversal skills'],
  ['leadership', 'Leadership', ['team leadership'], 'transversal skills'],
  ['problem-solving', 'Problem solving', ['analytical thinking'], 'transversal skills'],
  ['critical-thinking', 'Critical thinking', [], 'transversal skills'],
  ['collaboration', 'Collaboration', ['teamwork'], 'transversal skills'],
  ['sales', 'Sales', ['business development'], 'sales'],
  ['digital-marketing', 'Digital marketing', ['performance marketing'], 'marketing'],
  ['seo', 'Search engine optimization', ['SEO'], 'marketing'],
  ['copywriting', 'Copywriting', [], 'marketing'],
  ['figma', 'Figma', ['UI design'], 'design tools'],
  ['ux-design', 'User experience design', ['UX design'], 'design'],
  ['ui-design', 'User interface design', ['UI design'], 'design'],
  ['accessibility', 'Accessibility', ['a11y'], 'design'],
  ['recruiting', 'Recruiting', ['talent acquisition'], 'human resources'],
  ['hr-operations', 'HR operations', ['people operations'], 'human resources'],
  ['financial-modeling', 'Financial modeling', ['financial modelling'], 'finance'],
  ['accounting', 'Accounting', [], 'finance'],
  ['teaching', 'Teaching', ['instruction'], 'education'],
  ['curriculum-design', 'Curriculum design', [], 'education'],
  ['clinical-research', 'Clinical research', [], 'healthcare'],
  ['quality-assurance', 'Quality assurance', ['QA'], 'quality'],
  ['test-automation', 'Test automation', ['automated testing'], 'quality'],
  ['cybersecurity', 'Cybersecurity', ['information security'], 'security'],
  ['penetration-testing', 'Penetration testing', ['pentesting'], 'security'],
];

function parseCsv(text) {
  const rows = [];
  let row = [];
  let cell = '';
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    const next = text[i + 1];
    if (char === '"' && quoted && next === '"') {
      cell += '"';
      i++;
    } else if (char === '"') {
      quoted = !quoted;
    } else if (char === ',' && !quoted) {
      row.push(cell);
      cell = '';
    } else if ((char === '\n' || char === '\r') && !quoted) {
      if (char === '\r' && next === '\n') i++;
      row.push(cell);
      if (row.some((value) => value.trim())) rows.push(row);
      row = [];
      cell = '';
    } else {
      cell += char;
    }
  }
  if (cell || row.length) {
    row.push(cell);
    rows.push(row);
  }
  return rows;
}

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

function fromRows(rows) {
  const header = rows.shift()?.map((name) => name.trim().toLowerCase()) || [];
  const idx = (names) => names.map((name) => header.indexOf(name)).find((index) => index >= 0) ?? -1;
  const concept = idx(['concepturi', 'concept uri', 'uri']);
  const label = idx(['preferredlabel', 'preferred label', 'label']);
  const alt = idx(['altlabels', 'alternative labels', 'alt labels']);
  const group = idx(['skilltype', 'skill type', 'broaderconceptpt', 'broader concept preferred term']);
  return rows.map((row, index) => {
    const skillLabel = (row[label] || '').trim();
    if (!skillLabel) return null;
    return {
      id: (row[concept] || `esco-lite-${index + 1}`).trim(),
      label: skillLabel,
      altLabels: (row[alt] || '').split(/\n|;/).map((item) => item.trim()).filter(Boolean).slice(0, 12),
      group: (row[group] || inferGroup(skillLabel)).trim() || inferGroup(skillLabel),
    };
  }).filter(Boolean);
}

async function loadSource() {
  if (process.env.ESCO_SKILLS_CSV_PATH) {
    return fs.readFileSync(path.resolve(process.env.ESCO_SKILLS_CSV_PATH), 'utf8');
  }
  if (process.env.ESCO_SKILLS_CSV_URL) {
    const response = await fetch(process.env.ESCO_SKILLS_CSV_URL);
    if (!response.ok) throw new Error(`Could not download ESCO CSV: HTTP ${response.status}`);
    return response.text();
  }
  return '';
}

let skills;
const source = await loadSource();
if (source.trim()) {
  skills = fromRows(parseCsv(source));
} else {
  skills = FALLBACK_SKILLS.map(([id, label, altLabels, group]) => ({ id, label, altLabels, group }));
}

fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, JSON.stringify({
  schemaVersion: 1,
  generatedAt: new Date().toISOString(),
  source: source.trim() ? 'esco-csv' : 'career-seek-fallback-esco-lite',
  skills,
}, null, 2));

console.log(JSON.stringify({ outputPath, skills: skills.length, source: source.trim() ? 'esco-csv' : 'fallback' }, null, 2));
