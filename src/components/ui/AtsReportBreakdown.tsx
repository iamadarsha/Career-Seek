type AtsReportRecord = Record<string, unknown>;

type AtsRecommendation = {
  section: string;
  recommendation: string;
};

type AtsReportBreakdownProps = {
  report: AtsReportRecord | null;
  score?: number | null;
  resumeFilePath?: string | null;
};

const SCORE_SOURCES = ['scoreBreakdown', 'scoreParts', 'compositeScore', 'composite', 'scores'];

function isRecord(value: unknown): value is AtsReportRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function asNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value.replace('%', '').trim());
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function asString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map((item) => String(item || '').trim()).filter(Boolean);
}

function clampPercent(value: number) {
  return Math.max(0, Math.min(100, Math.round(value)));
}

function normalizePercent(value: number | null) {
  if (value === null) return null;
  const scaled = value > 0 && value <= 1 ? value * 100 : value;
  return clampPercent(scaled);
}

function scorePart(report: AtsReportRecord, key: string) {
  const direct = normalizePercent(asNumber(report[key]));
  if (direct !== null) return direct;

  for (const source of SCORE_SOURCES) {
    const nested = report[source];
    if (!isRecord(nested)) continue;
    const value = normalizePercent(asNumber(nested[key]));
    if (value !== null) return value;
  }

  return null;
}

function penaltyPart(report: AtsReportRecord) {
  const candidates = [report.riskPenalty];
  for (const source of SCORE_SOURCES) {
    const nested = report[source];
    if (isRecord(nested)) candidates.push(nested.riskPenalty);
  }

  for (const candidate of candidates) {
    const value = asNumber(candidate);
    if (value === null) continue;
    const scaled = Math.abs(value) > 0 && Math.abs(value) <= 1 ? value * 100 : value;
    return Math.round(scaled);
  }

  return null;
}

function semanticSummary(report: AtsReportRecord) {
  const value = report.semanticSummary;
  if (typeof value === 'string') return value.trim();
  if (!isRecord(value)) return '';

  const preferred = asString(value.summary) || asString(value.explanation) || asString(value.text);
  if (preferred) return preferred;

  return Object.entries(value)
    .filter(([, entry]) => ['string', 'number', 'boolean'].includes(typeof entry))
    .slice(0, 3)
    .map(([key, entry]) => `${titleCase(key)}: ${String(entry)}`)
    .join(' · ');
}

function titleCase(value: string) {
  return value
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function modeLabel(value: unknown) {
  const mode = asString(value);
  if (!mode) return '';

  const labels: Record<string, string> = {
    ai_with_deterministic_coverage: 'AI review plus local checks',
    deterministic_fallback: 'Local keyword check',
    local_profile_jd_fallback: 'Local resume and job check',
  };

  return labels[mode] || titleCase(mode);
}

function listFromKeywordReport(report: AtsReportRecord, key: 'matched' | 'missing') {
  const keywordReport = report.keywordReport;
  return isRecord(keywordReport) ? asStringArray(keywordReport[key]) : [];
}

function recommendationsFrom(report: AtsReportRecord) {
  const source = report.sectionRecommendations;
  if (!Array.isArray(source)) return [];

  return source
    .map((item): AtsRecommendation | null => {
      if (typeof item === 'string') return { section: 'Next edit', recommendation: item.trim() };
      if (!isRecord(item)) return null;
      const recommendation = asString(item.recommendation) || asString(item.reason) || asString(item.text);
      if (!recommendation) return null;
      return {
        section: asString(item.section) || 'Next edit',
        recommendation,
      };
    })
    .filter((item): item is AtsRecommendation => item !== null);
}

function ScoreLine({
  label,
  value,
  help,
  tone = 'primary',
}: {
  label: string;
  value: number;
  help: string;
  tone?: 'primary' | 'green' | 'amber';
}) {
  const colorClass = tone === 'green' ? 'bg-success' : tone === 'amber' ? 'bg-warning' : 'bg-primary';

  return (
    <div className="min-w-0">
      <div className="flex items-center justify-between gap-3 text-xs">
        <span className="font-medium text-foreground">{label}</span>
        <span className="tabular-nums text-muted-foreground">{value}%</span>
      </div>
      <div className="mt-1 h-1.5 overflow-hidden rounded-sharp bg-muted">
        <div className={`h-full ${colorClass}`} style={{ width: `${value}%` }} />
      </div>
      <p className="mt-1 text-[11px] leading-4 text-muted-foreground">{help}</p>
    </div>
  );
}

function KeywordPills({ values, tone }: { values: string[]; tone: 'found' | 'missing' }) {
  if (!values.length) {
    return <p className="text-xs text-muted-foreground">Nothing listed yet.</p>;
  }

  const classes = tone === 'found'
    ? 'border-success-border bg-success-bg text-success'
    : 'border-danger-border bg-danger-bg text-danger';

  return (
    <div className="flex flex-wrap gap-1.5">
      {values.slice(0, 16).map((keyword, index) => (
        <span key={`${keyword}-${index}`} className={`rounded-sharp border px-1.5 py-0.5 text-[11px] font-medium ${classes}`}>
          {keyword}
        </span>
      ))}
      {values.length > 16 && (
        <span className="rounded-sharp bg-muted px-1.5 py-0.5 text-[11px] text-muted-foreground">
          +{values.length - 16} more
        </span>
      )}
    </div>
  );
}

export function AtsReportBreakdown({ report, score, resumeFilePath }: AtsReportBreakdownProps) {
  if (!report) {
    return (
      <div className="text-sm text-muted-foreground">
        The ATS report was saved, but this asset uses an older text-only format.
      </div>
    );
  }

  const overallScore = normalizePercent(asNumber(report.atsScore)) ?? normalizePercent(score ?? null);
  const verdict = asString(report.verdict);
  const keywordScore = scorePart(report, 'keywordScore');
  const semanticScore = scorePart(report, 'semanticScore');
  const sectionScore = scorePart(report, 'sectionScore');
  const riskPenalty = penaltyPart(report);
  const foundKeywords = asStringArray(report.keywordsFound).length
    ? asStringArray(report.keywordsFound)
    : listFromKeywordReport(report, 'matched');
  const missingKeywords = asStringArray(report.keywordsMissing).length
    ? asStringArray(report.keywordsMissing)
    : listFromKeywordReport(report, 'missing');
  const strengths = asStringArray(report.strengths);
  const risks = asStringArray(report.risks);
  const recommendations = recommendationsFrom(report);
  const explanation = asString(report.explanation);
  const meaningSummary = semanticSummary(report);
  const provenance = isRecord(report.provenance) ? report.provenance : null;
  const generationMode = provenance ? modeLabel(provenance.generationMode) : '';
  const model = provenance ? asString(provenance.model) : '';
  const fallbackReason = provenance ? asString(provenance.fallbackReason) : '';

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-medium uppercase text-muted-foreground">Resume match estimate</p>
          <div className="mt-1 flex flex-wrap items-baseline gap-2">
            <span className="text-3xl font-semibold leading-none text-foreground">
              {overallScore !== null ? `${overallScore}%` : 'Saved'}
            </span>
            {verdict && <span className="text-sm font-medium text-muted-foreground">{verdict}</span>}
          </div>
        </div>
        <p className="max-w-md text-xs leading-5 text-muted-foreground">
          Use this as an edit guide before applying. It is a local estimate, not a result from an employer system.
        </p>
      </div>

      {(keywordScore !== null || semanticScore !== null || sectionScore !== null || riskPenalty !== null) && (
        <div className="border-t border-border pt-4">
          <div className="grid gap-4 sm:grid-cols-2">
            {keywordScore !== null && (
              <ScoreLine
                label="Keyword match"
                value={keywordScore}
                help="Important skills and terms found in the resume."
                tone="green"
              />
            )}
            {semanticScore !== null && (
              <ScoreLine
                label="Meaning match"
                value={semanticScore}
                help="How closely your resume reads against the role."
                tone="primary"
              />
            )}
            {sectionScore !== null && (
              <ScoreLine
                label="Resume coverage"
                value={sectionScore}
                help="Whether the match appears in the right sections."
                tone="primary"
              />
            )}
            {riskPenalty !== null && (
              <div className="min-w-0">
                <div className="flex items-center justify-between gap-3 text-xs">
                  <span className="font-medium text-foreground">Risk adjustment</span>
                  <span className="tabular-nums text-warning">
                    {riskPenalty > 0 ? `-${Math.abs(riskPenalty)} pts` : `${Math.abs(riskPenalty)} pts`}
                  </span>
                </div>
                <div className="mt-1 h-1.5 overflow-hidden rounded-sharp bg-muted">
                  <div className="h-full bg-warning" style={{ width: `${clampPercent(Math.abs(riskPenalty))}%` }} />
                </div>
                <p className="mt-1 text-[11px] leading-4 text-muted-foreground">
                  Points held back for weak, missing, or unsupported wording.
                </p>
              </div>
            )}
          </div>
        </div>
      )}

      {meaningSummary && (
        <div className="border-t border-border pt-4">
          <h6 className="text-xs font-semibold text-foreground">Why the match reads this way</h6>
          <p className="mt-1 text-sm leading-6 text-muted-foreground">{meaningSummary}</p>
        </div>
      )}

      <div className="grid gap-4 border-t border-border pt-4 md:grid-cols-2">
        <div>
          <h6 className="text-xs font-semibold text-success">Already covered</h6>
          <div className="mt-2">
            <KeywordPills values={foundKeywords} tone="found" />
          </div>
        </div>
        <div>
          <h6 className="text-xs font-semibold text-danger">Worth improving</h6>
          <div className="mt-2">
            <KeywordPills values={missingKeywords} tone="missing" />
          </div>
        </div>
      </div>

      {(strengths.length > 0 || risks.length > 0) && (
        <div className="grid gap-4 border-t border-border pt-4 md:grid-cols-2">
          {strengths.length > 0 && (
            <div>
              <h6 className="text-xs font-semibold text-foreground">What is working</h6>
              <ul className="mt-2 space-y-1.5 text-sm leading-5 text-muted-foreground">
                {strengths.slice(0, 4).map((item) => <li key={item}>{item}</li>)}
              </ul>
            </div>
          )}
          {risks.length > 0 && (
            <div>
              <h6 className="text-xs font-semibold text-foreground">What to check before applying</h6>
              <ul className="mt-2 space-y-1.5 text-sm leading-5 text-muted-foreground">
                {risks.slice(0, 4).map((item) => <li key={item}>{item}</li>)}
              </ul>
            </div>
          )}
        </div>
      )}

      {recommendations.length > 0 && (
        <div className="border-t border-border pt-4">
          <h6 className="text-xs font-semibold text-foreground">Next edits</h6>
          <div className="mt-2 space-y-3">
            {recommendations.slice(0, 5).map((item) => (
              <div key={`${item.section}-${item.recommendation}`} className="border-l-2 border-warning-border pl-3">
                <p className="text-xs font-semibold text-warning">{item.section}</p>
                <p className="mt-0.5 text-sm leading-5 text-muted-foreground">{item.recommendation}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {explanation && (
        <div className="border-t border-border pt-4">
          <h6 className="text-xs font-semibold text-foreground">Short read</h6>
          <p className="mt-1 text-sm leading-6 text-muted-foreground">{explanation}</p>
        </div>
      )}

      {(generationMode || model || fallbackReason || resumeFilePath) && (
        <div className="border-t border-border pt-4 text-xs leading-5 text-muted-foreground">
          <h6 className="font-semibold text-foreground">How this was made</h6>
          <div className="mt-1 space-y-0.5">
            {generationMode && <p>Method: {generationMode}</p>}
            {model && <p>Reviewer: {model}</p>}
            {fallbackReason && <p>Note: {fallbackReason}</p>}
            {resumeFilePath && <p className="break-all">Resume file: {resumeFilePath}</p>}
          </div>
        </div>
      )}
    </div>
  );
}
