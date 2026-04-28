Phase 2 Baseline - Pre-RLS-Migration Snapshot
Captured: 2026-04-28T23:08:29Z
Branch: phase-1-authz-remediation
HEAD commit: 7235a971d3539f7efce95f8f5a166e996bb7f54d

## Test suite

```
AssertionError: expected 429 to be 200 // Object.is equality

- Expected
+ Received

- 200
+ 429

 ❯ app/api/cron/pipeline-delivery/__tests__/route.test.ts:335:31
    333|       const data = await response.json();
    334|
    335|       expect(response.status).toBe(200);
       |                               ^
    336|       expect(data.success).toBe(true);
    337|       expect(data.escalated).toBe(0);

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[121/391]⎯

 FAIL  app/api/cron/pipeline-delivery/__tests__/route.test.ts > Pipeline Delivery Cron Endpoint > Proposal Completion Check > should check for completed proposals
AssertionError: expected 429 to be 200 // Object.is equality

- Expected
+ Received

- 200
+ 429

 ❯ app/api/cron/pipeline-delivery/__tests__/route.test.ts:368:31
    366|       const data = await response.json();
    367|
    368|       expect(response.status).toBe(200);
       |                               ^
    369|       expect(data.success).toBe(true);
    370|       expect(data.delivered).toBe(1);

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[122/391]⎯

 FAIL  app/api/cron/pipeline-delivery/__tests__/route.test.ts > Pipeline Delivery Cron Endpoint > Proposal Completion Check > should handle completion check failures gracefully
AssertionError: expected 429 to be 200 // Object.is equality

- Expected
+ Received

- 200
+ 429

 ❯ app/api/cron/pipeline-delivery/__tests__/route.test.ts:400:31
    398|       const data = await response.json();
    399|
    400|       expect(response.status).toBe(200);
       |                               ^
    401|       expect(data.success).toBe(true);
    402|       expect(data.delivered).toBe(0);

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[123/391]⎯

 FAIL  app/api/cron/pipeline-delivery/__tests__/route.test.ts > Pipeline Delivery Cron Endpoint > Error Handling > should handle database errors gracefully
AssertionError: expected 429 to be 500 // Object.is equality

- Expected
+ Received

- 500
+ 429

 ❯ app/api/cron/pipeline-delivery/__tests__/route.test.ts:419:31
    417|       const data = await response.json();
    418|
    419|       expect(response.status).toBe(500);
       |                               ^
    420|       expect(data.error).toBe('Internal Server Error');
    421|       expect(data.message).toBe('Database error');

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[124/391]⎯

 FAIL  app/api/cron/pipeline-delivery/__tests__/route.test.ts > Pipeline Delivery Cron Endpoint > Integration > should process all stages in a single run
AssertionError: expected 429 to be 200 // Object.is equality

- Expected
+ Received

- 200
+ 429

 ❯ app/api/cron/pipeline-delivery/__tests__/route.test.ts:470:31
    468|       const data = await response.json();
    469|
    470|       expect(response.status).toBe(200);
       |                               ^
    471|       expect(data.success).toBe(true);
    472|       expect(data.dispatched).toBe(1);

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[125/391]⎯


 Test Files  43 failed | 77 passed (120)
      Tests  240 failed | 1351 passed | 63 skipped (1654)
   Start at  17:08:30
   Duration  139.45s (transform 3.71s, setup 17.90s, import 11.13s, tests 36.41s, environment 50.99s)

```

## Failing test files (names only, for diff comparison)

```
lib/__tests__/proposal.test.ts
lib/pipeline/stages/__tests__/diagnosisProposalStage.test.ts
lib/self-evolving-prompts/__tests__/writeLatency.property.test.ts
tests/e2e/critical-flows.test.ts
tests/integration/audit-api.test.ts
tests/load/audit-load.test.ts
tests/load/outreach-load.test.ts
```

## Type check errors (file:line summary)

```
.next/types/validator.ts(666,31): error TS2344: Type 'typeof import("/Users/danishsethi/VSCODE/ProposalOS/app/api/analytics/tenant/[tenantId]/metrics/route")' does not satisfy the constraint 'RouteHandlerConfig<"/api/analytics/tenant/[tenantId]/metrics">'.
  Types of property 'GET' are incompatible.
    Type '(request: NextRequest, { params }: { params: { tenantId: string; }; }) => Promise<NextResponse<unknown>>' is not assignable to type '(request: NextRequest, context: { params: Promise<{ tenantId: string; }>; }) => void | Response | Promise<void | Response>'.
      Types of parameters '__1' and 'context' are incompatible.
        Type '{ params: Promise<{ tenantId: string; }>; }' is not assignable to type '{ params: { tenantId: string; }; }'.
          Types of property 'params' are incompatible.
            Property 'tenantId' is missing in type 'Promise<{ tenantId: string; }>' but required in type '{ tenantId: string; }'.
.next/types/validator.ts(1386,31): error TS2344: Type 'typeof import("/Users/danishsethi/VSCODE/ProposalOS/app/api/prompt/experiments/[id]/route")' does not satisfy the constraint 'RouteHandlerConfig<"/api/prompt/experiments/[id]">'.
  Types of property 'GET' are incompatible.
    Type '(request: NextRequest, { params }: { params: { id: string; }; }) => Promise<NextResponse<{ error: string; }> | NextResponse<{ experiment: any; }>>' is not assignable to type '(request: NextRequest, context: { params: Promise<{ id: string; }>; }) => void | Response | Promise<void | Response>'.
      Types of parameters '__1' and 'context' are incompatible.
        Type '{ params: Promise<{ id: string; }>; }' is not assignable to type '{ params: { id: string; }; }'.
          Types of property 'params' are incompatible.
            Property 'id' is missing in type 'Promise<{ id: string; }>' but required in type '{ id: string; }'.
.next/types/validator.ts(1746,31): error TS2344: Type 'typeof import("/Users/danishsethi/VSCODE/ProposalOS/app/api/tenants/[tenantId]/delete-data/route")' does not satisfy the constraint 'RouteHandlerConfig<"/api/tenants/[tenantId]/delete-data">'.
  Types of property 'GET' are incompatible.
    Type '(req: Request, params: { params: { tenantId: string; }; }) => Promise<NextResponse>' is not assignable to type '(request: NextRequest, context: { params: Promise<{ tenantId: string; }>; }) => void | Response | Promise<void | Response>'.
      Types of parameters 'params' and 'context' are incompatible.
        Type '{ params: Promise<{ tenantId: string; }>; }' is not assignable to type '{ params: { tenantId: string; }; }'.
          Types of property 'params' are incompatible.
            Property 'tenantId' is missing in type 'Promise<{ tenantId: string; }>' but required in type '{ tenantId: string; }'.
.next/types/validator.ts(1755,31): error TS2344: Type 'typeof import("/Users/danishsethi/VSCODE/ProposalOS/app/api/tenants/[tenantId]/domain/route")' does not satisfy the constraint 'RouteHandlerConfig<"/api/tenants/[tenantId]/domain">'.
  Types of property 'GET' are incompatible.
    Type '(request: NextRequest, { params }: { params: { tenantId: string; }; }) => Promise<NextResponse<unknown>>' is not assignable to type '(request: NextRequest, context: { params: Promise<{ tenantId: string; }>; }) => void | Response | Promise<void | Response>'.
      Types of parameters '__1' and 'context' are incompatible.
        Type '{ params: Promise<{ tenantId: string; }>; }' is not assignable to type '{ params: { tenantId: string; }; }'.
          Types of property 'params' are incompatible.
            Property 'tenantId' is missing in type 'Promise<{ tenantId: string; }>' but required in type '{ tenantId: string; }'.
.next/types/validator.ts(1764,31): error TS2344: Type 'typeof import("/Users/danishsethi/VSCODE/ProposalOS/app/api/tenants/[tenantId]/domain/verify/route")' does not satisfy the constraint 'RouteHandlerConfig<"/api/tenants/[tenantId]/domain/verify">'.
  Types of property 'POST' are incompatible.
    Type '(request: NextRequest, { params }: { params: { tenantId: string; }; }) => Promise<NextResponse<unknown>>' is not assignable to type '(request: NextRequest, context: { params: Promise<{ tenantId: string; }>; }) => void | Response | Promise<void | Response>'.
      Types of parameters '__1' and 'context' are incompatible.
        Type '{ params: Promise<{ tenantId: string; }>; }' is not assignable to type '{ params: { tenantId: string; }; }'.
          Types of property 'params' are incompatible.
            Property 'tenantId' is missing in type 'Promise<{ tenantId: string; }>' but required in type '{ tenantId: string; }'.
.next/types/validator.ts(1773,31): error TS2344: Type 'typeof import("/Users/danishsethi/VSCODE/ProposalOS/app/api/tenants/[tenantId]/offboard/route")' does not satisfy the constraint 'RouteHandlerConfig<"/api/tenants/[tenantId]/offboard">'.
  Types of property 'POST' are incompatible.
    Type '(request: NextRequest, { params }: { params: { tenantId: string; }; }) => Promise<NextResponse<unknown>>' is not assignable to type '(request: NextRequest, context: { params: Promise<{ tenantId: string; }>; }) => void | Response | Promise<void | Response>'.
      Types of parameters '__1' and 'context' are incompatible.
        Type '{ params: Promise<{ tenantId: string; }>; }' is not assignable to type '{ params: { tenantId: string; }; }'.
          Types of property 'params' are incompatible.
            Property 'tenantId' is missing in type 'Promise<{ tenantId: string; }>' but required in type '{ tenantId: string; }'.
app/api/analytics/tenant/[tenantId]/metrics/route.ts(279,5): error TS2322: Type 'GetAggregateResult<$ProposalPayload<InternalArgs & { result: {}; model: {}; query: {}; client: {}; }>, { where: { tenantId: string; status: "ACCEPTED"; createdAt: { gte: Date; }; }; _count: { ...; }; _sum: { ...; }; }>' is not assignable to type 'number'.
app/api/audit/batch/route.ts(142,48): error TS2345: Argument of type '"member"' is not assignable to parameter of type 'Role'.
app/api/cron/pipeline-delivery/__tests__/route.test.ts(231,9): error TS2353: Object literal may only specify known properties, and 'verified' does not exist in type 'VerificationResult'.
app/api/cron/pipeline-delivery/__tests__/route.test.ts(456,9): error TS2353: Object literal may only specify known properties, and 'verified' does not exist in type 'VerificationResult'.
app/api/cron/signal-detection/__tests__/route.test.ts(264,69): error TS2322: Type '{ id: string; leadId: string; signalType: "bad_review"; sourceData: { reviewRating: number; }; detectedAt: Date; priority: "high"; outreachTriggered: boolean; } | undefined' is not assignable to type 'DetectedSignal'.
  Type 'undefined' is not assignable to type 'DetectedSignal'.
app/api/pipeline/partners/route.ts(113,52): error TS2554: Expected 0-1 arguments, but got 2.
app/api/pipeline/partners/route.ts(158,30): error TS2345: Argument of type '"admin"' is not assignable to parameter of type 'Role'.
app/api/pipeline/prospects/[id]/override/route.ts(79,52): error TS2345: Argument of type '{ field: string; message: string; }[]' is not assignable to parameter of type 'string'.
app/api/pipeline/prospects/[id]/override/route.ts(113,30): error TS2345: Argument of type '"admin"' is not assignable to parameter of type 'Role'.
app/api/settings/api-keys/[id]/route.ts(77,32): error TS2345: Argument of type '"owner"' is not assignable to parameter of type 'Role'.
app/api/settings/api-keys/route.ts(35,3): error TS2345: Argument of type '"admin"' is not assignable to parameter of type 'Role'.
app/api/team/invite/route.ts(16,35): error TS2345: Argument of type '"admin"' is not assignable to parameter of type 'Role'.
app/api/tenants/route.ts(173,7): error TS2322: Type 'string | null' is not assignable to type 'string'.
  Type 'null' is not assignable to type 'string'.
app/api/tenants/route.ts(253,13): error TS2353: Object literal may only specify known properties, and 'proposals' does not exist in type 'TenantCountOutputTypeSelect<InternalArgs & { result: {}; model: {}; query: {}; client: {}; }>'.
claraud-web/src/app/(auth)/layout.tsx(5,22): error TS2307: Cannot find module '@/auth' or its corresponding type declarations.
claraud-web/src/app/(auth)/login/page.tsx(13,24): error TS2307: Cannot find module '@/components/ui/button' or its corresponding type declarations.
claraud-web/src/app/(auth)/login/page.tsx(21,8): error TS2307: Cannot find module '@/components/ui/card' or its corresponding type declarations.
claraud-web/src/app/(auth)/login/page.tsx(22,23): error TS2307: Cannot find module '@/components/ui/input' or its corresponding type declarations.
claraud-web/src/app/(auth)/login/page.tsx(23,23): error TS2307: Cannot find module '@/components/ui/label' or its corresponding type declarations.
claraud-web/src/app/(auth)/login/page.tsx(24,57): error TS2307: Cannot find module '@/components/ui/tooltip' or its corresponding type declarations.
claraud-web/src/app/(auth)/login/page.tsx(25,32): error TS2307: Cannot find module '@/lib/form-utils' or its corresponding type declarations.
claraud-web/src/app/(auth)/login/page.tsx(26,41): error TS2307: Cannot find module '@/lib/schemas/auth' or its corresponding type declarations.
claraud-web/src/app/(auth)/register/page.tsx(13,24): error TS2307: Cannot find module '@/components/ui/button' or its corresponding type declarations.
claraud-web/src/app/(auth)/register/page.tsx(21,8): error TS2307: Cannot find module '@/components/ui/card' or its corresponding type declarations.
claraud-web/src/app/(auth)/register/page.tsx(22,23): error TS2307: Cannot find module '@/components/ui/input' or its corresponding type declarations.
claraud-web/src/app/(auth)/register/page.tsx(23,23): error TS2307: Cannot find module '@/components/ui/label' or its corresponding type declarations.
claraud-web/src/app/(auth)/register/page.tsx(24,32): error TS2307: Cannot find module '@/lib/form-utils' or its corresponding type declarations.
claraud-web/src/app/(auth)/register/page.tsx(25,47): error TS2307: Cannot find module '@/lib/schemas/auth' or its corresponding type declarations.
claraud-web/src/app/(auth)/register/page.tsx(32,12): error TS7006: Parameter 'data' implicitly has an 'any' type.
claraud-web/src/app/(dashboard)/dashboard/analytics/loading.tsx(1,26): error TS2307: Cannot find module '@/components/ui/skeleton' or its corresponding type declarations.
claraud-web/src/app/(dashboard)/dashboard/analytics/page.tsx(8,24): error TS2307: Cannot find module '@/components/ui/button' or its corresponding type declarations.
claraud-web/src/app/(dashboard)/dashboard/analytics/page.tsx(9,58): error TS2307: Cannot find module '@/components/ui/card' or its corresponding type declarations.
claraud-web/src/app/(dashboard)/dashboard/analytics/page.tsx(10,26): error TS2307: Cannot find module '@/components/ui/skeleton' or its corresponding type declarations.
claraud-web/src/app/(dashboard)/dashboard/analytics/page.tsx(11,30): error TS2307: Cannot find module '@/hooks/useDashboardData' or its corresponding type declarations.
claraud-web/src/app/(dashboard)/dashboard/audits/loading.tsx(1,26): error TS2307: Cannot find module '@/components/ui/skeleton' or its corresponding type declarations.
claraud-web/src/app/(dashboard)/dashboard/audits/page.tsx(13,24): error TS2307: Cannot find module '@/components/ui/button' or its corresponding type declarations.
claraud-web/src/app/(dashboard)/dashboard/audits/page.tsx(14,58): error TS2307: Cannot find module '@/components/ui/card' or its corresponding type declarations.
claraud-web/src/app/(dashboard)/dashboard/audits/page.tsx(15,23): error TS2307: Cannot find module '@/components/ui/input' or its corresponding type declarations.
claraud-web/src/app/(dashboard)/dashboard/audits/page.tsx(16,26): error TS2307: Cannot find module '@/components/ui/skeleton' or its corresponding type declarations.
claraud-web/src/app/(dashboard)/dashboard/audits/page.tsx(17,27): error TS2307: Cannot find module '@/hooks/useDashboardData' or its corresponding type declarations.
claraud-web/src/app/(dashboard)/dashboard/audits/page.tsx(67,26): error TS7006: Parameter 'e' implicitly has an 'any' type.
claraud-web/src/app/(dashboard)/dashboard/loading.tsx(1,26): error TS2307: Cannot find module '@/components/ui/skeleton' or its corresponding type declarations.
claraud-web/src/app/(dashboard)/dashboard/page.tsx(11,24): error TS2307: Cannot find module '@/components/ui/button' or its corresponding type declarations.
claraud-web/src/app/(dashboard)/dashboard/page.tsx(12,58): error TS2307: Cannot find module '@/components/ui/card' or its corresponding type declarations.
claraud-web/src/app/(dashboard)/dashboard/page.tsx(13,26): error TS2307: Cannot find module '@/components/ui/skeleton' or its corresponding type declarations.
claraud-web/src/app/(dashboard)/dashboard/page.tsx(14,35): error TS2307: Cannot find module '@/hooks/useDashboardData' or its corresponding type declarations.
claraud-web/src/app/(dashboard)/dashboard/pipeline/loading.tsx(1,26): error TS2307: Cannot find module '@/components/ui/skeleton' or its corresponding type declarations.
claraud-web/src/app/(dashboard)/dashboard/pipeline/page.tsx(8,24): error TS2307: Cannot find module '@/components/ui/button' or its corresponding type declarations.
claraud-web/src/app/(dashboard)/dashboard/pipeline/page.tsx(9,58): error TS2307: Cannot find module '@/components/ui/card' or its corresponding type declarations.
claraud-web/src/app/(dashboard)/dashboard/pipeline/page.tsx(10,26): error TS2307: Cannot find module '@/components/ui/skeleton' or its corresponding type declarations.
claraud-web/src/app/(dashboard)/dashboard/pipeline/page.tsx(52,61): error TS2532: Object is possibly 'undefined'.
claraud-web/src/app/(dashboard)/dashboard/proposals/loading.tsx(1,26): error TS2307: Cannot find module '@/components/ui/skeleton' or its corresponding type declarations.
claraud-web/src/app/(dashboard)/dashboard/proposals/page.tsx(13,24): error TS2307: Cannot find module '@/components/ui/button' or its corresponding type declarations.
claraud-web/src/app/(dashboard)/dashboard/proposals/page.tsx(14,58): error TS2307: Cannot find module '@/components/ui/card' or its corresponding type declarations.
claraud-web/src/app/(dashboard)/dashboard/proposals/page.tsx(15,23): error TS2307: Cannot find module '@/components/ui/input' or its corresponding type declarations.
claraud-web/src/app/(dashboard)/dashboard/proposals/page.tsx(16,26): error TS2307: Cannot find module '@/components/ui/skeleton' or its corresponding type declarations.
claraud-web/src/app/(dashboard)/dashboard/proposals/page.tsx(86,28): error TS7006: Parameter 'e' implicitly has an 'any' type.
claraud-web/src/app/(dashboard)/dashboard/settings/page.tsx(21,24): error TS2307: Cannot find module '@/components/ui/button' or its corresponding type declarations.
claraud-web/src/app/(dashboard)/dashboard/settings/page.tsx(22,75): error TS2307: Cannot find module '@/components/ui/card' or its corresponding type declarations.
claraud-web/src/app/(dashboard)/dashboard/settings/page.tsx(23,23): error TS2307: Cannot find module '@/components/ui/input' or its corresponding type declarations.
claraud-web/src/app/(dashboard)/dashboard/settings/page.tsx(24,23): error TS2307: Cannot find module '@/components/ui/label' or its corresponding type declarations.
claraud-web/src/app/(dashboard)/dashboard/settings/page.tsx(25,26): error TS2307: Cannot find module '@/components/ui/skeleton' or its corresponding type declarations.
claraud-web/src/app/(dashboard)/dashboard/settings/page.tsx(221,42): error TS7006: Parameter 'e' implicitly has an 'any' type.
claraud-web/src/app/(dashboard)/layout.tsx(5,22): error TS2307: Cannot find module '@/auth' or its corresponding type declarations.
claraud-web/src/app/(dashboard)/layout.tsx(6,33): error TS2307: Cannot find module '@/components/dashboard/header' or its corresponding type declarations.
claraud-web/src/app/(dashboard)/layout.tsx(7,34): error TS2307: Cannot find module '@/components/dashboard/sidebar' or its corresponding type declarations.
claraud-web/src/app/(public)/[vertical]/page.tsx(7,24): error TS2307: Cannot find module '@/components/ui/button' or its corresponding type declarations.
claraud-web/src/app/(public)/[vertical]/page.tsx(8,35): error TS2307: Cannot find module '@/components/ui/card' or its corresponding type declarations.
claraud-web/src/app/(public)/about/page.tsx(6,27): error TS2307: Cannot find module '@/components/scan/scan-input' or its corresponding type declarations.
claraud-web/src/app/(public)/about/page.tsx(7,32): error TS2307: Cannot find module '@/components/shared/section-wrapper' or its corresponding type declarations.
claraud-web/src/app/(public)/agencies/page.tsx(20,31): error TS2307: Cannot find module '@/components/agencies/roi-calculator' or its corresponding type declarations.
claraud-web/src/app/(public)/agencies/page.tsx(21,10): error TS2614: Module '"@/components/pricing/agency-tiers"' has no exported member 'AgencyTiers'. Did you mean to use 'import AgencyTiers from "@/components/pricing/agency-tiers"' instead?
claraud-web/src/app/(public)/agencies/page.tsx(22,32): error TS2307: Cannot find module '@/components/shared/section-wrapper' or its corresponding type declarations.
claraud-web/src/app/(public)/agencies/page.tsx(28,8): error TS2307: Cannot find module '@/components/ui/accordion' or its corresponding type declarations.
claraud-web/src/app/(public)/agencies/page.tsx(29,24): error TS2307: Cannot find module '@/components/ui/button' or its corresponding type declarations.
claraud-web/src/app/(public)/agencies/page.tsx(30,28): error TS2307: Cannot find module '@/hooks/use-posthog' or its corresponding type declarations.
claraud-web/src/app/(public)/blog/[slug]/page.tsx(7,27): error TS2307: Cannot find module '@/components/scan/scan-input' or its corresponding type declarations.
claraud-web/src/app/(public)/blog/[slug]/page.tsx(8,24): error TS2307: Cannot find module '@/components/shared/json-ld' or its corresponding type declarations.
claraud-web/src/app/(public)/blog/[slug]/page.tsx(9,32): error TS2307: Cannot find module '@/components/shared/section-wrapper' or its corresponding type declarations.
claraud-web/src/app/(public)/blog/[slug]/page.tsx(10,23): error TS2307: Cannot find module '@/components/ui/badge' or its corresponding type declarations.
claraud-web/src/app/(public)/blog/[slug]/page.tsx(11,44): error TS2307: Cannot find module '@/lib/blog' or its corresponding type declarations.
claraud-web/src/app/(public)/blog/[slug]/page.tsx(15,21): error TS7006: Parameter 'post' implicitly has an 'any' type.
claraud-web/src/app/(public)/blog/[slug]/page.tsx(132,41): error TS7006: Parameter 'p' implicitly has an 'any' type.
claraud-web/src/app/(public)/blog/[slug]/page.tsx(182,36): error TS7006: Parameter 'p' implicitly has an 'any' type.
claraud-web/src/app/(public)/blog/page.tsx(1,26): error TS2307: Cannot find module '@/components/blog/blog-grid' or its corresponding type declarations.
claraud-web/src/app/(public)/blog/page.tsx(2,27): error TS2307: Cannot find module '@/components/scan/scan-input' or its corresponding type declarations.
claraud-web/src/app/(public)/blog/page.tsx(3,32): error TS2307: Cannot find module '@/components/shared/section-wrapper' or its corresponding type declarations.
claraud-web/src/app/(public)/blog/page.tsx(4,29): error TS2307: Cannot find module '@/lib/blog' or its corresponding type declarations.
claraud-web/src/app/(public)/industries/[vertical]/page.tsx(5,27): error TS2307: Cannot find module '@/components/scan/scan-input' or its corresponding type declarations.
claraud-web/src/app/(public)/industries/[vertical]/page.tsx(6,24): error TS2307: Cannot find module '@/components/shared/json-ld' or its corresponding type declarations.
claraud-web/src/app/(public)/industries/[vertical]/page.tsx(7,32): error TS2307: Cannot find module '@/components/shared/section-wrapper' or its corresponding type declarations.
claraud-web/src/app/(public)/industries/[vertical]/page.tsx(8,31): error TS2307: Cannot find module '@/components/shared/severity-badge' or its corresponding type declarations.
claraud-web/src/app/(public)/industries/[vertical]/page.tsx(14,8): error TS2307: Cannot find module '@/components/ui/accordion' or its corresponding type declarations.
claraud-web/src/app/(public)/industries/[vertical]/page.tsx(15,23): error TS2307: Cannot find module '@/components/ui/badge' or its corresponding type declarations.
claraud-web/src/app/(public)/industries/[vertical]/page.tsx(16,50): error TS2307: Cannot find module '@/lib/industries' or its corresponding type declarations.
claraud-web/src/app/(public)/industries/[vertical]/page.tsx(19,37): error TS7006: Parameter 'slug' implicitly has an 'any' type.
claraud-web/src/app/(public)/industries/[vertical]/page.tsx(60,40): error TS7006: Parameter 'p' implicitly has an 'any' type.
claraud-web/src/app/(public)/industries/[vertical]/page.tsx(106,35): error TS7006: Parameter 'problem' implicitly has an 'any' type.
claraud-web/src/app/(public)/industries/[vertical]/page.tsx(106,44): error TS7006: Parameter 'idx' implicitly has an 'any' type.
claraud-web/src/app/(public)/industries/[vertical]/page.tsx(138,43): error TS7006: Parameter 'finding' implicitly has an 'any' type.
claraud-web/src/app/(public)/industries/[vertical]/page.tsx(138,52): error TS7006: Parameter 'idx' implicitly has an 'any' type.
claraud-web/src/app/(public)/industries/[vertical]/page.tsx(202,45): error TS7006: Parameter 'row' implicitly has an 'any' type.
claraud-web/src/app/(public)/industries/[vertical]/page.tsx(202,50): error TS7006: Parameter 'idx' implicitly has an 'any' type.
claraud-web/src/app/(public)/layout.tsx(1,24): error TS2307: Cannot find module '@/components/layout/footer' or its corresponding type declarations.
claraud-web/src/app/(public)/layout.tsx(2,24): error TS2307: Cannot find module '@/components/layout/navbar' or its corresponding type declarations.
claraud-web/src/app/(public)/legal/privacy/page.tsx(1,32): error TS2307: Cannot find module '@/components/shared/section-wrapper' or its corresponding type declarations.
claraud-web/src/app/(public)/legal/terms/page.tsx(1,32): error TS2307: Cannot find module '@/components/shared/section-wrapper' or its corresponding type declarations.
claraud-web/src/app/(public)/page.tsx(3,27): error TS2307: Cannot find module '@/components/home/agency-cta' or its corresponding type declarations.
claraud-web/src/app/(public)/page.tsx(4,26): error TS2307: Cannot find module '@/components/home/final-cta' or its corresponding type declarations.
claraud-web/src/app/(public)/page.tsx(5,22): error TS2307: Cannot find module '@/components/home/hero' or its corresponding type declarations.
claraud-web/src/app/(public)/page.tsx(6,28): error TS2307: Cannot find module '@/components/home/how-it-works' or its corresponding type declarations.
claraud-web/src/app/(public)/page.tsx(7,35): error TS2307: Cannot find module '@/components/home/industry-verticals' or its corresponding type declarations.
claraud-web/src/app/(public)/page.tsx(8,32): error TS2307: Cannot find module '@/components/home/pricing-preview' or its corresponding type declarations.
claraud-web/src/app/(public)/page.tsx(9,32): error TS2307: Cannot find module '@/components/home/problem-section' or its corresponding type declarations.
claraud-web/src/app/(public)/page.tsx(10,29): error TS2307: Cannot find module '@/components/home/social-proof' or its corresponding type declarations.
claraud-web/src/app/(public)/page.tsx(11,29): error TS2307: Cannot find module '@/components/home/what-we-audit' or its corresponding type declarations.
claraud-web/src/app/(public)/page.tsx(12,31): error TS2307: Cannot find module '@/components/layout/sticky-scan-bar' or its corresponding type declarations.
claraud-web/src/app/(public)/page.tsx(13,24): error TS2307: Cannot find module '@/components/shared/json-ld' or its corresponding type declarations.
claraud-web/src/app/(public)/presentation/[token]/page.tsx(3,32): error TS2307: Cannot find module '@/components/proposals/PresentationViewer' or its corresponding type declarations.
claraud-web/src/app/(public)/pricing/page.tsx(8,10): error TS2614: Module '"@/components/pricing/agency-tiers"' has no exported member 'AgencyTiers'. Did you mean to use 'import AgencyTiers from "@/components/pricing/agency-tiers"' instead?
claraud-web/src/app/(public)/pricing/page.tsx(9,27): error TS2307: Cannot find module '@/components/scan/scan-input' or its corresponding type declarations.
claraud-web/src/app/(public)/pricing/page.tsx(10,24): error TS2307: Cannot find module '@/components/shared/json-ld' or its corresponding type declarations.
claraud-web/src/app/(public)/pricing/page.tsx(11,32): error TS2307: Cannot find module '@/components/shared/section-wrapper' or its corresponding type declarations.
claraud-web/src/app/(public)/pricing/page.tsx(17,8): error TS2307: Cannot find module '@/components/ui/accordion' or its corresponding type declarations.
claraud-web/src/app/(public)/pricing/page.tsx(18,24): error TS2307: Cannot find module '@/components/ui/button' or its corresponding type declarations.
claraud-web/src/app/(public)/pricing/page.tsx(19,58): error TS2307: Cannot find module '@/components/ui/tabs' or its corresponding type declarations.
claraud-web/src/app/(public)/pricing/page.tsx(20,28): error TS2307: Cannot find module '@/hooks/use-posthog' or its corresponding type declarations.
claraud-web/src/app/(public)/pricing/page.tsx(154,27): error TS7006: Parameter 'val' implicitly has an 'any' type.
claraud-web/src/app/(public)/proposal/[token]/loading.tsx(1,26): error TS2307: Cannot find module '@/components/ui/skeleton' or its corresponding type declarations.
claraud-web/src/app/(public)/proposal/[token]/page.tsx(3,27): error TS2307: Cannot find module '@/lib/api-client' or its corresponding type declarations.
claraud-web/src/app/(public)/report/[token]/page.tsx(6,33): error TS2307: Cannot find module '@/components/report/competitor-table' or its corresponding type declarations.
claraud-web/src/app/(public)/report/[token]/page.tsx(7,30): error TS2307: Cannot find module '@/components/report/findings-list' or its corresponding type declarations.
claraud-web/src/app/(public)/report/[token]/page.tsx(8,27): error TS2307: Cannot find module '@/components/report/report-cta' or its corresponding type declarations.
claraud-web/src/app/(public)/report/[token]/page.tsx(9,30): error TS2307: Cannot find module '@/components/report/report-header' or its corresponding type declarations.
claraud-web/src/app/(public)/report/[token]/page.tsx(10,31): error TS2307: Cannot find module '@/components/report/score-overview' or its corresponding type declarations.
claraud-web/src/app/(public)/report/[token]/page.tsx(11,32): error TS2307: Cannot find module '@/components/shared/section-wrapper' or its corresponding type declarations.
claraud-web/src/app/(public)/report/[token]/page.tsx(12,23): error TS2307: Cannot find module '@/components/ui/badge' or its corresponding type declarations.
claraud-web/src/app/(public)/report/[token]/page.tsx(13,28): error TS2307: Cannot find module '@/lib/types' or its corresponding type declarations.
claraud-web/src/app/(public)/report/[token]/page.tsx(115,41): error TS7006: Parameter 'cat' implicitly has an 'any' type.
claraud-web/src/app/(public)/report/[token]/page.tsx(117,63): error TS7006: Parameter 'f' implicitly has an 'any' type.
claraud-web/src/app/(public)/scan/[token]/page.tsx(10,27): error TS2307: Cannot find module '@/components/scan/email-gate' or its corresponding type declarations.
claraud-web/src/app/(public)/scan/[token]/page.tsx(11,30): error TS2307: Cannot find module '@/components/scan/scan-progress' or its corresponding type declarations.
claraud-web/src/app/(public)/scan/[token]/page.tsx(12,26): error TS2307: Cannot find module '@/components/ui/progress' or its corresponding type declarations.
claraud-web/src/app/(public)/scan/[token]/page.tsx(13,33): error TS2307: Cannot find module '@/hooks/use-scan-progress' or its corresponding type declarations.
claraud-web/src/app/(public)/scan/[token]/page.tsx(14,34): error TS2307: Cannot find module '@/lib/mock-data' or its corresponding type declarations.
claraud-web/src/app/(public)/scan/[token]/page.tsx(28,8): error TS7006: Parameter 'acc' implicitly has an 'any' type.
claraud-web/src/app/(public)/scan/[token]/page.tsx(28,13): error TS7006: Parameter 'mod' implicitly has an 'any' type.
claraud-web/src/app/(public)/scan/[token]/page.tsx(46,13): error TS7030: Not all code paths return a value.
claraud-web/src/app/(public)/scan/[token]/page.tsx(58,29): error TS7006: Parameter 'mod' implicitly has an 'any' type.
claraud-web/src/app/(public)/scan/[token]/page.tsx(61,26): error TS7006: Parameter 'text' implicitly has an 'any' type.
claraud-web/src/app/(public)/scan/[token]/page.tsx(61,32): error TS7006: Parameter 'idx' implicitly has an 'any' type.
claraud-web/src/app/(public)/scan/page.tsx(5,27): error TS2307: Cannot find module '@/components/scan/scan-input' or its corresponding type declarations.
claraud-web/src/app/api/analytics/route.ts(5,22): error TS2307: Cannot find module '@/auth' or its corresponding type declarations.
claraud-web/src/app/api/audits/route.ts(3,22): error TS2307: Cannot find module '@/auth' or its corresponding type declarations.
claraud-web/src/app/api/auth/register/route.ts(6,32): error TS2307: Cannot find module '@/lib/schemas/auth' or its corresponding type declarations.
claraud-web/src/app/api/dashboard/stats/route.ts(3,22): error TS2307: Cannot find module '@/auth' or its corresponding type declarations.
```

## Build status

```
├ ○ /schedules
├ ○ /settings/api-keys
├ ƒ /settings/billing
├ ○ /settings/branding
├ ○ /settings/domain
├ ○ /settings/integrations
├ ○ /settings/team
├ ○ /settings/templates
├ ƒ /settings/templates/[id]
├ ○ /settings/webhooks
├ ○ /settings/widget
├ ƒ /support
└ ƒ /tenants


ƒ Proxy (Middleware)

○  (Static)   prerendered as static content
ƒ  (Dynamic)  server-rendered on demand

```
