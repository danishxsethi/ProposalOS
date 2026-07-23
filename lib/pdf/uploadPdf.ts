import { Storage } from '@google-cloud/storage';
import { logger } from '@/lib/logger';

const storage = new Storage({
    projectId: process.env.GCP_PROJECT_ID,
});

const bucketName = process.env.GCS_BUCKET_NAME || 'proposalus-pdfs';

export async function uploadPdfToGCS(
    proposalId: string,
    pdfBuffer: Buffer
): Promise<string> {
    try {
        const bucket = storage.bucket(bucketName);
        const fileName = `proposals/${proposalId}.pdf`;
        const file = bucket.file(fileName);

        await file.save(pdfBuffer, {
            metadata: {
                contentType: 'application/pdf',
                cacheControl: 'public, max-age=86400', // 24 hours
            },
        });

        // Make publicly accessible
        await file.makePublic();

        const publicUrl = `https://storage.googleapis.com/${bucketName}/${fileName}`;

        logger.info(
            {
                event: 'pdf.uploaded',
                proposalId,
                fileName,
                size: pdfBuffer.length,
                url: publicUrl,
            },
            'PDF uploaded to GCS'
        );

        return publicUrl;
    } catch (error) {
        logger.error(
            {
                event: 'pdf.upload_failed',
                proposalId,
                error: error instanceof Error ? error.message : String(error),
            },
            'Failed to upload PDF to GCS'
        );
        throw error;
    }
}
