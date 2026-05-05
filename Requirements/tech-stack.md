# Career Ops India — Tech Stack

> Every dependency, API, and runtime decision used in the system.

---

## Runtime

| Layer | Technology | Version | Notes |
|-------|-----------|---------|-------|
| Runtime | Node.js | 20+ (LTS) | ESM modules only (`"type": "module"`) |
| Package manager | npm | — | `package-lock.json` committed |
| Module format | ES Modules | — | All files use `.mjs` extension |

---

## Core Dependencies

### `docx` — DOCX Generation
```
"docx": "^9.6.1"
```
Used exclusively in `scripts/resume-builder.mjs` and `scripts/cover-letter-builder.mjs`.

**Primitives used:**
| Class | Purpose |
|-------|---------|
| `Document` | Root document object |
| `Packer` | Serializes Document → Buffer |
| `Paragraph` | Every line / section |
| `TextRun` | Inline text with formatting |
| `ExternalHyperlink` | Clickable URLs in portfolio section |
| `AlignmentType` | `CENTER` for name/tagline/contact |
| `BorderStyle` | `SINGLE` for section header bottom borders |
| `LineRuleType` | Line spacing control |
| `convertInchesToTwip` | Margin helper |

**Font:** Calibri throughout. All sizes in half-points (e.g., 56 = 28pt).

---

### `playwright` — Web Scraping
```
"playwright": "^1.58.1"
```
Used in all 3 scrapers. Configured with real Chrome binary (`channel: 'chrome'`) to bypass Indian portal bot detection (Naukri, Foundit use fingerprinting that blocks headless Chromium).

**Key config:**
```js
browser = await chromium.launch({
  channel: 'chrome',       // real Chrome, not Chromium
  headless: true,
  args: ['--no-sandbox', '--disable-blink-features=AutomationControlled']
});
```

**Stealth helpers** (`stealth-config.mjs`):
- User-agent pool rotation (20+ real Chrome UAs)
- Jitter delays between requests (800–3000ms randomized)
- `navigator.webdriver` spoofing via `page.addInitScript()`

---

### `js-yaml` — YAML Parsing
```
"js-yaml": "^4.1.1"
```
Used to parse `config/profile.yml`, `portals.yml`, `templates/states.yml`.

---

### `crawlee` — Optional Crawler Framework
```
"crawlee": "^3.x"  (optionalDependencies)
```
Available but not actively used in the current India pipeline. Included for potential future batch crawling.

---

## AI / External APIs

### Gemini 2.0 Flash
**Endpoint:** `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent`
**Auth:** `?key=GEMINI_API_KEY` query parameter
**Client:** Native `fetch()` — no SDK

**Temperature guide by feature:**

| Feature | Temperature | Reason |
|---------|-------------|--------|
| ATS verification | 0.1 | Deterministic keyword check |
| Resume tailoring (JD analysis) | 0.3 | Structured, accurate tailoring |
| Job scoring (Gemini bonus) | 0.7 | Balanced fit assessment |
| Cover letter | 0.85 | Natural, human-sounding prose |
| LinkedIn outreach | 0.85 | Warm, personal tone |
| AI brief | 0.3 | Honest, structured analysis |
| AI search | 0.2 | Precise relevance matching |

**Max tokens by feature:**

| Feature | maxOutputTokens |
|---------|----------------|
| Resume JD analysis | 4096 |
| ATS verification | 1024 |
| AI brief | 1024 |
| AI search | 1024 |
| Cover letter | 2048 |
| LinkedIn outreach | 200 |

**Timeouts:** All Gemini calls use `AbortSignal.timeout(20000)` except resume analysis (45000ms).

---

## HTTP Server

**No framework — native `node:http` only.**

```js
import { createServer } from 'http';
const server = createServer((req, res) => { ... });
server.listen(PORT);  // default 3030
```

**Route dispatch:** Simple `if (url.pathname === '/api/...')` blocks — no router.

**Response types:**
- HTML: `Content-Type: text/html; charset=utf-8`
- JSON: `Content-Type: application/json`
- DOCX: `Content-Type: application/vnd.openxmlformats-officedocument.wordprocessingml.document`
- File download: `Content-Disposition: attachment; filename="..."`

---

## Data Storage

**Flat JSON files — no database, no ORM.**

| File | Format | Purpose |
|------|--------|---------|
| `data/india-jobs-raw.json` | `Job[]` | All scraped jobs |
| `data/india-jobs-scored.json` | `ScoredJob[]` | Scored + ranked |
| `data/india-scan-history.json` | `ScanRun[]` | Scan history |
| `data/applied.json` | `{ [jobId]: AppliedEntry }` | Application tracker |
| `data/company-careers-list.csv` | CSV | 275 companies with portal URLs |

**Read strategy:** Files are read fresh on each request (`readFileSync` inside route handlers, not cached in module scope — ensures stale data is never served after a scan).

---

## Child Process Management

Scans triggered from the dashboard use `child_process.spawn` to run scraper scripts as child processes, keeping the HTTP server alive:

```js
import { spawn } from 'child_process';

const child = spawn('node', ['scrapers/india-jobs.mjs'], {
  cwd: ROOT,
  env: { ...process.env }
});
child.stdout.on('data', d => _scan.log.push(d.toString().trim()));
child.on('close', code => { /* chain to scorer */ });
```

Progress is polled by the client every 2 seconds via `GET /api/scan-status`.

---

## Frontend (Dashboard UI)

The dashboard is **server-rendered HTML** — no React, no build step, no bundler.

| Feature | Implementation |
|---------|---------------|
| Styling | CSS custom properties (CSS variables), inline `<style>` block |
| Design language | Apple HIG — system fonts, backdrop blur, `--bg: #F2F2F7` |
| Fonts | `-apple-system, BlinkMacSystemFont, 'SF Pro Text', 'Segoe UI'` |
| Interactivity | Vanilla JS, `<script>` block in HTML string |
| State | In-memory JS variables (briefCache, outreachCache, appliedCache) |
| Data fetching | Native `fetch()` to `/api/*` endpoints |
| File downloads | `URL.createObjectURL(blob)` + programmatic `<a>` click |
| Toasts | CSS-animated `#toast` div |
| Scan progress | `setInterval` polling `/api/scan-status` every 2000ms |

---

## Output Files

| Type | Location | Naming Pattern |
|------|----------|----------------|
| Resume DOCX | `output/resumes/` | `Adarsha-Chatterjee-{Company}-{Role}-{YYYY-MM-DD}.docx` |
| Resume analysis | `output/resumes/` | `Adarsha-Chatterjee-{Company}-{Role}-{YYYY-MM-DD}-analysis.json` |
| Cover letter | `output/cover-letters/` | `Adarsha-Chatterjee-{Company}-{Role}-CoverLetter-{YYYY-MM-DD}.docx` |
| Apply queue | `output/` | `apply-queue-{YYYY-MM-DD}.md` |

---

## Dev Tools & Utilities

| Tool | Purpose |
|------|---------|
| `doctor.mjs` | Pre-flight check: env vars, Playwright, Gemini connectivity |
| `verify-pipeline.mjs` | Validate data integrity (raw → scored → tracker) |
| `dedup-tracker.mjs` | Remove duplicate job IDs from raw file |
| `normalize-statuses.mjs` | Fix malformed status fields |
| `check-liveness.mjs` | Quick connectivity check for Gemini API |
| `update-system.mjs` | Check/apply/rollback system updates |

---

## Security Notes

- `.env` file is gitignored — never committed
- Gemini API key passed as query param (standard for Google APIs)
- No authentication on dashboard (local-only, port 3030 not exposed publicly)
- No user data sent to any service except job snippets sent to Gemini for analysis
