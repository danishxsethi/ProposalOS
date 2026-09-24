# Evidence & Finding Integrity

## Positive controls

- `createEvidence()` and the finding Zod contract reject placeholder pointers, missing provenance fields, and secret-like values.
- Finding writes are routed through `lib/audit/findingPersistence.ts` and architecture-tested.
- Audit and tenant identity are injected at persistence rather than trusted from module output.
- GBP ambiguity handling suppresses definitive business-negative findings.

## Trust failures

1. Evidence snapshots are arbitrary JSON in Prisma, without a runtime snapshot schema or raw-payload redaction invariant.
2. Snapshot writes are logged and ignored on failure; findings can persist without their durable snapshot.
3. Finding evidence shapes in crawler/content/citation/strategy modules are incompatible with the current contract and are silently rejected from customer output while module status may remain complete.
4. Partial findings are contract-eligible but discarded.
5. Citation provider outages can become `found: false` and negative directory findings.
6. PageSpeed fallback can use zero values and produce negative performance findings.
7. No complete real-provider/real-DB run proved observation -> snapshot -> finding -> proposal citation integrity.

**Primary state:** `WORKING_WITH_LIMITATIONS`.

**Required invariant:** a customer-facing negative claim must include a verified successful check state, timestamp, source, target pointer, raw value, normalized value, and immutable finding binding. `UNKNOWN` must not be rendered as failure.
