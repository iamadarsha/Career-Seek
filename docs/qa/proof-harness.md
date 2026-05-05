# Career Seek QA Proof Harness

Reusable service-layer proof harness for four dummy job seekers:

- `sde-4y`: 4-year Software Development Engineer
- `pm-4y`: 4-year Product Manager
- `uiux-designer`: UI/UX Designer
- `hr-4y`: HR / People Operations

## Run

```bash
npx tsx scripts/qa/proof-harness.ts
```

Run one candidate:

```bash
npx tsx scripts/qa/proof-harness.ts --candidate sde-4y
```

Useful flags:

```bash
npx tsx scripts/qa/proof-harness.ts --ai=off
npx tsx scripts/qa/proof-harness.ts --coach=off
npx tsx scripts/qa/proof-harness.ts --data-root /tmp/career-seek-proof
npx tsx scripts/qa/proof-harness.ts --child-timeout-ms 300000
```

## What It Exercises

Each candidate runs in a separate child process with its own `JOBHUNT_DATA_DIR`.
That avoids the app's singleton SQLite connection crossing candidates.

The harness bootstraps the isolated app data directory, creates a detailed DOCX
resume, parses it through the resume parser, optionally validates and uses an
existing Gemini key from env/config without printing it, creates a master
profile and search profile, runs the deterministic validation scan, adds one
non-validation QA job for app actions, scores jobs, saves/applies the selected
job, generates a brief, tailored resume, PDF, ATS report, cover letter, and
outreach note, reads command-center state, and attempts coach/RAG indexing and
question answering when Gemini is available.

## Outputs

The aggregate report is written to:

```text
docs/qa/proof-harness-last-run.json
```

The aggregate report is updated after each candidate, so interrupted long AI
runs still leave the latest completed candidate state.

Per-candidate reports are written inside each isolated data directory:

```text
<JOBHUNT_DATA_DIR>/logs/qa-proof-report.json
```

The report intentionally records only whether a Gemini key was available and
which source type provided it. It does not print or persist the key in QA
reports, and the harness scrubs `geminiApiKey` from each isolated settings file
after the candidate run finishes.
