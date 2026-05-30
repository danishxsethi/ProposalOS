/**
 * lib/audit/concurrency.ts
 *
 * Tiny dependency-free bounded concurrency primitive.
 *
 * Why not p-limit?  Adding a runtime dependency for something this small is
 * not worth it.  This implementation is deterministic, easy to test, and
 * preserves Promise.allSettled-style semantics for the audit runner.
 *
 * Usage:
 *   const results = await runWithConcurrency(tasks, { limit: 5 });
 *
 * `tasks` is an array of zero-arg async functions.  Tasks run with at most
 * `limit` in flight concurrently.  All tasks run to completion (settled);
 * one task's rejection never cancels another.
 */

export interface ConcurrencyOptions {
  /** Maximum number of tasks running concurrently. */
  limit: number;
}

export type TaskResult<T> =
  | { status: 'fulfilled'; value: T }
  | { status: 'rejected'; reason: unknown };

/**
 * Run an array of zero-arg async tasks with bounded concurrency.
 * Always settles all tasks; never rethrows.  Mirrors Promise.allSettled.
 */
export async function runWithConcurrency<T>(
  tasks: Array<() => Promise<T>>,
  options: ConcurrencyOptions
): Promise<TaskResult<T>[]> {
  const limit = Math.max(1, options.limit);
  const results: TaskResult<T>[] = new Array(tasks.length);
  let nextIndex = 0;

  async function worker(): Promise<void> {
    while (true) {
      const i = nextIndex++;
      if (i >= tasks.length) return;
      const task = tasks[i];
      if (!task) continue;
      try {
        const value = await task();
        results[i] = { status: 'fulfilled', value };
      } catch (reason) {
        results[i] = { status: 'rejected', reason };
      }
    }
  }

  const workers = Array.from({ length: Math.min(limit, tasks.length) }, () => worker());
  await Promise.all(workers);
  return results;
}
