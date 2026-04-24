# Career Ops India — Project Flow

> How data moves through the system from scrape to application.

---

## End-to-End Pipeline Flow

```
┌──────────────┐    ┌──────────────┐    ┌──────────────┐    ┌──────────────┐
│   SCRAPE     │───▶│    SCORE     │───▶│    REVIEW    │───▶│   GENERATE   │
│  (Playwright)│    │   (Gemini +  │    │  (Dashboard) │    │ (Gemini +    │
│  12 portals  │    │  rule-based) │    │  localhost   │    │  DOCX lib)   │
│  275 cos     │    │              │    │  :3030       │    │              │
└──────────────┘    └──────────────┘    └──────────────┘    └──────────────┘
       │                   │                   │                   │
       ▼                   ▼                   ▼                   ▼
 india-jobs-raw       india-jobs-         Browser UI          output/
   .json               scored.json       + filters           resumes/
                                         + AI search         + cover-letters/
```

---

## Stage 1 — Scrape

### Trigger
```bash
npm run scan:full
# or from the dashboard: click "Refresh" button
```

### What Happens

```
scrapers/india-jobs.mjs
  └── For each portal (LinkedIn, Naukri, Foundit, Indeed, Wellfound, Monster, Instahyre):
        ├── Launch Playwright (real Chrome channel)
        ├── Navigate to search URL with encoded query
        ├── Wait for job cards to render (JS-heavy pages)
        ├── Extract: title, company, location, salary, experience, snippet, url, postedDate
        ├── Apply client-side experience filter (2–6 years only)
        └── Push to rawJobs[]

scrapers/extended-portals.mjs
  └── TimesJobs, Shine, Hirist, Cutshort, iimjobs
        ├── Playwright + fallback to Gemini page analysis for dynamic pages
        └── Same job schema, appended to rawJobs[]

scrapers/company-careers.mjs
  └── Load data/company-careers-list.csv (275 companies)
        ├── For each company: navigate careers page
        ├── Gemini analyses page HTML → extracts matching job listings
        └── Appended to rawJobs[]
```

### Deduplication
Each job gets a composite ID: `portal-hash(title+company)`. On merge into `india-jobs-raw.json`, existing IDs are skipped. New jobs are appended, never re-ordered.

### Output
`data/india-jobs-raw.json` — array of job objects:
```json
{
  "id": "naukri-abc123",
  "portal": "naukri",
  "title": "AI Product Manager",
  "company": "PhonePe",
  "location": "Bangalore",
  "salary": "₹30–40 LPA",
  "experience": "3–6 years",
  "snippet": "...",
  "url": "https://...",
  "postedDate": "2d ago",
  "scrapedAt": "2026-04-23T..."
}
```

---

## Stage 2 — Score

### Trigger
```bash
npm run score
# Automatically follows scrape when using npm run pipeline
```

### Scoring Formula

```
matchScore = titleMatch (max 40)
           + companyTier (max 20)
           + salaryMatch (max 15)
           + locationMatch (max 15)
           + keywordOverlap (max 5)
           + geminiBonus (max 5)
           ─────────────────────
           = 0–100
```

### Tier Thresholds

| Tier | Score Range | Meaning |
|------|-------------|---------|
| A | ≥ 75 | Apply today |
| B | 55–74 | Apply within 3 days |
| C | 35–54 | Review / stretch |
| D | < 35 | Skip |

### Gemini Enrichment (per job, rate-limited)
For each job, Gemini returns:
- `fitSummary` — one-sentence fit analysis
- `geminiBonus` — 0–5 additional points
- `coverAngle` — `fintech | b2b_saas | enterprise_ai | startup_ai`
- `keywordMatch` — top matching keywords

### Output
`data/india-jobs-scored.json` — same array with added fields:
```json
{
  "matchScore": 82,
  "tier": "A",
  "scoreBreakdown": {
    "titleMatch": 35,
    "companyTier": 15,
    "salaryMatch": 12,
    "locationMatch": 10,
    "keywordOverlap": 5,
    "geminiBonus": 5
  },
  "geminiInsights": {
    "fitSummary": "Strong match on LLM product ownership...",
    "keywordMatch": ["RAG", "LLM", "product roadmap"],
    "coverAngle": "fintech"
  }
}
```

---

## Stage 3 — Review (Dashboard)

### Trigger
```bash
npm run dashboard
# Opens: http://localhost:3030
```

### What the User Sees

```
Header
  ├── Title + last scan time
  └── [Refresh] button → triggers Stage 1+2 live, shows progress log

Stats Grid
  ├── Total jobs
  ├── Tier A count
  ├── Tier B count
  └── Average score

AI Search Bar
  └── Natural language → Gemini finds matching jobs

Filter Tabs
  └── All | Tier A | Tier B | Tier C | LinkedIn | Naukri | Foundit | ...

Job Cards (sorted by matchScore desc)
  ├── Title · Company · Score ring · Tier badge
  ├── Location · Salary · Experience · Portal · Date
  ├── Snippet + Gemini fit summary
  └── Actions:
        ├── [Apply →]          Opens portal URL in new tab
        ├── [🔍 Brief]         Gemini full fit analysis panel
        ├── [📄 Resume]        Triggers Stage 4 → downloads DOCX
        ├── [✉ Cover Letter]   Triggers Stage 4 → downloads DOCX
        ├── [🤝 Connect]       Gemini LinkedIn connection note
        └── [✓ Applied]        Marks job in data/applied.json
```

---

## Stage 4 — Generate

### Resume Flow (3 stages)

```
User clicks [📄 Resume] on dashboard
      │
      ▼
POST /api/resume-build { jobId }
      │
      ▼
Stage 1 — analyseJDWithGemini()
  ├── Fetch job from india-jobs-scored.json
  ├── Call Gemini (temp 0.3, 4096 tokens)
  ├── Returns: tailoredTagline, tailoredSummary, tailoredSkills (9 cats),
  │           tailoredExperience, tailoredProjects, highlightProjects,
  │           topKeywords, atsScore (0–100), coverAngle
  └── Normalize atsScore (if Gemini returns 0.85 → multiply × 100)
      │
      ▼
Stage 2 — buildDocx()
  ├── docx library (Calibri font throughout)
  ├── Name: centered, ALL CAPS, 28pt bold
  ├── Tagline: centered, pipe-separated, 11pt
  ├── Contact: centered, 9pt with hyperlinks
  ├── 7 sections (ALL CAPS headers with bottom border):
  │     1. PROFESSIONAL SUMMARY
  │     2. CORE COMPETENCIES & TECHNICAL SKILLS (9 categories)
  │     3. PROFESSIONAL EXPERIENCE
  │     4. AI PRODUCT PORTFOLIO (project names as hyperlinks)
  │     5. EDUCATION
  │     6. CERTIFICATIONS & RECOGNITION
  │     7. AREAS OF EXPERTISE (keyword cloud)
  └── Save to output/resumes/Adarsha-Chatterjee-{Company}-{Role}-{date}.docx
      │
      ▼
Stage 3 — verifyATSScore()
  ├── Call Gemini again (temp 0.1) with DOCX content + JD
  ├── Returns: atsScore (0–100), keywordsFound[], keywordsMissing[], verdict
  └── Save analysis to output/resumes/*-analysis.json
      │
      ▼
HTTP response: DOCX binary → browser downloads file automatically
```

### Cover Letter Flow

```
User clicks [✉ Cover Letter]
      │
      ▼
POST /api/cover-letter-build { jobId }
      │
      ▼
Gemini (temp 0.85)
  ├── Generates 3-paragraph letter in Adarsha's voice
  ├── Anti-AI-detection: varied sentence lengths, personal anecdotes, no buzzword openers
  ├── Uses coverAngle from scoring (fintech / b2b_saas / enterprise_ai / startup_ai)
  └── Builds DOCX → downloads
```

### LinkedIn Outreach Flow

```
User clicks [🤝 Connect]
      │
      ▼
POST /api/linkedin-outreach { jobId }
      │
      ▼
Gemini (temp 0.85)
  ├── Max 3 sentences, 300 characters
  ├── References one relevant project (BreakoutScan / FilingLens / SpeakFlo)
  ├── Mentions something specific about the company/role
  └── Returns message text → shown in inline panel with Copy button
```

---

## Data Flow Summary

```
Scrape → india-jobs-raw.json
Score  → india-jobs-scored.json (adds matchScore, tier, geminiInsights)
Apply  → data/applied.json (toggle tracker, persisted per job)
Resume → output/resumes/*.docx + *-analysis.json
Letter → output/cover-letters/*.docx
```

---

## NPM Script Reference

| Script | What it does |
|--------|-------------|
| `npm run scan:india` | Scrape 7 primary portals |
| `npm run scan:extended` | Scrape 5 niche portals |
| `npm run scan:careers` | Scrape 275 company career pages |
| `npm run scan:full` | All three scrapers sequentially |
| `npm run score` | Score all unscored jobs |
| `npm run dashboard` | Start dashboard at :3030 |
| `npm run resume` | CLI resume builder (--job-id or --jd) |
| `npm run cover-letter` | CLI cover letter builder |
| `npm run apply:today` | Generate apply-queue.md for Tier A |
| `npm run pipeline` | scan:india → score → apply:today |
