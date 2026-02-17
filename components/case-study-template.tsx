'use client';

/**
 * Case study template component — renders to PDF via Puppeteer.
 * Auto-populates Challenge from audit data; Solution, Results, Testimonial are editable placeholders.
 */

interface FindingData {
    id: string;
    title: string;
    description: string | null;
    impactScore: number;
    excluded?: boolean;
}

interface AuditData {
    businessName: string;
    businessCity: string | null;
    businessIndustry: string | null;
    findings: FindingData[];
}

interface ProposalData {
    executiveSummary: string | null;
    painClusters: unknown;
    webLinkToken?: string;
}

interface CaseStudyTemplateProps {
    audit: AuditData;
    proposal?: ProposalData | null;
    branding: { name: string; logoUrl: string | null; contact: { email?: string; website?: string } };
    /** Editable placeholders — override defaults */
    solution?: string;
    results?: string;
    testimonial?: string;
}

const PLACEHOLDER_SOLUTION = `We implemented a comprehensive digital overhaul including:
• Website speed optimisation and mobile responsiveness
• Google Business Profile optimisation with updated hours, photos, and services
• Local SEO improvements targeting [city] [industry] searches
• Conversion-focused landing pages and clear CTAs`;

const PLACEHOLDER_RESULTS = `Before → After:
• Page load time: [X.X]s → [X.X]s
• Google visibility score: [XX] → [XX]
• Mobile performance: [XX] → [XX]
• [Other key metric]: [before] → [after]`;

const PLACEHOLDER_TESTIMONIAL = `"[Client quote about the results and experience. 1-2 sentences.]"
— [Client Name], [Title], [Business Name]`;

export default function CaseStudyTemplate({
    audit,
    proposal,
    branding,
    solution = PLACEHOLDER_SOLUTION,
    results = PLACEHOLDER_RESULTS,
    testimonial = PLACEHOLDER_TESTIMONIAL,
}: CaseStudyTemplateProps) {
    const topFindings = audit.findings
        .filter((f) => !f.excluded)
        .sort((a, b) => b.impactScore - a.impactScore)
        .slice(0, 5);

    const execSummary = proposal?.executiveSummary ?? '';
    const painClusters = (proposal?.painClusters as Array<{ rootCause?: string; narrative?: string }>) ?? [];
    const challengeText = execSummary || painClusters.map((c) => c.narrative || c.rootCause).filter(Boolean).join(' ') || 'See audit findings below.';

    const baseUrl = typeof window !== 'undefined' ? window.location.origin : process.env.NEXT_PUBLIC_BASE_URL || 'https://proposalengine.com';
    const auditUrl = proposal?.webLinkToken ? `${baseUrl}/proposal/${proposal.webLinkToken}` : `${baseUrl}/audit`;

    return (
        <div className="pdf-root case-study-root" data-pdf-ready>
            <div className="case-study-document">
                {/* Cover */}
                <div className="case-study-cover pdf-page">
                    <div className="case-study-cover-content">
                        <div className="case-study-brand">{branding.name}</div>
                        <h1 className="case-study-title">Case Study</h1>
                        <h2 className="case-study-client">{audit.businessName}</h2>
                        <p className="case-study-meta">
                            {audit.businessIndustry || 'Local Business'} • {audit.businessCity || 'Saskatoon'}, SK
                        </p>
                    </div>
                    {branding.logoUrl && (
                        <div className="case-study-cover-footer">
                            <img src={branding.logoUrl} alt="" className="case-study-logo" />
                        </div>
                    )}
                </div>

                {/* Challenge */}
                <div className="case-study-page pdf-content">
                    <h2 className="pdf-heading">Challenge</h2>
                    <p className="pdf-body">{challengeText}</p>
                    {topFindings.length > 0 && (
                        <div className="case-study-findings">
                            <h3 className="pdf-subheading">Key findings from the audit</h3>
                            <ul className="case-study-list">
                                {topFindings.map((f) => (
                                    <li key={f.id}>
                                        <strong>{f.title}</strong> — {f.description || 'See full audit for details.'}
                                    </li>
                                ))}
                            </ul>
                        </div>
                    )}
                </div>

                {/* Solution */}
                <div className="case-study-page pdf-content">
                    <h2 className="pdf-heading">Solution</h2>
                    <div className="case-study-editable">
                        {solution.split('\n').map((line, i) => (
                            <p key={i} className="pdf-body">
                                {line.startsWith('•') ? line : line}
                            </p>
                        ))}
                    </div>
                </div>

                {/* Results */}
                <div className="case-study-page pdf-content">
                    <h2 className="pdf-heading">Results</h2>
                    <div className="case-study-editable">
                        {results.split('\n').map((line, i) => (
                            <p key={i} className="pdf-body">
                                {line}
                            </p>
                        ))}
                    </div>
                </div>

                {/* Testimonial */}
                <div className="case-study-page pdf-content">
                    <h2 className="pdf-heading">Testimonial</h2>
                    <blockquote className="case-study-testimonial">{testimonial}</blockquote>
                </div>

                {/* CTA */}
                <div className="case-study-page pdf-content case-study-cta-page">
                    <h2 className="pdf-heading">Want similar results?</h2>
                    <p className="pdf-body">
                        Get your free website audit. We&apos;ll analyse your digital presence and show you exactly where you&apos;re losing customers — and how to fix it.
                    </p>
                    <a href={auditUrl} className="case-study-cta-btn">
                        Get your free audit
                    </a>
                    {branding.contact?.email && (
                        <p className="case-study-contact">
                            Questions? {branding.contact.email}
                        </p>
                    )}
                </div>
            </div>
        </div>
    );
}
