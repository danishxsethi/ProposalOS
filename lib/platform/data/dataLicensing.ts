/**
 * Data Licensing
 *
 * Generates anonymized industry benchmark reports from aggregated audit data,
 * exports datasets for research firms, and tracks licensing revenue.
 *
 * Privacy guarantees: no PII, no tenant identifiers, no business names, no
 * contact information is ever included in any output from this module.
 *
 * Requirements: 19.2, 19.6
 */

// ─── Types ────────────────────────────────────────────────────────────────────

export interface DateRange {
  start: Date;
  end: Date;
}

/** Anonymized benchmark data for a single industry vertical. */
export interface BenchmarkReport {
  vertical: string;
  dateRange: DateRange;
  generatedAt: Date;
  /** Average audit scores per category (e.g. 'seo', 'speed', 'reputation'). */
  averageScoresByCategory: Record<string, number>;
  /** Win rate (0–1) for proposals in this vertical. */
  winRate: number;
  /** Frequency map of common finding types across audits in this vertical. */
  commonFindingsFrequency: Record<string, number>;
  /** Total number of anonymized audits that contributed to this report. */
  sampleSize: number;
}

/** Filters for dataset exports. */
export interface DatasetExportFilters {
  vertical?: string;
  dateRange?: DateRange;
  /** Minimum number of audits a vertical must have to be included. */
  minSampleSize?: number;
}

/** A single licensing revenue event. */
export interface LicensingRevenueEvent {
  id: string;
  customerId: string;
  amount: number; // in cents
  licenseType: string;
  recordedAt: Date;
}

// ─── In-Memory Stores ─────────────────────────────────────────────────────────

/**
 * Anonymized audit records used to generate benchmarks and exports.
 * These records must never contain tenant IDs, business names, or contact info.
 */
interface AnonymizedAuditRecord {
  vertical: string;
  recordedAt: Date;
  scoresByCategory: Record<string, number>;
  findingTypes: string[];
  outcome: 'won' | 'lost' | 'ghosted';
}

const auditStore: AnonymizedAuditRecord[] = [];

/** Licensing revenue events keyed by customerId. */
const revenueStore = new Map<string, LicensingRevenueEvent[]>();

let eventCounter = 0;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function generateId(prefix: string): string {
  eventCounter += 1;
  return `${prefix}_${eventCounter}_${Date.now().toString(36)}`;
}

function recordsInRange(records: AnonymizedAuditRecord[], dateRange: DateRange): AnonymizedAuditRecord[] {
  return records.filter(
    (r) => r.recordedAt >= dateRange.start && r.recordedAt <= dateRange.end,
  );
}

// ─── Benchmark Report ─────────────────────────────────────────────────────────

/**
 * Generate an anonymized industry benchmark report for a given vertical and
 * date range. The report aggregates audit data across all tenants but contains
 * no PII, no tenant identifiers, and no business-specific information.
 *
 * @param vertical  The industry vertical to benchmark (e.g. 'restaurant', 'dental')
 * @param dateRange The date range to include in the report
 * @returns BenchmarkReport with aggregated, anonymized statistics
 */
export function generateBenchmarkReport(
  vertical: string,
  dateRange: DateRange,
): BenchmarkReport {
  if (!vertical) throw new Error('vertical is required');
  if (!dateRange?.start || !dateRange?.end) throw new Error('dateRange with start and end is required');
  if (dateRange.start > dateRange.end) throw new Error('dateRange.start must be before dateRange.end');

  const verticalRecords = recordsInRange(
    auditStore.filter((r) => r.vertical === vertical),
    dateRange,
  );

  const sampleSize = verticalRecords.length;

  // Average scores by category
  const categoryTotals: Record<string, { sum: number; count: number }> = {};
  for (const record of verticalRecords) {
    for (const [category, score] of Object.entries(record.scoresByCategory)) {
      if (!categoryTotals[category]) {
        categoryTotals[category] = { sum: 0, count: 0 };
      }
      categoryTotals[category].sum += score;
      categoryTotals[category].count += 1;
    }
  }

  const averageScoresByCategory: Record<string, number> = {};
  for (const [category, { sum, count }] of Object.entries(categoryTotals)) {
    averageScoresByCategory[category] = count > 0 ? sum / count : 0;
  }

  // Win rate
  const wonCount = verticalRecords.filter((r) => r.outcome === 'won').length;
  const winRate = sampleSize > 0 ? wonCount / sampleSize : 0;

  // Common findings frequency
  const findingsFrequency: Record<string, number> = {};
  for (const record of verticalRecords) {
    for (const finding of record.findingTypes) {
      findingsFrequency[finding] = (findingsFrequency[finding] ?? 0) + 1;
    }
  }

  return {
    vertical,
    dateRange,
    generatedAt: new Date(),
    averageScoresByCategory,
    winRate,
    commonFindingsFrequency: findingsFrequency,
    sampleSize,
  };
}

// ─── Dataset Export ───────────────────────────────────────────────────────────

/**
 * Export an anonymized dataset for research firms in JSON or CSV format.
 * All records are pre-anonymized — no tenant IDs, business names, or contact
 * information are included.
 *
 * @param format  'json' or 'csv'
 * @param filters Optional filters to narrow the export
 * @returns A string containing the serialized dataset
 */
export function exportDataset(
  format: 'json' | 'csv',
  filters: DatasetExportFilters = {},
): string {
  let records = [...auditStore];

  if (filters.vertical) {
    records = records.filter((r) => r.vertical === filters.vertical);
  }

  if (filters.dateRange) {
    records = recordsInRange(records, filters.dateRange);
  }

  if (filters.minSampleSize !== undefined && filters.minSampleSize > 0) {
    // Group by vertical and filter out verticals below the minimum sample size
    const countByVertical: Record<string, number> = {};
    for (const r of records) {
      countByVertical[r.vertical] = (countByVertical[r.vertical] ?? 0) + 1;
    }
    records = records.filter(
      (r) => (countByVertical[r.vertical] ?? 0) >= (filters.minSampleSize ?? 0),
    );
  }

  if (format === 'json') {
    return JSON.stringify(
      records.map((r) => ({
        vertical: r.vertical,
        recordedAt: r.recordedAt.toISOString(),
        scoresByCategory: r.scoresByCategory,
        findingTypes: r.findingTypes,
        outcome: r.outcome,
      })),
      null,
      2,
    );
  }

  // CSV format
  if (records.length === 0) {
    return 'vertical,recordedAt,outcome,findingTypes\n';
  }

  const categoryKeys = Array.from(
    new Set(records.flatMap((r) => Object.keys(r.scoresByCategory))),
  ).sort();

  const header = ['vertical', 'recordedAt', 'outcome', ...categoryKeys, 'findingTypes'].join(',');

  const rows = records.map((r) => {
    const categoryValues = categoryKeys.map((k) =>
      r.scoresByCategory[k] !== undefined ? String(r.scoresByCategory[k]) : '',
    );
    return [
      r.vertical,
      r.recordedAt.toISOString(),
      r.outcome,
      ...categoryValues,
      `"${r.findingTypes.join(';')}"`,
    ].join(',');
  });

  return [header, ...rows].join('\n') + '\n';
}

// ─── Licensing Revenue Tracking ───────────────────────────────────────────────

/**
 * Record a licensing revenue event for a customer.
 *
 * @param customerId  The research firm or partner customer ID
 * @param amount      Revenue amount in cents
 * @param licenseType Type of license (e.g. 'benchmark_report', 'dataset_export', 'api_access')
 * @returns The recorded LicensingRevenueEvent
 */
export function trackLicensingRevenue(
  customerId: string,
  amount: number,
  licenseType: string = 'dataset_export',
): LicensingRevenueEvent {
  if (!customerId) throw new Error('customerId is required');
  if (amount < 0) throw new Error('amount must be non-negative');

  const event: LicensingRevenueEvent = {
    id: generateId('lic'),
    customerId,
    amount,
    licenseType,
    recordedAt: new Date(),
  };

  const existing = revenueStore.get(customerId) ?? [];
  existing.push(event);
  revenueStore.set(customerId, existing);

  return event;
}

/**
 * Retrieve all licensing revenue events for a customer.
 */
export function getLicensingRevenueEvents(customerId: string): LicensingRevenueEvent[] {
  return [...(revenueStore.get(customerId) ?? [])];
}

/**
 * Get total licensing revenue across all customers, optionally filtered by
 * date range.
 */
export function getTotalLicensingRevenue(dateRange?: DateRange): number {
  let total = 0;
  for (const events of revenueStore.values()) {
    for (const event of events) {
      if (
        !dateRange ||
        (event.recordedAt >= dateRange.start && event.recordedAt <= dateRange.end)
      ) {
        total += event.amount;
      }
    }
  }
  return total;
}

// ─── Seed / Test Helpers ──────────────────────────────────────────────────────

/**
 * Add an anonymized audit record to the in-memory store.
 * This is the entry point for the pipeline to contribute data to the
 * licensing dataset. Records must be pre-anonymized before calling this.
 *
 * @param record Anonymized audit record (no PII, no tenant identifiers)
 */
export function addAnonymizedAuditRecord(record: {
  vertical: string;
  recordedAt: Date;
  scoresByCategory: Record<string, number>;
  findingTypes: string[];
  outcome: 'won' | 'lost' | 'ghosted';
}): void {
  auditStore.push({ ...record });
}

/**
 * Clear all stored data (intended for test isolation only).
 */
export function _clearStore(): void {
  auditStore.length = 0;
  revenueStore.clear();
  eventCounter = 0;
}
