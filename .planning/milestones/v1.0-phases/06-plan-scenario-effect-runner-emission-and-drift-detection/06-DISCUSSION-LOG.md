# Phase 6: Plan, Scenario-Effect, Runner Emission, and Drift Detection - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-08-29
**Phase:** 6-plan-scenario-effect-runner-emission-and-drift-detection
**Areas discussed:** Error DX (unmatched/ambiguous step richness), Warning DX (unused-pattern delivery), Ordering (ambiguous-match determinism)

---

## Error DX — unmatched/ambiguous step error richness

| Option | Description | Selected |
|--------|-------------|----------|
| Bare minimum (spec-exact) | Step text + file:line + (for ambiguous) matching patterns and definition sites. Nothing more. | |
| Add a suggested step snippet | Same, plus an auto-generated `Given("...", function*() {...})` snippet for the undefined case via `CucumberExpressionGenerator`. | ✓ |
| You decide | Claude picks based on what's cheapest given correlation data already in hand. | |

**User's choice:** Add a suggested step snippet.
**Notes:** Mirrors cucumber-js's own DX pattern (PITFALLS.md Pitfall 15). `CucumberExpressionGenerator` is already available via the installed `@cucumber/cucumber-expressions` dependency — no new package needed.

---

## Warning DX — MATCH-05 unused-pattern warning delivery

| Option | Description | Selected |
|--------|-------------|----------|
| console.warn at collection time | Printed to terminal when describeFeature runs. Simple, visible in CI logs. | |
| Synthetic passing test that reports it | An extra non-failing test node in the emitted describe block, visible in the vitest reporter/UI. | |
| You decide | Claude picks the simplest mechanism consistent with the LoadFeatureWarning precedent. | ✓ (with override) |

**User's choice:** "You decide. but not the simplest, the most complete a feature rich."
**Notes:** Interpreted as: implement all three delivery surfaces simultaneously — (1) `console.warn`, (2) a synthetic non-failing vitest test node in the reporter, and (3) structured data attached to `FeatureCollection`/`Plan`'s output for programmatic inspection — rather than picking just one. This is a deliberate escalation beyond the "simplest" default Claude would otherwise have chosen.

---

## Ordering — ambiguous-match pattern list determinism

| Option | Description | Selected |
|--------|-------------|----------|
| Alphabetical by pattern text | Sort matching patterns lexicographically. Stable, easy to test, doesn't point at a fix location. | |
| By source location (file:line) | Sort by where each pattern was registered. Independent of registration order, points at the fix. | ✓ |
| You decide | Claude picks whichever is simpler given data StepMatcher/Registry already carry. | |

**User's choice:** By source location (file:line).
**Notes:** Requires a definition-site location to be captured per `StepDefinition`, which nothing in the DSL layer currently threads through — flagged in CONTEXT.md as needing feasibility confirmation during research/planning (likely `Error().stack` parsing or a call-site capture at `Given`/`When`/`Then` call time).

---

## Claude's Discretion

- Exact shape/name of the new drift-detection error class(es) (the reserved name `StepMatchError` applies) — one class with a reason discriminant vs. two classes.
- Internal structuring of the Register→Plan→Emit pipeline — follow ARCHITECTURE.md's already-designed pattern.
- Mechanism for capturing a step definition's source location (for file:line ordering).
- Exact naming/field shape for the new unused-pattern warning type — follow `LoadFeatureWarning`'s naming precedent for consistency, without literally reusing that type (it's a parse-time, gherkin-package channel; this is a new Plan-stage, vitest-package channel).

## Deferred Ideas

None — discussion stayed within phase scope. No pending todos matched this phase (`todo.match-phase` returned zero matches).
