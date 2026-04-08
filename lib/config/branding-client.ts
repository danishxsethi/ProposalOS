/**
 * White-label Branding Configuration
 * Supports tenant-specific customization for logo, colors, fonts
 */

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
  fontFamily?: {
    heading?: string;
    body?: string;
  };
  // Additional white-label options
  hideBranding?: boolean; // Completely hide ProposalOS branding
  customCss?: string; // Tenant-specific CSS overrides
}

// Safe font family map for white-label theming
export const SAFE_FONT_FAMILIES = {
  sans: [
    'Inter',
    'system-ui',
    '-apple-system',
    'BlinkMacSystemFont',
    'Segoe UI',
    'Roboto',
    'Helvetica Neue',
    'Arial',
    'sans-serif',
  ],
  serif: ['Georgia', 'Cambria', 'Times New Roman', 'Times', 'serif'],
  mono: ['ui-monospace', 'SFMono-Regular', 'Menlo', 'Monaco', 'Consolas', 'monospace'],
  display: ['Oswald', 'Impact', 'system-ui', 'sans-serif'],
  handwritten: ['Caveat', 'Dancing Script', 'cursive'],
} as const;

export type FontFamilyKey = keyof typeof SAFE_FONT_FAMILIES;

export const DEFAULT_BRANDING: BrandingConfig = {
  name: process.env.NEXT_PUBLIC_BRAND_NAME || 'ProposalOS',
  logoUrl: process.env.NEXT_PUBLIC_BRAND_LOGO_URL || null,
  colors: {
    primary: process.env.NEXT_PUBLIC_BRAND_PRIMARY_COLOR || '#2563eb',
    accent: process.env.NEXT_PUBLIC_BRAND_ACCENT_COLOR || '#7c3aed',
    secondary: '#64748b',
  },
  contact: {
    email: process.env.NEXT_PUBLIC_BRAND_CONTACT_EMAIL,
    phone: process.env.NEXT_PUBLIC_BRAND_CONTACT_PHONE,
    website: process.env.NEXT_PUBLIC_BRAND_WEBSITE,
  },
  tagline: process.env.NEXT_PUBLIC_BRAND_TAGLINE || 'Digital Presence Assessment',
  footerText:
    process.env.NEXT_PUBLIC_BRAND_FOOTER_TEXT ||
    `© ${new Date().getFullYear()} ${process.env.NEXT_PUBLIC_BRAND_NAME || 'ProposalOS'}. All rights reserved.`,
  showPoweredBy: true,
  fontFamily: {
    heading: undefined,
    body: undefined,
  },
  hideBranding: false,
  customCss: undefined,
};

export const BRANDING = DEFAULT_BRANDING;

/**
 * Convert hex color to RGBA with opacity
 */
export function getBrandColor(color: string, opacity: number = 1) {
  if (color.startsWith('#')) {
    const r = parseInt(color.slice(1, 3), 16);
    const g = parseInt(color.slice(3, 5), 16);
    const b = parseInt(color.slice(5, 7), 16);
    return `rgba(${r}, ${g}, ${b}, ${opacity})`;
  }
  return color;
}

/**
 * Get safe font family string for CSS
 */
export function getSafeFontFamily(fontKey?: FontFamilyKey, customFont?: string): string {
  if (customFont) {
    return `${customFont}, system-ui, sans-serif`;
  }
  if (fontKey && SAFE_FONT_FAMILIES[fontKey]) {
    return SAFE_FONT_FAMILIES[fontKey].join(', ');
  }
  return SAFE_FONT_FAMILIES.sans.join(', ');
}

/**
 * Generate CSS custom properties for tenant branding
 * Used for dynamic theming in styled components
 */
export function getBrandingCssVariables(branding: BrandingConfig): Record<string, string> {
  return {
    '--brand-primary': branding.colors.primary,
    '--brand-accent': branding.colors.accent,
    '--brand-secondary': branding.colors.secondary || branding.colors.accent,
    '--brand-font-heading': branding.fontFamily?.heading
      ? getSafeFontFamily(undefined, branding.fontFamily.heading)
      : SAFE_FONT_FAMILIES.sans.join(', '),
    '--brand-font-body': branding.fontFamily?.body
      ? getSafeFontFamily(undefined, branding.fontFamily.body)
      : SAFE_FONT_FAMILIES.sans.join(', '),
  };
}

/**
 * Check if branding is fully white-labeled (no ProposalOS references)
 */
export function isWhiteLabeled(branding: BrandingConfig): boolean {
  return branding.hideBranding === true || !branding.showPoweredBy;
}