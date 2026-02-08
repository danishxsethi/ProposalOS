import { NextResponse } from 'next/server';
import { withAuth } from '@/lib/middleware/auth';
import { prisma } from '@/lib/prisma';
import { getTenantId } from '@/lib/tenant/context';
import dns from 'dns';
import util from 'util';

const resolveTxt = util.promisify(dns.resolveTxt);

export const POST = withAuth(async (req: Request) => {
    try {
        const tenantId = await getTenantId();
        const body = await req.json();
        const { domain } = body;

        if (!domain) return NextResponse.json({ error: 'Domain required' }, { status: 400 });

        // 1. Check if domain is already taken
        const existing = await prisma.tenantBranding.findUnique({
            where: { customDomain: domain }
        });

        if (existing && existing.tenantId !== tenantId) {
            return NextResponse.json({ error: 'Domain already registered by another tenant' }, { status: 409 });
        }

        // 2. Generate/Get Verification Token
        // For simplicity, we use the tenant ID as the verification token suffix 
        // OR we store a specific token. user suggested " _proposalengine-verify.{domain} -> {token} "
        // We can use the tenantId as the token for now, or a hash.
        const verificationToken = `proposal-verify=${tenantId}`;
        const hostToCheck = `_proposalengine-verify.${domain}`;

        // 3. Check DNS
        let verified = false;
        try {
            const records = await resolveTxt(hostToCheck);
            // records is array of arrays of strings
            const flatRecords = records.flat();
            if (flatRecords.includes(verificationToken)) {
                verified = true;
            }
        } catch (e: any) {
            console.log('DNS Lookupp failed', e.code);
            // If ENOTFOUND, simply not verified
        }

        if (!verified) {
            // Save the domain as pending if not already
            await prisma.tenantBranding.upsert({
                where: { tenantId: tenantId! },
                update: { customDomain: domain, customDomainVerified: false },
                create: { tenantId: tenantId!, customDomain: domain, customDomainVerified: false }
            });

            return NextResponse.json({
                verified: false,
                token: verificationToken,
                host: hostToCheck,
                message: 'TXT record not found'
            });
        }

        // 4. Mark Verified
        await prisma.tenantBranding.upsert({
            where: { tenantId: tenantId! },
            update: {
                customDomain: domain,
                customDomainVerified: true,
                customDomainVerifiedAt: new Date()
            },
            create: {
                tenantId: tenantId!,
                customDomain: domain,
                customDomainVerified: true,
                customDomainVerifiedAt: new Date()
            }
        });

        return NextResponse.json({ verified: true });

    } catch (error) {
        console.error(error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
});
