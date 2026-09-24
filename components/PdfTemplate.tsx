import { generateScoreGaugeSVG } from '@/lib/pdf/charts';
import { buildProposalConversionModel } from '@/lib/proposal/conversionViewModel';

interface PdfTemplateProps {
  proposal: any;
  branding: {
    name: string;
    logoUrl: string | null;
    contact: { website?: string; email?: string };
    colors?: { primary?: string; accent?: string };
  };
}

export default async function PdfTemplate({ proposal, branding }: PdfTemplateProps) {
  const model = buildProposalConversionModel(proposal, {
    calendarUrl: branding.contact?.website || process.env.OUTREACH_CALENDAR_URL,
  });

  const brandName = branding?.name || model.brandName;
  const bookingUrl = model.calendarBookingUrl;

  return (
    <div className="pdf-document" style={{ fontFamily: 'Inter, system-ui, sans-serif' }}>
      {/* ─── Page 1: Executive Cover Page ────────────────────────── */}
      <div
        className="pdf-page pdf-cover"
        style={{
          pageBreakAfter: 'always',
          minHeight: '260mm',
          backgroundColor: '#0f172a',
          color: '#ffffff',
          padding: '48px 40px',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          boxSizing: 'border-box',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ fontSize: '18px', fontWeight: 700, letterSpacing: '0.05em', color: '#38bdf8' }}>
            {brandName.toUpperCase()}
          </div>
          <div
            style={{
              fontSize: '11px',
              fontWeight: 600,
              letterSpacing: '0.08em',
              textTransform: 'uppercase',
              padding: '6px 14px',
              borderRadius: '9999px',
              backgroundColor: 'rgba(56, 189, 248, 0.15)',
              color: '#38bdf8',
              border: '1px solid rgba(56, 189, 248, 0.3)',
            }}
          >
            CONFIDENTIAL BRIEFING
          </div>
        </div>

        <div style={{ margin: 'auto 0', padding: '60px 0' }}>
          <div
            style={{
              display: 'inline-block',
              fontSize: '12px',
              fontWeight: 600,
              color: '#94a3b8',
              textTransform: 'uppercase',
              letterSpacing: '0.1em',
              marginBottom: '16px',
            }}
          >
            Forensic Digital Performance & Revenue Audit
          </div>
          <h1
            style={{
              fontSize: '38px',
              fontWeight: 800,
              lineHeight: 1.15,
              color: '#ffffff',
              margin: '0 0 20px 0',
            }}
          >
            {model.businessName}
          </h1>
          <p
            style={{
              fontSize: '18px',
              lineHeight: 1.5,
              color: '#e2e8f0',
              maxWidth: '680px',
              margin: '0 0 24px 0',
            }}
          >
            {model.hookHeader.headline}
          </p>
          <div
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '12px',
              padding: '10px 18px',
              backgroundColor: 'rgba(239, 68, 68, 0.15)',
              border: '1px solid rgba(239, 68, 68, 0.3)',
              borderRadius: '8px',
              color: '#fca5a5',
              fontSize: '13px',
              fontWeight: 600,
            }}
          >
            <span>Primary Revenue Leak:</span>
            <span style={{ color: '#ffffff' }}>{model.hookHeader.primaryProblemTitle}</span>
            <span>({model.hookHeader.primaryProblemLossFormatted}/mo)</span>
          </div>
        </div>

        <div
          style={{
            borderTop: '1px solid rgba(255, 255, 255, 0.15)',
            paddingTop: '20px',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'flex-end',
            fontSize: '11px',
            color: '#94a3b8',
          }}
        >
          <div>
            <div>Prepared for: Executive Leadership, {model.businessName}</div>
            <div>Location: {model.businessCity} • Industry: {model.businessIndustry}</div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div>Audit Completed: {model.auditDateFormatted}</div>
            <div style={{ color: '#38bdf8', fontWeight: 600 }}>
              Pricing & Implementation Slot Locked Until: {model.expiryDateFormatted}
            </div>
          </div>
        </div>
      </div>

      {/* ─── Page 2: Hook Header & Executive Summary ──────────────── */}
      <div
        className="pdf-page pdf-content"
        style={{
          pageBreakAfter: 'always',
          padding: '28px 36px',
          boxSizing: 'border-box',
        }}
      >
        <div style={{ marginBottom: '24px' }}>
          <div style={{ fontSize: '11px', fontWeight: 700, color: '#4361ee', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            Section 01 • Executive Overview
          </div>
          <h2 style={{ fontSize: '24px', fontWeight: 800, color: '#0f172a', margin: '4px 0 8px 0' }}>
            Revenue Impact & Diagnostic Summary
          </h2>
          <p style={{ fontSize: '13px', color: '#475569', lineHeight: 1.6, margin: 0 }}>
            {model.executiveSummary.overview}
          </p>
        </div>

        {/* Quantified Bleed KPI Cards */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '14px', marginBottom: '24px' }}>
          <div style={{ padding: '16px', backgroundColor: '#fef2f2', border: '1px solid #fecaca', borderRadius: '8px' }}>
            <div style={{ fontSize: '11px', fontWeight: 600, color: '#991b1b', textTransform: 'uppercase' }}>
              Est. Monthly Bleed
            </div>
            <div style={{ fontSize: '24px', fontWeight: 800, color: '#dc2626', margin: '4px 0' }}>
              {model.hookHeader.totalMonthlyBleedFormatted}
            </div>
            <div style={{ fontSize: '11px', color: '#7f1d1d' }}>Recoverable through technical fixes</div>
          </div>
          <div style={{ padding: '16px', backgroundColor: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '8px' }}>
            <div style={{ fontSize: '11px', fontWeight: 600, color: '#475569', textTransform: 'uppercase' }}>
              Annual Opportunity
            </div>
            <div style={{ fontSize: '24px', fontWeight: 800, color: '#0f172a', margin: '4px 0' }}>
              {model.hookHeader.totalAnnualBleedFormatted}
            </div>
            <div style={{ fontSize: '11px', color: '#64748b' }}>Cumulative 12-month run-rate</div>
          </div>
          <div style={{ padding: '16px', backgroundColor: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: '8px' }}>
            <div style={{ fontSize: '11px', fontWeight: 600, color: '#1e40af', textTransform: 'uppercase' }}>
              Implementation Window
            </div>
            <div style={{ fontSize: '24px', fontWeight: 800, color: '#2563eb', margin: '4px 0' }}>
              5–14 Days
            </div>
            <div style={{ fontSize: '11px', color: '#1e3a8a' }}>Turnaround to live verification</div>
          </div>
        </div>

        {/* 3 Executive Findings Max (Never a wall of text) */}
        <div style={{ marginBottom: '24px' }}>
          <h3 style={{ fontSize: '15px', fontWeight: 700, color: '#0f172a', marginBottom: '12px' }}>
            Top 3 High-Friction Drivers (Ranked by Revenue Bleed)
          </h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {model.executiveSummary.topThreePoints.map((item, idx) => (
              <div
                key={idx}
                style={{
                  padding: '12px 16px',
                  backgroundColor: '#ffffff',
                  border: '1px solid #e2e8f0',
                  borderLeft: '4px solid #ef4444',
                  borderRadius: '6px',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                }}
              >
                <div style={{ flex: 1, paddingRight: '16px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '2px' }}>
                    <span style={{ fontSize: '11px', fontWeight: 700, color: '#ef4444' }}>
                      #{idx + 1}
                    </span>
                    <span style={{ fontSize: '13px', fontWeight: 700, color: '#0f172a' }}>
                      {item.title}
                    </span>
                  </div>
                  <div style={{ fontSize: '11px', color: '#64748b', lineHeight: 1.4 }}>
                    {item.explanation}
                  </div>
                </div>
                <div style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                  <div style={{ fontSize: '14px', fontWeight: 800, color: '#ef4444' }}>
                    -{item.monthlyLossFormatted}
                  </div>
                  <div style={{ fontSize: '10px', color: '#94a3b8' }}>per month</div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Quick Wins Box (Do-This-Week Items, Builds Instant Trust) */}
        <div
          style={{
            padding: '16px',
            backgroundColor: '#f0fdf4',
            border: '1px solid #bbf7d0',
            borderRadius: '8px',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
            <span style={{ fontSize: '14px' }}>⚡</span>
            <span style={{ fontSize: '13px', fontWeight: 700, color: '#166534' }}>
              Immediate Quick Wins (Deployable This Week at Low Effort)
            </span>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '10px' }}>
            {model.quickWins.slice(0, 2).map((qw, qIdx) => (
              <div key={qIdx} style={{ fontSize: '11px', color: '#14532d' }}>
                <div style={{ fontWeight: 700 }}>• {qw.title}</div>
                <div style={{ color: '#15803d', marginTop: '2px' }}>{qw.recommendedFix}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ─── Page 3: What We Found (Ranked by Revenue Impact) ─────── */}
      <div
        className="pdf-page pdf-content"
        style={{
          pageBreakAfter: 'always',
          padding: '28px 36px',
          boxSizing: 'border-box',
        }}
      >
        <div style={{ marginBottom: '20px' }}>
          <div style={{ fontSize: '11px', fontWeight: 700, color: '#4361ee', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            Section 02 • Detailed Diagnostics
          </div>
          <h2 style={{ fontSize: '24px', fontWeight: 800, color: '#0f172a', margin: '4px 0 6px 0' }}>
            All Identified Vulnerabilities
          </h2>
          <p style={{ fontSize: '12px', color: '#64748b', margin: 0 }}>
            Every finding prioritized by measurable impact on search indexing, local map pack position, and patient/customer conversion.
          </p>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {model.rankedFindings.slice(0, 5).map((f, idx) => (
            <div
              key={f.id || idx}
              style={{
                padding: '14px 16px',
                backgroundColor: '#ffffff',
                border: '1px solid #e2e8f0',
                borderRadius: '8px',
                pageBreakInside: 'avoid',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '6px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span
                    style={{
                      fontSize: '10px',
                      fontWeight: 700,
                      textTransform: 'uppercase',
                      padding: '2px 8px',
                      borderRadius: '4px',
                      backgroundColor:
                        f.severity === 'Critical'
                          ? '#fef2f2'
                          : f.severity === 'High'
                          ? '#fff7ed'
                          : '#fefce8',
                      color:
                        f.severity === 'Critical'
                          ? '#dc2626'
                          : f.severity === 'High'
                          ? '#ea580c'
                          : '#ca8a04',
                      border:
                        f.severity === 'Critical'
                          ? '1px solid #fecaca'
                          : f.severity === 'High'
                          ? '1px solid #fed7aa'
                          : '1px solid #fef08a',
                    }}
                  >
                    {f.severity}
                  </span>
                  <span style={{ fontSize: '13px', fontWeight: 700, color: '#0f172a' }}>
                    {f.title}
                  </span>
                </div>
                <div style={{ fontSize: '13px', fontWeight: 800, color: '#dc2626', whiteSpace: 'nowrap' }}>
                  -{f.monthlyDollarFormatted}/mo
                </div>
              </div>

              <div style={{ fontSize: '11px', color: '#475569', lineHeight: 1.5, marginBottom: '6px' }}>
                {f.description}
              </div>

              {f.evidenceSnippets.length > 0 && (
                <div
                  style={{
                    fontSize: '10px',
                    fontFamily: 'monospace',
                    backgroundColor: '#f8fafc',
                    border: '1px solid #e2e8f0',
                    borderRadius: '4px',
                    padding: '6px 10px',
                    color: '#334155',
                    marginBottom: '6px',
                  }}
                >
                  <span style={{ fontWeight: 700, color: '#64748b' }}>EVIDENCE: </span>
                  {f.evidenceSnippets[0]}
                </div>
              )}

              <div style={{ fontSize: '11px', color: '#166534', backgroundColor: '#f0fdf4', padding: '6px 10px', borderRadius: '4px' }}>
                <span style={{ fontWeight: 700 }}>FIX: </span>
                {f.recommendedFix}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* ─── Page 4: Phased Roadmap & Implementation Plan ─────────── */}
      <div
        className="pdf-page pdf-content"
        style={{
          pageBreakAfter: 'always',
          padding: '28px 36px',
          boxSizing: 'border-box',
        }}
      >
        <div style={{ marginBottom: '24px' }}>
          <div style={{ fontSize: '11px', fontWeight: 700, color: '#4361ee', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            Section 03 • Action Plan
          </div>
          <h2 style={{ fontSize: '24px', fontWeight: 800, color: '#0f172a', margin: '4px 0 6px 0' }}>
            Implementation Roadmap & Milestones
          </h2>
          <p style={{ fontSize: '12px', color: '#64748b', margin: 0 }}>
            Structured engineering sprints designed to eliminate risk, deliver rapid validation, and permanently plug revenue leaks.
          </p>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {model.roadmap.map((phase) => (
            <div
              key={phase.phase}
              style={{
                padding: '18px 20px',
                backgroundColor: '#ffffff',
                border: '1px solid #e2e8f0',
                borderRadius: '8px',
                pageBreakInside: 'avoid',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <div
                    style={{
                      width: '24px',
                      height: '24px',
                      borderRadius: '50%',
                      backgroundColor: '#4361ee',
                      color: '#ffffff',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: '12px',
                      fontWeight: 800,
                    }}
                  >
                    {phase.phase}
                  </div>
                  <span style={{ fontSize: '14px', fontWeight: 800, color: '#0f172a' }}>
                    {phase.name}
                  </span>
                </div>
                <span
                  style={{
                    fontSize: '11px',
                    fontWeight: 700,
                    color: '#4361ee',
                    backgroundColor: '#eef2ff',
                    padding: '3px 10px',
                    borderRadius: '9999px',
                  }}
                >
                  {phase.timeline}
                </span>
              </div>

              <ul style={{ margin: '8px 0 10px 0', paddingLeft: '20px', fontSize: '11px', color: '#334155' }}>
                {phase.deliverables.map((item, dIdx) => (
                  <li key={dIdx} style={{ marginBottom: '4px' }}>
                    {item}
                  </li>
                ))}
              </ul>

              <div
                style={{
                  fontSize: '11px',
                  color: '#475569',
                  backgroundColor: '#f8fafc',
                  padding: '8px 12px',
                  borderRadius: '6px',
                  borderLeft: '3px solid #38bdf8',
                }}
              >
                <span style={{ fontWeight: 700, color: '#0f172a' }}>Expected Outcome: </span>
                {phase.impactSummary}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* ─── Page 5: Pricing, Guarantee, & Single Global CTA ──────── */}
      <div
        className="pdf-page pdf-content"
        style={{
          padding: '28px 36px',
          boxSizing: 'border-box',
        }}
      >
        <div style={{ marginBottom: '20px' }}>
          <div style={{ fontSize: '11px', fontWeight: 700, color: '#4361ee', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            Section 04 • Commercial Terms
          </div>
          <h2 style={{ fontSize: '24px', fontWeight: 800, color: '#0f172a', margin: '4px 0 6px 0' }}>
            Implementation Packages & Guarantee
          </h2>
          <div style={{ fontSize: '11px', fontWeight: 600, color: '#dc2626' }}>
            ⏰ Pricing and execution bandwidth reserved through: {model.expiryDateFormatted}
          </div>
        </div>

        {/* 3 Tiers with Decoy Anchoring */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '12px', marginBottom: '20px' }}>
          {model.pricingTiers.map((tier) => (
            <div
              key={tier.id}
              style={{
                padding: '16px',
                borderRadius: '8px',
                backgroundColor: tier.recommended ? '#f8faff' : '#ffffff',
                border: tier.recommended ? '2px solid #4361ee' : '1px solid #e2e8f0',
                position: 'relative',
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'space-between',
              }}
            >
              {tier.recommended && (
                <div
                  style={{
                    position: 'absolute',
                    top: '-10px',
                    left: '50%',
                    transform: 'translateX(-50%)',
                    backgroundColor: '#4361ee',
                    color: '#ffffff',
                    fontSize: '9px',
                    fontWeight: 800,
                    textTransform: 'uppercase',
                    padding: '2px 10px',
                    borderRadius: '9999px',
                    letterSpacing: '0.05em',
                  }}
                >
                  RECOMMENDED
                </div>
              )}
              <div>
                <div style={{ fontSize: '14px', fontWeight: 800, color: '#0f172a' }}>{tier.name}</div>
                <div style={{ fontSize: '10px', color: '#64748b', marginBottom: '8px' }}>
                  Delivery: {tier.deliveryTimeline}
                </div>
                <div style={{ fontSize: '22px', fontWeight: 800, color: tier.recommended ? '#4361ee' : '#0f172a' }}>
                  {tier.priceFormatted}
                </div>
                <div style={{ fontSize: '10px', color: '#16a34a', fontWeight: 600, marginBottom: '10px' }}>
                  Est. Value: {tier.monthlyRoiFormatted}
                </div>
                <div style={{ borderTop: '1px solid #e2e8f0', paddingTop: '8px', fontSize: '10px', color: '#334155' }}>
                  {tier.features.slice(0, 4).map((feat, fIdx) => (
                    <div key={fIdx} style={{ marginBottom: '4px', display: 'flex', gap: '4px' }}>
                      <span style={{ color: '#4361ee', fontWeight: 800 }}>✓</span>
                      <span>{feat}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Risk Reversal Guarantee */}
        <div
          style={{
            padding: '16px 20px',
            backgroundColor: '#faf5ff',
            border: '1px solid #e9d5ff',
            borderRadius: '8px',
            marginBottom: '18px',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
            <span style={{ fontSize: '14px' }}>🛡️</span>
            <span style={{ fontSize: '12px', fontWeight: 800, color: '#7e22ce' }}>
              {model.guarantee.title} ({model.guarantee.badge})
            </span>
          </div>
          <div style={{ fontSize: '11px', color: '#581c87', lineHeight: 1.5 }}>
            {model.guarantee.summary}
          </div>
        </div>

        {/* Why This Works — Cited Industry Benchmark Evidence */}
        <div
          style={{
            padding: '14px 18px',
            backgroundColor: '#f8fafc',
            border: '1px solid #e2e8f0',
            borderRadius: '8px',
            marginBottom: '20px',
          }}
        >
          <div style={{ fontSize: '10px', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', marginBottom: '2px' }}>
            WHY THIS WORKS • CITED INDUSTRY EVIDENCE ({model.whyThisWorks.citation})
          </div>
          <div style={{ fontSize: '12px', fontWeight: 700, color: '#0f172a', marginBottom: '4px' }}>
            {model.whyThisWorks.headline}
          </div>
          <p style={{ fontSize: '11px', color: '#475569', margin: '0 0 8px 0', lineHeight: 1.4 }}>
            {model.whyThisWorks.context}
          </p>
          <div style={{ display: 'flex', gap: '16px', fontSize: '10px', color: '#334155' }}>
            {model.whyThisWorks.metrics.map((m, mIdx) => (
              <div key={mIdx}>
                <span style={{ fontWeight: 800, color: '#4361ee' }}>{m.value}</span> {m.label} ({m.source})
              </div>
            ))}
          </div>
        </div>

        {/* Real Case Study (Conditionally rendered ONLY if genuine verified client exists) */}
        {model.realCaseStudy && (
          <div
            style={{
              padding: '14px 18px',
              backgroundColor: '#f8fafc',
              border: '1px solid #e2e8f0',
              borderRadius: '8px',
              marginBottom: '20px',
            }}
          >
            <div style={{ fontSize: '10px', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', marginBottom: '2px' }}>
              VERIFIED CLIENT BRIEF • {model.realCaseStudy.clientName}
            </div>
            <div style={{ fontSize: '12px', fontWeight: 700, color: '#0f172a', marginBottom: '4px' }}>
              {model.realCaseStudy.headline}
            </div>
            <p style={{ fontSize: '11px', fontStyle: 'italic', color: '#475569', margin: '0 0 6px 0' }}>
              "{model.realCaseStudy.quote}"
            </p>
            <div style={{ fontSize: '10px', color: '#64748b' }}>
              {model.realCaseStudy.author} — {model.realCaseStudy.role}
            </div>
          </div>
        )}

        {/* Single Global Call to Action */}
        <div
          style={{
            textAlign: 'center',
            padding: '16px',
            backgroundColor: '#0f172a',
            borderRadius: '8px',
            color: '#ffffff',
          }}
        >
          <div style={{ fontSize: '14px', fontWeight: 800, marginBottom: '4px' }}>
            Ready to plug your digital revenue leaks?
          </div>
          <div style={{ fontSize: '11px', color: '#94a3b8', marginBottom: '12px' }}>
            Book a 15-minute briefing to review your technical roadmap and lock in audit sprint pricing.
          </div>
          <a
            href={bookingUrl}
            style={{
              display: 'inline-block',
              backgroundColor: '#22c55e',
              color: '#ffffff',
              fontSize: '13px',
              fontWeight: 800,
              padding: '10px 24px',
              borderRadius: '6px',
              textDecoration: 'none',
            }}
          >
            {model.singleCtaText} →
          </a>
          <div style={{ fontSize: '10px', color: '#64748b', marginTop: '8px' }}>
            Direct Booking Link: {bookingUrl}
          </div>
        </div>
      </div>
    </div>
  );
}
