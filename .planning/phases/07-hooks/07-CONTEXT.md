# Phase 7: Hooks - Context

**Gathered:** 2026-08-29
**Status:** Ready for planning

<domain>
## Phase Boundary

All six hooks — `Before`, `After`, `BeforeStep`, `AfterStep`,
`BeforeAllScenarios`, `AfterAllScenarios` — become Effects with a defined
execution order, registered through the Feature-level DSL (never a module
global, per DSL-04). `After` (and, per this discussion, `AfterStep` and
`AfterAllScenarios`) run whether the thing they guard succeeded or failed,
via `Effect.ensuring`. An append-only `Ref` log must assert the full
ordering across a two-Scenario Feature:
`BeforeAllScenarios → (Before → BeforeStep/AfterStep per step → After) per Scenario → AfterAllScenarios`.

**Already dictated by architecture — not re-opened here:**
- Hooks attach via the Feature-level `FeatureDsl` (the same object
  `Given`/`When`/`Then` live on), not a module-level registry — DSL-04's
  prohibition on mutable module state applies identically to hooks.
- `BeforeStep`/`AfterStep` wrap every step in `ScenarioEffect.ts`'s step
  list uniformly, Background steps included — ADR-EC-004 already treats
  Background as "inlined leading `yield*`s", never a special case.
- Hooks are Feature-scoped only. There is no Rule-scoped hook narrowing in
  this roadmap (Phase 8's Rule work is about extra Layers, not hooks) —
  out of scope for the whole milestone, not just this phase.
- `Before`/`After`/`BeforeStep`/`AfterStep` bodies accept a bare generator
  function, auto-wrapped with `Effect.fn("Before")` etc. (the hook's own
  name, since a hook has no per-call step text) — ADR-EC-005.

Out of scope for this phase (owned by later phases per the roadmap): Rule
extra Layers and Outline typed examples (Phase 8), tag routing (Phase 9),
`shared`-Layer build-once semantics (Phase 10).

</domain>

<decisions>
## Implementation Decisions

### Multiple hooks of the same type
- **D-01:** A Feature may register more than one hook of the same type
  (e.g. two `Before` hooks) — they run in registration order. This is a
  deliberate DX choice matching Cucumber's own convention, not a
  restriction to "one hook per type."
- **D-02:** Multiple `Before` hooks and multiple `After` hooks are each
  **independent** — if one throws, the rest of that batch still runs
  (they are not fail-fast against each other). This is symmetric between
  `Before` and `After`, per explicit user direction ("we don't need the
  simplest, we need the most feature-rich solution").
- **D-03:** When more than one hook in an independent batch fails, their
  errors are **combined into a single reported failure** — never
  first-wins, never silently dropped to a `console.warn`. This mirrors
  Phase 6's D-02 precedent ("most complete, not simplest").
- **D-04:** Despite Before hooks being independent-and-collecting, the
  Scenario's steps only run if **every** `Before` hook succeeded. Setup
  failing is not "steps run anyway" — only the *reporting* of multiple
  Before failures is rich, not the gating behavior.

### AfterStep failure guarantee
- **D-05:** `AfterStep` is guaranteed via `Effect.ensuring`, symmetric with
  `After` — it runs even when the step it follows fails. This is the
  decision that enables the standard "capture a screenshot / dump state
  the instant a step fails" pattern; without it, `AfterStep` would be
  nearly useless for diagnostics.
- **D-06:** If a step fails AND its guaranteed `AfterStep` also fails, both
  errors are combined into the one reported failure (same combine-don't-
  mask pattern as D-03), and the Scenario still stops advancing — no later
  `BeforeStep`/step runs.
- **D-07 (Claude's discretion, resolved):** `AfterStep`'s guarantee covers
  the whole unit — if `BeforeStep` itself fails (before the step body even
  runs), the paired `AfterStep` still runs. Resolved this way for
  consistency with the "guarantee wraps the whole unit, not just the
  narrowest possible span" pattern already locked by D-05/D-06.

### All-scenarios hook failure semantics
- **D-08 (Claude's discretion, resolved):** If `BeforeAllScenarios` throws,
  **every Scenario in the Feature reports that same failure individually**
  (not one Feature-level failure with zero Scenario nodes). Resolved this
  way for two reasons: it's the richest/most-visible option (consistent
  with every other richness call in this discussion), and it's the
  mechanically natural fit given `TestApi`'s `describe`/`effect`-only
  surface — `BeforeAllScenarios` is computed once and shared (e.g. via a
  `Deferred`) across every Scenario's Effect, so a failure there
  necessarily surfaces wherever a Scenario awaits it.
- **D-09 (Claude's discretion, resolved):** `AfterAllScenarios` is
  guaranteed to run **always** — even if `BeforeAllScenarios` failed, and
  even if one or more Scenarios failed. Resolved for consistency with the
  guarantee pattern locked at every other level of this phase (`After`,
  `AfterStep`).

### Claude's Discretion
- The exact mechanism for computing `BeforeAllScenarios`/`AfterAllScenarios`
  exactly once and sharing the result/failure across every Scenario's
  Effect (a `Deferred`, `Effect.once`/memoization, or something else) —
  research/planning's call, given `TestApi` currently exposes only
  `describe`/`effect` and no native `beforeAll`/`afterAll`. Whether
  `TestApi` itself needs a new member for this, or whether it's achievable
  purely through Effect composition inside `ScenarioEffect.ts`/`Runner.ts`,
  is open.
- How multiple hook errors are actually combined at the `Cause` level
  (`Cause.sequential`, an aggregate error type, etc.) — pick whichever is
  most Effect-idiomatic; the requirement is only that nothing is dropped.
- Whether `BeforeAllScenarios`/`AfterAllScenarios` themselves can be
  registered more than once (D-01's "multiple hooks, registration order"
  reasoning presumably extends here too, but this wasn't asked explicitly
  — treat it as the same rule unless a mechanical reason argues otherwise).

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Requirements this phase implements
- `.planning/REQUIREMENTS.md` — DSL-07, RUN-02 (this phase's requirement IDs).
- `.planning/ROADMAP.md` §"Phase 7: Hooks" — goal, success criteria 1-4,
  depends on Phase 6.

### Decisions / behaviors this phase implements
- `spec/decisions/005-effect-fn-for-step-and-hook-bodies.md` (ADR-EC-005) —
  bare generator function accepted for every hook, auto-wrapped with
  `Effect.fn(name)` using the hook's own name (`"Before"`, `"After"`, ...).
- `spec/behaviors/02-shared-layers-and-tags.md` §BEH-EC-006 — the literal
  MUST requirement: `After` executes whether every step succeeded or one
  failed, via `Effect.ensuring`. Note its worked signatures
  (`Before`/`After`/`BeforeStep`/`AfterStep` as free-standing exported
  functions) predate the DSL-04 architecture constraint discovered in
  `Dsl.ts` and `Registry.ts` — like Phase 5's BEH-EC-003 correction
  (`Dsl.ts` note (d)), this phase's real signatures live on the
  Feature-level DSL object, not as module exports; the spec's literal
  function-signature block should be read as behavior, not as the actual
  export shape.
- `spec/invariants.md` §INV-EC-001 (fail-fast is structural) — the pattern
  every hook-ordering decision in this phase either extends (Before-batch
  gating, D-04) or deliberately departs from (independent-and-collect
  batches, D-02/D-03).
- `spec/invariants.md` §INV-EC-004 (`After` hooks run even when a step
  fails) — the literal invariant this phase's SC #3 makes true; `AfterStep`
  (D-05) and `AfterAllScenarios` (D-09) extend the same guarantee shape to
  the other two "after" hooks by this phase's own decision, not because
  INV-EC-004 requires it of them.
- `spec/decisions/004-one-it-effect-per-scenario.md` (ADR-EC-004) —
  Background inlined as leading `yield*`s, which is why `BeforeStep`/
  `AfterStep` wrap Background steps identically to Scenario steps.

### Existing code this phase extends
- `packages/vitest/src/Dsl.ts` — `FeatureDsl<ROut>`/`ScenarioDsl<ROut>`;
  the six hook registrars are new members here, following
  `StepRegistrar<ROut>`'s precedent (note (e)'s "`R` bound to the enclosing
  `describeFeature`'s `ROut`" reasoning applies to hooks too).
- `packages/vitest/src/Registry.ts` — `createRegistry` currently only
  tracks step definitions; this phase either extends it or adds a sibling
  hook registry with the same "one per `describeFeature` call, no module
  state" discipline (note (a)'s Pitfall 14 argument applies identically).
- `packages/vitest/src/ScenarioEffect.ts` — `buildScenarioEffect` is where
  `Before`/`After`/`BeforeStep`/`AfterStep` get woven into the per-Scenario
  `Effect.gen`; its note (a) (structural fail-fast via a bare `for` loop,
  no combinator) and note (b) (Layer provided once, around everything) are
  the patterns D-04/D-05 must preserve, not work around.
- `packages/vitest/src/TestApi.ts` / `packages/vitest/src/Runner.ts` —
  `TestApi` exposes only `describe`/`effect` today; `BeforeAllScenarios`/
  `AfterAllScenarios` have no native vitest `beforeAll`/`afterAll` seam
  available without either extending `TestApi` or composing them purely
  through Effect sharing (see Claude's Discretion above). Both files'
  "no vitest/`@effect/vitest` import" rule (`TestApi.ts` note (a),
  `Runner.ts` note (a)) still applies to whatever mechanism is chosen.
- `packages/vitest/src/Step.ts` — `isGeneratorFn`/normalization precedent
  hook bodies should reuse rather than duplicate.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `packages/vitest/src/Step.ts`'s generator-vs-Effect normalization
  (`isGeneratorFn` guard, ADR-EC-005) — hooks need the identical
  normalization, just keyed by hook name instead of step pattern.
- `packages/vitest/src/Registry.ts`'s `createRegistry` factory shape (one
  instance per `describeFeature` call, `definitions()` returns a snapshot
  copy) is the direct precedent for however hooks get stored — likely a
  sibling registry or an extension of the existing one.

### Established Patterns
- `ScenarioEffect.ts`'s "a bare `for` loop of `yield*`s IS the invariant;
  a combinator would only simulate it" (note (a)) — any hook-weaving code
  added here must preserve that shape, not introduce `Effect.forEach`.
- Named/discriminated error types with full untruncated content
  (`LoadFeatureError`, `StepMatchError`, etc.) is this codebase's house
  style for anything a reporter needs to render — the "combined failure"
  decisions (D-03, D-06) should follow it rather than inventing a bespoke
  shape.
- Phase 6's D-02 precedent ("the user explicitly asked for the richest
  option, not the cheapest") is the same instinct behind every
  Claude-resolved decision in this phase (D-07, D-08, D-09) — when in
  doubt between simple and complete, this project's owner has consistently
  picked complete.

### Integration Points
- `packages/vitest/src/index.ts` — hooks are exported alongside
  `Given`/`When`/`Then` from the `FeatureDsl`/`ScenarioDsl` surface the DSL
  already publishes; no new top-level exports expected (no module-level
  `Before`/`After` functions — see canonical_refs note on BEH-EC-006).

</code_context>

<specifics>
## Specific Ideas

- The user's repeated instinct across every "you decide" and freeform
  answer in this discussion: prefer the option that surfaces the most
  information to the developer, even at the cost of some implementation
  complexity (combining multiple hook failures into one report rather than
  picking a first-wins winner; letting independent hooks in a batch all
  run rather than stopping at the first failure). Apply this same instinct
  if research/planning surfaces further hook-related ambiguity not covered
  above.

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope. No todos matched this phase
(`todo.match-phase` returned zero matches).

</deferred>

---

*Phase: 07-hooks*
*Context gathered: 2026-08-29*
