'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Menu, Settings, X } from 'lucide-react';
import { appNavItems } from '@/components/Sidebar';

function isActive(pathname: string, href: string) {
  if (href === '/') return pathname === '/' || pathname === '/today';
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function MobileNavFallback() {
  const pathname = usePathname();
  const [moreOpen, setMoreOpen] = useState(false);
  const morePanelRef = useRef<HTMLDivElement>(null);
  const primaryItems = appNavItems.filter((item) => ['/', '/discover', '/pipeline', '/coach'].includes(item.href));
  const secondaryItems = appNavItems.filter((item) => !['/', '/discover', '/pipeline', '/coach'].includes(item.href));
  const utilityItems = [
    { name: 'Settings', href: '/settings', icon: Settings, hint: 'AI key, profile, backups' },
  ];

  useEffect(() => {
    setMoreOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!moreOpen) return undefined;

    window.setTimeout(() => {
      morePanelRef.current?.querySelector<HTMLElement>('a, button')?.focus();
    }, 0);

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setMoreOpen(false);
    };

    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [moreOpen]);

  return (
    <>
      {moreOpen && (
        <div className="fixed inset-0 z-10 bg-foreground/20 backdrop-blur-[2px] md:hidden" onClick={() => setMoreOpen(false)}>
          <div
            id="mobile-more-navigation"
            ref={morePanelRef}
            role="dialog"
            aria-modal="true"
            aria-label="More navigation"
            className="absolute inset-x-3 bottom-24 rounded-[1.25rem] border border-card-border bg-white p-3 shadow-ink"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="mb-2 flex items-center justify-between gap-3 px-1">
              <div>
                <p className="text-sm font-semibold">More</p>
                <p className="text-xs text-muted-foreground">Saved work, documents, alerts, and settings.</p>
              </div>
              <button
                type="button"
                aria-label="Close more navigation"
                onClick={() => setMoreOpen(false)}
                className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-full border border-card-border bg-surface-low text-muted-foreground"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="grid grid-cols-2 gap-2">
              {[...secondaryItems, ...utilityItems].map((item) => {
                const active = isActive(pathname, item.href);
                const Icon = item.icon;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={`flex min-h-16 items-center gap-3 rounded-[0.875rem] border px-3 py-2 text-left transition ${
                      active
                        ? 'border-foreground bg-foreground text-white shadow-golden-sm'
                        : 'border-card-border bg-white text-foreground hover:border-foreground'
                    }`}
                  >
                    <Icon className="h-5 w-5 shrink-0" />
                    <span className="min-w-0">
                      <span className="block text-sm font-semibold leading-tight">{item.name}</span>
                      <span className={`mt-1 block truncate text-[11px] ${active ? 'text-white/70' : 'text-muted-foreground'}`}>{item.hint}</span>
                    </span>
                  </Link>
                );
              })}
            </div>
          </div>
        </div>
      )}

      <nav aria-label="Primary mobile navigation" className="fixed inset-x-0 bottom-0 z-20 border-t border-card-border bg-white/95 shadow-golden-sm backdrop-blur-xl md:hidden">
        <div className="grid grid-cols-5">
          {primaryItems.map((item) => {
            const active = isActive(pathname, item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`relative flex min-h-16 flex-col items-center justify-center gap-1 text-[11px] font-semibold transition-colors ${active ? 'text-foreground' : 'text-muted-foreground'}`}
              >
                {active && <span className="absolute top-2 h-1 w-1 rounded-full bg-primary" aria-hidden="true" />}
                <item.icon className="h-4 w-4" />
                {item.name}
              </Link>
            );
          })}
          <button
            type="button"
            aria-expanded={moreOpen}
            aria-controls="mobile-more-navigation"
            onClick={() => setMoreOpen((open) => !open)}
            className={`relative flex min-h-16 flex-col items-center justify-center gap-1 text-[11px] font-semibold transition-colors ${moreOpen ? 'text-foreground' : 'text-muted-foreground hover:text-foreground'}`}
          >
            {moreOpen && <span className="absolute top-2 h-1 w-1 rounded-full bg-primary" aria-hidden="true" />}
            <Menu className="h-4 w-4" />
            More
          </button>
        </div>
      </nav>
    </>
  );
}
