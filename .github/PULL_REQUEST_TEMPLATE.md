# Pull Request

## Description

<!-- Provide a brief description of the changes in this PR -->

## Type of Change

- [ ] 🐛 Bug fix (non-breaking change that fixes an issue)
- [ ] ✨ New feature (non-breaking change that adds functionality)
- [ ] 💥 Breaking change (fix or feature that would cause existing functionality to change)
- [ ] 📚 Documentation update
- [ ] 🎨 Style/formatting update
- [ ] 🔧 Configuration update
- [ ] 🧪 Test update
- [ ] ♻️ Refactor
- [ ] ⚡ Performance improvement
- [ ] 🔒 Security fix
- [ ] 🏗️ Build/CI update

## Checklist

### Code Quality

- [ ] I have run `npm run lint` locally and there are no errors
- [ ] I have run `npm run typecheck` locally and all types are correct
- [ ] I have followed the coding standards (no `any` types without justification)
- [ ] I have not added `console.log` statements in production code
- [ ] My code follows the import ordering rules
- [ ] Cyclomatic complexity is within limits (≤15)
- [ ] I have added appropriate ESLint disable comments with justification if needed

### Testing

- [ ] I have added/updated tests for my changes
- [ ] I have run `npm test` locally and all tests pass
- [ ] For critical changes, I have added property-based tests
- [ ] For LLM-related changes, I have run adversarial QA tests

### Documentation

- [ ] I have updated relevant documentation (README, API docs, etc.)
- [ ] I have added JSDoc comments for new public functions/interfaces
- [ ] For API changes, I have updated OpenAPI spec

### Security & Performance

- [ ] My changes do not introduce security vulnerabilities
- [ ] I have considered performance implications
- [ ] For database changes, I have considered migration strategy
- [ ] I have not committed secrets or sensitive data

### Specific Checks (if applicable)

#### For LLM/Prompt Changes

- [ ] I have tested prompts with edge cases
- [ ] I have verified output with the output validator
- [ ] I have run the adversarial test suite

#### For Pipeline Changes

- [ ] I have verified saga orchestration works correctly
- [ ] I have tested circuit breaker behavior
- [ ] I have verified DLQ handling

#### For API Changes

- [ ] I have updated API versioning if needed
- [ ] I have added rate limiting if needed
- [ ] I have validated input schemas

## Related Issues

<!-- Link any related issues using GitHub keywords (e.g., fixes #123, relates to #456) -->

## Screenshots/Recordings

<!-- If applicable, add screenshots or recordings to help explain your changes -->

## Additional Context

<!-- Add any other context about the PR here -->

## Deployment Notes

<!-- Any special deployment considerations? Database migrations? Feature flags? -->

---

**By submitting this PR, I confirm that:**

- This is my own work and I have the right to submit it
- I have reviewed my code and it follows the project's code quality standards
- I understand this will be reviewed by maintainers before merging
