import { logger } from '@/lib/logger';

export type EnrichmentProvider = 'APOLLO' | 'HUNTER' | 'PROXYCURL' | 'CLEARBIT';
export type EnrichmentRunStatus = 'SUCCESS' | 'FAILED' | 'SKIPPED';

export interface EnrichmentLeadInput {
    businessName: string;
    website?: string | null;
    city?: string | null;
    state?: string | null;
}

export interface EnrichedContact {
    name?: string | null;
    title?: string | null;
    email?: string | null;
    linkedin?: string | null;
}

export interface ProviderRunResult {
    provider: EnrichmentProvider;
    status: EnrichmentRunStatus;
    costCents: number;
    contact: EnrichedContact | null;
    payload?: unknown;
    error?: string;
}

export interface EmailVerificationResult {
    provider: 'zerobounce' | 'neverbounce' | 'none';
    status: 'valid' | 'invalid' | 'unknown';
    raw?: unknown;
}

export interface EnrichmentResult {
    contact: EnrichedContact | null;
    runs: ProviderRunResult[];
    emailVerification: EmailVerificationResult;
    totalCostCents: number;
    status?: 'SUCCESS' | 'FAILED' | 'no_decision_maker';
}

function normalizeWebsite(website: string | null | undefined): string | null {
    if (!website) return null;
    const trimmed = website.trim();
    if (!trimmed) return null;
    try {
        const normalized = trimmed.startsWith('http://') || trimmed.startsWith('https://')
            ? trimmed
            : `https://${trimmed}`;
        return new URL(normalized).toString();
    } catch {
        return null;
    }
}

function getDomain(website: string | null | undefined): string | null {
    const normalized = normalizeWebsite(website);
    if (!normalized) return null;
    try {
        return new URL(normalized).hostname.replace(/^www\./, '');
    } catch {
        return null;
    }
}

function mergeContact(base: EnrichedContact | null, next: EnrichedContact | null): EnrichedContact | null {
    if (!base && !next) return null;
    if (!base) return next;
    if (!next) return base;

    return {
        name: base.name || next.name || null,
        title: base.title || next.title || null,
        email: base.email || next.email || null,
        linkedin: base.linkedin || next.linkedin || null,
    };
}

async function runApollo(lead: EnrichmentLeadInput): Promise<ProviderRunResult> {
    const apiKey = process.env.APOLLO_API_KEY;
    const domain = getDomain(lead.website);
    if (!apiKey) {
        return {
            provider: 'APOLLO',
            status: 'SKIPPED',
            costCents: 0,
            contact: null,
            error: 'APOLLO_API_KEY is not configured',
        };
    }
    if (!domain) {
        return {
            provider: 'APOLLO',
            status: 'SKIPPED',
            costCents: 0,
            contact: null,
            error: 'No business domain available for Apollo search',
        };
    }

    try {
        const res = await fetch('https://api.apollo.io/v1/mixed_people/search', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-Api-Key': apiKey,
            },
            body: JSON.stringify({
                q_organization_domains: [domain],
                person_titles: ['Owner', 'Founder', 'CEO', 'Marketing Director', 'General Manager'],
                page: 1,
                per_page: 5,
            }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
            return {
                provider: 'APOLLO',
                status: 'FAILED',
                costCents: 8,
                contact: null,
                payload: data,
                error: `Apollo request failed (${res.status})`,
            };
        }

        const people: Array<Record<string, unknown>> = Array.isArray((data as Record<string, unknown>).people)
            ? ((data as Record<string, unknown>).people as Array<Record<string, unknown>>)
            : [];
        const person = people.find((p) => typeof p.email === 'string') ?? people[0];

        if (!person) {
            return {
                provider: 'APOLLO',
                status: 'FAILED',
                costCents: 8,
                contact: null,
                payload: data,
                error: 'Apollo returned no contacts',
            };
        }

        return {
            provider: 'APOLLO',
            status: 'SUCCESS',
            costCents: 8,
            payload: data,
            contact: {
                name: typeof person.name === 'string' ? person.name : null,
                title: typeof person.title === 'string' ? person.title : null,
                email: typeof person.email === 'string' ? person.email : null,
                linkedin: typeof person.linkedin_url === 'string' ? person.linkedin_url : null,
            },
        };
    } catch (error) {
        return {
            provider: 'APOLLO',
            status: 'FAILED',
            costCents: 8,
            contact: null,
            error: error instanceof Error ? error.message : String(error),
        };
    }
}

async function runHunter(lead: EnrichmentLeadInput): Promise<ProviderRunResult> {
    const apiKey = process.env.HUNTER_API_KEY;
    const domain = getDomain(lead.website);
    if (!apiKey) {
        return {
            provider: 'HUNTER',
            status: 'SKIPPED',
            costCents: 0,
            contact: null,
            error: 'HUNTER_API_KEY is not configured',
        };
    }
    if (!domain) {
        return {
            provider: 'HUNTER',
            status: 'SKIPPED',
            costCents: 0,
            contact: null,
            error: 'No business domain available for Hunter search',
        };
    }

    try {
        const endpoint = new URL('https://api.hunter.io/v2/domain-search');
        endpoint.searchParams.set('domain', domain);
        endpoint.searchParams.set('api_key', apiKey);

        const res = await fetch(endpoint.toString());
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
            return {
                provider: 'HUNTER',
                status: 'FAILED',
                costCents: 5,
                contact: null,
                payload: data,
                error: `Hunter request failed (${res.status})`,
            };
        }

        const payload = data as Record<string, unknown>;
        const hunterData = (payload.data && typeof payload.data === 'object')
            ? payload.data as { emails?: Array<Record<string, unknown>> }
            : undefined;
        const emails = Array.isArray(hunterData?.emails) ? hunterData.emails : [];
        const emailRow = emails.find((row) => typeof row.value === 'string') ?? emails[0];
        if (!emailRow) {
            return {
                provider: 'HUNTER',
                status: 'FAILED',
                costCents: 5,
                contact: null,
                payload: data,
                error: 'Hunter returned no emails',
            };
        }

        const fullName = [emailRow.first_name, emailRow.last_name]
            .filter((part): part is string => typeof part === 'string' && part.trim().length > 0)
            .join(' ')
            .trim();

        return {
            provider: 'HUNTER',
            status: 'SUCCESS',
            costCents: 5,
            payload: data,
            contact: {
                name: fullName || null,
                title: typeof emailRow.position === 'string' ? emailRow.position : null,
                email: typeof emailRow.value === 'string' ? emailRow.value : null,
                linkedin: null,
            },
        };
    } catch (error) {
        return {
            provider: 'HUNTER',
            status: 'FAILED',
            costCents: 5,
            contact: null,
            error: error instanceof Error ? error.message : String(error),
        };
    }
}

async function runProxycurl(lead: EnrichmentLeadInput): Promise<ProviderRunResult> {
    const apiKey = process.env.PROXYCURL_API_KEY;
    const domain = getDomain(lead.website);
    if (!apiKey) {
        return {
            provider: 'PROXYCURL',
            status: 'SKIPPED',
            costCents: 0,
            contact: null,
            error: 'PROXYCURL_API_KEY is not configured',
        };
    }
    if (!domain) {
        return {
            provider: 'PROXYCURL',
            status: 'SKIPPED',
            costCents: 0,
            contact: null,
            error: 'No business domain available for Proxycurl search',
        };
    }

    try {
        const endpoint = new URL('https://nubela.co/proxycurl/api/linkedin/company/employees');
        endpoint.searchParams.set('company_domain', domain);
        endpoint.searchParams.set('role_search', 'owner');
        endpoint.searchParams.set('page_size', '5');

        const res = await fetch(endpoint.toString(), {
            headers: {
                Authorization: `Bearer ${apiKey}`,
            },
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
            return {
                provider: 'PROXYCURL',
                status: 'FAILED',
                costCents: 8,
                contact: null,
                payload: data,
                error: `Proxycurl request failed (${res.status})`,
            };
        }

        const employees = Array.isArray((data as Record<string, unknown>).employees)
            ? ((data as Record<string, unknown>).employees as Array<Record<string, unknown>>)
            : [];
        const person = employees[0];
        if (!person) {
            return {
                provider: 'PROXYCURL',
                status: 'FAILED',
                costCents: 8,
                contact: null,
                payload: data,
                error: 'Proxycurl returned no matching employees',
            };
        }

        return {
            provider: 'PROXYCURL',
            status: 'SUCCESS',
            costCents: 8,
            payload: data,
            contact: {
                name: typeof person.full_name === 'string' ? person.full_name : null,
                title: typeof person.occupation === 'string' ? person.occupation : null,
                email: typeof person.work_email === 'string' ? person.work_email : null,
                linkedin: typeof person.linkedin_profile_url === 'string' ? person.linkedin_profile_url : null,
            },
        };
    } catch (error) {
        return {
            provider: 'PROXYCURL',
            status: 'FAILED',
            costCents: 8,
            contact: null,
            error: error instanceof Error ? error.message : String(error),
        };
    }
}

async function runClearbit(lead: EnrichmentLeadInput): Promise<ProviderRunResult> {
    const apiKey = process.env.CLEARBIT_API_KEY;
    const domain = getDomain(lead.website);
    if (!apiKey) {
        return {
            provider: 'CLEARBIT',
            status: 'SKIPPED',
            costCents: 0,
            contact: null,
            error: 'CLEARBIT_API_KEY is not configured',
        };
    }
    if (!domain) {
        return {
            provider: 'CLEARBIT',
            status: 'SKIPPED',
            costCents: 0,
            contact: null,
            error: 'No business domain available for Clearbit search',
        };
    }

    try {
        const endpoint = new URL('https://person.clearbit.com/v2/combined/find');
        endpoint.searchParams.set('domain', domain);

        const res = await fetch(endpoint.toString(), {
            headers: {
                Authorization: `Bearer ${apiKey}`,
            },
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
            return {
                provider: 'CLEARBIT',
                status: 'FAILED',
                costCents: 6,
                contact: null,
                payload: data,
                error: `Clearbit request failed (${res.status})`,
            };
        }

        const person = ((data as Record<string, unknown>).person ?? {}) as Record<string, unknown>;
        const personName = ((person.name ?? {}) as Record<string, unknown>).fullName;
        const employment = ((person.employment ?? {}) as Record<string, unknown>);
        const linkedin = ((person.linkedin ?? {}) as Record<string, unknown>);

        const contact: EnrichedContact = {
            name: typeof personName === 'string' ? personName : null,
            title: typeof employment.title === 'string' ? employment.title : null,
            email: typeof person.email === 'string' ? person.email : null,
            linkedin: typeof linkedin.handle === 'string' ? `https://www.linkedin.com/in/${linkedin.handle}` : null,
        };

        if (!contact.name && !contact.email) {
            return {
                provider: 'CLEARBIT',
                status: 'FAILED',
                costCents: 6,
                contact: null,
                payload: data,
                error: 'Clearbit returned no usable person profile',
            };
        }

        return {
            provider: 'CLEARBIT',
            status: 'SUCCESS',
            costCents: 6,
            payload: data,
            contact,
        };
    } catch (error) {
        return {
            provider: 'CLEARBIT',
            status: 'FAILED',
            costCents: 6,
            contact: null,
            error: error instanceof Error ? error.message : String(error),
        };
    }
}

async function verifyEmail(email: string | null | undefined): Promise<EmailVerificationResult> {
    if (!email) {
        return { provider: 'none', status: 'unknown' };
    }

    const zeroBounceKey = process.env.ZEROBOUNCE_API_KEY;
    if (zeroBounceKey) {
        try {
            const endpoint = new URL('https://api.zerobounce.net/v2/validate');
            endpoint.searchParams.set('api_key', zeroBounceKey);
            endpoint.searchParams.set('email', email);

            const res = await fetch(endpoint.toString());
            const data = await res.json().catch(() => ({}));
            if (res.ok) {
                const status = (data as Record<string, unknown>).status;
                return {
                    provider: 'zerobounce',
                    status: status === 'valid' ? 'valid' : status === 'invalid' ? 'invalid' : 'unknown',
                    raw: data,
                };
            }
        } catch {
            // Continue to NeverBounce fallback.
        }
    }

    const neverBounceKey = process.env.NEVERBOUNCE_API_KEY;
    if (neverBounceKey) {
        try {
            const endpoint = new URL('https://api.neverbounce.com/v4/single/check');
            endpoint.searchParams.set('key', neverBounceKey);
            endpoint.searchParams.set('email', email);

            const res = await fetch(endpoint.toString());
            const data = await res.json().catch(() => ({}));
            if (res.ok) {
                const result = ((data as Record<string, unknown>).result || '').toString().toLowerCase();
                const status = result === 'valid' ? 'valid' : result === 'invalid' ? 'invalid' : 'unknown';
                return {
                    provider: 'neverbounce',
                    status,
                    raw: data,
                };
            }
        } catch {
            // Fall through.
        }
    }

    return { provider: 'none', status: 'unknown' };
}

export async function runEnrichmentWaterfall(lead: EnrichmentLeadInput): Promise<EnrichmentResult> {
    const runners = [runApollo, runHunter, runProxycurl, runClearbit];
    const runs: ProviderRunResult[] = [];
    const allGenericPrefixes = [
        'info', 'contact', 'hello', 'support', 'sales', 'admin',
        'team', 'office', 'help', 'enquiry', 'enquiries',
        'billing', 'noreply', 'no-reply'
    ];
    let allCandidatesWereGeneric = true; // Assume all are generic until a non-generic is found
    let anyCandidatesFound = false;
    let mergedContact: EnrichedContact | null = null;

    for (const runner of runners) {
        const result = await runner(lead);

        // Filter out generic role-based emails
        if (result.contact?.email) {
            anyCandidatesFound = true;
            const emailPrefix = result.contact.email.split('@')[0].toLowerCase();
            if (allGenericPrefixes.includes(emailPrefix)) {
                logger.info({ email: result.contact.email }, 'Rejected generic email address from provider');
                result.contact.email = null;
                // If the contact is basically empty now, set it to failed to trigger next provider
                if (!result.contact.name && !result.contact.linkedin) {
                    result.status = 'FAILED';
                    result.error = 'Rejected generic email address';
                    result.contact = null;
                }
            } else {
                allCandidatesWereGeneric = false; // At least one non-generic candidate found
            }
        }

        runs.push(result);
        mergedContact = mergeContact(mergedContact, result.contact);

        if (result.status === 'SUCCESS' && mergedContact?.email) {
            break;
        }
    }

    const emailVerification = await verifyEmail(mergedContact?.email ?? null);
    const totalCostCents = runs.reduce((sum, run) => sum + run.costCents, 0);

    // If all providers returned only generic emails, mark as no_decision_maker (if no valid email found)
    let finalStatus: 'SUCCESS' | 'FAILED' | 'no_decision_maker' = 'SUCCESS';
    if (!mergedContact?.email) {
        if (anyCandidatesFound && allCandidatesWereGeneric) {
            finalStatus = 'no_decision_maker';
            logger.warn({ businessName: lead.businessName }, 'All email candidates were generic, marked as no_decision_maker');
        } else {
            finalStatus = 'FAILED';
        }
    }

    logger.info({
        event: 'outreach.enrichment.complete',
        businessName: lead.businessName,
        providersTried: runs.length,
        hasContact: Boolean(mergedContact),
        hasEmail: Boolean(mergedContact?.email),
        totalCostCents,
        emailVerification: emailVerification.status,
    }, 'Outreach enrichment waterfall completed');

    return {
        contact: mergedContact,
        runs,
        emailVerification,
        totalCostCents,
        status: finalStatus,
    };
}
