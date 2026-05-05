import Link from 'next/link';
import { Bot, Download, ExternalLink, TrendingUp } from 'lucide-react';
import { ReadinessChecklist } from '@/components/workbench/ReadinessChecklist';
import { SourceHealthSummary } from '@/components/workbench/SourceHealthSummary';

export function WorkbenchSupportRail({ topJob, data }: { topJob?: any | null; data: any }) {
  const scoredJobId = topJob?.scoredJob?.id;
  const topCompanies = data?.insights?.topCompanies || [];

  return (
    <aside className="space-y-3 xl:sticky xl:top-28 xl:self-start">
      <ReadinessChecklist topJob={topJob} />

      <section className="design-panel p-4">
        <div className="mb-3 flex items-center gap-2">
          <Bot className="h-4 w-4 text-primary" />
          <h3 className="text-sm font-bold uppercase text-muted-foreground">Ask the coach</h3>
        </div>
        <p className="text-sm leading-6 text-muted-foreground">
          Ask what to emphasize, what is missing, or how to explain your fit for the top role.
        </p>
        <Link
          href={scoredJobId ? `/coach?job=${encodeURIComponent(scoredJobId)}` : '/coach'}
          className="design-button-primary mt-3 px-4 text-sm font-semibold"
        >
          Ask about this job <ExternalLink className="h-4 w-4" />
        </Link>
      </section>

      <SourceHealthSummary portalHealth={data?.systemStatus?.portalHealth || []} defaultCollapsed />

      <section className="design-panel p-4">
        <div className="mb-3 flex items-center gap-2">
          <TrendingUp className="h-4 w-4 text-primary" />
          <h3 className="text-sm font-bold uppercase text-muted-foreground">Top companies</h3>
        </div>
        <div className="space-y-2">
          {topCompanies.length ? topCompanies.slice(0, 5).map((item: any) => (
            <div key={item.company} className="flex items-center justify-between gap-3 text-sm">
              <span className="truncate text-foreground">{item.company}</span>
              <span className="design-chip px-2 py-1 text-xs text-primary">{item.score}</span>
            </div>
          )) : (
            <p className="text-sm text-muted-foreground">Scan results will surface company patterns here.</p>
          )}
        </div>
      </section>

      <section className="design-panel p-4">
        <div className="mb-3 flex items-center gap-2">
          <Download className="h-4 w-4 text-primary" />
          <h3 className="text-sm font-bold uppercase text-muted-foreground">Resume kit</h3>
        </div>
        <p className="text-sm leading-6 text-muted-foreground">
          Build an application pack only after a job looks worth your time.
        </p>
      </section>
    </aside>
  );
}
