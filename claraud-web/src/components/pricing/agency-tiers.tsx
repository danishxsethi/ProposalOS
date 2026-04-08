"use client";

import { motion } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { Check } from 'lucide-react';
import Link from 'next/link';
import { usePostHog } from '@/hooks/use-posthog';

const agencyTiers = [
    {
        name: "Starter",
        price: "99",
        tagline: "For solo consultants",
        features: [
            "25 audits/month",
            "White-label reports (your logo, your colors)",
            "Proposal generation",
            "Basic analytics"
        ],
        cta: "Start free trial",
        href: "/agencies",
        featured: false
    },
    {
        name: "Professional",
        price: "299",
        tagline: "For growing agencies",
        features: [
            "100 audits/month",
            "Everything in Starter",
            "Custom domain support",
            "Client portal",
            "API access",
            "Priority support"
        ],
        cta: "Start free trial",
        href: "/agencies",
        featured: true
    },
    {
        name: "Agency",
        price: "599",
        tagline: "For established teams",
        features: [
            "Unlimited audits",
            "Everything in Professional",
            "Multi-user seats (5 included)",
            "Advanced analytics",
            "Custom playbook builder",
            "Revenue share model for delivery",
            "Dedicated onboarding"
        ],
        cta: "Talk to us",
        href: "mailto:hello@claraud.com",
        featured: false
    }
];

export function AgencyTiers() {
    const { captureEvent } = usePostHog();

    return (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 max-w-6xl mx-auto px-4">
            {agencyTiers.map((tier, idx) => (
                <motion.div
                    key={tier.name}
                    initial={{ opacity: 0, y: 20 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true }}
                    transition={{ duration: 0.5, delay: idx * 0.1 }}
                    className={`glass rounded-2xl p-8 border ${tier.featured ? 'border-blue-500/50 ring-2 ring-blue-500/20' : 'border-white/10'
                        } relative flex flex-col h-full`}
                >
                    {tier.featured && (
                        <div className="absolute -top-px right-8 bg-gradient-to-r from-blue-600 to-purple-600 text-white text-[10px] font-bold uppercase tracking-widest px-3 py-1 rounded-b-lg">
                            Most Popular
                        </div>
                    )}

                    <div className="mb-8">
                        <h3 className="text-xl font-bold text-white mb-2">{tier.name}</h3>
                        <div className="flex items-baseline gap-1">
                            <span className="text-4xl font-bold text-white">${tier.price}</span>
                            <span className="text-text-secondary">/mo</span>
                        </div>
                        <p className="text-text-secondary text-sm mt-2">{tier.tagline}</p>
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
                        className={`w-full rounded-xl py-6 h-auto font-bold transition-all ${tier.featured ? 'gradient-btn border-none' : 'border-white/10 hover:bg-white/5 text-white'
                            }`}
                        onClick={() => captureEvent('agency_tier_clicked', { tier: tier.name })}
                    >
                        <Link href={tier.href}>
                            {tier.cta}
                        </Link>
                    </Button>
                </motion.div>
            ))}
        </div>
    );
}
