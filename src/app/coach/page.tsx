'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import {
  Bot,
  Send,
  Plus,
  Trash2,
  ChevronDown,
  ChevronRight,
  RefreshCw,
  Loader2,
  Copy,
  CheckCircle2,
  AlertTriangle,
  Info,
  Sparkles,
  FileText,
  Briefcase,
  Search,
  MessageSquare,
  Settings2,
  Zap,
} from 'lucide-react';
import {
  askCoach,
  createCoachThread,
  getCoachThreads,
  deleteCoachThread,
  getCoachMessages,
  getCoachSuggestions,
  getAvailableJobs,
  indexForCoach,
  getCoachIndexStatus,
} from './coach-actions';
import { getSystemCapabilitiesState } from '@/app/actions';
import { CoachSkeleton } from '@/components/ui/RouteSkeleton';

// ── Types ──────────────────────────────────────────────────────────────────

type RetrievalScope = 'job_only' | 'job_and_profile' | 'job_and_resume' | 'all_materials' | 'profile_only';

interface Source {
  id: number;
  chunkId: string;
  relevanceScore: number | null;
  snippetPreview: string | null;
  sourceLabel: string | null;
}

interface Message {
  id: number;
  role: string;
  content: string;
  confidenceLevel?: string | null;
  reasoning?: string | null;
  suggestedFollowUps?: string[] | null;
  caveats?: string[] | null;
  sources: Source[];
  createdAt: any;
}

interface Thread {
  id: number;
  title: string | null;
  scoredJobId: number | null;
  scope: string;
  updatedAt: any;
}

interface Job {
  scoredJobId: number;
  title: string;
  company: string;
  tier: string;
  score: number;
}

// ── Scope labels ───────────────────────────────────────────────────────────

const SCOPE_OPTIONS: { value: RetrievalScope; label: string; icon: React.ReactNode }[] = [
  { value: 'job_and_profile', label: 'Job + Profile', icon: <Briefcase className="w-3.5 h-3.5" /> },
  { value: 'job_only', label: 'Job Only', icon: <FileText className="w-3.5 h-3.5" /> },
  { value: 'job_and_resume', label: 'Job + Resume', icon: <FileText className="w-3.5 h-3.5" /> },
  { value: 'all_materials', label: 'All Materials', icon: <Search className="w-3.5 h-3.5" /> },
  { value: 'profile_only', label: 'Profile Only', icon: <Bot className="w-3.5 h-3.5" /> },
];

// ── Confidence badge ───────────────────────────────────────────────────────

function ConfidenceBadge({ level }: { level: string }) {
  const config: Record<string, { bg: string; text: string; label: string }> = {
    high: { bg: 'bg-success-bg border-success-border', text: 'text-success', label: 'High Confidence' },
    medium: { bg: 'bg-warning-bg border-warning-border', text: 'text-warning', label: 'Medium Confidence' },
    low: { bg: 'bg-danger-bg border-danger-border', text: 'text-danger', label: 'Low Confidence' },
  };
  const c = config[level] || config.medium;
  return (
    <span className={`inline-flex items-center gap-1 rounded-apple border px-2 py-0.5 text-xs font-medium ${c.bg} ${c.text}`}>
      {level === 'high' ? <CheckCircle2 className="w-3 h-3" /> : level === 'low' ? <AlertTriangle className="w-3 h-3" /> : <Info className="w-3 h-3" />}
      {c.label}
    </span>
  );
}

// ── Source evidence card ───────────────────────────────────────────────────

function SourceCard({ source, expanded, onToggle }: { source: Source; expanded: boolean; onToggle: () => void }) {
  return (
    <div className="overflow-hidden rounded-apple border border-card-border bg-surface/70">
      <button
        onClick={onToggle}
        className="flex min-h-11 w-full items-center gap-2 px-3 py-2 text-xs font-medium text-muted-foreground transition-colors hover:bg-surface-container-low"
      >
        {expanded ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
        <span className="truncate text-left flex-1">{source.sourceLabel}</span>
        <span className="rounded-sharp bg-muted px-1.5 py-0.5 font-mono text-[10px]">{source.relevanceScore}%</span>
      </button>
      {expanded && (
        <div className="px-3 pb-3 pt-1 border-t border-card-border">
          <p className="text-xs text-foreground/80 whitespace-pre-wrap leading-relaxed">
            {source.snippetPreview}
          </p>
        </div>
      )}
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────

export default function CoachPage() {
  // State
  const [threads, setThreads] = useState<Thread[]>([]);
  const [activeThreadId, setActiveThreadId] = useState<number | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isIndexing, setIsIndexing] = useState(false);
  const [scope, setScope] = useState<RetrievalScope>('job_and_profile');
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [selectedJobId, setSelectedJobId] = useState<number | null>(null);
  const [expandedSources, setExpandedSources] = useState<Set<number>>(new Set());
  const [indexStatus, setIndexStatus] = useState<{ totalChunks: number; lastRunAt: Date | null; lastRunStatus: string | null }>({ totalChunks: 0, lastRunAt: null, lastRunStatus: null });
  const [showSidebar, setShowSidebar] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<number | null>(null);
  const [capabilities, setCapabilities] = useState<any>(null);
  const [initialLoading, setInitialLoading] = useState(true);
  const [jobFromUrl, setJobFromUrl] = useState<string | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const lastAssistantMessageRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // ── Init ─────────────────────────────────────────────────────────────────

  useEffect(() => {
    loadInitialData();
  }, []);

  useEffect(() => {
    setJobFromUrl(new URLSearchParams(window.location.search).get('job'));
  }, []);

  useEffect(() => {
    const mediaQuery = window.matchMedia('(min-width: 768px)');
    const syncSidebar = () => setShowSidebar(mediaQuery.matches);
    syncSidebar();
    mediaQuery.addEventListener('change', syncSidebar);
    return () => mediaQuery.removeEventListener('change', syncSidebar);
  }, []);

  useEffect(() => {
    const lastMessage = messages[messages.length - 1];
    if (!lastMessage) return;

    requestAnimationFrame(() => {
      if (lastMessage.role === 'assistant' && lastAssistantMessageRef.current) {
        lastAssistantMessageRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
        return;
      }
      scrollToBottom();
    });
  }, [messages]);

  const loadInitialData = async () => {
    try {
      const [threadsRes, jobsRes, statusRes, caps] = await Promise.all([
        getCoachThreads(),
        getAvailableJobs(),
        getCoachIndexStatus(),
        getSystemCapabilitiesState(),
      ]);
      if (threadsRes.success) {
        setThreads(threadsRes.threads);
        const latestThread = threadsRes.threads[0];
        if (latestThread) {
          setActiveThreadId(latestThread.id);
          if (latestThread.scoredJobId) {
            setSelectedJobId(latestThread.scoredJobId);
          }
          const messagesRes = await getCoachMessages(latestThread.id);
          if (messagesRes.success) setMessages(messagesRes.messages);
        }
      }
      if (jobsRes.success) setJobs(jobsRes.jobs);
      setIndexStatus(statusRes);
      setCapabilities(caps);

      const suggestionsRes = await getCoachSuggestions();
      setSuggestions(suggestionsRes);
    } finally {
      setInitialLoading(false);
    }
  };

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  // ── Thread operations ────────────────────────────────────────────────────

  const handleNewThread = async () => {
    const res = await createCoachThread({
      scoredJobId: selectedJobId || undefined,
      scope,
    });
    if (res.success) {
      setActiveThreadId(res.thread.id);
      setMessages([]);
      setError(null);
      const threadsRes = await getCoachThreads();
      if (threadsRes.success) setThreads(threadsRes.threads);
    }
  };

  const handleSelectThread = async (threadId: number) => {
    setActiveThreadId(threadId);
    setError(null);
    const res = await getCoachMessages(threadId);
    if (res.success) setMessages(res.messages);

    const thread = threads.find(t => t.id === threadId);
    if (thread?.scoredJobId) {
      setSelectedJobId(thread.scoredJobId);
    }
  };

  const handleDeleteThread = async (threadId: number) => {
    await deleteCoachThread(threadId);
    if (activeThreadId === threadId) {
      setActiveThreadId(null);
      setMessages([]);
    }
    const threadsRes = await getCoachThreads();
    if (threadsRes.success) setThreads(threadsRes.threads);
  };

  // ── Question flow ────────────────────────────────────────────────────────

  const handleSend = async (overrideQuestion?: string) => {
    const question = overrideQuestion || input.trim();
    if (!question || isLoading) return;

    setError(null);

    // Create thread if needed
    let threadId = activeThreadId;
    if (!threadId) {
      const res = await createCoachThread({
        scoredJobId: selectedJobId || undefined,
        scope,
      });
      if (res.success) {
        threadId = res.thread.id;
        setActiveThreadId(threadId);
      } else {
        setError('Failed to create thread');
        return;
      }
    }

    // Optimistically add user message
    const userMsg: Message = {
      id: Date.now(),
      role: 'user',
      content: question,
      sources: [],
      createdAt: new Date(),
    };
    setMessages(prev => [...prev, userMsg]);
    setInput('');
    setIsLoading(true);

    try {
      const response = await askCoach({
        threadId: threadId!,
        question,
        scope,
        answerMode: 'concise',
      });

      if (response.success) {
        const assistantMsg: Message = {
          id: response.message.id,
          role: 'assistant',
          content: response.message.content,
          confidenceLevel: response.message.confidenceLevel,
          reasoning: response.message.reasoning,
          suggestedFollowUps: response.message.suggestedFollowUps,
          caveats: response.message.caveats,
          sources: response.message.sources || [],
          createdAt: new Date(),
        };
        setMessages(prev => [...prev, assistantMsg]);

        // Refresh thread list (title may have changed)
        const threadsRes = await getCoachThreads();
        if (threadsRes.success) setThreads(threadsRes.threads);
      }
    } catch (err: any) {
      setError(err.message || 'Failed to get response');
    } finally {
      setIsLoading(false);
    }
  };

  // ── Background preparation ───────────────────────────────────────────────

  const handleIndex = async () => {
    setIsIndexing(true);
    try {
      const res = await indexForCoach({
        scoredJobId: selectedJobId || undefined,
        forceReindex: false,
      });
      setError(res.error || null);
      const statusRes = await getCoachIndexStatus();
      setIndexStatus(statusRes);
    } catch (err: any) {
      setError(err.message || 'Preparation failed');
    } finally {
      setIsIndexing(false);
    }
  };

  const handleReindex = async () => {
    setIsIndexing(true);
    try {
      const res = await indexForCoach({
        scoredJobId: selectedJobId || undefined,
        forceReindex: true,
      });
      setError(res.error || null);
      const statusRes = await getCoachIndexStatus();
      setIndexStatus(statusRes);
    } catch (err: any) {
      setError(err.message || 'Refresh failed');
    } finally {
      setIsIndexing(false);
    }
  };

  // ── Copy handler ─────────────────────────────────────────────────────────

  const handleCopy = (messageId: number, content: string) => {
    navigator.clipboard.writeText(content);
    setCopiedId(messageId);
    setTimeout(() => setCopiedId(null), 2000);
  };

  // ── Job change ───────────────────────────────────────────────────────────

  const handleJobChange = useCallback(async (jobId: number | null) => {
    setSelectedJobId(jobId);
    const suggestionsRes = await getCoachSuggestions(jobId || undefined);
    setSuggestions(suggestionsRes);
  }, []);

  useEffect(() => {
    if (!jobFromUrl || selectedJobId || jobs.length === 0) return;
    const jobId = Number(jobFromUrl);
    if (!Number.isFinite(jobId)) return;
    if (!jobs.some((job) => job.scoredJobId === jobId)) return;
    handleJobChange(jobId).catch(() => undefined);
  }, [handleJobChange, jobFromUrl, jobs, selectedJobId]);

  // ── Keyboard ─────────────────────────────────────────────────────────────

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  // ── Render ───────────────────────────────────────────────────────────────

  if (initialLoading) {
    return <CoachSkeleton />;
  }

  const aiGenerationLimited = capabilities?.safe_modes?.ai_generation_limited === true || capabilities?.has_ai_provider === false;
  const indexControlsDisabled = isIndexing;

  return (
    <div className="apple-card relative flex h-[calc(100dvh-14rem)] min-h-[30rem] gap-0 overflow-hidden md:h-[calc(100dvh-16rem)] md:min-h-[32rem] xl:h-[calc(100dvh-15rem)]">
      {/* Thread sidebar */}
      {showSidebar && (
        <div className="absolute inset-y-0 left-0 z-20 flex w-full max-w-sm shrink-0 flex-col border-r border-card-border bg-surface shadow-golden md:relative md:inset-auto md:z-auto md:w-64 md:max-w-none md:bg-surface-container-low md:shadow-none">
          <div className="p-3 border-b border-card-border flex items-center justify-between">
            <h3 className="text-sm font-semibold text-foreground">Conversations</h3>
            <button
              onClick={handleNewThread}
              className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-apple text-muted-foreground transition-colors hover:bg-surface-container hover:text-foreground"
              title="New Thread"
              aria-label="Create new coach thread"
            >
              <Plus className="w-4 h-4" />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto p-2 space-y-1">
            {threads.length === 0 ? (
              <p className="text-xs text-muted-foreground text-center py-8 px-4">
                No conversations yet. Start by asking a question.
              </p>
            ) : (
              threads.map(thread => (
                <div
                  key={thread.id}
                  className={`group flex min-h-11 cursor-pointer items-center gap-2 rounded-apple px-3 py-2 text-sm transition-colors ${
                    activeThreadId === thread.id
                      ? 'bg-surface-container text-primary shadow-golden-sm'
                      : 'text-foreground/80 hover:bg-surface-container-low'
                  }`}
                  onClick={() => handleSelectThread(thread.id)}
                >
                  <MessageSquare className="w-3.5 h-3.5 shrink-0" />
                  <span className="truncate flex-1">{thread.title || 'New conversation'}</span>
                  <button
                    onClick={(e) => { e.stopPropagation(); handleDeleteThread(thread.id); }}
                    className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-sharp text-muted-foreground opacity-0 transition-all hover:bg-danger-bg hover:text-danger focus:opacity-100 group-hover:opacity-100"
                    aria-label={`Delete thread ${thread.title || 'New conversation'}`}
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                </div>
              ))
            )}
          </div>

          {/* Background prep status */}
          <div className="p-3 border-t border-card-border space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-[10px] uppercase text-muted-foreground font-medium">Background prep</span>
              <span className="text-[10px] text-muted-foreground">{indexStatus.totalChunks} items ready</span>
            </div>
            <div className="flex gap-1.5">
              <button
                onClick={handleIndex}
                disabled={isIndexing}
                className="flex min-h-11 flex-1 items-center justify-center gap-1.5 rounded-apple bg-surface px-3 py-2 text-xs transition-colors hover:bg-surface-container disabled:opacity-50"
              >
                {isIndexing ? <Loader2 className="w-3 h-3 animate-spin" /> : <Zap className="w-3 h-3" />}
                Prepare
              </button>
              <button
                onClick={handleReindex}
                disabled={isIndexing}
                className="flex min-h-11 min-w-11 items-center justify-center gap-1.5 rounded-apple bg-surface px-3 py-2 text-xs transition-colors hover:bg-surface-container disabled:opacity-50"
                title="Refresh prepared materials"
                aria-label="Refresh prepared coach materials"
              >
                <RefreshCw className="w-3 h-3" />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Main chat area */}
      <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden" data-testid="coach-chat-pane">
        {/* Top bar */}
        <div className="flex shrink-0 flex-wrap items-start gap-3 border-b border-card-border bg-card/50 px-3 py-3 md:flex-nowrap md:items-center md:px-4">
          <button
            onClick={() => setShowSidebar(s => !s)}
            className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-apple text-muted-foreground transition-colors hover:bg-surface-container hover:text-foreground"
            aria-label={showSidebar ? 'Hide coach thread sidebar' : 'Show coach thread sidebar'}
          >
            <Settings2 className="w-4 h-4" />
          </button>

          <div className="flex min-w-0 flex-1 flex-col gap-2 xl:flex-row xl:items-center">
            <h2 className="shrink-0 text-sm font-semibold text-foreground">Coach</h2>

            {/* Job selector */}
            <select
              aria-label="Select job for coach"
              value={selectedJobId || ''}
              onChange={(e) => handleJobChange(e.target.value ? Number(e.target.value) : null)}
              className="min-h-11 w-full rounded-apple border border-card-border bg-background px-3 py-2 text-xs text-foreground md:max-w-[16rem] xl:w-auto"
            >
              <option value="">No job selected</option>
              {jobs.map(job => (
                <option key={job.scoredJobId} value={job.scoredJobId}>
                  {job.title} @ {job.company} ({job.tier})
                </option>
              ))}
            </select>

            {/* Scope selector */}
            <div className="flex max-w-full items-center gap-1 overflow-x-auto rounded-apple bg-muted/30 p-0.5">
              {SCOPE_OPTIONS.map(opt => (
                <button
                  key={opt.value}
                  onClick={() => setScope(opt.value)}
                  className={`flex min-h-11 shrink-0 items-center gap-1 rounded-sharp px-3 py-2 text-xs font-medium transition-colors ${
                    scope === opt.value
                      ? 'bg-surface text-foreground shadow-golden-sm'
                      : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  {opt.icon}
                  {opt.label}
                </button>
              ))}
            </div>

            <div className="flex w-full items-center gap-2 rounded-apple border border-card-border bg-background/80 p-2 md:hidden">
              <div className="min-w-0 flex-1">
                <p className="text-[10px] font-semibold uppercase text-muted-foreground">Background prep</p>
                <p className="text-xs text-muted-foreground">{indexStatus.totalChunks} items ready</p>
              </div>
              <button
                onClick={handleIndex}
                disabled={indexControlsDisabled}
                className="inline-flex min-h-11 items-center gap-1.5 rounded-apple bg-muted px-3 text-xs font-semibold text-foreground transition-colors hover:bg-surface-container disabled:opacity-50"
              >
                {isIndexing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Zap className="h-3.5 w-3.5" />}
                Prepare
              </button>
              <button
                onClick={handleReindex}
                disabled={indexControlsDisabled}
                className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-apple bg-muted text-foreground transition-colors hover:bg-surface-container disabled:opacity-50"
                title="Refresh prepared materials"
                aria-label="Refresh prepared coach materials"
              >
                <RefreshCw className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        </div>

        {aiGenerationLimited && (
          <div className="shrink-0 border-b border-warning-border bg-warning-bg px-4 py-3 text-sm text-warning">
            No generation provider is connected. Coach will still index locally and answer from evidence when possible.
          </div>
        )}

        {/* Messages area */}
        <div data-testid="coach-message-scroll" className="min-h-0 flex-1 space-y-6 overflow-y-auto overscroll-contain px-3 py-4 pb-6 md:px-6">
          {messages.length === 0 && !isLoading ? (
            /* Empty state */
            <div className="flex flex-col items-center justify-center h-full text-center">
              <div className="mb-6 flex h-16 w-16 items-center justify-center rounded-apple bg-surface-container">
                <Sparkles className="w-8 h-8 text-primary" />
              </div>
              <h3 className="text-lg font-semibold text-foreground mb-2">Career coach</h3>
              <p className="text-sm text-muted-foreground max-w-md mb-8 leading-relaxed">
                Ask questions about your profile, job opportunities, interview prep, or application strategy.
                Answers are grounded in your actual materials — no generic advice.
              </p>

              {/* Suggested prompts */}
              {suggestions.length > 0 && (
                <div className="flex flex-wrap gap-2 max-w-lg justify-center">
                  {suggestions.map((prompt, idx) => (
                    <button
                      key={idx}
                      onClick={() => handleSend(prompt)}
                      className="min-h-11 rounded-apple border border-primary/20 bg-surface px-3 py-2 text-xs font-medium text-primary transition-colors hover:bg-surface-container"
                    >
                      {prompt}
                    </button>
                  ))}
                </div>
              )}

              {indexStatus.totalChunks === 0 && (
                <div className="mt-6 max-w-md rounded-apple border border-warning-border bg-warning-bg p-4 text-sm text-warning">
                  <p className="font-medium mb-1">Your materials are not prepared yet</p>
                  <p className="text-xs">Use Prepare so the coach can answer from your resume and job materials.</p>
                </div>
              )}
            </div>
          ) : (
            /* Message list */
            messages.map((msg, idx) => (
              <div
                key={msg.id || idx}
                className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
                ref={msg.role === 'assistant' && idx === messages.length - 1 ? (node) => { lastAssistantMessageRef.current = node; } : undefined}
              >
                <div className={`${msg.role === 'user' ? 'ml-auto max-w-3xl' : 'mr-auto w-full max-w-4xl'}`}>
                  {msg.role === 'user' ? (
                    /* User message */
                    <div className="rounded-apple bg-foreground px-4 py-2.5 text-sm text-primary-foreground">
                      {msg.content}
                    </div>
                  ) : (
                    /* Assistant message */
                    <div className="space-y-3">
                      <div
                        data-testid="coach-assistant-message"
                        className="overflow-y-auto overscroll-contain rounded-apple border border-card-border bg-card px-5 py-4 shadow-apple"
                        style={{ maxHeight: 'clamp(18rem, calc(100dvh - 32rem), 36rem)' }}
                      >
                        {/* Confidence badge */}
                        {msg.confidenceLevel && (
                          <div className="mb-3">
                            <ConfidenceBadge level={msg.confidenceLevel} />
                          </div>
                        )}

                        {/* Answer text */}
                        <div className="max-w-none whitespace-pre-wrap break-words text-sm leading-7 text-foreground/90">
                          {msg.content}
                        </div>

                        {/* Caveats */}
                        {msg.caveats && msg.caveats.length > 0 && (
                          <div className="mt-3 pt-3 border-t border-card-border">
                            <div className="flex items-center gap-1.5 mb-1">
                              <AlertTriangle className="w-3 h-3 text-warning" />
                              <span className="text-[10px] uppercase text-muted-foreground font-medium">Caveats</span>
                            </div>
                            <ul className="text-xs text-muted-foreground space-y-0.5">
                              {msg.caveats.map((c, i) => (
                                <li key={i}>• {c}</li>
                              ))}
                            </ul>
                          </div>
                        )}

                        {/* Actions */}
                        <div className="mt-3 pt-2 border-t border-card-border flex items-center gap-2">
                          <button
                            onClick={() => handleCopy(msg.id, msg.content)}
                            className="flex min-h-11 items-center gap-1 rounded-apple px-3 py-2 text-xs text-muted-foreground transition-colors hover:bg-muted/50 hover:text-foreground"
                          >
                            {copiedId === msg.id ? <CheckCircle2 className="w-3 h-3 text-success" /> : <Copy className="w-3 h-3" />}
                            {copiedId === msg.id ? 'Copied' : 'Copy'}
                          </button>
                        </div>
                      </div>

                      {/* Sources */}
                      {msg.sources && msg.sources.length > 0 && (
                        <div className="space-y-1.5">
                          <span className="text-[10px] uppercase text-muted-foreground font-medium px-1">
                            Sources ({msg.sources.length})
                          </span>
                          {msg.sources.map((source) => (
                            <SourceCard
                              key={source.id}
                              source={source}
                              expanded={expandedSources.has(source.id)}
                              onToggle={() => {
                                setExpandedSources(prev => {
                                  const next = new Set(prev);
                                  if (next.has(source.id)) next.delete(source.id);
                                  else next.add(source.id);
                                  return next;
                                });
                              }}
                            />
                          ))}
                        </div>
                      )}

                      {/* Suggested follow-ups */}
                      {msg.suggestedFollowUps && msg.suggestedFollowUps.length > 0 && (
                        <div className="flex flex-wrap gap-1.5 pt-1">
                          {msg.suggestedFollowUps.map((followUp, i) => (
                            <button
                              key={i}
                              onClick={() => handleSend(followUp)}
                              className="min-h-11 rounded-apple border border-primary/20 bg-surface px-3 py-2 text-xs text-primary transition-colors hover:bg-surface-container"
                            >
                              {followUp}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            ))
          )}

          {/* Loading indicator */}
          {isLoading && (
            <div className="flex justify-start">
              <div className="rounded-apple border border-card-border bg-card px-5 py-4 shadow-apple">
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Retrieving local evidence and preparing answer...</span>
                </div>
              </div>
            </div>
          )}

          {/* Error display */}
          {error && (
            <div className="flex justify-center">
              <div className="max-w-md rounded-apple border border-danger-border bg-danger-bg p-3 text-sm text-danger">
                {error}
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* Composer */}
        <div data-testid="coach-composer" className="shrink-0 border-t border-card-border bg-card/95 pb-4 pl-3 pr-20 pt-4 md:py-4 md:pl-6 md:pr-24 lg:px-6">
          {/* Inline suggestions when there are messages */}
          {messages.length > 0 && suggestions.length > 0 && (
            <div className="mb-3 flex gap-2 overflow-x-auto pb-1 no-scrollbar">
              {suggestions.slice(0, 4).map((prompt, idx) => (
                <button
                  key={idx}
                  onClick={() => handleSend(prompt)}
                  className="min-h-11 max-w-[22rem] shrink-0 truncate rounded-apple border border-card-border bg-muted/30 px-3 py-2 text-xs text-muted-foreground transition-colors hover:bg-surface-container"
                >
                  {prompt}
                </button>
              ))}
            </div>
          )}

          <div className="flex min-w-0 items-end gap-2">
            <textarea
              aria-label="Coach question"
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={
                indexStatus.totalChunks === 0
                  ? 'Prepare your materials first...'
                  : selectedJobId
                    ? 'Ask about this role, your fit, interview prep...'
                    : 'Ask about your profile, career strategy...'
              }
              rows={1}
              className="min-w-0 flex-1 resize-none rounded-apple border border-card-border bg-background px-4 py-2.5 text-sm leading-6 transition-all placeholder:text-muted-foreground/60 focus:border-primary/50 focus:outline-none"
              style={{ minHeight: '44px', maxHeight: '120px' }}
              disabled={isLoading}
            />
            <button
              onClick={() => handleSend()}
              disabled={isLoading || !input.trim()}
              className="inline-flex min-h-11 min-w-11 shrink-0 items-center justify-center rounded-apple bg-foreground text-primary-foreground transition-colors hover:bg-primary disabled:cursor-not-allowed disabled:opacity-40"
              aria-label="Send coach question"
            >
              <Send className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
