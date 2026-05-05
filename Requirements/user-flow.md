# Career Ops India — User Flow

> Step-by-step guide for how Adarsha uses this system day-to-day.

---

## Daily Workflow (10 minutes)

```
Morning routine (10 min)
│
├── 1. Open dashboard
│      npm run dashboard → http://localhost:3030
│
├── 2. Check Tier A jobs
│      Filter → "Tier A" tab
│      Review new jobs (score ≥ 75)
│
├── 3. For each promising job:
│      a. Click [🔍 Brief] → read Gemini fit analysis
│      b. Click [📄 Resume] → download tailored DOCX
│      c. Click [✉ Cover Letter] → download cover letter
│      d. Click [🤝 Connect] → copy LinkedIn outreach note
│      e. Click [Apply →] → open portal in new tab and apply
│      f. Click [✓ Applied] → mark as applied
│
└── 4. (Optional) If stale data, click [Refresh] for fresh scan
```

---

## Feature Flows in Detail

---

### Flow 1 — Open the Dashboard

```
Terminal:
  cd ~/Documents/Career\ Hub/career-ops-india
  npm run dashboard

Browser opens (or navigate to):
  http://localhost:3030

Dashboard loads:
  ✓ Stats grid — total jobs, Tier A count, apply-today count, avg score
  ✓ Filter tabs — All / Tier A / Tier B / Tier C / portal filters
  ✓ Job cards — sorted by matchScore descending
  ✓ Last scan timestamp shown in header
```

---

### Flow 2 — Run a Fresh Scan

**Option A: From dashboard (recommended)**
```
Click [Refresh] button in header
  → Dashboard sends POST /api/scan
  → Scan progress panel appears (bottom-right)
  → Shows live log: "Scraping job portals…" → "Scoring matches…"
  → ~10–30 minutes depending on portal responsiveness
  → On complete: "✅ Scan complete!" → page auto-reloads in 2.5s
  → New jobs appear
```

**Option B: From terminal**
```bash
npm run scan:full     # all scrapers + scoring
npm run scan:india    # primary portals only (faster)
npm run score         # re-score existing raw jobs
```

**Scan phases:**
```
Phase 1: jobs — Playwright scrapes 7 primary portals
Phase 2: score — match-engine scores all new jobs
Phase 3: done — dashboard reloads
```

---

### Flow 3 — Filter and Search Jobs

**By tier:**
```
Click tab: [Tier A] → shows only score ≥ 75 jobs
Click tab: [Tier B] → shows 55–74
Click tab: [All]    → shows everything
```

**By portal:**
```
Click: [LinkedIn] → only LinkedIn jobs
Click: [Naukri]   → only Naukri jobs
Click: [All]      → reset
```

**AI Natural Language Search:**
```
Type in search bar: "fintech AI product roles in Bangalore"
  → Sends query + job list to Gemini
  → Gemini returns matched job IDs in relevance order
  → Dashboard highlights matching cards
  → Shows explanation: "Matched 12 jobs based on fintech + Bangalore + AI criteria"
```

---

### Flow 4 — Get AI Job Brief

```
On a job card, click [🔍 Brief]
  → Button shows "Analysing…"
  → Toast: "Gemini is analysing this role… (~8s)"
  → Sends POST /api/ai-brief { jobId }
  → Gemini returns structured brief

Brief panel expands with:
  ┌──────────────────────────────────────────────────┐
  │ Fit Assessment                                   │
  │ ● 82/100 — Strong match on LLM product ownership │
  ├──────────────────────────────────────────────────┤
  │ Why Apply                                        │
  │ • Strong alignment with RAG experience required  │
  │ • BreakoutScan directly relevant to fintech scope│
  │ • Salary band matches ₹25–35 LPA target          │
  ├──────────────────────────────────────────────────┤
  │ ⚠ Watch Out                                      │
  │ • Role requires team management (not in profile) │
  ├──────────────────────────────────────────────────┤
  │ Interview Angle                                  │
  │ Lead with FilingLens RAG architecture — directly │
  │ mirrors their "AI for financial data" mandate    │
  ├──────────────────────────────────────────────────┤
  │ Salary Estimate                                  │
  │ ₹28–38 LPA for this level at this company        │
  └──────────────────────────────────────────────────┘

Click [🔍 Brief] again → panel collapses
(Brief is cached — reopening is instant)
```

---

### Flow 5 — Generate Tailored Resume

```
On a job card, click [📄 Resume]
  → Button shows "Generating resume…"
  → Toast: "Analysing JD and tailoring resume… (~15s)"
  → Sends POST /api/resume-build { jobId }

Server-side (3 stages):
  Stage 1: Gemini analyses JD (~7s)
    - Extracts top 15–20 ATS keywords
    - Generates tailored summary, tagline, skills, experience bullets, projects
    - Returns initial ATS estimate (0–100)

  Stage 2: Build DOCX (~2s)
    - Exact format: Calibri, centered ALL CAPS name, 7 sections
    - Section headers: ALL CAPS bold + bottom border
    - Skills: 9 categories with bold labels
    - Portfolio: project names as live hyperlinks
    - Expertise cloud: dense keyword paragraph

  Stage 3: ATS Verification (~5s)
    - Gemini re-reads generated DOCX + original JD
    - Returns: atsScore (0–100), keywordsFound[], keywordsMissing[], verdict
    - Saves *-analysis.json alongside DOCX

Browser:
  → File auto-downloads: "Adarsha-Chatterjee-PhonePe-AI-Product-Manager-2026-04-23.docx"
  → Toast: "Resume downloaded: Adarsha-Chatterjee-PhonePe-AI-Product-Manager-2026-04-23.docx"

Output files:
  output/resumes/Adarsha-Chatterjee-{Company}-{Role}-{date}.docx
  output/resumes/Adarsha-Chatterjee-{Company}-{Role}-{date}-analysis.json
```

---

### Flow 6 — Generate Cover Letter

```
On a job card, click [✉ Cover Letter]
  → Button shows "Generating cover letter…"
  → Toast: "Writing cover letter… (~10s)"
  → Sends POST /api/cover-letter-build { jobId }

Gemini (temp 0.85):
  - 3 paragraphs in Adarsha's authentic voice
  - Angle selected from job's coverAngle field:
      fintech      → leads with BreakoutScan / FilingLens SEBI experience
      b2b_saas     → leads with Bhukkad (GDG finalist, 6-module platform)
      enterprise_ai → leads with TCS + enterprise AI product strategy
      startup_ai   → leads with builder narrative + speed to market
  - Anti-AI-detection:
      • Varied sentence lengths (not all long)
      • Personal anecdotes (not clichés)
      • No "I am excited to apply for..." openers
      • No "leverage", "synergy", "dynamic team" phrases

Browser:
  → File auto-downloads: "Adarsha-Chatterjee-PhonePe-AI-Product-Manager-CoverLetter-2026-04-23.docx"
```

---

### Flow 7 — LinkedIn Outreach

```
On a job card, click [🤝 Connect]
  → Button shows "Drafting…"
  → Toast: "Gemini is writing your outreach note… (~5s)"
  → Sends POST /api/linkedin-outreach { jobId }

Gemini (temp 0.85):
  - Max 3 sentences, ~300 characters
  - Mentions something specific about company/role
  - References most relevant project (BreakoutScan / FilingLens / SpeakFlo)
  - Warm, personal tone — not a template

Outreach panel expands (purple accent):
  ┌──────────────────────────────────────────────────┐
  │ 🤝 LinkedIn Connection Note for PhonePe          │
  │                                                  │
  │ "Loved reading about PhonePe's AI-first          │
  │  roadmap — your approach to contextual payments  │
  │  reminded me of challenges I solved building     │
  │  FilingLens, a RAG system for 22k+ SEBI filings. │
  │  Would love to connect!"                         │
  │                                                  │
  │ [📋 Copy to clipboard]                           │
  └──────────────────────────────────────────────────┘

Click [📋 Copy to clipboard]
  → Button changes to "✅ Copied!" for 2s
  → Paste directly into LinkedIn connection modal

Next: find hiring manager on LinkedIn → send connection with this note
```

---

### Flow 8 — Mark as Applied

```
After submitting an application, click [✓ Applied] on the job card

First click (not applied → applied):
  → Card turns to 75% opacity (visual indicator it's done)
  → Button fills green: solid green background
  → Saves to data/applied.json:
    {
      "naukri-abc123": {
        "title": "AI Product Manager",
        "company": "PhonePe",
        "url": "https://naukri.com/...",
        "appliedAt": "2026-04-23T08:30:00Z"
      }
    }
  → Toast: "Marked as applied! 7 total applied."

Second click (applied → undo):
  → Card returns to full opacity
  → Button returns to outline style
  → Removed from applied.json
  → Toast: "Removed from applied list."

On page reload:
  → loadAppliedState() fetches GET /api/applied
  → All applied cards automatically show correct state
```

---

## CLI Flows (Advanced)

### Generate Resume from CLI

```bash
# Using job ID from database
node scripts/resume-builder.mjs --job-id naukri-abc123

# Paste job description directly
node scripts/resume-builder.mjs --jd "We are looking for an AI Product Manager..."

# With debug logging
node scripts/resume-builder.mjs --job-id naukri-abc123 --debug
```

Output in terminal:
```
📋 Analysing JD with Gemini…
✅ JD analysis complete — ATS estimate: 85/100
📄 Building DOCX…
✅ DOCX saved: output/resumes/Adarsha-Chatterjee-PhonePe-AI-Product-Manager-2026-04-23.docx
🔍 Verifying ATS score…
✅ ATS verification: 92/100 — STRONG MATCH
   Keywords found: RAG, LLM, Product Roadmap, Python, API...
   Keywords missing: none critical
   Verdict: Excellent match. Submit with confidence.
```

---

## Error States

| Situation | What happens |
|-----------|-------------|
| Gemini API key missing | Toast: "GEMINI_API_KEY not set"; API returns 503 |
| Job ID not found | Toast: "Job {id} not found"; API returns 404 |
| Gemini timeout (>20s) | Toast shows error; button re-enables |
| Scan fails mid-run | Progress panel shows ❌ error; Retry button shown |
| DOCX generation fails | Toast: "Resume error: {message}"; button re-enables |
| Clipboard API unavailable | User sees the text, copies manually |

---

## Applied Jobs Tracking Reference

View all applied jobs:
```bash
cat data/applied.json | node -e "
  const d = JSON.parse(require('fs').readFileSync('/dev/stdin','utf8'));
  Object.values(d).forEach(j => console.log(j.appliedAt.slice(0,10), j.company, '-', j.title));
"
```

Or via API:
```bash
curl http://localhost:3030/api/applied | python3 -m json.tool
```
