/**
 * Phase J — Report Export Service
 *
 * Generates and persists Markdown or JSON strategy reports that combine
 * weekly review data, active insights, pipeline funnel, and experiments.
 * All DB operations are synchronous (better-sqlite3).
 */

import fs from 'fs';
import path from 'path';
import os from 'os';

import { getLatestWeeklyReview } from './weekly-review-service';
import { getActiveInsights } from './insight-engine';
import { computeOverallFunnel, type FunnelStage } from './funnel-service';
import { listExperiments } from './experiment-service';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ReportFormat = 'markdown' | 'json';

export interface ReportOptions {
  format: ReportFormat;
  includeInsights?: boolean;
  includeWeeklyReview?: boolean;
  includeFunnel?: boolean;
  includeExperiments?: boolean;
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/** Ensures the exports directory exists, creating it recursively if needed. */
function ensureExportDir(dir: string): void {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

/** ISO date string for today: YYYY-MM-DD */
function todayIsoDate(): string {
  return new Date().toISOString().slice(0, 10);
}

// ---------------------------------------------------------------------------
// Markdown renderer
// ---------------------------------------------------------------------------

function renderMarkdown(opts: ReportOptions): string {
  const lines: string[] = [];

  const weeklyReview = opts.includeWeeklyReview !== false ? getLatestWeeklyReview() : null;
  const insights = opts.includeInsights !== false ? getActiveInsights() : [];
  const funnel: FunnelStage[] = opts.includeFunnel !== false ? computeOverallFunnel() : [];
  const experiments = opts.includeExperiments !== false ? listExperiments() : [];

  // ── Header ──────────────────────────────────────────────────────────────────
  lines.push('# JobHunt India — Weekly Strategy Review');
  lines.push('');

  if (weeklyReview) {
    lines.push(weeklyReview.weekLabel);
  } else {
    lines.push(
      new Date().toLocaleDateString('en-IN', {
        month: 'long',
        day: 'numeric',
        year: 'numeric',
      }),
    );
  }
  lines.push('');

  // ── Key Metrics ─────────────────────────────────────────────────────────────
  lines.push('## Key Metrics This Week');
  lines.push('');

  if (weeklyReview) {
    const m = weeklyReview.metrics;
    lines.push('| Metric | Count |');
    lines.push('|---|---|');
    lines.push(`| Jobs Discovered | ${m.jobsDiscovered} |`);
    lines.push(`| New Tier A Opportunities | ${m.newTierAOpportunities} |`);
    lines.push(`| Applications Submitted | ${m.applicationsSubmitted} |`);
    lines.push(`| Follow-ups Completed | ${m.followUpsCompleted} |`);
    lines.push(`| Follow-ups Missed | ${m.followUpsMissed} |`);
    lines.push(`| Interviews Scheduled | ${m.interviewsScheduled} |`);
    lines.push(`| Offers Received | ${m.offersReceived} |`);
    lines.push(`| Rejections | ${m.rejections} |`);

    if (weeklyReview.bestPortal) {
      lines.push('');
      lines.push(`**Best Portal (Tier A):** ${weeklyReview.bestPortal}`);
    }
  } else {
    lines.push('_No weekly review data available._');
  }
  lines.push('');

  // ── Active Insights ─────────────────────────────────────────────────────────
  lines.push('## Active Insights');
  lines.push('');

  if (insights.length > 0) {
    for (const insight of insights) {
      lines.push(`### ${insight.title}`);
      lines.push(`- **Confidence:** ${insight.confidence}`);
      if (insight.recommendedAction) {
        lines.push(`- **Recommended Action:** ${insight.recommendedAction}`);
      }
      lines.push(`- ${insight.body}`);
      lines.push('');
    }
  } else {
    lines.push('_No active insights._');
    lines.push('');
  }

  // ── Pipeline Funnel ─────────────────────────────────────────────────────────
  lines.push('## Pipeline Funnel');
  lines.push('');

  if (funnel.length > 0) {
    lines.push('| Stage | Count | Conversion |');
    lines.push('|---|---|---|');
    for (const stage of funnel) {
      const conversion =
        stage.conversionFromPrev !== null
          ? `${(stage.conversionFromPrev * 100).toFixed(1)}%`
          : '—';
      lines.push(`| ${stage.label} | ${stage.count} | ${conversion} |`);
    }
  } else {
    lines.push('_No funnel data available._');
  }
  lines.push('');

  // ── Experiments ─────────────────────────────────────────────────────────────
  lines.push('## Experiments');
  lines.push('');

  if (experiments.length > 0) {
    for (const exp of experiments) {
      lines.push(`### ${exp.name} _(${exp.status})_`);
      lines.push(`- **Hypothesis:** ${exp.hypothesis}`);
      lines.push(`- **Linked Applications:** ${exp.linkedApplications}`);
      lines.push(`- **Linked Jobs:** ${exp.linkedJobs}`);
      if (exp.conclusion) {
        lines.push(`- **Conclusion:** ${exp.conclusion}`);
      }
      lines.push('');
    }
  } else {
    lines.push('_No experiments running._');
    lines.push('');
  }

  // ── Suggested Actions ────────────────────────────────────────────────────────
  lines.push('## Suggested Actions');
  lines.push('');

  const actions = weeklyReview?.suggestedActions ?? [];
  if (actions.length > 0) {
    actions.forEach((action, i) => {
      lines.push(`${i + 1}. ${action}`);
    });
  } else {
    lines.push('_No suggested actions._');
  }
  lines.push('');

  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// JSON renderer
// ---------------------------------------------------------------------------

function renderJson(opts: ReportOptions): string {
  const weeklyReview = opts.includeWeeklyReview !== false ? getLatestWeeklyReview() : null;
  const insights = opts.includeInsights !== false ? getActiveInsights() : [];
  const funnel: FunnelStage[] = opts.includeFunnel !== false ? computeOverallFunnel() : [];
  const experiments = opts.includeExperiments !== false ? listExperiments() : [];

  const payload: Record<string, unknown> = {
    generatedAt: new Date().toISOString(),
  };

  if (opts.includeWeeklyReview !== false) {
    payload.weeklyReview = weeklyReview ?? null;
  }
  if (opts.includeInsights !== false) {
    payload.insights = insights;
  }
  if (opts.includeFunnel !== false) {
    payload.funnel = funnel;
  }
  if (opts.includeExperiments !== false) {
    payload.experiments = experiments;
  }

  return JSON.stringify(payload, null, 2);
}

// ---------------------------------------------------------------------------
// generateReport
// ---------------------------------------------------------------------------

export function generateReport(opts: ReportOptions): string {
  if (opts.format === 'markdown') {
    return renderMarkdown(opts);
  }
  return renderJson(opts);
}

// ---------------------------------------------------------------------------
// exportReport
// ---------------------------------------------------------------------------

export function exportReport(
  opts: ReportOptions & { filename?: string },
): { filePath: string; size: number } {
  const exportDir = path.join(os.homedir(), '.jobhunt-india', 'exports', 'reports');

  ensureExportDir(exportDir);

  const ext = opts.format === 'markdown' ? 'md' : 'json';
  const defaultFilename = `weekly-review-${todayIsoDate()}.${ext}`;
  const filename = opts.filename ?? defaultFilename;
  const filePath = path.join(exportDir, filename);

  const content = generateReport(opts);
  fs.writeFileSync(filePath, content, 'utf-8');

  const { size } = fs.statSync(filePath);

  return { filePath, size };
}
