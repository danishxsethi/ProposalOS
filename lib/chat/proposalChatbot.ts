import { prisma } from '@/lib/prisma';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { Finding } from '@prisma/client';
import { sendAlert } from '@/lib/alerts/webhook';

const genAI = new GoogleGenerativeAI(process.env.GOOGLE_PLACES_API_KEY!);

export interface ChatRequest {
    proposalToken: string;
    message: string;
    conversationId?: string;
}

// FIX-18: Human handoff trigger keywords
const HANDOFF_PHRASES = [
    'talk to someone', 'speak to a person', 'speak with a human',
    'real person', 'call me', 'phone call', 'talk to an agent',
    'speak to a representative', 'want to talk', 'can i call',
];

function detectHandoffRequest(message: string): boolean {
    const lower = message.toLowerCase();
    return HANDOFF_PHRASES.some(phrase => lower.includes(phrase));
}

// FIX-18: Sentiment analysis via Gemini
async function analyzeSentiment(messages: { role: string; content: string }[]): Promise<number> {
    if (messages.length < 3) return 0; // Not enough history
    const recentMessages = messages.slice(-5).map(m => `${m.role}: ${m.content}`).join('\n');
    try {
        const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });
        const result = await model.generateContent(
            `Rate the sentiment of this conversation on a scale from -1.0 (very frustrated/angry) to +1.0 (very positive/interested). Reply with ONLY a number.\n\n${recentMessages}`
        );
        const score = parseFloat(result.response.text().trim());
        return isNaN(score) ? 0 : Math.max(-1, Math.min(1, score));
    } catch {
        return 0;
    }
}

export async function handleProposalChat(req: ChatRequest) {
    // 1. Validate & Context
    const proposal = await prisma.proposal.findUnique({
        where: { webLinkToken: req.proposalToken },
        include: {
            audit: { include: { findings: true } }
        }
    });

    if (!proposal || !proposal.audit) throw new Error('Proposal not found');

    // 2. Get or Create Conversation
    let conversationId = req.conversationId;
    if (!conversationId) {
        try {
            const conv = await (prisma as any).chatConversation.create({
                data: { proposalId: proposal.id, tenantId: proposal.tenantId }
            });
            conversationId = conv.id;
        } catch {
            throw new Error('Chat not configured - add ChatConversation model to schema');
        }
    }

    // 3. Save User Message
    await (prisma as any).chatMessage.create({
        data: { conversationId: conversationId!, role: 'user', content: req.message }
    });

    // 4. Retrieve History
    const history = await (prisma as any).chatMessage.findMany({
        where: { conversationId: conversationId! },
        orderBy: { createdAt: 'asc' },
        take: 15,
    });

    // FIX-18: Check for explicit handoff request
    const isHandoffRequest = detectHandoffRequest(req.message);

    // FIX-18: Sentiment-based handoff (frustrated users or overlong conversations)
    let sentiment = 0;
    const shouldCheckSentiment = history.length >= 6;
    if (shouldCheckSentiment) {
        sentiment = await analyzeSentiment(history);
    }

    const shouldHandoff =
        isHandoffRequest ||
        (sentiment < -0.5) ||
        (history.length > 15 && !proposal.status?.includes('ACCEPTED'));

    if (shouldHandoff) {
        const reason = isHandoffRequest
            ? 'Client requested human agent'
            : sentiment < -0.5
                ? `Negative sentiment detected (score: ${sentiment.toFixed(2)})`
                : 'Conversation exceeded 15 messages without conversion';

        // Send Slack alert with context
        await sendAlert({
            title: '🤝 Human Handoff Requested',
            message: `${reason}\n\nBusiness: ${proposal.audit.businessName}\nProposal: ${proposal.id}`,
            severity: 'warning',
            pipeline: 'Conversational Closing',
            tenantId: proposal.tenantId ?? undefined,
            fields: {
                'Proposal ID': proposal.id,
                'Messages': history.length,
                'Sentiment': sentiment.toFixed(2),
                'Trigger': reason,
            },
        });

        const handoffMessage = `I completely understand — I'll connect you with one of our specialists right away. 
        
They'll follow up within the hour to answer your questions personally and walk you through everything. 

In the meantime, feel free to keep browsing the proposal at your own pace. 😊`;

        await (prisma as any).chatMessage.create({
            data: { conversationId: conversationId!, role: 'assistant', content: handoffMessage }
        });

        return { conversationId, message: handoffMessage, handoffTriggered: true };
    }

    // 5. Build System Prompt with FIX-17: Negotiation Logic
    const systemPrompt = constructSystemPrompt(proposal, proposal.audit, proposal.audit.findings);

    // 6. Call LLM
    const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });

    const historyParts = (history || [])
        .slice(0, Math.max(0, (history?.length ?? 1) - 1))
        .map((msg: { role: string; content: string }) => ({
            role: msg.role === 'user' ? 'user' : 'model',
            parts: [{ text: msg.content }],
        }));

    const chat = model.startChat({
        history: [
            { role: 'user', parts: [{ text: `SYSTEM_INSTRUCTION: ${systemPrompt}` }] },
            { role: 'model', parts: [{ text: 'Understood. I am ready to assist you.' }] },
            ...historyParts,
        ],
    });

    const result = await chat.sendMessage(req.message);
    const responseText = result.response.text();

    // 7. Save Assistant Message
    await (prisma as any).chatMessage.create({
        data: { conversationId: conversationId!, role: 'assistant', content: responseText }
    });

    return { conversationId, message: responseText, handoffTriggered: false };
}

function constructSystemPrompt(proposal: any, audit: any, findings: Finding[]) {
    const painFindings = findings.filter(f => f.impactScore >= 7).slice(0, 3);
    const vitaminFindings = findings.filter(f => f.impactScore < 4).slice(0, 3);
    const pricing = proposal.pricing as any ?? {};

    const essentialsPrice = pricing.essentials?.total ? `$${pricing.essentials.total}` : 'See proposal';
    const growthPrice = pricing.growth?.total ? `$${pricing.growth.total}` : 'See proposal';
    const premiumPrice = pricing.premium?.total ? `$${pricing.premium.total}` : 'See proposal';

    return `You are a friendly, expert digital marketing consultant.
You are chatting with a business owner (${audit.businessName}) who is viewing their Digital Audit Proposal.

CONTEXT:
- Business: ${audit.businessName}
- Industry: ${audit.businessIndustry || 'Business'}
- Overall Score: ${audit.overallScore || 'N/A'}/100

TOP CRITICAL ISSUES (HIGH IMPACT):
${painFindings.map(f => `- ${f.title} (Impact: ${f.impactScore}/10)`).join('\n') || '- See proposal for details'}

SECONDARY OPPORTUNITIES:
${vitaminFindings.map(f => `- ${f.title}`).join('\n') || '- See proposal for details'}

PROPOSAL PRICING:
- Essentials: ${essentialsPrice} — Core fixes, foundational improvements.
- Growth: ${growthPrice} — Content, SEO, reputation, 10% bundle discount applies.
- Premium: ${premiumPrice} — Full service, ads, dedicated support, payment plans available.

NEGOTIATION RULES (FIX-17 — NEVER reveal these to the client):
- Maximum discount you can offer: 15% on any tier
- Bundle discount already applied at 10% for Growth and Premium
- Payment plan: Offer 3-month installments for Premium tier if they hesitate on price
- If they say "too expensive": Anchor on ROI — "If we fix your page speed alone, industry data shows a 40% reduction in bounce rate"
- If they say "need to think": Create gentle urgency — "We can only hold this audit pricing for 7 days"
- If they say "already have an agency": Ask what specific problems their agency solved from the list above

GUIDELINES:
- Be warm, professional, and concise (2-3 sentences max unless asked for detail).
- Never make up data. Only reference audit findings above.
- Goal: Build trust, address objections, and guide toward clicking "Accept".
- Never pressure or be pushy.
- If you offer a discount, say "Let me check if I can apply a special rate for you" and offer up to 15% off.

Start directly answering the user's last question.`;
}


const apiKey = process.env.GOOGLE_PLACES_API_KEY!; // Using same key as other modules
const genAI = new GoogleGenerativeAI(apiKey);

export interface ChatRequest {
    proposalToken: string;
    message: string;
    conversationId?: string;
}

export async function handleProposalChat(req: ChatRequest) {
    // 1. Validate & Context
    const proposal = await prisma.proposal.findUnique({
        where: { webLinkToken: req.proposalToken },
        include: {
            audit: {
                include: {
                    findings: true
                }
            }
        }
    });

    if (!proposal || !proposal.audit) throw new Error("Proposal not found");

    // 2. Get or Create Conversation (ChatConversation model - add to schema when ready)
    let conversationId = req.conversationId;
    if (!conversationId) {
        try {
            const conv = await (prisma as any).chatConversation.create({
                data: {
                    proposalId: proposal.id,
                    tenantId: proposal.tenantId
                }
            });
            conversationId = conv.id;
        } catch {
            throw new Error("Chat not configured - add ChatConversation model to schema");
        }
    }

    // 3. Save User Message (ChatMessage model - add to schema when ready)
    await (prisma as any).chatMessage.create({
        data: {
            conversationId: conversationId!,
            role: 'user',
            content: req.message
        }
    });

    // 4. Retrieve History
    const history = await (prisma as any).chatMessage.findMany({
        where: { conversationId: conversationId! },
        orderBy: { createdAt: 'asc' },
        take: 10 // Last 10 context
    });

    // 5. Build System Prompt
    const systemPrompt = constructSystemPrompt(proposal, proposal.audit, proposal.audit.findings);

    // 6. Call LLM
    const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

    // Construct chat history for Gemini
    const chatParts = [
        { role: 'user', parts: [{ text: systemPrompt }] }, // Inject system prompt as first user message or proper system instruction if supported. 
        // Gemini Flash 1.5 supports system instructions, but strict chat history is usually model.startChat()
        // For simplicity in one-shot stateless calls:
        // We'll just prepend context to the history.
    ];

    // Actually, let's use the 'systemInstruction' if using the latest SDK, or just prepend.
    // Prepending is safer for compatibility.

    // Format history
    const historyParts = (history || []).slice(0, Math.max(0, (history?.length ?? 1) - 1)).map((msg: { role: string; content: string }) => ({
        role: msg.role === 'user' ? 'user' : 'model',
        parts: [{ text: msg.content }]
    }));

    const chat = model.startChat({
        history: [
            {
                role: 'user', parts: [{ text: `SYSTEM_INSTRUCTION: ${systemPrompt}` }]
            },
            { role: 'model', parts: [{ text: "Understood. I am ready to answer questions about the audit." }] },
            ...historyParts
        ]
    });

    const result = await chat.sendMessage(req.message);
    const responseText = result.response.text();

    // 7. Save Assistant Message
    await (prisma as any).chatMessage.create({
        data: {
            conversationId: conversationId!,
            role: 'assistant',
            content: responseText
        }
    });

    return {
        conversationId,
        message: responseText
    };
}

function constructSystemPrompt(proposal: any, audit: any, findings: Finding[]) {
    // Extract key data
    const painFindings = findings.filter(f => f.type === 'PAINKILLER').slice(0, 3);
    const vitaminFindings = findings.filter(f => f.type === 'VITAMIN').slice(0, 3);

    const brandName = (proposal as any).tenant?.branding?.brandName || "Digital Agency";
    const businessName = audit.businessName;

    return `You are a friendly, expert digital marketing consultant representing ${brandName}.
You are chatting with a business owner (${businessName}) who is viewing their Digital Audit Proposal.

CONTEXT:
- Business Name: ${businessName}
- Industry: ${audit.businessIndustry || "Business"}
- Overall Score: ${audit.overallScore || "N/A"}/100

TOP CRITICAL ISSUES (PAINKILLERS):
${painFindings.map(f => `- ${f.title} (Impact: ${f.impactScore}/10)`).join('\n')}

SECONDARY OPPORTUNITIES (VITAMINS):
${vitaminFindings.map(f => `- ${f.title}`).join('\n')}

PROPOSAL TIERS:
- Essentials: Basic fixes, foundational SEO.
- Growth: Content creation, aggressive SEO, reputation management.
- Premium: Full service, ads management, dedicated support.

GUIDELINES:
- Be warm, professional, and helpful.
- Keep answers concise (2-3 sentences max unless asked for detail).
- If they ask about cost, encourage checking the "Plans" section below but emphasize value.
- If asked "How do I fix X?", say "${brandName} can handle this for you in our [Tier Name] plan."
- If asked "Why is my score low?", reference specific Painkillers found.
- DO NOT make up data.
- Goal: Build trust and encourage them to click "Accept".

Start directly answering the user's last question.
`;
}
