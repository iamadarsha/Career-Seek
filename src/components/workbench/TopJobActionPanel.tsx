import Link from 'next/link';
import { ArrowRight, Target } from 'lucide-react';
import { RankedJobCard } from '@/components/jobs/RankedJobCard';

export function TopJobActionPanel({ item, capabilities }: { item: any | null; capabilities?: any }) {
  if (!item) {
    return (
      <section className="design-panel border-dashed p-6 text-center">
        <Target className="mx-auto h-8 w-8 text-muted-foreground" />
        <h2 className="mt-3 text-lg font-semibold">No best match yet</h2>
        <p className="mt-1 text-sm text-muted-foreground">Refresh matches or open Jobs to broaden your search.</p>
        <Link href="/discover" className="design-button-primary mt-4 px-4 text-sm font-semibold">
          Open Jobs <ArrowRight className="h-4 w-4" />
        </Link>
      </section>
    );
  }

  return (
    <section aria-label="Top job action" className="space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="design-label text-xs">Best next step</p>
          <h2 className="mt-1 font-display text-xl font-semibold">Prepare this first</h2>
        </div>
        <Link href="/discover" className="inline-flex min-h-11 items-center rounded-apple px-3 text-sm font-semibold text-primary hover:bg-surface-container-low">
          See all jobs
        </Link>
      </div>
      <RankedJobCard item={item} compact capabilities={capabilities} />
    </section>
  );
}
