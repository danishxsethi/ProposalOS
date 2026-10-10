'use client';

import { motion } from 'framer-motion';
import { Brain, Radar, Wrench } from 'lucide-react';

import { SectionWrapper } from '@/components/shared/section-wrapper';

const steps = [
  {
    number: 1,
    icon: <Radar className="w-8 h-8 text-blue-400" />,
    title: 'Scope',
    description: 'A reviewer works from a website and scope the business has authorized.',
  },
  {
    number: 2,
    icon: <Brain className="w-8 h-8 text-purple-400" />,
    title: 'Diagnose',
    description: 'Each proposed finding is checked against retrievable evidence and its limits.',
  },
  {
    number: 3,
    icon: <Wrench className="w-8 h-8 text-green-400" />,
    title: 'Plan',
    description: 'Receive practical next steps with assumptions stated and outcomes unpromised.',
  },
];

const containerVariants = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.2 } },
};

const stepVariants = {
  hidden: { opacity: 0, y: 30 },
  visible: {
    opacity: 1,
    y: 0,
    transition: {
      duration: 0.6,
    },
  },
};

const lineVariants = {
  hidden: { scaleX: 0 },
  visible: { scaleX: 1, transition: { duration: 0.6, delay: 0.5 } },
};

export function HowItWorks() {
  return (
    <SectionWrapper id="how-it-works">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        transition={{ duration: 0.5 }}
        className="text-center mb-16"
      >
        <h2 className="text-4xl md:text-5xl font-bold tracking-tight text-white">
          <span className="gradient-text">Proposed pilot workflow</span>
        </h2>
        <p className="text-text-secondary mt-4">
          Self-service intake is paused. A customer-facing pilot is not yet available.
        </p>
      </motion.div>

      <div className="relative max-w-5xl mx-auto px-4">
        <motion.div
          variants={containerVariants}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: '-80px' }}
          className="flex flex-col md:flex-row items-center md:items-start gap-8 md:gap-0"
        >
          {steps.map((step, idx) => (
            <div key={idx} className="flex flex-col md:flex-row items-center w-full">
              <motion.div
                variants={stepVariants}
                className="flex flex-col items-center text-center flex-1 px-6"
              >
                {/* Numbered circle */}
                <div className="relative mb-6">
                  <div className="w-16 h-16 rounded-full gradient-btn flex items-center justify-center text-white font-bold text-xl shadow-lg shadow-blue-500/20 mb-4">
                    {step.number}
                  </div>
                  <div className="w-14 h-14 rounded-full glass border border-white/10 flex items-center justify-center absolute -bottom-3 left-1/2 -translate-x-1/2 bg-bg-secondary">
                    {step.icon}
                  </div>
                </div>
                <div className="mt-8">
                  <h3 className="text-xl font-semibold text-white mb-3">{step.title}</h3>
                  <p className="text-text-secondary text-sm leading-relaxed max-w-[220px] mx-auto">
                    {step.description}
                  </p>
                </div>
              </motion.div>

              {/* Connecting line between steps */}
              {idx < steps.length - 1 && (
                <div className="hidden md:block flex-shrink-0 w-16 mt-8">
                  <motion.div
                    variants={lineVariants}
                    style={{ originX: 0 }}
                    className="h-px w-full bg-gradient-to-r from-blue-500 to-purple-500 opacity-50"
                  />
                </div>
              )}
            </div>
          ))}
        </motion.div>
      </div>
    </SectionWrapper>
  );
}
