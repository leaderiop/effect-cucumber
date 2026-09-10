/**
 * ADR-EC-033/BEH-EC-025's real-output proof: a deliberately failing Scenario, run through
 * the real `describeFeature`, so `scripts/verify-failure-panel.sh` can invoke a real `vitest run`
 * against this file and grep the ACTUAL printed failure panel for the failing step's own pattern and
 * its `.feature` file:line. The in-process half of this proof lives in
 * `packages/vitest/test/ScenarioEffect.test.ts`'s own ADR-EC-033 describe block.
 *
 * Also carries ADR-EC-052/BEH-EC-033's own real-output proof: the second, `@hookfail`-tagged
 * Scenario's `Before` hook (below) fails ON PURPOSE, scoped to that Scenario alone via ADR-EC-035's
 * tag-expression-scoped hooks, so the first Scenario's own step failure above stays unaffected. Its
 * own registration call site — THIS file, not `failing.feature` — is what `HookFailureLocation` must
 * report.
 *
 * Excluded from every normal `vitest run` by the root and per-package `vitest.config.ts` files (see
 * their own `exclude` arrays; the literal directory-glob pattern is deliberately not spelled out
 * again here — a two-asterisk sequence written inside a block comment closes it early, which is
 * exactly how this file was first authored wrong) — this file fails ON PURPOSE, so the ONLY place it
 * is ever collected is this directory's own standalone `vitest.config.ts`, reached explicitly via
 * `--config`, never by directory discovery.
 */
import * as Context from "effect/Context"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as Ref from "effect/Ref"
import { fileURLToPath } from "node:url"
import { describeFeature } from "../../src/describeFeature.ts"
import { assert } from "../../src/EffectVitest.ts"
import { loadFeature } from "../../src/loadFeature.ts"

const featurePath = fileURLToPath(new URL("./failing.feature", import.meta.url))
const feature = await loadFeature(featurePath)

class World extends Context.Service<World, { readonly apples: Ref.Ref<number> }>()("World") {
  static readonly layer = Layer.effect(
    this,
    Effect.gen(function*() {
      return World.of({ apples: yield* Ref.make(0) })
    })
  )
}

describeFeature(feature, World.layer, ({ Before, Given, Then, When }) => {
  Given("I have {int} apples", function*(count: number) {
    yield* Ref.set((yield* World).apples, count)
  })

  When("I add {int} more apples", function*(count: number) {
    yield* Ref.update((yield* World).apples, (apples) => apples + count)
  })

  // Deliberately wrong on purpose: 3 + 2 is 5, the `.feature` file says 6. A real `assert.strictEqual`
  // THROWS here — a defect, not a typed `Effect.fail` — which is the common real-world shape this
  // fix has to cover (`ScenarioEffect.ts`'s `Effect.catchDefect` half).
  Then("I should have {int} apples", function*(expected: number) {
    assert.strictEqual(yield* Ref.get((yield* World).apples), expected)
  })

  // ADR-EC-052/BEH-EC-033's own real-output proof: a Before hook that fails on purpose, scoped to
  // the "@hookfail"-tagged Scenario only (ADR-EC-035's tag-expression-scoped hooks), so the first
  // Scenario's own failure above is unaffected. THIS call's own file:line — not `failing.feature`'s —
  // is what `HookFailureLocation` must report; `scripts/verify-failure-panel.sh` hardcodes the line
  // the `Before(` call below sits on.
  Before("@hookfail", function*() {
    yield* Effect.void
    throw new Error("Before hook failed on purpose")
  })
})
