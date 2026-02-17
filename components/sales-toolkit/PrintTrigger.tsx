'use client';

import { useEffect } from 'react';

export function PrintTrigger() {
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      if (params.get('print') === '1') {
        const t = setTimeout(() => window.print(), 300);
        return () => clearTimeout(t);
      }
    }
  }, []);

  return null;
}
