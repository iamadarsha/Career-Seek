'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import {
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  ExternalLink,
  FileText,
  KeyRound,
  Lock,
  Loader2,
  MapPin,
  Search,
  ShieldCheck,
  Sparkles,
  Upload,
} from 'lucide-react';
import {
  checkApiKey,
  checkAIProviderConnection,
  continueWithLimitedAISetup,
  finishOnboarding,
  generateMasterProfile,
  getOnboardingState,
  getSystemCapabilitiesState,
  readSavedPortalCredentials,
  saveClarificationAnswers,
  saveManualResumeText,
  saveSearchProfile,
  saveSetupCredentials,
  startInitialScan,
  updateMasterProfile,
  uploadAndParseResume,
} from '@/app/actions';
import { AI_PROVIDER_CATALOG } from '@/lib/ai/providers';
import type { AIProviderName } from '@/lib/ai/types';
import { MasterProfile } from '@/lib/schemas/profile';
import { COMMON_ROLE_OPTIONS } from '@/lib/services/search-preferences';

interface OnboardingFlowProps {
  onComplete: () => void;
}

type Step = 'welcome' | 'api_key' | 'resume' | 'clarification' | 'review' | 'preferences' | 'scan';

const STEP_ORDER: Step[] = ['welcome', 'api_key', 'resume', 'clarification', 'review', 'preferences', 'scan'];

const COMPANY_TYPES = ['MNC', 'startup', 'fintech', 'SaaS', 'enterprise', 'AI-native', 'any'];
const WORK_MODELS = ['remote', 'hybrid', 'onsite', 'any'];
const primaryActionClass =
  'inline-flex min-h-12 items-center gap-2 rounded-apple bg-primary px-6 text-sm font-semibold text-white shadow-golden-sm transition hover:bg-primary-hover disabled:opacity-50';
const secondaryActionClass =
  'inline-flex min-h-11 items-center gap-2 rounded-apple border border-card-border bg-surface px-5 text-sm font-semibold text-foreground transition hover:border-foreground disabled:opacity-50';
const inputClass =
  'min-h-12 w-full rounded-apple border border-card-border bg-surface px-4 outline-none transition focus:border-primary focus:ring-4 focus:ring-[rgba(255,56,92,0.18)]';
const textareaClass =
  'w-full rounded-apple border border-card-border bg-surface p-4 outline-none transition focus:border-primary focus:ring-4 focus:ring-[rgba(255,56,92,0.18)]';

function stepFromStage(stage?: string): Step {
  if (stage === 'resume' || stage === 'analysis') return 'resume';
  if (stage === 'clarification') return 'clarification';
  if (stage === 'review') return 'review';
  if (stage === 'preferences') return 'preferences';
  if (stage === 'scan') return 'scan';
  if (stage === 'api_key') return 'api_key';
  return 'welcome';
}

function splitList(value: string) {
  return value.split(',').map((item) => item.trim()).filter(Boolean);
}

function ToggleChip({
  active,
  children,
  onClick,
}: {
  active: boolean;
  children: React.ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`min-h-11 rounded-apple border px-4 text-sm font-semibold transition-all ${
        active
          ? 'border-primary bg-primary text-primary-foreground shadow-golden-sm'
          : 'border-card-border bg-surface text-muted-foreground hover:border-primary hover:text-foreground'
      }`}
    >
      {children}
    </button>
  );
}

export function OnboardingFlow({ onComplete }: OnboardingFlowProps) {
  const pathname = usePathname();
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [step, setStep] = useState<Step>('welcome');
  const [loading, setLoading] = useState(true);
  const [busyLabel, setBusyLabel] = useState('');
  const [provider, setProvider] = useState<AIProviderName>('gemini');
  const [model, setModel] = useState(AI_PROVIDER_CATALOG.gemini.defaultModel);
  const [baseUrl, setBaseUrl] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [error, setError] = useState<{ message: string; action?: string } | null>(null);
  // Setup wizard: optional portal credentials
  const [keyValidated, setKeyValidated] = useState(false);
  const [linkedinEmail, setLinkedinEmail] = useState('');
  const [linkedinPassword, setLinkedinPassword] = useState('');
  const [naukriEmail, setNaukriEmail] = useState('');
  const [naukriPassword, setNaukriPassword] = useState('');
  const [serpApiKey, setSerpApiKey] = useState('');
  const [showLinkedIn, setShowLinkedIn] = useState(false);
  const [showNaukri, setShowNaukri] = useState(false);
  const [showSerpApi, setShowSerpApi] = useState(false);
  const [resumeId, setResumeId] = useState<number | null>(null);
  const [resumeText, setResumeText] = useState('');
  const [manualResumeText, setManualResumeText] = useState('');
  const [resumeName, setResumeName] = useState('');
  const [savedProviderConfigs, setSavedProviderConfigs] = useState<Record<string, any>>({});
  const [parserMetadata, setParserMetadata] = useState<any>(null);
  const [capabilities, setCapabilities] = useState<any>(null);
  const [analysis, setAnalysis] = useState<any>(null);
  const [profile, setProfile] = useState<MasterProfile | null>(null);
  const [profileId, setProfileId] = useState<number | null>(null);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [scanJobs, setScanJobs] = useState<any[]>([]);
  const [scanQueued, setScanQueued] = useState(false);
  const [selectedRoles, setSelectedRoles] = useState<string[]>(['AI Product Manager']);
  const [prefs, setPrefs] = useState({
    customRoles: '',
    experienceBand: '',
    expectedSalary: '',
    locations: 'Bangalore, Remote',
    workModel: 'hybrid',
    companyTypes: ['any'] as string[],
    targetCompanies: '',
    excludedCities: '',
    excludedCompanies: '',
    excludedTitles: '',
    excludedIndustries: '',
  });

  const activeStepIndex = STEP_ORDER.indexOf(step);

  useEffect(() => {
    if (pathname !== '/onboarding') {
      router.replace('/onboarding');
    }
  }, [pathname, router]);

  useEffect(() => {
    (async () => {
      const [state, caps] = await Promise.all([
        getOnboardingState(),
        getSystemCapabilitiesState(),
      ]);
      setCapabilities(caps);
      if (state.success) {
        setSavedProviderConfigs(state.config.aiProviders || {});
        setStep(stepFromStage(state.config.onboardingStage));
        const selectedProvider = (state.config.aiProvider || 'gemini') as AIProviderName;
        setProvider(selectedProvider);
        setModel(
          state.config.aiProviders?.[selectedProvider]?.model ||
          state.config.aiModel ||
          AI_PROVIDER_CATALOG[selectedProvider].defaultModel,
        );
        setBaseUrl(
          state.config.aiProviders?.[selectedProvider]?.baseUrl ||
          state.config.aiBaseUrl ||
          AI_PROVIDER_CATALOG[selectedProvider].baseUrl ||
          '',
        );
        setResumeId(state.resume?.id || null);
        setResumeName(state.resume?.filename || '');
        setParserMetadata(state.resume?.parseMetadata?.parser || null);
        setAnalysis(state.analysis || null);
        setProfile(state.profile || null);
        setProfileId(state.profileId || null);
        setAnswers(state.clarificationAnswers || {});
        if (state.searchProfile) {
          const searchProfile = state.searchProfile;
          const rawCompanyTypes = searchProfile.companyTypes || [];
          const targetCompanies = rawCompanyTypes
            .filter((item: string) => String(item).toLowerCase().startsWith('target_company:'))
            .map((item: string) => String(item).replace(/^target_company:/i, '').trim())
            .filter(Boolean);
          const companyTypes = rawCompanyTypes.filter((item: string) => !String(item).toLowerCase().startsWith('target_company:'));
          setPrefs((current) => ({
            ...current,
            experienceBand: searchProfile.experienceBand || '',
            expectedSalary: searchProfile.expectedSalary || '',
            locations: searchProfile.locations?.join(', ') || current.locations,
            workModel: searchProfile.workModel || current.workModel,
            companyTypes: companyTypes.length ? companyTypes : current.companyTypes,
            targetCompanies: targetCompanies.join(', '),
          }));
          setSelectedRoles((current) => (searchProfile.title ? [searchProfile.title] : current));
        }
      }
      setLoading(false);
    })();
  }, []);

  useEffect(() => {
    if (step !== 'scan' || !scanQueued) return;
    const poll = async () => {
      try {
        const res = await fetch('/api/jobs/active');
        if (!res.ok) return;
        const data = await res.json();
        setScanJobs(data.jobs || []);
      } catch {
        // ignore transient poll errors
      }
    };
    poll();
    const timer = setInterval(poll, 3000);
    return () => clearInterval(timer);
  }, [step, scanQueued]);

  useEffect(() => {
    if (loading) return;
    const savedProvider = savedProviderConfigs[provider] || {};
    setModel(savedProvider.model || AI_PROVIDER_CATALOG[provider].defaultModel);
    setBaseUrl(savedProvider.baseUrl || AI_PROVIDER_CATALOG[provider].baseUrl || '');
    setApiKey('');
  }, [provider, loading, savedProviderConfigs]);

  const needsClarification = Boolean(analysis?.needsClarification && analysis?.clarificationQuestions?.length);
  const selectedProviderMeta = AI_PROVIDER_CATALOG[provider];
  const confidenceTone = useMemo(() => {
    const confidence = Number(analysis?.confidence || parserMetadata?.confidence || 0);
    if (confidence >= 82) return 'text-foreground bg-block-gold border-sunshine-300';
    if (confidence >= 65) return 'text-warning bg-warning-bg border-warning-border';
    return 'text-danger bg-danger-bg border-danger-border';
  }, [analysis, parserMetadata]);

  const handleValidateKey = async () => {
    setError(null);
    setBusyLabel('Checking your AI setup');
    const res = provider === 'gemini'
      ? await checkApiKey(apiKey)
      : await checkAIProviderConnection({
          provider,
          apiKey: apiKey.trim() || undefined,
          model: model.trim() || undefined,
          baseUrl: baseUrl.trim() || undefined,
        });
    setBusyLabel('');
    if (!res.success) {
      setError({ message: res.message, action: res.action });
      return;
    }
    // Pre-fill previously saved portal credentials (emails only, not passwords)
    try {
      const saved = await readSavedPortalCredentials();
      if (saved.linkedinEmail) setLinkedinEmail(saved.linkedinEmail);
      if (saved.naukriEmail) setNaukriEmail(saved.naukriEmail);
      if (saved.hasSerpApi) setShowSerpApi(true);
    } catch { /* non-critical */ }
    setKeyValidated(true);
  };

  const handleSaveAll = async () => {
    setBusyLabel('Saving…');
    setError(null);
    const res = await saveSetupCredentials({
      aiProvider: provider,
      aiKey: apiKey,
      aiModel: model,
      aiBaseUrl: baseUrl || undefined,
      linkedinEmail: linkedinEmail || undefined,
      linkedinPassword: linkedinPassword || undefined,
      naukriEmail: naukriEmail || undefined,
      naukriPassword: naukriPassword || undefined,
      serpApiKey: serpApiKey || undefined,
    });
    setBusyLabel('');
    if (!res.success) {
      setError({ message: res.error || 'Failed to save credentials' });
      return;
    }
    setStep('resume');
  };

  const handleContinueWithoutProvider = async () => {
    setError(null);
    setBusyLabel('Saving local-only setup');
    await continueWithLimitedAISetup(provider);
    setBusyLabel('');
    setStep('resume');
  };

  const handleUpload = async (file: File) => {
    setError(null);
    setBusyLabel('Parsing resume');
    const formData = new FormData();
    formData.append('resume', file);
    const upload = await uploadAndParseResume(formData);
    if (!upload.success) {
      setBusyLabel('');
      setError({ message: 'error' in upload ? upload.error || 'Resume upload failed' : 'Resume upload failed' });
      return;
    }

    setResumeId(upload.id || null);
    setResumeText(upload.text || '');
    setResumeName(file.name);
    setParserMetadata(upload.metadata || null);

    if (upload.metadata?.needsManualRecovery) {
      setBusyLabel('');
      setError({
        message: upload.metadata?.recoveryMessage || 'This resume extraction is too weak to trust for AI resume reading.',
        action: upload.metadata?.ocr?.available === false
          ? upload.metadata?.ocrInstallHint || 'OCR tools are not available locally. Upload a clearer PDF/DOCX, or paste the resume text below.'
          : 'Paste resume text below, or upload a clearer PDF/DOCX before continuing.',
      });
      return;
    }

    setBusyLabel('Reading your resume');
    const extracted = await generateMasterProfile(apiKey, upload.text, upload.id);
    setBusyLabel('');

    if (!extracted.success) {
      setError({ message: 'error' in extracted ? extracted.error || 'Resume analysis failed' : 'Resume analysis failed' });
      return;
    }

    setProfile(extracted.profile || null);
    setProfileId(extracted.id || null);
    setAnalysis(extracted.analysis || null);
    setStep(extracted.analysis?.needsClarification ? 'clarification' : 'review');
  };

  const handleContinueAnalysis = async () => {
    if (!resumeId) return;
    setError(null);
    setBusyLabel('Reading your saved resume');
    const extracted = await generateMasterProfile(apiKey || undefined, resumeText || undefined, resumeId);
    setBusyLabel('');

    if (!extracted.success) {
      setError({ message: 'error' in extracted ? extracted.error || 'Resume analysis failed' : 'Resume analysis failed' });
      return;
    }

    setProfile(extracted.profile || null);
    setProfileId(extracted.id || null);
    setAnalysis(extracted.analysis || null);
    setStep(extracted.analysis?.needsClarification ? 'clarification' : 'review');
  };

  const handleManualResumeContinue = async () => {
    if (!resumeId) return;
    setError(null);
    setBusyLabel('Saving pasted resume text');
    const saved = await saveManualResumeText(resumeId, manualResumeText);
    if (!saved.success) {
      setBusyLabel('');
      setError({ message: 'error' in saved ? saved.error || 'Could not save pasted resume text.' : 'Could not save pasted resume text.' });
      return;
    }

    setResumeText(saved.text || manualResumeText);
    setBusyLabel('Reading your resume');
    const extracted = await generateMasterProfile(apiKey, saved.text || manualResumeText, resumeId);
    setBusyLabel('');

    if (!extracted.success) {
      setError({ message: 'error' in extracted ? extracted.error || 'Resume analysis failed' : 'Resume analysis failed' });
      return;
    }

    setProfile(extracted.profile || null);
    setProfileId(extracted.id || null);
    setAnalysis(extracted.analysis || null);
    setStep(extracted.analysis?.needsClarification ? 'clarification' : 'review');
  };

  const handleClarificationContinue = async () => {
    if (!resumeId) return;
    setBusyLabel('Saving clarification answers');
    const res = await saveClarificationAnswers(resumeId, answers);
    setBusyLabel('');
    if (!res.success) {
      setError({ message: 'error' in res ? res.error || 'Could not save answers' : 'Could not save answers' });
      return;
    }
    setStep('review');
  };

  const handleProfileContinue = async () => {
    if (!profile || !profileId) return;
    setBusyLabel('Saving profile');
    const res = await updateMasterProfile(profileId, profile);
    setBusyLabel('');
    if (!res.success) {
      setError({ message: 'Could not save your profile edits.' });
      return;
    }
    setStep('preferences');
  };

  const toggleRole = (role: string) => {
    setSelectedRoles((current) =>
      current.includes(role) ? current.filter((item) => item !== role) : [...current, role]
    );
  };

  const toggleCompanyType = (type: string) => {
    setPrefs((current) => {
      const next = current.companyTypes.includes(type)
        ? current.companyTypes.filter((item) => item !== type)
        : [...current.companyTypes.filter((item) => type === 'any' ? false : item !== 'any'), type];
      return { ...current, companyTypes: next.length ? next : ['any'] };
    });
  };

  const handleStartScan = async () => {
    setError(null);
    if (!selectedRoles.length && !prefs.customRoles.trim()) {
      setError({ message: 'Choose at least one role or type a custom role.' });
      return;
    }
    setBusyLabel('Saving search preferences');
    const saved = await saveSearchProfile({
      selectedRoles,
      customRoles: prefs.customRoles,
      experienceBand: prefs.experienceBand,
      expectedSalary: prefs.expectedSalary,
      locations: prefs.locations,
      workModel: prefs.workModel,
      companyTypes: prefs.companyTypes,
      targetCompanies: prefs.targetCompanies,
      excludedCities: prefs.excludedCities,
      excludedCompanies: prefs.excludedCompanies,
      excludedTitles: prefs.excludedTitles,
      excludedIndustries: prefs.excludedIndustries,
    });
    if (!saved.success) {
      setBusyLabel('');
      setError({ message: 'Could not save search preferences.' });
      return;
    }

    setBusyLabel('Queueing your first India-focused source scan');
    const scan = await startInitialScan();
    setBusyLabel('');
    if (!scan.success) {
      setError({ message: 'error' in scan ? scan.error || 'Could not start scan.' : 'Could not start scan.' });
      return;
    }
    if (capabilities?.has_browser === false) {
      onComplete();
    } else {
      setScanQueued(true);
    }
  };

  const handleBack = () => {
    setError(null);
    const idx = STEP_ORDER.indexOf(step);
    if (idx <= 0) return;
    let prev = STEP_ORDER[idx - 1];
    // Skip clarification when going back if it was never needed
    if (prev === 'clarification' && !needsClarification) {
      prev = STEP_ORDER[idx - 2];
    }
    setStep(prev);
  };

  if (loading) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-background">
        <div className="apple-card px-8 py-6 text-center" role="status" aria-live="polite">
          <Loader2 className="mx-auto h-6 w-6 animate-spin text-primary" />
          <p className="mt-3 text-sm font-medium text-muted-foreground">Recovering your setup progress...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-background" role="dialog" aria-modal="true" aria-labelledby="onboarding-step-title">
      <div className="mx-auto grid min-h-screen max-w-7xl gap-6 px-4 py-5 md:grid-cols-[20rem_1fr] md:px-8 md:py-8">
        <aside className="apple-card p-5 md:sticky md:top-8 md:h-[calc(100vh-4rem)]">
          <div className="mb-8 flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-sm bg-primary text-primary-foreground shadow-golden-sm">
              <Sparkles className="h-5 w-5" />
            </div>
            <div>
              <h1 className="text-lg font-semibold">Guided setup</h1>
              <p className="text-sm text-muted-foreground">Resume, AI setup, job goals</p>
            </div>
          </div>
          <div className="mistral-blocks mb-6 h-2 rounded-sm" aria-hidden="true" />

          <div className="space-y-3">
            {[
              ['welcome', 'Welcome', 'What the app will do'],
              ['api_key', 'AI helper', 'Pick a provider or stay local'],
              ['resume', 'Resume upload', 'Add your latest file'],
              ['clarification', 'Clarify', 'Only if details are unclear'],
              ['review', 'Profile review', 'Edit what affects matching'],
              ['preferences', 'Job goals', 'Roles, salary, locations'],
              ['scan', 'Find jobs', 'Start your first search'],
            ].map(([id, title, desc], index) => (
              <div
                key={id}
                aria-current={id === step ? 'step' : undefined}
                className={`flex gap-3 rounded-md p-3 transition ${
                  STEP_ORDER.indexOf(id as Step) <= activeStepIndex ? 'bg-secondary' : 'bg-transparent'
                }`}
              >
                <div className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-sm text-xs font-semibold ${
                  STEP_ORDER.indexOf(id as Step) < activeStepIndex
                    ? 'bg-foreground text-sunshine-300'
                    : id === step
                      ? 'bg-primary text-white'
                      : 'bg-muted text-muted-foreground'
                }`}>
                  {STEP_ORDER.indexOf(id as Step) < activeStepIndex ? <CheckCircle2 className="h-4 w-4" /> : index + 1}
                </div>
                <div>
                  <p className="text-sm font-semibold">{title}</p>
                  <p className="text-xs text-muted-foreground">{desc}</p>
                </div>
              </div>
            ))}
          </div>
        </aside>

        <main className="flex min-h-[calc(100vh-2.5rem)] items-center">
          <motion.section
            key={step}
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.25 }}
            className="golden-card w-full p-6 md:p-10"
          >
            {activeStepIndex > 0 && step !== 'scan' && (
              <button
                type="button"
                onClick={handleBack}
                disabled={!!busyLabel}
                className="mb-6 inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground transition hover:text-foreground disabled:opacity-40"
              >
                <ArrowLeft className="h-4 w-4" />
                Back
              </button>
            )}

            {busyLabel && (
              <div className="mb-5 flex items-center gap-3 rounded-md border border-sunshine-300 bg-secondary px-4 py-3 text-sm font-medium text-foreground" role="status" aria-live="polite">
                <Loader2 className="h-4 w-4 animate-spin" />
                {busyLabel}
              </div>
            )}

            {error && (
              <div className="mb-5 rounded-md border border-danger-border bg-danger-bg p-4 text-sm text-danger" role="alert">
                <div className="flex gap-2 font-semibold">
                  <AlertCircle className="h-4 w-4 shrink-0" />
                  {error.message}
                </div>
                {error.action && <p className="mt-2 pl-6 text-danger">{error.action}</p>}
              </div>
            )}

            {step === 'welcome' && (
              <div className="max-w-3xl">
                <div className="mb-8 inline-flex items-center gap-2 rounded-sm border border-sunshine-300 bg-secondary px-3 py-1 text-xs font-semibold uppercase text-foreground">
                  Local-first AI job search for India
                </div>
                <h2 id="onboarding-step-title" className="text-4xl font-semibold md:text-6xl">Start with your resume, then let the search follow.</h2>
                <p className="mt-5 max-w-2xl text-lg leading-8 text-muted-foreground">
                  Career Seek understands your resume, asks only the questions that improve matching, then ranks India-focused jobs against your real profile using whichever AI setup you prefer.
                </p>
                <div className="mt-8 grid gap-4 md:grid-cols-3">
                  {[
                    { icon: ShieldCheck, title: 'Private by default', body: 'Files, settings, and generated docs live locally.' },
                    { icon: FileText, title: 'Resume-first', body: 'No generic dashboard until your profile is understood.' },
                    { icon: Search, title: 'Useful matches', body: 'If one job source fails, Career Seek keeps looking elsewhere.' },
                  ].map((item) => (
                    <div key={item.title} className="rounded-md border border-card-border bg-surface-container-low p-5">
                      <item.icon className="h-5 w-5 text-primary" />
                      <p className="mt-4 font-semibold">{item.title}</p>
                      <p className="mt-2 text-sm leading-6 text-muted-foreground">{item.body}</p>
                    </div>
                  ))}
                </div>
                <button
                  type="button"
                  onClick={() => setStep('api_key')}
                  className={`mt-8 ${primaryActionClass}`}
                >
                  Choose my AI setup <ArrowRight className="h-4 w-4" />
                </button>
              </div>
            )}

            {step === 'api_key' && (
              <div className="max-w-2xl">
                {/* ── Phase 1: AI provider setup ─────────────────────────── */}
                {!keyValidated && (
                  <form
                    onSubmit={(event) => {
                      event.preventDefault();
                      if (!busyLabel) handleValidateKey();
                    }}
                  >
                    <KeyRound className="mb-5 h-10 w-10 text-primary" />
                    <h2 id="onboarding-step-title" className="text-4xl font-semibold">Choose how Career Seek should think</h2>
                    <p className="mt-3 text-muted-foreground">
                      Pick a cloud model, a local Ollama model, or a custom OpenAI-compatible endpoint. Your key is stored locally and never sent anywhere except the AI provider.
                    </p>
                    <div className="mt-6 grid gap-3 sm:grid-cols-3">
                      {['Resume reading', 'Job fit scoring', 'Tailored documents'].map((item) => (
                        <div key={item} className="rounded-md border border-card-border bg-surface-container-low px-3 py-2 text-sm font-semibold text-foreground">
                          {item}
                        </div>
                      ))}
                    </div>
                    <div className="mt-8 grid gap-4 md:grid-cols-2">
                      <label className="space-y-2">
                        <span className="text-sm font-semibold">Provider</span>
                        <select value={provider} onChange={(event) => setProvider(event.target.value as AIProviderName)} className={inputClass}>
                          {Object.entries(AI_PROVIDER_CATALOG).map(([value, meta]) => (
                            <option key={value} value={value}>{meta.label}</option>
                          ))}
                        </select>
                      </label>
                      <label className="space-y-2">
                        <span className="text-sm font-semibold">Model</span>
                        {selectedProviderMeta.models ? (
                          <select value={model} onChange={(event) => setModel(event.target.value)} className={inputClass}>
                            {selectedProviderMeta.models.map((m) => (
                              <option key={m.id} value={m.id}>{m.label}{m.note ? ` — ${m.note}` : ''}</option>
                            ))}
                          </select>
                        ) : (
                          <input value={model} onChange={(event) => setModel(event.target.value)} placeholder={selectedProviderMeta.defaultModel} className={`${inputClass} font-mono text-sm`} />
                        )}
                      </label>
                    </div>
                    {provider !== 'gemini' && (
                      <div className="mt-4 space-y-2">
                        <label htmlFor="provider-base-url" className="text-sm font-semibold">Base URL</label>
                        <input id="provider-base-url" value={baseUrl} onChange={(event) => setBaseUrl(event.target.value)} placeholder={selectedProviderMeta.baseUrlPlaceholder || selectedProviderMeta.baseUrl || ''} className={`${inputClass} font-mono text-sm`} />
                      </div>
                    )}
                    <div className="mt-8 space-y-3">
                      <div className="flex items-center justify-between">
                        <label htmlFor="provider-api-key" className="text-sm font-semibold">
                          {selectedProviderMeta.requiresApiKey ? `${selectedProviderMeta.label} API key` : 'Optional token'}
                        </label>
                        {selectedProviderMeta.docsUrl && (
                          <a href={selectedProviderMeta.docsUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-sm font-semibold text-primary">
                            Get a free key <ExternalLink className="h-3.5 w-3.5" />
                          </a>
                        )}
                      </div>
                      <input
                        id="provider-api-key"
                        type="password"
                        value={apiKey}
                        onChange={(event) => setApiKey(event.target.value)}
                        placeholder={selectedProviderMeta.requiresApiKey ? `Paste your ${selectedProviderMeta.label} API key` : 'Leave blank unless your local endpoint needs a token'}
                        className={`${inputClass} min-h-14 font-mono text-sm`}
                      />
                      <p className="text-sm text-muted-foreground">{selectedProviderMeta.helpText}</p>
                    </div>
                    <div className="mt-8 flex flex-wrap gap-3">
                      <button type="submit" disabled={Boolean(busyLabel)} className={primaryActionClass}>
                        {busyLabel ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                        Test key &amp; continue <ArrowRight className="h-4 w-4" />
                      </button>
                      <button type="button" onClick={handleContinueWithoutProvider} disabled={Boolean(busyLabel)} className={secondaryActionClass}>
                        Continue without AI
                      </button>
                    </div>
                  </form>
                )}

                {/* ── Phase 2: Credentials confirmed + optional portals ──── */}
                {keyValidated && (
                  <div className="space-y-6">
                    <div>
                      <h2 id="onboarding-step-title" className="text-4xl font-semibold">AI is ready</h2>
                      <p className="mt-3 text-muted-foreground">
                        Optionally unlock more job sources with portal credentials. Everything stays on your machine.
                      </p>
                    </div>

                    {/* Confirmed AI badge */}
                    <div className="flex items-center justify-between rounded-md border border-card-border bg-surface p-4">
                      <div className="flex items-center gap-3">
                        <CheckCircle2 className="h-5 w-5 flex-shrink-0 text-green-500" />
                        <div>
                          <p className="font-semibold">{selectedProviderMeta.label} — {model}</p>
                          <p className="text-sm text-muted-foreground">Key validated and saved</p>
                        </div>
                      </div>
                      <button type="button" onClick={() => { setKeyValidated(false); setError(null); }} className="text-sm font-semibold text-primary hover:underline">
                        Change
                      </button>
                    </div>

                    {/* Section header */}
                    <div className="rounded-md border border-card-border bg-surface-container-low px-4 py-3">
                      <p className="text-sm font-semibold">Boost job sources <span className="font-normal text-muted-foreground">— optional, skip if you prefer</span></p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        Credentials are stored in your local app data folder and in <code className="rounded bg-card px-1">.env.local</code>. They never leave your machine.
                      </p>
                    </div>

                    {/* LinkedIn card */}
                    <div className="rounded-md border border-card-border bg-surface">
                      <button
                        type="button"
                        onClick={() => setShowLinkedIn((v) => !v)}
                        className="flex w-full items-center justify-between p-4 text-left"
                      >
                        <div className="flex items-center gap-3">
                          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-blue-100 text-sm font-bold text-blue-700">in</div>
                          <div>
                            <p className="font-semibold">LinkedIn</p>
                            <p className="text-xs text-muted-foreground">Authenticated search · ~3× more results vs public view</p>
                          </div>
                        </div>
                        {showLinkedIn ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
                      </button>
                      {showLinkedIn && (
                        <div className="border-t border-card-border p-4 space-y-3">
                          <p className="text-sm text-muted-foreground">Career Seek logs in once per session using a headless browser. Your credentials never leave this machine.</p>
                          <div className="grid gap-3 sm:grid-cols-2">
                            <label className="space-y-1.5">
                              <span className="text-sm font-semibold">Email</span>
                              <input type="email" value={linkedinEmail} onChange={(e) => setLinkedinEmail(e.target.value)} placeholder="you@example.com" className={inputClass} autoComplete="off" />
                            </label>
                            <label className="space-y-1.5">
                              <span className="text-sm font-semibold">Password</span>
                              <div className="relative">
                                <Lock className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                                <input type="password" value={linkedinPassword} onChange={(e) => setLinkedinPassword(e.target.value)} placeholder="LinkedIn password" className={`${inputClass} pl-9`} autoComplete="new-password" />
                              </div>
                            </label>
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Naukri card */}
                    <div className="rounded-md border border-card-border bg-surface">
                      <button
                        type="button"
                        onClick={() => setShowNaukri((v) => !v)}
                        className="flex w-full items-center justify-between p-4 text-left"
                      >
                        <div className="flex items-center gap-3">
                          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-orange-100 text-sm font-bold text-orange-600">N</div>
                          <div>
                            <p className="font-semibold">Naukri</p>
                            <p className="text-xs text-muted-foreground">Profile-based recommendations · India's largest job board</p>
                          </div>
                        </div>
                        {showNaukri ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
                      </button>
                      {showNaukri && (
                        <div className="border-t border-card-border p-4 space-y-3">
                          <p className="text-sm text-muted-foreground">Unlocks Naukri's authenticated listings and profile-matched recommendations.</p>
                          <div className="grid gap-3 sm:grid-cols-2">
                            <label className="space-y-1.5">
                              <span className="text-sm font-semibold">Email</span>
                              <input type="email" value={naukriEmail} onChange={(e) => setNaukriEmail(e.target.value)} placeholder="you@example.com" className={inputClass} autoComplete="off" />
                            </label>
                            <label className="space-y-1.5">
                              <span className="text-sm font-semibold">Password</span>
                              <div className="relative">
                                <Lock className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                                <input type="password" value={naukriPassword} onChange={(e) => setNaukriPassword(e.target.value)} placeholder="Naukri password" className={`${inputClass} pl-9`} autoComplete="new-password" />
                              </div>
                            </label>
                          </div>
                        </div>
                      )}
                    </div>

                    {/* SerpAPI card */}
                    <div className="rounded-md border border-card-border bg-surface">
                      <button
                        type="button"
                        onClick={() => setShowSerpApi((v) => !v)}
                        className="flex w-full items-center justify-between p-4 text-left"
                      >
                        <div className="flex items-center gap-3">
                          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-green-100 text-sm font-bold text-green-700">G</div>
                          <div>
                            <p className="font-semibold">Google Jobs via SerpAPI</p>
                            <p className="text-xs text-muted-foreground">Free · 100 searches/month · no CAPTCHA blocks</p>
                          </div>
                        </div>
                        {showSerpApi ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
                      </button>
                      {showSerpApi && (
                        <div className="border-t border-card-border p-4 space-y-4">
                          <div className="rounded-md bg-surface-container-low p-4">
                            <p className="text-sm font-semibold mb-2">How to get your free key</p>
                            <ol className="space-y-1.5 text-sm text-muted-foreground list-decimal list-inside">
                              <li>Visit <a href="https://serpapi.com" target="_blank" rel="noreferrer" className="font-semibold text-primary hover:underline inline-flex items-center gap-0.5">serpapi.com <ExternalLink className="h-3 w-3" /></a> and click <strong>Get Started Free</strong></li>
                              <li>Sign up with your email — no credit card needed</li>
                              <li>Copy your API key from the Dashboard page</li>
                              <li>Paste it below</li>
                            </ol>
                            <p className="mt-2 text-xs text-muted-foreground">Free tier: 100 searches/month — plenty for daily job hunting.</p>
                          </div>
                          <label className="block space-y-1.5">
                            <span className="text-sm font-semibold">SerpAPI key</span>
                            <input type="password" value={serpApiKey} onChange={(e) => setSerpApiKey(e.target.value)} placeholder="Paste your SerpAPI key" className={`${inputClass} font-mono text-sm`} autoComplete="off" />
                          </label>
                        </div>
                      )}
                    </div>

                    {/* Actions */}
                    <div className="flex flex-wrap gap-3 pt-1">
                      <button type="button" onClick={handleSaveAll} disabled={Boolean(busyLabel)} className={primaryActionClass}>
                        {busyLabel ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                        Save &amp; continue <ArrowRight className="h-4 w-4" />
                      </button>
                      <button type="button" onClick={() => setStep('resume')} disabled={Boolean(busyLabel)} className={secondaryActionClass}>
                        Skip for now
                      </button>
                    </div>
                  </div>
                )}

                {/* Error display (both phases) */}
                {error && (
                  <div className="mt-5 rounded-md border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm">
                    <p className="font-semibold text-destructive">{error.message}</p>
                    {error.action && <p className="mt-1 text-muted-foreground">{error.action}</p>}
                  </div>
                )}
              </div>
            )}

            {step === 'resume' && (
              <div className="max-w-3xl">
                <FileText className="mb-5 h-10 w-10 text-primary" />
                <h2 id="onboarding-step-title" className="text-4xl font-semibold">Upload your current resume</h2>
                <p className="mt-3 text-muted-foreground">
                  Use your latest resume, even if it is imperfect. We support PDF and DOCX and will flag weak extraction, scanned PDFs, broken dates, and layout issues.
                </p>
                {capabilities?.has_ocr === false && (
                  <div className="mt-5 rounded-md border border-warning-border bg-warning-bg px-4 py-3 text-sm text-warning" role="status">
                    OCR tools are unavailable. PDF uploads will rely on basic text extraction; scanned PDFs may need manual paste recovery.
                  </div>
                )}
                <div
                  role="button"
                  tabIndex={0}
                  aria-label="Choose or drop a PDF or DOCX resume file"
                  onClick={() => fileInputRef.current?.click()}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault();
                      fileInputRef.current?.click();
                    }
                  }}
                  onDragOver={(event) => event.preventDefault()}
                  onDrop={(event) => {
                    event.preventDefault();
                    const file = event.dataTransfer.files?.[0];
                    if (file) handleUpload(file);
                  }}
                  className="mt-8 cursor-pointer rounded-md border-2 border-dashed border-sunshine-300 bg-secondary p-8 text-center transition hover:border-primary hover:bg-surface-high"
                >
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                    className="hidden"
                    onChange={(event) => {
                      const file = event.target.files?.[0];
                      if (file) handleUpload(file);
                    }}
                  />
                  <Upload className="mx-auto h-10 w-10 text-primary" />
                  <p className="mt-4 text-lg font-semibold">{resumeName || 'Choose a resume file'}</p>
                  <p className="mt-1 text-sm text-muted-foreground">PDF or DOCX, stored locally after upload</p>
                </div>
                {resumeId && resumeName && !parserMetadata?.needsManualRecovery && (
                  <div className="mt-5 rounded-md border border-sunshine-300 bg-secondary p-5">
                    <p className="font-semibold text-foreground">Uploaded resume is ready for AI reading</p>
                    <p className="mt-2 text-sm leading-6 text-muted-foreground">
                      If the page refreshed after upload, continue from the saved local resume instead of uploading again.
                    </p>
                    <button
                      type="button"
                      onClick={handleContinueAnalysis}
                      disabled={Boolean(busyLabel)}
                      className={`mt-4 ${primaryActionClass}`}
                    >
                      {profile ? 'Re-analyze with this resume' : 'Analyze saved resume'} <ArrowRight className="h-4 w-4" />
                    </button>
                  </div>
                )}
                {parserMetadata && (
                  <div className={`mt-5 rounded-md border px-4 py-3 text-sm ${confidenceTone}`}>
                    Extraction confidence: {parserMetadata.confidence}%.
                    {[...(parserMetadata.issues || []), ...(parserMetadata.warnings || [])].slice(0, 2).map((issue: string) => ` ${issue}`)}
                  </div>
                )}
                {parserMetadata?.needsManualRecovery && (
                  <div className="mt-5 rounded-md border border-warning-border bg-warning-bg p-5">
                    <p className="font-semibold text-warning">Manual recovery needed</p>
                    <p className="mt-2 text-sm leading-6 text-warning">
                      {parserMetadata.recoveryMessage || 'We will not use this weak extraction for AI resume reading. Paste the resume text here, or upload a clearer PDF/DOCX.'}
                    </p>
                    {parserMetadata.requiresOcr && parserMetadata.ocrInstallHint && (
                      <p className="mt-2 rounded-md border border-warning-border bg-surface px-3 py-2 text-xs font-semibold text-warning">
                        {parserMetadata.ocrInstallHint}
                      </p>
                    )}
                    {parserMetadata.ocr && (
                      <p className="mt-2 text-xs text-warning">
                        OCR attempted: {parserMetadata.ocr.attempted ? 'yes' : 'no'} · available: {parserMetadata.ocr.available ? 'yes' : 'no'} · result: {parserMetadata.ocr.succeeded ? 'usable' : parserMetadata.ocr.error || 'not usable'}
                      </p>
                    )}
                    <textarea
                      value={manualResumeText}
                      onChange={(event) => setManualResumeText(event.target.value)}
                      rows={8}
                      className={`${textareaClass} mt-4 border-warning-border text-sm`}
                      placeholder="Paste your resume text here..."
                    />
                    <p className="mt-2 text-xs text-warning">{manualResumeText.trim().length}/500 characters needed</p>
                    <button
                      type="button"
                      onClick={handleManualResumeContinue}
                      disabled={manualResumeText.trim().length < 500 || Boolean(busyLabel)}
                      className={`mt-4 ${primaryActionClass}`}
                    >
                      Read pasted resume text <ArrowRight className="h-4 w-4" />
                    </button>
                  </div>
                )}
              </div>
            )}

            {step === 'clarification' && (
              <div className="max-w-4xl">
                <Sparkles className="mb-5 h-10 w-10 text-primary" />
                <h2 id="onboarding-step-title" className="text-4xl font-semibold">Add the missing context</h2>
                <p className="mt-3 text-muted-foreground">
                  These answers help Career Seek avoid weak matches and tailor your documents more accurately.
                </p>
                <div className={`mt-5 rounded-md border px-4 py-3 text-sm ${confidenceTone}`}>
                  Confidence: {analysis?.confidence || parserMetadata?.confidence || 0}%. {analysis?.confidenceNotes}
                </div>
                <div className="mt-6 space-y-4">
                  {analysis?.clarificationQuestions?.map((question: any) => (
                    <label key={question.id} className="block rounded-md border border-card-border bg-surface p-5">
                      <span className="block font-semibold">{question.question}</span>
                      <span className="mt-1 block text-sm text-muted-foreground">{question.reason}</span>
                      <textarea
                        value={answers[question.id] || ''}
                        onChange={(event) => setAnswers((current) => ({ ...current, [question.id]: event.target.value }))}
                        rows={2}
                        className={`${textareaClass} mt-4 bg-surface-container-low p-3 text-sm`}
                        placeholder="Type your answer"
                      />
                    </label>
                  ))}
                </div>
                <button
                  type="button"
                  onClick={handleClarificationContinue}
                  disabled={Boolean(busyLabel)}
                  className={`mt-8 ${primaryActionClass}`}
                >
                  Save answers and review profile <ArrowRight className="h-4 w-4" />
                </button>
              </div>
            )}

            {step === 'review' && profile && (
              <div>
                <div className="flex flex-col justify-between gap-4 md:flex-row md:items-start">
                  <div>
                    <h2 id="onboarding-step-title" className="text-4xl font-semibold">Review your job profile</h2>
                    <p className="mt-3 max-w-2xl text-muted-foreground">
                      Edit anything that would change matching: current title, years of experience, skills, city, and strengths.
                    </p>
                  </div>
                  <div className={`rounded-md border px-3 py-1 text-sm font-semibold ${confidenceTone}`}>
                    {analysis?.confidence || parserMetadata?.confidence || 0}% confidence
                  </div>
                </div>

                <div className="mt-8 grid gap-5 md:grid-cols-2">
                  <label className="space-y-2">
                    <span className="text-sm font-semibold">Full name</span>
                    <input value={profile.fullName || ''} onChange={(event) => setProfile({ ...profile, fullName: event.target.value })} className={inputClass} />
                  </label>
                  <label className="space-y-2">
                    <span className="text-sm font-semibold">Current / latest headline</span>
                    <input value={profile.headline || ''} onChange={(event) => setProfile({ ...profile, headline: event.target.value })} className={inputClass} />
                  </label>
                  <label className="space-y-2">
                    <span className="text-sm font-semibold">Years of experience</span>
                    <input type="number" value={profile.yearsOfExperience || ''} onChange={(event) => setProfile({ ...profile, yearsOfExperience: Number(event.target.value || 0) })} className={inputClass} />
                  </label>
                  <label className="space-y-2">
                    <span className="text-sm font-semibold">Target seniority</span>
                    <input value={profile.targetSeniority || ''} onChange={(event) => setProfile({ ...profile, targetSeniority: event.target.value })} className={inputClass} />
                  </label>
                  <label className="space-y-2 md:col-span-2">
                    <span className="text-sm font-semibold">Explicit skills</span>
                    <textarea rows={3} value={(profile.skills?.explicit || []).join(', ')} onChange={(event) => setProfile({ ...profile, skills: { ...(profile.skills || { inferred: [] }), explicit: splitList(event.target.value) } })} className={textareaClass} />
                  </label>
                  <label className="space-y-2 md:col-span-2">
                    <span className="text-sm font-semibold">Projects / strengths to emphasize</span>
                    <textarea rows={3} value={(profile.strengths || []).join(', ')} onChange={(event) => setProfile({ ...profile, strengths: splitList(event.target.value) })} className={textareaClass} />
                  </label>
                </div>
                {needsClarification && (
                  <button type="button" onClick={() => setStep('clarification')} className={`mt-6 ${secondaryActionClass}`}>
                    Update clarification answers
                  </button>
                )}
                <button
                  type="button"
                  onClick={handleProfileContinue}
                  disabled={Boolean(busyLabel)}
                  className={`mt-8 ${primaryActionClass}`}
                >
                  Save profile and choose jobs <ArrowRight className="h-4 w-4" />
                </button>
              </div>
            )}

            {step === 'preferences' && (
              <div>
                <h2 id="onboarding-step-title" className="text-4xl font-semibold">Choose the jobs worth finding</h2>
                <p className="mt-3 max-w-3xl text-muted-foreground">
                  Pick target roles, add anything missing, then set salary, location, work mode, and company preferences so the first search starts in the right place.
                </p>

                <div className="mt-8 space-y-7">
                  <section>
                    <p className="mb-3 text-sm font-semibold">Preferred roles</p>
                    <div className="mb-3 grid gap-3 md:grid-cols-[18rem_1fr]">
                      <select
                        value=""
                        onChange={(event) => {
                          if (event.target.value) toggleRole(event.target.value);
                        }}
                        className={`${inputClass} text-sm font-semibold`}
                      >
                        <option value="">Add role from dropdown</option>
                        {COMMON_ROLE_OPTIONS.map((role) => (
                          <option key={role} value={role}>
                            {selectedRoles.includes(role) ? `${role} (selected)` : role}
                          </option>
                        ))}
                      </select>
                      <input
                        value={prefs.customRoles}
                        onChange={(event) => setPrefs({ ...prefs, customRoles: event.target.value })}
                        placeholder="Other roles, comma-separated"
                        className={inputClass}
                      />
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {COMMON_ROLE_OPTIONS.map((role) => (
                        <ToggleChip key={role} active={selectedRoles.includes(role)} onClick={() => toggleRole(role)}>
                          {role}
                        </ToggleChip>
                      ))}
                    </div>
                  </section>

                  <div className="grid gap-5 md:grid-cols-3">
                    <label className="space-y-2">
                      <span className="text-sm font-semibold">Experience band</span>
                      <input value={prefs.experienceBand} onChange={(event) => setPrefs({ ...prefs, experienceBand: event.target.value })} placeholder="3-6 years" className={inputClass} />
                    </label>
                    <label className="space-y-2">
                      <span className="text-sm font-semibold">Expected salary</span>
                      <input value={prefs.expectedSalary} onChange={(event) => setPrefs({ ...prefs, expectedSalary: event.target.value })} placeholder="₹25-35 LPA" className={inputClass} />
                    </label>
                    <label className="space-y-2">
                      <span className="text-sm font-semibold">Preferred locations</span>
                      <div className="relative">
                        <MapPin className="absolute left-3 top-3.5 h-4 w-4 text-muted-foreground" />
                        <input value={prefs.locations} onChange={(event) => setPrefs({ ...prefs, locations: event.target.value })} placeholder="Bangalore, Remote" className={`${inputClass} pl-10 pr-4`} />
                      </div>
                    </label>
                  </div>

                  <section>
                    <p className="mb-3 text-sm font-semibold">Remote / hybrid / onsite</p>
                    <div className="flex flex-wrap gap-2">
                      {WORK_MODELS.map((mode) => (
                        <ToggleChip key={mode} active={prefs.workModel === mode} onClick={() => setPrefs({ ...prefs, workModel: mode })}>
                          {mode}
                        </ToggleChip>
                      ))}
                    </div>
                  </section>

                  <section>
                    <p className="mb-3 text-sm font-semibold">Preferred company types</p>
                    <div className="flex flex-wrap gap-2">
                      {COMPANY_TYPES.map((type) => (
                        <ToggleChip key={type} active={prefs.companyTypes.includes(type)} onClick={() => toggleCompanyType(type)}>
                          {type}
                        </ToggleChip>
                      ))}
                    </div>
                  </section>

                  <label className="space-y-2">
                    <span className="text-sm font-semibold">Target companies (optional)</span>
                    <input
                      value={prefs.targetCompanies}
                      onChange={(event) => setPrefs({ ...prefs, targetCompanies: event.target.value })}
                      placeholder="Google India, Flipkart, CRED"
                      className={inputClass}
                    />
                  </label>

                  <section className="rounded-md border border-card-border bg-surface-container-low p-5">
                    <p className="font-semibold">Optional exclusions</p>
                    <div className="mt-4 grid gap-4 md:grid-cols-2">
                      {[
                        ['excludedCities', 'Cities to exclude'],
                        ['excludedCompanies', 'Companies to exclude'],
                        ['excludedTitles', 'Titles to exclude'],
                        ['excludedIndustries', 'Industries to exclude'],
                      ].map(([key, label]) => (
                        <input
                          key={key}
                          value={(prefs as any)[key]}
                          onChange={(event) => setPrefs({ ...prefs, [key]: event.target.value })}
                          placeholder={`${label}, comma-separated`}
                          className={`${inputClass} min-h-11 text-sm`}
                        />
                      ))}
                    </div>
                  </section>
                </div>

                <button
                  type="button"
                  onClick={() => setStep('scan')}
                  className={`mt-8 ${primaryActionClass}`}
                >
                  Review my first job search <ArrowRight className="h-4 w-4" />
                </button>
              </div>
            )}

            {step === 'scan' && !scanQueued && (
              <div className="max-w-3xl">
                <Search className="mb-5 h-10 w-10 text-primary" />
                <h2 id="onboarding-step-title" className="text-4xl font-semibold">Ready to find matches</h2>
                <p className="mt-3 text-muted-foreground">
                  Career Seek will search India-focused company career pages and major job boards, then rank results against your resume and preferences. If one site is unavailable, the rest of the search continues.
                </p>
                {capabilities?.has_browser === false && (
                  <div className="mt-5 rounded-md border border-warning-border bg-warning-bg px-4 py-3 text-sm text-warning" role="status">
                    Automatic site search is unavailable on this machine. Your preferences will be saved and you can still add job links manually.
                  </div>
                )}
                <div className="mt-6 grid gap-4 md:grid-cols-2">
                  <div className="rounded-md border border-card-border bg-surface p-5">
                    <p className="text-sm font-semibold text-muted-foreground">Roles</p>
                    <p className="mt-2 font-semibold">{[...selectedRoles, ...splitList(prefs.customRoles)].join(', ') || 'Not set'}</p>
                  </div>
                  <div className="rounded-md border border-card-border bg-surface p-5">
                    <p className="text-sm font-semibold text-muted-foreground">Locations and mode</p>
                    <p className="mt-2 font-semibold">{prefs.locations} · {prefs.workModel}</p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={handleStartScan}
                  disabled={Boolean(busyLabel)}
                  className={`mt-8 ${primaryActionClass}`}
                >
                  {busyLabel ? (
                    <><Loader2 className="h-4 w-4 animate-spin" /> {busyLabel}</>
                  ) : (
                    <>{capabilities?.has_browser === false ? 'Save goals and open dashboard' : 'Find matching jobs'} <ArrowRight className="h-4 w-4" /></>
                  )}
                </button>
              </div>
            )}

            {step === 'scan' && scanQueued && (() => {
              const job = scanJobs[0];
              const progress = job?.progress ?? 0;
              const status = job?.status ?? 'queued';
              const logs: Array<{ level: string; message: string }> = job?.logs ?? [];
              const isDone = ['succeeded', 'failed', 'canceled'].includes(status);
              const recentLogs = logs.slice(-5);
              return (
                <div className="max-w-2xl">
                  <div className="mb-5 flex items-center gap-3">
                    {isDone
                      ? <CheckCircle2 className="h-10 w-10 text-success" />
                      : <Loader2 className="h-10 w-10 animate-spin text-primary" />
                    }
                  </div>
                  <h2 id="onboarding-step-title" className="text-4xl font-semibold">
                    {isDone ? 'Scan complete' : 'Scanning India job boards'}
                  </h2>
                  <p className="mt-3 text-muted-foreground">
                    {isDone
                      ? 'Career Seek has finished scanning. Your first batch of matches is ready.'
                      : 'Career Seek is searching company career pages and job boards. This takes a few minutes — you can wait here or go to the dashboard.'}
                  </p>

                  <div className="mt-8 space-y-2">
                    <div className="flex items-center justify-between text-xs font-semibold text-muted-foreground">
                      <span className="capitalize">{status === 'running' ? 'Running' : status === 'queued' ? 'Queued' : status === 'succeeded' ? 'Done' : status}</span>
                      <span>{progress}%</span>
                    </div>
                    <div className="h-2 w-full overflow-hidden rounded-full bg-surface-container">
                      <div
                        className="h-full rounded-full bg-primary transition-all duration-700"
                        style={{ width: `${progress}%` }}
                      />
                    </div>
                  </div>

                  {recentLogs.length > 0 && (
                    <div className="mt-5 rounded-md border border-card-border bg-surface-container-low p-4">
                      <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Activity</p>
                      <ul className="space-y-1.5">
                        {recentLogs.map((log, i) => (
                          <li key={i} className="flex items-start gap-2 text-xs text-muted-foreground">
                            <span className={`mt-0.5 h-1.5 w-1.5 shrink-0 rounded-full ${log.level === 'error' ? 'bg-error' : 'bg-primary'}`} />
                            <span className="font-mono leading-relaxed">{log.message}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  <div className="mt-8 flex flex-wrap items-center gap-3">
                    <button
                      type="button"
                      onClick={onComplete}
                      className={primaryActionClass}
                    >
                      {isDone ? 'View your matches' : 'Go to dashboard'} <ArrowRight className="h-4 w-4" />
                    </button>
                    {!isDone && (
                      <p className="text-xs text-muted-foreground">Scan continues in the background</p>
                    )}
                  </div>
                </div>
              );
            })()}
          </motion.section>
        </main>
      </div>
    </div>
  );
}
