"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { checkApiKey, saveStep, finishOnboarding, uploadAndParseResume, generateMasterProfile, updateMasterProfile, saveSearchProfile } from "@/app/actions";
import { MasterProfile } from "@/lib/schemas/profile";

export default function Onboarding() {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [loading, setLoading] = useState(false);
  
  // State
  const [apiKey, setApiKey] = useState("");
  const [keyError, setKeyError] = useState("");
  const [resumeText, setResumeText] = useState("");
  const [profileId, setProfileId] = useState<number | null>(null);
  const [profile, setProfile] = useState<MasterProfile | null>(null);
  
  // Search Preferences
  const [searchPrefs, setSearchPrefs] = useState({
    title: "",
    locations: "",
    workModel: "hybrid",
    expectedSalary: "",
  });

  const steps = [
    { title: "Welcome", desc: "Introduction" },
    { title: "API Key", desc: "Connect Gemini" },
    { title: "Resume", desc: "Upload Document" },
    { title: "Profile", desc: "Review Extraction" },
    { title: "Preferences", desc: "Search Goals" },
    { title: "Finish", desc: "Review & Complete" },
  ];

  const handleNext = async () => {
    setLoading(true);
    try {
      if (step === 1) {
        // Validate API Key
        setKeyError("");
        const res = await checkApiKey(apiKey);
        if (!res.success) {
          setKeyError(res.error || "Failed to validate key");
          setLoading(false);
          return;
        }
      }
      
      if (step === 3 && profile && profileId) {
        // Save Profile
        await updateMasterProfile(profileId, profile);
      }
      
      if (step === 4) {
        // Save Search Prefs
        await saveSearchProfile({
          ...searchPrefs,
          locations: searchPrefs.locations.split(',').map(s => s.trim()),
        });
      }

      if (step === steps.length - 1) {
        await finishOnboarding();
        router.push("/");
        return;
      }
      
      const nextStep = step + 1;
      setStep(nextStep);
      await saveStep(nextStep);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const handleBack = () => {
    if (step > 0) setStep(step - 1);
  };

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    
    setLoading(true);
    try {
      const formData = new FormData();
      formData.append("resume", file);
      
      const res = await uploadAndParseResume(formData);
      if (res.success && res.text) {
        setResumeText(res.text);
        
        // Auto-trigger extraction
        const extRes = await generateMasterProfile(apiKey, res.text);
        if (extRes.success && extRes.profile) {
          setProfile(extRes.profile);
          setProfileId(extRes.id || null);
          setStep(3); // Jump to profile review
          await saveStep(3);
        }
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto mt-12 bg-card border border-card-border rounded-apple-lg shadow-apple overflow-hidden">
      {/* Header / Stepper */}
      <div className="bg-sidebar border-b border-sidebar-border p-6 glass">
        <div className="flex items-center justify-between">
          {steps.map((s, i) => (
            <div key={i} className="flex flex-col items-center opacity-50 data-[active=true]:opacity-100" data-active={i === step}>
              <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium ${i === step ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'}`}>
                {i + 1}
              </div>
              <span className="text-xs mt-2 font-medium">{s.title}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Content */}
      <div className="p-8 min-h-[400px]">
        {step === 0 && (
          <div className="text-center space-y-4 animate-in fade-in">
            <h2 className="text-2xl font-semibold">Welcome to JobHunt India</h2>
            <p className="text-muted-foreground max-w-md mx-auto">
              We'll set up your local-first AI career operating system. This data never leaves your computer except to securely query Gemini.
            </p>
          </div>
        )}

        {step === 1 && (
          <div className="space-y-6 animate-in fade-in max-w-md mx-auto">
            <div>
              <h2 className="text-2xl font-semibold">Connect Gemini</h2>
              <p className="text-muted-foreground">Get your free API key from Google AI Studio.</p>
            </div>
            
            <div className="space-y-2">
              <label className="text-sm font-medium">Gemini API Key</label>
              <input 
                type="password"
                value={apiKey}
                onChange={e => setApiKey(e.target.value)}
                className="w-full px-4 py-2 border border-card-border rounded-apple bg-background focus:ring-2 focus:ring-primary/50 outline-none"
                placeholder="AIzaSy..."
              />
              {keyError && <p className="text-sm text-red-500">{keyError}</p>}
              <p className="text-xs text-muted-foreground">
                <a href="https://aistudio.google.com/app/apikey" target="_blank" className="text-primary hover:underline">Get an API key here &rarr;</a>
              </p>
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="space-y-6 animate-in fade-in max-w-lg mx-auto text-center">
            <h2 className="text-2xl font-semibold">Upload Your Resume</h2>
            <p className="text-muted-foreground">PDF or DOCX format. We will extract your professional fingerprint.</p>
            
            <div className="mt-8 border-2 border-dashed border-card-border rounded-apple-lg p-12 hover:border-primary/50 transition-colors relative">
              <input 
                type="file" 
                accept=".pdf,.docx" 
                onChange={handleUpload}
                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                disabled={loading}
              />
              <div className="pointer-events-none">
                {loading ? (
                  <p className="font-medium text-primary animate-pulse">Extracting Profile via AI...</p>
                ) : (
                  <>
                    <div className="w-12 h-12 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-4">
                      <svg className="w-6 h-6 text-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" /></svg>
                    </div>
                    <p className="font-medium">Click or drag file to upload</p>
                  </>
                )}
              </div>
            </div>
          </div>
        )}

        {step === 3 && profile && (
          <div className="space-y-6 animate-in fade-in">
            <h2 className="text-2xl font-semibold">Review Your Profile</h2>
            <p className="text-muted-foreground">We've extracted this from your resume. Edit as needed.</p>
            
            <div className="grid grid-cols-2 gap-6">
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium mb-1">Full Name</label>
                  <input type="text" value={profile.fullName || ''} onChange={e => setProfile({...profile, fullName: e.target.value})} className="w-full p-2 border rounded-apple bg-background" />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Headline</label>
                  <input type="text" value={profile.headline || ''} onChange={e => setProfile({...profile, headline: e.target.value})} className="w-full p-2 border rounded-apple bg-background" />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Target Seniority</label>
                  <input type="text" value={profile.targetSeniority || ''} onChange={e => setProfile({...profile, targetSeniority: e.target.value})} className="w-full p-2 border rounded-apple bg-background" />
                </div>
              </div>
              
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium mb-1">Explicit Skills (comma separated)</label>
                  <textarea rows={3} value={profile.skills.explicit.join(', ')} onChange={e => setProfile({...profile, skills: {...profile.skills, explicit: e.target.value.split(',').map(s=>s.trim())}})} className="w-full p-2 border rounded-apple bg-background" />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Inferred Skills (AI detected)</label>
                  <textarea rows={3} value={profile.skills.inferred.join(', ')} onChange={e => setProfile({...profile, skills: {...profile.skills, inferred: e.target.value.split(',').map(s=>s.trim())}})} className="w-full p-2 border rounded-apple bg-background" />
                </div>
              </div>
            </div>
          </div>
        )}

        {step === 4 && (
          <div className="space-y-6 animate-in fade-in max-w-lg mx-auto">
            <h2 className="text-2xl font-semibold">Search Preferences</h2>
            <p className="text-muted-foreground">What kind of roles are you looking for?</p>
            
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1">Target Roles (e.g., Frontend Engineer)</label>
                <input type="text" value={searchPrefs.title} onChange={e => setSearchPrefs({...searchPrefs, title: e.target.value})} className="w-full p-2 border rounded-apple bg-background" />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Locations (comma separated)</label>
                <input type="text" value={searchPrefs.locations} onChange={e => setSearchPrefs({...searchPrefs, locations: e.target.value})} className="w-full p-2 border rounded-apple bg-background" />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Work Model</label>
                <select value={searchPrefs.workModel} onChange={e => setSearchPrefs({...searchPrefs, workModel: e.target.value})} className="w-full p-2 border rounded-apple bg-background">
                  <option value="remote">Remote</option>
                  <option value="hybrid">Hybrid</option>
                  <option value="onsite">On-site</option>
                </select>
              </div>
            </div>
          </div>
        )}

        {step === 5 && (
          <div className="space-y-6 animate-in fade-in text-center max-w-lg mx-auto">
            <div className="w-16 h-16 bg-green-100 dark:bg-green-900/30 rounded-full flex items-center justify-center mx-auto mb-4">
              <svg className="w-8 h-8 text-green-600 dark:text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
            </div>
            <h2 className="text-2xl font-semibold">All Set!</h2>
            <p className="text-muted-foreground">
              Your local profile is configured. You can edit these details later in Settings.
            </p>
          </div>
        )}
      </div>

      {/* Footer / Navigation */}
      <div className="p-6 border-t border-card-border bg-sidebar flex items-center justify-between">
        <button 
          onClick={handleBack} 
          disabled={step === 0 || loading || (step === 2 && loading)} 
          className="px-6 py-2 rounded-apple font-medium text-foreground hover:bg-black/5 dark:hover:bg-white/5 disabled:opacity-50 transition-colors"
        >
          Back
        </button>
        {step !== 2 && (
          <button 
            onClick={handleNext} 
            disabled={loading || (step === 1 && !apiKey)}
            className="px-6 py-2 bg-primary text-primary-foreground rounded-apple font-medium hover:bg-primary-hover disabled:opacity-50 transition-colors flex items-center"
          >
            {loading ? 'Processing...' : step === steps.length - 1 ? 'Finish' : 'Continue'}
          </button>
        )}
      </div>
    </div>
  );
}
