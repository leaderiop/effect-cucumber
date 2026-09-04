---
"@effect-cucumber/vitest": minor
---

`BeforeAllScenarios` now runs through a real vitest `beforeAll`, registered once at the Feature block
level ahead of every Scenario and every nested Rule, instead of a hand-rolled once-cell reached from
inside whichever Scenario's own body got there first. This fixes a real bug: under concurrent
scheduling (`sequence.concurrent: true`, or your own `describe.concurrent`), a short-`testTimeout`
Scenario racing the same in-flight setup as a long-`testTimeout` one could time out and
cascade-interrupt the other, even though the other's own budget was never at risk. Concurrent
Scenario execution is now supported — opt in the ordinary vitest way, no new option needed —
and every BEH-EC-017 guarantee (BeforeAllScenarios running exactly once, its failure reported by
every Scenario individually, never masked) holds unchanged under it.

Add a `@timeout-<positive integer milliseconds>` Scenario tag (e.g. `@timeout-5000`), giving one
Scenario its own real `it.effect` timeout independent of the Feature's own `testTimeout` — the thing
that actually makes concurrent execution worth turning on, since without it every Scenario in a
concurrently-scheduled Feature still shares one budget:

```gherkin
Feature: Checkout

  @timeout-500
  Scenario: a fast-budget Scenario
    ...

  @timeout-10000
  Scenario: a Scenario that legitimately needs a larger real timeout
    ...
```

Most specific declaration wins when the tag appears at more than one level (Feature, Rule, Scenario,
an Outline's Examples row), the same inheritance order every other tag already follows. A malformed
occurrence is a loud, located `Error` at registration time.

See [ADR-EC-040](../spec/decisions/040-beforeallscenarios-real-beforeall-captured-exit-and-timeout-suffix-tag.md)
and [BEH-EC-032](../spec/behaviors/19-concurrent-execution-and-scenario-timeout.md), and
`packages/vitest/README.md`'s hook-guarantees section for the full detail.
