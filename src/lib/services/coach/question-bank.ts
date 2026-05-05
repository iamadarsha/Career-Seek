export interface CareerCoachPlaybookTopic {
  id: string;
  label: string;
  group: string;
  evidenceToUse: string;
  practicalMove: string;
  truthGuard: string;
  avoid: string;
  nextAction: string;
}

export interface CareerCoachPlaybookEntry {
  id: string;
  topicId: string;
  topic: string;
  group: string;
  question: string;
  answer: string;
  suggestedFollowUps: string[];
  caveats: string[];
}

interface CareerCoachPlaybookFrame {
  id: string;
  question: string;
  lead: (topic: CareerCoachPlaybookTopic) => string;
  action: (topic: CareerCoachPlaybookTopic) => string;
}

const TOPICS: CareerCoachPlaybookTopic[] = [
  {
    id: 'career-positioning',
    label: 'my overall career positioning',
    group: 'positioning',
    evidenceToUse: 'your resume summary, strongest projects, target roles, and the jobs that keep scoring well',
    practicalMove: 'one clear market category, such as "AI product manager for search and analytics" instead of a broad title',
    truthGuard: 'claim the pattern your evidence supports, not the title you wish the market would infer',
    avoid: 'listing every possible identity at once',
    nextAction: 'write a one-sentence positioning line and test it against three saved jobs',
  },
  {
    id: 'resume-headline',
    label: 'the strongest resume headline',
    group: 'resume',
    evidenceToUse: 'your top role, domain keywords, measurable wins, and the seniority implied by target jobs',
    practicalMove: 'a headline that combines role, domain, and proof',
    truthGuard: 'keep the headline specific enough that a recruiter can picture the lane',
    avoid: 'generic phrases like "results-driven professional" without a domain',
    nextAction: 'draft three headline variants and pick the one that matches the highest-scoring job cluster',
  },
  {
    id: 'resume-bullets',
    label: 'my top three resume bullets',
    group: 'resume',
    evidenceToUse: 'impact metrics, shipped work, stakeholder scope, tools, and business outcomes',
    practicalMove: 'bullets that start with an action, include scope, and end with evidence',
    truthGuard: 'use approximate but honest scope when exact numbers are unavailable',
    avoid: 'turning responsibilities into long paragraphs',
    nextAction: 'rewrite three bullets using action, scope, method, and result',
  },
  {
    id: 'target-jd',
    label: 'a target job description',
    group: 'job-fit',
    evidenceToUse: 'JD responsibilities, required skills, nice-to-haves, company context, and your matching proof',
    practicalMove: 'separate must-have signals from optional noise',
    truthGuard: 'name gaps directly while showing adjacent evidence',
    avoid: 'treating every keyword as equally important',
    nextAction: 'extract five must-have requirements and map one resume proof point to each',
  },
  {
    id: 'ats-keywords',
    label: 'ATS keyword coverage',
    group: 'ats',
    evidenceToUse: 'the ATS report, missing keywords, resume skills, and job requirement frequency',
    practicalMove: 'add keywords only where they are backed by real experience',
    truthGuard: 'standardize wording without inventing capability',
    avoid: 'keyword stuffing or hiding terms in unnatural sentences',
    nextAction: 'add three high-priority missing terms into existing bullets or the skills section',
  },
  {
    id: 'missing-skills',
    label: 'missing skills for a role',
    group: 'skills',
    evidenceToUse: 'JD requirements, resume skills, ESCO-lite canonical skills, and related skill suggestions',
    practicalMove: 'sort gaps into must-learn, mention-adjacent, and ignore-for-now',
    truthGuard: 'distinguish hands-on skill from exposure or collaboration',
    avoid: 'claiming proficiency from a tutorial or passing familiarity',
    nextAction: 'pick one must-have gap and create a small proof project around it',
  },
  {
    id: 'transferable-skills',
    label: 'transferable skills',
    group: 'skills',
    evidenceToUse: 'past achievements, domain shifts, project outcomes, and repeated strengths across roles',
    practicalMove: 'translate old-context wins into the new role language',
    truthGuard: 'explain the bridge, not just the destination',
    avoid: 'assuming the recruiter will connect the dots unaided',
    nextAction: 'write two bridge bullets that show how prior work maps to the target role',
  },
  {
    id: 'salary',
    label: 'salary expectations',
    group: 'market',
    evidenceToUse: 'saved job salary data, seniority, location, company type, and your strongest differentiators',
    practicalMove: 'use a range with a rationale and one flexible variable',
    truthGuard: 'separate market data from preference',
    avoid: 'anchoring too low before role scope is clear',
    nextAction: 'prepare a range, a minimum walk-away point, and one sentence explaining the range',
  },
  {
    id: 'remote-hybrid',
    label: 'remote versus hybrid fit',
    group: 'market',
    evidenceToUse: 'job location, work-mode preferences, collaboration examples, and commute constraints',
    practicalMove: 'frame work mode around productivity and team rhythm',
    truthGuard: 'be clear about hard constraints early enough to avoid wasted cycles',
    avoid: 'sounding inflexible before showing value',
    nextAction: 'write a two-line work-mode preference that includes your reason and flexibility boundary',
  },
  {
    id: 'recruiter-outreach',
    label: 'recruiter outreach',
    group: 'outreach',
    evidenceToUse: 'target role, company reason, two matching proof points, and a clear ask',
    practicalMove: 'send a short message that is easy to forward',
    truthGuard: 'make the ask modest and specific',
    avoid: 'long autobiography messages',
    nextAction: 'draft a 90-word recruiter note with role, fit, proof, and ask',
  },
  {
    id: 'hiring-manager-message',
    label: 'hiring manager messages',
    group: 'outreach',
    evidenceToUse: 'team mission, role priorities, your most relevant project, and a sharp question',
    practicalMove: 'lead with the business problem you can help solve',
    truthGuard: 'show curiosity without pretending to know internal facts',
    avoid: 'asking for a job before demonstrating relevance',
    nextAction: 'draft a message that connects one project to one team priority',
  },
  {
    id: 'follow-up-email',
    label: 'follow-up emails',
    group: 'outreach',
    evidenceToUse: 'last interaction, promised next step, date, and one fresh value signal',
    practicalMove: 'follow up politely with context and an easy response path',
    truthGuard: 'acknowledge uncertainty without sounding apologetic',
    avoid: 'multiple vague check-ins with no useful context',
    nextAction: 'send one concise follow-up after an appropriate waiting window',
  },
  {
    id: 'interview-prep',
    label: 'interview preparation',
    group: 'interview',
    evidenceToUse: 'JD priorities, resume proof points, company context, and likely evaluation areas',
    practicalMove: 'prepare stories for the role requirements, not generic interview trivia',
    truthGuard: 'anchor answers in work you actually did',
    avoid: 'memorizing scripts that collapse when probed',
    nextAction: 'prepare five stories mapped to five likely evaluation themes',
  },
  {
    id: 'behavioral-stories',
    label: 'behavioral interview stories',
    group: 'interview',
    evidenceToUse: 'conflict, leadership, ambiguity, failure, collaboration, and impact examples',
    practicalMove: 'use situation, action, decision, result, and learning',
    truthGuard: 'include tradeoffs and what changed because of your action',
    avoid: 'stories where you are only a passive participant',
    nextAction: 'write three STAR-style stories and mark the evidence for each',
  },
  {
    id: 'technical-focus',
    label: 'technical interview focus',
    group: 'interview',
    evidenceToUse: 'required tools, architecture hints, analytics expectations, and your project history',
    practicalMove: 'prioritize the technical areas most connected to the role outcomes',
    truthGuard: 'state depth accurately: built, used, reviewed, or collaborated',
    avoid: 'studying every tool equally',
    nextAction: 'make a seven-day prep list around the top three technical gaps',
  },
  {
    id: 'portfolio-projects',
    label: 'portfolio project choices',
    group: 'proof',
    evidenceToUse: 'target role gaps, visible artifacts, domain relevance, and measurable outcomes',
    practicalMove: 'choose projects that prove the missing signal a recruiter needs',
    truthGuard: 'keep scope small enough to finish and explain clearly',
    avoid: 'large unfinished showcase projects',
    nextAction: 'pick one project that demonstrates a target skill within a week',
  },
  {
    id: 'linkedin-profile',
    label: 'LinkedIn profile positioning',
    group: 'profile',
    evidenceToUse: 'headline, about section, featured work, role keywords, and recruiter search terms',
    practicalMove: 'make your profile searchable and consistent with the resume',
    truthGuard: 'use the same career lane across headline, about, and experience',
    avoid: 'a profile that sounds like a different candidate from the resume',
    nextAction: 'align headline, about section, and featured links with the top target role',
  },
  {
    id: 'cover-letter',
    label: 'cover letter strategy',
    group: 'documents',
    evidenceToUse: 'company reason, role priorities, resume proof, and one memorable fit angle',
    practicalMove: 'write a focused note that adds context the resume cannot',
    truthGuard: 'make the company reason specific but verifiable',
    avoid: 'repeating the resume in paragraph form',
    nextAction: 'draft three short paragraphs: why this company, why this role, why you',
  },
  {
    id: 'search-prioritization',
    label: 'job search prioritization',
    group: 'pipeline',
    evidenceToUse: 'job scores, source quality, deadlines, company fit, salary, and response probability',
    practicalMove: 'spend energy where fit and freshness overlap',
    truthGuard: 'treat low-fit applications as experiments, not the main plan',
    avoid: 'applying everywhere with the same resume',
    nextAction: 'rank saved jobs into apply today, research first, and skip',
  },
  {
    id: 'company-research',
    label: 'company research',
    group: 'research',
    evidenceToUse: 'company page, role description, recent product signals, market, and hiring team clues',
    practicalMove: 'connect your interest to a business reality, not just brand admiration',
    truthGuard: 'say what you know and what you would want to learn',
    avoid: 'generic praise that could apply to any company',
    nextAction: 'write three company-specific reasons before applying',
  },
  {
    id: 'application-risk',
    label: 'application risk',
    group: 'job-fit',
    evidenceToUse: 'score breakdown, missing requirements, seniority mismatch, location, and source health',
    practicalMove: 'separate disqualifying risks from fixable presentation risks',
    truthGuard: 'name the risk and the evidence that reduces it',
    avoid: 'ignoring a major mismatch because the title is attractive',
    nextAction: 'write one mitigation sentence for each top risk',
  },
  {
    id: 'career-gaps',
    label: 'career gaps',
    group: 'story',
    evidenceToUse: 'gap dates, learning, freelance work, caregiving, health, projects, or search activity',
    practicalMove: 'explain the gap briefly and return to readiness',
    truthGuard: 'share enough context to be credible without oversharing',
    avoid: 'defensive explanations that keep attention on the gap',
    nextAction: 'prepare a two-sentence explanation plus one readiness proof point',
  },
  {
    id: 'career-transition',
    label: 'career transitions',
    group: 'story',
    evidenceToUse: 'target role requirements, prior domain strengths, bridge projects, and learning proof',
    practicalMove: 'make the transition look intentional and evidence-backed',
    truthGuard: 'show what has already changed in your work, not only your interest',
    avoid: 'asking the recruiter to take a leap of faith',
    nextAction: 'create a bridge narrative with past strength, new direction, and proof',
  },
  {
    id: 'promotion-readiness',
    label: 'promotion readiness',
    group: 'growth',
    evidenceToUse: 'scope expansion, stakeholder trust, measurable outcomes, ownership, and leadership examples',
    practicalMove: 'show that you already operate at the next level in some ways',
    truthGuard: 'tie readiness to observed impact, not tenure alone',
    avoid: 'making the case only as a desire for title or salary',
    nextAction: 'collect three examples of next-level behavior and the outcomes attached to them',
  },
  {
    id: 'learning-roadmap',
    label: 'learning roadmap',
    group: 'growth',
    evidenceToUse: 'skill gaps, target roles, available time, current baseline, and proof opportunities',
    practicalMove: 'learn toward visible career proof, not abstract completion',
    truthGuard: 'measure progress through applied outputs',
    avoid: 'collecting courses without building evidence',
    nextAction: 'choose one skill, one small project, and one public or resume-ready artifact',
  },
  {
    id: 'networking-strategy',
    label: 'networking strategy',
    group: 'outreach',
    evidenceToUse: 'target companies, alumni or peer paths, saved roles, and warm context',
    practicalMove: 'ask for perspective before asking for referral help',
    truthGuard: 'be respectful of time and clear about why you chose them',
    avoid: 'mass messages with no reason for the connection',
    nextAction: 'build a list of ten relevant people and send three tailored notes',
  },
  {
    id: 'offer-negotiation',
    label: 'offer negotiation',
    group: 'market',
    evidenceToUse: 'offer details, market salary, competing opportunities, role scope, and personal constraints',
    practicalMove: 'negotiate on total value and role fit, not only base pay',
    truthGuard: 'be warm, specific, and grounded in scope or market evidence',
    avoid: 'bluffing about leverage you do not have',
    nextAction: 'write a negotiation script with appreciation, rationale, ask, and flexibility',
  },
  {
    id: 'job-alerts',
    label: 'job alerts and saved searches',
    group: 'pipeline',
    evidenceToUse: 'preferred titles, portals, location, work mode, keywords, and source reliability',
    practicalMove: 'keep alerts narrow enough to be useful and broad enough to discover adjacent roles',
    truthGuard: 'review alert quality weekly instead of trusting the first query',
    avoid: 'letting alerts become a noisy backlog',
    nextAction: 'create two precise searches and one exploratory adjacent search',
  },
  {
    id: 'tracker-hygiene',
    label: 'application tracker hygiene',
    group: 'pipeline',
    evidenceToUse: 'saved jobs, applied status, deadlines, follow-up dates, documents, and notes',
    practicalMove: 'make the tracker tell you the next action without rereading everything',
    truthGuard: 'record what actually happened, not what you intended to do',
    avoid: 'keeping important follow-ups in memory only',
    nextAction: 'review the tracker and assign one next action to each active opportunity',
  },
  {
    id: 'personal-brand-proof',
    label: 'personal brand proof',
    group: 'proof',
    evidenceToUse: 'portfolio links, writing, demos, GitHub, case studies, talks, or measurable public work',
    practicalMove: 'make one proof asset easy for a recruiter to inspect in under two minutes',
    truthGuard: 'show real work and boundaries instead of polished claims alone',
    avoid: 'visual polish that hides unclear substance',
    nextAction: 'create or refresh one proof link that supports your target role',
  },
];

const FRAMES: CareerCoachPlaybookFrame[] = [
  {
    id: 'first-step',
    question: 'What should I do first for {topic}?',
    lead: (topic) => `Start by making ${topic.label} concrete. The first move is not to perfect everything; it is to decide what evidence matters most.`,
    action: (topic) => `Review ${topic.evidenceToUse}. Then choose ${topic.practicalMove}.`,
  },
  {
    id: 'truthful-explanation',
    question: 'How should I explain {topic} clearly and truthfully?',
    lead: (topic) => `Explain ${topic.label} with a simple claim, a proof point, and a boundary. That keeps the answer confident without turning it into a sales pitch.`,
    action: (topic) => `Use this truth guard: ${topic.truthGuard}.`,
  },
  {
    id: 'best-evidence',
    question: 'Which evidence from my profile best supports {topic}?',
    lead: (topic) => `The best evidence for ${topic.label} is the proof a recruiter can verify quickly and connect to the role.`,
    action: (topic) => `Prioritize ${topic.evidenceToUse}. If two points are equally strong, choose the one closest to the target job's language.`,
  },
  {
    id: 'biggest-risks',
    question: 'What are the biggest risks around {topic}?',
    lead: (topic) => `The biggest risk around ${topic.label} is usually not a missing perfect answer. It is an unclear signal that makes the reader do extra work.`,
    action: (topic) => `Reduce that risk by using ${topic.practicalMove} and by avoiding ${topic.avoid}.`,
  },
  {
    id: 'avoid-saying',
    question: 'What should I avoid saying about {topic}?',
    lead: (topic) => `Avoid language that makes ${topic.label} sound broader, stronger, or more certain than your evidence supports.`,
    action: (topic) => `Specifically avoid ${topic.avoid}. Replace it with a clear, evidence-backed statement.`,
  },
  {
    id: 'make-specific',
    question: 'How can I make {topic} more specific?',
    lead: (topic) => `Make ${topic.label} specific by naming the role context, the proof, and the next action.`,
    action: (topic) => `Use ${topic.practicalMove}. Then add one concrete example from ${topic.evidenceToUse}.`,
  },
  {
    id: 'recruiter-notice',
    question: 'What would a recruiter likely notice about {topic}?',
    lead: (topic) => `A recruiter will notice whether ${topic.label} makes their screening decision easier. They are looking for fit, proof, and risk in a short scan.`,
    action: (topic) => `Make the scan easier by foregrounding ${topic.practicalMove} and keeping ${topic.truthGuard}.`,
  },
  {
    id: 'prioritize-actions',
    question: 'How should I prioritize next actions for {topic}?',
    lead: (topic) => `Prioritize ${topic.label} by impact on applications first, then speed, then confidence.`,
    action: (topic) => `Do this next: ${topic.nextAction}. If it helps one high-fit application today, it belongs near the top.`,
  },
  {
    id: 'local-data',
    question: 'What local data should I review before deciding on {topic}?',
    lead: (topic) => `Use Career Seek's local data before making a call on ${topic.label}. The point is to make decisions from your own job pool, not generic internet advice.`,
    action: (topic) => `Review ${topic.evidenceToUse}, then compare it with saved jobs, ATS results, and recent application outcomes.`,
  },
  {
    id: 'checklist',
    question: 'Give me a concise checklist for {topic}.',
    lead: (topic) => `Here is a concise checklist for ${topic.label}.`,
    action: (topic) => `Check the evidence, choose ${topic.practicalMove}, apply this guard: ${topic.truthGuard}, avoid ${topic.avoid}, then do this: ${topic.nextAction}.`,
  },
];

function renderAnswer(topic: CareerCoachPlaybookTopic, frame: CareerCoachPlaybookFrame): string {
  return [
    frame.lead(topic),
    '',
    `- Evidence to inspect: ${topic.evidenceToUse}.`,
    `- Practical move: ${frame.action(topic)}`,
    `- Keep it honest: ${topic.truthGuard}.`,
    `- Avoid: ${topic.avoid}.`,
    `- Next action: ${topic.nextAction}.`,
    '',
    'This is local playbook guidance. If you index a resume, job description, ATS report, or application note, the coach can ground the answer in your actual evidence.',
  ].join('\n');
}

function buildPlaybook(): CareerCoachPlaybookEntry[] {
  return TOPICS.flatMap((topic) => FRAMES.map((frame) => ({
    id: `${topic.id}:${frame.id}`,
    topicId: topic.id,
    topic: topic.label,
    group: topic.group,
    question: frame.question.replace('{topic}', topic.label),
    answer: renderAnswer(topic, frame),
    suggestedFollowUps: [
      `Which local evidence should I use for ${topic.label}?`,
      `Turn this into a recruiter-ready draft for ${topic.label}.`,
      `What is the highest-risk assumption around ${topic.label}?`,
    ],
    caveats: [
      'This answer is a deterministic local playbook response, not personalized evidence from an indexed source.',
      'For role-specific advice, index the job description and resume first.',
    ],
  })));
}

export const CAREER_COACH_PLAYBOOK = Object.freeze(buildPlaybook());

export const CAREER_COACH_QUESTION_BANK = Object.freeze(
  CAREER_COACH_PLAYBOOK.map((entry) => entry.question),
);

const EXACT_QUESTION_INDEX = new Map(
  CAREER_COACH_PLAYBOOK.map((entry) => [normalizeQuestion(entry.question), entry]),
);

function normalizeQuestion(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function tokens(value: string) {
  return new Set(
    normalizeQuestion(value)
      .split(' ')
      .filter((token) => token.length > 2 && !['the', 'and', 'for', 'with', 'from', 'what', 'how', 'should', 'about'].includes(token)),
  );
}

function overlapScore(question: string, candidate: string) {
  const source = tokens(question);
  const target = tokens(candidate);
  if (source.size === 0 || target.size === 0) return 0;
  let overlap = 0;
  for (const token of source) {
    if (target.has(token)) overlap += 1;
  }
  return overlap / Math.max(source.size, target.size);
}

export function getQuestionBank(limit = CAREER_COACH_QUESTION_BANK.length) {
  return CAREER_COACH_QUESTION_BANK.slice(0, Math.max(0, Math.min(limit, CAREER_COACH_QUESTION_BANK.length)));
}

export function getQuestionPlaybook(limit = CAREER_COACH_PLAYBOOK.length) {
  return CAREER_COACH_PLAYBOOK.slice(0, Math.max(0, Math.min(limit, CAREER_COACH_PLAYBOOK.length)));
}

export function findQuestionBankAnswer(question: string): CareerCoachPlaybookEntry | null {
  const normalized = normalizeQuestion(question);
  const exact = EXACT_QUESTION_INDEX.get(normalized);
  if (exact) return exact;

  let best: { entry: CareerCoachPlaybookEntry; score: number } | null = null;
  for (const entry of CAREER_COACH_PLAYBOOK) {
    const score = overlapScore(question, entry.question);
    if (!best || score > best.score) best = { entry, score };
  }

  return best && best.score >= 0.45 ? best.entry : null;
}

export function getContextualQuestionSuggestions(options: { hasJob: boolean; hasResume: boolean; hasAtsReport: boolean }, limit = 8) {
  const preferred = CAREER_COACH_PLAYBOOK.filter((entry) => {
    if (options.hasJob && ['job-fit', 'research', 'interview', 'market', 'pipeline'].includes(entry.group)) return true;
    if (options.hasAtsReport && ['ats', 'skills'].includes(entry.group)) return true;
    if (options.hasResume && ['resume', 'profile', 'positioning', 'story', 'proof'].includes(entry.group)) return true;
    return false;
  }).map((entry) => entry.question);
  const combined = [...preferred, ...CAREER_COACH_QUESTION_BANK];
  return Array.from(new Set(combined)).slice(0, limit);
}
