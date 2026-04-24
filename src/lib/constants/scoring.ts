export const SCORING_THRESHOLDS = {
  TIER_A: 80,
  TIER_B: 60,
  TIER_C: 40,
  PRIORITY_QUEUE_B: 75, // Elevate Tier B jobs with score >= 75 to the priority queue
};

export const TIER_COLORS: Record<string, string> = {
  A: 'bg-green-100 text-green-800 border-green-200 dark:bg-green-900/30 dark:text-green-400 dark:border-green-800',
  B: 'bg-blue-100 text-blue-800 border-blue-200 dark:bg-blue-900/30 dark:text-blue-400 dark:border-blue-800',
  C: 'bg-orange-100 text-orange-800 border-orange-200 dark:bg-orange-900/30 dark:text-orange-400 dark:border-orange-800',
  D: 'bg-slate-100 text-slate-800 border-slate-200 dark:bg-slate-900/30 dark:text-slate-400 dark:border-slate-800'
};
