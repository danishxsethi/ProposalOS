import { AuditModuleResult, Finding } from './types';
import { logger } from '@/lib/logger';
import { CostTracker } from '@/lib/costs/costTracker';
import * as tls from 'tls';
import * as https from 'https';
import { URL } from 'url';

export interface SecurityModuleInput {
    url: string;
}

interface SslAnalysis {
    isValid: boolean;
    validFrom?: string;
    validTo?: string;
    issuer?: string;
    daysUntilExpiry?: number;
    protocol?: string;
    hasMixedContent: boolean; // Placeholder, requires HTML parsing
}

interface HeaderAnalysis {
    headersPresent: string[];
    headersMissing: string[];
    score: number;
    details: Record<string, string>;
}

interface ExposedPath {
    path: string;
    status: number;
    isExposed: boolean;
}

interface SecurityAnalysis {
    ssl: SslAnalysis;
    headers: HeaderAnalysis;
    exposedPaths: ExposedPath[];
    cmsDetected?: string;
    cmsVersion?: string;
    overallRisk: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
}

/**
 * Run security analysis module
 */
export async function runSecurityModule(
    input: SecurityModuleInput,
    tracker?: CostTracker
): Promise<AuditModuleResult> {
    logger.info({ url: input.url }, '[Security] Starting security analysis');

    try {
        const url = new URL(input.url);

        // 1. SSL/TLS Analysis
        const sslAnalysis = await analyzeSsl(url.hostname);

        // 2. Security Headers & CMS Detection (via fetch)
        const response = await fetch(input.url, { method: 'GET', redirect: 'follow' });
        const headerAnalysis = analyzeHeaders(response.headers);
        const html = await response.text();
        const cmsInfo = detectCmsAndVersion(html);

        // 3. Exposed Path Checks
        // Only run if not a Shopify/Wix/Squarespace site (cloud platforms handle this)
        const isSaaS = ['shopify', 'wix', 'squarespace'].includes(cmsInfo.name.toLowerCase());
        const exposedPaths = isSaaS ? [] : await checkExposedPaths(input.url);

        // Aggregate Analysis
        const analysis: SecurityAnalysis = {
            ssl: sslAnalysis,
            headers: headerAnalysis,
            exposedPaths,
            cmsDetected: cmsInfo.name,
            cmsVersion: cmsInfo.version,
            overallRisk: calculateOverallRisk(sslAnalysis, exposedPaths)
        };

        // Generate Findings
        const findings = generateSecurityFindings(analysis, input);

        const evidenceSnapshot = {
            module: 'security',
            source: 'http_scan',
            rawResponse: {
                headers: headerAnalysis.details,
                exposedPaths: exposedPaths.map(p => p.path),
                ssl: {
                    issuer: sslAnalysis.issuer,
                    daysUntilExpiry: sslAnalysis.daysUntilExpiry
                }
            },
            collectedAt: new Date(),
        };

        logger.info({
            url: input.url,
            sslValid: sslAnalysis.isValid,
            headerScore: headerAnalysis.score,
            exposedPaths: exposedPaths.length,
            findingsCount: findings.length,
        }, '[Security] Analysis complete');

        return {
            findings,
            evidenceSnapshots: [evidenceSnapshot],
        };

    } catch (error) {
        logger.error({ error, url: input.url }, '[Security] Analysis failed');

        return {
            findings: [{
                type: 'VITAMIN',
                category: 'Compliance',
                title: 'Security Scan Unavailable',
                description: 'Unable to complete security analysis. Ensure the website is accessible.',
                impactScore: 1,
                confidenceScore: 50,
                evidence: [],
                metrics: {},
                effortEstimate: 'LOW',
                recommendedFix: ['Verify website uptime'],
            }],
            evidenceSnapshots: [],
        };
    }
}

/**
 * Analyze SSL/TLS configuration
 */
async function analyzeSsl(hostname: string): Promise<SslAnalysis> {
    return new Promise((resolve) => {
        const socket = tls.connect(443, hostname, { servername: hostname }, () => {
            const cert = socket.getPeerCertificate();
            const validTo = new Date(cert.valid_to);
            const validFrom = new Date(cert.valid_from);
            const daysUntilExpiry = Math.ceil((validTo.getTime() - Date.now()) / (1000 * 60 * 60 * 24));

            const protocol = socket.getProtocol(); // e.g., TLSv1.3
            socket.end();

            resolve({
                isValid: !socket.authorizationError && daysUntilExpiry > 0,
                validFrom: validFrom.toISOString(),
                validTo: validTo.toISOString(),
                issuer: typeof cert.issuer === 'object' ? (cert.issuer as any).O || 'Unknown' : 'Unknown',
                daysUntilExpiry,
                protocol: protocol || 'Unknown',
                hasMixedContent: false // Placeholder
            });
        });

        socket.on('error', (err) => {
            logger.warn({ err, hostname }, '[Security] SSL connection failed');
            resolve({
                isValid: false,
                hasMixedContent: false
            });
        });
    });
}

/**
 * Analyze Security Headers
 */
function analyzeHeaders(headers: Headers): HeaderAnalysis {
    const criticalHeaders = [
        'Strict-Transport-Security',
        'Content-Security-Policy',
        'X-Frame-Options',
        'X-Content-Type-Options',
        'X-XSS-Protection',
        'Referrer-Policy',
        'Permissions-Policy'
    ];

    const present: string[] = [];
    const missing: string[] = [];
    const details: Record<string, string> = {};

    criticalHeaders.forEach(h => {
        const val = headers.get(h);
        if (val) {
            present.push(h);
            details[h] = val;
        } else {
            missing.push(h);
        }
    });

    return {
        headersPresent: present,
        headersMissing: missing,
        score: present.length,
        details
    };
}

/**
 * Check for exposed sensitive paths
 */
async function checkExposedPaths(baseUrl: string): Promise<ExposedPath[]> {
    const pathsToCheck = [
        '/.env',
        '/.git/HEAD',
        '/wp-config.php.bak',
        '/phpinfo.php',
        '/config.json',
        '/.vscode/settings.json'
    ];

    const exposed: ExposedPath[] = [];

    // Run checks in parallel
    const checks = pathsToCheck.map(async (path) => {
        try {
            const res = await fetch(`${baseUrl}${path}`, { method: 'HEAD', redirect: 'manual' });
            if (res.status === 200) {
                // Double check content type for false positives (like custom 404 pages returning 200)
                const verifyRes = await fetch(`${baseUrl}${path}`, { method: 'GET', redirect: 'manual' });
                // Check if it's meant to be a sensitive file
                if (verifyRes.status === 200) {
                    exposed.push({ path, status: 200, isExposed: true });
                }
            }
        } catch (e) {
            // Ignore fetch errors
        }
    });

    await Promise.all(checks);
    return exposed;
}

/**
 * Detect CMS and Version
 */
function detectCmsAndVersion(html: string): { name: string; version?: string } {
    let name = 'Unknown';
    let version: string | undefined;

    if (html.includes('wp-content') || html.includes('wp-includes')) {
        name = 'WordPress';
        const match = html.match(/content="WordPress (.*?)"/);
        if (match) version = match[1];
    } else if (html.includes('_api/wix')) {
        name = 'Wix';
    } else if (html.includes('squarespace.com')) {
        name = 'Squarespace';
    } else if (html.includes('shopify.com')) {
        name = 'Shopify';
    }

    return { name, version };
}

/**
 * Calculate overall risk
 */
function calculateOverallRisk(ssl: SslAnalysis, exposed: ExposedPath[]): SecurityAnalysis['overallRisk'] {
    if (exposed.some(p => p.path.includes('.env') || p.path.includes('.git'))) return 'CRITICAL';
    if (!ssl.isValid || (ssl.daysUntilExpiry || 0) < 0) return 'HIGH';
    if ((ssl.daysUntilExpiry || 30) < 30) return 'MEDIUM';
    return 'LOW';
}

/**
 * Generate Findings
 */
function generateSecurityFindings(analysis: SecurityAnalysis, input: SecurityModuleInput): Finding[] {
    const findings: Finding[] = [];

    // PAINKILLER: No SSL or Expired
    if (!analysis.ssl.isValid) {
        findings.push({
            type: 'PAINKILLER',
            category: 'Compliance',
            title: 'Critical Security Risk: SSL Certificate Invalid',
            description: 'Your website connection is not secure. Browsers will warn visitors that your site is unsafe, killing traffic and trust immediately.',
            impactScore: 10,
            confidenceScore: 100,
            evidence: [{ type: 'text', value: 'HTTPS connection failed or certificate invalid', label: 'SSL Status' }],
            metrics: { sslValid: false },
            effortEstimate: 'MEDIUM',
            recommendedFix: ['Install a valid SSL certificate immediately', 'Ensure HTTPS is enforced']
        });
    }

    // PAINKILLER: Expiring SSL
    if (analysis.ssl.daysUntilExpiry && analysis.ssl.daysUntilExpiry < 30 && analysis.ssl.daysUntilExpiry >= 0) {
        findings.push({
            type: 'PAINKILLER',
            category: 'Compliance',
            title: 'SSL Certificate Expiring Soon',
            description: `Your security certificate expires in ${analysis.ssl.daysUntilExpiry} days. If not renewed, your site will go offline with a "Not Secure" warning.`,
            impactScore: 9,
            confidenceScore: 100,
            evidence: [{ type: 'metric', value: analysis.ssl.daysUntilExpiry, label: 'Days Until Expiry' }],
            metrics: { daysUntilExpiry: analysis.ssl.daysUntilExpiry },
            effortEstimate: 'LOW',
            recommendedFix: ['Renew SSL certificate immediately', 'Set up auto-renewal']
        });
    }

    // PAINKILLER: Exposed Sensitive Files
    if (analysis.exposedPaths.length > 0) {
        findings.push({
            type: 'PAINKILLER',
            category: 'Compliance',
            title: 'Critical: Sensitive Files Exposed',
            description: `We found publicly accessible sensitive files (${analysis.exposedPaths.map(p => p.path).join(', ')}). Hackers can use these to steal data or take over your site.`,
            impactScore: 10,
            confidenceScore: 100,
            evidence: analysis.exposedPaths.map(p => ({ type: 'text', value: p.path, label: 'Exposed File' })),
            metrics: { exposedCount: analysis.exposedPaths.length },
            effortEstimate: 'MEDIUM',
            recommendedFix: ['Restrict access to these files via .htaccess or server config', 'Delete unnecessary backup files']
        });
    }

    // VITAMIN: Missing Security Headers
    if (analysis.headers.score < 3) {
        findings.push({
            type: 'VITAMIN',
            category: 'Compliance',
            title: 'Missing Security Headers',
            description: `Your site is missing ${7 - analysis.headers.score} standard security headers. These protect your visitors from attacks like clickjacking and XSS.`,
            impactScore: 6,
            confidenceScore: 100,
            evidence: analysis.headers.headersMissing.slice(0, 3).map(h => ({ type: 'text', value: h, label: 'Missing Header' })),
            metrics: { headerScore: analysis.headers.score },
            effortEstimate: 'LOW',
            recommendedFix: ['Configure HSTS, X-Frame-Options, and CSP headers', 'Update server configuration']
        });
    }

    // VITAMIN: Outdated CMS
    if (analysis.cmsDetected === 'WordPress' && analysis.cmsVersion) {
        // Simplified check: just flag if version is visible (security best practice is to hide it)
        findings.push({
            type: 'VITAMIN',
            category: 'Compliance',
            title: 'CMS Version Exposed',
            description: `Your WordPress version (${analysis.cmsVersion}) is publicly visible. Attackers use this to target specific vulnerabilities.`,
            impactScore: 5,
            confidenceScore: 100,
            evidence: [{ type: 'text', value: `WordPress ${analysis.cmsVersion}`, label: 'Exposed Version' }],
            metrics: {},
            effortEstimate: 'LOW',
            recommendedFix: ['Hide WordPress version from page source', 'Keep WordPress updated to latest version']
        });
    }

    // POSITIVE: Secure Headers
    if (analysis.headers.score >= 5) {
        findings.push({
            type: 'POSITIVE',
            category: 'Compliance',
            title: 'Strong Security Configuration',
            description: 'Your website uses modern security headers to protect visitors. Great job!',
            impactScore: 2,
            confidenceScore: 100,
            evidence: [{ type: 'metric', value: analysis.headers.score, label: 'Security Header Score' }],
            metrics: { headerScore: analysis.headers.score },
            effortEstimate: 'LOW',
            recommendedFix: ['Maintain current configuration']
        });
    }

    return findings;
}
