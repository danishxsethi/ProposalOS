import { Finding } from '@prisma/client';
import { z } from 'zod';

import { logger } from '@/lib/logger';
import { prisma } from '@/lib/prisma';

import { ProposalPricing, ProposalResult, TierConfig } from './types';
import { PainCluster } from '../diagnosis/types';

// Template configuration schema
export const TemplateConfigSchema = z.object({
  sections: z.array(z.string()), // Order of sections
  sectionTemplates: z.record(z.string(), z.string()), // Template per section
  fallbackTemplates: z.record(z.string(), z.string()), // Fallbacks for missing data
  conditionalSections: z.record(z.string(), z.string()), // Conditions for sections
});

export type TemplateConfig = z.infer<typeof TemplateConfigSchema>;

// Default template configuration
export const DEFAULT_TEMPLATE_CONFIG: TemplateConfig = {
  sections: [
    'executiveSummary',
    'painClusters',
    'pricing',
    'tiers',
    'assumptions',
    'disclaimers',
    'nextSteps',
    'comparisonReport',
  ],
  sectionTemplates: {
    executiveSummary: `Write a HIGH-IMPACT executive summary for a business audit. This is a sales tool. Reads like a senior consultant — authoritative, no hedging, no filler.

Business: {{business_name}}
Total Risks: {{total_findings}}
Critical Issues: {{painkillers_count}}

Top Priorities:
{{cluster_summaries}}

Key Metrics from Audit (you MUST cite at least 2 specific numbers — e.g., "Your page loads in 4.2 seconds", "PageSpeed 34/100", "7 reviews"):
{{key_metrics}}

MANDATORY REQUIREMENTS (follow exactly):
1. OPENING: First sentence MUST include the exact business name "{{business_name}}".
2. METRICS (CRITICAL): You MUST cite at least 2 specific numbers from key_metrics. Examples: "4.2 seconds", "34/100", "7 reviews", "3.2★". BAD: "Your website is slow." GOOD: "Your homepage loads in 4.2 seconds (PageSpeed 34/100)."
3. COMPETITOR: If competitor data exists in competitor_context, reference at least 1 competitor by name (e.g., "Smith Dental scores 85 on PageSpeed while you're at 34").
4. BODY: Hook with financial risk. Short, punchy sentences. Focus on LOST REVENUE and CUSTOMER TRUST. Every sentence must cite evidence — zero generic filler.
5. CLOSING: Clear recommendation + urgency. Call to action: "We can fix this." Include a specific next step or timeline.

Tone: Authoritative but helpful. No "we hope this finds you well." 4-6 sentences.

FINAL CHECK: Your summary must contain at least 2 specific numbers from key_metrics. If it doesn't, add one more sentence with a metric.

Write the summary:`,

    pricing: `Generate pricing recommendations for {{business_industry}} based on audit findings:

Findings: {{findings_count}}
Pain Points: {{pain_points}}
Effort Level: {{effort_level}}

Provide three-tier pricing structure with:
- Essentials: Basic fixes (3-5 items)
- Growth: Competitive improvements (6-10 items)  
- Premium: Comprehensive solution (all items)

Format as JSON with USD pricing.`,

    assumptions: `Generate standard assumptions for {{business_name}} proposal:

1. {{business_name}} will provide necessary access to accounts (Google Business Profile, website analytics)
2. Implementation timeline assumes standard business hours and reasonable response times
3. Pricing is based on the scope outlined in each tier; additional work may incur extra fees
4. Monthly reporting and ongoing support not included (available as add-on)
5. {{custom_assumptions}}`,

    disclaimers: `Generate standard disclaimers for {{business_name}} proposal:

1. Audit data collected on the date of analysis; some metrics may change over time
2. Competitor data is based on publicly available information
3. Results may vary based on industry, location, and market conditions
4. SEO and ranking improvements can take 3-6 months to materialize
5. {{custom_disclaimers}}`,

    nextSteps: `Generate next steps for {{business_name}} proposal:

1. Review this proposal and select your preferred tier
2. Reply to this email or schedule a 15-minute call to discuss
3. We'll send a simple contract and invoice
4. Kickoff call within 3 business days of signing
5. {{custom_next_steps}}`,
  },
  fallbackTemplates: {
    executiveSummary: `Based on our audit of {{business_name}}, we've identified critical issues that need immediate attention. With {{total_findings}} findings and {{painkillers_count}} critical issues, we recommend taking swift action to improve your online presence and customer experience.`,

    pricing: `Basic pricing structure for {{business_industry}}: Essentials $1,500, Growth $3,500, Premium $7,500`,

    assumptions: `Standard assumptions apply: access to accounts, standard business hours, pricing based on scope.`,

    disclaimers: `Audit data is current as of analysis date. Results may vary by market conditions.`,

    nextSteps: `1. Review proposal 2. Select tier 3. Schedule kickoff call`,
  },
  conditionalSections: {
    comparisonReport: 'has_competitor_data',
    executiveSummary: 'has_findings',
    pricing: 'has_clusters',
  },
};

// Cache for loaded prompts (reduces DB queries)
const promptCache = new Map<string, { template: string; timestamp: number }>();
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

export class ProposalTemplateSystem {
  private config: TemplateConfig;
  private environment: string;

  constructor(config: TemplateConfig = DEFAULT_TEMPLATE_CONFIG, environment?: string) {
    this.config = TemplateConfigSchema.parse(config);
    this.environment = environment || process.env.NODE_ENV || 'production';
  }

  /**
   * Load prompt from database with fallback to local template
   * P0: Enables prompt versioning without code deployment
   */
  async loadPromptFromDB(
    nodeId: string,
    options?: { environment?: string; useCache?: boolean }
  ): Promise<string> {
    const cacheKey = `${nodeId}:${options?.environment || this.environment}`;
    const useCache = options?.useCache ?? true;

    // Check cache first
    if (useCache) {
      const cached = promptCache.get(cacheKey);
      if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
        return cached.template;
      }
    }

    try {
      // Find active version for this node and environment
      const promptVersion = await prisma.promptVersion.findFirst({
        where: {
          nodeId,
          isActive: true,
          environment: options?.environment || this.environment,
        },
        orderBy: { createdAt: 'desc' },
      });

      if (promptVersion) {
        const template = promptVersion.promptText;
        // Update cache
        promptCache.set(cacheKey, { template, timestamp: Date.now() });
        return template;
      }

      // Fallback: try production environment
      if (options?.environment !== 'production') {
        const prodPrompt = await prisma.promptVersion.findFirst({
          where: {
            nodeId,
            isActive: true,
            environment: 'production',
          },
        });
        if (prodPrompt) {
          const template = prodPrompt.promptText;
          promptCache.set(cacheKey, { template, timestamp: Date.now() });
          return template;
        }
      }

      // No DB prompt found - return null to use local fallback
      return null;
    } catch (error) {
      logger.warn('Failed to load prompt from DB, using local fallback', {
        nodeId,
        error: String(error),
      });
      return null;
    }
  }

  /**
   * Pre-load prompts for multiple nodes (batch optimization)
   */
  async preloadPrompts(nodeIds: string[]): Promise<void> {
    const prompts = await prisma.promptVersion.findMany({
      where: {
        nodeId: { in: nodeIds },
        isActive: true,
        environment: this.environment,
      },
      orderBy: { createdAt: 'desc' },
    });

    // Deduplicate by nodeId (take first for each)
    const seen = new Set<string>();
    for (const prompt of prompts) {
      if (!seen.has(prompt.nodeId)) {
        seen.add(prompt.nodeId);
        const cacheKey = `${prompt.nodeId}:${this.environment}`;
        promptCache.set(cacheKey, {
          template: prompt.promptText,
          timestamp: Date.now(),
        });
      }
    }
  }

  /**
   * Fill template with dynamic data
   */
  fillTemplate(template: string, data: Record<string, any>): string {
    let filled = template;
    for (const [key, value] of Object.entries(data)) {
      const placeholder = `{{${key}}}`;
      filled = filled.replace(new RegExp(placeholder, 'g'), String(value));
    }
    return filled;
  }

  /**
   * Get template for specific section
   */
  getSectionTemplate(section: string, hasData: boolean = true): string {
    if (hasData && this.config.sectionTemplates[section]) {
      return this.config.sectionTemplates[section];
    }
    return this.config.fallbackTemplates[section] || `Default template for ${section}`;
  }

  /**
   * Check if section should be included based on conditions
   */
  shouldIncludeSection(section: string, context: Record<string, any>): boolean {
    const condition = this.config.conditionalSections[section];
    if (!condition) return true; // Include by default

    // Evaluate condition against context
    switch (condition) {
      case 'has_competitor_data':
        return !!context.competitorData;
      case 'has_findings':
        return (context.findings?.length || 0) > 0;
      case 'has_clusters':
        return (context.clusters?.length || 0) > 0;
      default:
        return true;
    }
  }

  /**
   * Get ordered sections for proposal
   */
  getOrderedSections(context: Record<string, any>): string[] {
    return this.config.sections.filter((section) => this.shouldIncludeSection(section, context));
  }

  /**
   * Apply fallbacks for missing sections
   */
  applyFallbacks(proposal: Partial<ProposalResult>, context: Record<string, any>): ProposalResult {
    const result = { ...proposal } as ProposalResult;

    if (!result.executiveSummary) {
      result.executiveSummary = this.fillTemplate(
        this.getSectionTemplate('executiveSummary', false),
        {
          business_name: context.businessName,
          total_findings: context.findings?.length || 0,
          painkillers_count: context.painkillers?.length || 0,
        }
      );
    }

    if (!result.pricing) {
      result.pricing = {
        essentials: 1500,
        growth: 3500,
        premium: 7500,
        currency: 'USD',
      };
    }

    if (!result.assumptions) {
      result.assumptions = [
        `${context.businessName} will provide necessary access to accounts`,
        'Implementation timeline assumes standard business hours',
        'Pricing is based on the scope outlined in each tier',
        'Monthly reporting and ongoing support not included',
      ];
    }

    if (!result.disclaimers) {
      result.disclaimers = [
        'Audit data collected on the date of analysis',
        'Competitor data is based on publicly available information',
        'Results may vary based on industry and market conditions',
        'SEO improvements can take 3-6 months to materialize',
      ];
    }

    if (!result.nextSteps) {
      result.nextSteps = [
        'Review this proposal and select your preferred tier',
        'Reply to this email or schedule a 15-minute call to discuss',
        "We'll send a simple contract and invoice",
        'Kickoff call within 3 business days of signing',
      ];
    }

    return result;
  }
}
