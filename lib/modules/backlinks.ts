import { z } from 'zod';

import { CostTracker } from '@/lib/costs/costTracker';
import { logger } from '@/lib/logger';

import { normalizeConfidence } from './findingGenerator';
import { AuditModuleResult, createEvidence, Finding } from './types';

const BacklinkRecordSchema = z.object({
  sourceUrl: z.string().url(),
  targetUrl: z.string().url(),
  anchorText: z.string().max(500).optional(),
  follow: z.boolean().nullable().optional(),
  firstSeen: z.string().datetime().optional(),
  lastSeen: z.string().datetime().optional(),
});

const BacklinkProviderResponseSchema = z.object({
  reportId: z.string().min(1),
  reportUrl: z.string().url(),
  generatedAt: z.string().datetime(),
  sourceScope: z.string().min(1),
  backlinks: z.array(BacklinkRecordSchema).max(1_000),
  totalBacklinks: z.number().int().nonnegative().optional(),
  totalReferringDomains: z.number().int().nonnegative().optional(),
  authority: z
    .object({
      metric: z.string().min(1),
      value: z.number().finite(),
      scaleMax: z.number().positive(),
    })
    .optional(),
});

export interface BacklinksModuleInput {
  websiteUrl: string;
  businessName: string;
  city: string;
  signal?: AbortSignal;
}

export interface BacklinkProvider {
  id: string;
  fetchProfile(input: {
    domain: string;
    maxResults: number;
    signal?: AbortSignal;
  }): Promise<unknown>;
}

export interface NormalizedBacklink {
  sourceUrl: string;
  sourceDomain: string;
  targetUrl: string;
  anchorText?: string;
  follow?: boolean | null;
  firstSeen?: string;
  lastSeen?: string;
}

export interface BacklinkAnalysis {
  provider: string;
  reportId: string;
  reportUrl: string;
  generatedAt: string;
  sourceScope: string;
  backlinks: NormalizedBacklink[];
  backlinkCount: number;
  referringDomains: string[];
  referringDomainCount: number;
  followCount: number | null;
  nofollowCount: number | null;
  authority?: { metric: string; value: number; scaleMax: number };
}

export async function runBacklinksModule(
  input: BacklinksModuleInput,
  _tracker?: CostTracker,
  provider?: BacklinkProvider
): Promise<AuditModuleResult> {
  logger.info({ business: input.businessName }, '[Backlinks] Starting provider analysis');

  if (!provider) {
    return {
      findings: [],
      evidenceSnapshots: [],
      execution: {
        state: 'unavailable',
        reason: 'No real backlink data provider is selected or configured',
      },
    };
  }

  try {
    const domain = normalizeDomain(input.websiteUrl);
    const raw = await provider.fetchProfile({ domain, maxResults: 1_000, signal: input.signal });
    const analysis = normalizeBacklinkProviderResponse(provider.id, raw);
    const findings = generateBacklinkFindings(analysis, input);

    return {
      findings,
      evidenceSnapshots: [
        {
          module: 'backlinks',
          source: provider.id,
          rawResponse: analysis,
          collectedAt: new Date(analysis.generatedAt),
        },
      ],
      execution: { state: 'complete' },
    };
  } catch (error) {
    if (input.signal?.aborted) throw input.signal.reason ?? error;
    logger.error({ error, provider: provider.id }, '[Backlinks] Provider analysis failed');
    return {
      findings: [],
      evidenceSnapshots: [],
      execution: {
        state: 'failed',
        reason: error instanceof Error ? error.message : 'Backlink provider failed',
      },
    };
  }
}

export function normalizeBacklinkProviderResponse(
  provider: string,
  raw: unknown
): BacklinkAnalysis {
  const parsed = BacklinkProviderResponseSchema.parse(raw);
  if (!isHttpUrl(parsed.reportUrl)) {
    throw new Error('Backlink provider reportUrl must use HTTP or HTTPS');
  }
  const deduped = new Map<string, NormalizedBacklink>();

  for (const record of parsed.backlinks) {
    if (!isHttpUrl(record.sourceUrl) || !isHttpUrl(record.targetUrl)) continue;
    const sourceUrl = normalizeHttpUrl(record.sourceUrl);
    const targetUrl = normalizeHttpUrl(record.targetUrl);
    const key = `${sourceUrl}\n${targetUrl}\n${record.anchorText || ''}`;
    if (deduped.has(key)) continue;
    deduped.set(key, {
      sourceUrl,
      sourceDomain: normalizeDomain(sourceUrl),
      targetUrl,
      anchorText: record.anchorText,
      follow: record.follow,
      firstSeen: record.firstSeen,
      lastSeen: record.lastSeen,
    });
  }

  const backlinks = [...deduped.values()];
  const referringDomains = [...new Set(backlinks.map((record) => record.sourceDomain))].sort();
  const followValues = backlinks.filter((record) => typeof record.follow === 'boolean');

  return {
    provider,
    reportId: parsed.reportId,
    reportUrl: parsed.reportUrl,
    generatedAt: parsed.generatedAt,
    sourceScope: parsed.sourceScope,
    backlinks,
    backlinkCount: parsed.totalBacklinks ?? backlinks.length,
    referringDomains,
    referringDomainCount: parsed.totalReferringDomains ?? referringDomains.length,
    followCount:
      followValues.length > 0
        ? followValues.filter((record) => record.follow === true).length
        : null,
    nofollowCount:
      followValues.length > 0
        ? followValues.filter((record) => record.follow === false).length
        : null,
    authority: parsed.authority,
  };
}

export function normalizeDomain(value: string): string {
  const parsed = new URL(value.includes('://') ? value : `https://${value}`);
  return parsed.hostname
    .toLowerCase()
    .replace(/^www\./, '')
    .replace(/\.$/, '');
}

function generateBacklinkFindings(
  analysis: BacklinkAnalysis,
  input: BacklinksModuleInput
): Finding[] {
  const findings: Finding[] = [];
  const collectedAt = analysis.generatedAt;

  if (analysis.backlinkCount === 0 && analysis.referringDomainCount === 0) {
    findings.push({
      type: 'VITAMIN',
      category: 'Authority',
      title: 'No Backlinks Reported by the Configured Provider',
      description: `${analysis.provider} reported zero backlinks and zero referring domains for ${normalizeDomain(input.websiteUrl)} within its stated data scope.`,
      impactScore: 6,
      confidenceScore: normalizeConfidence(90, '0-100'),
      evidence: [
        createEvidence({
          pointer: analysis.reportUrl,
          source: analysis.provider,
          collected_at: collectedAt,
          type: 'metric',
          value: 0,
          label: 'Provider Backlink Count',
          raw: {
            reportId: analysis.reportId,
            sourceScope: analysis.sourceScope,
            referringDomains: 0,
          },
        }),
      ],
      metrics: {
        provider: analysis.provider,
        backlinkCount: 0,
        referringDomainCount: 0,
        sourceScope: analysis.sourceScope,
      },
      effortEstimate: 'HIGH',
      recommendedFix: [
        'Earn relevant editorial links through useful resources, partnerships, and legitimate local coverage',
        'Avoid paid link schemes and automated link exchanges',
      ],
    });
  }

  if (
    analysis.authority &&
    analysis.authority.scaleMax > 0 &&
    analysis.authority.value / analysis.authority.scaleMax < 0.3
  ) {
    findings.push({
      type: 'VITAMIN',
      category: 'Authority',
      title: `Low ${analysis.provider} ${analysis.authority.metric}`,
      description: `${analysis.provider} reports ${analysis.authority.metric} ${analysis.authority.value}/${analysis.authority.scaleMax}. This is a provider-specific metric, not a Google ranking score.`,
      impactScore: 5,
      confidenceScore: normalizeConfidence(85, '0-100'),
      evidence: [
        createEvidence({
          pointer: analysis.reportUrl,
          source: analysis.provider,
          collected_at: collectedAt,
          type: 'metric',
          value: analysis.authority.value,
          label: `${analysis.authority.metric} (${analysis.provider})`,
          raw: { scaleMax: analysis.authority.scaleMax, reportId: analysis.reportId },
        }),
      ],
      metrics: {
        provider: analysis.provider,
        authorityMetric: analysis.authority.metric,
        authorityValue: analysis.authority.value,
        authorityScaleMax: analysis.authority.scaleMax,
      },
      effortEstimate: 'HIGH',
      recommendedFix: [
        'Prioritize relevant editorial links from trusted organizations in the same market',
      ],
    });
  }

  return findings;
}

function isHttpUrl(value: string): boolean {
  try {
    return ['http:', 'https:'].includes(new URL(value).protocol);
  } catch {
    return false;
  }
}

function normalizeHttpUrl(value: string): string {
  const parsed = new URL(value);
  parsed.hash = '';
  parsed.hostname = parsed.hostname.toLowerCase().replace(/^www\./, '');
  if (
    (parsed.protocol === 'https:' && parsed.port === '443') ||
    (parsed.protocol === 'http:' && parsed.port === '80')
  ) {
    parsed.port = '';
  }
  return parsed.toString();
}
