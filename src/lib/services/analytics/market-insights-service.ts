import { desc, eq } from 'drizzle-orm';
import { getDb } from '@/db';
import { normalizedJobs, scoredJobs } from '@/db/schema';
import { resolveContext } from '@/lib/platform/identity';
import { getEscoLiteSkills } from '@/lib/services/skills/taxonomy';

export interface MarketInsightSnapshot {
  generatedAt: string;
  totalJobs: number;
  salary: {
    count: number;
    min: number | null;
    max: number | null;
    medianMin: number | null;
    medianMax: number | null;
    currency: string | null;
  };
  topSkills: Array<{ skill: string; count: number; group: string }>;
  activeCompanies: Array<{ company: string; count: number }>;
  trend: Array<{ date: string; count: number }>;
  tierMix: Array<{ tier: string; count: number }>;
}

function median(values: number[]) {
  const sorted = values.filter((value) => Number.isFinite(value)).sort((a, b) => a - b);
  if (!sorted.length) return null;
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : Math.round((sorted[middle - 1] + sorted[middle]) / 2);
}

function day(value: Date | string | number | null | undefined) {
  if (!value) return 'unknown';
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return 'unknown';
  return date.toISOString().slice(0, 10);
}

function countBy<T>(items: T[], keyFn: (item: T) => string | null | undefined) {
  const counts = new Map<string, number>();
  for (const item of items) {
    const key = keyFn(item)?.trim();
    if (!key) continue;
    counts.set(key, (counts.get(key) || 0) + 1);
  }
  return Array.from(counts.entries()).map(([key, count]) => ({ key, count })).sort((a, b) => b.count - a.count);
}

export function computeMarketInsightSnapshot(limit = 2_000): MarketInsightSnapshot {
  const db = getDb();
  const { profileId } = resolveContext();
  const rows = db.select({
    job: normalizedJobs,
    tier: scoredJobs.tier,
  })
    .from(normalizedJobs)
    .leftJoin(scoredJobs, eq(scoredJobs.normalizedJobId, normalizedJobs.id))
    .where(eq(normalizedJobs.profileId, profileId))
    .orderBy(desc(normalizedJobs.scrapedAt))
    .limit(limit)
    .all();

  const jobs = rows.map((row) => row.job);
  const salaryMin = jobs.map((job) => job.salaryMin).filter((value): value is number => typeof value === 'number' && value > 0);
  const salaryMax = jobs.map((job) => job.salaryMax).filter((value): value is number => typeof value === 'number' && value > 0);
  const currencies = countBy(jobs, (job) => job.salaryCurrency || null);
  const skillCatalog = getEscoLiteSkills();
  const skillCounts = new Map<string, { skill: string; count: number; group: string }>();

  for (const job of jobs) {
    const text = `${job.title} ${job.snippet || ''} ${job.portal || ''}`.toLowerCase();
    for (const skill of skillCatalog) {
      const aliases = [skill.label, ...(skill.altLabels || [])];
      if (aliases.some((alias) => {
        const normalized = alias.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        return new RegExp(`(^|[^a-z0-9+#.])${normalized}([^a-z0-9+#.]|$)`).test(text);
      })) {
        const existing = skillCounts.get(skill.id) || { skill: skill.label, count: 0, group: skill.group };
        existing.count += 1;
        skillCounts.set(skill.id, existing);
      }
    }
  }

  return {
    generatedAt: new Date().toISOString(),
    totalJobs: jobs.length,
    salary: {
      count: jobs.filter((job) => job.salaryMin || job.salaryMax).length,
      min: salaryMin.length ? Math.min(...salaryMin) : null,
      max: salaryMax.length ? Math.max(...salaryMax) : null,
      medianMin: median(salaryMin),
      medianMax: median(salaryMax),
      currency: currencies[0]?.key || null,
    },
    topSkills: Array.from(skillCounts.values()).sort((a, b) => b.count - a.count).slice(0, 12),
    activeCompanies: countBy(jobs, (job) => job.company).slice(0, 12).map((item) => ({ company: item.key, count: item.count })),
    trend: countBy(jobs, (job) => day(job.scrapedAt)).sort((a, b) => a.key.localeCompare(b.key)).slice(-30).map((item) => ({ date: item.key, count: item.count })),
    tierMix: countBy(rows, (row) => row.tier || 'unscored').map((item) => ({ tier: item.key, count: item.count })),
  };
}
