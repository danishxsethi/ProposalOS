#!/usr/bin/env node
/**
 * API Key Validation Script
 * Tests all required API keys before running audits
 */

require('dotenv').config({ path: '.env.local' });

const tests = {
    database: false,
    pageSpeed: false,
    places: false,
    serp: false,
    vertexAI: false,
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

async function testPageSpeed() {
    console.log('\n🚀 Testing PageSpeed Insights API...');
    try {
        const key = process.env.GOOGLE_PAGESPEED_API_KEY;
        if (!key) throw new Error('GOOGLE_PAGESPEED_API_KEY not set');

        const url = 'https://www.google.com';
        const response = await fetch(
            `https://www.googleapis.com/pagespeedonline/v5/runPagespeed?url=${url}&key=${key}&strategy=mobile&category=performance`
        );

        if (!response.ok) {
            const error = await response.text();
            throw new Error(`API returned ${response.status}: ${error}`);
        }

        const data = await response.json();
        const score = Math.round((data.lighthouseResult?.categories?.performance?.score || 0) * 100);
        console.log(`   ✅ PageSpeed API working (test score: ${score}/100)`);
        return true;
    } catch (error) {
        console.log(`   ❌ PageSpeed failed: ${error.message}`);
        return false;
    }
}

async function testPlaces() {
    console.log('\n📍 Testing Google Places API...');
    try {
        const key = process.env.GOOGLE_PLACES_API_KEY;
        if (!key) throw new Error('GOOGLE_PLACES_API_KEY not set');

        const response = await fetch('https://places.googleapis.com/v1/places:searchText', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-Goog-Api-Key': key,
                'X-Goog-FieldMask': 'places.name,places.id',
            },
            body: JSON.stringify({
                textQuery: 'Google Sydney',
                maxResultCount: 1,
            }),
        });

        if (!response.ok) {
            const error = await response.text();
            throw new Error(`API returned ${response.status}: ${error}`);
        }

        const data = await response.json();
        if (data.places && data.places.length > 0) {
            console.log(`   ✅ Places API working (found: ${data.places[0].name})`);
            return true;
        } else {
            throw new Error('No results returned');
        }
    } catch (error) {
        console.log(`   ❌ Places failed: ${error.message}`);
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

        console.log(`   ✅ SerpAPI working (${data.search_metadata?.total_results || 'results found'})`);
        return true;
    } catch (error) {
        console.log(`   ❌ SerpAPI failed: ${error.message}`);
        return false;
    }
}

async function testVertexAI() {
    console.log('\n🤖 Testing Vertex AI (Gemini)...');
    try {
        const projectId = process.env.GCP_PROJECT_ID;
        const region = process.env.GCP_REGION || 'us-central1';

        if (!projectId) throw new Error('GCP_PROJECT_ID not set');

        const { VertexAI } = require('@google-cloud/vertexai');
        const vertexAI = new VertexAI({ project: projectId, location: region });
        const model = vertexAI.getGenerativeModel({
            model: 'gemini-2.0-flash',
            generationConfig: { temperature: 0, maxOutputTokens: 50 },
        });

        const result = await model.generateContent('Say "Hello" in one word');
        const response = result.response;
        const text = response.candidates?.[0]?.content?.parts?.[0]?.text || '';

        console.log(`   ✅ Vertex AI working (response: "${text.trim()}")`);
        return true;
    } catch (error) {
        console.log(`   ❌ Vertex AI failed: ${error.message}`);
        console.log(`      Check: gcloud auth application-default login`);
        return false;
    }
}

async function runAllTests() {
    console.log('🧪 API Key Validation\n');
    console.log('━'.repeat(50));

    tests.database = await testDatabase();
    tests.pageSpeed = await testPageSpeed();
    tests.places = await testPlaces();
    tests.serp = await testSerp();
    tests.vertexAI = await testVertexAI();

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
