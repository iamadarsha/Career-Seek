'use client';

import { useState, useEffect } from 'react';
import { getActiveProfile, startJobScan, getLatestScanStatus, triggerScoring, getDashboardData, generateBriefForJob } from './actions';
import { Play, Loader2, Search, CheckCircle2, XCircle, Clock, ChevronDown, ChevronUp, Sparkles, Filter, Briefcase } from 'lucide-react';

export default function DiscoverDashboard() {
  const [profile, setProfile] = useState<any>(null);
  const [scanStatus, setScanStatus] = useState<any>(null);
  const [dashboardData, setDashboardData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [scoring, setScoring] = useState(false);
  
  // Filters
  const [tierFilter, setTierFilter] = useState('All');
  const [portalFilter, setPortalFilter] = useState('All');
  const [searchQuery, setSearchQuery] = useState('');
  const [isSearching, setIsSearching] = useState(false);

  // Expanded states
  const [expandedJobId, setExpandedJobId] = useState<number | null>(null);
  const [briefLoadingMap, setBriefLoadingMap] = useState<Record<number, boolean>>({});

  useEffect(() => {
    loadData();
  }, [tierFilter, portalFilter]);

  async function loadData(query?: string) {
    const activeProfile = await getActiveProfile();
    setProfile(activeProfile);
    if (activeProfile) {
      const status = await getLatestScanStatus(activeProfile.id);
      setScanStatus(status);
      const data = await getDashboardData(activeProfile.id, tierFilter, portalFilter, query);
      setDashboardData(data);
    }
    setLoading(false);
  }

  // Poll for scan updates
  useEffect(() => {
    if (!scanStatus?.scan) return;
    if (['preparing', 'scraping'].includes(scanStatus.scan.status)) {
      const interval = setInterval(async () => {
        const updated = await getLatestScanStatus(profile.id);
        setScanStatus(updated);
      }, 3000);
      return () => clearInterval(interval);
    }
  }, [scanStatus, profile]);

  const handleStartScan = async () => {
    if (!profile) return;
    await startJobScan(profile.id, ['linkedin', 'naukri', 'wellfound']);
    setScanStatus({ scan: { status: 'preparing', startedAt: new Date(), totalJobs: 0 }, portalRuns: [] });
  };

  const handleScoreJobs = async () => {
    setScoring(true);
    await triggerScoring();
    await loadData(searchQuery);
    setScoring(false);
  };

  const handleSearchSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSearching(true);
    await loadData(searchQuery);
    setIsSearching(false);
  };

  const handleGenerateBrief = async (scoredJobId: number) => {
    setBriefLoadingMap(prev => ({ ...prev, [scoredJobId]: true }));
    const res = await generateBriefForJob(scoredJobId);
    if (res.success) {
      // Refresh to get the enrichment data
      await loadData(searchQuery);
    }
    setBriefLoadingMap(prev => ({ ...prev, [scoredJobId]: false }));
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center h-64">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  const isScanning = scanStatus?.scan?.status === 'preparing' || scanStatus?.scan?.status === 'scraping';
  const hasUnscoredJobs = dashboardData?.stats?.total === 0 && scanStatus?.scan?.status === 'complete';

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      
      {/* Header & Scan Status */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-semibold tracking-tight">Review Opportunities</h2>
          <p className="text-muted-foreground text-sm mt-1">
            {scanStatus?.scan ? `Last scan: ${new Date(scanStatus.scan.finishedAt || scanStatus.scan.startedAt).toLocaleString()}` : 'No recent scans'}
          </p>
        </div>
        <div className="flex gap-3">
          <button 
            onClick={handleStartScan}
            disabled={isScanning}
            className="flex items-center gap-2 px-4 py-2 bg-secondary text-secondary-foreground rounded-apple font-medium hover:bg-secondary-hover transition-colors disabled:opacity-50 text-sm border border-border"
          >
            {isScanning ? <Loader2 className="w-4 h-4 animate-spin" /> : <Clock className="w-4 h-4" />}
            {isScanning ? 'Scanning...' : 'Run Scan'}
          </button>
          <button 
            onClick={handleScoreJobs}
            disabled={scoring || isScanning}
            className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-apple font-medium hover:bg-primary-hover transition-colors disabled:opacity-50 text-sm shadow-sm"
          >
            {scoring ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
            {scoring ? 'Scoring...' : 'Score Jobs'}
          </button>
        </div>
      </div>

      {/* Real-time Progress Bar for Background Scans */}
      {isScanning && (
        <div className="bg-card border border-primary/20 rounded-apple-lg p-6 shadow-sm animate-in fade-in zoom-in duration-300 relative overflow-hidden">
          <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-primary/50 via-primary to-primary/50 animate-pulse" />
          
          <div className="flex justify-between items-center mb-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-primary/10 rounded-apple text-primary shadow-[0_0_15px_rgba(var(--primary-rgb),0.1)]">
                <Loader2 className="w-5 h-5 animate-spin" />
              </div>
              <div>
                <h3 className="text-sm font-semibold text-foreground">Scraping Opportunities...</h3>
                <p className="text-xs text-muted-foreground">Checking LinkedIn, Wellfound, and Naukri for new roles.</p>
              </div>
            </div>
            <div className="text-right">
              <span className="text-sm font-bold text-primary tabular-nums">{scanStatus.progress || 0}%</span>
              <p className="text-[10px] text-muted-foreground uppercase tracking-widest font-bold">Progress</p>
            </div>
          </div>
          
          <div className="h-3 w-full bg-muted/50 rounded-full overflow-hidden border border-border/50 p-[2px]">
            <div 
              className="h-full bg-primary rounded-full transition-all duration-1000 ease-out shadow-[0_0_15px_rgba(var(--primary-rgb),0.4)] relative"
              style={{ width: `${scanStatus.progress || 0}%` }}
            >
              <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent animate-shimmer" />
            </div>
          </div>
          
          <div className="mt-5 grid grid-cols-2 md:grid-cols-4 gap-4">
            {scanStatus.portalRuns?.map((run: any) => (
              <div key={run.id} className="flex items-center gap-3 p-2 rounded-apple bg-muted/30 border border-border/50">
                <div className={`p-1.5 rounded-full ${run.status === 'complete' ? 'bg-green-100 text-green-600' : run.status === 'error' ? 'bg-red-100 text-red-600' : 'bg-blue-100 text-blue-600 animate-pulse'}`}>
                  {run.status === 'complete' ? (
                    <CheckCircle2 className="w-3.5 h-3.5" />
                  ) : run.status === 'error' ? (
                    <XCircle className="w-3.5 h-3.5" />
                  ) : (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  )}
                </div>
                <div className="min-w-0">
                  <p className="text-[10px] uppercase tracking-wider font-bold text-muted-foreground leading-none mb-1">{run.portal}</p>
                  <p className="text-xs font-semibold truncate">{run.status === 'complete' ? `${run.jobsFound} jobs found` : run.status === 'error' ? 'Failed' : 'Running...'}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Stats Grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-card border border-card-border rounded-apple-lg p-5 shadow-sm">
          <p className="text-sm font-medium text-muted-foreground">Total Scored</p>
          <p className="text-3xl font-semibold mt-1">{dashboardData?.stats?.total || 0}</p>
        </div>
        <div className="bg-card border border-card-border rounded-apple-lg p-5 shadow-sm relative overflow-hidden">
          <div className="absolute top-0 left-0 w-1 h-full bg-green-500" />
          <p className="text-sm font-medium text-muted-foreground">Tier A (Apply Today)</p>
          <p className="text-3xl font-semibold mt-1">{dashboardData?.stats?.tierCounts?.A || 0}</p>
        </div>
        <div className="bg-card border border-card-border rounded-apple-lg p-5 shadow-sm relative overflow-hidden">
          <div className="absolute top-0 left-0 w-1 h-full bg-blue-500" />
          <p className="text-sm font-medium text-muted-foreground">Tier B (Strong Review)</p>
          <p className="text-3xl font-semibold mt-1">{dashboardData?.stats?.tierCounts?.B || 0}</p>
        </div>
        <div className="bg-card border border-card-border rounded-apple-lg p-5 shadow-sm relative overflow-hidden">
          <div className="absolute top-0 left-0 w-1 h-full bg-orange-500" />
          <p className="text-sm font-medium text-muted-foreground">Tier C (Stretch)</p>
          <p className="text-3xl font-semibold mt-1">{dashboardData?.stats?.tierCounts?.C || 0}</p>
        </div>
      </div>

      {/* AI Search & Filters */}
      <div className="bg-card border border-card-border rounded-apple-lg p-4 shadow-sm flex flex-col md:flex-row gap-4 items-center">
        <form onSubmit={handleSearchSubmit} className="flex-1 relative w-full">
          <Search className="w-4 h-4 absolute left-3 top-3 text-muted-foreground" />
          <input 
            type="text" 
            placeholder="Search intelligently (e.g. 'remote PM roles with LLM experience')..."
            className="w-full bg-background border border-input rounded-apple pl-10 pr-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
          />
          {isSearching && (
            <Loader2 className="w-4 h-4 absolute right-3 top-3 text-muted-foreground animate-spin" />
          )}
        </form>
        
        <div className="flex gap-2 w-full md:w-auto">
          <select 
            value={tierFilter} 
            onChange={e => setTierFilter(e.target.value)}
            className="bg-background border border-input rounded-apple px-3 py-2 text-sm focus:outline-none"
          >
            <option value="All">All Tiers</option>
            <option value="A">Tier A</option>
            <option value="B">Tier B</option>
            <option value="C">Tier C</option>
            <option value="D">Tier D</option>
          </select>
          <select 
            value={portalFilter} 
            onChange={e => setPortalFilter(e.target.value)}
            className="bg-background border border-input rounded-apple px-3 py-2 text-sm focus:outline-none capitalize"
          >
            <option value="All">All Portals</option>
            {Object.keys(dashboardData?.stats?.portalCounts || {}).map(p => (
              <option key={p} value={p}>{p}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Job List */}
      <div className="space-y-4">
        {dashboardData?.jobs?.length === 0 ? (
          <div className="text-center py-12 border border-dashed border-border rounded-apple-lg">
            <Briefcase className="w-12 h-12 text-muted-foreground/50 mx-auto mb-3" />
            <h3 className="text-lg font-medium">No matching jobs found</h3>
            <p className="text-muted-foreground text-sm mt-1 max-w-sm mx-auto">
              Try adjusting your filters, running a new scan, or scoring recently acquired jobs.
            </p>
          </div>
        ) : (
          dashboardData?.jobs?.map(({ scoredJob, normalizedJob, enrichment }: any) => {
            const isExpanded = expandedJobId === scoredJob.id;
            const breakdown = JSON.parse(scoredJob.breakdown || '{}');
            
            const tierColors: Record<string, string> = {
              A: 'bg-green-100 text-green-800 border-green-200',
              B: 'bg-blue-100 text-blue-800 border-blue-200',
              C: 'bg-orange-100 text-orange-800 border-orange-200',
              D: 'bg-slate-100 text-slate-800 border-slate-200'
            };

            return (
              <div key={scoredJob.id} className="bg-card border border-card-border rounded-apple-lg overflow-hidden shadow-sm hover:shadow-apple-hover transition-all">
                <div className="p-5 cursor-pointer flex flex-col sm:flex-row gap-4 items-start sm:items-center" onClick={() => setExpandedJobId(isExpanded ? null : scoredJob.id)}>
                  
                  {/* Score Ring / Badge */}
                  <div className="flex-shrink-0 relative w-14 h-14 flex items-center justify-center rounded-full border-4 border-muted">
                    <div className="absolute inset-0 rounded-full border-4 border-primary" style={{ clipPath: `polygon(0 0, 100% 0, 100% ${scoredJob.score}%, 0 ${scoredJob.score}%)`, opacity: 0.2 }} />
                    <span className="text-lg font-bold">{scoredJob.score}</span>
                  </div>

                  {/* Core Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                      <h3 className="text-lg font-semibold truncate text-foreground">{normalizedJob?.title}</h3>
                      <span className={`text-xs px-2 py-0.5 rounded-full border font-medium ${tierColors[scoredJob.tier]}`}>
                        Tier {scoredJob.tier}
                      </span>
                      <span className="text-xs px-2 py-0.5 rounded-full border bg-muted text-muted-foreground capitalize">
                        {normalizedJob?.portal}
                      </span>
                    </div>
                    <div className="text-sm text-muted-foreground flex items-center gap-3 flex-wrap">
                      <span className="font-medium text-foreground/80">{normalizedJob?.company}</span>
                      {normalizedJob?.location && <span>• {normalizedJob.location}</span>}
                      {normalizedJob?.salaryRaw && <span>• {normalizedJob.salaryRaw}</span>}
                    </div>
                  </div>

                  {/* Actions / Indicators */}
                  <div className="flex-shrink-0 flex items-center gap-3">
                    {enrichment && (
                      <span className="flex items-center gap-1 text-xs font-medium text-indigo-600 bg-indigo-50 px-2 py-1 rounded-full">
                        <Sparkles className="w-3 h-3" /> AI Brief
                      </span>
                    )}
                    {isExpanded ? <ChevronUp className="w-5 h-5 text-muted-foreground" /> : <ChevronDown className="w-5 h-5 text-muted-foreground" />}
                  </div>
                </div>

                {/* Expanded Details */}
                {isExpanded && (
                  <div className="border-t border-border bg-muted/20 p-5 space-y-6">
                    
                    <div className="flex gap-4 items-start">
                      <div className="flex-1 space-y-2">
                        <h4 className="text-sm font-semibold">Job Snippet</h4>
                        <p className="text-sm text-muted-foreground leading-relaxed">
                          {normalizedJob?.snippet || 'No snippet available.'}
                        </p>
                      </div>
                      <div className="flex-1 space-y-2">
                        <h4 className="text-sm font-semibold">Score Breakdown ({scoredJob.score}/100)</h4>
                        <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
                          <span className="text-muted-foreground">Title Fit:</span> <span>{breakdown.titleScore}/20</span>
                          <span className="text-muted-foreground">Skills Fit:</span> <span>{breakdown.skillScore}/30</span>
                          <span className="text-muted-foreground">Exp Fit:</span> <span>{breakdown.experienceScore}/20</span>
                          <span className="text-muted-foreground">Mode Fit:</span> <span>{breakdown.workModeScore}/15</span>
                          <span className="text-muted-foreground">Keywords:</span> <span>{breakdown.keywordScore}/15</span>
                        </div>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                      {breakdown.positiveFactors?.length > 0 && (
                        <div className="bg-green-50/50 border border-green-100 rounded-apple p-3">
                          <h4 className="font-medium text-green-800 mb-2 flex items-center gap-1"><CheckCircle2 className="w-4 h-4"/> Positive Signals</h4>
                          <ul className="list-disc pl-4 text-green-700 space-y-1">
                            {breakdown.positiveFactors.map((f: string, i: number) => <li key={i}>{f}</li>)}
                          </ul>
                        </div>
                      )}
                      {breakdown.negativeFactors?.length > 0 && (
                        <div className="bg-orange-50/50 border border-orange-100 rounded-apple p-3">
                          <h4 className="font-medium text-orange-800 mb-2 flex items-center gap-1"><XCircle className="w-4 h-4"/> Missing/Negative Signals</h4>
                          <ul className="list-disc pl-4 text-orange-700 space-y-1">
                            {breakdown.negativeFactors.map((f: string, i: number) => <li key={i}>{f}</li>)}
                          </ul>
                        </div>
                      )}
                    </div>

                    {/* AI Brief Section */}
                    <div className="bg-card border border-border rounded-apple shadow-sm p-4">
                      {enrichment ? (
                        <div className="space-y-4">
                          <div className="flex items-center gap-2 mb-2">
                            <Sparkles className="w-5 h-5 text-indigo-500" />
                            <h4 className="font-semibold text-foreground">AI Fit Brief</h4>
                          </div>
                          <p className="text-sm text-foreground/90">{enrichment.fitSummary}</p>
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
                            <div>
                              <h5 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Top Reasons to Apply</h5>
                              <ul className="text-sm space-y-1 pl-4 list-disc text-foreground/80">
                                {JSON.parse(enrichment.pros || '[]').map((p: string, i: number) => <li key={i}>{p}</li>)}
                              </ul>
                            </div>
                            <div>
                              <h5 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Watch-outs</h5>
                              <ul className="text-sm space-y-1 pl-4 list-disc text-foreground/80">
                                {JSON.parse(enrichment.cons || '[]').map((c: string, i: number) => <li key={i}>{c}</li>)}
                              </ul>
                            </div>
                          </div>
                          <div className="pt-2 flex flex-col gap-2 text-sm border-t border-border mt-2">
                            <p><span className="font-medium">Interview Angle:</span> {enrichment.interviewAngle}</p>
                            <p><span className="font-medium">Resume Focus:</span> {enrichment.resumeFocus}</p>
                            {enrichment.salaryEstimate && <p><span className="font-medium">Salary Insight:</span> {enrichment.salaryEstimate}</p>}
                          </div>
                        </div>
                      ) : (
                        <div className="flex items-center justify-between">
                          <p className="text-sm text-muted-foreground">Generate an AI brief to get deep insights on fit and interview angles.</p>
                          <button 
                            onClick={(e) => { e.stopPropagation(); handleGenerateBrief(scoredJob.id); }}
                            disabled={briefLoadingMap[scoredJob.id]}
                            className="flex items-center gap-2 px-3 py-1.5 bg-indigo-50 text-indigo-600 rounded-apple font-medium hover:bg-indigo-100 transition-colors text-sm border border-indigo-100 disabled:opacity-50"
                          >
                            {briefLoadingMap[scoredJob.id] ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                            Generate Brief
                          </button>
                        </div>
                      )}
                    </div>
                    
                    <div className="flex justify-end pt-2">
                      <a 
                        href={normalizedJob?.url} 
                        target="_blank" 
                        rel="noreferrer"
                        className="px-4 py-2 bg-primary text-primary-foreground rounded-apple text-sm font-medium hover:bg-primary-hover transition-colors"
                      >
                        View Original Posting
                      </a>
                    </div>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

    </div>
  );
}
