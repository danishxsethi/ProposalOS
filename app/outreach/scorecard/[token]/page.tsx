import { prisma } from '@/lib/prisma';
import { notFound } from 'next/navigation';
import ScorecardTracker from './ScorecardTracker';
import { toObject, toStringArray } from '@/lib/outreach/sprint2/scorecard';

interface PageProps {
    params: Promise<{ token: string }>;
}

type PainRow = {
    key: string;
    score: number;
    weight: number;
    detail: string;
};

function titleForKey(key: string): string {
    switch (key) {
        case 'websiteSpeed': return 'Website Speed';
        case 'mobileBroken': return 'Mobile UX';
        case 'gbpNeglected': return 'Google Profile';
        case 'noSsl': return 'SSL / Trust';
        case 'zeroReviewResponses': return 'Review Responses';
        case 'socialDead': return 'Social Presence';
        case 'competitorsOutperforming': return 'Competitor Gap';
        case 'accessibilityViolations': return 'Accessibility';
        default: return key;
    }
}

function painRows(painBreakdown: unknown): PainRow[] {
    const obj = toObject<Record<string, unknown>>(painBreakdown, {});
    return Object.entries(obj)
        .map(([key, value]) => {
            const row = toObject<Record<string, unknown>>(value, {});
            const score = typeof row.score === 'number' ? row.score : 0;
            const weight = typeof row.weight === 'number' ? row.weight : 10;
            const detail = typeof row.detail === 'string' ? row.detail : '';
            return { key, score, weight, detail };
        })
        .sort((a, b) => b.score - a.score)
        .slice(0, 6);
}

function competitorName(qualificationEvidence: unknown): string | null {
    const obj = toObject<Record<string, unknown>>(qualificationEvidence, {});
    const competitorSignals = toObject<Record<string, unknown>>(obj.competitorSignals, {});
    const names = Array.isArray(competitorSignals.competitorNames)
        ? competitorSignals.competitorNames.filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
        : [];
    return names[0] ?? null;
}

export default async function ScorecardPage({ params }: PageProps) {
    const { token } = await params;

    const lead = await prisma.prospectLead.findUnique({
        where: { scorecardToken: token },
        select: {
            id: true,
            businessName: true,
            city: true,
            vertical: true,
            painScore: true,
            painBreakdown: true,
            topFindings: true,
            qualificationEvidence: true,
        },
    });

    if (!lead) return notFound();

    const findings = toStringArray(lead.topFindings).slice(0, 3);
    const rows = painRows(lead.painBreakdown);
    const competitor = competitorName(lead.qualificationEvidence);
    const calendarUrl = process.env.OUTREACH_CALENDAR_URL || 'mailto:hello@proposalos.com';
    const score = Math.max(0, Math.min(100, lead.painScore ?? 0));

    return (
        <main className="min-h-screen bg-[#f7f8fb] text-[#0f172a]">
            <ScorecardTracker token={token} />
            <section className="mx-auto max-w-3xl px-6 py-10">
                <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
                    <p className="text-sm font-medium uppercase tracking-wide text-slate-500">Mini Scorecard</p>
                    <h1 className="mt-2 text-3xl font-bold">{lead.businessName}</h1>
                    <p className="mt-2 text-slate-600">
                        {lead.city} · {lead.vertical}
                    </p>

                    <div className="mt-6 flex items-center gap-5 rounded-xl bg-slate-50 p-4">
                        <div className="flex h-20 w-20 items-center justify-center rounded-full border-4 border-red-300 bg-white text-2xl font-bold text-red-600">
                            {score}
                        </div>
                        <div>
                            <p className="text-sm uppercase tracking-wide text-slate-500">Pain Score</p>
                            <p className="text-lg font-semibold">
                                {competitor
                                    ? `${lead.businessName} vs ${competitor}`
                                    : `${lead.businessName} local baseline`}
                            </p>
                            <p className="text-sm text-slate-600">Higher score means bigger revenue leak and bigger upside.</p>
                        </div>
                    </div>

                    {findings.length > 0 && (
                        <div className="mt-6">
                            <h2 className="text-lg font-semibold">Top 3 Findings</h2>
                            <ul className="mt-3 space-y-2">
                                {findings.map((finding) => (
                                    <li key={finding} className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm">
                                        {finding}
                                    </li>
                                ))}
                            </ul>
                        </div>
                    )}

                    {rows.length > 0 && (
                        <div className="mt-6">
                            <h2 className="text-lg font-semibold">Where You Are Losing</h2>
                            <div className="mt-3 space-y-3">
                                {rows.map((row) => {
                                    const percent = row.weight > 0 ? Math.round((row.score / row.weight) * 100) : 0;
                                    return (
                                        <div key={row.key} className="rounded-lg border border-slate-200 p-3">
                                            <div className="flex items-center justify-between text-sm font-medium">
                                                <span>{titleForKey(row.key)}</span>
                                                <span>{row.score}/{row.weight}</span>
                                            </div>
                                            <div className="mt-2 h-2 rounded-full bg-slate-100">
                                                <div className="h-2 rounded-full bg-red-500" style={{ width: `${Math.max(2, percent)}%` }} />
                                            </div>
                                            {row.detail && <p className="mt-2 text-xs text-slate-600">{row.detail}</p>}
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    )}

                    <div className="mt-8 flex flex-wrap gap-3">
                        <a
                            href={calendarUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            data-scorecard-cta="book-call"
                            className="rounded-lg bg-[#0f172a] px-4 py-2 text-sm font-semibold text-white"
                        >
                            Book A 15-Minute Review
                        </a>
                        <a
                            href={calendarUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            data-scorecard-cta="request-plan"
                            className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700"
                        >
                            Request Full Proposal
                        </a>
                    </div>
                </div>
            </section>
        </main>
    );
}

