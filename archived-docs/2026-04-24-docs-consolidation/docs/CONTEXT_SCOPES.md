# Context Scopes — JobHunt India Phase F

## Overview

Context scopes control what materials the AI Coach retrieves when answering questions. This gives users fine-grained control over the grounding context.

## Available Scopes

### Job + Profile (Default)
- **What it includes**: Selected job's description, JD analysis, enrichment brief, tailored resume, ATS report, cover letter, outreach note + user's master profile, uploaded resume, search preferences
- **Best for**: "How does my background fit this role?", "What should I emphasize in the interview?"

### Job Only
- **What it includes**: Only the selected job's materials (JD, analysis, enrichment, generated documents)
- **Best for**: "What are the strongest signals in this JD?", "What are they looking for?"

### Job + Resume
- **What it includes**: Job materials + uploaded resume + master profile + tailored resume for this job
- **Best for**: "Should I regenerate my resume?", "Which ATS keywords am I missing?"

### All Materials
- **What it includes**: Everything indexed — all jobs, profile, all generated documents
- **Best for**: "Which of my scored jobs is the best fit?", "What skills come up most across my opportunities?"

### Profile Only
- **What it includes**: Master profile, uploaded resume, search preferences (no job data)
- **Best for**: "What are my strongest professional angles?", "What skills should I develop?"

## Scope Selection in UI

The scope selector is a segmented control in the coach top bar. Users can switch scopes mid-conversation, and the new scope applies to the next question.

## Technical Implementation

Scope filtering happens in `retriever.ts` before similarity scoring. This is a metadata filter, not a re-ranking step — it reduces the candidate set before cosine similarity is computed.
