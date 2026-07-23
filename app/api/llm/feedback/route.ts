import { NextRequest, NextResponse } from 'next/server';
import { logFeedbackToLangsmith } from '@/lib/llm/provider';
import { logger } from '@/lib/logger';

export async function POST(req: NextRequest) {
    try {
        const body = await req.json();
        const { runId, score, comment } = body;

        if (!runId || typeof score !== 'number') {
            return NextResponse.json(
                { error: 'Missing runId or numeric score' },
                { status: 400 }
            );
        }

        await logFeedbackToLangsmith(runId, score, comment);

        return NextResponse.json({ success: true, runId });
    } catch (error: any) {
        logger.error({ error: error.message }, 'Failed to submit LLM feedback');
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}
