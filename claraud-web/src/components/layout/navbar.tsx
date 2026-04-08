'use client';

import { useState } from 'react';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

import { AnimatePresence, motion } from 'framer-motion';
import { Menu, X } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { ThemeToggle } from '@/providers/theme-provider';
import { NAV_LINKS } from '@/lib/constants';
import { cn } from '@/lib/utils';

export function Navbar() {
  const pathname = usePathname();
  const [isOpen, setIsOpen] = useState(false);

  const handleScroll = (e: React.MouseEvent<HTMLAnchorElement>, href: string) => {
    if (href.startsWith('/#')) {
      if (pathname === '/') {
        e.preventDefault();
        const id = href.replace('/#', '');
        const element = document.getElementById(id);
        if (element) {
          element.scrollIntoView({ behavior: 'smooth' });
        }
      }
    }
    setIsOpen(false);
  };

  return (
    <motion.header
      initial={{ opacity: 0, y: -20 }}
      animate={{ opacity: 1, y: 0 }}
      className="sticky top-0 z-50 w-full border-b border-white/10 glass"
    >
      <div className="container flex h-16 items-center justify-between px-4">
        <Link
          href="/"
          className="font-bold font-sans text-2xl gradient-text lowercase transition-opacity hover:opacity-80"
        >
          claraud
        </Link>

        {/* Desktop Nav */}
        <nav className="hidden md:flex items-center gap-6">
          {NAV_LINKS.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              onClick={(e) => handleScroll(e, link.href)}
              className={cn(
                'text-sm font-medium transition-all hover:text-white relative py-1',
                pathname === link.href || (link.href.startsWith('/#') && pathname === '/')
                  ? 'text-white'
                  : 'text-text-secondary'
              )}
            >
              {link.name}
              {pathname === link.href && (
                <motion.div
                  layoutId="nav-underline"
                  className="absolute bottom-0 left-0 right-0 h-0.5 bg-blue-500 rounded-full"
                />
              )}
            </Link>
          ))}
          <ThemeToggle />
          <Button className="gradient-btn font-bold px-6 rounded-full" asChild>
            <Link href="/scan">Scan Free &rarr;</Link>
          </Button>
        </nav>

        {/* Mobile Toggle */}
        <button
          className="md:hidden text-white p-2 touch-target"
          onClick={() => setIsOpen(!isOpen)}
          aria-label="Toggle menu"
        >
          {isOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
        </button>
      </div>

      {/* Mobile Menu */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="md:hidden overflow-hidden bg-[#0a0a0f] border-b border-white/10"
          >
            <div className="container flex flex-col gap-4 py-8 px-4">
              {NAV_LINKS.map((link) => (
                <Link
                  key={link.href}
                  href={link.href}
                  onClick={(e) => handleScroll(e, link.href)}
                  className={cn(
                    'text-xl font-bold transition-colors py-2',
                    pathname === link.href ? 'text-blue-400' : 'text-text-secondary'
                  )}
                >
                  {link.name}
                </Link>
              ))}
              <div className="flex items-center gap-4 mt-2">
                <ThemeToggle />
                <Button className="gradient-btn font-bold py-6 text-lg rounded-2xl" asChild>
                  <Link href="/scan" onClick={() => setIsOpen(false)}>
                    Scan Free &rarr;
                  </Link>
                </Button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.header>
  );
}
