export function WorkbenchStatStrip({ stats }: { stats: any }) {
  const items = [
    { label: 'Best jobs ready', value: stats?.applyToday ?? 0, tone: 'text-success' },
    { label: 'Total matches', value: stats?.actionableJobs ?? 0, tone: 'text-primary' },
    { label: 'Average fit', value: stats?.averageScore ?? 0, tone: 'text-foreground' },
    { label: 'Job sources', value: stats?.portalsActive ?? 0, tone: 'text-foreground' },
  ];

  return (
    <div className="surface-grid grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
      {items.map((item) => (
        <div key={item.label} className="design-panel metric-card px-4 py-3">
          <p className={`font-display text-3xl font-semibold leading-none ${item.tone}`}>{item.value}</p>
          <p className="mt-1 text-xs font-semibold uppercase text-muted-foreground">{item.label}</p>
        </div>
      ))}
    </div>
  );
}
