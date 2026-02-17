type PainKey =
    | 'websiteSpeed'
    | 'mobileBroken'
    | 'gbpNeglected'
    | 'noSsl'
    | 'zeroReviewResponses'
    | 'socialDead'
    | 'competitorsOutperforming'
    | 'accessibilityViolations';

const GENERIC_MAP: Record<PainKey, string> = {
    websiteSpeed: 'people leave before they see your offer',
    mobileBroken: 'mobile visitors cannot take action quickly',
    gbpNeglected: 'you miss map visibility and local calls',
    noSsl: 'new visitors lose trust fast',
    zeroReviewResponses: 'buyers read silence as poor service',
    socialDead: 'your brand looks inactive',
    competitorsOutperforming: 'nearby competitors win the first click',
    accessibilityViolations: 'some customers cannot use your site',
};

const VERTICAL_MAP: Record<string, Partial<Record<PainKey, string>>> = {
    dental: {
        websiteSpeed: 'patients bounce before booking',
        mobileBroken: 'patients cannot tap-to-call from their phone',
        gbpNeglected: 'you miss local map calls from new patients',
        noSsl: 'patients hesitate to submit forms',
        zeroReviewResponses: 'reviews look ignored to new patients',
        socialDead: 'referrals cannot quickly trust your practice',
        competitorsOutperforming: 'other clinics capture high-intent searches',
        accessibilityViolations: 'ADA issues can block patient access',
    },
    restaurant: {
        websiteSpeed: 'diners leave before seeing your menu',
        mobileBroken: 'diners cannot order or reserve from phone',
        gbpNeglected: 'you miss map traffic for nearby food searches',
        noSsl: 'guests avoid online orders',
        zeroReviewResponses: 'bad reviews sit unanswered publicly',
        socialDead: 'your place looks closed or inactive',
        competitorsOutperforming: 'nearby spots win the dinner decision',
        accessibilityViolations: 'some guests cannot access key info',
    },
    hvac: {
        websiteSpeed: 'homeowners leave before requesting service',
        mobileBroken: 'people cannot request a quote on mobile',
        gbpNeglected: 'you miss emergency local calls',
        noSsl: 'homeowners avoid submitting service forms',
        zeroReviewResponses: 'trust drops when reviews get no reply',
        socialDead: 'your company looks inactive between seasons',
        competitorsOutperforming: 'other contractors win urgent calls',
        accessibilityViolations: 'some homeowners cannot submit requests',
    },
    legal: {
        websiteSpeed: 'potential clients leave before contacting you',
        mobileBroken: 'clients cannot request a consult on mobile',
        gbpNeglected: 'you miss local intent searches',
        noSsl: 'clients hesitate to share case details',
        zeroReviewResponses: 'unanswered reviews reduce trust',
        socialDead: 'your firm looks inactive to prospects',
        competitorsOutperforming: 'other firms capture high-value searches',
        accessibilityViolations: 'ADA risk and blocked client access',
    },
    'med-spa': {
        websiteSpeed: 'high-intent visitors leave before booking',
        mobileBroken: 'clients cannot book from phone in the moment',
        gbpNeglected: 'you miss map-pack discovery',
        noSsl: 'clients avoid submitting treatment inquiries',
        zeroReviewResponses: 'social proof weakens quickly',
        socialDead: 'the brand feels inactive and dated',
        competitorsOutperforming: 'other med spas win local demand',
        accessibilityViolations: 'some clients cannot access booking paths',
    },
};

export function toVerticalBusinessPain(vertical: string, key: PainKey): string {
    const normalized = vertical.trim().toLowerCase();
    const verticalMap = VERTICAL_MAP[normalized];
    return verticalMap?.[key] ?? GENERIC_MAP[key];
}

export function topPainSentence(vertical: string, keys: PainKey[]): string {
    const unique = [...new Set(keys)];
    if (unique.length === 0) return 'you are leaking demand online';
    const phrases = unique.slice(0, 2).map((key) => toVerticalBusinessPain(vertical, key));
    return phrases.join(' and ');
}

