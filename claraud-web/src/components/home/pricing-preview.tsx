'use client';

import Link from 'next/link';

import { motion } from 'framer-motion';
import { Check } from 'lucide-react';

import { SectionWrapper } from '@/components/shared/section-wrapper';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';

const tiers = [
  {
    name: 'Foundation Sprint',
    price: '$797',
    tagline: 'Rapid technical patch for immediate crawlability & trust',
    delivery: '5 business days',
    popular: false,
    features: [
      'Complete LocalBusiness & Service schema deployment (JSON-LD)',
      'Sitelinks Searchbox & Breadcrumb validation',
      'Meta title & description repair across key landing pages',
      'Google Business Profile core fields & category audit',
      'Independent Rich Results verification proof report',
    ],
  },
  {
    name: 'Growth Acceleration',
    price: '$2,497',
    tagline: 'Complete technical overhaul + automated local review surge',
    delivery: '10 business days',
    popular: true,
    features: [
      'Everything in Foundation Sprint (all schemas & metadata)',
      'Automated review acceleration workflow & response protocol',
      'Local citation audit & sync across top 40 directories',
      'Mobile Core Web Vitals optimization (<1.8s LCP target)',
      'Competitive gap sprint targeting high-intent local queries',
      '30-day post-launch dedicated engineering support',
    ],
  },
  {
    name: 'Market Dominance',
    price: '$4,997',
    tagline: 'Turnkey agency-grade partner for regional leadership',
    delivery: '20 business days',
    popular: false,
    features: [
      'Everything in Growth Acceleration',
      'Multi-location or multi-page technical architecture rebuild',
      'Quarterly competitive rank defense monitoring',
      'Bi-weekly conversion rate split-testing on intake forms',
      'Dedicated Senior Digital Engineer + monthly executive ROI review',
      '30-Day Measurable Impact Sprint Guarantee',
    ],
  },
];

const containerVariants = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.15 } },
};

const cardVariants = {
  hidden: { opacity: 0, y: 30 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.5 } },
};

export function PricingPreview() {
  return (
    <SectionWrapper id="pricing">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        transition={{ duration: 0.5 }}
        className="text-center mb-14"
      >
        <h2 className="text-4xl md:text-5xl font-bold tracking-tight text-white">
          Transparent pricing. <span className="gradient-text">No surprises.</span>
        </h2>
      </motion.div>

      <motion.div
        variants={containerVariants}
        initial="hidden"
        whileInView="visible"
        viewport={{ once: true, margin: '-60px' }}
        className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-5xl mx-auto px-4 mb-12"
      >
        {tiers.map((tier, idx) => (
          <motion.div
            key={idx}
            variants={cardVariants}
            className={`relative glass rounded-2xl p-8 card-hover flex flex-col ${
              tier.popular
                ? 'border-2 border-blue-500 shadow-lg shadow-blue-500/20'
                : 'border border-white/10'
            }`}
          >
            {tier.popular && (
              <div className="absolute -top-4 left-1/2 -translate-x-1/2">
                <Badge className="gradient-btn text-white px-4 py-1 text-sm font-semibold">
                  Most Popular
                </Badge>
              </div>
            )}

            <div className="mb-6">
              <h3 className="text-xl font-bold text-white mb-1">{tier.name}</h3>
              <p className="text-text-secondary text-sm mb-4">{tier.tagline}</p>
              <div className="text-4xl font-bold text-white">{tier.price}</div>
              <p className="text-text-secondary text-xs mt-1">one-time</p>
            </div>

            <ul className="space-y-3 flex-1 mb-8">
              {tier.features.map((feature, i) => (
                <li key={i} className="flex items-start gap-2 text-sm text-text-secondary">
                  <Check className="w-4 h-4 text-green-400 flex-shrink-0 mt-0.5" />
                  {feature}
                </li>
              ))}
            </ul>

            <Button
              className={tier.popular ? 'gradient-btn w-full font-semibold' : 'w-full'}
              variant={tier.popular ? 'default' : 'outline'}
              onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
            >
              Get free audit first
            </Button>
          </motion.div>
        ))}
      </motion.div>

      <motion.div
        initial={{ opacity: 0 }}
        whileInView={{ opacity: 1 }}
        viewport={{ once: true }}
        transition={{ delay: 0.5 }}
        className="flex flex-col sm:flex-row items-center justify-center gap-4"
      >
        <Button variant="outline" className="border-white/20 text-white hover:bg-white/5" asChild>
          <Link href="/pricing">See full pricing &rarr;</Link>
        </Button>
        <Button
          className="gradient-btn font-semibold px-8"
          onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
        >
          Get your free audit first &rarr;
        </Button>
      </motion.div>
    </SectionWrapper>
  );
}
