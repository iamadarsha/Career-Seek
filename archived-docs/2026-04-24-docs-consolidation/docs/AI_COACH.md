# AI Coach — JobHunt India Phase F

## Purpose

The AI Coach is a grounded career advisor that answers questions based on the user's actual materials:
- Master profile and resume
- Job descriptions and JD analyses
- Tailored resumes and ATS reports
- Enrichment briefs and cover letters
- Search preferences

It is **not** a generic chatbot. Every answer is traceable to source evidence.

## Key Features

### Grounded Answers
- Every answer cites its sources
- Confidence levels (high/medium/low) indicate evidence strength
- Caveats highlight when answers rely on inference vs. facts

### Evidence Transparency
- Source cards show which documents were used
- Relevance scores indicate retrieval quality
- Users can expand any source to see the raw evidence

### Context Scoping
Users can control what materials the coach draws from:
- **Job + Profile** — default, combines job data with user profile
- **Job Only** — only the selected job's materials
- **Job + Resume** — job materials plus tailored/original resume
- **All Materials** — everything indexed
- **Profile Only** — user profile and resume only

### Conversation Persistence
- Threads are saved locally
- Users can revisit past coaching sessions
- Thread auto-titling from first question

### Suggested Prompts
Context-aware prompt chips reduce blank-page anxiety:
- Job-specific: interview prep, ATS gaps, fit analysis
- Profile-specific: strongest angles, career trajectory, skill gaps

## UX Principles

- **Calm** — no neon, no aggressive animations
- **Premium** — Apple HIG alignment, clean typography
- **Transparent** — sources visible, confidence marked
- **Trustworthy** — never fabricates, admits uncertainty
- **Decision-support** — not consumer chat, but professional utility

## Question Categories Supported

1. Fit analysis ("How does my background fit this role?")
2. Risk assessment ("What are the biggest risks in my application?")
3. Interview prep ("What interview questions should I prepare for?")
4. ATS optimization ("Which keywords am I weak on?")
5. Strategy guidance ("Should I apply for this role?")
6. Communication ("How should I message the hiring manager?")
7. Resume review ("Should I regenerate my resume?")
8. Career coaching ("How should I explain my career pivot?")
