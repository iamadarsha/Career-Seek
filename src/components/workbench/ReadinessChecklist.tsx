import { CheckCircle2, Circle, FileText, Send, Sparkles } from 'lucide-react';

function CheckItem({ done, label }: { done: boolean; label: string }) {
  return (
    <div className="flex items-center gap-2 text-sm">
      {done ? <CheckCircle2 className="h-4 w-4 text-success" /> : <Circle className="h-4 w-4 text-muted-foreground" />}
      <span className={done ? 'text-foreground' : 'text-muted-foreground'}>{label}</span>
    </div>
  );
}

export function ReadinessChecklist({ topJob }: { topJob?: any | null }) {
  const applicationStatus = topJob?.application?.status || null;
  const assets = topJob?.assets || [];
  const hasResume = assets.some((asset: any) => asset.type === 'resume' || asset.type === 'resume_pdf');
  const hasCover = assets.some((asset: any) => asset.type === 'cover_letter');
  const hasBrief = Boolean(topJob?.enrichment);
  const isApplied = applicationStatus === 'applied';

  return (
    <section className="design-panel p-4">
      <div className="mb-3 flex items-center gap-2">
        <FileText className="h-4 w-4 text-primary" />
        <h3 className="text-sm font-bold uppercase text-muted-foreground">Application readiness</h3>
      </div>
      <div className="space-y-2">
        <CheckItem done={hasBrief} label="Fit brief reviewed" />
        <CheckItem done={hasResume} label="Tailored resume ready" />
        <CheckItem done={hasCover} label="Cover letter ready" />
        <CheckItem done={isApplied} label="Marked applied" />
      </div>
      {!topJob && (
        <p className="mt-3 text-sm text-muted-foreground">Pick a ranked job to see readiness.</p>
      )}
      {topJob && !hasResume && !hasCover && (
        <p className="mt-3 flex gap-2 text-xs leading-5 text-muted-foreground">
          <Sparkles className="mt-0.5 h-3.5 w-3.5 text-primary" />
          Prepare assets from the top job card before applying.
        </p>
      )}
      {isApplied && (
        <p className="mt-3 flex gap-2 text-xs leading-5 text-muted-foreground">
          <Send className="mt-0.5 h-3.5 w-3.5 text-success" />
          This application is already in your pipeline.
        </p>
      )}
    </section>
  );
}
