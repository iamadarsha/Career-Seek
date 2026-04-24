/**
 * Document Linkage Service — Phase G
 * 
 * Links generated document assets to application records.
 */

import { getDb } from '../../../db';
import { applicationDocuments, documentAssets } from '../../../db/schema';
import { eq, and } from 'drizzle-orm';
import { addTimelineEvent } from './timeline-service';

export function linkDocument(options: {
  applicationId: number;
  documentAssetId: number;
  documentType: string;
  version?: number;
  atsScore?: number;
}) {
  const db = getDb();

  // Check if already linked
  const existing = db.select().from(applicationDocuments)
    .where(and(
      eq(applicationDocuments.applicationId, options.applicationId),
      eq(applicationDocuments.documentAssetId, options.documentAssetId),
    ))
    .get();

  if (existing) return existing;

  const result = db.insert(applicationDocuments).values({
    applicationId: options.applicationId,
    documentAssetId: options.documentAssetId,
    documentType: options.documentType,
    version: options.version || 1,
    atsScore: options.atsScore || null,
    linkedAt: new Date(),
  }).returning().get();

  addTimelineEvent({
    applicationId: options.applicationId,
    eventType: 'document_attached',
    title: `${options.documentType.replace('_', ' ')} attached`,
    description: `Version ${options.version || 1}${options.atsScore ? ` — ATS: ${options.atsScore}%` : ''}`,
    metadata: { documentType: options.documentType, documentAssetId: options.documentAssetId },
  });

  return result;
}

export function getLinkedDocuments(applicationId: number) {
  const db = getDb();
  const links = db.select()
    .from(applicationDocuments)
    .where(eq(applicationDocuments.applicationId, applicationId))
    .all();

  // Enrich with document asset details
  return links.map(link => {
    const asset = link.documentAssetId
      ? db.select().from(documentAssets).where(eq(documentAssets.id, link.documentAssetId)).get()
      : null;

    return {
      ...link,
      asset,
    };
  });
}

export function unlinkDocument(applicationDocumentId: number) {
  const db = getDb();
  db.delete(applicationDocuments).where(eq(applicationDocuments.id, applicationDocumentId)).run();
}

/**
 * Auto-link any document assets for a scored job that aren't yet linked.
 */
export function autoLinkDocuments(applicationId: number, scoredJobId: number) {
  const db = getDb();
  const assets = db.select().from(documentAssets)
    .where(eq(documentAssets.scoredJobId, scoredJobId))
    .all();

  let linked = 0;
  for (const asset of assets) {
    const existing = db.select().from(applicationDocuments)
      .where(and(
        eq(applicationDocuments.applicationId, applicationId),
        eq(applicationDocuments.documentAssetId, asset.id),
      ))
      .get();

    if (!existing) {
      linkDocument({
        applicationId,
        documentAssetId: asset.id,
        documentType: asset.type,
        version: asset.version || 1,
        atsScore: asset.atsScore || undefined,
      });
      linked++;
    }
  }

  return { linked };
}
