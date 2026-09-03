/**
 * SPIKE proof-run for GitHub issue #32. NOT part of the package's test suite — a standalone
 * vitest file exercising `TaggedHookRegistry.ts` against a REAL `.feature` fixture
 * (`checkout.feature`, three Scenarios: untagged, `@db`, and `@db @slow`), parsed by the REAL
 * `loadFeature` (`packages/vitest/src/loadFeature.ts` — the same one `describeFeature` uses),
 * not a hand-simulated tag list.
 *
 * Run with: `pnpm exec vitest run research/spikes/tagged-hooks/TaggedHooks.spike.test.ts`
 */
import * as Cause from "effect/Cause"
import * as Effect from "effect/Effect"
import { describe, expect, it } from "vitest"
import { loadFeature } from "../../../packages/vitest/src/loadFeature.ts"
import {
  type HookBody,
  groupTaggedHooks,
  runTaggedHookBatch,
  type TaggedHookDefinition
} from "./TaggedHookRegistry.ts"

const fixturePath = new URL("./checkout.feature", import.meta.url).pathname

describe("tagged-hooks spike (issue #32)", () => {
  it("a tag-expression-scoped Before runs for a matching Scenario and NOT for a non-matching one", async () => {
    const feature = await loadFeature(fixturePath)
    // Every literal tag anywhere in this Feature — the "declared tag universe" `createTagsFilter`
    // requires (ADR-EC-026's problem, rediscovered for hooks — see the write-up).
    const availableTags = [...new Set(feature.allScenarios.flatMap((s) => s.tags))]

    const record: Array<string> = []
    let currentScenario = ""

    const unconditionalBefore: HookBody = () => Effect.sync(() => record.push(`${currentScenario}:always`))
    const dbScopedBefore: HookBody = () => Effect.sync(() => record.push(`${currentScenario}:db-scoped`))

    const definitions: ReadonlyArray<TaggedHookDefinition<HookBody>> = [
      { kind: "Before", ruleId: null, tagExpr: null, body: unconditionalBefore },
      { kind: "Before", ruleId: null, tagExpr: "@db", body: dbScopedBefore }
    ]
    const hookSet = groupTaggedHooks(definitions, availableTags)

    for (const scenario of feature.allScenarios) {
      currentScenario = scenario.name
      await Effect.runPromise(runTaggedHookBatch(hookSet.Before, scenario.tags))
    }

    // Scenario 1 — no tags: only the unconditional hook ran.
    expect(record).toContain("Paying with a saved card:always")
    expect(record).not.toContain("Paying with a saved card:db-scoped")

    // Scenario 2 — @db: BOTH ran.
    expect(record).toContain("Paying with a card that hits the database:always")
    expect(record).toContain("Paying with a card that hits the database:db-scoped")

    // Scenario 3 — @db @slow: the @db-scoped hook still runs (@db is present, @slow is irrelevant
    // to a bare "@db" expression).
    expect(record).toContain("Paying with a slow database-backed card, retried:always")
    expect(record).toContain("Paying with a slow database-backed card, retried:db-scoped")
  })

  it("composes and/not exactly as vitest's own tag-expression grammar does", async () => {
    const feature = await loadFeature(fixturePath)
    const availableTags = [...new Set(feature.allScenarios.flatMap((s) => s.tags))]

    const record: Array<string> = []
    let currentScenario = ""
    const scopedBefore: HookBody = () => Effect.sync(() => record.push(currentScenario))

    // "@db and not @slow" — deliberately the compound form the research (issue #24) called out:
    // and/or/not/parens, not a bespoke grammar.
    const hookSet = groupTaggedHooks(
      [{ kind: "Before", ruleId: null, tagExpr: "@db and not @slow", body: scopedBefore }],
      availableTags
    )

    for (const scenario of feature.allScenarios) {
      currentScenario = scenario.name
      await Effect.runPromise(runTaggedHookBatch(hookSet.Before, scenario.tags))
    }

    // Only the @db-but-not-@slow Scenario matches.
    expect(record).toEqual(["Paying with a card that hits the database"])
  })

  it("preserves registration order among the hooks that actually run in a batch", async () => {
    const feature = await loadFeature(fixturePath)
    const availableTags = [...new Set(feature.allScenarios.flatMap((s) => s.tags))]
    const dbScenario = feature.allScenarios.find((s) => s.tags.includes("@db") && !s.tags.includes("@slow"))!

    const order: Array<string> = []
    const first: HookBody = () => Effect.sync(() => order.push("first"))
    const second: HookBody = () => Effect.sync(() => order.push("second"))
    const third: HookBody = () => Effect.sync(() => order.push("third"))

    const hookSet = groupTaggedHooks(
      [
        { kind: "Before", ruleId: null, tagExpr: null, body: first }, // unconditional
        { kind: "Before", ruleId: null, tagExpr: "@slow", body: second }, // filtered out for this Scenario
        { kind: "Before", ruleId: null, tagExpr: "@db", body: third } // matches
      ],
      availableTags
    )

    await Effect.runPromise(runTaggedHookBatch(hookSet.Before, dbScenario.tags))

    // "second" is silently absent — never invoked — but "first" and "third" keep their
    // REGISTRATION order among themselves, exactly as BEH-EC-017 requires for an unfiltered batch.
    expect(order).toEqual(["first", "third"])
  })

  it("failures from a filtered batch still COMBINE — the independent-batch guarantee survives filtering", async () => {
    const feature = await loadFeature(fixturePath)
    const availableTags = [...new Set(feature.allScenarios.flatMap((s) => s.tags))]
    const dbScenario = feature.allScenarios.find((s) => s.tags.includes("@db") && !s.tags.includes("@slow"))!

    const failingUnconditional: HookBody = () => Effect.fail("unconditional failed")
    const filteredOutFailure: HookBody = () => Effect.fail("should never run, never surface")
    const failingScoped: HookBody = () => Effect.fail("db-scoped failed")

    const hookSet = groupTaggedHooks(
      [
        { kind: "Before", ruleId: null, tagExpr: null, body: failingUnconditional },
        { kind: "Before", ruleId: null, tagExpr: "@slow", body: filteredOutFailure },
        { kind: "Before", ruleId: null, tagExpr: "@db", body: failingScoped }
      ],
      availableTags
    )

    const exit = await Effect.runPromiseExit(runTaggedHookBatch(hookSet.Before, dbScenario.tags))
    expect(exit._tag).toBe("Failure")
    if (exit._tag === "Failure") {
      // Same extraction `packages/vitest/test/Hook.test.ts` uses for the real `runHookBatch`.
      const failures = exit.cause.reasons.filter(Cause.isFailReason).map((reason) => reason.error)
      // Exactly the two hooks that actually ran (the filtered-out one contributes nothing) —
      // combined, never first-wins, matching BEH-EC-017 for the survivors of the filter.
      expect(failures).toEqual(["unconditional failed", "db-scoped failed"])
    }
  })
})
