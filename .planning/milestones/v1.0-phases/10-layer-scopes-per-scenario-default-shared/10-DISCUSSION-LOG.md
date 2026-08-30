# Phase 10: Layer Scopes (per-Scenario default + `shared`) - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-08-30
**Phase:** 10-layer-scopes-per-scenario-default-shared
**Areas discussed:** Real-run verification gate, Rule + shared interaction test, Error-channel constraint scope, Docs/example depth

---

## Real-run verification gate

| Option | Description | Selected |
|--------|-------------|----------|
| New `verify-shared-layer-once.sh` script | Dedicated fixture Feature run through the real vitest CLI twice (whole suite, then `-t` filtered), asserting build count via captured output. Mirrors `verify-tags-filter.sh`. | |
| Extend `emission.test.ts` instead | Add a shared-Layer counter case to the existing in-process real end-to-end test suite. | |
| Both | `emission.test.ts` gets the in-process counter proof; a CLI-level script additionally proves the whole-vs-filtered identical-results claim (SC#3) that an in-process test can't fully demonstrate. | ✓ |

**User's choice:** Both.
**Notes:** The user chose the option explicitly framed as covering both the fast-feedback in-process case and SC#3's whole-vs-filtered claim, which only a real CLI `-t` invocation can actually demonstrate.

---

## Rule + shared interaction test

| Option | Description | Selected |
|--------|-------------|----------|
| Yes, add a dedicated test | A Feature with a shared Layer at the top level and a Rule whose extraLayer increments its own counter, asserting N Scenarios → N Rule-Layer builds while the shared Layer stays at 1. | ✓ |
| No, out of scope for this phase | Treat as adequately covered by ADR-EC-010's own tests (no shared Layer) plus this phase's shared-Layer tests (no Rule) separately. | |

**User's choice:** Yes, add a dedicated test.
**Notes:** Neither existing test suite exercises the Rule + shared combination together; both ADRs only describe it in prose.

---

## Error-channel constraint scope

| Option | Description | Selected |
|--------|-------------|----------|
| Shared only, as Pitfall 27 specifies | `perScenario` already fails safely through the Scenario's own error channel — no defect risk, no fix needed. Constraining it too would forbid a legitimate use case for no safety gain. | ✓ |
| Both shared and perScenario, for symmetry | Constrain both to `Layer<R, never, never>` so the two fields always look identical in the type signature. | |

**User's choice:** Shared only, as Pitfall 27 specifies.
**Notes:** Matches the research finding precisely — the defect only exists on the `shared` path via `@effect/vitest`'s internal `Effect.orDie`.

---

## Docs/example depth

| Option | Description | Selected |
|--------|-------------|----------|
| Status flip + one runnable example | Update status text in index.ts/README, remove spec/overview.md's hedge, and add one small worked example mirroring the acceptance test's own fixture. | ✓ |
| Status flip only | Just correct the "not built yet" / hedge language; rely on existing ADR-EC-006/018 worked examples in spec/. | |

**User's choice:** Status flip + one runnable example.
**Notes:** Example should mirror the acceptance test's fixture shape so it stays truthful rather than becoming a second, drifting description of the same behavior.

---

## Claude's Discretion

- Exact internal architecture for wiring the two runtime paths through
  `describeFeature.ts`'s composition root and `Runner.ts`/`TestApi.ts` — the
  seam already exists and is explicitly documented in-code as anticipating
  this phase; left to research/planning.
- Naming of the new verification script and its fixture Feature file,
  following the existing `scripts/verify-*.sh` convention.

## Deferred Ideas

None — discussion stayed entirely within the RUN-03/RUN-04 phase boundary.
No scope creep occurred.
