"use client";
import { motion } from 'framer-motion';
import { ReactNode } from 'react';

export function SectionWrapper({ children, id, className = "" }: { children: ReactNode, id?: string, className?: string }) {
  return (
    <motion.section 
      id={id}
      initial="hidden"
      whileInView="visible"
      viewport={{ once: true, margin: "-100px" }}
      variants={{
        hidden: { opacity: 0, y: 30 },
        visible: { opacity: 1, y: 0, transition: { duration: 0.6, ease: "easeOut" } }
      }}
      className={`container mx-auto py-20 lg:py-32 ${className}`}
    >
      {children}
    </motion.section>
  );
}