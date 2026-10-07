'use client';

import { useEffect, useRef, useState } from 'react';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

import { signOut } from 'next-auth/react';

type NavItem = { href: string; label: string; match?: (path: string) => boolean };

const PRIMARY: NavItem[] = [
  { href: '/dashboard', label: 'Audits', match: (p) => p === '/dashboard' || p.startsWith('/audit') || p.startsWith('/new-audit') },
  { href: '/proposals', label: 'Proposals' },
  { href: '/schedules', label: 'Schedules' },
  { href: '/analytics', label: 'Analytics' },
];

const SETTINGS: NavItem[] = [
  { href: '/settings/branding', label: 'Branding' },
  { href: '/settings/team', label: 'Team' },
  { href: '/settings/billing', label: 'Billing' },
  { href: '/settings/api-keys', label: 'API keys' },
  { href: '/settings/domain', label: 'Domain' },
  { href: '/settings/widget', label: 'Widget' },
];

function isActive(item: NavItem, pathname: string) {
  if (item.match) return item.match(pathname);
  return pathname === item.href || pathname.startsWith(item.href + '/');
}

export function AppShell({
  children,
  user,
  tenantName,
}: {
  children: React.ReactNode;
  user: { name?: string | null; email?: string | null };
  tenantName: string;
}) {
  const pathname = usePathname() ?? '';
  const [open, setOpen] = useState(false);
  const inSettings = pathname.startsWith('/settings');
  const mobileNavRef = useRef<HTMLElement>(null);
  const menuButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    mobileNavRef.current?.querySelector<HTMLAnchorElement>('a')?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpen(false);
        menuButtonRef.current?.focus();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open]);

  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  return (
    <div className="min-h-screen bg-slate-950 text-slate-200 selection:bg-indigo-500/30">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[100] focus:rounded-md focus:bg-indigo-600 focus:px-3 focus:py-2 focus:text-sm focus:font-medium focus:text-white focus:outline-none focus:ring-2 focus:ring-white"
      >
        Skip to main content
      </a>

      <header className="sticky top-0 z-40 border-b border-white/5 bg-slate-950/80 backdrop-blur-xl">
        <div className="mx-auto flex h-14 max-w-7xl items-center justify-between gap-4 px-4 sm:px-6">
          <div className="flex min-w-0 items-center gap-6">
            <Link
              href="/dashboard"
              className="flex shrink-0 items-center gap-2 rounded-md font-semibold tracking-tight text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400"
            >
              <span aria-hidden="true" className="grid h-7 w-7 place-items-center rounded-md bg-indigo-600 text-xs font-bold">
                P
              </span>
              <span className="sr-only sm:not-sr-only">ProposalOS</span>
            </Link>

            <nav aria-label="Primary" className="hidden lg:flex items-center gap-1">
              {PRIMARY.map((item) => {
                const active = isActive(item, pathname);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    aria-current={active ? 'page' : undefined}
                    className={`rounded-md px-3 py-1.5 text-sm font-medium transition focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400 ${
                      active ? 'bg-white/10 text-white' : 'text-slate-300 hover:bg-white/5 hover:text-white'
                    }`}
                  >
                    {item.label}
                  </Link>
                );
              })}
              <Link
                href="/settings/branding"
                aria-current={inSettings ? 'page' : undefined}
                className={`rounded-md px-3 py-1.5 text-sm font-medium transition focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400 ${
                  inSettings ? 'bg-white/10 text-white' : 'text-slate-300 hover:bg-white/5 hover:text-white'
                }`}
              >
                Settings
              </Link>
            </nav>
          </div>

          <div className="flex items-center gap-2">
            <Link
              href="/new-audit"
              className="hidden sm:inline-flex items-center rounded-md bg-indigo-600 px-3 py-1.5 text-sm font-semibold text-white shadow-sm transition hover:bg-indigo-500 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-300"
            >
              New audit
            </Link>
            <div className="hidden xl:flex flex-col items-end leading-tight">
              <span className="max-w-[180px] truncate text-xs font-medium text-slate-200" title={tenantName}>
                {tenantName}
              </span>
              <span className="max-w-[180px] truncate text-[11px] text-slate-400" title={user.email ?? ''}>
                {user.email}
              </span>
            </div>
            <button
              type="button"
              onClick={() => signOut({ callbackUrl: '/login' })}
              className="rounded-md border border-white/10 px-3 py-1.5 text-sm text-slate-300 transition hover:bg-white/5 hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400"
            >
              Sign out
            </button>
            <button
              ref={menuButtonRef}
              type="button"
              aria-label={open ? 'Close menu' : 'Open menu'}
              aria-expanded={open}
              aria-controls="mobile-nav"
              onClick={() => setOpen((v) => !v)}
              className="lg:hidden rounded-md border border-white/10 p-2 text-slate-300 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400"
            >
              <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                {open ? <path d="M6 6l12 12M18 6L6 18" /> : <path d="M4 7h16M4 12h16M4 17h16" />}
              </svg>
            </button>
          </div>
        </div>

        {open && (
          <nav ref={mobileNavRef} id="mobile-nav" aria-label="Mobile" className="lg:hidden border-t border-white/5 bg-slate-950 px-4 py-3">
            <div className="mb-3 px-3 text-xs text-slate-400">
              <div className="truncate font-medium text-slate-200">{tenantName}</div>
              <div className="truncate">{user.email}</div>
            </div>
            <ul className="flex flex-col gap-1">
              {[...PRIMARY, { href: '/new-audit', label: 'New audit' }, ...SETTINGS].map((item) => (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    onClick={() => setOpen(false)}
                    aria-current={isActive(item, pathname) ? 'page' : undefined}
                    className={`block rounded-md px-3 py-2 text-sm font-medium ${
                      isActive(item, pathname) ? 'bg-white/10 text-white' : 'text-slate-300 hover:bg-white/5'
                    }`}
                  >
                    {item.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        )}
      </header>

      {inSettings && (
        <div className="border-b border-white/5 bg-slate-950/60">
          <nav aria-label="Settings" className="mx-auto max-w-7xl overflow-x-auto px-4 sm:px-6">
            <ul className="flex gap-1 py-2">
              {SETTINGS.map((item) => {
                const active = isActive(item, pathname);
                return (
                  <li key={item.href} className="shrink-0">
                    <Link
                      href={item.href}
                      aria-current={active ? 'page' : undefined}
                      className={`rounded-md px-3 py-1.5 text-sm transition focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400 ${
                        active ? 'bg-white/10 text-white' : 'text-slate-400 hover:text-white'
                      }`}
                    >
                      {item.label}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </nav>
        </div>
      )}

      <main id="main" tabIndex={-1} className="mx-auto w-full max-w-7xl px-4 py-8 sm:px-6 focus:outline-none">
        {children}
      </main>
    </div>
  );
}
