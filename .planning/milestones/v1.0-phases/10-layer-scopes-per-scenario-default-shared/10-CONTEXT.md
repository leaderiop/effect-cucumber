# Phase 10: Layer Scopes (per-Scenario default + `shared`) - Context

**Gathered:** 2026-08-30
**Status:** Ready for planning

<domain>
## Phase Boundary

Make both Layer scopes actually behave as `spec/` already specifies them: the
default per-Scenario scope stays fresh every Scenario (already true today —
`describeFeature`'s public API and type surface for this were built in prior
phases), and the opt-in `shared` scope — currently accepted, type-checked,
and silently rebuilt per Scenario at runtime — is made to build exactly once
per Feature via `@effect/vitest`'s `layer(...)`, with per-Scenario
`TestClock`/`TestConsole` isolation preserved via `excludeTestServices: true`
plus an explicit per-Scenario `TestEnv` provide (ADR-EC-018). No new public
API — `describeFeature(feature, { shared, perScenario }, define)`'s shape is
already published; this phase is an internal runtime fix plus the type-level
hardening Pitfall 27 identifies for a failable `shared` Layer.

</domain>

<decisions>
## Implementation Decisions

### Real-run verification gate (RUN-03 SC#2's "built exactly once" claim)
- **D-01:** Add an in-process counter-based case to `emission.test.ts` (real
  `describeFeature` run, no CLI subprocess) proving a Layer that increments a
  module-level counter is built once for N Scenarios under `shared`, vs. N
  times under the default per-Scenario scope. Fast feedback, runs in the
  normal `pnpm test` suite.
- **D-02:** ALSO add a dedicated `scripts/verify-shared-layer-once.sh`
  script, mirroring `scripts/verify-tags-filter.sh`'s pattern (Phase 9): runs
  the real `vitest` CLI against a committed fixture Feature, once for the
  whole suite and once with a `-t` filter to a single Scenario, and asserts
  the shared Layer's build count is identical in both runs. This is what
  actually proves Success Criterion 3's "the Feature yields identical
  results run whole vs. filtered to a single Scenario" — an in-process test
  can't demonstrate real `-t` filtering the way a real CLI invocation can.
  Both checks are wanted, not one instead of the other.

### Rule + shared interaction (untested combination of ADR-EC-006 + ADR-EC-010)
- **D-03:** Add a dedicated regression test: a Feature with a `shared` Layer
  at the top level and a `Rule` whose own `extraLayer` (ADR-EC-010) increments
  its own counter. Assert N Scenarios inside the Rule → N builds of the
  Rule's Layer, while the Feature's `shared` Layer stays at exactly 1 build
  across the whole run. Neither ADR-EC-010's own Rule-isolation tests nor
  this phase's shared-Layer tests exercise this combination alone, and both
  ADRs describe it only in prose.

### Error-channel constraint scope (Pitfall 27 hardening, RUN-03 SC#4)
- **D-04:** Constrain `shared` ONLY to `Layer<R, never, never>` — not
  `perScenario`. Reasoning: `shared`'s specific defect risk is
  `@effect/vitest`'s `layer()` internally doing
  `Layer.buildWithMemoMap(...).pipe(Effect.orDie, ...)`, which converts a
  typed shared-Layer failure into an unrecoverable defect reported out of
  `beforeAll`, detached from any Scenario. `perScenario` has no analogous
  risk — it's provided inside each Scenario's own Effect, so a typed error
  there already surfaces safely through `it.effect`'s `unknown` error
  channel as that Scenario's own failure. Constraining `perScenario` too
  would forbid a legitimate use case (a Layer meant to fail a Scenario) for
  no safety gain. This must be a type-level constraint (an overload/generic
  bound), testable in a `.types.ts` file per this repo's established
  pattern (`packages/gherkin/test/StepArgs.types.ts` precedent) — not a
  runtime check.

### Docs/example depth
- **D-05:** Beyond flipping the "not built yet" status language (in
  `packages/vitest/src/index.ts`'s doc comment and the package README) and
  removing `spec/overview.md`'s unstated-exception hedge on the TestClock
  guarantee, add ONE small runnable worked example to the README: a fake
  counter-based "expensive resource" Layer used with the `{ shared,
  perScenario }` call form. It should mirror the acceptance test's own
  fixture shape so the example stays truthful against what's actually
  tested, rather than being a second, drifting description of the same
  behavior.

### Claude's Discretion
- Exact internal architecture for wiring the two runtime paths (how
  `describeFeature.ts`'s composition root and `Runner.ts`/`TestApi.ts`
  route emission through `layer(sharedLayer, { excludeTestServices: true
  })(...)`'s callback vs. the module-level `it`/`describe` pair) is
  implementation detail for research/planning — the seam already exists
  (`TestApi.ts` note (a), `describeFeature.ts` note (e) both explicitly
  anticipate this as "Phase 10's entire reason to exist") and this
  discussion didn't need to prescribe it further.
- Naming of the new script (`verify-shared-layer-once.sh`) and its fixture
  Feature file are Claude's call, following the naming convention of
  `scripts/verify-tags-filter.sh` / `scripts/verify-tsgo-gate.sh`.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Layer scope design (this phase's core spec)
- `spec/decisions/006-two-layer-scopes-only.md` (ADR-EC-006) — the two-scope
  design, `Layer.merge(shared, perScenario)`'s collision rule, why there's
  no third "shared within a Rule" scope
- `spec/decisions/018-shared-layer-testclock-isolation.md` (ADR-EC-018) —
  the `excludeTestServices: true` + explicit per-Scenario `TestEnv` fix;
  status Accepted, already chosen over a documented carve-out
- `spec/decisions/010-rule-and-scenario-scoped-extra-layers.md` (ADR-EC-010)
  — a Rule's own per-Scenario `extraLayer`, `Layer.provideMerge` composition
  order, and the explicit statement that promoting to `shared` is the only
  way to get a Rule-wide scope
- `spec/behaviors/03-rules-outlines-and-testclock.md` (BEH-EC-012) — the
  TestClock-composes-transparently behavior this phase makes fully true

### Research already done for this phase (Research flag: Skip — already verified)
- `.planning/research/PITFALLS.md` Pitfall 27 (lines ~768-786) — the
  `shared` Layer typed-error-becomes-defect finding and the recommended
  type-level fix
- `.planning/research/ARCHITECTURE.md` Pattern 3 ("The `TestApi` seam over
  `@effect/vitest`", ~line 203) and Pattern 4 ("Layer provision differs
  between the shared and non-shared paths", ~line 224) — the architectural
  approach for routing emission through the correct `it`
- `.planning/research/ARCHITECTURE.md` Anti-Pattern 3 (~line 468) — the
  verified failure mode (module-level `it` inside `layer(...)`'s callback
  silently rebuilds the shared resource per Scenario) that the `TestApi`
  seam exists to make structurally unreachable
- `.planning/research/PITFALLS.md` Pitfall 29 — `layer(...)`'s callback
  lacks `it.live`; the `shared` and per-Scenario paths don't have identical
  capability surfaces (worth noting in docs, not a blocker)

### Established codebase seams this phase wires up (not designs from scratch)
- `packages/vitest/src/TestApi.ts` note (a) and note (d) — the seam
  `Runner.ts` reaches the test framework through; explicitly built to accept
  either the module-level `it`/`describe` pair or the `it` a `layer(...)`
  callback hands back
- `packages/vitest/src/describeFeature.ts` note (e) — states plainly:
  "The seam is a PARAMETER rather than an import because Phase 10 ... will
  pass a DIFFERENT `TestApi` through it"
- `packages/vitest/src/ScenarioEffect.ts` note (b) — states plainly this
  phase provides "the Feature's single merged Layer uniformly, with no
  shared/per-Scenario distinction at runtime" today, and that ADR-EC-018's
  shared path "is Phase 10's entire reason to exist"
- `scripts/verify-tags-filter.sh` (Phase 9) — the real-CLI-run verification
  pattern D-02 above extends into this phase

### Prior decisions this phase must not re-litigate
- `.planning/PROJECT.md` Key Decisions table — "Adopt the `excludeTestServices`
  shared-Layer TestClock fix (ADR-EC-018) rather than a documented carve-out"
  is marked "— Pending" only because Phase 10 hasn't shipped it yet; the
  *decision* itself is already Accepted, not open for reconsideration.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `packages/vitest/src/describeFeature.ts`'s `LayerArgument` type and
  `normalizeLayer` — already discriminate plain-Layer vs. `{ shared,
  perScenario }` calls; `normalizeLayer` currently collapses both into one
  merged Layer via `Layer.merge`, which is exactly the "both built per
  Scenario" behavior this phase must stop doing for the `shared` half.
- `packages/vitest/src/TestApi.ts`'s `TestApi` interface (`describe` +
  `effect`, two members only) — already the injection seam; this phase
  supplies a second concrete implementation (the `layer(...)`-provided
  `it`) alongside the existing `vitestTestApi` factory in
  `describeFeature.ts`.
- `packages/vitest/src/Runner.ts`'s `emitFeature` — already receives `api:
  TestApi` as a parameter; no signature change needed there in principle,
  though how the shared-Layer's own `describe`-opening behavior nests with
  `Runner.ts`'s existing `describe(feature.name, ...)` / per-Rule
  `describe(rule.name, ...)` calls is an open implementation question for
  research (per Claude's Discretion above — `layer(...)`'s callback type
  `Vitest.MethodsNonLive<R>` per ARCHITECTURE.md Pattern 3 has no `describe`
  member, so Rule nesting under a shared Feature needs resolving).

### Established Patterns
- Every prior "prove a structural claim with a real run, not a fake"
  precedent: `scripts/verify-tsgo-gate.sh` (Phase 1, satisfied/starved
  fixture pair), `scripts/verify-testapi-seam.sh` (Phase 9, structural grep
  enforcing the seam), `scripts/verify-tags-filter.sh` (Phase 9, real
  vitest CLI run). D-02 above extends this lineage.
- Type-level claims live in a `.types.ts` file compiled by `pnpm
  typecheck:test` and never collected by vitest (e.g.
  `packages/gherkin/test/StepArgs.types.ts`). D-04's `shared: Layer<R,
  never, never>` constraint should get its own `.types.ts` case following
  this precedent.
- Mutation-testing every new gate/assertion before considering it done —
  established since Phase 1 and repeated every phase since (03-01 through
  09's gates all carry a mutation-proof note in STATE.md).

### Integration Points
- `describeFeature.ts`'s `collect()` function and its `normalizeLayer` call
  is the join point that currently erases the shared/per-Scenario
  distinction — this is where the "is this actually a shared call" branch
  needs to happen, feeding two different downstream paths into
  `emitFeature`.
- `FeatureCollection.layer` (currently one merged `Layer.Layer<any, any,
  never>`) likely needs to become two fields, or the collection needs to
  carry enough information for `describeFeature`'s own body (not `collect`,
  which `collectFeature` also shares) to choose which `TestApi` and which
  provision strategy (ARCHITECTURE.md Pattern 4) to use — left to
  research/planning to resolve concretely.

</code_context>

<specifics>
## Specific Ideas

No specific UI/behavior references beyond what's already locked in the ADRs
above — this is a backend/runtime-correctness phase with a fully specified
target behavior. The user's specific asks were all about proof rigor (real
CLI runs, not just fakes) and test coverage completeness (Rule × shared),
matching this project's established "verify by running it" culture rather
than new design preferences.

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope. No scope creep occurred; all
four discussed areas were implementation-rigor and test-coverage questions
within RUN-03/RUN-04's existing boundary.

</deferred>

---

*Phase: 10-layer-scopes-per-scenario-default-shared*
*Context gathered: 2026-08-30*
