export function exponentialBackoffMs(attempt: number, baseMs: number = 1000): number {
    return Math.min(baseMs * Math.pow(2, attempt) + Math.random() * 500, 30_000);
}

export function sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
}
