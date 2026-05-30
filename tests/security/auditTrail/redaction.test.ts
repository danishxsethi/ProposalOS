import { describe, expect, it } from 'vitest';
import { redactPayload, recordAuditTrailEvent } from '@/lib/observability/auditTrail';

describe('Audit Trail Payload Redaction', () => {
  it('should recursively redact sensitive fields in a flat object', () => {
    const payload = {
      apiKey: 'secret_api_key_123',
      password: 'my-super-secret-password',
      username: 'johndoe',
      email: 'john@example.com',
      token: 'some_jwt_token',
    };

    const redacted = redactPayload(payload);

    expect(redacted.apiKey).toBe('[REDACTED]');
    expect(redacted.password).toBe('[REDACTED]');
    expect(redacted.token).toBe('[REDACTED]');
    expect(redacted.username).toBe('johndoe');
    expect(redacted.email).toBe('john@example.com');
  });

  it('should recursively redact nested objects and arrays', () => {
    const payload = {
      user: {
        profile: {
          passwd: 'oldpassword',
          name: 'Jane',
        },
        sessions: [
          { token: 'session_1', active: true },
          { token: 'session_2', active: false },
        ],
      },
      stripeSignature: 'sha256=abcdef',
    };

    const redacted = redactPayload(payload);

    expect(redacted.user.profile.passwd).toBe('[REDACTED]');
    expect(redacted.user.profile.name).toBe('Jane');
    expect(redacted.user.sessions[0].token).toBe('[REDACTED]');
    expect(redacted.user.sessions[0].active).toBe(true);
    expect(redacted.user.sessions[1].token).toBe('[REDACTED]');
    expect(redacted.stripeSignature).toBe('[REDACTED]');
  });

  it('should handle circular references safely without infinite loops', () => {
    const payload: any = {
      name: 'CircularObj',
      token: 'secret_token',
    };
    payload.self = payload;

    const redacted = redactPayload(payload);

    expect(redacted.token).toBe('[REDACTED]');
    expect(redacted.name).toBe('CircularObj');
    expect(redacted.self).toBe('[Circular]');
  });

  it('should enforce metadata size boundaries and throw when payload exceeds 100 KB', async () => {
    // Large payload: 105 KB
    const largePayload = {
      largeData: 'a'.repeat(105 * 1024),
    };

    await expect(
      recordAuditTrailEvent({
        eventType: 'audit.requested',
        payload: largePayload,
      })
    ).rejects.toThrow('AuditTrailEvent payload size exceeds 100 KB limit.');
  });
});
