import { logger } from "@/lib/logger";

export interface ZeroBounceResult {
    isValid: boolean;
    status: string;
    subStatus: string;
}

export async function verifyEmailWithZeroBounce(email: string): Promise<ZeroBounceResult> {
    const apiKey = process.env.ZEROBOUNCE_API_KEY;
    if (!apiKey) {
        logger.warn('ZEROBOUNCE_API_KEY is not set. Skipping verification (mocking true).');
        return { isValid: true, status: 'mock_valid', subStatus: '' };
    }

    try {
        const url = `https://api.zerobounce.net/v2/validate?api_key=${apiKey}&email=${encodeURIComponent(email)}`;
        // 5-second timeout for verification
        const response = await fetch(url, { signal: AbortSignal.timeout(5000) });
        if (!response.ok) {
            throw new Error(`ZeroBounce API error: ${response.status}`);
        }

        const data = await response.json();
        const isValid = data.status === 'valid' || data.status === 'catch-all';
        return {
            isValid,
            status: data.status,
            subStatus: data.sub_status
        };
    } catch (error) {
        logger.error({ error, email }, 'ZeroBounce verification failed');
        // Fail open if the API goes down or times out, so we don't lose leads
        return { isValid: true, status: 'error', subStatus: String(error) };
    }
}
