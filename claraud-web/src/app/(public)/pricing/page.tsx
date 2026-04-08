'use client';

import { useEffect } from 'react';

import { motion } from 'framer-motion';
import { ArrowRight, Check } from 'lucide-react';

import { AgencyTiers } from '@/components/pricing/agency-tiers';
import { ScanInput } from '@/components/scan/scan-input';
import { JsonLd } from '@/components/shared/json-ld';
import { SectionWrapper } from '@/components/shared/section-wrapper';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { usePostHog } from '@/hooks/use-posthog';

const businessTiers = [
  {
    name: 'Quick Wins',
    price: '497',
    tagline: 'Fix the basics fast',
    features: [
      'Top 5 highest-impact fixes delivered',
      'Google Business Profile optimization',
      'SEO quick pack (meta titles, descriptions, schema)',
      'Copy-paste deliverables — implement yourself',
      '1 re-audit after 30 days',
    ],
    cta: 'Start with a free scan',
    featured: false,
  },
  {
    name: 'Growth',
    price: '1,497',
    tagline: 'Outrank your competitors',
    features: [
      'Everything in Quick Wins',
      'Full 30-dimension deep audit',
      'Content strategy (10 blog topics, 4 GBP post drafts)',
      'Review management playbook + AI response templates',
      'Competitor gap analysis with action items',
      'Local keyword strategy (20 target keywords)',
      '3 monthly re-audits with progress reports',
    ],
    cta: 'Start with a free scan',
    featured: true,
  },
  {
    name: 'Premium',
    price: '4,997',
    priceSub: 'or $997/mo × 6',
    tagline: 'Dominate your market',
    features: [
      'Everything in Growth',
      'Full implementation — we do the work',
      'Monthly re-audits with executive reports',
      'AI-powered review response automation',
      'Ongoing competitor monitoring with alerts',
      'Dedicated AI agent for your business',
      'Priority support',
    ],
    cta: 'Start with a free scan',
    featured: false,
  },
];

const faqs = [
  {
    q: "What if I don't have a website yet?",
    a: "No problem. We can audit your Google Business Profile, reviews, social media, and competitive landscape without a website. We'll also include recommendations for building one.",
  },
  {
    q: 'How long until I see results?',
    a: 'Quick Win fixes can show impact within 1-2 weeks. SEO and content improvements typically take 30-90 days to reflect in rankings. We provide re-audits so you can track progress.',
  },
  {
    q: 'Can I implement the fixes myself?',
    a: "Absolutely. Every deliverable is designed as a copy-paste action item. You don't need a developer for most fixes. For technical items, we provide exact code snippets.",
  },
  {
    q: 'Do you work with businesses outside Canada?',
    a: 'Yes. Claraud works with businesses anywhere in the world. Our audit engine uses global APIs and adapts to your local market.',
  },
  {
    q: "What's your refund policy?",
    a: "If you're not satisfied with your audit report within 7 days, we'll refund 100% of your payment. No questions asked.",
  },
  {
    q: 'How is this different from hiring a marketing agency?',
    a: 'Agencies charge $3,000-$10,000 for a discovery audit that takes 2-4 weeks. Claraud delivers the same insights in 30 seconds for a fraction of the cost, with actionable deliverables — not a PowerPoint.',
  },
  {
    q: 'What data do you need from me?',
    a: "Just your website URL or business name. That's it. We pull everything from public APIs — no logins, no access needed.",
  },
  {
    q: 'Is my data secure?',
    a: "Yes. We're hosted on Google Cloud with 256-bit encryption. We never store sensitive business data beyond what's needed for your report. GDPR and PIPEDA compliant.",
  },
];

export default function PricingPage() {
  const { captureEvent } = usePostHog();

  useEffect(() => {
    captureEvent('pricing_viewed');
  }, []);

  const pricingSchema = {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    itemListElement: businessTiers.map((tier, idx) => ({
      '@type': 'ListItem',
      position: idx + 1,
      item: {
        '@type': 'Product',
        name: tier.name,
        description: tier.tagline,
        offers: {
          '@type': 'Offer',
          price: tier.price,
          priceCurrency: 'USD',
          availability: 'https://schema.org/InStock',
        },
      },
    })),
  };

  return (
    <div className="bg-[#0a0a0f] min-h-screen pt-20 pb-20">
      <JsonLd data={pricingSchema} />
      <SectionWrapper>
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-center mb-16"
        >
          <h1 className="text-4xl md:text-6xl font-bold text-white mb-6">
            Simple pricing for <span className="gradient-text">explosive growth.</span>
          </h1>
          <p className="text-text-secondary text-lg max-w-2xl mx-auto">
            Choose the plan that's right for your business or agency.
          </p>
        </motion.div>

        <Tabs
          defaultValue="business"
          className="w-full"
          onValueChange={(val) => captureEvent('pricing_tab_switched', { tab: val })}
        >
          <div className="flex justify-center mb-12">
            <TabsList className="bg-white/5 border border-white/10 p-1 h-auto rounded-full">
              <TabsTrigger
                value="business"
                className="rounded-full px-8 py-2.5 data-[state=active]:bg-blue-600 data-[state=active]:text-white transition-all"
              >
                For Businesses
              </TabsTrigger>
              <TabsTrigger
                value="agency"
                className="rounded-full px-8 py-2.5 data-[state=active]:bg-blue-600 data-[state=active]:text-white transition-all"
              >
                For Agencies
              </TabsTrigger>
            </TabsList>
          </div>

          <TabsContent value="business" className="mt-0">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-8 max-w-6xl mx-auto px-4">
              {businessTiers.map((tier, idx) => (
                <motion.div
                  key={tier.name}
                  initial={{ opacity: 0, y: 20 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ duration: 0.5, delay: idx * 0.1 }}
                  className={`glass rounded-2xl p-8 border ${
                    tier.featured ? 'border-blue-500/50 ring-2 ring-blue-500/20' : 'border-white/10'
                  } relative flex flex-col h-full group`}
                >
                  {tier.featured && (
                    <div className="absolute top-0 right-4 bg-gradient-to-r from-blue-600 to-purple-600 text-white text-[10px] font-bold uppercase tracking-widest px-3 py-1 rounded-b-lg">
                      Most Popular
                    </div>
                  )}

                  <div className="mb-8">
                    <h3 className="text-xl font-bold text-white mb-2">{tier.name}</h3>
                    <div className="flex flex-col">
                      <span
                        className={`text-4xl font-bold ${tier.featured ? 'gradient-text' : 'text-white'}`}
                      >
                        ${tier.price}
                      </span>
                      <span className="text-text-secondary text-sm mt-1">one-time</span>
                      {tier.priceSub && (
                        <span className="text-text-secondary text-xs mt-1">{tier.priceSub}</span>
                      )}
                    </div>
                    <p className="text-text-secondary text-sm mt-4 font-medium">{tier.tagline}</p>
                  </div>

                  <div className="space-y-4 mb-8 flex-1">
                    {tier.features.map((feature) => (
                      <div key={feature} className="flex items-start gap-3 text-sm">
                        <div className="mt-1 p-0.5 rounded-full bg-blue-500/20 text-blue-400">
                          <Check className="w-3 h-3" />
                        </div>
                        <span className="text-text-secondary">{feature}</span>
                      </div>
                    ))}
                  </div>

                  <Button
                    asChild
                    variant={tier.featured ? 'default' : 'outline'}
                    className={`w-full rounded-xl py-6 h-auto font-bold transition-all ${
                      tier.featured
                        ? 'gradient-btn border-none'
                        : 'border-white/10 hover:bg-white/5 text-white'
                    }`}
                    onClick={() => captureEvent('pricing_tier_clicked', { tier: tier.name })}
                  >
                    <a href="/scan">
                      {tier.cta} <ArrowRight className="ml-2 w-4 h-4" />
                    </a>
                  </Button>
                </motion.div>
              ))}
            </div>
          </TabsContent>

          <TabsContent value="agency" className="mt-0">
            <AgencyTiers />
          </TabsContent>
        </Tabs>

        {/* FAQ Section */}
        <div className="mt-32 max-w-3xl mx-auto px-4">
          <h2 className="text-3xl font-bold text-white text-center mb-12">
            Frequently Asked Questions
          </h2>
          <Accordion type="single" collapsible className="space-y-4">
            {faqs.map((faq, idx) => (
              <AccordionItem
                key={idx}
                value={`faq-${idx}`}
                className="glass border border-white/10 rounded-2xl overflow-hidden px-2"
              >
                <AccordionTrigger className="px-4 py-4 hover:no-underline text-left text-white font-semibold">
                  {faq.q}
                </AccordionTrigger>
                <AccordionContent className="px-4 pb-4 text-text-secondary leading-relaxed">
                  {faq.a}
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </div>

        {/* Bottom CTA */}
        <div className="mt-32 text-center max-w-4xl mx-auto px-4">
          <h2 className="text-4xl font-bold text-white mb-6">
            Every plan starts with a free scan.
          </h2>
          <div className="max-w-2xl mx-auto">
            <ScanInput variant="large" />
          </div>
          <p className="text-text-secondary mt-6">
            No credit card required. See your score in 30 seconds.
          </p>
        </div>
      </SectionWrapper>
    </div>
  );
}
