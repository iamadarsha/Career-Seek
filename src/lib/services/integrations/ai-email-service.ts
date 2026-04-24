import { getDb } from '@/db';
import { applications, scoredJobs, jdAnalyses, masterProfiles, contacts } from '@/db/schema';
import { eq } from 'drizzle-orm';
import { getAppConfig } from '@/lib/config';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { generateWithFallback } from '../gemini';

export type DraftType = 'follow_up' | 'thank_you' | 'recruiter_reply' | 'outreach';

export interface GeneratedEmail {
  subject: string;
  body: string;
  markdown: string;
}

/**
 * Generates a grounded email draft using AI, referencing the JD analysis and user profile.
 */
export async function generateGroundedEmail(options: {
  applicationId: number;
  draftType: DraftType;
  contactId?: number;
  tone?: 'professional' | 'warm' | 'concise';
}): Promise<GeneratedEmail> {
  const db = getDb();
  const config = getAppConfig();
  const apiKey = config.geminiApiKey;

  if (!apiKey) {
    throw new Error('Gemini API key not configured. Please add it in settings.');
  }

  // 1. Fetch Application & Scored Job
  const app = db.select().from(applications).where(eq(applications.id, options.applicationId)).get();
  if (!app) throw new Error('Application not found');

  const scoredJob = app.scoredJobId 
    ? db.select().from(scoredJobs).where(eq(scoredJobs.id, app.scoredJobId)).get()
    : null;

  // 2. Fetch JD Analysis
  const jdAnalysis = app.scoredJobId
    ? db.select().from(jdAnalyses).where(eq(jdAnalyses.scoredJobId, app.scoredJobId)).get()
    : null;

  // 3. Fetch Master Profile (User)
  let masterProfile;
  if (scoredJob) {
    masterProfile = db.select().from(masterProfiles).where(eq(masterProfiles.id, scoredJob.masterProfileId)).get();
  } else {
    // Fallback to most recent master profile
    masterProfile = db.select().from(masterProfiles).orderBy(masterProfiles.updatedAt).limit(1).get();
  }

  // 4. Fetch Contact
  const contact = options.contactId
    ? db.select().from(contacts).where(eq(contacts.id, options.contactId)).get()
    : null;

  // 5. Prepare Context for AI
  const context = {
    jobTitle: app.title,
    company: app.company,
    contactName: contact?.fullName,
    tone: options.tone || 'professional',
    jd: {
      mustHaveSkills: jdAnalysis?.mustHaveSkills ? JSON.parse(jdAnalysis.mustHaveSkills) : [],
      businessContext: jdAnalysis?.businessContext,
      hiringPriorities: jdAnalysis?.hiringPriorities,
    },
    user: {
      fullName: masterProfile?.fullName,
      headline: masterProfile?.headline,
      skills: masterProfile?.skillsExplicit ? JSON.parse(masterProfile.skillsExplicit) : [],
      experience: masterProfile?.experience ? JSON.parse(masterProfile.experience) : [],
    }
  };

  // 6. Construct Prompt
  const prompt = `
    You are an expert career assistant and executive writer. 
    Write a high-conversion, personalized email for a job application scenario.
    
    DRAFT TYPE: ${options.draftType}
    TONE: ${context.tone}
    
    JOB CONTEXT:
    - Title: ${context.jobTitle}
    - Company: ${context.company}
    - Business Context: ${context.jd.businessContext || 'N/A'}
    - Hiring Priorities: ${context.jd.hiringPriorities || 'N/A'}
    - Key Skills Required: ${context.jd.mustHaveSkills.slice(0, 5).join(', ')}
    
    USER CONTEXT:
    - Name: ${context.user.fullName}
    - Professional Identity: ${context.user.headline}
    - Top Relevant Skills: ${context.user.skills.slice(0, 10).join(', ')}
    
    RECIPIENT: ${context.contactName || 'Hiring Team'}
    
    INSTRUCTIONS:
    1. If TYPE is 'follow_up': Politely check on the status, reiterate interest, and briefly mention one specific skill or experience that matches their hiring priorities.
    2. If TYPE is 'thank_you': Express gratitude for the interview, reference a specific topic (use business context if available), and reinforce why you're a fit based on their priorities.
    3. If TYPE is 'outreach' or 'recruiter_reply': Be proactive, clear, and value-oriented.
    4. Keep it concise. Hiring managers are busy.
    5. Ensure the email sounds human, not like a generic AI template.
    6. Ground all claims in the user's actual background and the job's stated needs.
    7. Use the specified tone: ${context.tone}.
    
    Respond ONLY with a JSON object in this format:
    {
      "subject": "Clear, professional subject line",
      "body": "The email body text with proper newlines",
      "markdown": "The markdown version of the email body"
    }
  `;

  const genAI = new GoogleGenerativeAI(apiKey);
  
  try {
    const responseText = await generateWithFallback(genAI, prompt, { 
      temperature: 0.7, 
      responseMimeType: "application/json" 
    }, 'generate_grounded_email');
    
    const result = JSON.parse(responseText);
    
    if (!result.subject || !result.body) {
      throw new Error('AI response missing subject or body');
    }
    
    return result as GeneratedEmail;
  } catch (error) {
    console.error("Grounded email generation failed:", error);
    throw new Error("Failed to generate AI email draft. Falling back to templates.");
  }
}
