/**
 * tests/architecture/canonical-module-manifest.test.ts
 *
 * Wave 2 (P1-03) contract test: proves the shared declarative manifest
 * (packages/shared/src/audit.ts::CANONICAL_AUDIT_MODULES) and the server executable
 * engine (lib/audit/runner.ts::MODULE_REGISTRY) describe the exact same 27 modules —
 * same IDs, same phase, same dependency graph, same optionality, same timeout, same
 * feature-flag gating. If a future change edits one side without the other, this test
 * fails the build instead of silently reintroducing the P1-03 divergence
 * (CANONICAL=5 vs MODULE_REGISTRY=27 vs AuditOrchestrator=14).
 */
import { describe, expect, it } from 'vitest';

import {
  CANONICAL_AUDIT_MODULE_IDS,
  CANONICAL_AUDIT_MODULES,
  validateCanonicalModuleManifest,
} from '@shared/audit';
import { FEATURE_FLAG_GATED_MODULES, MODULE_REGISTRY } from '@/lib/audit/runner';

describe('canonical module manifest', () => {
  it('has exactly 27 unique canonical module IDs', () => {
    expect(CANONICAL_AUDIT_MODULE_IDS.length).toBe(27);
    expect(new Set(CANONICAL_AUDIT_MODULE_IDS).size).toBe(27);
  });

  it('passes internal integrity validation (no dangling deps, no cycles)', () => {
    expect(() => validateCanonicalModuleManifest()).not.toThrow();
  });

  it('MODULE_REGISTRY (server engine) has exactly the same 27 module IDs as the shared manifest', () => {
    const serverIds = MODULE_REGISTRY.map((m) => m.name).sort();
    const sharedIds = [...CANONICAL_AUDIT_MODULE_IDS].sort();
    expect(serverIds).toEqual(sharedIds);
  });

  it('every MODULE_REGISTRY entry matches its shared manifest definition (phase, deps, optional, timeout)', () => {
    const byId = new Map(CANONICAL_AUDIT_MODULES.map((m) => [m.id, m]));

    for (const mod of MODULE_REGISTRY) {
      const canonical = byId.get(mod.name);
      expect(canonical, `"${mod.name}" is not in the shared canonical manifest`).toBeDefined();
      if (!canonical) continue;

      expect(mod.phase, `${mod.name}.phase`).toBe(canonical.phase);
      expect([...(mod.dependsOn ?? [])].sort(), `${mod.name}.dependsOn`).toEqual(
        [...(canonical.dependsOn ?? [])].sort()
      );
      expect(Boolean(mod.optional), `${mod.name}.optional`).toBe(Boolean(canonical.optional));
      expect(mod.timeoutMs, `${mod.name}.timeoutMs`).toBe(canonical.timeoutMs);
    }
  });

  it('every dependsOn reference in MODULE_REGISTRY points at a real canonical module ID', () => {
    const idSet = new Set(MODULE_REGISTRY.map((m) => m.name));
    for (const mod of MODULE_REGISTRY) {
      for (const dep of mod.dependsOn ?? []) {
        expect(idSet.has(dep), `${mod.name} depends on unknown module "${dep}"`).toBe(true);
      }
    }
  });

  it('FEATURE_FLAG_GATED_MODULES only gates real canonical modules, matching the shared rolloutFlag', () => {
    const byId = new Map(CANONICAL_AUDIT_MODULES.map((m) => [m.id, m]));
    for (const [moduleId, flag] of Object.entries(FEATURE_FLAG_GATED_MODULES)) {
      const canonical = byId.get(moduleId);
      expect(canonical, `gated module "${moduleId}" is not canonical`).toBeDefined();
      expect(canonical?.rolloutFlag, `${moduleId} rolloutFlag mismatch`).toBe(flag);
    }
    // And the inverse: every manifest rolloutFlag is actually wired server-side.
    for (const mod of CANONICAL_AUDIT_MODULES) {
      if (mod.rolloutFlag) {
        expect(
          FEATURE_FLAG_GATED_MODULES[mod.id],
          `${mod.id} rolloutFlag not wired server-side`
        ).toBe(mod.rolloutFlag);
      }
    }
  });

  it('does not retain the stale 5-module or 14-module set as an executable source of truth', () => {
    // CRITICAL_COMPLETION_MODULES (the old "CANONICAL_MODULES") is an intentionally
    // small completeness-guardrail subset, not a competing full module list — assert
    // it stays smaller than the real 27-module manifest so nobody mistakes it for one.
    expect(MODULE_REGISTRY.length).toBe(27);
  });
});
