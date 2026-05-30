'use client';

import { useEffect } from 'react';

import Link from 'next/link';

import { motion } from 'framer-motion';
import {
  ArrowRight,
  BarChart3,
  Bot,
  Clock,
  MousePointer2,
  Palette,
  Rocket,
  Users,
  Zap,
} from 'lucide-react';

import { ROICalculator } from '@/components/agencies/roi-calculator';
import { AgencyTiers } from '@/components/pricing/agency-tiers';
import { SectionWrapper } from '@/components/shared/section-wrapper';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import { Button } from '@/components/ui/button';
import { usePostHog } from '@/hooks/use-posthog';

const problemCards = [
  {
    icon: <Clock className="w-8 h-8 text-orange-400" />,
    title: 'You spend 4 hours on a proposal that gets ghosted',
    description:
      "Manual audits, custom decks, back-and-forth revisions. By the time you send it, the prospect's gone cold.",
  },
  {
    icon: <Users className="w-8 h-8 text-blue-400" />,
    title: 'Your team can handle 10 clients. Your pipeline has 50.',
    description: "You're turning away work because you can't scale delivery without hiring.",
  },
  {
    icon: <Bot className="w-8 h-8 text-purple-400" />,
    title: 'Competitors are using AI. Your proposals still look like 2019.',
    description:
      "AI-native agencies are closing 3x faster with data-backed audits. You're bringing a knife to a gunfight.",
  },
];

const featureCards = [
  {
    icon: <Zap className="w-8 h-8 text-yellow-400" />,
    title: 'Instant Audit Reports',
    description:
      'Run a 30-dimension audit for any prospect in 30 seconds. No manual research. No guesswork.',
  },
  {
    icon: <MousePointer2 className="w-8 h-8 text-blue-400" />,
    title: 'Auto-Generated Proposals',
    description:
      'AI creates personalized proposals with your branding, pricing, and ROI projections. Just review and send.',
  },
  {
    icon: <Palette className="w-8 h-8 text-purple-400" />,
    title: 'White-Label Everything',
    description:
      "Your logo, your colors, your domain. Clients never see 'Claraud'. It's your tool.",
  },
  {
    icon: <Users className="w-8 h-8 text-green-400" />,
    title: 'Client Portal',
    description:
      'Each client gets their own login with reports, progress tracking, and invoices. Professional and hands-off.',
  },
  {
    icon: <Rocket className="w-8 h-8 text-orange-400" />,
    title: 'Delivery Engine',
    description:
      'AI generates the actual fix artifacts — schema markup, meta tags, content briefs, GBP drafts. Not just recommendations.',
  },
  {
    icon: <BarChart3 className="w-8 h-8 text-pink-400" />,
    title: 'Analytics Dashboard',
    description:
      'Pipeline value, conversion rates, revenue per audit, module performance. Know your numbers.',
  },
];

const agencyFaqs = [
  {
    q: 'Can I use my own domain?',
    a: 'Yes. Professional and Agency plans include custom domain support. Your clients visit reports.youragency.com, not claraud.com.',
  },
  {
    q: "Do my clients know it's powered by Claraud?",
    a: "Not unless you want them to. White-label removes all Claraud branding. It's your tool, your brand.",
  },
  {
    q: 'Can I customize the audit modules?',
    a: "Coming soon. Currently all 30 dimensions are included. We're building a module builder for Q2 2026.",
  },
  {
    q: 'What happens when I hit my audit limit?',
    a: "You'll get a warning at 80%. After the limit, audits queue until the next billing cycle. Upgrade anytime — changes apply instantly.",
  },
  {
    q: 'Can my team members access the platform?',
    a: 'Agency plan includes 5 seats. Professional includes 2. Need more? Contact us for custom plans.',
  },
  {
    q: 'How do I get started?',
    a: "Click 'Start free trial'. Run your first audit in 60 seconds. No credit card required for 14 days.",
  },
];

export default function AgenciesPage() {
  const { captureEvent } = usePostHog();

  useEffect(() => {
    captureEvent('agencies_viewed');
  }, []);

  return (
    <div className="bg-[#0a0a0f] min-h-screen">
      {/* Section 1: Hero */}
      <div className="relative pt-32 pb-20 overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-b from-blue-600/10 to-transparent pointer-events-none" />
        <SectionWrapper>
          <div className="text-center max-w-4xl mx-auto px-4 relative z-10">
            <motion.h1
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="text-5xl md:text-7xl font-bold mb-6 flex flex-col gap-2"
            >
              <span className="text-white">Close more deals.</span>
              <span className="gradient-text">Deliver faster. Scale without hiring.</span>
            </motion.h1>
            <motion.p
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 }}
              className="text-text-secondary text-xl mb-10 leading-relaxed"
            >
              Claraud gives your agency AI-powered audit reports, personalized proposals, and
              autonomous delivery — all under your brand.
            </motion.p>
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2 }}
              className="flex flex-col sm:flex-row gap-4 justify-center"
            >
              <Button
                asChild
                size="lg"
                className="gradient-btn rounded-full px-8 py-7 h-auto text-lg font-bold"
                onClick={() => captureEvent('agency_trial_clicked')}
              >
                <Link href="/pricing">Start free 14-day trial</Link>
              </Button>
              <Button
                asChild
                size="lg"
                variant="outline"
                className="border-white/10 text-white rounded-full px-8 py-7 h-auto text-lg font-bold hover:bg-white/5"
              >
                <Link href="/report/demo">See a demo report</Link>
              </Button>
            </motion.div>
          </div>
        </SectionWrapper>
      </div>

      {/* Section 2: The Agency Problem */}
      <SectionWrapper className="py-24">
        <div className="text-center mb-16">
          <h2 className="text-3xl md:text-4xl font-bold text-white mb-4">Sound familiar?</h2>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 max-w-6xl mx-auto px-4">
          {problemCards.map((card, idx) => (
            <motion.div
              key={idx}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5, delay: idx * 0.1 }}
              className="glass p-8 rounded-2xl border border-white/10 hover:border-white/20 transition-all group"
            >
              <div className="mb-6 transform group-hover:scale-110 transition-transform">
                {card.icon}
              </div>
              <h3 className="text-xl font-bold text-white mb-4 leading-tight">{card.title}</h3>
              <p className="text-text-secondary leading-relaxed">{card.description}</p>
            </motion.div>
          ))}
        </div>
      </SectionWrapper>

      {/* Section 3: What You Get */}
      <SectionWrapper className="py-24 bg-white/5">
        <div className="text-center mb-16">
          <h2 className="text-3xl md:text-5xl font-bold text-white mb-4">
            Everything your agency needs to win.
          </h2>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8 max-w-6xl mx-auto px-4">
          {featureCards.map((card, idx) => (
            <motion.div
              key={idx}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5, delay: idx * 0.05 }}
              className="glass p-8 rounded-2xl border border-white/10 hover:border-blue-500/30 transition-all"
            >
              <div className="mb-6">{card.icon}</div>
              <h3 className="text-xl font-bold text-white mb-4">{card.title}</h3>
              <p className="text-text-secondary text-sm leading-relaxed">{card.description}</p>
            </motion.div>
          ))}
        </div>
      </SectionWrapper>

      {/* Section 4: ROI Calculator */}
      <SectionWrapper className="py-24">
        <div className="text-center mb-16">
          <h2 className="text-3xl md:text-5xl font-bold text-white mb-4">
            See what Claraud does to your bottom line.
          </h2>
        </div>
        <ROICalculator />
      </SectionWrapper>

      {/* Section 5: Agency Pricing */}
      <SectionWrapper className="py-24 bg-white/5">
        <div className="text-center mb-16">
          <h2 className="text-3xl md:text-5xl font-bold text-white mb-4">
            Simple pricing. Unlimited upside.
          </h2>
        </div>
        <AgencyTiers />
        <div className="text-center mt-12">
          <Button
            asChild
            size="lg"
            className="gradient-btn rounded-full px-12 py-7 h-auto text-lg font-bold"
            onClick={() => captureEvent('agency_trial_clicked')}
          >
            <Link href="/pricing">Start your free 14-day trial</Link>
          </Button>
        </div>
      </SectionWrapper>

      {/* Section 6: FAQ */}
      <SectionWrapper className="py-24">
        <div className="max-w-3xl mx-auto px-4">
          <h2 className="text-3xl font-bold text-white text-center mb-12">Agency FAQ</h2>
          <Accordion type="single" collapsible className="space-y-4">
            {agencyFaqs.map((faq, idx) => (
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
      </SectionWrapper>

      {/* Section 7: Final CTA */}
      <SectionWrapper className="py-32 bg-gradient-to-t from-blue-600/10 to-transparent">
        <div className="text-center max-w-4xl mx-auto px-4">
          <h2 className="text-4xl md:text-6xl font-bold text-white mb-6">
            Your next client is searching for help right now.
          </h2>
          <p className="text-text-secondary text-xl mb-10">
            Be the agency that shows up with data, not guesses.
          </p>
          <Button
            asChild
            size="lg"
            className="gradient-btn rounded-full px-12 py-8 h-auto text-xl font-bold shadow-2xl shadow-blue-500/20"
            onClick={() => captureEvent('agency_trial_clicked')}
          >
            <Link href="/pricing">
              Start your free 14-day trial <ArrowRight className="ml-2 w-6 h-6" />
            </Link>
          </Button>
        </div>
      </SectionWrapper>
    </div>
  );
}
