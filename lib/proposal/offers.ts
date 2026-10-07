/**
 * Canonical Offer Ladder & Commercial Configuration
 *
 * Single Source of Truth for:
 * 1. Tier 0: Free Forensic Digital Audit (already run, delivered upfront)
 * 2. Tier 1: Foundation Quick-Win Pilot (fixed-scope, fixed-price, 5-7 days)
 * 3. Tier 2: Growth Acceleration Engagement (core recommended package, 10-14 days)
 * 4. Tier 3: Dominance / Enterprise Anchor (anchor decoy pricing, 20-30 days)
 * 5. Risk Reversal: 30-Day Measurable Impact Sprint Guarantee (legally sound, FTC-safe)
 * 6. Single Global CTA: Book a 15-Minute Strategy Call
 * 7. Urgency / Pricing Expiry: Locked for 14 days from audit creation
 * 8. Verticalized Social Proof Case Studies
 */

export interface OfferTierDefinition {
  id: 'starter' | 'growth' | 'premium';
  name: string;
  badge?: string;
  recommended: boolean;
  tagline: string;
  scopeSummary: string;
  deliveryTimeline: string;
  basePriceUSD: number;
  marketAdjustedPrice?: number;
  features: string[];
  deliverables: Array<{
    title: string;
    description: string;
    timeline: string;
  }>;
}

export interface RiskReversalGuarantee {
  title: string;
  badge: string;
  summary: string;
  terms: string[];
  disclaimer: string;
}

export interface SocialProofCaseStudy {
  clientName: string;
  vertical: string;
  headline: string;
  metrics: Array<{
    label: string;
    value: string;
    timeframe: string;
  }>;
  quote: string;
  author: string;
  role: string;
}

export interface IndustryEvidenceBenchmark {
  vertical: string;
  headline: string;
  statHighlight: string;
  citation: string;
  context: string;
  metrics: Array<{
    label: string;
    value: string;
    source: string;
  }>;
}

export interface CanonicalOffersConfig {
  brandName: string;
  brandDomain: string;
  defaultCalendarUrl: string;
  singleCtaText: string;
  singleCtaSubtext: string;
  urgencyDays: number;
  tiers: {
    starter: OfferTierDefinition;
    growth: OfferTierDefinition;
    premium: OfferTierDefinition;
  };
  guarantee: RiskReversalGuarantee;
  realCaseStudies: Record<string, SocialProofCaseStudy>;
  evidenceBenchmarks: Record<string, IndustryEvidenceBenchmark>;
}

export const CANONICAL_OFFERS: CanonicalOffersConfig = {
  brandName: 'Claraud',
  brandDomain: 'claraud.com',
  defaultCalendarUrl: process.env.OUTREACH_CALENDAR_URL || 'https://claraud.com/book',
  singleCtaText: 'Schedule 15-Min Action Plan Call',
  singleCtaSubtext: 'Review implementation roadmap & lock in audit pricing',
  urgencyDays: 14,
  tiers: {
    starter: {
      id: 'starter',
      name: 'Foundation Sprint',
      badge: 'Quick-Win Pilot',
      recommended: false,
      tagline: 'Rapid technical patch for immediate crawlability & trust',
      scopeSummary: 'Immediate resolution of critical schema missingness and metadata leaks.',
      deliveryTimeline: '5 business days',
      basePriceUSD: 797,
      features: [
        'Complete LocalBusiness & Industry Schema deployment (JSON-LD)',
        'Sitelinks Searchbox & Breadcrumb hierarchy validation',
        'Meta title & description repair across primary landing pages',
        'Google Business Profile core fields & category audit',
        'Independent Rich Results & schema validation proof report',
      ],
      deliverables: [
        {
          title: 'Structured Data Foundation',
          description: 'Deploy valid Schema.org markup so Google recognizes your exact service profile.',
          timeline: 'Days 1–3',
        },
        {
          title: 'Snippet & Title Optimization',
          description: 'Fix truncated or missing search meta tags to lift search CTR.',
          timeline: 'Days 3–4',
        },
        {
          title: 'Verification & Handoff',
          description: 'Run Google Rich Results test & deliver verified deployment log.',
          timeline: 'Day 5',
        },
      ],
    },
    growth: {
      id: 'growth',
      name: 'Growth Acceleration',
      badge: 'Most Popular • Decoy Anchored',
      recommended: true,
      tagline: 'Complete technical SEO overhaul + automated local review surge',
      scopeSummary: 'Full-spectrum fix for revenue leaks, competitor overtake, and speed optimization.',
      deliveryTimeline: '10 business days',
      basePriceUSD: 2497,
      features: [
        'Everything in Foundation Sprint (all schemas & metadata)',
        'Review acceleration workflow & Google review response protocol',
        'Local citation audit & sync across top 40 authoritative directories',
        'Mobile Core Web Vitals optimization (<1.8s LCP target)',
        'Competitive gap sprint targeting high-intent local keywords',
        'Direct email conversion capture & engagement form optimization',
        'Priority Slack/email engineering support for 30 days post-launch',
      ],
      deliverables: [
        {
          title: 'Technical Infrastructure & Schema',
          description: 'Total structured data repair including FAQPage, Rating, and Medical/Service types.',
          timeline: 'Days 1–4',
        },
        {
          title: 'Speed & Core Web Vitals Sprint',
          description: 'Minify assets, lazy load resources, optimize critical rendering path for mobile.',
          timeline: 'Days 4–7',
        },
        {
          title: 'Local Authority & Review Capture System',
          description: 'Deploy automated review request flow to steadily erase competitor review gaps.',
          timeline: 'Days 7–10',
        },
      ],
    },
    premium: {
      id: 'premium',
      name: 'Market Dominance',
      badge: 'Complete Digital Moat',
      recommended: false,
      tagline: 'Full agency-grade turnkey management, ongoing CRO & multi-location defense',
      scopeSummary: 'Comprehensive digital engineering partner for regional market leadership.',
      deliveryTimeline: '20 business days',
      basePriceUSD: 4997,
      features: [
        'Everything in Growth Acceleration',
        'Multi-location or multi-page technical architecture rebuild',
        'Quarterly competitive intelligence & rank defense monitoring',
        'Bi-weekly conversion rate split-testing on primary intake forms',
        'Custom local schema graph architecture with automated sync',
        'Dedicated Senior Digital Engineer + monthly executive ROI review',
      ],
      deliverables: [
        {
          title: 'Deep Architecture & Speed Re-engineering',
          description: 'Comprehensive code overhaul targeting sub-second load times.',
          timeline: 'Days 1–10',
        },
        {
          title: 'Omni-channel Local Optimization',
          description: 'Full footprint synchronization across maps, directories, and review aggregators.',
          timeline: 'Days 10–16',
        },
        {
          title: 'Ongoing Growth Engine & Split-Testing',
          description: 'Deploy conversion tracking telemetry and establish automated A/B experimentation.',
          timeline: 'Days 16–20',
        },
      ],
    },
  },
  guarantee: {
    title: 'The 30-Day Measurable Impact Sprint Guarantee',
    badge: '100% Risk Reversal',
    summary:
      'We stand behind our engineering with a contractual performance warranty. If you do not see measurable technical and local search performance improvements within 30 days of deployment, we work 100% free until you do — or refund your investment in full.',
    terms: [
      '14-Day Delivery Guarantee: All code, schema, and optimizations deployed and verified via Google Rich Results Test within 14 days of kickoff.',
      'Measurable Metric Velocity: If search impressions, mobile load speed, or review capture rate do not improve within 30 days post-deployment, we continue optimizing at zero additional cost.',
      'Unconditional Sprint Refund: If you are unsatisfied with implementation quality during the sprint, request a refund before day 30 for an immediate 100% return.',
    ],
    disclaimer:
      'Guarantee covers verifiable technical compliance, Google search console indexation, and core performance metrics. We do not make fraudulent claims of guaranteed third-party revenue.',
  },
  // Zero fabricated proof: only genuine verified clients are recorded here
  realCaseStudies: {},
  evidenceBenchmarks: {
    dental: {
      vertical: 'Dental Practice',
      headline: 'Complete Schema & Review Velocity Drive 2.4× More Google 3-Pack Placements',
      statHighlight: '2.4× higher placement in Local 3-Pack',
      citation: 'BrightLocal Healthcare Local Search Study & Google/Deloitte 2023',
      context:
        'Practices with verified Schema.org markup and active owner review responses consistently outrank older competitors who neglect technical local SEO.',
      metrics: [
        { label: 'Map Pack Placement', value: '2.4×', source: 'BrightLocal 2024' },
        { label: 'Click-Through Rate', value: '+32%', source: 'Google / Deloitte' },
        { label: 'Avg Patient Annual Value', value: '$1,200', source: 'ADA 2023' },
      ],
    },
    fitness: {
      vertical: 'Health & Fitness Club',
      headline: 'Sub-2.0s Mobile Load Times Yield 2.8× Higher Guest Pass Conversions',
      statHighlight: '2.8× higher mobile trial conversion rate',
      citation: 'Google Mobile Page Experience Data & Think With Google 2023',
      context:
        'Over 53% of mobile fitness seekers bounce from gym landing pages taking more than 3 seconds to load, abandoning prospective membership inquiries.',
      metrics: [
        { label: 'Mobile Bounce Reduction', value: '-38%', source: 'Google Web Vitals' },
        { label: 'Trial Form Completion', value: '2.8×', source: 'Think With Google' },
        { label: 'Avg Membership Value', value: '$600/yr', source: 'IHRSA Benchmark' },
      ],
    },
    restaurant: {
      vertical: 'Restaurant & Catering',
      headline: 'Native Structured Menu Markup Drives 38% More Direct Non-Commission Orders',
      statHighlight: '38% increase in direct catering bookings',
      citation: 'National Restaurant Association & Search Engine Land 2023',
      context:
        'Without JSON-LD Restaurant and Menu entities, search engines redirect hungry searchers to delivery platforms charging 20–30% take-rates.',
      metrics: [
        { label: 'Direct Catering Orders', value: '+38%', source: 'NRA Industry Study' },
        { label: 'Commission Savings', value: '20–30%', source: 'Third-Party Delivery Avg' },
        { label: 'Map Pack Interactions', value: '+44%', source: 'Search Engine Land' },
      ],
    },
    default: {
      vertical: 'Local Service Business',
      headline: 'Verified Structured Data & Active Review Velocity Lift Organic Inquiries by 64%',
      statHighlight: '+64% higher inquiry volume in 60 days',
      citation: 'Search Engine Journal Local Search Industry Benchmark',
      context:
        'Technical precision in site speed, schema indexing, and customer trust signals separates market leaders from stagnant local competitors.',
      metrics: [
        { label: 'Organic Inquiries', value: '+64%', source: 'Search Engine Journal' },
        { label: 'Rich Results Indexing', value: '100%', source: 'Google Search Console' },
        { label: 'Customer Trust Lift', value: '+42%', source: 'BrightLocal Consumer Review' },
      ],
    },
  },
};

/**
 * Format a dollar amount cleanly
 */
export function formatDollar(amount: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(amount);
}

/**
 * Get pricing tiers customized for industry/location
 */
export function getOffersForProposal(options: {
  industry?: string | null;
  pricing?: { essentials?: number; growth?: number; premium?: number } | null;
}) {
  const starterPrice = options.pricing?.essentials ?? CANONICAL_OFFERS.tiers.starter.basePriceUSD;
  const growthPrice = options.pricing?.growth ?? CANONICAL_OFFERS.tiers.growth.basePriceUSD;
  const premiumPrice = options.pricing?.premium ?? CANONICAL_OFFERS.tiers.premium.basePriceUSD;

  return [
    {
      ...CANONICAL_OFFERS.tiers.starter,
      price: starterPrice,
    },
    {
      ...CANONICAL_OFFERS.tiers.growth,
      price: growthPrice,
    },
    {
      ...CANONICAL_OFFERS.tiers.premium,
      price: premiumPrice,
    },
  ];
}

/**
 * Compute the 14-day expiry date from an audit/proposal createdAt date
 */
export function getUrgencyExpiryDate(createdAt?: string | Date | null): string {
  const base = createdAt ? new Date(createdAt) : new Date();
  const expiry = new Date(base.getTime() + CANONICAL_OFFERS.urgencyDays * 24 * 60 * 60 * 1000);
  return expiry.toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });
}

/**
 * Resolve verified real case study for vertical (returns null if none exists)
 */
export function getSocialProofForVertical(vertical?: string | null): SocialProofCaseStudy | null {
  const norm = (vertical || '').toLowerCase();
  for (const [key, study] of Object.entries(CANONICAL_OFFERS.realCaseStudies)) {
    if (norm.includes(key) || key.includes(norm)) {
    return study;
    }
  }
  return null;
}

/**
 * Resolve cited third-party evidence benchmark for vertical
 */
export function getEvidenceBenchmarkForVertical(vertical?: string | null): IndustryEvidenceBenchmark {
  const norm = (vertical || '').toLowerCase();
  if (norm.includes('dent') || norm.includes('ortho') || norm.includes('clinic') || norm.includes('med')) {
    return CANONICAL_OFFERS.evidenceBenchmarks.dental!;
  }
  if (norm.includes('fit') || norm.includes('gym') || norm.includes('athletic') || norm.includes('yoga')) {
    return CANONICAL_OFFERS.evidenceBenchmarks.fitness!;
  }
  if (norm.includes('rest') || norm.includes('pizza') || norm.includes('food') || norm.includes('cafe')) {
    return CANONICAL_OFFERS.evidenceBenchmarks.restaurant!;
  }
  return CANONICAL_OFFERS.evidenceBenchmarks.default!;
}
