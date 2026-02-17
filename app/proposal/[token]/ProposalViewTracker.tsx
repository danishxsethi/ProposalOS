'use client';

import { useEffect, useRef, useCallback, useMemo } from 'react';

const TRACK_URL = (t: string) => `/api/proposal/${t}/track`;

export function useProposalViewTracking(token: string) {
    const sessionId = useMemo(() => crypto.randomUUID(), []);
    const scrollMilestones = useRef<Set<number>>(new Set());
    const lastTimeBeacon = useRef(0);
    const viewSent = useRef(false);
    const startTime = useRef(Date.now());

    const sendBeacon = useCallback(
        (event: string, data: Record<string, unknown> = {}) => {
            const body = JSON.stringify({
                event,
                sessionId,
                referrer: typeof document !== 'undefined' ? document.referrer || undefined : undefined,
                ...data,
            });
            navigator.sendBeacon?.(TRACK_URL(token), new Blob([body], { type: 'application/json' }));
        },
        [token, sessionId]
    );

    useEffect(() => {
        if (viewSent.current) return;
        viewSent.current = true;
        sendBeacon('view');
    }, [sendBeacon]);

    useEffect(() => {
        const handleScroll = () => {
            const scrollTop = window.scrollY;
            const docHeight = document.documentElement.scrollHeight - window.innerHeight;
            if (docHeight <= 0) return;
            const pct = Math.round((scrollTop / docHeight) * 100);
            for (const milestone of [25, 50, 75, 100]) {
                if (pct >= milestone && !scrollMilestones.current.has(milestone)) {
                    scrollMilestones.current.add(milestone);
                    sendBeacon('scroll', { scrollDepth: milestone });
                }
            }
        };
        const debouncedScroll = () => {
            requestAnimationFrame(handleScroll);
        };
        window.addEventListener('scroll', debouncedScroll, { passive: true });
        handleScroll();
        return () => window.removeEventListener('scroll', debouncedScroll);
    }, [sendBeacon]);

    useEffect(() => {
        const interval = setInterval(() => {
            const elapsed = Math.floor((Date.now() - startTime.current) / 1000);
            if (elapsed - lastTimeBeacon.current >= 30) {
                lastTimeBeacon.current = elapsed;
                sendBeacon('time', { timeOnPageSeconds: elapsed });
            }
        }, 10000);
        return () => clearInterval(interval);
    }, [sendBeacon]);

    // Beacon on visibilitychange (tab hidden) and beforeunload (page close)
    useEffect(() => {
        const sendTimeOnExit = () => {
            const elapsed = Math.floor((Date.now() - startTime.current) / 1000);
            sendBeacon('time', { timeOnPageSeconds: elapsed });
        };
        const handleVisibilityChange = () => {
            if (document.visibilityState === 'hidden') sendTimeOnExit();
        };
        const handleBeforeUnload = () => sendTimeOnExit();
        document.addEventListener('visibilitychange', handleVisibilityChange);
        window.addEventListener('beforeunload', handleBeforeUnload);
        return () => {
            document.removeEventListener('visibilitychange', handleVisibilityChange);
            window.removeEventListener('beforeunload', handleBeforeUnload);
        };
    }, [sendBeacon]);

    const trackCta = useCallback(() => sendBeacon('cta'), [sendBeacon]);
    const trackExpand = useCallback(
        (sectionId: string) => sendBeacon('expand', { expandedSections: [sectionId] }),
        [sendBeacon]
    );

    return { trackCta, trackExpand, sessionId };
}
