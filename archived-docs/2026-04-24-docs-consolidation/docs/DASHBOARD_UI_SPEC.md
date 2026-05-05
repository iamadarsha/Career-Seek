# Dashboard UI Spec

## Design Direction

The UI uses a calm, premium, Apple-HIG-inspired language:

- grouped light background
- white cards
- subtle borders
- crisp typography
- blue primary accent
- green/orange tier semantics
- restrained glass and depth
- desktop-first layout with responsive stacking

## Homepage / Today

The root route `/` is the guided command center. `/today` reuses the same dashboard.

Required dashboard surfaces:

- header with profile context, last scan time, and Refresh scan
- stats grid
- Ask Gemini search bar
- scan progress panel when active
- filter chips
- ranked job cards
- right-side source/company/score/action insight panels

## Job Cards

Each card shows:

- score
- tier
- title
- company
- location
- salary
- experience
- source
- snippet
- one-line fit summary or score signal

Actions:

- Apply opens the source URL.
- Brief generates or opens Gemini fit analysis.
- Resume generates a versioned tailored DOCX.
- Cover Letter generates a versioned local asset.
- Connect generates a concise outreach note.
- Applied toggles canonical CRM state.

## Secondary Pages

- Discover: broad ranked search results with source health and filters.
- Pipeline: CRM board/list for statuses, reminders, notes, and timeline.
- Saved: DB-backed saved applications.
- Applied: DB-backed submitted applications.
- Documents: uploaded resumes and generated assets.
- Notifications: reminders and scan/application notifications.
- AI Coach: grounded Q&A on profile/materials/jobs.
- Analytics: funnel, portal, documents, experiments, activity.
- Settings: Gemini, profile rerun, output paths, backup.
