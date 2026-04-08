import { NextRequest, NextResponse } from 'next/server';
import { mockReportData } from '@/lib/mock-data';
import { apiClient } from '@/lib/api-client';
import { ReportData, Competitor } from '@/lib/types';

// Map backend module to frontend categories
function mapModuleToCategories(module: string): string[] {
    const map: Record<string, string[]> = {
        website: ['website', 'seo'],
        gbp: ['google', 'reviews'],
        competitor: ['social', 'competitors'],
    };
    return map[module] || [module];
}

// Map impact score to severity
function mapImpactToSeverity(impact: number): 'critical' | 'high' | 'medium' | 'low' {
    if (impact >= 8) return 'critical';
    if (impact >= 6) return 'high';
    if (impact >= 4) return 'medium';
    return 'low';
}

// Map effort estimate to fix complexity
function mapEffort(effort: string): 'quick-win' | 'moderate' | 'complex' {
    if (effort === 'LOW') return 'quick-win';
    if (effort === 'MEDIUM') return 'moderate';
    return 'complex';
}

// Convert score to letter grade
function scoreToGrade(score: number): string {
    if (score >= 9) return 'A+';
    if (score >= 8) return 'A';
    if (score >= 7) return 'B+';
    if (score >= 6) return 'B';
    if (score >= 5) return 'C+';
    if (score >= 4) return 'C';
    if (score >= 3) return 'D+';
    if (score >= 2) return 'D';
    return 'F';
}

// Get category name
function getCategoryName(id: string): string {
    const names: Record<string, string> = {
        'website': 'Website Performance',
        'google': 'Google Business Profile',
        'seo': 'SEO & Content',
        'reviews': 'Reviews & Reputation',
        'social': 'Social & Presence',
        'competitors': 'Competitive Intelligence',
    };
    return names[id] || id;
}

// Extract competitor data from competitor module findings
function extractCompetitors(audit: any): Competitor[] {
    const competitorFindings = (audit.findings || []).filter((f: any) => f.module === 'competitor');
    const competitors: Competitor[] = [];
    for (const finding of competitorFindings) {
        if (finding.metrics?.competitors) {
            for (const comp of finding.metrics.competitors) {
                competitors.push({
                    name: comp.name || 'Competitor',
                    url: comp.url || '',
                    overallScore: typeof comp.overallScore === 'number'
                        ? (comp.overallScore > 10
                            ? Math.round((comp.overallScore / 10) * 10) / 10
                            : comp.overallScore)
                        : 0,
                    reviewCount: comp.reviewCount || 0,
                    pageSpeed: comp.pageSpeed || 0,
                    gbpCompleteness: comp.gbpCompleteness || 0,
                });
            }
        }
    }
    return competitors.slice(0, 3); // Top 3
}

// Generate category summary
function generateCategorySummary(findings: any[]): string {
    if (findings.length === 0) return 'No issues detected in this category.';
    const critical = findings.filter(f => f.severity === 'critical').length;
    const high = findings.filter(f => f.severity === 'high').length;
    if (critical > 0) return `${critical} critical issue${critical > 1 ? 's' : ''} found — immediate attention needed.`;
    if (high > 0) return `${high} high-priority issue${high > 1 ? 's' : ''} detected.`;
    return `${findings.length} finding${findings.length > 1 ? 's' : ''} identified — mostly minor improvements.`;
}

// Map severity to number for scoring
function mapSeverityToNum(severity: 'critical' | 'high' | 'medium' | 'low'): number {
    if (severity === 'critical') return 8;
    if (severity === 'high') return 6;
    if (severity === 'medium') return 4;
    return 2;
}

function mapAuditToReportData(audit: any): ReportData {
    const findings = (audit.findings || []).flatMap((f: any) => {
        const categories = mapModuleToCategories(f.module);
        return categories.map((category: string) => ({
            id: `${f.id}:${category}`,
            category,
            severity: mapImpactToSeverity(f.impactScore),
            title: f.title,
            impact: f.description || '',
            evidence: f.evidence ? JSON.stringify(f.evidence) : undefined,
            fixComplexity: mapEffort(f.effortEstimate),
        }));
    });

    // Build category scores from findings grouped by frontend category
    const categoryIds = ['website', 'google', 'seo', 'reviews', 'social', 'competitors'];
    const categories = categoryIds.map(catId => {
        const catFindings = findings.filter((f: any) => f.category === catId);
        const avgImpact = catFindings.length > 0
            ? catFindings.reduce((sum: number, f: any) => sum + mapSeverityToNum(f.severity), 0) / catFindings.length
            : 5;
        const score = Math.max(0, Math.min(10, Math.round((10 - avgImpact) * 10) / 10));
        return {
            id: catId,
            name: getCategoryName(catId),
            score,
            summary: generateCategorySummary(catFindings),
        };
    });

    const overallScore = typeof audit.overallScore === 'number'
        ? Math.round((audit.overallScore > 10 ? audit.overallScore / 10 : audit.overallScore) * 10) / 10
        : Math.round(categories.reduce((sum, c) => sum + c.score, 0) / categories.length * 10) / 10;

    return {
        token: audit.id,
        businessName: audit.businessName,
        businessUrl: audit.businessUrl || '',
        overallScore,
        letterGrade: scoreToGrade(overallScore),
        categories,
        findings,
        competitors: extractCompetitors(audit),
    };
}

export async function GET(
    req: NextRequest,
    { params }: { params: Promise<{ token: string }> }
) {
    const { token } = await params;

    // Try the Proposal Engine backend
    const audit = await apiClient.getAudit(token);

    if (audit) {
        const reportData = mapAuditToReportData(audit);
        const latestProposal = Array.isArray(audit.proposals) && audit.proposals.length > 0
            ? audit.proposals[0]
            : null;

        return NextResponse.json({
            ...reportData,
            proposal: latestProposal,
            generatedAt: new Date().toISOString()
        });
    }

    // Backend unavailable - fall back to mock
    return NextResponse.json({
        ...mockReportData,
        proposal: null,
        token: token,
        generatedAt: new Date().toISOString()
    });
}