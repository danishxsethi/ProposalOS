import { ReportData, ScanStatus } from './types';

// ─────────────────────────────────────────────
// In-memory scan store (will move to DB later)
// ─────────────────────────────────────────────
export const scanStore = new Map<string, {
    token: string;
    url: string;
    businessName?: string;
    callCount: number;
    createdAt: number;
}>();

// ─────────────────────────────────────────────
// Module definitions (order matters for stagger)
// ─────────────────────────────────────────────
const MOCK_MODULES = [
    { id: 'website', score: 6.2, findingsCount: 3 },
    { id: 'google', score: 4.8, findingsCount: 5 },
    { id: 'seo', score: 5.5, findingsCount: 4 },
    { id: 'reviews', score: 3.9, findingsCount: 6 },
    { id: 'social', score: 4.1, findingsCount: 3 },
    { id: 'competitors', score: 5.0, findingsCount: 4 },
];

const OVERALL_SCORE = 4.9;

// Returns a progressively completing ScanStatus based on how many times
// the status endpoint has been polled for this token.
export function mockScanStatus(token: string): ScanStatus {
    const entry = scanStore.get(token);
    const callCount = entry ? ++entry.callCount : 1;

    // Each module takes ~1-2 polls to complete
    // We advance ~1.5 modules per call so the whole scan completes in ~5 calls (~10s)
    const completeCount = Math.min(Math.floor(callCount * 1.5), MOCK_MODULES.length);
    const isComplete = completeCount >= MOCK_MODULES.length;

    const modules: ScanStatus['modules'] = MOCK_MODULES.map((mod, idx) => {
        if (idx < completeCount) {
            return { id: mod.id, status: 'complete', score: mod.score, findingsCount: mod.findingsCount };
        } else if (idx === completeCount) {
            return { id: mod.id, status: 'scanning' };
        } else {
            return { id: mod.id, status: 'pending' };
        }
    });

    const progress = Math.round((completeCount / MOCK_MODULES.length) * 100);

    return {
        token,
        status: isComplete ? 'complete' : 'scanning',
        modules,
        overallScore: isComplete ? OVERALL_SCORE : undefined,
        progress,
    } as ScanStatus & { progress: number };
}

// ─────────────────────────────────────────────
// Full mock report for development
// ─────────────────────────────────────────────
export const mockReportData: ReportData = {
    token: 'mock-token',
    businessName: 'Saskatoon Family Dental',
    businessUrl: 'saskatoonfamilydental.com',
    overallScore: 49,
    letterGrade: 'D+',
    categories: [
        { id: 'website', name: 'Website Performance', score: 62, summary: 'Your site loads in 4.8s on mobile. Core Web Vitals fail on LCP and CLS.' },
        { id: 'google', name: 'Google Business Profile', score: 48, summary: 'Profile is 62% complete. Missing 14 photos, no Q&A responded to.' },
        { id: 'seo', name: 'SEO & Content', score: 55, summary: '37 pages missing meta descriptions. No schema markup found.' },
        { id: 'reviews', name: 'Reviews & Reputation', score: 39, summary: '3.8★ average across 41 reviews. Response rate is 12%.' },
        { id: 'social', name: 'Social & Presence', score: 41, summary: 'Instagram last posted 73 days ago. Facebook engagement rate is 0.4%.' },
        { id: 'competitors', name: 'Competitive Intelligence', score: 50, summary: 'Prairie Dental scores 71/100 and dominates 8 of your target keywords.' },
    ],
    findings: [
        // Website
        { id: 'w1', category: 'website', severity: 'critical', title: 'Mobile page speed is failing', impact: 'Your site takes 4.8s to load on mobile. 53% of visitors will leave before it loads, costing you an estimated 17 leads/month.', evidence: 'LCP: 4.8s (fail), CLS: 0.31 (fail), FID: 210ms (fail)', fixComplexity: 'moderate' },
        { id: 'w2', category: 'website', severity: 'high', title: 'No HTTPS redirect on www subdomain', impact: 'Google penalizes insecure pages. Patients may see a "Not Secure" warning.', evidence: 'http://www.saskatoonfamilydental.com returns 200 (expected 301)', fixComplexity: 'quick-win' },
        { id: 'w3', category: 'website', severity: 'medium', title: 'Missing accessibility attributes on contact form', impact: 'Screen readers cannot navigate your booking form, excluding ~15% of the population.', evidence: '4 form fields missing aria-label', fixComplexity: 'quick-win' },
        // Google
        { id: 'g1', category: 'google', severity: 'critical', title: 'Google Business Profile only 62% complete', impact: 'Incomplete profiles get 7x fewer clicks. You are missing 14 photos, services list, and FAQ.', evidence: 'GBP completeness score: 62/100 via Google API', fixComplexity: 'quick-win' },
        { id: 'g2', category: 'google', severity: 'high', title: 'Only 1 post in last 90 days', impact: 'Businesses posting weekly get 5x more profile views. You had 1 post vs. competitor average of 18.', evidence: 'Last post: 73 days ago', fixComplexity: 'quick-win' },
        { id: 'g3', category: 'google', severity: 'high', title: 'No Q&A responded to', impact: '12 unanswered questions on your profile damage trust and lose booked appointments.', evidence: '12 questions found, 0 responses', fixComplexity: 'quick-win' },
        { id: 'g4', category: 'google', severity: 'medium', title: 'Booking link not configured', impact: 'Competitors with "Book Online" button get 31% more direct bookings.', evidence: 'booking_uri field empty in GBP', fixComplexity: 'quick-win' },
        { id: 'g5', category: 'google', severity: 'low', title: 'Service areas not fully defined', impact: 'Missing Warman, Martensville, and Osler from service area list.', evidence: '3 nearby high-intent markets unconfigured', fixComplexity: 'quick-win' },
        // SEO
        { id: 's1', category: 'seo', severity: 'critical', title: '37 pages missing meta descriptions', impact: 'Google writes its own snippets for these pages, leading to 22% lower CTR from search results.', evidence: 'Crawled 42 pages; 37 missing meta description', fixComplexity: 'moderate' },
        { id: 's2', category: 'seo', severity: 'high', title: 'No LocalBusiness schema markup', impact: 'Schema markup increases click-through rate by 30% for local searches. All competitors have it.', evidence: 'schema.org/LocalBusiness not found in page source', fixComplexity: 'quick-win' },
        { id: 's3', category: 'seo', severity: 'high', title: 'Not ranking for "Saskatoon invisalign" (720 searches/mo)', impact: 'This keyword has 720 monthly searches and you are not in the top 50 results.', evidence: 'SERP position: not ranked; competitor Prairie Dental: #3', fixComplexity: 'complex' },
        { id: 's4', category: 'seo', severity: 'medium', title: 'Duplicate title tags on 8 pages', impact: 'Search engines choose which version to show, reducing your control over SERP appearance.', evidence: 'Pages /services, /dental-implants, /veneers + 5 others share title tags', fixComplexity: 'quick-win' },
        // Reviews
        { id: 'r1', category: 'reviews', severity: 'critical', title: '3.8★ average — below local average of 4.4★', impact: 'Practices with <4.0★ see 70% fewer booking conversions. You are losing patients before they call.', evidence: 'Google: 3.8★ (41 reviews). Area average: 4.4★ (n=12 practices)', fixComplexity: 'moderate' },
        { id: 'r2', category: 'reviews', severity: 'critical', title: 'Only 12% response rate to reviews', impact: 'Ignoring negative reviews drives away prospects. 88% of your reviews have no response.', evidence: '5 of 41 reviews responded to. 3 negative reviews unaddressed for 60+ days', fixComplexity: 'quick-win' },
        { id: 'r3', category: 'reviews', severity: 'high', title: '3 recent 1-star reviews with no response', impact: 'These reviews appear prominently in search results and are deterring new patients.', evidence: 'Reviews posted 12, 28, and 61 days ago — unanswered', fixComplexity: 'quick-win' },
        { id: 'r4', category: 'reviews', severity: 'high', title: 'No review generation system', impact: 'Prairie Dental averages 8 new reviews/month. You average 0.3/month. The gap widens every month.', evidence: 'Review velocity: Yours 0.3/mo vs competitor avg 6.2/mo', fixComplexity: 'moderate' },
        { id: 'r5', category: 'reviews', severity: 'medium', title: 'Not on Yelp or Healthgrades', impact: '34% of local patients check Yelp before booking a dentist. You have zero presence there.', evidence: 'No claimed profiles on Yelp, Healthgrades, RateMDs', fixComplexity: 'quick-win' },
        { id: 'r6', category: 'reviews', severity: 'low', title: 'Facebook rating hidden', impact: 'Your 4.1★ Facebook rating is not publicly visible. Showing it would boost trust.', evidence: 'FB reviews visibility: private', fixComplexity: 'quick-win' },
        // Social
        { id: 'so1', category: 'social', severity: 'high', title: 'Last Instagram post was 73 days ago', impact: 'An inactive account signals a closed business. Instagram last post recency affects local trust.', evidence: 'Last IG post: 2025-11-17. Competitor avg: 3.4 posts/week', fixComplexity: 'moderate' },
        { id: 'so2', category: 'social', severity: 'medium', title: 'Facebook engagement rate is 0.4%', impact: 'Industry benchmark is 2.1%. Low engagement means Facebook deprioritizes your posts.', evidence: 'Last 30 posts: avg 1.2 likes, 0.1 comments', fixComplexity: 'moderate' },
        { id: 'so3', category: 'social', severity: 'low', title: 'LinkedIn profile unclaimed', impact: 'B2B referrals from dental partners are missed without a LinkedIn presence.', evidence: 'No LinkedIn company page found', fixComplexity: 'quick-win' },
        // Competitors
        { id: 'c1', category: 'competitors', severity: 'critical', title: 'Prairie Dental outranks you on 8 high-value keywords', impact: 'Prairie Dental captures an estimated 340 additional monthly searches you should be getting.', evidence: 'Keywords: dental implants, Saskatoon dentist, family dentist, teeth whitening + 4 more', fixComplexity: 'complex' },
        { id: 'c2', category: 'competitors', severity: 'high', title: 'Competitor has 3x more Google reviews', impact: 'Prairie Dental has 127 reviews at 4.7★. This social proof gap is costing you conversions.', evidence: 'Prairie Dental: 127 reviews. Yours: 41 reviews', fixComplexity: 'moderate' },
        { id: 'c3', category: 'competitors', severity: 'medium', title: 'Competitor runs Google Ads you are not matching', impact: 'You have no paid search presence. Competitors capture high-intent clicks at the top of SERPs.', evidence: 'SFD Dental runs ads for 12 keywords; ads visible in 3 audited searches', fixComplexity: 'complex' },
        { id: 'c4', category: 'competitors', severity: 'medium', title: 'Competitor website is 2.1x faster than yours', impact: 'Speed is a ranking factor. Prairie Dental loads in 2.2s vs your 4.8s.', evidence: 'Prairie Dental LCP: 2.2s vs your 4.8s', fixComplexity: 'moderate' },
    ],
    competitors: [
        { name: 'Prairie Dental Group', url: 'prairiedental.ca', overallScore: 71, reviewCount: 127, pageSpeed: 92, gbpCompleteness: 94 },
        { name: 'Stonebridge Dental', url: 'stonebridgedental.ca', overallScore: 58, reviewCount: 63, pageSpeed: 78, gbpCompleteness: 81 },
        { name: 'SFD Dental Clinic', url: 'sfdental.ca', overallScore: 55, reviewCount: 89, pageSpeed: 71, gbpCompleteness: 76 },
    ]
};

// Mock log entries generated per module completion
export const MOCK_LOG_ENTRIES: Record<string, string[]> = {
    website: ['✓ Page loaded — desktop 3.2s', '⚠ Mobile load time: 4.8s (critical)', '⚠ No HTTPS redirect on www subdomain', '✓ Core Web Vitals: LCP fails on mobile'],
    google: ['✓ Google Business Profile found', '⚠ Profile completeness: 62/100', '⚠ 12 unanswered questions found', '⚠ Last post: 73 days ago'],
    seo: ['✓ 42 pages crawled successfully', '⚠ 37 pages missing meta descriptions', '⚠ No LocalBusiness schema found', '✓ Sitemap.xml present'],
    reviews: ['⚠ Overall rating: 3.8★ (below area avg 4.4★)', '⚠ Response rate: 12% (88% unanswered)', '⚠ 3 recent 1-star reviews without response', '✓ 41 total reviews indexed'],
    social: ['⚠ Instagram: last post 73 days ago', '⚠ Facebook engagement: 0.4% (avg 2.1%)', '✓ Facebook page claimed and verified', '⚠ LinkedIn page not found'],
    competitors: ['✓ 3 competitors identified', '⚠ Prairie Dental outranks on 8 keywords', '⚠ Competitor review gap: 86 more reviews', '✓ No competitor running video ads'],
};
