// Example integration: How to trigger screenshots after website crawl

import { orchestrateScreenshots } from '@/lib/evidence/screenshotOrchestrator';
import { runWebsiteCrawlerModule } from '@/lib/modules/websiteCrawlerModule';

/**
 * EXAMPLE: Enhanced website module with screenshot capture
 * 
 * This is how you would integrate screenshots into the audit flow.
 * Add this after the website crawler completes in your audit orchestration.
 */

export async function runWebsiteModuleWithScreenshots(input: {
    auditId: string;
    url: string;
    businessName: string;
    city?: string;
    competitorUrls?: string[];
}) {
    // 1. Run website crawler first
    const crawlerResult = await runWebsiteCrawlerModule({
        url: input.url,
        businessName: input.businessName,
    });

    // 2. Trigger screenshot capture (async, runs in parallel)
    const screenshotEvidence = await orchestrateScreenshots({
        auditId: input.auditId,
        businessUrl: input.url,
        businessName: input.businessName,
        city: input.city,
        crawlResult: crawlerResult.evidenceSnapshots[0]?.rawResponse as any,
        competitorUrls: input.competitorUrls,
    });

    // 3. Attach screenshots to findings (helper - injects screenshot URLs into finding evidence)
    const findingsWithScreenshots = crawlerResult.findings.map(finding => ({
        ...finding,
        evidence: [
            ...(finding.evidence || []),
            ...(screenshotEvidence.allScreenshots || []).slice(0, 3).map((s: { url: string; thumbnailUrl?: string; name?: string }) => ({
                type: 'image' as const,
                value: s.url,
                label: (s as any).name || 'Screenshot',
                ...(s.thumbnailUrl && { thumbnailUrl: s.thumbnailUrl })
            }))
        ]
    }));

    // 4. Store screenshot evidence in EvidenceSnapshot
    const screenshotSnapshot = {
        module: 'website_screenshots',
        source: 'puppeteer',
        rawResponse: {
            homepage: screenshotEvidence.homepage,
            gbp: screenshotEvidence.gbp,
            competitors: screenshotEvidence.competitors,
            comparisons: screenshotEvidence.competitorComparisons,
            brokenPages: screenshotEvidence.brokenPages,
        },
        collectedAt: new Date(),
    };

    return {
        findings: findingsWithScreenshots,
        evidenceSnapshots: [
            ...crawlerResult.evidenceSnapshots,
            screenshotSnapshot,
        ],
    };
}

/**
 * EXAMPLE: Access screenshots in proposal rendering
 * 
 * Here's how you would retrieve and display screenshots in the proposal page.
 */

export function getScreenshotsForProposal(evidenceSnapshots: any[]) {
    const screenshotEvidence = evidenceSnapshots.find(
        snap => snap.module === 'website_screenshots'
    );

    if (!screenshotEvidence) return null;

    return {
        homepageDesktop: screenshotEvidence.rawResponse.homepage.desktop?.url,
        homepageDesktopThumb: screenshotEvidence.rawResponse.homepage.desktop?.thumbnailUrl,
        homepageMobile: screenshotEvidence.rawResponse.homepage.mobile?.url,
        annotatedHomepage: screenshotEvidence.rawResponse.homepage.desktopAnnotated?.url,
        gbpListing: screenshotEvidence.rawResponse.gbp?.url,
        competitorComparisons: screenshotEvidence.rawResponse.comparisons?.map((c: any) => ({
            url: c.url,
            thumbnailUrl: c.thumbnailUrl,
            name: c.name,
        })),
    };
}

/**
 * EXAMPLE: Finding evidence with screenshots
 *
 * Findings will automatically include screenshot references in their evidence arrays:
 *
 * {
 *   type: 'PAINKILLER',
 *   title: 'Homepage Missing H1',
 *   evidence: [
 *     {
 *       type: 'image',
 *       value: 'https://storage.googleapis.com/.../homepage-desktop-annotated.png',
 *       label: 'Issues Highlighted',
 *       thumbnailUrl: 'https://storage.googleapis.com/.../homepage-desktop-annotated-thumb.png'
 *     }
 *   ]
 * }
 */

// In your proposal page component (React/TSX):
// 
// function ProposalHeroSection({ evidenceSnapshots }) {
//   const screenshots = getScreenshotsForProposal(evidenceSnapshots);
// 
//   return (
//     <div className="hero">
//       {screenshots?.homepageDesktop && (
//         <img
//           src={screenshots.homepageDesktopThumb}
//           alt="Your Website Homepage"
//           onClick={() => openLightbox(screenshots.homepageDesktop)}
//         />
//       )}
//     </div>
//   );
// }

// In your finding card component:
//
// function FindingCard({ finding }) {
//   const screenshots = finding.evidence.filter(e => e.type === 'image');
//   
//   return (
//     <div>
//       <h3>{finding.title}</h3>
//       <p>{finding.description}</p>
//       
//       {screenshots.map(screenshot => (
//         <img
//           key={screenshot.value}
//           src={screenshot.thumbnailUrl || screenshot.value}
//           alt={screenshot.label}
//           className="finding-screenshot"
//         />
//       ))}
//     </div>
//   );
// }
