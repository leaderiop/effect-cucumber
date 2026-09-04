# 14 — Scenario-level retries via `@retry`

What a Scenario tagged `@retry` actually gets, and what it does NOT get: exactly `@effect/vitest`'s
own `flakyTest` bound around the composed Scenario Effect, at its own fixed defaults, applied at the
point closest to the running Scenario the `TestApi` framework-independence seam allows.

> **See:** [ADR-EC-034](../decisions/034-retry-tag-wraps-flakytest-at-the-testapi-seam.md)

See [`spec/roadmap.md`](../roadmap.md) for what is built versus what is only specified — this
document describes the contract, not the build status.

---

## BEH-EC-026: A `@retry` Scenario is wrapped in `flakyTest`, fixed at its own defaults, rebuilding every per-Scenario Layer fresh per attempt

```
REQUIREMENT: A Scenario carrying the @retry tag MUST have its composed Effect
             (Before, every step's BeforeStep/body/AfterStep, After — the
             identical value buildScenarioEffect produces for an untagged
             Scenario) wrapped in @effect/vitest's flakyTest, at flakyTest's
             OWN default arguments: Schedule.recurs(10) attempts, bounded by
             a 30-second wall-clock cap. @retry carries no numeric parameter
             and no code-level equivalent exists — the same convention
             @skip/@only already establish.

             The wrap MUST be composed so that flakyTest's own Effect.retry
             sits OUTSIDE the point buildScenarioEffect's Effect.provide(layer)
             is composed, never inside it — i.e. the Scenario's own Effect
             value MUST be fully built (self() called) BEFORE flakyTest wraps
             the result, never the reverse. This is what makes the
             per-Scenario Layer rebuild fresh on EVERY retry attempt, not
             merely the first — INV-EC-002 ("a per-Scenario Layer is fresh
             every Scenario") extends under @retry to "fresh every ATTEMPT".
```

```
REQUIREMENT: A shared Layer (describeFeature's { shared, perScenario } form)
             beside a @retry Scenario in the same Feature MUST stay built
             EXACTLY ONCE, never once per retry attempt — unaffected by
             whether any Scenario in the Feature carries @retry. The
             mechanism that delivers this needs no special-casing: the
             shared tier's own Context is provided by @effect/vitest's own
             layer(...) machinery OUTSIDE whatever a Scenario's own thunk
             returns, which places it outside flakyTest's retried region by
             construction on both the shared and the plain Layer paths.
```

```
REQUIREMENT: Every Before/After/BeforeStep/AfterStep hook belonging to a
             @retry Scenario MUST re-run on EVERY retry attempt, not only
             the first — because flakyTest's Effect.retry re-interprets the
             WHOLE composed Scenario Effect from scratch on each attempt,
             hooks included, with no notion of "the parts that already ran"
             to skip. A hook author relying on @retry MUST design for side
             effects happening once per ATTEMPT.
```

```
REQUIREMENT: BeforeAllScenarios's captured Exit (ADR-EC-040, BEH-EC-032 — a
             real vitest beforeAll's own Exit, captured once in a closure
             variable, memoising every outcome including a failure) MUST NOT
             be re-triggered by a @retry Scenario's retry attempts — every
             attempt re-observes the SAME already-captured Exit rather than
             re-running the hook body. A Feature whose BeforeAllScenarios
             fails therefore fails every @retry Scenario after it on every
             attempt identically; @retry cannot rescue a failed
             once-per-Feature setup. packages/vitest/README.md's existing
             statement to this effect remains accurate under @retry, not
             merely unaffected by it.
```

```
REQUIREMENT: The per-Scenario simulated TestClock and TestConsole (ambient
             on every Scenario, ADR-EC-018) MUST NOT reset between a @retry
             Scenario's own retry attempts — they are built once for the
             whole retried run, by the same "provided outside the thunk"
             mechanism that keeps a shared Layer build-once. A step that
             advances the simulated clock (or writes to the simulated
             console) on a failed attempt leaves that state in place for the
             NEXT attempt. This MUST be documented as a caveat beside the
             BeforeAllScenarios one, since both are consequences of the same
             composition point and a reader checking one should find the
             other.
```

### Why the tag, not a code-level option

`spec/decisions/020-vitest-native-tags-for-skip-only.md` and
[ADR-EC-026](../decisions/026-registration-time-tag-filtering-and-declared-tag-universe.md) already
establish this codebase's convention for a per-Scenario runtime behavior switch: a Gherkin tag, not a
third argument threaded through `describeFeature`'s DSL. `@retry` follows the identical shape
`@skip`/`@only` already have — reserved, recognised by `Tags.ts`, carrying no parameter — rather than
inventing a second, code-level way to say the same thing.

### Why `flakyTest`, not vitest's own native `TestOptions.retry` passthrough

`@effect/vitest`'s `it.effect` third argument is typed to accept the whole of vitest's own
`TestOptions`, which happens to include an UNNAMED `retry` field vitest's native test runner
interprets by re-invoking the test's own JS function fresh on each attempt — a real, available
mechanism, confirmed by `research/vitest-retry-and-layer-rebuild.md`, but not the one this codebase
exposes. `flakyTest` is the mechanism `spec/roadmap.md` locked before this behavior was implemented,
and it carries real, deliberate properties native retry does not: an `Effect.sandbox` boundary (so a
retried attempt's failure is inspected as a `Cause`, uniformly, regardless of whether the step failed
through a typed `Effect.fail` or a thrown defect) and a wall-clock CAP alongside the attempt count
(`Schedule.recurs(10).while(elapsed <= 30s)`), rather than an unbounded attempt count. Native retry was
considered and is not what `@retry` uses.

### Where this is proven

Three levels, matching this repository's own convention for a claim about the real running framework
versus a claim about internal mechanism:

| Level                                                                                             | Artifact                                                                                                                                                                                                                                                                                                                                                                       |
| ------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Real output — a Scenario failing once then passing is reported PASSING, its Layer rebuilt fresh   | `packages/vitest/test/acceptance/retry.feature` + `.steps.test.ts` (`@REQ-EC-026`, `spec/traceability.md` §5) — a real `describeFeature` call, a step that fails its first attempt and passes its second, and a per-Scenario Layer build-ordinal counter observed from inside the running step, proving `[1, 2]`.                                                              |
| Real output, internal mechanism — hooks, TestClock, and the shared/per-Scenario split under retry | `packages/vitest/test/emission.test.ts`'s retry block — the same real `describeFeature`-and-run technique the rest of that file already uses, with `Before`/`After`/`BeforeStep`/`AfterStep` counters, an ambient `Clock.currentTimeMillis` reading taken every attempt, and a shared-tier build counter beside the per-Scenario one, all in the SAME retried Scenario.        |
| In-process — `BeforeAllScenarios`'s once-cell is not rescued by a retry                           | `packages/vitest/test/Runner.test.ts`'s "`@retry` cannot rescue a Scenario whose `BeforeAllScenarios` already failed" block — composes `flakyTest(recordedThunk())` manually, the identical order `VitestTestApi.ts`'s `withRetry` uses, over a `BeforeAllScenarios` hook that always fails, and asserts the hook's own log shows exactly one run despite every retry attempt. |

### Signatures

Internal mechanism, not new public API — `@retry` is a `.feature`-file tag, and `flakyTest` itself is
already `@effect/vitest`'s own export, re-used rather than re-exported:

```ts
// packages/vitest/src/Tags.ts
export const retryTag = "@retry"
export const isRetried: (tags: ReadonlyArray<string>) => boolean

// packages/vitest/src/TestApi.ts
export interface EmitOptions {
  readonly tags: ReadonlyArray<string>
  readonly skip: boolean
  readonly retry: boolean
  readonly contextFree: boolean
}
```

### Worked example

```typescript
import { describeFeature, loadFeature } from "@effect-cucumber/vitest"
import * as Context from "effect/Context"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as Ref from "effect/Ref"
import * as Schema from "effect/Schema"

// retries.feature:
//   Feature: Talking to a flaky dependency
//     @retry
//     Scenario: A call that occasionally times out still gets asserted on
//       When I call the flaky endpoint
//       Then the response is recorded

const feature = await loadFeature("./retries.feature")

class EndpointTimeout extends Schema.TaggedError<EndpointTimeout>()("EndpointTimeout", {
  attempt: Schema.Number
}) {}

class World extends Context.Service<World, {
  readonly attempts: Ref.Ref<number>
}>()("World") {
  static readonly layer = Layer.effect(
    this,
    Effect.gen(function*() {
      // Fresh every ATTEMPT under @retry, not only every Scenario (ADR-EC-034).
      return World.of({ attempts: yield* Ref.make(0) })
    })
  )
}

describeFeature(feature, World.layer, ({ Scenario }) => {
  Scenario("A call that occasionally times out still gets asserted on", ({ Then, When }) => {
    When("I call the flaky endpoint", function*() {
      const attempts = yield* Ref.updateAndGet((yield* World).attempts, (n) => n + 1)
      // A real dependency call would go here; this simulates one attempt in three succeeding.
      if (attempts < 3) {
        return yield* new EndpointTimeout({ attempt: attempts })
      }
    })

    Then("the response is recorded", function*() {
      yield* Effect.void
    })
  })
})
```

`World.layer`'s `attempts` `Ref` starts at `0` on every retry attempt — never `1` on the second
attempt read as if it were `0` from the first — because `@retry`'s rebuild-per-attempt guarantee
covers the `perScenario` Layer this `World` is built from, exactly the same guarantee an untagged
Scenario already has per-Scenario, extended here to per-ATTEMPT.

---

_Previous: [13 — Failure panel: step text and .feature file:line](./13-failure-panel-location.md)_
