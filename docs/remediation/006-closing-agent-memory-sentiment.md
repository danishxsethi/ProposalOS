# Remediation 006 — Closing Agent Memory Sentiment Fix

**Date:** 2026-05-14  
**Status:** COMPLETE  
**Blocker resolved:** P0/P1 — `lib/closing/__tests__/closing-agent.property.test.ts` failing  
**Production/cloud resources touched:** NONE  
**Secrets changed:** NONE

---

## Original Failure

```
TypeError: ConversationMemory.updateSentiment is not a function
  at RunnableCallable.processInput [as func] lib/closing/agent.ts:282:28
```

Running `npx vitest --run lib/closing/__tests__/closing-agent.property.test.ts` produced 1 failed test:

```
FAIL  lib/closing/__tests__/closing-agent.property.test.ts > Closing Agent - Property-Based Tests > should not exceed maximum context window
Error: Property failed after 9 tests
Counterexample: [["          "]]
Caused by: TypeError: ConversationMemory.updateSentiment is not a function
```

---

## Root Cause

The test file mocked `ConversationMemory` at the module level but only provided two of its four static methods:

```typescript
// BEFORE — incomplete mock
vi.mock('../memory', () => ({
  ConversationMemory: {
    getOrCreateSession: mockGetOrCreateSession,
    addMessage: mockAddMessage,
    // ← updateSentiment missing
    // ← logObjection missing
  },
}));
```

`agent.ts` line 282 calls `ConversationMemory.updateSentiment(state.proposalId, sentimentDelta)` inside the `processInput` graph node. Because the mock didn't include `updateSentiment`, it was `undefined` at runtime, causing the `TypeError`.

The real implementation in `lib/closing/memory.ts` **does have** `updateSentiment` — it's a complete, correct implementation that clamps sentiment to `[-1.0, 1.0]` and increments `engagementScore`. The bug was entirely in the test mock, not in the production code.

**This is not a production code bug.** The implementation was correct. The test mock was incomplete.

---

## Why the Mock Was Incomplete

The `processInput` function in `agent.ts` calls both `ConversationMemory.logObjection` and `ConversationMemory.updateSentiment` when an objection is detected, and `ConversationMemory.updateSentiment` alone on the default engagement path. The test mock was written when only `getOrCreateSession` and `addMessage` were needed for the happy path, and was never updated when the objection/sentiment path was added to `processInput`.

The property test generates arbitrary strings, some of which trigger the objection detection path (e.g., whitespace-only strings that pass through `detectObjection`), which then calls `updateSentiment` — exposing the missing mock.

---

## Files Changed

| File                                                     | Change                                                                      |
| -------------------------------------------------------- | --------------------------------------------------------------------------- |
| `lib/closing/__tests__/closing-agent.property.test.ts`   | Added `updateSentiment` and `logObjection` to the `ConversationMemory` mock |
| `lib/closing/__tests__/memory.test.ts`                   | **New** — 9 unit tests for `ConversationMemory.updateSentiment`             |
| `docs/remediation/006-closing-agent-memory-sentiment.md` | This file                                                                   |

No production code was changed. The implementation was already correct.

---

## Exact Diff

### `lib/closing/__tests__/closing-agent.property.test.ts`

```diff
 vi.mock('../memory', () => {
   const mockGetOrCreateSession = vi.fn();
   const mockAddMessage = vi.fn();
+  const mockUpdateSentiment = vi.fn().mockResolvedValue(undefined);
+  const mockLogObjection = vi.fn().mockResolvedValue(undefined);

   return {
     ConversationMemory: {
       getOrCreateSession: mockGetOrCreateSession,
       addMessage: mockAddMessage,
+      updateSentiment: mockUpdateSentiment,
+      logObjection: mockLogObjection,
     },
   };
 });
```

---

## Implementation Decision

The fix adds the missing mock methods rather than changing the production code because:

1. `ConversationMemory.updateSentiment` exists and is correctly implemented in `lib/closing/memory.ts`.
2. The property test is testing the **agent's behavior** (input handling, sentiment bounds, escalation, context window), not the memory implementation. Mocking the memory layer is correct for this test.
3. Adding `updateSentiment` to the mock is the minimal, correct fix — it makes the mock match the actual interface.
4. `logObjection` was also missing from the mock and would have caused the same error on any input that triggers the objection detection path. Both were added together.

---

## Tests Added

### `lib/closing/__tests__/memory.test.ts` (new — 9 tests)

| Test                                             | Assertion                                                  |
| ------------------------------------------------ | ---------------------------------------------------------- |
| exists and is a function                         | `typeof ConversationMemory.updateSentiment === 'function'` |
| returns undefined when state not found           | `null` state → `undefined` return, no DB update            |
| applies positive delta and clamps to 1.0         | `0.9 + 0.5 → 1.0`                                          |
| applies negative delta and clamps to -1.0        | `-0.8 + (-0.5) → -1.0`                                     |
| applies small positive delta without clamping    | `0.0 + 0.05 → 0.05`                                        |
| applies small negative delta without clamping    | `0.0 + (-0.2) → -0.2`                                      |
| increments engagementScore on every call         | `engagementScore: { increment: 1 }` in update              |
| handles delta of exactly 0                       | `0.5 + 0 → 0.5`                                            |
| result stays within [-1, 1] for series of deltas | 8-step simulation, all saved scores in range               |

---

## Commands Run and Outputs

### Before fix

```bash
npx vitest --run lib/closing/__tests__/closing-agent.property.test.ts
# → Tests  1 failed | 4 passed (5)
# → TypeError: ConversationMemory.updateSentiment is not a function
```

### After fix

```bash
npx vitest --run lib/closing/__tests__/closing-agent.property.test.ts
# → Test Files  1 passed (1)
# → Tests  5 passed (5)

npx vitest --run lib/closing
# → Test Files  2 passed (2)
# → Tests  14 passed (14)
```

---

## Remaining Risks

1. **`logObjection` mock is also new.** The mock now includes `logObjection: vi.fn().mockResolvedValue(undefined)`. This was also missing from the original mock. Any test that exercises the objection path would have failed on `logObjection` too. Both are now mocked.

2. **No live LLM calls.** The `generateWithGemini` mock returns `{ text: 'Test response' }` for all calls. This is correct — the property tests should not make real LLM calls.

3. **`ConversationMemory` interface drift.** If new methods are added to `ConversationMemory` in the future, the mock in `closing-agent.property.test.ts` will need to be updated. Consider using `vi.spyOn` or auto-mocking to reduce this risk.

---

## Acceptance Criteria Status

| Criterion                                                     | Status                                       |
| ------------------------------------------------------------- | -------------------------------------------- |
| `ConversationMemory.updateSentiment` regression fixed         | ✅ Mock was incomplete; fixed                |
| `lib/closing/__tests__/closing-agent.property.test.ts` passes | ✅ 5/5                                       |
| Closing-agent tests do not require live external AI calls     | ✅ `generateWithGemini` is mocked            |
| No tests weakened just to pass                                | ✅ Mock was made complete, not tests removed |
| Direct unit test for `updateSentiment` added                  | ✅ 9 tests in `memory.test.ts`               |
| No production/staging/cloud resources touched                 | ✅                                           |
| No secrets changed                                            | ✅                                           |
