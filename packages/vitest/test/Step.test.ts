/**
 * DSL-02's runtime proof: a bare generator is auto-wrapped with the step text as its span name, and
 * an already-wrapped step function is returned UNCHANGED.
 *
 * Both halves of ADR-EC-005 are invisible to the type system. `Effect.fn`'s v4 overloads accept a
 * generator body and an Effect-returning body alike with no cast, so an implementation that wraps
 * unconditionally compiles perfectly, passes `pnpm build`, `pnpm typecheck:test` and `pnpm lint`,
 * and produces a step that still runs and still returns the right value. The only observable damage
 * is a second span nested inside the author's own, with the step text appearing twice in the trace.
 * This file is the only thing in the repo that can catch that, which is why two of its assertions
 * are written more strictly than they look like they need to be:
 *
 * - the pass-through is asserted by REFERENCE IDENTITY (`toBe`), never structurally and never as
 *   "is callable". A re-wrapping implementation returns a perfectly good callable that behaves
 *   identically on every input — it is the same function by every weaker measure. Identity is the
 *   only check that separates "accepted unchanged" from "accepted and quietly re-wrapped".
 * - the span is asserted by READING THE ACTIVE SPAN from inside the running step body, never by
 *   inspecting `result.name` or `fn.name` on the returned function. Those pass against an
 *   implementation that never calls `Effect.fn` at all, which would make the assertion vacuous —
 *   precisely the property mutation B below was run to disprove.
 *
 * Mutation-tested (both performed, then reverted, both confirmed failing):
 * - A. `register` wraps unconditionally (guard dropped) → the identity test fails.
 * - B. `register` returns `fn` unconditionally (never wraps) → the span-name test fails.
 *
 * ## `expect` in the sync tests, `assert` inside every `it.effect`
 *
 * Not a style preference. oxlint's `vitest/no-standalone-expect` does not recognise `it.effect` as
 * a test block, so an `expect` nested in the `Effect.gen` body it takes is reported as standalone
 * and fails `pnpm lint`. `assert` — vitest's, re-exported by `@effect/vitest` — is outside that
 * rule's scope and is also the form `@effect/vitest`'s own documentation uses. The two synchronous
 * tests call `expect` directly inside `it`, where the rule is satisfied. Do not "make them
 * consistent" by moving the sync tests to `assert` or the Effect tests back to `expect`.
 *
 * ## Imports
 *
 * `../src/Step.ts` directly, never `../src/index.ts`: `effect/no-import-from-barrel-package` runs
 * with `checkRelativeIndexImports: true` and fails `pnpm lint` on a relative value-import whose
 * basename is `index.*`. `register` is not in that barrel anyway (Step.ts's closing note).
 *
 * `@effect/vitest` is the one `@effect/*` package that same rule exempts — it publishes a single
 * entry point, so the rule's "import from the specific module instead" fix does not resolve. The
 * exemption and its bounds are documented at the rule's config in `.oxlintrc.json`.
 */
import { assert, describe, expect, it } from "@effect/vitest"
import * as Cause from "effect/Cause"
import * as Effect from "effect/Effect"
import * as Exit from "effect/Exit"
import { register } from "../src/Step.ts"

/**
 * A bare generator step body, at module scope because it captures nothing
 * (`unicorn/consistent-function-scoping`). `register` must NOT return this one by identity.
 */
const addOne = function*(n: number) {
  return yield* Effect.succeed(n + 1)
}

describe("an already-wrapped step function is accepted unchanged", () => {
  it("comes back as the identical reference, not a re-wrap", () => {
    const stepText = "I wrapped this step myself"
    const alreadyWrapped = Effect.fn(stepText)(function*(n: number) {
      return yield* Effect.succeed(n + 1)
    })

    // THE load-bearing assertion of this file. Reference identity, and nothing weaker: a structural
    // comparison, a `typeof === "function"` check, or asserting the result behaves the same all pass
    // against an implementation that re-wraps — which is the actual defect (ADR-EC-005, and the
    // double-span consequence in RESEARCH.md Pitfall 4). Mutation A makes exactly this line fail.
    expect(register(stepText, alreadyWrapped)).toBe(alreadyWrapped)
  })
})

describe("a bare generator step function is wrapped", () => {
  it("does not come back by identity", () => {
    expect(register("I add one to {int}", addOne)).not.toBe(addOne)
  })

  it.effect("resolves to the generator's return value with its arguments intact", () =>
    Effect.gen(function*() {
      const wrapped = register("I have {int} cukes and {word} left", function*(count: number, kind: string) {
        const doubled = yield* Effect.succeed(count * 2)
        return `${doubled}:${kind}`
      })

      // Proves the wrap is transparent to BOTH the parameter list and the success channel. A wrap
      // that dropped arguments would still return a string here, so the value is asserted whole.
      assert.strictEqual(yield* wrapped(21, "jam"), "42:jam")
    }))

  it.effect("makes the step text observable as the span name", () =>
    Effect.gen(function*() {
      const stepText = "I am observable in a failure's trace"
      const wrapped = register(stepText, function*() {
        return (yield* Effect.currentSpan).name
      })

      // D-05: the span carries the BARE step text and nothing else — no attributes for resolved
      // {int}/{string} argument values, which is deferred out of this phase.
      //
      // Read from the ACTIVE span inside the running body. Asserting on the returned function's own
      // `.name` would pass against an implementation that never calls `Effect.fn`, making this test
      // vacuous; mutation B is the demonstration that it is not.
      assert.strictEqual(yield* wrapped(), stepText)
    }))
})

describe("a failure inside a wrapped step", () => {
  it.effect("still surfaces in the error channel", () =>
    Effect.gen(function*() {
      const wrapped = register("a step that fails", function*() {
        return yield* Effect.fail("boom" as const)
      })

      const exit = yield* Effect.exit(wrapped())

      // The wrap must neither swallow the failure nor convert it into a defect or a success. Asserted
      // through Exit rather than a try/catch on a Promise, so a step that SUCCEEDS is reported as the
      // wrong value rather than silently passing an absent-throw check.
      assert.strictEqual(Exit.isFailure(exit) ? Cause.squash(exit.cause) : "the step unexpectedly succeeded", "boom")
    }))
})
