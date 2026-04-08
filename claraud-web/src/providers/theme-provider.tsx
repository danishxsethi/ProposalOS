'use client';

import { ThemeProvider as NextThemesProvider, useTheme } from 'next-themes';
import * as React from 'react';

/**
 * Theme Provider with WCAG AA compliant theme switching
 * Supports: light, dark, and system preference
 */
export function ThemeProvider({ children }: { children: React.ReactNode }) {
  return (
    <NextThemesProvider
      attribute="data-theme"
      defaultTheme="system"
      enableSystem
      disableTransitionOnChange={false}
      storageKey="claraud-theme"
    >
      {children}
    </NextThemesProvider>
  );
}

/**
 * Theme Toggle Hook — Returns theme state and toggle function
 */
export function useThemeToggle() {
  const { theme, setTheme, resolvedTheme, systemTheme } = useTheme();

  const toggleTheme = React.useCallback(() => {
    setTheme(resolvedTheme === 'dark' ? 'light' : 'dark');
  }, [resolvedTheme, setTheme]);

  const isDark = resolvedTheme === 'dark';
  const isLight = resolvedTheme === 'light';
  const isSystem = theme === 'system';

  return {
    theme,
    resolvedTheme,
    systemTheme,
    isDark,
    isLight,
    isSystem,
    toggleTheme,
    setTheme,
    setLight: () => setTheme('light'),
    setDark: () => setTheme('dark'),
    setSystem: () => setTheme('system'),
  };
}

/**
 * Theme Toggle Button Component
 * Accessible button for switching between light and dark themes
 */
export function ThemeToggle() {
  const { resolvedTheme, toggleTheme } = useThemeToggle();
  const [mounted, setMounted] = React.useState(false);

  React.useEffect(() => {
    setMounted(true);
  }, []);

  // Avoid hydration mismatch
  if (!mounted) {
    return (
      <button
        className="p-2 rounded-lg hover:bg-accent min-h-[44px] min-w-[44px]"
        aria-label="Loading theme toggle"
        disabled
      >
        <div className="w-5 h-5 bg-current rounded-sm opacity-50" />
      </button>
    );
  }

  return (
    <button
      onClick={toggleTheme}
      className="p-2 rounded-lg hover:bg-accent transition-colors min-h-[44px] min-w-[44px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
      aria-label={resolvedTheme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
      aria-pressed={resolvedTheme === 'dark'}
      type="button"
    >
      {resolvedTheme === 'dark' ? (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z"
          />
        </svg>
      ) : (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z"
          />
        </svg>
      )}
    </button>
  );
}