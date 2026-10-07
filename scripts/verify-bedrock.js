#!/usr/bin/env node
/**
 * Read-only verification of ProposalOS Bedrock inference profiles.
 * Calls GetInferenceProfile through the AWS CLI and never invokes a model.
 */
const { spawnSync } = require('node:child_process');
require('dotenv').config({ path: '.env.local' });
require('dotenv').config({ path: '.env' });

const region = process.env.AWS_REGION || process.env.AWS_DEFAULT_REGION || 'us-east-2';
const modelIds = [
  process.env.BEDROCK_FAST_MODEL_ID || 'us.amazon.nova-micro-v1:0',
  process.env.BEDROCK_MODEL_ID || 'us.amazon.nova-2-lite-v1:0',
];

function verifyProfile(modelId) {
  const result = spawnSync(
    'aws',
    [
      'bedrock',
      'get-inference-profile',
      '--inference-profile-identifier',
      modelId,
      '--region',
      region,
      '--output',
      'json',
    ],
    { encoding: 'utf8' }
  );

  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(result.stderr.trim() || `AWS CLI exited with status ${result.status}`);
  }

  const profile = JSON.parse(result.stdout);
  if (profile.status !== 'ACTIVE') {
    throw new Error(`${modelId} returned status ${profile.status || 'unknown'}`);
  }
  console.log(`✅ ${modelId}: ${profile.status} in ${region}`);
}

try {
  if (process.env.LLM_PRIMARY_PROVIDER && process.env.LLM_PRIMARY_PROVIDER !== 'bedrock') {
    throw new Error('LLM_PRIMARY_PROVIDER is not set to bedrock');
  }
  for (const modelId of [...new Set(modelIds)]) verifyProfile(modelId);
  console.log('Verified using read-only profile calls; no inference or model usage charges were triggered.');
} catch (error) {
  console.error(`❌ Bedrock profile verification failed: ${error.message}`);
  process.exit(1);
}
