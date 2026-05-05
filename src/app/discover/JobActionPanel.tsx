'use client';

import { useCallback, useEffect, useState } from 'react';
import { 
  generateResumePipeline, 
  generateCoverLetterAction, 
  generateOutreachNoteAction, 
  toggleAppliedStatus, 
  getDocumentAssets 
} from './document-actions';
import { Loader2, FileText, CheckCircle2, MessageSquare, Briefcase, ChevronDown, ChevronUp, Copy, ExternalLink, Download } from 'lucide-react';
import { getSystemCapabilitiesState } from '@/app/actions';
import { AdvisoryEstimateLabel } from '@/components/ui/AdvisoryEstimateLabel';
import { AtsReportBreakdown } from '@/components/ui/AtsReportBreakdown';

function parseAtsReportContent(content: unknown): Record<string, unknown> | null {
  if (!content) return null;
  if (typeof content === 'object' && !Array.isArray(content)) return content as Record<string, unknown>;
  if (typeof content !== 'string') return null;

  try {
    const parsed = JSON.parse(content);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? parsed as Record<string, unknown>
      : { explanation: content };
  } catch {
    return { explanation: content };
  }
}

export function JobActionPanel({ scoredJobId, jobUrl }: { scoredJobId: number, jobUrl: string }) {
  const [loadingAction, setLoadingAction] = useState<string | null>(null);
  const [errorAction, setErrorAction] = useState<string | null>(null);
  const [assets, setAssets] = useState<any[]>([]);
  const [isApplied, setIsApplied] = useState(false);
  const [expandedAsset, setExpandedAsset] = useState<number | null>(null);
  const [capabilities, setCapabilities] = useState<any>(null);

  const loadAssets = useCallback(async () => {
    const res = await getDocumentAssets(scoredJobId);
    if (res.success) {
      setAssets(res.assets);
      setIsApplied(res.isApplied);
    }
  }, [scoredJobId]);

  useEffect(() => {
    loadAssets().catch(() => undefined);
    getSystemCapabilitiesState().then(setCapabilities).catch(() => undefined);
  }, [loadAssets]);

  const handleGenerateResume = async () => {
    try {
      setLoadingAction('resume');
      setErrorAction(null);
      await generateResumePipeline(scoredJobId);
      await loadAssets();
    } catch (e: any) {
      setErrorAction(e.message || 'Failed to generate resume');
    } finally {
      setLoadingAction(null);
    }
  };

  const handleGenerateCoverLetter = async () => {
    try {
      setLoadingAction('cover_letter');
      setErrorAction(null);
      await generateCoverLetterAction(scoredJobId);
      await loadAssets();
    } catch (e: any) {
      setErrorAction(e.message || 'Failed to generate cover letter');
    } finally {
      setLoadingAction(null);
    }
  };

  const handleGenerateOutreach = async () => {
    try {
      setLoadingAction('outreach');
      setErrorAction(null);
      await generateOutreachNoteAction(scoredJobId);
      await loadAssets();
    } catch (e: any) {
      setErrorAction(e.message || 'Failed to generate outreach note');
    } finally {
      setLoadingAction(null);
    }
  };

  const handleToggleApplied = async () => {
    try {
      setLoadingAction('applied');
      setErrorAction(null);
      const res = await toggleAppliedStatus(scoredJobId);
      if (res.success) setIsApplied(res.applied);
    } catch (e: any) {
      setErrorAction(e.message || 'Failed to update applied status');
    } finally {
      setLoadingAction(null);
    }
  };

  const latestResume = assets.find(a => a.type === 'resume');
  const latestAts = assets.find(a => a.type === 'ats_report');
  const latestCoverLetter = assets.find(a => a.type === 'cover_letter');
  const latestOutreach = assets.find(a => a.type === 'outreach_note');
  const latestAtsReport = parseAtsReportContent(latestAts?.content);
  const aiGenerationLimited =
    capabilities?.safe_modes?.ai_generation_limited === true ||
    capabilities?.has_ai_provider === false;
  const toggleExpandedAsset = (assetId: number) => {
    setExpandedAsset(expandedAsset === assetId ? null : assetId);
  };

  return (
    <div className="space-y-4 pt-4 border-t border-border mt-4">
      <h4 className="font-semibold text-sm">Application Assets</h4>
      
      {errorAction && (
        <div className="p-3 bg-danger-bg border border-danger-border text-danger rounded-apple text-sm">
          {errorAction}
        </div>
      )}

      {aiGenerationLimited && (
        <div className="rounded-apple border border-warning-border bg-warning-bg p-3 text-xs text-warning">
          No live AI provider is ready. Document generation will use local fallbacks where available.
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        <button 
          onClick={handleGenerateResume}
          disabled={loadingAction !== null}
          className="flex min-h-11 items-center gap-2 rounded-apple border border-card-border bg-surface-container-low px-3 py-2 text-sm font-medium text-primary transition-colors hover:bg-surface-container-low disabled:opacity-50"
        >
          {loadingAction === 'resume' ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileText className="w-4 h-4" />}
          {latestResume ? 'Regenerate Resume' : 'Generate Resume'}
        </button>

        <button 
          onClick={handleGenerateCoverLetter}
          disabled={loadingAction !== null}
          className="flex min-h-11 items-center gap-2 rounded-apple border border-warning-border bg-warning-bg px-3 py-2 text-sm font-medium text-warning transition-colors hover:bg-warning-bg disabled:opacity-50"
        >
          {loadingAction === 'cover_letter' ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileText className="w-4 h-4" />}
          {latestCoverLetter ? 'Regenerate Cover Letter' : 'Generate Cover Letter'}
        </button>

        <button 
          onClick={handleGenerateOutreach}
          disabled={loadingAction !== null}
          className="flex min-h-11 items-center gap-2 rounded-apple border border-warning-border bg-warning-bg px-3 py-2 text-sm font-medium text-primary transition-colors hover:bg-warning-bg disabled:opacity-50"
        >
          {loadingAction === 'outreach' ? <Loader2 className="w-4 h-4 animate-spin" /> : <MessageSquare className="w-4 h-4" />}
          {latestOutreach ? 'Regenerate Outreach Note' : 'Generate Outreach Note'}
        </button>

        <div className="flex-1" />

        <button 
          onClick={handleToggleApplied}
          disabled={loadingAction !== null}
          className={`flex min-h-11 items-center gap-2 rounded-apple border px-3 py-2 text-sm font-medium transition-colors disabled:opacity-50 ${isApplied ? 'bg-success-bg text-success border-success-border' : 'bg-secondary text-secondary-foreground border-border hover:bg-secondary-hover'}`}
        >
          {loadingAction === 'applied' ? <Loader2 className="w-4 h-4 animate-spin" /> : (isApplied ? <CheckCircle2 className="w-4 h-4" /> : <Briefcase className="w-4 h-4" />)}
          {isApplied ? 'Applied' : 'Mark Applied'}
        </button>

        <a 
          href={jobUrl}
          target="_blank"
          rel="noreferrer"
          className="flex min-h-11 items-center gap-2 rounded-apple bg-primary px-3 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
        >
          <ExternalLink className="w-4 h-4" /> Open Job
        </a>
      </div>

      {/* Generated Assets Display */}
      {assets.length > 0 && (
        <div className="mt-6 space-y-3">
          {/* Resume & ATS */}
          {latestResume && (
            <div className="apple-card p-4">
              <div className="flex items-center justify-between gap-3">
                <button
                  type="button"
                  className="flex min-h-11 flex-1 items-center justify-between gap-3 rounded-apple text-left focus:outline-none focus:ring-2 focus:ring-primary/30"
                  aria-expanded={expandedAsset === latestResume.id}
                  onClick={() => toggleExpandedAsset(latestResume.id)}
                >
                  <div className="flex items-center gap-3">
                    <FileText className="w-5 h-5 text-primary" />
                    <div>
                      <h5 className="font-medium text-sm">Tailored Resume (v{latestResume.version})</h5>
                      {latestAts && (
                        <p className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                          <span>ATS Match: <span className="font-semibold text-foreground">{latestAts.atsScore}%</span></span>
                          <AdvisoryEstimateLabel />
                        </p>
                      )}
                    </div>
                  </div>
                  {expandedAsset === latestResume.id ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
                </button>
                <a
                  href={`/api/download?assetId=${encodeURIComponent(String(latestResume.id))}`}
                  download
                  className="inline-flex min-h-11 min-w-11 items-center justify-center rounded text-muted-foreground hover:bg-muted hover:text-foreground"
                  aria-label={`Download tailored resume v${latestResume.version || 1}`}
                  title="Download tailored resume"
                >
                  <Download className="w-4 h-4" />
                </a>
              </div>
              
              {expandedAsset === latestResume.id && latestAts && (
                <div className="mt-4 pt-4 border-t border-border text-sm space-y-4">
                  <AtsReportBreakdown
                    report={latestAtsReport}
                    score={latestAts.atsScore}
                    resumeFilePath={latestResume.filePath}
                  />
                </div>
              )}
            </div>
          )}

          {/* Cover Letter */}
          {latestCoverLetter && (
            <div className="apple-card p-4">
              <div className="flex items-center justify-between gap-3">
                <button
                  type="button"
                  className="flex min-h-11 flex-1 items-center justify-between gap-3 rounded-apple text-left focus:outline-none focus:ring-2 focus:ring-primary/30"
                  aria-expanded={expandedAsset === latestCoverLetter.id}
                  onClick={() => toggleExpandedAsset(latestCoverLetter.id)}
                >
                  <div className="flex items-center gap-3">
                    <FileText className="w-5 h-5 text-warning" />
                    <h5 className="font-medium text-sm">Cover Letter (v{latestCoverLetter.version})</h5>
                  </div>
                  {expandedAsset === latestCoverLetter.id ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
                </button>
                <button
                  type="button"
                  onClick={() => navigator.clipboard.writeText(latestCoverLetter.content)}
                  className="inline-flex min-h-11 min-w-11 items-center justify-center rounded text-muted-foreground hover:bg-muted hover:text-foreground"
                  aria-label={`Copy cover letter v${latestCoverLetter.version || 1}`}
                  title="Copy cover letter"
                >
                  <Copy className="w-4 h-4" />
                </button>
              </div>
              {expandedAsset === latestCoverLetter.id && (
                <div className="mt-4 pt-4 border-t border-border">
                  <div className="p-3 bg-muted/30 rounded-apple text-sm whitespace-pre-wrap font-serif text-foreground/90 max-h-64 overflow-y-auto">
                    {latestCoverLetter.content}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Outreach Note */}
          {latestOutreach && (
            <div className="apple-card p-4">
              <div className="flex items-center justify-between gap-3">
                <button
                  type="button"
                  className="flex min-h-11 flex-1 items-center justify-between gap-3 rounded-apple text-left focus:outline-none focus:ring-2 focus:ring-primary/30"
                  aria-expanded={expandedAsset === latestOutreach.id}
                  onClick={() => toggleExpandedAsset(latestOutreach.id)}
                >
                  <div className="flex items-center gap-3">
                    <MessageSquare className="w-5 h-5 text-primary" />
                    <h5 className="font-medium text-sm">Outreach Note (v{latestOutreach.version})</h5>
                  </div>
                  {expandedAsset === latestOutreach.id ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
                </button>
                <button
                  type="button"
                  onClick={() => navigator.clipboard.writeText(latestOutreach.content)}
                  className="inline-flex min-h-11 min-w-11 items-center justify-center rounded text-muted-foreground hover:bg-muted hover:text-foreground"
                  aria-label={`Copy outreach note v${latestOutreach.version || 1}`}
                  title="Copy outreach note"
                >
                  <Copy className="w-4 h-4" />
                </button>
              </div>
              {expandedAsset === latestOutreach.id && (
                <div className="mt-4 pt-4 border-t border-border">
                  <div className="p-3 bg-muted/30 rounded-apple text-sm whitespace-pre-wrap text-foreground/90">
                    {latestOutreach.content}
                  </div>
                </div>
              )}
            </div>
          )}

        </div>
      )}
    </div>
  );
}
