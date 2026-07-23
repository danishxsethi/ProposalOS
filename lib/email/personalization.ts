export interface ProspectMetadata {
    industry?: string;
    role?: string;
    sizeScope?: string;
    competitors?: string[];
}

export function generatePersonalizationDirectives(meta: ProspectMetadata): string {
    const directives: string[] = [];

    // Industry vocabulary
    const industryLower = (meta.industry || '').toLowerCase();
    if (industryLower.includes('dent') || industryLower.includes('medical')) {
        directives.push("Use terminology like 'your practice', 'patients', 'appointment bookings', and 'clinical reputation'.");
    } else if (industryLower.includes('auto') || industryLower.includes('car')) {
        directives.push("Use terminology like 'your dealership', 'inventory visibility', 'service appointments', and 'car buyers'.");
    } else if (industryLower.includes('home') || industryLower.includes('plumb') || industryLower.includes('roof')) {
        directives.push("Use terminology like 'your service area', 'dispatch calls', 'homeowners', and 'service radius'.");
    } else if (industryLower.includes('law') || industryLower.includes('legal')) {
        directives.push("Use terminology like 'your firm', 'case volume', 'retained clients', and 'practice areas'.");
    } else {
        directives.push("Use standard B2B business terminology ('your business', 'customers', 'qualified leads', 'revenue').");
    }

    // Role framing
    const roleLower = (meta.role || 'owner').toLowerCase();
    if (roleLower.includes('owner') || roleLower.includes('founder') || roleLower.includes('ceo')) {
        directives.push("Frame the conversation around high-level operational risk, bottom-line ROI, and market share capture.");
    } else if (roleLower.includes('market')) {
        directives.push("Frame the conversation around ROAS, lead attribution, conversion rate optimization, and brand visibility.");
    } else if (roleLower.includes('manager')) {
        directives.push("Frame the conversation around operational efficiency, streamlining growth, and reducing your team's manual overhead.");
    }

    // Size Scope
    const sizeLower = (meta.sizeScope || '').toLowerCase();
    if (sizeLower.includes('solo') || sizeLower.includes('single')) {
        directives.push("Acknowledge that they wear many hats. Keep the tone conversational, helpful, and extremely practical.");
    } else if (sizeLower.includes('multi') || sizeLower.includes('franchise')) {
        directives.push("Address the complexity of managing multiple localized markets simultaneously. Tone should be highly professional and scale-oriented.");
    } else if (sizeLower.includes('enterprise')) {
        directives.push("Adopt an enterprise-grade consultant tone. Focus on systemic infrastructure vulnerabilities and competitive market dominance.");
    }

    // Competitors
    if (meta.competitors && meta.competitors.length > 0) {
        directives.push(`Reference their local competitors explicitly by name contextually to provoke urgency: ${meta.competitors.slice(0, 2).join(', ')}.`);
    }

    return "Crucial Personalization Directives for this sequence:\n" + directives.map(d => `- ${d}`).join('\n');
}
