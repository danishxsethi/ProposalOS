import { prisma } from '@/lib/prisma';
import { unstable_cache } from 'next/cache';

export interface BrandingConfig {
    name: string;
    logoUrl: string | null;
    colors: {
        primary: string;
        accent: string;
        secondary?: string;
    };
    contact: {
        email?: string;
        phone?: string;
        website?: string;
    };
    tagline: string;
    footerText: string;
    showPoweredBy: boolean;
}

const DEFAULT_BRANDING: BrandingConfig = {
    name: process.env.BRAND_NAME || 'ProposalOS',
    logoUrl: process.env.BRAND_LOGO_URL || null,
    colors: {
        primary: process.env.BRAND_PRIMARY_COLOR || '#8B5CF6',
        accent: process.env.BRAND_ACCENT_COLOR || '#38BDF8',
        secondary: '#F59E0B',
    },
    contact: {
        email: process.env.BRAND_CONTACT_EMAIL,
        phone: process.env.BRAND_CONTACT_PHONE,
        website: process.env.BRAND_WEBSITE,
    },
    tagline: process.env.BRAND_TAGLINE || 'Digital Presence Assessment',
    footerText: process.env.BRAND_FOOTER_TEXT || `© ${new Date().getFullYear()} ${process.env.BRAND_NAME || 'ProposalOS'}. All rights reserved.`,
    showPoweredBy: true,
};

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

// Deprecated export for backward compatibility during migration
export const BRANDING = DEFAULT_BRANDING;

export function getBrandColor(color: string, opacity: number = 1) {
    if (color.startsWith('#')) {
        const r = parseInt(color.slice(1, 3), 16);
        const g = parseInt(color.slice(3, 5), 16);
        const b = parseInt(color.slice(5, 7), 16);
        return `rgba(${r}, ${g}, ${b}, ${opacity})`;
    }
    return color;
}
