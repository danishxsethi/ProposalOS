"use client";
import Link from 'next/link';
import { motion } from 'framer-motion';
import { NAV_LINKS } from '@/lib/constants';
import { Button } from '@/components/ui/button';
import { Menu } from 'lucide-react';
import { Sheet, SheetContent, SheetTrigger } from '@/components/ui/sheet';

export function Navbar() {
  return (
    <motion.header 
      initial={{ opacity: 0 }} 
      animate={{ opacity: 1 }} 
      className="sticky top-0 z-50 w-full border-b border-white/10 glass"
    >
      <div className="container flex h-16 items-center justify-between">
        <Link href="/" className="font-bold font-sans text-2xl gradient-text lowercase">
          claraud
        </Link>
        <nav className="hidden md:flex gap-6">
          {NAV_LINKS.map(link => (
            <Link key={link.href} href={link.href} className="text-sm font-medium text-text-secondary hover:text-white transition-colors">
              {link.name}
            </Link>
          ))}
        </nav>
        <div className="hidden md:flex">
          <Button className="gradient-btn font-semibold" asChild>
            <Link href="/scan">Scan Free &rarr;</Link>
          </Button>
        </div>
        <div className="md:hidden">
          <Sheet>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon"><Menu /></Button>
            </SheetTrigger>
            <SheetContent side="right" className="glass bg-bg-secondary w-[250px]">
              <nav className="flex flex-col gap-4 mt-8">
                {NAV_LINKS.map(link => (
                  <Link key={link.href} href={link.href} className="text-lg font-medium text-text-secondary hover:text-white">
                    {link.name}
                  </Link>
                ))}
                <Button className="gradient-btn font-semibold mt-4" asChild>
                  <Link href="/scan">Scan Free &rarr;</Link>
                </Button>
              </nav>
            </SheetContent>
          </Sheet>
        </div>
      </div>
    </motion.header>
  );
}