'use client';

import { useState } from 'react';

import { AnimatePresence, motion } from 'framer-motion';
import { ArrowRight, Quote, Star } from 'lucide-react';
import { PolarAngleAxis, PolarGrid, Radar, RadarChart, ResponsiveContainer } from 'recharts';

import { SectionWrapper } from '@/components/shared/section-wrapper';
import { SeverityBadge } from '@/components/shared/severity-badge';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import { Button } from '@/components/ui/button';

const demoData = {
  businessName: 'Saskatoon Family Dental',
  overallScore: 4.9,
  letterGrade: 'C+',
  categories: [
    { id: 'website', name: 'Website', score: 6.2, icon: '🌐' },
    { id: 'google', name: 'Google Profile', score: 4.8, icon: '📍' },
    { id: 'seo', name: 'SEO', score: 5.5, icon: '📊' },
    { id: 'reviews', name: 'Reviews', score: 3.9, icon: '⭐' },
    { id: 'social', name: 'Social', score: 4.1, icon: '📱' },
    { id: 'competitors', name: 'Competitors', score: 5.0, icon: '🏆' },
  ],
  topFindings: [
    {
      severity: 'critical' as const,
      title: 'Google Business Profile missing 14 photos',
      details:
        'Photos are a primary ranking factor for local search. Profiles with 100+ photos get 520% more directions requests.',
    },
    {
      severity: 'high' as const,
      title: 'Website loads in 4.8s on mobile — 67% slower than competitors',
      details:
        'Every second of load time reduces conversion rate by 7%. Your mobile experience is currently a bottleneck for new patient acquisition.',
    },
    {
      severity: 'high' as const,
      title: 'Only 12 Google reviews vs competitor average of 47',
      details:
        'Review volume and velocity signal trust to both Google and prospective patients. You are currently 4x behind the market leader.',
    },
    {
      severity: 'medium' as const,
      title: 'No schema markup detected on any page',
      details:
        'Schema helps Google understand your services, location, and hours. Without it, you are missing out on rich snippets in search results.',
    },
    {
      severity: 'medium' as const,
      title: 'Social media profiles not linked from website',
      details:
        'Cross-linking builds authority and helps customers verify your business across platforms.',
    },
  ],
  competitors: [
    { name: 'You', scores: { website: 6.2, gbp: 4.8, reviews: 3.9 } },
    { name: 'Bridge City Dental', scores: { website: 8.1, gbp: 7.5, reviews: 8.8 } },
    { name: 'Downtown Dental', scores: { website: 4.5, gbp: 9.2, reviews: 7.1 } },
  ],
};

const testimonials = [
  {
    quote:
      'We had no idea our Google profile was only 62% complete. After fixing the issues Claraud found, our phone calls increased 40% in two months.',
    name: 'Dr. Sarah Chen',
    business: 'Riverside Dental, Saskatoon',
    stars: 5,
  },
  {
    quote:
      'I was spending $2,000/month on ads with no idea my website was loading in 6 seconds. Claraud caught it in 30 seconds flat.',
    name: 'Mike Torres',
    business: 'Torres HVAC, Regina',
    stars: 5,
  },
  {
    quote:
      'As an agency, we close 3x more deals now. We run a Claraud scan on every prospect before the first call.',
    name: 'Priya Sharma',
    business: 'Momentum Digital, Toronto',
    stars: 5,
  },
];

function InteractiveDemo() {
  const [activeTab, setActiveTab] = useState<'overview' | 'findings' | 'competitors'>('overview');

  const radarData = demoData.categories.map((cat) => ({
    category: cat.name,
    score: cat.score,
    fullMark: 10,
  }));

  const getScoreTextColor = (score: number) => {
    if (score >= 7) return 'text-green-500';
    if (score >= 4) return 'text-yellow-500';
    return 'text-red-500';
  };

  const getScoreBgColor = (score: number) => {
    if (score >= 7) return 'bg-green-500';
    if (score >= 4) return 'bg-yellow-500';
    return 'bg-red-500';
  };

  return (
    <div className="max-w-4xl mx-auto mb-16 px-4">
      <div className="glass border border-white/10 rounded-2xl overflow-hidden flex flex-col min-h-[500px]">
        {/* Tabs */}
        <div className="flex border-b border-white/10 bg-white/5">
          {(['overview', 'findings', 'competitors'] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`flex-1 py-4 text-sm font-semibold transition-all relative ${
                activeTab === tab
                  ? 'text-white'
                  : 'text-text-secondary hover:text-white hover:bg-white/5'
              }`}
            >
              <span className="capitalize">{tab}</span>
              {activeTab === tab && (
                <motion.div
                  layoutId="activeTab"
                  className="absolute bottom-0 left-0 right-0 h-0.5 bg-blue-500"
                />
              )}
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="flex-1 p-6 md:p-8 overflow-hidden relative">
          <AnimatePresence mode="wait">
            {activeTab === 'overview' && (
              <motion.div
                key="overview"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                className="grid grid-cols-1 md:grid-cols-2 gap-8 items-center h-full"
              >
                <div className="relative aspect-square max-h-[300px] w-full mx-auto flex items-center justify-center bg-white/5 rounded-2xl border border-white/10">
                  <ResponsiveContainer width="100%" height="100%">
                    <RadarChart cx="50%" cy="50%" outerRadius="80%" data={radarData}>
                      <PolarGrid stroke="#ffffff" strokeOpacity={0.1} />
                      <PolarAngleAxis
                        dataKey="category"
                        tick={{ fill: '#9ca3af', fontSize: 8, fontWeight: 500 }}
                      />
                      <Radar
                        name="Score"
                        dataKey="score"
                        stroke="#3b82f6"
                        strokeWidth={2}
                        fill="#3b82f6"
                        fillOpacity={0.5}
                      />
                    </RadarChart>
                  </ResponsiveContainer>
                  <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                    <span className="text-4xl font-bold text-white leading-none">
                      {demoData.overallScore}
                    </span>
                    <span
                      className={`text-lg font-bold ${getScoreTextColor(demoData.overallScore)}`}
                    >
                      {demoData.letterGrade}
                    </span>
                  </div>
                </div>

                <div className="space-y-4">
                  {demoData.categories.map((cat) => (
                    <div key={cat.id} className="space-y-1.5">
                      <div className="flex justify-between text-xs font-medium">
                        <span className="text-white flex items-center gap-1.5">
                          <span>{cat.icon}</span> {cat.name}
                        </span>
                        <span className={getScoreTextColor(cat.score)}>{cat.score}/10</span>
                      </div>
                      <div className="w-full h-1 bg-white/10 rounded-full overflow-hidden">
                        <motion.div
                          initial={{ width: 0 }}
                          animate={{ width: `${cat.score * 10}%` }}
                          className={`h-full ${getScoreBgColor(cat.score)}`}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </motion.div>
            )}

            {activeTab === 'findings' && (
              <motion.div
                key="findings"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                className="h-full"
              >
                <Accordion type="single" collapsible className="space-y-3">
                  {demoData.topFindings.map((finding, idx) => (
                    <AccordionItem
                      key={idx}
                      value={`item-${idx}`}
                      className="border border-white/10 rounded-xl bg-white/5 overflow-hidden"
                    >
                      <AccordionTrigger className="px-4 py-3 hover:no-underline hover:bg-white/5 text-left">
                        <div className="flex items-center gap-3 w-full">
                          <SeverityBadge severity={finding.severity} />
                          <span className="text-sm font-medium text-white line-clamp-1">
                            {finding.title}
                          </span>
                        </div>
                      </AccordionTrigger>
                      <AccordionContent className="px-4 pb-4 text-xs text-text-secondary leading-relaxed">
                        {finding.details}
                      </AccordionContent>
                    </AccordionItem>
                  ))}
                </Accordion>
              </motion.div>
            )}

            {activeTab === 'competitors' && (
              <motion.div
                key="competitors"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                className="h-full"
              >
                <div className="overflow-x-auto">
                  <table className="w-full text-sm text-left border-collapse">
                    <thead>
                      <tr className="border-b border-white/10">
                        <th className="py-3 px-2 font-semibold text-text-secondary">Category</th>
                        {demoData.competitors.map((comp) => (
                          <th
                            key={comp.name}
                            className={`py-3 px-2 font-bold ${comp.name === 'You' ? 'text-blue-400' : 'text-white'}`}
                          >
                            {comp.name}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {(['website', 'gbp', 'reviews'] as const).map((cat) => (
                        <tr key={cat} className="border-b border-white/5">
                          <td className="py-3 px-2 text-text-secondary capitalize">
                            {cat === 'gbp' ? 'Google Profile' : cat}
                          </td>
                          {demoData.competitors.map((comp) => {
                            const score = comp.scores[cat];
                            return (
                              <td key={comp.name} className="py-3 px-2">
                                <div
                                  className={`inline-flex items-center justify-center w-10 h-10 rounded-lg font-bold ${getScoreBgColor(score)}/10 ${getScoreTextColor(score)}`}
                                >
                                  {score}
                                </div>
                              </td>
                            );
                          })}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      <div className="mt-8 text-center">
        <Button
          onClick={() =>
            document.getElementById('hero-scan')?.scrollIntoView({ behavior: 'smooth' })
          }
          className="gradient-btn rounded-full px-8 py-6 h-auto group text-lg font-semibold"
        >
          This is a real audit. Get yours free
          <ArrowRight className="ml-2 w-5 h-5 group-hover:translate-x-1 transition-transform" />
        </Button>
      </div>
    </div>
  );
}

export function SocialProof() {
  return (
    <SectionWrapper id="social-proof" className="bg-bg-secondary/30">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        transition={{ duration: 0.5 }}
        className="text-center mb-12"
      >
        <h2 className="text-4xl md:text-5xl font-bold tracking-tight text-white">
          See a real audit <span className="gradient-text">in action.</span>
        </h2>
      </motion.div>

      <InteractiveDemo />

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-6xl mx-auto px-4 mt-16">
        {testimonials.map((t, idx) => (
          <motion.div
            key={idx}
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5, delay: idx * 0.1 }}
            className="glass rounded-2xl p-8 border border-white/10 flex flex-col relative group"
          >
            <Quote className="text-3xl opacity-20 text-blue-500 mb-4" />
            <p className="text-text-primary text-base italic leading-relaxed flex-1 mb-6 relative z-10">
              &ldquo;{t.quote}&rdquo;
            </p>
            <div className="pt-6 border-t border-white/10 relative z-10">
              <p className="text-sm text-text-secondary font-semibold">
                {t.name}, {t.business}
              </p>
              <div className="flex gap-1 mt-2">
                {Array.from({ length: t.stars }).map((_, i) => (
                  <Star key={i} className="w-4 h-4 fill-yellow-400 text-yellow-400" />
                ))}
              </div>
            </div>
          </motion.div>
        ))}
      </div>
    </SectionWrapper>
  );
}
