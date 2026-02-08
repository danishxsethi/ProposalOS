import { NextRequest, NextResponse } from 'next/server';
import { handleProposalChat } from '@/lib/chat/proposalChatbot';

export async function POST(req: NextRequest) {
    try {
        const body = await req.json();
        const { token, message, conversationId } = body;

        if (!token || !message) {
            return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
        }

        const result = await handleProposalChat({
            proposalToken: token,
            message,
            conversationId
        });

        return NextResponse.json(result);
    } catch (error) {
        console.error('Chat error:', error);
        return NextResponse.json(
            { error: 'Failed to process message' },
            { status: 500 }
        );
    }
}
