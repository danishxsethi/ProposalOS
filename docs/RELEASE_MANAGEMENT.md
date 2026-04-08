# Release Management

This document describes the release management process for ProposalOS, including versioning, changelog generation, feature flags, and deployment strategies.

## Table of Contents

1. [Version Management](#version-management)
2. [Changelog Generation](#changelog-generation)
3. [Feature Flags](#feature-flags)
4. [Canary Deployments](#canary-deployments)
5. [Rollback Procedures](#rollback-procedures)
6. [Release Checklist](#release-checklist)

---

## Version Management

### Semantic Versioning

ProposalOS follows [Semantic Versioning](https://semver.org/) (SemVer):

- **MAJOR.MINOR.PATCH** (e.g., `1.2.3`)
- **MAJOR**: Breaking changes
- **MINOR**: New features (backward compatible)
- **PATCH**: Bug fixes (backward compatible)

### Creating a Release

Use `release-it` to create releases:

```bash
# Dry run (preview changes)
npm run release:dry

# Patch release (0.1.0 → 0.1.1)
npm run release

# Minor release (0.1.0 → 0.2.0)
npm run release:minor

# Major release (0.1.0 → 1.0.0)
npm run release:major
```

### What release-it Does

1. Runs lint and tests (`before:init` hooks)
2. Bumps version in `package.json`
3. Generates changelog from conventional commits
4. Creates git commit with version bump
5. Creates git tag (e.g., `v0.1.0`)
6. Pushes commit and tag to GitHub
7. Creates GitHub Release with changelog

### Git Tags

Tags are automatically created and pushed:

```bash
# View all tags
git tag --list

# View latest tag
git describe --tags --abbrev=0

# Checkout a specific tag
git checkout v0.1.0
```

---

## Changelog Generation

### Automatic Generation

Changelogs are auto-generated from conventional commits using `conventional-changelog`.

### Commit Format

Commits must follow [Conventional Commits](https://www.conventionalcommits.org/):

```
<type>(<scope>): <description>

[optional body]

[optional footer]
```

### Types

| Type          | Section in Changelog     | Description                  |
| ------------- | ------------------------ | ---------------------------- |
| `feat`        | Features                 | New features                 |
| `fix`         | Bug Fixes                | Bug fixes                    |
| `perf`        | Performance Improvements | Performance improvements     |
| `revert`      | Reverts                  | Reverts previous commits     |
| `docs`        | Documentation            | Documentation changes        |
| `style`       | Styles                   | Code style changes           |
| `chore`       | Chores                   | Maintenance tasks            |
| `refactor`    | Code Refactoring         | Code refactoring             |
| `test`        | Tests                    | Test additions/modifications |
| `ci`          | Continuous Integration   | CI configuration             |
| `config`      | Configuration            | Tool configurations          |
| `audit`       | Audits                   | Audit reports                |
| `remediation` | Remediation              | Quality remediation          |

### Example Commits

```bash
# Feature
git commit -m "feat(proposal): add interactive pricing calculator"

# Bug fix
git commit -m "fix(audit): resolve null pointer in accessibility checks"

# Documentation
git commit -m "docs: update release management guide"
```

### Manual Changelog Update

```bash
# Regenerate changelog from all commits
npm run changelog
```

---

## Feature Flags

### Configuration

All feature flags are defined in `lib/config/feature-flags.ts`.

### Flag Categories

#### Model Routing

- `GEMINI_31_PRO_ENABLED` - Gemini 3.1 Pro for diagnosis/proposal
- `GEMINI_31_PRO_TRAFFIC_PCT` - Traffic percentage for A/B testing

#### Per-Feature Toggles

- `THINKING_MODE_ENABLED` - Model thinking mode
- `MULTIMODAL_ENABLED` - Image analysis features
- `STREAMING_ENABLED` - Streaming LLM responses
- `SINGLE_PASS_DIAGNOSIS` - Fast diagnosis mode

#### Business Features

- `ENABLE_BATCH_MODE` - Batch audit processing
- `ENABLE_WHITE_LABEL` - Agency white-label features
- `ENABLE_COLD_OUTREACH` - Cold outreach engine
- `ENABLE_WIDGET_EMBED` - External widget embed
- `ENABLE_B2C_MODE` - Consumer-facing features

#### New Audit Modules

- `ENABLE_ACCESSIBILITY_AUDIT_MODULE` - WCAG compliance
- `ENABLE_PERFORMANCE_AUDIT_MODULE` - Core Web Vitals
- `ENABLE_SEO_AUDIT_MODULE` - SEO validation
- `ENABLE_SECURITY_AUDIT_MODULE` - Security headers

#### Proposal Templates

- `ENABLE_NEW_PROPOSAL_TEMPLATES` - Dynamic templates
- `ENABLE_AI_PROPOSAL_SUMMARIES` - AI-generated summaries
- `ENABLE_INTERACTIVE_PROPOSAL_PRICING` - Client pricing adjustment
- `ENABLE_PROPOSAL_COMPARISON_VIEW` - Before/after comparison

#### UI Components

- `ENABLE_NEW_DASHBOARD_UI` - Redesigned dashboard
- `ENABLE_DARK_MODE` - Dark theme toggle
- `ENABLE_REALTIME_AUDIT_UPDATES` - Live progress updates
- `ENABLE_NEW_FINDINGS_VIZ` - Interactive findings charts

#### AI/ML Features

- `ENABLE_AI_SALES_CHAT` - AI sales agent
- `ENABLE_PREDICTIVE_LEAD_SCORING` - ML lead scoring
- `ENABLE_AUTO_PROMPT_EVOLUTION` - Prompt optimization

#### Gradual Rollout

- `GRADUAL_ROLLOUT_PERCENTAGE` - Global rollout percentage
- `ACCESSIBILITY_MODULE_ROLLOUT_PCT` - Accessibility module %
- `NEW_DASHBOARD_UI_ROLLOUT_PCT` - Dashboard UI %

### Environment Variables

Set flags via environment variables:

```bash
# .env.local or .env.production
ENABLE_NEW_DASHBOARD_UI=true
GRADUAL_ROLLOUT_PERCENTAGE=50
```

### Admin API

Update flags at runtime via the admin API:

```bash
# Get all flags
curl -H "Authorization: Bearer <token>" \
  https://proposal-engine.us-central1.run.app/api/admin/feature-flags

# Update a flag
curl -X POST \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{"key": "ENABLE_DARK_MODE", "value": true}' \
  https://proposal-engine.us-central1.run.app/api/admin/feature-flags
```

### Flag Lifecycle

1. **Development**: Flag added, disabled by default
2. **Testing**: Enabled for internal users (1-10%)
3. **Beta**: Enabled for beta users (10-50%)
4. **GA**: Enabled for all users (100%)
5. **Cleanup**: Flag removed after 90 days of GA

---

## Canary Deployments

### Overview

Production deployments use a canary strategy with automatic rollback:

```
1. Deploy new revision (0% traffic)
2. Set 10% traffic → Monitor 2 minutes
3. Set 50% traffic → Monitor 2 minutes
4. Set 100% traffic → Final health check
```

### Automatic Canary (GitHub Actions)

The CI/CD pipeline automatically performs canary deployments:

1. Manual approval required in GitHub Actions
2. Automatic health checks at each stage
3. Automatic rollback on failure

### Manual Canary Deployment

```bash
# Full canary deployment
./scripts/canary-deploy.sh \
  --service proposal-engine \
  --image us-central1-docker.pkg.dev/PROJECT_ID/proposal-engine/proposal-engine:abc123 \
  --region us-central1

# Rollback to previous revision
./scripts/canary-deploy.sh \
  --service proposal-engine \
  --rollback

# Skip canary (direct 100% deploy)
./scripts/canary-deploy.sh \
  --service proposal-engine \
  --image us-central1-docker.pkg.dev/PROJECT_ID/proposal-engine/proposal-engine:abc123 \
  --skip-canary
```

### Health Checks

At each canary stage:

- HTTP 200 from `/api/health`
- Error rate < 1.0%
- Response time < 500ms

### Monitoring

Cloud Monitoring metrics are checked:

- `run.googleapis.com/request_count` (5xx errors)
- `run.googleapis.com/response_latencies`
- Custom business metrics

---

## Rollback Procedures

### Automatic Rollback

The canary deployment script automatically rolls back if:

- Health check fails at any stage
- Error rate exceeds threshold
- Service becomes unavailable

### Manual Rollback

#### Via Script

```bash
./scripts/canary-deploy.sh --service proposal-engine --rollback
```

#### Via gcloud

```bash
# Get previous revision
gcloud run revisions list \
  --service proposal-engine \
  --region us-central1 \
  --sort-by=~metadata.creationTimestamp \
  --limit=2

# Set traffic to previous revision
gcloud run services update-traffic proposal-engine \
  --region us-central1 \
  --to-revisions=PREVIOUS_REVISION=100
```

#### Via GitHub Actions

1. Go to Actions → CI/CD Pipeline
2. Find the last successful deployment
3. Click "Re-run jobs" → "Deploy to Production"
4. The deployment will use the previous image tag

### Post-Rollback Actions

1. Investigate root cause
2. Create incident report
3. Fix the issue
4. Re-run canary deployment

---

## Release Checklist

### Pre-Release

- [ ] All tests passing (unit, integration, E2E)
- [ ] Code coverage ≥ 80%
- [ ] Lint passes with no errors
- [ ] Type checking passes
- [ ] Audit regression tests pass
- [ ] QA review completed
- [ ] Changelog entries reviewed

### Release Process

- [ ] Run `npm run release:dry` to preview
- [ ] Confirm version bump is correct (major/minor/patch)
- [ ] Run `npm run release` (or minor/major variant)
- [ ] Verify git tag created
- [ ] Verify GitHub Release created
- [ ] Verify CHANGELOG.md updated

### Deployment

- [ ] Staging deployment verified
- [ ] Smoke tests passed on staging
- [ ] Production canary deployment initiated
- [ ] All canary stages passed
- [ ] Final health check passed
- [ ] Success notification received

### Post-Release

- [ ] Monitor error rates for 1 hour
- [ ] Monitor user feedback
- [ ] Update release status in project tracker
- [ ] Send release announcement (if major/minor)
- [ ] Schedule feature flag review (90 days)

---

## Emergency Procedures

### Critical Production Issue

1. **Immediate**: Roll back to previous revision
2. **Within 1 hour**: Create incident report
3. **Within 24 hours**: Root cause analysis
4. **Within 48 hours**: Fix deployed and verified

### Communication

- Slack: `#incidents` channel
- Email: engineering@company.com
- Status page: Update if user-impacting

---

## Related Documentation

- [Branch Protection](./BRANCH_PROTECTION.md)
- [CI/CD Pipeline](../.github/workflows/ci-cd-pipeline.yml)
- [Observability Setup](./OBSERVABILITY_SETUP.md)
- [Runbooks](./RUNBOOKS.md)
