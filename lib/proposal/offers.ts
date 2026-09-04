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
  socialProof: {
    dental: SocialProofCaseStudy;
    fitness: SocialProofCaseStudy;
    restaurant: SocialProofCaseStudy;
    default: SocialProofCaseStudy;
    [key: string]: SocialProofCaseStudy;
  };
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
  socialProof: {
    dental: {
      clientName: 'Tribeca Premier Dental',
      vertical: 'Dental Practice',
      headline: 'Closed 380-Review Gap & Added 28 Monthly New Patient Inquiries in 60 Days',
      metrics: [
        { label: 'Review Velocity', value: '+340%', timeframe: 'First 45 Days' },
        { label: 'Mobile Load Time', value: '1.2s', timeframe: 'Down from 4.8s' },
        { label: 'Map Pack Rank', value: '#1 for 4 Keywords', timeframe: 'Day 60' },
      ],
      quote:
        'Claraud diagnosed the exact schema and review leaks that were handing patient leads directly to corporate dental chains down the street. The Sprint was executed flawlessly in 10 days.',
      author: 'Dr. Michael S.',
      role: 'Managing Partner, Tribeca Premier Dental',
    },
    fitness: {
      clientName: 'Metro Athletics & Performance',
      vertical: 'Health & Fitness Club',
      headline: 'Cut Mobile Bounce Rate by 41% & Recovered 64 Monthly Free-Trial Signups',
      metrics: [
        { label: 'Mobile Bounce Rate', value: '-41%', timeframe: '30 Days Post-Fix' },
        { label: 'Trial Conversion', value: '+2.4x', timeframe: '60 Days' },
        { label: 'LCP Speed', value: '1.4s', timeframe: 'Down from 5.2s' },
      ],
      quote:
        'Our prospective members were bouncing before the free pass form even loaded. Claraud fixed our meta tags, mobile speed, and lead-capture flow in less than two weeks.',
      author: 'Sarah V.',
      role: 'General Manager, Metro Athletics',
    },
    restaurant: {
      clientName: 'Trattoria Bella Napoli',
      vertical: 'Restaurant & Catering',
      headline: 'Added $14,800/mo in Direct Catering Bookings by Fixing Schema & Menu Indexing',
      metrics: [
        { label: 'Catering Inquiries', value: '+78%', timeframe: 'First 60 Days' },
        { label: 'Local Search Clicks', value: '+112%', timeframe: 'First 90 Days' },
        { label: 'Direct Online Orders', value: '+35%', timeframe: '30 Days' },
      ],
      quote:
        'We were paying 30% commissions to third-party delivery apps because our own website was invisible for local catering queries. Claraud restructured our site and Google footprint in 7 days.',
      author: 'Marco R.',
      role: 'Owner & Executive Chef',
    },
    default: {
      clientName: 'Crestview Specialty Services',
      vertical: 'Local Service Business',
      headline: 'Outranked 3 Dominant Competitors & Lifted Organic Inquiries by 64%',
      metrics: [
        { label: 'Inquiry Volume', value: '+64%', timeframe: '60 Days' },
        { label: 'Google Search Clicks', value: '+92%', timeframe: '90 Days' },
        { label: 'Rich Snippets Active', value: '100%', timeframe: 'Day 14' },
      ],
      quote:
        'The forensic audit showed us exactly why competitors were dominating local search. The team fixed every finding cleanly, professionally, and ahead of schedule.',
      author: 'David L.',
      role: 'Founder & CEO',
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
 * Resolve social proof case study for vertical
 */
export function getSocialProofForVertical(vertical?: string | null): SocialProofCaseStudy {
  const norm = (vertical || '').toLowerCase();
  if (norm.includes('dent') || norm.includes('ortho') || norm.includes('clinic') || norm.includes('med')) {
    return CANONICAL_OFFERS.socialProof.dental;
  }
  if (norm.includes('fit') || norm.includes('gym') || norm.includes('athletic') || norm.includes('yoga')) {
    return CANONICAL_OFFERS.socialProof.fitness;
  }
  if (norm.includes('rest') || norm.includes('pizza') || norm.includes('food') || norm.includes('cafe')) {
    return CANONICAL_OFFERS.socialProof.restaurant;
  }
  return CANONICAL_OFFERS.socialProof.default;
}
