import Link from 'next/link';
import { desc, eq } from 'drizzle-orm';
import { Download, ExternalLink, FileText } from 'lucide-react';
import { getDb } from '@/db';
import { documentAssets, masterProfiles, normalizedJobs, scoredJobs, uploadedResumes } from '@/db/schema';
import { resolveContext } from '@/lib/platform/identity';
import { shouldShowDocumentAsset } from '@/lib/services/documents/asset-filters';
import { AdvisoryEstimateLabel } from '@/components/ui/AdvisoryEstimateLabel';

export default function Documents() {
  const db = getDb();
  const { profileId } = resolveContext();
  const resumes = db.select().from(uploadedResumes)
    .where(eq(uploadedResumes.profileId, profileId))
    .orderBy(desc(uploadedResumes.uploadedAt))
    .all();
  const assets = db.select({
    asset: documentAssets,
    scoredJob: scoredJobs,
    job: normalizedJobs,
  }).from(documentAssets)
    .leftJoin(scoredJobs, eq(scoredJobs.id, documentAssets.scoredJobId))
    .leftJoin(normalizedJobs, eq(normalizedJobs.id, scoredJobs.normalizedJobId))
    .where(eq(documentAssets.profileId, profileId))
    .orderBy(desc(documentAssets.createdAt))
    .all();
  const latestMasterProfile = db.select({ id: masterProfiles.id, fullName: masterProfiles.fullName, updatedAt: masterProfiles.updatedAt })
    .from(masterProfiles)
    .where(eq(masterProfiles.profileId, profileId))
    .orderBy(desc(masterProfiles.updatedAt), desc(masterProfiles.id))
    .get();
  const currentAssets = assets.filter(({ asset, job }) => shouldShowDocumentAsset(asset, latestMasterProfile, job));

  return (
    <div className="space-y-7">
      <header>
        <p className="design-label">Resume Kit</p>
        <h1 className="mt-2 max-w-4xl font-display text-3xl font-semibold leading-tight md:text-4xl">Application packs for serious roles</h1>
        <p className="mt-3 text-muted-foreground">Each pack can include a tailored resume, ATS checklist, cover letter, outreach note, and interview prep, linked to the job it was made for.</p>
      </header>

      <section className="surface-grid grid gap-4 md:grid-cols-3">
        <div className="apple-card metric-card p-5">
          <p className="text-sm font-semibold text-muted-foreground">Source resumes</p>
          <p className="mt-2 font-display text-4xl font-semibold leading-none">{resumes.length}</p>
        </div>
        <div className="apple-card metric-card p-5">
          <p className="text-sm font-semibold text-muted-foreground">Application assets</p>
          <p className="mt-2 font-display text-4xl font-semibold leading-none">{currentAssets.length}</p>
        </div>
        <div className="apple-card metric-card p-5">
          <p className="text-sm font-semibold text-muted-foreground">Latest pack item</p>
          <p className="mt-2 text-lg font-semibold">{currentAssets[0]?.asset.type?.replace('_', ' ') || 'None yet'}</p>
        </div>
      </section>

      <section className="grid gap-6 xl:grid-cols-[24rem_1fr]">
        <div className="apple-card p-5">
          <h2 className="text-xl font-semibold">Source resume</h2>
          <div className="mt-4 space-y-3">
            {resumes.length ? resumes.map((resume) => (
              <div key={resume.id} className="rounded-apple border border-card-border bg-surface-container-low p-4">
                <p className="font-semibold">{resume.filename}</p>
                <p className="mt-1 text-sm text-muted-foreground">{new Date(resume.uploadedAt).toLocaleString('en-IN')}</p>
              </div>
            )) : (
              <div className="rounded-apple border border-dashed border-card-border p-6 text-center">
                <FileText className="mx-auto h-8 w-8 text-muted-foreground" />
                <p className="mt-3 text-sm text-muted-foreground">Upload your resume during onboarding or refresh it in Settings to unlock better matches.</p>
              </div>
            )}
          </div>
        </div>

        <div className="apple-card overflow-hidden">
          {currentAssets.length ? currentAssets.map(({ asset, job }) => (
            <div key={asset.id} className="flex flex-col gap-4 border-b border-card-border p-5 last:border-b-0 md:flex-row md:items-center md:justify-between">
              <div>
                <p className="font-semibold capitalize">{asset.type.replace('_', ' ')} v{asset.version}</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  {job?.title || 'Job not found'} · {job?.company || 'Unknown company'} · {new Date(asset.createdAt).toLocaleString('en-IN')}
                </p>
                {asset.atsScore && (
                  <p className="mt-1 flex flex-wrap items-center gap-2 text-sm font-semibold text-success">
                    <span>ATS score {asset.atsScore}%</span>
                    <AdvisoryEstimateLabel />
                  </p>
                )}
              </div>
              <div className="flex flex-wrap gap-2">
                {job && (
                  <a
                    href={job.applyUrl || job.url}
                    target="_blank"
                    rel="noreferrer"
                    aria-label={`Open source job for ${job.title || 'this document'} at ${job.company || 'unknown company'}`}
                    className="design-button-secondary px-4 py-2 text-sm font-semibold"
                  >
                    <ExternalLink className="h-4 w-4" /> Source job
                  </a>
                )}
                {asset.filePath && (
                  <a
                    href={`/api/download?assetId=${encodeURIComponent(String(asset.id))}`}
                    download
                    aria-label={`Download ${asset.type.replace('_', ' ')} v${asset.version || 1}`}
                    className="design-button-primary px-4 py-2 text-sm font-semibold"
                  >
                    <Download className="h-4 w-4" /> Download
                  </a>
                )}
              </div>
            </div>
          )) : (
            <div className="p-10 text-center">
              <FileText className="mx-auto h-10 w-10 text-muted-foreground" />
              <h2 className="mt-4 text-xl font-semibold">No application packs yet</h2>
              <p className="mt-2 text-muted-foreground">Open a strong job match and choose Prepare to start a pack with a tailored resume and ATS guidance.</p>
              <Link href="/discover" className="design-button-primary mt-5 px-5 text-sm font-semibold">
                Find jobs to prepare
              </Link>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
