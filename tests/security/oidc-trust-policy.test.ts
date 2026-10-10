// @vitest-environment node
/**
 * tests/security/oidc-trust-policy.test.ts
 *
 * Regression qualification for the production GitHub-OIDC trust and the
 * GitHub Actions deployment-role permission policy in
 * infra/aws/proposalos-production/github-actions.tf.
 *
 * Background: a prior change rewrote this file and (a) replaced the trust
 * subject with a different format and (b) accidentally deleted the entire
 * aws_iam_role_policy.github_actions_production_deploy resource. The file was
 * restored byte-identical to the reviewed PR #6 version. These tests keep that
 * from regressing silently:
 *
 *   1. Exact authorized GitHub identity — the immutable OIDC subject for the
 *      transferred repository, per GitHub's documented format for
 *      repositories created/transferred after 2026-07-15:
 *      repo:OWNER@OWNER-ID/REPO@REPO-ID:ref:refs/heads/BRANCH
 *   2. sts.amazonaws.com audience, StringEquals (no wildcards, no StringLike).
 *   3. main-branch restriction.
 *   4. Presence of the deployment-role permission policy with its expected
 *      least-privilege anchors (ECR publish on the three named production
 *      repositories, ECS deploy on the production cluster/services, RDS
 *      metadata reads, logs, task/execution-role PassRole set).
 *   5. No wildcard trust or wildcard policy resources beyond the AWS-required
 *      ecr:GetAuthorizationToken (which only accepts "*").
 *   6. A SHA-256 content tripwire: ANY modification to the file — permissions
 *      broadened, removed, or the trust changed — fails this test until the
 *      expected hash is consciously updated in review.
 */
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

const TF_PATH = path.resolve(
  __dirname,
  '..',
  '..',
  'infra',
  'aws',
  'proposalos-production',
  'github-actions.tf'
);

/** Byte-exact tripwire against the reviewed PR #6 version of this file. */
const EXPECTED_FILE_SHA256 = 'f2736d19e5f022819029a3cd82857daa48601624a51c3860d099bd0534c058e2';

const EXPECTED_SUBJECT = 'repo:Danish-Sethi@324834111/ProposalOS@1158247398:ref:refs/heads/main';

const source = readFileSync(TF_PATH, 'utf8');

describe('GitHub OIDC production trust (github-actions.tf)', () => {
  it('is byte-identical to the reviewed PR #6 version (content tripwire)', () => {
    const actual = createHash('sha256').update(source).digest('hex');
    expect(actual).toBe(EXPECTED_FILE_SHA256);
  });

  it('trusts exactly the immutable transferred-repository subject on main', () => {
    expect(source).toContain(`github_actions_main_subjects = [
    "${EXPECTED_SUBJECT}"
  ]`);

    // The subject is bound with StringEquals (exact match, no wildcards).
    expect(source).toContain(
      '"token.actions.githubusercontent.com:sub" = local.github_actions_main_subjects'
    );
    expect(source).not.toContain('StringLike');

    // Exact owner and repository IDs, exact branch — nothing generic.
    expect(source).not.toMatch(/repo:[^"\n]*\*/);
  });

  it('restricts the audience to sts.amazonaws.com', () => {
    expect(source).toContain('"token.actions.githubusercontent.com:aud" = "sts.amazonaws.com"');
    expect(source).toContain('client_id_list = ["sts.amazonaws.com"]');
  });

  it('keeps the main-only branch restriction inside the subject', () => {
    expect(EXPECTED_SUBJECT.endsWith(':ref:refs/heads/main')).toBe(true);
  });

  it('retains the deployment-role permission policy resource', () => {
    expect(source).toContain('resource "aws_iam_role_policy" "github_actions_production_deploy"');
    expect(source).toContain('name = "ProposalOSProductionImageAndEcsDeploy"');
  });

  it('keeps ECR publish scoped to exactly the three named production repositories', () => {
    expect(source).toContain(
      '[for name in ["proposalos-production-proposal-engine", "proposalos-production-claraud-web", "proposalos-production-migration-importer"] :'
    );
  });

  it('keeps the ECS deploy permissions scoped to the production cluster and services', () => {
    expect(source).toContain('aws:ecs:');
    expect(source).toContain('proposalos-production');
  });

  it('allows no wildcard resources beyond the AWS-required ECR authorization token', () => {
    // Collect every Resource = ... line in the file.
    const resourceLines = source.match(/Resource\s*=\s*\[?[^\n]+/g) ?? [];
    for (const line of resourceLines) {
      const isWildcard = /"\*"|=\s*"\*"/.test(line);
      if (isWildcard) {
        // GetAuthorizationToken only accepts "*"; it must be the sole exception
        // and must only grant ecr:GetAuthorizationToken.
        expect(line).toMatch(/Resource\s*=\s*"\*"/);
        const statementWindow = source.slice(
          Math.max(0, source.indexOf(line) - 200),
          source.indexOf(line)
        );
        expect(statementWindow).toContain('ecr:GetAuthorizationToken');
      }
    }
  });

  it('does not grant iam:PassRole outside the reviewed task/execution role set', () => {
    const passRoleIndex = source.indexOf('iam:PassRole');
    expect(passRoleIndex).toBeGreaterThan(-1);
    const window = source.slice(passRoleIndex, passRoleIndex + 1200);
    expect(window).toContain('api_task');
    expect(window).toContain('web_task');
    expect(window).not.toMatch(/Resource\s*=\s*"\*"/);
  });
});
