/**
 * FIX-14: Pipeline 12 - Predictive Intelligence Orchestrator
 * Regularly scores all leads/clients for Churn Risk, Win Probability, and LTV.
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { logger } from '@/lib/logger';
import { calculateChurnRisk } from '@/lib/predictions/churnRisk';
import { calculateWinProbability } from '@/lib/predictions/winProbability';
import { predictLTV } from '@/lib/predictions/ltvModel';

const CRON_SECRET = process.env.CRON_SECRET;

export async function POST(req: NextRequest): Promise<NextResponse> {
    const authHeader = req.headers.get('Authorization');
    if (CRON_SECRET && authHeader !== `Bearer ${CRON_SECRET}`) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    try {
        const leads = await prisma.prospectLead.findMany({
            where: {
                // We score active prospects and current clients
                status: {
                    in: ['DISCOVERED', 'CONTACTED', 'ENGAGED', 'PROPOSAL_SENT', 'NEGOTIATING', 'CLIENT'] as any
                }
            },
            include: {
                proposal: {
                    include: { audit: { include: { findings: true } } }
                }
            }
        });

        logger.info({ leadCount: leads.length }, 'Starting Predictive Intelligence scoring pass');

        const results = [];

        for (const lead of leads) {
            try {
                const analysis: any = { leadId: lead.id, type: lead.status };

                // 1. Churn Risk (Clients only)
                if (lead.status === 'CLIENT') {
                    const churn = await calculateChurnRisk(lead.id);
                    analysis.churnRisk = churn.risk;

                    // Note: Schema updates might be needed to store churnRisk directly on ProspectLead in future
                } else {
                    // 2. Win Probability (Prospects only)
                    const winProbInput = {
                        painScore: lead.painScore || 50,
                        tourniquetFindingCount: lead.proposal?.audit?.findings?.filter(f => f.impactScore >= 8).length || 0,
                        emailOpenCount: lead.outreachOpenCount,
                        chatbotMessageCount: 0, // Mocked for now until chat metrics are joined
                        vertical: lead.vertical
                    };
                    const winProb = calculateWinProbability(winProbInput);
                    analysis.winProbability = winProb;

                    // Update engagement score / future win_probability column
                    await prisma.prospectLead.update({
                        where: { id: lead.id },
                        data: { engagementScore: winProb } // Mapping engagementScore loosely to winProb for now
                    });
                }

                // 3. LTV Prediction (For both, mainly to identify high value early)
                const findings = lead.proposal?.audit?.findings || [];
                const ltv = predictLTV(lead, findings);
                analysis.ltvPrediction = ltv.category;

                // Logging the LTV reason as required by Pipeline 12
                logger.debug({ leadId: lead.id, ltv: ltv.category, reason: ltv.reason }, 'LTV Prediction reasoned');

                results.push(analysis);

            } catch (err: any) {
                logger.warn({ leadId: lead.id, err: err.message }, 'Failed to score lead');
            }
        }

        logger.info({ scored: results.length }, 'Predictive Intelligence scoring pass complete');

        return NextResponse.json({ success: true, processed: results.length, samples: results.slice(0, 5) });
    } catch (error: any) {
        logger.error({ error: error.message }, 'Scoring engine cron failed');
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}

export const GET = POST;
