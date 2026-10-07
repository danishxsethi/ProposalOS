import { GetObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

import { logger } from '@/lib/logger';
import { getTenantIdFromStore } from '@/lib/tenant/context';

const s3 = new S3Client({
  region: process.env.AWS_REGION || process.env.AWS_DEFAULT_REGION || 'us-east-2',
});

export interface StorageReference {
  bucket: string;
  key: string;
}

function configuredBucket(): string {
  const bucket = process.env.PROPOSALOS_DATA_BUCKET || process.env.AWS_S3_BUCKET;
  if (!bucket) {
    throw new Error('PROPOSALOS_DATA_BUCKET is required for S3 object storage');
  }
  return bucket;
}

function normalizeKey(key: string): string {
  const normalized = key.replace(/^\/+/, '');
  if (
    !normalized ||
    normalized.includes('\\') ||
    normalized.includes('\0') ||
    normalized.split('/').some((part) => !part || part === '.' || part === '..') ||
    Buffer.byteLength(normalized, 'utf8') > 1024
  ) {
    throw new Error('Invalid S3 object key');
  }
  return normalized;
}

export function parseStorageReference(reference: string): StorageReference {
  const match = /^s3:\/\/([^/]+)\/(.+)$/.exec(reference);
  if (!match?.[1] || !match[2]) {
    throw new Error('Expected an s3://bucket/key storage reference');
  }
  return { bucket: match[1], key: normalizeKey(match[2]) };
}

export function createStorageReference(key: string): string {
  return `s3://${configuredBucket()}/${normalizeKey(key)}`;
}

export function createProtectedObjectUrl(reference: string): string {
  const baseUrl = process.env.BASE_URL || process.env.NEXT_PUBLIC_APP_URL;
  if (!baseUrl) {
    throw new Error('BASE_URL or NEXT_PUBLIC_APP_URL is required for protected object URLs');
  }
  const url = new URL('/api/storage/private', baseUrl);
  url.searchParams.set('ref', reference);
  return url.toString();
}

export function createPublicTenantLogoUrl(tenantId: string, key: string): string {
  const baseUrl = process.env.BASE_URL || process.env.NEXT_PUBLIC_APP_URL;
  if (!baseUrl) {
    throw new Error('BASE_URL or NEXT_PUBLIC_APP_URL is required for public logo URLs');
  }
  const url = new URL('/api/public/tenant-logo', baseUrl);
  url.searchParams.set('tenantId', tenantId);
  url.searchParams.set('key', normalizeKey(key));
  return url.toString();
}

export async function uploadToS3(
  buffer: Buffer,
  key: string,
  contentType = 'application/octet-stream'
): Promise<string> {
  const reference = createStorageReference(key);
  const { bucket, key: objectKey } = parseStorageReference(reference);

  await s3.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: objectKey,
      Body: buffer,
      ContentType: contentType,
      CacheControl: 'private, no-store',
    })
  );

  return reference;
}

export async function getStorageObject(reference: string): Promise<{
  body: Buffer;
  contentType?: string;
}> {
  const { bucket, key } = parseStorageReference(reference);
  if (bucket !== configuredBucket()) {
    throw new Error('Storage reference is outside the configured ProposalOS bucket');
  }

  const response = await s3.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
  if (!response.Body) throw new Error('S3 returned an empty object body');

  return {
    body: Buffer.from(await response.Body.transformToByteArray()),
    contentType: response.ContentType,
  };
}

export async function getProtectedObjectUrl(
  reference: string,
  expiresInSeconds = 300
): Promise<string> {
  const { bucket, key } = parseStorageReference(reference);
  if (bucket !== configuredBucket()) {
    throw new Error('Storage reference is outside the configured ProposalOS bucket');
  }
  if (!Number.isInteger(expiresInSeconds) || expiresInSeconds < 1 || expiresInSeconds > 900) {
    throw new Error('Protected object URLs may be valid for at most 15 minutes');
  }

  return getSignedUrl(s3, new GetObjectCommand({ Bucket: bucket, Key: key }), {
    expiresIn: expiresInSeconds,
  });
}

/** Upload a generated PDF and return its stable S3 reference. */
export async function uploadPdf(buffer: Buffer, filename: string): Promise<string | null> {
  try {
    const tenantId = getTenantIdFromStore();
    if (!tenantId) throw new Error('Tenant context is required to store proposal PDFs');

    const reference = await uploadToS3(
      buffer,
      `proposals/${tenantId}/${normalizeKey(filename)}`,
      'application/pdf'
    );
    return createProtectedObjectUrl(reference);
  } catch (error) {
    logger.error({ error }, 'Failed to upload PDF to S3');
    return null;
  }
}
