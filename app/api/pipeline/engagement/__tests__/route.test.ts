import { describe, it, expect, beforeEach, vi } from 'vitest';
import { POST, GET } from '../route';
import { recordEvent } from '@/lib/pipeline/dealCloser';

// Mock the dealCloser module
vi.mock('@/lib/pipeline/dealCloser', () => ({
  recordEvent: vi.fn(),
}));

describe('Engagement Tracking API', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('POST /api/pipeline/engagement', () => {
    it('should record an email open event', async () => {
      const mockRequest = new Request('http://localhost/api/pipeline/engagement', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          leadId: 'lead-123',
          eventType: 'email_open',
          timestamp: '2024-01-15T10:00:00Z',
          metadata: { emailId: 'email-456' },
        }),
      });

      (recordEvent as any).mockResolvedValue(undefined);

      const response = await POST(mockRequest);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data).toEqual({
        success: true,
        message: 'Engagement event recorded',
        leadId: 'lead-123',
        eventType: 'email_open',
      });

      expect(recordEvent).toHaveBeenCalledWith(
        'lead-123',
        expect.objectContaining({
          leadId: 'lead-123',
          eventType: 'email_open',
          metadata: { emailId: 'email-456' },
        })
      );
    });

    it('should record an email click event', async () => {
      const mockRequest = new Request('http://localhost/api/pipeline/engagement', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          leadId: 'lead-123',
          eventType: 'email_click',
        }),
      });

      (recordEvent as any).mockResolvedValue(undefined);

      const response = await POST(mockRequest);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(recordEvent).toHaveBeenCalled();
    });

    it('should record a proposal view event', async () => {
      const mockRequest = new Request('http://localhost/api/pipeline/engagement', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          leadId: 'lead-123',
          eventType: 'proposal_view',
          metadata: { dwellSeconds: 120, scrollDepth: 0.8 },
        }),
      });

      (recordEvent as any).mockResolvedValue(undefined);

      const response = await POST(mockRequest);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
    });

    it('should record a tier interaction event', async () => {
      const mockRequest = new Request('http://localhost/api/pipeline/engagement', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          leadId: 'lead-123',
          eventType: 'tier_interaction',
          metadata: { tier: 'growth' },
        }),
      });

      (recordEvent as any).mockResolvedValue(undefined);

      const response = await POST(mockRequest);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
    });

    it('should return 400 for missing leadId', async () => {
      const mockRequest = new Request('http://localhost/api/pipeline/engagement', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          eventType: 'email_open',
        }),
      });

      const response = await POST(mockRequest);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toContain('Missing required fields');
    });

    it('should return 400 for missing eventType', async () => {
      const mockRequest = new Request('http://localhost/api/pipeline/engagement', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          leadId: 'lead-123',
        }),
      });

      const response = await POST(mockRequest);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toContain('Missing required fields');
    });

    it('should return 400 for invalid eventType', async () => {
      const mockRequest = new Request('http://localhost/api/pipeline/engagement', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          leadId: 'lead-123',
          eventType: 'invalid_event',
        }),
      });

      const response = await POST(mockRequest);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toContain('Invalid event type');
    });

    it('should handle recordEvent errors gracefully', async () => {
      const mockRequest = new Request('http://localhost/api/pipeline/engagement', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          leadId: 'lead-123',
          eventType: 'email_open',
        }),
      });

      (recordEvent as any).mockRejectedValue(new Error('Database error'));

      const response = await POST(mockRequest);
      const data = await response.json();

      expect(response.status).toBe(500);
      expect(data.error).toBe('Database error');
    });

    it('should use current timestamp if not provided', async () => {
      const mockRequest = new Request('http://localhost/api/pipeline/engagement', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          leadId: 'lead-123',
          eventType: 'email_open',
        }),
      });

      (recordEvent as any).mockResolvedValue(undefined);

      const response = await POST(mockRequest);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(recordEvent).toHaveBeenCalledWith(
        'lead-123',
        expect.objectContaining({
          leadId: 'lead-123',
          eventType: 'email_open',
          timestamp: expect.any(Date),
        })
      );
    });
  });

  describe('GET /api/pipeline/engagement', () => {
    it('should return service status', async () => {
      const mockRequest = new Request('http://localhost/api/pipeline/engagement', {
        method: 'GET',
      });

      const response = await GET();
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data).toEqual({
        service: 'engagement-tracking',
        status: 'operational',
        supportedEvents: ['email_open', 'email_click', 'proposal_view', 'tier_interaction'],
      });
    });
  });
});
