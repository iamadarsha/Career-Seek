'use client';

import { useState, useEffect } from 'react';
import { Loader2, CheckCircle2, XCircle, Clock, Activity, Terminal, X } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

interface JobLog {
  id: number;
  level: 'info' | 'warn' | 'error';
  message: string;
  createdAt: string;
}

interface PlatformJob {
  id: number;
  jobType: string;
  status: 'queued' | 'running' | 'processing' | 'succeeded' | 'failed' | 'retrying' | 'canceled';
  progress: number;
  updatedAt: string;
  error?: string;
  logs?: JobLog[];
}

interface RecoveryJob {
  id: number;
  jobType: string;
  status: string;
  updatedAt: string;
}

function humanJobError(value?: string) {
  if (!value) return '';
  try {
    const parsed = JSON.parse(value);
    if (parsed?.code === 'process_interrupted') {
      return 'process_interrupted: Previous worker stopped before this job finished. The job was recovered and marked failed so it can be retried.';
    }
    return `${parsed?.code || 'error'}: ${parsed?.message || value}`;
  } catch {
    return value;
  }
}

export function JobMonitor() {
  const [activeJobs, setActiveJobs] = useState<PlatformJob[]>([]);
  const [recoveryJobs, setRecoveryJobs] = useState<RecoveryJob[]>([]);
  const [expandedJobId, setExpandedJobId] = useState<number | null>(null);
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    let timeoutId: ReturnType<typeof setTimeout> | null = null;

    const fetchJobs = async () => {
      try {
        const response = await fetch('/api/jobs/active');
        const data = await response.json();
        if (cancelled) return;
        setActiveJobs(data.jobs || []);
        setRecoveryJobs(data.recovery || []);

        const hasActiveJobs = Boolean(data.jobs?.length);
        timeoutId = setTimeout(fetchJobs, hasActiveJobs ? 5000 : 15000);
      } catch {
        if (!cancelled) timeoutId = setTimeout(fetchJobs, 15000);
      }
    };

    fetchJobs();
    return () => {
      cancelled = true;
      if (timeoutId) clearTimeout(timeoutId);
    };
  }, []);

  const handleRecovery = async (jobId: number, action: 'resume' | 'discard') => {
    await fetch('/api/jobs/recovery', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ jobId, action }),
    }).catch(() => undefined);
    setRecoveryJobs((jobs) => jobs.filter((job) => job.id !== jobId));
  };

  const isRunning = activeJobs.some((j) =>
    ['running', 'processing', 'queued', 'retrying'].includes(j.status),
  );
  const totalCount = activeJobs.length + recoveryJobs.length;

  useEffect(() => {
    if (totalCount === 0) setIsOpen(false);
  }, [totalCount]);

  if (totalCount === 0) return null;

  return (
    <>
      {/* Fixed panel — appears above the floating dock */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: 8, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 8, scale: 0.95 }}
            transition={{ duration: 0.18, ease: 'easeOut' }}
            className="pointer-events-auto fixed bottom-[calc(10rem+env(safe-area-inset-bottom))] right-4 z-50 w-80 overflow-hidden rounded-apple border border-card-border bg-white shadow-golden sm:right-6 sm:w-96 sm:bottom-[calc(11rem+env(safe-area-inset-bottom))]"
          >
            <div className="flex items-center justify-between border-b border-card-border px-4 py-3">
              <div className="flex items-center gap-2">
                <Activity className="h-4 w-4 text-primary" />
                <span className="text-sm font-semibold">Background Tasks</span>
                {totalCount > 0 && (
                  <span className="rounded-full bg-primary px-1.5 py-0.5 text-[10px] font-bold text-white">
                    {totalCount}
                  </span>
                )}
              </div>
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                aria-label="Close background tasks panel"
                className="rounded-full p-1 text-muted-foreground transition hover:bg-surface-low hover:text-foreground"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="max-h-[28rem] overflow-y-auto">
              <div className="divide-y divide-sidebar-border">
                {recoveryJobs.map((job) => (
                  <div key={`recovery-${job.id}`} className="space-y-3 bg-warning-bg p-4 text-warning">
                    <div className="flex items-start gap-3">
                      <div className="rounded-apple bg-white/40 p-1.5">
                        <XCircle className="h-4 w-4" />
                      </div>
                      <div className="min-w-0">
                        <p className="text-xs font-bold uppercase">Recovering {job.jobType.replace('_', ' ')}</p>
                        <p className="mt-1 text-[11px] leading-relaxed">
                          This task stopped before finishing. You can resume it as a fresh background job or discard it.
                        </p>
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => void handleRecovery(job.id, 'resume')}
                        className="rounded-apple border border-current/20 bg-white/40 px-3 py-1.5 text-xs font-semibold"
                      >
                        Resume
                      </button>
                      <button
                        type="button"
                        onClick={() => void handleRecovery(job.id, 'discard')}
                        className="rounded-apple border border-current/20 bg-white/20 px-3 py-1.5 text-xs font-semibold"
                      >
                        Discard
                      </button>
                    </div>
                  </div>
                ))}

                {activeJobs.map((job) => (
                  <div key={job.id} className="space-y-3 p-4">
                    <div
                      className="flex cursor-pointer items-center justify-between"
                      onClick={() => setExpandedJobId(expandedJobId === job.id ? null : job.id)}
                    >
                      <div className="flex items-center gap-3">
                        <StatusIcon status={job.status} />
                        <div>
                          <p className="text-xs font-bold uppercase text-muted-foreground">
                            {job.jobType.replace('_', ' ')}
                          </p>
                          <p className="text-[10px] text-muted-foreground">
                            #{job.id} · {new Date(job.updatedAt).toLocaleTimeString()}
                          </p>
                        </div>
                      </div>
                      <span className="text-xs font-semibold tabular-nums">{job.progress}%</span>
                    </div>

                    <div className="h-1.5 w-full overflow-hidden rounded-sharp bg-muted/30">
                      <motion.div
                        initial={{ width: 0 }}
                        animate={{ width: `${job.progress}%` }}
                        className={`h-full transition-all duration-500 ${job.status === 'failed' ? 'bg-danger' : 'bg-primary'}`}
                      />
                    </div>

                    <AnimatePresence>
                      {expandedJobId === job.id && (
                        <motion.div
                          initial={{ opacity: 0, height: 0 }}
                          animate={{ opacity: 1, height: 'auto' }}
                          exit={{ opacity: 0, height: 0 }}
                          className="overflow-hidden rounded-apple bg-surface-container p-3"
                        >
                          <div className="mb-2 flex items-center gap-2 border-b border-border/50 pb-1 text-[10px] font-bold uppercase text-muted-foreground">
                            <Terminal className="h-3 w-3" /> Execution Logs
                          </div>
                          <div className="max-h-32 space-y-1.5 overflow-y-auto pr-1">
                            {job.logs && job.logs.length > 0 ? (
                              job.logs.map((log) => (
                                <div key={log.id} className="font-mono text-[10px] leading-tight">
                                  <span className="text-muted-foreground">
                                    [{new Date(log.createdAt).toLocaleTimeString([], { hour12: false })}]
                                  </span>{' '}
                                  <span
                                    className={
                                      log.level === 'error'
                                        ? 'text-danger'
                                        : log.level === 'warn'
                                          ? 'text-warning'
                                          : 'text-foreground/70'
                                    }
                                  >
                                    {log.message}
                                  </span>
                                </div>
                              ))
                            ) : (
                              <p className="font-mono text-[10px] italic text-muted-foreground">No logs yet.</p>
                            )}
                            {job.error && (
                              <div className="mt-2 rounded-sharp border border-danger-border bg-danger-bg p-1.5 font-mono text-[10px] leading-tight text-danger">
                                ERROR: {humanJobError(job.error)}
                              </div>
                            )}
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                ))}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Circular button — sits in FloatingActionDock above AI Coach */}
      <button
        type="button"
        onClick={() => setIsOpen((prev) => !prev)}
        aria-label={`Background tasks${totalCount > 0 ? ` (${totalCount})` : ''}`}
        className={`pointer-events-auto relative inline-flex h-14 w-14 items-center justify-center rounded-full border shadow-golden transition hover:-translate-y-0.5 hover:shadow-ink ${
          isOpen
            ? 'border-foreground bg-foreground text-white'
            : 'border-card-border bg-white text-foreground'
        }`}
      >
        <Activity className={`h-6 w-6 ${isRunning && !isOpen ? 'animate-pulse text-primary' : ''}`} />
        {totalCount > 0 && (
          <span className="absolute -right-1 -top-1 flex h-5 w-5 items-center justify-center rounded-full bg-danger text-[10px] font-bold text-white">
            {totalCount > 9 ? '9+' : totalCount}
          </span>
        )}
      </button>
    </>
  );
}

function StatusIcon({ status }: { status: PlatformJob['status'] }) {
  switch (status) {
    case 'running':
    case 'processing':
      return (
        <div className="rounded-apple bg-surface-container p-1.5 text-primary">
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
        </div>
      );
    case 'succeeded':
      return (
        <div className="rounded-apple bg-success-bg p-1.5 text-success">
          <CheckCircle2 className="h-3.5 w-3.5" />
        </div>
      );
    case 'failed':
      return (
        <div className="rounded-apple bg-danger-bg p-1.5 text-danger">
          <XCircle className="h-3.5 w-3.5" />
        </div>
      );
    case 'retrying':
      return (
        <div className="rounded-apple bg-warning-bg p-1.5 text-warning">
          <Clock className="h-3.5 w-3.5 animate-pulse" />
        </div>
      );
    default:
      return (
        <div className="rounded-apple bg-muted p-1.5 text-muted-foreground">
          <Clock className="h-3.5 w-3.5" />
        </div>
      );
  }
}
