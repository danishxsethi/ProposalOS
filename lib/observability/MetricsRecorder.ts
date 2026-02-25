/**
 * lib/observability/MetricsRecorder.ts
 *
 * Task 3 (Pipeline 17): Persistent Metrics Storage
 *
 * Batches metric writes and flushes every 10 seconds or every 100 records,
 * whichever comes first. Writes to the `Metric` Prisma model.
 *
 * Tracked metrics:
 *   llm_calls_total       — count of LLM invocations
 *   llm_cost_total        — cumulative USD cost
 *   llm_latency_avg       — rolling latency in ms
 *   audit_runs_total      — total audit runs started
 *   audit_failures_total  — total audit failures
 *   qa_hallucination_rate — QA hallucination score (0–1)
 */

import { prisma } from '@/lib/prisma';
import { checkAlertRules } from './alerts';

interface MetricEntry {
    name: string;
    value: number;
    labels: Record<string, string>;
    timestamp: Date;
}

const FLUSH_INTERVAL_MS = 10_000;
const FLUSH_BATCH_SIZE = 100;

class MetricsRecorderSingleton {
    private buffer: MetricEntry[] = [];
    private flushTimer: NodeJS.Timeout | null = null;
    private started = false;

    start() {
        if (this.started) return;
        this.started = true;
        this.flushTimer = setInterval(() => this.flush(), FLUSH_INTERVAL_MS);
        // Prevent timer from blocking process exit
        if (this.flushTimer.unref) this.flushTimer.unref();
    }

    stop() {
        if (this.flushTimer) {
            clearInterval(this.flushTimer);
            this.flushTimer = null;
        }
        this.started = false;
    }

    record(name: string, value: number, labels: Record<string, string> = {}): void {
        this.buffer.push({ name, value, labels, timestamp: new Date() });
        if (this.buffer.length >= FLUSH_BATCH_SIZE) {
            this.flush(); // Synchronously drain buffer (no await — best effort)
        }
        if (!this.started) this.start();
    }

    /** Core named-metric helpers */
    llmCall(latencyMs: number, costUSD: number, model: string, node: string): void {
        this.record('llm_calls_total', 1, { model, node });
        this.record('llm_cost_total', costUSD, { model });
        this.record('llm_latency_avg', latencyMs, { model, node });
    }

    auditRun(tenantId: string): void {
        this.record('audit_runs_total', 1, { tenantId });
    }

    auditFailure(tenantId: string, reason: string): void {
        this.record('audit_failures_total', 1, { tenantId, reason });
    }

    qaHallucinationRate(score: number, graphName: string): void {
        this.record('qa_hallucination_rate', score, { graphName });
    }

    async flush(): Promise<void> {
        if (this.buffer.length === 0) return;
        const batch = this.buffer.splice(0, this.buffer.length);

        try {
            await prisma.metric.createMany({
                data: batch.map((m) => ({
                    name: m.name,
                    value: m.value,
                    labels: m.labels as any,
                    timestamp: m.timestamp,
                })),
                skipDuplicates: false,
            });

            // Task 4: Check alert rules on every flush
            await checkAlertRules(batch);
        } catch (err) {
            console.error('[MetricsRecorder] Flush failed:', err);
            // Re-buffer on failure — put items back at the front
            this.buffer.unshift(...batch);
        }
    }
}

export const MetricsRecorder = new MetricsRecorderSingleton();
