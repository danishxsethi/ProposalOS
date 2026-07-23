
import { NextResponse } from 'next/server';
import { withAuth } from '@/lib/middleware/auth';
import { Storage } from '@google-cloud/storage';
import { getTenantId } from '@/lib/tenant/context';

const storage = new Storage();
const bucketName = process.env.GCS_BUCKET_NAME || 'proposal-engine-assets';

export const POST = withAuth(async (req: Request) => {
    try {
        const tenantId = await getTenantId();
        if (!tenantId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

        const formData = await req.formData();
        const file = formData.get('file') as File;

        if (!file) {
            return NextResponse.json({ error: 'No file provided' }, { status: 400 });
        }

        if (file.size > 2 * 1024 * 1024) { // 2MB
            return NextResponse.json({ error: 'File too large (max 2MB)' }, { status: 400 });
        }

        const buffer = Buffer.from(await file.arrayBuffer());
        const ext = file.name.split('.').pop();
        const filename = `${tenantId}/logo_${Date.now()}.${ext}`;

        const blob = storage.bucket(bucketName).file(filename);
        const blobStream = blob.createWriteStream({
            resumable: false,
            metadata: {
                contentType: file.type,
            },
        });

        await new Promise((resolve, reject) => {
            blobStream.on('finish', resolve);
            blobStream.on('error', reject);
            blobStream.end(buffer);
        });

        const publicUrl = `https://storage.googleapis.com/${bucketName}/${filename}`;

        return NextResponse.json({ url: publicUrl });
    } catch (error) {
        console.error('Upload error:', error);
        return NextResponse.json({ error: 'Upload failed' }, { status: 500 });
    }
});
