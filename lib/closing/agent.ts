import { StateGraph, START, END } from '@langchain/langgraph';
import { BaseMessage, HumanMessage, AIMessage } from '@langchain/core/messages';
import { generateWithGemini } from '@/lib/llm/provider';
import { ConversationMemory } from './memory';
import { detectObjection } from './objections';
import { prisma } from '@/lib/prisma';
import { calculateFindingROI } from '@/lib/proposal/roiCalculator';

export interface ClosingState {
    proposalId: string;
    sessionId: string;
    businessName: string;
    prospectContext: string;
    messages: BaseMessage[];
    lastSentiment: number;
    escalated: boolean;
    agentResponse: string;
}

const graphState = {
    proposalId: { value: (x: string, y: string) => y ?? x, default: () => "" },
    sessionId: { value: (x: string, y: string) => y ?? x, default: () => "" },
    businessName: { value: (x: string, y: string) => y ?? x, default: () => "" },
    prospectContext: { value: (x: string, y: string) => y ?? x, default: () => "" },
    messages: { value: (x: BaseMessage[], y: BaseMessage[]) => x.concat(y), default: () => [] },
    lastSentiment: { value: (x: number, y: number) => y ?? x, default: () => 0 },
    escalated: { value: (x: boolean, y: boolean) => y ?? x, default: () => false },
    agentResponse: { value: (x: string, y: string) => y ?? x, default: () => "" },
};

async function resolveTemplatePlaceholders(template: string, proposalId: string): Promise<string> {
    if (!template.includes('[')) return template; // Fast exit if no placeholders

    try {
        const proposal = await prisma.proposal.findUnique({
            where: { id: proposalId },
            include: { audit: { include: { findings: true } } }
        });

        if (!proposal || !proposal.audit) return template;

        let resolved = template;
        const findings = proposal.audit.findings;
        const industry = proposal.audit.businessIndustry || 'default';

        // Find a critical finding for [PAIN_POINT] and [ROI_CALC]
        const sortedFindings = [...findings].sort((a: any, b: any) => b.impactScore - a.impactScore);
        const criticalFinding = sortedFindings[0];

        if (resolved.includes('[ROI_CALC]') || resolved.includes('[SAVINGS]')) {
            const { calculateTierROI } = await import('@/lib/proposal/roiCalculator');

            // Extract currently selected tier or default to 'growth'
            const price = (proposal.pricing as any)?.growth ?? 1500;
            const tierFindingsIds = (proposal.tierGrowth as any)?.findingIds || [];
            const tierFindings = findings.filter(f => tierFindingsIds.includes(f.id));

            // Fallback to top 5 findings if tier mappings are missing
            const targetFindings = tierFindings.length > 0 ? tierFindings : sortedFindings.slice(0, 5);

            const roi = calculateTierROI(targetFindings, price, industry, findings);

            resolved = resolved.replace('[ROI_CALC]', `Your estimated ROI is ${Math.round(roi.ratio * 100)}% over 12 months based on ${targetFindings.length} issues identified`);
            resolved = resolved.replace('[SAVINGS]', `$${roi.totalMonthlyValue.toLocaleString()}/mo`);
        }

        if (resolved.includes('[COMPETITOR_DATA]')) {
            const compReport = (proposal.comparisonReport as any)?.competitors || [];
            if (compReport.length > 0) {
                const compNames = compReport.slice(0, 3).map((c: any) => c.name).join(', ');
                resolved = resolved.replace('[COMPETITOR_DATA]', `Compared against top competitors like ${compNames}`);
            } else {
                resolved = resolved.replace('[COMPETITOR_DATA]', 'Compared against local industry benchmarks');
            }
        }

        if (resolved.includes('[TIMELINE]')) {
            resolved = resolved.replace('[TIMELINE]', '4 weeks (Growth Tier average)');
        }

        if (resolved.includes('[PAIN_SCORE]')) {
            const painScore = (proposal.audit as any).painScore || (proposal.audit.overallScore ? 100 - proposal.audit.overallScore : 60);
            resolved = resolved.replace('[PAIN_SCORE]', `${painScore}/100`);
        }

        if (criticalFinding) {
            resolved = resolved.replace('[PAIN_POINT]', criticalFinding.title);
            resolved = resolved.replace('[FINDING_METRICS]', `${criticalFinding.impactScore}/10 impact`);
            resolved = resolved.replace('[CRITICAL_FINDING]', criticalFinding.title);

            // Fallback if needed
            resolved = resolved.replace('[MONTHLY_LOSS]', `$${(criticalFinding.impactScore * 150).toLocaleString()}/mo`); // very rough fallback
        }

        return resolved;
    } catch (e) {
        console.error('Error resolving template placeholders:', e);
        return template;
    }
}

async function processInput(state: ClosingState) {
    const lastMessage = state.messages[state.messages.length - 1];
    if (!(lastMessage instanceof HumanMessage)) return state;

    const text = lastMessage.content as string;

    // Check for explicit hard objections via heuristic library first
    const objection = detectObjection(text);
    if (objection) {
        let responseTemplate = objection.strategicResponseTemplate;

        // Task 3: Fix Closing Agent ROI Logic
        responseTemplate = await resolveTemplatePlaceholders(responseTemplate, state.proposalId);

        await ConversationMemory.logObjection(
            state.proposalId,
            objection.category,
            text,
            responseTemplate,
            objection.requiresEscalation
        );

        const sentimentDelta = objection.requiresEscalation ? -0.5 : -0.2;
        await ConversationMemory.updateSentiment(state.proposalId, sentimentDelta);

        return {
            ...state,
            escalated: objection.requiresEscalation,
            agentResponse: responseTemplate,
            lastSentiment: state.lastSentiment + sentimentDelta
        };
    }

    // Default engagement metric boost and slight sentiment decay if no objection
    await ConversationMemory.updateSentiment(state.proposalId, 0.05);

    return state;
}

const customizationTools = [
    {
        functionDeclarations: [
            {
                name: "updateProposalTier",
                description: "Modifies parameters on a target tier. Used when prospect wants to alter scope or pricing.",
                parameters: {
                    type: "OBJECT",
                    properties: {
                        tierId: { type: "STRING", description: "The tier to update ('essentials', 'growth', 'premium')" },
                        price: { type: "NUMBER", description: "The new price" },
                        timeline: { type: "STRING", description: "The new timeline" }
                    },
                    required: ["tierId"]
                }
            },
            {
                name: "applyDiscount",
                description: "Applies a capped discount to a specific tier (max 20%).",
                parameters: {
                    type: "OBJECT",
                    properties: {
                        tierId: { type: "STRING", description: "The tier to update ('essentials', 'growth', 'premium')" },
                        discountPercent: { type: "NUMBER", description: "The discount to apply (1-20)" },
                        reason: { type: "STRING", description: "Reason for the discount" }
                    },
                    required: ["tierId", "discountPercent", "reason"]
                }
            },
            {
                name: "selectTierForProspect",
                description: "Marks a tier as the prospect's chosen plan when they agree to move forward.",
                parameters: {
                    type: "OBJECT",
                    properties: {
                        tierId: { type: "STRING", description: "The tier to choose ('essentials', 'growth', 'premium')" }
                    },
                    required: ["tierId"]
                }
            }
        ]
    }
];

async function executeCustomizationTool(toolCall: any, state: ClosingState) {
    const { name, args } = toolCall;

    // Validate proposal access implicitly
    const proposal = await prisma.proposal.findUnique({ where: { id: state.proposalId } });
    if (!proposal) throw new Error("Proposal not found");

    let actionNotes = "";

    if (name === 'updateProposalTier') {
        const { tierId, price, timeline } = args;
        actionNotes = `Modified ${tierId} tier. New Price: ${price}, Timeline: ${timeline}.`;

        // Log to db notes
        await prisma.proposal.update({
            where: { id: state.proposalId },
            data: { status: 'DRAFT', notes: (proposal.notes || '') + '\n' + actionNotes }
        });
        return `Successfully updated ${tierId} tier parameters.`;
    }

    if (name === 'applyDiscount') {
        const { tierId, discountPercent, reason } = args;
        if (discountPercent > 20) return "Discount capped at 20%. Validation failed.";

        actionNotes = `Discount of ${discountPercent}% applied to ${tierId}. Reason: ${reason}`;
        await prisma.proposal.update({
            where: { id: state.proposalId },
            data: { status: 'DRAFT', notes: (proposal.notes || '') + '\n' + actionNotes }
        });
        return `Successfully applied ${discountPercent}% discount to ${tierId}.`;
    }

    if (name === 'selectTierForProspect') {
        const { tierId } = args;
        await prisma.proposal.update({
            where: { id: state.proposalId },
            data: { tierChosen: tierId, status: 'ACCEPTED' } // Move to accepted
        });
        return `Successfully marked ${tierId} as the chosen tier.`;
    }

    return "Unknown tool";
}

async function generateResponse(state: ClosingState) {
    if (state.escalated && !!state.agentResponse) {
        return state;
    }
    if (!!state.agentResponse) {
        return state;
    }

    const systemPrompt = `You are a Senior Strategic Advisor at Proposal Engine.
You are chatting with a prospect from ${state.businessName}.
Context from their audit:
${state.prospectContext}

Your goal: Handle their questions respectfully, cite the audit findings backed by ROI math, and guide them toward accepting the proposal. Do not be pushy. Keep answers under 2 paragraphs. If they request a specific change, affirm that you can accommodate it within the appropriate tier and use the provided tools to execute the change real-time. Do not lie if a tool call fails.`;

    let chatHistoryStr = state.messages.map(m => {
        if (m instanceof HumanMessage) return `Prospect: ${m.content}`;
        if (m instanceof AIMessage) return `Advisor: ${m.content}`;
        return '';
    }).join('\n');

    let currentPrompt = `${systemPrompt}\n\nChat History:\n${chatHistoryStr}\n\nAdvisor:`;

    // Adaptive recursive tool loop
    for (let i = 0; i < 3; i++) {
        const response = await generateWithGemini({
            model: process.env.LLM_MODEL_PROPOSAL || 'gemini-2.5-flash',
            input: currentPrompt,
            temperature: 0.4,
            tools: customizationTools
        });

        if (response.functionCalls && response.functionCalls.length > 0) {
            const fc = response.functionCalls[0];
            try {
                const toolResult = await executeCustomizationTool(fc, state);
                currentPrompt += `\n[Tool Executed]: ${fc.name}(${JSON.stringify(fc.args)})\n[System Result]: ${toolResult}\nAdvisor:`;
            } catch (e: any) {
                currentPrompt += `\n[Tool Exception]: ${e.message}\nAdvisor:`;
            }
        } else if (response.text) {
            return { ...state, agentResponse: response.text };
        } else {
            return { ...state, agentResponse: "I encountered an error processing that request." };
        }
    }

    return {
        ...state,
        agentResponse: "I'm having trouble executing these changes right now. Let me pass this to a strategist."
    };
}

function routeAfterInput(state: ClosingState) {
    if (state.escalated || state.lastSentiment < -0.6) {
        return "escalation_handler";
    }
    return "generate_response";
}

async function escalationHandler(state: ClosingState) {
    let text = state.agentResponse;
    if (!text || !state.escalated) {
        text = "I want to make sure you get the best support possible. Let me have our Lead Strategist review this and reach out directly.";
    }
    return { ...state, agentResponse: text, escalated: true };
}

export const closingGraph = new StateGraph<ClosingState>({
    channels: graphState,
})
    .addNode("process_input", processInput)
    .addNode("generate_response", generateResponse)
    .addNode("escalation_handler", escalationHandler)
    .addEdge(START, "process_input")
    .addConditionalEdges("process_input", routeAfterInput)
    .addEdge("generate_response", END)
    .addEdge("escalation_handler", END)
    .compile();

export async function runClosingAgent(proposalId: string, sessionId: string, businessName: string, prospectContext: string, newProspectMessage: string) {
    // Reconstruct conversation or initialize state first
    await ConversationMemory.getOrCreateSession(proposalId, sessionId);

    // Save human message into initialized db row and grab fresh state
    const updatedState = await ConversationMemory.addMessage(proposalId, { role: 'user', text: newProspectMessage, timestamp: new Date().toISOString() });

    // Explicit typing workaround for JSON objects from Prisma
    const historyData = (updatedState.history as unknown as Array<{ role: string, text: string }>) || [];
    const messages: BaseMessage[] = historyData.map(m =>
        m.role === 'user' ? new HumanMessage(m.text) : new AIMessage(m.text)
    );

    const initialState: ClosingState = {
        proposalId,
        sessionId,
        businessName,
        prospectContext,
        messages,
        lastSentiment: updatedState.sentimentScore,
        escalated: updatedState.escalated,
        agentResponse: ""
    };

    const result = await closingGraph.invoke(initialState as any) as unknown as ClosingState;

    // Save AI response
    if (result.agentResponse) {
        await ConversationMemory.addMessage(proposalId, { role: 'agent', text: result.agentResponse, timestamp: new Date().toISOString() });
    }

    return {
        reply: result.agentResponse,
        escalated: result.escalated,
        sentiment: result.lastSentiment
    };
}
