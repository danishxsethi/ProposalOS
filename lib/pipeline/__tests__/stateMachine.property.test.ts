import { cleanupDb } from '@/lib/__tests__/utils/cleanup';
/**
 * Property-Based Tests for Prospect State Machine
 * 
 * Tests Properties 7, 8, and 9 from the design document using fast-check.
 * Minimum 100 iterations per property.
 * 
 * Feature: autonomous-proposal-engine
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fc from 'fast-check';
import { prisma } from '@/lib/prisma';
import {
  canTransition,
  transition,
  getHistory,
  serializeHistory,
  deserializeHistory,
  VALID_TRANSITIONS,
} from '../stateMachine';
import type { ProspectStatus, StateTransition } from '../types';
import { PipelineStage } from '../types';

// ============================================================================
// Test Data Generators
// ============================================================================

/**
 * Generate a valid ProspectStatus
 */
const prospectStatusArb = fc.constantFrom<ProspectStatus>(
  'discovered',
  'audited',
  'QUALIFIED',
  'outreach_sent',
  'hot_lead',
  'closing',
  'closed_won',
  'delivering',
  'delivered',
  'unqualified',
  'audit_failed',
  'low_value',
  'closed_lost'
);

/**
 * Generate a valid PipelineStage
 */
const pipelineStageArb = fc.constantFrom<PipelineStage>(
  PipelineStage.DISCOVERY,
  PipelineStage.AUDIT,
  PipelineStage.DIAGNOSIS,
  PipelineStage.PROPOSAL,
  PipelineStage.OUTREACH,
  PipelineStage.CLOSING,
  PipelineStage.DELIVERY
);

/**
 * Generate a tenant ID
 */
const tenantIdArb = fc.uuid();

/**
 * Generate a StateTransition object
 * Note: We avoid undefined in metadata since JSON.stringify converts undefined to null
 * Note: We use valid date ranges to avoid NaN dates
 */
const stateTransitionArb = fc.record({
  from: prospectStatusArb,
  to: prospectStatusArb,
  timestamp: fc.date({ min: new Date('2020-01-01'), max: new Date('2030-12-31') }),
  stage: pipelineStageArb,
  tenantId: tenantIdArb,
  metadata: fc.option(
    fc.dictionary(
      fc.string(),
      fc.oneof(
        fc.string(),
        fc.integer(),
        fc.boolean(),
        fc.constant(null)
      )
    ),
    { nil: {} }
  ),
});

/**
 * Generate an array of StateTransition objects
 */
const stateTransitionArrayArb = fc.array(
  fc.record({
    from: prospectStatusArb,
    to: prospectStatusArb,
    timestamp: fc.date({ min: new Date('2020-01-01'), max: new Date('2030-12-31') }),
    stage: pipelineStageArb,
    tenantId: tenantIdArb,
    metadata: fc.option(
      fc.dictionary(
        fc.string(),
        fc.oneof(
          fc.string(),
          fc.integer(),
          fc.boolean(),
          fc.constant(null)
        )
      ),
      { nil: {} }
    ),
  }),
  { minLength: 0, maxLength: 20 }
).filter((arr) => arr.every((t) => !isNaN(t.timestamp.getTime())));

/**
 * Generate a valid transition pair (from, to) based on VALID_TRANSITIONS
 */
const validTransitionPairArb = fc
  .constantFrom(...(Object.keys(VALID_TRANSITIONS) as ProspectStatus[]))
  .chain((from) => {
    const validNextStates = VALID_TRANSITIONS[from];
    if (validNextStates.length === 0) {
      // Terminal state, return a dummy pair that we'll filter out
      return fc.constant({ from, to: from, isTerminal: true });
    }
    return fc
      .constantFrom(...validNextStates)
      .map((to) => ({ from, to, isTerminal: false }));
  })
  .filter((pair) => !pair.isTerminal);

/**
 * Generate an invalid transition pair (from, to) that is NOT in VALID_TRANSITIONS
 */
const invalidTransitionPairArb = fc
  .tuple(prospectStatusArb, prospectStatusArb)
  .filter(([from, to]) => {
    const validNextStates = VALID_TRANSITIONS[from];
    return !validNextStates.includes(to);
  })
  .map(([from, to]) => ({ from, to }));

// ============================================================================
// Test Helpers
// ============================================================================

let testTenantId: string;

/**
 * Create a test tenant for the tests
 */
async function createTestTenant(): Promise<string> {
  const tenant = await prisma.tenant.create({
    data: {
      name: `Test Tenant ${Math.random()}`,
    },
  });
  return tenant.id;
}

/**
 * Create a test prospect in the database
 */
async function createTestProspect(
  tenantId: string,
  status: ProspectStatus
): Promise<string> {
  const prospect = await prisma.prospectLead.create({
    data: {
      tenantId,
      pipelineStatus: status,
      businessName: `Test Business ${Math.random()}`,
      website: `https://test-${Math.random()}.com`,
      city: 'Test City',
      vertical: 'test',
      source: 'test',
      sourceExternalId: `test-${Math.random()}`,
      painScore: 75,
      painBreakdown: {},
    },
  });
  return prospect.id;
}

/**
 * Clean up test data
 */
async function cleanupTestData(prospectIds: string[]) {
  if (prospectIds.length === 0) return;
  
    await cleanupDb(prisma);
}

/**
 * Clean up test tenant
 */
async function cleanupTestTenant(tenantId: string) {
  if (!tenantId) return;
  
  try {
    await prisma.tenant.delete({
      where: { id: tenantId },
    });
  } catch (error) {
    // Tenant might not exist if test failed early
    console.warn(`Failed to delete tenant ${tenantId}:`, error);
  }
}

// ============================================================================
// Property Tests
// ============================================================================

describe('State Machine Property Tests', () => {
  const createdProspectIds: string[] = [];

  beforeEach(async () => {
    // Create a test tenant before each test
    testTenantId = await createTestTenant();
  });

  afterEach(async () => {
    // Clean up all test data after each test
    await cleanupTestData(createdProspectIds);
    createdProspectIds.length = 0;
    
    // Clean up test tenant
    if (testTenantId) {
      await cleanupTestTenant(testTenantId);
    }
  });

  /**
   * Property 7: State machine only allows valid transitions
   * 
   * For any prospect status and any attempted transition, the transition must
   * succeed only if the target status is in the set of valid successors for
   * the current status. Invalid transitions must be rejected and logged.
   * 
   * **Validates: Requirements 12.1, 12.2**
   */
  describe('Property 7: State machine only allows valid transitions', () => {
    it('accepts all valid transitions', async () => {
      await fc.assert(
        fc.asyncProperty(
          validTransitionPairArb,
          pipelineStageArb,
          async ({ from, to }, stage) => {
            // Create a prospect in the 'from' status
            const prospectId = await createTestProspect(testTenantId, from);
            createdProspectIds.push(prospectId);

            // Attempt the transition
            const result = await transition(prospectId, to, stage);

            // Verify the transition succeeded
            expect(result.from).toBe(from);
            expect(result.to).toBe(to);
            expect(result.stage).toBe(stage);
            expect(result.tenantId).toBe(testTenantId);

            // Verify the prospect's status was updated
            const updatedProspect = await prisma.prospectLead.findUnique({
              where: { id: prospectId },
              select: { pipelineStatus: true },
            });
            expect(updatedProspect?.pipelineStatus).toBe(to);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('rejects all invalid transitions', async () => {
      await fc.assert(
        fc.asyncProperty(
          invalidTransitionPairArb,
          pipelineStageArb,
          async ({ from, to }, stage) => {
            // Create a prospect in the 'from' status
            const prospectId = await createTestProspect(testTenantId, from);
            createdProspectIds.push(prospectId);

            // Attempt the invalid transition
            await expect(transition(prospectId, to, stage)).rejects.toThrow();

            // Verify the prospect's status was NOT updated
            const updatedProspect = await prisma.prospectLead.findUnique({
              where: { id: prospectId },
              select: { pipelineStatus: true },
            });
            expect(updatedProspect?.pipelineStatus).toBe(from);

            // Verify an error was logged
            const errorLog = await prisma.pipelineErrorLog.findFirst({
              where: {
                prospectId,
                errorType: 'INVALID_TRANSITION',
              },
            });
            expect(errorLog).toBeTruthy();
          }
        ),
        { numRuns: 100 }
      );
    });

    it('canTransition correctly identifies valid and invalid transitions', () => {
      fc.assert(
        fc.property(prospectStatusArb, prospectStatusArb, (from, to) => {
          const result = canTransition(from, to);
          const expected = VALID_TRANSITIONS[from].includes(to);
          expect(result).toBe(expected);
        }),
        { numRuns: 100 }
      );
    });
  });

  /**
   * Property 8: State transitions are fully recorded
   * 
   * For any successful state transition, a transition record must be created
   * containing the prospect ID, from-status, to-status, timestamp, originating
   * stage, and tenant ID.
   * 
   * **Validates: Requirements 12.3**
   */
  describe('Property 8: State transitions are fully recorded', () => {
    it('records all transition details in the database', async () => {
      await fc.assert(
        fc.asyncProperty(
          validTransitionPairArb,
          pipelineStageArb,
          async ({ from, to }, stage) => {
            // Create a prospect in the 'from' status
            const prospectId = await createTestProspect(testTenantId, from);
            createdProspectIds.push(prospectId);

            // Perform the transition
            const beforeTransition = new Date();
            const result = await transition(prospectId, to, stage);
            const afterTransition = new Date();

            // Verify the returned StateTransition contains all required fields
            expect(result.from).toBe(from);
            expect(result.to).toBe(to);
            expect(result.stage).toBe(stage);
            expect(result.tenantId).toBe(testTenantId);
            expect(result.timestamp).toBeInstanceOf(Date);
            expect(result.timestamp.getTime()).toBeGreaterThanOrEqual(beforeTransition.getTime());
            expect(result.timestamp.getTime()).toBeLessThanOrEqual(afterTransition.getTime());
            expect(result.metadata).toBeDefined();

            // Verify the transition was persisted to the database
            const transitionRecord = await prisma.prospectStateTransition.findFirst({
              where: {
                leadId: prospectId,
                fromStatus: from,
                toStatus: to,
              },
            });

            expect(transitionRecord).toBeTruthy();
            expect(transitionRecord?.tenantId).toBe(testTenantId);
            expect(transitionRecord?.stage).toBe(stage);
            expect(transitionRecord?.fromStatus).toBe(from);
            expect(transitionRecord?.toStatus).toBe(to);
            expect(transitionRecord?.createdAt).toBeInstanceOf(Date);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('getHistory returns all transitions in chronological order', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.constant(null), // Dummy arbitrary to run the test
          async () => {
            // Create a prospect and perform a sequence of valid transitions
            const prospectId = await createTestProspect(testTenantId, 'discovered');
            createdProspectIds.push(prospectId);

            // Perform a sequence of transitions: discovered -> audited -> proposed
            await transition(prospectId, 'audited', PipelineStage.AUDIT);
            await transition(prospectId, 'QUALIFIED', PipelineStage.PROPOSAL);

            // Get the history
            const history = await getHistory(prospectId);

            // Verify we have 2 transitions
            expect(history).toHaveLength(2);

            // Verify they are in chronological order
            expect(history[0].from).toBe('discovered');
            expect(history[0].to).toBe('audited');
            expect(history[1].from).toBe('audited');
            expect(history[1].to).toBe('QUALIFIED');

            // Verify timestamps are in order
            expect(history[0].timestamp.getTime()).toBeLessThanOrEqual(
              history[1].timestamp.getTime()
            );

            // Verify all required fields are present
            for (const transition of history) {
              expect(transition.from).toBeDefined();
              expect(transition.to).toBeDefined();
              expect(transition.timestamp).toBeInstanceOf(Date);
              expect(transition.stage).toBeDefined();
              expect(transition.tenantId).toBe(testTenantId);
              expect(transition.metadata).toBeDefined();
            }
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  /**
   * Property 9: State transition history round-trip serialization
   * 
   * For any list of state transition records, serializing to JSON and then
   * deserializing must produce a list equivalent to the original.
   * 
   * **Validates: Requirements 12.4**
   */
  describe('Property 9: State transition history round-trip serialization', () => {
    it('serialization and deserialization are inverse operations', () => {
      fc.assert(
        fc.property(stateTransitionArrayArb, (transitions) => {
          // Serialize the transitions
          const serialized = serializeHistory(transitions);

          // Verify it's valid JSON
          expect(() => JSON.parse(serialized)).not.toThrow();

          // Deserialize back
          const deserialized = deserializeHistory(serialized);

          // Verify the arrays have the same length
          expect(deserialized).toHaveLength(transitions.length);

          // Verify each transition is equivalent
          for (let i = 0; i < transitions.length; i++) {
            const original = transitions[i];
            const restored = deserialized[i];

            expect(restored.from).toBe(original.from);
            expect(restored.to).toBe(original.to);
            expect(restored.stage).toBe(original.stage);
            expect(restored.tenantId).toBe(original.tenantId);
            
            // Timestamps should be equal (within millisecond precision)
            expect(restored.timestamp.getTime()).toBe(original.timestamp.getTime());
            
            // Metadata should be deeply equal
            expect(restored.metadata).toEqual(original.metadata || {});
          }
        }),
        { numRuns: 100 }
      );
    });

    it('handles empty arrays correctly', () => {
      const empty: StateTransition[] = [];
      const serialized = serializeHistory(empty);
      const deserialized = deserializeHistory(serialized);
      
      expect(deserialized).toEqual([]);
    });

    it('preserves metadata through serialization', () => {
      fc.assert(
        fc.property(
          fc.array(
            fc.record({
              from: prospectStatusArb,
              to: prospectStatusArb,
              timestamp: fc.date({ min: new Date('2020-01-01'), max: new Date('2030-12-31') }),
              stage: pipelineStageArb,
              tenantId: tenantIdArb,
              metadata: fc.dictionary(fc.string(), fc.oneof(
                fc.string(),
                fc.integer(),
                fc.boolean(),
                fc.constant(null)
              )),
            }),
            { minLength: 1, maxLength: 10 }
          ).filter((transitions) => transitions.every((t) => !isNaN(t.timestamp.getTime()))),
          (transitions) => {
            const serialized = serializeHistory(transitions);
            const deserialized = deserializeHistory(serialized);

            for (let i = 0; i < transitions.length; i++) {
              expect(deserialized[i].metadata).toEqual(transitions[i].metadata);
            }
          }
        ),
        { numRuns: 100 }
      );
    });

    it('throws on invalid JSON input', () => {
      expect(() => deserializeHistory('not valid json')).toThrow();
      expect(() => deserializeHistory('{}')).toThrow();
      expect(() => deserializeHistory('null')).toThrow();
    });
  });
});
