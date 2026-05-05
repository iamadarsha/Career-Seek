import fs from 'fs';
import path from 'path';
import { getAppSubDir } from '@/lib/local-paths';

export interface StoredObjectMetadata {
  sourcePath: string;
  objectKey: string;
  contentType?: string;
  sizeBytes: number;
  createdAt: string;
  storageMode: 'local-object-mirror';
  minioEndpoint?: string;
  metadata?: Record<string, unknown>;
}

function safeObjectPart(value: string) {
  return value.replace(/[^a-z0-9._/-]+/gi, '_').replace(/^\/+/, '').slice(0, 180);
}

export async function mirrorFileToLocalObjectStore(
  filePath: string,
  objectKey: string,
  metadata: Record<string, unknown> = {},
  contentType?: string,
): Promise<StoredObjectMetadata> {
  const stat = fs.statSync(filePath);
  const root = path.join(getAppSubDir('exports'), 'object-store');
  const key = safeObjectPart(objectKey);
  const target = path.join(root, key);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.copyFileSync(filePath, target);

  const sidecar: StoredObjectMetadata = {
    sourcePath: filePath,
    objectKey: key,
    contentType,
    sizeBytes: stat.size,
    createdAt: new Date().toISOString(),
    storageMode: 'local-object-mirror',
    minioEndpoint: process.env.MINIO_ENDPOINT,
    metadata,
  };
  fs.writeFileSync(`${target}.metadata.json`, JSON.stringify(sidecar, null, 2), 'utf8');
  return sidecar;
}
