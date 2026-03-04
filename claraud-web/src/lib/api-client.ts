import { ScanRequest, ScanStatus, ReportData } from './types';

class ProposalEngineClient {
    private baseUrl: string;
    private apiKey: string;
    private timeout: number = 60000;

    constructor() {
        this.baseUrl = process.env.PROPOSAL_ENGINE_API_URL || '';
        this.apiKey = process.env.PROPOSAL_ENGINE_API_KEY || '';
    }

    private async fetch<T>(path: string, options?: RequestInit): Promise<T | null> {
        // If no baseUrl configured, return null (triggers mock fallback)
        if (!this.baseUrl) {
            console.log('[api-client] No PROPOSAL_ENGINE_API_URL configured, using mock fallback');
            return null;
        }

        try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), this.timeout);

            const headers: HeadersInit = {
                'Content-Type': 'application/json',
                ...(this.apiKey ? { Authorization: `Bearer ${this.apiKey}` } : {}),
                ...options?.headers,
            };

            const response = await fetch(`${this.baseUrl}${path}`, {
                ...options,
                headers,
                signal: controller.signal,
            });

            clearTimeout(timeoutId);

            if (!response.ok) {
                throw new Error(`HTTP ${response.status}`);
            }

            const data = (await response.json()) as T;
            return data;
        } catch (error) {
            console.log('[api-client] Backend unreachable, using mock fallback:', error);
            return null;
        }
    }

    async startScan(req: ScanRequest): Promise<{ token: string } | null> {
        return this.fetch<{ token: string }>('/api/audit/start', {
            method: 'POST',
            body: JSON.stringify(req),
        });
    }

    async getScanStatus(token: string): Promise<ScanStatus | null> {
        return this.fetch<ScanStatus>(`/api/audit/status/${token}`);
    }

    async getReport(token: string): Promise<ReportData | null> {
        return this.fetch<ReportData>(`/api/audit/report/${token}`);
    }
}

export const apiClient = new ProposalEngineClient();