import Link from 'next/link';
import { PrintButton } from '@/components/sales-toolkit/PrintButton';
import { PrintTrigger } from '@/components/sales-toolkit/PrintTrigger';

const TIERS = [
  { name: 'Starter', price: 497, timeline: '5 business days', recommended: false, items: ['Speed optimization', 'Basic SEO fixes', 'Mobile experience improvements', 'Core Web Vitals fixes'] },
  { name: 'Growth', price: 1497, timeline: '10 business days', recommended: true, items: ['Everything in Starter', 'Full SEO optimization', 'Google Business optimization', 'Competitor analysis', 'Conversion improvements', 'Schema markup'] },
  { name: 'Premium', price: 2997, timeline: '15 business days', recommended: false, items: ['Everything in Growth', 'Ongoing support', 'Monthly performance reports', 'Priority fixes'] },
];

export default function PricingPage() {
  return (
    <>
      <PrintTrigger />
      <div className="sales-no-print" style={{ marginBottom: '1rem', display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
        <Link href="/sales-toolkit" style={{ color: '#e94560', fontWeight: 600, textDecoration: 'none' }}>← Back</Link>
        <PrintButton />
      </div>
      <div className="pricing-page">
        <h1 className="pricing-title">Website Optimization Plans</h1>
        <div className="pricing-grid">
          {TIERS.map((tier) => (
            <div key={tier.name} className={`pricing-card ${tier.recommended ? 'pricing-recommended' : ''}`}>
              {tier.recommended && <span className="pricing-badge">RECOMMENDED</span>}
              <h2>{tier.name}</h2>
              <p className="pricing-price">${tier.price.toLocaleString()}</p>
              <p className="pricing-timeline">{tier.timeline}</p>
              <ul>
                {tier.items.map((item) => (
                  <li key={item}>✓ {item}</li>
                ))}
              </ul>
            </div>
          ))}
        </div>
        <p className="pricing-guarantee">100% satisfaction guarantee or your money back</p>
        <footer className="pricing-footer">
          <p><strong>Proposal Engine</strong></p>
          <p>{process.env.NEXT_PUBLIC_APP_URL || 'proposalengine.com'}</p>
        </footer>
      </div>
    </>
  );
}
