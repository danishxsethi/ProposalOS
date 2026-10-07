# ProposalOS Bedrock model routing

ProposalOS application LLM requests in the AWS runtime use Amazon Bedrock. Model routing rejects any non-Bedrock `LLM_PRIMARY_PROVIDER`; the Google Generative AI SDK, Gemini adapter, and Google model IDs are removed from the app runtime. Google Places, PageSpeed, and Google OAuth remain separate integrations and are not LLM providers.

## Model selection

- **Nova Micro** (`us.amazon.nova-micro-v1:0`) is used for lightweight text tasks such as email, translation, keyword generation, and simple classification.
- **Nova 2 Lite** (`us.amazon.nova-2-lite-v1:0`) is used for diagnosis, proposals, narrative and strategic analysis, and image/PDF input. It is the current cost-efficient multimodal model available to the AWS account in `us-east-2`.
- The model IDs are centralized in `lib/config/models.ts`; override them with `BEDROCK_FAST_MODEL_ID`, `BEDROCK_MODEL_ID`, and `BEDROCK_VISION_MODEL_ID`.
- Nova 2 Lite is selected through the **US geo inference profile**. From `us-east-2`, Bedrock can route within its supported US destination regions. Nova 2 Lite supports text, image, video, document understanding, Converse, and streaming; Nova Micro is text-only.
- Nova 2 Lite's explicit extended-thinking mode remains off to keep usage costs predictable. Legacy Gemini `thinkingBudget` settings do not enable Nova extended thinking.

## Runtime and IAM

`LLM_PRIMARY_PROVIDER=bedrock` is the application default. `BEDROCK_ENABLED=true` enables inference; setting it to `false` makes Bedrock calls fail closed with no other-provider fallback. ECS obtains AWS credentials from the API task role. The staging and production Terraform sources scope `InvokeModel`, `InvokeModelWithResponseStream`, and `GetInferenceProfile` to the selected Nova inference profiles and their US model resources.

Bedrock uses on-demand, usage-based inference by default and has no provisioned-throughput commitment in this configuration. Actual cost depends on the number and type of requests; review the current [Amazon Bedrock pricing](https://aws.amazon.com/bedrock/pricing/) before enabling traffic.

## Rollout state — October 4, 2026

- AWS staging API revision 12 and web revision 11 are running 1/1 on immutable tag `candidate-3876ed2b`. The API selects Bedrock and receives no `GOOGLE_AI_API_KEY`; both health routes are green.
- An earlier synthetic `.invalid` audit against `example.com` exercised Bedrock Nova 2 Lite twice (1,004 input / 431 output tokens). It ended `PARTIAL` / `DEGRADED_REVIEW_REQUIRED`; the trust gate withheld proposal generation. This verifies provider invocation, not end-to-end proposal quality. No customer-data audit was run against the latest tag.
- The production Terraform task definition sets `LLM_PRIMARY_PROVIDER=bedrock`, enables Bedrock, and selects Nova Micro for fast work and Nova 2 Lite for primary and vision work. No AWS production stack or ECS deployment exists yet.
- Application LLM call sites use the shared `generateWithLLM` façade. Google model code is removed from this AWS source tree; the currently deployed GCP image remains unchanged until a controlled production cutover.
- GCP production remains live. Its deployed API/worker image provenance is not pinned to a verified Git revision, so the Bedrock production rollout must be built from a reviewed, sanitized, immutable source artifact before cutover.

## Latest staging rollout — October 4, 2026

- The Bedrock-only app source used for the staging build, including Bedrock routing, Nova model selection, and Nova cost accounting, was 2,598,215 bytes with SHA-256 `3876ed2b21a7906d2c5eb086d417404fd60803ec61af62ebebadb4d083792166`. It contained 1,111 source files plus the embedded manifest and was based on Git `c3a5202f997e70bd9aa7bbc628aff65236864d9b` with a dirty worktree.
- CodeBuild `proposalos-staging-app-build:13ec255f-cb51-4393-8d72-7cb524cf5384` succeeded. Immutable tag `candidate-3876ed2b` is in staging ECR: API digest `sha256:c30cce165d393e281239b64cb6418575c8d3f2a1a4fa6b5d65190f82d32dd275`; web digest `sha256:eb886f4c472a78bb90af2ccedf48b8848118260dc5aeb081849cb0d0f1560742`. Both ECR image scans completed with no reported findings.
- Staging API revision 12 and web revision 11 are stable at 1/1, with completed rollouts and zero failed tasks. Both ALB targets are healthy; `https://aws-stage.claraud.com/` and `/api/health/live` return HTTP 200.
- The AWS runtime now has no Gemini/OpenAI/Anthropic model adapters or model-specific cost rates. Nova Micro and Nova 2 Lite are the only configured LLM models. GCP production remains live; no production resources, database, DNS, or billing settings changed.
- This confirms build, service startup, and staging health. No customer-data audit or new proposal generation was run against this final tag.

## Production Stripe parity and refreshed source archive — October 4, 2026

- GCP production's `DATABASE_URL` selects `proposal_engine`; runtime environment metadata also confirmed Stripe live mode and the existing Starter catalog, sender, and tenant configuration.
- Production Terraform now carries those values into API/web runtime configuration. Both Next.js production Docker builds accept the live publishable key as a build argument. Nonsecret current values are kept in the ignored local `infra/aws/proposalos-production/production.auto.tfvars.json` file.
- The sanitized source archive was refreshed to include the Docker build arguments: 2,598,270 bytes, SHA-256 `4e7d2232ae7208be363c052d6d0af1c768d8c0c4b129e055ef948aa32014f50c`, 1,111 files plus manifest. This new archive has not been uploaded or built; the currently running staging tag remains `candidate-3876ed2b`.
- The production root validates and its refreshed read-only plan is 110 adds, 0 changes, and 0 destroys. No production resource, secret value, database, or DNS has been changed.
