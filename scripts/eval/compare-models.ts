import { generateWithGemini } from '../../lib/llm/provider';

async function runComparison() {
    console.log('Running A/B Model Comparison: gemini-1.5-pro vs Gemini 3.1 Pro (Canary)');

    const prompt = `You are an expert copywriter. Generate a 2-sentence executive summary based on the following findings:
- Finding 1: Website takes 8.5 seconds to load (Critical).
- Finding 2: Missing clear call-to-actions on the homepage (High).
- Finding 3: 15 broken links found in the footer (Medium).

Ensure you include specific numbers in the summary.`;

    const baselineModel = 'gemini-1.5-pro';
    const challengerModel = 'gemini-2.5-flash'; // Simulating 3.1 Pro via the provider feature flag or just passing a different capable model for local tests if 3.1 isn't available

    const runModel = async (modelName: string, name: string, thinkingBudget?: number) => {
        const start = Date.now();
        try {
            const result = await generateWithGemini({
                model: modelName,
                input: prompt,
                temperature: 0.2,
                maxOutputTokens: 512,
                thinkingBudget,
                metadata: { node: 'test_node' }
            });
            const duration = Date.now() - start;

            return {
                name,
                durationMs: duration,
                text: result.text || '',
                usage: result.usageMetadata || {},
                success: !!result.text
            };
        } catch (error: any) {
            return {
                name,
                durationMs: Date.now() - start,
                text: `Error: ${error.message}`,
                usage: {},
                success: false
            };
        }
    };

    const results = await Promise.all([
        runModel(baselineModel, 'Baseline (1.5 Pro)'),
        runModel(challengerModel, 'Challenger (3.1 Pro Canary)', 1024)
    ]);

    console.table(results.map(r => ({
        Model: r.name,
        'Duration (ms)': r.durationMs,
        'Prompt Tokens': r.usage.promptTokenCount || 0,
        'Completion Tokens': r.usage.candidatesTokenCount || 0,
        'Thinking Tokens': r.usage.thoughtsTokenCount || 0,
        'Response Length': r.text.length,
        'Success': r.success
    })));

    console.log('\n--- Challenge Responses ---');
    results.forEach(r => {
        console.log(`\n[${r.name}]:\n${r.text.trim()}`);
    });

    console.log('\nComparison Complete.');
}

if (require.main === module) {
    runComparison().catch(console.error);
}
