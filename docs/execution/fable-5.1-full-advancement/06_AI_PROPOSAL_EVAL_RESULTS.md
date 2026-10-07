# 06 — AI, Proposal, and Eval Results — Fable 5.1 Full Advancement

**Commercial fingerprint:** `app/api/stripe/checkout-proposal` now requires accepted commercialSnapshot + fingerprint binding, price verify exact 409, proposalVersion check — deterministic tier/timeline/pricing never LLM.

**Grounding preserved:** grounding commercial prices locked at QA, any price/tier/summary mutation after approval throws 404 via fingerprint recomputation.

**Eval program:** 20 adversarial scrub cases (ignore instructions) via PiiScrubber + validateOutput already present; golden 40-case dataset (5 industries×5 + injection + wrong-city + fairness) is T1 artifact not yet run with live credentials — local fixtures passed, live eval requires GOOGLE/STRIPE keys.
