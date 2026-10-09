# Development dependency advisory proposals (owner review only)

Date checked: 2026-10-09
Scope: lockfile reachable dependency paths; no exception is active.

The fresh audit after the `uuid` update reports 0 critical, 12 high, 2 moderate, and 1 low for the full lockfile; `npm audit --omit=dev --json` reports 0 findings. The 12 high package records are manifestations of the two advisories below, not 12 independent root causes.

## Applied production advisory fix

- `uuid` was updated from 9.0.1 to 11.1.1, the first patched release in the 11.x line for `GHSA-w5hq-g745-h8pq`. Repository source imports only `v4`; the vulnerable buffer-taking `v3`, `v5`, and `v6` operations are not used.
- This is a major package version step from the prior 9.x range. The used `v4` CommonJS API smoke check and repository TypeScript typecheck pass. `uuid` v11 retains CommonJS support; v12 is where the upstream release notes record its removal.
- No production audit finding remains. This update does not clear the full-tree HIGH policy failure below.
- Advisory and upstream compatibility evidence: [GitHub advisory GHSA-w5hq-g745-h8pq](https://github.com/advisories/GHSA-w5hq-g745-h8pq), [uuid v11.1.1 release](https://github.com/uuidjs/uuid/releases/tag/v11.1.1), [uuid v12.0.0 breaking changes](https://github.com/uuidjs/uuid/releases/tag/v12.0.0).

Registry checks on this date found no patched `braces` release (`braces@3.0.3` remains latest), and `get-uri@8.0.1` still declares `basic-ftp: ^5.3.1`, which cannot select the fixed 6.2.1+ release. `npm audit`'s automatic suggestions require major changes, including `tailwindcss@4.3.3`, `release-it@15.10.3` (a downgrade from the locked 19.2.4), and `eslint-config-next@14.2.35` (a downgrade from the locked 16.3.8). None was applied. No exception is active.

The repository's dependency audit rejects HIGH/CRITICAL findings anywhere in the lockfile. These proposals do not change `scripts/check-dependency-audits.ts`, npm audit thresholds, or CI policy. They require explicit owner approval before any policy exception is implemented.

## Proposal A — braces stack exhaustion

- **Advisory:** `GHSA-vfj7-8cjw-p6xm` / `CVE-2026-93687`; High; affected `braces <=3.0.3`; GitHub lists no patched version.
- **Installed version and paths:** `braces@3.0.3`, development-only, through:
  - `tailwindcss@3.4.19 -> chokidar@3.6.0 -> braces@3.0.3`
  - `tailwindcss@3.4.19 -> micromatch@4.0.8 -> braces@3.0.3`
  - `tailwindcss@3.4.19 -> fast-glob@3.3.3 -> micromatch@4.0.8 -> braces@3.0.3`
  - `eslint-config-next@16.3.8 -> @next/eslint-plugin-next@16.3.8 -> fast-glob@3.3.1 -> micromatch@4.0.8 -> braces@3.0.3`
- **Operation and reachability:** attacker-controlled deeply nested brace patterns can exhaust the Node.js stack. The affected package is not in the production-only dependency audit. These paths are build/watch tooling; a malicious source change could still supply hostile patterns to CI tooling, so “development-only” is not equivalent to “no CI exposure.” Current app request data does not call `braces` directly.
- **Smallest supported fix:** none observed upstream at this check; the advisory lists no patched release. A Tailwind major migration or an unreviewed fork/override would expand compatibility risk without a supported fix.
- **Proposed exception (not approved):** allow only `GHSA-vfj7-8cjw-p6xm` for exact `braces@3.0.3` on the two paths above, only in the full development dependency audit. No production scope, no wildcard package/version/path match, and no suppression of other `braces` advisories.
- **Compensating controls:** keep lockfile integrity; do not run arbitrary user-supplied glob patterns in production; keep PR workflow permissions minimal; keep production-only audit fail-closed; review the upstream advisory before each release.
- **Expiry/revocation:** expire by **2026-11-07**. Remove immediately when an upstream patched `braces` version satisfies the existing ranges or the paths disappear. Revoke if any production path appears, an exploit reaches a production process, a patched version is released, or the lockfile path changes.
- **Automated policy tests if approved:** assert the exact package/version/advisory/path tuple; assert the exception is rejected after expiry; assert production HIGH/CRITICAL count remains zero; assert any new advisory or path fails closed. Do not suppress all development findings.

## Proposal B — basic-ftp listing parser denial of service

- **Advisory:** `GHSA-c475-qrg2-pj4r` / `CVE-2026-102990`; High; affected `basic-ftp <=6.2.0`; fixed in 6.2.1. Registry currently reports `basic-ftp@6.2.3` as the current 6.x release.
- **Installed version and path:** `basic-ftp@5.3.1`, development-only, reachable as `release-it@19.2.4 -> proxy-agent@6.5.0 -> pac-proxy-agent@7.2.0 -> get-uri@6.0.5 -> basic-ftp@5.3.1`. `get-uri@8.0.1` still declares `basic-ftp: ^5.3.1`; that range cannot select patched 6.x. `release-it@21.1.1` now uses `proxy-agent@8.0.2`, but that is a major release and its `get-uri` path still leaves the basic-ftp 5.x range in the current registry graph.
- **Operation and reachability:** the advisory is in `Client.list()`'s Unix directory-listing parser, where a malicious FTP server can cause quadratic CPU use. `get-uri@6.0.5`'s FTP handler calls `client.list(dirname)` when the server does not support its `MDTM` command, so the vulnerable operation is present in this transitive path. Reaching it requires a development tool to load an FTP URL through `get-uri` (for example, proxy/PAC handling selected by environment configuration) and a malicious FTP response. The app does not directly import `basic-ftp`, and no proxy environment variable is declared in tracked app or Terraform configuration. Runtime environment values were not read. `npm ls` also reports that release-it's dev-only `proxy-agent@6.5.0` is deduped into `@puppeteer/browsers`' optional peer range `>=8.0.1`; this peer mismatch is not the advisory fix and remains unmodified. The vulnerable operation is development-only, but not unreachable by construction.
- **Smallest supported fix:** no compatible 5.x patched version was found. The patched `basic-ftp` line is 6.x, while `get-uri` declares only the 5.x range. Forcing a major override is not supported by that declaration and has not been compatibility-tested. The audit's automatic alternatives are major changes (`release-it@15.10.3` or `tailwindcss@4.3.3`), so neither was applied. No override was added.
- **Proposed exception (not approved):** allow only `GHSA-c475-qrg2-pj4r` for exact `basic-ftp@5.3.1` on the path above, development scope only. It must not suppress other `basic-ftp` advisories or apply to production.
- **Compensating controls:** do not run release tooling on untrusted branches; avoid PAC/FTP proxy inputs from untrusted sources; keep the installed tree development-only; retain the production audit as a hard gate; recheck `get-uri` and `basic-ftp` before every release.
- **Expiry/revocation:** expire by **2026-11-07**. Remove immediately when `get-uri` adopts a patched compatible `basic-ftp` range, a supported 5.x fix is released, or the vulnerable dependency path is removed. Revoke if `Client.list()` is reachable from attacker-controlled FTP responses in an automated CI or production process.
- **Automated policy tests if approved:** exact advisory/package/version/path match only; development-only proof; expiry enforcement; production HIGH/CRITICAL remains zero; any new path, package version, advisory, or production resolution fails closed.

## Owner decision required

Approve or reject each proposal separately. Until approval, both remain unexcepted, and the full dependency audit remains blocked by HIGH advisories. Do not publish an exception by editing the audit script or adding broad allowlists.
