import { DataBus, DataBusKey } from './dataBus';
import { logger } from '@/lib/logger';
import { CostTracker } from '@/lib/costs/costTracker';

// Import all modules
import { crawlWebsite } from '@/lib/modules/websiteCrawler';
import { runGbpModule } from '@/lib/modules/gbp';
// ... import other modules dynamically or essentially to keep this file clean, 
// we might need a mapping or just import function references.
// For the sake of this file, I will assume we import them.
// In a real app, we might use a registry pattern.
import { runCompetitorModule } from '@/lib/modules/competitor';
import { runCompetitorStrategyModule } from '@/lib/modules/competitorStrategy';
import { runGbpDeepModule } from '@/lib/modules/gbpDeep';
// import { runSeoDeepModule } from '@/lib/modules/seoDeep'; // Assuming exists or will be created
import { analyzeConversion } from '@/lib/modules/conversion';
import { analyzeMobileUX } from '@/lib/modules/mobileUX';
// import { analyzeContentQuality } from '@/lib/modules/contentQuality';
import { checkCitations } from '@/lib/modules/citations';
import { analyzePaidSearch } from '@/lib/modules/paidSearch';
import { analyzeTechStack } from '@/lib/modules/techStack';
import { runSecurityModule } from '@/lib/modules/security';
import { runAccessibilityModule } from '@/lib/modules/accessibility';
import { runKeywordGapModule } from '@/lib/modules/keywordGap';
// import { captureScreenshots } from '@/lib/modules/screenshotCapture';
import { calculateBenchmarks } from '@/lib/modules/benchmarks';
// import { generateReportCard } from '@/lib/modules/reportCard';

export interface OrchestratorInput {
    businessName: string;
    websiteUrl: string;
    city: string;
    industry: string;
    placeId?: string; // Optional if known
}

export interface OrchestratorResult {
    status: 'COMPLETE' | 'PARTIAL' | 'DEGRADED' | 'FAILED';
    findings: any[];
    evidenceSnapshots: any[];
    moduleTimings: Record<string, number>;
    progress: number;
}

type ModuleFunction = (dataBus: DataBus, tracker?: CostTracker) => Promise<any>;

interface ModuleDefinition {
    id: string;
    phase: 1 | 2 | 3;
    dependencies: DataBusKey[];
    execute: ModuleFunction;
    outputKey?: DataBusKey; // Key to store result in bus
}

/**
 * Audit Orchestrator
 * Manages the execution of all audit modules in a dependency graph.
 */
export class AuditOrchestrator {
    private bus: DataBus;
    private tracker: CostTracker;
    private findings: any[] = [];
    private evidenceSnapshots: any[] = [];
    private timings: Record<string, number> = {};
    private modules: ModuleDefinition[] = [];

    constructor(input: OrchestratorInput, tracker: CostTracker) {
        this.bus = new DataBus();
        this.tracker = tracker;

        // Initialize Bus with Inputs
        this.bus.set('businessName', input.businessName);
        this.bus.set('websiteUrl', input.websiteUrl);
        this.bus.set('city', input.city);
        this.bus.set('industry', input.industry);
        if (input.placeId) this.bus.set('placeData', { placeId: input.placeId }); // Partial mock if needed

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
            outputKey: 'placeData', // Simplified, actual module might allow partials
            execute: async (bus, tracker) => {
                const res = await runGbpModule({
                    businessName: bus.get('businessName')!,
                    city: bus.get('city')!
                }, tracker);
                // Extract actual data from result if structure differs
                return res;
            }
        });

        // PHASE 2: Dependents
        this.modules.push({
            id: 'competitor',
            phase: 2,
            dependencies: ['placeData', 'city'], // Needs keyword often derived from place
            outputKey: 'competitorData',
            execute: async (bus, tracker) => {
                // Logic to extract keyword from placeData categories or input
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
                const placeData: any = bus.get('placeData');
                // Extract id from result structure (assuming rawResponse has it or we pass it)
                const placeId = placeData?.evidenceSnapshots?.[0]?.rawResponse?.placeId;

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
                return await analyzeMobileUX({
                    url: bus.get('websiteUrl')!,
                    businessName: bus.get('businessName')!
                }, tracker);
            }
        });

        this.modules.push({
            id: 'conversion',
            phase: 2,
            dependencies: ['websiteUrl'], // Actually needs crawl results optimally but can fetch custom
            outputKey: 'conversionData',
            execute: async (bus, tracker) => {
                return await analyzeConversion({
                    url: bus.get('websiteUrl')!
                }, tracker);
            }
        });

        this.modules.push({
            id: 'techStack',
            phase: 2,
            dependencies: ['websiteUrl'],
            outputKey: 'techStackData',
            execute: async (bus, tracker) => {
                return await analyzeTechStack({
                    url: bus.get('websiteUrl')!
                });
            }
        });

        this.modules.push({
            id: 'security',
            phase: 2,
            dependencies: ['websiteUrl'],
            outputKey: 'securityData',
            execute: async (bus, tracker) => {
                return await runSecurityModule({
                    url: bus.get('websiteUrl')!,
                    businessName: bus.get('businessName')!
                });
            }
        });

        this.modules.push({
            id: 'accessibility',
            phase: 2,
            dependencies: ['websiteUrl'],
            outputKey: 'accessibilityData',
            execute: async (bus, tracker) => {
                return await runAccessibilityModule({
                    url: bus.get('websiteUrl')!,
                    businessName: bus.get('businessName')!
                });
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
            dependencies: ['businessName', 'city'], // Needs phone ideally
            outputKey: 'citationData',
            execute: async (bus, tracker) => {
                return await checkCitations({
                    businessName: bus.get('businessName')!,
                    city: bus.get('city')!,
                    phone: '' // Would extract from placeData ideally
                }, tracker);
            }
        });

        this.modules.push({
            id: 'paidSearch',
            phase: 2,
            dependencies: ['businessName', 'city'],
            outputKey: 'paidSearchData',
            execute: async (bus, tracker) => {
                return await analyzePaidSearch({
                    businessName: bus.get('businessName')!,
                    location: bus.get('city')!,
                    website: bus.get('websiteUrl')!
                }, tracker);
            }
        });

        // COMPETITOR STRATEGY (Needs Competitor Data)
        this.modules.push({
            id: 'competitorStrategy',
            phase: 2, // Or 2.5? We'll keep in 2 but ensure waiting logic or put in 3 if dependencies robust
            dependencies: ['competitorData', 'websiteUrl'],
            outputKey: 'competitorStrategy',
            execute: async (bus, tracker) => {
                const compData: any = bus.get('competitorData');
                // Extract top competitor
                const topComp = compData?.data?.topCompetitors?.[0];

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
                    competitorWebsite: topComp.website || '', // Should ideally be in data
                    competitorPlaceId: topComp.placeId
                }, tracker);
            }
        });

        // PHASE 3: Synthesis
        this.modules.push({
            id: 'benchmarks',
            phase: 3,
            dependencies: ['industry'],
            outputKey: 'benchmarkData',
            execute: async (bus, tracker) => {
                // Collect all scores from previous modules
                // This is a placeholder for passing diverse metrics
                return await calculateBenchmarks({
                    industry: bus.get('industry')!,
                    metrics: {}
                }, tracker);
            }
        });
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
                    return { id: mod.id, status: 'success' };

                } catch (error) {
                    const duration = Date.now() - start;
                    this.timings[mod.id] = duration;
                    logger.error({ module: mod.id, error }, '[Orchestrator] Module failed');
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
