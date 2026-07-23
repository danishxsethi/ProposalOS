# Deep Localization + Cross-Tenant Intelligence

A comprehensive system for global localization and privacy-preserving cross-tenant intelligence in SEO audits.

## Features

- **Deep Localization**: Adapts all audit content to specific markets with cultural context
- **Locale Detection**: Auto-detects user locale from domain TLD, hreflang tags, GBP location, IP geolocation, or manual override
- **Localized Prompts**: LangGraph node prompts rewritten for each supported locale with cultural context
- **Anonymized Metrics**: Audit metrics stripped of client-identifying information with k-anonymity and differential privacy
- **Benchmark Engine**: Aggregates anonymized metrics by industry, business size, and locale
- **Pattern Discovery**: Auto-discovers recurring patterns across audits
- **Recommendation Effectiveness**: Measures actual impact of recommendations vs predicted impact
- **Intelligence API**: Internal API for querying cross-tenant benchmarks, patterns, and effectiveness data
- **Regulatory Compliance**: Flags recommendations that may violate local regulations (GDPR, PIPEDA, Privacy Act)

## Supported Launch Locales

- en-US (English - United States)
- en-GB (English - United Kingdom)
- en-CA (English - Canada)
- en-AU (English - Australia)
- de-DE (German - Germany)
- fr-FR (French - France)
- es-ES (Spanish - Spain)

## Project Structure

```
lib/deep-localization-cross-tenant-intelligence/
├── types.ts                 # Core TypeScript interfaces and types
├── db/
│   ├── schema.sql          # PostgreSQL database schema
│   ├── seed.sql            # Initial locale configurations
│   └── connection.ts       # Database connection and migration utilities
├── __tests__/
│   ├── setup.ts            # Test setup and utilities
│   ├── types.test.ts       # Unit tests for core types
│   └── db.test.ts          # Unit tests for database schema
└── README.md               # This file
```

## Database Schema

The system uses PostgreSQL with the following tables:

- `locale_configs`: Locale-specific configuration (language, search engine, currency, regulations, tone)
- `localized_prompts`: LangGraph node prompts in different locales with approval workflow
- `anonymized_metrics`: Audit metrics stripped of identifying information
- `benchmark_cohorts`: Aggregated benchmarks by industry, size, and locale
- `patterns`: Recurring patterns discovered across audits
- `recommendation_implementations`: Tracking of implemented recommendations
- `effectiveness_records`: Actual impact of implemented recommendations
- `intelligence_api_audit_log`: Audit trail of all Intelligence API queries

## Testing

### Unit Tests

Run unit tests with Jest:

```bash
npm test -- --config jest.config.deep-localization.js
```

### Property-Based Tests

Property-based tests use fast-check to verify correctness properties across randomized inputs:

```bash
npm test -- --config jest.config.deep-localization.js --testNamePattern="property"
```

### Test Coverage

Minimum coverage requirements:
- 80% overall code coverage
- 100% coverage for critical paths (anonymization, privacy checks)

## Database Setup

### Initialize Database

```typescript
import { initializePool, runMigrations } from './db/connection';

// Initialize connection pool
initializePool();

// Run migrations and seed data
await runMigrations();
```

### Environment Variables

```
DB_HOST=localhost
DB_PORT=5432
DB_NAME=deep_localization
DB_USER=postgres
DB_PASSWORD=postgres
```

## Core Components

### Locale Detector

Detects user locale with priority chain:
1. Manual override parameter (?locale=de-DE)
2. Domain TLD (.de → de-DE)
3. hreflang tags in HTML
4. GBP location
5. IP geolocation
6. Default to en-US

### Localization Engine

Adapts all audit content to locale with cultural context across 7 dimensions:
- Language
- Search engine (Google, Yandex, Baidu, Naver)
- Benchmarks
- Competitors
- Regulations
- Currency
- Tone

### Anonymization Pipeline

Removes client-identifying information and applies privacy techniques:
- Removes: client name, domain, contact info, email, phone
- Generalizes: location, business size
- Hashes: client ID (one-way for re-audit matching)
- Applies: differential privacy with noise injection
- Enforces: k-anonymity (k ≥ 10)

### Benchmark Engine

Aggregates anonymized metrics by industry, business size, and locale:
- Extracts metrics from completed audits
- Enforces k-anonymity (minimum 10 records per cohort)
- Falls back to broader cohorts when insufficient data
- Provides percentile statistics (p25, median, p75, p95)

### Pattern Discovery Engine

Auto-discovers recurring patterns across audits:
- Analyzes findings to identify patterns
- Promotes patterns to active library at 10+ observations
- Tracks affected platforms, plugins, industries, and locales
- Monitors trend (increasing, stable, decreasing)

### Recommendation Effectiveness Tracker

Measures actual impact of recommendations:
- Records when recommendations are implemented
- Captures re-audit results and actual impact
- Compares predicted vs actual impact
- Feeds accuracy data back to predictive engine

### Intelligence API

Internal API for querying cross-tenant intelligence:
- GET /intelligence/benchmarks?industry=X&locale=Y&size=Z
- GET /intelligence/patterns?platform=X&plugin=Y
- GET /intelligence/effectiveness?recommendation_type=X&industry=Y
- Rate limiting: 1000 requests/hour per service account
- Audit logging of all queries
- Privacy validation before returning data

### Regulatory Compliance Checker

Flags recommendations that may violate local regulations:
- GDPR (EU): Data collection, consent, privacy policy, cookie consent
- PIPEDA (Canada): Personal information collection, consent, privacy policy
- Privacy Act (Australia): Personal information handling, privacy policy, consent

## Privacy and Security

### Privacy Guarantees

- **Differential Privacy**: Noise injection to prevent individual record identification
- **K-Anonymity**: Each data point indistinguishable from at least 9 other points (k ≥ 10)
- **Data Minimization**: Only necessary metrics collected and stored
- **Secure Deletion**: Raw audit data securely deleted after anonymization

### Security Measures

- All API queries audited and logged
- Rate limiting to prevent abuse
- Privacy validation before returning data
- Operator alerting for privacy violations
- Compliance review tracking

## Requirements Coverage

This implementation covers the following requirements:

- **Requirement 1**: Locale Detection and Configuration
- **Requirement 2**: Localized Audit Pipeline
- **Requirement 3**: Locale-Specific Search Engine Adaptation
- **Requirement 4**: Locale-Specific Benchmarks
- **Requirement 5**: Locale-Specific Competitor Analysis
- **Requirement 6**: Locale-Specific Regulations and Compliance
- **Requirement 7**: Localized Prompt Library
- **Requirement 8**: Anonymized Benchmark Data Collection
- **Requirement 9**: Pattern Discovery and Library
- **Requirement 10**: Recommendation Effectiveness Tracking
- **Requirement 11**: Intelligence API
- **Requirement 12**: Privacy and Security
- **Requirement 13**: Localization Configuration and Extensibility

## Next Steps

1. Implement Locale Detector component (Task 2)
2. Implement Localization Engine component (Task 3)
3. Implement Localized Prompt Library (Task 4)
4. Implement Anonymization Pipeline (Task 5)
5. Implement Benchmark Engine and K-Anonymity Enforcement (Task 6)
6. Implement Pattern Discovery Engine (Task 7)
7. Implement Recommendation Effectiveness Tracker (Task 8)
8. Implement Intelligence API (Task 9)
9. Implement Regulatory Compliance Checker (Task 10)
10. Implement Search Engine Adaptation (Task 11)
11. Implement Competitor Analysis Localization (Task 12)
12. Implement Audit Enrichment with Intelligence (Task 13)
13. Implement Locale Extensibility Framework (Task 14)
14. Implement Privacy and Security Controls (Task 15)
15. Integration testing and end-to-end validation (Task 17)
