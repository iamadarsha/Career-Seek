'use client';

import { useState, useEffect } from 'react';
import { 
  generateResumePipeline, 
  generateCoverLetterAction, 
  generateOutreachNoteAction, 
  toggleAppliedStatus, 
  getDocumentAssets 
} from './document-actions';
import { Loader2, FileText, CheckCircle2, MessageSquare, Briefcase, ChevronDown, ChevronUp, Copy, ExternalLink, Download } from 'lucide-react';

export function JobActionPanel({ scoredJobId, jobUrl }: { scoredJobId: number, jobUrl: string }) {
  const [loadingAction, setLoadingAction] = useState<string | null>(null);
  const [errorAction, setErrorAction] = useState<string | null>(null);
  const [assets, setAssets] = useState<any[]>([]);
  const [isApplied, setIsApplied] = useState(false);
  const [expandedAsset, setExpandedAsset] = useState<number | null>(null);

  useEffect(() => {
    loadAssets();
  }, [scoredJobId]);

  async function loadAssets() {
    const res = await getDocumentAssets(scoredJobId);
    if (res.success) {
      setAssets(res.assets);
      setIsApplied(res.isApplied);
    }
  }

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

  return (
    <div className="space-y-4 pt-4 border-t border-border mt-4">
      <h4 className="font-semibold text-sm">Application Assets</h4>
      
      {errorAction && (
        <div className="p-3 bg-red-50 border border-red-200 text-red-700 rounded-apple text-sm">
          {errorAction}
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        <button 
          onClick={handleGenerateResume}
          disabled={loadingAction !== null}
          className="flex items-center gap-2 px-3 py-1.5 bg-blue-50 text-blue-700 rounded-apple text-sm font-medium hover:bg-blue-100 transition-colors border border-blue-200 disabled:opacity-50"
        >
          {loadingAction === 'resume' ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileText className="w-4 h-4" />}
          {latestResume ? 'Regenerate Resume' : 'Generate Resume'}
        </button>

        <button 
          onClick={handleGenerateCoverLetter}
          disabled={loadingAction !== null}
          className="flex items-center gap-2 px-3 py-1.5 bg-purple-50 text-purple-700 rounded-apple text-sm font-medium hover:bg-purple-100 transition-colors border border-purple-200 disabled:opacity-50"
        >
          {loadingAction === 'cover_letter' ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileText className="w-4 h-4" />}
          {latestCoverLetter ? 'Regenerate Cover Letter' : 'Generate Cover Letter'}
        </button>

        <button 
          onClick={handleGenerateOutreach}
          disabled={loadingAction !== null}
          className="flex items-center gap-2 px-3 py-1.5 bg-orange-50 text-orange-700 rounded-apple text-sm font-medium hover:bg-orange-100 transition-colors border border-orange-200 disabled:opacity-50"
        >
          {loadingAction === 'outreach' ? <Loader2 className="w-4 h-4 animate-spin" /> : <MessageSquare className="w-4 h-4" />}
          {latestOutreach ? 'Regenerate Outreach Note' : 'Generate Outreach Note'}
        </button>

        <div className="flex-1" />

        <button 
          onClick={handleToggleApplied}
          disabled={loadingAction !== null}
          className={`flex items-center gap-2 px-3 py-1.5 rounded-apple text-sm font-medium transition-colors border disabled:opacity-50 ${isApplied ? 'bg-green-100 text-green-800 border-green-200' : 'bg-secondary text-secondary-foreground border-border hover:bg-secondary-hover'}`}
        >
          {loadingAction === 'applied' ? <Loader2 className="w-4 h-4 animate-spin" /> : (isApplied ? <CheckCircle2 className="w-4 h-4" /> : <Briefcase className="w-4 h-4" />)}
          {isApplied ? 'Applied' : 'Mark Applied'}
        </button>

        <a 
          href={jobUrl}
          target="_blank"
          rel="noreferrer"
          className="flex items-center gap-2 px-3 py-1.5 bg-primary text-primary-foreground rounded-apple text-sm font-medium hover:bg-primary/90 transition-colors"
        >
          <ExternalLink className="w-4 h-4" /> Open Job
        </a>
      </div>

      {/* Generated Assets Display */}
      {assets.length > 0 && (
        <div className="mt-6 space-y-3">
          {/* Resume & ATS */}
          {latestResume && (
            <div className="bg-card border border-border rounded-apple p-4 shadow-sm">
              <div className="flex justify-between items-center cursor-pointer" onClick={() => setExpandedAsset(expandedAsset === latestResume.id ? null : latestResume.id)}>
                <div className="flex items-center gap-3">
                  <FileText className="w-5 h-5 text-blue-600" />
                  <div>
                    <h5 className="font-medium text-sm">Tailored Resume (v{latestResume.version})</h5>
                    {latestAts && (
                      <p className="text-xs text-muted-foreground mt-0.5">
                        ATS Match: <span className="font-semibold text-foreground">{latestAts.atsScore}%</span>
                      </p>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <button onClick={(e) => { 
                    e.stopPropagation(); 
                    window.location.href = `/api/download?path=${encodeURIComponent(latestResume.filePath)}`;
                  }} className="p-1 hover:bg-muted rounded text-muted-foreground hover:text-foreground" title="Download Document">
                    <Download className="w-4 h-4" />
                  </button>
                  {expandedAsset === latestResume.id ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
                </div>
              </div>
              
              {expandedAsset === latestResume.id && latestAts && (
                <div className="mt-4 pt-4 border-t border-border text-sm space-y-4">
                  {(() => {
                    const ats = JSON.parse(latestAts.content);
                    return (
                      <>
                        <div className="grid grid-cols-2 gap-4">
                          <div>
                            <span className="font-medium text-green-700">Found Keywords:</span>
                            <div className="flex flex-wrap gap-1 mt-1">
                              {ats.keywordsFound?.map((k: string, i: number) => <span key={i} className="text-xs bg-green-50 border border-green-200 text-green-800 px-1.5 py-0.5 rounded">{k}</span>)}
                            </div>
                          </div>
                          <div>
                            <span className="font-medium text-red-700">Missing Keywords:</span>
                            <div className="flex flex-wrap gap-1 mt-1">
                              {ats.keywordsMissing?.map((k: string, i: number) => <span key={i} className="text-xs bg-red-50 border border-red-200 text-red-800 px-1.5 py-0.5 rounded">{k}</span>)}
                            </div>
                          </div>
                        </div>
                        {ats.sectionRecommendations?.length > 0 && (
                          <div className="bg-orange-50/50 p-3 rounded-apple border border-orange-100">
                            <span className="font-medium text-orange-800">Recommendations:</span>
                            <ul className="list-disc pl-4 mt-1 space-y-1 text-orange-900">
                              {ats.sectionRecommendations.map((r: any, i: number) => (
                                <li key={i}><strong>{r.section}:</strong> {r.recommendation}</li>
                              ))}
                            </ul>
                          </div>
                        )}
                        <p className="text-xs text-muted-foreground">Local file: {latestResume.filePath}</p>
                      </>
                    );
                  })()}
                </div>
              )}
            </div>
          )}

          {/* Cover Letter */}
          {latestCoverLetter && (
            <div className="bg-card border border-border rounded-apple p-4 shadow-sm">
              <div className="flex justify-between items-center cursor-pointer" onClick={() => setExpandedAsset(expandedAsset === latestCoverLetter.id ? null : latestCoverLetter.id)}>
                <div className="flex items-center gap-3">
                  <FileText className="w-5 h-5 text-purple-600" />
                  <h5 className="font-medium text-sm">Cover Letter (v{latestCoverLetter.version})</h5>
                </div>
                <div className="flex items-center gap-3">
                  <button onClick={(e) => { e.stopPropagation(); navigator.clipboard.writeText(latestCoverLetter.content); }} className="p-1 hover:bg-muted rounded text-muted-foreground hover:text-foreground" title="Copy">
                    <Copy className="w-4 h-4" />
                  </button>
                  {expandedAsset === latestCoverLetter.id ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
                </div>
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
            <div className="bg-card border border-border rounded-apple p-4 shadow-sm">
              <div className="flex justify-between items-center cursor-pointer" onClick={() => setExpandedAsset(expandedAsset === latestOutreach.id ? null : latestOutreach.id)}>
                <div className="flex items-center gap-3">
                  <MessageSquare className="w-5 h-5 text-orange-600" />
                  <h5 className="font-medium text-sm">Outreach Note (v{latestOutreach.version})</h5>
                </div>
                <div className="flex items-center gap-3">
                  <button onClick={(e) => { e.stopPropagation(); navigator.clipboard.writeText(latestOutreach.content); }} className="p-1 hover:bg-muted rounded text-muted-foreground hover:text-foreground" title="Copy">
                    <Copy className="w-4 h-4" />
                  </button>
                  {expandedAsset === latestOutreach.id ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
                </div>
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
