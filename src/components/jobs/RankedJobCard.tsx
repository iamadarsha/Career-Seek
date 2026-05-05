'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  Bookmark,
  CheckCircle2,
  Copy,
  Download,
  ExternalLink,
  FileText,
  Loader2,
  Mail,
  MessageCircle,
  Sparkles,
} from 'lucide-react';
import { generateBriefForJob } from '@/app/discover/actions';
import {
  generateCoverLetterAction,
  generateOutreachNoteAction,
  generateResumePipeline,
  getDocumentAssets,
  toggleAppliedStatus,
  toggleSavedStatus,
} from '@/app/discover/document-actions';
import { AdvisoryEstimateLabel } from '@/components/ui/AdvisoryEstimateLabel';
import { getJobActionState } from '@/lib/jobs/action-state';

function safeJson<T>(value: string | null | undefined, fallback: T): T {
  if (!value) return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

function tierLabel(tier: string) {
  if (tier === 'A') return 'Top match';
  if (tier === 'B') return 'Good match';
  if (tier === 'C') return 'Decent fit';
  return 'Worth a look';
}

function tierClass(tier: string) {
  if (tier === 'A') return 'border-success-border bg-success-bg text-success';
  if (tier === 'B') return 'border-primary/30 bg-primary/10 text-primary';
  if (tier === 'C') return 'border-card-border bg-surface-low text-muted-foreground';
  return 'border-card-border bg-white text-muted-foreground';
}

function actionButtonClass(kind: 'primary' | 'outline' | 'connect' | 'success') {
  const base = 'inline-flex min-h-11 items-center justify-center gap-2 rounded-full px-4 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-50';
  if (kind === 'primary') return `${base} bg-primary text-white shadow-golden-sm hover:bg-primary-hover hover:-translate-y-0.5`;
  if (kind === 'connect') return `${base} border border-card-border bg-white text-foreground hover:border-foreground`;
  if (kind === 'success') return `${base} border border-success-border bg-success-bg text-success hover:border-success`;
  return `${base} border border-card-border bg-white text-foreground hover:border-foreground hover:-translate-y-0.5`;
}

function cleanDisplayText(value: string | null | undefined, maxLength = 96) {
  const cleaned = String(value || '').replace(/\s+/g, ' ').trim();
  if (!cleaned) return '';
  return cleaned.length > maxLength ? `${cleaned.slice(0, maxLength - 1).trim()}...` : cleaned;
}

function extractInstahyreDetails(job: any) {
  const source = String(job.snippet || '');
  const match = String(source || '').match(/^(.+?)\s+-\s+(.+?)\s+Job available in\s+(.+?)(?:\s+Founded\s+in|\s+View\s*»|$)/i);
  if (!match) return null;
  return {
    company: cleanDisplayText(match[1], 80),
    location: cleanDisplayText(match[3], 80),
  };
}

function cleanSnippet(job: any, maxLength = 220) {
  let snippet = String(job.snippet || 'No detailed description was available from this source.');
  if (job.portal === 'instahyre') {
    snippet = snippet
      .replace(/^.+?\s+-\s+.+?\s+Job available in\s+.+?(?=\s+Founded\s+in|\s+[A-Z][a-z]+\s+provides|\s+[A-Z][a-z]+\s+is\s+|$)/i, '')
      .replace(/^Founded\s+in\s+\d{4}\s+•\s+[^.]+?employees\s+/i, '')
      .replace(/\s+View\s*».*$/i, '')
      .trim();
  }
  return cleanDisplayText(snippet, maxLength);
}

function cleanTitle(value: string | null | undefined, fallback: string) {
  const title = cleanDisplayText(value, 110);
  if (!title || /<[^>]+>|src=|data-nimg|logo\.svg/i.test(title)) return fallback;
  return title.replace(/\bAi\b/g, 'AI');
}

function sourceLabel(job: any) {
  if (job.portal === 'google_jobs') {
    return `${sourceSiteName(job)} (via Google)`;
  }
  if (job.portal === 'company_ats' || job.portal === 'official') {
    return `Official Career Page — ${cleanDisplayText(job.company, 48) || 'Company'}`;
  }
  if (job.portal === 'manual_url') return 'Pasted Job URL';
  return cleanDisplayText(job.portal, 48) || 'source';
}

function sourceSiteName(job: any) {
  const url = String(job.applyUrl || job.url || '');
  try {
    const host = new URL(url).hostname.replace(/^www\./i, '').toLowerCase();
    if (host.includes('linkedin.')) return 'LinkedIn';
    if (host.includes('indeed.')) return 'Indeed';
    if (host.includes('naukri.')) return 'Naukri';
    if (host.includes('foundit.')) return 'Foundit';
    if (host.includes('instahyre.')) return 'Instahyre';
    if (host.includes('greenhouse.')) return 'Greenhouse';
    if (host.includes('lever.')) return 'Lever';
    if (host.includes('ashbyhq.')) return 'Ashby';
    if (host.includes('workdayjobs.')) return 'Workday';
    const label = host
      .split('.')
      .slice(0, 2)
      .join('.')
      .replace(/\.[a-z]+$/i, '')
      .replace(/[-_]+/g, ' ')
      .replace(/\b\w/g, (letter) => letter.toUpperCase());
    return label || 'Source';
  } catch {
    return 'Source';
  }
}

function companyInitials(company: string) {
  const words = cleanDisplayText(company || 'Company', 36)
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2);
  return (words.map((word) => word[0]).join('') || 'CS').toUpperCase();
}

export function RankedJobCard({ item, compact = false, capabilities }: { item: any; compact?: boolean; capabilities?: any }) {
  const scoredJob = item.scoredJob || item.scored_jobs || item.scoredJob;
  const normalizedJob = item.normalizedJob || item.normalized_jobs || item.normalizedJob;
  const enrichment = item.enrichment || item.jobEnrichments || null;
  const [loadingAction, setLoadingAction] = useState<string | null>(null);
  const [modal, setModal] = useState<{ title: string; body: React.ReactNode } | null>(null);
  const [inlinePanel, setInlinePanel] = useState<{ type: 'brief' | 'connect'; title: string; body: React.ReactNode } | null>(null);
  const [applicationStatus, setApplicationStatus] = useState<string | null>(item.application?.status || null);
  const [error, setError] = useState<string | null>(null);
  const [assets, setAssets] = useState<any[]>([]);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    let mounted = true;
    getDocumentAssets(scoredJob.id).then((res) => {
      if (mounted && res.success) {
        setAssets(res.assets || []);
        setApplicationStatus(res.applicationStatus || null);
      }
    }).catch(() => undefined);
    return () => {
      mounted = false;
    };
  }, [scoredJob.id]);

  useEffect(() => {
    if (!modal) return undefined;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setModal(null);
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [modal]);

  const breakdown = useMemo(() => safeJson<any>(scoredJob.breakdown, {}), [scoredJob.breakdown]);
  const latestResume = assets.find((asset) => asset.type === 'resume');
  const latestResumePdf = assets.find((asset) => asset.type === 'resume_pdf');
  const latestCover = assets.find((asset) => asset.type === 'cover_letter');
  const latestOutreach = assets.find((asset) => asset.type === 'outreach_note');
  const isApplied = applicationStatus === 'applied';
  const isSaved = applicationStatus === 'saved';
  const instahyreDetails = normalizedJob.portal === 'instahyre' ? extractInstahyreDetails(normalizedJob) : null;
  const displayTitle = cleanTitle(normalizedJob.title, `${normalizedJob.company || 'Company'} role`);
  const displayCompany = instahyreDetails?.company || cleanDisplayText(normalizedJob.company, 80);
  const displayLocation = instahyreDetails?.location || cleanDisplayText(normalizedJob.location, 80);
  const displaySnippet = cleanSnippet(normalizedJob, 220);
  const companyMonogram = companyInitials(displayCompany || displayTitle);
  const isGooglePreview = normalizedJob.portal === 'google_jobs';
  const sourceSite = sourceSiteName(normalizedJob);
  const analyseHref = `/discover?importUrl=${encodeURIComponent(String(normalizedJob.applyUrl || normalizedJob.url || ''))}&importMode=analyse`;
  const saveLabel = isApplied ? 'Already applied' : isSaved ? 'Saved' : 'Save';
  const briefLabel = inlinePanel?.type === 'brief' ? 'Hide brief' : enrichment ? 'View brief' : 'Create brief';
  const resumeLabel = latestResume ? `Refresh tailored resume v${latestResume.version || 1}` : latestResumePdf ? 'Refresh ATS resume PDF' : 'Tailor resume';
  const coverLabel = latestCover ? `Regenerate cover v${latestCover.version || 1}` : 'Create cover letter';
  const outreachLabel = latestOutreach ? `Regenerate outreach v${latestOutreach.version || 1}` : 'Create outreach';
  const appliedLabel = isApplied ? 'Applied' : 'Mark applied';
  const aiLimited = capabilities?.has_ai_provider === false || capabilities?.safe_modes?.ai_generation_limited === true;
  const actionState = getJobActionState({
    applicationStatus,
    hasResume: Boolean(latestResume || latestResumePdf),
    hasCoverLetter: Boolean(latestCover),
  });
  const primaryIsResume = actionState.primaryKind !== 'apply' && actionState.primaryKind !== 'follow_up';
  const mediaShellClass = compact
    ? 'relative hidden min-h-36 overflow-hidden rounded-[0.875rem] bg-surface-low md:block'
    : 'relative min-h-44 overflow-hidden rounded-[0.875rem] bg-surface-low md:min-h-full';
  const monogramLayerClass = compact
    ? 'absolute inset-x-0 bottom-4 top-14 z-0 flex items-center justify-center'
    : 'absolute inset-0 z-0 flex items-center justify-center';
  const scoreBadgeClass = compact
    ? `absolute left-2 top-2 z-10 inline-flex min-h-8 items-center justify-center truncate rounded-full bg-white text-[11px] font-bold text-foreground shadow-golden-sm ${
        isGooglePreview ? 'max-w-[calc(100%-1rem)] px-2.5' : 'w-10 px-1'
      }`
    : 'absolute left-3 top-3 z-10 inline-flex max-w-[calc(100%-4.75rem)] truncate rounded-full bg-white px-2.5 py-1 text-[11px] font-bold text-foreground shadow-golden-sm';
  const saveOverlayClass = compact
    ? 'absolute right-2 top-2 z-10 inline-flex h-11 w-11 items-center justify-center rounded-full bg-white shadow-golden-sm transition hover:scale-105 disabled:cursor-not-allowed disabled:opacity-60'
    : 'absolute right-3 top-3 z-10 inline-flex h-11 w-11 items-center justify-center rounded-full bg-white shadow-golden-sm transition hover:scale-105 disabled:cursor-not-allowed disabled:opacity-60';

  const openBrief = async () => {
    setError(null);
    if (inlinePanel?.type === 'brief' && !loadingAction) {
      setInlinePanel(null);
      return;
    }
    setLoadingAction('brief');
    try {
      let brief = enrichment
        ? {
            fitSummary: enrichment.fitSummary,
            pros: safeJson<string[]>(enrichment.pros, []),
            cons: safeJson<string[]>(enrichment.cons, []),
            interviewAngle: enrichment.interviewAngle,
            salaryEstimate: enrichment.salaryEstimate,
            resumeFocus: enrichment.resumeFocus,
          }
        : null;

      if (!brief) {
        const res = await generateBriefForJob(scoredJob.id);
        if (!res.success) throw new Error(res.error || 'Brief generation failed');
        brief = res.brief as any;
      }

      setInlinePanel({
        type: 'brief',
        title: 'Fit brief',
        body: (
          <div className="space-y-5 text-sm leading-6">
            <p className="text-base font-medium text-foreground">{brief?.fitSummary}</p>
            <div className="grid gap-4 md:grid-cols-2">
              <div className="rounded-apple border border-success-border bg-success-bg p-4">
                <p className="font-semibold text-success">Why apply</p>
                <ul className="mt-2 space-y-1 text-success">
                  {(brief?.pros || []).map((item: string, index: number) => <li key={index}>{item}</li>)}
                </ul>
              </div>
              <div className="rounded-apple border border-warning-border bg-warning-bg p-4">
                <p className="font-semibold text-warning">Watch-outs</p>
                <ul className="mt-2 space-y-1 text-warning">
                  {(brief?.cons || []).map((item: string, index: number) => <li key={index}>{item}</li>)}
                </ul>
              </div>
            </div>
            <p><span className="font-semibold">Interview angle:</span> {brief?.interviewAngle}</p>
            <p><span className="font-semibold">Salary read:</span> {brief?.salaryEstimate || 'Not enough salary data in the source JD.'}</p>
            <p><span className="font-semibold">Resume focus:</span> {brief?.resumeFocus}</p>
          </div>
        ),
      });
    } catch (event: any) {
      setError(event.message || 'Brief generation failed');
    } finally {
      setLoadingAction(null);
    }
  };

  const generateResume = async () => {
    setError(null);
    setLoadingAction('resume');
    try {
      const res = await generateResumePipeline(scoredJob.id);
      const refreshed = await getDocumentAssets(scoredJob.id);
      if (refreshed.success) setAssets(refreshed.assets || []);
      setModal({
        title: 'Application pack started',
        body: (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">Your tailored resume is saved as the first asset in this job&apos;s application pack.</p>
            {res.filePath && (
              <a href={`/api/download?assetId=${encodeURIComponent(String(res.resumeId))}`} download className={actionButtonClass('primary')}>
                <Download className="h-4 w-4" /> Download resume DOCX
              </a>
            )}
            {res.pdfResumeId && (
              <a href={`/api/download?assetId=${encodeURIComponent(String(res.pdfResumeId))}`} download className={actionButtonClass('outline')}>
                <Download className="h-4 w-4" /> Download ATS PDF
              </a>
            )}
            {res.atsReport && (
              <div className="rounded-apple border border-card-border bg-surface-container-low p-4 text-sm text-muted-foreground">
                <div className="flex flex-wrap items-center gap-2">
                  <span>ATS coverage: {res.atsReport.atsScore}%</span>
                  <AdvisoryEstimateLabel />
                </div>
              </div>
            )}
          </div>
        ),
      });
    } catch (event: any) {
      setError(event.message || 'Resume generation failed');
    } finally {
      setLoadingAction(null);
    }
  };

  const generateCover = async () => {
    setError(null);
    setLoadingAction('cover');
    try {
      const res = await generateCoverLetterAction(scoredJob.id);
      const refreshed = await getDocumentAssets(scoredJob.id);
      if (refreshed.success) setAssets(refreshed.assets || []);
      setModal({
        title: 'Cover letter',
        body: (
          <div className="space-y-4">
            <pre className="max-h-80 overflow-auto whitespace-pre-wrap rounded-apple bg-surface-container p-4 text-sm leading-6">{res.content}</pre>
            <div className="flex flex-wrap gap-2">
              <button type="button" onClick={() => navigator.clipboard.writeText(res.content)} className={actionButtonClass('outline')}>
                <Copy className="h-4 w-4" /> Copy
              </button>
              {res.filePath && (
                <a href={`/api/download?assetId=${encodeURIComponent(String(res.id))}`} download className={actionButtonClass('primary')}>
                  <Download className="h-4 w-4" /> Download
                </a>
              )}
            </div>
          </div>
        ),
      });
    } catch (event: any) {
      setError(event.message || 'Cover letter generation failed');
    } finally {
      setLoadingAction(null);
    }
  };

  const generateOutreach = async () => {
    setError(null);
    if (inlinePanel?.type === 'connect' && !loadingAction) {
      setInlinePanel(null);
      return;
    }
    setLoadingAction('connect');
    try {
      const res = await generateOutreachNoteAction(scoredJob.id);
      const refreshed = await getDocumentAssets(scoredJob.id);
      if (refreshed.success) setAssets(refreshed.assets || []);
      setInlinePanel({
        type: 'connect',
        title: 'Outreach note',
        body: (
          <div className="space-y-4">
            <pre className="whitespace-pre-wrap rounded-apple bg-warning-bg p-4 text-sm leading-6 text-foreground">{res.content}</pre>
            <button type="button" onClick={() => navigator.clipboard.writeText(res.content)} className={actionButtonClass('connect')}>
              <Copy className="h-4 w-4" /> Copy note
            </button>
          </div>
        ),
      });
    } catch (event: any) {
      setError(event.message || 'Outreach generation failed');
    } finally {
      setLoadingAction(null);
    }
  };

  const toggleApplied = async () => {
    setError(null);
    setLoadingAction('applied');
    try {
      const res = await toggleAppliedStatus(scoredJob.id);
      if (!res.success) throw new Error('Could not update applied state');
      setApplicationStatus(res.status || (res.applied ? 'applied' : 'saved'));
      if (res.message) setError(res.message);
    } catch (event: any) {
      setError(event.message || 'Could not update applied state');
    } finally {
      setLoadingAction(null);
    }
  };

  const toggleSaved = async () => {
    setError(null);
    setLoadingAction('saved');
    try {
      const res = await toggleSavedStatus(scoredJob.id);
      if (!res.success) throw new Error('Could not update saved state');
      setApplicationStatus(res.status || (res.saved ? 'saved' : null));
      if (res.message) setError(res.message);
    } catch (event: any) {
      setError(event.message || 'Could not update saved state');
    } finally {
      setLoadingAction(null);
    }
  };

  if (dismissed) return null;

  return (
    <article id={`scored-job-${scoredJob.id}`} className={`listing-card scroll-mt-28 overflow-hidden ${compact ? 'p-3' : 'p-4 sm:p-5'}`}>
      <div className={`grid min-w-0 gap-4 ${compact ? 'md:grid-cols-[6.5rem_minmax(0,1fr)]' : 'md:grid-cols-[11rem_minmax(0,1fr)]'}`}>
        <div className={`${mediaShellClass} ${compact ? 'order-2 md:order-1' : ''}`}>
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_15%,rgba(255,56,92,0.18),transparent_32%),linear-gradient(135deg,#f7f7f7,#ebebeb)]" />
          <div className={monogramLayerClass}>
            <div className={`flex items-center justify-center rounded-[1.25rem] bg-white font-bold tracking-normal text-foreground shadow-golden-sm ${compact ? 'h-14 w-14 text-lg' : 'h-20 w-20 text-2xl'}`}>
              {companyMonogram}
            </div>
          </div>
          <div className={scoreBadgeClass}>
            {isGooglePreview ? 'Preview' : compact ? `${scoredJob.score}%` : `${scoredJob.score}% match`}
          </div>
          {!isGooglePreview && (
            <button
              type="button"
              onClick={toggleSaved}
              disabled={Boolean(loadingAction) || isApplied}
              aria-label={saveLabel}
              className={`${saveOverlayClass} ${
                isSaved ? 'text-primary' : 'text-foreground'
              }`}
            >
              {loadingAction === 'saved' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Bookmark className="h-4 w-4" />}
            </button>
          )}
        </div>

        <div className={`min-w-0 ${compact ? 'order-1 md:order-2' : ''}`}>
          <div className="flex min-w-0 flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                {!isGooglePreview && (
                  <span className={`rounded-full border px-2.5 py-1 text-xs font-bold ${tierClass(scoredJob.tier)}`}>{tierLabel(scoredJob.tier)}</span>
                )}
                {!isGooglePreview && compact && (
                  <span className="inline-flex items-center gap-1 rounded-full border border-card-border bg-surface px-2.5 py-1 text-xs font-bold text-foreground">
                    {scoredJob.score}% <span className="font-semibold text-muted-foreground">fit</span>
                  </span>
                )}
                <span className="market-chip market-chip-muted text-xs capitalize">{sourceLabel(normalizedJob)}</span>
                <span className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${isGooglePreview ? 'border-warning-border bg-warning-bg text-warning' : 'border-success-border bg-success-bg text-success'}`}>
                  {isGooglePreview ? 'via Google' : actionState.readinessLabel}
                </span>
                {!isGooglePreview && <AdvisoryEstimateLabel compact className="shrink-0" />}
              </div>
              <h3 className={`mt-3 line-clamp-2 font-semibold leading-tight text-foreground ${compact ? 'text-base sm:text-lg' : 'text-xl sm:text-2xl'}`}>{displayTitle}</h3>
              <p className="mt-1 text-sm font-semibold text-muted-foreground">{displayCompany || 'Company not listed'}</p>
            </div>
          </div>

          <div className={`${compact ? 'mt-3' : 'mt-4'} flex flex-wrap gap-2 text-sm text-muted-foreground`}>
            {displayLocation && <span className="market-chip">{displayLocation}</span>}
            <span className="market-chip">{normalizedJob.salaryRaw || 'Salary TBD'}</span>
            <span className="market-chip">{normalizedJob.experienceRaw || 'Experience not listed'}</span>
            {normalizedJob.postedDate && <span className="market-chip">{new Date(normalizedJob.postedDate).toLocaleDateString('en-IN')}</span>}
          </div>
          {!compact && (
            <>
              <p className={`mt-4 line-clamp-2 text-sm leading-6 text-muted-foreground ${isGooglePreview ? 'italic' : ''}`}>{displaySnippet}</p>
              {isGooglePreview ? (
                <div className="mt-4 rounded-[0.875rem] border border-warning-border bg-warning-bg px-4 py-3 text-sm leading-6 text-foreground">
                  <Sparkles className="mr-2 inline h-4 w-4" />
                  Open the original {sourceSite} role to build a more reliable application plan.
                </div>
              ) : (
                <div className="mt-4 rounded-[0.875rem] border border-card-border bg-surface-low px-4 py-3 text-sm leading-6 text-foreground">
                  <p>
                    <Sparkles className="mr-2 inline h-4 w-4 text-primary" />
                    {enrichment?.fitSummary || breakdown.positiveFactors?.[0] || 'Prepare this role to see the strongest resume angle and ATS checklist.'}
                  </p>
                  <p className="mt-2 text-xs font-semibold text-muted-foreground">
                    Based on your resume, the job description, and {sourceLabel(normalizedJob).toLowerCase()}. Match confidence: {scoredJob.tier === 'A' ? 'High' : scoredJob.tier === 'B' ? 'Medium' : 'Estimate only'}.
                  </p>
                </div>
              )}
            </>
          )}
          {error && <p className="mt-3 rounded-[0.875rem] border border-danger-border bg-danger-bg px-4 py-3 text-sm font-medium text-danger">{error}</p>}
        </div>
      </div>

      {aiLimited && (
        <div className="mt-4 rounded-apple border border-warning-border bg-warning-bg px-4 py-3 text-xs text-warning">
          AI is not connected yet. This card is using local matching, and any guidance will be labeled as an estimate.
        </div>
      )}

      <div className={`${compact ? 'mt-4' : 'mt-5'} border-t border-card-border pt-4`}>
        <div className="flex flex-wrap items-center gap-2">
          {isGooglePreview ? (
            <>
              <a href={normalizedJob.applyUrl || normalizedJob.url} target="_blank" rel="noreferrer" className={actionButtonClass('primary')}>
                View on {sourceSite} <ExternalLink className="h-4 w-4" />
              </a>
              <a href={analyseHref} className={actionButtonClass('outline')}>
                Build application plan <FileText className="h-4 w-4" />
              </a>
            </>
          ) : (
            <>
              <button type="button" onClick={generateResume} disabled={Boolean(loadingAction)} className={actionButtonClass('primary')}>
                {loadingAction === 'resume' ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileText className="h-4 w-4" />} Prepare
              </button>
              <button type="button" onClick={toggleSaved} disabled={Boolean(loadingAction) || isApplied} className={actionButtonClass(isSaved ? 'success' : 'outline')}>
                {loadingAction === 'saved' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Bookmark className="h-4 w-4" />} {saveLabel}
              </button>
              <button type="button" onClick={() => setDismissed(true)} className={actionButtonClass('outline')}>
                Skip
              </button>
            </>
          )}
          {!isGooglePreview && (
          <details className="w-full sm:w-auto">
            <summary className="inline-flex min-h-11 w-full list-none items-center justify-center gap-2 rounded-apple border border-card-border bg-surface px-4 text-sm font-semibold text-foreground transition hover:border-primary/40 hover:text-primary sm:w-auto [&::-webkit-details-marker]:hidden">
              <FileText className="h-4 w-4" /> More
            </summary>
            <div className="mt-2 grid w-full gap-2 rounded-apple border border-card-border bg-surface p-2 shadow-golden-sm sm:w-64">
              <a href={normalizedJob.applyUrl || normalizedJob.url} target="_blank" rel="noreferrer" className={actionButtonClass('outline')}>
                Apply <ExternalLink className="h-4 w-4" />
              </a>
              <button type="button" onClick={openBrief} disabled={Boolean(loadingAction)} aria-expanded={inlinePanel?.type === 'brief'} className={actionButtonClass('outline')}>
                {loadingAction === 'brief' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />} {briefLabel}
              </button>
              <button type="button" onClick={toggleApplied} disabled={Boolean(loadingAction)} className={actionButtonClass(isApplied ? 'success' : 'outline')}>
                {loadingAction === 'applied' ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />} {appliedLabel}
              </button>
              {!primaryIsResume && (
                <button type="button" onClick={generateResume} disabled={Boolean(loadingAction)} className={actionButtonClass('outline')}>
                  {loadingAction === 'resume' ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileText className="h-4 w-4" />} {resumeLabel}
                </button>
              )}
              <button type="button" onClick={generateCover} disabled={Boolean(loadingAction)} className={actionButtonClass('outline')}>
                {loadingAction === 'cover' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Mail className="h-4 w-4" />} {coverLabel}
              </button>
              <button type="button" onClick={generateOutreach} disabled={Boolean(loadingAction)} aria-expanded={inlinePanel?.type === 'connect'} className={actionButtonClass('connect')}>
                {loadingAction === 'connect' ? <Loader2 className="h-4 w-4 animate-spin" /> : <MessageCircle className="h-4 w-4" />} {outreachLabel}
              </button>
            </div>
          </details>
          )}
        </div>
      </div>

      {inlinePanel && (
        <div className="mt-4 rounded-apple border border-card-border bg-surface-container-low p-4">
          <div className="mb-3 flex items-center justify-between gap-3">
            <p className="font-semibold">{inlinePanel.title}</p>
            <button type="button" onClick={() => setInlinePanel(null)} className="design-button-secondary min-h-9 px-3 text-xs font-bold text-muted-foreground">
              Collapse
            </button>
          </div>
          {inlinePanel.body}
        </div>
      )}

      {modal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4 backdrop-blur-sm" onClick={() => setModal(null)}>
          <div className="apple-card max-h-[85vh] w-full max-w-3xl overflow-auto p-6 shadow-golden" role="dialog" aria-modal="true" aria-labelledby="job-action-modal-title" onClick={(event) => event.stopPropagation()}>
            <div className="mb-5 flex items-start justify-between gap-4">
              <h3 id="job-action-modal-title" className="text-2xl font-semibold">{modal.title}</h3>
              <button type="button" onClick={() => setModal(null)} className="design-button-secondary min-h-9 px-3 text-sm font-semibold text-muted-foreground">
                Close
              </button>
            </div>
            {modal.body}
          </div>
        </div>
      )}
    </article>
  );
}
