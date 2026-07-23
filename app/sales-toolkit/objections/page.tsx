import Link from 'next/link';
import { PrintButton } from '@/components/sales-toolkit/PrintButton';
import { PrintTrigger } from '@/components/sales-toolkit/PrintTrigger';

const OBJECTIONS = [
  { objection: 'I already have a web guy', response: 'Great! This audit might help them prioritize what to fix first. We often work alongside existing developers.' },
  { objection: "I don't need a website", response: "Your Google listing is your website for 70% of customers. Even without a site, your online presence matters." },
  { objection: "I can't afford this right now", response: "The Starter package pays for itself if it brings in just 2-3 extra customers. And the audit is free — no commitment." },
  { objection: 'My nephew built my website', response: "Family help is great! But technology changes fast. This audit just shows where things stand today." },
  { objection: 'How do I know this works?', response: "Here's a sample audit we did for a similar [industry] business. These are real numbers from real tools." },
  { objection: 'I need to think about it', response: "Absolutely. Here's the printed audit — take your time. The findings are valid for about 30 days." },
  { objection: 'What makes you different from other agencies?', response: "We use AI to analyze 50+ data points in 30 seconds. No other agency can give you this level of detail this fast." },
  { objection: 'My business is doing fine', response: "That's great! This audit often reveals hidden opportunities — things like showing up higher on Google when people search for [their service] in Saskatoon." },
  { objection: "I've been burned by agencies before", response: "I hear that a lot. That's exactly why we show you the audit first — real data, not sales talk. You decide if it's worth acting on." },
  { objection: 'Send me an email', response: "Happy to. Let me grab your email and I'll send the full audit report within an hour. You'll have the web link and a PDF." },
];

export default function ObjectionsPage() {
  return (
    <>
      <PrintTrigger />
      <div className="sales-no-print" style={{ marginBottom: '1rem', display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
        <Link href="/sales-toolkit" style={{ color: '#e94560', fontWeight: 600, textDecoration: 'none' }}>
          ← Back
        </Link>
        <PrintButton />
      </div>
      <div className="objections-page">
        <header className="obj-header">
          <h1>Objection Handler</h1>
          <p className="obj-sub">Internal cheat sheet — reference during sales calls</p>
        </header>
        <div className="obj-list">
          {OBJECTIONS.map((item, i) => (
            <div key={i} className="obj-item">
              <div className="obj-num">{i + 1}</div>
              <div className="obj-content">
                <p className="obj-objection">&ldquo;{item.objection}&rdquo;</p>
                <p className="obj-response">→ {item.response}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}
