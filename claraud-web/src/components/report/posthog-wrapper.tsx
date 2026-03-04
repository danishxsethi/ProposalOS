'use client';

import { useEffect } from 'react';
import { usePostHog } from '@/hooks/use-posthog';

interface PostHogWrapperProps {
    token: string;
    overallScore: number;
    findingsCount: number;
}

export function PostHogWrapper({ token, overallScore, findingsCount }: PostHogWrapperProps) {
    const { captureEvent } = usePostHog();

    useEffect(() => {
        // Track report viewed
        captureEvent('report_viewed', {
            token,
            overallScore,
            findingsCount,
            timestamp: new Date().toISOString()
        });
    }, [token, overallScore, findingsCount, captureEvent]);

    return null;
}