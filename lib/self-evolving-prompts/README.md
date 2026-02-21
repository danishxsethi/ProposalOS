# Self-Evolving Prompts & Predictive Intelligence

This module implements the PostgreSQL schema and data access layer for the Self-Evolving Prompts and Predictive Intelligence feature.

## Structure

```
lib/self-evolving-prompts/
├── types.ts                    # TypeScript interfaces
├── db.ts                       # Database connection pool
├── data-access/
│   ├── prompt-performance.ts   # Prompt performance tracking
│   ├── prompt-versions.ts      # Version control operations
│   ├── ab-experiments.ts       # A/B testing framework
│   ├── predictions.ts          # Prediction storage & calibration
│   ├── scenarios.ts            # What-if scenario management
│   └── index.ts                # Data access exports
├── index.ts                    # Main module exports
└── README.md                   # This file
```

## Database Schema

The migration file creates the following tables:

### 1. `prompt_performance_logs`
Append-only log of all LLM calls with performance metrics.

**Indexes:**
- `idx_performance_version_time` - Query by version and time
- `idx_performance_node` - Query by node ID
- `idx_performance_experiment` - Query by experiment ID
- `idx_performance_timestamp` - Time-based queries

### 2. `prompt_versions`
Git-like version control for prompts.

**Indexes:**
- `idx_versions_node` - Query by node ID
- `idx_versions_active` - Find active versions
- `idx_versions_created` - Time-based queries

### 3. `ab_experiments` & `ab_variants`
A/B testing framework for prompt experiments.

**Indexes:**
- `idx_experiments_node` - Query by node ID
- `idx_experiments_status` - Filter by status
- `idx_variants_experiment` - Query variants by experiment

### 4. `predictions`
Storage for predictive intelligence forecasts.

**Indexes:**
- `idx_predictions_audit` - Query by audit ID
- `idx_predictions_type_date` - Query by type and date
- `idx_predictions_observed` - Find predictions with outcomes

### 5. `scenarios`
What-if scenario results.

**Indexes:**
- `idx_scenarios_audit` - Query by audit ID
- `idx_scenarios_created` - Time-based queries

## Usage

### Prompt Performance Tracking

```typescript
import { logPerformance, getAggregateMetrics } from '@/lib/self-evolving-prompts';

// Log a performance entry
await logPerformance({
  promptVersionHash: 'abc123...',
  nodeId: 'diagnosis-node',
  qualityScore: 85.5,
  downstreamImpact: 92.0,
  costUSD: 0.0023,
  latencyMs: 1250,
  inputTokens: 500,
  outputTokens: 300,
  metadata: { model: 'gemini-pro' }
});

// Get aggregate metrics
const metrics = await getAggregateMetrics('abc123...');
console.log(metrics.avgQualityScore); // 85.5
```

### Version Control

```typescript
import { createVersion, rollbackToVersion, compareVersions } from '@/lib/self-evolving-prompts';

// Create a new version
const version = await createVersion(
  'diagnosis-node',
  'You are an SEO expert...',
  'system',
  'Initial version'
);

// Rollback to a previous version
await rollbackToVersion('abc123...');

// Compare versions
const comparison = await compareVersions('abc123...', 'def456...');
console.log(comparison.performanceDelta);
```

### A/B Testing

```typescript
import { createExperiment, routeRequest, checkForWinner } from '@/lib/self-evolving-prompts';

// Create an experiment
const experiment = await createExperiment({
  name: 'Diagnosis Prompt Test',
  nodeId: 'diagnosis-node',
  variants: [
    { promptVersionHash: 'abc123...', trafficPercentage: 50 },
    { promptVersionHash: 'def456...', trafficPercentage: 50 }
  ]
});

// Route a request
const versionHash = await routeRequest('diagnosis-node');

// Check for winner
const winner = await checkForWinner(experiment.id);
if (winner) {
  console.log(`Winner: ${winner.winnerVariantId} with p=${winner.pValue}`);
}
```

### Predictions

```typescript
import { recordPrediction, recordOutcome, getCalibrationMetrics } from '@/lib/self-evolving-prompts';

// Record a prediction
const prediction = await recordPrediction({
  auditId: 'audit-123',
  predictionType: 'traffic',
  predictedValue: 10000,
  confidenceIntervalLower: 8000,
  confidenceIntervalUpper: 12000,
  predictionDate: new Date(),
  metadata: {}
});

// Record actual outcome
await recordOutcome(prediction.id, 9500);

// Get calibration metrics
const calibration = await getCalibrationMetrics('traffic');
console.log(calibration.calibrationScore); // 0.95 = well calibrated
```

### Scenarios

```typescript
import { saveScenario, compareScenarios } from '@/lib/self-evolving-prompts';

// Save a scenario
const scenario = await saveScenario({
  auditId: 'audit-123',
  selectedRecommendations: ['rec-1', 'rec-2'],
  projectedROI: 250,
  projectedTimeline: '3 months',
  projectedTraffic: 15000,
  confidenceIntervals: {
    roi: [200, 300],
    traffic: [12000, 18000]
  },
  comparisonToBaseline: {
    roiDelta: 150,
    trafficDelta: 5000,
    timelineDelta: '-1 month'
  },
  calculationTimeMs: 2500
});

// Compare scenarios
const comparison = await compareScenarios(['scenario-1', 'scenario-2']);
console.log(`Best ROI: ${comparison.bestROI}`);
```

## Running Migrations

To apply the database migration:

```bash
# Using Prisma
npx prisma migrate deploy

# Or using raw SQL
psql $DATABASE_URL < prisma/migrations/20250101000000_self_evolving_prompts/migration.sql
```

## Testing

The data access layer is designed to be testable with property-based tests. See the test files in `lib/self-evolving-prompts/__tests__/` for examples.

## Performance Considerations

1. **Append-Only Logs**: The `prompt_performance_logs` table is append-only for maximum write performance
2. **Indexes**: All tables have appropriate indexes for common query patterns
3. **Connection Pooling**: Uses Prisma's built-in connection pooling
4. **Batch Operations**: Consider batching writes for high-volume scenarios

## Requirements Validation

This implementation validates the following requirements:

- **1.1-1.5**: Prompt Performance Tracking
- **2.1-2.5**: A/B Testing Framework
- **3.1**: Underperforming prompt identification
- **4.1-4.6**: Version Control
- **5.1-5.6**: Predictive Intelligence
- **6.1-6.6**: Prediction Calibration
- **7.1-7.5**: What-If Scenarios
- **10.1-10.4**: Data Storage and Persistence

## Next Steps

1. Implement the Prompt Evolution Engine (uses this data layer)
2. Implement the Predictive Intelligence Engine (uses this data layer)
3. Add LangGraph integration for A/B testing
4. Create dashboard UI for monitoring
