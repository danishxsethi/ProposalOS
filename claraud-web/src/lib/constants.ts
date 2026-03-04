import { Globe, MapPin, BarChart3, Star, Smartphone, Trophy } from 'lucide-react';

export const AUDIT_CATEGORIES = [
  { id: 'website', name: 'Website Performance', icon: Globe, color: '#3b82f6' },
  { id: 'google', name: 'Google Business Profile', icon: MapPin, color: '#22c55e' },
  { id: 'seo', name: 'SEO & Content', icon: BarChart3, color: '#f59e0b' },
  { id: 'reviews', name: 'Reviews & Reputation', icon: Star, color: '#ef4444' },
  { id: 'social', name: 'Social & Presence', icon: Smartphone, color: '#8b5cf6' },
  { id: 'competitors', name: 'Competitive Intel', icon: Trophy, color: '#ec4899' }
];

export const NAV_LINKS = [
  { name: 'How It Works', href: '/#how-it-works' },
  { name: 'Pricing', href: '/pricing' },
  { name: 'Agencies', href: '/agencies' },
  { name: 'Blog', href: '/blog' }
];

export const PRICING_TIERS = {
  starter: { id: 'starter', name: 'Starter', price: 0 },
  pro: { id: 'pro', name: 'Pro', price: 49 },
  agency: { id: 'agency', name: 'Agency', price: 199 }
};