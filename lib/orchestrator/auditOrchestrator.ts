/**
 * @deprecated Use lib/audit/runner.ts instead. This file will be deleted in v2.0.
 * Three separate execution paths caused inconsistent results. We are migrating
 * all orchestration to runner.ts (MODULE_REGISTRY path).
 */
import { CostTracker } from '@/lib/costs/costTracker';
// Import all modules
import { captureScreenshots } from '@/lib/evidence/screenshotCapture';
import { logger } from '@/lib/logger';
import { runAccessibilityModule } from '@/lib/modules/accessibility';
import { runCitationsModule } from '@/lib/modules/citations';
import { runCompetitorModule } from '@/lib/modules/competitor';
import { runCompetitorStrategyModule } from '@/lib/modules/competitorStrategy';
import { runConversionModule } from '@/lib/modules/conversion';
import { runGBPModule } from '@/lib/modules/gbp';
import { runGbpDeepModule } from '@/lib/modules/gbpDeep';
import { runKeywordGapModule } from '@/lib/modules/keywordGap';
import { runMobileUXModule } from '@/lib/modules/mobileUX';
import { runPaidSearchModule } from '@/lib/modules/paidSearch';
import { runSecurityModule } from '@/lib/modules/security';
import { runTechStackModule } from '@/lib/modules/techStack';
import { runVisionModule } from '@/lib/modules/vision';
import { crawlWebsite } from '@/lib/modules/websiteCrawler';

import { DataBus, DataBusKey } from './dataBus';

interface OrchestratorInput {
  auditId: string;
  businessName: string;
  websiteUrl: string;
  city: string;
  industry: string;
  placeId?: string; // Optional if known
}

interface ModuleDefinition {
  id: string;
  phase: number;
  dependencies: DataBusKey[];
  outputKey?: DataBusKey;
  execute: (bus: DataBus, tracker?: CostTracker) => Promise<any>;
}

export interface OrchestratorResult {
  status: 'COMPLETE' | 'PARTIAL' | 'DEGRADED' | 'FAILED';
  findings: any[];
  evidenceSnapshots: any[];
  moduleTimings: Record<string, number>;
  progress: number;
  modulesCompleted?: string[];
}

export class AuditOrchestrator {
  private bus: DataBus;
  private modules: ModuleDefinition[] = [];
  private findings: any[] = [];
  private evidenceSnapshots: any[] = [];
  private timings: Record<string, number> = {};
  private succeededModules = new Set<string>();
  private tracker?: CostTracker;
  private onModuleComplete?: (moduleId: string, status: 'success' | 'failed') => Promise<void>;

  constructor(
    input: OrchestratorInput,
    tracker?: CostTracker,
    onModuleComplete?: (moduleId: string, status: 'success' | 'failed') => Promise<void>
  ) {
    this.bus = new DataBus();
    this.tracker = tracker;
    this.onModuleComplete = onModuleComplete;

    // Initialize Bus with Inputs
    this.bus.set('auditId', input.auditId);
    this.bus.set('businessName', input.businessName);
    this.bus.set('websiteUrl', input.websiteUrl);
    this.bus.set('city', input.city);
    this.bus.set('industry', input.industry);
    if (input.placeId) this.bus.set('placeData', { placeId: input.placeId, reviews: [] });

    this.registerModules();
  }

  /**
   * Register all available modules
   */
  private registerModules() {
    // PHASE 1: Independent
    this.modules.push({
      id: 'websiteCrawler',
      phase: 1,
      dependencies: ['websiteUrl'],
      outputKey: 'crawlResults',
      execute: async (bus) => {
        return await crawlWebsite({
          url: bus.get('websiteUrl')!,
          businessName: bus.get('businessName')!,
        });
      },
    });

    this.modules.push({
      id: 'gbp',
      phase: 1,
      dependencies: ['businessName', 'city'],
      outputKey: 'placeData',
      execute: async (bus, tracker) => {
        const res = await runGBPModule(
          {
            businessName: bus.get('businessName')!,
            city: bus.get('city')!,
          },
          tracker
        );
        return res;
      },
    });

    // PHASE 2: Dependents
    this.modules.push({
      id: 'competitor',
      phase: 2,
      dependencies: ['placeData', 'city'],
      outputKey: 'competitorData',
      execute: async (bus, tracker) => {
        const keyword = bus.get('industry')!;
        return await runCompetitorModule(
          {
            keyword,
            location: bus.get('city')!,
          },
          tracker
        );
      },
    });

    this.modules.push({
      id: 'gbpDeep',
      phase: 2,
      dependencies: ['placeData', 'websiteUrl'],
      outputKey: 'reputationData',
      execute: async (bus, tracker) => {
        const placeData = bus.get('placeData');
        if (!placeData) throw new Error('Missing placeData'); // Guard
        const placeId = placeData.placeId; // Inferred from PlaceDataResult

        return await runGbpDeepModule(
          {
            businessName: bus.get('businessName')!,
            city: bus.get('city')!,
            websiteUrl: bus.get('websiteUrl')!,
            placeId,
          },
          tracker
        );
      },
    });

    this.modules.push({
      id: 'mobileUX',
      phase: 2,
      dependencies: ['websiteUrl'],
      outputKey: 'mobileUxData',
      execute: async (bus, tracker) => {
        return await runMobileUXModule(
          {
            url: bus.get('websiteUrl')!,
            businessName: bus.get('businessName')!,
          },
          tracker
        );
      },
    });

    this.modules.push({
      id: 'conversion',
      phase: 2,
      dependencies: ['websiteUrl'],
      outputKey: 'conversionData',
      execute: async (bus, tracker) => {
        return await runConversionModule(
          {
            url: bus.get('websiteUrl')!,
            businessName: bus.get('businessName'),
            industry: bus.get('industry'),
          },
          tracker
        );
      },
    });

    this.modules.push({
      id: 'techStack',
      phase: 2,
      dependencies: ['websiteUrl'],
      outputKey: 'techStackData',
      execute: async (bus, tracker) => {
        return await runTechStackModule(
          {
            url: bus.get('websiteUrl')!,
          },
          tracker
        );
      },
    });

    this.modules.push({
      id: 'security',
      phase: 2,
      dependencies: ['websiteUrl'],
      outputKey: 'securityData',
      execute: async (bus, tracker) => {
        return await runSecurityModule(
          {
            url: bus.get('websiteUrl')!,
          },
          tracker
        );
      },
    });

    this.modules.push({
      id: 'accessibility',
      phase: 2,
      dependencies: ['websiteUrl'],
      outputKey: 'accessibilityData',
      execute: async (bus, tracker) => {
        return await runAccessibilityModule(
          {
            url: bus.get('websiteUrl')!,
          },
          tracker
        );
      },
    });

    this.modules.push({
      id: 'keywordGap',
      phase: 2,
      dependencies: ['industry', 'city', 'websiteUrl'],
      outputKey: 'keywordGapData',
      execute: async (bus, tracker) => {
        return await runKeywordGapModule(
          {
            businessName: bus.get('businessName')!,
            industry: bus.get('industry')!,
            city: bus.get('city')!,
            websiteUrl: bus.get('websiteUrl')!,
          },
          tracker
        );
      },
    });

    this.modules.push({
      id: 'citations',
      phase: 2,
      dependencies: ['businessName', 'city'],
      outputKey: 'citationData',
      execute: async (bus, tracker) => {
        return await runCitationsModule(
          {
            businessName: bus.get('businessName')!,
            city: bus.get('city')!,
            phone: '', // Added missing prop if needed, check citation module
          },
          tracker
        );
      },
    });

    this.modules.push({
      id: 'paidSearch',
      phase: 2,
      dependencies: ['businessName', 'city'],
      outputKey: 'paidSearchData',
      execute: async (bus, tracker) => {
        return await runPaidSearchModule(
          {
            businessName: bus.get('businessName')!,
            city: bus.get('city')!,
            url: bus.get('websiteUrl')!,
            businessType: bus.get('industry')!,
          },
          tracker
        );
      },
    });

    this.modules.push({
      id: 'competitorStrategy',
      phase: 2,
      dependencies: ['competitorData', 'websiteUrl'],
      outputKey: 'competitorStrategy',
      execute: async (bus, tracker) => {
        const compData = bus.get('competitorData');
        const rawCompData = compData?.evidenceSnapshots?.[0]?.rawResponse;
        const topComp = rawCompData?.topCompetitors?.[0];

        if (!topComp) {
          logger.warn('[Orchestrator] No competitor found for strategy');
          return { findings: [], evidenceSnapshots: [] };
        }

        return await runCompetitorStrategyModule(
          {
            businessName: bus.get('businessName')!,
            industry: bus.get('industry')!,
            city: bus.get('city')!,
            websiteUrl: bus.get('websiteUrl')!,
            competitorName: topComp.name,
            competitorWebsite: topComp.website || '',
            competitorPlaceId: topComp.placeId,
          },
          tracker
        );
      },
    });

    // PHASE 2.5: Screenshot Capture
    this.modules.push({
      id: 'screenshot',
      phase: 2,
      dependencies: ['websiteUrl', 'businessName'],
      outputKey: 'screenshotData',
      execute: async (bus, tracker) => {
        const auditId = bus.get('auditId') as string;
        if (!auditId) throw new Error('Audit ID required for screenshots');

        const tasks = [
          {
            auditId,
            options: {
              url: bus.get('websiteUrl')!,
              name: 'homepage',
              device: 'desktop' as const,
              annotate: false,
            },
          },
          {
            auditId,
            options: {
              url: bus.get('websiteUrl')!,
              name: 'mobile-homepage',
              device: 'mobile' as const,
              annotate: false,
            },
          },
        ];

        const results = await captureScreenshots(tasks);

        // Pass screenshots to the Native Vision Module (Prompt 20)
        const visionResult = await runVisionModule(
          {
            auditId,
            businessName: bus.get('businessName') as string,
            industry: bus.get('industry') as string,
            screenshots: results,
          },
          tracker
        );

        // We combine the raw screenshots (for Single-Pass context) with the natively generated visual findings
        return {
          findings: visionResult.findings,
          evidenceSnapshots: [
            {
              module: 'vision',
              source: 'screenshot',
              rawResponse: { screenshots: results },
              collectedAt: new Date(),
            },
            ...visionResult.evidenceSnapshots,
          ],
        };
      },
    });
  }

  /**
   * Run the Orchestrator
   */
  async run(): Promise<OrchestratorResult> {
    logger.warn(
      "[DEPRECATED] AuditOrchestrator.run() called. This path has 15 modules vs MODULE_REGISTRY's 27. " +
        'Migrate to runAudit() from lib/audit/runner.ts for full scan depth.'
    );
    logger.error('[DEPRECATION_METRIC] AuditOrchestrator used — caller should be migrated');

    logger.info('[Orchestrator] Starting Audit...');

    const runPhase = async (phase: number, timeoutMs: number) => {
      const phaseModules = this.modules.filter((m) => m.phase === phase);
      logger.info(
        { phase, modules: phaseModules.map((m) => m.id) },
        '[Orchestrator] Starting Phase'
      );

      // Find modules ready to run (dependencies met)
      const runnable = phaseModules.filter((m) => {
        const missing = m.dependencies.filter((d) => !this.bus.has(d));
        if (missing.length > 0) {
          logger.warn(
            { module: m.id, missing },
            '[Orchestrator] Skipping module due to missing dependencies'
          );
          return false;
        }
        return true;
      });

      if (runnable.length === 0) return;

      const promises = runnable.map(async (mod) => {
        const start = Date.now();
        try {
          const result = await Promise.race([
            mod.execute(this.bus, this.tracker),
            new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout')), timeoutMs)),
          ]);

          const duration = Date.now() - start;
          this.timings[mod.id] = duration;

          // Store output
          if (mod.outputKey && result) {
            this.bus.set(mod.outputKey, result);
          }

          // Collect findings & snapshots (standard Result interface)
          if (result && typeof result === 'object') {
            if ('findings' in result) this.findings.push(...(result.findings as any[]));
            if ('evidenceSnapshots' in result)
              this.evidenceSnapshots.push(...(result.evidenceSnapshots as any[]));
          }

          logger.info({ module: mod.id, duration }, '[Orchestrator] Module success');
          this.succeededModules.add(mod.id);
          if (this.onModuleComplete) await this.onModuleComplete(mod.id, 'success');
          return { id: mod.id, status: 'success' };
        } catch (error) {
          const duration = Date.now() - start;
          this.timings[mod.id] = duration;
          logger.error({ module: mod.id, error }, '[Orchestrator] Module failed');
          if (this.onModuleComplete) await this.onModuleComplete(mod.id, 'failed');
          return { id: mod.id, status: 'failed' };
        }
      });

      await Promise.allSettled(promises);
    };

    // Execution
    await runPhase(1, 30000); // 30s max
    await runPhase(2, 40000); // 40s max
    await runPhase(3, 20000); // 20s max

    // Calculate Status
    const totalModules = this.modules.length;
    const successCount = this.succeededModules.size;

    let status: OrchestratorResult['status'] = 'COMPLETE';
    if (successCount < totalModules * 0.25) status = 'FAILED';
    else if (successCount < totalModules * 0.5) status = 'DEGRADED';
    else if (successCount < totalModules) status = 'PARTIAL';

    const modulesCompleted = Array.from(this.succeededModules);
    return {
      status,
      findings: this.findings,
      evidenceSnapshots: this.evidenceSnapshots,
      moduleTimings: this.timings,
      progress: 100,
      modulesCompleted,
    };
  }
}
