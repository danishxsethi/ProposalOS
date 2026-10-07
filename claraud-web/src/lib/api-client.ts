export let lastApiError: string | null = null;

class ProposalEngineClient {
  private baseUrl: string;
  private apiKey: string;
  private timeout: number = 60000;

  constructor() {
    this.baseUrl =
      process.env.PROPOSAL_ENGINE_API_URL ||
      process.env.NEXT_PUBLIC_APP_URL ||
      'https://claraud.com';
    this.apiKey = process.env.PROPOSAL_ENGINE_API_KEY || '';
  }

  private async fetch<T>(path: string, options?: RequestInit): Promise<T | null> {
    if (!this.baseUrl) {
      console.warn('[API Client] PROPOSAL_ENGINE_API_URL is not configured');
      return null;
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeout);

    try {
      const internalOpsKey = process.env.INTERNAL_OPS_KEY;
      const tenantId = process.env.DEFAULT_TENANT_ID;

      const response = await fetch(`${this.baseUrl}${path}`, {
        ...options,
        signal: controller.signal,
        headers: {
          'Content-Type': 'application/json',
          ...(this.apiKey ? { 'X-API-Key': this.apiKey } : {}),
          ...(internalOpsKey ? { 'x-internal-ops-key': internalOpsKey } : {}),
          ...(tenantId ? { 'x-tenant-id': tenantId } : {}),
          ...options?.headers,
        },
      });

      if (!response.ok) {
        const text = await response.text();
        lastApiError = `${response.status} ${response.statusText} - ${text}`;
        return null;
      }

      return (await response.json()) as T;
    } catch (error) {
      lastApiError = error instanceof Error ? error.message : String(error);
      return null;
    } finally {
      clearTimeout(timeoutId);
    }
  }

  async healthCheck(): Promise<boolean> {
    if (!this.baseUrl) return false;
    try {
      const result = await this.fetch<any>('/api/health');
      return result !== null;
    } catch {
      return false;
    }
  }

  async createAudit(req: {
    businessName?: string;
    businessUrl?: string;
    placeId?: string;
    businessCity?: string;
    businessIndustry?: string;
  }): Promise<any | null> {
    return this.fetch('/api/audit', {
      method: 'POST',
      body: JSON.stringify({
        url: req.businessUrl,
        name: req.businessName || req.businessUrl || 'Unknown Business',
        placeId: req.placeId,
        city: req.businessCity,
        industry: req.businessIndustry,
      }),
    });
  }

  async getAudit(auditId: string): Promise<any | null> {
    return this.fetch(`/api/audit/${auditId}`);
  }

  async runDiagnosis(auditId: string): Promise<any | null> {
    return this.fetch(`/api/audit/${auditId}/diagnose`, { method: 'POST' });
  }

  async generateProposal(auditId: string): Promise<any | null> {
    return this.fetch(`/api/audit/${auditId}/propose`, { method: 'POST' });
  }

  async getProposal(token: string): Promise<any | null> {
    const res = await this.fetch(`/api/proposal/token/${token}`);
    if (res) return res;
    return this.fetch(`/api/proposal/${token}`);
  }
}

export const apiClient = new ProposalEngineClient();
