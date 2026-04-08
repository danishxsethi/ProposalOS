/**
 * Request Batching for LLM
 *
 * Batches multiple small requests into a single API call to reduce latency and cost.
 * Useful for processing multiple similar prompts efficiently.
 */

import { logger } from '@/lib/logger';

export interface BatchItem<T = any> {
  id: string;
  input: string;
  metadata?: T;
}

export interface BatchResult<T = any> {
  id: string;
  result: string;
  metadata?: T;
  success: boolean;
  error?: string;
}

export interface BatchOptions {
  maxBatchSize?: number; // Max items per batch
  maxWaitMs?: number; // Max time to wait before processing
  minBatchSize?: number; // Min items before processing (if wait exceeded)
  promptTemplate?: (items: BatchItem[]) => string; // Custom prompt template
  resultParser?: (response: string, items: BatchItem[]) => string[]; // Parse response
}

const DEFAULT_OPTIONS: Required<BatchOptions> = {
  maxBatchSize: 10,
  maxWaitMs: 1000,
  minBatchSize: 2,
  promptTemplate: defaultPromptTemplate,
  resultParser: defaultResultParser,
};

/**
 * Default prompt template for batching
 */
function defaultPromptTemplate(items: BatchItem[]): string {
  const inputs = items.map((item, i) => `${i + 1}. ${item.input}`).join('\n\n');
  return `Process the following ${items.length} items and provide numbered responses:

${inputs}

Provide responses in the same order, numbered 1-${items.length}.`;
}

/**
 * Default result parser
 */
function defaultResultParser(response: string, items: BatchItem[]): string[] {
  // Split by numbered responses (1., 2., etc.)
  const parts = response.split(/\n(?=\d+\.)/);
  const results: string[] = [];

  for (const part of parts) {
    // Remove the number prefix
    const cleaned = part.replace(/^\d+\.\s*/, '').trim();
    if (cleaned) {
      results.push(cleaned);
    }
  }

  // If parsing failed, fall back to splitting by double newlines
  if (results.length !== items.length) {
    return response
      .split('\n\n')
      .map((r) => r.trim())
      .filter((r) => r.length > 0);
  }

  return results;
}

/**
 * Batch processor that queues and processes items together
 */
export class BatchProcessor {
  private queue: BatchItem[] = [];
  private options: Required<BatchOptions>;
  private processor: (prompt: string) => Promise<string>;
  private pendingPromise: Promise<BatchResult[]> | null = null;
  private waitTimer: NodeJS.Timeout | null = null;

  constructor(processor: (prompt: string) => Promise<string>, options: BatchOptions = {}) {
    this.processor = processor;
    this.options = { ...DEFAULT_OPTIONS, ...options };
  }

  /**
   * Add item to batch queue
   */
  async add(item: BatchItem): Promise<BatchResult> {
    this.queue.push(item);

    // Check if we should process now
    if (this.queue.length >= this.options.maxBatchSize) {
      return this.processNow();
    }

    // Start wait timer if not already running
    if (!this.waitTimer) {
      this.waitTimer = setTimeout(() => {
        if (this.queue.length >= this.options.minBatchSize) {
          this.processNow();
        }
      }, this.options.maxWaitMs);
    }

    // Wait for batch to be processed
    return this.waitForProcessing(item.id);
  }

  /**
   * Process current batch immediately
   */
  async processNow(): Promise<BatchResult> {
    if (this.pendingPromise) {
      return this.pendingPromise.then(() => this.waitForProcessing('any'));
    }

    if (this.queue.length === 0) {
      return { id: '', result: '', success: false, error: 'Queue is empty' };
    }

    // Clear wait timer
    if (this.waitTimer) {
      clearTimeout(this.waitTimer);
      this.waitTimer = null;
    }

    // Take current batch
    const batch = this.queue.slice(0, this.options.maxBatchSize);
    this.queue = this.queue.slice(this.options.maxBatchSize);

    logger.debug({ batchSize: batch.length }, 'Processing batch');

    // Process batch
    this.pendingPromise = (async () => {
      try {
        const prompt = this.options.promptTemplate(batch);
        const response = await this.processor(prompt);
        const results = this.options.resultParser(response, batch);

        // Map results back to items
        const batchResults: BatchResult[] = batch.map((item, i) => ({
          id: item.id,
          result: results[i] || '',
          metadata: item.metadata,
          success: true,
        }));

        return batchResults;
      } catch (error: any) {
        logger.error({ error }, 'Batch processing failed');
        // Return failed results for all items
        return batch.map((item) => ({
          id: item.id,
          result: '',
          metadata: item.metadata,
          success: false,
          error: error.message,
        }));
      } finally {
        this.pendingPromise = null;
      }
    })();

    return this.waitForProcessing('any');
  }

  /**
   * Wait for a specific item or any item to be processed
   */
  private async waitForProcessing(itemId: string): Promise<BatchResult> {
    // Poll for result
    return new Promise((resolve) => {
      const checkQueue = () => {
        // Check if item was processed (no longer in queue and no pending promise)
        const stillInQueue = this.queue.some((item) => item.id === itemId);

        if (!stillInQueue && !this.pendingPromise) {
          // Item was processed - return placeholder (actual result should be tracked separately)
          resolve({ id: itemId, result: '', success: true });
        } else {
          setTimeout(checkQueue, 50);
        }
      };
      checkQueue();
    });
  }

  /**
   * Get current queue length
   */
  getQueueLength(): number {
    return this.queue.length;
  }

  /**
   * Flush queue without processing
   */
  flush(): void {
    this.queue = [];
    if (this.waitTimer) {
      clearTimeout(this.waitTimer);
      this.waitTimer = null;
    }
  }
}

/**
 * Simple batch processing function (one-shot)
 */
export async function processInBatches<T>(
  items: BatchItem<T>[],
  processor: (prompt: string) => Promise<string>,
  options: BatchOptions = {}
): Promise<BatchResult<T>[]> {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  const allResults: BatchResult<T>[] = [];

  // Split into batches
  const batches: BatchItem<T>[][] = [];
  for (let i = 0; i < items.length; i += opts.maxBatchSize) {
    batches.push(items.slice(i, i + opts.maxBatchSize));
  }

  // Process each batch
  for (let i = 0; i < batches.length; i++) {
    const batch = batches[i]!;
    logger.debug({ batch: i + 1, total: batches.length, size: batch.length }, 'Processing batch');

    try {
      const prompt = opts.promptTemplate(batch);
      const response = await processor(prompt);
      const results = opts.resultParser(response, batch);

      const batchResults: BatchResult<T>[] = batch.map((item, j) => ({
        id: item.id,
        result: results[j]! || '',
        metadata: item.metadata,
        success: true,
      }));

      allResults.push(...batchResults);
    } catch (error: any) {
      logger.error({ batch: i + 1, error }, 'Batch failed');
      // Add failed results
      const failedResults: BatchResult<T>[] = batch.map((item) => ({
        id: item.id,
        result: '',
        metadata: item.metadata,
        success: false,
        error: error.message,
      }));
      allResults.push(...failedResults);
    }

    // Small delay between batches to avoid rate limits
    if (i < batches.length - 1) {
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  }

  return allResults;
}

/**
 * Create a batch processor instance
 */
export function createBatchProcessor(
  processor: (prompt: string) => Promise<string>,
  options?: BatchOptions
): BatchProcessor {
  return new BatchProcessor(processor, options);
}
