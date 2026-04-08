import { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Pricing | Claraud',
};

export default function PricingLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
