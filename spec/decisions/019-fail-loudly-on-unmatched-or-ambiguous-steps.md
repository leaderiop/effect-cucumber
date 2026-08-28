# ADR-EC-019: Fail loudly on an unmatched, unused, or ambiguous step pattern

> **Status:** Accepted
> **Date:** 2026-08-28
> **Context:** resolves GSD Features research's Gap 1 (a genuine table-stakes gap in the original 12 behaviors)

## Context

Nothing in the original `spec/behaviors/` (BEH-EC-001 through BEH-EC-012)
specifies what happens when a Pickle's step text has no matching registered
pattern, when a registered pattern matches no step in the Feature, or when
two registered patterns both match one step's text. GSD Features research
found every comparable library treats this as a headline feature —
cucumber-js has first-class `Undefined`/`Ambiguous` step statuses plus a
`strict` mode; `@amiceli/vitest-cucumber` (the library this project positions
against) has a dedicated `StepAbleStepsNotCalledError`; `jest-cucumber` has
four `errors.*` toggles that all default to `true`; playwright-bdd fails its
generation step outright on a missing step.

This gap matters more here than in any comparable library: an unmatched step
is exactly the "runtime failure discovered when the scenario runs" that
`spec/overview.md` names as the reason this project exists — the `Layer`
check (INV-EC-003) covers a step's *dependencies*, but nothing covered
whether a step's *text* resolves to a registration at all. `Layer`-checking
step dependencies while silently ignoring an unmatched step's text would
leave the project's own stated value proposition half-implemented.

## Decision

Step-to-pattern resolution happens once, at `describeFeature`'s Plan stage —
after every step's registered pattern is known and every Scenario's Pickle
step list is known, before any `it.effect` runs. At that point:

- **A Pickle step matching zero registered patterns** fails the containing
  Scenario with a `LoadFeatureError`-family error naming the exact unmatched
  step text and its source location — not a generic "test failed."
- **A Pickle step matching more than one registered pattern** fails the same
  way, naming all matching patterns, so the ambiguity is visible rather than
  silently resolved by registration order (which would make step-argument
  types and behavior depend on definition order, silently changing under an
  unrelated refactor).
- **A registered pattern that matches zero steps across the whole Feature**
  is reported as a Feature-level warning (not a hard failure — an unused
  step definition is dead code, not a broken Scenario), consistent with the
  "fail loudly" principle without over-penalizing incremental authoring.

This becomes **BEH-EC-013**, extending BEH-EC-003 (a step is an
Effect-returning function) and ADR-EC-014 (the correlation `loadFeature`
already performs, which has every fact needed to detect this for free —
matching happens against data `Plan` already computed, not a new pass).

## Consequences

**Positive**:

- Converts a class of runtime failure into an authoring-time error — the
  project's stated core value, applied to the one axis the `Layer` check
  doesn't cover.
- Low-to-medium implementation cost: the correlation index from ADR-EC-014
  already has every Pickle step and every registered pattern in hand at Plan
  time; this is set arithmetic over data already computed, not a new
  subsystem.
- Matches the ecosystem's own consensus rather than inventing a novel policy.

**Negative**:

- Adds a new error family (unmatched/ambiguous step) that step authors need
  to recognize and understand, beyond the existing `E` channel of a
  resolved step's own Effect.
- The "unused pattern" case being a warning rather than a hard failure is a
  policy choice that could be revisited if it proves too noisy or too
  permissive in practice.

**Trade-off accepted**: the implementation cost is low because it reuses
data ADR-EC-014's correlation step already produces — there was no version of
"skip this" that was actually cheaper, only one that silently left a known
gap in the project's own stated value proposition.
