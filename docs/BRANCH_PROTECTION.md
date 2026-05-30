# Branch Protection Rules

This document describes the required branch protection settings for the ProposalOS repository. These settings ensure code quality and prevent accidental or malicious changes.

## Required Settings (Configure in GitHub)

Navigate to: **Settings → Branches → Add branch protection rule**

### Branch Pattern

```
main
```

### Protection Rules

#### 1. Require a pull request before merging

- [x] **Require pull request reviews before merging**
  - Required number of approvals: `1`
  - [x] Dismiss stale pull request approvals when new commits are pushed
  - [x] Require review from Code Owners (if applicable)

#### 2. Status Checks

- [x] **Require status checks to pass before merging**
  - [x] Require branches to be up to date before merging

Required status checks (from `.github/workflows/ci-cd-pipeline.yml`):

- [x] `Lint`
- [x] `Type Check`
- [x] `Unit Test`
- [x] `Integration Test`
- [x] `Build`

#### 3. Force Push Protection

- [x] **Do not allow bypassing the above settings**
- [x] **Do not allow force pushes**
- [x] **Do not allow deletions** (optional, recommended)

#### 4. Additional Recommendations

##### Linear History (Optional)

- [ ] Require linear commit history
  - This forces rebasing instead of merge commits

##### Signed Commits (Optional)

- [ ] Require signed commits
  - Adds an extra layer of verification for commit authenticity

##### Conversation Resolution

- [x] Require all comments to be resolved before merging
  - Ensures all review feedback is addressed

## For `staging` Branch (if used)

If you create a separate staging branch for additional testing:

### Branch Pattern

```
staging
```

### Protection Rules

Same as `main`, but you may allow:

- [ ] Allow force pushes (for resetting staging)
- [ ] Allow deletions (for cleanup)

## Verification

After configuring, verify the rules are working:

1. Try to push directly to `main` - should be rejected
2. Try to create a PR without required status checks - should be blocked
3. Try to merge with failing checks - should be blocked

## Enforcement via GitHub CLI

You can also configure branch protection using the GitHub CLI:

```bash
# Enable required status checks
gh api repos/danishxsethi/ProposalOS/branches/main/protection \
  --method PUT \
  -f required_status_checks='{"strict":true,"contexts":["Lint","Type Check","Unit Test","Integration Test","Build"]}'

# Enable PR requirements
gh api repos/danishxsethi/ProposalOS/branches/main/protection \
  --method PUT \
  -f required_pull_request_reviews='{"required_approving_review_count":1,"dismiss_stale_reviews":true}'

# Enable force push protection
gh api repos/danishxsethi/ProposalOS/branches/main/protection \
  --method PUT \
  -f allow_force_pushes=false
```

## CI/CD Integration

The branch protection rules work in conjunction with the CI/CD pipeline:

1. **Pre-commit hooks** (via Husky) catch issues locally
2. **PR template** ensures proper documentation
3. **GitHub Actions** runs all quality gates
4. **Branch protection** enforces all checks pass before merge

## Compliance Checklist

- [ ] Branch protection rule created for `main`
- [ ] Required status checks configured
- [ ] PR review requirements set
- [ ] Force push protection enabled
- [ ] Team members informed of process
- [ ] Emergency bypass process documented (for critical hotfixes)

## Emergency Bypass Process

In case of critical production issues requiring immediate fixes:

1. Repository admins can temporarily disable protection (not recommended)
2. Better: Use GitHub's "bypass checks" permission sparingly
3. Document the emergency change in the next team meeting
4. Create a follow-up PR to properly document the change

**Note:** Emergency bypasses should be extremely rare and always followed by proper documentation.
