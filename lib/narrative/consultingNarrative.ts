import { GoogleGenerativeAI } from '@google/generative-ai';
import { traceable } from 'langsmith/traceable';
import { logger } from '@/lib/logger';
import { Finding } from '@/lib/modules/types';
import fs from 'fs';
import path from 'path';

interface NarrativeInput {
    businessName: string;
    city: string;
    industry: string;
    findings: Finding[];
    competitorData?: any;
    evidenceSnapshots?: any[];
}

interface ConsultingNarrative {
    executiveOverview: string;
    clusterDeepDives: Array<{
        clusterName: string;
        narrative: string;
    }>;
    competitivePositioning: string;
    opportunitySummary: string;
}

interface QualityMetrics {
    hasMetricReferences: boolean;
    avgSentenceLength: number;
    hasPassiveVoice: boolean;
    fleschKincaidGrade: number;
    passesQA: boolean;
    issues: string[];
}

/**
 * Generate consulting-grade narrative from audit findings
 */
export async function generateConsultingNarrative(
    input: NarrativeInput
): Promise<ConsultingNarrative> {
    logger.info({ businessName: input.businessName }, '[Narrative] Generating consulting narrative');

    const apiKey = process.env.GOOGLE_AI_API_KEY;
    if (!apiKey) {
        throw new Error('GOOGLE_AI_API_KEY not configured');
    }

    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: 'gemini-1.5-pro' }); // Pro for quality

    // Generate executive overview
    const executiveOverview = await generateExecutiveOverview(model, input);

    // Generate cluster deep dives
    const clusterDeepDives = await generateClusterDeepDives(model, input);

    // Generate competitive positioning
    const competitivePositioning = await generateCompetitivePositioning(model, input);

    // Generate opportunity summary
    const opportunitySummary = await generateOpportunitySummary(model, input);

    // Validate quality
    const overviewQuality = validateQuality(executiveOverview);
    const opportunityQuality = validateQuality(opportunitySummary);

    if (!overviewQuality.passesQA) {
        logger.warn({ issues: overviewQuality.issues }, '[Narrative] Executive overview failed QA');
    }

    logger.info({ businessName: input.businessName }, '[Narrative] Consulting narrative generated');

    return {
        executiveOverview,
        clusterDeepDives,
        competitivePositioning,
        opportunitySummary,
    };
}

/**
 * Generate executive overview
 */
const generateExecutiveOverview = traceable(
    async (model: any, input: NarrativeInput): Promise<string> => {
        // Load prompt template
        const promptTemplate = loadPromptTemplate('exec-overview-v2.txt');

        // Prepare findings summary
        const painkiller = input.findings.filter(f => f.type === 'PAINKILLER');
        const findingsSummary = painkiller.slice(0, 5).map(f =>
            `- ${f.title}: ${f.description} (Impact: ${f.impactScore}/10)`
        ).join('\n');

        // Extract key metrics
        const keyMetrics = extractKeyMetrics(input.findings);

        // Prepare competitor data
        const competitorSummary = input.competitorData
            ? summarizeCompetitorData(input.competitorData)
            : 'No competitor data available';

        // Fill template
        const prompt = promptTemplate
            .replace(/{business_name}/g, input.businessName)
            .replace(/{city}/g, input.city)
            .replace(/{industry}/g, input.industry)
            .replace(/{findings_summary}/g, findingsSummary)
            .replace(/{key_metrics}/g, keyMetrics)
            .replace(/{competitor_data}/g, competitorSummary);

        const result = await model.generateContent(prompt);
        const text = result.response.text().trim();

        // Add inline evidence references
        return addEvidenceReferences(text, input);
    },
    { name: 'generate_executive_overview', run_type: 'llm' }
);

/**
 * Generate cluster deep dives
 */
const generateClusterDeepDives = traceable(
    async (model: any, input: NarrativeInput): Promise<Array<{ clusterName: string; narrative: string }>> => {
        const promptTemplate = loadPromptTemplate('cluster-deep-dive-v2.txt');

        // Group findings by category (cluster)
        const clusters = groupFindingsByClusters(input.findings);

        const deepDives: Array<{ clusterName: string; narrative: string }> = [];

        for (const [clusterName, findings] of Object.entries(clusters)) {
            // Only generate deep dives for clusters with PAINKILLER findings
            const painkillers = findings.filter(f => f.type === 'PAINKILLER');
            if (painkillers.length === 0) continue;

            const findingsText = painkillers.map(f =>
                `- ${f.title}: ${f.description} (Impact: ${f.impactScore}/10)`
            ).join('\n');

            const evidenceItems = painkillers
                .flatMap(f => f.evidence || [])
                .slice(0, 10)
                .map(e => `- ${e.label}: ${e.value}`)
                .join('\n');

            const prompt = promptTemplate
                .replace(/{cluster_name}/g, clusterName)
                .replace(/{findings}/g, findingsText)
                .replace(/{evidence_items}/g, evidenceItems)
                .replace(/{business_name}/g, input.businessName);

            const result = await model.generateContent(prompt);
            const narrative = result.response.text().trim();

            deepDives.push({
                clusterName,
                narrative: addEvidenceReferences(narrative, input),
            });
        }

        return deepDives;
    },
    { name: 'generate_cluster_deep_dives', run_type: 'llm' }
);

/**
 * Generate competitive positioning summary
 */
const generateCompetitivePositioning = traceable(
    async (model: any, input: NarrativeInput): Promise<string> => {
        const promptTemplate = loadPromptTemplate('competitive-summary-v2.txt');

        const competitors = input.competitorData?.competitors || [];
        const competitorsList = competitors.map((c: any) => c.name).join(', ');

        const comparisonMatrix = input.competitorData?.comparisonMatrix
            ? JSON.stringify(input.competitorData.comparisonMatrix, null, 2)
            : 'No comparison data available';

        const keyDifferentiators = input.competitorData?.keyDifferentiators || 'None identified';

        const prompt = promptTemplate
            .replace(/{business_name}/g, input.businessName)
            .replace(/{competitors}/g, competitorsList)
            .replace(/{comparison_matrix}/g, comparisonMatrix)
            .replace(/{key_differentiators}/g, keyDifferentiators);

        const result = await model.generateContent(prompt);
        return result.response.text().trim();
    },
    { name: 'generate_competitive_positioning', run_type: 'llm' }
);

/**
 * Generate opportunity summary
 */
const generateOpportunitySummary = traceable(
    async (model: any, input: NarrativeInput): Promise<string> => {
        const promptTemplate = loadPromptTemplate('opportunity-summary-v2.txt');

        // Calculate total estimated value
        const totalValue = estimateMonthlyValue(input.findings);

        // Prioritize findings by impact and effort
        const prioritizedFindings = input.findings
            .filter(f => f.type === 'PAINKILLER')
            .sort((a, b) => {
                // Sort by impact desc, then effort asc
                if (b.impactScore !== a.impactScore) {
                    return b.impactScore - a.impactScore;
                }
                const effortOrder = { LOW: 1, MEDIUM: 2, HIGH: 3 };
                return effortOrder[a.effortEstimate || 'MEDIUM'] - effortOrder[b.effortEstimate || 'MEDIUM'];
            })
            .slice(0, 8)
            .map((f, i) => `Priority ${i + 1}: ${f.title} (Impact: ${f.impactScore}/10, Effort: ${f.effortEstimate})`)
            .join('\n');

        // Identify quick wins
        const quickWins = input.findings
            .filter(f => f.effortEstimate === 'LOW' && f.impactScore >= 5)
            .map(f => f.title)
            .join(', ');

        const prompt = promptTemplate
            .replace(/{total_estimated_value}/g, `$${totalValue.toLocaleString()}`)
            .replace(/{prioritized_findings}/g, prioritizedFindings)
            .replace(/{quick_wins}/g, quickWins || 'None identified')
            .replace(/{business_name}/g, input.businessName);

        const result = await model.generateContent(prompt);
        const text = result.response.text().trim();

        return addEvidenceReferences(text, input);
    },
    { name: 'generate_opportunity_summary', run_type: 'llm' }
);

/**
 * Load prompt template from file
 */
function loadPromptTemplate(filename: string): string {
    const promptPath = path.join(process.cwd(), 'prompts', filename);

    try {
        return fs.readFileSync(promptPath, 'utf-8');
    } catch (error) {
        logger.error({ error, filename }, '[Narrative] Failed to load prompt template');
        throw new Error(`Prompt template not found: ${filename}`);
    }
}

/**
 * Extract key metrics from findings
 */
function extractKeyMetrics(findings: Finding[]): string {
    const metrics: string[] = [];

    findings.forEach(finding => {
        if (finding.metrics) {
            Object.entries(finding.metrics).forEach(([key, value]) => {
                if (typeof value === 'number') {
                    metrics.push(`${key}: ${value}`);
                }
            });
        }
    });

    return metrics.slice(0, 10).join('\n');
}

/**
 * Summarize competitor data
 */
function summarizeCompetitorData(competitorData: any): string {
    if (!competitorData.competitors || competitorData.competitors.length === 0) {
        return 'No competitor data available';
    }

    return competitorData.competitors.map((c: any) =>
        `${c.name}: ${c.reviewCount || 0} reviews, ${c.rating || 'N/A'} stars`
    ).join('\n');
}

/**
 * Group findings by clusters (category)
 */
function groupFindingsByClusters(findings: Finding[]): Record<string, Finding[]> {
    const clusters: Record<string, Finding[]> = {};

    findings.forEach(finding => {
        const category = finding.category || 'Other';
        if (!clusters[category]) {
            clusters[category] = [];
        }
        clusters[category].push(finding);
    });

    return clusters;
}

/**
 * Estimate monthly value from findings
 */
function estimateMonthlyValue(findings: Finding[]): number {
    // Simple estimation based on impact scores
    // High impact (8-10): $1000-1500/month
    // Medium impact (5-7): $500-800/month
    // Low impact (1-4): $100-300/month

    let totalValue = 0;

    findings.forEach(finding => {
        if (finding.impactScore >= 8) {
            totalValue += 1200; // Average $1200
        } else if (finding.impactScore >= 5) {
            totalValue += 650; // Average $650
        } else {
            totalValue += 200; // Average $200
        }
    });

    return Math.round(totalValue / 100) * 100; // Round to nearest $100
}

/**
 * Add inline evidence references to narrative
 */
function addEvidenceReferences(text: string, input: NarrativeInput): string {
    // This is a simplified version - in production, you'd match specific claims to evidence
    // For now, we'll just ensure the narrative structure is correct
    return text;
}

/**
 * Validate narrative quality
 */
function validateQuality(text: string): QualityMetrics {
    const issues: string[] = [];

    // Check for metric references (numbers)
    const hasMetricReferences = /\d+/.test(text);
    if (!hasMetricReferences) {
        issues.push('No numeric metrics referenced');
    }

    // Calculate average sentence length
    const sentences = text.split(/[.!?]+/).filter(s => s.trim().length > 0);
    const words = text.split(/\s+/);
    const avgSentenceLength = words.length / sentences.length;

    if (avgSentenceLength > 25) {
        issues.push(`Average sentence length too high: ${avgSentenceLength.toFixed(1)} words`);
    }

    // Check for passive voice (simplified)
    const passiveIndicators = text.match(/\b(was|were|been|being)\s+\w+ed\b/gi) || [];
    const hasPassiveVoice = passiveIndicators.length > 2;
    if (hasPassiveVoice) {
        issues.push(`Passive voice detected: ${passiveIndicators.length} instances`);
    }

    // Calculate Flesch-Kincaid (simplified)
    const syllableCount = words.reduce((total, word) => {
        const syllables = word.toLowerCase().match(/[aeiouy]+/g)?.length || 1;
        return total + syllables;
    }, 0);

    const fleschKincaidGrade = (0.39 * avgSentenceLength) + (11.8 * (syllableCount / words.length)) - 15.59;

    if (fleschKincaidGrade < 8 || fleschKincaidGrade > 10) {
        issues.push(`Reading level out of range: grade ${fleschKincaidGrade.toFixed(1)}`);
    }

    const passesQA = issues.length === 0;

    return {
        hasMetricReferences,
        avgSentenceLength: Math.round(avgSentenceLength * 10) / 10,
        hasPassiveVoice,
        fleschKincaidGrade: Math.round(fleschKincaidGrade * 10) / 10,
        passesQA,
        issues,
    };
}
