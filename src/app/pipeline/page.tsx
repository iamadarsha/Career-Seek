'use client';

/**
 * Pipeline — Phase G
 * 
 * Career CRM board + list views with filters, search, and management.
 * Golden-hour career operations console.
 */

import { Suspense, useState, useEffect, useCallback, useRef, useTransition } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import {
  Briefcase, Search, Filter, LayoutGrid, List, Plus,
  ChevronDown, Clock, AlertCircle, Star, Archive,
  CalendarDays, MapPin, ExternalLink, MoreHorizontal,
  ArrowUpDown, Bell, CheckCircle2, X, Building2,
  Send, Eye, MessageSquare, TrendingUp, ChevronRight,
} from 'lucide-react';
import {
  actionListApplications,
  actionChangeStatus,
  actionDeleteApplication,
  actionGetApplicationCounts,
  actionGetFilterOptions,
  actionCreateApplication,
  actionGetCrmDashboard,
} from './pipeline-actions';
import { AdvisoryEstimateLabel } from '@/components/ui/AdvisoryEstimateLabel';
import { PipelineSkeleton } from '@/components/ui/RouteSkeleton';

const STATUS_CONFIG: Record<string, { label: string; color: string; bg: string; icon: any }> = {
  saved: { label: 'Saved', color: '#6A6A6A', bg: '#F7F7F7', icon: Star },
  preparing: { label: 'Preparing', color: '#B35C00', bg: '#FFF7E6', icon: Clock },
  applied: { label: 'Applied', color: '#FF385C', bg: 'rgba(255,56,92,0.12)', icon: Send },
  follow_up_due: { label: 'Follow-up', color: '#C13515', bg: '#FFF1ED', icon: Bell },
  recruiter_replied: { label: 'Replied', color: '#008A05', bg: '#EEF8EE', icon: MessageSquare },
  interview_scheduled: { label: 'Interview', color: '#484848', bg: '#F2F2F2', icon: CalendarDays },
  interviewed: { label: 'Interviewed', color: '#222222', bg: '#F7F7F7', icon: CheckCircle2 },
  assessment: { label: 'Assessment', color: '#B35C00', bg: '#FFF7E6', icon: Eye },
  offer: { label: 'Offer', color: '#008A05', bg: '#EEF8EE', icon: TrendingUp },
  rejected: { label: 'Rejected', color: '#C13515', bg: '#FFF1ED', icon: X },
  archived: { label: 'Archived', color: '#6A6A6A', bg: '#F2F2F2', icon: Archive },
};

const BOARD_COLUMNS = ['saved', 'preparing', 'applied', 'follow_up_due', 'recruiter_replied', 'interview_scheduled', 'interviewed', 'offer'];
const MANUAL_APPLICATION_DRAFT_KEY = 'career-seek:pipeline:manual-application-draft';

type ViewMode = 'board' | 'list';

export default function PipelinePage() {
  return (
    <Suspense fallback={<PipelineSkeleton />}>
      <PipelinePageContent />
    </Suspense>
  );
}

function PipelinePageContent() {
  const searchParams = useSearchParams();
  const urlStatus = searchParams.get('status') || '';
  const [apps, setApps] = useState<any[]>([]);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [view, setView] = useState<ViewMode>('list');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>(urlStatus);
  const [companyFilter, setCompanyFilter] = useState('');
  const [companies, setCompanies] = useState<string[]>([]);
  const [portals, setPortals] = useState<string[]>([]);
  const [showFilters, setShowFilters] = useState(false);
  const [showAdd, setShowAdd] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [dashboard, setDashboard] = useState<any>(null);

  const loadData = useCallback(() => {
    startTransition(async () => {
      const [appsRes, countsRes, filtersRes, dashRes] = await Promise.all([
        actionListApplications({
          status: statusFilter as any || undefined,
          company: companyFilter || undefined,
          search: search || undefined,
        }),
        actionGetApplicationCounts(),
        actionGetFilterOptions(),
        actionGetCrmDashboard(),
      ]);
      if (appsRes.success) setApps(appsRes.applications);
      if (countsRes.success) setCounts(countsRes.counts);
      if (filtersRes.success) {
        setCompanies(filtersRes.companies);
        setPortals(filtersRes.portals);
      }
      if (dashRes.success) setDashboard(dashRes.dashboard);
    });
  }, [statusFilter, companyFilter, search]);

  useEffect(() => { loadData(); }, [loadData]);
  useEffect(() => {
    setStatusFilter(urlStatus);
    if (urlStatus) setView('list');
  }, [urlStatus]);

  const handleStatusChange = async (appId: number, newStatus: string) => {
    await actionChangeStatus(appId, newStatus as any);
    loadData();
  };

  const handleDelete = async (appId: number) => {
    if (!confirm('Delete this application and all its history?')) return;
    await actionDeleteApplication(appId);
    loadData();
  };

  const totalActive = Object.entries(counts)
    .filter(([s]) => s !== 'archived' && s !== 'rejected')
    .reduce((sum, [, c]) => sum + c, 0);

  if (isPending && !dashboard) {
    return <PipelineSkeleton />;
  }

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      {/* Header */}
      <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="design-label">Applications</p>
          <h2 className="mt-2 font-display text-3xl font-semibold leading-tight md:text-4xl">Every opportunity in one place</h2>
          <p className="text-muted-foreground mt-1">
            Saved, prepared, applied, and follow-up jobs live here. {totalActive} active application{totalActive !== 1 ? 's' : ''}
            {dashboard?.overdueReminders > 0 && (
              <span className="text-danger ml-2">• {dashboard.overdueReminders} overdue</span>
            )}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => setView('board')}
            aria-pressed={view === 'board'}
            aria-label="Show board view"
            className={`inline-flex min-h-11 min-w-11 items-center justify-center rounded-apple p-2 transition-colors ${view === 'board' ? 'bg-surface-container text-primary shadow-golden-sm' : 'text-muted-foreground hover:text-foreground'}`}
            title="Board view"
          >
            <LayoutGrid className="w-5 h-5" />
          </button>
          <button
            onClick={() => setView('list')}
            aria-pressed={view === 'list'}
            aria-label="Show list view"
            className={`inline-flex min-h-11 min-w-11 items-center justify-center rounded-apple p-2 transition-colors ${view === 'list' ? 'bg-surface-container text-primary shadow-golden-sm' : 'text-muted-foreground hover:text-foreground'}`}
            title="List view"
          >
            <List className="w-5 h-5" />
          </button>
          <button
            onClick={() => setShowAdd(true)}
            className="design-button-primary px-4 py-2 text-sm font-semibold"
          >
            <Plus className="w-4 h-4" />
            Add job
          </button>
        </div>
      </div>

      {/* Summary cards */}
      {dashboard && (
        <div className="surface-grid grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
          {[
            { label: 'Added this week', value: dashboard.applicationsThisWeek, color: '#FF385C', helper: 'New opportunities' },
            { label: 'Need follow-up', value: dashboard.followUpsDueToday, color: dashboard.followUpsDueToday > 0 ? '#C13515' : '#6A6A6A', helper: 'Due today' },
            { label: 'Interviews', value: dashboard.interviewsUpcoming, color: '#484848', helper: 'Scheduled' },
            { label: 'Saved', value: dashboard.savedNotApplied, color: '#B35C00', helper: 'Ready to prepare' },
            { label: 'Quiet', value: dashboard.staleApplications, color: '#C13515', helper: 'May need a nudge' },
            { label: 'Total', value: dashboard.totalApplications, color: '#008A05', helper: 'All time' },
          ].map(card => (
            <div key={card.label} className="apple-card metric-card p-4">
              <p className="text-xs font-medium text-muted-foreground">{card.label}</p>
              <p className="font-display text-3xl font-semibold leading-none mt-1" style={{ color: card.color }}>{card.value}</p>
              <p className="mt-1 text-[11px] text-muted-foreground">{card.helper}</p>
            </div>
          ))}
        </div>
      )}

      {/* Search and filters */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[200px] max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input
            type="search"
            aria-label="Search applications"
            placeholder="Search saved, applied, or interview jobs..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="design-input w-full pl-10 pr-4 py-2 text-sm focus:outline-none"
          />
        </div>
        <button
          onClick={() => setShowFilters(!showFilters)}
          aria-expanded={showFilters}
          className={`flex min-h-11 items-center gap-2 rounded-apple border px-3 py-2 text-sm transition-colors ${showFilters ? 'border-primary bg-surface-container text-primary' : 'border-card-border bg-surface text-muted-foreground hover:text-foreground'}`}
        >
          <Filter className="w-4 h-4" />
          Filters
          {(statusFilter || companyFilter) && (
            <span className="h-2 w-2 rounded-sharp bg-primary" />
          )}
        </button>
      </div>

      {/* Filters panel */}
      {showFilters && (
        <div className="apple-card flex items-center gap-4 flex-wrap p-4 animate-in fade-in slide-in-from-top-2 duration-200">
          <select
            aria-label="Filter applications by status"
            value={statusFilter}
            onChange={e => setStatusFilter(e.target.value)}
            className="design-input px-3 py-2 text-sm"
          >
            <option value="">All Statuses</option>
            {Object.entries(STATUS_CONFIG).map(([key, cfg]) => (
              <option key={key} value={key}>{cfg.label} ({counts[key] || 0})</option>
            ))}
          </select>
          <select
            aria-label="Filter applications by company"
            value={companyFilter}
            onChange={e => setCompanyFilter(e.target.value)}
            className="design-input px-3 py-2 text-sm"
          >
            <option value="">All Companies</option>
            {companies.map(c => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
          {(statusFilter || companyFilter) && (
            <button
              onClick={() => { setStatusFilter(''); setCompanyFilter(''); }}
              className="text-sm text-primary hover:underline"
            >
              Clear filters
            </button>
          )}
        </div>
      )}

      {/* Board View */}
      {view === 'board' && (
        <div className="rounded-apple border border-card-border bg-surface-low p-3">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2 px-1">
	          <p className="text-sm font-semibold">Journey board</p>
	            <p className="text-xs font-medium text-muted-foreground">A power view for moving jobs between stages.</p>
          </div>
          <div className="min-h-[34rem] overflow-x-auto pb-4">
          <div className="flex min-h-[31rem] min-w-max gap-3 px-1">
            {BOARD_COLUMNS.map(status => {
              const cfg = STATUS_CONFIG[status];
              const columnApps = apps.filter(a => a.status === status);
              return (
                <div key={status} className="flex min-h-[30rem] w-[17rem] flex-shrink-0 flex-col">
                  {/* Column header */}
                  <div className="flex items-center justify-between mb-3 px-1">
                    <div className="flex items-center gap-2">
                      <div className="h-2 w-2 rounded-sharp" style={{ backgroundColor: cfg.color }} />
                      <span className="text-sm font-medium">{cfg.label}</span>
                    </div>
                    <span className="design-chip px-2 py-0.5 text-xs">
                      {columnApps.length}
                    </span>
                  </div>
                  {/* Cards */}
                  <div className="min-h-[26rem] flex-1 space-y-2">
                    {columnApps.length === 0 ? (
                      <div className="rounded-apple border border-dashed border-card-border p-6 text-center">
                        <p className="text-xs text-muted-foreground">No items</p>
                      </div>
                    ) : (
                      columnApps.map(app => (
                        <ApplicationCard
                          key={app.id}
                          app={app}
                          onStatusChange={handleStatusChange}
                          onDelete={handleDelete}
                          compact
                        />
                      ))
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
        </div>
      )}

      {/* List View */}
      {view === 'list' && (
        <div className="apple-card overflow-hidden">
          {apps.length === 0 ? (
            <EmptyState onAdd={() => setShowAdd(true)} />
          ) : (
            <div className="divide-y divide-card-border">
              {apps.map(app => (
                <ApplicationCard
                  key={app.id}
                  app={app}
                  onStatusChange={handleStatusChange}
                  onDelete={handleDelete}
                />
              ))}
            </div>
          )}
        </div>
      )}

      {/* Add Application Modal */}
      {showAdd && (
        <AddApplicationModal
          onClose={() => setShowAdd(false)}
          onSave={async (data) => {
            await actionCreateApplication(data);
            loadData();
          }}
        />
      )}
    </div>
  );
}

// ── Application Card ─────────────────────────────────────────────────────

function ApplicationCard({ app, onStatusChange, onDelete, compact = false }: {
  app: any;
  onStatusChange: (id: number, status: string) => void;
  onDelete: (id: number) => void;
  compact?: boolean;
}) {
  const [showStatusMenu, setShowStatusMenu] = useState(false);
  const cfg = STATUS_CONFIG[app.status] || STATUS_CONFIG.saved;
  const StatusIcon = cfg.icon;

  const timeAgo = (date: any) => {
    if (!date) return '';
    const d = new Date(date);
    const now = new Date();
    const diff = Math.floor((now.getTime() - d.getTime()) / (1000 * 60 * 60 * 24));
    if (diff === 0) return 'Today';
    if (diff === 1) return 'Yesterday';
    if (diff < 7) return `${diff}d ago`;
    if (diff < 30) return `${Math.floor(diff / 7)}w ago`;
    return d.toLocaleDateString();
  };

  if (compact) {
    return (
      <Link href={`/pipeline/${app.id}`} className="block">
        <div className="apple-card group flex min-h-[9.25rem] cursor-pointer flex-col p-3.5 transition-all hover:-translate-y-0.5 hover:shadow-apple-hover">
          <div className="mb-2 flex items-start justify-between">
            <h4 className="text-sm font-medium leading-tight line-clamp-2 group-hover:text-primary transition-colors">
              {app.title}
            </h4>
            {app.priority === 'high' && (
              <Star className="w-3.5 h-3.5 text-warning flex-shrink-0 ml-1" fill="currentColor" />
            )}
          </div>
          <p className="mb-2 flex items-center gap-1 text-xs text-muted-foreground">
            <Building2 className="h-3 w-3 shrink-0" />
            <span className="truncate">{app.company}</span>
          </p>
          <div className="mt-auto flex items-end justify-between gap-2">
            {app.scoreSnapshot && (
              <div className="flex flex-col items-start gap-1">
                <span className="text-xs font-medium" style={{ color: app.scoreSnapshot >= 75 ? '#008A05' : app.scoreSnapshot >= 50 ? '#B35C00' : '#6A6A6A' }}>
                  {app.scoreSnapshot}%
                </span>
                <AdvisoryEstimateLabel className="max-w-[9rem]" />
              </div>
            )}
            <span className="text-[10px] text-muted-foreground">{timeAgo(app.updatedAt)}</span>
          </div>
          {app.nextFollowUpAt && new Date(app.nextFollowUpAt) <= new Date() && (
            <div className="mt-2 flex items-center gap-1 text-[10px] text-danger">
              <Bell className="w-3 h-3" />
              Follow-up overdue
            </div>
          )}
        </div>
      </Link>
    );
  }

  return (
    <div className="grid gap-3 p-4 transition-colors hover:bg-surface-container-low group md:grid-cols-[2rem_minmax(0,1fr)_12rem_9rem_6rem_3rem] md:items-center">
      {/* Status dot */}
      <div className="hidden md:block">
        <div className="h-3 w-3 rounded-sharp" style={{ backgroundColor: cfg.color }} title={cfg.label} />
      </div>

      {/* Main content */}
      <Link href={`/pipeline/${app.id}`} className="min-w-0">
        <div className="flex items-center gap-3">
          <div className="flex-1 min-w-0">
            <h4 className="text-sm font-medium leading-snug group-hover:text-primary transition-colors md:truncate">{app.title}</h4>
            <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1">
              <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                <Building2 className="h-3 w-3 shrink-0" />
                {app.company}
              </span>
              {app.location && (
                <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                  <MapPin className="h-3 w-3 shrink-0" />
                  {app.location}
                </span>
              )}
              {app.portal && (
                <span className="text-xs text-muted-foreground">{app.portal}</span>
              )}
            </div>
          </div>
        </div>
      </Link>

      {/* Score */}
      <div className="text-left md:text-center">
        {app.scoreSnapshot ? (
          <div className="flex flex-wrap items-center gap-2 md:flex-col md:gap-1">
            <span className="text-sm font-medium" style={{
              color: app.scoreSnapshot >= 75 ? '#008A05' : app.scoreSnapshot >= 50 ? '#B35C00' : '#6A6A6A'
            }}>
              {app.scoreSnapshot}%
            </span>
            <AdvisoryEstimateLabel compact className="max-w-[6rem]" />
          </div>
        ) : (
          <span className="text-xs text-muted-foreground">—</span>
        )}
      </div>

      {/* Status badge */}
      <div className="relative">
        <button
          onClick={() => setShowStatusMenu(!showStatusMenu)}
          aria-expanded={showStatusMenu}
          aria-haspopup="menu"
          className="inline-flex min-h-11 items-center gap-1.5 rounded-apple px-3 py-2 text-xs font-medium transition-colors"
          style={{ backgroundColor: cfg.bg, color: cfg.color }}
        >
          <StatusIcon className="w-3 h-3" />
          {cfg.label}
          <ChevronDown className="w-3 h-3" />
        </button>
        {showStatusMenu && (
          <div className="absolute left-0 top-12 z-50 w-52 rounded-apple border border-card-border bg-card py-1 shadow-golden-sm animate-in fade-in slide-in-from-top-2 duration-150 md:left-auto md:right-0">
            {Object.entries(STATUS_CONFIG).map(([key, c]) => {
              const Icon = c.icon;
              return (
                <button
                  key={key}
                  onClick={() => { onStatusChange(app.id, key); setShowStatusMenu(false); }}
                  className={`flex min-h-10 w-full items-center gap-2 px-3 py-2 text-xs hover:bg-surface-container-low ${key === app.status ? 'font-medium' : ''}`}
                >
                  <Icon className="w-3.5 h-3.5" style={{ color: c.color }} />
                  {c.label}
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Timestamp */}
      <div className="text-left md:text-right">
        <span className="text-xs text-muted-foreground">{timeAgo(app.updatedAt)}</span>
      </div>

      {/* Actions */}
      <div className="text-left md:text-right">
        {app.url && (
          <a
            href={app.url}
            target="_blank"
            rel="noopener"
            title={`Open job posting for ${app.title} at ${app.company}`}
            className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-apple border border-card-border bg-surface text-muted-foreground hover:border-primary/40 hover:text-primary"
          >
            <span className="sr-only">Open job posting for {app.title} at {app.company}</span>
            <ExternalLink className="h-4 w-4" />
          </a>
        )}
      </div>
    </div>
  );
}

// ── Empty State ──────────────────────────────────────────────────────────

function EmptyState({ onAdd }: { onAdd: () => void }) {
  return (
    <div className="p-16 text-center">
      <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-apple bg-surface-container">
        <Briefcase className="w-8 h-8 text-primary" />
      </div>
      <h3 className="text-lg font-medium mb-2">No applications yet</h3>
      <p className="text-sm text-muted-foreground max-w-sm mx-auto mb-6">
        Save a job from Jobs or add one manually. Career Seek will keep follow-ups, notes, and application packs connected.
      </p>
      <button
        onClick={onAdd}
        className="design-button-primary px-5 py-2.5 text-sm font-semibold"
      >
        <Plus className="w-4 h-4" />
        Add first job
      </button>
    </div>
  );
}

// ── Add Application Modal ────────────────────────────────────────────────

function AddApplicationModal({ onClose, onSave }: {
  onClose: () => void;
  onSave: (data: any) => Promise<void>;
}) {
  const dialogRef = useRef<HTMLFormElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);
  const [title, setTitle] = useState('');
  const [company, setCompany] = useState('');
  const [location, setLocation] = useState('');
  const [url, setUrl] = useState('');
  const [portal, setPortal] = useState('');
  const [saving, setSaving] = useState(false);
  const [draftHydrated, setDraftHydrated] = useState(false);

  useEffect(() => {
    try {
      const rawDraft = localStorage.getItem(MANUAL_APPLICATION_DRAFT_KEY);
      if (!rawDraft) return;
      const draft = JSON.parse(rawDraft);
      if (typeof draft.title === 'string') setTitle(draft.title);
      if (typeof draft.company === 'string') setCompany(draft.company);
      if (typeof draft.location === 'string') setLocation(draft.location);
      if (typeof draft.url === 'string') setUrl(draft.url);
      if (typeof draft.portal === 'string') setPortal(draft.portal);
    } catch {
      localStorage.removeItem(MANUAL_APPLICATION_DRAFT_KEY);
    } finally {
      setDraftHydrated(true);
    }
  }, []);

  useEffect(() => {
    if (!draftHydrated) return;
    const draft = { title, company, location, url, portal };
    const hasDraft = Object.values(draft).some((value) => value.trim().length > 0);
    if (hasDraft) {
      localStorage.setItem(MANUAL_APPLICATION_DRAFT_KEY, JSON.stringify(draft));
    } else {
      localStorage.removeItem(MANUAL_APPLICATION_DRAFT_KEY);
    }
  }, [company, draftHydrated, location, portal, title, url]);

  const clearDraft = useCallback(() => {
    localStorage.removeItem(MANUAL_APPLICATION_DRAFT_KEY);
  }, []);

  const hasDraft = [title, company, location, url, portal].some((value) => value.trim().length > 0);

  const requestClose = useCallback(() => {
    if (saving) return;
    if (hasDraft && !confirm('Discard this tracked job draft?')) return;
    clearDraft();
    onClose();
  }, [clearDraft, hasDraft, onClose, saving]);

  useEffect(() => {
    previousFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const dialog = dialogRef.current;
    const firstInput = dialog?.querySelector<HTMLElement>('#manual-job-title');
    firstInput?.focus();

    const focusableSelector = [
      'a[href]',
      'button:not([disabled])',
      'input:not([disabled])',
      'select:not([disabled])',
      'textarea:not([disabled])',
      '[tabindex]:not([tabindex="-1"])',
    ].join(',');

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        requestClose();
        return;
      }
      if (event.key !== 'Tab' || !dialog) return;
      const focusable = Array.from(dialog.querySelectorAll<HTMLElement>(focusableSelector))
        .filter((element) => !element.hasAttribute('disabled') && element.offsetParent !== null);
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      previousFocusRef.current?.focus();
    };
  }, [requestClose]);

  const handleSubmit = async (event?: React.FormEvent) => {
    event?.preventDefault();
    if (!title.trim() || !company.trim()) return;
    setSaving(true);
    try {
      await onSave({ title: title.trim(), company: company.trim(), location, url, portal });
      clearDraft();
      onClose();
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm animate-in fade-in duration-200" onClick={requestClose}>
      <form
        ref={dialogRef}
        onSubmit={handleSubmit}
        role="dialog"
        aria-modal="true"
        aria-labelledby="track-job-title"
        className="apple-card max-h-[calc(100vh-2rem)] w-full max-w-md overflow-y-auto p-5 shadow-golden animate-in zoom-in-95 slide-in-from-bottom-4 duration-300 sm:p-6"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-5">
          <h3 id="track-job-title" className="text-lg font-medium">Add a job</h3>
          <button type="button" onClick={requestClose} aria-label="Close track job dialog" className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-apple border border-card-border bg-surface-container-low text-muted-foreground hover:text-foreground">
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="space-y-4">
          <div>
            <label htmlFor="manual-job-title" className="text-xs font-medium text-muted-foreground block mb-1.5">Role Title *</label>
            <input
              id="manual-job-title"
              value={title}
              onChange={e => setTitle(e.target.value)}
              placeholder="e.g. Senior Frontend Engineer"
              className="design-input w-full px-3 py-2 text-sm focus:outline-none"
              autoFocus
            />
          </div>
          <div>
            <label htmlFor="manual-job-company" className="text-xs font-medium text-muted-foreground block mb-1.5">Company *</label>
            <input
              id="manual-job-company"
              value={company}
              onChange={e => setCompany(e.target.value)}
              placeholder="e.g. Google"
              className="design-input w-full px-3 py-2 text-sm focus:outline-none"
            />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label htmlFor="manual-job-location" className="text-xs font-medium text-muted-foreground block mb-1.5">Location</label>
              <input
                id="manual-job-location"
                value={location}
                onChange={e => setLocation(e.target.value)}
                placeholder="e.g. Bangalore"
                className="design-input w-full px-3 py-2 text-sm focus:outline-none"
              />
            </div>
            <div>
              <label htmlFor="manual-job-portal" className="text-xs font-medium text-muted-foreground block mb-1.5">Portal</label>
              <input
                id="manual-job-portal"
                value={portal}
                onChange={e => setPortal(e.target.value)}
                placeholder="e.g. LinkedIn"
                className="design-input w-full px-3 py-2 text-sm focus:outline-none"
              />
            </div>
          </div>
          <div>
            <label htmlFor="manual-job-url" className="text-xs font-medium text-muted-foreground block mb-1.5">Job URL</label>
            <input
              id="manual-job-url"
              value={url}
              onChange={e => setUrl(e.target.value)}
              placeholder="https://..."
              className="design-input w-full px-3 py-2 text-sm focus:outline-none"
            />
          </div>
        </div>
        <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
          <button
            type="button"
            onClick={requestClose}
            className="design-button-secondary px-4 text-sm font-medium text-muted-foreground"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={!title.trim() || !company.trim() || saving}
            className="design-button-primary px-5 text-sm font-semibold disabled:opacity-50"
          >
            {saving ? 'Saving...' : 'Add job'}
          </button>
        </div>
      </form>
    </div>
  );
}

function timeAgo(date: any): string {
  if (!date) return '';
  const d = new Date(date);
  const now = new Date();
  const diff = Math.floor((now.getTime() - d.getTime()) / (1000 * 60 * 60 * 24));
  if (diff === 0) return 'Today';
  if (diff === 1) return 'Yesterday';
  if (diff < 7) return `${diff}d ago`;
  if (diff < 30) return `${Math.floor(diff / 7)}w ago`;
  return d.toLocaleDateString();
}
