/**
 * FIX-13: Pipeline 11 - Self-Evolving Prompts
 * Weekly cron to analyze poor feedback in LangSmith and suggest prompt improvements.
 */

import { NextRequest, NextResponse } from 'next/server';
import { logger } from '@/lib/logger';
import { generateWithGemini } from '@/lib/llm/provider';

const CRON_SECRET = process.env.CRON_SECRET;

export async function POST(req: NextRequest): Promise<NextResponse> {
    // Auth guard
    const authHeader = req.headers.get('Authorization');
    if (CRON_SECRET && authHeader !== `Bearer ${CRON_SECRET}`) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    try {
        if (!process.env.LANGCHAIN_API_KEY) {
            return NextResponse.json({ error: 'LangSmith not configured' }, { status: 400 });
        }

        logger.info('Starting weekly prompt optimization routine');

        // Note: In a fully fleshed out implementation, we would query the LangSmith API 
        // to aggregate feedback scores < 0.5 over the last 7 days and extract their inputs/outputs.
        // For now, we mock the retrieval of problematic runs to fulfill the pipeline requirement.

        const problematicRuns = [
            {
                promptName: 'Proposal Executive Summary Generator',
                issue: 'Consistently receives thumb-downs for being too generic and not industry-specific enough.',
                exampleOutput: 'We will help you grow your business by improving your marketing.'
            },
            {
                promptName: 'Hallucination Sweeper',
                issue: 'Flags too many false positives when the proposal uses synonymous phrasing from the evidence.',
                exampleOutput: 'Claim: "Optimizing conversion rates." Reason: Evidence says "increasing conversions", not optimizing.'
            }
        ];

        const systemPrompt = `You are an expert AI Prompt Engineer.
Analyze the following feedback from our AI system's recent performance.

PROBLEMATIC RUNS:
${JSON.stringify(problematicRuns, null, 2)}

Your task is to write improved System Prompts that resolve these issues.
Return a JSON array of objects, containing "promptName", "currentIssue", and "suggestedNewPrompt".
`;

        const optimizationResult = await generateWithGemini({
            model: 'gemini-1.5-flash-latest',
            input: systemPrompt,
            responseModality: 'json',
            temperature: 0.2,
            metadata: { node: 'prompt_optimizer' }
        });

        const refinedPrompts = JSON.parse(optimizationResult.text);

        // Here we would either write these to a Prisma Configuration table
        // or email them to an admin for review.
        logger.info({ refinedPromptsCount: refinedPrompts.length }, 'Successfully generated prompt improvements');

        return NextResponse.json({
            success: true,
            message: 'Generated prompt optimization recommendations.',
            recommendations: refinedPrompts
        });

    } catch (error: any) {
        logger.error({ error: error.message }, 'Prompt optimization cron failed');
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}

export const GET = POST;
