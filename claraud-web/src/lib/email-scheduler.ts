// Email Scheduler - In-memory drip sequence manager
// In production, this would use a database and cron job

import { mockReportData } from './mock-data';

interface ScheduledEmail {
    id: string;
    to: string;
    templateId: 'report-ready' | 'deep-dive' | 'proposal-nudge';
    sendAt: Date;
    sent: boolean;
    context: {
        businessName: string;
        overallScore: number;
        letterGrade: string;
        reportUrl: string;
        proposalUrl: string;
        topFindings: any[];
        competitors: any[];
        // Deep dive and proposal nudge context
        competitorName?: string;
        competitorScore?: number;
        reviewGap?: number;
        speedGap?: number;
        quickWins?: Array<{ title: string; impact: string }>;
        roiProjection?: number;
    };
}

class EmailScheduler {
    private queue: Map<string, ScheduledEmail[]> = new Map();

    constructor() {
        // Log queue status on startup
        console.log('[EmailScheduler] Initialized with in-memory queue');
    }

    // Add days to a date
    private addDays(date: Date, days: number): Date {
        const result = new Date(date);
        result.setDate(result.getDate() + days);
        return result;
    }

    // Schedule a drip sequence for a lead
    scheduleSequence(lead: { email: string; businessName?: string }, reportData: typeof mockReportData) {
        const { email, businessName } = lead;
        const { businessName: reportBusinessName, overallScore, letterGrade, categories, findings, competitors } = reportData;

        const baseEmail = {
            to: email,
            context: {
                businessName: businessName || reportBusinessName,
                overallScore,
                letterGrade,
                reportUrl: `${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/report/${reportData.token}`,
                proposalUrl: `${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/proposal/${reportData.token}`,
                topFindings: findings,
                competitors,
            },
        };

        const emails: ScheduledEmail[] = [
            // Email 1: Immediately
            {
                id: `report-${Date.now()}`,
                to: email,
                templateId: 'report-ready',
                sendAt: new Date(),
                sent: false,
                context: baseEmail.context,
            },
            // Email 2: Day 2
            {
                id: `deep-dive-${Date.now()}`,
                to: email,
                templateId: 'deep-dive',
                sendAt: this.addDays(new Date(), 2),
                sent: false,
                context: {
                    ...baseEmail.context,
                    competitorName: competitors[0]?.name || 'Prairie Dental',
                    competitorScore: competitors[0]?.overallScore || 71,
                },
            },
            // Email 3: Day 5
            {
                id: `proposal-nudge-${Date.now()}`,
                to: email,
                templateId: 'proposal-nudge',
                sendAt: this.addDays(new Date(), 5),
                sent: false,
                context: {
                    ...baseEmail.context,
                    competitorName: competitors[0]?.name || 'Prairie Dental',
                    competitorScore: competitors[0]?.overallScore || 71,
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
                },
            },
        ];

        // Store in queue
        this.queue.set(email, emails);

        // Log sequence
        console.log(`[EmailScheduler] Scheduled sequence for ${email}:`);
        emails.forEach((email, idx) => {
            console.log(`  ${idx + 1}. ${email.templateId} - ${email.sendAt.toLocaleString()}`);
        });

        // Send first email immediately
        this.sendEmail(emails[0]);

        return emails;
    }

    // Send an email (in production, this would use Resend)
    private async sendEmail(email: ScheduledEmail) {
        console.log(`[EmailScheduler] Sending ${email.templateId} to ${email.to}`);
        console.log(`[EmailScheduler] Context:`, JSON.stringify(email.context, null, 2));

        // In production, uncomment this:
        // try {
        //     await sendEmail({
        //         to: email.to,
        //         subject: this.getSubject(email.templateId, email.context),
        //         template: email.templateId,
        //         variables: email.context,
        //     });
        //     email.sent = true;
        // } catch (error) {
        //     console.error('[EmailScheduler] Failed to send email:', error);
        // }
    }

    // Get subject line for template
    private getSubject(templateId: string, context: any): string {
        switch (templateId) {
            case 'report-ready':
                return `Your ${context.businessName} Audit Report is Ready`;
            case 'deep-dive':
                return `The #1 issue hurting ${context.businessName} right now`;
            case 'proposal-nudge':
                return `How ${context.competitorName} is beating you (and how to fix it)`;
            default:
                return 'Claraud Audit Report';
        }
    }

    // Process the queue (in production, this would be a cron job)
    async processQueue() {
        const now = new Date();
        const emailsToSend: ScheduledEmail[] = [];

        // Find emails that should be sent
        for (const [email, sequence] of this.queue.entries()) {
            for (const emailItem of sequence) {
                if (!emailItem.sent && emailItem.sendAt <= now) {
                    emailsToSend.push(emailItem);
                }
            }
        }

        // Send found emails
        for (const email of emailsToSend) {
            await this.sendEmail(email);
        }

        console.log(`[EmailScheduler] Processed queue. Found ${emailsToSend.length} emails to send.`);
        return emailsToSend;
    }

    // Get queue status
    getQueueStatus() {
        const total = Array.from(this.queue.values()).flat().length;
        const sent = Array.from(this.queue.values())
            .flat()
            .filter((e) => e.sent).length;
        const pending = total - sent;

        return { total, sent, pending };
    }
}

export const emailScheduler = new EmailScheduler();