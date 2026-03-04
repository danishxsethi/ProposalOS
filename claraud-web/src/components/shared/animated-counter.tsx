"use client";
import { useEffect, useState } from 'react';
import { motion, useMotionValue, useTransform, animate } from 'framer-motion';

export function AnimatedCounter({ value, duration = 0.8 }: { value: number; duration?: number }) {
  const count = useMotionValue(0);
  const rounded = useTransform(count, (latest) => latest.toFixed(1));
  const [display, setDisplay] = useState("0.0");

  useEffect(() => {
    const controls = animate(count, value, { duration });
    return controls.stop;
  }, [value, duration, count]);

  useEffect(() => {
    return rounded.on("change", (latest) => setDisplay(latest));
  }, [rounded]);

  return <motion.span>{display}</motion.span>;
}