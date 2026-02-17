import Link from 'next/link';
import { PrintButton } from '@/components/sales-toolkit/PrintButton';
import { PrintTrigger } from '@/components/sales-toolkit/PrintTrigger';

export default function LaunchChecklistPage() {
  return (
    <>
      <PrintTrigger />
      <div
        className="sales-no-print"
        style={{ marginBottom: '1rem', display: 'flex', gap: '0.75rem', alignItems: 'center' }}
      >
        <Link
          href="/sales-toolkit"
          style={{ color: '#e94560', fontWeight: 600, textDecoration: 'none' }}
        >
          ← Back
        </Link>
        <PrintButton />
      </div>
      <div className="launch-checklist">
        <header className="lc-header">
          <h1>Launch Day Checklist</h1>
          <p className="lc-sub">Print this before leaving the house</p>
        </header>

        <section className="lc-section">
          <h2>Before leaving the house</h2>
          <ul className="lc-list">
            <li className="lc-item">
              <span className="lc-check" />
              20 printed proposals (top prospects from blitz)
            </li>
            <li className="lc-item">
              <span className="lc-check" />
              20 one-pager explainers
            </li>
            <li className="lc-item">
              <span className="lc-check" />
              10 pricing cards
            </li>
            <li className="lc-item">
              <span className="lc-check" />
              Business cards with QR code
            </li>
            <li className="lc-item">
              <span className="lc-check" />
              Phone charged (for live demos)
            </li>
            <li className="lc-item">
              <span className="lc-check" />
              Proposal Engine app loaded on phone (test it)
            </li>
            <li className="lc-item">
              <span className="lc-check" />
              Route planned (which businesses, which order)
            </li>
            <li className="lc-item">
              <span className="lc-check" />
              Objection cheat sheet reviewed
            </li>
            <li className="lc-item">
              <span className="lc-check" />
              Dressed professionally but approachable
            </li>
            <li className="lc-item">
              <span className="lc-check" />
              Portfolio of 5 best proposals (to show quality)
            </li>
          </ul>
        </section>

        <section className="lc-section">
          <h2>During each visit</h2>
          <ul className="lc-list">
            <li className="lc-item">
              <span className="lc-check" />
              Introduce yourself (30 sec max)
            </li>
            <li className="lc-item">
              <span className="lc-check" />
              Show the audit (on phone or printed)
            </li>
            <li className="lc-item">
              <span className="lc-check" />
              Hand over the printed proposal
            </li>
            <li className="lc-item">
              <span className="lc-check" />
              Walk through 2–3 top findings
            </li>
            <li className="lc-item">
              <span className="lc-check" />
              Ask: &quot;Would you like us to fix these?&quot;
            </li>
            <li className="lc-item">
              <span className="lc-check" />
              If yes: Get their email, send proposal link, discuss timeline
            </li>
            <li className="lc-item">
              <span className="lc-check" />
              If maybe: Leave the proposal + one-pager, get their email for follow-up
            </li>
            <li className="lc-item">
              <span className="lc-check" />
              If no: Thank them, leave a business card
            </li>
          </ul>
        </section>

        <section className="lc-section">
          <h2>After each visit</h2>
          <ul className="lc-list">
            <li className="lc-item">
              <span className="lc-check" />
              Log the outcome in the Sales Pipeline
            </li>
            <li className="lc-item">
              <span className="lc-check" />
              Send follow-up email (if they gave email)
            </li>
            <li className="lc-item">
              <span className="lc-check" />
              Note any product issues to fix
            </li>
          </ul>
        </section>

        <section className="lc-section">
          <h2>End of day</h2>
          <ul className="lc-list">
            <li className="lc-item">
              <span className="lc-check" />
              Update Sales Pipeline with all outcomes
            </li>
            <li className="lc-item">
              <span className="lc-check" />
              Send all promised follow-up emails
            </li>
            <li className="lc-item">
              <span className="lc-check" />
              Fix any bugs discovered
            </li>
            <li className="lc-item">
              <span className="lc-check" />
              Plan tomorrow&apos;s route
            </li>
          </ul>
        </section>
      </div>
    </>
  );
}
