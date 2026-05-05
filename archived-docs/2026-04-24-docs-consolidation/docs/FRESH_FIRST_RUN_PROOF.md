# Fresh First-Run Proof

Status: pending final browser validation after the hardening patch.

## Required Human Flow

Use a clean `JOBHUNT_DATA_DIR` and complete in the browser:

1. Enter Gemini API key.
2. Upload `/Users/debadritamukhopadhyay/Downloads/Resume 2026.docx`.
3. Let Gemini analyse the resume.
4. Answer clarification questions if asked.
5. Set roles: Product Manager, AI Product Manager.
6. Set salary: INR 17 LPA to INR 25 LPA.
7. Set experience: 2-4 years.
8. Set location: anywhere in India.
9. Scan India-focused sources.
10. Confirm ranked dashboard cards show job title, company, location, experience, brief, and source health.
11. Test Brief, Resume, Cover Letter, Connect, Save, Applied.
12. Confirm Saved, Applied, Documents, Pipeline stay consistent.
13. Ask AI Coach after indexing:
    - Why does this job match?
    - What should I emphasize in interview?
    - How should I improve my resume for this JD?
    - How should I follow up after applying?

## Evidence To Record

- Static command results.
- Resume parsing metadata for DOCX, two-column PDF, scanned PDF.
- Gemini invalid/timeout/quota/real-key result.
- Scan result and portal failures.
- Screenshot or browser notes for populated dashboard.
- Generated asset counts and download checks.

Final evidence is recorded in `docs/FINAL_HARDENING_REPORT.md`.
