# Phase 8: Rule and Scenario Outline - Context

**Gathered:** 2026-08-29
**Status:** Ready for planning

<domain>
## Phase Boundary

`Rule:` becomes a real DSL container that can narrow the ambient Layer for
the Scenarios inside it, and `Scenario Outline` rows become typed (via
existing cucumber-expression coercion, no new mechanism), distinctly
titled, and provably independent of one another. Concretely:

- **Rule DSL** — `FeatureDsl` gets a `Rule(name, extraLayer, define)`
  member. `extraLayer` combines with whatever's already ambient via
  `Layer.provideMerge(ambient)(extraLayer)` (ADR-EC-010); a service it
  contributes is a real compile-time boundary — invisible outside that
  Rule (INV-EC-005).
- **Rule-scoped hooks** — `Before`/`After`/`BeforeStep`/`AfterStep`
  declared inside a Rule's dsl apply only to Scenarios within that Rule
  (ADR-EC-010).
- **`Registry.ts`'s missing `rule` scope kind** — `RegistryScopeKind` is
  currently `feature | background | scenario` only (Plan.ts note (e)).
  This phase adds the ability to register at Rule scope; Plan.ts's
  scope-chain resolution (Scenario → Rule → Feature, ARCHITECTURE.md
  Pattern 5) already works today for reading, only registering was
  missing.
- **Scenario Outline typing** — Examples column values consumed by a
  step's `{int}`/`{float}` pattern arrive already coerced to `number`,
  the same coercion any other step gets, no separate typed-example-row
  mechanism (DSL-06, BEH-EC-010).
- **Outline row independence** — two rows of the same Outline must
  provably share no mutable state (regression test for the
  `@amiceli/vitest-cucumber` loop-variable-capture bug — Pitfall 34).

**Already dictated by architecture — not re-opened here:**
- `describe(rule.name, ...)` nesting itself is already implemented in
  `Runner.ts` (Phase 6) — this phase's job is the DSL registration path
  and Layer-narrowing semantics, not the emission structure.
- Outline typing reuses cucumber-expression coercion verbatim
  (ADR-EC-007) — no separate typed "example row" mechanism, confirmed
  again in this discussion.
- There is no third "shared within a Rule" Layer scope (ADR-EC-006) — a
  resource needing that must be promoted to the Feature's `shared` Layer.

Out of scope for this phase (owned by later phases per the roadmap): tag
routing (Phase 9), `shared`-Layer build-once semantics (Phase 10).

</domain>

<decisions>
## Implementation Decisions

### Scenario-level extra Layer
- **D-01:** Phase 8 implements BOTH forms ADR-EC-010 documents, not just
  the Rule form the roadmap's literal DSL-05 wording covers:
  `Rule(name, extraLayer, dsl)` AND `Scenario(name, extraLayer, dsl)`.
  `Scenario`'s current signature (`(name, define)`, no Layer argument) is
  extended to accept an extra Layer the same way — same
  `Layer.provideMerge(ambient)(extraLayer)` mechanism, same "always
  per-Scenario scope, built fresh every Scenario" lifecycle. Chosen
  because the ADR already commits to both forms and the underlying
  mechanism is identical; deferring the Scenario form would mean
  revisiting this exact code path in a later phase for no mechanical
  reason.
- **Type-surface consequence:** every place `Scenario`'s registrar type is
  declared (`FeatureDsl<ROut>`, and the new `RuleDsl<ROut>` per D-04)
  needs its signature updated to accept an optional extra Layer argument,
  not just `RuleDsl`'s.

### Rule/Feature hook ordering
- **D-02:** For a Scenario inside a Rule, Before-shaped hooks run
  outer-to-inner: Feature-level `Before` hooks run, then that Rule's own
  `Before` hooks. After-shaped hooks unwind in reverse: the Rule's `After`
  hooks run, then the Feature's `After` hooks. This mirrors the
  `describe(feature) → describe(rule)` nesting order already locked in
  `Runner.ts` — general/outer setup before specific/inner setup, and the
  guarantee unwinds symmetrically (same instinct as Phase 7's D-05/D-06
  "guarantee wraps the whole unit" pattern, applied one level up the
  Rule/Feature nesting instead of the BeforeStep/step nesting).
- Applies identically to `BeforeStep`/`AfterStep` if a Rule ever narrows
  those too (Rule-scoped hooks per ADR-EC-010 cover
  `Before`/`After`/`BeforeStep`/`AfterStep` — all four, not just
  `Before`/`After`).
- **Note:** `BeforeAllScenarios`/`AfterAllScenarios` are NOT part of this
  ordering question — ADR-EC-010's hook list for Rule scoping is
  explicitly `Before`/`After`/`BeforeStep`/`AfterStep` only. Whether
  `RuleDsl` even exposes `BeforeAllScenarios`/`AfterAllScenarios` members
  is a planner-level type-surface question (see Claude's Discretion),
  not re-opened here.

### Outline row test titling
- **D-03:** Each Outline row's emitted test title shows every
  column/value pair from that row (e.g.
  `Applying a valid discount code (code=SAVE10, percent=10, expected=31.50)`),
  not just a row index. Chosen for maximum `-t` filterability (grep any
  value directly) and because it matches Cucumber/`@cucumber/gherkin`
  convention — `Pickle.name` already has `<placeholder>` tokens
  substituted with that row's Examples values (confirmed in
  `packages/gherkin/src/Model.ts`'s `astName` vs. interpolated Pickle-name
  distinction), so the raw material for this title format may already be
  sitting in the Pickle rather than needing new computation.

### Rule-level Background
- **D-04:** `RuleDsl<ROut>` gets its own `Background` registrar
  (`Given`/`And` only, same shape as `FeatureDsl`'s existing
  `BackgroundDsl`), so a `.feature` file's `Rule: ... Background: ...`
  block has somewhere to register its steps. Without this, such a file
  would be unsupported outright (Plan.ts already resolves
  `rule-background`-origin steps correctly once they're registered — see
  `packages/vitest/src/Plan.ts` line ~451 — but nothing can register at
  Rule scope yet). Chosen over deferring because "a .feature file with a
  Rule-level Background is simply unsupported" is a bigger gap than
  "less rich," and the DSL shape to add is a near-copy of the existing
  Feature-level `BackgroundDsl`.

### Claude's Discretion
- Whether `RuleDsl<ROut>` extends `ScenarioDsl<ROut>` directly (mirroring
  `FeatureDsl extends ScenarioDsl`) or is a fresh interface — pick
  whichever produces the clearest type surface, following `Dsl.ts`'s
  existing extension pattern unless a concrete reason argues otherwise.
- Whether `RuleDsl` exposes `BeforeAllScenarios`/`AfterAllScenarios`
  members at all. ADR-EC-010 only lists `Before`/`After`/`BeforeStep`/
  `AfterStep` as Rule-scopeable; the "AllScenarios" hooks' whole semantic
  (once per Feature, per Phase 7's D-08/D-09) may not cleanly narrow to
  "once per Rule" without its own design pass. Default to NOT exposing
  them on `RuleDsl` unless research/planning finds a mechanically clean
  reason to.
- The exact mechanism for adding a `rule` `RegistryScopeKind` and
  threading a Rule's `extraLayer` through to Plan/ScenarioEffect/Runner —
  follow `Registry.ts`'s existing "one closure per `describeFeature`
  call, no module state" discipline (DSL-04's prohibition applies
  identically to Rule-scope registration).
- Whether `Scenario`'s new optional extra-Layer parameter (D-01) is
  genuinely optional (two overloads: `(name, define)` and
  `(name, extraLayer, define)`) or always-required-but-may-be-`Layer.empty`
  (following DSL-01/Phase 5's D-03 "no optional-key branching" precedent
  for the `{ shared, perScenario }` object) — pick whichever produces
  the clearest type surface and error messages; not re-litigated here.
- How Outline row independence (Pitfall 34) is actually implemented
  (snapshot-per-row registration, an IIFE closure, etc.) — follow
  PITFALLS.md's documented "How to avoid" guidance directly, this is a
  known, already-diagnosed bug pattern, not an open design question.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Requirements this phase implements
- `.planning/REQUIREMENTS.md` — DSL-05, DSL-06 (this phase's requirement
  IDs).
- `.planning/ROADMAP.md` §"Phase 8: Rule and Scenario Outline" — goal,
  success criteria 1-4, depends on Phase 6.

### Decisions / behaviors this phase implements
- `spec/decisions/010-rule-and-scenario-scoped-extra-layers.md`
  (ADR-EC-010) — the normative decision this phase's D-01 (Scenario-level
  Layer) and Rule-scoped hooks (D-02) both come from; read in full, not
  just the Rule-only excerpt.
- `spec/behaviors/03-rules-outlines-and-testclock.md` §BEH-EC-009
  (Rule extends ambient Layer), §BEH-EC-010 (Outline Examples typed for
  free) — the literal MUST requirements success criteria 1-3 are graded
  against, plus a full worked example (discount-codes Feature) showing
  Rule + Outline + World + TestClock composed together.
- `spec/invariants.md` §INV-EC-005 (a Rule-scoped Layer is invisible
  outside that Rule) — the literal invariant success criterion 2 makes
  true.
- `spec/decisions/007-cucumber-expressions-for-step-matching.md`
  (ADR-EC-007) — the coercion mechanism DSL-06/BEH-EC-010 reuses, no new
  mechanism.
- `spec/decisions/006-two-layer-scopes-only.md` (ADR-EC-006) — why there
  is no third "shared within a Rule" scope; a Rule/Scenario extra Layer
  is always per-Scenario-fresh, never a third shared tier.
- `spec/decisions/005-effect-fn-for-step-and-hook-bodies.md` (ADR-EC-005)
  — hooks accept a bare generator, auto-wrapped with `Effect.fn(name)`;
  applies identically to Rule-scoped hooks (D-02).
- `.planning/research/PITFALLS.md` Pitfall 34 — the loop-variable-capture
  bug this phase's Outline-row-independence success criterion (SC #4) is
  a regression test for; read its "How to avoid" section directly before
  implementing row emission.
- `.planning/research/ARCHITECTURE.md` Pattern 5 — the three-level
  scope-chain resolution (Scenario → Rule → Feature) `Plan.ts` already
  implements two levels of; this phase completes the missing Rule level.

### Existing code this phase extends
- `packages/vitest/src/Registry.ts` — `RegistryScopeKind` is
  `"feature" | "background" | "scenario"` today (no `rule` kind); this
  phase adds Rule-scope registration, following the exact "one closure
  per `describeFeature` call" discipline documented in this file's note
  (a).
- `packages/vitest/src/Plan.ts` note (e) (lines ~68-74) — states plainly
  that Rule-scope resolution already works for READING (a Scenario
  nested in a Rule sees Feature/Background-scope steps correctly); only
  Rule-scope REGISTRATION is missing. Read this note before touching
  `Plan.ts` — it names exactly what is and isn't this phase's job.
- `packages/vitest/src/Dsl.ts` — `FeatureDsl<ROut>` (extends
  `ScenarioDsl<ROut>`), `ScenarioDsl<ROut>`, `BackgroundDsl<ROut>`,
  `HookRegistrar<ROut>` are the direct precedents `RuleDsl<ROut>` and the
  new `Rule` member follow. Read the file's own notes (a) (no `Scope` on
  any Dsl interface), (c) (`ScenarioDsl` five-registrar shape), (d)
  (`BackgroundDsl`'s deliberate `Given`/`And`-only omission) before
  designing `RuleDsl`.
- `packages/vitest/src/ScenarioEffect.ts` — where a Scenario's hooks and
  Layer are actually woven into the per-Scenario `Effect.gen` (Phase 7);
  this phase's Rule-scoped extra Layer and Rule-scoped hooks compose into
  this same module, following its existing "bare `for` loop, no
  combinator" and "Layer provided once, around everything" patterns
  (notes (a)/(b), referenced in 07-CONTEXT.md too).
- `packages/vitest/src/Runner.ts` — `describe(rule.name, ...)` nesting
  (lines ~263-268) is ALREADY implemented (Phase 6); this phase only adds
  the DSL registration path and Layer/hook narrowing feeding into what
  Runner already emits. Do not re-derive the nesting structure.
- `packages/gherkin/src/Model.ts` — `ParsedRule` (Rule's own tags,
  Scenarios), `StepOwner`'s `"rule-background"` origin (already modeled
  since Phase 2) — the data this phase's DSL registration path must
  finally have somewhere to register against.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `packages/vitest/src/Dsl.ts`'s `BackgroundDsl<ROut>` interface — direct
  template for whatever Rule-level Background shape D-04 needs; same
  `Given`/`And`-only omission reasoning applies.
- `packages/vitest/src/Registry.ts`'s `createRegistry` factory — the
  precedent for adding a `rule` scope kind without introducing any module
  state; likely a scope-stack push/pop the same shape as
  `background`/`scenario` already use.
- `.planning/research/PITFALLS.md` Pitfall 34's documented fix (snapshot
  per row at registration, closure captured per `it.effect`) — a fully
  diagnosed, ready-to-apply pattern, not something to rediscover.

### Established Patterns
- `Plan.ts`'s scope-chain resolution already walks Scenario → Rule →
  Feature for reading (note (e)) — this phase's registration-side work
  should slot into the same chain, not invent a parallel one.
- Every Dsl container in this codebase (`ScenarioDsl`, `BackgroundDsl`,
  `FeatureDsl`) is a plain interface of registrar functions, never a
  class — `RuleDsl` should follow the same shape.
- Phase 7's hook-ordering precedent (D-05/D-06 "guarantee wraps the whole
  unit") is the direct model for this phase's D-02 (Feature-then-Rule
  Before, Rule-then-Feature After) — same "outer guarantee wraps inner"
  instinct, one nesting level up.

### Integration Points
- `packages/vitest/src/index.ts` — no new top-level exports expected for
  `Rule`/`RuleDsl`; reached only through `FeatureDsl.Rule`, same
  "internal implementation, not in the barrel" precedent `Registry.ts`
  and `collectFeature` already set (per 06-CONTEXT.md).

</code_context>

<specifics>
## Specific Ideas

- The discount-codes worked example in
  `spec/behaviors/03-rules-outlines-and-testclock.md` (a Rule-scoped
  `DiscountRegistry` Layer, a Scenario Outline with `<code>`/`<percent>`/
  `<expected>` columns, plus a plain Scenario using `TestClock` to expire
  a code) is the closest thing to a north-star reference for what this
  phase's acceptance tests should look like end to end.
- The user's consistent instinct across Phases 6-7 (and again here on the
  Scenario-Layer and hook-ordering questions) is to prefer the more
  complete/consistent option over the narrowest literal reading of the
  roadmap wording, when the cost of doing so now is low and deferring it
  would mean revisiting the same code path later.

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope. No todos matched this phase
(`todo.match-phase` returned zero matches).

</deferred>

---

*Phase: 08-rule-and-scenario-outline*
*Context gathered: 2026-08-29*
