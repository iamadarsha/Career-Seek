'use client';

import { useState, useEffect } from 'react';
import { Loader2, CheckCircle2, XCircle, Clock, ChevronDown, ChevronUp, Activity, Terminal } from 'lucide-react';
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
  status: 'queued' | 'running' | 'succeeded' | 'failed' | 'retrying' | 'canceled';
  progress: number;
  updatedAt: string;
  error?: string;
  logs?: JobLog[];
}

export function JobMonitor({ profileId }: { profileId: number }) {
  const [activeJobs, setActiveJobs] = useState<PlatformJob[]>([]);
  const [expandedJobId, setExpandedJobId] = useState<number | null>(null);
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    const fetchJobs = async () => {
      try {
        const response = await fetch(`/api/jobs/active?profileId=${profileId}`);
        const data = await response.json();
        setActiveJobs(data.jobs || []);
        
        // Auto-show if there are running jobs
        if (data.jobs?.some((j: PlatformJob) => j.status === 'running' || j.status === 'queued')) {
          setIsVisible(true);
        }
      } catch (error) {
        console.error('Failed to fetch active jobs:', error);
      }
    };

    fetchJobs();
    const interval = setInterval(fetchJobs, 3000);
    return () => clearInterval(interval);
  }, [profileId]);

  if (activeJobs.length === 0 && !isVisible) return null;

  return (
    <div className="fixed bottom-6 right-6 z-50 w-80 md:w-96">
      <motion.div 
        initial={{ y: 20, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        className="bg-glass glass border border-sidebar-border rounded-apple-lg shadow-apple-hover overflow-hidden"
      >
        <div 
          className="p-4 flex items-center justify-between cursor-pointer select-none"
          onClick={() => setIsVisible(!isVisible)}
        >
          <div className="flex items-center gap-2">
            <div className={`p-1.5 rounded-full ${activeJobs.some(j => j.status === 'running') ? 'bg-primary/10 text-primary animate-pulse' : 'bg-muted text-muted-foreground'}`}>
              <Activity className="w-4 h-4" />
            </div>
            <h3 className="text-sm font-semibold">Active Tasks</h3>
            {activeJobs.length > 0 && (
              <span className="bg-primary text-primary-foreground text-[10px] font-bold px-1.5 py-0.5 rounded-full">
                {activeJobs.length}
              </span>
            )}
          </div>
          {isVisible ? <ChevronDown className="w-4 h-4 text-muted-foreground" /> : <ChevronUp className="w-4 h-4 text-muted-foreground" />}
        </div>

        <AnimatePresence>
          {isVisible && (
            <motion.div 
              initial={{ height: 0 }}
              animate={{ height: 'auto' }}
              exit={{ height: 0 }}
              className="border-t border-sidebar-border max-h-[400px] overflow-y-auto"
            >
              {activeJobs.length === 0 ? (
                <div className="p-8 text-center">
                  <p className="text-xs text-muted-foreground">No active background tasks.</p>
                </div>
              ) : (
                <div className="divide-y divide-sidebar-border">
                  {activeJobs.map((job) => (
                    <div key={job.id} className="p-4 space-y-3">
                      <div 
                        className="flex items-center justify-between cursor-pointer"
                        onClick={() => setExpandedJobId(expandedJobId === job.id ? null : job.id)}
                      >
                        <div className="flex items-center gap-3">
                          <StatusIcon status={job.status} />
                          <div>
                            <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">{job.jobType.replace('_', ' ')}</p>
                            <p className="text-[10px] text-muted-foreground">ID: #{job.id} • Last updated {new Date(job.updatedAt).toLocaleTimeString()}</p>
                          </div>
                        </div>
                        <div className="text-right flex items-center gap-2">
                          <span className="text-xs font-semibold tabular-nums">{job.progress}%</span>
                          {expandedJobId === job.id ? <ChevronUp className="w-3 h-3 text-muted-foreground" /> : <ChevronDown className="w-3 h-3 text-muted-foreground" />}
                        </div>
                      </div>

                      <div className="h-1.5 w-full bg-muted/30 rounded-full overflow-hidden">
                        <motion.div 
                          initial={{ width: 0 }}
                          animate={{ width: `${job.progress}%` }}
                          className={`h-full ${job.status === 'failed' ? 'bg-red-500' : 'bg-primary'} transition-all duration-500`}
                        />
                      </div>

                      <AnimatePresence>
                        {expandedJobId === job.id && (
                          <motion.div 
                            initial={{ opacity: 0, y: -10 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -10 }}
                            className="bg-black/5 dark:bg-white/5 rounded-apple p-3 space-y-2 mt-2"
                          >
                            <div className="flex items-center gap-2 text-[10px] font-bold text-muted-foreground uppercase tracking-widest border-b border-border/50 pb-1 mb-2">
                              <Terminal className="w-3 h-3" /> Execution Logs
                            </div>
                            <div className="space-y-1.5 max-h-32 overflow-y-auto pr-1">
                              {job.logs && job.logs.length > 0 ? (
                                job.logs.map((log) => (
                                  <div key={log.id} className="text-[10px] leading-tight font-mono">
                                    <span className="text-muted-foreground">[{new Date(log.createdAt).toLocaleTimeString([], { hour12: false })}]</span>{' '}
                                    <span className={log.level === 'error' ? 'text-red-500' : log.level === 'warn' ? 'text-amber-500' : 'text-foreground/70'}>
                                      {log.message}
                                    </span>
                                  </div>
                                ))
                              ) : (
                                <p className="text-[10px] text-muted-foreground italic">No logs available yet.</p>
                              )}
                              {job.error && (
                                <div className="text-[10px] leading-tight font-mono text-red-500 mt-2 bg-red-500/10 p-1.5 rounded border border-red-500/20">
                                  ERROR: {job.error}
                                </div>
                              )}
                            </div>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>
                  ))}
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    </div>
  );
}

function StatusIcon({ status }: { status: PlatformJob['status'] }) {
  switch (status) {
    case 'running':
      return (
        <div className="p-1.5 bg-primary/10 rounded-full text-primary">
          <Loader2 className="w-3.5 h-3.5 animate-spin" />
        </div>
      );
    case 'succeeded':
      return (
        <div className="p-1.5 bg-green-500/10 rounded-full text-green-500">
          <CheckCircle2 className="w-3.5 h-3.5" />
        </div>
      );
    case 'failed':
      return (
        <div className="p-1.5 bg-red-500/10 rounded-full text-red-500">
          <XCircle className="w-3.5 h-3.5" />
        </div>
      );
    case 'retrying':
      return (
        <div className="p-1.5 bg-amber-500/10 rounded-full text-amber-500">
          <Clock className="w-3.5 h-3.5 animate-pulse" />
        </div>
      );
    default:
      return (
        <div className="p-1.5 bg-muted rounded-full text-muted-foreground">
          <Clock className="w-3.5 h-3.5" />
        </div>
      );
  }
}
