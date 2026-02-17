/**
 * SSL and Security Headers Audit Module
 * Checks HTTPS, certificate, and security headers. Frames as trust signals for proposals.
 */
import * as https from 'https';
import * as http from 'http';
import * as tls from 'tls';
import { LegacyAuditModuleResult } from './types';
import type { CostTracker } from '@/lib/costs/costTracker';
import { logger } from '@/lib/logger';

export interface SecurityResult {
    status: 'success' | 'error';
    data: {
        score: number;
        grade: 'A' | 'B' | 'C' | 'D' | 'F';
        https: {
            enabled: boolean;
            redirects: boolean;
            certificate: { valid: boolean; expiresAt: string; issuer: string };
        };
        headers: Array<{
            name: string;
            present: boolean;
            value: string | null;
            status: 'good' | 'weak' | 'missing';
            recommendation: string;
        }>;
        mixedContent: boolean;
        serverExposed: boolean;
        recommendations: string[];
    };
}

export interface SecurityModuleInput {
    url: string;
}

function parseUrl(url: string): { protocol: string; host: string; port: number; path: string } {
    try {
        const u = new URL(url.startsWith('http') ? url : `https://${url}`);
        return {
            protocol: u.protocol.replace(':', ''),
            host: u.hostname,
            port: u.port ? parseInt(u.port, 10) : (u.protocol === 'https:' ? 443 : 80),
            path: u.pathname || '/',
        };
    } catch {
        return { protocol: 'https', host: url.replace(/^https?:\/\//, '').split('/')[0], port: 443, path: '/' };
    }
}

function getGrade(score: number): 'A' | 'B' | 'C' | 'D' | 'F' {
    if (score >= 90) return 'A';
    if (score >= 75) return 'B';
    if (score >= 60) return 'C';
    if (score >= 40) return 'D';
    return 'F';
}

async function fetchWithRedirect(url: string, followRedirects = true): Promise<{ statusCode: number; headers: Record<string, string>; finalUrl: string }> {
    return new Promise((resolve, reject) => {
        const parsed = parseUrl(url);
        const protocol = parsed.protocol === 'https' ? https : http;
        const req = protocol.request(
            {
                hostname: parsed.host,
                port: parsed.port,
                path: parsed.path,
                method: 'GET',
                timeout: 15000,
                headers: { 'User-Agent': 'ProposalOS-SecurityScan/1.0' },
                rejectUnauthorized: false,
            },
            (res) => {
                const headers: Record<string, string> = {};
                for (const [k, v] of Object.entries(res.headers)) {
                    if (k && v != null) headers[k.toLowerCase()] = Array.isArray(v) ? v[0] : String(v);
                }

                if (followRedirects && res.statusCode && res.statusCode >= 300 && res.statusCode < 400) {
                    const loc = res.headers.location;
                    if (loc) {
                        const nextUrl = loc.startsWith('http') ? loc : `${parsed.protocol}://${parsed.host}${loc}`;
                        fetchWithRedirect(nextUrl, true).then(resolve).catch(reject);
                        return;
                    }
                }

                resolve({
                    statusCode: res.statusCode || 0,
                    headers,
                    finalUrl: `${parsed.protocol}://${parsed.host}${parsed.path}`,
                });
            }
        );
        req.on('error', reject);
        req.on('timeout', () => {
            req.destroy();
            reject(new Error('Request timeout'));
        });
        req.end();
    });
}

async function getSslCertificate(host: string, port: number): Promise<{ valid: boolean; expiresAt: string; issuer: string }> {
    return new Promise((resolve) => {
        const socket = tls.connect(
            { host, port, servername: host, rejectUnauthorized: false },
            () => {
                const cert = socket.getPeerCertificate();
                socket.end();

                if (!cert || !cert.valid_to) {
                    resolve({ valid: false, expiresAt: '', issuer: '' });
                    return;
                }

                const valid = new Date(cert.valid_to) > new Date();
                resolve({
                    valid,
                    expiresAt: cert.valid_to,
                    issuer: cert.issuer?.O || cert.issuer?.CN || 'Unknown',
                });
            }
        );
        socket.on('error', () => {
            resolve({ valid: false, expiresAt: '', issuer: '' });
        });
    });
}

async function checkMixedContent(url: string): Promise<boolean> {
    try {
        const res = await fetch(url, {
            headers: { 'User-Agent': 'ProposalOS-SecurityScan/1.0' },
            signal: AbortSignal.timeout(10000),
        });
        const html = await res.text();
        return /src=["']http:\/\//.test(html) || /href=["']http:\/\//.test(html) || /url\(["']?http:\/\//.test(html);
    } catch {
        return false;
    }
}

/**
 * Run security audit module
 */
export async function runSecurityModule(
    input: SecurityModuleInput,
    _tracker?: CostTracker
): Promise<LegacyAuditModuleResult> {
    const { url } = input;

    if (!url) {
        return {
            moduleId: 'security',
            status: 'success',
            timestamp: new Date().toISOString(),
            data: {
                status: 'error',
                data: {
                    score: 0,
                    grade: 'F',
                    https: { enabled: false, redirects: false, certificate: { valid: false, expiresAt: '', issuer: '' } },
                    headers: [],
                    mixedContent: false,
                    serverExposed: false,
                    recommendations: ['No URL provided for security audit.'],
                },
            },
        };
    }

    try {
        const parsed = parseUrl(url);
        const secureUrl = `https://${parsed.host}${parsed.path}`;

        let httpsEnabled = parsed.protocol === 'https';
        let redirects = false;

        if (parsed.protocol === 'http') {
            const httpResult = await fetchWithRedirect(url, true);
            if (httpResult.finalUrl.startsWith('https://')) {
                redirects = true;
                httpsEnabled = true;
            }
        } else {
            try {
                const httpResult = await fetchWithRedirect(`http://${parsed.host}${parsed.path}`, true);
                redirects = httpResult.finalUrl.startsWith('https://');
            } catch {
                redirects = false;
            }
        }

        const headerResult = await fetchWithRedirect(secureUrl, false);
        const headers = headerResult.headers;

        const certificate = parsed.protocol === 'https' || httpsEnabled
            ? await getSslCertificate(parsed.host, 443)
            : { valid: false, expiresAt: '', issuer: '' };

        const headerChecks: SecurityResult['data']['headers'] = [];
        let score = 0;
        const maxHeaderScore = 70;
        const headerPoints = maxHeaderScore / 9;

        const hsts = headers['strict-transport-security'];
        if (hsts) {
            const maxAge = hsts.match(/max-age=(\d+)/)?.[1];
            const hasIncludeSubdomains = /includeSubDomains/i.test(hsts);
            const age = maxAge ? parseInt(maxAge, 10) : 0;
            const status = age >= 31536000 && hasIncludeSubdomains ? 'good' : age >= 86400 ? 'weak' : 'weak';
            headerChecks.push({
                name: 'Strict-Transport-Security',
                present: true,
                value: hsts,
                status,
                recommendation: status === 'good' ? 'HSTS is properly configured.' : 'Set max-age to at least 31536000 (1 year) and includeSubDomains.',
            });
            score += status === 'good' ? headerPoints : headerPoints * 0.5;
        } else {
            headerChecks.push({
                name: 'Strict-Transport-Security',
                present: false,
                value: null,
                status: 'missing',
                recommendation: 'Add HSTS header to prevent downgrade attacks. Example: Strict-Transport-Security: max-age=31536000; includeSubDomains',
            });
        }

        const csp = headers['content-security-policy'];
        if (csp) {
            const hasDefaultSrc = /default-src/i.test(csp);
            const status = hasDefaultSrc ? 'good' : 'weak';
            headerChecks.push({
                name: 'Content-Security-Policy',
                present: true,
                value: csp.slice(0, 80) + (csp.length > 80 ? '...' : ''),
                status,
                recommendation: status === 'good' ? 'CSP is present.' : 'Add default-src directive to restrict resource loading.',
            });
            score += status === 'good' ? headerPoints : headerPoints * 0.5;
        } else {
            headerChecks.push({
                name: 'Content-Security-Policy',
                present: false,
                value: null,
                status: 'missing',
                recommendation: 'Add CSP to mitigate XSS and injection attacks.',
            });
        }

        const xfo = headers['x-frame-options'];
        if (xfo) {
            const val = xfo.toUpperCase();
            const status = val === 'DENY' || val === 'SAMEORIGIN' ? 'good' : 'weak';
            headerChecks.push({
                name: 'X-Frame-Options',
                present: true,
                value: xfo,
                status,
                recommendation: status === 'good' ? 'X-Frame-Options is set.' : 'Use DENY or SAMEORIGIN to prevent clickjacking.',
            });
            score += status === 'good' ? headerPoints : headerPoints * 0.5;
        } else {
            headerChecks.push({
                name: 'X-Frame-Options',
                present: false,
                value: null,
                status: 'missing',
                recommendation: 'Add X-Frame-Options: DENY or SAMEORIGIN to prevent clickjacking.',
            });
        }

        const xcto = headers['x-content-type-options'];
        if (xcto && xcto.toLowerCase() === 'nosniff') {
            headerChecks.push({
                name: 'X-Content-Type-Options',
                present: true,
                value: xcto,
                status: 'good',
                recommendation: 'X-Content-Type-Options is correctly set.',
            });
            score += headerPoints;
        } else {
            headerChecks.push({
                name: 'X-Content-Type-Options',
                present: !!xcto,
                value: xcto || null,
                status: xcto ? 'weak' : 'missing',
                recommendation: 'Add X-Content-Type-Options: nosniff to prevent MIME sniffing.',
            });
            if (xcto) score += headerPoints * 0.5;
        }

        const xxss = headers['x-xss-protection'];
        if (xxss) {
            const status = xxss.includes('1') ? 'good' : 'weak';
            headerChecks.push({
                name: 'X-XSS-Protection',
                present: true,
                value: xxss,
                status,
                recommendation: 'Legacy header. Consider relying on CSP for XSS protection.',
            });
            score += headerPoints * 0.5;
        } else {
            headerChecks.push({
                name: 'X-XSS-Protection',
                present: false,
                value: null,
                status: 'missing',
                recommendation: 'Optional legacy header. CSP is preferred for XSS protection.',
            });
        }

        const referrer = headers['referrer-policy'];
        if (referrer) {
            const strict = /no-referrer|strict-origin|same-origin/i.test(referrer);
            headerChecks.push({
                name: 'Referrer-Policy',
                present: true,
                value: referrer,
                status: strict ? 'good' : 'weak',
                recommendation: strict ? 'Referrer-Policy is set.' : 'Consider strict-origin-when-cross-origin or no-referrer.',
            });
            score += strict ? headerPoints : headerPoints * 0.5;
        } else {
            headerChecks.push({
                name: 'Referrer-Policy',
                present: false,
                value: null,
                status: 'missing',
                recommendation: 'Add Referrer-Policy to control referrer information leakage.',
            });
        }

        const perm = headers['permissions-policy'] || headers['feature-policy'];
        if (perm) {
            headerChecks.push({
                name: 'Permissions-Policy',
                present: true,
                value: (perm as string).slice(0, 60) + '...',
                status: 'good',
                recommendation: 'Permissions-Policy is present.',
            });
            score += headerPoints;
        } else {
            headerChecks.push({
                name: 'Permissions-Policy',
                present: false,
                value: null,
                status: 'missing',
                recommendation: 'Add Permissions-Policy to restrict browser features (camera, geolocation, etc.).',
            });
        }

        const serverHeader = headers['server'];
        const serverExposed = !!serverHeader;

        const recommendations: string[] = [];

        if (!httpsEnabled) {
            recommendations.push('Enable HTTPS. Visitors see a "Not Secure" warning when your site uses HTTP.');
        } else if (!redirects && url.startsWith('http://')) {
            recommendations.push('Redirect HTTP to HTTPS so all traffic uses encryption.');
        }

        if (!certificate.valid && httpsEnabled) {
            recommendations.push('Fix your SSL certificate. An invalid or expired certificate causes browser warnings.');
        } else if (certificate.valid && certificate.expiresAt) {
            const daysLeft = Math.floor((new Date(certificate.expiresAt).getTime() - Date.now()) / 86400000);
            if (daysLeft < 30) {
                recommendations.push(`SSL certificate expires in ${daysLeft} days. Renew before it expires.`);
            }
        }

        headerChecks.filter((h) => h.status === 'missing' || h.status === 'weak').forEach((h) => {
            if (h.status === 'missing') recommendations.push(h.recommendation);
        });

        const mixedContent = httpsEnabled ? await checkMixedContent(secureUrl) : false;
        if (mixedContent) {
            recommendations.push('Remove mixed content: some resources load over HTTP on your HTTPS page. Browsers may block them.');
        }

        if (serverExposed) {
            recommendations.push('Consider removing or obfuscating the Server header to reduce information disclosure.');
        }

        let httpsScore = 0;
        if (httpsEnabled) httpsScore += 15;
        if (redirects || parsed.protocol === 'https') httpsScore += 5;
        if (certificate.valid) httpsScore += 10;
        else if (httpsEnabled) httpsScore += 0;

        score = Math.min(100, Math.round(score + httpsScore));
        if (!httpsEnabled) score = Math.min(score, 40);
        if (!certificate.valid && httpsEnabled) score = Math.min(score, 50);

        const grade = getGrade(score);

        const securityResult: SecurityResult = {
            status: 'success',
            data: {
                score,
                grade,
                https: {
                    enabled: httpsEnabled,
                    redirects,
                    certificate,
                },
                headers: headerChecks,
                mixedContent,
                serverExposed,
                recommendations: recommendations.length > 0 ? recommendations : ['Your site has strong security headers. Maintain these standards.'],
            },
        };

        logger.info({ url, score, grade }, '[Security] Audit complete');

        return {
            moduleId: 'security',
            status: 'success',
            timestamp: new Date().toISOString(),
            data: securityResult,
        };
    } catch (error) {
        logger.error({ error, url }, '[Security] Audit failed');
        return {
            moduleId: 'security',
            status: 'success',
            timestamp: new Date().toISOString(),
            data: {
                status: 'error',
                data: {
                    score: 0,
                    grade: 'F',
                    https: { enabled: false, redirects: false, certificate: { valid: false, expiresAt: '', issuer: '' } },
                    headers: [],
                    mixedContent: false,
                    serverExposed: false,
                    recommendations: [`Security audit failed: ${error instanceof Error ? error.message : 'Unknown error'}. Ensure the URL is accessible.`],
                },
            },
        };
    }
}
