# Claude Design Prompt: Full Career Seek Redesign Using Airbnb Design System

Paste the full prompt below into Claude Design.

```text
You are a world-class consumer product designer and front-end design architect. Redesign the entire Career Seek web app using an Airbnb-inspired design system.

Career Seek is a local-first AI job-search platform. It helps a user:
- discover jobs,
- rank jobs against their resume,
- prepare application materials,
- track applications,
- receive reminders,
- ask an AI career coach grounded in their documents,
- review analytics,
- manage local AI and scraper settings.

Your task is to redesign every page of the app in extreme detail using the Airbnb visual language described below. This must be a full product redesign, not a landing page, not a dashboard skin, and not a shallow style swap.

The new product should feel like:
"Airbnb for job opportunities."

Jobs are listings.
Saved jobs are wishlists.
Applications are planned journeys.
The AI coach is an evidence assistant.
The pipeline is a soft, consumer-grade progress board.
Settings feel like clean account settings, not an admin console.

Do not copy Airbnb content, logos, travel language, houses, hosts, guests, reservations, homes, or travel photography. Borrow the visual system and UX feel only.

Design goal:
Make Career Seek feel like a premium consumer marketplace for job search: white, generous, searchable, rounded, friendly, trustworthy, listing-first, and evidence-grounded.

Avoid:
- enterprise dashboards,
- dark sidebars,
- heavy CRM visuals,
- generic SaaS blue/purple,
- neon AI styling,
- command-center aesthetics,
- gold/cream warm cockpit styling,
- decorative blobs/orbs,
- marketing hero pages,
- huge typography,
- cards nested inside cards,
- vague AI magic.

Use real app screens and realistic app data. The first screen must be useful immediately.

────────────────────────────────
1. Design System
────────────────────────────────

Use this exact Airbnb-inspired token system.

Colors:
- Canvas: #ffffff
- Surface soft: #f7f7f7
- Surface strong: #f2f2f2
- Ink: #222222
- Body text: #3f3f3f
- Muted text: #6a6a6a
- Muted soft: #929292
- Hairline: #dddddd
- Hairline soft: #ebebeb
- Border strong: #c1c1c1
- Primary / Rausch: #ff385c
- Primary active: #e00b41
- Primary disabled: #ffd1da
- Error text: #c13515
- Error hover: #b32505
- On primary: #ffffff
- Scrim: #000000 at 50% opacity

Semantic adaptation:
- Primary action: #ff385c
- Active saved/favorite heart: #ff385c
- Active route underline: #222222
- AI confidence high: ink label plus subtle #f7f7f7 surface, not green-heavy
- AI confidence medium: #6a6a6a label with hairline border
- AI confidence low/error: #c13515 text
- Warnings should use restrained text and border, not big yellow panels.

Typography:
- Use Airbnb Cereal VF if available.
- Fallback: Circular, Inter, -apple-system, BlinkMacSystemFont, system-ui, Roboto, Helvetica Neue, sans-serif.
- Use one type family only.
- Do not use a separate display font.
- Do not use giant SaaS headings.

Typography scale:
- Main page H1: 28px, weight 700, line-height 1.43.
- Detail page H1: 22px, weight 500, line-height 1.18.
- Section heading: 21px, weight 700, line-height 1.43.
- Subsection heading: 20px, weight 600, line-height 1.2.
- Card title: 16px, weight 600, line-height 1.25.
- Card secondary title: 16px, weight 500.
- Body: 16px, weight 400, line-height 1.5.
- Metadata: 14px, weight 400, line-height 1.43.
- Captions: 14px, weight 500.
- Small metadata: 13px, weight 400.
- Badges: 11px, weight 600.
- Tiny uppercase tags: 8px, weight 700, letter-spacing 0.32px.
- Buttons: 14-16px, weight 500.

Shape:
- Search bar: full pill, 9999px radius.
- Search button orb: full circle.
- Listing cards: 14px radius.
- Detail/action cards: 14px radius.
- Primary buttons: 8px radius, except pill buttons.
- Category chips: 32px or full pill radius.
- Icon buttons: circular.
- Inputs: 8px radius.
- Modals: 14px radius.

Spacing:
- Base spacing unit: 8px.
- Micro spacing: 2px and 4px only where needed.
- Page horizontal padding:
  - mobile: 24px,
  - tablet: 40px,
  - desktop: 80px.
- Main content max width:
  - marketplace pages: 1280px to 1440px,
  - detail pages: 1080px to 1120px.
- Section gap: 48px to 64px.
- Listing grid gap: 24px.
- Compact row gap: 16px.
- Card padding: 16px to 24px.
- Modal padding: 24px.
- Minimum touch target: 44px.
- Primary button height: 48px.
- Text input height: 56px.
- Search pill height: 64px desktop, 56px mobile.

Elevation:
- Most UI is flat.
- Use one subtle Airbnb-style shadow only:
  rgba(0,0,0,0.02) 0 0 0 1px,
  rgba(0,0,0,0.04) 0 2px 6px,
  rgba(0,0,0,0.10) 0 4px 8px.
- Apply shadow to:
  - global search pill,
  - hover listing card,
  - sticky action card,
  - dropdowns,
  - modals,
  - floating background task popover.
- Do not create many shadow tiers.

Iconography:
- Use Lucide-style thin line icons.
- Stroke width should feel light and consumer-grade.
- Icons are usually 16px, 18px, 20px, or 24px.
- Product-tab icons can be 32px.
- Do not use emojis as UI icons.

Motion:
- Keep motion restrained.
- Hover listing cards: subtle shadow lift only, no big transform.
- Button active state: darker primary, no scale needed.
- Sheet/modal: fade scrim and 160-220ms slide/scale.
- Accordion: 180ms expand.
- Respect reduced motion.

────────────────────────────────
2. Global App Architecture
────────────────────────────────

Replace the current sidebar-heavy app shell with an Airbnb-style marketplace shell.

Desktop top navigation:
- Height: 80px.
- White background.
- 1px bottom hairline #dddddd.
- Left: Career Seek wordmark.
  - Use a simple Rausch mark or abstract CS symbol.
  - Wordmark text in #ff385c or ink with Rausch mark.
- Center: product navigation with 3 large tabs:
  1. Jobs
  2. Applications
  3. Coach
- Each product tab has a 32px line icon above or beside the label.
- Active product tab uses ink text and a 2px ink underline.
- Inactive product tabs use muted #6a6a6a.
- Add tiny "NEW" pill badges to Coach and Analytics if useful.
- Right:
  - "Local data" pill,
  - notification bell circle,
  - settings/account menu circle.

Secondary route strip:
- Under the top nav, include a horizontal category-style strip.
- Routes:
  - Today
  - Discover
  - Saved
  - Applied
  - Documents
  - Pipeline
  - Analytics
  - Settings
- This strip should feel like Airbnb category tabs.
- Active route: ink text, subtle underline.
- Inactive route: muted text.
- On mobile, route strip scrolls horizontally.

Global search surface:
- On Jobs pages, place a central pill search bar below nav.
- Search segments:
  - Role
  - Location
  - Work mode
  - Salary
- The right end has a circular Rausch search orb.
- Each segment has a label and muted value:
  - Role: "AI Product Manager"
  - Location: "Bangalore or Remote"
  - Work mode: "Hybrid"
  - Salary: "25 LPA+"
- Use vertical hairline dividers between segments.

Mobile shell:
- Top nav becomes:
  - left logo,
  - central compact search pill,
  - right menu/account icon.
- Product tabs collapse into a sheet.
- Route strip remains horizontal scroll.
- No sidebars.
- Bottom nav can exist if needed, but it must feel consumer-mobile, not enterprise.

Global feedback:
- Toasts appear bottom center desktop and above bottom nav mobile.
- Toast style:
  - white card,
  - 14px radius,
  - subtle shadow,
  - ink text,
  - Rausch "Undo" action.
- System status is a compact hairline banner, not a big dashboard alert.

────────────────────────────────
3. Shared Components
────────────────────────────────

Job Listing Card:
Use this component everywhere jobs appear.

Structure:
- Top visual tile:
  - aspect ratio 1:1 or 4:3 depending grid density.
  - background #f7f7f7.
  - rounded 14px.
  - no stock photography.
  - use company initials, role-family icon, or subtle textural placeholder.
  - top-left floating badge.
  - top-right circular heart save button.
  - optional bottom carousel dots representing evidence sections: Fit, Resume, Source.
- Metadata block below:
  - title 16px / 600 / ink.
  - company and location 14px / muted.
  - salary and work mode 14px / muted.
  - match line: "84 match · Local estimate".
  - action row:
    - primary small button: Prepare, Apply, Follow up, or Review.
    - tertiary link: View evidence.

Badges:
- "Top match"
- "Best next action"
- "Official careers"
- "Via Google"
- "New"
- "Saved"
- "Remote"
- Use white pill badges over the top tile.
- Badge text 11px / 600.
- Badge radius full.
- Subtle shadow if badge floats over tile.

Heart save button:
- Circle 32px or 40px.
- Default white with ink outline heart.
- Saved state uses Rausch fill or Rausch heart.

Primary button:
- Rausch background.
- White text.
- 8px radius.
- Height 40-48px.
- Label 14px/500.

Secondary button:
- White background.
- Ink text.
- 1px hairline or ink outline.
- 8px radius.

Inputs:
- White background.
- 1px #dddddd border.
- 56px height.
- 8px radius.
- Focus: 2px ink border, no glow.
- Label above in muted or caption style.

Status chips:
- Prefer text and hairline borders over filled color blocks.
- Use Rausch sparingly for active or urgent states.

AI Confidence Chip:
- Small rounded pill.
- Variants:
  - "High confidence"
  - "Medium confidence"
  - "Low confidence"
- Always pair confidence with evidence source:
  - "Based on your resume"
  - "From job description"
  - "From application history"
  - "Local deterministic fallback"

Evidence Accordion:
- White rows with hairline dividers.
- Chevron icon.
- Snippet expands below.
- Relevance shown as muted text or small pill.

Sticky Action Card:
- Inspired by Airbnb reservation card.
- White card.
- 14px radius.
- 1px hairline border.
- Subtle shadow.
- 24px padding.
- Used on job detail and application detail.

────────────────────────────────
4. Page-By-Page Redesign
────────────────────────────────

Page 1: Today
Route: `/`
Product area: Jobs

Purpose:
Give the user a beautiful, immediate marketplace view of the jobs worth acting on today.

Desktop layout:
- Top nav.
- Route strip.
- Centered pill search bar.
- Page content max width 1440px.
- Section heading:
  - H1: "Jobs worth acting on today"
  - Subtext: "Ranked against your resume, preferences, and saved application history."
- Category strip:
  - Best matches
  - Remote
  - Bangalore
  - AI roles
  - Startups
  - High salary
  - Recently posted
  - Saved
- Content grid:
  - main job listing grid,
  - optional right sticky "Today plan" card on desktop.

Job grid:
- 4 columns desktop where possible.
- 3 columns if content width is constrained.
- 2 columns tablet.
- 1 column mobile.

First listing:
- Mark as "Best next action".
- It should look like a listing, not a dashboard hero.
- CTA: "Prepare application".
- Secondary: "View evidence".
- Match line: "86 match · Local estimate".
- Reason: "Strong overlap with AI product strategy and search analytics."

Today plan card:
- Sticky on desktop.
- White reservation-card style.
- Title: "Today plan".
- Checklist:
  - Review top match
  - Prepare resume
  - Apply
  - Set follow-up
- Full-width Rausch CTA: "Start today".

Loading:
- Skeleton listing grid.
- Search pill skeleton.
- Do not show full-page spinner.

Empty:
- Centered simple icon.
- Heading: "No jobs found yet".
- Copy: "Broaden your role, location, or company filters to discover more listings."
- CTA: "Search again".

Page 2: Discover
Route: `/discover`
Product area: Jobs

Purpose:
Expanded marketplace search for ranked job listings.

Desktop layout:
- Top nav.
- Route strip.
- Large pill search bar.
- Filter row.
- Listing grid.
- Source health accordion at bottom.

Filter row:
- Soft horizontal chips:
  - Tier A
  - Remote
  - Hybrid
  - Company ATS
  - LinkedIn
  - Naukri
  - Salary listed
  - Recently posted
- Right side:
  - Sort dropdown: "Best match".

Manual URL import:
- A compact pill-like row below filters.
- Label: "Paste a job link".
- Input placeholder: "LinkedIn, Naukri, company ATS, or careers page URL".
- Rausch button: "Import".
- If Google preview:
  - inline warning text: "Preview only. Analyse the original source before scoring."

Listings:
- Same job listing card.
- Cards can show:
  - "Official careers"
  - "Via Google"
  - "Top match"
  - "New"
- Use `View evidence`, `Save`, `Prepare`, `Apply`.

Source health:
- Collapsed by default.
- Accordion title: "Source health".
- Summary: "6 sources ready · 2 need attention".
- Expanded:
  - provider rows,
  - status,
  - jobs found,
  - human failure message,
  - "Paste URL manually" action for blocked sources.

No results:
- Search icon.
- Heading: "No matching jobs".
- Copy: "Try a broader role, remove a source filter, or paste a job URL."
- CTAs: "Clear filters", "Paste job URL".

Page 3: Job Detail
Route: design as drawer/full detail from job card
Product area: Jobs

Purpose:
Explain one job and help the user prepare/apply with evidence.

Layout:
- Detail page or right drawer.
- Airbnb listing-detail-inspired.
- Top:
  - Back to results.
  - Job title 22px / 500.
  - Company, location, source.
  - Toolbar: Save, Copy link, Open source.
- Evidence gallery:
  - Large left tile: Fit summary.
  - Small right tiles:
    - Resume match.
    - Source details.
    - Application assets.
- Main:
  - left column 64% content.
  - right column 32% sticky action card.

Left column sections:
1. Why this matches
   - confidence chip,
   - source chips,
   - 3 short evidence bullets.
2. What to watch
   - risks or missing requirements.
3. Resume focus
   - skills/phrases to emphasize.
4. Source evidence
   - expandable snippets.
5. Generated documents
   - resume, cover letter, outreach, ATS report rows.

Sticky action card:
- White reservation-card style.
- Top line: "84 match".
- Subtext: "Local advisory estimate, not employer-certified."
- Checklist:
  - Fit brief reviewed
  - Resume ready
  - Cover letter ready
  - Follow-up set
- Primary Rausch CTA:
  - "Prepare application" or "Apply" or "Follow up".
- Secondary:
  - "Ask Coach".
  - "Save for later".

Google preview state:
- Score area says "Preview only".
- Primary CTA: "Analyse original source".
- Explain: "Google surfaced a preview. Career Seek needs the original description before scoring."

AI-limited state:
- Show small muted warning:
  "No live AI provider. Local ranking and deterministic evidence are still available."

Page 4: Saved Jobs
Route: `/saved`
Product area: Jobs

Purpose:
Wishlist-style saved jobs.

Layout:
- H1: "Saved jobs".
- Subtext: "Jobs you parked for later review."
- Grid of job listing cards.
- Saved heart state active Rausch.
- Optional grouping:
  - Recently saved
  - Older

Empty:
- Heading: "No saved jobs yet".
- Copy: "Save jobs from Discover when you are not ready to apply."
- CTA: "Explore jobs".

Page 5: Applied Jobs
Route: `/applied`
Product area: Applications

Purpose:
Submitted application history.

Layout:
- H1: "Submitted applications".
- Soft list rows with hairline dividers.

Row:
- Job title and company.
- Applied date.
- Source.
- Follow-up state:
  - "Follow-up due"
  - "Reminder set"
  - "No reminder"
- Actions:
  - Set reminder
  - Open source
  - View pipeline record.

Empty:
- Heading: "Nothing marked applied yet".
- Copy: "Apply from a job listing, then mark it applied to start follow-up tracking."
- CTA: "Open today".

Page 6: Pipeline
Route: `/pipeline`
Product area: Applications

Purpose:
Track applications through stages.

Layout:
- H1: "Application pipeline".
- Subtext: "Track every opportunity from saved to offer."
- View toggle:
  - Board
  - List
- Primary CTA: "Track job".
- Summary strip:
  - This week
  - Follow-ups due
  - Interviews
  - Saved
  - Stale
  - Total

Board:
- White canvas.
- Columns are #f7f7f7 sections with 14px radius.
- Column headers:
  - label,
  - count,
  - small status dot.
- Columns:
  - Saved
  - Preparing
  - Applied
  - Follow-up
  - Replied
  - Interview
  - Offer
- Cards:
  - small listing-card style.
  - title, company, status, match, due date.
- Empty column:
  - dashed hairline placeholder.

List:
- Rows with hairline dividers.
- Status pill, title/company/location, score, updated, source action.

Track Job modal:
- Scrim backdrop.
- White modal, 14px radius.
- Title: "Track a job".
- Inputs:
  - Role title
  - Company
  - Location
  - Portal
  - Job URL
- Show "Draft saved locally" once typed.
- Buttons:
  - Cancel
  - Track job
- If closing with draft content, warn.

Page 7: Application Detail
Route: `/pipeline/[id]`
Product area: Applications

Purpose:
Manage one application.

Layout:
- Max width 1120px.
- Back link: "Pipeline".
- Header:
  - Job title.
  - Company/location/source.
  - Status pill.
  - Match score and advisory label.
- Toolbar:
  - Export packet.
  - Follow-up .ics.
  - Interview .ics when relevant.
  - Open source.
  - More menu with delete.

Tabs:
- Timeline
- Notes
- Reminders
- Documents
- Contacts
- Drafts

Tab design:
- Airbnb-style horizontal tab row.
- Active tab ink underline.
- No filled tab buttons.

Timeline:
- Vertical event list.
- Hairline left rail.

Notes:
- Composer.
- Note cards.
- Pin/edit/delete circular icon buttons.

Reminders:
- Reminder list.
- Overdue uses restrained error text and hairline.
- Complete action is optimistic.
- Delete uses undo.

Documents:
- Document rows:
  - type,
  - version,
  - ATS estimate,
  - download.

Contacts:
- Linked contacts.
- Link existing contact.
- Create contact.

Drafts:
- Generate draft row.
- Draft cards with provenance:
  "Generated from application context · Medium confidence".

Page 8: Documents
Route: `/documents`
Product area: Applications

Purpose:
Library of resumes, cover letters, outreach notes, and ATS reports.

Layout:
- H1: "Documents".
- Subtext: "Resume, cover letter, and outreach assets."
- Top summary:
  - Uploaded resumes.
  - Generated assets.
  - Latest asset.
- Two-column desktop:
  - Left rail: Base resumes.
  - Main: Generated assets.

Rows:
- Document type and version.
- Linked job and company.
- Created date.
- ATS estimate if present.
- Source job button.
- Download button.

Empty:
- Heading: "No generated documents yet".
- Copy: "Prepare an application from a job listing to create your first asset."
- CTA: "Open jobs".

Page 9: Notifications
Route: `/notifications`
Product area: Applications

Purpose:
Attention inbox for follow-ups, scans, and reminders.

Layout:
- H1: "Notifications".
- Subtext: "Follow-ups, scan outcomes, and reminders."
- Top summary:
  - Unread.
  - High priority.
  - Total visible.
- Actions:
  - Refresh.
  - Mark all read.

Feed row:
- Priority dot.
- Title.
- New badge.
- Message.
- Timestamp.
- Actions:
  - Open.
  - Read.
  - Archive.

Empty:
- Heading: "Nothing needs attention right now".
- Copy: "When scans finish or follow-ups become due, they will appear here."
- CTAs:
  - Open jobs.
  - Review pipeline.

Page 10: Coach
Route: `/coach`
Product area: Coach

Purpose:
Evidence-grounded AI career assistant.

Layout:
- No dark chat UI.
- White marketplace shell.
- Desktop two columns:
  - left thread list,
  - right chat pane.
- Mobile:
  - single chat pane,
  - thread drawer.

Top controls:
- Job selector as rounded input.
- Scope pills:
  - Job + Profile
  - Job Only
  - Job + Resume
  - All Materials
  - Profile Only
- Index button.
- Re-index icon.

Thread list:
- Clean white list.
- Active thread uses #f7f7f7 background.
- New thread circular icon button.

Empty chat:
- H1: "Ask your career coach".
- Copy:
  "Answers are grounded in your resume, job descriptions, and saved application history."
- Prompt chips:
  - Why is this job a fit?
  - What should I fix in my resume?
  - How should I answer interview questions?
  - What follow-up should I send?
- If no index:
  - "No indexed materials yet."
  - CTA: "Index materials".

Messages:
- User:
  - Rausch bubble,
  - white text,
  - restrained width.
- Assistant:
  - white rounded card,
  - hairline border,
  - confidence chip,
  - evidence source chips,
  - answer text,
  - caveats,
  - copy button.
- Sources:
  - accordion rows with snippets.

Composer:
- Rounded input area.
- Send button circular Rausch orb.
- Placeholder changes by state:
  - "Ask about this role..."
  - "Index your materials first..."

Page 11: Analytics
Route: `/analytics`
Product area: Applications or Jobs

Purpose:
Consumer-friendly performance insight, not enterprise BI.

Layout:
- H1: "What is working".
- Subtext: "Local trends from your job search."
- Top trust/rating block inspired by Airbnb listing rating display.

Top trust block:
- Large central metric, e.g. "72%".
- Label: "Search momentum".
- Side stats:
  - Reply rate.
  - Interview rate.
  - Tier A density.
  - Avg days to apply.

Tabs:
- Overview
- Funnel
- Search
- Market
- Documents
- Weekly
- Experiments
- Activity

Overview:
- KPI cards, flat white with hairline.
- Active insights list.
- Confidence shown as text.

Funnel:
- Soft horizontal bars.

Search:
- Portal performance table.
- Search profile performance table.

Market:
- Top skills bar list.
- Active companies bar list.
- Salary signals.

Documents:
- ATS distribution.
- Document usage.
- Outcomes by ATS band.

Weekly:
- Generate weekly review.
- Export markdown.
- Export JSON.

Experiments:
- Cards with status.
- Do not use blue.
- Use ink, muted, Rausch, and restrained success/error.

Activity:
- Table with hairline rows.

Page 12: Settings
Route: `/settings`
Product area: Account

Purpose:
Clean account-style settings.

Layout:
- H1: "Settings".
- Subtext: "Manage your local AI helper, resume profile, sources, and backups."
- Sections with hairline dividers:
  1. AI helper.
  2. Resume profile and job goals.
  3. Scraping sources.
  4. Downloads and backups.
  5. Export folders.

AI helper:
- Provider select.
- Model input.
- Base URL input.
- API key password input.
- Status:
  - Ready.
  - Needs key.
  - Local-only.
- Buttons:
  - Save provider.
  - Test connection.
- Provider docs link.

Sources:
- Provider rows:
  - label,
  - portals,
  - available/unavailable,
  - message.
- Button: "Check sources".

Backup:
- Button: "Back up my job search".
- Result path with copy action.

Inputs:
- 56px high.
- 8px radius.
- focus uses 2px ink border.

Page 13: Automation Settings
Route: `/settings/automation`
Product area: Account

Purpose:
Notification preference and automation log settings.

Layout:
- H1: "Automation & notifications".
- Two columns desktop.
- Left:
  - notification preferences,
  - quiet hours.
- Right:
  - automation logs.

Preference card:
- Category title.
- Short description.
- Toggle.
- Toggle on uses Rausch.

Quiet hours:
- Label start and end fields explicitly.
- If read-only, say "Quiet hours are currently read-only."

Logs:
- Rows with status icon.
- Success/failure text.
- Timestamp.
- Error detail if failed.

Page 14: Onboarding
Route: `/onboarding`

Purpose:
Guided setup with consumer-grade clarity.

Layout:
- Full white canvas.
- Centered setup flow.
- Max width around 960px.
- Slim step indicator across top.
- No dark sidebar.
- No dashboard shell.

Steps:
1. Welcome
2. AI helper
3. Resume upload
4. Clarify
5. Profile review
6. Job goals
7. Find jobs

Welcome:
- H1: "Start with your resume. Let the search follow."
- Copy:
  "Career Seek reads your resume, learns your goals, and turns job search into a ranked marketplace of opportunities."
- Three cards:
  - Private by default.
  - Resume-first.
  - Better matches.
- Primary CTA: "Get started".

AI helper:
- Provider, model, base URL, API key.
- Primary: "Save setup and continue".
- Secondary: "Continue in local-only mode".
- Explain that keys stay local.

Resume upload:
- Large dashed rounded drop zone.
- Upload icon.
- Accepted: PDF or DOCX.
- Show parser confidence.
- If weak extraction:
  - manual recovery panel,
  - textarea,
  - character count.

Clarify:
- Question cards.
- Reason text.
- Textareas.

Profile review:
- Editable profile form.
- Confidence badge.
- Save and continue.

Job goals:
- Role chips.
- Work mode chips.
- Salary, locations, company types.
- Advanced exclusions collapsed.

Find jobs:
- Summary card.
- Primary CTA:
  - "Find matching jobs".

Page 15: Error States

Global error:
- Centered white card.
- Alert icon.
- Heading: "Something went wrong".
- Copy: "This view hit a recoverable problem. Try again, or check System Status if it repeats."
- Primary: "Try again".
- Secondary: "Check status".

Discover error:
- Same card.
- Heading: "Could not load job results".
- Include small expandable technical detail.

System status:
- Compact banner.
- Healthy:
  - "Local system ready".
- Warning:
  - "A local service needs attention".
- Expanded:
  - simple rows of checks,
  - AI cooldown rows,
  - recovery actions.

Background tasks:
- Floating Airbnb-style popover.
- White, 14px radius, subtle shadow.
- Rows:
  - task type,
  - status,
  - progress bar,
  - logs expandable.

────────────────────────────────
5. Responsive Requirements
────────────────────────────────

Mobile:
- Width below 744px.
- One-column listing grid.
- Search bar collapses to one pill.
- Product tabs hide behind menu/sheet.
- Route strip scrolls horizontally.
- Job detail sticky action card becomes bottom sticky bar.
- Coach uses single-pane chat with thread drawer.
- Pipeline board scrolls horizontally with visible affordance.

Tablet:
- 2-column listing grid.
- Search bar may keep 2-3 segments.
- Detail pages can still stack sticky action card below content if needed.

Desktop:
- 3-4 column listing grids.
- Full search bar.
- Full product tabs.
- Detail pages use two-column layout with sticky right action card.

Wide:
- Cap content width.
- Do not stretch cards too wide.

────────────────────────────────
6. Accessibility And UX Rules
────────────────────────────────

- Every icon-only control needs a visible tooltip and accessible name in implementation.
- All inputs need labels.
- Color cannot be the only status indicator.
- Every empty state must include a next action.
- Every AI answer must show confidence and source.
- Every destructive action must offer 5-second undo.
- Status changes should be optimistic but recoverable.
- Modals must trap focus and close with Escape.
- Use 44px minimum touch targets.
- Do not hide major navigation destinations on mobile.

────────────────────────────────
7. Content To Use In Mockups
────────────────────────────────

Use realistic Career Seek content:

Roles:
- AI Product Manager
- Frontend Engineer
- Data Analyst
- Product Designer
- Backend Engineer

Companies:
- CRED
- Razorpay
- Google India
- Swiggy
- Atlassian
- Zepto
- Flipkart

Locations:
- Bangalore
- Hyderabad
- Mumbai
- Remote India
- Gurgaon

Sources:
- LinkedIn
- Naukri
- Company ATS
- Wellfound
- Instahyre
- Google Jobs

Statuses:
- Saved
- Preparing
- Applied
- Follow-up due
- Recruiter replied
- Interview
- Offer
- Rejected

AI/evidence labels:
- High confidence
- Medium confidence
- Low confidence
- Based on your resume
- From job description
- From application history
- Local advisory estimate
- Deterministic fallback

Example job cards:
1. AI Product Manager at CRED
   - Bangalore · Hybrid
   - 32-45 LPA
   - 86 match
   - Top match
2. Frontend Engineer at Razorpay
   - Remote India
   - Salary not listed
   - 81 match
   - Official careers
3. Product Designer at Swiggy
   - Bangalore
   - 74 match
   - Recently posted
4. Data Analyst at Google India
   - Hyderabad
   - 78 match
   - Via Google

────────────────────────────────
8. Final Output Expectations
────────────────────────────────

Design all primary pages:
- Today
- Discover
- Job detail
- Saved
- Applied
- Pipeline
- Application detail
- Documents
- Notifications
- Coach
- Analytics
- Settings
- Automation settings
- Onboarding
- Error states
- System status
- Background tasks

For each page, provide:
- desktop layout,
- mobile behavior,
- component states,
- empty state,
- loading state,
- error state where relevant.

The result should look like one cohesive app, not a collection of unrelated screens.

The most important thing:
Career Seek should look like a clean, white, rounded, Airbnb-quality marketplace for jobs, with Rausch as the only strong brand accent and job cards as the core visual primitive.
```

