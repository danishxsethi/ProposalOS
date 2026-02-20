import { MultimodalContent } from './provider';

/**
 * Fetches an image from a GCS URL and returns it as a Buffer
 */
export async function fetchGCSImageAsBuffer(gcsUrl: string): Promise<Buffer> {
    // In a real implementation you would use @google-cloud/storage
    // Currently we use a standard fetch if it's a public URL, or internal GCP tools.
    const response = await fetch(gcsUrl);
    if (!response.ok) {
        throw new Error(`Failed to fetch image from GCS: ${response.statusText}`);
    }
    const arrayBuffer = await response.arrayBuffer();
    return Buffer.from(arrayBuffer);
}

/**
 * Builds a MultimodalContent array from a mix of text strings and GCS image URLs
 */
export async function buildMultimodalPayload(text: string, imageUrls: string[]): Promise<MultimodalContent[]> {
    const payload: MultimodalContent[] = [
        { type: 'text', data: text }
    ];

    for (const url of imageUrls) {
        const buffer = await fetchGCSImageAsBuffer(url);
        // Best effort mime type based on extension
        const mimeType = url.toLowerCase().endsWith('.jpeg') || url.toLowerCase().endsWith('.jpg')
            ? 'image/jpeg'
            : 'image/png';
        payload.push({ type: 'image', data: buffer, mimeType });
    }

    return payload;
}
