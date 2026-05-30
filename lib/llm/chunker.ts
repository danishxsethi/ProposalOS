/**
 * Intelligent Input Chunking for LLM
 *
 * Splits large inputs into manageable chunks that fit within token limits.
 * Supports semantic chunking (by sections) and fallback character-based chunking.
 */

import { logger } from '@/lib/logger';

export interface ChunkResult {
  chunks: string[];
  totalChunks: number;
  originalLength: number;
  strategy: 'semantic' | 'character';
}

export interface ChunkOptions {
  maxChunkSize?: number; // Max characters per chunk
  overlap?: number; // Overlap between chunks (characters)
  minChunkSize?: number; // Minimum chunk size before merging
  semanticBoundaries?: RegExp[]; // Preferred break points (regex patterns)
}

const DEFAULT_OPTIONS: Required<ChunkOptions> = {
  maxChunkSize: 50000, // ~12,500 tokens per chunk
  overlap: 500, // 500 character overlap for context
  minChunkSize: 5000, // Merge chunks smaller than 5000 chars
  semanticBoundaries: [
    /\n\n(?=[A-Z])/, // Double newline before capital
    /\n(?=#)/, // Newline before markdown header
    /\n\n(?=\d+\.)/, // Double newline before numbered list
    /\n\n(?=-)/, // Double newline before bullet list
    /(?<=\.)\s+(?=[A-Z])/, // Sentence boundary
  ],
};

/**
 * Split large text into chunks that fit within token limits
 */
export function chunkText(text: string, options: ChunkOptions = {}): ChunkResult {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  const originalLength = text.length;

  // If text fits in one chunk, return as-is
  if (originalLength <= opts.maxChunkSize) {
    return {
      chunks: [text],
      totalChunks: 1,
      originalLength,
      strategy: 'semantic',
    };
  }

  // Try semantic chunking first
  const semanticChunks = trySemanticChunking(text, opts);

  if (semanticChunks.length > 0 && semanticChunks.every((c) => c.length <= opts.maxChunkSize)) {
    logger.debug(
      { chunks: semanticChunks.length, strategy: 'semantic' },
      'Semantic chunking successful'
    );
    return {
      chunks: semanticChunks,
      totalChunks: semanticChunks.length,
      originalLength,
      strategy: 'semantic',
    };
  }

  // Fallback to character-based chunking
  const characterChunks = chunkByCharacters(text, opts);
  logger.debug(
    { chunks: characterChunks.length, strategy: 'character' },
    'Fallback to character chunking'
  );

  return {
    chunks: characterChunks,
    totalChunks: characterChunks.length,
    originalLength,
    strategy: 'character',
  };
}

/**
 * Try semantic chunking using natural boundaries
 */
function trySemanticChunking(text: string, opts: Required<ChunkOptions>): string[] {
  const chunks: string[] = [];
  let remaining = text;

  while (remaining.length > opts.maxChunkSize) {
    // Find the best break point within the max chunk size
    const breakPoint = findBestBreakPoint(remaining, opts.maxChunkSize, opts.semanticBoundaries);

    if (breakPoint === -1) {
      // No good break point found, fall back to character chunking
      break;
    }

    // Extract chunk
    const chunk = remaining.substring(0, breakPoint).trim();

    // Ensure chunk meets minimum size
    if (chunk.length < opts.minChunkSize) {
      // Merge with next chunk
      break;
    }

    chunks.push(chunk);
    remaining = remaining.substring(breakPoint);
  }

  // Add remaining text as final chunk
  if (remaining.length > 0) {
    chunks.push(remaining);
  }

  // Merge small chunks
  return mergeSmallChunks(chunks, opts.minChunkSize);
}

/**
 * Find the best break point in text
 */
function findBestBreakPoint(text: string, maxSize: number, boundaries: RegExp[]): number {
  // Start from the end and work backwards
  const searchStart = Math.min(maxSize, text.length);
  const searchEnd = Math.max(0, searchStart - 2000); // Search last 2000 chars

  let bestPoint = -1;
  let bestScore = 0;

  for (let i = 0; i < boundaries.length; i++) {
    const regex = boundaries[i]!;
    const matches = Array.from(text.substring(searchEnd, searchStart).matchAll(regex));

    for (const match of matches) {
      const position = searchEnd + match.index! + match[0].length;
      if (position <= maxSize) {
        // Score based on how close to max and boundary priority
        const score = (position / maxSize) * 100 + (boundaries.length - i) * 10;
        if (score > bestScore) {
          bestScore = score;
          bestPoint = position;
        }
      }
    }
  }

  return bestPoint;
}

/**
 * Character-based chunking with overlap
 */
function chunkByCharacters(text: string, opts: Required<ChunkOptions>): string[] {
  const chunks: string[] = [];
  let position = 0;

  while (position < text.length) {
    const end = Math.min(position + opts.maxChunkSize, text.length);
    let chunk = text.substring(position ?? 0, end);

    // Add overlap (except for first chunk)
    if (chunks.length > 0 && position > 0) {
      // Include some context from previous chunk
      const prevEnd = chunks[chunks.length - 1]!.length;
      const overlap = text.substring(Math.max(0, prevEnd - opts.overlap), prevEnd);
      chunk = overlap + '\n---\n' + chunk;
    }

    chunks.push(chunk);
    position = end;
  }

  return chunks;
}

/**
 * Merge chunks that are too small
 */
function mergeSmallChunks(chunks: string[], minSize: number): string[] {
  if (chunks.length <= 1) return chunks;

  const result: string[] = [];
  let currentChunk = chunks[0]!;

  for (let i = 1; i < chunks.length; i++) {
    if (currentChunk.length < minSize) {
      // Merge with next chunk
      currentChunk += '\n\n' + chunks[i]!;
    } else {
      // Current chunk is large enough, add to result
      result.push(currentChunk);
      currentChunk = chunks[i]!;
    }
  }

  // Don't forget the last chunk
  result.push(currentChunk);

  return result;
}

/**
 * Process chunks with an LLM function, handling each chunk
 */
export async function processChunks<T>(
  chunks: string[],
  processor: (chunk: string, index: number) => Promise<T>,
  options?: { combineResults?: (results: T[]) => T }
): Promise<T | undefined> {
  const results: T[] = [];

  for (let i = 0; i < chunks.length; i++) {
    logger.debug({ chunk: i + 1, total: chunks.length }, 'Processing chunk');
    const result = await processor(chunks[i]!, i);
    results.push(result);
  }

  if (options?.combineResults) {
    return options.combineResults(results);
  }

  // Default: return last result or combine if array
  if (results.length === 1) {
    return results[0];
  }

  throw new Error('Must provide combineResults function for multi-chunk processing');
}

/**
 * Combine chunk results by concatenation (for text results)
 */
export function combineTextResults(results: string[]): string {
  return results.join('\n\n');
}

/**
 * Combine chunk results by merging objects
 */
export function combineObjectResults<T extends Record<string, any>>(results: T[]): T {
  const combined: any = {};

  for (const result of results) {
    for (const [key, value] of Object.entries(result)) {
      if (Array.isArray(value)) {
        combined[key] = [...(combined[key] || []), ...value];
      } else if (typeof value === 'object' && value !== null) {
        combined[key] = { ...combined[key], ...value };
      } else {
        // For primitives, take the last value
        combined[key] = value;
      }
    }
  }

  return combined as T;
}
