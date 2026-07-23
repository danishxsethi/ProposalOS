/**
 * Property-based tests for Privacy Controls
 *
 * Feature: deep-localization-cross-tenant-intelligence
 *
 * Task 16.2: Write property tests for privacy controls
 *   - Property 58: Privacy Concern Alerting
 *   - Property 59: Secure Data Deletion
 *
 * Requirements: 12.5, 12.6
 */

import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { PrivacyMonitor } from '../privacy-monitor';

// ---------------------------------------------------------------------------
// Arbitraries
// ---------------------------------------------------------------------------

/** Data containing an email address — always triggers a PII concern. */
const dataWithEmailArb = fc.record({
  someField: fc.string(),
  email: fc.emailAddress(),
});

/** Data containing a clientName field — always triggers a PII concern. */
const dataWithClientNameArb = fc.record({
  clientName: fc.string({ minLength: 1, maxLength: 50 }),
  someOtherField: fc.string(),
});

/** Various raw data types for secure deletion. */
const rawDataArb = fc.oneof(
  fc.string(),
  fc.record({ id: fc.uuid(), value: fc.integer() }),
  fc.array(fc.string()),
);

// ---------------------------------------------------------------------------
// Property 58: Privacy Concern Alerting
// Validates: Requirements 12.5
// ---------------------------------------------------------------------------

describe('Property 58: Privacy Concern Alerting', () => {
  /**
   * Feature: deep-localization-cross-tenant-intelligence, Property 58: Privacy Concern Alerting
   *
   * For any data containing an email address (PII), monitorData() SHALL
   * return alertSent=true and a non-null concern — operators are alerted
   * immediately on privacy concern detection.
   *
   * Validates: Requirements 12.5
   */
  it('should send alert immediately when data contains an email address', async () => {
    await fc.assert(
      fc.asyncProperty(dataWithEmailArb, async (data) => {
        const monitor = new PrivacyMonitor();
        const result = await monitor.monitorData(data);

        expect(result.alertSent).toBe(true);
        expect(result.concern).not.toBeNull();
        expect(result.concern?.type).toBe('pii_detected');
      }),
      { numRuns: 100 },
    );
  });

  /**
   * Feature: deep-localization-cross-tenant-intelligence, Property 58: Privacy Concern Alerting
   *
   * For any data containing a clientName field (PII), monitorData() SHALL
   * return alertSent=true and a non-null concern.
   *
   * Validates: Requirements 12.5
   */
  it('should send alert immediately when data contains a clientName field', async () => {
    await fc.assert(
      fc.asyncProperty(dataWithClientNameArb, async (data) => {
        const monitor = new PrivacyMonitor();
        const result = await monitor.monitorData(data);

        expect(result.alertSent).toBe(true);
        expect(result.concern).not.toBeNull();
        expect(result.concern?.type).toBe('pii_detected');
      }),
      { numRuns: 100 },
    );
  });

  /**
   * Feature: deep-localization-cross-tenant-intelligence, Property 58: Privacy Concern Alerting
   *
   * When a concern is detected, the alert must be recorded in the monitor's
   * internal alert log so operators can review it.
   *
   * Validates: Requirements 12.5
   */
  it('should record the alert in the internal alert log when PII is detected', async () => {
    await fc.assert(
      fc.asyncProperty(dataWithEmailArb, async (data) => {
        const monitor = new PrivacyMonitor();
        const result = await monitor.monitorData(data);

        const alerts = monitor.getAlerts();
        expect(alerts.length).toBeGreaterThanOrEqual(1);
        expect(alerts.some((a) => a.id === result.concern?.id)).toBe(true);
      }),
      { numRuns: 100 },
    );
  });
});

// ---------------------------------------------------------------------------
// Property 59: Secure Data Deletion
// Validates: Requirements 12.6
// ---------------------------------------------------------------------------

describe('Property 59: Secure Data Deletion', () => {
  /**
   * Feature: deep-localization-cross-tenant-intelligence, Property 59: Secure Data Deletion
   *
   * For any raw audit data, secureDelete() SHALL return success=true with a
   * deletedAt timestamp and a non-empty auditLogEntry — confirming the data
   * was securely deleted after anonymization.
   *
   * Validates: Requirements 12.6
   */
  it('should return success=true with a deletedAt timestamp and non-empty auditLogEntry', async () => {
    await fc.assert(
      fc.asyncProperty(rawDataArb, async (rawData) => {
        const monitor = new PrivacyMonitor();
        const result = await monitor.secureDelete(rawData);

        expect(result.success).toBe(true);
        expect(result.deletedAt).toBeInstanceOf(Date);
        expect(result.auditLogEntry).toBeTruthy();
        expect(result.auditLogEntry.length).toBeGreaterThan(0);
      }),
      { numRuns: 100 },
    );
  });

  /**
   * Feature: deep-localization-cross-tenant-intelligence, Property 59: Secure Data Deletion
   *
   * The deletedAt timestamp returned by secureDelete() SHALL be a valid
   * recent date (not in the future, not epoch zero).
   *
   * Validates: Requirements 12.6
   */
  it('should return a valid recent deletedAt timestamp', async () => {
    const before = new Date();

    await fc.assert(
      fc.asyncProperty(rawDataArb, async (rawData) => {
        const monitor = new PrivacyMonitor();
        const result = await monitor.secureDelete(rawData);

        const after = new Date();
        expect(result.deletedAt.getTime()).toBeGreaterThanOrEqual(before.getTime());
        expect(result.deletedAt.getTime()).toBeLessThanOrEqual(after.getTime() + 1000);
      }),
      { numRuns: 100 },
    );
  });

  /**
   * Feature: deep-localization-cross-tenant-intelligence, Property 59: Secure Data Deletion
   *
   * The auditLogEntry produced by secureDelete() SHALL contain the ISO
   * timestamp of deletion, providing a verifiable audit trail.
   *
   * Validates: Requirements 12.6
   */
  it('should include an ISO timestamp in the auditLogEntry', async () => {
    await fc.assert(
      fc.asyncProperty(rawDataArb, async (rawData) => {
        const monitor = new PrivacyMonitor();
        const result = await monitor.secureDelete(rawData);

        // The audit log entry must contain the deletedAt ISO string
        expect(result.auditLogEntry).toContain(result.deletedAt.toISOString());
      }),
      { numRuns: 100 },
    );
  });
});
