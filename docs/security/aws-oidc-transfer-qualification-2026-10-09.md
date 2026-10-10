# AWS deployment OIDC after repository transfer

Date checked: 2026-10-09. This is a source-only correction; no AWS IAM policy was changed.

## Verified identities and effective subject

- GitHub repository: `Danish-Sethi/ProposalOS`, repository ID `1158247398`, visibility public.
- GitHub owner: `Danish-Sethi`, organization ID `324834111`.
- Repository OIDC customization: `use_default=true`, `use_immutable_subject=true`, and no repository `include_claim_keys` override. The organization customization endpoint was not readable with the available GitHub permissions.
- GitHub documentation says transfers after July 15, 2026 use immutable subject claims. For this repository, the main-branch subject is `repo:Danish-Sethi@324834111/ProposalOS@1158247398:ref:refs/heads/main`.

## Live AWS state and source comparison

Read-only AWS calls authenticated to account `410432886960` as the root principal. The deployed role is `ProposalOSGitHubActionsProductionDeploy`.

- The live OIDC provider is `token.actions.githubusercontent.com` and its client ID list contains `sts.amazonaws.com`.
- The live trust policy and this Terraform source both required `aud=sts.amazonaws.com`, but trusted only the two old-owner main-branch subjects. Neither matched the current immutable subject.
- The live deployment role has one inline policy, `ProposalOSProductionImageAndEcsDeploy`, and no attached managed policies. Its statements and resource scope match the source: ECR image publication, production ECS task/service operations, one schema migration task, production task-role passing, RDS endpoint metadata, and migration log reads. This change does not modify that policy.
- The GitHub deployment workflow is `workflow_dispatch` only. Its deploy job additionally requires `github.ref == refs/heads/main` and the explicit `confirm_production` input. Only that job grants `id-token: write`.

## Source correction

The trust list now contains only the exact current immutable repository, owner, and `main` ref subject. It keeps the `sts.amazonaws.com` audience equality condition. No wildcard, old-owner entry, role permission, workflow, or AWS resource was changed by this correction.

## Owner-controlled IAM update plan

1. Review this single trust-subject diff and the backend-disabled Terraform validation result.
2. In a separately approved infrastructure-change window, use the normal reviewed Terraform workflow for `infra/aws/proposalos-production`. Confirm the plan changes only the `AssumeRolePolicyDocument` subject list on `ProposalOSGitHubActionsProductionDeploy`; stop if any permission policy or other resource changes.
3. Apply only with the AWS account owner’s explicit approval. This task does not apply the update.
4. After branch protections require review on `main`, a no-deploy workflow may request an OIDC token with audience `sts.amazonaws.com`, decode only `aud` and `sub` in memory, and emit pass/fail without printing the JWT. Do not assume the production deployment role merely to test identity. If AWS-side assumption must be tested, create a separate zero-permission verification role with the same exact subject and audience.

## Governance boundary

GitHub Actions is enabled, with default workflow permissions set to read and no repository rulesets or environments. A repository branch-protection API result was not available. Require owner review of `main` protection and deployment approval controls before applying the trust correction or publishing a deployment-capable verification workflow.
