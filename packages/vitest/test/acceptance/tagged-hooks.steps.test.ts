/**
 * Acceptance pair for ADR-EC-035/BEH-EC-027: `tagged-hooks.feature` run through the real
 * `describeFeature`, proving from INSIDE running steps that a tag-expression-scoped `Before` runs
 * for a matching Scenario and does NOT run for a non-matching one in the SAME Feature — a bare tag
 * (`@db`) and a compound `and`/`not` expression (`@db and not @slow`) both proven against real,
 * parsed Scenario tags, never a hand-simulated tag list.
 *
 * Carries: ADR-EC-035, BEH-EC-027, REQ-EC-027.
 *
 * Three `Before` hooks are registered at Feature level: unconditional ("always"), bare-tag-scoped
 * ("db-scoped", `@db`) and compound-scoped ("compound-scoped", `@db and not @slow`) — mirroring
 * `hooks.steps.test.ts`'s "one ordered log every hook appends to" technique, but with three DIFFERENT
 * hooks of the SAME kind rather than one of each kind, since this pair's own claim is about WHICH of
 * several same-kind hooks runs for a given Scenario, not about ordering across kinds (BEH-EC-017
 * already owns that).
 *
 * Each Scenario gets its OWN `HookLog` — a plain (non-shared) per-Scenario Layer, unlike
 * `hooks.steps.test.ts`'s shared tier, because nothing here is `BeforeAllScenarios`/
 * `AfterAllScenarios` and there is no cross-Scenario state to keep: three independent logs is the
 * simpler, more direct shape for "which hooks ran for THIS Scenario."
 */
import { assert } from "@effect/vitest"
import * as Context from "effect/Context"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as Ref from "effect/Ref"
import { fileURLToPath } from "node:url"
import { describeFeature } from "../../src/describeFeature.ts"
import { loadFeature } from "../../src/loadFeature.ts"

// The `.feature` file beside this one, resolved relative to this module rather than `process.cwd()`.
const featurePath = fileURLToPath(new URL("./tagged-hooks.feature", import.meta.url))

// Real bytes off disk, through the real parser, at module top level.
const feature = await loadFeature(featurePath)

// The one ordered log every hook body and every step body in a given Scenario appends to.
class HookLog extends Context.Service<HookLog, { readonly entries: Ref.Ref<ReadonlyArray<string>> }>()("HookLog") {
  static readonly layer = Layer.effect(
    this,
    Effect.gen(function*() {
      return HookLog.of({ entries: yield* Ref.make<ReadonlyArray<string>>([]) })
    })
  )
}

// Append one label to the log.
const record = (label: string) =>
  Effect.gen(function*() {
    const { entries } = yield* HookLog
    yield* Ref.update(entries, (held) => [...held, label])
  })

// THE CALL UNDER TEST.
describeFeature(feature, HookLog.layer, (dsl) => {
  // Unconditional — runs for every Scenario in this Feature, exactly as it did before ADR-EC-035.
  dsl.Before(function*() {
    yield* record("always")
  })

  // Bare-tag-scoped — runs ONLY for a Scenario whose own tags include @db.
  dsl.Before("@db", function*() {
    yield* record("db-scoped")
  })

  // Compound-scoped — runs ONLY for a Scenario tagged @db and NOT @slow, proving the "and"/"not"
  // grammar composes correctly through the real parser, not just a single bare tag.
  dsl.Before("@db and not @slow", function*() {
    yield* record("compound-scoped")
  })

  // ── The two step definitions ──────────────────────────────────────────────────────────────────
  // Both registered at FEATURE level, so one registration serves all three Scenarios.

  dsl.When("the scenario records {string}", function*(label: string) {
    yield* record(`step:${label}`)
  })

  dsl.Then("the hook log reads {string}", function*(expected: string) {
    const held = yield* Ref.get((yield* HookLog).entries)

    // THE ordering/membership assertion: the WHOLE log against the WHOLE expected array, compared
    // with `deepStrictEqual` — a hook that ran when it should not have, or failed to run when it
    // should have, changes this array's CONTENTS, not merely its length.
    assert.deepStrictEqual([...held], expected.split(","))
  })
})
