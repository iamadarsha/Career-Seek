# Career Ops India — Design System

> Visual language, component patterns, and UX principles for the dashboard.

---

## Design Philosophy

The dashboard follows **Apple Human Interface Guidelines (HIG)** adapted for a web context:
- **Clarity** — typography and layout communicate hierarchy without decoration
- **Deference** — UI stays out of the way; content (job listings) is the focus
- **Depth** — layered surfaces, blur, and shadow create spatial context

The aesthetic is intentionally **native macOS-like** — feels like an Electron app or system utility rather than a generic SaaS product.

---

## Color System

### CSS Custom Properties

```css
:root {
  /* Backgrounds */
  --bg: #F2F2F7;          /* system grouped background (light gray) */
  --surface: #FFFFFF;     /* card / panel background */
  --surface2: #F2F2F7;    /* secondary surface */

  /* Borders & Dividers */
  --border: rgba(0,0,0,0.08);

  /* Typography */
  --text-primary: #1C1C1E;      /* primary label */
  --text-secondary: #636366;    /* secondary label */
  --text-tertiary: #AEAEB2;     /* tertiary / placeholder */

  /* Semantic Colors */
  --accent: #007AFF;    /* blue — primary actions */
  --green: #34C759;     /* success / Tier A */
  --orange: #FF9500;    /* warning / Tier B */
  --red: #FF3B30;       /* destructive / error */
  --purple: #AF52DE;    /* LinkedIn outreach / AI features */

  /* Elevation */
  --shadow: 0 1px 3px rgba(0,0,0,0.08), 0 1px 2px rgba(0,0,0,0.04);
  --shadow-md: 0 4px 16px rgba(0,0,0,0.08);

  /* Geometry */
  --radius: 12px;       /* card corner radius */
  --radius-sm: 8px;     /* button / badge corner radius */
}
```

### Tier Color Mapping

| Tier | Color | Hex | Meaning |
|------|-------|-----|---------|
| A | Green | `#34C759` | Apply today (score ≥ 75) |
| B | Orange | `#FF9500` | Apply in 3 days (55–74) |
| C | Gray | `#8E8E93` | Review / stretch (35–54) |
| D | Light gray | `#C7C7CC` | Skip (< 35) |

### Portal Brand Colors

| Portal | Color |
|--------|-------|
| LinkedIn | `#0A66C2` |
| Naukri | `#F2600C` |
| Foundit | `#6E2FFF` |
| Indeed | `#2164F3` |
| Wellfound | `#2D2D2D` |
| Instahyre | `#00B4AB` |

---

## Typography

```css
/* Base font */
font-family: -apple-system, BlinkMacSystemFont, 'SF Pro Text', 'Segoe UI', sans-serif;
-webkit-font-smoothing: antialiased;
font-size: 16px;
line-height: 1.5;
```

### Type Scale

| Element | Size | Weight | Color |
|---------|------|--------|-------|
| Header title | 17px | 600 | primary |
| Header subtitle | 13px | 400 | secondary |
| Stat value | 28px | 700 | primary |
| Stat label | 13px | 500 | secondary |
| Job title | 15px | 600 | primary |
| Company name | 13px | 400 | secondary |
| Score number | 20px | 700 | tier color |
| Meta tags | 11px | 500 | varies |
| Snippet / insight | 13px | 400 | secondary |
| Button text | 13px | 500 | white / accent |
| Toast | 13px | 500 | white |
| Scan log | 12px | 400 | monospace |

---

## Layout

### Page Structure

```
┌────────────────────────────────────────────────────────┐
│  STICKY HEADER (56px, blur backdrop)                   │
│  Career Ops India    [last scan time]    [Refresh]     │
├────────────────────────────────────────────────────────┤
│  MAIN CONTENT (max-width: 1200px, centered, 24px pad)  │
│                                                        │
│  ┌─────────────────────────────────────────────────┐  │
│  │  STATS GRID (4-column)                          │  │
│  │  [Total] [Tier A] [Apply Today] [Avg Score]    │  │
│  └─────────────────────────────────────────────────┘  │
│                                                        │
│  ┌─────────────────────────────────────────────────┐  │
│  │  AI SEARCH BAR (full width)                     │  │
│  │  [🔍 Search across all jobs with AI...]         │  │
│  └─────────────────────────────────────────────────┘  │
│                                                        │
│  FILTER TABS                                           │
│  [All] [Tier A] [Tier B] [Tier C] [LinkedIn] [Naukri] │
│                                                        │
│  JOB GRID (1 column, stacked cards)                   │
│  ┌─────────────────────────────────────────────────┐  │
│  │  JOB CARD                                       │  │
│  │  ...                                            │  │
│  └─────────────────────────────────────────────────┘  │
│                                                        │
└────────────────────────────────────────────────────────┘
│  TOAST (fixed bottom-center)                           │
│  SCAN PROGRESS PANEL (fixed bottom-right)              │
```

### Job Card Anatomy

```
┌──────────────────────────────────────────────────────────┐
│  [Job Title]                               [Score ring]  │
│  Company Name                              [Tier Badge]  │
├──────────────────────────────────────────────────────────┤
│  📍 Location  💰 Salary  ⏱ Exp  [portal badge]  📅 Date │
├──────────────────────────────────────────────────────────┤
│  Snippet text (180 chars max)...                         │
│  💡 Gemini fit insight                                   │
├──────────────────────────────────────────────────────────┤
│  [cover angle pill]    [Apply →] [🔍 Brief] [📄 Resume]  │
│                        [✉ Cover Letter] [🤝 Connect]    │
│                        [✓ Applied]                       │
├──────────────────────────────────────────────────────────┤
│  [Brief panel — expands inline]                         │
│  [Outreach panel — expands inline, purple accent]       │
└──────────────────────────────────────────────────────────┘
```

---

## Components

### Score Ring
Visual gauge showing match score. Color matches tier:
```css
.score-ring {
  width: 56px; height: 56px;
  border-radius: 50%;
  border: 3px solid var(--score-color);  /* set inline via JS */
  display: flex; flex-direction: column;
  align-items: center; justify-content: center;
}
.score-number { font-size: 18px; font-weight: 700; }
.score-label  { font-size: 9px; color: var(--text-tertiary); }
```

### Tier Badge
Colored pill: `background: tierColor`, white text, `border-radius: 4px`, `font-size: 11px`.

### Meta Tags
Inline pills for location, salary, experience, portal, date:
```css
.meta-tag {
  padding: 2px 8px; border-radius: 4px;
  font-size: 11px; font-weight: 500;
  background: var(--surface2);
  color: var(--text-secondary);
}
```
Portal tags use brand colors with 20% opacity background + full-color text.

### Action Buttons

| Button | Style | Color |
|--------|-------|-------|
| Apply → | Solid blue | `var(--accent)` |
| 🔍 Brief | Outline | accent border |
| 📄 Resume | Outline | accent border |
| ✉ Cover Letter | Outline | accent border |
| 🤝 Connect | Outline | `var(--purple)` → fills purple on hover |
| ✓ Applied | Outline green → solid green when applied | `var(--green)` |

### Inline Panels

**Brief panel:** White background, subtle border-left in accent color. Shows fit score, why apply, red flags, interview angle, salary estimate.

**Outreach panel:** `background: #F3EEFF`, `border-left: 3px solid var(--purple)`. Shows generated LinkedIn note in italic + Copy button.

### Toast Notifications
Fixed bottom-center, `max-width: 360px`, `border-radius: 10px`, `padding: 12px 18px`.

| Type | Background | Use |
|------|-----------|-----|
| info | `#007AFF` | Loading / neutral |
| success | `#34C759` | Action completed |
| error | `#FF3B30` | Failure |

Auto-dismisses after 4 seconds (configurable per call).

### Scan Progress Panel
Fixed bottom-right corner. Shows rolling log in `SF Mono` font. Lines colorized:
- `✅` prefix → green `.ok` class
- `❌` or `error` → red `.err` class
- Other → default monospace gray

---

## Header

```css
.app-header {
  background: rgba(255,255,255,0.72);
  backdrop-filter: blur(20px);            /* frosted glass effect */
  border-bottom: 1px solid var(--border);
  position: sticky; top: 0; z-index: 100;
  height: 56px;
}
```
The blur + transparency creates the signature macOS visor effect.

---

## Stat Cards

```css
.stat-card {
  background: var(--surface);
  border-radius: var(--radius);
  padding: 20px;
  box-shadow: var(--shadow);
}
.stat-value { font-size: 28px; font-weight: 700; line-height: 1.1; }
.stat-label { font-size: 13px; color: var(--text-secondary); margin-top: 4px; }
.stat-sub   { font-size: 11px; color: var(--text-tertiary); margin-top: 2px; }
```

---

## Resume Document Design

The generated DOCX follows Adarsha's master resume format exactly:

| Element | Spec |
|---------|------|
| Font | Calibri throughout |
| Name | Centered, ALL CAPS, 28pt (56 half-pts), bold |
| Tagline | Centered, 11pt (22 half-pts), pipe-separated |
| Contact | Centered, 9pt (18 half-pts), hyperlinked URLs |
| Section headers | ALL CAPS, 11pt, bold, **bottom border** (1.5pt single line), space before 240 |
| Body text | 10pt (20 half-pts) |
| Bullet text | 10pt, 0.25" hanging indent |
| Bold labels in bullets | Bold + colon prefix, e.g. "RAG at Scale:" |
| Project names | ExternalHyperlink, underlined |
| Margins | 0.7" top/bottom, 0.75" left/right |
| Line spacing | 1.15× (276 twips) |

### 7 Resume Sections (in order)
1. PROFESSIONAL SUMMARY
2. CORE COMPETENCIES & TECHNICAL SKILLS (9 categories, bold label + dot-separated values)
3. PROFESSIONAL EXPERIENCE
4. AI PRODUCT PORTFOLIO
5. EDUCATION
6. CERTIFICATIONS & RECOGNITION
7. AREAS OF EXPERTISE (dense keyword cloud paragraph)

---

## Responsive Behavior

The dashboard is optimized for desktop (1200px+ viewport) but gracefully degrades:
- Job cards stack to single column on all viewports
- Filter tabs wrap on narrow screens
- Stat grid collapses from 4-column to 2-column below 768px
- Header actions stack vertically below 480px

Mobile is functional but not the primary use case — this is a local tool run on the developer's Mac.
