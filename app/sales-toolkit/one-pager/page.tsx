import Link from 'next/link';
import { PrintButton } from '@/components/sales-toolkit/PrintButton';
import { PrintTrigger } from '@/components/sales-toolkit/PrintTrigger';

const BASE_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://proposalengine.com';
const SAMPLE_PROPOSAL_URL = `${BASE_URL}/proposal/demo`;

function QrCode({ data, size = 120 }: { data: string; size?: number }) {
  const encoded = encodeURIComponent(data);
  return (
    <img
      src={`https://api.qrserver.com/v1/create-qr-code/?size=${size}x${size}&data=${encoded}`}
      alt="QR Code"
      width={size}
      height={size}
      style={{ imageRendering: 'pixelated' }}
    />
  );
}

export default function OnePagerPage() {
  return (
    <>
      <PrintTrigger />
      <div className="sales-no-print" style={{ marginBottom: '1rem', display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
        <Link href="/sales-toolkit" style={{ color: '#e94560', fontWeight: 600, textDecoration: 'none' }}>
          ← Back
        </Link>
        <PrintButton />
      </div>
      <div className="one-pager">
        <header className="op-header">
          <h1>Is Your Website Costing You Customers?</h1>
          <p className="op-subheader">
            We audit your website in 30 seconds and show you exactly what&apos;s wrong — for free.
          </p>
        </header>

        <section className="op-columns">
          <div className="op-col">
            <div className="op-icon">🔍</div>
            <h3>We Scan</h3>
            <p>
              Our AI analyzes your website&apos;s speed, SEO, reputation, and mobile experience against 50+ checkpoints.
            </p>
          </div>
          <div className="op-col">
            <div className="op-icon">📋</div>
            <h3>We Diagnose</h3>
            <p>
              You get a detailed report showing exactly what&apos;s holding you back and what it&apos;s costing you in lost customers.
            </p>
          </div>
          <div className="op-col">
            <div className="op-icon">⚡</div>
            <h3>We Fix</h3>
            <p>
              Choose a plan and we handle everything. Most improvements are live within 5–10 business days.
            </p>
          </div>
        </section>

        <section className="op-social-proof">
          <p>Built on the same technology used by Fortune 500 companies</p>
        </section>

        <section className="op-pricing">
          <div className="op-pricing-main">
            <p className="op-pricing-label">Plans from $497</p>
            <QrCode data={`${BASE_URL}`} size={100} />
          </div>
        </section>

        <footer className="op-footer">
          <div className="op-footer-left">
            <p><strong>Proposal Engine</strong></p>
            <p>{process.env.NEXT_PUBLIC_APP_URL || 'proposalengine.com'}</p>
          </div>
          <div className="op-footer-right">
            <p>Sample audit:</p>
            <QrCode data={SAMPLE_PROPOSAL_URL} size={80} />
          </div>
        </footer>
      </div>
    </>
  );
}
