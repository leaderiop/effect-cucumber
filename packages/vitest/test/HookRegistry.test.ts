/**
 * DSL-04's per-instance isolation, proven at runtime, for the hook store.
 *
 * The requirement is that two hook registries built in ONE process share no hook definitions. That
 * claim has a specific failure mode — a factory that closes over module-level state — and a specific
 * trap: such a factory still returns two different objects, so a bare reference-identity check
 * passes while nothing is isolated. `test/Registry.test.ts` is the file this one is modelled on, and
 * it names the same trap for the step-definition store this one mirrors for hooks.
 *
 * Mutation-tested (performed, then reverted, confirmed failing):
 * - A. `records` hoisted to module scope, outside `createHookRegistry` → the isolation test (second
 *      registry stays empty) fails, because both registries share the one array.
 * - B. `hooks()` returns the live `records` array instead of a spread copy → the snapshot test
 *      (a previously captured `hooks()` result must not grow) fails.
 *
 * ## Imports
 *
 * `../src/HookRegistry.ts` directly, never `../src/index.ts`: `effect/no-import-from-barrel-package`
 * runs with `checkRelativeIndexImports: true` and fails `pnpm lint` on a relative value-import whose
 * basename is `index.*`. `HookRegistry` is not in that barrel anyway (`HookRegistry.ts` note (f)).
 */
import { describe, expect, it } from "vitest"
import { createHookRegistry } from "../src/HookRegistry.ts"

/** A hook body's real type belongs to `Hook.ts`; this file only needs something identifiable. */
type Body = () => string

/**
 * Capture-free hook bodies for the ordering test, at module scope because they capture nothing
 * (`unicorn/consistent-function-scoping`).
 */
const firstBefore: Body = () => "first Before"
const anAfter: Body = () => "an After"
const secondBefore: Body = () => "second Before"

describe("two hook registries built in the same process share no state", () => {
  it("hands back two different objects", () => {
    const a = createHookRegistry<Body>()
    const b = createHookRegistry<Body>()

    // Reference inequality, and nothing weaker — but note this assertion alone proves almost
    // nothing. A factory closing over a module-level array passes it every time, which is why the
    // test below exists rather than this one standing in for it.
    expect(a).not.toBe(b)
  })

  it("leaves the second registry empty when the first is registered into", () => {
    const a = createHookRegistry<Body>()
    const b = createHookRegistry<Body>()

    a.register("Before", () => "a hook in A")

    // THE load-bearing isolation assertion. A hoisted `records` array makes b.hooks() length 1.
    expect(a.hooks()).toHaveLength(1)
    expect(b.hooks()).toHaveLength(0)
  })
})

describe("hooks() returns a snapshot rather than the live array", () => {
  it("does not grow a previously returned array when another hook is registered", () => {
    const registry = createHookRegistry<Body>()

    registry.register("Before", () => "first")
    const captured = registry.hooks()
    expect(captured).toHaveLength(1)

    registry.register("After", () => "second")

    // Returning the internal array directly would make `captured` length 2 here, because it would
    // be the same object the registry keeps pushing onto.
    expect(captured).toHaveLength(1)
    expect(registry.hooks()).toHaveLength(2)
  })
})

describe("hooks come back in registration order", () => {
  it("preserves order across mixed kinds, including two Before hooks (D-01)", () => {
    const registry = createHookRegistry<Body>()

    registry.register("Before", firstBefore)
    registry.register("After", anAfter)
    registry.register("Before", secondBefore)

    const [first, second, third] = registry.hooks()

    expect(first?.kind).toBe("Before")
    // Reference identity on the body, `toBe` and never `toEqual` — a rebuilt or re-bound body would
    // still pass a structural comparison.
    expect(first?.body).toBe(firstBefore)

    expect(second?.kind).toBe("After")
    expect(second?.body).toBe(anAfter)

    // The two Before hooks come back in the order they were registered, not grouped or sorted.
    expect(third?.kind).toBe("Before")
    expect(third?.body).toBe(secondBefore)
  })
})
