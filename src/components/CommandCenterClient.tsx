'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  Activity,
  ArrowRight,
  Bot,
  Loader2,
  Search,
  Target,
} from 'lucide-react';
import { fetchCommandCenter, performAiSearch, runQuickScan } from '@/app/actions-dashboard';
import { RankedJobCard } from '@/components/jobs/RankedJobCard';
import { DashboardSkeleton } from '@/components/ui/RouteSkeleton';
import { ActionWorkbenchHeader } from '@/components/workbench/ActionWorkbenchHeader';
import { TopJobActionPanel } from '@/components/workbench/TopJobActionPanel';
import { WorkbenchStatStrip } from '@/components/workbench/WorkbenchStatStrip';
import { WorkbenchSupportRail } from '@/components/workbench/WorkbenchSupportRail';
import type { CommandCenterData } from '@/lib/services/dashboard/command-center';

export function CommandCenterClient({ initialData }: { initialData?: CommandCenterData | null }) {
  const [data, setData] = useState<any>(initialData || null);
  const [loading, setLoading] = useState(!initialData);
  const [refreshing, setRefreshing] = useState(false);
  const [query, setQuery] = useState('');
  const [searching, setSearching] = useState(false);
  const [aiAnswer, setAiAnswer] = useState<any>(null);
  const [filter, setFilter] = useState('All');

  const loadData = async () => {
    const result = await fetchCommandCenter();
    setData(result);
    setLoading(false);
  };

  useEffect(() => {
    if (initialData) return;
    loadData().catch(() => setLoading(false));
  }, [initialData]);

  useEffect(() => {
    if (!data?.systemStatus?.isScanning) return;
    const interval = setInterval(() => loadData(), 4000);
    return () => clearInterval(interval);
  }, [data?.systemStatus?.isScanning]);

  const handleRefresh = async () => {
    setRefreshing(true);
    await runQuickScan();
    await loadData();
    setRefreshing(false);
  };

  const handleSearch = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!query.trim()) return;
    setSearching(true);
    try {
      const result = await performAiSearch(query);
      setAiAnswer(result);
    } finally {
      setSearching(false);
    }
  };

  if (loading) {
    return <DashboardSkeleton />;
  }

  const filteredJobs = (data.priorityQueue || []).filter((item: any) => {
    if (filter === 'All') return true;
    if (['A', 'B', 'C'].includes(filter)) return item.scoredJob.tier === filter;
    return item.normalizedJob.portal === filter.toLowerCase();
  });
  const portalFilters = data.insights?.byPortal?.map((item: any) => item.portal) || [];
  const topJob = filteredJobs[0] || data.priorityQueue?.[0] || null;
  const remainingJobs = topJob
    ? filteredJobs.filter((item: any) => item.scoredJob.id !== topJob.scoredJob.id)
    : filteredJobs;

  return (
    <div className="space-y-5 pb-16">
      <ActionWorkbenchHeader
        name={data.profileSummary.name}
        headline={data.profileSummary.headline}
        target={data.profileSummary.target}
        lastScan={data.systemStatus.lastScan}
        isScanning={data.systemStatus.isScanning}
        refreshing={refreshing}
        onRefresh={handleRefresh}
      />

      <form onSubmit={handleSearch} className="design-panel p-3 md:flex md:items-center md:gap-3">
        <div className="flex flex-1 items-center gap-3 rounded-apple bg-surface-container px-4">
          <Bot className="h-5 w-5 shrink-0 text-primary" />
          <input
            type="search"
            aria-label="Search the ranked job queue"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Ask: which jobs are worth applying to today?"
            className="min-h-11 min-w-0 flex-1 bg-transparent text-sm outline-none"
          />
        </div>
        <button
          type="submit"
          disabled={!query.trim() || searching}
          className="design-button-primary mt-3 w-full px-5 text-sm font-semibold disabled:opacity-50 md:mt-0 md:w-auto"
        >
          {searching ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
          Ask
        </button>
      </form>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_20rem]">
        <main className="min-w-0 space-y-4">
          <TopJobActionPanel item={topJob} capabilities={data.capabilities} />
          <WorkbenchStatStrip stats={data.stats} />

          <section className="design-panel p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="design-label text-xs">Top matches</p>
                <h2 className="mt-2 text-lg font-semibold">The three roles worth your first attention</h2>
              </div>
              <Link href="/discover" className="inline-flex min-h-11 items-center rounded-apple px-3 text-sm font-semibold text-primary hover:bg-surface-container-low">
                See all jobs
              </Link>
            </div>
            <div className="mt-4 grid gap-3 lg:grid-cols-3">
              {(data.priorityQueue || []).slice(0, 3).map((item: any, index: number) => (
                <Link
                  key={item.scoredJob.id}
                  href={`/discover#scored-job-${item.scoredJob.id}`}
                  className="rounded-apple border border-card-border bg-surface-container-low p-4 transition hover:border-primary/40 hover:bg-surface"
                >
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-xs font-bold uppercase text-muted-foreground">Match {index + 1}</span>
                    <span className="rounded-full bg-surface px-2.5 py-1 text-xs font-bold text-foreground">{item.scoredJob.score}% fit</span>
                  </div>
                  <h3 className="mt-3 line-clamp-2 text-sm font-semibold leading-snug">{item.normalizedJob.title}</h3>
                  <p className="mt-1 truncate text-xs text-muted-foreground">{item.normalizedJob.company || 'Company not listed'}</p>
                  <p className="mt-3 text-xs font-semibold text-primary">Prepare when ready</p>
                </Link>
              ))}
              {!(data.priorityQueue || []).length && (
                <div className="rounded-apple border border-dashed border-card-border p-5 text-sm text-muted-foreground lg:col-span-3">
                  Refresh matches or broaden your search to bring the best roles here.
                </div>
              )}
            </div>
          </section>

          <section className="grid gap-3 lg:grid-cols-2">
            <div className="design-panel p-4">
              <p className="design-label text-xs">Applications</p>
              <h2 className="mt-2 text-lg font-semibold">Needs a nudge</h2>
              {data.crm?.urgentItems?.length ? (
                <div className="mt-3 space-y-2">
                  {data.crm.urgentItems.slice(0, 3).map((item: any) => (
                    <Link
                      key={`${item.type}-${item.applicationId}`}
                      href={`/pipeline/${item.applicationId}`}
                      className="flex min-h-12 items-center justify-between gap-3 rounded-apple border border-card-border bg-surface-container-low px-3 py-2 text-sm transition hover:border-primary/40"
                    >
                      <span className="min-w-0">
                        <span className="block truncate font-semibold">{item.title}</span>
                        <span className="block truncate text-xs text-muted-foreground">{item.company} · {item.detail}</span>
                      </span>
                      <ArrowRight className="h-4 w-4 shrink-0 text-primary" />
                    </Link>
                  ))}
                </div>
              ) : (
                <p className="mt-3 text-sm leading-6 text-muted-foreground">No urgent follow-ups. Keep preparing the strongest match first.</p>
              )}
            </div>

            <div className="design-panel p-4">
              <p className="design-label text-xs">Resume readiness</p>
              <h2 className="mt-2 text-lg font-semibold">
                {data.insights?.documentsGenerated ? `${data.insights.documentsGenerated} application asset${data.insights.documentsGenerated === 1 ? '' : 's'} ready` : 'No application pack yet'}
              </h2>
              <p className="mt-3 text-sm leading-6 text-muted-foreground">
                Build one focused pack per serious role: tailored resume, ATS checklist, cover letter, outreach note, and interview talking points.
              </p>
              <Link href="/documents" className="design-button-secondary mt-4 px-4 text-sm font-semibold text-primary">
                Open Resume Kit <ArrowRight className="h-4 w-4" />
              </Link>
            </div>
          </section>

          {data.systemStatus.isScanning && (
            <section className="design-panel p-4">
              <div className="mb-3 flex items-center justify-between gap-4">
                <div className="flex min-w-0 items-center gap-3">
                  <Activity className="h-5 w-5 shrink-0 animate-pulse text-primary" />
                  <div className="min-w-0">
                    <h2 className="font-semibold">Scan in progress</h2>
                    <p className="text-sm text-muted-foreground">Sources update independently, so partial results stay useful.</p>
                  </div>
                </div>
                <p className="text-sm font-bold text-primary">{data.systemStatus.scanProgress || 0}%</p>
              </div>
              <div className="h-2 overflow-hidden rounded-sharp bg-surface-container">
                <div className="h-full bg-primary transition-all" style={{ width: `${data.systemStatus.scanProgress || 0}%` }} />
              </div>
            </section>
          )}

          {aiAnswer && (
            <section className="design-panel p-5">
              <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                <div className="min-w-0 flex-1">
                  <h2 className="text-xl font-semibold">Queue answer</h2>
                  <p className="mt-2 whitespace-pre-wrap text-sm leading-7 text-muted-foreground">{aiAnswer.answer}</p>
                  {aiAnswer.relatedJobs?.length ? (
                    <div className="mt-4 grid gap-2">
                      {aiAnswer.relatedJobs.slice(0, 3).map((job: any, index: number) => (
                        <a
                          key={job.id}
                          href={`/discover#scored-job-${job.id}`}
                          className="flex min-h-12 items-center justify-between gap-3 rounded-apple border border-card-border bg-surface-container-low px-3 py-2 text-left text-sm transition hover:border-primary/40 hover:bg-surface-container"
                        >
                          <span className="min-w-0">
                            <span className="block truncate font-semibold">{index + 1}. {job.title}</span>
                            <span className="mt-0.5 block truncate text-xs text-muted-foreground">{job.company} · {job.reason || 'Ranked match'}</span>
                          </span>
                          <ArrowRight className="h-4 w-4 shrink-0 text-primary" />
                        </a>
                      ))}
                    </div>
                  ) : null}
                </div>
                <button onClick={() => setAiAnswer(null)} className="design-button-secondary px-3 text-sm font-semibold text-muted-foreground">Close</button>
              </div>
            </section>
          )}

          <details className="design-panel p-4">
            <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 text-sm font-semibold text-foreground [&::-webkit-details-marker]:hidden">
              <span>More jobs and filters</span>
              <span className="text-xs font-medium text-muted-foreground">Advanced</span>
            </summary>
            <div className="mt-4 flex flex-wrap items-center gap-2">
            <span className="mr-1 text-sm font-semibold text-muted-foreground">Show:</span>
            {['All', 'A', 'B', 'C', ...portalFilters].map((item) => (
              <button
                key={item}
                onClick={() => setFilter(item)}
                className={`min-h-11 rounded-apple border px-4 text-sm font-semibold transition ${
                  filter === item ? 'border-primary bg-foreground text-primary-foreground shadow-golden-sm' : 'border-card-border bg-surface text-muted-foreground hover:border-primary/40 hover:text-foreground'
                }`}
              >
                {['A', 'B', 'C'].includes(item) ? `Tier ${item}` : item}
              </button>
            ))}
            </div>

          <section className="mt-4 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex min-w-0 items-center gap-3">
                <span className="h-3 w-3 shrink-0 rounded-sharp bg-success" />
                <div className="min-w-0">
                  <h2 className="text-2xl font-semibold">More matches ({filteredJobs.length})</h2>
                  <p className="text-sm text-muted-foreground">
                    {filter === 'All' ? 'These stay available when you want to compare more options.' : 'This view only shows jobs matching the active filter.'}
                  </p>
                </div>
              </div>
              <Link href="/discover" className="design-button-secondary px-4 text-sm font-semibold text-primary">
                Open Jobs <ArrowRight className="h-4 w-4" />
              </Link>
            </div>

            {remainingJobs.length ? (
              remainingJobs.map((item: any) => <RankedJobCard key={item.scoredJob.id} item={item} />)
            ) : filteredJobs.length ? (
              <div className="design-panel p-6 text-center">
                <Target className="mx-auto h-9 w-9 text-muted-foreground" />
                <h3 className="mt-3 text-lg font-semibold">Only the pinned job matches this filter</h3>
                <p className="mt-1 text-sm text-muted-foreground">Change filters or refresh the scan for more ranked options.</p>
              </div>
            ) : (
              <div className="design-panel p-8 text-center">
                <Target className="mx-auto h-10 w-10 text-muted-foreground" />
                <h3 className="mt-4 text-xl font-semibold">No jobs in this filter yet</h3>
                <p className="mt-2 text-muted-foreground">Refresh the scan or expand filters to find more matching jobs.</p>
                <Link href="/discover" className="design-button-primary mt-5 px-5 text-sm font-semibold">
                  Open Jobs <ArrowRight className="h-4 w-4" />
                </Link>
              </div>
            )}
          </section>
          </details>
        </main>

        <WorkbenchSupportRail topJob={topJob} data={data} />
      </div>
    </div>
  );
}
