'use client';

import { useEffect, useState } from 'react';

import { useRouter } from 'next/navigation';

import { zodResolver } from '@hookform/resolvers/zod';
import { motion } from 'framer-motion';
import { ArrowRight, Loader2, Lock } from 'lucide-react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';

import { AnimatedCounter } from '@/components/shared/animated-counter';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

const emailGateSchema = z.object({
  email: z.string().email('Please enter a valid email address'),
  name: z.string().optional(),
});
type EmailGateForm = z.infer<typeof emailGateSchema>;

interface EmailGateProps {
  token: string;
  overallScore: number;
  businessUrl: string;
  categoryScores: Record<string, number>;
}

export function EmailGate({ token, overallScore, businessUrl, categoryScores }: EmailGateProps) {
  const [returningEmail, setReturningEmail] = useState<string | null>(null);
  const router = useRouter();

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<EmailGateForm>({
    resolver: zodResolver(emailGateSchema),
    mode: 'onChange', // Validate on change (debounced implicitly by react-hook-form internals if configured, or just on blur/change)
    defaultValues: { email: '', name: '' },
  });

  useEffect(() => {
    const stored = localStorage.getItem('claraud_user_email');
    if (stored) setReturningEmail(stored);
  }, []);

  const getLetterGrade = (score: number) => {
    if (score >= 90) return { grade: 'A+', color: 'text-green-400' };
    if (score >= 80) return { grade: 'A', color: 'text-green-500' };
    if (score >= 70) return { grade: 'B', color: 'text-blue-400' };
    if (score >= 60) return { grade: 'C', color: 'text-amber-400' };
    if (score >= 50) return { grade: 'D', color: 'text-orange-400' };
    return { grade: 'F', color: 'text-red-500' };
  };

  const { grade, color } = getLetterGrade(overallScore * 10);

  const handleSkip = () => {
    router.push(`/report/${token}`);
  };

  const onSubmit = async (data: EmailGateForm) => {
    try {
      const res = await fetch('/api/lead', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: data.email,
          name: data.name,
          businessUrl,
          scanToken: token,
          scores: categoryScores,
        }),
      });

      if (res.ok) {
        localStorage.setItem('claraud_user_email', data.email);
        router.push(`/report/${token}`);
      }
    } catch (err) {
      console.error('Lead capture failed:', err);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
    >
      <div className="absolute inset-0 bg-black/60 backdrop-blur-md pointer-events-none" />

      <motion.div
        initial={{ scale: 0.9, opacity: 0, y: 20 }}
        animate={{ scale: 1, opacity: 1, y: 0 }}
        transition={{ type: 'spring', damping: 25, stiffness: 300 }}
        className="relative glass border border-white/10 rounded-2xl p-8 max-w-md w-full shadow-2xl"
      >
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-white/5 mb-6">
            <Lock className="w-8 h-8 text-blue-400" />
          </div>

          <div className="flex flex-col items-center gap-1 mb-4">
            <div className={`text-6xl font-black ${color}`}>
              <AnimatedCounter value={Math.round(overallScore * 10)} duration={2} />
            </div>
            <div className={`text-sm font-bold uppercase tracking-widest ${color}`}>
              Grade: {grade}
            </div>
          </div>

          <h2 className="text-2xl font-bold text-white mb-2">Audit Complete.</h2>
          <p className="text-text-secondary text-sm">
            Enter your email to unlock the full 30-point analysis for <strong>{businessUrl}</strong>
            .
          </p>
        </div>

        {returningEmail && (
          <div className="mb-6 p-4 bg-accent-primary/10 border border-accent-primary/20 rounded-xl text-center">
            <p className="text-sm text-white mb-2">Welcome back!</p>
            <Button
              variant="ghost"
              className="w-full text-accent-primary hover:text-accent-primary/80 hover:bg-accent-primary/10"
              onClick={handleSkip}
            >
              Continue as {returningEmail} →
            </Button>
          </div>
        )}

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div className="space-y-1 text-left">
            <Label htmlFor="name" className="text-text-secondary text-xs">
              Name (Optional)
            </Label>
            <Input
              id="name"
              type="text"
              placeholder="Your full name"
              {...register('name')}
              className="bg-bg-input border-white/10 text-white h-11"
              aria-invalid={!!errors.name}
            />
            {errors.name && (
              <p className="text-red-400 text-xs mt-1 font-medium">{errors.name.message}</p>
            )}
          </div>

          <div className="space-y-1 text-left">
            <Label htmlFor="email" className="text-text-secondary text-xs">
              Work Email <span className="text-red-500">*</span>
            </Label>
            <Input
              id="email"
              type="email"
              placeholder="name@company.com"
              {...register('email')}
              className={`bg-bg-input text-white h-11 ${errors.email ? 'border-red-500/50' : 'border-white/10'}`}
              aria-invalid={!!errors.email}
            />
            {errors.email && (
              <p className="text-red-400 text-xs mt-1 font-medium">{errors.email.message}</p>
            )}
          </div>

          <Button
            type="submit"
            disabled={isSubmitting}
            className="w-full h-12 gradient-btn font-bold text-base mt-2"
          >
            {isSubmitting ? (
              <Loader2 className="w-5 h-5 animate-spin" />
            ) : (
              <>
                Unlock Full Report <ArrowRight className="ml-2 w-5 h-5" />
              </>
            )}
          </Button>
        </form>

        <p className="text-[10px] text-text-secondary text-center mt-6 uppercase tracking-wider font-bold opacity-50">
          🔒 Secure and confidential. We never spam.
        </p>
      </motion.div>
    </motion.div>
  );
}
