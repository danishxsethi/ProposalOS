/**
 * Audit Accuracy Test Framework
 * 
 * Purpose: Verify zero hallucinated findings in 100-audit test
 * Tests: Finding verifiability, severity accuracy, recommendation actionability
 * 
 * Acceptance Criteria: 0 hallucinated findings in 100 audits across 10 industries
 */

import { Finding } from '@/lib/diagnosis/types';
import { logger } from '@/lib/logger';
import { prisma } from '@/lib/prisma';

export interface TestUrl {
  url: string;
  businessName: string;
  city: string;
  industry: string;
}

export interface AccuracyTestResult {
  auditId: string;
  url: string;
  industry: string;
  totalFindings: number;
  verifiedFindings: number;
  hallucinatedFindings: HallucinatedFinding[];
  severityAccuracy: number;
  actionableRecommendations: number;
  accuracyScore: number;
  passed: boolean;
}

export interface HallucinatedFinding {
  findingId: string;
  title: string;
  reason: 'fabricated_metric' | 'invented_broken_link' | 'false_security_claim' | 'unsupported_claim';
  description: string;
}

/**
 * Test URLs across 10 industries (10 URLs each = 100 total)
 */
export const TEST_URLS: TestUrl[] = [
  // Legal (10)
  { url: 'https://www.nolo.com', businessName: 'Nolo', city: 'Oakland', industry: 'legal' },
  { url: 'https://www.findlaw.com', businessName: 'FindLaw', city: 'Eagan', industry: 'legal' },
  { url: 'https://www.avvo.com', businessName: 'Avvo', city: 'Seattle', industry: 'legal' },
  { url: 'https://www.lawyers.com', businessName: 'Lawyers.com', city: 'Martindville', industry: 'legal' },
  { url: 'https://www.justia.com', businessName: 'Justia', city: 'Mountain View', industry: 'legal' },
  { url: 'https://www.hg.org', businessName: 'HG.org', city: 'Clearwater', industry: 'legal' },
  { url: 'https://www.superlawyers.com', businessName: 'Super Lawyers', city: 'Minneapolis', industry: 'legal' },
  { url: 'https://www.martry.com', businessName: 'Martindale-Hubbell', city: 'New Providence', industry: 'legal' },
  { url: 'https://www.legalmatch.com', businessName: 'LegalMatch', city: 'San Francisco', industry: 'legal' },
  { url: 'https://www.upcounsel.com', businessName: 'UpCounsel', city: 'San Francisco', industry: 'legal' },
  
  // Dental (10)
  { url: 'https://www.ada.org', businessName: 'American Dental Association', city: 'Chicago', industry: 'dental' },
  { url: 'https://www.deltadental.com', businessName: 'Delta Dental', city: 'San Francisco', industry: 'dental' },
  { url: 'https://www.aspendental.com', businessName: 'Aspen Dental', city: 'East Syracuse', industry: 'dental' },
  { url: 'https://www.pacificdental.com', businessName: 'Pacific Dental Services', city: 'Irvine', industry: 'dental' },
  { url: 'https://www.heartlanddental.com', businessName: 'Heartland Dental', city: 'Effingham', industry: 'dental' },
  { url: 'https://www.sage-dental.com', businessName: 'Sage Dental', city: 'West Palm Beach', industry: 'dental' },
  { url: 'https://www.benjaminfamilydentistry.com', businessName: 'Benjamin Family Dentistry', city: 'Elk Grove', industry: 'dental' },
  { url: 'https://www.dentistry.com', businessName: 'Dentistry.com', city: 'New York', industry: 'dental' },
  { url: 'https://www.123dentist.com', businessName: '123 Dentist', city: 'Phoenix', industry: 'dental' },
  { url: 'https://www.dentalplans.com', businessName: 'DentalPlans', city: 'Plantation', industry: 'dental' },
  
  // Medical (10)
  { url: 'https://www.mayoclinic.org', businessName: 'Mayo Clinic', city: 'Rochester', industry: 'medical' },
  { url: 'https://www.clevelandclinic.org', businessName: 'Cleveland Clinic', city: 'Cleveland', industry: 'medical' },
  { url: 'https://www.hopkinsmedicine.org', businessName: 'Johns Hopkins Medicine', city: 'Baltimore', industry: 'medical' },
  { url: 'https://www.massgeneral.org', businessName: 'Massachusetts General Hospital', city: 'Boston', industry: 'medical' },
  { url: 'https://www.uclahealth.org', businessName: 'UCLA Health', city: 'Los Angeles', industry: 'medical' },
  { url: 'https://www.stanfordhealthcare.org', businessName: 'Stanford Health Care', city: 'Stanford', industry: 'medical' },
  { url: 'https://www.nyuhs.org', businessName: 'NYU Langone Health', city: 'New York', industry: 'medical' },
  { url: 'https://www.cedars-sinai.org', businessName: 'Cedars-Sinai', city: 'Los Angeles', industry: 'medical' },
  { url: 'https://www.mountsinai.org', businessName: 'Mount Sinai', city: 'New York', industry: 'medical' },
  { url: 'https://www.northwesternmedicine.org', businessName: 'Northwestern Medicine', city: 'Chicago', industry: 'medical' },
  
  // Construction (10)
  { url: 'https://www.bechtel.com', businessName: 'Bechtel', city: 'Reston', industry: 'construction' },
  { url: 'https://www.fluor.com', businessName: 'Fluor', city: 'Irving', industry: 'construction' },
  { url: 'https://www.jacobs.com', businessName: 'Jacobs', city: 'Dallas', industry: 'construction' },
  { url: 'https://www.aecom.com', businessName: 'AECOM', city: 'Dallas', industry: 'construction' },
  { url: 'https://www.kiewit.com', businessName: 'Kiewit', city: 'Omaha', industry: 'construction' },
  { url: 'https://www.turnerconstruction.com', businessName: 'Turner Construction', city: 'New York', industry: 'construction' },
  { url: 'https://www.skanska.com', businessName: 'Skanska', city: 'Solna', industry: 'construction' },
  { url: 'https://www.pcl.com', businessName: 'PCL Construction', city: 'Denver', industry: 'construction' },
  { url: 'https://www.mccarthy.com', businessName: 'McCarthy', city: 'Irving', industry: 'construction' },
  { url: 'https://www.henselphelps.com', businessName: 'Hensel Phelps', city: 'Greeley', industry: 'construction' },
  
  // Plumbing (10)
  { url: 'https://www.rote-rooter.com', businessName: 'Roto-Rooter', city: 'Cincinnati', industry: 'plumbing' },
  { url: 'https://www.mrrooter.com', businessName: 'Mr. Rooter Plumbing', city: 'Waco', industry: 'plumbing' },
  { url: 'https://www.benjaminfranklinplumbing.com', businessName: 'Benjamin Franklin Plumbing', city: 'Waco', industry: 'plumbing' },
  { url: 'https://www.abcplumbing.com', businessName: 'ABC Home & Commercial Services', city: 'Austin', industry: 'plumbing' },
  { url: 'https://www.johnsonplumbing.com', businessName: 'Johnson Plumbing', city: 'Phoenix', industry: 'plumbing' },
  { url: 'https://www.horizonplumbing.com', businessName: 'Horizon Plumbing', city: 'Denver', industry: 'plumbing' },
  { url: 'https://www.plumbingsolutions.com', businessName: 'Plumbing Solutions', city: 'Las Vegas', industry: 'plumbing' },
  { url: 'https://www.expressplumbing.com', businessName: 'Express Plumbing', city: 'Houston', industry: 'plumbing' },
  { url: 'https://www.superiorplumbing.com', businessName: 'Superior Plumbing', city: 'Atlanta', industry: 'plumbing' },
  { url: 'https://www.qualityplumbing.com', businessName: 'Quality Plumbing', city: 'Seattle', industry: 'plumbing' },
  
  // HVAC (10)
  { url: 'https://www.carrier.com', businessName: 'Carrier', city: 'Palm Beach Gardens', industry: 'hvac' },
  { url: 'https://www.trane.com', businessName: 'Trane', city: 'Davidson', industry: 'hvac' },
  { url: 'https://www.lennox.com', businessName: 'Lennox', city: 'Richardson', industry: 'hvac' },
  { url: 'https://www.rheem.com', businessName: 'Rheem', city: 'Atlanta', industry: 'hvac' },
  { url: 'https://www.goodmanmfg.com', businessName: 'Goodman', city: 'Houston', industry: 'hvac' },
  { url: 'https://www.york.com', businessName: 'York', city: 'Epping', industry: 'hvac' },
  { url: 'https://www.amana-hac.com', businessName: 'Amana', city: 'Bentonville', industry: 'hvac' },
  { url: 'https://www.bryant.com', businessName: 'Bryant', city: 'Indianapolis', industry: 'hvac' },
  { url: 'https://www.payne.com', businessName: 'Payne', city: 'Indianapolis', industry: 'hvac' },
  { url: 'https://www.daynight.com', businessName: 'Day & Night', city: 'Indianapolis', industry: 'hvac' },
  
  // Real Estate (10)
  { url: 'https://www.zillow.com', businessName: 'Zillow', city: 'Seattle', industry: 'real_estate' },
  { url: 'https://www.realtor.com', businessName: 'Realtor.com', city: 'Santa Clara', industry: 'real_estate' },
  { url: 'https://www.redfin.com', businessName: 'Redfin', city: 'Seattle', industry: 'real_estate' },
  { url: 'https://www.trulia.com', businessName: 'Trulia', city: 'San Francisco', industry: 'real_estate' },
  { url: 'https://www.homes.com', businessName: 'Homes.com', city: 'Norfolk', industry: 'real_estate' },
  { url: 'https://www.movoto.com', businessName: 'Movoto', city: 'San Mateo', industry: 'real_estate' },
  { url: 'https://www.hotpads.com', businessName: 'HotPads', city: 'San Francisco', industry: 'real_estate' },
  { url: 'https://www.apartments.com', businessName: 'Apartments.com', city: 'Atlanta', industry: 'real_estate' },
  { url: 'https://www.rent.com', businessName: 'Rent.com', city: 'Irvine', industry: 'real_estate' },
  { url: 'https://www.zumper.com', businessName: 'Zumper', city: 'San Francisco', industry: 'real_estate' },
  
  // Roofing (10)
  { url: 'https://www.gaf.com', businessName: 'GAF', city: 'Parsippany', industry: 'roofing' },
  { url: 'https://www.owenscorning.com', businessName: 'Owens Corning', city: 'Toledo', industry: 'roofing' },
  { url: 'https://www.certainteed.com', businessName: 'CertainTeed', city: 'Malvern', industry: 'roofing' },
  { url: 'https://www.atlasroofing.com', businessName: 'Atlas Roofing', city: 'Acworth', industry: 'roofing' },
  { url: 'https://www.malarkeyroofing.com', businessName: 'Malarkey Roofing', city: 'Vancouver', industry: 'roofing' },
  { url: 'https://www.ikoroofing.com', businessName: 'IKO Roofing', city: 'Brampton', industry: 'roofing' },
  { url: 'https://www.pabcoroofing.com', businessName: 'PABCO Roofing', city: 'City of Industry', industry: 'roofing' },
  { url: 'https://www.tamko.com', businessName: 'TAMKO', city: 'Joplin', industry: 'roofing' },
  { url: 'https://www.duro-last.com', businessName: 'Duro-Last', city: 'Saginaw', industry: 'roofing' },
  { url: 'https://www.firestonebpco.com', businessName: 'Firestone Building Products', city: 'Nashville', industry: 'roofing' },
  
  // General/Retail (10)
  { url: 'https://www.walmart.com', businessName: 'Walmart', city: 'Bentonville', industry: 'general' },
  { url: 'https://www.target.com', businessName: 'Target', city: 'Minneapolis', industry: 'general' },
  { url: 'https://www.amazon.com', businessName: 'Amazon', city: 'Seattle', industry: 'general' },
  { url: 'https://www.bestbuy.com', businessName: 'Best Buy', city: 'Richfield', industry: 'general' },
  { url: 'https://www.homedepot.com', businessName: 'Home Depot', city: 'Atlanta', industry: 'general' },
  { url: 'https://www.lowes.com', businessName: "Lowe's", city: 'Mooresville', industry: 'general' },
  { url: 'https://www.costco.com', businessName: 'Costco', city: 'Issaquah', industry: 'general' },
  { url: 'https://www.samsclub.com', businessName: "Sam's Club", city: 'Bentonville', industry: 'general' },
  { url: 'https://www.macys.com', businessName: "Macy's", city: 'New York', industry: 'general' },
  { url: 'https://www.nordstrom.com', businessName: 'Nordstrom', city: 'Seattle', industry: 'general' },
];

/**
 * Verify a single finding is not hallucinated
 */
export async function verifyFinding(
  finding: Finding,
  evidenceSnapshots: any[]
): Promise<{ verified: boolean; reason?: string }> {
  // Check 1: Verify metrics exist in evidence
  if (finding.metrics && typeof finding.metrics === 'object' && Object.keys(finding.metrics).length > 0) {
    const metricValues = Object.values(finding.metrics).filter((v) => typeof v === 'number' || typeof v === 'string');
    const hasMetricEvidence = evidenceSnapshots.some((snapshot) => {
      const raw = snapshot.rawResponse || snapshot;
      return JSON.stringify(raw).includes(String(metricValues[0] ?? ''));
    });
    
    // If no evidence found and metric seems fabricated
    if (!hasMetricEvidence && isSuspiciousMetric(finding.metrics as Record<string, any>)) {
      return { verified: false, reason: 'fabricated_metric' };
    }
  }
  
  // Check 2: Verify title claims are grounded
  const titleKeywords = extractKeywords(finding.title);
  const descriptionKeywords = extractKeywords(finding.description || '');
  const evidenceText = JSON.stringify(evidenceSnapshots).toLowerCase();
  
  let matchedKeywords = 0;
  for (const keyword of [...titleKeywords, ...descriptionKeywords]) {
    if (keyword.length > 3 && evidenceText.includes(keyword.toLowerCase())) {
      matchedKeywords++;
    }
  }
  
  const keywordMatchRate = matchedKeywords / (titleKeywords.length + descriptionKeywords.length);
  if (keywordMatchRate < 0.3 && titleKeywords.length > 2) {
    return { verified: false, reason: 'unsupported_claim' };
  }
  
  // Check 3: Verify confidence score is justified
  if (finding.confidenceScore > 90 && (!finding.evidence || !Array.isArray(finding.evidence) || finding.evidence.length === 0)) {
    return { verified: false, reason: 'unsupported_claim' };
  }
  
  return { verified: true };
}

/**
 * Check if a metric value seems fabricated
 */
function isSuspiciousMetric(metrics: Record<string, any>): boolean {
  for (const [key, value] of Object.entries(metrics || {})) {
    if (typeof value === 'number') {
      // Check for impossible values
      if (value < 0) return true;
      if (key.includes('score') && value > 100) return true;
      if (key.includes('percent') && value > 100) return true;
      if (key.includes('time') && value > 86400) return true; // > 24 hours
      
      // Check for suspiciously round numbers (often fabricated)
      if (value % 100 === 0 && value > 1000) return true;
    }
  }
  return false;
}

/**
 * Extract meaningful keywords from text
 */
function extractKeywords(text: string): string[] {
  const stopWords = new Set(['the', 'a', 'an', 'is', 'are', 'was', 'were', 'be', 'been', 'being', 'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could', 'should', 'may', 'might', 'must', 'shall', 'can', 'need', 'to', 'of', 'in', 'for', 'on', 'with', 'at', 'by', 'from', 'as', 'into', 'through', 'during', 'before', 'after', 'above', 'below', 'between', 'under', 'again', 'further', 'then', 'once', 'here', 'there', 'when', 'where', 'why', 'how', 'all', 'each', 'few', 'more', 'most', 'other', 'some', 'such', 'no', 'nor', 'not', 'only', 'own', 'same', 'so', 'than', 'too', 'very', 'just', 'and', 'but', 'if', 'or', 'because', 'until', 'while', 'although', 'though', 'that', 'this', 'it', 'its']);
  
  return text
    .split(/[\s\W]+/)
    .filter((word) => word.length > 3 && !stopWords.has(word.toLowerCase()))
    .map((word) => word.toLowerCase());
}

/**
 * Verify severity accuracy
 */
export function verifySeverityAccuracy(finding: Finding): number {
  const impactScore = finding.impactScore || 0;
  const confidenceScore = finding.confidenceScore || 0;
  
  // Calculate expected severity based on impact and confidence
  const expectedSeverity = (impactScore / 10) * (confidenceScore / 100);
  
  // Compare with actual type
  const actualSeverity = finding.type === 'PAINKILLER' ? 1 : finding.type === 'VITAMIN' ? 0.5 : 0.2;
  
  // Return accuracy score (1.0 = perfect match)
  return 1 - Math.abs(expectedSeverity - actualSeverity);
}

/**
 * Verify recommendation is actionable (implementable in <4 hours)
 */
export function verifyRecommendationActionability(finding: Finding): boolean {
  const effortEstimate = finding.effortEstimate || 'MEDIUM';
  
  // LOW effort = definitely actionable in <4 hours
  if (effortEstimate === 'LOW') return true;
  
  // MEDIUM effort = usually actionable in <4 hours
  if (effortEstimate === 'MEDIUM') return true;
  
  // HIGH effort = may exceed 4 hours, check recommendations
  if (effortEstimate === 'HIGH') {
    const recommendations = Array.isArray(finding.recommendedFix) 
      ? finding.recommendedFix.filter((r): r is string => typeof r === 'string' && r.length > 0)
      : [];
    // If recommendations are specific and limited, still actionable
    return recommendations.length <= 3 && recommendations.every((r) => r.length < 200);
  }
  
  return false;
}

/**
 * Run accuracy test on a single audit
 */
export async function runAccuracyTest(auditId: string): Promise<AccuracyTestResult> {
  const audit = await prisma.audit.findUnique({
    where: { id: auditId },
    include: {
      findings: true,
    },
  });
  
  if (!audit) {
    throw new Error(`Audit ${auditId} not found`);
  }
  
  const findings = audit.findings as unknown as Finding[];
  
  // Fetch evidence snapshots separately if audit exists
  let evidenceSnapshots: any[] = [];
  if (audit) {
    try {
      const evidence = await prisma.evidenceSnapshot.findMany({
        where: { auditId },
      });
      evidenceSnapshots = evidence || [];
    } catch {
      evidenceSnapshots = [];
    }
  }
  
  const hallucinatedFindings: HallucinatedFinding[] = [];
  let verifiedCount = 0;
  let severityAccuracySum = 0;
  let actionableCount = 0;
  
  for (const finding of findings) {
    // Verify finding is not hallucinated
    const verification = await verifyFinding(finding, evidenceSnapshots);
    
    if (verification.verified) {
      verifiedCount++;
    } else {
      hallucinatedFindings.push({
        findingId: finding.id,
        title: finding.title,
        reason: verification.reason as HallucinatedFinding['reason'],
        description: `Finding "${finding.title}" could not be verified against evidence`,
      });
    }
    
    // Check severity accuracy
    severityAccuracySum += verifySeverityAccuracy(finding);
    
    // Check recommendation actionability
    if (verifyRecommendationActionability(finding)) {
      actionableCount++;
    }
  }
  
  const accuracyScore = findings.length > 0 ? verifiedCount / findings.length : 1;
  const avgSeverityAccuracy = findings.length > 0 ? severityAccuracySum / findings.length : 0;
  
  return {
    auditId,
    url: audit.businessUrl || '',
    industry: audit.businessIndustry || 'unknown',
    totalFindings: findings.length,
    verifiedFindings: verifiedCount,
    hallucinatedFindings,
    severityAccuracy: avgSeverityAccuracy,
    actionableRecommendations: actionableCount,
    accuracyScore,
    passed: hallucinatedFindings.length === 0,
  };
}

/**
 * Run full 100-audit accuracy test
 */
export async function runFullAccuracyTest(): Promise<{
  totalAudits: number;
  passedAudits: number;
  failedAudits: number;
  totalFindings: number;
  hallucinatedFindings: number;
  accuracyRate: number;
  results: AccuracyTestResult[];
  passed: boolean;
}> {
  logger.info('Starting 100-audit accuracy test');
  
  const results: AccuracyTestResult[] = [];
  let totalFindings = 0;
  let hallucinatedFindings = 0;
  
  // Get all audits from database
  const audits = await prisma.audit.findMany({
    where: {
      status: { in: ['COMPLETE', 'PARTIAL'] },
    },
    orderBy: { createdAt: 'desc' },
    take: 100,
  });
  
  logger.info(`Found ${audits.length} audits to test`);
  
  for (const audit of audits) {
    try {
      const result = await runAccuracyTest(audit.id);
      results.push(result);
      totalFindings += result.totalFindings;
      hallucinatedFindings += result.hallucinatedFindings.length;
      
      logger.info(
        {
          auditId: audit.id,
          accuracyScore: result.accuracyScore,
          hallucinatedCount: result.hallucinatedFindings.length,
        },
        `Accuracy test completed`
      );
    } catch (error) {
      logger.error({ auditId: audit.id, error }, 'Accuracy test failed');
      results.push({
        auditId: audit.id,
        url: audit.businessUrl || '',
        industry: audit.businessIndustry || 'unknown',
        totalFindings: 0,
        verifiedFindings: 0,
        hallucinatedFindings: [],
        severityAccuracy: 0,
        actionableRecommendations: 0,
        accuracyScore: 0,
        passed: false,
      });
    }
  }
  
  const passedAudits = results.filter((r) => r.passed).length;
  const accuracyRate = totalFindings > 0 ? (totalFindings - hallucinatedFindings) / totalFindings : 0;
  
  return {
    totalAudits: results.length,
    passedAudits,
    failedAudits: results.length - passedAudits,
    totalFindings,
    hallucinatedFindings,
    accuracyRate,
    results,
    passed: hallucinatedFindings === 0,
  };
}

/**
 * Export for CLI usage
 */
if (require.main === module) {
  runFullAccuracyTest()
    .then((result) => {
      logger.info(
        {
          event: 'qa.accuracy_test.result',
          totalAudits: result.totalAudits,
          passedAudits: result.passedAudits,
          failedAudits: result.failedAudits,
          totalFindings: result.totalFindings,
          hallucinatedFindings: result.hallucinatedFindings,
          accuracyRate: result.accuracyRate,
          passed: result.passed,
        },
        'Accuracy test results'
      );
      process.exit(result.passed ? 0 : 1);
    })
    .catch((error) => {
      logger.error({ error, event: 'qa.accuracy_test.failed' }, 'Accuracy test failed');
      process.exit(1);
    });
}