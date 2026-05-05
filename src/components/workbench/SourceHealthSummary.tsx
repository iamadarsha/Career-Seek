'use client';

import { useState } from 'react';
import { Activity, CheckCircle2, ChevronDown, ChevronUp, XCircle } from 'lucide-react';

function normalizeRun(run: any) {
  const status = run.status || 'unknown';
  const failed = status === 'failed';
  return {
    id: run.id || `${run.portal}-${status}`,
    portal: run.portal || 'source',
    status,
    failed,
    jobsFound: run.jobsFound || 0,
    message: run.message || run.error || run.failureCode || '',
  };
}

export function SourceHealthSummary({ portalHealth, defaultCollapsed = true }: { portalHealth?: any[]; defaultCollapsed?: boolean }) {
  const [collapsed, setCollapsed] = useState(defaultCollapsed);
  const runs = (portalHealth || []).map(normalizeRun);
  const failed = runs.filter((run) => run.failed).length;
  const complete = runs.filter((run) => run.status === 'complete' || run.status === 'completed').length;

  if (!failed) return null;

  return (
    <section className="design-panel p-4">
      <button
        type="button"
        onClick={() => setCollapsed((value) => !value)}
        className="flex min-h-11 w-full items-center justify-between gap-3 text-left"
        aria-expanded={!collapsed}
      >
        <span className="flex items-center gap-2">
          <Activity className="h-4 w-4 text-primary" />
          <span>
            <span className="block text-sm font-bold uppercase text-muted-foreground">Reliability note</span>
            <span className="block text-xs text-muted-foreground">{complete} complete · {failed} need attention</span>
          </span>
        </span>
        {collapsed ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronUp className="h-4 w-4 text-muted-foreground" />}
      </button>
      {!collapsed && (
        <div className="mt-3 space-y-2">
          {runs.length ? runs.slice(0, 8).map((run) => (
            <div key={run.id} className="rounded-apple border border-card-border bg-surface-container-low p-3 text-sm">
              <div className="flex items-center justify-between gap-2">
                <span className="flex items-center gap-2 font-semibold capitalize">
                  {run.failed ? <XCircle className="h-4 w-4 text-danger" /> : <CheckCircle2 className="h-4 w-4 text-success" />}
                  {run.portal}
                </span>
                <span className="text-xs text-muted-foreground">{run.jobsFound} jobs</span>
              </div>
              {run.message && <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{run.message}</p>}
            </div>
          )) : (
            <p className="text-sm text-muted-foreground">Run a scan to populate source status.</p>
          )}
        </div>
      )}
    </section>
  );
}
