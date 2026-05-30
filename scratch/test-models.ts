import * as path from 'path';

import { GoogleGenerativeAI } from '@google/generative-ai';
import { config as dotenvConfig } from 'dotenv';

dotenvConfig({ path: path.join(process.cwd(), '.env.local'), override: true });

const apiKey = process.env.GOOGLE_AI_API_KEY;

async function test() {
  if (!apiKey) {
    console.error('GOOGLE_AI_API_KEY is not defined in .env.local');
    return;
  }
  const genAI = new GoogleGenerativeAI(apiKey);
  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`
    );
    if (response.ok) {
      const data = await response.json();
      console.log('=== Available Models ===');
      data.models.slice(0, 30).forEach((m: any) => {
        console.log(
          ` - Name: ${m.name}, DisplayName: ${m.displayName}, SupportedMethods: ${m.supportedGenerationMethods}`
        );
      });
    } else {
      console.error(`Failed to fetch models: ${response.status} ${response.statusText}`);
    }
  } catch (err) {
    console.error('Error testing models:', err);
  }
}

test();
