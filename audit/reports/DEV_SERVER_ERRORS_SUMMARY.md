# Dev Server Logs — Batch Audit Error Summary

**Date:** 2026-02-16

## Batch Report Errors (from batch_audit_2026-02-16T19-54-56.md)

- **fetch failed** — Client couldn't reach the server (connection refused, timeout, or server overload)
- **Unexpected token '<', "<!DOCTYPE "... is not valid JSON** — Server returned HTML (error page) instead of JSON; typically when the server crashed, returned 500, or served a fallback page

## Dev Server Logs (from terminal during batch run)

### 1. LangSmith 403 (non-blocking)
```
Failed to send multipart request. Received status [403]: Forbidden.
Message: This API key is org-scoped and requires workspace specification.
Please provide 'workspaceId' parameter, or set LANGSMITH_WORKSPACE_ID environment variable.
```
**Fix:** Add `LANGSMITH_WORKSPACE_ID` to `.env.local` if using LangSmith tracing.

### 2. LLM Clustering JSON parse errors
```
[LLM Clustering] Error: SyntaxError: Unterminated string in JSON at position 294 (line 6 column 13)
    at JSON.parse (<anonymous>)
    at prompt (lib/diagnosis/llmCluster.ts:82:33)
```
**Cause:** Gemini sometimes returns malformed JSON (unterminated strings, trailing commas).  
**Impact:** Pipeline falls back to pre-clustered groups; proposals still generate.

### 3. Turbopack / Edge runtime
```
⨯ Error [ReferenceError]: __import_unsupported is not defined
    at module evaluation ( (unsupported edge import 'fs'):1:23)
```
**Cause:** Some route or middleware imports `fs` in an edge context where it's not supported.  
**Impact:** GET / 404 and related requests; may affect batch client if it hits wrong paths.

### 4. Accessibility scan failures
```
[2026-02-16 13:38:18.126] ERROR: [Accessibility] Scan failed
    url: "https://wlaw.com/"
    error: {}
```
**Cause:** Accessibility module (axe-core/puppeteer) failed with empty error object.  
**Impact:** Accessibility findings missing; audit still completes.

### 5. Website crawl 403
```
Page crawled url: "https://wlaw.com/" status: 403
```
**Cause:** Target site blocked the crawler (bot detection, rate limit).  
**Impact:** Fewer crawler findings; audit continues with other modules.

---

## Recommendations

1. **Reduce load:** Run `npm run batch-audit -- --retry --limit 10` to retry failed audits in batches of 10.
2. **Ensure ProposalOS dev server is up:** Start `npm run dev` in ProposalOS before batch runs. **Important:** Port 3000 must serve ProposalOS, not another app (e.g. SwingLabs). If 3000 is in use, stop that process or run ProposalOS on another port and set `BASE_URL` when running the batch.
3. ~~**Harden LLM JSON parsing**~~ ✅ Done — `lib/diagnosis/llmCluster.ts` now handles trailing commas.
4. ~~**Fix fs import**~~ ✅ Done — `instrumentation.ts` now uses dynamic `import('dotenv')` to avoid pulling fs into Edge runtime.
