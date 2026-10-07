import { BEDROCK_NOVA_2_LITE, BEDROCK_NOVA_MICRO } from '../../lib/config/models';
import { generateWithLLM } from '../../lib/llm/provider';

async function runComparison() {
  console.log('Running Bedrock model comparison: Nova Micro vs Nova 2 Lite');

  const prompt = `You are an expert copywriter. Generate a 2-sentence executive summary based on the following findings:
- Finding 1: Website takes 8.5 seconds to load (Critical).
- Finding 2: Missing clear call-to-actions on the homepage (High).
- Finding 3: 15 broken links found in the footer (Medium).

Ensure you include specific numbers in the summary.`;

  const baselineModel = BEDROCK_NOVA_MICRO;
  const challengerModel = BEDROCK_NOVA_2_LITE;

  const runModel = async (modelName: string, name: string) => {
    const start = Date.now();
    try {
      const result = await generateWithLLM({
        model: modelName,
        input: prompt,
        temperature: 0.2,
        maxOutputTokens: 512,
        metadata: { node: 'test_node' },
      });
      const duration = Date.now() - start;

      return {
        name,
        durationMs: duration,
        text: result.text || '',
        usage: result.usageMetadata || {},
        success: !!result.text,
      };
    } catch (error: any) {
      return {
        name,
        durationMs: Date.now() - start,
        text: `Error: ${error.message}`,
        usage: {},
        success: false,
      };
    }
  };

  const results = await Promise.all([
    runModel(baselineModel, 'Nova Micro (low-cost text)'),
    runModel(challengerModel, 'Nova 2 Lite (multimodal / complex)'),
  ]);

  console.table(
    results.map((r) => ({
      Model: r.name,
      'Duration (ms)': r.durationMs,
      'Prompt Tokens': r.usage.promptTokenCount || 0,
      'Completion Tokens': r.usage.candidatesTokenCount || 0,
      'Response Length': r.text.length,
      Success: r.success,
    }))
  );

  console.log('\n--- Challenge Responses ---');
  results.forEach((r) => {
    console.log(`\n[${r.name}]:\n${r.text.trim()}`);
  });

  console.log('\nComparison Complete.');
}

if (require.main === module) {
  runComparison().catch(console.error);
}
