import { NextRequest, NextResponse } from 'next/server';
import { render } from '@react-email/render';
import { ReportReadyEmail } from '@/lib/emails/report-ready';
import { DeepDiveEmail } from '@/lib/emails/deep-dive';
import { ProposalNudgeEmail } from '@/lib/emails/proposal-nudge';
import { mockReportData } from '@/lib/mock-data';

// Mock send function for testing
async function sendTestEmail(html: string, to: string, subject: string) {
    console.log(`[TestEmail] Sending to: ${to}`);
    console.log(`[TestEmail] Subject: ${subject}`);
    console.log(`[TestEmail] HTML length: ${html.length} chars`);
    console.log(`[TestEmail] HTML preview: ${html.substring(0, 500)}...`);
    return { success: true };
}

export async function GET(req: NextRequest) {
    try {
        const { searchParams } = new URL(req.url);
        const to = searchParams.get('to') || 'test@example.com';
        const template = searchParams.get('template') || 'report-ready';

        const mockData = mockReportData;
        const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';

        let html = '';
        let subject = '';

        switch (template) {
            case 'report-ready': {
                const email = ReportReadyEmail({
                    businessName: mockData.businessName,
                    overallScore: mockData.overallScore,
                    letterGrade: mockData.letterGrade,
                    categories: mockData.categories,
                    topFindings: mockData.findings.map((f) => ({
                        title: f.title,
                        severity: f.severity,
                    })),
                    reportUrl: `${appUrl}/report/${mockData.token}`,
                });
                html = await render(email);
                subject = `Your ${mockData.businessName} Audit Report is Ready`;
                break;
            }

            case 'deep-dive': {
                const email = DeepDiveEmail({
                    businessName: mockData.businessName,
                    topFinding: {
                        title: mockData.findings[0].title,
                        impact: mockData.findings[0].impact,
                        severity: mockData.findings[0].severity,
                    },
                    competitorName: mockData.competitors[0]?.name || 'Prairie Dental',
                    competitorScore: mockData.competitors[0]?.overallScore || 71,
                    yourScore: mockData.overallScore,
                    proposalUrl: `${appUrl}/proposal/${mockData.token}`,
                    reportUrl: `${appUrl}/report/${mockData.token}`,
                });
                html = await render(email);
                subject = `The #1 issue hurting ${mockData.businessName} right now`;
                break;
            }

            case 'proposal-nudge': {
                const email = ProposalNudgeEmail({
                    businessName: mockData.businessName,
                    competitorName: mockData.competitors[0]?.name || 'Prairie Dental',
                    competitorScore: mockData.competitors[0]?.overallScore || 71,
                    yourScore: mockData.overallScore,
                    reviewGap: 86,
                    speedGap: 2.6,
                    quickWins: [
                        {
                            title: 'Respond to 3 unaddressed negative reviews',
                            impact: 'Could recover 5-10% of lost conversions',
                        },
                        {
                            title: 'Add missing meta descriptions to 37 pages',
                            impact: 'Expected 15-20% CTR improvement',
                        },
                        {
                            title: 'Configure Google Business Profile booking link',
                            impact: '31% more direct bookings from profile',
                        },
                    ],
                    roiProjection: 25000,
                    proposalUrl: `${appUrl}/proposal/${mockData.token}`,
                });
                html = await render(email);
                subject = `How ${mockData.competitors[0]?.name} is beating you (and how to fix it)`;
                break;
            }

            default:
                return NextResponse.json({ error: 'Invalid template' }, { status: 400 });
        }

        await sendTestEmail(html, to, subject);

        return NextResponse.json({
            success: true,
            message: `Test email sent to ${to}`,
            template,
            subject,
        });
    } catch (err) {
        console.error('[test-email] Error:', err);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}