import { RefreshCw, Sparkles } from 'lucide-react';

export function ActionWorkbenchHeader({
  name,
  headline,
  target,
  lastScan,
  isScanning,
  refreshing,
  onRefresh,
}: {
  name: string;
  headline: string;
  target: string;
  lastScan?: string | null;
  isScanning: boolean;
  refreshing: boolean;
  onRefresh: () => void;
}) {
  return (
    <section className="design-panel-strong px-5 py-5 md:px-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="min-w-0">
          <div className="design-label mb-3">
            <Sparkles className="h-3.5 w-3.5" />
            Home
          </div>
          <h1 className="max-w-4xl font-display text-3xl font-semibold leading-tight md:text-4xl">Your job search, simplified</h1>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">
            {name}, Career Seek is watching for {target}. It will surface the best matches, prepare stronger applications, and keep follow-ups from slipping.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="design-chip px-3 py-2 text-xs">
            Last checked: {lastScan ? new Date(lastScan).toLocaleString('en-IN') : 'not yet'}
          </div>
          <button
            type="button"
            onClick={onRefresh}
            disabled={refreshing || isScanning}
            className="design-button-primary px-4 text-sm font-semibold disabled:opacity-50"
          >
            <RefreshCw className={`h-4 w-4 ${refreshing || isScanning ? 'animate-spin' : ''}`} />
            {isScanning ? 'Refreshing' : 'Refresh matches'}
          </button>
        </div>
      </div>
    </section>
  );
}
