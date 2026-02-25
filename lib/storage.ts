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

        return `https://storage.googleapis.com/${bucketName}/proposals/${filename}`;
    } catch (error) {
        console.error('Failed to upload PDF to GCS:', error);
        return null;
    }
}

/**
 * Upload any buffer to Google Cloud Storage
 * @param buffer The file buffer to upload
 * @param filename The name of the file in GCS
 * @param contentType Optional content type (e.g., 'application/pdf', 'application/zip')
 */
export async function uploadToGCS(buffer: Buffer, filename: string, contentType?: string): Promise<string | null> {
    if (!bucketName) {
        console.warn('GCS_BUCKET_NAME not set, skipping upload');
        return null;
    }

    try {
        const bucket = storage.bucket(bucketName);
        const file = bucket.file(filename);

        await file.save(buffer, {
            contentType: contentType || 'application/octet-stream',
            resumable: false,
        });

        return `https://storage.googleapis.com/${bucketName}/${filename}`;
    } catch (error) {
        console.error('Failed to upload to GCS:', error);
        return null;
    }
}
