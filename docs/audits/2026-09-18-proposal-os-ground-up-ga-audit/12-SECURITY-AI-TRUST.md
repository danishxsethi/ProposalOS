# Security & AI Trust

## Application security

The codebase contains URL validators, CSRF, rate limits, encryption helpers, webhook signature verification, secret scanning configuration, and prompt-injection tests. These are useful controls, not proof of security qualification.

High-risk source findings:

- client-controlled JWT role/tenant claim merge;
- tenant-header trust and wildcard API-key destructive cross-tenant access;
- public routes relying on Prisma missing-context errors rather than explicit authorization;
- public token surfaces with inconsistent expiry/publication policy;
- unescaped HTML interpolation in email senders;
- unauthenticated metrics/health disclosure and expensive health checks;
- dangerous Google email account linking enabled;
- public proposal payload includes internal findings/contact discovery.

## Prompt/AI boundary

The diagnosis tests include source prompt injection cases and claim/citation validation. The architectural rule is correct: retrieved website/CRM/review content is data, not authority. However, no live hostile input through the full provider -> diagnosis -> proposal -> external effect path was run, and no runtime LangSmith privacy trace was observed.

**State:** `WORKING_WITH_LIMITATIONS` for source controls; `GA_BLOCKED` for release readiness.
