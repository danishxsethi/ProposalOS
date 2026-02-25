import { AuditModuleResult, Finding } from './types';
import { logger } from '@/lib/logger';
import { CostTracker } from '@/lib/costs/costTracker';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { traceable } from 'langsmith/traceable';
import * as cheerio from 'cheerio';

export interface ContentQualityModuleInput {
    url: string;
    businessName: string;
    industry: string;
    city: string;
    crawledPages?: Array<{
        url: string;
        html: string;
        title?: string;
    }>;
}

interface PageContentAnalysis {
    url: string;
    clarity: number;
    specificity: number;
    localRelevance: number;
    trustBuilding: number;
    callToAction: number;
    readability: number;
    overallScore: number;
}

interface ReadabilityMetrics {
    fleschKincaidGrade: number;
    avgSentenceLength: number;
    avgWordLength: number;
    passiveVoicePercentage: number;
    totalWordCount: number;
}

interface ContentAnalysis {
    pages: PageContentAnalysis[];
    primaryValueProp: string;
    contentGaps: string[];
    strongestPage: string;
    weakestPage: string;
    topRecommendations: string[];
    readabilityMetrics: ReadabilityMetrics;
}

/**
 * Run content quality analysis module
 */
export async function runContentQualityModule(
    input: ContentQualityModuleInput,
    tracker?: CostTracker
): Promise<AuditModuleResult> {
    logger.info({ url: input.url }, '[ContentQuality] Starting content analysis');

    try {
        // Extract text from crawled pages
        const pageTexts = extractPageTexts(input.crawledPages || []);

        if (pageTexts.length === 0) {
            throw new Error('No page content available for analysis');
        }

        // Analyze content with Gemini
        tracker?.addApiCall('GEMINI');
        const aiAnalysis = await analyzeContentWithAI(pageTexts, input);

        // Calculate readability metrics
        const readabilityMetrics = calculateReadabilityMetrics(pageTexts);

        // Combine analyses
        const fullAnalysis: ContentAnalysis = {
            ...aiAnalysis,
            readabilityMetrics,
        };

        // Generate findings
        const findings = generateContentFindings(fullAnalysis, input, pageTexts);

        const evidenceSnapshot = {
            module: 'content_quality',
            source: 'gemini_analysis',
            rawResponse: fullAnalysis,
            collectedAt: new Date(),
        };

        logger.info({
            url: input.url,
            pagesAnalyzed: pageTexts.length,
            contentGaps: aiAnalysis.contentGaps.length,
            findingsCount: findings.length,
        }, '[ContentQuality] Analysis complete');

        return {
            findings,
            evidenceSnapshots: [evidenceSnapshot],
        };

    } catch (error) {
        logger.error({ error, url: input.url }, '[ContentQuality] Analysis failed');

        return {
            findings: [{
                type: 'VITAMIN',
                category: 'Conversion',
                title: 'Content Analysis Unavailable',
                description: 'Unable to complete content quality analysis. This may indicate API issues or missing page content.',
                impactScore: 1,
                confidenceScore: normalizeConfidence(50, '0-100'),
                evidence: [],
                metrics: {},
                effortEstimate: 'LOW',
                recommendedFix: ['Try running content analysis again later'],
            }],
            evidenceSnapshots: [],
        };
    }
}

/**
 * Extract visible text from crawled pages
 */
function extractPageTexts(crawledPages: Array<{ url: string; html: string; title?: string }>): Array<{ url: string; text: string; title: string }> {
    const pageTexts: Array<{ url: string; text: string; title: string }> = [];

    // Take homepage + top 5 pages
    const pagesToAnalyze = crawledPages.slice(0, 6);

    pagesToAnalyze.forEach(page => {
        try {
            const $ = cheerio.load(page.html);

            // Remove script, style, nav, footer
            $('script, style, nav, footer, [role="navigation"]').remove();

            // Get visible text from body
            const bodyText = $('body').text()
                .replace(/\s+/g, ' ') // Normalize whitespace
                .trim();

            const title = page.title || $('title').text() || $('h1').first().text() || 'Untitled';

            if (bodyText.length > 50) {
                pageTexts.push({
                    url: page.url,
                    text: bodyText,
                    title,
                });
            }
        } catch (error) {
            logger.warn({ error, url: page.url }, '[ContentQuality] Failed to extract text');
        }
    });

    return pageTexts;
}

/**
 * Analyze content with Gemini AI
 */
const analyzeContentWithAI = traceable(
    async (
        pageTexts: Array<{ url: string; text: string; title: string }>,
        input: ContentQualityModuleInput
    ): Promise<Omit<ContentAnalysis, 'readabilityMetrics'>> => {
        const apiKey = process.env.GOOGLE_AI_API_KEY;
        if (!apiKey) {
            throw new Error('GOOGLE_AI_API_KEY not configured');
        }

        const genAI = new GoogleGenerativeAI(apiKey);
        const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });

        // Build content summary for prompt
        const contentSummary = pageTexts.map((page, index) => {
            const preview = page.text.slice(0, 1500); // First 1500 chars
            return `\n\nPAGE ${index + 1}: ${page.title}\nURL: ${page.url}\nCONTENT:\n${preview}`;
        }).join('\n---');

        const prompt = `Analyze this business website content for a ${input.industry} business in ${input.city}.

${contentSummary}

For each page listed above, score 1-10 on:
- Clarity: Is the value proposition clear within 5 seconds?
- Specificity: Does it mention specific services, areas served, credentials?
- Local relevance: Does it mention the city/region, local landmarks, community?
- Trust building: Does it include credentials, experience, guarantees?
- Call to action: Is there a clear next step for visitors?
- Readability: Is it written for a general audience (not jargon-heavy)?

Also identify:
- The primary value proposition (1 sentence summary)
- Missing content gaps (what a customer would want to know but can't find)
- Strongest page (which page has best content)
- Weakest page (which page needs most improvement)
- Top 3 specific improvement recommendations

Return as structured JSON with this exact format:
{
  "pages": [
    {
      "url": "page url",
      "clarity": 1-10,
      "specificity": 1-10,
      "localRelevance": 1-10,
      "trustBuilding": 1-10,
      "callToAction": 1-10,
      "readability": 1-10,
      "overallScore": average of above
    }
  ],
  "primaryValueProp": "one sentence value proposition",
  "contentGaps": ["gap 1", "gap 2", "gap 3"],
  "strongestPage": "url of strongest page",
  "weakestPage": "url of weakest page",
  "topRecommendations": ["recommendation 1", "recommendation 2", "recommendation 3"]
}`;

        const result = await model.generateContent(prompt);
        const response = result.response.text();

        // Extract JSON from response
        const jsonMatch = response.match(/\{[\s\S]*\}/);
        if (!jsonMatch) {
            throw new Error('Failed to parse AI response as JSON');
        }

        const analysis = JSON.parse(jsonMatch[0]);

        return analysis;
    },
    { name: 'analyze_content_with_ai', run_type: 'llm' }
);

/**
 * Calculate readability metrics
 */
function calculateReadabilityMetrics(pageTexts: Array<{ url: string; text: string }>): ReadabilityMetrics {
    // Combine all page text for overall metrics
    const allText = pageTexts.map(p => p.text).join(' ');

    // Count words
    const words = allText.split(/\s+/).filter(w => w.length > 0);
    const totalWordCount = words.length;

    // Count sentences
    const sentences = allText.split(/[.!?]+/).filter(s => s.trim().length > 0);
    const sentenceCount = sentences.length;

    // Count syllables (simplified - count vowel groups)
    const syllableCount = words.reduce((total, word) => {
        const syllables = word.toLowerCase().match(/[aeiouy]+/g)?.length || 1;
        return total + syllables;
    }, 0);

    // Calculate Flesch-Kincaid Grade Level
    // Formula: 0.39 * (total words / total sentences) + 11.8 * (total syllables / total words) - 15.59
    const avgWordsPerSentence = totalWordCount / sentenceCount;
    const avgSyllablesPerWord = syllableCount / totalWordCount;
    const fleschKincaidGrade = (0.39 * avgWordsPerSentence) + (11.8 * avgSyllablesPerWord) - 15.59;

    // Average sentence length
    const avgSentenceLength = totalWordCount / sentenceCount;

    // Average word length
    const avgWordLength = words.reduce((sum, w) => sum + w.length, 0) / totalWordCount;

    // Passive voice detection (simplified - look for "was", "were", "been", "being" + past participle)
    const passiveIndicators = allText.match(/\b(was|were|been|being)\s+\w+ed\b/gi) || [];
    const passiveVoicePercentage = (passiveIndicators.length / sentenceCount) * 100;

    return {
        fleschKincaidGrade: Math.round(fleschKincaidGrade * 10) / 10,
        avgSentenceLength: Math.round(avgSentenceLength * 10) / 10,
        avgWordLength: Math.round(avgWordLength * 10) / 10,
        passiveVoicePercentage: Math.round(passiveVoicePercentage),
        totalWordCount,
    };
}

/**
 * Generate findings from content analysis
 */
function generateContentFindings(
    analysis: ContentAnalysis,
    input: ContentQualityModuleInput,
    pageTexts: Array<{ url: string; text: string; title: string }>
): Finding[] {
    const findings: Finding[] = [];

    const homepage = pageTexts.find(p => p.url === input.url || p.url.endsWith('/'));
    const homepageAnalysis = analysis.pages.find(p => p.url === homepage?.url);

    // PAINKILLER: No clear value proposition on homepage
    if (homepageAnalysis && homepageAnalysis.clarity < 5) {
        findings.push({
            type: 'PAINKILLER',
            category: 'Conversion',
            title: 'Unclear Value Proposition',
            description: `Homepage fails to clearly communicate what the business does within 5 seconds (clarity score: ${homepageAnalysis.clarity}/10). Confused visitors leave immediately.`,
            impactScore: 8,
            confidenceScore: normalizeConfidence(90, '0-100'),
            evidence: [{
                type: 'text',
                value: `AI-detected value prop: "${analysis.primaryValueProp}"`,
                label: 'Value Proposition'
            }, {
                type: 'metric',
                value: homepageAnalysis.clarity,
                label: 'Clarity Score'
            }],
            metrics: {
                clarityScore: homepageAnalysis.clarity,
            },
            effortEstimate: 'MEDIUM',
            recommendedFix: [
                'Add clear headline stating what you do and who you serve',
                'Use subheadline to explain key benefit',
                'Place value prop above the fold',
                `Recommended: "${analysis.topRecommendations[0]}"`,
            ]
        });
    }

    // PAINKILLER: Homepage too thin (<100 words)
    if (homepage && homepage.text.split(/\s+/).length < 100) {
        findings.push({
            type: 'PAINKILLER',
            category: 'Conversion',
            title: 'Homepage Content Too Thin',
            description: `Homepage has only ${homepage.text.split(/\s+/).length} words. Thin content provides no value to visitors and hurts SEO rankings.`,
            impactScore: 7,
            confidenceScore: normalizeConfidence(100, '0-100'),
            evidence: [{
                type: 'metric',
                value: homepage.text.split(/\s+/).length,
                label: 'Homepage Word Count'
            }],
            metrics: {
                homepageWordCount: homepage.text.split(/\s+/).length,
            },
            effortEstimate: 'MEDIUM',
            recommendedFix: [
                'Expand homepage to 300-500 words minimum',
                'Add sections: Services, About, Why Choose Us, Service Areas',
                'Include customer testimonials',
                'Explain your unique selling proposition',
            ]
        });
    }

    // PAINKILLER: No mention of city/location
    if (homepageAnalysis && homepageAnalysis.localRelevance < 4) {
        findings.push({
            type: 'PAINKILLER',
            category: 'Conversion',
            title: 'No Local Relevance on Homepage',
            description: `Homepage barely mentions ${input.city} or local service area (local relevance score: ${homepageAnalysis.localRelevance}/10). Critical for local SEO and building trust.`,
            impactScore: 7,
            confidenceScore: normalizeConfidence(90, '0-100'),
            evidence: [{
                type: 'metric',
                value: homepageAnalysis.localRelevance,
                label: 'Local Relevance Score'
            }],
            metrics: {
                localRelevanceScore: homepageAnalysis.localRelevance,
            },
            effortEstimate: 'LOW',
            recommendedFix: [
                `Mention "${input.city}" in headline or first paragraph`,
                'List specific neighborhoods or service areas',
                'Add "Serving [City] since [Year]"',
                'Include local landmarks or community references',
                'Add service area map',
            ]
        });
    }

    // VITAMIN: Reading level too high (>grade 10)
    if (analysis.readabilityMetrics.fleschKincaidGrade > 10) {
        findings.push({
            type: 'VITAMIN',
            category: 'Conversion',
            title: 'Content Too Complex for General Audience',
            description: `Reading level is grade ${analysis.readabilityMetrics.fleschKincaidGrade} (college level). Local business content should be grade 6-8 for maximum accessibility.`,
            impactScore: 5,
            confidenceScore: normalizeConfidence(95, '0-100'),
            evidence: [{
                type: 'metric',
                value: analysis.readabilityMetrics.fleschKincaidGrade,
                label: 'Flesch-Kincaid Grade'
            }, {
                type: 'metric',
                value: analysis.readabilityMetrics.avgSentenceLength,
                label: 'Avg Sentence Length'
            }],
            metrics: {
                readingGrade: analysis.readabilityMetrics.fleschKincaidGrade,
                avgSentenceLength: analysis.readabilityMetrics.avgSentenceLength,
            },
            effortEstimate: 'MEDIUM',
            recommendedFix: [
                'Shorten sentences (aim for 15-20 words per sentence)',
                'Use simpler words and everyday language',
                'Break up long paragraphs',
                'Avoid industry jargon',
                'Use tools like Hemingway Editor to simplify',
            ]
        });
    }

    // VITAMIN: No services page or services not listed
    const hasServicesPage = pageTexts.some(p =>
        p.url.toLowerCase().includes('service') ||
        p.title.toLowerCase().includes('service')
    );
    const servicesGap = analysis.contentGaps.some(gap =>
        gap.toLowerCase().includes('service')
    );

    if (!hasServicesPage || servicesGap) {
        findings.push({
            type: 'VITAMIN',
            category: 'Conversion',
            title: 'Services Not Clearly Listed',
            description: 'Website lacks a dedicated services page or does not clearly list all services offered. Customers can\'t find what they need.',
            impactScore: 6,
            confidenceScore: normalizeConfidence(85, '0-100'),
            evidence: analysis.contentGaps.filter(g => g.toLowerCase().includes('service')).slice(0, 2).map(gap => ({
                type: 'text',
                value: gap,
                label: 'Content Gap'
            })),
            metrics: {
                hasServicesPage,
            },
            effortEstimate: 'MEDIUM',
            recommendedFix: [
                'Create dedicated Services page',
                'List all services with descriptions',
                'Include pricing or pricing ranges if possible',
                'Add service-specific CTAs',
            ]
        });
    }

    // VITAMIN: No about/team page
    const hasAboutPage = pageTexts.some(p =>
        p.url.toLowerCase().includes('about') ||
        p.title.toLowerCase().includes('about')
    );

    if (!hasAboutPage) {
        findings.push({
            type: 'VITAMIN',
            category: 'Conversion',
            title: 'No About or Team Page',
            description: 'Website lacks an About page. Customers want to know who they\'re working with — this builds trust and credibility.',
            impactScore: 4,
            confidenceScore: normalizeConfidence(90, '0-100'),
            evidence: [{
                type: 'text',
                value: 'No About/Team page detected',
                label: 'About Page'
            }],
            metrics: {
                hasAboutPage: false,
            },
            effortEstimate: 'MEDIUM',
            recommendedFix: [
                'Create About Us page',
                'Include founder/owner story',
                'Add team photos and bios',
                'Mention years in business',
                'List certifications and credentials',
            ]
        });
    }

    // VITAMIN: No mention of credentials/experience
    const avgTrustScore = analysis.pages.reduce((sum, p) => sum + p.trustBuilding, 0) / analysis.pages.length;

    if (avgTrustScore < 5) {
        findings.push({
            type: 'VITAMIN',
            category: 'Conversion',
            title: 'Missing Credentials and Trust Signals',
            description: `Content lacks trust-building elements (average trust score: ${Math.round(avgTrustScore)}/10). No mention of licenses, certifications, experience, or guarantees.`,
            impactScore: 5,
            confidenceScore: normalizeConfidence(85, '0-100'),
            evidence: [{
                type: 'metric',
                value: Math.round(avgTrustScore),
                label: 'Average Trust Score'
            }],
            metrics: {
                avgTrustScore: Math.round(avgTrustScore),
            },
            effortEstimate: 'LOW',
            recommendedFix: [
                'Add years in business to homepage',
                'List licenses and certifications',
                'Include satisfaction guarantee or warranty',
                'Add industry affiliations (BBB, trade associations)',
                'Display awards or recognition',
            ]
        });
    }

    // VITAMIN: Content gaps identified by AI
    if (analysis.contentGaps.length > 0) {
        const topGaps = analysis.contentGaps.slice(0, 3);

        findings.push({
            type: 'VITAMIN',
            category: 'Conversion',
            title: 'Critical Content Gaps Detected',
            description: `AI identified ${analysis.contentGaps.length} important content gaps. Customers can't find key information they need to make a decision.`,
            impactScore: analysis.contentGaps.length > 3 ? 6 : 4,
            confidenceScore: normalizeConfidence(85, '0-100'),
            evidence: topGaps.map(gap => ({
                type: 'text',
                value: gap,
                label: 'Content Gap'
            })),
            metrics: {
                contentGapCount: analysis.contentGaps.length,
                contentGaps: topGaps,
            },
            effortEstimate: 'MEDIUM',
            recommendedFix: [
                ...topGaps.map(gap => `Add: ${gap}`),
                'Review competitor websites for inspiration',
                'Survey customers to identify common questions',
            ]
        });
    }

    return findings;
}
