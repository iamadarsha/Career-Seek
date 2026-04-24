'use client';

/**
 * Pipeline — Phase G
 * 
 * Career CRM board + list views with filters, search, and management.
 * Apple HIG-aligned calm operations console.
 */

import { useState, useEffect, useCallback, useTransition } from 'react';
import Link from 'next/link';
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

const STATUS_CONFIG: Record<string, { label: string; color: string; bg: string; icon: any }> = {
  saved: { label: 'Saved', color: '#86868B', bg: 'rgba(134,134,139,0.1)', icon: Star },
  preparing: { label: 'Preparing', color: '#FF9500', bg: 'rgba(255,149,0,0.1)', icon: Clock },
  applied: { label: 'Applied', color: '#007AFF', bg: 'rgba(0,122,255,0.1)', icon: Send },
  follow_up_due: { label: 'Follow-up', color: '#FF3B30', bg: 'rgba(255,59,48,0.1)', icon: Bell },
  recruiter_replied: { label: 'Replied', color: '#34C759', bg: 'rgba(52,199,89,0.1)', icon: MessageSquare },
  interview_scheduled: { label: 'Interview', color: '#AF52DE', bg: 'rgba(175,82,222,0.1)', icon: CalendarDays },
  interviewed: { label: 'Interviewed', color: '#5856D6', bg: 'rgba(88,86,214,0.1)', icon: CheckCircle2 },
  assessment: { label: 'Assessment', color: '#FF9500', bg: 'rgba(255,149,0,0.1)', icon: Eye },
  offer: { label: 'Offer', color: '#34C759', bg: 'rgba(52,199,89,0.1)', icon: TrendingUp },
  rejected: { label: 'Rejected', color: '#FF3B30', bg: 'rgba(255,59,48,0.1)', icon: X },
  archived: { label: 'Archived', color: '#8E8E93', bg: 'rgba(142,142,147,0.1)', icon: Archive },
};

const BOARD_COLUMNS = ['saved', 'preparing', 'applied', 'follow_up_due', 'recruiter_replied', 'interview_scheduled', 'interviewed', 'offer'];

type ViewMode = 'board' | 'list';

export default function PipelinePage() {
  const [apps, setApps] = useState<any[]>([]);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [view, setView] = useState<ViewMode>('board');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('');
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

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-3xl font-semibold tracking-tight">Pipeline</h2>
          <p className="text-muted-foreground mt-1">
            {totalActive} active application{totalActive !== 1 ? 's' : ''}
            {dashboard?.overdueReminders > 0 && (
              <span className="text-red-500 ml-2">• {dashboard.overdueReminders} overdue</span>
            )}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setView('board')}
            className={`p-2 rounded-apple transition-colors ${view === 'board' ? 'bg-primary/10 text-primary' : 'text-muted-foreground hover:text-foreground'}`}
            title="Board view"
          >
            <LayoutGrid className="w-5 h-5" />
          </button>
          <button
            onClick={() => setView('list')}
            className={`p-2 rounded-apple transition-colors ${view === 'list' ? 'bg-primary/10 text-primary' : 'text-muted-foreground hover:text-foreground'}`}
            title="List view"
          >
            <List className="w-5 h-5" />
          </button>
          <button
            onClick={() => setShowAdd(true)}
            className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-apple text-sm font-medium hover:bg-primary-hover transition-colors shadow-sm"
          >
            <Plus className="w-4 h-4" />
            Track Job
          </button>
        </div>
      </div>

      {/* Summary cards */}
      {dashboard && (
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
          {[
            { label: 'This Week', value: dashboard.applicationsThisWeek, color: '#007AFF' },
            { label: 'Due Today', value: dashboard.followUpsDueToday, color: dashboard.followUpsDueToday > 0 ? '#FF3B30' : '#86868B' },
            { label: 'Interviews', value: dashboard.interviewsUpcoming, color: '#AF52DE' },
            { label: 'Saved', value: dashboard.savedNotApplied, color: '#FF9500' },
            { label: 'Stale', value: dashboard.staleApplications, color: '#FF3B30' },
            { label: 'Total', value: dashboard.totalApplications, color: '#34C759' },
          ].map(card => (
            <div key={card.label} className="bg-card border border-card-border rounded-apple p-4 shadow-sm">
              <p className="text-xs font-medium text-muted-foreground">{card.label}</p>
              <p className="text-2xl font-semibold mt-1" style={{ color: card.color }}>{card.value}</p>
            </div>
          ))}
        </div>
      )}

      {/* Search and filters */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[200px] max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input
            type="text"
            placeholder="Search applications..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full pl-10 pr-4 py-2 bg-card border border-card-border rounded-apple text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
          />
        </div>
        <button
          onClick={() => setShowFilters(!showFilters)}
          className={`flex items-center gap-2 px-3 py-2 rounded-apple text-sm border transition-colors ${showFilters ? 'border-primary text-primary bg-primary/5' : 'border-card-border text-muted-foreground hover:text-foreground'}`}
        >
          <Filter className="w-4 h-4" />
          Filters
          {(statusFilter || companyFilter) && (
            <span className="w-2 h-2 rounded-full bg-primary" />
          )}
        </button>
      </div>

      {/* Filters panel */}
      {showFilters && (
        <div className="bg-card border border-card-border rounded-apple p-4 shadow-sm flex items-center gap-4 flex-wrap animate-in fade-in slide-in-from-top-2 duration-200">
          <select
            value={statusFilter}
            onChange={e => setStatusFilter(e.target.value)}
            className="px-3 py-2 bg-background border border-card-border rounded-apple text-sm"
          >
            <option value="">All Statuses</option>
            {Object.entries(STATUS_CONFIG).map(([key, cfg]) => (
              <option key={key} value={key}>{cfg.label} ({counts[key] || 0})</option>
            ))}
          </select>
          <select
            value={companyFilter}
            onChange={e => setCompanyFilter(e.target.value)}
            className="px-3 py-2 bg-background border border-card-border rounded-apple text-sm"
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
        <div className="overflow-x-auto pb-4 -mx-2">
          <div className="flex gap-4 px-2 min-w-max">
            {BOARD_COLUMNS.map(status => {
              const cfg = STATUS_CONFIG[status];
              const columnApps = apps.filter(a => a.status === status);
              return (
                <div key={status} className="w-72 flex-shrink-0">
                  {/* Column header */}
                  <div className="flex items-center justify-between mb-3 px-1">
                    <div className="flex items-center gap-2">
                      <div className="w-2 h-2 rounded-full" style={{ backgroundColor: cfg.color }} />
                      <span className="text-sm font-medium">{cfg.label}</span>
                    </div>
                    <span className="text-xs text-muted-foreground bg-muted/50 px-2 py-0.5 rounded-full">
                      {columnApps.length}
                    </span>
                  </div>
                  {/* Cards */}
                  <div className="space-y-2 min-h-[100px]">
                    {columnApps.length === 0 ? (
                      <div className="border border-dashed border-card-border rounded-apple p-6 text-center">
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
      )}

      {/* List View */}
      {view === 'list' && (
        <div className="bg-card border border-card-border rounded-apple-lg shadow-sm overflow-hidden">
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
            setShowAdd(false);
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
        <div className="bg-card border border-card-border rounded-apple p-3.5 shadow-sm hover:shadow-apple-hover transition-all hover:-translate-y-0.5 cursor-pointer group">
          <div className="flex items-start justify-between mb-2">
            <h4 className="text-sm font-medium leading-tight line-clamp-2 group-hover:text-primary transition-colors">
              {app.title}
            </h4>
            {app.priority === 'high' && (
              <Star className="w-3.5 h-3.5 text-amber-500 flex-shrink-0 ml-1" fill="currentColor" />
            )}
          </div>
          <p className="text-xs text-muted-foreground flex items-center gap-1 mb-2">
            <Building2 className="w-3 h-3" />
            {app.company}
          </p>
          <div className="flex items-center justify-between">
            {app.scoreSnapshot && (
              <span className="text-xs font-medium" style={{ color: app.scoreSnapshot >= 75 ? '#34C759' : app.scoreSnapshot >= 50 ? '#FF9500' : '#86868B' }}>
                {app.scoreSnapshot}%
              </span>
            )}
            <span className="text-[10px] text-muted-foreground">{timeAgo(app.updatedAt)}</span>
          </div>
          {app.nextFollowUpAt && new Date(app.nextFollowUpAt) <= new Date() && (
            <div className="mt-2 flex items-center gap-1 text-[10px] text-red-500">
              <Bell className="w-3 h-3" />
              Follow-up overdue
            </div>
          )}
        </div>
      </Link>
    );
  }

  return (
    <div className="flex items-center p-4 hover:bg-black/[0.02] dark:hover:bg-white/[0.02] transition-colors group">
      {/* Status dot */}
      <div className="w-8 flex-shrink-0">
        <div className="w-3 h-3 rounded-full" style={{ backgroundColor: cfg.color }} title={cfg.label} />
      </div>

      {/* Main content */}
      <Link href={`/pipeline/${app.id}`} className="flex-1 min-w-0 mr-4">
        <div className="flex items-center gap-3">
          <div className="flex-1 min-w-0">
            <h4 className="text-sm font-medium truncate group-hover:text-primary transition-colors">{app.title}</h4>
            <div className="flex items-center gap-3 mt-0.5">
              <span className="text-xs text-muted-foreground flex items-center gap-1">
                <Building2 className="w-3 h-3" />
                {app.company}
              </span>
              {app.location && (
                <span className="text-xs text-muted-foreground flex items-center gap-1">
                  <MapPin className="w-3 h-3" />
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
      <div className="w-16 text-center flex-shrink-0">
        {app.scoreSnapshot ? (
          <span className="text-sm font-medium" style={{
            color: app.scoreSnapshot >= 75 ? '#34C759' : app.scoreSnapshot >= 50 ? '#FF9500' : '#86868B'
          }}>
            {app.scoreSnapshot}%
          </span>
        ) : (
          <span className="text-xs text-muted-foreground">—</span>
        )}
      </div>

      {/* Status badge */}
      <div className="w-32 flex-shrink-0 relative">
        <button
          onClick={() => setShowStatusMenu(!showStatusMenu)}
          className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium transition-colors"
          style={{ backgroundColor: cfg.bg, color: cfg.color }}
        >
          <StatusIcon className="w-3 h-3" />
          {cfg.label}
          <ChevronDown className="w-3 h-3" />
        </button>
        {showStatusMenu && (
          <div className="absolute right-0 top-8 z-50 bg-card border border-card-border rounded-apple shadow-lg py-1 w-48 animate-in fade-in slide-in-from-top-2 duration-150">
            {Object.entries(STATUS_CONFIG).map(([key, c]) => {
              const Icon = c.icon;
              return (
                <button
                  key={key}
                  onClick={() => { onStatusChange(app.id, key); setShowStatusMenu(false); }}
                  className={`w-full flex items-center gap-2 px-3 py-1.5 text-xs hover:bg-black/5 dark:hover:bg-white/5 ${key === app.status ? 'font-medium' : ''}`}
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
      <div className="w-24 text-right flex-shrink-0">
        <span className="text-xs text-muted-foreground">{timeAgo(app.updatedAt)}</span>
      </div>

      {/* Actions */}
      <div className="w-8 flex-shrink-0 text-right">
        {app.url && (
          <a href={app.url} target="_blank" rel="noopener" className="text-muted-foreground hover:text-primary">
            <ExternalLink className="w-3.5 h-3.5" />
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
      <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-primary/10 flex items-center justify-center">
        <Briefcase className="w-8 h-8 text-primary" />
      </div>
      <h3 className="text-lg font-medium mb-2">No applications yet</h3>
      <p className="text-sm text-muted-foreground max-w-sm mx-auto mb-6">
        Start tracking your job applications here. Score jobs in Discover, then add them to your pipeline.
      </p>
      <button
        onClick={onAdd}
        className="inline-flex items-center gap-2 px-5 py-2.5 bg-primary text-primary-foreground rounded-apple text-sm font-medium hover:bg-primary-hover transition-colors shadow-sm"
      >
        <Plus className="w-4 h-4" />
        Track Your First Job
      </button>
    </div>
  );
}

// ── Add Application Modal ────────────────────────────────────────────────

function AddApplicationModal({ onClose, onSave }: {
  onClose: () => void;
  onSave: (data: any) => Promise<void>;
}) {
  const [title, setTitle] = useState('');
  const [company, setCompany] = useState('');
  const [location, setLocation] = useState('');
  const [url, setUrl] = useState('');
  const [portal, setPortal] = useState('');
  const [saving, setSaving] = useState(false);

  const handleSubmit = async () => {
    if (!title.trim() || !company.trim()) return;
    setSaving(true);
    await onSave({ title: title.trim(), company: company.trim(), location, url, portal });
    setSaving(false);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm animate-in fade-in duration-200" onClick={onClose}>
      <div className="bg-card border border-card-border rounded-apple-lg shadow-xl p-6 w-full max-w-md animate-in zoom-in-95 slide-in-from-bottom-4 duration-300" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-5">
          <h3 className="text-lg font-medium">Track a Job</h3>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground p-1">
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="space-y-4">
          <div>
            <label className="text-xs font-medium text-muted-foreground block mb-1.5">Role Title *</label>
            <input
              value={title}
              onChange={e => setTitle(e.target.value)}
              placeholder="e.g. Senior Frontend Engineer"
              className="w-full px-3 py-2 bg-background border border-card-border rounded-apple text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
              autoFocus
            />
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground block mb-1.5">Company *</label>
            <input
              value={company}
              onChange={e => setCompany(e.target.value)}
              placeholder="e.g. Google"
              className="w-full px-3 py-2 bg-background border border-card-border rounded-apple text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-muted-foreground block mb-1.5">Location</label>
              <input
                value={location}
                onChange={e => setLocation(e.target.value)}
                placeholder="e.g. Bangalore"
                className="w-full px-3 py-2 bg-background border border-card-border rounded-apple text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground block mb-1.5">Portal</label>
              <input
                value={portal}
                onChange={e => setPortal(e.target.value)}
                placeholder="e.g. LinkedIn"
                className="w-full px-3 py-2 bg-background border border-card-border rounded-apple text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
              />
            </div>
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground block mb-1.5">Job URL</label>
            <input
              value={url}
              onChange={e => setUrl(e.target.value)}
              placeholder="https://..."
              className="w-full px-3 py-2 bg-background border border-card-border rounded-apple text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
            />
          </div>
        </div>
        <div className="flex justify-end gap-3 mt-6">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={!title.trim() || !company.trim() || saving}
            className="px-5 py-2 bg-primary text-primary-foreground rounded-apple text-sm font-medium hover:bg-primary-hover transition-colors disabled:opacity-50 shadow-sm"
          >
            {saving ? 'Saving...' : 'Track Job'}
          </button>
        </div>
      </div>
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
