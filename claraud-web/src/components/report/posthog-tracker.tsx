'use client';

import { useEffect } from 'react';
import { usePostHog } from '@/hooks/use-posthog';

interface PostHogTrackerProps {
    token: string;
    overallScore: number;
    findingsCount: number;
}

export function PostHogTracker({ token, overallScore, findingsCount }: PostHogTrackerProps) {
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