import { safeFetch } from '@/lib/security/safeFetch';
import { getStorageObject } from '@/lib/storage';

import { MultimodalContent } from './provider';

/**
 * Fetches an S3-backed ProposalOS image or an external image URL as a Buffer.
 */
export async function fetchImageAsBuffer(imageUrl: string): Promise<Buffer> {
  if (imageUrl.startsWith('s3://')) {
    return (await getStorageObject(imageUrl)).body;
  }

  const parsedUrl = new URL(imageUrl);
  if (parsedUrl.pathname === '/api/storage/private') {
    const reference = parsedUrl.searchParams.get('ref');
    if (!reference) throw new Error('Protected S3 image URL is missing its storage reference');
    return (await getStorageObject(reference)).body;
  }

  const response = await safeFetch(imageUrl);
  if (!response.ok) {
    throw new Error(`Failed to fetch image: ${response.statusText}`);
  }
  const arrayBuffer = await response.arrayBuffer();
  return Buffer.from(arrayBuffer);
}

/**
 * Builds a MultimodalContent array from text and image URLs or S3 references.
 */
export async function buildMultimodalPayload(
  text: string,
  imageUrls: string[]
): Promise<MultimodalContent[]> {
  const payload: MultimodalContent[] = [{ type: 'text', data: text }];

  for (const url of imageUrls) {
    const buffer = await fetchImageAsBuffer(url);
    // Best effort mime type based on extension
    const mimeType =
      url.toLowerCase().endsWith('.jpeg') || url.toLowerCase().endsWith('.jpg')
        ? 'image/jpeg'
        : 'image/png';
    payload.push({ type: 'image', data: buffer, mimeType });
  }

  return payload;
}
