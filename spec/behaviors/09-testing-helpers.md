# 09 — Testing helpers

Two small helpers used directly inside a step's `Effect.gen` body, not through the DSL: narrowing a
failed `Exit`'s tag, and settling a forked Effect against the ambient `TestClock`. Both are grounded
in real, duplicated code found in a downstream consumer's own acceptance suite — see
[ADR-EC-028](../decisions/028-testing-failuretag-fails-the-assertion.md) and
[ADR-EC-029](../decisions/029-settlethroughclock-parameterized-fork-adjust-join.md) for the evidence
and the rejected alternatives.

See [`spec/roadmap.md`](../roadmap.md) for what is built versus what is only specified — this
document describes the contract, not the build status.

Neither behavior below is exercised by this library's OWN acceptance suite
(`packages/vitest/test/acceptance/`): that suite demonstrates `describeFeature`'s own registration
and runtime behavior through `.feature` files, and neither helper here changes what `describeFeature`
does — both are standalone functions a consumer calls from inside a step body, the same category as
`GherkinTags.ts`'s `gherkinTags` (BEH-EC-008), which is likewise barrel-exported and covered by plain
unit tests with no acceptance pair. `packages/vitest/test/Testing.test.ts` is this pair's test file;
no `@REQ-EC-NNN` tag applies (`AGENTS.md` §5 reserves that tag for `.feature` files under
`test/acceptance/`).

---

## BEH-EC-020: `Testing.failureTag` narrows a failed `Exit`'s tag, or fails loudly

> **See:** [ADR-EC-028](../decisions/028-testing-failuretag-fails-the-assertion.md)

```ts
export const failureTag: <A, E>(exit: Exit.Exit<A, E>) => string
```

```
REQUIREMENT: Given a successful Exit, failureTag MUST fail the current
             assertion (via @effect/vitest's assert.fail), naming the
             success value — never return a string.

REQUIREMENT: Given a failed Exit whose Cause.squash'd value is NOT a record
             carrying a string "_tag" property (a defect, an interruption,
             or an untagged typed error), failureTag MUST fail the current
             assertion, naming the squashed value — never return a fixed
             sentinel string such as "Unknown".

REQUIREMENT: Given a failed Exit whose Cause.squash'd value IS a record
             carrying a string "_tag" property, failureTag MUST return that
             string, and MUST NOT fail the assertion.

REQUIREMENT: failureTag MUST be a plain synchronous function, not an Effect
             — called directly inside a step's Effect.gen body the same way
             @effect/vitest's own assert.* is (AGENTS.md §5), never yield*'d.
```

### Worked example

```typescript
import { Testing } from "@effect-cucumber/vitest"
import * as Data from "effect/Data"
import * as Effect from "effect/Effect"
import { expect } from "vitest"

class RateLimited extends Data.TaggedError("RateLimited")<{ readonly retryAfterSeconds: number }> {}

const failed = Effect.runSync(Effect.exit(Effect.fail(new RateLimited({ retryAfterSeconds: 30 }))))

// The one line that replaces the hand-rolled
// `fault instanceof Error && "_tag" in fault ? String(fault._tag) : "Unknown"` ternary.
expect(Testing.failureTag(failed)).toBe("RateLimited")

const succeeded = Effect.runSync(Effect.exit(Effect.succeed("ok")))
// Testing.failureTag(succeeded) would fail the current assertion instead of returning a string —
// not called here, since a `describe`-level worked example has no assertion context to fail into.
expect(succeeded._tag).toBe("Success")
```

---

## BEH-EC-021: `Testing.settleThroughClock` forks, advances the `TestClock`, and joins — or dies naming the bound

> **See:** [ADR-EC-029](../decisions/029-settlethroughclock-parameterized-fork-adjust-join.md), [BEH-EC-012](03-rules-outlines-and-testclock.md#beh-ec-012-testclock-composes-transparently-on-both-layer-scopes)

```ts
export const settleThroughClock: <A, E, R>(
  effect: Effect.Effect<A, E, R>,
  options?: {
    readonly step?: Duration.Input
    readonly maxSteps?: number
  }
) => Effect.Effect<A, E, R>
```

```
REQUIREMENT: settleThroughClock MUST fork `effect` into its own fiber, then
             repeatedly advance the ambient TestClock by `step` (default "1
             second") until that fiber has completed OR `maxSteps` advances
             (default 12) have run, THEN join the fiber — returning its
             success as A or propagating its failure as E, unchanged from
             what joining `effect`'s own fork would have produced.

REQUIREMENT: If the forked fiber has still not completed after `maxSteps`
             TestClock advances, settleThroughClock MUST interrupt it and
             die (Effect.die) rather than block on Fiber.join indefinitely —
             the die's message MUST name `maxSteps`, `step`, and the total
             simulated time tried. This is a defect, not a member of E: `A`,
             `E` and `R` are carried through unchanged from `effect`'s own
             type.
```

### Worked example

```typescript
import { Testing } from "@effect-cucumber/vitest"
import * as Effect from "effect/Effect"
import * as TestClock from "effect/testing/TestClock"
import { expect } from "vitest"

// A fiber that needs three simulated seconds — three TestClock advances — before it completes.
const slowRetry = Effect.gen(function*() {
  yield* Effect.sleep("1 second")
  yield* Effect.sleep("1 second")
  yield* Effect.sleep("1 second")
  return "settled"
})

const result = await Effect.runPromise(
  Effect.provide(
    Testing.settleThroughClock(slowRetry, { step: "1 second", maxSteps: 5 }),
    TestClock.layer()
  )
)

expect(result).toBe("settled")
```

The REQUIREMENT above is asserted for real, both the settling half and the never-settling
(`Effect.die`) half, by `packages/vitest/test/Testing.test.ts`.
