
import { RunTree, RunTreeConfig } from "langsmith";
import { CostTracker, LlmModel } from '@/lib/costs/costTracker';
import { logger } from "@/lib/logger";

// Initialize environment check
const isTracingEnabled = !!(process.env.LANGCHAIN_API_KEY && process.env.LANGCHAIN_PROJECT);

if (!isTracingEnabled) {
    logger.warn('LangSmith tracing disabled: Missing LANGCHAIN_API_KEY or LANGCHAIN_PROJECT');
}

export interface TraceConfig {
    name: string;
    run_type: 'chain' | 'llm' | 'tool';
    inputs: Record<string, any>;
    parent?: RunTree;
    tags?: string[];
    metadata?: Record<string, any>;
}

/**
 * Creates a parent trace for an audit operation
 */
export async function createParentTrace(
    auditId: string,
    name: string,
    metadata: Record<string, any> = {}
): Promise<RunTree | undefined> {
    if (!isTracingEnabled) return undefined;

    const parentRun = new RunTree({
        name,
        run_type: "chain",
        inputs: { auditId, ...metadata },
        tags: ["audit-parent", metadata.module || "unknown"],
        metadata: {
            auditId,
            ...metadata
        }
    });

    await parentRun.postRun();
    return parentRun;
}

/**
 * Wrapper for tracing LLM calls
 */
export async function traceLlmCall<T>(
    config: TraceConfig,
    fn: () => Promise<T>,
    tokenCallback?: (output: T) => { prompt: number, completion: number, model: string }
): Promise<T> {
    if (!isTracingEnabled) {
        return fn();
    }

    // Create the run
    const run = new RunTree({
        name: config.name,
        run_type: config.run_type,
        inputs: config.inputs,
        parent_run: config.parent,
        tags: config.tags,
        extra: {
            metadata: config.metadata
        }
    });

    // Start the run
    await run.postRun();

    try {
        const result = await fn();

        // If we have a callback to extract token usage from result
        let completionTokens = 0;
        let promptTokens = 0;

        if (tokenCallback) {
            try {
                const usage = tokenCallback(result);
                promptTokens = usage.prompt;
                completionTokens = usage.completion;

                // Add token usage to run
                // LangSmith expects standardized "usage_metadata" or "llm_usage" in outputs or extra
                // But for manual tracing, putting it in outputs is effective or end params
            } catch (e) {
                logger.warn({ error: e }, 'Failed to extract token usage for trace');
            }
        }

        // End the run successfully
        await run.end({
            outputs: {
                result: typeof result === 'object' ? result : { text: result },
                llm_output: {
                    token_usage: {
                        prompt_tokens: promptTokens,
                        completion_tokens: completionTokens,
                        total_tokens: promptTokens + completionTokens
                    }
                }
            }
        });

        await run.patchRun();

        return result;
    } catch (error) {
        // End the run with error
        await run.end({
            error: error instanceof Error ? error.message : String(error),
        });
        await run.patchRun();
        throw error;
    }
}
