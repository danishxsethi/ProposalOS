# Contributing to ProposalOS

This guide provides everything you need to know to contribute to ProposalOS, from setting up your development environment to submitting your first pull request.

## Quick Links

- [Architecture Overview](docs/ARCHITECTURE.md) - System design and pipeline flow
- [Branch Protection](docs/BRANCH_PROTECTION.md) - Git workflow requirements
- [Runbooks](docs/RUNBOOKS.md) - Operational procedures
- [Observability Setup](docs/OBSERVABILITY_SETUP.md) - Monitoring and debugging

## Development Setup

### Prerequisites

- **Node.js** 18+ ([install](https://nodejs.org/))
- **Docker** ([install](https://docs.docker.com/get-docker/))
- **Git** ([install](https://git-scm.com/))
- **make** (optional but recommended)

### One-Command Setup

```bash
# Clone the repository
git clone https://github.com/danishxsethi/ProposalOS.git
cd ProposalOS

# Run setup (installs deps, starts Docker, seeds DB)
make setup
# OR if you don't have make:
./scripts/setup.sh

# Start development server
make dev
# OR: npm run dev
```

### Manual Setup

See [README.md](README.md) for detailed setup instructions.

## Branch Strategy

### Branch Naming Convention

```
<type>/<description>-<issue-number>
```

**Examples:**

- `feature/audit-caching-123`
- `fix/proposal-pdf-generation-456`
- `docs/update-architecture-789`
- `test/add-pipeline-tests-101`

### Branch Types

| Type       | Description                           |
| ---------- | ------------------------------------- |
| `feature`  | New functionality                     |
| `fix`      | Bug fix                               |
| `docs`     | Documentation only                    |
| `test`     | Adding or updating tests              |
| `refactor` | Code refactoring (no behavior change) |
| `perf`     | Performance improvements              |
| `chore`    | Maintenance tasks                     |

### Workflow

```
main (protected)
  │
  ├──▶ feature/my-feature-123
  │         │
  │         └──▶ PR → main
  │
  ├──▶ fix/bug-fix-456
  │         │
  │         └──▶ PR → main
  │
  └──▶ hotfix/critical-789
            │
            └──▶ PR → main (expedited)
```

## Pull Request Process

### Before Creating a PR

1. **Ensure your branch is up to date:**

   ```bash
   git checkout main
   git pull origin main
   git checkout your-branch
   git rebase main
   ```

2. **Run quality checks:**

   ```bash
   npm run lint
   npm run typecheck
   npm test
   ```

3. **Test your changes locally:**
   - Run the dev server
   - Test affected functionality
   - For audit/pipeline changes, run a full audit

### Creating a PR

1. **Push your branch:**

   ```bash
   git push origin your-branch
   ```

2. **Create PR on GitHub:**
   - Use the PR template (auto-loaded)
   - Fill in all sections
   - Link related issues

### PR Requirements

All PRs must:

- [ ] Pass all CI checks (lint, typecheck, tests, build)
- [ ] Have at least 1 approval
- [ ] Address all review comments
- [ ] Include tests for new functionality
- [ ] Update documentation if needed

### PR Template Checklist

When creating a PR, ensure you complete:

```markdown
## Description

[Brief description of changes]

## Type of Change

- [ ] Bug fix
- [ ] New feature
- [ ] Documentation update
- [ ] etc.

## Checklist

### Code Quality

- [ ] npm run lint passes
- [ ] npm run typecheck passes
- [ ] No console.log in production code
- [ ] Follows coding standards

### Testing

- [ ] Tests added/updated
- [ ] npm test passes
- [ ] For LLM changes: adversarial tests run

### Documentation

- [ ] Relevant docs updated
- [ ] JSDoc comments added
```

## Testing Expectations

### Test Types

1. **Unit Tests** (`lib/**/*.test.ts`)
   - Test individual functions/modules
   - Mock external dependencies
   - Fast execution

2. **Integration Tests** (`app/api/**/__tests__`)
   - Test API endpoints
   - Test database interactions
   - Test multi-component flows

3. **Property-Based Tests** (`lib/**/__tests__/*.property.test.ts`)
   - Test invariants and edge cases
   - Use fast-check for property testing
   - Critical for core logic

4. **Adversarial QA Tests** (`lib/qa/adversarial-tests.ts`)
   - Test LLM outputs
   - Validate proposal quality
   - Check for hallucinations

### Running Tests

```bash
# Run all tests
npm test

# Run specific test file
npm test -- path/to/test.test.ts

# Run tests in watch mode
npm run test:watch

# Run with coverage
npm run test:coverage

# Run specific test pattern
npm test -- -t "audit pipeline"
```

### Test Coverage Expectations

| Component         | Min Coverage            |
| ----------------- | ----------------------- |
| Core pipeline     | 80%                     |
| API routes        | 70%                     |
| Utilities         | 70%                     |
| LLM orchestration | 60% (output validation) |

### Writing Tests

**Unit Test Example:**

```typescript
import { describe, it, expect } from 'vitest';
import { calculateImpactScore } from '../scoring';

describe('calculateImpactScore', () => {
  it('should return score between 1-10', () => {
    const result = calculateImpactScore({ severity: 'high', reach: 'wide' });
    expect(result).toBeGreaterThanOrEqual(1);
    expect(result).toBeLessThanOrEqual(10);
  });

  it('should weight severity higher than reach', () => {
    const highSeverity = calculateImpactScore({ severity: 'critical', reach: 'narrow' });
    const lowSeverity = calculateImpactScore({ severity: 'low', reach: 'wide' });
    expect(highSeverity).toBeGreaterThan(lowSeverity);
  });
});
```

**Property-Based Test Example:**

```typescript
import { property } from 'fast-check';
import { sanitizeInput } from '../inputSanitizer';

describe('sanitizeInput', () => {
  it('should always remove script tags', () => {
    property(arbitraryString(), (input) => {
      const sanitized = sanitizeInput(input);
      expect(sanitized).not.toMatch(/<script/i);
    });
  });
});
```

## Audit Module Development Guide

### Creating a New Audit Module

Audit modules collect and analyze data from specific sources.

**Module Structure:**

```typescript
// lib/modules/myModule.ts
import { AuditModule, AuditContext } from './types';

export interface MyModuleResult {
  // Define your result structure
  metric1: number;
  finding2: string;
}

export const myModule: AuditModule<MyModuleResult> = {
  name: 'my-module',
  version: '1.0.0',

  async execute(context: AuditContext): Promise<MyModuleResult> {
    // 1. Collect data
    const data = await this.collectData(context);

    // 2. Analyze data
    const analysis = await this.analyze(data);

    // 3. Generate findings
    const findings = this.generateFindings(analysis);

    // 4. Return structured result
    return {
      metric1: analysis.score,
      finding2: findings.primary,
    };
  },

  async collectData(context: AuditContext): Promise<unknown> {
    // Implement data collection
  },

  async analyze(data: unknown): Promise<unknown> {
    // Implement analysis logic
  },

  generateFindings(analysis: unknown): { primary: string } {
    // Convert analysis to findings
    return { primary: 'Finding description' };
  },
};
```

### Module Registration

Add your module to the orchestrator:

```typescript
// lib/orchestrator/auditOrchestrator.ts
import { myModule } from '../modules/myModule';

const modules = [
  // ... existing modules
  myModule,
];
```

### Testing Audit Modules

```typescript
// lib/modules/__tests__/myModule.test.ts
import { describe, it, expect, vi } from 'vitest';
import { myModule } from '../myModule';

describe('myModule', () => {
  it('should execute successfully', async () => {
    const context = {
      businessName: 'Test Business',
      businessUrl: 'https://example.com',
      city: 'Test City',
    };

    const result = await myModule.execute(context);

    expect(result).toBeDefined();
    expect(result.metric1).toBeDefined();
  });
});
```

### Best Practices for Modules

1. **Error Handling:** Always wrap external calls in try-catch
2. **Timeouts:** Set reasonable timeouts for network calls
3. **Retry Logic:** Implement retry for transient failures
4. **Logging:** Use structured logging with context
5. **Caching:** Cache expensive API calls

```typescript
async execute(context: AuditContext): Promise<Result> {
  const startTime = Date.now();

  try {
    const result = await this.fetchData(context);
    this.logger.info('Module completed', {
      duration: Date.now() - startTime,
      businessName: context.businessName
    });
    return result;
  } catch (error) {
    this.logger.error('Module failed', {
      error: error.message,
      context
    });
    throw error;
  }
}
```

## Code Quality Standards

### TypeScript Guidelines

- **No `any` types** without justification
- **Use interfaces** for object shapes
- **Use type aliases** for unions
- **Prefer `unknown` over `any`** for uncertain types
- **Add JSDoc** for public APIs

```typescript
// ✅ Good
interface AuditConfig {
  businessName: string;
  businessUrl: string;
  city: string;
}

// ✅ Good
type FindingType = 'PAINKILLER' | 'VITAMIN' | 'NEUTRAL';

// ❌ Avoid
function process(data: any) {}

// ✅ Better
function process(data: unknown) {
  if (!isValidData(data)) {
    throw new Error('Invalid data');
  }
  // ...
}
```

### Import Ordering

```typescript
// 1. External dependencies
import React from 'react';
import { NextRequest } from 'next/server';

// 2. Internal modules (lib/)
import { logger } from '@/lib/logger';
import { prisma } from '@/lib/prisma';

// 3. Type imports
import type { Audit } from '@prisma/client';
import type { ApiResponse } from '@/types';

// 4. Relative imports
import { Component } from './Component';
import styles from './styles.module.css';
```

### Error Handling

```typescript
// Use custom error classes
export class AuditError extends Error {
  constructor(
    message: string,
    public readonly auditId: string,
    public readonly code: string
  ) {
    super(message);
    this.name = 'AuditError';
  }
}

// Always include context in error messages
throw new AuditError(
  `Failed to process audit ${auditId}: ${error.message}`,
  auditId,
  'PROCESSING_FAILED'
);
```

### Logging

```typescript
import { logger } from '@/lib/logger';

// Use appropriate log levels
logger.debug('Detailed debug info', { context });
logger.info('Business event', { auditId, status });
logger.warn('Recoverable issue', { retryCount });
logger.error('Error with context', { error, auditId });

// Include request ID for tracing
logger.info('Processing request', {
  requestId: context.requestId,
  action: 'create_audit',
});
```

## Commit Messages

Follow [Conventional Commits](https://www.conventionalcommits.org/):

```
<type>(<scope>): <description>

[optional body]

[optional footer]
```

**Examples:**

```
feat(audit): add caching for PageSpeed API calls

- Implement Redis-based caching for PageSpeed results
- Add cache invalidation on audit regeneration
- Configure 24-hour TTL

Closes #123

---

fix(proposal): correct pricing tier calculation

The Growth tier was incorrectly including Premium items.

---

docs: update architecture diagram

---

test(pipeline): add property tests for scoring engine
```

## Deployment

### Local Testing Before Deployment

```bash
# Build locally
npm run build

# Run all checks
npm run lint && npm run typecheck && npm test

# Test production build locally
npm start
```

### Deployment Process

1. **PR merged to main** → CI/CD pipeline runs
2. **All checks pass** → Automatic deployment to Cloud Run
3. **Database migrations** → Applied automatically
4. **Health check** → Verified before traffic switch

### Rollback

See [docs/ROLLBACK.md](docs/ROLLBACK.md) for rollback procedures.

## Getting Help

- **Documentation:** Check [docs/](docs/) directory
- **Existing Issues:** Search for similar issues
- **Team Chat:** Ask in the team channel
- **Runbooks:** Consult [docs/RUNBOOKS.md](docs/RUNBOOKS.md)

## Code Review Tips

### For Authors

- Keep PRs small and focused
- Write clear descriptions
- Link related issues
- Respond to all comments

### For Reviewers

- Review within 24 hours
- Be constructive
- Suggest alternatives, not just problems
- Approve when satisfied, don't linger

## Recognition

Contributors are recognized in:

- Release notes
- Team meetings
- Contributor leaderboard (coming soon)

---

Thank you for contributing to ProposalOS! 🚀
