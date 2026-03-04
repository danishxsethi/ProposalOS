'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { ScanStatus } from '@/lib/types';

interface UseScanProgressResult {
  status: ScanStatus | null;
  isComplete: boolean;
  error: string | null;
}

export function useScanProgress(token: string): UseScanProgressResult {
  const [status, setStatus] = useState<ScanStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const poll = useCallback(async () => {
    abortRef.current = new AbortController();
    try {
      const res = await fetch(`/api/scan-status/${token}`, {
        signal: abortRef.current.signal,
      });
      if (!res.ok) throw new Error(`Status ${res.status}`);
      const data: ScanStatus = await res.json();
      setStatus(data);

      // Stop polling when done
      if (data.status === 'complete' || data.status === 'error') {
        if (intervalRef.current) clearInterval(intervalRef.current);
      }
    } catch (err: unknown) {
      if (err instanceof Error && err.name === 'AbortError') return;
      setError(err instanceof Error ? err.message : 'Network error');
    }
  }, [token]);

  useEffect(() => {
    if (!token) return;

    // Poll immediately, then every 2 seconds
    poll();
    intervalRef.current = setInterval(poll, 2000);

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
      if (abortRef.current) abortRef.current.abort();
    };
  }, [token, poll]);

  const isComplete = status?.status === 'complete' || status?.status === 'error';

  return { status, isComplete, error };
}