import { NextResponse } from 'next/server';
import * as fs from 'fs';
import * as path from 'path';
import { getBaseAppDir } from '@/lib/local-paths';
import { getDb } from '@/db';
import { documentAssets } from '@/db/schema';
import { and, eq } from 'drizzle-orm';
import { resolveContext } from '@/lib/platform/identity';
import { apiError, apiException } from '@/lib/api/errors';

function isPathInside(childPath: string, parentPath: string) {
  const relative = path.relative(parentPath, childPath);
  return Boolean(relative) && !relative.startsWith('..') && !path.isAbsolute(relative);
}

function contentTypeFor(filename: string) {
  if (filename.endsWith('.docx')) return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
  if (filename.endsWith('.pdf')) return 'application/pdf';
  if (filename.endsWith('.txt')) return 'text/plain; charset=utf-8';
  return 'application/octet-stream';
}

const ALLOWED_EXTENSIONS = new Set(['.docx', '.pdf', '.txt']);

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const assetIdRaw = searchParams.get('assetId');
  const legacyFilePath = searchParams.get('path');
  const db = getDb();
  const { profileId } = resolveContext();

  let filePath: string | null = null;

  if (assetIdRaw) {
    const assetId = Number(assetIdRaw);
    if (!Number.isInteger(assetId)) {
      return apiError('invalid_asset_id', 'The download link is invalid.', 400, 'Regenerate the document or use the download button again.');
    }

    const asset = db.select().from(documentAssets)
      .where(and(eq(documentAssets.id, assetId), eq(documentAssets.profileId, profileId)))
      .get();

    if (!asset?.filePath) {
      return apiError('asset_not_found', 'That generated document was not found for this profile.', 404, 'Open Documents and regenerate it if needed.');
    }
    filePath = asset.filePath;
  } else if (legacyFilePath) {
    const ownedAsset = db.select().from(documentAssets)
      .where(and(eq(documentAssets.filePath, legacyFilePath), eq(documentAssets.profileId, profileId)))
      .get();
    if (!ownedAsset) {
      return apiError('download_not_allowed', 'Downloads must reference a generated Career Seek document.', 403);
    }
    filePath = legacyFilePath;
  }

  if (!filePath) {
    return apiError('missing_asset_id', 'Missing download asset id.', 400);
  }

  const resolvedPath = path.resolve(filePath);
  const appBase = path.resolve(getBaseAppDir());
  if (!isPathInside(resolvedPath, appBase)) {
    return apiError('path_not_allowed', 'Downloads are restricted to the local Career Seek data folder.', 403);
  }

  if (!ALLOWED_EXTENSIONS.has(path.extname(resolvedPath).toLowerCase())) {
    return apiError('unsupported_download_type', 'This document type cannot be downloaded from Career Seek.', 403);
  }

  if (!fs.existsSync(resolvedPath)) {
    return apiError('file_missing', 'The generated file is missing on disk.', 404, 'Regenerate the document from the job action panel.');
  }

  const stat = fs.statSync(resolvedPath);
  if (!stat.isFile()) {
    return apiError('not_a_file', 'The requested download path is not a file.', 400);
  }

  try {
    const fileBuffer = fs.readFileSync(resolvedPath);
    const filename = path.basename(resolvedPath);

    return new NextResponse(fileBuffer, {
      headers: {
        'Content-Type': contentTypeFor(filename),
        'Content-Disposition': `attachment; filename="${filename}"`,
      },
    });
  } catch (error) {
    console.error('Error serving file:', error);
    return apiException(error, 'download_failed', 500, 'Regenerate the document or check System Status for file storage issues.');
  }
}
