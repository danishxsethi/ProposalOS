# Implementation Plan: Deep Localization + Cross-Tenant Intelligence

## Overview

This implementation plan breaks down the Deep Localization + Cross-Tenant Intelligence feature into discrete, incremental coding tasks. The system is built in phases: locale detection and configuration, localization engine, anonymization and intelligence collection, pattern discovery, and finally integration and enrichment. Each phase includes both core implementation and property-based testing to ensure correctness across all supported locales and privacy guarantees.

## Tasks

- [x] 1. Set up project structure, database schema, and core types
  - Create TypeScript project structure with src/lib directories
  - Set up PostgreSQL database with all required tables (locale_configs, localized_prompts, anonymized_metrics, benchmark_cohorts, patterns, recommendation_implementations, effectiveness_records, intelligence_api_audit_log)
  - Define core TypeScript interfaces and types for all components
  - Set up Jest/Vitest for unit testing and fast-check for property-based testing
  - Configure database migrations and seed initial locale configurations (en-US, en-GB, en-CA, en-AU, de-DE, fr-FR, es-ES)
  - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 1.7, 13.1, 13.2_

- [x] 2. Implement Locale Detector component
  - [x] 2.1 Implement LocaleDetector class with detection priority chain
    - Implement detectLocale() method with priority: manual override > TLD > hreflang > GBP > IP geolocation > default
    - Implement TLD extraction from domain
    - Implement hreflang tag parsing from HTML content
    - Implement GBP location lookup
    - Implement IP geolocation fallback
    - Implement manual override parameter handling
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.7_

  - [x] 2.2 Write property tests for Locale Detector
    - **Property 1: Locale Detection Priority Chain** - Verify manual override > TLD > hreflang > GBP > IP > default
    - **Property 2: Manual Override Precedence** - Verify manual parameter always takes precedence
    - **Property 3: Locale Storage Completeness** - Verify detected locale stored in audit context
    - **Property 4: Default Locale Fallback** - Verify en-US returned when all methods fail
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 1.7_

  - [x] 2.3 Implement locale configuration management
    - Implement getLocaleConfig() to retrieve locale-specific settings
    - Implement validateLocale() to verify locale is supported
    - Implement getSupportedLocales() to list all available locales
    - Load locale configurations from database on startup
    - _Requirements: 1.1, 13.1, 13.2_

  - [x] 2.4 Write unit tests for locale configuration
    - Test retrieval of all supported launch locales
    - Test validation of supported vs unsupported locales
    - Test locale config completeness (language, search engine, currency, regulations, tone)
    - _Requirements: 1.1, 13.1, 13.2_

- [x] 3. Implement Localization Engine component
  - [x] 3.1 Implement LocalizationEngine class with prompt adaptation
    - Implement localizePrompt() method that calls Gemini 3.1 Pro with 4,096 token thinking budget
    - Implement prompt rewriting with cultural context (not translation)
    - Implement localization dimension coverage (language, search engine, benchmarks, competitors, regulations, currency, tone)
    - Implement error handling with fallback to en-US variant
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 7.2, 7.3_

  - [x] 3.2 Write property tests for Localization Engine
    - **Property 5: Prompt Adaptation for Non-English Locales** - Verify cultural context in adapted prompts
    - **Property 6: Gemini Thinking Budget Compliance** - Verify 4,096 token budget used
    - **Property 7: Localization Dimension Coverage** - Verify all 7 dimensions addressed in prompt
    - _Requirements: 2.1, 2.2, 2.3, 2.4_

  - [x] 3.3 Implement audit results localization
    - Implement localizeAuditResults() to adapt findings, recommendations, and explanations
    - Implement formatMetrics() for locale-appropriate currency and number formatting
    - Implement regulatory flag generation for locale-specific regulations
    - _Requirements: 2.5, 2.6, 6.1, 6.2, 6.3, 6.4, 6.5_

  - [x] 3.4 Write property tests for audit results localization
    - **Property 8: Audit Results Localization** - Verify all findings in target locale
    - **Property 9: Currency Formatting Correctness** - Verify locale-appropriate currency formatting
    - **Property 20: GDPR Regulatory Flagging** - Verify GDPR flags for EU locales (de-DE, fr-FR, es-ES)
    - **Property 21: PIPEDA Regulatory Flagging** - Verify PIPEDA flags for Canada (en-CA)
    - **Property 22: Privacy Act Regulatory Flagging** - Verify Privacy Act flags for Australia (en-AU)
    - **Property 23: Regulatory Guidance Completeness** - Verify guidance provided for flagged recommendations
    - **Property 24: Regulatory Review Marking** - Verify legal review marked for flagged recommendations
    - _Requirements: 2.5, 2.6, 6.1, 6.2, 6.3, 6.4, 6.5_

- [x] 4. Implement Localized Prompt Library
  - [x] 4.1 Create LocalizedPromptLibrary class
    - Implement getPrompt() to retrieve locale-specific prompt variant
    - Implement createVariant() to store new locale variant
    - Implement submitForApproval() for native speaker review workflow
    - Implement approveVariant() and rejectVariant() for approval management
    - Implement getStats() for library statistics
    - Implement validateCompleteness() to ensure all locales have variants
    - _Requirements: 7.1, 7.4, 7.5, 7.6_

  - [x] 4.2 Write property tests for Prompt Library
    - **Property 25: Locale Variant Requirement** - Verify all launch locales have variants for every node
    - **Property 26: Variant Gemini Budget** - Verify 4,096 token thinking budget used for variant creation
    - **Property 27: Variant Cultural Rewriting** - Verify variants include cultural context for target locale
    - **Property 28: Native Speaker Review Requirement** - Verify review required before approval
    - **Property 29: Variant Storage and Versioning** - Verify version tracking on approved variants
    - **Property 30: Variant Selection Correctness** - Verify correct variant selected per detected locale
    - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.5, 7.6_

  - [x] 4.3 Implement variant approval workflow
    - Create database operations for variant approval tracking
    - Implement approval status transitions (pending → approved/rejected)
    - Implement native speaker review comment storage
    - _Requirements: 7.4, 7.5_

- [x] 5. Implement Anonymization Pipeline
  - [x] 5.1 Create AnonymizationPipeline class
    - Implement anonymizeMetrics() to remove all client-identifying information
    - Implement removeIdentifyingInfo() to strip: client name, domain, contact info, email, phone
    - Implement field generalization (location → region, size → category)
    - Implement one-way hashing of client ID for re-audit matching
    - _Requirements: 8.1, 8.2, 12.1_

  - [x] 5.2 Write property tests for Anonymization Pipeline
    - **Property 31: Anonymization Completeness** - Verify all PII removed from extracted metrics
    - **Property 54: Privacy-First Anonymization** - Verify no identifying info present in output
    - _Requirements: 8.1, 8.2, 12.1_

  - [x] 5.3 Implement differential privacy engine
    - Implement applyDifferentialPrivacy() with noise injection
    - Configure epsilon parameter for privacy-utility tradeoff
    - Implement Laplace mechanism for noise generation
    - _Requirements: 8.3, 12.2_

  - [x] 5.4 Write property tests for differential privacy
    - **Property 32: Differential Privacy Application** - Verify noise injection applied to stored metrics
    - **Property 55: Differential Privacy Noise Injection** - Verify noise added to all metric values
    - _Requirements: 8.3, 12.2_

  - [x] 5.5 Implement validation and audit logging
    - Implement validateAnonymization() to verify privacy compliance
    - Implement auditAnonymization() to log all anonymization operations
    - _Requirements: 12.4, 12.5_

- [x] 6. Implement Benchmark Engine and K-Anonymity Enforcement
  - [x] 6.1 Create BenchmarkEngine class
    - Implement addMetrics() to store anonymized metrics
    - Implement queryBenchmarks() to retrieve cohort-specific benchmarks
    - Implement getCohortStats() to return benchmark statistics with sample size and confidence
    - Implement getTrendData() for trend analysis over time
    - _Requirements: 4.1, 4.2, 4.3, 4.4_

  - [x] 6.2 Write property tests for Benchmark Engine
    - **Property 13: Benchmark Metric Extraction** - Verify metrics extracted and categorized by industry, size, locale
    - **Property 14: Benchmark Cohort Matching** - Verify correct cohort returned for query
    - **Property 15: Benchmark Cohort Fallback** - Verify fallback to broader cohorts when data insufficient
    - **Property 16: Benchmark Metadata Completeness** - Verify sample size and confidence level included
    - **Property 35: Anonymized Metric Field Completeness** - Verify stored records include all required fields
    - **Property 36: Benchmark Query Privacy** - Verify query results cannot identify individual clients
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 8.6, 8.7_

  - [x] 6.3 Implement K-Anonymity enforcement
    - Implement enforceKAnonymity() to verify k ≥ 10 for all cohorts
    - Implement cohort merging strategy (industry → all industries, size → all sizes, locale → all locales)
    - Implement getMergedCohort() to return merged cohort when k-anonymity would be violated
    - _Requirements: 8.4, 8.5, 12.3_

  - [x] 6.4 Write property tests for K-Anonymity
    - **Property 33: K-Anonymity Enforcement** - Verify k ≥ 10 for all cohorts
    - **Property 34: Cohort Merging on K-Anonymity Violation** - Verify merging when cohort < 10 records
    - **Property 56: K-Anonymity Guarantee** - Verify no cohort ever has fewer than 10 records
    - _Requirements: 8.4, 8.5, 12.3_

- [x] 7. Checkpoint - Ensure anonymization pipeline and benchmark engine tests pass
  - Verify all unit tests pass for components built so far
  - Verify all property tests pass (100 iterations each)
  - Verify database schema and migrations work correctly
  - Verify no privacy violations detected in anonymization pipeline
  - Ask the user if questions arise

- [x] 8. Implement Pattern Discovery Engine
  - [x] 8.1 Create PatternDiscoveryEngine class
    - Implement analyzeAudit() to identify patterns in audit findings
    - Implement pattern extraction logic (platform, plugin, issue type)
    - Implement frequency calculation across audits
    - Implement promotePattern() to move patterns to active library when frequency ≥ 10
    - _Requirements: 9.1, 9.2, 9.3_

  - [x] 8.2 Write property tests for Pattern Discovery
    - **Property 37: Pattern Analysis Execution** - Verify patterns analyzed from every completed audit
    - **Property 38: Pattern Promotion Threshold** - Verify promotion occurs at exactly 10+ observations
    - **Property 39: Active Pattern Usage** - Verify active patterns used to accelerate diagnosis
    - **Property 40: Pattern Display Completeness** - Verify description, frequency, platforms, and fixes displayed
    - **Property 41: Pattern Tracking Completeness** - Verify industry and locale tracking per pattern
    - _Requirements: 9.1, 9.2, 9.3, 9.4, 9.5_

  - [x] 8.3 Implement pattern querying and trend tracking
    - Implement queryPatterns() with filtering by platform, plugin, industry, locale
    - Implement getPatternStats() for library statistics
    - Implement trackPatternTrend() to monitor pattern frequency over time
    - _Requirements: 9.4, 9.5_

- [x] 9. Implement Recommendation Effectiveness Tracker
  - [x] 9.1 Create RecommendationEffectivenessTracker class
    - Implement recordImplementation() to track when recommendations are implemented
    - Implement recordOutcome() to capture re-audit results
    - Implement impact measurement (traffic, ranking, conversion changes)
    - _Requirements: 10.1, 10.2_

  - [x] 9.2 Write property tests for Effectiveness Tracker
    - **Property 42: Re-audit Impact Measurement** - Verify actual impact measured vs predicted impact
    - **Property 43: Impact Metric Completeness** - Verify traffic, ranking, and conversion changes all tracked
    - **Property 44: Effectiveness Feedback Loop** - Verify accuracy data fed back to predictive engine
    - **Property 45: Effectiveness Data Display** - Verify recommendation type, industry, locale, and impact displayed
    - **Property 46: Effectiveness Data in Proposals** - Verify effectiveness data surfaced in proposals when sufficient data exists
    - _Requirements: 10.1, 10.2, 10.3, 10.4, 10.5_

  - [x] 9.3 Implement effectiveness statistics and accuracy tracking
    - Implement getEffectivenessStats() to return statistics by recommendation type, industry, locale
    - Implement getAccuracyTrends() to track prediction accuracy over time
    - Implement getPredictiveAccuracy() for overall system accuracy metrics
    - _Requirements: 10.3, 10.4, 10.5_

- [x] 10. Implement Intelligence API
  - [x] 10.1 Create IntelligenceAPI class with benchmarks endpoint
    - Implement queryBenchmarks() for GET /intelligence/benchmarks?industry=X&locale=Y&size=Z
    - Implement parameter validation
    - Implement response formatting with metadata (sample size, confidence, k-anonymity, lastUpdated)
    - _Requirements: 11.1_

  - [x] 10.2 Write property tests for Benchmarks API
    - **Property 47: Benchmarks API Endpoint** - Verify endpoint returns correct cohort data for valid params
    - **Property 52: API Response Privacy** - Verify no identifying info in any response
    - _Requirements: 11.1, 11.6_

  - [x] 10.3 Implement patterns endpoint
    - Implement queryPatterns() for GET /intelligence/patterns?platform=X&plugin=Y
    - Implement parameter validation
    - Implement response formatting
    - _Requirements: 11.2_

  - [x] 10.4 Write property tests for Patterns API
    - **Property 48: Patterns API Endpoint** - Verify endpoint returns correct pattern data for valid params
    - _Requirements: 11.2_

  - [x] 10.5 Implement effectiveness endpoint
    - Implement queryEffectiveness() for GET /intelligence/effectiveness?recommendation_type=X&industry=Y
    - Implement parameter validation
    - Implement response formatting
    - _Requirements: 11.3_

  - [x] 10.6 Write property tests for Effectiveness API
    - **Property 49: Effectiveness API Endpoint** - Verify endpoint returns correct effectiveness data for valid params
    - _Requirements: 11.3_

  - [x] 10.7 Implement rate limiting and audit logging
    - Implement rate limiting (1000 requests/hour per service account)
    - Implement request audit logging to intelligence_api_audit_log table
    - Implement compliance review tracking
    - _Requirements: 11.4, 11.5, 12.4_

  - [x] 10.8 Write property tests for API security
    - **Property 50: API Rate Limiting** - Verify rate limit enforced at 1000 req/hour per service account
    - **Property 51: API Request Audit Logging** - Verify all requests logged with requester and filters
    - **Property 57: Intelligence Query Audit Logging** - Verify complete audit trail for all queries
    - _Requirements: 11.4, 11.5, 12.4_

  - [x] 10.9 Implement empty result handling
    - Implement proper HTTP status codes for empty results
    - Return empty result set with appropriate status when no data matches query
    - _Requirements: 11.7_

  - [x] 10.10 Write property tests for empty results
    - **Property 53: Empty API Result Handling** - Verify empty result set returned with correct HTTP status
    - _Requirements: 11.7_

- [x] 11. Implement Regulatory Compliance Checker
  - [x] 11.1 Create RegulatoryComplianceChecker class
    - Implement checkRecommendation() to flag regulatory concerns per locale
    - Implement GDPR rules for EU locales (de-DE, fr-FR, es-ES)
    - Implement PIPEDA rules for Canada (en-CA)
    - Implement Privacy Act rules for Australia (en-AU)
    - Implement getSuggestedAlternatives() to provide compliant alternatives
    - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5, 15.1, 15.2, 15.3_

  - [x] 11.2 Write property tests for Regulatory Compliance Checker
    - **Property 70: EU Regulatory Compliance Checking** - Verify all recommendations checked against GDPR for EU locales
    - **Property 71: Canada Regulatory Compliance Checking** - Verify all recommendations checked against PIPEDA for en-CA
    - **Property 72: Australia Regulatory Compliance Checking** - Verify all recommendations checked against Privacy Act for en-AU
    - **Property 73: Regulatory Concern Flagging and Guidance** - Verify flag includes specific compliance guidance
    - **Property 74: Regulatory Requirement Indication** - Verify flag indicates the specific regulation triggered
    - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5, 15.1, 15.2, 15.3, 15.4, 15.5_

  - [x] 11.3 Implement compliance reporting
    - Implement validateCompliance() to generate full compliance reports
    - Include compliance score, total flagged count, and per-flag details
    - _Requirements: 15.4, 15.5_

- [x] 12. Implement Search Engine Adaptation
  - [x] 12.1 Implement search engine prioritization logic
    - Implement locale-to-search-engine mapping (ru-RU → Yandex, zh-CN → Baidu, ko-KR → Naver, etc.)
    - Implement search engine-specific guidance generation per recommendation
    - Implement competitor analysis using locale-appropriate search engine
    - Implement search visibility metrics display with locale-appropriate primary engine
    - _Requirements: 3.1, 3.2, 3.3, 3.4_

  - [x] 12.2 Write property tests for search engine adaptation
    - **Property 10: Search Engine Prioritization** - Verify correct engine prioritized for each locale
    - **Property 11: Search Engine-Specific Guidance** - Verify guidance references locale-appropriate engine
    - **Property 12: Search Visibility Metrics Display** - Verify locale-appropriate engine shown as primary
    - _Requirements: 3.1, 3.2, 3.3, 3.4_

- [x] 13. Implement Competitor Analysis Localization
  - [x] 13.1 Implement locale-specific competitor identification
    - Implement competitor identification filtered by locale and industry
    - Implement multi-locale competitor analysis (separate analysis per locale for multi-locale businesses)
    - Implement locale-specific metrics display (rankings in appropriate search results)
    - _Requirements: 5.1, 5.2, 5.3_

  - [x] 13.2 Write property tests for competitor analysis
    - **Property 17: Competitor Locale Identification** - Verify competitors identified in same locale and industry
    - **Property 18: Multi-Locale Competitor Analysis** - Verify separate analysis per locale for multi-locale businesses
    - **Property 19: Competitor Metrics Localization** - Verify locale-specific metrics shown (e.g., rankings in correct search engine)
    - _Requirements: 5.1, 5.2, 5.3_

- [x] 14. Implement Audit Enrichment with Intelligence
  - [x] 14.1 Integrate Intelligence API into audit pipeline
    - Implement intelligence query during audit execution
    - Implement benchmark enrichment of findings (display alongside findings)
    - Implement pattern matching and highlighting for known patterns
    - Implement effectiveness data display (benchmark percentile, pattern frequency, effectiveness data)
    - Implement messaging when insufficient data exists for enrichment
    - _Requirements: 14.1, 14.2, 14.3, 14.4, 14.5_

  - [x] 14.2 Write property tests for audit enrichment
    - **Property 65: Audit Enrichment with Benchmarks** - Verify Intelligence API queried for every completed audit
    - **Property 66: Benchmark Display with Findings** - Verify available benchmarks displayed alongside findings
    - **Property 67: Pattern Highlighting in Findings** - Verify findings matching known patterns are highlighted
    - **Property 68: Enriched Finding Display Completeness** - Verify benchmark percentile, pattern frequency, and effectiveness data shown
    - **Property 69: Insufficient Data Messaging** - Verify messaging shown when enrichment data unavailable
    - _Requirements: 14.1, 14.2, 14.3, 14.4, 14.5_

- [x] 15. Implement Locale Extensibility Framework
  - [x] 15.1 Create locale configuration system
    - Implement configuration file format for adding new locales
    - Implement locale validation and deployment workflow
    - Implement native speaker review requirement enforcement for new locales
    - Implement automatic benchmark collection start on locale deployment
    - _Requirements: 13.1, 13.2, 13.3, 13.4, 13.5_

  - [x] 15.2 Write property tests for locale extensibility
    - **Property 60: Locale Configuration Extensibility** - Verify new locale requires only a config file
    - **Property 61: Locale Configuration Completeness** - Verify config file must specify all required fields (language, search engine, currency, regulations, tone)
    - **Property 62: New Locale Variant Requirement** - Verify all node prompt variants required for new locale
    - **Property 63: New Locale Variant Approval** - Verify native speaker review required before deployment
    - **Property 64: New Locale Benchmark Collection** - Verify benchmark collection begins on locale deployment
    - _Requirements: 13.1, 13.2, 13.3, 13.4, 13.5_

- [x] 16. Implement Privacy and Security Controls
  - [x] 16.1 Implement privacy monitoring and alerting
    - Implement privacy concern detection logic
    - Implement operator alerting for privacy violations
    - Implement secure data deletion of raw audit data after anonymization
    - _Requirements: 12.5, 12.6_

  - [x] 16.2 Write property tests for privacy controls
    - **Property 58: Privacy Concern Alerting** - Verify operator alerts triggered immediately on privacy concern
    - **Property 59: Secure Data Deletion** - Verify raw audit data securely deleted after anonymization
    - _Requirements: 12.5, 12.6_

- [x] 17. Checkpoint - Ensure all core components and tests pass
  - Verify all unit tests pass (minimum 80% coverage)
  - Verify all property tests pass (100 iterations each)
  - Verify database schema and migrations work correctly
  - Verify no privacy violations detected
  - Ensure all requirements covered by implementation
  - Ask the user if questions arise

- [x] 18. Integration testing and end-to-end validation
  - [x] 18.1 Write integration tests for complete audit pipeline
    - Test locale detection → localization → audit execution → enrichment → anonymization flow
    - Test multi-locale audit execution
    - Test benchmark collection and querying end-to-end
    - _Requirements: All_

  - [x] 18.2 Write end-to-end property tests
    - **Property Round-Trip: Audit Execution** - Verify complete audit flow produces localized, enriched, anonymized output
    - **Property Round-Trip: Benchmark Collection** - Verify metrics collected and queryable via Intelligence API
    - _Requirements: All_

- [x] 19. Final checkpoint - Ensure all tests pass and privacy verified
  - Verify all unit tests pass (minimum 80% coverage)
  - Verify all property tests pass (100 iterations each)
  - Verify all integration tests pass
  - Verify privacy compliance (k-anonymity ≥ 10, differential privacy applied)
  - Verify no client data leakage in Intelligence API responses
  - Verify audit logging complete for all API queries
  - Ask the user if questions arise

## Notes

- Sub-tasks marked with `*` are optional property-based or unit testing tasks and can be skipped for faster MVP, but are strongly recommended for correctness verification
- Each task references specific requirements for traceability
- Property tests use fast-check library with minimum 100 iterations per test
- All property tests tagged with format: `Feature: deep-localization-cross-tenant-intelligence, Property {N}: {property_text}`
- Database migrations should be version-controlled and tested
- Locale configurations should be loaded from database on startup
- All API responses must be validated for privacy compliance before returning
- Differential privacy epsilon parameter should be tuned based on privacy-utility requirements
- K-anonymity minimum of 10 is a hard requirement for all cohorts
