import { GoogleGenerativeAI } from '@google/generative-ai';
import { traceable } from 'langsmith/traceable';
import { logger } from '@/lib/logger';
import { CostTracker } from '@/lib/costs/costTracker';
import { Finding } from '@/lib/modules/types';

export interface ActionPlanInput {
    businessName: string;
    industry: string;
    city: string;
    findings: Finding[];
}

export interface ActionItem {
    id: string;
    phase: 'PHASE 1: QUICK WINS' | 'PHASE 2: FOUNDATIONS' | 'PHASE 3: GROWTH';
    title: string;
    description: string;
    reason: string;
    timeEstimate: string;
    costEstimate: '$0' | '$' | '$$' | '$$$';
    impact: string;
    priority: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';
    tier: 'ESSENTIALS' | 'GROWTH' | 'PREMIUM';
}

export interface ActionPlan {
    phases: {
        phase1: ActionItem[];
        phase2: ActionItem[];
        phase3: ActionItem[];
    };
    rawJson: any;
}

/**
 * Generate 90-Day Action Plan
 */
export async function generateActionPlan(
    input: ActionPlanInput,
    tracker?: CostTracker
): Promise<ActionPlan> {
    logger.info({ businessName: input.businessName }, '[ActionPlan] Generating 90-day plan');

    if (!process.env.GOOGLE_AI_API_KEY) {
        throw new Error('GOOGLE_AI_API_KEY is missing');
    }

    const genAI = new GoogleGenerativeAI(process.env.GOOGLE_AI_API_KEY);
    const model = genAI.getGenerativeModel({ model: 'gemini-1.5-pro' }); // Pro for complex logic

    tracker?.addApiCall('GEMINI_ACTION_PLAN');

    // Summarize Findings for Prompt (limit tokens)
    const findingsSummary = input.findings
        .map(f => `- ${f.type} (${f.category}): ${f.title} (Impact: ${f.impactScore})`)
        .slice(0, 15) // Top 15 findings
        .join('\n');

    const prompt = `You are a senior digital marketing consultant creating a 90-day action plan for ${input.businessName}, a ${input.industry} in ${input.city}.

    Based on these audit findings:
    ${findingsSummary}

    Create a detailed, step-by-step implementation plan organized into 3 phases.
    
    PHASE 1: QUICK WINS (Week 1-2)
    - Actions in <1 hour each
    - Zero/Low cost
    - Immediate impact (e.g., reply to reviews, fix H1)

    PHASE 2: FOUNDATIONS (Week 3-6)
    - Core improvements
    - Moderate effort (e.g., speed opt, local landing pages)

    PHASE 3: GROWTH (Week 7-12)
    - Strategic long-term activities
    - Content strategy, link building

    Return a JSON object with keys: "phase1", "phase2", "phase3".
    Each value is an ARRAY of objects with:
    {
        "title": "Action Title",
        "description": "Specific instruction (1-2 sentences)",
        "reason": "Why this matters (reference finding)",
        "timeEstimate": "e.g. 30 mins",
        "costEstimate": "$0" or "$" or "$$" or "$$$",
        "impact": "Expected metric improvement",
        "priority": "CRITICAL" | "HIGH" | "MEDIUM" | "LOW"
    }

    BE SPECIFIC. Do not say "Optimize SEO". Say "Add '${input.city}' to homepage title tag".`;

    try {
        const result = await model.generateContent(prompt);
        const text = result.response.text();
        const cleanJson = text.replace(/```json|```/g, '').trim();
        const rawPlan = JSON.parse(cleanJson);

        // Map to Tiers
        const mapTier = (phase: string): 'ESSENTIALS' | 'GROWTH' | 'PREMIUM' => {
            if (phase === 'phase1') return 'ESSENTIALS';
            if (phase === 'phase2') return 'GROWTH';
            return 'PREMIUM';
        };

        const processItems = (items: any[], phaseName: string) => {
            return items.map((item, idx) => ({
                id: `${phaseName}-${idx}`,
                phase: phaseName === 'phase1' ? 'PHASE 1: QUICK WINS' :
                    phaseName === 'phase2' ? 'PHASE 2: FOUNDATIONS' : 'PHASE 3: GROWTH',
                ...item,
                tier: mapTier(phaseName)
            }));
        };

        return {
            phases: {
                phase1: processItems(rawPlan.phase1 || [], 'phase1'),
                phase2: processItems(rawPlan.phase2 || [], 'phase2'),
                phase3: processItems(rawPlan.phase3 || [], 'phase3'),
            },
            rawJson: rawPlan
        };

    } catch (error) {
        logger.error({ error }, '[ActionPlan] Generation failed');
        // Fallback or empty plan
        return {
            phases: { phase1: [], phase2: [], phase3: [] },
            rawJson: {}
        };
    }
}
