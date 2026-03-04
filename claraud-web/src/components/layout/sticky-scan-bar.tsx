"use client";

import { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ScanInput } from '@/components/scan/scan-input';

export function StickyScanBar() {
    const [isVisible, setIsVisible] = useState(false);
    const sentinelRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        // We watch a sentinel placed at the bottom of the hero section
        const sentinel = document.getElementById('hero-sentinel');
        if (!sentinel) return;

        const observer = new IntersectionObserver(
            ([entry]) => {
                // Show bar when hero is out of view (sentinel not intersecting)
                setIsVisible(!entry.isIntersecting);
            },
            { threshold: 0 }
        );

        observer.observe(sentinel);
        return () => observer.disconnect();
    }, []);

    return (
        <AnimatePresence>
            {isVisible && (
                <motion.div
                    initial={{ y: 80, opacity: 0 }}
                    animate={{ y: 0, opacity: 1 }}
                    exit={{ y: 80, opacity: 0 }}
                    transition={{ duration: 0.3, ease: 'easeOut' }}
                    className="fixed bottom-0 left-0 right-0 z-50 px-4 pb-4"
                >
                    <div className="max-w-2xl mx-auto glass border border-white/10 rounded-2xl p-3 shadow-2xl shadow-black/40">
                        <ScanInput variant="compact" />
                    </div>
                </motion.div>
            )}
        </AnimatePresence>
    );
}