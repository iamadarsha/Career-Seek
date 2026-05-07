/**
 * TF-IDF Cosine Similarity Scorer
 *
 * Ported from Resume-Matcher's vector scoring approach.
 * Computes token-level TF-IDF vectors for two text strings and returns
 * a cosine similarity score in [0, 1].
 *
 * Used by the scoring engine to compute a semantic match bonus on top of
 * the existing rule-based keyword overlap.
 *
 * No external dependencies — pure TypeScript math.
 */

// ─── Stopwords (English + common resume filler) ───────────────────────────────
const STOPWORDS = new Set([
  'a','an','the','and','or','but','in','on','at','to','for','of','with',
  'is','are','was','were','be','been','being','have','has','had','do','does',
  'did','will','would','could','should','may','might','shall','can',
  'i','we','you','he','she','it','they','this','that','these','those',
  'from','by','as','if','then','than','so','yet','both','either',
  'each','any','all','both','few','more','most','other','some','such',
  'only','own','same','too','very','just','because','while','although',
  'our','your','my','their','its','his','her','which','who','whom',
  'what','when','where','how','why',
  // Resume filler words that add no signal
  'experience','years','year','strong','good','excellent','proficient',
  'knowledge','understanding','ability','skills','team','work','worked',
  'using','use','used','including','etc','eg','ie','role','roles',
]);

// ─── Tokenizer ────────────────────────────────────────────────────────────────

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9#+.\s]/g, ' ')
    // Keep common tech tokens like c++, .net, node.js
    .replace(/\s+/g, ' ')
    .trim()
    .split(' ')
    .filter((token) => token.length >= 2 && !STOPWORDS.has(token));
}

// ─── TF-IDF ───────────────────────────────────────────────────────────────────

function termFrequency(tokens: string[]): Map<string, number> {
  const freq = new Map<string, number>();
  for (const token of tokens) {
    freq.set(token, (freq.get(token) || 0) + 1);
  }
  const total = tokens.length || 1;
  for (const [token, count] of freq) {
    freq.set(token, count / total);
  }
  return freq;
}

function inverseDocumentFrequency(docs: string[][]): Map<string, number> {
  const docCount = docs.length;
  const tokenDocCount = new Map<string, number>();
  for (const doc of docs) {
    const unique = new Set(doc);
    for (const token of unique) {
      tokenDocCount.set(token, (tokenDocCount.get(token) || 0) + 1);
    }
  }
  const idf = new Map<string, number>();
  for (const [token, count] of tokenDocCount) {
    idf.set(token, Math.log((docCount + 1) / (count + 1)) + 1); // smoothed
  }
  return idf;
}

function tfidfVector(tokens: string[], idf: Map<string, number>): Map<string, number> {
  const tf = termFrequency(tokens);
  const vec = new Map<string, number>();
  for (const [token, tfVal] of tf) {
    vec.set(token, tfVal * (idf.get(token) || 1));
  }
  return vec;
}

function cosineSimilarity(vecA: Map<string, number>, vecB: Map<string, number>): number {
  let dot = 0;
  let magA = 0;
  let magB = 0;

  for (const [token, valA] of vecA) {
    const valB = vecB.get(token) || 0;
    dot += valA * valB;
    magA += valA * valA;
  }
  for (const [, valB] of vecB) {
    magB += valB * valB;
  }

  const denom = Math.sqrt(magA) * Math.sqrt(magB);
  return denom === 0 ? 0 : dot / denom;
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Compute TF-IDF cosine similarity between two texts.
 * Returns a float in [0, 1] where 1 = identical token distribution.
 */
export function textSimilarity(textA: string, textB: string): number {
  if (!textA || !textB) return 0;
  const tokensA = tokenize(textA);
  const tokensB = tokenize(textB);
  if (tokensA.length === 0 || tokensB.length === 0) return 0;

  const idf = inverseDocumentFrequency([tokensA, tokensB]);
  const vecA = tfidfVector(tokensA, idf);
  const vecB = tfidfVector(tokensB, idf);
  return Math.min(1, cosineSimilarity(vecA, vecB));
}

/**
 * Convert a [0, 1] similarity score to a 0–20 point bonus for use in the
 * scoring engine (keeps the existing 0–100 range unchanged).
 *
 * Curve: score < 0.15 → 0 pts (noise), 0.15–0.35 → linear 0–10, > 0.35 → linear 10–20
 */
export function similarityToBonus(similarity: number): number {
  if (similarity < 0.15) return 0;
  if (similarity < 0.35) return Math.round(((similarity - 0.15) / 0.20) * 10);
  return Math.round(10 + ((similarity - 0.35) / 0.65) * 10);
}

/**
 * Convenience wrapper used by the scoring engine.
 * Compares resume text against job snippet + title.
 * Returns an integer bonus in [0, 20].
 */
export function computeResumeJobSimilarityBonus(resumeText: string, jobText: string): number {
  const sim = textSimilarity(resumeText, jobText);
  return similarityToBonus(sim);
}
