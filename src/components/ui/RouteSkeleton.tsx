function Bar({ className = '' }: { className?: string }) {
  return (
    <div
      className={`animate-pulse rounded-apple border border-card-border bg-surface-low ${className}`}
    />
  );
}

export function DashboardSkeleton() {
  return (
    <div className="grid gap-5 xl:grid-cols-[1fr_20rem]">
      <section className="space-y-4">
        <Bar className="h-24" />
        <div className="grid gap-3 md:grid-cols-4">
          <Bar className="h-16" />
          <Bar className="h-16" />
          <Bar className="h-16" />
          <Bar className="h-16" />
        </div>
        <Bar className="h-36" />
        <Bar className="h-36" />
      </section>
      <aside className="space-y-3">
        <Bar className="h-28" />
        <Bar className="h-24" />
        <Bar className="h-24" />
      </aside>
    </div>
  );
}

export function DiscoverSkeleton() {
  return (
    <div className="space-y-5">
      <Bar className="h-20" />
      <Bar className="h-14" />
      <Bar className="h-32" />
      <Bar className="h-32" />
    </div>
  );
}

export function CoachSkeleton() {
  return (
    <div className="grid gap-4 md:grid-cols-[16rem_1fr]">
      <Bar className="hidden h-[32rem] md:block" />
      <div className="space-y-4">
        <Bar className="h-14" />
        <Bar className="h-64" />
        <Bar className="h-14" />
      </div>
    </div>
  );
}

export function PipelineSkeleton() {
  return (
    <div className="space-y-5">
      <Bar className="h-20" />
      <div className="surface-grid grid gap-3 md:grid-cols-3 xl:grid-cols-6">
        {Array.from({ length: 6 }).map((_, index) => <Bar key={index} className="h-20" />)}
      </div>
      <Bar className="h-[34rem]" />
    </div>
  );
}
