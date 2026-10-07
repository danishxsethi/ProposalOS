import { logger } from '@/lib/logger';
import { createProtectedObjectUrl, uploadToS3 } from '@/lib/storage';
import { getTenantIdFromStore } from '@/lib/tenant/context';

export async function uploadPdfToS3(proposalId: string, pdfBuffer: Buffer): Promise<string> {
  try {
    const tenantId = getTenantIdFromStore();
    if (!tenantId) throw new Error('Tenant context is required to store proposal PDFs');

    const key = `proposals/${tenantId}/${proposalId}.pdf`;
    const reference = await uploadToS3(pdfBuffer, key, 'application/pdf');
    const url = createProtectedObjectUrl(reference);

    logger.info(
      {
        event: 'pdf.uploaded',
        proposalId,
        size: pdfBuffer.length,
      },
      'PDF uploaded to S3'
    );

    return url;
  } catch (error) {
    logger.error(
      {
        event: 'pdf.upload_failed',
        proposalId,
        error: error instanceof Error ? error.message : String(error),
      },
      'Failed to upload PDF to S3'
    );
    throw error;
  }
}
