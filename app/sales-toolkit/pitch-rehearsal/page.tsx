import Link from 'next/link';
import { PrintButton } from '@/components/sales-toolkit/PrintButton';
import { PrintTrigger } from '@/components/sales-toolkit/PrintTrigger';

const REHEARSAL_STEPS = [
  { phase: 'Before the visit', items: ['One-pager + pricing card in hand', 'Phone charged, proposal link bookmarked', 'Know the business name and vertical', '30-second intro rehearsed'] },
  { phase: 'Opening (door / reception)', items: ['Smile, introduce yourself', '"I ran a free audit on [business] — found 3 quick wins. Got 2 minutes?"', 'Hand them the one-pager', 'If yes: pull up proposal on phone or tablet'] },
  { phase: 'The pitch (2–3 min)', items: ['Show proposal — scroll to executive summary', 'Cite 1–2 specific numbers from their audit', '"Your site loads in X seconds — 80% of [vertical] in Saskatoon are faster"', 'Point to pricing: "Growth covers everything we found"', 'Pause — let them react'] },
  { phase: 'Handle objections', items: ['Reference objection sheet if needed', '"I already have a web guy" → "This helps them prioritize"', '"I need to think" → "Audit is yours — valid 30 days"', 'Stay calm, never pushy'] },
  { phase: 'Close', items: ['"Want to move forward with Growth, or start with Starter?"', 'If yes: get email, send proposal link + follow-up #1', 'If no: "No pressure — here\'s the printed audit"', 'Thank them, leave card'] },
  { phase: 'After the visit', items: ['Log in CRM or spreadsheet', 'Send follow-up email within 1 hour', 'Add to calendar: follow-up #2 in 3 days'] },
];

export default function PitchRehearsalPage() {
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
          <h1>Pitch Rehearsal</h1>
          <p className="script-sub">Dress rehearsal checklist — practice until you can do it in your sleep</p>
        </header>
        <div className="script-steps">
          {REHEARSAL_STEPS.map((phase, i) => (
            <div key={i} className="script-step">
              <div className="script-step-header">
                <span className="script-step-num">{i + 1}</span>
                <h2>{phase.phase}</h2>
              </div>
              <ul style={{ margin: '0.5rem 0 0 1.25rem', padding: 0 }}>
                {phase.items.map((item, j) => (
                  <li key={j} style={{ marginBottom: '0.35rem' }}>
                    <span className="rehearsal-checkbox" aria-hidden>☐</span> {item}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
        <p style={{ marginTop: '1.5rem', fontSize: '0.9rem', color: '#666' }}>
          <strong>Time yourself:</strong> Full pitch should be under 3 minutes. Practice until smooth.
        </p>
      </div>
    </>
  );
}
