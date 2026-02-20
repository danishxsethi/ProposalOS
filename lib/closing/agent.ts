import { StateGraph, START, END } from '@langchain/langgraph';
import { BaseMessage, HumanMessage, AIMessage } from '@langchain/core/messages';
import { generateWithGemini } from '@/lib/llm/provider';
import { ConversationMemory } from './memory';
import { detectObjection } from './objections';

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

async function processInput(state: ClosingState) {
    const lastMessage = state.messages[state.messages.length - 1];
    if (!(lastMessage instanceof HumanMessage)) return state;

    const text = lastMessage.content as string;

    // Check for explicit hard objections via heuristic library first
    const objection = detectObjection(text);
    if (objection) {
        await ConversationMemory.logObjection(
            state.proposalId,
            objection.category,
            text,
            objection.strategicResponseTemplate,
            objection.requiresEscalation
        );

        const sentimentDelta = objection.requiresEscalation ? -0.5 : -0.2;
        await ConversationMemory.updateSentiment(state.proposalId, sentimentDelta);

        return {
            escalated: objection.requiresEscalation,
            agentResponse: objection.strategicResponseTemplate,
            lastSentiment: state.lastSentiment + sentimentDelta
        };
    }

    // Default engagement metric boost and slight sentiment decay if no objection
    await ConversationMemory.updateSentiment(state.proposalId, 0.05);

    return { ...state };
}

async function generateResponse(state: ClosingState) {
    if (state.escalated && !!state.agentResponse) {
        return state;
    }
    if (!!state.agentResponse) {
        // We already have a templated response from processInput (e.g. non-escalated template)
        return state;
    }

    const systemPrompt = `You are a Senior Strategic Advisor at Proposal Engine.
You are chatting with a prospect from ${state.businessName}.
Context from their audit:
${state.prospectContext}

Your goal: Handle their questions respectfully, cite the audit findings backed by ROI math, and guide them toward accepting the proposal. Do not be pushy. Keep answers under 2 paragraphs. If they request a specific change, affirm that you can accommodate it within the appropriate tier.`;

    const chatHistory = state.messages.map(m => {
        if (m instanceof HumanMessage) return `Prospect: ${m.content}`;
        if (m instanceof AIMessage) return `Advisor: ${m.content}`;
        return '';
    }).join('\n');

    const prompt = `${systemPrompt}\n\nChat History:\n${chatHistory}\n\nAdvisor:`;

    const response = await generateWithGemini({
        model: process.env.LLM_MODEL_PROPOSAL || 'gemini-2.5-flash',
        input: prompt,
        temperature: 0.4,
    });

    return {
        agentResponse: response.text
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
    return { agentResponse: text, escalated: true };
}

export const closingGraph = new StateGraph({ channels: graphState })
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

    const result = await closingGraph.invoke(initialState);

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
