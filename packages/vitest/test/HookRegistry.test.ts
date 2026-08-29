/**
 * DSL-04's per-instance isolation, proven at runtime, for the hook store.
 *
 * The requirement is that two hook registries built in ONE process share no hook definitions. That
 * claim has a specific failure mode — a factory that closes over module-level state — and a specific
 * trap: such a factory still returns two different objects, so a bare reference-identity check
 * passes while nothing is isolated. `test/Registry.test.ts` is the file this one is modelled on, and
 * it names the same trap for the step-definition store this one mirrors for hooks.
 *
 * It also proves the OTHER thing this store is now responsible for: a hook registered under a Rule
 * is told apart from a Feature-level one by its `ruleId` field ALONE, with no scope stack and no
 * other bookkeeping anywhere (ADR-EC-010, D-02).
 *
 * Mutation-tested (performed, then reverted, confirmed failing):
 * - A. `records` hoisted to module scope, outside `createHookRegistry` → the isolation test (second
 *      registry stays empty) fails, because both registries share the one array.
 * - B. `hooks()` returns the live `records` array instead of a spread copy → the snapshot test
 *      (a previously captured `hooks()` result must not grow) fails.
 * - C. `register` drops its `ruleId` argument and pushes `{ kind, body }` (or hardcodes
 *      `ruleId: null`) → the Rule-scoped filter test fails, because both Rules' hooks come back
 *      indistinguishable from the Feature-level one.
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

/**
 * Capture-free hook bodies for the Rule-scoping test, at module scope because they capture nothing
 * (`unicorn/consistent-function-scoping`).
 */
const featureLevelBefore: Body = () => "a Feature-level Before"
const ruleOneBefore: Body = () => "r1's Before"
const ruleTwoBefore: Body = () => "r2's Before"

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

    a.register("Before", null, () => "a hook in A")

    // THE load-bearing isolation assertion. A hoisted `records` array makes b.hooks() length 1.
    expect(a.hooks()).toHaveLength(1)
    expect(b.hooks()).toHaveLength(0)
  })
})

describe("hooks() returns a snapshot rather than the live array", () => {
  it("does not grow a previously returned array when another hook is registered", () => {
    const registry = createHookRegistry<Body>()

    registry.register("Before", null, () => "first")
    const captured = registry.hooks()
    expect(captured).toHaveLength(1)

    registry.register("After", null, () => "second")

    // Returning the internal array directly would make `captured` length 2 here, because it would
    // be the same object the registry keeps pushing onto.
    expect(captured).toHaveLength(1)
    expect(registry.hooks()).toHaveLength(2)
  })
})

describe("hooks come back in registration order", () => {
  it("preserves order across mixed kinds, including two Before hooks (D-01)", () => {
    const registry = createHookRegistry<Body>()

    registry.register("Before", null, firstBefore)
    registry.register("After", null, anAfter)
    registry.register("Before", null, secondBefore)

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

describe("a hook's ruleId is what tells a Rule-scoped hook from a Feature-level one", () => {
  it("keeps each hook's own ruleId intact, including null", () => {
    const registry = createHookRegistry<Body>()

    registry.register("Before", null, featureLevelBefore)
    registry.register("Before", "r1", ruleOneBefore)
    registry.register("Before", "r2", ruleTwoBefore)

    const [feature, one, two] = registry.hooks()

    // `null` is a real recorded value, not an absent key — a consumer filtering by `ruleId` must be
    // able to read it without a `in`/`undefined` guard.
    expect(feature?.ruleId).toBeNull()
    expect(one?.ruleId).toBe("r1")
    expect(two?.ruleId).toBe("r2")
  })

  it("separates the three sets by ruleId alone, with no other bookkeeping", () => {
    const registry = createHookRegistry<Body>()

    registry.register("Before", null, featureLevelBefore)
    registry.register("Before", "r1", ruleOneBefore)
    registry.register("Before", "r2", ruleTwoBefore)

    // THE load-bearing assertion of this block, and the shape 08-05a actually uses: one flat list,
    // filtered by `ruleId` before it ever reaches `groupHooks`. All three hooks share a kind, so
    // `kind` cannot be doing any of this work.
    const forRuleOne = registry.hooks().filter((hook) => hook.ruleId === "r1")
    expect(forRuleOne).toHaveLength(1)
    // Reference identity on the body, `toBe` and never `toEqual`.
    expect(forRuleOne[0]?.body).toBe(ruleOneBefore)

    // A different Rule's hook is excluded, so a Rule sees its own hooks and no sibling Rule's.
    const forRuleTwo = registry.hooks().filter((hook) => hook.ruleId === "r2")
    expect(forRuleTwo).toHaveLength(1)
    expect(forRuleTwo[0]?.body).toBe(ruleTwoBefore)

    // And the Feature-level hook is in NEITHER Rule's filtered list — it is reached by its own
    // `ruleId === null` predicate, which is how `mergeHookSets`'s `feature` argument is built.
    expect(forRuleOne[0]?.body).not.toBe(featureLevelBefore)
    expect(forRuleTwo[0]?.body).not.toBe(featureLevelBefore)

    const forFeature = registry.hooks().filter((hook) => hook.ruleId === null)
    expect(forFeature).toHaveLength(1)
    expect(forFeature[0]?.body).toBe(featureLevelBefore)
  })
})
