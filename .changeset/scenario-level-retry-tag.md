---
"@effect-cucumber/vitest": minor
---

Add `@retry`: a Gherkin tag that wraps a Scenario in `@effect/vitest`'s own `flakyTest`, fixed at its
own defaults — up to 10 attempts (`Schedule.recurs(10)`), bounded by a 30-second wall-clock cap. No
numeric parameter, the same convention `@skip`/`@only` already carry.

```gherkin
@retry
Scenario: A call that occasionally times out still gets asserted on
  When I call the flaky endpoint
  Then the response is recorded
```

A Scenario that fails on an early attempt and passes on a later one is reported PASSING, not
flaky-and-red. The per-Scenario Layer rebuilds fresh for EVERY attempt — the existing "fresh every
Scenario" guarantee, extended to "fresh every attempt" — and a `shared` Layer beside it in the same
Feature still builds exactly once, unaffected by any Scenario next to it retrying.

Two things `@retry` does NOT reset between attempts: `BeforeAllScenarios`'s once-cell (already
documented as never retried, so `@retry` cannot rescue a failed setup) and the ambient simulated
`TestClock`/`TestConsole` — a step that advances the simulated clock on a failed attempt leaves that
state in place for the next one. Every `Before`/`After`/`BeforeStep`/`AfterStep` hook re-runs on every
attempt, not only the first.

See [ADR-EC-034](../spec/decisions/034-retry-tag-wraps-flakytest-at-the-testapi-seam.md) and
[BEH-EC-026](../spec/behaviors/14-scenario-retries.md).
