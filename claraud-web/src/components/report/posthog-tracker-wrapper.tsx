'use client';

import { useEffect } from 'react';
import { usePostHog } from '@/hooks/use-posthog';

interface PostHogTrackerWrapperProps {
    token: string;
    overallScore: number;
    findingsCount: number;
}

export function PostHogTrackerWrapper({ token, overallScore, findingsCount }: PostHogTrackerWrapperProps) {
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