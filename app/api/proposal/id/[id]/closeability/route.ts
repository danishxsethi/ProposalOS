import { NextResponse } from 'next/server';
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { withAuth } from '@/lib/middleware/auth';

interface Params {
    params: Promise<{ id: string }>;
}

type GateShape = {
    score?: unknown;
    weight?: unknown;
};

function toBoundedScore(value: unknown): number | null {
    const n = Number(value);
    if (!Number.isFinite(n)) return null;
    if (n < 1 || n > 10) return null;
    return n;
}

function getGateWeightedScore(clientScoreResults: Record<string, unknown>, fallback: number): number {
    const gates = clientScoreResults.gates as Record<string, unknown> | undefined;
    const truth = (gates?.truth as GateShape | undefined) ?? {};
    const fit = (gates?.fit as GateShape | undefined) ?? {};
    const decision = (gates?.decision as GateShape | undefined) ?? {};

    const truthScore = Number(truth.score);
    const fitScore = Number(fit.score);
    const decisionScore = Number(decision.score);

    if (![truthScore, fitScore, decisionScore].every((s) => Number.isFinite(s))) {
        return fallback;
    }

    const truthWeight = Number.isFinite(Number(truth.weight)) ? Number(truth.weight) : 0.4;
    const fitWeight = Number.isFinite(Number(fit.weight)) ? Number(fit.weight) : 0.35;
    const decisionWeight = Number.isFinite(Number(decision.weight)) ? Number(decision.weight) : 0.25;

    return Math.round(
        truthScore * truthWeight +
        fitScore * fitWeight +
        decisionScore * decisionWeight
    );
}

/**
 * POST /api/proposal/id/[id]/closeability
 * 2-minute human review: tone, trust, buyability (1-10 each).
 * Recomputes final client score and clears "requiresHumanReview" gate.
 */
export const POST = withAuth(async (req: Request, { params }: Params) => {
    try {
        const { id } = await params;
        const body = await req.json();
        const tone = toBoundedScore(body.tone);
        const trust = toBoundedScore(body.trust);
        const buyability = toBoundedScore(body.buyability);
        const notes = typeof body.notes === 'string' ? body.notes.trim() : undefined;

        if (tone === null || trust === null || buyability === null) {
            return NextResponse.json(
                { error: 'tone, trust, and buyability must each be numbers from 1 to 10' },
                { status: 400 }
            );
        }

        const proposal = await prisma.proposal.findUnique({
            where: { id },
            select: {
                id: true,
                status: true,
                clientScore: true,
                clientScoreResults: true,
                qaResults: true,
            },
        });

        if (!proposal) {
            return NextResponse.json({ error: 'Proposal not found' }, { status: 404 });
        }

        const clientScoreResults =
            proposal.clientScoreResults && typeof proposal.clientScoreResults === 'object'
                ? (proposal.clientScoreResults as Record<string, unknown>)
                : {};

        const qaResults =
            proposal.qaResults && typeof proposal.qaResults === 'object'
                ? (proposal.qaResults as Record<string, unknown>)
                : {};

        const hardFails = Array.isArray(clientScoreResults.hardFails)
            ? clientScoreResults.hardFails
            : [];

        const baseScore = getGateWeightedScore(clientScoreResults, Number(proposal.clientScore ?? 0));
        const reviewerScore = Number(((tone + trust + buyability) / 3).toFixed(1));

        const blendedScore =
            hardFails.length > 0
                ? 0
                : Math.round(baseScore * 0.85 + reviewerScore * 10 * 0.15);

        const humanCloseability = {
            provided: true,
            score: reviewerScore,
            passed: reviewerScore >= 8,
            notes,
        };

        const updatedClientScoreResults: Record<string, unknown> = {
            ...clientScoreResults,
            score: blendedScore,
            requiresHumanReview: false,
            humanCloseability,
            reviewedAt: new Date().toISOString(),
        };

        const nextWarnings = (() => {
            const warnings = Array.isArray(qaResults.warnings)
                ? (qaResults.warnings as unknown[]).filter((w) => typeof w === 'string') as string[]
                : [];
            const withoutHumanReviewWarning = warnings.filter(
                (w) => !w.toLowerCase().includes('human closeability review')
            );
            if (hardFails.length > 0) return withoutHumanReviewWarning;
            if (blendedScore < 90) {
                return Array.from(new Set([...withoutHumanReviewWarning, 'Client-perfect score below 90']));
            }
            return withoutHumanReviewWarning;
        })();

        const updatedQaResults: Record<string, unknown> = {
            ...qaResults,
            score: blendedScore,
            warnings: nextWarnings,
            needsReview: hardFails.length > 0 || blendedScore < 60,
            clientPerfect: updatedClientScoreResults,
        };

        let nextStatus = proposal.status;
        if (proposal.status === 'DRAFT' || proposal.status === 'READY') {
            if (hardFails.length > 0) {
                nextStatus = 'DRAFT';
            } else {
                nextStatus = blendedScore >= 60 ? 'READY' : 'DRAFT';
            }
        }

        const updated = await prisma.proposal.update({
            where: { id },
            data: {
                status: nextStatus,
                clientScore: blendedScore,
                qaScore: blendedScore,
                humanCloseabilityScore: reviewerScore,
                clientScoreResults: updatedClientScoreResults as Prisma.InputJsonValue,
                qaResults: updatedQaResults as Prisma.InputJsonValue,
            },
            select: {
                id: true,
                status: true,
                clientScore: true,
                humanCloseabilityScore: true,
                clientScoreResults: true,
            },
        });

        return NextResponse.json({
            success: true,
            proposal: updated,
        });
    } catch (error) {
        console.error('[API] Error submitting closeability review:', error);
        return NextResponse.json(
            { error: 'Failed to submit closeability review' },
            { status: 500 }
        );
    }
});
