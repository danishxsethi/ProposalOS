import { prisma } from '@/lib/prisma';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { Proposal, Audit, Finding, FindingType } from '@prisma/client';

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
            },
            tenant: true
        }
    });

    if (!proposal || !proposal.audit) throw new Error("Proposal not found");

    // 2. Get or Create Conversation
    let conversationId = req.conversationId;
    if (!conversationId) {
        const conv = await prisma.chatConversation.create({
            data: {
                proposalId: proposal.id,
                tenantId: proposal.tenantId
            }
        });
        conversationId = conv.id;
    }

    // 3. Save User Message
    await prisma.chatMessage.create({
        data: {
            conversationId: conversationId!,
            role: 'user',
            content: req.message
        }
    });

    // 4. Retrieve History
    const history = await prisma.chatMessage.findMany({
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
    const historyParts = history.slice(0, history.length - 1).map(msg => ({
        role: msg.role === 'user' ? 'user' : 'model',
        parts: [{ text: msg.content }]
    }));

    const chat = model.startChat({
        history: [
            {
                role: 'user', parts: [{ text: \`SYSTEM_INSTRUCTION: \${systemPrompt}\` }] },
            { role: 'model', parts: [{ text: "Understood. I am ready to answer questions about the audit." }] },
            ...historyParts
        ]
    });

    const result = await chat.sendMessage(req.message);
    const responseText = result.response.text();

    // 7. Save Assistant Message
    await prisma.chatMessage.create({
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
    
    const brandName = proposal.tenant?.branding?.brandName || "Digital Agency";
    const businessName = audit.businessName;

    return \`You are a friendly, expert digital marketing consultant representing \${brandName}.
You are chatting with a business owner (\${businessName}) who is viewing their Digital Audit Proposal.

CONTEXT:
- Business Name: \${businessName}
- Industry: \${audit.businessIndustry || "Business"}
- Overall Score: \${audit.overallScore || "N/A"}/100

TOP CRITICAL ISSUES (PAINKILLERS):
\${painFindings.map(f => \`- \${f.title} (Impact: \${f.impactScore}/10)\`).join('\\n')}

SECONDARY OPPORTUNITIES (VITAMINS):
\${vitaminFindings.map(f => \`- \${f.title}\`).join('\\n')}

PROPOSAL TIERS:
- Essentials: Basic fixes, foundational SEO.
- Growth: Content creation, aggressive SEO, reputation management.
- Premium: Full service, ads management, dedicated support.

GUIDELINES:
- Be warm, professional, and helpful.
- Keep answers concise (2-3 sentences max unless asked for detail).
- If they ask about cost, encourage checking the "Plans" section below but emphasize value.
- If asked "How do I fix X?", say "\${brandName} can handle this for you in our [Tier Name] plan."
- If asked "Why is my score low?", reference specific Painkillers found.
- DO NOT make up data.
- Goal: Build trust and encourage them to click "Accept".

Start directly answering the user's last question.
\`;
}
