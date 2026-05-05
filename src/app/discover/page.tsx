'use client';

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import {
  Activity,
  AlertCircle,
  CheckCircle2,
  Clock,
  ExternalLink,
  Loader2,
  RefreshCw,
  Search,
  Sparkles,
  XCircle,
} from 'lucide-react';
import {
  getActiveProfile,
  getDashboardData,
  getLatestScanStatus,
  getScrapingSourceHealth,
  manualImportJobUrl,
  startJobScan,
  triggerScoring,
} from './actions';
import { getOnboardingState, getSystemCapabilitiesState } from '@/app/actions';
import { RankedJobCard } from '@/components/jobs/RankedJobCard';
import { DiscoverSkeleton } from '@/components/ui/RouteSkeleton';

const DEFAULT_PORTALS = ['company_ats', 'official', 'linkedin', 'naukri', 'wellfound', 'foundit', 'indeed', 'instahyre'];

const PORTAL_NAMES: Record<string, string> = {
  linkedin: 'LinkedIn',
  naukri: 'Naukri',
  wellfound: 'Wellfound',
  foundit: 'Foundit',
  indeed: 'Indeed',
  instahyre: 'Instahyre',
  company_ats: 'Company sites',
  official: 'Company sites',
  manual_url: 'Added by you',
  google_jobs: 'Google Jobs',
};

function portalDisplayName(portal: string) {
  return PORTAL_NAMES[portal] || portal.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

function parseSourceFailure(error: string | null | undefined) {
  if (!error) return null;
  try {
    const parsed = JSON.parse(error);
    const code = String(parsed.code || 'unknown');
    const labels: Record<string, string> = {
      partial_source_failures: 'Used fallback source',
      selector_not_found: 'Source layout changed',
      timeout: 'Timed out',
      blocked: 'Blocked by source',
      auth_gate: 'Sign-in required',
      empty_results: 'No matching jobs',
      browser_error: 'Browser unavailable',
      parse_error: 'Could not read listings',
      process_interrupted: 'Interrupted process recovered',
      unknown: 'Source failed',
    };
    const fallbackLabel = typeof parsed.gracefulFallback?.label === 'string' ? parsed.gracefulFallback.label : '';
    return [
      labels[code] || 'Source failed',
      fallbackLabel,
      parsed.message ? String(parsed.message).replace(/^[a-z_]+:\s*/i, '').slice(0, 120) : '',
    ].filter(Boolean).join(' · ');
  } catch {
    return error.slice(0, 160);
  }
}

export default function DiscoverDashboard() {
  return (
    <Suspense fallback={<DiscoverSkeleton />}>
      <DiscoverDashboardContent />
    </Suspense>
  );
}

function DiscoverDashboardContent() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const searchParamQuery = searchParams.get('q') || '';
  const searchParamMode = searchParams.get('mode') === 'dream' ? 'dream' : 'keyword';
  const [profile, setProfile] = useState<any>(null);
  const [scanStatus, setScanStatus] = useState<any>(null);
  const [dashboardData, setDashboardData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [tierFilter, setTierFilter] = useState(() => searchParams.get('tier') || 'All');
  const [portalFilter, setPortalFilter] = useState(() => searchParams.get('portal') || 'All');
  const [searchQuery, setSearchQuery] = useState(() => searchParamQuery);
  const [searchMode, setSearchMode] = useState<'keyword' | 'dream'>(() => searchParamMode);
  const [working, setWorking] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const [capabilities, setCapabilities] = useState<any>(null);
  const [sourceHealth, setSourceHealth] = useState<any[]>([]);
  const [manualUrl, setManualUrl] = useState('');
  const [manualPlaceholder, setManualPlaceholder] = useState('https://www.linkedin.com/jobs/view/...');
  const [manualAnalyzeMode, setManualAnalyzeMode] = useState(false);
  const manualInputRef = useRef<HTMLInputElement | null>(null);
  const searchInputRef = useRef<HTMLInputElement | null>(null);

  const latestSearchQuery = useRef(searchQuery);
  latestSearchQuery.current = searchQuery;

  const syncSearchUrl = useCallback((next?: {
    query?: string;
    tier?: string;
    portal?: string;
    mode?: 'keyword' | 'dream';
  }) => {
    const params = new URLSearchParams(searchParams.toString());
    const queryValue = next?.query ?? searchQuery;
    const tierValue = next?.tier ?? tierFilter;
    const portalValue = next?.portal ?? portalFilter;
    const modeValue = next?.mode ?? searchMode;

    const trimmedQuery = queryValue.trim();
    if (trimmedQuery) params.set('q', trimmedQuery);
    else params.delete('q');
    if (tierValue && tierValue !== 'All') params.set('tier', tierValue);
    else params.delete('tier');
    if (portalValue && portalValue !== 'All') params.set('portal', portalValue);
    else params.delete('portal');
    if (modeValue === 'dream') params.set('mode', modeValue);
    else if (trimmedQuery) params.set('mode', 'keyword');
    else params.delete('mode');

    const nextUrl = params.toString() ? `${pathname}?${params.toString()}` : pathname;
    router.replace(nextUrl, { scroll: false });
  }, [pathname, portalFilter, router, searchMode, searchParams, searchQuery, tierFilter]);

  const loadData = useCallback(async (query = latestSearchQuery.current, mode: 'keyword' | 'dream' = searchMode) => {
    const [setup, caps, sources] = await Promise.all([
      getOnboardingState(),
      getSystemCapabilitiesState(),
      getScrapingSourceHealth().catch(() => ({ success: false, providers: [] })),
    ]);
    setCapabilities(caps);
    if (sources.success) setSourceHealth(sources.providers || []);
    if (!setup.onboardingGate?.isComplete) {
      window.location.replace('/onboarding');
      return;
    }
    const activeProfile = await getActiveProfile();
    setProfile(activeProfile);
    if (activeProfile) {
      const [status, data] = await Promise.all([
        getLatestScanStatus(activeProfile.id),
        getDashboardData(activeProfile.id, tierFilter, portalFilter, query, mode),
      ]);
      setScanStatus(status);
      setDashboardData(data);
    }
    setLoading(false);
  }, [portalFilter, searchMode, tierFilter]);

  useEffect(() => {
    loadData().catch(() => setLoading(false));
  }, [loadData]);

  useEffect(() => {
    const queryChanged = searchParamQuery !== latestSearchQuery.current;
    const modeChanged = searchParamMode !== searchMode;
    if (!queryChanged && !modeChanged) return;

    latestSearchQuery.current = searchParamQuery;
    setSearchQuery(searchParamQuery);
    if (modeChanged) setSearchMode(searchParamMode);
    loadData(searchParamQuery, searchParamMode).catch(() => setLoading(false));
  }, [loadData, searchMode, searchParamMode, searchParamQuery]);

  useEffect(() => {
    const importUrl = searchParams.get('importUrl') || '';
    const importMode = searchParams.get('importMode') || '';
    if (!importUrl) return;
    setManualUrl(importUrl);
    setManualAnalyzeMode(importMode === 'analyse');
    setManualPlaceholder(importUrl.includes('instahyre.com')
      ? 'https://www.instahyre.com/job-...'
      : 'https://www.linkedin.com/jobs/view/...');
    setActionMessage(importMode === 'analyse'
      ? 'Preview URL prefilled. Confirm the import to fetch the full description and unlock scoring.'
      : 'Job link prefilled. Confirm the import to save it with your job matches.');
    setTimeout(() => {
      manualInputRef.current?.focus();
      manualInputRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 20);
  }, [searchParams]);

  const activeScanId = scanStatus?.scan?.id ?? null;
  const activeScanStatus = scanStatus?.scan?.status ?? null;

  useEffect(() => {
    if (!profile?.id) return;
    if (!['preparing', 'scraping'].includes(activeScanStatus) && !['queued', 'running', 'processing', 'retrying'].includes(scanStatus?.activeJob?.status)) return;
    const interval = setInterval(() => {
      getLatestScanStatus(profile.id).then(setScanStatus).catch(() => undefined);
    }, 3000);
    return () => clearInterval(interval);
  }, [activeScanId, activeScanStatus, profile?.id, scanStatus?.activeJob?.status]);

  const availablePortals = useMemo(() => Object.keys(dashboardData?.stats?.portalCounts || {}), [dashboardData]);
  const activeJobStatus = scanStatus?.activeJob?.status;
  const isScanning = ['preparing', 'scraping'].includes(scanStatus?.scan?.status) || ['queued', 'running', 'processing', 'retrying'].includes(activeJobStatus);
  const browserSafeMode = capabilities?.has_browser === false;
  const aiLimited = capabilities?.has_ai_provider === false || capabilities?.safe_modes?.ai_generation_limited === true;

  const handleScan = async () => {
    if (!profile) return;
    setWorking('scan');
    setActionError(null);
    try {
      const portals = profile.preferredPortals ? JSON.parse(profile.preferredPortals) : DEFAULT_PORTALS;
      const response = await startJobScan(profile.id, portals);
      setActionMessage(response.message || 'Scan queued.');
      await loadData();
    } catch (error: any) {
      setActionError(error?.message || 'Could not start the scan.');
    } finally {
      setWorking(null);
    }
  };

  const handleManualImport = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!profile || !manualUrl.trim()) return;
    setWorking('manual-import');
    setActionError(null);
    setActionMessage(null);
    try {
      const res = await manualImportJobUrl(profile.id, manualUrl, {
        requireFullDescription: manualAnalyzeMode,
      });
      if (!res.success) throw new Error(res.error || 'Could not import this URL.');
      setActionMessage(res.message || 'Manual URL imported.');
      setManualUrl('');
      setManualAnalyzeMode(false);
      await loadData();
      const params = new URLSearchParams(searchParams.toString());
      params.delete('importUrl');
      params.delete('importMode');
      const nextUrl = params.toString() ? `${pathname}?${params.toString()}` : pathname;
      router.replace(nextUrl, { scroll: false });
    } catch (error: any) {
      setActionError(error?.message || 'Could not import this URL.');
    } finally {
      setWorking(null);
    }
  };

  const focusManualImportFor = (portal: string) => {
    const normalized = portal.toLowerCase();
    setManualPlaceholder(normalized === 'instahyre'
      ? 'https://www.instahyre.com/job-...'
      : 'https://www.linkedin.com/jobs/view/...');
    manualInputRef.current?.focus();
    manualInputRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  };

  const handleScore = async () => {
    setWorking('score');
    setActionError(null);
    try {
      await triggerScoring();
      await loadData();
    } catch (error: any) {
      setActionError(error?.message || 'Could not score jobs.');
    } finally {
      setWorking(null);
    }
  };

  const handleSearch = async (event: React.FormEvent) => {
    event.preventDefault();
    setWorking('search');
    setActionError(null);
    try {
      syncSearchUrl({ query: searchQuery });
      await loadData(searchQuery);
    } catch (error: any) {
      setActionError(error?.message || 'Could not search jobs.');
    } finally {
      setWorking(null);
    }
  };

  if (loading) {
    return <DiscoverSkeleton />;
  }

  return (
    <div className="space-y-7 pb-16">
      <header className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="design-label">Jobs</p>
          <h1 className="mt-2 max-w-4xl font-display text-3xl font-semibold leading-tight md:text-4xl">Find jobs that fit your resume</h1>
          <p className="mt-3 max-w-3xl text-muted-foreground">
            Search across sources, paste any job link, and prepare from the strongest resume-based matches first.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            onClick={handleScan}
            disabled={!profile || isScanning || Boolean(working)}
            className="design-button-secondary px-4 text-sm font-semibold disabled:opacity-50"
          >
            {working === 'scan' || isScanning ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            {isScanning ? 'Refreshing...' : 'Refresh sources'}
          </button>
          <button
            onClick={handleScore}
            disabled={isScanning || Boolean(working)}
            className="design-button-primary px-4 text-sm font-semibold disabled:opacity-50"
          >
            {working === 'score' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
            Refresh matches
          </button>
        </div>
      </header>

      {actionError && (
        <div className="rounded-apple border border-danger-border bg-danger-bg px-4 py-3 text-sm font-medium text-danger" role="alert">
          {actionError}
        </div>
      )}

      {actionMessage && (
        <div className="rounded-apple border border-success-border bg-success-bg px-4 py-3 text-sm font-medium text-success" role="status">
          {actionMessage}
        </div>
      )}

      {(browserSafeMode || aiLimited) && (
        <section className="rounded-apple border border-warning-border bg-warning-bg p-5 text-sm text-warning">
          {browserSafeMode && (
            <div className="space-y-3">
              <p className="font-semibold">Some sources may need a pasted job link today.</p>
              <p>Career Seek can still search available sources and will keep useful saved results visible.</p>
            </div>
          )}
          {aiLimited && (
            <p className={browserSafeMode ? 'mt-3 border-t border-warning-border pt-3' : ''}>
              AI is not connected yet. Fit scores stay local, and guidance will clearly say when it is using a saved or local estimate.
            </p>
          )}
        </section>
      )}

      <section className="apple-card p-5">
        <div className="mb-4 flex items-center gap-3">
          <ExternalLink className="h-5 w-5 text-primary" />
          <div>
            <h2 className="font-semibold">Paste a job link</h2>
            <p className="text-sm text-muted-foreground">Drop in a LinkedIn, Naukri, ATS, or company role and Career Seek will fetch it, score it, and keep it with your matches.</p>
          </div>
        </div>
        {manualAnalyzeMode && (
          <div className="mb-3 rounded-apple border border-warning-border bg-warning-bg px-4 py-3 text-sm text-warning">
            This preview needs the original source page before Career Seek can build a reliable application plan.
          </div>
        )}
        <form onSubmit={handleManualImport} className="flex flex-col gap-2 md:flex-row">
          <input
            ref={manualInputRef}
            aria-label="Manual job URL"
            value={manualUrl}
            onChange={(event) => {
              setManualUrl(event.target.value);
              if (!event.target.value.trim()) setManualAnalyzeMode(false);
            }}
            placeholder={manualPlaceholder}
            className="design-input flex-1 px-4 text-sm outline-none focus:border-primary"
          />
          <button
            type="submit"
            disabled={!manualUrl.trim() || working === 'manual-import'}
            className="design-button-primary px-4 text-sm font-semibold disabled:opacity-50"
          >
            {working === 'manual-import' ? <Loader2 className="h-4 w-4 animate-spin" /> : manualAnalyzeMode ? 'Build application plan' : 'Add job link'}
          </button>
        </form>
      </section>

      <div className="surface-grid grid gap-4 md:grid-cols-4">
        <div className="apple-card metric-card p-5">
          <p className="text-sm font-semibold text-muted-foreground">Jobs found</p>
          <p className="mt-2 font-display text-4xl font-semibold leading-none">{dashboardData?.stats?.total || 0}</p>
          <p className="mt-1 text-xs text-muted-foreground">scored &amp; ready to review</p>
        </div>
        <button
          type="button"
          onClick={() => { setTierFilter('A'); syncSearchUrl({ tier: 'A' }); }}
          className="apple-card metric-card p-5 text-left transition hover:border-success-border hover:shadow-golden-sm"
        >
          <p className="text-sm font-semibold text-success">Top matches</p>
          <p className="mt-2 font-display text-4xl font-semibold leading-none text-success">{dashboardData?.stats?.tierCounts?.A || 0}</p>
          <p className="mt-1 text-xs text-muted-foreground">strong fit with your profile</p>
        </button>
        <button
          type="button"
          onClick={() => { setTierFilter('B'); syncSearchUrl({ tier: 'B' }); }}
          className="apple-card metric-card p-5 text-left transition hover:shadow-golden-sm"
        >
          <p className="text-sm font-semibold text-primary">Good matches</p>
          <p className="mt-2 font-display text-4xl font-semibold leading-none">{dashboardData?.stats?.tierCounts?.B || 0}</p>
          <p className="mt-1 text-xs text-muted-foreground">solid overlap with your background</p>
        </button>
        <div className="apple-card metric-card p-5">
          <p className="text-sm font-semibold text-muted-foreground">Worth a look</p>
          <p className="mt-2 font-display text-4xl font-semibold leading-none">
            {(dashboardData?.stats?.tierCounts?.C || 0) + (dashboardData?.stats?.tierCounts?.D || 0)}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">lower overlap, still worth checking</p>
        </div>
      </div>

      <details className="apple-card p-5">
        <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 text-sm font-semibold text-foreground [&::-webkit-details-marker]:hidden">
          <div>
            <h2 className="font-semibold">System details</h2>
            <p className="text-sm font-normal text-muted-foreground">Source availability is here if you need to troubleshoot. Normal job search keeps working with fallbacks.</p>
          </div>
          <span className="rounded-full border border-card-border px-3 py-1 text-xs text-muted-foreground">Advanced</span>
        </summary>
        <div className="mt-4 flex items-center justify-between gap-3">
          <p className="text-sm font-semibold">Job source providers</p>
          <button
            onClick={() => getScrapingSourceHealth().then((res) => res.success && setSourceHealth(res.providers || [])).catch(() => undefined)}
            className="design-button-secondary px-3 text-xs font-semibold"
            type="button"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            Check
          </button>
        </div>
        <div className="mt-3 grid gap-3 md:grid-cols-3">
          {sourceHealth.map((provider) => (
            <div key={provider.id} className="rounded-apple border border-card-border bg-surface-container-low p-3">
              <div className="flex items-center gap-2">
                {provider.available ? <CheckCircle2 className="h-4 w-4 text-success" /> : <AlertCircle className="h-4 w-4 text-warning" />}
                <p className="font-semibold">{provider.label}</p>
              </div>
              <p className="mt-2 text-xs text-muted-foreground">
                {(provider.portals || []).join(', ') || 'No mapped portals'}
              </p>
              {!provider.available && (
                <p className="mt-2 text-xs text-warning">{provider.message || 'Unavailable locally; fallback providers will be tried.'}</p>
              )}
            </div>
          ))}
        </div>
      </details>

      <form onSubmit={handleSearch} className="apple-card flex flex-col gap-3 p-3 lg:flex-row lg:items-center">
        <div className="flex shrink-0 rounded-apple border border-card-border bg-surface-container p-1">
          <button
            type="button"
            onClick={() => {
              setSearchMode('keyword');
              syncSearchUrl({ mode: 'keyword' });
            }}
            className={`inline-flex min-h-11 items-center gap-2 rounded-sharp px-3 text-xs font-bold transition ${searchMode === 'keyword' ? 'bg-surface text-foreground shadow-golden-sm' : 'text-muted-foreground hover:text-foreground'}`}
          >
            <Search className="h-4 w-4" />
            Keyword search
          </button>
          <button
            type="button"
            onClick={() => {
              setSearchMode('dream');
              syncSearchUrl({ mode: 'dream' });
            }}
            className={`inline-flex min-h-11 items-center gap-2 rounded-sharp px-3 text-xs font-bold transition ${searchMode === 'dream' ? 'bg-surface text-foreground shadow-golden-sm' : 'text-muted-foreground hover:text-foreground'}`}
          >
            <Sparkles className="h-4 w-4" />
            Describe ideal role
          </button>
        </div>
        <div className="flex flex-1 items-center gap-3 rounded-apple bg-surface-container px-4">
          <Search className="h-5 w-5 text-muted-foreground" />
          <input
            id="discover-search"
            ref={searchInputRef}
            type="search"
            aria-label="Search ranked jobs"
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
            placeholder={searchMode === 'dream' ? 'Describe the role you want: AI PM owning search, remote-friendly, strong analytics...' : 'Search across results: startup PM in Bangalore, remote AI roles, salary above 25 LPA...'}
            className="min-h-12 flex-1 bg-transparent text-sm outline-none"
          />
        </div>
        <div className="flex flex-wrap gap-2">
          <select
            aria-label="Filter by match strength"
            value={tierFilter}
            onChange={(event) => {
              const value = event.target.value;
              setTierFilter(value);
              syncSearchUrl({ tier: value });
            }}
            className="design-input px-4 text-sm font-semibold"
          >
            <option value="All">All matches</option>
            <option value="A">Top matches only</option>
            <option value="B">Good matches</option>
            <option value="C">Decent fits</option>
            <option value="D">Other listings</option>
          </select>
          <select
            aria-label="Filter by job source"
            value={portalFilter}
            onChange={(event) => {
              const value = event.target.value;
              setPortalFilter(value);
              syncSearchUrl({ portal: value });
            }}
            className="design-input px-4 text-sm font-semibold"
          >
            <option value="All">All sources</option>
            {availablePortals.map((portal) => <option key={portal} value={portal}>{portalDisplayName(portal)}</option>)}
          </select>
          <button type="submit" disabled={working === 'search'} className="design-button-primary px-5 text-sm font-semibold disabled:opacity-50">
            {working === 'search' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
            Search
          </button>
        </div>
      </form>

      {dashboardData?.searchMeta && searchQuery && (
        <div className="flex flex-wrap items-center gap-2 text-xs font-semibold text-muted-foreground">
          <span className="design-chip px-3 py-1">
            {dashboardData.searchMeta.mode === 'dream' ? 'Ideal role search' : 'Keyword search'} found {dashboardData.searchMeta.matched} job{dashboardData.searchMeta.matched === 1 ? '' : 's'}
          </span>
          <span className="design-chip px-3 py-1">
            {dashboardData.searchMeta.backend === 'meilisearch' ? 'Fresh local index' : 'Saved local results'}
          </span>
        </div>
      )}

      {!profile && (
        <div className="apple-card p-8 text-center">
          <AlertCircle className="mx-auto h-8 w-8 text-primary" />
          <h2 className="mt-3 text-xl font-semibold">Search preferences are missing</h2>
          <p className="mt-2 text-muted-foreground">Complete onboarding or add preferences in Settings to scan jobs.</p>
        </div>
      )}

      <section className="space-y-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="text-2xl font-semibold">
              {tierFilter === 'All'
                ? 'All your job matches'
                : tierFilter === 'A'
                  ? 'Top matches'
                  : tierFilter === 'B'
                    ? 'Good matches'
                    : tierFilter === 'C'
                      ? 'Decent fits'
                      : 'Other listings'}
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Sorted by how well each role fits your resume — {dashboardData?.jobs?.length || 0} showing
              {tierFilter !== 'All' && (
                <button type="button" onClick={() => { setTierFilter('All'); syncSearchUrl({ tier: 'All' }); }} className="ml-2 text-primary underline-offset-2 hover:underline">
                  Show all
                </button>
              )}
            </p>
          </div>
        </div>
        {(dashboardData?.jobs || []).length ? (
          dashboardData.jobs.map((item: any) => <RankedJobCard key={item.scoredJob.id} item={item} capabilities={capabilities} />)
        ) : (
          <div className="apple-card p-10 text-center">
            <Search className="mx-auto h-10 w-10 text-muted-foreground" />
            <h2 className="mt-4 text-xl font-semibold">No matching jobs yet</h2>
            <p className="mt-2 text-muted-foreground">Refresh matches, broaden your search, add target companies, or paste a job link to bring roles here.</p>
          </div>
        )}
      </section>

      {scanStatus?.scan && (
        <details className="apple-card p-5">
          <summary className="flex min-h-11 cursor-pointer list-none flex-col gap-3 md:flex-row md:items-center md:justify-between [&::-webkit-details-marker]:hidden">
            <div className="flex items-center gap-3">
              <Activity className={`h-5 w-5 text-primary ${isScanning ? 'animate-pulse' : ''}`} />
              <div>
                <h2 className="font-semibold">Source reliability details</h2>
                <p className="text-sm text-muted-foreground">
                  Latest scan: {new Date(scanStatus.scan.finishedAt || scanStatus.scan.startedAt).toLocaleString('en-IN')} · {scanStatus.scan.status}
                </p>
              </div>
            </div>
            {isScanning && <p className="text-sm font-bold text-primary">{scanStatus.progress || 0}%</p>}
          </summary>
          {isScanning && (
            <div className="mb-4 h-2 overflow-hidden rounded-sharp bg-surface-container">
              <div className="h-full bg-primary" style={{ width: `${scanStatus.progress || 0}%` }} />
            </div>
          )}
          <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {(scanStatus.portalRuns || []).map((run: any) => {
              const sourceFailure = parseSourceFailure(run.error);
              const portalName = String(run.portal || '').toLowerCase();
              const showManualShortcut = ['linkedin', 'instahyre'].includes(portalName) && (
                run.status === 'failed' ||
                /blocked|sign-in|required|timed out|unavailable|fallback/i.test(sourceFailure || '')
              );
              return (
                <div key={run.id} className="rounded-apple border border-card-border bg-surface-container-low p-3">
                  <div className="flex items-center gap-2">
                    {run.status === 'complete' ? <CheckCircle2 className="h-4 w-4 text-success" /> : run.status === 'failed' ? <XCircle className="h-4 w-4 text-danger" /> : <Clock className="h-4 w-4 text-primary" />}
                    <p className="font-semibold capitalize">{run.portal}</p>
                  </div>
                  <p className="mt-1 text-sm text-muted-foreground">{run.status === 'failed' ? sourceFailure || 'Failed' : `${run.jobsFound || 0} jobs found`}</p>
                  {showManualShortcut && (
                    <button
                      type="button"
                      onClick={() => focusManualImportFor(portalName)}
                      className="mt-3 inline-flex min-h-10 items-center gap-2 rounded-sharp border border-card-border bg-surface px-3 text-xs font-bold text-foreground transition hover:border-primary"
                    >
                      <ExternalLink className="h-3.5 w-3.5" />
                      {portalName === 'linkedin' ? 'Paste LinkedIn URL' : 'Paste Instahyre URL'}
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </details>
      )}
    </div>
  );
}
