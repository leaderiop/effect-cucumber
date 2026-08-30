# Phase 6: Plan, Scenario-Effect, Runner Emission, and Drift Detection - Context

**Gathered:** 2026-08-29
**Status:** Ready for planning

<domain>
## Phase Boundary

The first cross-package integration point: a `ParsedFeature` (from
`@effect-cucumber/gherkin`) and a `FeatureCollection` (registered step tree,
from `@effect-cucumber/vitest`'s `describeFeature`) join into real vitest
tests. Concretely, per `ARCHITECTURE.md`'s Register→Plan→Emit pipeline:

- **Plan** — join `ParsedFeature`'s scenarios against the registered scope
  tree; resolve every Pickle step's text to a definition via `StepMatcher`
  (already built in Phase 3), producing a `ScenarioPlan[]`.
- **ScenarioEffect** — compose one `Effect.gen` per Scenario: Background
  steps first, then the Scenario's own steps, sequential `yield*`s,
  fail-fast (ADR-EC-004, INV-EC-001).
- **Runner** (`TestApi` seam) — the only module that imports `describe`/`it`;
  walks the plan and emits `describe(feature.name)` → (nested
  `describe(rule.name)` where applicable) → `it.effect(scenario.name, ...)`.
- **Drift detection** (MATCH-03/04/05, ADR-EC-019, BEH-EC-013) — an
  unmatched step fails its Scenario; an ambiguous step (2+ matching
  patterns) fails its Scenario naming every match; a registered pattern
  used by zero steps in the whole Feature is a Feature-level warning, not a
  failure.

Out of scope for this phase (owned by later phases per the roadmap):
hooks (`Before`/`After`/etc. — Phase 7), Rule-scoped extra Layers and
Scenario Outline typed examples as a DSL concern (Phase 8 — DSL-05/DSL-06;
note `describe(rule.name)` *nesting* itself is already locked in
`spec/glossary.md` and is this phase's job, only the extra-Layer semantics
are Phase 8's), tag routing / `@skip`/`@only` (Phase 9 — RUN-05), and the
`shared`-Layer "build once" + `TestClock` isolation optimization (Phase 10
— RUN-03/RUN-04). `FeatureCollection.layer` is already a single merged
Layer (Phase 5); this phase provides it fresh via `Effect.provide` for
every Scenario, uniformly, with no shared/per-Scenario distinction at
runtime yet — that distinction is Phase 10's entire reason to exist.

</domain>

<decisions>
## Implementation Decisions

### Unmatched/ambiguous step error richness
- **D-01:** Beyond BEH-EC-013's literal requirement (step text + source
  location +, for ambiguous, every matching pattern), the undefined-step
  error also carries an auto-generated suggested step-definition snippet
  (e.g. `Given("...", function*() {...})`), generated via
  `CucumberExpressionGenerator` from `@cucumber/cucumber-expressions`
  (already an installed dependency — no new package). This mirrors
  cucumber-js's own DX pattern (`.planning/research/PITFALLS.md` Pitfall
  15) and was chosen over the bare-minimum option specifically for the
  extra authoring help, at acceptably low extra cost since the generator
  ships in a dependency already in the tree.

### Unused-pattern (MATCH-05) warning delivery — chosen: most complete, not simplest
- **D-02:** The user explicitly asked for the richest option, not the
  cheapest. An unused registered pattern surfaces through **all** of the
  following, not just one:
  1. **`console.warn`** at `describeFeature` collection time, naming the
     unused pattern, its keyword, and the Feature it was registered in —
     visible in raw terminal/CI logs.
  2. **A synthetic, non-failing vitest test node** nested in the emitted
     `describe(feature.name)` block (e.g.
     `it.effect('⚠ unused step definition: "..."', ...)` that always
     passes) — visible directly in the vitest reporter/UI/watch mode, not
     just scrollback.
  3. **Structured, programmatically-inspectable data** — attach the list of
     unused-pattern warnings to `FeatureCollection` (or the `Plan` result),
     following the precedent `ParsedFeature.warnings` set in Phase 2, so a
     test or downstream tool can assert on it directly instead of scraping
     console output or parsing a synthetic test's title.
  All three surfaces report the same underlying warning list — one
  computation, three presentations. Exact type/field naming is the
  planner's call; it should follow the `LoadFeatureWarning` naming
  precedent from Phase 2 for consistency, but this is a genuinely NEW
  warning channel (computed at Plan stage in `@effect-cucumber/vitest`),
  not a reuse of `ParsedFeature.warnings` (which is a gherkin-package,
  parse-time-only channel).

### Ambiguous-match ordering (success criterion 4: deterministic, order-independent of registration)
- **D-03:** The ambiguous-step error's list of matching patterns is ordered
  by **source location (file:line)** of each pattern's registration site,
  not alphabetically by pattern text and not by registration order. This
  needs each `StepDefinition` (or the `Plan` stage's resolved match) to
  carry a definition-site location — if `Registry.ts`'s `StepDefinition`
  doesn't already capture one, this phase adds it (likely via
  `Error().stack` parsing or a call-site capture at `Given`/`When`/`Then`
  call time, since nothing currently threads a source location through the
  DSL layer). Confirm feasibility during research/planning before locking
  the exact capture mechanism.

### Claude's Discretion
- The exact shape/name of the new drift-detection error class(es) in
  `@effect-cucumber/vitest` (the reserved name `StepMatchError` from the
  03-01 decision applies here — see canonical refs). Whether undefined and
  ambiguous are one class with a reason discriminant or two classes is an
  implementation detail, not re-litigated here.
- Whether Plan-stage resolution runs once per Feature (computing every
  Scenario's plan up front, per Pattern 2 in ARCHITECTURE.md) or is
  otherwise structured internally — follow ARCHITECTURE.md's Register→Plan→Emit
  pipeline as already designed by research.
- The internal mechanism for capturing a step definition's source location
  for D-03 (stack-trace parsing vs. another approach) — pick whichever is
  reliable and cheaply testable.
- Exact naming/field shape for the new unused-pattern warning type on
  `FeatureCollection`/`Plan`'s output (D-02) — follow the
  `LoadFeatureWarning` precedent for consistency but do not literally reuse
  that type.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Core architecture for this phase (already designed by research — do not re-derive)
- `.planning/research/ARCHITECTURE.md` — the Register→Plan→Emit pipeline,
  component responsibility table (`Plan`, `ScenarioEffect`, `Runner`,
  `TestApi`), Pattern 2 (registration/planning/emission passes), Pattern 3
  (the `TestApi` seam over `@effect/vitest`, including the verified
  `layer(...)` callback-`it`-object gotcha), Pattern 4 (Layer provision
  differs shared vs. non-shared — Phase 10's concern, not this phase's),
  Pattern 5 (step-definition scope chain resolution: Scenario → enclosing
  Rule → Feature, first match wins), recommended project structure
  (`Plan.ts`, `ScenarioEffect.ts`, `TestApi.ts`, `Runner.ts`).
- `.planning/research/SUMMARY.md` — Phase 6 (research's "P6" /
  this roadmap's Phase 6) delivery summary: `Layers`, `ScenarioEffect`,
  `TestApi` seam, `Runner`; explicitly the phase that implements Gap 1
  (drift detection).
- `.planning/research/PITFALLS.md` Pitfall 15 — step ambiguity is entirely
  this library's problem (`cucumber-expressions` never detects it),
  first-match-wins is silently wrong, the suggested-snippet DX pattern
  (source for D-01), and the cucumber-js skip-ordering bug fix (PR #2836 —
  check `@skip` before resolving step definitions; directly relevant once
  Phase 9 tags exist, noted here so Plan's resolution order doesn't need
  revisiting later).

### Decisions / behaviors this phase implements
- `spec/decisions/019-fail-loudly-on-unmatched-or-ambiguous-steps.md`
  (ADR-EC-019) — the normative decision: fail the containing Scenario
  (not the whole file) on unmatched/ambiguous; unused pattern is a
  Feature-level warning.
- `spec/behaviors/01-steps-and-world.md` §BEH-EC-013 — the literal MUST
  requirements this phase is graded against (success criteria 3-5 map
  directly).
- `spec/decisions/004-one-it-effect-per-scenario.md` (ADR-EC-004) — one
  `it.effect` per Scenario, Background inlined as leading `yield*`s, not a
  vitest hook (success criteria 1-2).
- `spec/decisions/017-background-and-scenario-are-step-definition-containers.md`
  (ADR-EC-017) — Background's literal Gherkin text is matched against a
  registered `{ Given, And }` pattern exactly like any other step; this is
  the "literal-text-matching half" of DSL-04 this phase completes (per
  PROJECT.md's Validated section).
- `spec/glossary.md` — `describe(feature.name)` / nested
  `describe(rule.name)` test-structure convention (already locked, not
  re-opened here).

### Requirements
- `.planning/REQUIREMENTS.md` — RUN-01, MATCH-03, MATCH-04, MATCH-05 (this
  phase's requirement IDs).

### Existing code this phase joins
- `packages/vitest/src/describeFeature.ts` — `collectFeature`/`FeatureCollection`
  is this phase's literal join point (see its own doc comment: "Phase 6's
  join point — RUN-01 reads a `FeatureCollection` and emits one `it.effect`
  per Pickle through the TestApi seam").
- `packages/vitest/src/Registry.ts` — `StepDefinition<Fn>`'s `scope` field
  (`RegistryScope`) is what Plan's scope-chain resolution (Pattern 5) walks.
- `packages/gherkin/src/StepMatcher.ts` — `match()` already returns every
  matching entry in registration order (03-04 decision) and is Plan's
  matching primitive; do not add sorting/dedup there — MATCH-03/04's
  interpretation (including D-03's ordering) is this phase's job, over
  `StepMatcher`'s output, per the 03-04 decision note.
- `packages/gherkin/src/Model.ts` — `ParsedFeature.allScenarios` is what
  `Validate.ts` (and now Plan) iterates; `ParsedStep.origin` distinguishes
  `feature-background` / `rule-background` / `scenario`; `ParsedScenario.astName`
  is required for matching a Scenario to its registered definition (the
  un-interpolated name, not the interpolated Pickle name).

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `packages/vitest/src/describeFeature.ts`'s `collect()` internal function
  and `FeatureCollection` type — already produce exactly the
  `{ feature, layer, definitions }` triple this phase's `Plan` stage
  consumes. No changes needed to produce it; `describeFeature`'s body
  currently discards it on purpose (see its own comment marking this as
  the Phase 6 handoff).
- `packages/gherkin/src/StepMatcher.ts`'s `createStepMatcher` +
  `(registry, pattern)`-keyed memoized compilation — reuse directly; Plan
  calls `match(text)` per Pickle step against the Feature's
  `parameterTypes` registry.
- `packages/vitest/src/Registry.ts`'s `RegistryScope`/`StepDefinition` —
  the scope-tagged step list Plan resolves against.

### Established Patterns
- `.planning/research/ARCHITECTURE.md`'s Pattern 6 (`Effect.fn`
  normalization) is already implemented in `packages/vitest/src/Step.ts` —
  no new work, just consumed.
- Every existing error type in this codebase (`LoadFeatureError`,
  `StepPatternError`, `DataTableError`) is a named class carrying full,
  untruncated content and a discriminated `reason` tag — the new
  drift-detection error should follow the same shape for consistency.
- Mutation-testing discipline is load-bearing throughout this repo (see
  STATE.md's accumulated decisions) — any acceptance criterion this phase
  writes (e.g., "ambiguous list order doesn't depend on registration
  order") should be mutation-proven, not just asserted once.

### Integration Points
- `packages/vitest/src/index.ts` is the public barrel; `describeFeature`
  itself is already exported, `collectFeature` deliberately is not (stays
  internal). This phase's new `Plan`/`ScenarioEffect`/`Runner`/`TestApi`
  modules are internal implementation, reached only from
  `describeFeature.ts`'s composition root — same "not in the barrel"
  precedent `Registry.ts` and `collectFeature` already set.

</code_context>

<specifics>
## Specific Ideas

- The unused-pattern warning must be genuinely visible in three different
  places at once (terminal, vitest reporter, and structured/inspectable
  data) — the user was explicit that "most complete, feature rich" was
  preferred over the cheapest single-channel option.
- The undefined-step error should feel like cucumber-js's own DX: not just
  "this step is unmatched" but a copy-pasteable suggested step definition.
- Ambiguous-match error ordering must point a reader at "where to go fix
  it" — hence file:line ordering was chosen over alphabetical-by-pattern.

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope. No todos matched this phase
(`todo.match-phase` returned zero matches).

</deferred>

---

*Phase: 06-plan-scenario-effect-runner-emission-and-drift-detection*
*Context gathered: 2026-08-29*
