/**
 * Small, standalone test-authoring helpers, called directly inside a step's `Effect.gen` body —
 * never through the DSL. Grounded in real duplication found in a downstream consumer's own
 * acceptance suite (BEH-EC-020, BEH-EC-021):
 *
 * - `failureTag` replaces a hand-rolled, silently-degrading `Exit` tag extraction
 *   (`fault instanceof Error && "_tag" in fault ? String(fault._tag) : "Unknown"`) with a call
 *   that fails the assertion itself on anything that isn't a tagged failure (ADR-EC-028).
 * - `settleThroughClock` replaces a byte-for-byte-duplicated fork/`TestClock.adjust`/poll/join
 *   helper, parameterized on the one axis real usage proved varies (ADR-EC-029).
 *
 * Both import `@effect/vitest` directly — a peer dependency of this package already, and the
 * documented reason `Testing.failureTag` exists at all is to sit beside `@effect/vitest`'s own
 * `assert` as a peer helper. This is unrelated to the `Runner.ts`/`TestApi.ts` framework-
 * independence seam `scripts/verify-testapi-seam.sh` enforces: that seam protects the internal
 * register → plan → emit pipeline from depending on a concrete test framework, which this module,
 * a standalone consumer-facing helper never on that pipeline, has no part of.
 */
import { assert } from "@effect/vitest"
import * as Cause from "effect/Cause"
import * as Duration from "effect/Duration"
import * as Effect from "effect/Effect"
import * as Exit from "effect/Exit"
import * as Fiber from "effect/Fiber"
import * as TestClock from "effect/testing/TestClock"
import { inspect } from "node:util"

/**
 * The shape every `Schema.TaggedError`/`Data.TaggedError` produces, and the shape `failureTag`
 * looks for once a failed `Exit`'s cause has been collapsed to a single value.
 */
const hasStringTag = (u: unknown): u is { readonly _tag: string } => {
  if (typeof u !== "object" || u === null || !("_tag" in u)) {
    return false
  }
  const { _tag } = u as { readonly _tag: unknown }
  return typeof _tag === "string"
}

/**
 * Narrow a failed `Exit`'s typed error to its `_tag`, or fail the current assertion — never a
 * silent `"Unknown"` string (ADR-EC-028, BEH-EC-020).
 *
 * A plain, synchronous function — call it directly inside a step body, the same way
 * `@effect/vitest`'s own `assert.*` is already called (never `yield*`'d):
 *
 * ```ts
 * const exit = yield* Effect.exit(someEffect)
 * const tag = Testing.failureTag(exit)
 * assert.strictEqual(tag, "SomeExpectedError")
 * ```
 *
 * Fails loudly, naming the actual value, on every input that is not a failed `Exit` whose
 * `Cause.squash`'d value carries a string `_tag` — a success, a defect, an interruption, or an
 * untagged typed error all take this path.
 */
export const failureTag = <A, E>(exit: Exit.Exit<A, E>): string => {
  if (Exit.isSuccess(exit)) {
    return assert.fail(
      `Testing.failureTag: expected a failed Exit, but it succeeded with: ${inspect(exit.value)}`
    )
  }

  const fault: unknown = Cause.squash(exit.cause)
  if (hasStringTag(fault)) {
    const { _tag } = fault
    return _tag
  }

  return assert.fail(
    `Testing.failureTag: expected a typed failure with a string "_tag" property, but got: ${inspect(fault)}`
  )
}

/**
 * Options for `settleThroughClock`. Both default from the real usage that grounds ADR-EC-029:
 * `maxSteps` unanimously, `step` to the smaller of the two observed intervals (a caller with a
 * larger, minute-scale backoff passes `step` explicitly).
 */
export interface SettleThroughClockOptions {
  /**
   * The `TestClock.adjust` amount per iteration. Defaults to `"1 second"`.
   */
  readonly step?: Duration.Input
  /**
   * The maximum number of `TestClock.adjust` calls before giving up. Defaults to `12`.
   */
  readonly maxSteps?: number
}

const defaultStep: Duration.Input = "1 second"
const defaultMaxSteps = 12

/**
 * Fork `effect`, repeatedly advance the ambient `TestClock` by `step` until the fork settles or
 * `maxSteps` advances have run, then join it — returning its success or propagating its failure
 * unchanged. Dies, naming the bound tried, if the fork never settles within `maxSteps`
 * (ADR-EC-029, BEH-EC-021).
 *
 * `A`, `E` and `R` are carried through from `effect` unchanged; a fork that never settles is a
 * defect (`Effect.die`), never a new member of `E`.
 */
export const settleThroughClock = <A, E, R>(
  effect: Effect.Effect<A, E, R>,
  options?: SettleThroughClockOptions
): Effect.Effect<A, E, R> =>
  Effect.gen(function*() {
    const step = options?.step ?? defaultStep
    const maxSteps = options?.maxSteps ?? defaultMaxSteps

    const fiber = yield* Effect.forkChild(effect, { startImmediately: true })

    // `pollUnsafe` — a raw, non-blocking runtime hook rather than one of Fiber's Effect-returning
    // operations — is used deliberately: this rc line ships no Effect-returning NON-BLOCKING poll
    // (`Fiber.await` blocks until completion), so it is the only way to check "is the fork done
    // yet" without waiting on it. See ADR-EC-029.
    let steps = 0
    while (fiber.pollUnsafe() === undefined && steps < maxSteps) {
      yield* TestClock.adjust(step)
      steps++
    }

    if (fiber.pollUnsafe() === undefined) {
      // Explicit rather than relying solely on forkChild's auto-supervision, so the fork's own
      // interruption is deterministic and not merely incidental to how the die below propagates.
      yield* Fiber.interrupt(fiber)

      const stepDuration = Duration.fromInputUnsafe(step)
      const totalSimulated = Duration.times(stepDuration, maxSteps)
      return yield* Effect.die(
        new Error(
          `Testing.settleThroughClock: the forked effect did not settle after ${maxSteps} ` +
            `TestClock advance(s) of ${Duration.format(stepDuration)} each ` +
            `(${Duration.format(totalSimulated)} of simulated time total). Pass a larger ` +
            `"maxSteps" or "step" if it genuinely needs more simulated time to settle, or check ` +
            `whether it is waiting on something the TestClock cannot advance past.`
        )
      )
    }

    return yield* Fiber.join(fiber)
  })
