import {
    Html,
    Body,
    Head,
    Preview,
    Text,
    Section,
    Row,
    Column,
    Container,
    Button,
    Hr,
    Link,
} from '@react-email/components';

interface DeepDiveEmailProps {
    businessName: string;
    topFinding: {
        title: string;
        impact: string;
        severity: string;
    };
    competitorName: string;
    competitorScore: number;
    yourScore: number;
    proposalUrl: string;
    reportUrl: string;
}

export function DeepDiveEmail({
    businessName,
    topFinding,
    competitorName,
    competitorScore,
    yourScore,
    proposalUrl,
    reportUrl,
}: DeepDiveEmailProps) {
    const getScoreColor = (score: number) => {
        if (score >= 80) return '#22c55e';
        if (score >= 60) return '#3b82f6';
        if (score >= 40) return '#f59e0b';
        if (score >= 20) return '#f97316';
        return '#ef4444';
    };

    const yourColor = getScoreColor(yourScore);
    const compColor = getScoreColor(competitorScore);

    return (
        <Html>
            <Head>
                <Preview>The #1 issue hurting {businessName} right now</Preview>
            </Head>
            <Body style={main}>
                <Container style={container}>
                    {/* Header */}
                    <Section style={header}>
                        <Text style={logo}>Claraud</Text>
                    </Section>

                    {/* Main Content */}
                    <Section style={content}>
                        <Text style={intro}>
                            We dug deeper into your audit results. Here's what we found:
                        </Text>

                        {/* Critical Finding */}
                        <Section style={findingCard}>
                            <Text style={findingTitle}>The #1 Issue</Text>
                            <Text style={findingText}>{topFinding.title}</Text>
                        </Section>

                        {/* Impact */}
                        <Section style={impactSection}>
                            <Text style={impactLabel}>IMPACT</Text>
                            <Text style={impactText}>{topFinding.impact}</Text>
                        </Section>

                        {/* What This Means */}
                        <Section style={meansSection}>
                            <Text style={meansTitle}>What this means for your business</Text>
                            <Text style={meansText}>
                                This issue is actively preventing potential customers from finding and choosing your business.
                                Every day this remains unresolved, you're losing leads to competitors who have optimized their
                                online presence.
                            </Text>
                        </Section>

                        {/* Before/After */}
                        <Section style={scenarioSection}>
                            <Text style={scenarioTitle}>The Before/After Scenario</Text>
                            <Row style={scenarioRow}>
                                <Column style={scenarioCol}>
                                    <Text style={scenarioLabel}>CURRENT</Text>
                                    <Text style={scenarioText}>
                                        • {competitorScore - yourScore} points behind {competitorName}
                                        <br />
                                        • Losing {Math.round((competitorScore - yourScore) / 10)} leads/month
                                        <br />
                                        • Competitors outranking you on key searches
                                    </Text>
                                </Column>
                                <Column style={scenarioCol}>
                                    <Text style={scenarioLabel}>AFTER FIXING</Text>
                                    <Text style={scenarioText}>
                                        • Catch up to competitor gap
                                        <br />
                                        • Recover lost leads
                                        <br />
                                        • Rank higher on local searches
                                    </Text>
                                </Column>
                            </Row>
                        </Section>

                        {/* Score Comparison */}
                        <Section style={comparisonSection}>
                            <Text style={comparisonTitle}>Your Score vs. {competitorName}</Text>
                            <Row style={comparisonRow}>
                                <Column align="center" style={scoreCol}>
                                    <Text style={{ ...scoreValue, color: yourColor }}>{yourScore}</Text>
                                    <Text style={scoreLabel}>You</Text>
                                </Column>
                                <Column align="center" style={vsCol}>
                                    <Text style={vsText}>VS</Text>
                                </Column>
                                <Column align="center" style={scoreCol}>
                                    <Text style={{ ...scoreValue, color: compColor }}>{competitorScore}</Text>
                                    <Text style={scoreLabel}>{competitorName}</Text>
                                </Column>
                            </Row>
                        </Section>

                        {/* CTA */}
                        <Section style={ctaSection}>
                            <Button style={ctaButton} href={proposalUrl}>
                                See Your Full Action Plan →
                            </Button>
                        </Section>

                        {/* PS */}
                        <Section style={psSection}>
                            <Text style={psLabel}>PS</Text>
                            <Text style={psText}>
                                Did you know you can share your audit report?{' '}
                                <Link href={reportUrl} style={link}>
                                    Share your report
                                </Link>{' '}
                                with your team or stakeholders.
                            </Text>
                        </Section>
                    </Section>

                    {/* Footer */}
                    <Hr style={hr} />
                    <Section style={footer}>
                        <Text style={footerText}>Claraud — AI Business Audit</Text>
                        <Link href="https://claraud.com" style={footerLink}>
                            claraud.com
                        </Link>
                    </Section>
                </Container>
            </Body>
        </Html>
    );
}

export default DeepDiveEmail;

const main = {
    backgroundColor: '#0f172a',
    fontFamily: 'Arial, sans-serif',
};

const container = {
    margin: '0 auto',
    padding: '20px 0',
    width: '100%',
    maxWidth: '600px',
};

const header = {
    backgroundColor: '#111827',
    padding: '20px',
    textAlign: 'center' as const,
};

const logo = {
    fontSize: '28px',
    fontWeight: 'bold',
    color: '#f9fafb',
    letterSpacing: '-0.5px',
};

const content = {
    padding: '30px 20px',
};

const intro = {
    fontSize: '14px',
    color: '#d1d5db',
    lineHeight: '1.6',
    marginBottom: '24px',
};

const findingCard = {
    backgroundColor: '#1f2937',
    border: '1px solid #374151',
    borderRadius: '12px',
    padding: '24px',
    marginBottom: '24px',
};

const findingTitle = {
    fontSize: '16px',
    fontWeight: 'bold',
    color: '#f9fafb',
    marginBottom: '8px',
};

const findingText = {
    fontSize: '14px',
    color: '#d1d5db',
    lineHeight: '1.5',
};

const impactSection = {
    backgroundColor: '#1f2937',
    border: '1px solid #374151',
    borderRadius: '12px',
    padding: '20px',
    marginBottom: '24px',
};

const impactLabel = {
    fontSize: '10px',
    fontWeight: 'bold',
    color: '#ef4444',
    textTransform: 'uppercase',
    letterSpacing: '1px',
    marginBottom: '8px',
};

const impactText = {
    fontSize: '14px',
    color: '#d1d5db',
    lineHeight: '1.5',
};

const meansSection = {
    marginBottom: '24px',
};

const meansTitle = {
    fontSize: '14px',
    fontWeight: 'bold',
    color: '#f9fafb',
    marginBottom: '8px',
};

const meansText = {
    fontSize: '14px',
    color: '#d1d5db',
    lineHeight: '1.6',
};

const scenarioSection = {
    backgroundColor: '#1f2937',
    border: '1px solid #374151',
    borderRadius: '12px',
    padding: '24px',
    marginBottom: '24px',
};

const scenarioTitle = {
    fontSize: '14px',
    fontWeight: 'bold',
    color: '#f9fafb',
    marginBottom: '16px',
};

const scenarioRow = {
    display: 'flex',
    gap: '20px',
};

const scenarioCol = {
    flex: 1,
    padding: '16px',
    backgroundColor: '#111827',
    borderRadius: '8px',
};

const scenarioLabel = {
    fontSize: '10px',
    fontWeight: 'bold',
    color: '#9ca3af',
    textTransform: 'uppercase',
    marginBottom: '8px',
};

const scenarioText = {
    fontSize: '12px',
    color: '#d1d5db',
    lineHeight: '1.5',
};

const comparisonSection = {
    backgroundColor: '#1f2937',
    border: '1px solid #374151',
    borderRadius: '12px',
    padding: '24px',
    marginBottom: '24px',
};

const comparisonTitle = {
    fontSize: '14px',
    fontWeight: 'bold',
    color: '#f9fafb',
    marginBottom: '16px',
    textAlign: 'center' as const,
};

const comparisonRow = {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '20px',
};

const scoreCol = {
    flex: 1,
};

const scoreValue = {
    fontSize: '48px',
    fontWeight: '900',
    lineHeight: '1',
};

const scoreLabel = {
    fontSize: '12px',
    color: '#9ca3af',
    marginTop: '8px',
};

const vsCol = {
    padding: '10px 20px',
};

const vsText = {
    fontSize: '14px',
    fontWeight: 'bold',
    color: '#6b7280',
};

const ctaSection = {
    textAlign: 'center' as const,
    margin: '32px 0',
};

const ctaButton = {
    backgroundColor: '#3b82f6',
    color: '#ffffff',
    padding: '16px 32px',
    borderRadius: '8px',
    fontWeight: 'bold',
    fontSize: '16px',
    textDecoration: 'none',
    display: 'inline-block',
};

const psSection = {
    backgroundColor: '#1f2937',
    border: '1px solid #374151',
    borderRadius: '12px',
    padding: '20px',
    marginTop: '24px',
};

const psLabel = {
    fontSize: '10px',
    fontWeight: 'bold',
    color: '#f59e0b',
    textTransform: 'uppercase',
    letterSpacing: '1px',
    marginBottom: '8px',
};

const psText = {
    fontSize: '14px',
    color: '#d1d5db',
    lineHeight: '1.5',
};

const link = {
    color: '#3b82f6',
    textDecoration: 'underline',
};

const hr = {
    borderColor: '#374151',
    margin: '32px 0',
};

const footer = {
    textAlign: 'center' as const,
    padding: '20px',
};

const footerText = {
    fontSize: '14px',
    color: '#d1d5db',
    fontWeight: '500',
};

const footerLink = {
    color: '#3b82f6',
    textDecoration: 'underline',
};