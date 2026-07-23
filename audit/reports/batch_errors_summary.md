# Batch Audit — Dev Server Error Summary

**From dev server logs during batch run**

## 1. LangSmith 403 (non-blocking)
- Message: API key org-scoped, needs LANGSMITH_WORKSPACE_ID
- Fix: Add LANGSMITH_WORKSPACE_ID to .env.local or disable LANGCHAIN_API_KEY

## 2. LLM Clustering JSON parse (recovered)
- Gemini sometimes returns malformed JSON; pipeline recovers and continues

## 3. __import_unsupported / GET 404 (Turbopack)
- Edge import of fs causes ReferenceError; may return HTML instead of JSON

## 4. [Accessibility] Scan failed
- Puppeteer/axe can fail on some sites; audit continues without a11y findings

## 5. Batch fetch failed / Unexpected token
- Server returned HTML (404/500) instead of JSON; run smaller batches
