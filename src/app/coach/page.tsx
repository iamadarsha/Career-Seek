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
  reindexProfile,
  reindexJob,
} from './coach-actions';

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
    high: { bg: 'bg-green-50 border-green-200', text: 'text-green-700', label: 'High Confidence' },
    medium: { bg: 'bg-amber-50 border-amber-200', text: 'text-amber-700', label: 'Medium Confidence' },
    low: { bg: 'bg-red-50 border-red-200', text: 'text-red-700', label: 'Low Confidence' },
  };
  const c = config[level] || config.medium;
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium rounded-full border ${c.bg} ${c.text}`}>
      {level === 'high' ? <CheckCircle2 className="w-3 h-3" /> : level === 'low' ? <AlertTriangle className="w-3 h-3" /> : <Info className="w-3 h-3" />}
      {c.label}
    </span>
  );
}

// ── Source evidence card ───────────────────────────────────────────────────

function SourceCard({ source, expanded, onToggle }: { source: Source; expanded: boolean; onToggle: () => void }) {
  return (
    <div className="border border-card-border rounded-lg overflow-hidden bg-card/50">
      <button
        onClick={onToggle}
        className="w-full flex items-center gap-2 px-3 py-2 text-xs font-medium text-muted-foreground hover:bg-muted/30 transition-colors"
      >
        {expanded ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
        <span className="truncate text-left flex-1">{source.sourceLabel}</span>
        <span className="text-[10px] px-1.5 py-0.5 bg-muted rounded font-mono">{source.relevanceScore}%</span>
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

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // ── Init ─────────────────────────────────────────────────────────────────

  useEffect(() => {
    loadInitialData();
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const loadInitialData = async () => {
    const [threadsRes, jobsRes, statusRes] = await Promise.all([
      getCoachThreads(),
      getAvailableJobs(),
      getCoachIndexStatus(),
    ]);
    if (threadsRes.success) setThreads(threadsRes.threads);
    if (jobsRes.success) setJobs(jobsRes.jobs);
    setIndexStatus(statusRes);

    const suggestionsRes = await getCoachSuggestions();
    setSuggestions(suggestionsRes);
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

  // ── Indexing ─────────────────────────────────────────────────────────────

  const handleIndex = async () => {
    setIsIndexing(true);
    try {
      await indexForCoach({
        scoredJobId: selectedJobId || undefined,
        forceReindex: false,
      });
      const statusRes = await getCoachIndexStatus();
      setIndexStatus(statusRes);
    } catch (err: any) {
      setError(err.message || 'Indexing failed');
    } finally {
      setIsIndexing(false);
    }
  };

  const handleReindex = async () => {
    setIsIndexing(true);
    try {
      await reindexProfile();
      if (selectedJobId) {
        await reindexJob(selectedJobId);
      }
      await indexForCoach({
        scoredJobId: selectedJobId || undefined,
        forceReindex: true,
      });
      const statusRes = await getCoachIndexStatus();
      setIndexStatus(statusRes);
    } catch (err: any) {
      setError(err.message || 'Re-indexing failed');
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

  const handleJobChange = async (jobId: number | null) => {
    setSelectedJobId(jobId);
    const suggestionsRes = await getCoachSuggestions(jobId || undefined);
    setSuggestions(suggestionsRes);
  };

  // ── Keyboard ─────────────────────────────────────────────────────────────

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  // ── Render ───────────────────────────────────────────────────────────────

  return (
    <div className="flex h-[calc(100vh-8rem)] gap-0">
      {/* Thread sidebar */}
      {showSidebar && (
        <div className="w-64 border-r border-card-border bg-card/30 flex flex-col shrink-0">
          <div className="p-3 border-b border-card-border flex items-center justify-between">
            <h3 className="text-sm font-semibold text-foreground">Threads</h3>
            <button
              onClick={handleNewThread}
              className="p-1.5 rounded-lg hover:bg-muted transition-colors text-muted-foreground hover:text-foreground"
              title="New Thread"
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
                  className={`group flex items-center gap-2 px-3 py-2 rounded-lg cursor-pointer transition-colors text-sm ${
                    activeThreadId === thread.id
                      ? 'bg-primary/10 text-primary'
                      : 'text-foreground/80 hover:bg-muted/50'
                  }`}
                  onClick={() => handleSelectThread(thread.id)}
                >
                  <MessageSquare className="w-3.5 h-3.5 shrink-0" />
                  <span className="truncate flex-1">{thread.title || 'New conversation'}</span>
                  <button
                    onClick={(e) => { e.stopPropagation(); handleDeleteThread(thread.id); }}
                    className="opacity-0 group-hover:opacity-100 p-0.5 rounded hover:bg-red-100 text-muted-foreground hover:text-red-600 transition-all"
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                </div>
              ))
            )}
          </div>

          {/* Index status */}
          <div className="p-3 border-t border-card-border space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">Index</span>
              <span className="text-[10px] text-muted-foreground">{indexStatus.totalChunks} chunks</span>
            </div>
            <div className="flex gap-1.5">
              <button
                onClick={handleIndex}
                disabled={isIndexing}
                className="flex-1 flex items-center justify-center gap-1.5 px-2 py-1.5 text-xs bg-muted/50 rounded-lg hover:bg-muted transition-colors disabled:opacity-50"
              >
                {isIndexing ? <Loader2 className="w-3 h-3 animate-spin" /> : <Zap className="w-3 h-3" />}
                Index
              </button>
              <button
                onClick={handleReindex}
                disabled={isIndexing}
                className="flex items-center justify-center gap-1.5 px-2 py-1.5 text-xs bg-muted/50 rounded-lg hover:bg-muted transition-colors disabled:opacity-50"
                title="Force re-index"
              >
                <RefreshCw className="w-3 h-3" />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Main chat area */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Top bar */}
        <div className="px-4 py-3 border-b border-card-border bg-card/50 flex items-center gap-3">
          <button
            onClick={() => setShowSidebar(s => !s)}
            className="p-1.5 rounded-lg hover:bg-muted transition-colors text-muted-foreground"
          >
            <Settings2 className="w-4 h-4" />
          </button>

          <div className="flex-1 flex items-center gap-3">
            <h2 className="text-sm font-semibold text-foreground">AI Coach</h2>

            {/* Job selector */}
            <select
              value={selectedJobId || ''}
              onChange={(e) => handleJobChange(e.target.value ? Number(e.target.value) : null)}
              className="text-xs px-2 py-1 rounded-lg border border-card-border bg-background text-foreground max-w-[200px] truncate"
            >
              <option value="">No job selected</option>
              {jobs.map(job => (
                <option key={job.scoredJobId} value={job.scoredJobId}>
                  {job.title} @ {job.company} ({job.tier})
                </option>
              ))}
            </select>

            {/* Scope selector */}
            <div className="flex items-center gap-1 bg-muted/30 rounded-lg p-0.5">
              {SCOPE_OPTIONS.map(opt => (
                <button
                  key={opt.value}
                  onClick={() => setScope(opt.value)}
                  className={`flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-medium transition-colors ${
                    scope === opt.value
                      ? 'bg-card text-foreground shadow-sm'
                      : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  {opt.icon}
                  {opt.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Messages area */}
        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-6">
          {messages.length === 0 && !isLoading ? (
            /* Empty state */
            <div className="flex flex-col items-center justify-center h-full text-center">
              <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center mb-6">
                <Sparkles className="w-8 h-8 text-primary" />
              </div>
              <h3 className="text-lg font-semibold text-foreground mb-2">AI Career Coach</h3>
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
                      className="px-3 py-1.5 text-xs font-medium text-primary bg-primary/5 border border-primary/15 rounded-full hover:bg-primary/10 transition-colors"
                    >
                      {prompt}
                    </button>
                  ))}
                </div>
              )}

              {indexStatus.totalChunks === 0 && (
                <div className="mt-6 p-4 bg-amber-50 border border-amber-200 rounded-apple text-sm text-amber-700 max-w-md">
                  <p className="font-medium mb-1">No indexed materials yet</p>
                  <p className="text-xs">Click "Index" in the sidebar to index your profile and job materials before asking questions.</p>
                </div>
              )}
            </div>
          ) : (
            /* Message list */
            messages.map((msg, idx) => (
              <div key={msg.id || idx} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[85%] ${msg.role === 'user' ? 'ml-auto' : 'mr-auto'}`}>
                  {msg.role === 'user' ? (
                    /* User message */
                    <div className="bg-primary text-primary-foreground rounded-2xl rounded-br-md px-4 py-2.5 text-sm">
                      {msg.content}
                    </div>
                  ) : (
                    /* Assistant message */
                    <div className="space-y-3">
                      <div className="bg-card border border-card-border rounded-2xl rounded-bl-md px-5 py-4 shadow-apple">
                        {/* Confidence badge */}
                        {msg.confidenceLevel && (
                          <div className="mb-3">
                            <ConfidenceBadge level={msg.confidenceLevel} />
                          </div>
                        )}

                        {/* Answer text */}
                        <div className="text-sm text-foreground/90 leading-relaxed whitespace-pre-wrap prose prose-sm max-w-none">
                          {msg.content}
                        </div>

                        {/* Caveats */}
                        {msg.caveats && msg.caveats.length > 0 && (
                          <div className="mt-3 pt-3 border-t border-card-border">
                            <div className="flex items-center gap-1.5 mb-1">
                              <AlertTriangle className="w-3 h-3 text-amber-500" />
                              <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">Caveats</span>
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
                            className="flex items-center gap-1 px-2 py-1 text-xs text-muted-foreground hover:text-foreground rounded-md hover:bg-muted/50 transition-colors"
                          >
                            {copiedId === msg.id ? <CheckCircle2 className="w-3 h-3 text-green-600" /> : <Copy className="w-3 h-3" />}
                            {copiedId === msg.id ? 'Copied' : 'Copy'}
                          </button>
                        </div>
                      </div>

                      {/* Sources */}
                      {msg.sources && msg.sources.length > 0 && (
                        <div className="space-y-1.5">
                          <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium px-1">
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
                              className="px-2.5 py-1 text-xs text-primary bg-primary/5 border border-primary/15 rounded-full hover:bg-primary/10 transition-colors"
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
              <div className="bg-card border border-card-border rounded-2xl rounded-bl-md px-5 py-4 shadow-apple">
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Retrieving evidence and generating answer...</span>
                </div>
              </div>
            </div>
          )}

          {/* Error display */}
          {error && (
            <div className="flex justify-center">
              <div className="p-3 bg-red-50 border border-red-200 text-red-700 rounded-apple text-sm max-w-md">
                {error}
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* Composer */}
        <div className="px-6 py-4 border-t border-card-border bg-card/30">
          {/* Inline suggestions when there are messages */}
          {messages.length > 0 && suggestions.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mb-3">
              {suggestions.slice(0, 4).map((prompt, idx) => (
                <button
                  key={idx}
                  onClick={() => handleSend(prompt)}
                  className="px-2.5 py-1 text-[11px] text-muted-foreground bg-muted/30 border border-card-border rounded-full hover:bg-muted/50 transition-colors"
                >
                  {prompt}
                </button>
              ))}
            </div>
          )}

          <div className="flex items-end gap-2">
            <textarea
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={
                indexStatus.totalChunks === 0
                  ? 'Index your materials first...'
                  : selectedJobId
                    ? 'Ask about this role, your fit, interview prep...'
                    : 'Ask about your profile, career strategy...'
              }
              rows={1}
              className="flex-1 px-4 py-2.5 border border-card-border rounded-xl bg-background text-sm resize-none focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary/50 transition-all placeholder:text-muted-foreground/60"
              style={{ minHeight: '42px', maxHeight: '120px' }}
              disabled={isLoading}
            />
            <button
              onClick={() => handleSend()}
              disabled={isLoading || !input.trim()}
              className="p-2.5 bg-primary text-primary-foreground rounded-xl hover:bg-primary-hover transition-colors disabled:opacity-40 disabled:cursor-not-allowed shrink-0"
            >
              <Send className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
