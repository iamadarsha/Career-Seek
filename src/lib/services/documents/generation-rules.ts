/**
 * Master generation rules embedded into every resume and cover letter AI call.
 *
 * These rules govern truthfulness, tailoring, ATS compliance, style, and
 * quality control.  They are injected at the top of every prompt so the AI
 * operates under these constraints for every generation attempt.
 */

export const MASTER_GENERATION_RULES = `
========================
NON-NEGOTIABLE RULES — READ BEFORE GENERATING ANYTHING
========================

A. TRUTH AND ACCURACY (MOST IMPORTANT)
- The reference resume/CV is the ONLY source of truth for the candidate's background.
- NEVER invent experience, job titles, dates, employers, projects, certifications, education, awards, tools, responsibilities, impact, metrics, or achievements.
- NEVER add numbers, percentages, revenue impact, team sizes, timelines, or leadership scope unless they are explicitly present in the reference resume/CV text provided.
- NEVER infer facts that are not clearly supported by the source material.
- If the JD asks for something the candidate does not clearly have, position adjacent or transferable experience honestly — do NOT fabricate it.
- Preserve chronology accurately.
- Preserve employer names, role titles, dates, and locations EXACTLY as they appear in the source.
- If any source detail is unclear, mark it as [NEEDS USER CONFIRMATION] instead of guessing.

B. TAILORING
- Tailor output specifically to the provided JD.
- Prioritise the most relevant experience, skills, tools, domain exposure, achievements, and keywords from the JD.
- Reorder bullet points so the most JD-relevant evidence appears first under each role.
- Rewrite bullets for clarity, impact, and keyword alignment WITHOUT changing the underlying facts.
- Reflect both hard skills and soft skills requested in the JD when supported by the reference resume/CV.
- Use the JD's terminology where truthful and contextually correct.

C. ATS OPTIMISATION
- Use standard headings: Summary, Skills, Experience, Education, Certifications, Projects, Tools.
- Avoid tables, text boxes, multi-column layouts, icons, graphics, and decorative formatting.
- Naturally incorporate relevant JD keywords, phrases, competencies, and tool names where they accurately match the candidate's real background.
- Do NOT keyword-stuff.
- Ensure readability by both ATS systems and human recruiters.

D. STYLE
- Write in concise, professional, specific language.
- Use strong action verbs.
- Prefer measurable outcomes ONLY when already supported by the reference resume/CV.
- Avoid generic filler such as "hardworking," "team player," or "results-driven" unless backed by evidence.
- Keep tone aligned to the target role and industry.

E. OUTPUT DISCIPLINE
- Do NOT produce vague advice instead of final deliverables.
- Do NOT only critique — produce the final polished document.
- Do NOT remove important evidence from the source unless it is clearly irrelevant and brevity was requested.
- Keep all edits intentional and explainable.

========================
QUALITY CONTROL CHECKLIST (run before finalising output)
========================
1. Truth check: no invented facts.
2. Date check: no changed or invented chronology.
3. Title check: no inflated designations.
4. Metrics check: no invented numbers, percentages, or impact claims.
5. Keyword check: important JD terms included naturally, only where supported.
6. ATS check: plain formatting, standard headings, no complex layout elements.
7. Relevance check: strongest matching evidence appears early.
8. Readability check: concise, skimmable, recruiter-friendly.
9. Consistency check: terminology, tense, punctuation, and formatting consistent throughout.
10. Gap check: missing JD requirements are acknowledged via transferable skills, never fabricated.

========================
STRICT WRITING RULES
========================
- Never fabricate.
- Never overclaim.
- Never use unsupported metrics.
- Never rewrite facts into stronger claims than the source justifies.
- Do not hide missing requirements — address them honestly through transferable skills where possible.
- Use exact source wording for sensitive factual details (names, dates, titles, institutions).
- Improve phrasing ONLY when meaning remains unchanged.
- Maintain a professional tone suitable for hiring managers and recruiters.

========================
IF INFORMATION IS MISSING
========================
If the source resume/CV or JD is incomplete:
- State what is missing.
- Insert [NEEDS USER CONFIRMATION] where necessary.
- Continue with the strongest truthful version possible from available material.
`.trim();

/**
 * Compact ruleset injected into the cover letter prompt.
 * Same rules as above, phrased specifically for cover letters.
 */
export const COVER_LETTER_RULES = `
========================
COVER LETTER RULES — NON-NEGOTIABLE
========================

A. TRUTH
- Write ONLY from facts present in the provided candidate profile and raw resume text.
- NEVER invent employers, achievements, skills, metrics, titles, tools, or experience.
- Every claim must be traceable to the source material provided.
- Do NOT round up or exaggerate any metric.

B. TARGETING
- The cover letter must directly address the specific company and role.
- Reflect the top 3–5 JD priorities using only verified candidate facts.
- Demonstrate genuine motivation and fit — avoid formulaic, generic phrasing.
- Use the JD's language and terminology where truthfully applicable.

C. STRUCTURE & STYLE
- Do NOT open with "I am writing to express my interest in..." — start with a strong, specific hook.
- 3–4 paragraphs maximum. Each paragraph must earn its place.
- Opening: hook + role-specific relevance.
- Body: 2–3 key proof points directly mapped to JD priorities.
- Close: clear expression of interest + next step.
- Professional, confident, achievement-led voice. No clichés.

D. QUALITY CHECKS BEFORE FINALISING
1. No invented facts, metrics, or unsupported claims.
2. Candidate name, company name, and role title correct.
3. Every paragraph connects a JD priority to a verified candidate strength.
4. No metric appears that was not present in the source material.
5. Letter is specific enough that it could not be sent to a different company unchanged.
6. Tone is warm and professional — not robotic or overly formal.
`.trim();
