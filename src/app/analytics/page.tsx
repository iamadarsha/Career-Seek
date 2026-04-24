'use client';

import { useState, useEffect, useTransition } from 'react';
import {
  TrendingUp, Search, FileText, Calendar, FlaskConical,
  RefreshCw, Download, X, ChevronRight, AlertCircle,
  CheckCircle2, Clock, Target, Zap,
} from 'lucide-react';
import {
  actionGetOverallFunnel,
  actionGetPortalPerformance,
  actionGetSearchProfilePerformance,
  actionGetAtsDistribution,
  actionGetDocumentUsageStats,
  actionGetAtsVsOutcomes,
  actionGetTimeSummary,
  actionGetStaleOpportunities,
  actionRunInsightEngine,
  actionGetActiveInsights,
  actionDismissInsight,
  actionComputeAndSaveWeeklyReview,
  actionGetLatestWeeklyReview,
  actionListExperiments,
  actionCreateExperiment,
  actionUpdateExperiment,
  actionExportAnalyticsReport,
  actionGetSearchSummary,
  actionGetDocumentSummary,
  actionGetRecentEvents,
} from './analytics-actions';

type Tab = 'overview' | 'funnel' | 'search' | 'documents' | 'weekly' | 'experiments' | 'activity';

// ─── Small UI helpers ─────────────────────────────────────────────────────────

function Card({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`bg-card border border-card-border rounded-apple p-5 shadow-sm ${className}`}>
      {children}
    </div>
  );
}

function KpiCard({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
  return (
    <Card>
      <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1">{label}</p>
      <p className="text-2xl font-semibold text-foreground">{value}</p>
      {sub && <p className="text-xs text-muted-foreground mt-1">{sub}</p>}
    </Card>
  );
}

function TabButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={`px-4 py-2 text-sm font-medium rounded-full transition-colors ${
        active
          ? 'bg-primary text-primary-foreground'
          : 'text-muted-foreground hover:text-foreground hover:bg-muted'
      }`}
    >
      {children}
    </button>
  );
}

function SectionHeader({ title, action }: { title: string; action?: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between mb-4">
      <h3 className="text-base font-semibold text-foreground">{title}</h3>
      {action}
    </div>
  );
}

const CONFIDENCE_COLOR: Record<string, string> = {
  high: '#34C759',
  medium: '#FF9500',
  low: '#8E8E93',
};

// ─── Overview Tab ─────────────────────────────────────────────────────────────

function OverviewTab() {
  const [funnel, setFunnel] = useState<any[]>([]);
  const [timeSummary, setTimeSummary] = useState<any>(null);
  const [docSummary, setDocSummary] = useState<any>(null);
  const [searchSummary, setSearchSummary] = useState<any>(null);
  const [insights, setInsights] = useState<any[]>([]);
  const [isPending, startTransition] = useTransition();
  const [runningInsights, setRunningInsights] = useState(false);

  const load = () => {
    startTransition(async () => {
      const [fRes, tRes, dRes, sRes, iRes] = await Promise.all([
        actionGetOverallFunnel(),
        actionGetTimeSummary(),
        actionGetDocumentSummary(),
        actionGetSearchSummary(),
        actionGetActiveInsights(5),
      ]);
      if (fRes.success) setFunnel(fRes.stages);
      if (tRes.success) setTimeSummary(tRes.summary);
      if (dRes.success) setDocSummary(dRes.summary);
      if (sRes.success) setSearchSummary(sRes.summary);
      if (iRes.success) setInsights(iRes.insights);
    });
  };

  const handleRunInsights = async () => {
    setRunningInsights(true);
    await actionRunInsightEngine();
    const iRes = await actionGetActiveInsights(5);
    if (iRes.success) setInsights(iRes.insights);
    setRunningInsights(false);
  };

  const handleDismiss = async (id: number) => {
    await actionDismissInsight(id);
    setInsights((prev) => prev.filter((i) => i.id !== id));
  };

  useEffect(() => { load(); }, []);

  const applied = funnel.find((s) => s.stage === 'applied');
  const offer = funnel.find((s) => s.stage === 'offer');
  const interview = funnel.find((s) => s.stage === 'interview');

  return (
    <div className="space-y-6">
      {/* KPI row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <KpiCard label="Applied" value={applied?.count ?? '—'} sub={applied?.conversionFromPrev != null ? `${applied.conversionFromPrev}% of saved` : undefined} />
        <KpiCard label="Interviews" value={interview?.count ?? '—'} sub={interview?.conversionFromPrev != null ? `${interview.conversionFromPrev}% of applied` : undefined} />
        <KpiCard label="Offers" value={offer?.count ?? '—'} />
        <KpiCard label="Avg. days to apply" value={timeSummary?.avgDaysToApply != null ? `${timeSummary.avgDaysToApply}d` : '—'} sub={timeSummary?.staleOpportunityCount ? `${timeSummary.staleOpportunityCount} stale` : undefined} />
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <KpiCard label="Resumes generated" value={docSummary?.totalResumes ?? '—'} />
        <KpiCard label="Cover letters" value={docSummary?.totalCoverLetters ?? '—'} />
        <KpiCard label="Best portal" value={searchSummary?.bestPortal ?? '—'} />
        <KpiCard label="Tier A density" value={searchSummary?.tierADensity != null ? `${searchSummary.tierADensity}%` : '—'} />
      </div>

      {/* Insights panel */}
      <Card>
        <SectionHeader
          title="Active Insights"
          action={
            <button
              onClick={handleRunInsights}
              disabled={runningInsights || isPending}
              className="flex items-center gap-1.5 text-xs text-primary hover:underline disabled:opacity-50"
            >
              <Zap size={13} />
              {runningInsights ? 'Running…' : 'Refresh insights'}
            </button>
          }
        />
        {insights.length === 0 ? (
          <p className="text-sm text-muted-foreground">No active insights. Click "Refresh insights" to generate.</p>
        ) : (
          <div className="space-y-3">
            {insights.map((insight) => (
              <div key={insight.id} className="flex items-start gap-3 p-3 rounded-lg bg-muted/40">
                <span
                  className="mt-0.5 h-2 w-2 rounded-full flex-shrink-0"
                  style={{ backgroundColor: CONFIDENCE_COLOR[insight.confidence] ?? '#8E8E93' }}
                />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-foreground">{insight.title}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">{insight.body}</p>
                  {insight.recommendedAction && (
                    <p className="text-xs text-primary mt-1 flex items-center gap-1">
                      <ChevronRight size={11} />
                      {insight.recommendedAction}
                    </p>
                  )}
                </div>
                <button
                  onClick={() => handleDismiss(insight.id)}
                  className="text-muted-foreground hover:text-foreground flex-shrink-0"
                >
                  <X size={14} />
                </button>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}

// ─── Funnel Tab ───────────────────────────────────────────────────────────────

function FunnelTab() {
  const [stages, setStages] = useState<any[]>([]);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    startTransition(async () => {
      const res = await actionGetOverallFunnel();
      if (res.success) setStages(res.stages);
    });
  }, []);

  const maxCount = Math.max(...stages.map((s) => s.count), 1);

  return (
    <div className="space-y-6">
      <Card>
        <SectionHeader title="Pipeline Funnel" />
        {stages.length === 0 ? (
          <p className="text-sm text-muted-foreground">No data yet.</p>
        ) : (
          <div className="space-y-3">
            {stages.map((stage) => (
              <div key={stage.stage} className="space-y-1">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-foreground font-medium">{stage.label}</span>
                  <div className="flex items-center gap-3">
                    {stage.conversionFromPrev != null && (
                      <span className="text-xs text-muted-foreground">{stage.conversionFromPrev}% from prev</span>
                    )}
                    <span className="text-foreground font-semibold w-10 text-right">{stage.count}</span>
                  </div>
                </div>
                <div className="h-2 bg-muted rounded-full overflow-hidden">
                  <div
                    className="h-full bg-primary rounded-full transition-all"
                    style={{ width: `${(stage.count / maxCount) * 100}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}

// ─── Search Analytics Tab ─────────────────────────────────────────────────────

function SearchTab() {
  const [portals, setPortals] = useState<any[]>([]);
  const [profiles, setProfiles] = useState<any[]>([]);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    startTransition(async () => {
      const [pRes, spRes] = await Promise.all([
        actionGetPortalPerformance(),
        actionGetSearchProfilePerformance(),
      ]);
      if (pRes.success) setPortals(pRes.portals);
      if (spRes.success) setProfiles(spRes.profiles);
    });
  }, []);

  return (
    <div className="space-y-6">
      <Card>
        <SectionHeader title="Portal Performance" />
        {portals.length === 0 ? (
          <p className="text-sm text-muted-foreground">No portal data yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-muted-foreground text-xs">
                  <th className="text-left py-2 pr-4">Portal</th>
                  <th className="text-right py-2 pr-4">Discovered</th>
                  <th className="text-right py-2 pr-4">Tier A</th>
                  <th className="text-right py-2 pr-4">Tier A %</th>
                  <th className="text-right py-2">Applications</th>
                </tr>
              </thead>
              <tbody>
                {portals.map((p) => (
                  <tr key={p.portal} className="border-b border-border/50 hover:bg-muted/30">
                    <td className="py-2 pr-4 font-medium">{p.portal}</td>
                    <td className="py-2 pr-4 text-right text-muted-foreground">{p.totalDiscovered}</td>
                    <td className="py-2 pr-4 text-right">{p.tierACount}</td>
                    <td className="py-2 pr-4 text-right">
                      {p.tierARate != null ? (
                        <span className={p.tierARate > 15 ? 'text-green-500' : 'text-foreground'}>
                          {p.tierARate}%
                        </span>
                      ) : '—'}
                    </td>
                    <td className="py-2 text-right">{p.applicationCount}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Card>
        <SectionHeader title="Search Profile Performance" />
        {profiles.length === 0 ? (
          <p className="text-sm text-muted-foreground">No search profile data yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-muted-foreground text-xs">
                  <th className="text-left py-2 pr-4">Profile</th>
                  <th className="text-right py-2 pr-4">Scans</th>
                  <th className="text-right py-2 pr-4">Tier A</th>
                  <th className="text-right py-2 pr-4">Tier A %</th>
                  <th className="text-right py-2">Applied</th>
                </tr>
              </thead>
              <tbody>
                {profiles.map((p) => (
                  <tr key={p.searchProfileId} className="border-b border-border/50 hover:bg-muted/30">
                    <td className="py-2 pr-4 font-medium">{p.title}</td>
                    <td className="py-2 pr-4 text-right text-muted-foreground">{p.scanCount}</td>
                    <td className="py-2 pr-4 text-right">{p.tierACount}</td>
                    <td className="py-2 pr-4 text-right">{p.tierARate != null ? `${p.tierARate}%` : '—'}</td>
                    <td className="py-2 text-right">{p.applicationCount}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}

// ─── Documents Tab ────────────────────────────────────────────────────────────

function DocumentsTab() {
  const [distribution, setDistribution] = useState<any[]>([]);
  const [usageStats, setUsageStats] = useState<any[]>([]);
  const [atsVsOutcomes, setAtsVsOutcomes] = useState<any[]>([]);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    startTransition(async () => {
      const [dRes, uRes, aRes] = await Promise.all([
        actionGetAtsDistribution(),
        actionGetDocumentUsageStats(),
        actionGetAtsVsOutcomes(),
      ]);
      if (dRes.success) setDistribution(dRes.distribution);
      if (uRes.success) setUsageStats(uRes.stats);
      if (aRes.success) setAtsVsOutcomes(aRes.bands);
    });
  }, []);

  return (
    <div className="space-y-6">
      <div className="grid md:grid-cols-2 gap-6">
        <Card>
          <SectionHeader title="ATS Score Distribution" />
          {distribution.length === 0 ? (
            <p className="text-sm text-muted-foreground">No document data yet.</p>
          ) : (
            <div className="space-y-3">
              {distribution.map((band) => (
                <div key={band.range} className="flex items-center gap-3">
                  <span className="text-xs text-muted-foreground w-16 flex-shrink-0">{band.range}</span>
                  <div className="flex-1 h-5 bg-muted rounded overflow-hidden">
                    <div
                      className="h-full bg-primary/70 rounded transition-all"
                      style={{ width: `${band.pct}%` }}
                    />
                  </div>
                  <span className="text-xs text-foreground w-8 text-right">{band.count}</span>
                </div>
              ))}
            </div>
          )}
        </Card>

        <Card>
          <SectionHeader title="Document Usage" />
          {usageStats.length === 0 ? (
            <p className="text-sm text-muted-foreground">No document usage data yet.</p>
          ) : (
            <div className="space-y-3">
              {usageStats.map((stat) => (
                <div key={stat.type} className="flex items-center justify-between text-sm py-1">
                  <span className="capitalize text-foreground">{stat.type.replace('_', ' ')}</span>
                  <div className="flex items-center gap-4 text-xs text-muted-foreground">
                    <span>{stat.totalCreated} created</span>
                    <span>{stat.linkedToApplications} linked</span>
                    <span className={stat.applicationRate < 30 ? 'text-orange-400' : 'text-green-500'}>
                      {stat.applicationRate}% rate
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>

      <Card>
        <SectionHeader title="ATS Score vs. Outcomes" />
        {atsVsOutcomes.length === 0 ? (
          <p className="text-sm text-muted-foreground">No outcome data yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-muted-foreground text-xs">
                  <th className="text-left py-2 pr-4">ATS Band</th>
                  <th className="text-right py-2 pr-4">Applications</th>
                  <th className="text-right py-2 pr-4">Reply Rate</th>
                  <th className="text-right py-2">Interview Rate</th>
                </tr>
              </thead>
              <tbody>
                {atsVsOutcomes.map((band) => (
                  <tr key={band.band} className="border-b border-border/50 hover:bg-muted/30">
                    <td className="py-2 pr-4 font-medium">{band.band}</td>
                    <td className="py-2 pr-4 text-right text-muted-foreground">{band.applicationCount}</td>
                    <td className="py-2 pr-4 text-right">{band.replyRate}%</td>
                    <td className="py-2 text-right">{band.interviewRate}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}

// ─── Weekly Review Tab ────────────────────────────────────────────────────────

function WeeklyTab() {
  const [review, setReview] = useState<any>(null);
  const [generating, setGenerating] = useState(false);

  const load = async () => {
    const res = await actionGetLatestWeeklyReview();
    if (res.success) setReview(res.review);
  };

  const handleGenerate = async () => {
    setGenerating(true);
    const res = await actionComputeAndSaveWeeklyReview();
    if (res.success) setReview(res.summary);
    setGenerating(false);
  };

  const handleExport = async (format: 'markdown' | 'json') => {
    const res = await actionExportAnalyticsReport({
      format,
      includeWeeklyReview: true,
      includeInsights: true,
      includeFunnel: true,
    });
    if (res.success) {
      alert(`Report saved to: ${res.filePath}`);
    }
  };

  useEffect(() => { load(); }, []);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div />
        <div className="flex items-center gap-2">
          <button
            onClick={() => handleExport('markdown')}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs border border-border rounded-apple hover:bg-muted transition-colors"
          >
            <Download size={13} />
            Export MD
          </button>
          <button
            onClick={() => handleExport('json')}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs border border-border rounded-apple hover:bg-muted transition-colors"
          >
            <Download size={13} />
            Export JSON
          </button>
          <button
            onClick={handleGenerate}
            disabled={generating}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-primary text-primary-foreground rounded-apple hover:bg-primary/90 transition-colors disabled:opacity-50"
          >
            <RefreshCw size={13} className={generating ? 'animate-spin' : ''} />
            {generating ? 'Generating…' : 'Generate This Week'}
          </button>
        </div>
      </div>

      {!review ? (
        <Card>
          <p className="text-sm text-muted-foreground">No weekly review yet. Click "Generate This Week" to create one.</p>
        </Card>
      ) : (
        <>
          <Card>
            <p className="text-xs text-muted-foreground mb-3">{review.weekLabel}</p>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <KpiCard label="Discovered" value={review.metrics.jobsDiscovered} />
              <KpiCard label="Tier A" value={review.metrics.newTierAOpportunities} />
              <KpiCard label="Applied" value={review.metrics.applicationsSubmitted} />
              <KpiCard label="Interviews" value={review.metrics.interviewsScheduled} />
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-4">
              <KpiCard label="Follow-ups done" value={review.metrics.followUpsCompleted} />
              <KpiCard label="Missed follow-ups" value={review.metrics.followUpsMissed} />
              <KpiCard label="Offers" value={review.metrics.offersReceived} />
              <KpiCard label="Rejections" value={review.metrics.rejections} />
            </div>
          </Card>

          {review.suggestedActions?.length > 0 && (
            <Card>
              <SectionHeader title="Suggested Actions" />
              <ul className="space-y-2">
                {review.suggestedActions.map((action: string, i: number) => (
                  <li key={i} className="flex items-start gap-2 text-sm">
                    <ChevronRight size={14} className="text-primary mt-0.5 flex-shrink-0" />
                    <span>{action}</span>
                  </li>
                ))}
              </ul>
            </Card>
          )}

          {review.topInsights?.length > 0 && (
            <Card>
              <SectionHeader title="Top Insights This Week" />
              <div className="space-y-3">
                {review.topInsights.map((insight: any, i: number) => (
                  <div key={i} className="flex items-start gap-2">
                    <span
                      className="mt-1.5 h-2 w-2 rounded-full flex-shrink-0"
                      style={{ backgroundColor: CONFIDENCE_COLOR[insight.confidence] ?? '#8E8E93' }}
                    />
                    <div>
                      <p className="text-sm font-medium">{insight.title}</p>
                      {insight.recommendedAction && (
                        <p className="text-xs text-muted-foreground mt-0.5">{insight.recommendedAction}</p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </Card>
          )}
        </>
      )}
    </div>
  );
}

// ─── Experiments Tab ──────────────────────────────────────────────────────────

function ExperimentsTab() {
  const [experiments, setExperiments] = useState<any[]>([]);
  const [showCreate, setShowCreate] = useState(false);
  const [name, setName] = useState('');
  const [hypothesis, setHypothesis] = useState('');
  const [creating, setCreating] = useState(false);

  const load = async () => {
    const res = await actionListExperiments();
    if (res.success) setExperiments(res.experiments);
  };

  const handleCreate = async () => {
    if (!name.trim() || !hypothesis.trim()) return;
    setCreating(true);
    await actionCreateExperiment({ name: name.trim(), hypothesis: hypothesis.trim() });
    setName('');
    setHypothesis('');
    setShowCreate(false);
    setCreating(false);
    await load();
  };

  const handleConclude = async (id: number) => {
    const conclusion = prompt('Conclusion:');
    if (!conclusion) return;
    await actionUpdateExperiment(id, { status: 'concluded', conclusion });
    await load();
  };

  useEffect(() => { load(); }, []);

  const STATUS_COLOR: Record<string, string> = {
    running: '#007AFF',
    concluded: '#34C759',
    cancelled: '#8E8E93',
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div />
        <button
          onClick={() => setShowCreate(!showCreate)}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-primary text-primary-foreground rounded-apple hover:bg-primary/90 transition-colors"
        >
          {showCreate ? <X size={13} /> : <FlaskConical size={13} />}
          {showCreate ? 'Cancel' : 'New Experiment'}
        </button>
      </div>

      {showCreate && (
        <Card>
          <SectionHeader title="New Experiment" />
          <div className="space-y-3">
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Name</label>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Cover letter vs no cover letter"
                className="w-full px-3 py-2 text-sm bg-background border border-border rounded-apple focus:outline-none focus:ring-1 focus:ring-primary"
              />
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Hypothesis</label>
              <textarea
                value={hypothesis}
                onChange={(e) => setHypothesis(e.target.value)}
                rows={3}
                placeholder="Adding a cover letter will increase reply rate by 10%"
                className="w-full px-3 py-2 text-sm bg-background border border-border rounded-apple focus:outline-none focus:ring-1 focus:ring-primary resize-none"
              />
            </div>
            <button
              onClick={handleCreate}
              disabled={creating || !name.trim() || !hypothesis.trim()}
              className="px-4 py-2 text-sm bg-primary text-primary-foreground rounded-apple hover:bg-primary/90 disabled:opacity-50 transition-colors"
            >
              {creating ? 'Creating…' : 'Start Experiment'}
            </button>
          </div>
        </Card>
      )}

      {experiments.length === 0 ? (
        <Card>
          <p className="text-sm text-muted-foreground">No experiments yet. Start one to test job search strategies.</p>
        </Card>
      ) : (
        <div className="space-y-3">
          {experiments.map((exp) => (
            <Card key={exp.id}>
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <h4 className="text-sm font-semibold text-foreground truncate">{exp.name}</h4>
                    <span
                      className="text-xs px-2 py-0.5 rounded-full"
                      style={{
                        color: STATUS_COLOR[exp.status] ?? '#8E8E93',
                        backgroundColor: `${STATUS_COLOR[exp.status] ?? '#8E8E93'}18`,
                      }}
                    >
                      {exp.status}
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground">{exp.hypothesis}</p>
                  {exp.conclusion && (
                    <p className="text-xs text-foreground mt-2 flex items-start gap-1">
                      <CheckCircle2 size={12} className="mt-0.5 text-green-500 flex-shrink-0" />
                      {exp.conclusion}
                    </p>
                  )}
                  <div className="flex items-center gap-4 mt-2 text-xs text-muted-foreground">
                    <span>{exp.linkedApplications} applications</span>
                    <span>{exp.linkedJobs} jobs</span>
                  </div>
                </div>
                {exp.status === 'running' && (
                  <button
                    onClick={() => handleConclude(exp.id)}
                    className="text-xs text-muted-foreground hover:text-foreground flex-shrink-0 mt-0.5"
                  >
                    Conclude
                  </button>
                )}
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Activity Tab ─────────────────────────────────────────────────────────────

function ActivityTab() {
  const [events, setEvents] = useState<any[]>([]);
  const [isPending, startTransition] = useTransition();

  const load = () => {
    startTransition(async () => {
      const res = await actionGetRecentEvents(100);
      if (res.success) {
        setEvents(res.events);
      }
    });
  };

  useEffect(() => {
    load();
  }, []);

  return (
    <div className="space-y-6">
      <SectionHeader 
        title="Recent Activity Log" 
        action={
          <button onClick={load} className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1">
            <RefreshCw size={12} className={isPending ? 'animate-spin' : ''} />
            Refresh
          </button>
        }
      />

      <Card className="p-0 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm border-collapse">
            <thead>
              <tr className="bg-muted/50 text-muted-foreground border-b border-card-border">
                <th className="px-4 py-3 font-medium">Time</th>
                <th className="px-4 py-3 font-medium">Event</th>
                <th className="px-4 py-3 font-medium">Entity</th>
                <th className="px-4 py-3 font-medium">Details</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-card-border">
              {events.length === 0 && !isPending && (
                <tr>
                  <td colSpan={4} className="px-4 py-8 text-center text-muted-foreground">
                    No events recorded yet.
                  </td>
                </tr>
              )}
              {events.map((ev) => (
                <tr key={ev.id} className="hover:bg-muted/30 transition-colors">
                  <td className="px-4 py-3 whitespace-nowrap text-muted-foreground">
                    {new Date(ev.occurredAt).toLocaleString()}
                  </td>
                  <td className="px-4 py-3">
                    <span className="font-medium text-foreground">{ev.eventType}</span>
                  </td>
                  <td className="px-4 py-3">
                    {ev.entityType && (
                      <span className="text-xs px-2 py-0.5 rounded-full bg-muted text-muted-foreground">
                        {ev.entityType} {ev.entityId}
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-xs text-muted-foreground max-w-xs truncate">
                    {ev.portal && `Portal: ${ev.portal} | `}
                    {ev.tier && `Tier: ${ev.tier} | `}
                    {ev.score !== null && `Score: ${ev.score} | `}
                    {ev.applicationStatus && `Status: ${ev.applicationStatus}`}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function AnalyticsPage() {
  const [tab, setTab] = useState<Tab>('overview');

  const TABS: Array<{ id: Tab; label: string; icon: React.ReactNode }> = [
    { id: 'overview', label: 'Overview', icon: <TrendingUp size={14} /> },
    { id: 'funnel', label: 'Funnel', icon: <Target size={14} /> },
    { id: 'search', label: 'Search', icon: <Search size={14} /> },
    { id: 'documents', label: 'Documents', icon: <FileText size={14} /> },
    { id: 'weekly', label: 'Weekly Review', icon: <Calendar size={14} /> },
    { id: 'experiments', label: 'Experiments', icon: <FlaskConical size={14} /> },
    { id: 'activity', label: 'Activity Log', icon: <Clock size={14} /> },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-semibold text-foreground">Analytics</h2>
      </div>

      {/* Tab bar */}
      <div className="flex items-center gap-1 flex-wrap">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-full transition-colors ${
              tab === t.id
                ? 'bg-primary text-primary-foreground'
                : 'text-muted-foreground hover:text-foreground hover:bg-muted'
            }`}
          >
            {t.icon}
            {t.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {tab === 'overview' && <OverviewTab />}
      {tab === 'funnel' && <FunnelTab />}
      {tab === 'search' && <SearchTab />}
      {tab === 'documents' && <DocumentsTab />}
      {tab === 'weekly' && <WeeklyTab />}
      {tab === 'experiments' && <ExperimentsTab />}
      {tab === 'activity' && <ActivityTab />}
    </div>
  );
}
