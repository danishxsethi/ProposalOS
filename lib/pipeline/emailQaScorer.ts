/**
 * Email QA Scorer — Enhanced quality gate for outreach emails
 * 
 * Extends lib/email/qualityCheck.ts with additional scoring dimensions:
 * - Reading level (target: 5th grade)
 * - Word count (target: < 80 words)
 * - Jargon detection (target: zero jargon terms)
 * - Finding reference count (target: >= 2 specific findings)
 * - Spam risk (target: low spam trigger density)
 * 
 * Returns composite score (0-100) with dimension breakdown and improvement suggestions.
 * 
 * Requirements: 5.1, 5.2, 5.3, 5.4
 */

import type { EmailQAConfig, EmailQAResult, GeneratedEmail } from './types';

// ============================================================================
// Default Configuration
// ============================================================================

export const DEFAULT_EMAIL_QA_CONFIG: EmailQAConfig = {
  maxReadingGradeLevel: 5,
  maxWordCount: 80,
  minFindingReferences: 2,
  maxSpamRiskScore: 30,
  minQualityScore: 90,
  jargonWordList: [
    // Technical jargon
    'optimization', 'implementation', 'infrastructure', 'architecture',
    'scalability', 'bandwidth', 'latency', 'throughput', 'algorithm',
    'framework', 'methodology', 'paradigm', 'synergy', 'leverage',
    'utilize', 'facilitate', 'streamline', 'optimize', 'maximize',
    // Marketing jargon
    'best-in-class', 'cutting-edge', 'state-of-the-art', 'world-class',
    'industry-leading', 'revolutionary', 'game-changing', 'disruptive',
    'innovative', 'next-generation', 'enterprise-grade', 'mission-critical',
    // SEO/Web jargon
    'meta tags', 'schema markup', 'canonical', 'robots.txt', 'sitemap.xml',
    'core web vitals', 'lighthouse score', 'cumulative layout shift',
    'first contentful paint', 'time to interactive', 'DOM', 'API',
  ],
  dimensionWeights: {
    readability: 25,
    wordCount: 20,
    jargon: 20,
    findingRefs: 20,
    spamRisk: 15,
  },
};

// Spam trigger words (from existing qualityCheck.ts, expanded)
const SPAM_TRIGGER_WORDS = [
  'free', 'guaranteed', 'act now', 'limited time', 'don\'t miss',
  'last chance', 'hurry', 'urgent', 'immediately', 'instant',
  'no obligation', 'risk-free', '100% free', 'winner', 'congratulations',
  'you\'ve been selected', 'claim now', 'click here', 'buy now',
  'order now', 'call now', 'subscribe now', 'sign up now',
  'limited offer', 'exclusive deal', 'special promotion', 'act fast',
  'don\'t wait', 'expires soon', 'today only', 'while supplies last',
];

// ============================================================================
// Reading Level Calculation (Flesch-Kincaid Grade Level)
// ============================================================================

/**
 * Calculate Flesch-Kincaid Grade Level
 * Formula: 0.39 * (total words / total sentences) + 11.8 * (total syllables / total words) - 15.59
 */
function calculateReadingGradeLevel(text: string): number {
  const sentences = text.split(/[.!?]+/).filter(s => s.trim().length > 0);
  const words = text.split(/\s+/).filter(w => w.trim().length > 0);
  
  if (sentences.length === 0 || words.length === 0) {
    return 0;
  }

  const totalSentences = sentences.length;
  const totalWords = words.length;
  const totalSyllables = words.reduce((sum, word) => sum + countSyllables(word), 0);

  const avgWordsPerSentence = totalWords / totalSentences;
  const avgSyllablesPerWord = totalSyllables / totalWords;

  const gradeLevel = 0.39 * avgWordsPerSentence + 11.8 * avgSyllablesPerWord - 15.59;
  
  return Math.max(0, gradeLevel);
}

/**
 * Count syllables in a word (simplified algorithm)
 */
function countSyllables(word: string): number {
  word = word.toLowerCase().replace(/[^a-z]/g, '');
  if (word.length === 0) return 0;
  if (word.length <= 3) return 1;

  // Count vowel groups
  const vowelGroups = word.match(/[aeiouy]+/g);
  let syllables = vowelGroups ? vowelGroups.length : 1;

  // Adjust for silent 'e' at the end
  if (word.endsWith('e') && syllables > 1) {
    syllables--;
  }

  // Adjust for common patterns
  if (word.endsWith('le') && syllables > 1 && word.length > 2) {
    const beforeLe = word[word.length - 3];
    if (beforeLe && !/[aeiouy]/.test(beforeLe)) {
      syllables++;
    }
  }

  return Math.max(1, syllables);
}

// ============================================================================
// Dimension Scoring Functions
// ============================================================================

/**
 * Score readability dimension (0-100)
 * Target: 5th grade level or below
 */
function scoreReadability(text: string, maxGradeLevel: number): { score: number; gradeLevel: number } {
  const gradeLevel = calculateReadingGradeLevel(text);
  
  // Perfect score if at or below target
  if (gradeLevel <= maxGradeLevel) {
    return { score: 100, gradeLevel };
  }
  
  // Degrade score linearly: lose 10 points per grade level above target
  const excessGrades = gradeLevel - maxGradeLevel;
  const score = Math.max(0, 100 - (excessGrades * 10));
  
  return { score, gradeLevel };
}

/**
 * Score word count dimension (0-100)
 * Target: < 80 words
 */
function scoreWordCount(text: string, maxWords: number): { score: number; count: number } {
  const words = text.split(/\s+/).filter(w => w.trim().length > 0);
  const count = words.length;
  
  // Perfect score if at or below target
  if (count <= maxWords) {
    return { score: 100, count };
  }
  
  // Degrade score: lose 2 points per word over target
  const excessWords = count - maxWords;
  const score = Math.max(0, 100 - (excessWords * 2));
  
  return { score, count };
}

/**
 * Escape special regex characters in a string
 */
function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Score jargon dimension (0-100)
 * Target: zero jargon terms
 */
function scoreJargon(text: string, jargonWordList: string[]): { score: number; termsFound: string[] } {
  const lowerText = text.toLowerCase();
  const termsFound = jargonWordList.filter(term => {
    // Use word boundaries to avoid partial matches
    // Escape special regex characters in the term
    const escapedTerm = escapeRegex(term.toLowerCase());
    const regex = new RegExp(`\\b${escapedTerm}\\b`, 'i');
    return regex.test(lowerText);
  });
  
  // Perfect score if no jargon
  if (termsFound.length === 0) {
    return { score: 100, termsFound: [] };
  }
  
  // Degrade score: lose 15 points per jargon term
  const score = Math.max(0, 100 - (termsFound.length * 15));
  
  return { score, termsFound };
}

/**
 * Score finding references dimension (0-100)
 * Target: >= 2 specific finding references
 */
function scoreFindingReferences(
  email: GeneratedEmail,
  minReferences: number
): { score: number; refsFound: number } {
  const refsFound = email.findingReferences?.length || 0;
  
  // Perfect score if at or above target
  if (refsFound >= minReferences) {
    return { score: 100, refsFound };
  }
  
  // Partial credit: 50 points per reference
  const score = (refsFound / minReferences) * 100;
  
  return { score, refsFound };
}

/**
 * Score spam risk dimension (0-100)
 * Target: low spam trigger word density
 */
function scoreSpamRisk(text: string, maxSpamScore: number): { score: number; triggersFound: string[] } {
  const lowerText = text.toLowerCase();
  const triggersFound = SPAM_TRIGGER_WORDS.filter(trigger => 
    lowerText.includes(trigger.toLowerCase())
  );
  
  // Calculate spam risk score (0-100, higher = more spam)
  const words = text.split(/\s+/).filter(w => w.trim().length > 0);
  const wordCount = words.length || 1;
  const triggerDensity = (triggersFound.length / wordCount) * 100;
  const spamRiskScore = Math.min(100, triggerDensity * 20); // Scale up density
  
  // Invert for scoring: lower spam risk = higher score
  const score = Math.max(0, 100 - spamRiskScore);
  
  return { score, triggersFound };
}

// ============================================================================
// Composite Scoring
// ============================================================================

/**
 * Calculate composite score from dimension scores and weights
 */
function calculateCompositeScore(
  dimensions: EmailQAResult['dimensions'],
  weights: EmailQAConfig['dimensionWeights']
): number {
  const totalWeight = Object.values(weights).reduce((sum, w) => sum + w, 0);
  
  if (totalWeight === 0) {
    return 0;
  }
  
  const weightedSum = 
    (dimensions.readability.score * weights.readability) +
    (dimensions.wordCount.score * weights.wordCount) +
    (dimensions.jargon.score * weights.jargon) +
    (dimensions.findingRefs.score * weights.findingRefs) +
    (dimensions.spamRisk.score * weights.spamRisk);
  
  return Math.round(weightedSum / totalWeight);
}

/**
 * Generate improvement suggestions for failing dimensions
 */
function generateSuggestions(
  dimensions: EmailQAResult['dimensions'],
  config: EmailQAConfig
): string[] {
  const suggestions: string[] = [];
  
  // Readability
  if (dimensions.readability.gradeLevel > config.maxReadingGradeLevel) {
    suggestions.push(
      `Simplify language: reading level is ${dimensions.readability.gradeLevel.toFixed(1)} grade ` +
      `(target: ${config.maxReadingGradeLevel} grade or below). Use shorter sentences and simpler words.`
    );
  }
  
  // Word count
  if (dimensions.wordCount.count > config.maxWordCount) {
    const excess = dimensions.wordCount.count - config.maxWordCount;
    suggestions.push(
      `Reduce word count by ${excess} words (current: ${dimensions.wordCount.count}, target: ${config.maxWordCount} or fewer)`
    );
  }
  
  // Jargon
  if (dimensions.jargon.termsFound.length > 0) {
    suggestions.push(
      `Remove jargon terms: ${dimensions.jargon.termsFound.join(', ')}. Use plain language instead.`
    );
  }
  
  // Finding references
  if (dimensions.findingRefs.refsFound < config.minFindingReferences) {
    const needed = config.minFindingReferences - dimensions.findingRefs.refsFound;
    suggestions.push(
      `Add ${needed} more specific finding reference${needed > 1 ? 's' : ''} from the audit ` +
      `(current: ${dimensions.findingRefs.refsFound}, target: ${config.minFindingReferences})`
    );
  }
  
  // Spam risk
  if (dimensions.spamRisk.triggersFound.length > 0) {
    suggestions.push(
      `Remove spam trigger words: ${dimensions.spamRisk.triggersFound.join(', ')}`
    );
  }
  
  return suggestions;
}

// ============================================================================
// Main Scoring Function
// ============================================================================

/**
 * Score an email against the QA configuration
 * 
 * Returns composite score (0-100) with dimension breakdown and suggestions
 */
export function score(email: GeneratedEmail, config: EmailQAConfig = DEFAULT_EMAIL_QA_CONFIG): EmailQAResult {
  const fullText = `${email.subject} ${email.body}`;
  
  // Score each dimension
  const readability = scoreReadability(fullText, config.maxReadingGradeLevel);
  const wordCount = scoreWordCount(email.body, config.maxWordCount);
  const jargon = scoreJargon(fullText, config.jargonWordList);
  const findingRefs = scoreFindingReferences(email, config.minFindingReferences);
  const spamRisk = scoreSpamRisk(fullText, config.maxSpamRiskScore);
  
  const dimensions = {
    readability,
    wordCount,
    jargon,
    findingRefs,
    spamRisk,
  };
  
  // Calculate composite score
  const compositeScore = calculateCompositeScore(dimensions, config.dimensionWeights);
  
  // Generate suggestions
  const suggestions = generateSuggestions(dimensions, config);
  
  // Determine pass/fail
  const passed = compositeScore >= config.minQualityScore;
  
  return {
    compositeScore,
    dimensions,
    passed,
    suggestions,
  };
}

// ============================================================================
// Configuration Serialization
// ============================================================================

/**
 * Serialize EmailQAConfig to JSON
 */
export function serializeConfig(config: EmailQAConfig): string {
  return JSON.stringify(config, null, 2);
}

/**
 * Deserialize EmailQAConfig from JSON
 */
export function deserializeConfig(json: string): EmailQAConfig {
  const parsed = JSON.parse(json);
  
  // Validate required fields
  if (typeof parsed.maxReadingGradeLevel !== 'number') {
    throw new Error('Invalid EmailQAConfig: maxReadingGradeLevel must be a number');
  }
  if (typeof parsed.maxWordCount !== 'number') {
    throw new Error('Invalid EmailQAConfig: maxWordCount must be a number');
  }
  if (typeof parsed.minFindingReferences !== 'number') {
    throw new Error('Invalid EmailQAConfig: minFindingReferences must be a number');
  }
  if (typeof parsed.maxSpamRiskScore !== 'number') {
    throw new Error('Invalid EmailQAConfig: maxSpamRiskScore must be a number');
  }
  if (typeof parsed.minQualityScore !== 'number') {
    throw new Error('Invalid EmailQAConfig: minQualityScore must be a number');
  }
  if (!Array.isArray(parsed.jargonWordList)) {
    throw new Error('Invalid EmailQAConfig: jargonWordList must be an array');
  }
  if (!parsed.dimensionWeights || typeof parsed.dimensionWeights !== 'object') {
    throw new Error('Invalid EmailQAConfig: dimensionWeights must be an object');
  }
  
  // Validate dimension weights
  const requiredWeights = ['readability', 'wordCount', 'jargon', 'findingRefs', 'spamRisk'];
  for (const weight of requiredWeights) {
    if (typeof parsed.dimensionWeights[weight] !== 'number') {
      throw new Error(`Invalid EmailQAConfig: dimensionWeights.${weight} must be a number`);
    }
  }
  
  return parsed as EmailQAConfig;
}

// ============================================================================
// Exports
// ============================================================================

export const emailQaScorer = {
  score,
  serializeConfig,
  deserializeConfig,
};
