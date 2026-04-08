class ProposalEngineClient {
  private baseUrl: string;
  private apiKey: string;
  private timeout: number = 60000;

  constructor() {
    this.baseUrl = process.env.PROPOSAL_ENGINE_API_URL || '';
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
      const response = await fetch(`${this.baseUrl}${path}`, {
        ...options,
        signal: controller.signal,
        headers: {
          'Content-Type': 'application/json',
          'X-API-Key': this.apiKey,
          ...options?.headers,
        },
      });

      if (!response.ok) {
        const text = await response.text();
        console.error(
          `[API Client] ${path} returned ${response.status}: ${response.statusText} - ${text}`
        );
        return null;
      }

      return (await response.json()) as T;
    } catch (error) {
      console.error(`[API Client] ${path} failed:`, error);
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
    return this.fetch(`/api/proposal/${token}`);
  }
}

export const apiClient = new ProposalEngineClient();
