import Link from 'next/link';
import { PrintButton } from '@/components/sales-toolkit/PrintButton';

const DOCUMENTS = [
  {
    href: '/sales-toolkit/one-pager',
    title: 'One-Pager Explainer',
    description: 'Single-page handout for door-to-door. "Is Your Website Costing You Customers?"',
  },
  {
    href: '/sales-toolkit/pricing',
    title: 'Pricing Card',
    description: 'Clean pricing card for all 3 tiers.',
  },
  {
    href: '/sales-toolkit/objections',
    title: 'Objection Handler',
    description: 'Internal cheat sheet — 10 common objections and responses.',
  },
  {
    href: '/sales-toolkit/discovery-script',
    title: 'Discovery Call Script',
    description: 'Step-by-step script for follow-up calls.',
  },
  {
    href: '/sales-toolkit/launch-checklist',
    title: 'Launch Day Checklist',
    description: 'Printable checklist for launch day — before, during, after each visit.',
  },
  {
    href: '/sales-toolkit/pitch-rehearsal',
    title: 'Pitch Rehearsal',
    description: 'Dress rehearsal checklist — full pitch walkthrough to practice before Day 1.',
  },
];

export default function SalesToolkitPage() {
  return (
    <div className="sales-index">
      <header className="sales-index-header">
        <h1>Sales Toolkit</h1>
        <p className="sales-index-sub">Print-ready materials for door-to-door in Saskatoon</p>
      </header>
      <div className="sales-index-grid">
        {DOCUMENTS.map((doc) => (
          <article key={doc.href} className="sales-index-card">
            <h2>{doc.title}</h2>
            <p>{doc.description}</p>
            <div className="sales-index-actions">
              <Link href={doc.href} className="sales-index-link">
                Open →
              </Link>
              <a href={`${doc.href}?print=1`} target="_blank" rel="noopener noreferrer">
                <PrintButton label="Print" />
              </a>
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}
