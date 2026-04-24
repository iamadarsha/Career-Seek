'use server';

import { computeOverallFunnel, computeFunnelByDimension, computeFunnelForPeriod } from '@/lib/services/analytics/funnel-service';
import { getPortalPerformance, getSearchProfilePerformance, getTopLocations, getSearchSummary } from '@/lib/services/analytics/search-analytics-service';
import { getAtsDistribution, getDocumentUsageStats, getAtsVsOutcomes, getHighAtsUnusedJobs, getDocumentSummary } from '@/lib/services/analytics/document-analytics-service';
import { getApplyLatencyStats, getStatusDurationStats, getStaleOpportunities, getDropOffCount, getTimeSummary } from '@/lib/services/analytics/time-analytics-service';
import { runInsightEngine, getActiveInsights, dismissInsight, clearInsights } from '@/lib/services/analytics/insight-engine';
import { computeWeeklyReview, saveWeeklyReview, getLatestWeeklyReview } from '@/lib/services/analytics/weekly-review-service';
import { createExperiment, updateExperiment, linkToExperiment, listExperiments, getExperiment, computeExperimentMetrics } from '@/lib/services/analytics/experiment-service';
import { exportReport, type ReportOptions } from '@/lib/services/analytics/report-export-service';
import { queryEvents } from '@/lib/services/analytics/event-service';

// ─── Funnel ───────────────────────────────────────────────────────────────────

export async function actionGetOverallFunnel() {
  try {
    const stages = computeOverallFunnel();
    return { success: true as const, stages };
  } catch (err) {
    return { success: false as const, error: String(err) };
  }
}

export async function actionGetFunnelByDimension(dimension: 'portal' | 'tier') {
  try {
    const breakdown = computeFunnelByDimension(dimension);
    return { success: true as const, breakdown };
  } catch (err) {
    return { success: false as const, error: String(err) };
  }
}

export async function actionGetFunnelForPeriod(since: string, until: string) {
  try {
    const stages = computeFunnelForPeriod(new Date(since), new Date(until));
    return { success: true as const, stages };
  } catch (err) {
    return { success: false as const, error: String(err) };
  }
}

// ─── Search Analytics ─────────────────────────────────────────────────────────

export async function actionGetPortalPerformance() {
  try {
    const portals = getPortalPerformance();
    return { success: true as const, portals };
  } catch (err) {
    return { success: false as const, error: String(err) };
  }
}

export async function actionGetSearchProfilePerformance() {
  try {
    const profiles = getSearchProfilePerformance();
    return { success: true as const, profiles };
  } catch (err) {
    return { success: false as const, error: String(err) };
  }
}

export async function actionGetTopLocations(limit?: number) {
  try {
    const locations = getTopLocations(limit);
    return { success: true as const, locations };
  } catch (err) {
    return { success: false as const, error: String(err) };
  }
}

export async function actionGetSearchSummary() {
  try {
    const summary = getSearchSummary();
    return { success: true as const, summary };
  } catch (err) {
    return { success: false as const, error: String(err) };
  }
}

// ─── Document Analytics ───────────────────────────────────────────────────────

export async function actionGetAtsDistribution() {
  try {
    const distribution = getAtsDistribution();
    return { success: true as const, distribution };
  } catch (err) {
    return { success: false as const, error: String(err) };
  }
}

export async function actionGetDocumentUsageStats() {
  try {
    const stats = getDocumentUsageStats();
    return { success: true as const, stats };
  } catch (err) {
    return { success: false as const, error: String(err) };
  }
}

export async function actionGetAtsVsOutcomes() {
  try {
    const bands = getAtsVsOutcomes();
    return { success: true as const, bands };
  } catch (err) {
    return { success: false as const, error: String(err) };
  }
}

export async function actionGetDocumentSummary() {
  try {
    const summary = getDocumentSummary();
    return { success: true as const, summary };
  } catch (err) {
    return { success: false as const, error: String(err) };
  }
}

// ─── Time Analytics ───────────────────────────────────────────────────────────

export async function actionGetTimeSummary() {
  try {
    const summary = getTimeSummary();
    return { success: true as const, summary };
  } catch (err) {
    return { success: false as const, error: String(err) };
  }
}

export async function actionGetApplyLatencyStats() {
  try {
    const stats = getApplyLatencyStats();
    return { success: true as const, stats };
  } catch (err) {
    return { success: false as const, error: String(err) };
  }
}

export async function actionGetStaleOpportunities(staleDays?: number) {
  try {
    const opportunities = getStaleOpportunities(staleDays);
    return { success: true as const, opportunities };
  } catch (err) {
    return { success: false as const, error: String(err) };
  }
}

// ─── Insight Engine ───────────────────────────────────────────────────────────

export async function actionRunInsightEngine() {
  try {
    const result = runInsightEngine();
    return { success: true as const, ...result };
  } catch (err) {
    return { success: false as const, error: String(err) };
  }
}

export async function actionGetActiveInsights(limit?: number) {
  try {
    const insights = getActiveInsights(limit);
    return { success: true as const, insights };
  } catch (err) {
    return { success: false as const, error: String(err) };
  }
}

export async function actionDismissInsight(id: number) {
  try {
    dismissInsight(id);
    return { success: true as const };
  } catch (err) {
    return { success: false as const, error: String(err) };
  }
}

export async function actionClearInsights() {
  try {
    clearInsights();
    return { success: true as const };
  } catch (err) {
    return { success: false as const, error: String(err) };
  }
}

// ─── Weekly Review ────────────────────────────────────────────────────────────

export async function actionComputeAndSaveWeeklyReview() {
  try {
    const summary = computeWeeklyReview();
    saveWeeklyReview(summary);
    return { success: true as const, summary };
  } catch (err) {
    return { success: false as const, error: String(err) };
  }
}

export async function actionGetLatestWeeklyReview() {
  try {
    const review = getLatestWeeklyReview();
    return { success: true as const, review };
  } catch (err) {
    return { success: false as const, error: String(err) };
  }
}

// ─── Experiments ──────────────────────────────────────────────────────────────

export async function actionListExperiments() {
  try {
    const experiments = listExperiments();
    return { success: true as const, experiments };
  } catch (err) {
    return { success: false as const, error: String(err) };
  }
}

export async function actionCreateExperiment(input: { name: string; hypothesis: string; affectedCriteria?: Record<string, unknown> }) {
  try {
    const experiment = createExperiment(input);
    return { success: true as const, experiment };
  } catch (err) {
    return { success: false as const, error: String(err) };
  }
}

export async function actionUpdateExperiment(id: number, updates: { status?: string; conclusion?: string; metricsJson?: Record<string, unknown> }) {
  try {
    const experiment = updateExperiment(id, updates);
    return { success: true as const, experiment };
  } catch (err) {
    return { success: false as const, error: String(err) };
  }
}

export async function actionGetExperimentMetrics(id: number) {
  try {
    const metrics = computeExperimentMetrics(id);
    return { success: true as const, metrics };
  } catch (err) {
    return { success: false as const, error: String(err) };
  }
}

// ─── Activity Log ─────────────────────────────────────────────────────────────

export async function actionGetRecentEvents(limit = 100) {
  try {
    const events = queryEvents({ limit });
    return { success: true as const, events };
  } catch (err) {
    return { success: false as const, error: String(err) };
  }
}

// ─── Report Export ────────────────────────────────────────────────────────────

export async function actionExportAnalyticsReport(options: ReportOptions) {
  try {
    const result = exportReport(options);
    return { success: true as const, ...result };
  } catch (err) {
    return { success: false as const, error: String(err) };
  }
}
