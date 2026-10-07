#!/usr/bin/env node
/**
 * API Key Validation Script
 * Tests all required API keys before running audits
 */

require('dotenv').config({ path: '.env.local' });

const tests = {
  database: false,
  lighthouseRuntime: false,
  serp: false,
  bedrockConfig: false,
};

async function testDatabase() {
  console.log('\n🗄️  Testing Database Connection...');
  try {
    const { PrismaClient } = require('@prisma/client');
    const prisma = new PrismaClient();

    await prisma.$connect();
    const count = await prisma.audit.count();
    console.log(`   ✅ Database connected (${count} audits in DB)`);
    await prisma.$disconnect();
    return true;
  } catch (error) {
    console.log(`   ❌ Database failed: ${error.message}`);
    return false;
  }
}

function testLighthouseRuntime() {
  console.log('\n🚦 Checking local Lighthouse runtime...');
  try {
    const [major, minor] = process.versions.node.split('.').map(Number);
    if (major < 22 || (major === 22 && minor < 19)) {
      throw new Error('Node.js 22.19 or newer is required');
    }
    require.resolve('lighthouse');
    require.resolve('puppeteer-core');
    require.resolve('@sparticuz/chromium');
    console.log('   ✅ Local Lighthouse and Chromium packages are available');
    return true;
  } catch (error) {
    console.log(`   ❌ Lighthouse runtime unavailable: ${error.message}`);
    return false;
  }
}

async function testSerp() {
  console.log('\n🔍 Testing SerpAPI...');
  try {
    const key = process.env.SERP_API_KEY;
    if (!key) throw new Error('SERP_API_KEY not set');

    const params = new URLSearchParams({
      engine: 'google',
      q: 'test',
      api_key: key,
    });

    const response = await fetch(`https://serpapi.com/search?${params}`);

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`API returned ${response.status}: ${error}`);
    }

    const data = await response.json();
    if (data.error) {
      throw new Error(data.error);
    }

    console.log(
      `   ✅ SerpAPI working (${data.search_metadata?.total_results || 'results found'})`
    );
    return true;
  } catch (error) {
    console.log(`   ❌ SerpAPI failed: ${error.message}`);
    return false;
  }
}

async function testBedrockConfig() {
  console.log('\n🤖 Checking Amazon Bedrock configuration...');
  try {
    if (process.env.LLM_PRIMARY_PROVIDER !== 'bedrock') {
      throw new Error('LLM_PRIMARY_PROVIDER must be set to bedrock');
    }
    if (process.env.BEDROCK_ENABLED !== 'true') {
      throw new Error('BEDROCK_ENABLED must be true');
    }
    if (!(process.env.AWS_REGION || process.env.AWS_DEFAULT_REGION)) {
      throw new Error('AWS_REGION or AWS_DEFAULT_REGION must be set');
    }

    console.log('   ✅ Bedrock configuration present (no model inference sent)');
    return true;
  } catch (error) {
    console.log(`   ❌ Bedrock configuration incomplete: ${error.message}`);
    return false;
  }
}

async function runAllTests() {
  console.log('🧪 API Key Validation\n');
  console.log('━'.repeat(50));

  tests.database = await testDatabase();
  tests.lighthouseRuntime = testLighthouseRuntime();
  tests.serp = await testSerp();
  tests.bedrockConfig = await testBedrockConfig();

  console.log('\n' + '━'.repeat(50));
  console.log('\n📊 RESULTS:\n');

  const results = Object.entries(tests);
  const passed = results.filter(([_, v]) => v).length;
  const failed = results.length - passed;

  results.forEach(([name, status]) => {
    const icon = status ? '✅' : '❌';
    const label = name.charAt(0).toUpperCase() + name.slice(1);
    console.log(`${icon} ${label.padEnd(20)} ${status ? 'PASS' : 'FAIL'}`);
  });

  console.log(`\n${passed}/${results.length} tests passed`);

  if (failed > 0) {
    console.log('\n⚠️  Some API keys are not configured correctly.');
    console.log('Please fix the failed tests before running audits.\n');
    process.exit(1);
  } else {
    console.log('\n✅ All API keys validated successfully!\n');
    process.exit(0);
  }
}

runAllTests();
