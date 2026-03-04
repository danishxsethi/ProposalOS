import Link from 'next/link';
import { NAV_LINKS } from '@/lib/constants';

export function Footer() {
  return (
    <footer className="bg-[#0a0a0f] border-t border-white/10 pt-16 pb-8">
      <div className="container grid grid-cols-1 md:grid-cols-4 gap-12 lg:gap-8 mb-16">
        <div>
          <h3 className="font-bold text-xl gradient-text lowercase mb-4">claraud</h3>
          <p className="text-sm text-text-secondary leading-relaxed">
            AI-powered business audit tool that uncovers hidden growth opportunities in 30 seconds.
          </p>
        </div>
        <div>
          <h4 className="font-semibold text-white mb-4">Product</h4>
          <ul className="space-y-3">
            {NAV_LINKS.map(link => (
              <li key={link.name}>
                <Link href={link.href} className="text-sm text-text-secondary hover:text-white transition-colors">
                  {link.name}
                </Link>
              </li>
            ))}
          </ul>
        </div>
        <div>
          <h4 className="font-semibold text-white mb-4">Legal</h4>
          <ul className="space-y-3 text-sm text-text-secondary">
            <li><Link href="/privacy" className="hover:text-white transition-colors">Privacy Policy</Link></li>
            <li><Link href="/terms" className="hover:text-white transition-colors">Terms of Service</Link></li>
          </ul>
        </div>
        <div>
          <h4 className="font-semibold text-white mb-4">Trust</h4>
          <ul className="space-y-3 text-sm text-text-secondary">
            <li className="flex items-center gap-2">✓ Powered by Google Cloud</li>
            <li className="flex items-center gap-2">✓ GDPR & PIPEDA Compliant</li>
            <li className="flex items-center gap-2">✓ 256-bit Encryption</li>
          </ul>
        </div>
      </div>
      <div className="container border-t border-white/10 pt-8 flex flex-col md:flex-row justify-between items-center text-xs text-text-secondary">
        <p>&copy; {new Date().getFullYear()} Claraud. All rights reserved.</p>
        <p className="mt-2 md:mt-0 lg:hidden">claraud.com</p>
      </div>
    </footer>
  );
}