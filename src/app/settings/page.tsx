"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { AlertCircle, CheckCircle2, Database, ExternalLink, FileText, KeyRound, Loader2, RefreshCw, Settings2, ShieldCheck } from "lucide-react";
import { getOnboardingState, updateAIProviderFromSettings } from "@/app/actions";
import { getScrapingSourceHealth } from "@/app/discover/actions";
import { AI_PROVIDER_CATALOG } from "@/lib/ai/providers";
import type { AIProviderName } from "@/lib/ai/types";
import {
  actionExportWorkspaceBackup,
  actionGetIntegrationSettings,
  actionUpdateIntegrationSettings,
} from "@/app/pipeline/pipeline-actions";

const primaryActionClass =
  "inline-flex min-h-11 items-center justify-center gap-2 rounded-apple bg-primary px-5 text-sm font-semibold text-white shadow-golden-sm transition hover:bg-primary-hover disabled:opacity-50";
const secondaryActionClass =
  "inline-flex min-h-11 items-center justify-center gap-2 rounded-apple border border-card-border bg-surface px-5 text-sm font-semibold text-foreground transition hover:border-foreground disabled:opacity-50";
const inputClass =
  "min-h-12 w-full rounded-apple border border-card-border bg-surface px-4 outline-none transition focus:border-primary focus:ring-4 focus:ring-[rgba(255,56,92,0.18)]";

export default function Settings() {
  const [apiKey, setApiKey] = useState("");
  const [provider, setProvider] = useState<AIProviderName>("gemini");
  const [model, setModel] = useState("");
  const [baseUrl, setBaseUrl] = useState("");
  const [keyStatus, setKeyStatus] = useState<string>("");
  const [savingKey, setSavingKey] = useState(false);
  const [state, setState] = useState<any>(null);
  const [settings, setSettings] = useState<any>(null);
  const [savingSettings, setSavingSettings] = useState(false);
  const [backuping, setBackuping] = useState(false);
  const [backupPath, setBackupPath] = useState("");
  const [sourceHealth, setSourceHealth] = useState<any[]>([]);
  const [checkingSources, setCheckingSources] = useState(false);

  useEffect(() => {
    (async () => {
      const [setup, integration, sources] = await Promise.all([
        getOnboardingState(),
        actionGetIntegrationSettings(),
        getScrapingSourceHealth().catch(() => ({ success: false, providers: [] })),
      ]);
      setState(setup);
      const selectedProvider = (setup?.config?.aiProvider || "gemini") as AIProviderName;
      setProvider(selectedProvider);
      const providerSettings = setup?.config?.aiProviders?.[selectedProvider] || {};
      setModel(providerSettings.model || setup?.config?.aiModel || AI_PROVIDER_CATALOG[selectedProvider].defaultModel);
      setBaseUrl(providerSettings.baseUrl || setup?.config?.aiBaseUrl || AI_PROVIDER_CATALOG[selectedProvider].baseUrl || "");
      if (integration.success) setSettings(integration.settings);
      if (sources.success) setSourceHealth(sources.providers || []);
    })();
  }, []);

  useEffect(() => {
    if (!state?.config) return;
    const providerSettings = state.config.aiProviders?.[provider] || {};
    setModel(providerSettings.model || AI_PROVIDER_CATALOG[provider].defaultModel);
    setBaseUrl(providerSettings.baseUrl || AI_PROVIDER_CATALOG[provider].baseUrl || "");
    setApiKey("");
  }, [provider, state?.config]);

  const handleSaveKey = async () => {
    setSavingKey(true);
    const res = await updateAIProviderFromSettings({
      provider,
      apiKey: apiKey.trim() || undefined,
      model: model.trim() || undefined,
      baseUrl: baseUrl.trim() || undefined,
    });
    setSavingKey(false);
    setKeyStatus(res.success ? `${AI_PROVIDER_CATALOG[provider].label} saved. Resume reading and job fit notes are ready.` : `${res.message} ${res.action || ""}`);
    const setup = await getOnboardingState();
    setState(setup);
  };

  const handleSaveSettings = async () => {
    if (!settings) return;
    setSavingSettings(true);
    const res = await actionUpdateIntegrationSettings(settings);
    setSavingSettings(false);
    if (res.success) setSettings(res.settings);
  };

  const handleBackup = async () => {
    setBackuping(true);
    const res = await actionExportWorkspaceBackup();
    setBackuping(false);
    if ((res as any).success) setBackupPath((res as any).backupPath);
  };

  const handleCheckSources = async () => {
    setCheckingSources(true);
    const res = await getScrapingSourceHealth().catch(() => ({ success: false, providers: [] }));
    setCheckingSources(false);
    if (res.success) setSourceHealth(res.providers || []);
  };

  const activeProvider = AI_PROVIDER_CATALOG[provider];
  const savedProviderSettings = state?.config?.aiProviders?.[provider] || {};
  const aiKeyReady = activeProvider.requiresApiKey
    ? Boolean(savedProviderSettings.apiKey || (provider === "gemini" && state?.config?.geminiApiKey))
    : Boolean(savedProviderSettings.baseUrl || activeProvider.baseUrl || provider === "ollama");
  const configuredProviderCount = Object.keys(state?.config?.aiProviders || {}).length;
  const lastKeyCheck = state?.config?.lastKeyValidationAt
    ? new Date(state.config.lastKeyValidationAt).toLocaleString()
    : "";

  return (
    <div className="space-y-7 pb-16">
      <header>
        <p className="text-sm font-semibold uppercase text-primary">Settings</p>
        <h1 className="mt-2 font-display text-3xl font-semibold leading-tight md:text-4xl">Profile, AI, and advanced setup</h1>
        <p className="mt-3 max-w-3xl text-muted-foreground">
          Manage the AI helper, resume profile, job goals, exports, and local backups from one place.
        </p>
      </header>

      <section className="surface-grid grid gap-4 md:grid-cols-3">
        <div className="apple-card metric-card p-5">
          <ShieldCheck className="h-5 w-5 text-primary" />
          <p className="mt-3 text-sm font-semibold text-muted-foreground">Onboarding</p>
          <p className="mt-1 text-2xl font-semibold">{state?.onboardingGate?.isComplete ? "Complete" : "Incomplete"}</p>
          {!state?.onboardingGate?.isComplete && (
            <p className="mt-2 text-xs text-muted-foreground">
              Next: {state?.onboardingGate?.nextStep?.replaceAll("_", " ") || "guided setup"}
            </p>
          )}
        </div>
        <div className="apple-card metric-card p-5">
          <FileText className="h-5 w-5 text-primary" />
          <p className="mt-3 text-sm font-semibold text-muted-foreground">Resume</p>
          <p className="mt-1 truncate text-lg font-semibold">{state?.resume?.filename || "Not uploaded"}</p>
        </div>
        <div className="apple-card metric-card p-5">
          <Settings2 className="h-5 w-5 text-primary" />
          <p className="mt-3 text-sm font-semibold text-muted-foreground">Active search</p>
          <p className="mt-1 truncate text-lg font-semibold">{state?.searchProfile?.title || "Not configured"}</p>
        </div>
      </section>

      <section className="golden-card p-6">
        <div className="grid gap-6 lg:grid-cols-[1fr_18rem]">
          <div className="flex items-start gap-4">
            <div className="rounded-apple bg-secondary p-3 text-primary">
              <KeyRound className="h-5 w-5" />
            </div>
            <div className="flex-1">
              <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-start">
                <div>
                  <h2 className="text-xl font-semibold">AI helper</h2>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Save one or more providers locally, then switch between them without changing the rest of your workflow.
                  </p>
                </div>
                <span className="rounded-full border border-card-border bg-secondary px-3 py-1 text-xs font-semibold text-foreground">
                  {aiKeyReady ? "Ready" : "Needs key"}
                </span>
              </div>
              <div className="mt-4 grid gap-3 md:grid-cols-2">
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
                  <input
                    value={model}
                    onChange={(event) => setModel(event.target.value)}
                    placeholder={activeProvider.defaultModel}
                    className={`${inputClass} font-mono text-sm`}
                  />
                </label>
              </div>
              {(provider !== "gemini") && (
                <div className="mt-3">
                  <label className="space-y-2">
                    <span className="text-sm font-semibold">Base URL {provider === "openai" || provider === "anthropic" ? "(optional)" : ""}</span>
                    <input
                      value={baseUrl}
                      onChange={(event) => setBaseUrl(event.target.value)}
                      placeholder={activeProvider.baseUrlPlaceholder || activeProvider.baseUrl || ""}
                      className={`${inputClass} font-mono text-sm`}
                    />
                  </label>
                </div>
              )}
              <div className="mt-3 flex flex-col gap-3 md:flex-row">
                <input
                  type="password"
                  value={apiKey}
                  onChange={(event) => setApiKey(event.target.value)}
                  placeholder={activeProvider.requiresApiKey ? `Paste ${activeProvider.label} API key` : "Optional token if your local endpoint needs one"}
                  className={`${inputClass} flex-1 font-mono text-sm`}
                />
                <button onClick={handleSaveKey} disabled={savingKey || (activeProvider.requiresApiKey && !apiKey.trim() && !savedProviderSettings.apiKey)} className={primaryActionClass}>
                  {savingKey ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                  Save provider
                </button>
              </div>
              <div className="mt-3 flex flex-wrap items-center gap-3 text-sm">
                {activeProvider.docsUrl && (
                  <a href={activeProvider.docsUrl} target="_blank" rel="noreferrer" className="inline-flex min-h-11 items-center gap-1 font-semibold text-primary">
                    Open provider docs <ExternalLink className="h-3.5 w-3.5" />
                  </a>
                )}
                {lastKeyCheck && <span className="text-muted-foreground">Last checked {lastKeyCheck}</span>}
                <span className="text-muted-foreground">{configuredProviderCount} provider {configuredProviderCount === 1 ? "saved" : "saved locally"}</span>
              </div>
              <p className="mt-3 text-sm text-muted-foreground">{activeProvider.helpText} Leave the key field blank to keep the saved credential for this provider.</p>
              {keyStatus && <p className="mt-3 text-sm font-medium text-muted-foreground">{keyStatus}</p>}
            </div>
          </div>

          <div className="rounded-apple border border-card-border bg-surface-container-low p-4">
            <p className="text-sm font-semibold">What this unlocks</p>
            <div className="mt-3 space-y-2 text-sm text-muted-foreground">
              <p>Resume-based profile review</p>
              <p>Job fit notes before applying</p>
              <p>Tailored resumes, cover letters, and outreach drafts</p>
              <p>Switch providers without redoing onboarding</p>
            </div>
          </div>
        </div>
      </section>

      <details className="apple-card p-6">
        <summary className="flex min-h-11 cursor-pointer list-none flex-col justify-between gap-4 sm:flex-row sm:items-start [&::-webkit-details-marker]:hidden">
          <div>
            <h2 className="text-xl font-semibold">Advanced source reliability</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Check this only when jobs look stale or a source says it was blocked.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full border border-card-border px-3 py-1 text-xs font-semibold text-muted-foreground">Advanced</span>
          <button
            onClick={(event) => {
              event.preventDefault();
              event.stopPropagation();
              handleCheckSources();
            }}
            disabled={checkingSources}
            className={secondaryActionClass}
          >
            {checkingSources ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            Check sources
          </button>
          </div>
        </summary>
        <p className="mt-4 text-sm text-muted-foreground">
          Career Seek checks provider availability locally and falls back honestly when a source is blocked, missing, or unavailable.
        </p>
        <div className="mt-5 grid gap-3 md:grid-cols-3">
          {sourceHealth.map((provider) => (
            <div key={provider.id} className="rounded-apple border border-card-border bg-surface-container-low p-4">
              <div className="flex items-center gap-2">
                {provider.available ? <CheckCircle2 className="h-4 w-4 text-success" /> : <AlertCircle className="h-4 w-4 text-warning" />}
                <p className="font-semibold">{provider.label}</p>
              </div>
              <p className="mt-2 text-xs text-muted-foreground">
                {(provider.portals || []).join(", ") || "No mapped portals"}
              </p>
              {!provider.available && (
                <p className="mt-2 text-xs text-warning">{provider.message || "Unavailable locally; fallback providers will be tried."}</p>
              )}
            </div>
          ))}
          {sourceHealth.length === 0 && (
            <div className="rounded-apple border border-card-border bg-surface-container-low p-4 text-sm text-muted-foreground">
              Source health has not been checked yet.
            </div>
          )}
        </div>
      </details>

      <section className="grid gap-6 lg:grid-cols-2">
        <div className="apple-card p-6">
          <h2 className="text-xl font-semibold">Resume profile and job goals</h2>
          <p className="mt-2 text-sm text-muted-foreground">Update the guided setup when your resume, target role, salary, or location changes.</p>
          {state?.searchProfile && (
            <div className="mt-5 rounded-apple border border-card-border bg-surface-container-low p-4 text-sm">
              <p className="font-semibold">{state.searchProfile.title}</p>
              <p className="mt-2 text-muted-foreground">
                {(state.searchProfile.locations || []).join(", ") || "Locations not set"} · {state.searchProfile.workModel || "work mode not set"} · {state.searchProfile.expectedSalary || "salary not set"}
              </p>
              <p className="mt-2 text-muted-foreground">
                Company types: {(state.searchProfile.companyTypes || []).join(", ") || "any"}
              </p>
              {state.searchProfile.avoidKeywords?.length > 0 && (
                <p className="mt-2 text-muted-foreground">
                  Exclusions: {state.searchProfile.avoidKeywords.join(", ")}
                </p>
              )}
            </div>
          )}
          <div className="mt-5 flex flex-wrap gap-2">
            <Link href="/onboarding" className={primaryActionClass}>
              Update resume and job goals
            </Link>
            <Link href="/discover" className={secondaryActionClass}>
              Review matched jobs
            </Link>
          </div>
        </div>

        <div className="apple-card p-6">
          <h2 className="text-xl font-semibold">Downloads and backups</h2>
          <p className="mt-2 text-sm text-muted-foreground">Generated documents and backups stay inside your local data directory unless you export them.</p>
          <button onClick={handleBackup} disabled={backuping} className={`mt-5 ${secondaryActionClass}`}>
            {backuping ? <Loader2 className="h-4 w-4 animate-spin" /> : <Database className="h-4 w-4" />}
            Back up my job search
          </button>
          {backupPath && <p className="mt-3 break-all rounded-apple bg-surface-container p-3 text-xs text-muted-foreground">{backupPath}</p>}
        </div>
      </section>

      {settings && (
        <details className="apple-card p-6">
          <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-4 [&::-webkit-details-marker]:hidden">
            <div>
              <h2 className="text-xl font-semibold">Advanced export folders</h2>
              <p className="mt-1 text-sm text-muted-foreground">Choose where generated documents and backups should go.</p>
            </div>
            <button
              onClick={(event) => {
                event.preventDefault();
                event.stopPropagation();
                handleSaveSettings();
              }}
              disabled={savingSettings}
              className={primaryActionClass}
            >
              {savingSettings ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
              Save folders
            </button>
          </summary>
          <div className="mt-5 grid gap-4 md:grid-cols-2">
            <label className="space-y-2">
              <span className="text-sm font-semibold">Default export folder</span>
              <input value={settings.defaultExportFolder || ""} onChange={(event) => setSettings({ ...settings, defaultExportFolder: event.target.value })} className={inputClass} />
            </label>
            <label className="space-y-2">
              <span className="text-sm font-semibold">Backup destination</span>
              <input value={settings.backupDestination || ""} onChange={(event) => setSettings({ ...settings, backupDestination: event.target.value })} className={inputClass} />
            </label>
          </div>
        </details>
      )}
    </div>
  );
}
