# Phase 8: Rule and Scenario Outline - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-08-29
**Phase:** 8-rule-and-scenario-outline
**Areas discussed:** Scenario-level extra Layer scope, Rule/Feature hook ordering, Outline row test titling, Rule-level Background

---

## Scenario-level extra Layer scope

| Option | Description | Selected |
|--------|-------------|----------|
| Rule only (recommended) | Ship exactly what DSL-05/BEH-EC-009 require; Scenario-level extraLayer becomes a deferred idea. | |
| Both Rule and Scenario | Implement ADR-EC-010's full decision now, since the ADR already commits to both and the mechanism (Layer.provideMerge) is identical. | ✓ |
| You decide | Claude picks based on what's mechanically cheapest once Rule's implementation exists. | |

**User's choice:** Both Rule and Scenario
**Notes:** ADR-EC-010 documents `Scenario(name, extraLayer, dsl)` alongside `Rule(name, extraLayer, dsl)`, even though DSL-05/BEH-EC-009's literal wording only covers Rule. User chose to implement both now rather than revisit the same code path in a later phase.

---

## Rule/Feature hook ordering

| Option | Description | Selected |
|--------|-------------|----------|
| Feature before Rule (recommended) | Feature-level Before hooks run first (outer-to-inner), then the Rule's own Before hooks; After hooks unwind in reverse (Rule's After before Feature's After). | ✓ |
| Rule before Feature | The more specific (Rule) hook runs first, then the broader (Feature) hook. | |
| You decide | Claude picks whichever composes most naturally given how hooks are currently threaded through ScenarioEffect.ts/Runner.ts. | |

**User's choice:** Feature before Rule (recommended)
**Notes:** Mirrors the `describe(feature) → describe(rule)` nesting order already locked in Runner.ts. After hooks unwind symmetrically in reverse, same instinct as Phase 7's D-05/D-06 "guarantee wraps the whole unit" pattern.

---

## Outline row test titling

| Option | Description | Selected |
|--------|-------------|----------|
| Raw Examples values (recommended) | Shows every column/value pair from that row, e.g. `(code=SAVE10, percent=10, expected=31.50)`. Matches Cucumber/cucumber-js convention, maximizes -t filterability. | ✓ |
| Row index only | e.g. `[row 2]` — shorter, but doesn't tell a reader which data varies without opening the .feature file. | |
| You decide | Claude picks a title format during planning. | |

**User's choice:** Raw Examples values (recommended)
**Notes:** `Pickle.name` may already carry `<placeholder>`-substituted values (confirmed via `packages/gherkin/src/Model.ts`'s astName vs. Pickle-name distinction), so this may be close to free to implement.

---

## Rule-level Background

| Option | Description | Selected |
|--------|-------------|----------|
| In scope (recommended) | RuleDsl gets Given/And/Background like FeatureDsl does today. A .feature file with a Rule-level Background currently has nowhere to register those steps at all. | ✓ |
| Out of scope | Defer Rule-level Background to a later phase — a smaller, more literal reading of the roadmap goal. | |
| You decide | Claude decides based on how cheaply RuleDsl's shape reuses ScenarioDsl/FeatureDsl during planning. | |

**User's choice:** In scope (recommended)
**Notes:** `Model.ts` already models a `rule-background` step origin (since Phase 2) and `Plan.ts` already resolves it correctly once registered — only the DSL registration path is missing. Leaving it out would make such a `.feature` file unsupported outright, not just "less rich."

---

## Claude's Discretion

- Whether `RuleDsl<ROut>` extends `ScenarioDsl<ROut>` directly or is a fresh interface.
- Whether `RuleDsl` exposes `BeforeAllScenarios`/`AfterAllScenarios` members at all (default: no, unless a mechanically clean reason emerges).
- The exact mechanism for adding a `rule` `RegistryScopeKind` and threading a Rule's `extraLayer` through Plan/ScenarioEffect/Runner.
- Whether `Scenario`'s new optional extra-Layer parameter is a true optional (two overloads) or always-required-but-may-be-`Layer.empty`.
- How Outline row independence (Pitfall 34) is actually implemented — follow PITFALLS.md's documented "How to avoid" guidance directly.

## Deferred Ideas

None — discussion stayed within phase scope. No todos matched this phase (`todo.match-phase` returned zero matches).
