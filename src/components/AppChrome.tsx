'use client';

import { type FormEvent, useState } from 'react';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { Bot, ChevronDown, Search, Settings, Sparkles } from 'lucide-react';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { SystemStatusPanel } from '@/components/SystemStatusPanel';
import { BrandMark } from '@/components/BrandMark';
import { appNavItems } from '@/components/Sidebar';
import { MotionEnhancer } from '@/components/MotionEnhancer';
import { ProfileSwitcher } from '@/components/ProfileSwitcher';

const JobMonitor = dynamic(() => import('@/components/jobs/JobMonitor').then((mod) => mod.JobMonitor), {
  ssr: false,
});

const OnboardingRouteGuard = dynamic(
  () => import('@/components/OnboardingRouteGuard').then((mod) => mod.OnboardingRouteGuard),
  { ssr: false },
);

function isOnboardingPath(pathname: string) {
  return pathname === '/onboarding' || pathname.startsWith('/onboarding/');
}

function isActive(pathname: string, href: string) {
  if (href === '/') return pathname === '/' || pathname === '/today';
  return pathname === href || pathname.startsWith(`${href}/`);
}

const routeStripItems = [
  ...appNavItems,
  { name: 'Settings', href: '/settings', icon: Settings, hint: 'Profile, AI, advanced' },
];

function ChromeSearchForm({
  variant = 'header',
}: {
  variant?: 'header' | 'sidebar';
}) {
  const router = useRouter();
  const [query, setQuery] = useState('');
  const isSidebar = variant === 'sidebar';

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const trimmed = String(formData.get('q') ?? query).trim();
    if (!trimmed) {
      router.push('/discover');
      return;
    }
    const params = new URLSearchParams({ q: trimmed, mode: 'keyword' });
    router.push(`/discover?${params.toString()}`);
  };

  return (
    <form
      role="search"
      aria-label={isSidebar ? 'Search jobs from sidebar' : 'Search roles, companies, and skills'}
      action="/discover"
      method="get"
      onSubmit={handleSubmit}
      className={
        isSidebar
          ? 'mt-6 flex min-h-14 items-center gap-3 rounded-full border border-card-border bg-white px-4 text-sm font-semibold text-foreground shadow-golden-sm transition focus-within:border-primary focus-within:shadow-golden hover:border-foreground hover:shadow-golden'
          : 'hidden h-12 min-w-0 max-w-[34rem] flex-1 items-center gap-3 rounded-full border border-card-border bg-white px-4 text-sm font-semibold text-foreground shadow-golden-sm transition focus-within:border-primary focus-within:shadow-golden hover:border-foreground hover:shadow-golden md:flex'
      }
    >
      <Search className="h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
      <input
        name="q"
        type="search"
        aria-label={isSidebar ? 'Search jobs' : 'Search roles, companies, skills'}
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        placeholder={isSidebar ? 'Search jobs' : 'Search roles, companies, skills'}
        className="min-w-0 flex-1 bg-transparent text-sm font-semibold text-foreground outline-none placeholder:text-foreground"
      />
      <input type="hidden" name="mode" value="keyword" />
      <button
        type="submit"
        className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary text-white transition hover:scale-105 hover:bg-primary-hover"
        aria-label={isSidebar ? 'Submit sidebar job search' : 'Submit global job search'}
      >
        <Sparkles className="h-4 w-4" aria-hidden="true" />
      </button>
    </form>
  );
}

function FloatingActionDock({ pathname }: { pathname: string }) {
  const isCoach = isActive(pathname, '/coach');

  return (
    <div
      data-floating-dock
      className="pointer-events-none fixed bottom-[calc(1rem+env(safe-area-inset-bottom))] right-4 z-40 flex w-[calc(100vw-2rem)] max-w-[24rem] flex-col items-end gap-3 sm:bottom-6 sm:right-6 sm:w-96"
    >
      <JobMonitor />
      <Link
        href="/coach"
        aria-label="Open AI Coach"
        title="Open AI Coach"
        aria-current={isCoach ? 'page' : undefined}
        className={`pointer-events-auto inline-flex h-14 w-14 items-center justify-center rounded-full border shadow-golden transition hover:-translate-y-0.5 hover:shadow-ink ${
          isCoach
            ? 'border-foreground bg-foreground text-white'
            : 'border-primary bg-primary text-white hover:bg-primary-hover'
        }`}
      >
        <Bot className="h-6 w-6" aria-hidden="true" />
      </Link>
    </div>
  );
}

export function AppChrome({
  children,
  dataDirLabel = '~/.jobhunt-india',
}: {
  children: React.ReactNode;
  dataDirLabel?: string;
}) {
  const pathname = usePathname();
  const isOnboarding = isOnboardingPath(pathname);

  if (isOnboarding) {
    return <ErrorBoundary>{children}</ErrorBoundary>;
  }

  return (
    <>
      <OnboardingRouteGuard />
      <MotionEnhancer />
      <div className="market-shell lg:grid lg:grid-cols-[18rem_minmax(0,1fr)]">
        <div className="ambient-shader" aria-hidden="true" />
        <aside className="sticky top-0 z-20 hidden h-screen flex-col border-r border-card-border bg-white/92 px-4 py-5 backdrop-blur-xl lg:flex">
          <Link href="/" className="flex min-w-0 items-center gap-3 rounded-[1rem] px-2 py-2 transition hover:bg-surface-low" aria-label="Career Seek home">
            <BrandMark className="h-11 w-11" />
            <div className="min-w-0">
              <p className="text-base font-semibold leading-none tracking-normal text-foreground">Career Seek</p>
              <p className="mt-1 truncate text-xs font-medium text-muted-foreground">AI job search copilot</p>
            </div>
          </Link>

          <ChromeSearchForm variant="sidebar" />

          <nav aria-label="Primary sections" className="mt-6 flex-1 space-y-1 overflow-y-auto pr-1 no-scrollbar">
            {routeStripItems.map((item) => {
              const Icon = item.icon;
              const active = isActive(pathname, item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`group relative flex min-h-14 items-center gap-3 rounded-[1rem] px-3 py-2.5 text-sm transition ${
                    active ? 'bg-surface-container text-foreground' : 'text-muted-foreground hover:bg-surface-low hover:text-foreground'
                  }`}
                >
                  {active && <span className="absolute bottom-3 left-0 top-3 w-1 rounded-full bg-primary" aria-hidden="true" />}
                  <span
                    className={`inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${
                      active ? 'bg-white text-primary shadow-golden-sm' : 'bg-transparent text-muted-foreground group-hover:bg-white group-hover:text-foreground'
                    }`}
                  >
                    <Icon className="h-4 w-4" />
                  </span>
                  <span className="min-w-0">
                    <span className="block truncate font-semibold leading-tight">{item.name}</span>
                    <span className={`mt-0.5 block truncate text-[11px] ${active ? 'text-muted-foreground' : 'text-muted-foreground/85'}`}>
                      {item.hint}
                    </span>
                  </span>
                </Link>
              );
            })}
          </nav>

          <div className="mt-4 border-t border-card-border pt-3">
            <ProfileSwitcher />
          </div>

          <div
            className="mt-3 flex items-center gap-2 truncate rounded-[1rem] border border-card-border bg-surface-low px-3 py-3 text-xs font-semibold text-muted-foreground"
            title={`Local data in ${dataDirLabel}`}
          >
            <span className="h-2 w-2 shrink-0 rounded-full bg-success" />
            <span className="min-w-0 flex-1 truncate">{dataDirLabel}</span>
            <ChevronDown className="h-3.5 w-3.5 shrink-0" />
          </div>
        </aside>

        <div className="relative z-10 min-w-0">
          <header className="sticky top-0 z-30 border-b border-card-border bg-white/95 backdrop-blur-xl">
            <div className="mx-auto flex h-20 max-w-[100rem] items-center justify-between gap-4 px-4 sm:px-6 lg:px-8 xl:px-10">
              <Link href="/" className="flex min-h-11 min-w-0 items-center gap-3 lg:hidden" aria-label="Career Seek home">
                <BrandMark className="h-11 w-11" />
                <div className="hidden min-w-0 sm:block">
                  <p className="text-base font-semibold leading-none tracking-normal text-foreground">Career Seek</p>
                  <p className="mt-1 text-xs font-medium text-muted-foreground">AI job search copilot</p>
                </div>
              </Link>

              <div className="hidden min-w-0 lg:block">
                <p className="text-sm font-semibold text-foreground">Guided hub</p>
                <p className="mt-1 text-xs font-medium text-muted-foreground">Find, prepare, apply, and follow up from one calm place.</p>
              </div>

              <div className="flex min-w-0 flex-1 items-center justify-end gap-2">
                <ChromeSearchForm />
                <Link href="/settings" className="market-icon-button" aria-label="Open settings">
                  <Settings className="h-4 w-4" />
                </Link>
              </div>
            </div>

            <nav
              aria-label="Primary mobile sections"
              className="flex gap-2 overflow-x-auto border-t border-card-border px-4 py-2 no-scrollbar sm:px-6 md:flex-wrap md:overflow-visible lg:hidden"
            >
              {routeStripItems.map((item) => {
                const Icon = item.icon;
                const active = isActive(pathname, item.href);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={`group relative inline-flex min-h-11 shrink-0 items-center gap-2 rounded-full px-4 text-sm font-semibold transition ${
                      active ? 'bg-surface-container text-foreground' : 'text-muted-foreground hover:bg-surface-low hover:text-foreground'
                    }`}
                  >
                    <Icon className={`h-4 w-4 ${active ? 'text-primary' : 'text-muted-foreground group-hover:text-foreground'}`} />
                    {item.name}
                  </Link>
                );
              })}
            </nav>
          </header>

          <main className="mx-auto w-full max-w-[100rem] px-4 pb-40 pt-5 sm:px-6 md:pt-7 lg:pl-8 lg:pr-28 xl:pl-10 xl:pr-32">
            <SystemStatusPanel />
            <ErrorBoundary>{children}</ErrorBoundary>
            <footer className="mt-12 flex justify-center border-t border-card-border pt-6 text-xs font-medium text-muted-foreground">
              <a
                href="https://www.iamadarsha.in"
                target="_blank"
                rel="noreferrer"
                className="inline-flex min-h-11 items-center rounded-full px-4 transition-colors hover:text-primary"
              >
                Made with care by Adarsha
              </a>
            </footer>
          </main>
        </div>

        <FloatingActionDock pathname={pathname} />
      </div>
    </>
  );
}
