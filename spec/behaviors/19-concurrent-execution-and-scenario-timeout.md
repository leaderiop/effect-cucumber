# 19 — Concurrent Scenario execution and per-Scenario timeout

What changes when a consumer opts a Feature's emitted Scenarios into concurrent execution, and the
`@timeout-<ms>` tag that makes doing so useful. See [`spec/roadmap.md`](../roadmap.md) for build
status.

---

## BEH-EC-032: BeforeAllScenarios runs through a real `beforeAll`; concurrent execution is supported; `@timeout-<ms>` gives one Scenario its own real timeout

> **See:** [ADR-EC-040](../decisions/040-beforeallscenarios-real-beforeall-captured-exit-and-timeout-suffix-tag.md), [BEH-EC-017](07-hook-ordering-and-guarantees.md#beh-ec-017-six-hooks-a-fixed-ordering-and-three-independent-guarantees), [INV-EC-011](../invariants.md#inv-ec-011-every-scenario-in-a-feature-observes-the-identical-beforeallscenarios-exit)

```
REQUIREMENT: BeforeAllScenarios runs through a real framework `beforeAll`,
             registered once at the Feature block level, ahead of every
             Scenario and every nested Rule — never inside a Scenario's own
             body, and never a hand-rolled once-cell a Scenario's fiber
             reaches lazily. Its own real timeout budget is vitest's default
             hook timeout, independent of any Scenario's own `testTimeout`.
```

```
REQUIREMENT: A Feature's emitted Scenarios MAY run under real concurrent
             scheduling — a consumer opts in the ordinary vitest way
             (`sequence.concurrent: true` in `vitest.config.ts`, project-wide
             or per test file), because `describeFeature` never pins
             `concurrent: false` on any block or test it emits.
             `describeFeature` itself does not offer a separate concurrency
             flag; vitest's own mechanism is the whole opt-in.

             Under concurrent scheduling, BeforeAllScenarios still runs
             EXACTLY ONCE, still completes before any Scenario in the block
             starts (a real `beforeAll` always resolves before any `it` in
             its own block, concurrent scheduling included), and its Exit is
             still observed identically by every Scenario (INV-EC-011) —
             every guarantee BEH-EC-017 states for sequential execution holds
             unchanged under concurrent execution too, BeforeAllScenarios's
             failure-reporting guarantee included: a failing
             BeforeAllScenarios is still reported as the SAME failure on
             EVERY Scenario individually, never as one suite-level failure
             with siblings skipped.
```

```
REQUIREMENT: A Scenario MAY carry its own `@timeout-<positive integer
             milliseconds>` tag (e.g. `@timeout-5000`), reaching
             `@effect/vitest`'s real per-test timeout. Absent, a Scenario
             keeps sharing the Feature's own `testTimeout` exactly as before
             this behavior existed. Present on more than one applicable
             level (Feature, Rule, Scenario, Examples row), the MOST
             SPECIFIC declaration — the one closest to the Scenario itself —
             wins, the same inheritance order ADR-EC-026 already established
             for every other tag.

             A malformed occurrence — `@timeout` with no numeric suffix, a
             non-numeric or non-positive suffix, or the syntactically
             different `@timeout(<ms>)` parenthesised shape this tag does
             NOT use — is a loud, located, registration-time throw, never a
             silent fall-through to the Feature's own default.
```

```
REQUIREMENT: `@timeout-<ms>` is what makes concurrent execution actually
             useful: without a per-Scenario override, every Scenario in a
             concurrently-scheduled Feature still shares the ONE Feature-wide
             `testTimeout`, so a Feature with genuinely heterogeneous
             per-Scenario budgets gains nothing from running concurrently.
             With it, two Scenarios sharing a slow BeforeAllScenarios and
             carrying DIFFERENT `@timeout-<ms>` values both pass under
             concurrent scheduling, because BeforeAllScenarios's own cost
             never lands inside either Scenario's own measured duration at
             all (the real, once-reported bug this behavior's mechanism
             fixes — see the ADR).
```

### Worked example

```typescript
import { describeFeature, loadFeature } from "@effect-cucumber/vitest"
import { Effect, Layer } from "effect"

const feature = await loadFeature("./checkout.feature")

// checkout.feature:
//   @timeout-500
//   Scenario: a fast-budget Scenario
//     ...
//
//   @timeout-10000
//   Scenario: a Scenario that legitimately needs a larger real timeout
//     ...
//
// Run under vitest.config.ts's `test.sequence.concurrent: true` to actually schedule these two
// Scenarios' fibers concurrently — describeFeature itself never sets this; it is an ordinary vitest
// project setting.
describeFeature(feature, Layer.empty, ({ BeforeAllScenarios, When }) => {
  // Runs ONCE, on its own real timeout budget, before EITHER Scenario's body starts — even
  // concurrently scheduled, neither Scenario's own testTimeout ever includes this cost.
  BeforeAllScenarios(function*() {
    yield* Effect.promise(() => new Promise<void>((resolve) => setTimeout(resolve, 400)))
  })

  When("a fast-budget Scenario's own step", function*() {
    yield* Effect.void
  })
  When("the Scenario that legitimately needs more time", function*() {
    yield* Effect.void
  })
})
```

---

_Previous: [18 — Rule World narrowing](./18-rule-world-narrowing.md)_
