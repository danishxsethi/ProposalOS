/**
 * P2: Prompt Compression Utilities
 * 
 * Reduces token usage by compressing prompts while preserving meaning.
 * Techniques:
 * - Remove redundant whitespace
 * - Compress instructions to essential tokens
 * - Remove filler words
 * - Use abbreviations where clear
 * 
 * Expected savings: 20-30% token reduction
 */

import { logger } from '@/lib/logger';

/**
 * Common filler words that can be removed without losing meaning
 */
const FILLER_WORDS = [
  'please', 'kindly', 'would you', 'could you', 'i would like',
  'i need', 'i want', 'can you', 'will you', 'if possible',
  'thank you', 'thanks', 'appreciate', 'grateful',
  'in order to', 'so that', 'such that',
  'very', 'really', 'quite', 'rather', 'somewhat',
  'actually', 'basically', 'essentially', 'literally',
  'just', 'simply', 'merely', 'only',
  'however', 'moreover', 'furthermore', 'additionally',
  'therefore', 'thus', 'hence', 'consequently',
  'nevertheless', 'nonetheless', 'notwithstanding',
];

/**
 * Word substitutions for compression
 */
const WORD_SUBSTITUTIONS: Record<string, string> = {
  'approximately': 'approx',
  'configuration': 'config',
  'information': 'info',
  'description': 'desc',
  'documentation': 'docs',
  'environment': 'env',
  'example': 'ex',
  'function': 'fn',
  'generate': 'gen',
  'identifier': 'id',
  'initialize': 'init',
  'maximum': 'max',
  'minimum': 'min',
  'number': 'num',
  'object': 'obj',
  'parameter': 'param',
  'parameters': 'params',
  'previous': 'prev',
  'property': 'prop',
  'request': 'req',
  'response': 'resp',
  'specification': 'spec',
  'specifications': 'specs',
  'structure': 'struct',
  'temporary': 'temp',
  'value': 'val',
  'values': 'vals',
  'variable': 'var',
  'variables': 'vars',
  'version': 'ver',
  'against': 'vs',
  'because': 'bc',
  'before': 'b4',
  'between': 'btwn',
  'through': 'thru',
  'although': 'altho',
  'though': 'tho',
  'analyze': 'analyze',
  'analysis': 'analysis',
  'comprehensive': 'full',
  'detailed': 'detailed',
  'specific': 'specific',
  'particular': 'particular',
  'important': 'key',
  'significant': 'key',
  'substantial': 'large',
  'considerable': 'much',
  'utilize': 'use',
  'implement': 'build',
  'demonstrate': 'show',
  'indicate': 'show',
  'facilitate': 'help',
  'accomplish': 'do',
  'ascertain': 'find',
  'endeavor': 'try',
  'commence': 'start',
  'terminate': 'end',
  'subsequent': 'next',
  'prior': 'before',
  'current': 'now',
  'initial': 'first',
  'final': 'last',
  'primary': 'main',
  'secondary': 'other',
  'additional': 'more',
  'extra': 'more',
  'various': 'many',
  'several': 'some',
  'numerous': 'many',
  'multiple': 'multi',
  'different': 'diff',
  'similar': 'like',
  'identical': 'same',
  'equivalent': 'equal',
  'appropriate': 'apt',
  'suitable': 'fit',
  'adequate': 'enough',
  'sufficient': 'enough',
  'necessary': 'needed',
  'mandatory': 'must',
  'optional': 'opt',
  'default': 'default',
  'standard': 'std',
  'custom': 'custom',
  'automatic': 'auto',
  'manual': 'manual',
  'explicit': 'clear',
  'implicit': 'implied',
  'direct': 'direct',
  'indirect': 'indirect',
  'exact': 'exact',
  'precise': 'precise',
  'accurate': 'accurate',
  'correct': 'correct',
  'proper': 'proper',
  'valid': 'valid',
  'invalid': 'bad',
  'active': 'active',
  'inactive': 'off',
  'enabled': 'on',
  'disabled': 'off',
  'available': 'avail',
  'unavailable': 'gone',
  'present': 'here',
  'absent': 'gone',
  'existing': 'current',
  'new': 'new',
  'old': 'old',
  'latest': 'latest',
  'recent': 'recent',
  'early': 'early',
  'late': 'late',
  'first': 'first',
  'last': 'last',
  'next': 'next',
  'following': 'next',
  'preceding': 'before',
  'inside': 'in',
  'outside': 'out',
  'within': 'in',
  'without': 'sans',
  'including': 'incl',
  'excluding': 'excl',
  'regarding': 're',
  'concerning': 're',
  'respecting': 're',
  'touching': 're',
  'pending': 'pending',
  'during': 'while',
  'until': 'til',
  'since': 'since',
  'from': 'from',
  'to': 'to',
  'for': 'for',
  'with': 'with',
  'into': 'into',
  'onto': 'onto',
  'upon': 'on',
  'across': 'across',
  'around': 'around',
  'about': 'about',
  'near': 'near',
  'close': 'close',
  'far': 'far',
  'beyond': 'past',
  'behind': 'behind',
  'beside': 'beside',
  'among': 'among',
  'throughout': 'thru',
  'toward': 'toward',
  'under': 'under',
  'over': 'over',
  'beneath': 'under',
  'underneath': 'under',
  'along': 'along',
  'amid': 'amid',
  'amidst': 'amid',
};

/**
 * Compress a prompt by removing filler words and applying substitutions
 */
export function compressPrompt(text: string, options?: {
  aggressive?: boolean;
  preserveStructure?: boolean;
  minLength?: number;
}): string {
  const {
    aggressive = false,
    preserveStructure = true,
    minLength = 0,
  } = options || {};

  if (!text || text.length < minLength) {
    return text;
  }

  let compressed = text;

  // Step 1: Remove redundant whitespace
  compressed = compressed.replace(/\s+/g, ' ').trim();

  // Step 2: Remove filler words (case-insensitive)
  for (const filler of FILLER_WORDS) {
    const regex = new RegExp(`\\b${filler}\\b`, 'gi');
    compressed = compressed.replace(regex, '');
  }

  // Step 3: Apply word substitutions
  for (const [full, abbrev] of Object.entries(WORD_SUBSTITUTIONS)) {
    const regex = new RegExp(`\\b${full}\\b`, 'gi');
    compressed = compressed.replace(regex, abbrev);
  }

  // Step 4: Remove redundant punctuation
  compressed = compressed.replace(/\s+([.,;:!?])/g, '$1');
  compressed = compressed.replace(/\s+/g, ' ');

  // Step 5: Aggressive mode - additional compression
  if (aggressive) {
    // Remove articles
    compressed = compressed.replace(/\b(the|a|an)\b/gi, '');
    
    // Remove common phrases
    compressed = compressed.replace(/\bi want you to\b/gi, '');
    compressed = compressed.replace(/\byou should\b/gi, '');
    compressed = compressed.replace(/\byou must\b/gi, 'must');
    compressed = compressed.replace(/\bmake sure to\b/gi, 'ensure');
    compressed = compressed.replace(/\bbe sure to\b/gi, 'ensure');
    
    // Compress common JSON/schema instructions
    compressed = compressed.replace(/\breturn only valid json\b/gi, 'json only');
    compressed = compressed.replace(/\bdo not include any explanation\b/gi, 'no explanation');
    compressed = compressed.replace(/\bstrictly follow the schema\b/gi, 'follow schema');
    compressed = compressed.replace(/\boutput must match\b/gi, 'output=');
  }

  // Step 6: Clean up multiple spaces
  compressed = compressed.replace(/\s+/g, ' ').trim();

  // Ensure we don't compress below minimum length if specified
  if (compressed.length < minLength) {
    logger.warn({ original: text.length, compressed: compressed.length, minLength }, 
      'Prompt compression below minimum length');
    return text;
  }

  // Log compression ratio
  const savings = ((text.length - compressed.length) / text.length) * 100;
  if (savings > 0) {
    logger.debug({ original: text.length, compressed: compressed.length, savings: `${savings.toFixed(1)}%` },
      'Prompt compressed');
  }

  return compressed;
}

/**
 * Compress an array of messages (for multi-turn conversations)
 */
export function compressMessages(messages: Array<{
  role: string;
  content: string;
}>, options?: {
  compressSystemPrompt?: boolean;
  aggressive?: boolean;
}): Array<{ role: string; content: string }> {
  const { compressSystemPrompt = true, aggressive = false } = options || {};

  return messages.map((msg, index) => {
    // Always compress system prompts
    if (msg.role === 'system' && compressSystemPrompt) {
      return {
        ...msg,
        content: compressPrompt(msg.content, { aggressive }),
      };
    }
    
    // Compress user messages
    if (msg.role === 'user') {
      return {
        ...msg,
        content: compressPrompt(msg.content, { aggressive }),
      };
    }
    
    // Don't compress assistant responses (they're already generated)
    return msg;
  });
}

/**
 * Get token savings estimate from compression
 * Rough estimate: 1 token ≈ 4 characters for English text
 */
export function estimateTokenSavings(original: string, compressed: string): {
  originalTokens: number;
  compressedTokens: number;
  savedTokens: number;
  savingsPercent: number;
} {
  const TOKENS_PER_CHAR = 0.25; // Rough estimate
  
  const originalTokens = Math.ceil(original.length * TOKENS_PER_CHAR);
  const compressedTokens = Math.ceil(compressed.length * TOKENS_PER_CHAR);
  const savedTokens = originalTokens - compressedTokens;
  const savingsPercent = (savedTokens / originalTokens) * 100;

  return {
    originalTokens,
    compressedTokens,
    savedTokens,
    savingsPercent: Math.max(0, savingsPercent),
  };
}

/**
 * Schema-constrained response prompt
 * Ensures responses follow a specific format to reduce token waste
 */
export function createSchemaConstrainedPrompt(
  instruction: string,
  schema: Record<string, unknown>,
  options?: {
    examples?: Array<{ input: string; output: unknown }>;
    aggressive?: boolean;
  }
): string {
  const { examples = [], aggressive = false } = options || {};
  
  const compressedInstruction = compressPrompt(instruction, { aggressive });
  
  let prompt = `${compressedInstruction}\n\n`;
  prompt += `Output JSON matching this schema:\n${JSON.stringify(schema, null, 2)}\n`;
  
  if (examples.length > 0) {
    prompt += '\nExamples:\n';
    for (const ex of examples) {
      prompt += `Input: ${ex.input}\n`;
      prompt += `Output: ${JSON.stringify(ex.output)}\n`;
    }
  }
  
  prompt += '\nRespond with JSON only. No explanation.';
  
  return prompt;
}

/**
 * Module-specific prompt templates (pre-compressed)
 */
export const MODULE_PROMPTS = {
  // Simple modules that can use Flash model
  techStack: compressPrompt(`Analyze website tech stack from HTML. Return: framework, cms, analytics, hosting, cdn.`),
  security: compressPrompt(`Check website security. Return: ssl, https, securityHeaders, vulnerabilities.`),
  emailFinder: compressPrompt(`Extract emails from HTML. Return array of valid emails found.`),
  schemaAnalysis: compressPrompt(`Analyze schema markup in HTML. Return: types found, missing recommended types.`),
  
  // Complex modules requiring Pro models
  seoDeep: `Perform deep SEO analysis including: on-page factors, meta tags, heading structure, internal linking, content quality assessment, keyword density, and technical SEO issues. Provide detailed findings with severity ratings and specific recommendations.`,
  contentQuality: `Analyze content quality across multiple dimensions: readability, relevance, depth, uniqueness, engagement potential, and conversion optimization. Evaluate against industry best practices and competitor benchmarks.`,
  competitorStrategy: `Analyze competitor strategy comprehensively: positioning, messaging, content gaps, keyword opportunities, backlink profile, social presence, and paid advertising. Provide actionable recommendations to outperform.`,
};

/**
 * Get the appropriate model for a module based on complexity
 */
export function getModelForModule(moduleName: string): 'GEMINI_FLASH' | 'GEMINI_PRO' | 'GEMINI_31_PRO' {
  // Simple modules - use Flash (70% cost savings)
  const flashModules = ['techStack', 'security', 'emailFinder', 'schemaAnalysis', 'coreWebVitals'];
  
  // Complex modules - use Pro
  const proModules = ['seoDeep', 'contentQuality', 'competitorStrategy', 'reputation', 'keywordGap'];
  
  // Advanced modules - use 3.1 Pro for reasoning
  const pro31Modules = ['competitor', 'vision', 'socialDeep', 'gbpDeep'];

  if (flashModules.includes(moduleName)) return 'GEMINI_FLASH';
  if (pro31Modules.includes(moduleName)) return 'GEMINI_31_PRO';
  return 'GEMINI_PRO'; // Default to Pro
}

/**
 * Get compression statistics for monitoring
 */
export function getCompressionStats(original: string, compressed: string): {
  originalLength: number;
  compressedLength: number;
  bytesSaved: number;
  compressionRatio: number;
  tokenEstimate: {
    original: number;
    compressed: number;
    saved: number;
    costSavingsCents: number;
  };
} {
  const tokenEst = estimateTokenSavings(original, compressed);
  const costSavingsCents = tokenEst.savedTokens * 0.00001;

  return {
    originalLength: original.length,
    compressedLength: compressed.length,
    bytesSaved: original.length - compressed.length,
    compressionRatio: compressed.length / original.length,
    tokenEstimate: {
      original: tokenEst.originalTokens,
      compressed: tokenEst.compressedTokens,
      saved: tokenEst.savedTokens,
      costSavingsCents,
    },
  };
}
