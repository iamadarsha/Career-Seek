export function AdvisoryEstimateLabel({ className = '', compact = false }: { className?: string; compact?: boolean }) {
  return (
    <span
      className={`inline-block max-w-full rounded-apple border border-warning-border bg-warning-bg px-2 py-0.5 text-center text-[10px] font-semibold leading-tight text-warning ${className}`}
      title="Local advisory estimate, not employer-certified."
    >
      {compact ? 'Local estimate' : 'Local advisory estimate, not employer-certified.'}
    </span>
  );
}
