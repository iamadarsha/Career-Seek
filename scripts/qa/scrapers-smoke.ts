import dotenv from 'dotenv';
import { buildDefaultScraperManager } from '../../src/lib/services/scraping/scraper-manager';
import { normalize, suggestRelated } from '../../src/lib/services/skills/taxonomy';
import { getQuestionBank, getQuestionPlaybook } from '../../src/lib/services/coach/question-bank';

dotenv.config({ path: '.env.local' });
dotenv.config();

async function main() {
  const manager = buildDefaultScraperManager();
  const providers = await manager.health();
  const js = normalize('JS');
  const related = suggestRelated('JavaScript', 3);
  const questions = getQuestionBank();
  const playbook = getQuestionPlaybook();

  if (!js || js.label !== 'JavaScript') {
    throw new Error('ESCO-lite normalization failed for JS -> JavaScript.');
  }
  if (questions.length < 250) {
    throw new Error(`Expected at least 250 coach question-bank prompts, got ${questions.length}.`);
  }
  if (playbook.length < 250 || !playbook.every((entry) => entry.question && entry.answer)) {
    throw new Error(`Expected at least 250 coach playbook Q&A entries, got ${playbook.length}.`);
  }

  console.log(JSON.stringify({
    success: true,
    providers,
    taxonomy: {
      js: js.label,
      related: related.map((skill) => skill.label),
    },
    questionBank: questions.length,
    questionAnswerPlaybook: playbook.length,
  }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
