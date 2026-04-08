"use client";

import { motion } from 'framer-motion';
import { SectionWrapper } from '@/components/shared/section-wrapper';
import { ScanInput } from '@/components/scan/scan-input';
import { Mail, MapPin, CheckCircle2 } from 'lucide-react';

const stats = [
    { label: "Audit dimensions", value: "30+" },
    { label: "Average scan time", value: "30s" },
    { label: "First scan, always free", value: "$0" },
    { label: "Uptime on Google Cloud", value: "99.9%" }
];

const team = [
    {
        name: "Danish Sethi",
        role: "Founder & CEO",
        bio: "Full-stack engineer obsessed with making AI useful for real businesses. Previously built AI systems at high-scale tech startups. Based in Saskatoon, Canada.",
        initials: "DS",
        gradient: "from-blue-500 to-indigo-600"
    },
    {
        name: "Dipesh Singh",
        role: "Founding Engineer",
        bio: "AI full-stack engineer building the audit engine and delivery pipeline. Expert in automated diagnosis and performance optimization. Based in India.",
        initials: "DS",
        gradient: "from-purple-500 to-pink-600"
    }
];

export default function AboutPage() {
    return (
        <div className="bg-[#0a0a0f] min-h-screen pt-20">
            {/* Section 1: Story */}
            <SectionWrapper>
                <div className="max-w-4xl mx-auto px-4 py-16 md:py-24">
                    <motion.h1 
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="text-4xl md:text-6xl font-bold text-white mb-10 leading-tight"
                    >
                        We built Claraud because <span className="gradient-text">bad advice is expensive.</span>
                    </motion.h1>
                    
                    <motion.div 
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.1 }}
                        className="space-y-6 text-text-secondary text-lg md:text-xl leading-relaxed"
                    >
                        <p>
                            Most small businesses get one of two things: a $5,000 agency retainer that delivers a PowerPoint deck, 
                            or free advice from the internet that's generic, outdated, and wrong.
                        </p>
                        <p>
                            We built Claraud to give every business the same quality audit that Fortune 500 companies get — 
                            but in 30 seconds, not 30 days. And for free.
                        </p>
                        <p>
                            Our AI engine analyzes 30+ dimensions of your online presence — website performance, Google Business Profile, 
                            SEO, reviews, social media, and competitive landscape — then builds a personalized action plan ranked by impact.
                        </p>
                    </motion.div>
                </div>
            </SectionWrapper>

            {/* Section 2: Team */}
            <SectionWrapper className="bg-white/5">
                <div className="max-w-6xl mx-auto px-4 py-24">
                    <h2 className="text-3xl md:text-4xl font-bold text-white mb-12 text-center">Who we are</h2>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                        {team.map((member, idx) => (
                            <motion.div 
                                key={idx}
                                initial={{ opacity: 0, x: idx === 0 ? -20 : 20 }}
                                whileInView={{ opacity: 1, x: 0 }}
                                viewport={{ once: true }}
                                className="glass rounded-3xl p-8 flex flex-col md:flex-row gap-8 items-center md:items-start border border-white/10"
                            >
                                <div className={`w-24 h-24 rounded-full flex-shrink-0 bg-gradient-to-br ${member.gradient} flex items-center justify-center text-2xl font-bold text-white shadow-xl shadow-blue-500/10`}>
                                    {member.initials}
                                </div>
                                <div className="text-center md:text-left">
                                    <h3 className="text-2xl font-bold text-white mb-1">{member.name}</h3>
                                    <p className="text-blue-400 font-semibold mb-4 uppercase tracking-widest text-xs">{member.role}</p>
                                    <p className="text-text-secondary leading-relaxed">{member.bio}</p>
                                </div>
                            </motion.div>
                        ))}
                    </div>
                </div>
            </SectionWrapper>

            {/* Section 3: Tech Credibility */}
            <SectionWrapper>
                <div className="max-w-6xl mx-auto px-4 py-24 text-center">
                    <h2 className="text-3xl md:text-4xl font-bold text-white mb-16">Built different.</h2>
                    <div className="grid grid-cols-2 lg:grid-cols-4 gap-6 md:gap-12 mb-16">
                        {stats.map((stat, idx) => (
                            <motion.div 
                                key={idx}
                                initial={{ opacity: 0, scale: 0.9 }}
                                whileInView={{ opacity: 1, scale: 1 }}
                                viewport={{ once: true }}
                                transition={{ delay: idx * 0.1 }}
                                className="glass rounded-2xl p-8 border border-white/5 flex flex-col items-center justify-center gap-2"
                            >
                                <span className="text-4xl md:text-5xl font-bold gradient-text">{stat.value}</span>
                                <span className="text-text-secondary text-sm font-medium uppercase tracking-widest">{stat.label}</span>
                            </motion.div>
                        ))}
                    </div>
                    <div className="flex flex-wrap justify-center items-center gap-4 md:gap-8 text-text-secondary font-medium">
                        <span className="flex items-center gap-2 bg-white/5 px-4 py-2 rounded-full border border-white/10">
                            <CheckCircle2 className="w-4 h-4 text-blue-400" />
                            Powered by Google Cloud
                        </span>
                        <span className="flex items-center gap-2 bg-white/5 px-4 py-2 rounded-full border border-white/10">
                            <CheckCircle2 className="w-4 h-4 text-blue-400" />
                            Vertex AI
                        </span>
                        <span className="flex items-center gap-2 bg-white/5 px-4 py-2 rounded-full border border-white/10">
                            Built in Canada 🇨🇦
                        </span>
                    </div>
                </div>
            </SectionWrapper>

            {/* Section 4: Contact */}
            <SectionWrapper className="bg-gradient-to-b from-transparent to-blue-600/10">
                <div className="max-w-4xl mx-auto px-4 py-24 text-center">
                    <h2 className="text-3xl md:text-5xl font-bold text-white mb-12">Get in touch</h2>
                    
                    <div className="flex flex-col md:flex-row justify-center items-center gap-12 mb-20">
                        <a href="mailto:hello@claraud.com" className="group flex flex-col items-center gap-4 transition-all">
                            <div className="w-16 h-16 rounded-full bg-blue-500/10 border border-blue-500/20 flex items-center justify-center group-hover:bg-blue-500/20 group-hover:scale-110 transition-all">
                                <Mail className="w-6 h-6 text-blue-400" />
                            </div>
                            <div>
                                <p className="text-text-secondary text-sm font-bold uppercase tracking-widest mb-1">Email us</p>
                                <p className="text-white text-xl font-bold">hello@claraud.com</p>
                            </div>
                        </a>

                        <div className="flex flex-col items-center gap-4">
                            <div className="w-16 h-16 rounded-full bg-purple-500/10 border border-purple-500/20 flex items-center justify-center">
                                <MapPin className="w-6 h-6 text-purple-400" />
                            </div>
                            <div>
                                <p className="text-text-secondary text-sm font-bold uppercase tracking-widest mb-1">Location</p>
                                <p className="text-white text-xl font-bold">Saskatoon, SK, Canada</p>
                            </div>
                        </div>
                    </div>

                    <div className="glass p-12 rounded-[40px] border border-blue-500/20">
                        <h3 className="text-2xl font-bold text-white mb-6">Or just scan your business — we'll be in touch →</h3>
                        <div className="max-w-2xl mx-auto">
                            <ScanInput variant="large" />
                        </div>
                    </div>
                </div>
            </SectionWrapper>
        </div>
    );
}
