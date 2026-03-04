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

interface ProposalNudgeEmailProps {
    businessName: string;
    competitorName: string;
    competitorScore: number;
    yourScore: number;
    reviewGap: number;
    speedGap: number;
    quickWins: Array<{ title: string; impact: string }>;
    roiProjection: number;
    proposalUrl: string;
}

export function ProposalNudgeEmail({
    businessName,
    competitorName,
    competitorScore,
    yourScore,
    reviewGap,
    speedGap,
    quickWins,
    roiProjection,
    proposalUrl,
}: ProposalNudgeEmailProps) {
    const getScoreColor = (score: number) => {
        if (score >= 80) return '#22c55e';
        if (score >= 60) return '#3b82f6';
        if (score >= 40) return '#f59e0b';
        if (score >= 20) return '#f97316';
        return '#ef4444';
    };

    const compColor = getScoreColor(competitorScore);
    const yourColor = getScoreColor(yourScore);

    return (
        <Html>
            <Head>
                <Preview>How {competitorName} is beating you (and how to fix it)</Preview>
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
                            Your audit data shows {competitorName} is pulling ahead. Here's the breakdown:
                        </Text>

                        {/* Comparison Table */}
                        <Section style={comparisonSection}>
                            <Text style={comparisonTitle}>How You Compare</Text>
                            <Section style={table}>
                                <Row style={tableRow}>
                                    <Column style={tableHeader}>Metric</Column>
                                    <Column style={tableHeader}>You</Column>
                                    <Column style={tableHeader}>{competitorName}</Column>
                                </Row>
                                <Row style={tableRow}>
                                    <Column style={tableCell}>{competitorName} Score</Column>
                                    <Column style={{ ...tableCell, color: yourColor }}>{yourScore}</Column>
                                    <Column style={{ ...tableCell, color: compColor }}>{competitorScore}</Column>
                                </Row>
                                <Row style={tableRow}>
                                    <Column style={tableCell}>Google Reviews</Column>
                                    <Column style={tableCell}>41</Column>
                                    <Column style={{ ...tableCell, color: compColor }}>127</Column>
                                </Row>
                                <Row style={tableRow}>
                                    <Column style={tableCell}>Page Speed</Column>
                                    <Column style={tableCell}>4.8s</Column>
                                    <Column style={{ ...tableCell, color: compColor }}>2.2s</Column>
                                </Row>
                                <Row style={tableRow}>
                                    <Column style={tableCell}>Review Rating</Column>
                                    <Column style={tableCell}>3.8★</Column>
                                    <Column style={{ ...tableCell, color: compColor }}>4.7★</Column>
                                </Row>
                            </Section>
                        </Section>

                        {/* The Good News */}
                        <Section style={goodNewsSection}>
                            <Text style={goodNewsTitle}>The Good News</Text>
                            <Text style={goodNewsIntro}>
                                The gap isn't as big as it looks. Here are quick wins that can move the needle fast:
                            </Text>
                            <Section style={winsList}>
                                {quickWins.map((win, idx) => (
                                    <Row key={idx} style={winRow}>
                                        <Column style={winEmoji}>⚡</Column>
                                        <Column style={winContent}>
                                            <Text style={winTitle}>{win.title}</Text>
                                            <Text style={winImpact}>{win.impact}</Text>
                                        </Column>
                                    </Row>
                                ))}
                            </Section>
                        </Section>

                        {/* ROI Projection */}
                        <Section style={roiSection}>
                            <Text style={roiTitle}>ROI Projection</Text>
                            <Text style={roiText}>
                                Fixing just the top 3 issues could mean <strong style={roiBold}>${roiProjection.toLocaleString()}</strong>
                                more per year in new business.
                            </Text>
                        </Section>

                        {/* Urgency */}
                        <Section style={urgencySection}>
                            <Text style={urgencyText}>
                                Your audit data is valid for 21 days. After that, you'll need to re-scan as your online
                                presence changes.
                            </Text>
                        </Section>

                        {/* CTA */}
                        <Section style={ctaSection}>
                            <Button style={ctaButton} href={proposalUrl}>
                                View Your Personalized Action Plan →
                            </Button>
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

export default ProposalNudgeEmail;

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
};

const table = {
    width: '100%',
    borderCollapse: 'collapse' as const,
};

const tableRow = {
    backgroundColor: '#111827',
};

const tableHeader = {
    padding: '12px 16px',
    fontSize: '11px',
    fontWeight: 'bold',
    color: '#9ca3af',
    textTransform: 'uppercase',
    textAlign: 'left' as const,
};

const tableCell = {
    padding: '12px 16px',
    fontSize: '14px',
    color: '#f9fafb',
};

const goodNewsSection = {
    backgroundColor: '#1f2937',
    border: '1px solid #374151',
    borderRadius: '12px',
    padding: '24px',
    marginBottom: '24px',
};

const goodNewsTitle = {
    fontSize: '14px',
    fontWeight: 'bold',
    color: '#22c55e',
    marginBottom: '8px',
};

const goodNewsIntro = {
    fontSize: '14px',
    color: '#d1d5db',
    lineHeight: '1.5',
    marginBottom: '16px',
};

const winsList = {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '12px',
};

const winRow = {
    display: 'flex',
    alignItems: 'flex-start',
    gap: '12px',
};

const winEmoji = {
    fontSize: '18px',
    flexShrink: 0,
};

const winContent = {
    flex: 1,
};

const winTitle = {
    fontSize: '14px',
    fontWeight: 'bold',
    color: '#f9fafb',
    marginBottom: '4px',
};

const winImpact = {
    fontSize: '12px',
    color: '#d1d5db',
};

const roiSection = {
    backgroundColor: '#1f2937',
    border: '1px solid #374151',
    borderRadius: '12px',
    padding: '24px',
    marginBottom: '24px',
    textAlign: 'center' as const,
};

const roiTitle = {
    fontSize: '14px',
    fontWeight: 'bold',
    color: '#f9fafb',
    marginBottom: '8px',
};

const roiText = {
    fontSize: '16px',
    color: '#d1d5db',
    lineHeight: '1.6',
};

const roiBold = {
    color: '#22c55e',
    fontWeight: 'bold',
};

const urgencySection = {
    backgroundColor: '#1f2937',
    border: '1px solid #f59e0b',
    borderRadius: '12px',
    padding: '16px',
    marginBottom: '24px',
};

const urgencyText = {
    fontSize: '12px',
    color: '#f59e0b',
    lineHeight: '1.5',
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