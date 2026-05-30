'use client';

import { motion } from 'framer-motion';

export default function Loading() {
  return (
    <div className="min-h-screen bg-[#0a0a0f] flex flex-col items-center justify-center pt-20 text-center px-4">
      <motion.div className="w-16 h-16 border-4 border-purple-500/20 border-t-purple-500 rounded-full animate-spin mb-8" />
      <h2 className="text-2xl font-bold text-white mb-2">Loading your report...</h2>
      <p className="text-text-secondary">Generating personalized insights.</p>
    </div>
  );
}
