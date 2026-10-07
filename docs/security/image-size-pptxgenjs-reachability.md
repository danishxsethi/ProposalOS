# Image-size / PptxGenJS Security Qualification

**Review date:** 2026-09-25
**Disposition:** vulnerable parser fixed by upstream package version; presentation boundary also excludes image input
**Exception:** none

## Dependency graph and fix

The production dependency path is:

```text
ProposalOS
└── pptxgenjs@4.0.1
    └── image-size@2.0.4 (npm override)
```

`image-size@2.0.4` is published by the upstream `image-size/image-size` project under MIT, declares Node `>=18`, and is pinned in `package-lock.json` with registry integrity metadata. The npm advisories list the affected ranges as `<=2.0.2` and patched version `2.0.3`. The override selects `2.0.4`, a released upstream package outside both vulnerable ranges; it does not claim that PptxGenJS itself has released a fix.

The npm production audit after the override reports 0 HIGH and 0 CRITICAL vulnerabilities. `scripts/check-dependency-audits.ts`, exposed as `npm run security:audit:prod`, parses audit JSON for production and all dependency scopes and fails on any HIGH or CRITICAL result. There is no allowlist or expiry exception.

## Advisory details

* GHSA-5p2g-fcmc-qvqq / CVE-2025-71329: malformed JXL/HEIF boxes with zero-sized lengths could leave parser offsets unchanged and block the Node.js event loop. Affected `image-size >=1.2.0 <=2.0.2`; upstream patched at `2.0.3`.
* GHSA-w3rx-r6r6-pgpr / CVE-2025-71330: a malformed ICNS entry with a zero length could leave the parser offset unchanged and block the Node.js event loop. Affected `image-size >=0.6.3 <=2.0.2`; upstream patched at `2.0.3`.

Both advisories have CVSS 4.0 score 8.7 (High) on GitHub Advisory Database at review time.

## Production call-site and byte provenance review

Repository source search found one PptxGenJS production call site: `app/api/presentation/[token]/export/route.ts`. It imports `pptxgenjs`, creates text-and-shape slides, and serializes them. It does not call `addImage`, `tableToSlides` with image options, image sizing helpers, or any image API. Inputs are fields from `resolvePublicProposalAccess(token)`, which verifies trust, lineage, version-bound approval/fingerprint, expiry, and revocation and returns a redacted public DTO. The export reads no evidence raw responses, screenshots, upload bytes, image URLs, database blobs, or user-selected paths. Branding contributes text only (`branding.name`).

The hosted presentation in `app/presentation/[token]/page.tsx` uses the same resolver and passes the public projection to `PresentationClient`. The optional branding logo is rendered by the browser on the hosted page; it is not passed to the PPTX generator or server parser.

PptxGenJS 4.0.1's CommonJS production bundle contains its image-addition helper but has no `image-size` import/reference. A fresh child process importing PptxGenJS confirmed `image-size` was not loaded. Although the package is present in the dependency graph and its parser is directly callable in the application runtime, there is no current production call path from the public export request or user-controlled content into that parser. Future image support must not be added to the PPTX route without security review.

## Regression and local parser evidence

`tests/security/presentation-export-boundary.test.ts` enforces that PPTX export continues to call the shared public access resolver and contains no `addImage` or image-data helper and does not read raw evidence or Prisma internals. `tests/security/image-size-advisory-regression.test.ts` runs malformed ICNS, HEIF, and JXL zero-length box samples in child processes with a two-second hard timeout and checks the installed version.

Malformed zero-length ICNS, HEIF, and JXL fixtures were invoked against installed `image-size@2.0.4`; all were rejected (`TypeError`) inside the child-process timeout. The ICNS parser rejects entry sizes below 8, HEIF verifies forward offset progress, and JXL rejects undersized `jxlp` boxes. On 2026-09-25 GitHub advisories and npm metadata identified upstream patched `2.0.3`; no private patch was made.

## Operational policy

Production HIGH or CRITICAL advisories block qualification unless the vulnerable dependency is actually removed/patched or a separately approved, expiring exception is accepted. The current resolution is upstream-patched dependency replacement, so no exception is active. New `addImage`/image-data support in presentation generation, changed dependency chain or version, a new advisory, or changes to the public projection require renewed review. `npm run security:audit:prod` is part of `npm run qualify:proposal-trust` and fails on unexpected HIGH/CRITICAL findings.
