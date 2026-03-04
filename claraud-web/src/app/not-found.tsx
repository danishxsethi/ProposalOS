'use client';

import Link from 'next/link';
import { motion } from 'framer-motion';
import { ArrowLeft, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

export default function NotFound() {
    return (
        <div className="min-h-screen bg-bg-primary flex flex-col items-center justify-center p-4 relative overflow-hidden">
            {/* Background decoration */}
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-blue-500/5 rounded-full blur-[120px] pointer-events-none" />

            <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="z-10 text-center max-w-md w-full"
            >
                {/* 404 Text */}
                <motion.div
                    initial={{ scale: 0.8, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    transition={{ delay: 0.1, type: 'spring' }}
                >
                    <h1 className="text-8xl font-black tracking-tighter mb-4">
                        <span className="block text-transparent bg-clip-text bg-gradient-to-r from-blue-400 via-purple-400 to-pink-400">
                            404
                        </span>
                    </h1>
                </motion.div>

                {/* Main Heading */}
                <motion.h2
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: 0.2 }}
                    className="text-2xl font-bold text-white mb-2"
                >
                    This page doesn't exist.
                </motion.h2>

                {/* Subheading */}
                <motion.p
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: 0.3 }}
                    className="text-text-secondary mb-8"
                >
                    But your business audit does.
                </motion.p>

                {/* Scan Input */}
                <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.4 }}
                    className="flex flex-col sm:flex-row gap-2 mb-8"
                >
                    <Input
                        type="text"
                        placeholder="Enter your business URL..."
                        className="flex-1 bg-bg-input border-white/10 text-white"
                    />
                    <Button className="gradient-btn font-semibold">
                        <Search className="w-4 h-4 mr-2" />
                        Scan
                    </Button>
                </motion.div>

                {/* Back to Home Link */}
                <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: 0.5 }}
                >
                    <Link
                        href="/"
                        className="inline-flex items-center gap-2 text-blue-400 hover:text-blue-300 transition-colors font-medium"
                    >
                        <ArrowLeft className="w-4 h-4" />
                        Back to home
                    </Link>
                </motion.div>
            </motion.div>
        </div>
    );
}