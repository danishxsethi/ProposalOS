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

export const DEFAULT_BRANDING: BrandingConfig = {
    name: process.env.NEXT_PUBLIC_BRAND_NAME || 'ProposalOS',
    logoUrl: process.env.NEXT_PUBLIC_BRAND_LOGO_URL || null,
    colors: {
        primary: process.env.NEXT_PUBLIC_BRAND_PRIMARY_COLOR || '#8B5CF6',
        accent: process.env.NEXT_PUBLIC_BRAND_ACCENT_COLOR || '#38BDF8',
        secondary: '#F59E0B',
    },
    contact: {
        email: process.env.NEXT_PUBLIC_BRAND_CONTACT_EMAIL,
        phone: process.env.NEXT_PUBLIC_BRAND_CONTACT_PHONE,
        website: process.env.NEXT_PUBLIC_BRAND_WEBSITE,
    },
    tagline: process.env.NEXT_PUBLIC_BRAND_TAGLINE || 'Digital Presence Assessment',
    footerText: process.env.NEXT_PUBLIC_BRAND_FOOTER_TEXT || `© ${new Date().getFullYear()} ${process.env.NEXT_PUBLIC_BRAND_NAME || 'ProposalOS'}. All rights reserved.`,
    showPoweredBy: true,
};

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
