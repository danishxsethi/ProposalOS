import {
    generateScoreGaugeSVG,
    generateComparisonChartSVG,
    generatePriorityMatrixSVG,
    type BusinessData,
    type CompetitorData,
} from '@/lib/pdf/charts';

/* PDF Design System — navy #1a1a2e + accent blue #4361ee */
const COLORS = {
    primary: '#1a1a2e',
    accent: '#4361ee',
    secondary: '#16213e',
    background: '#ffffff',
    sectionBg: '#f8f9fa',
    text: '#1a1a2e',
    textMuted: '#6c757d',
    scoreGreen: '#22c55e',
    scoreYellow: '#f59e0b',
    scoreOrange: '#f97316',
    scoreRed: '#ef4444',
};

/** 0-40 = red, 41-70 = yellow, 71-100 = green */
function getScoreColor(score: number): string {
    if (score >= 71) return COLORS.scoreGreen;
    if (score >= 41) return COLORS.scoreYellow;
    return COLORS.scoreRed;
}

function getSeverityColor(severity: string): string {
    switch (severity.toUpperCase()) {
        case 'CRITICAL': return COLORS.scoreRed;
        case 'HIGH': return COLORS.scoreOrange;
        case 'MEDIUM': return COLORS.scoreYellow;
        case 'LOW': return COLORS.scoreGreen;
        default: return COLORS.textMuted;
    }
}

function extractScores(findings: any[]): { performance: number; seo: number; accessibility: number; security: number } {
    let performance = 0, seo = 0, accessibility = 0, security = 0;
    let pCount = 0, sCount = 0, aCount = 0, secCount = 0;

    for (const f of findings) {
        const m = f.metrics as Record<string, number> || {};
        if (typeof m.performanceScore === 'number') { performance += m.performanceScore; pCount++; }
        if (typeof m.seoScore === 'number') { seo += m.seoScore; sCount++; }
        if (typeof m.accessibilityScore === 'number') { accessibility += m.accessibilityScore; aCount++; }
        if (f.module === 'security' && typeof m.score === 'number') { security += m.score; secCount++; }
    }

    return {
        performance: pCount ? Math.round(performance / pCount) : 0,
        seo: sCount ? Math.round(seo / sCount) : 0,
        accessibility: aCount ? Math.round(accessibility / aCount) : 0,
        security: secCount ? Math.round(security / secCount) : 0,
    };
}

function groupFindingsByCategory(findings: any[]): Record<string, any[]> {
    const groups: Record<string, any[]> = {
        Speed: [],
        SEO: [],
        Reputation: [],
        Conversion: [],
        Security: [],
        Other: [],
    };

    const categoryMap: Record<string, string> = {
        performance: 'Speed',
        visibility: 'SEO',
        trust: 'Reputation',
        conversion: 'Conversion',
        security: 'Security',
    };

    const moduleToCategory: Record<string, string> = {
        website: 'Speed',
        seo: 'SEO',
        gbp: 'Reputation',
        reputation: 'Reputation',
        competitor: 'Reputation',
        social: 'Reputation',
        conversion: 'Conversion',
        security: 'Security',
    };

    for (const f of findings) {
        const cat = categoryMap[f.category] || moduleToCategory[f.module] || 'Other';
        const key = groups[cat] ? cat : 'Other';
        if (!groups[key]) groups[key] = [];
        groups[key].push(f);
    }

    return groups;
}

interface PdfTemplateProps {
    proposal: {
        executiveSummary: string | null;
        painClusters: unknown;
        comparisonReport?: unknown;
        tierEssentials: any;
        tierGrowth: any;
        tierPremium: any;
        pricing: any;
        nextSteps: string[];
        audit: {
            businessName: string;
            businessCity: string | null;
            businessIndustry: string | null;
            overallScore: number | null;
            findings: any[];
        };
        createdAt: Date;
        webLinkToken: string;
    };
    branding: { name: string; logoUrl: string | null; contact: { website?: string } };
}

export default async function PdfTemplate({ proposal, branding }: PdfTemplateProps) {
    const formatDate = (d: Date) => new Date(d).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
    const scores = extractScores(proposal.audit.findings);
    const painkillers = proposal.audit.findings.filter((f: any) => f.type === 'PAINKILLER').sort((a: any, b: any) => b.impactScore - a.impactScore);
    const topFinding = painkillers[0];
    const groupedFindings = groupFindingsByCategory(proposal.audit.findings);
    const pricing = proposal.pricing as { essentials?: number; growth?: number; premium?: number } || {};
    const tierEssentials = proposal.tierEssentials || {};
    const tierGrowth = proposal.tierGrowth || {};
    const tierPremium = proposal.tierPremium || {};
    const proposalUrl = `${process.env.NEXT_PUBLIC_BASE_URL || 'https://proposalengine.com'}/proposal/${proposal.webLinkToken}`;

    return (
        <div className="pdf-document">
            {/* Page 1 — Cover (new agency-grade design) */}
            <div className="pdf-page pdf-cover">
                <div className="pdf-cover-content">
                    <div className="pdf-cover-logo-text">{branding.name}</div>
                    <h1 className="pdf-cover-business">{proposal.audit.businessName}</h1>
                    <p className="pdf-cover-subtitle">Website Performance & Growth Roadmap</p>
                    <p className="pdf-cover-date">{formatDate(proposal.createdAt)}</p>
                </div>
                <div className="pdf-cover-footer">
                    <p>Prepared by {branding.name}</p>
                    {branding.logoUrl && <img src={branding.logoUrl} alt="" className="pdf-cover-logo" />}
                </div>
            </div>

            {/* Page 2 — Visual Score Gauges (4 in a row) */}
            <div className="pdf-page pdf-content pdf-gauges-page">
                <h2 className="pdf-heading">Score Dashboard</h2>
                <div className="pdf-gauges-row">
                    {[
                        { key: 'performance', label: 'Performance', score: scores.performance || 0 },
                        { key: 'seo', label: 'SEO', score: scores.seo || 0 },
                        { key: 'accessibility', label: 'Accessibility', score: scores.accessibility || 0 },
                        { key: 'security', label: 'Security', score: scores.security || 0 },
                    ].map(({ key, label, score }) => (
                        <div key={key} className="pdf-gauge-svg-wrap" dangerouslySetInnerHTML={{ __html: generateScoreGaugeSVG(score, label, 70) }} />
                    ))}
                </div>
            </div>

            {/* Page 2 — Executive Summary */}
            <div className="pdf-page pdf-content">
                <h2 className="pdf-heading">Executive Summary</h2>
                <div className="pdf-exec-layout">
                    <div className="pdf-exec-text">
                        {(proposal.executiveSummary || 'No executive summary available.').split('\n\n').map((p, i) => (
                            <p key={i} className="pdf-body">{p}</p>
                        ))}
                    </div>
                    <div className="pdf-exec-scores">
                        <div className="pdf-score-callout" style={{ borderColor: getScoreColor(scores.performance || 0) }}>
                            <span className="pdf-score-num" style={{ color: getScoreColor(scores.performance || 0) }}>{scores.performance || '—'}</span>
                            <span className="pdf-score-name">Performance</span>
                        </div>
                        <div className="pdf-score-callout" style={{ borderColor: getScoreColor(scores.seo || 0) }}>
                            <span className="pdf-score-num" style={{ color: getScoreColor(scores.seo || 0) }}>{scores.seo || '—'}</span>
                            <span className="pdf-score-name">SEO</span>
                        </div>
                        <div className="pdf-score-callout" style={{ borderColor: getScoreColor(scores.accessibility || 0) }}>
                            <span className="pdf-score-num" style={{ color: getScoreColor(scores.accessibility || 0) }}>{scores.accessibility || '—'}</span>
                            <span className="pdf-score-name">Accessibility</span>
                        </div>
                        <div className="pdf-score-callout" style={{ borderColor: getScoreColor(scores.security || 0) }}>
                            <span className="pdf-score-num" style={{ color: getScoreColor(scores.security || 0) }}>{scores.security || '—'}</span>
                            <span className="pdf-score-name">Security</span>
                        </div>
                    </div>
                </div>
                {topFinding && (
                    <div className="pdf-key-finding">
                        <strong>Key Finding:</strong> {topFinding.title} — {topFinding.description || 'See details in findings section.'}
                    </div>
                )}
            </div>

            {/* Competitor Comparison */}
            {(() => {
                const cr = proposal.comparisonReport as {
                    prospect?: { name?: string; performanceScore?: number; mobileScore?: number; loadTimeSeconds?: number; rating?: number; reviewCount?: number };
                    competitors?: Array<{ name?: string; performanceScore?: number; mobileScore?: number; loadTimeSeconds?: number; rating?: number; reviewCount?: number }>;
                    prospectRank?: number;
                    winningCategories?: string[];
                    losingCategories?: string[];
                    summaryStatement?: string;
                    positiveStatement?: string;
                    urgencyStatement?: string;
                    quickWins?: Array<{ action?: string; effortEstimate?: string; expectedImpact?: string }>;
                    comparisonTableRows?: Array<{ metric: string; prospectValue: string | number; prospectStatus: string; competitorValues: Array<{ name: string; value: string | number; status: string }> }>;
                    summaryRow?: string;
                    whereAhead?: string[];
                    whereBehind?: string[];
                } | null | undefined;
                const matrixFinding = proposal.audit.findings.find((f: any) => f.evidence?.some((e: any) => e.matrix || e.raw?.matrix));
                const matrix = matrixFinding?.evidence?.find((e: any) => e.matrix || e.raw?.matrix)?.matrix || matrixFinding?.evidence?.find((e: any) => e.raw?.matrix)?.raw?.matrix;
                const prospectData = cr?.prospect || matrix?.business;
                const competitorsData = cr?.competitors || matrix?.competitors || [];
                if (!prospectData || !competitorsData?.length) return null;
                const toBiz = (d: any) => {
                    const perf = d.performanceScore ?? d.websiteSpeed;
                    const seo = d.seoScore;
                    const a11y = d.accessibilityScore;
                    const overall = [perf, seo, a11y].filter((x) => typeof x === 'number').length
                        ? Math.round([perf, seo, a11y].filter((x) => typeof x === 'number').reduce((a: number, b: number) => a + b, 0) / [perf, seo, a11y].filter((x) => typeof x === 'number').length)
                        : perf;
                    return {
                        name: d.name || proposal.audit.businessName,
                        pageSpeed: perf,
                        overallScore: overall,
                        mobileScore: d.mobileScore ?? perf,
                        seoScore: seo,
                        accessibilityScore: a11y,
                        reviewCount: d.reviewCount,
                        rating: d.rating,
                    };
                };
                const prospect: BusinessData = toBiz(prospectData);
                const competitors: CompetitorData[] = competitorsData.slice(0, 3).map((c: any) => toBiz(c));
                const prospectName = prospectData?.name || proposal.audit.businessName;
                const compNames = competitorsData.slice(0, 3).map((c: any) => c?.name || 'Competitor');

                const cellBg = (status: string) => status === 'win' ? '#dcfce7' : status === 'lose' ? '#fee2e2' : '#fef9c3';
                const hasTableRows = cr?.comparisonTableRows && cr.comparisonTableRows.length > 0;

                return (
                    <div className="pdf-page pdf-content">
                        <h2 className="pdf-heading">Competitive Intelligence</h2>
                        {cr && (
                            <div className="pdf-comparison-badge">
                                <p className="pdf-body"><strong>You rank #{cr.prospectRank} out of {competitors.length + 1} {proposal.audit.businessIndustry || 'business'}s in your area.</strong></p>
                                <p className="pdf-body">{cr.summaryStatement}</p>
                                {cr.summaryRow && <p className="pdf-body"><strong>{cr.summaryRow}</strong></p>}
                            </div>
                        )}

                        {hasTableRows ? (
                            <div className="pdf-comparison-table-wrap" style={{ overflowX: 'auto', marginBottom: 16 }}>
                                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
                                    <thead>
                                        <tr style={{ borderBottom: '2px solid #1a1a2e' }}>
                                            <th style={{ padding: '8px', textAlign: 'left', fontWeight: 600 }}>Metric</th>
                                            <th style={{ padding: '8px', textAlign: 'center', fontWeight: 700, backgroundColor: '#e0e7ff' }}>{prospectName} (You)</th>
                                            {compNames.map((n: string, i: number) => <th key={i} style={{ padding: '8px', textAlign: 'center', fontWeight: 600 }}>{n}</th>)}
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {cr!.comparisonTableRows!.map((row, i) => (
                                            <tr key={i} style={{ borderBottom: '1px solid #e5e7eb' }}>
                                                <td style={{ padding: '8px', color: '#6b7280' }}>{row.metric}</td>
                                                <td style={{ padding: '8px', textAlign: 'center', fontWeight: 700, backgroundColor: cellBg(row.prospectStatus) }}>{row.prospectValue}</td>
                                                {row.competitorValues.map((cv, j) => <td key={j} style={{ padding: '8px', textAlign: 'center', backgroundColor: cellBg(cv.status) }}>{cv.value}</td>)}
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        ) : (
                            <div className="pdf-comparison-chart" dangerouslySetInnerHTML={{ __html: generateComparisonChartSVG(prospect, competitors) }} />
                        )}

                        {cr && (cr.whereAhead?.length ?? 0) > 0 && (
                            <div className="pdf-winning-section" style={{ marginTop: 16, padding: 12, backgroundColor: '#dcfce7', borderRadius: 8 }}>
                                <h3 className="pdf-subheading" style={{ color: '#166534', marginBottom: 8 }}>Where You&apos;re Ahead</h3>
                                <ul style={{ margin: 0, paddingLeft: 20 }}>{(cr.whereAhead ?? []).map((s, i) => <li key={i} style={{ marginBottom: 4 }}>{s}</li>)}</ul>
                            </div>
                        )}
                        {cr && (cr.whereBehind?.length ?? 0) > 0 && (
                            <div className="pdf-ahead-section" style={{ marginTop: 16, padding: 12, backgroundColor: '#fee2e2', borderRadius: 8 }}>
                                <h3 className="pdf-subheading" style={{ color: '#991b1b', marginBottom: 8 }}>Where They&apos;re Beating You</h3>
                                <ul style={{ margin: 0, paddingLeft: 20 }}>{(cr.whereBehind ?? []).map((s, i) => <li key={i} style={{ marginBottom: 4 }}>{s}</li>)}</ul>
                            </div>
                        )}

                        {cr && (cr.whereAhead?.length ?? 0) === 0 && (cr.winningCategories?.length ?? 0) > 0 && (
                            <div className="pdf-winning-section">
                                <h3 className="pdf-subheading">You&apos;re Winning</h3>
                                <p className="pdf-body">{cr.positiveStatement}</p>
                                <ul>{(cr.winningCategories ?? []).map((cat, i) => <li key={i}>{cat}</li>)}</ul>
                            </div>
                        )}
                        {cr && (cr.whereBehind?.length ?? 0) === 0 && (cr.losingCategories?.length ?? 0) > 0 && (
                            <div className="pdf-ahead-section">
                                <h3 className="pdf-subheading">They&apos;re Ahead</h3>
                                <p className="pdf-body">{cr.urgencyStatement}</p>
                                <ul>{(cr.losingCategories ?? []).map((cat, i) => <li key={i}>{cat}</li>)}</ul>
                            </div>
                        )}
                        {cr && (cr.quickWins?.length ?? 0) > 0 && (
                            <div className="pdf-quickwins-section">
                                <h3 className="pdf-subheading">Quick Wins to Overtake</h3>
                                <ol>{(cr.quickWins ?? []).map((qw, i) => <li key={i}><strong>{qw.action}</strong> — {qw.effortEstimate}. {qw.expectedImpact}</li>)}</ol>
                            </div>
                        )}
                    </div>
                );
            })()}

            {/* Priority Action Matrix */}
            <div className="pdf-page pdf-content">
                <h2 className="pdf-heading">Priority Action Matrix</h2>
                <p className="pdf-body">Focus on Quick Wins (high impact, low effort) first.</p>
                <div className="pdf-priority-matrix" dangerouslySetInnerHTML={{ __html: generatePriorityMatrixSVG(proposal.audit.findings.map((f: any) => ({ id: f.id, title: f.title, impactScore: f.impactScore, effortEstimate: f.effortEstimate }))) }} />
            </div>

            {/* Pages 4+ — Findings */}
            {Object.entries(groupedFindings).filter(([, items]) => items.length > 0).map(([category, items]) => (
                <div key={category} className="pdf-page pdf-content">
                    <h2 className="pdf-heading">Findings: {category}</h2>
                    <div className="pdf-findings">
                        {items.map((f: any) => {
                            const severity = f.impactScore >= 8 ? 'CRITICAL' : f.impactScore >= 6 ? 'HIGH' : f.impactScore >= 4 ? 'MEDIUM' : 'LOW';
                            const metrics = f.metrics || {};
                            const fix = Array.isArray(f.recommendedFix) ? f.recommendedFix[0] : null;
                            return (
                                <div key={f.id} className="pdf-finding-card">
                                    <span className="pdf-finding-badge" style={{ backgroundColor: getSeverityColor(severity) }}>{severity}</span>
                                    <h3 className="pdf-finding-title">{f.title}</h3>
                                    {f.description && <p className="pdf-finding-desc">{f.description}</p>}
                                    {Object.keys(metrics).length > 0 && (
                                        <p className="pdf-finding-state">
                                            <strong>Current:</strong> {JSON.stringify(metrics).replace(/[{}"]/g, '').slice(0, 80)}…
                                        </p>
                                    )}
                                    {fix && <p className="pdf-finding-action"><strong>Recommended:</strong> {fix}</p>}
                                    <p className="pdf-finding-source">Source: {f.evidence?.[0]?.source || f.module}</p>
                                </div>
                            );
                        })}
                    </div>
                </div>
            ))}

            {/* Pricing Page */}
            <div className="pdf-page pdf-content">
                <h2 className="pdf-heading">Investment Options</h2>
                <div className="pdf-pricing-grid">
                    <div className="pdf-pricing-col">
                        <h3>{tierEssentials.name || 'Starter'}</h3>
                        <p className="pdf-price">${(pricing.essentials || 497).toLocaleString()}</p>
                        <p className="pdf-delivery">{tierEssentials.deliveryTime || '5 business days'}</p>
                        <ul>{(tierEssentials.features || []).map((x: string, i: number) => <li key={i}>✓ {x}</li>)}</ul>
                        <div className="pdf-cta">Let&apos;s Get Started</div>
                    </div>
                    <div className="pdf-pricing-col pdf-pricing-recommended">
                        <span className="pdf-recommended-badge">{(tierGrowth as { badge?: string })?.badge || 'BEST VALUE'}</span>
                        <h3>{tierGrowth.name || 'Growth'}</h3>
                        <p className="pdf-price">${(pricing.growth || 1497).toLocaleString()}</p>
                        <p className="pdf-delivery">{tierGrowth.deliveryTime || '10 business days'}</p>
                        <ul>{(tierGrowth.features || []).map((x: string, i: number) => <li key={i}>✓ {x}</li>)}</ul>
                        <div className="pdf-cta pdf-cta-accent">Let&apos;s Get Started</div>
                    </div>
                    <div className="pdf-pricing-col">
                        <h3>{tierPremium.name || 'Premium'}</h3>
                        <p className="pdf-price">${(pricing.premium || 2997).toLocaleString()}</p>
                        <p className="pdf-delivery">{tierPremium.deliveryTime || '15 business days'}</p>
                        <ul>{(tierPremium.features || []).map((x: string, i: number) => <li key={i}>✓ {x}</li>)}</ul>
                        <div className="pdf-cta">Let&apos;s Get Started</div>
                    </div>
                </div>
            </div>

            {/* Last Page — Next Steps */}
            <div className="pdf-page pdf-content pdf-next-steps">
                <h2 className="pdf-heading">Next Steps</h2>
                <div className="pdf-steps">
                    <div className="pdf-step"><span className="pdf-step-num">1</span> Review this report</div>
                    <div className="pdf-step"><span className="pdf-step-num">2</span> Pick your plan</div>
                    <div className="pdf-step"><span className="pdf-step-num">3</span> We handle the rest</div>
                </div>
                <div className="pdf-contact">
                    <p><strong>Contact</strong></p>
                    {branding.contact?.website && <p>{branding.contact.website}</p>}
                </div>
                <div className="pdf-qr-placeholder">
                    <div className="pdf-qr-box">QR Code</div>
                    <p>Scan to view online proposal</p>
                    <p className="pdf-qr-url">{proposalUrl}</p>
                </div>
                <p className="pdf-closing">Thank you for the opportunity to serve your business. We look forward to helping you achieve your digital goals.</p>
            </div>
        </div>
    );
}
