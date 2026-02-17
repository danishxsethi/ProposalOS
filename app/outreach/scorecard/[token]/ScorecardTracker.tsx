'use client';

import { useEffect, useMemo, useRef } from 'react';

interface Props {
    token: string;
}

export default function ScorecardTracker({ token }: Props) {
    const sessionId = useMemo(() => crypto.randomUUID(), []);
    const startedAt = useRef(Date.now());
    const dwellSent = useRef(false);

    const sendEvent = (event: 'view' | 'time' | 'dwell' | 'cta', payload: Record<string, unknown> = {}) => {
        const body = JSON.stringify({
            event,
            sessionId,
            ...payload,
        });

        if (navigator.sendBeacon) {
            navigator.sendBeacon(`/api/outreach/scorecard/${token}/track`, new Blob([body], { type: 'application/json' }));
            return;
        }

        fetch(`/api/outreach/scorecard/${token}/track`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body,
            keepalive: true,
        }).catch(() => {});
    };

    useEffect(() => {
        sendEvent('view');
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    useEffect(() => {
        const interval = setInterval(() => {
            const elapsed = Math.floor((Date.now() - startedAt.current) / 1000);
            sendEvent('time', { seconds: elapsed });

            if (!dwellSent.current && elapsed >= 120) {
                dwellSent.current = true;
                sendEvent('dwell', { seconds: elapsed });
            }
        }, 10000);

        const handleVisibility = () => {
            if (document.visibilityState === 'hidden') {
                const elapsed = Math.floor((Date.now() - startedAt.current) / 1000);
                sendEvent('time', { seconds: elapsed });
            }
        };

        document.addEventListener('visibilitychange', handleVisibility);
        return () => {
            clearInterval(interval);
            document.removeEventListener('visibilitychange', handleVisibility);
        };
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    useEffect(() => {
        const clickHandler = (event: MouseEvent) => {
            const target = event.target as HTMLElement | null;
            if (!target) return;
            const ctaEl = target.closest('[data-scorecard-cta]');
            if (!ctaEl) return;
            const label = ctaEl.getAttribute('data-scorecard-cta') || 'cta';
            sendEvent('cta', { label });
        };

        document.addEventListener('click', clickHandler);
        return () => document.removeEventListener('click', clickHandler);
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    return null;
}

