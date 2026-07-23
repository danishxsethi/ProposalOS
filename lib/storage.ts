import { Storage } from '@google-cloud/storage';

const storage = new Storage();
const bucketName = process.env.GCS_BUCKET_NAME;

/**
 * Upload a PDF buffer to Google Cloud Storage
 * @returns Public URL of the uploaded file
 */
export async function uploadPdf(buffer: Buffer, filename: string): Promise<string | null> {
    if (!bucketName) {
        console.warn('GCS_BUCKET_NAME not set, skipping PDF upload');
        return null;
    }

    try {
        const bucket = storage.bucket(bucketName);
        const file = bucket.file(`proposals/${filename}`);

        await file.save(buffer, {
            contentType: 'application/pdf',
            resumable: false,
        });

        // Make it public? Or just return the public URL?
        // Usually safer to use signed URLs or make bucket public?
        // Let's assume public read or return the public URL format
        // https://storage.googleapis.com/BUCKET_NAME/FILE_PATH
        return `https://storage.googleapis.com/${bucketName}/proposals/${filename}`;
    } catch (error) {
        console.error('Failed to upload PDF to GCS:', error);
        return null;
    }
}
