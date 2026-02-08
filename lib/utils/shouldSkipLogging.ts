export function shouldSkipLogging(req: Request): boolean {
    const url = new URL(req.url);

    // Skip health checks
    if (url.pathname === '/api/health') {
        return true;
    }

    // Skip metrics if high frequency calls
    if (url.pathname === '/api/metrics' && process.env.NODE_ENV === 'production') {
        return true;
    }

    return false;
}
