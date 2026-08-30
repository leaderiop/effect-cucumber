# Phase 5: `describeFeature` Type Surface - Context

**Gathered:** 2026-08-29
**Status:** Ready for planning

<domain>
## Phase Boundary

The compile-time enforcement DSL surface of `@effect-cucumber/vitest`:
`describeFeature`'s type signature, the `Given`/`When`/`Then`/`And`/`But`
step-registration functions, `World` as a typed `Context.Service`, and the
`@ts-expect-error`-based type-test proof (checked under `tsc --noEmit` in
CI) that a step requiring an unprovided service does not compile. No runner
implementation, no vitest test emission — this phase is the type surface and
its compile-time proof, not the runtime (Phase 6).

</domain>

<decisions>
## Implementation Decisions

### Type-test file organization
- **D-01:** Phase 5's DSL-01 negative-compile proof extends the existing
  `packages/vitest/test/tsgo-gate/` directory (built in Phase 1 to prove
  ADR-EC-016's generic tsgo gate) rather than a new, separate location — new
  fixture file(s) + new isolated `tsconfig.*.json` variant(s), following the
  exact pattern already established by `satisfied.ts`/`tsconfig.ok.json` and
  `missing-layer-context.ts`/`tsconfig.json`: one file per case, `include: []`
  + `files: [single-file]`, `composite: false`, excluded from `tsc -b` and
  from the root `tsconfig.json` references array. New fixtures test
  `describeFeature`'s own DSL surface (a step needing a service the Layer
  argument doesn't provide), not a bare `Layer.merge` misuse like the
  existing fixtures.
- **D-02:** The positive case (success criterion 2 — a step using
  `Effect.acquireRelease`, which puts `Scope` in `ROut`, must still compile
  against a plain Layer) lives in the same `tsgo-gate/` directory alongside
  the new negative fixture — one more `tsconfig.*.json` + one more `src/*.ts`
  file, same pattern as the existing positive control.
- **CI wiring:** `scripts/verify-tsgo-gate.sh` gets new assertions for the
  new fixtures (or a sibling script following its exact assertion style —
  positive control compiles clean, negative fixture fails with the specific
  named diagnostic) — implementation detail for the planner/executor, not
  re-litigated here.

### shared/perScenario Layer legality
- **D-03:** `describeFeature`'s object-form Layer argument
  (`{ shared, perScenario }`, per ADR-EC-006) requires `perScenario` even
  when a Feature has no per-Scenario-fresh state — callers write
  `perScenario: Layer.empty` rather than omitting the key. One uniform
  object shape; no "was this key supplied" branching in the type or the DSL
  internals.
- **D-04:** `shared` and `perScenario` MAY name the same service.
  `perScenario` wins for a step that depends on it — this is not special-case
  code, it falls out of using `Layer.provideMerge(perScenario, shared)`'s
  (or equivalent) normal last-write-wins semantics as-is.

### Step failure trace richness
- **D-05:** DSL-02's `Effect.fn(stepText)` auto-wrap carries only the bare
  step text into the span for this phase — matches the roadmap's literal
  wording ("the step text is observable in a failure's span/trace"). Do NOT
  add span attributes for the step's resolved `{int}`/`{string}` argument
  values in this phase; that's a separate, later decision if wanted, not
  smuggled into DSL-02's scope here.

### Claude's Discretion
- The exact type-level mechanism for deriving `FeatureDsl<R>` from the
  `layer: Layer<R,E,never> | { shared, perScenario }` union argument
  (a single conditional/distributive type vs. two function overloads) —
  affects inference quality and error-message readability, not observable
  behavior. Choose whichever produces the clearest `tsc` error on the
  negative fixture.
- Where exactly `Scope.Scope` enters the type (on the per-step function type,
  on `FeatureDsl`, or both) — `.planning/research/PITFALLS.md` Pitfall 4/5
  flag this as the highest-risk decision; get it right by testing against
  the D-01/D-02 fixtures directly, not by asking the user to pick.
- The exact generator type used internally (hand-rolled
  `Generator<Effect<any,E,R>,A,any>` vs. `Effect.gen.Return`/
  `Effect.fn.Return`) — pure implementation detail.
- File/script naming for the new tsgo-gate fixtures and the CI script
  extension (D-01's "implementation detail" note above).

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Core type-surface decisions
- `spec/decisions/001-a-step-is-an-effect-returning-function.md` — step shape `(...params) => Effect<A,E,R>`
- `spec/decisions/002-world-is-a-typed-context-service.md` — World as `Context.Service`, no other lifecycle mechanism
- `spec/decisions/003-describefeature-takes-a-layer.md` — the core `describeFeature`-takes-a-Layer contract (ADR-EC-003)
- `spec/decisions/005-hooks-and-steps-auto-wrap-with-effect-fn.md` — `Effect.fn(stepText)` auto-wrap, bare-generator-or-already-wrapped acceptance
- `spec/decisions/006-two-layer-scopes-only.md` — `{ shared, perScenario }` object shape, "merged with shared" semantics (source for D-03/D-04)
- `spec/decisions/016-effect-tsgo-diagnostics-are-a-build-gate.md` — ADR-EC-016, `missingLayerContext`/`missingEffectContext` as the exact diagnostics DSL-01 proves against
- `spec/decisions/017-background-and-scenario-are-step-definition-containers.md` — `Background`/`Scenario` dsl shapes (`{ Given, And }` / `{ Given, When, Then, And, But }`), spec amendment already applied
- `spec/decisions/018-shared-layer-testclock-isolation.md` — runtime-side `shared`-Layer TestClock isolation (Phase 6/10 concern; Phase 5 only needs the type shape to admit it)

### Behavior specs (worked examples / literal signatures)
- `spec/behaviors/01-steps-and-world.md` — BEH-EC-002, `describeFeature`'s literal signature block (`(feature, layer, define)`)
- `spec/behaviors/03-rules-outlines-and-testclock.md` — corrected worked example post-ADR-EC-017, `Scenario`'s `(dsl) => void` form, BEH-EC-012's TestClock guarantee

### Requirements
- `.planning/REQUIREMENTS.md` — DSL-01 through DSL-04 (this phase's requirement IDs)

### Existing precedent this phase extends
- `packages/vitest/test/tsgo-gate/` — the isolated-tsconfig-per-case pattern (D-01)
- `scripts/verify-tsgo-gate.sh` — the assertion style Phase 5's new gate assertions should mirror
- `.planning/research/PITFALLS.md` — Pitfall 3 (vacuous generic `R` constraint), Pitfall 4/5 (`Scope.Scope` in `ROut`)

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `packages/vitest/test/tsgo-gate/tsconfig.json`, `tsconfig.ok.json`, `tsconfig.floating.json`, `src/satisfied.ts`, `src/missing-layer-context.ts`, `src/floating-effect.ts` — the exact template Phase 5's new fixtures copy (one file per case, isolated tsconfig, `composite: false`).
- `packages/gherkin/src/*` — `ParsedFeature`'s types are the only Phase-2 output Phase 5 needs; no runtime dependency on the parsing pipeline.
- `packages/vitest/package.json` already declares `@effect-cucumber/gherkin` as a workspace dependency and `effect`/`@effect/vitest`/`vitest` as peer+dev dependencies — no manifest changes needed for this phase.

### Established Patterns
- `scripts/verify-tsgo-gate.sh`'s four-assertion structure (positive control compiles clean → floating-effect is valid TS → an Effect diagnostic alone fails the build → the specific named diagnostic fires) is the template for whatever new assertions this phase's gate script adds.
- `Context.Service<Self, Shape>()(tag)` (used throughout `packages/gherkin/src`) is the established `Context.Service` construction pattern `World` should follow (ADR-EC-002).

### Integration Points
- `packages/vitest/src/index.ts` is currently a placeholder — this phase's `describeFeature`/`Given`/`When`/`Then`/`World` exports land here (or in new files re-exported from here).
- `packages/vitest/tsconfig.json` already has `references: [{ path: "../gherkin" }]` wired — `ParsedFeature`'s types are reachable with no new wiring.

</code_context>

<specifics>
## Specific Ideas

No specific product/behavior references beyond the type-test file placement
decision above — this is a type-system-design phase, and the roadmap's own
5 success criteria are already the concrete specifics. The guiding principle
throughout discussion: extend Phase 1's proven `tsgo-gate/` pattern rather
than inventing a parallel one, consistent with this project's stated
practice of reusing established conventions.

</specifics>

<deferred>
## Deferred Ideas

- Span attributes carrying a step's resolved `{int}`/`{string}` argument
  values (richer failure traces) — explicitly deferred from D-05; revisit as
  its own decision if wanted later, not in Phase 5's DSL-02 scope.
- "Shared within a Rule but not the whole Feature" as a third Layer scope —
  already ruled out by ADR-EC-006, not re-opened here.

[No todos matched this phase's scope — `todo.match-phase` returned zero
matches.]

</deferred>

---

*Phase: 05-describefeature-type-surface*
*Context gathered: 2026-08-29*
