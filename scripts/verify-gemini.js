#!/usr/bin/env node
/**
 * Quick verification that Google Gemini API is working.
 * Uses GOOGLE_AI_API_KEY from .env.local
 */
require('dotenv').config({ path: '.env.local' });
require('dotenv').config({ path: '.env' });

const API_KEY = process.env.GOOGLE_AI_API_KEY;

async function verify() {
  if (!API_KEY) {
    console.error('❌ GOOGLE_AI_API_KEY not set in .env.local');
    process.exit(1);
  }

  console.log('🔑 Key found:', API_KEY.slice(0, 10) + '...');
  console.log('⏳ Calling Gemini API (gemini-2.5-flash)...');

  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${API_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: 'Say "OK" and nothing else.' }] }],
          generationConfig: { maxOutputTokens: 20 },
        }),
      }
    );

    const data = await res.json();

    if (!res.ok) {
      console.error('❌ API error:', res.status, JSON.stringify(data, null, 2));
      process.exit(1);
    }

    const text = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
    if (text) {
      console.log('✅ Gemini API working. Response:', text);
    } else {
      console.log('⚠️  Received response but no text:', JSON.stringify(data).slice(0, 200));
    }
  } catch (err) {
    console.error('❌ Request failed:', err.message);
    process.exit(1);
  }
}

verify();
