/**
 * Proposal Engine JavaScript/TypeScript SDK
 * Requirements: 9.6
 */

export interface ProposalEngineConfig {
  apiKey: string;
  baseUrl?: string;
}

export interface CreateAuditInput {
  businessName: string;
  businessUrl: string;
  city?: string;
  industry?: string;
}

export interface AuditResponse {
  id: string;
  status: 'QUEUED' | 'RUNNING' | 'COMPLETE' | 'FAILED';
  businessName: string;
  businessUrl?: string;
  overallScore?: number;
  createdAt: string;
  completedAt?: string;
}

export interface FindingsResponse {
  auditId: string;
  findings: {
    id: string;
    module: string;
    category: string;
    type: string;
    title: string;
    description?: string;
    impactScore: number;
  }[];
}

export interface ProposalResponse {
  id: string;
  auditId: string;
  status: string;
  executiveSummary?: string;
  pricing: Record<string, unknown>;
  pdfUrl?: string;
  webLinkToken: string;
  createdAt: string;
}

export interface ClientResponse {
  id: string;
  businessName: string;
  city: string;
  vertical: string;
  status: string;
  pipelineStatus: string;
  painScore?: number;
  outreachStage: string;
  createdAt: string;
}

export interface WebhookInput {
  url: string;
  events: string[];
}

export interface WebhookResponse {
  id: string;
  url: string;
  events: string[];
  secret: string;
  status: string;
  failureCount: number;
}

export interface PaginatedResponse<T> {
  data: T[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

class AuditsResource {
  constructor(private readonly client: ProposalEngineClient) {}

  async create(input: CreateAuditInput): Promise<AuditResponse> {
    return this.client.request('POST', '/audits', input);
  }

  async get(id: string): Promise<AuditResponse> {
    return this.client.request('GET', `/audits/${id}`);
  }

  async getFindings(id: string): Promise<FindingsResponse> {
    return this.client.request('GET', `/audits/${id}/findings`);
  }

  async getProposal(id: string): Promise<ProposalResponse> {
    return this.client.request('GET', `/audits/${id}/proposal`);
  }
}

class ClientsResource {
  constructor(private readonly client: ProposalEngineClient) {}

  async list(params?: { page?: number; limit?: number }): Promise<PaginatedResponse<ClientResponse>> {
    const qs = new URLSearchParams();
    if (params?.page) qs.set('page', String(params.page));
    if (params?.limit) qs.set('limit', String(params.limit));
    const query = qs.toString() ? `?${qs}` : '';
    return this.client.request('GET', `/clients${query}`);
  }

  async get(id: string): Promise<ClientResponse> {
    return this.client.request('GET', `/clients/${id}`);
  }
}

class OutreachResource {
  constructor(private readonly client: ProposalEngineClient) {}

  async trigger(leadId: string): Promise<{ leadId: string; scheduledAt: string; message: string }> {
    return this.client.request('POST', `/outreach/${leadId}`);
  }
}

class WebhooksResource {
  constructor(private readonly client: ProposalEngineClient) {}

  async register(input: WebhookInput): Promise<WebhookResponse> {
    return this.client.request('POST', '/webhooks', input);
  }

  async list(): Promise<{ data: WebhookResponse[] }> {
    return this.client.request('GET', '/webhooks');
  }

  async delete(id: string): Promise<void> {
    return this.client.request('DELETE', `/webhooks/${id}`);
  }
}

export class ProposalEngineClient {
  readonly audits: AuditsResource;
  readonly clients: ClientsResource;
  readonly outreach: OutreachResource;
  readonly webhooks: WebhooksResource;

  private readonly baseUrl: string;
  private readonly apiKey: string;

  constructor(config: ProposalEngineConfig) {
    this.apiKey = config.apiKey;
    this.baseUrl = (config.baseUrl ?? '').replace(/\/$/, '') + '/api/v1';
    this.audits = new AuditsResource(this);
    this.clients = new ClientsResource(this);
    this.outreach = new OutreachResource(this);
    this.webhooks = new WebhooksResource(this);
  }

  async request<T>(method: string, path: string, body?: unknown): Promise<T> {
    const url = `${this.baseUrl}${path}`;
    const response = await fetch(url, {
      method,
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: response.statusText }));
      throw new ProposalEngineError(response.status, error.error ?? 'Request failed', error.message);
    }

    if (response.status === 204) return undefined as T;
    return response.json();
  }
}

export class ProposalEngineError extends Error {
  constructor(
    public readonly statusCode: number,
    message: string,
    public readonly details?: string
  ) {
    super(message);
    this.name = 'ProposalEngineError';
  }
}

export default ProposalEngineClient;
