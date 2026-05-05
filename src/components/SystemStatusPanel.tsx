'use client';

import { useEffect, useState } from 'react';
import { AlertTriangle, CheckCircle2, RefreshCw, ServerCog, X } from 'lucide-react';

type HealthState = 'pass' | 'warn' | 'fail' | 'skipped';

interface HealthCheckItem {
  id: string;
  label: string;
  state: HealthState;
  message: string;
  action?: string;
}

interface HealthPayload {
  ok: boolean;
  health?: {
    status: HealthState;
    generatedAt: string;
    checks: HealthCheckItem[];
    recovery?: {
      recovering: boolean;
      interruptedJobs: number;
    };
    aiCircuitBreakers?: Array<{
      provider: string;
      status: string;
      secondsRemaining: number;
      lastError?: string;
    }>;
  };
  error?: {
    message: string;
  };
}

const stateLabel: Record<HealthState, string> = {
  pass: 'Ready',
  warn: 'Needs attention',
  fail: 'Blocked',
  skipped: 'Optional',
};

function stateClass(state: HealthState) {
  if (state === 'pass') return 'border-success-border bg-success-bg text-success';
  if (state === 'fail') return 'border-danger-border bg-danger-bg text-danger';
  if (state === 'skipped') return 'border-card-border bg-surface-container-low text-muted-foreground';
  return 'border-warning-border bg-warning-bg text-warning';
}

export function SystemStatusPanel() {
  const [payload, setPayload] = useState<HealthPayload | null>(null);
  const [dismissed, setDismissed] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [loading, setLoading] = useState(true);

  async function refresh() {
    setLoading(true);
    try {
      const response = await fetch('/api/health', { cache: 'no-store' });
      const next = await response.json();
      setPayload(next);
    } catch (error) {
      setPayload({
        ok: false,
        error: {
          message: error instanceof Error ? error.message : 'System status is unavailable.',
        },
      });
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      if (!cancelled) await refresh();
    };
    void run();
    const interval = setInterval(run, 30_000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, []);

  const checks = payload?.health?.checks || [];
  const visibleChecks = checks.filter((item) => item.state !== 'pass' || expanded);
  const status = payload?.health?.status || (payload?.ok ? 'pass' : 'warn');
  const hasAttention = status === 'warn' || status === 'fail' || payload?.health?.recovery?.recovering;
  const openBreakers = payload?.health?.aiCircuitBreakers?.filter((breaker) => breaker.status === 'cooling_down') || [];

  if (loading && !payload) return null;
  if (!hasAttention) return null;
  if (dismissed && !payload?.health?.recovery?.recovering) return null;

  return (
    <>
    <section className={`mb-4 rounded-apple border p-3 ${hasAttention ? stateClass(status) : 'border-card-border bg-surface-container-low text-muted-foreground'}`}>
      <div className="flex items-center justify-between gap-2">
        <button
          type="button"
          onClick={() => setExpanded((value) => !value)}
          className="flex min-h-11 min-w-0 flex-1 items-center gap-2 text-left"
          aria-expanded={expanded}
        >
          {hasAttention ? <AlertTriangle className="h-4 w-4 shrink-0" /> : <CheckCircle2 className="h-4 w-4 shrink-0" />}
          <span className="min-w-0">
            <span className="block text-sm font-semibold">
              {payload?.health?.recovery?.recovering ? 'Recovering interrupted work' : `Reliability note: ${stateLabel[status]}`}
            </span>
            <span className="block truncate text-xs opacity-80">
              {payload?.health?.recovery?.recovering
                ? `${payload.health.recovery.interruptedJobs} job(s) need a resume or discard decision.`
                : openBreakers.length
                  ? `${openBreakers.map((breaker) => breaker.provider).join(', ')} cooling down after repeated AI failures.`
                  : payload?.error?.message || checks.find((item) => item.state === 'fail' || item.state === 'warn')?.message || 'Core services are reachable.'}
            </span>
          </span>
        </button>
        <div className="flex shrink-0 items-center gap-2">
          <button
            type="button"
            onClick={() => void refresh()}
            className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-apple border border-current/20 bg-white/30"
            aria-label="Refresh status"
            title="Refresh status"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
          <button
            type="button"
            onClick={() => setDismissed(true)}
            className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-apple border border-current/20 bg-white/30"
            aria-label="Dismiss status"
            title="Dismiss status"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>

      {expanded && (
        <div className="mt-3 grid gap-2 md:grid-cols-2 xl:grid-cols-3">
          {visibleChecks.map((item) => (
            <div key={item.id} className={`rounded-apple border p-3 ${stateClass(item.state)}`}>
              <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wide">
                <ServerCog className="h-3.5 w-3.5" />
                {item.label}
              </div>
              <p className="mt-2 text-xs leading-relaxed">{item.message}</p>
              {item.action && <p className="mt-2 text-[11px] leading-relaxed opacity-85">{item.action}</p>}
            </div>
          ))}
          {openBreakers.map((breaker) => (
            <div key={breaker.provider} className="rounded-apple border border-warning-border bg-warning-bg p-3 text-warning">
              <div className="text-xs font-bold uppercase tracking-wide">{breaker.provider} cooldown</div>
              <p className="mt-2 text-xs leading-relaxed">
                Provider skipped for {breaker.secondsRemaining}s after repeated failures.
              </p>
            </div>
          ))}
        </div>
      )}
    </section>
    </>
  );
}
