# 11 — Per-Scenario deterministic `Random` seeding

Every emitted Scenario runs with its ambient `effect/Random` seeded deterministically, with zero
consumer wiring — the same "ambient by default" treatment `TestClock`/`TestConsole` already get. See
[ADR-EC-031](../decisions/031-random-withseed-wraps-the-scenario-effect-not-a-layer.md) for the real
`Random.withSeed` API shape this is grounded in (a combinator over an `Effect`, not a `Layer`,
correcting `spec/roadmap.md`'s original `Layer.mergeAll` framing) and for why this does not collide
with [ADR-EC-018](../decisions/018-shared-layer-testclock-isolation.md)'s `TestClock`/`TestConsole`
isolation guarantee.

See [`spec/roadmap.md`](../roadmap.md) for what is built versus what is only specified — this document
describes the contract, not the build status.

This IS exercised by this library's OWN acceptance suite: unlike `gherkinTags`/`gherkinWatchTriggers`,
the claim here is real `describeFeature` runtime behavior — every Scenario's ambient `Random` genuinely
changes — observable from inside a running step, which is exactly the acceptance suite's own shape.
`packages/vitest/test/acceptance/random-seeding.feature` +
`packages/vitest/test/acceptance/random-seeding.steps.test.ts` is the pair, tagged `@REQ-EC-024`
(`spec/traceability.md` §5). `packages/vitest/src/ScenarioSeed.ts`'s own derivation function is a pure
leaf with no framework or runner dependency, covered separately by
`packages/vitest/test/ScenarioSeed.test.ts`.

---

## BEH-EC-023: A Scenario's ambient `Random` is seeded from its Feature's uri and its own emitted title, deterministically and distinctly per Outline row

> **See:** [ADR-EC-031](../decisions/031-random-withseed-wraps-the-scenario-effect-not-a-layer.md)

```
REQUIREMENT: Every emitted Scenario's composed Effect MUST run wrapped in
             Random.withSeed(effect, scenarioSeed(featureUri, emittedTitle)),
             where featureUri is ParsedFeature.uri and emittedTitle is the
             SAME title Runner.ts hands the test framework (OutlineTitle.ts's
             buildScenarioTitles output — already disambiguated by Outline
             row and by byte-identical-title occurrence).

REQUIREMENT: A step reading effect/Random (Random.next, Random.nextIntBetween,
             etc.) inside that Scenario MUST observe a value that is
             REPRODUCIBLE — independently recomputable from
             Random.withSeed(theSameOperation, scenarioSeed(featureUri,
             emittedTitle)) run standalone, given only the Feature's uri and
             the Scenario's own emitted title.

REQUIREMENT: Two Scenarios (or two Outline rows of the same Scenario Outline)
             with DIFFERENT emitted titles MUST observe DIFFERENT values from
             the same Random operation — no two rows of one Outline collide
             on the same draw.

REQUIREMENT: The seed wrap MUST compose OUTSIDE the per-Scenario Layer
             buildScenarioEffect already provides, so a consumer's own Layer
             providing its own Random implementation for a step still wins
             over the ambient seed for any step inside it.
```

### Worked example

```typescript
import { describeFeature, loadFeature } from "@effect-cucumber/vitest"
import { assert } from "@effect/vitest"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as Random from "effect/Random"
import { fileURLToPath } from "node:url"

const feature = await loadFeature(fileURLToPath(new URL("./catalog.feature", import.meta.url)))

describeFeature(feature, Layer.empty, ({ Then }) => {
  Then("a captured random value is reproducible from the Scenario's own identity", function*() {
    // The ambient Random is already seeded when this step runs — no setup needed. Recomputing the
    // SAME operation against an independently-built seed string reproduces the SAME value, which is
    // exactly what packages/vitest/test/acceptance/random-seeding.steps.test.ts asserts against the
    // real runner rather than this synthetic snippet.
    const observed = yield* Random.nextIntBetween(1, 1_000_000)
    const reproduced = Effect.runSync(
      Random.nextIntBetween(1, 1_000_000).pipe(
        Random.withSeed(`${feature.uri} Eating apples`)
      )
    )
    assert.strictEqual(observed, reproduced)
  })
})
```

The REQUIREMENT above is asserted for real, against the running framework rather than a synthetic
snippet, by `packages/vitest/test/acceptance/random-seeding.steps.test.ts` (`@REQ-EC-024`) and by
`packages/vitest/test/ScenarioSeed.test.ts` for the pure derivation function alone.
