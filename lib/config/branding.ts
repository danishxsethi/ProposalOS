import { prisma } from '@/lib/prisma';
import { unstable_cache } from 'next/cache';

import { BrandingConfig, DEFAULT_BRANDING, BRANDING, getBrandColor } from './branding-client';

export type { BrandingConfig };
export { DEFAULT_BRANDING, BRANDING, getBrandColor };

// Cache for 5 minutes
export const getBranding = unstable_cache(
    async (tenantId?: string | null): Promise<BrandingConfig> => {
        if (!tenantId) return DEFAULT_BRANDING;

        try {
            const tenantBranding = await prisma.tenantBranding.findUnique({
                where: { tenantId },
            });

            if (!tenantBranding) return DEFAULT_BRANDING;

            return {
                name: tenantBranding.brandName || DEFAULT_BRANDING.name,
                logoUrl: tenantBranding.logoUrl || DEFAULT_BRANDING.logoUrl,
                colors: {
                    primary: tenantBranding.primaryColor || DEFAULT_BRANDING.colors.primary,
                    accent: tenantBranding.accentColor || DEFAULT_BRANDING.colors.accent,
                    secondary: tenantBranding.secondaryColor || DEFAULT_BRANDING.colors.secondary,
                },
                contact: {
                    email: tenantBranding.contactEmail || DEFAULT_BRANDING.contact.email,
                    phone: tenantBranding.contactPhone || DEFAULT_BRANDING.contact.phone,
                    website: tenantBranding.websiteUrl || DEFAULT_BRANDING.contact.website,
                },
                tagline: tenantBranding.tagline || DEFAULT_BRANDING.tagline,
                footerText: tenantBranding.footerText || DEFAULT_BRANDING.footerText,
                showPoweredBy: tenantBranding.showPoweredBy,
            };
        } catch (error) {
            console.error('Failed to fetch branding:', error);
            return DEFAULT_BRANDING; // Fallback safely
        }
    },
    ['tenant_branding'],
    { revalidate: 300, tags: ['branding'] }
);

