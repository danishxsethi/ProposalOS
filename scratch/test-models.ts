import * as path from 'path';

import { BedrockRuntimeClient, ConverseCommand } from '@aws-sdk/client-bedrock-runtime';
import { config as dotenvConfig } from 'dotenv';

dotenvConfig({ path: path.join(process.cwd(), '.env.local'), override: true });

async function testBedrockModel() {
  if (process.env.RUN_BEDROCK_MODEL_PROBE !== 'true') {
    console.info('Set RUN_BEDROCK_MODEL_PROBE=true to make one small Bedrock inference request.');
    return;
  }

  const region = process.env.AWS_REGION || process.env.AWS_DEFAULT_REGION || 'us-east-2';
  const modelId = process.env.BEDROCK_FAST_MODEL_ID || 'us.amazon.nova-micro-v1:0';
  const client = new BedrockRuntimeClient({ region, maxAttempts: 1 });

  const result = await client.send(
    new ConverseCommand({
      modelId,
      messages: [{ role: 'user', content: [{ text: 'Reply with the words Bedrock is ready.' }] }],
      inferenceConfig: { maxTokens: 24, temperature: 0 },
    })
  );

  const text =
    result.output?.message?.content
      ?.flatMap((block) => (block.text ? [block.text] : []))
      .join('') ?? '';
  console.info({ region, modelId, text, usage: result.usage }, 'Bedrock probe completed');
}

testBedrockModel().catch((error) => {
  console.error('Bedrock model probe failed:', error);
  process.exitCode = 1;
});
