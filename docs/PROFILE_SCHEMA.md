# Profile Schema

The Master Profile is the core structured identity of the user. It is extracted by Gemini from the uploaded resume and can be edited anytime.

## Zod Schema
```typescript
{
  fullName: string,
  headline: string, // Inferred if not explicit
  yearsOfExperience: number, // Estimated
  targetSeniority: string, // e.g. Junior, Mid, Senior, Lead, Staff
  skills: {
    explicit: string[], // Explicitly listed in the resume
    inferred: string[], // AI inferred based on context
  },
  tools: string[], // Software, frameworks, platforms
  domains: string[], // Industries or business domains
  experience: { role: string, company: string, duration: string, summary?: string }[],
  projects: { name: string, description: string, technologies?: string[] }[],
  achievements: string[], // Quantifiable accomplishments
  education: { degree: string, institution: string, year?: string }[],
  certifications: string[],
  strengths: string[], // AI inferred strengths
  gaps: string[], // AI inferred missing clarity or weak areas
  rawSummary: string, // AI generated summary
  metadata: {
    confidenceNotes?: string // Any caveats from the AI extraction
  }
}
```

## Why differentiate Explicit vs Inferred?
To maintain user trust. A model might assume a frontend developer knows HTML, but it shouldn't silently add it as a fact. The user can review the "inferred" list and formally promote them to explicit skills.
