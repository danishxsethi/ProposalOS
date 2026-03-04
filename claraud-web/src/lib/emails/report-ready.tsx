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
    Tailwind,
    Link,
} from '@react-email/components';
import { ReactElement } from 'react';

interface ReportReadyEmailProps {
    businessName: string;
    overallScore: number;
    letterGrade: string;
    categories: Array<{ id: string; name: string; score: number }>;
    topFindings: Array<{ title: string; severity: string }>;
    reportUrl: string;
}

const severityEmoji: Record<string, string> = {
    critical: '🔴',
    high: '🟠',
    medium: '🟡',
    low: '🟢',
};

export function ReportReadyEmail({
    businessName,
    overallScore,
    letterGrade,
    categories,
    topFindings,
    reportUrl,
}: ReportReadyEmailProps) {
    const getScoreColor = (score: number) => {
        if (score >= 80) return '#22c55e';
        if (score >= 60) return '#3b82f6';
        if (score >= 40) return '#f59e0b';
        if (score >= 20) return '#f97316';
        return '#ef4444';
    };

    const scoreColor = getScoreColor(overallScore);

    return (
        <Html>
            <Head>
                <Preview>Your {businessName} Audit Report is Ready</Preview>
            </Head>
            <Body style={main}>
                <Container style={container}>
                    {/* Header */}
                    <Section style={header}>
                        <Text style={logo}>Claraud</Text>
                    </Section>

                    {/* Main Content */}
                    <Section style={content}>
                        <Text style={greeting}>Hi there,</Text>
                        <Text style={intro}>
                            Your AI audit of <strong style={bold}>{businessName}</strong> is complete. Here's a snapshot:
                        </Text>

                        {/* Score Card */}
                        <Section style={{ ...scoreCard, borderColor: scoreColor }}>
                            <Row>
                                <Column align="center">
                                    <Text style={{ ...scoreNumber, color: scoreColor }}>{overallScore}</Text>
                                    <Text style={scoreLabel}>Overall Score</Text>
                                </Column>
                                <Column align="center">
                                    <Text style={{ ...gradeBadge, color: scoreColor, backgroundColor: `${scoreColor}20` }}>
                                        {letterGrade}
                                    </Text>
                                </Column>
                            </Row>
                        </Section>

                        {/* Category Breakdown */}
                        <Text style={sectionTitle}>Category Breakdown</Text>
                        <Section style={categoryTable}>
                            {categories.map((cat) => {
                                const catColor = getScoreColor(cat.score);
                                return (
                                    <Row key={cat.id} style={categoryRow}>
                                        <Column style={categoryIconCol}>
                                            <Text style={categoryIcon}>
                                                {cat.id === 'website' && '💻'}
                                                {cat.id === 'google' && '📍'}
                                                {cat.id === 'seo' && '🔍'}
                                                {cat.id === 'reviews' && '⭐'}
                                                {cat.id === 'social' && '📱'}
                                                {cat.id === 'competitors' && '📊'}
                                            </Text>
                                        </Column>
                                        <Column style={categoryNameCol}>
                                            <Text style={categoryName}>{cat.name}</Text>
                                        </Column>
                                        <Column align="right" style={categoryScoreCol}>
                                            <Text style={{ ...categoryScore, color: catColor }}>{cat.score}/100</Text>
                                        </Column>
                                    </Row>
                                );
                            })}
                        </Section>

                        {/* Top 3 Findings */}
                        <Text style={sectionTitle}>Your Top 3 Findings</Text>
                        <Section style={findingsList}>
                            {topFindings.slice(0, 3).map((finding, idx) => (
                                <Row key={idx} style={findingRow}>
                                    <Column style={findingEmojiCol}>
                                        <Text style={findingEmoji}>
                                            {severityEmoji[finding.severity] || '🟡'}
                                        </Text>
                                    </Column>
                                    <Column style={findingTitleCol}>
                                        <Text style={findingTitle}>{finding.title}</Text>
                                    </Column>
                                </Row>
                            ))}
                        </Section>

                        {/* CTA Button */}
                        <Section style={ctaSection}>
                            <Button style={ctaButton} href={reportUrl}>
                                View Full Report →
                            </Button>
                        </Section>

                        <Text style={footerIntro}>
                            This report was generated by Claraud's AI audit engine. It analyzed 30+ dimensions of your
                            online presence in under 30 seconds.
                        </Text>
                    </Section>

                    {/* Footer */}
                    <Hr style={hr} />
                    <Section style={footer}>
                        <Text style={footerText}>Claraud — AI Business Audit</Text>
                        <Link href="https://claraud.com" style={footerLink}>
                            claraud.com
                        </Link>
                        <Text style={footerUnsubscribe}>
                            You're receiving this email because you requested an audit. Unsubscribe{' '}
                            <Link href="https://claraud.com/unsubscribe" style={footerLink}>
                                here
                            </Link>
                            .
                        </Text>
                    </Section>
                </Container>
            </Body>
        </Html>
    );
}

export default ReportReadyEmail;

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

const greeting = {
    fontSize: '16px',
    color: '#d1d5db',
    marginBottom: '16px',
};

const intro = {
    fontSize: '14px',
    color: '#d1d5db',
    lineHeight: '1.6',
    marginBottom: '24px',
};

const bold = {
    fontWeight: 'bold',
    color: '#f9fafb',
};

const scoreCard = {
    border: '2px solid',
    borderRadius: '12px',
    padding: '24px',
    marginBottom: '24px',
    textAlign: 'center' as const,
};

const scoreNumber = {
    fontSize: '48px',
    fontWeight: '900',
    lineHeight: '1',
    marginBottom: '8px',
};

const scoreLabel = {
    fontSize: '12px',
    color: '#9ca3af',
    textTransform: 'uppercase',
    letterSpacing: '1px',
};

const gradeBadge = {
    fontSize: '24px',
    fontWeight: 'bold',
    padding: '8px 16px',
    borderRadius: '8px',
    border: '2px solid',
};

const sectionTitle = {
    fontSize: '14px',
    fontWeight: 'bold',
    color: '#f9fafb',
    textTransform: 'uppercase',
    letterSpacing: '1px',
    marginBottom: '16px',
    marginTop: '24px',
};

const categoryTable = {
    border: '1px solid #374151',
    borderRadius: '8px',
    overflow: 'hidden',
};

const categoryRow = {
    backgroundColor: '#1f2937',
};

const categoryIconCol = {
    width: '40px',
    padding: '12px 16px',
};

const categoryIcon = {
    fontSize: '18px',
};

const categoryNameCol = {
    padding: '12px 16px',
};

const categoryName = {
    fontSize: '14px',
    color: '#f9fafb',
    fontWeight: '500',
};

const categoryScoreCol = {
    padding: '12px 16px',
};

const categoryScore = {
    fontSize: '14px',
    fontWeight: 'bold',
};

const findingsList = {
    border: '1px solid #374151',
    borderRadius: '8px',
    overflow: 'hidden',
};

const findingRow = {
    backgroundColor: '#1f2937',
};

const findingEmojiCol = {
    width: '40px',
    padding: '12px 16px',
};

const findingEmoji = {
    fontSize: '16px',
};

const findingTitleCol = {
    padding: '12px 16px',
};

const findingTitle = {
    fontSize: '14px',
    color: '#f9fafb',
    lineHeight: '1.4',
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

const footerIntro = {
    fontSize: '12px',
    color: '#9ca3af',
    lineHeight: '1.5',
    marginBottom: '24px',
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

const footerUnsubscribe = {
    fontSize: '11px',
    color: '#6b7280',
    marginTop: '12px',
};