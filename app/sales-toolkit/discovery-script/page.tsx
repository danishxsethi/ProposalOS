import Link from 'next/link';
import { PrintButton } from '@/components/sales-toolkit/PrintButton';
import { PrintTrigger } from '@/components/sales-toolkit/PrintTrigger';

const STEPS = [
  {
    title: 'Opening (30 sec)',
    content: 'Hi [Name], this is Danish from Proposal Engine. We spoke [when] about the audit I did on your website. Did you get a chance to look at the report?',
  },
  {
    title: 'Recap (60 sec)',
    content: 'Summarize the top 3 findings from their specific audit. Use specific numbers.',
  },
  {
    title: 'Impact (60 sec)',
    content: "Based on what we found, we estimate you're losing about [X] potential customers per month due to [specific issue]. That's roughly $[Y] in lost revenue.",
  },
  {
    title: 'Solution (60 sec)',
    content: "The good news is most of this is fixable. Our Growth package covers everything in the audit — [list top 3 fixes]. Most clients see improvement within 2 weeks.",
  },
  {
    title: 'Close (30 sec)',
    content: 'Would you like to move forward with the Growth package? Or if you prefer to start smaller, the Starter package tackles the quick wins first.',
  },
  {
    title: 'If not ready',
    content: "No problem at all. The audit is yours to keep. If anything changes, just reply to my email and we'll pick up right where we left off.",
  },
];

export default function DiscoveryScriptPage() {
  return (
    <>
      <PrintTrigger />
      <div className="sales-no-print" style={{ marginBottom: '1rem', display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
        <Link href="/sales-toolkit" style={{ color: '#e94560', fontWeight: 600, textDecoration: 'none' }}>
          ← Back
        </Link>
        <PrintButton />
      </div>
      <div className="script-page">
        <header className="script-header">
          <h1>Discovery Call Script</h1>
          <p className="script-sub">Step-by-step script for follow-up calls</p>
        </header>
        <div className="script-steps">
          {STEPS.map((step, i) => (
            <div key={i} className="script-step">
              <div className="script-step-header">
                <span className="script-step-num">{i + 1}</span>
                <h2>{step.title}</h2>
              </div>
              <p>{step.content}</p>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}
