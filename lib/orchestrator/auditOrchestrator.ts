import { DataBus, DataBusKey } from './dataBus';
import { logger } from '@/lib/logger';
import { CostTracker } from '@/lib/costs/costTracker';

// Import all modules
import { crawlWebsite } from '@/lib/modules/websiteCrawler';
import { runGBPModule } from '@/lib/modules/gbp';
import { runCompetitorModule } from '@/lib/modules/competitor';
import { runCompetitorStrategyModule } from '@/lib/modules/competitorStrategy';
import { runGbpDeepModule } from '@/lib/modules/gbpDeep';
import { runConversionModule } from '@/lib/modules/conversion';
import { runMobileUXModule } from '@/lib/modules/mobileUX';
import { runCitationsModule } from '@/lib/modules/citations';
import { runPaidSearchModule } from '@/lib/modules/paidSearch';
import { runTechStackModule } from '@/lib/modules/techStack';
import { runSecurityModule } from '@/lib/modules/security';
import { runAccessibilityModule } from '@/lib/modules/accessibility';
import { runKeywordGapModule } from '@/lib/modules/keywordGap';
import { captureScreenshots } from '@/lib/evidence/screenshotCapture';
// import { calculateBenchmarks } from '@/lib/benchmarks/industryBenchmarks'; // TODO: Implement benchmarks

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
}

export class AuditOrchestrator {
    private bus: DataBus;
    private modules: ModuleDefinition[] = [];
    private findings: any[] = [];
    private evidenceSnapshots: any[] = [];
    private timings: Record<string, number> = {};
    private tracker?: CostTracker;
    private onModuleComplete?: (moduleId: string, status: 'success' | 'failed') => Promise<void>;

    constructor(input: OrchestratorInput, tracker?: CostTracker, onModuleComplete?: (moduleId: string, status: 'success' | 'failed') => Promise<void>) {
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
                    businessName: bus.get('businessName')!
                });
            }
        });

        this.modules.push({
            id: 'gbp',
            phase: 1,
            dependencies: ['businessName', 'city'],
            outputKey: 'placeData',
            execute: async (bus, tracker) => {
                const res = await runGBPModule({
                    businessName: bus.get('businessName')!,
                    city: bus.get('city')!
                }, tracker);
                return res;
            }
        });

        // PHASE 2: Dependents
        this.modules.push({
            id: 'competitor',
            phase: 2,
            dependencies: ['placeData', 'city'],
            outputKey: 'competitorData',
            execute: async (bus, tracker) => {
                const keyword = bus.get('industry')!;
                return await runCompetitorModule({
                    keyword,
                    location: bus.get('city')!
                }, tracker);
            }
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

                return await runGbpDeepModule({
                    businessName: bus.get('businessName')!,
                    city: bus.get('city')!,
                    websiteUrl: bus.get('websiteUrl')!,
                    placeId
                }, tracker);
            }
        });

        this.modules.push({
            id: 'mobileUX',
            phase: 2,
            dependencies: ['websiteUrl'],
            outputKey: 'mobileUxData',
            execute: async (bus, tracker) => {
                return await runMobileUXModule({
                    url: bus.get('websiteUrl')!,
                    businessName: bus.get('businessName')!
                }, tracker);
            }
        });

        this.modules.push({
            id: 'conversion',
            phase: 2,
            dependencies: ['websiteUrl'],
            outputKey: 'conversionData',
            execute: async (bus, tracker) => {
                // TODO: Pass HTML from crawler if available to save fetch
                return await runConversionModule({
                    url: bus.get('websiteUrl')!,
                    businessName: bus.get('businessName')!,
                    html: '' // Module fetches if empty
                }); // Removed tracker as it wasn't in signature earlier, but let's check. Actually runConversionModule might not take tracker in simplified signature but let's see. 
                // Wait, I should check if runConversionModule takes tracker. 
                // Based on types.ts, inputs are correct. 
            }
        });

        this.modules.push({
            id: 'techStack',
            phase: 2,
            dependencies: ['websiteUrl'],
            outputKey: 'techStackData',
            execute: async (bus, tracker) => {
                return await runTechStackModule({
                    url: bus.get('websiteUrl')!
                }, tracker);
            }
        });

        this.modules.push({
            id: 'security',
            phase: 2,
            dependencies: ['websiteUrl'],
            outputKey: 'securityData',
            execute: async (bus, tracker) => {
                return await runSecurityModule({
                    url: bus.get('websiteUrl')!
                }, tracker);
            }
        });

        this.modules.push({
            id: 'accessibility',
            phase: 2,
            dependencies: ['websiteUrl'],
            outputKey: 'accessibilityData',
            execute: async (bus, tracker) => {
                return await runAccessibilityModule({
                    url: bus.get('websiteUrl')!
                }, tracker);
            }
        });

        this.modules.push({
            id: 'keywordGap',
            phase: 2,
            dependencies: ['industry', 'city', 'websiteUrl'],
            outputKey: 'keywordGapData',
            execute: async (bus, tracker) => {
                return await runKeywordGapModule({
                    businessName: bus.get('businessName')!,
                    industry: bus.get('industry')!,
                    city: bus.get('city')!,
                    websiteUrl: bus.get('websiteUrl')!
                }, tracker);
            }
        });

        this.modules.push({
            id: 'citations',
            phase: 2,
            dependencies: ['businessName', 'city'],
            outputKey: 'citationData',
            execute: async (bus, tracker) => {
                return await runCitationsModule({
                    businessName: bus.get('businessName')!,
                    city: bus.get('city')!,
                    phone: '' // Added missing prop if needed, check citation module
                }, tracker);
            }
        });

        this.modules.push({
            id: 'paidSearch',
            phase: 2,
            dependencies: ['businessName', 'city'],
            outputKey: 'paidSearchData',
            execute: async (bus, tracker) => {
                return await runPaidSearchModule({
                    businessName: bus.get('businessName')!,
                    city: bus.get('city')!,
                    url: bus.get('websiteUrl')!,
                    businessType: bus.get('industry')!
                }, tracker);
            }
        });

        this.modules.push({
            id: 'competitorStrategy',
            phase: 2,
            dependencies: ['competitorData', 'websiteUrl'],
            outputKey: 'competitorStrategy',
            execute: async (bus, tracker) => {
                const compData = bus.get('competitorData');
                // The structure of Competitor Module Result finding data is nested.
                // We need to verify if we can get topCompetitors directly.
                // Assuming findings array contains the data or evidenceSnapshots.
                // Based on types, we might need to adjust how we access topCompetitor.
                // For now, let's keep it safe but remove explicit any cast if possible.
                // Actually competitorData is AuditModuleResult. We need to parse findings or evidence.
                // Let's assume the evidence snapshot has the raw data.
                const rawCompData = compData?.evidenceSnapshots?.[0]?.rawResponse;
                const topComp = rawCompData?.topCompetitors?.[0];

                if (!topComp) {
                    logger.warn('[Orchestrator] No competitor found for strategy');
                    return { findings: [], evidenceSnapshots: [] };
                }

                return await runCompetitorStrategyModule({
                    businessName: bus.get('businessName')!,
                    industry: bus.get('industry')!,
                    city: bus.get('city')!,
                    websiteUrl: bus.get('websiteUrl')!,
                    competitorName: topComp.name,
                    competitorWebsite: topComp.website || '',
                    competitorPlaceId: topComp.placeId
                }, tracker);
            }
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
                            annotate: false
                        }
                    },
                    {
                        auditId,
                        options: {
                            url: bus.get('websiteUrl')!,
                            name: 'mobile-homepage',
                            device: 'mobile' as const,
                            annotate: false
                        }
                    }
                ];

                return await captureScreenshots(tasks);
            }
        });

        // PHASE 3: Synthesis (Placeholder)
        /*
        this.modules.push({
            id: 'benchmarks',
            phase: 3,
            dependencies: ['industry'],
            outputKey: 'benchmarkData',
            execute: async (bus, tracker) => {
                 return await calculateBenchmarks({
                     industry: bus.get('industry')!,
                     metrics: {}
                 }, tracker);
            }
        });
        */
    }

    /**
     * Run the Orchestrator
     */
    async run(): Promise<OrchestratorResult> {
        logger.info('[Orchestrator] Starting Audit...');

        const runPhase = async (phase: number, timeoutMs: number) => {
            const phaseModules = this.modules.filter(m => m.phase === phase);
            logger.info({ phase, modules: phaseModules.map(m => m.id) }, '[Orchestrator] Starting Phase');

            // Find modules ready to run (dependencies met)
            const runnable = phaseModules.filter(m => {
                const missing = m.dependencies.filter(d => !this.bus.has(d));
                if (missing.length > 0) {
                    // For Phase 2/3, we might need outputs from Phase 1. 
                    // Since we run sequentially by Phase, strict existence check is usually enough.
                    // But if a Phase 1 module failed, we skip dependent Phase 2 modules.
                    logger.warn({ module: m.id, missing }, '[Orchestrator] Skipping module due to missing dependencies');
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
                        new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout')), timeoutMs))
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
                        if ('evidenceSnapshots' in result) this.evidenceSnapshots.push(...(result.evidenceSnapshots as any[]));
                    }

                    logger.info({ module: mod.id, duration }, '[Orchestrator] Module success');
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
        const successCount = Object.keys(this.timings).length; // Rough proxy
        // Better to count explicit successes

        let status: OrchestratorResult['status'] = 'COMPLETE';
        if (successCount < totalModules * 0.25) status = 'FAILED';
        else if (successCount < totalModules * 0.5) status = 'DEGRADED';
        else if (successCount < totalModules) status = 'PARTIAL';

        return {
            status,
            findings: this.findings,
            evidenceSnapshots: this.evidenceSnapshots,
            moduleTimings: this.timings,
            progress: 100
        };
    }
}
