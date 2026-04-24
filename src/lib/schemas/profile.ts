import { z } from 'zod';

export const ProfileSchema = z.object({
  fullName: z.string().optional(),
  headline: z.string().optional(),
  yearsOfExperience: z.number().optional(),
  targetSeniority: z.string().optional(),
  skills: z.object({
    explicit: z.array(z.string()).default([]),
    inferred: z.array(z.string()).default([]),
  }).default({ explicit: [], inferred: [] }),
  tools: z.array(z.string()).default([]),
  domains: z.array(z.string()).default([]),
  experience: z.array(
    z.object({
      role: z.string(),
      company: z.string(),
      duration: z.string(),
      summary: z.string().optional(),
    })
  ).default([]),
  projects: z.array(
    z.object({
      name: z.string(),
      description: z.string(),
      technologies: z.array(z.string()).optional(),
    })
  ).default([]),
  achievements: z.array(z.string()).default([]),
  education: z.array(
    z.object({
      degree: z.string(),
      institution: z.string(),
      year: z.string().optional(),
    })
  ).default([]),
  certifications: z.array(z.string()).default([]),
  strengths: z.array(z.string()).default([]),
  gaps: z.array(z.string()).default([]),
  rawSummary: z.string().optional(),
  metadata: z.object({
    confidenceNotes: z.string().optional(),
  }).optional(),
});

export type MasterProfile = z.infer<typeof ProfileSchema>;
