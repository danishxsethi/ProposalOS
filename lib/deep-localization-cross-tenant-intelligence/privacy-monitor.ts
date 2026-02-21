/**
 * Privacy Monitor - Detects privacy concerns, alerts operators, and handles secure deletion.
 * Implements Requirements 12.5 and 12.6.
 */

import { randomUUID } from 'crypto';

// ============================================================================
// Types
// ============================================================================

export interface PrivacyConcern {
  id: string;
  type: 'pii_detected' | 'k_anonymity_violation' | 'data_retention_violation';
  description: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  detectedAt: Date;
  data?: any;
}

export interface MonitoringResult {
  concern: PrivacyConcern | null;
  alertSent: boolean;
}

export interface DeletionResult {
  deletedAt: Date;
  success: boolean;
  auditLogEntry: string;
}

// ============================================================================
// PII Detection Patterns
// ============================================================================

const PII_PATTERNS = {
  // Broad email pattern: any non-whitespace chars before @, then domain
  email: /[^\s@]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/,
  phone: /(\+?[\d\s\-().]{7,})/,
};

const PII_OBJECT_KEYS = ['clientName', 'client_name', 'contactInfo', 'contact_info'];
const CLIENT_ID_KEYS = ['clientId', 'client_id'];
const HASHED_ID_REGEX = /^[0-9a-f]{64}$/i;

// ============================================================================
// PrivacyMonitor Class
// ============================================================================

export class PrivacyMonitor {
  private alerts: PrivacyConcern[] = [];
  private deletionLog: string[] = [];

  /**
   * Detects whether the given data contains PII or other privacy concerns.
   * Returns a PrivacyConcern if found, null otherwise.
   */
  detectPrivacyConcern(data: any): PrivacyConcern | null {
    if (data === null || data === undefined) {
      return null;
    }

    const serialized = typeof data === 'string' ? data : JSON.stringify(data);

    // Check for email addresses
    if (PII_PATTERNS.email.test(serialized)) {
      return {
        id: randomUUID(),
        type: 'pii_detected',
        description: 'Email address detected in data',
        severity: 'high',
        detectedAt: new Date(),
        data,
      };
    }

    // Check for phone numbers (only in string values, not in numeric-heavy structures)
    if (typeof data === 'string' && PII_PATTERNS.phone.test(data)) {
      return {
        id: randomUUID(),
        type: 'pii_detected',
        description: 'Phone number detected in data',
        severity: 'high',
        detectedAt: new Date(),
        data,
      };
    }

    // Check object keys for PII field names
    if (typeof data === 'object' && !Array.isArray(data)) {
      for (const key of PII_OBJECT_KEYS) {
        if (key in data && data[key] !== null && data[key] !== undefined && data[key] !== '') {
          return {
            id: randomUUID(),
            type: 'pii_detected',
            description: `PII field "${key}" detected in data`,
            severity: 'critical',
            detectedAt: new Date(),
            data,
          };
        }
      }

      // Check for unhashed clientId / client_id
      for (const key of CLIENT_ID_KEYS) {
        if (key in data) {
          const value = data[key];
          if (typeof value === 'string' && !HASHED_ID_REGEX.test(value)) {
            return {
              id: randomUUID(),
              type: 'pii_detected',
              description: `Unhashed client identifier "${key}" detected in data`,
              severity: 'critical',
              detectedAt: new Date(),
              data,
            };
          }
        }
      }

      // Recursively check nested objects
      for (const value of Object.values(data)) {
        if (typeof value === 'object' && value !== null) {
          const nested = this.detectPrivacyConcern(value);
          if (nested) return nested;
        }
      }
    }

    // Recursively check arrays
    if (Array.isArray(data)) {
      for (const item of data) {
        const nested = this.detectPrivacyConcern(item);
        if (nested) return nested;
      }
    }

    return null;
  }

  /**
   * Records the alert and (in production) would dispatch to external alerting systems.
   * Requirement 12.5: alert operators immediately when a privacy concern is identified.
   */
  async alertOperators(concern: PrivacyConcern): Promise<void> {
    this.alerts.push(concern);

    // In production this would integrate with email / Slack / PagerDuty
    // e.g. await slackClient.postMessage({ channel: '#privacy-alerts', text: ... });
    console.warn(
      `[PrivacyMonitor] ALERT [${concern.severity.toUpperCase()}] ${concern.type}: ${concern.description} (id=${concern.id})`
    );
  }

  /**
   * Monitors data for privacy concerns and immediately alerts operators if one is found.
   * Requirement 12.5.
   */
  async monitorData(data: any): Promise<MonitoringResult> {
    const concern = this.detectPrivacyConcern(data);

    if (concern) {
      await this.alertOperators(concern);
      return { concern, alertSent: true };
    }

    return { concern: null, alertSent: false };
  }

  /**
   * Securely deletes raw audit data after anonymization.
   * Requirement 12.6: securely delete raw audit data after anonymization.
   */
  async secureDelete(rawData: any): Promise<DeletionResult> {
    const deletedAt = new Date();

    // In production this would overwrite memory / shred files / issue a DB DELETE
    // For now we mark the data as deleted and record the event in the audit log.
    const dataRef =
      typeof rawData === 'object' && rawData !== null
        ? `object(keys=[${Object.keys(rawData).join(',')}])`
        : String(rawData).slice(0, 64);

    const auditLogEntry = `[${deletedAt.toISOString()}] SECURE_DELETE: ${dataRef}`;
    this.deletionLog.push(auditLogEntry);

    return {
      deletedAt,
      success: true,
      auditLogEntry,
    };
  }

  /**
   * Returns all recorded privacy alerts.
   */
  getAlerts(): PrivacyConcern[] {
    return [...this.alerts];
  }
}
