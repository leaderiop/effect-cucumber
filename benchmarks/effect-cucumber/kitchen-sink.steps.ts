/**
 * describeFeature-based step definitions for the REAL
 * `packages/vitest/test/acceptance/parsing-and-matching.feature` (and its sibling
 * `parsing-and-matching-second-load.feature`) — reused by real relative path, never copied
 * (ADR-EC-051): copying would carry its `@REQ-EC-NNN` tags outside the one directory
 * `packages/vitest/test/acceptance/README.md` and `spec/scripts/verify-traceability.sh` check 4
 * permit them in.
 *
 * Step bodies here only need to exit 0 with the right pass count for timing purposes — they do not
 * replicate `parsing-and-matching.steps.test.ts`'s full assertion depth, though most assertions
 * carried over cheaply because the logic already existed and is worth keeping.
 *
 * Named `.steps.ts`, NOT `.steps.test.ts` — see `./counter.steps.ts`'s header for why.
 */
import {
  createParameterTypeStore,
  createStepMatcher,
  type DataTable,
  type DocString,
  ParameterTypeStore
} from "@effect-cucumber/gherkin"
import { describeFeature, loadFeature } from "@effect-cucumber/vitest"
import { assert } from "@effect/vitest"
import * as Context from "effect/Context"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as Option from "effect/Option"
import * as Ref from "effect/Ref"
import { fileURLToPath } from "node:url"

const featurePath = fileURLToPath(
  new URL("../../packages/vitest/test/acceptance/parsing-and-matching.feature", import.meta.url)
)
const secondLoadPath = fileURLToPath(
  new URL("../../packages/vitest/test/acceptance/parsing-and-matching-second-load.feature", import.meta.url)
)

interface Fruit {
  readonly name: string
  readonly grams: number
}

// Read directly from `parsing-and-matching.steps.test.ts` rather than re-derived — the exact map
// the real acceptance suite's `{fruit}` parameter type uses.
const fruitWeights: ReadonlyMap<string, number> = new Map([["banana", 118], ["apple", 182], ["fig", 50]])

const store = createParameterTypeStore()
store.define<Fruit>({
  name: "fruit",
  regexp: ["banana", "apple", "fig"],
  transform: (matched: string): Fruit => ({ name: matched, grams: fruitWeights.get(matched) ?? 0 }),
  definedAt: Option.some("benchmarks/effect-cucumber/kitchen-sink.steps.ts"),
  useForSnippets: Option.none(),
  preferForRegexpMatch: Option.none()
})
const parameterTypes = ParameterTypeStore.layerOf(store)

const feature = await loadFeature(featurePath, parameterTypes)
const secondLoadedFeature = await loadFeature(secondLoadPath, parameterTypes)

class World extends Context.Service<World, {
  readonly recorder: Ref.Ref<ReadonlyArray<string>>
  readonly weighed: Ref.Ref<Option.Option<Fruit>>
}>()("World") {
  static readonly layer = Layer.effect(
    this,
    Effect.gen(function*() {
      return World.of({
        recorder: yield* Ref.make<ReadonlyArray<string>>([]),
        weighed: yield* Ref.make<Option.Option<Fruit>>(Option.none())
      })
    })
  )
}

const record = (label: string) =>
  Effect.gen(function*() {
    const { recorder } = yield* World
    yield* Ref.update(recorder, (held) => [...held, label])
  })

const scenariosNamed = (astName: string) => feature.allScenarios.filter((scenario) => scenario.astName === astName)
const outlineAstName = "Substituted placeholders reach the step for <number>"

describeFeature(feature, World.layer, (dsl) => {
  const { Background } = dsl

  Background(({ Given }) => {
    Given("the recorder is empty", function*() {
      yield* record("the recorder is empty")
    })
  })

  dsl.Then("the second loaded feature is named {string}", function*(expected: string) {
    assert.strictEqual(secondLoadedFeature.name, expected)
    yield* record("named")
  })

  dsl.Then("the second loaded feature holds {int} scenarios", function*(expected: number) {
    assert.strictEqual(secondLoadedFeature.allScenarios.length, expected)
    yield* record("counted")
  })

  dsl.Then("the first step of this scenario carries the Background origin", function*() {
    const [scenario] = scenariosNamed("Correlation reaches the step")
    const origin = scenario?.steps[0]?.origin
    assert.strictEqual(origin, "feature-background")
    yield* record(origin ?? "no origin")
  })

  dsl.Then("this scenario carries the feature-level tag it inherited", function*() {
    const [scenario] = scenariosNamed("Correlation reaches the step")
    assert.deepStrictEqual([...(scenario?.tags ?? [])], ["@featuretag", "@REQ-EC-002"])
    yield* record("@featuretag")
  })

  dsl.Then("the sibling outline's names arrived interpolated", function*() {
    const rows = scenariosNamed(outlineAstName)
    assert.strictEqual(rows.length, 2)
    yield* record("interpolated")
  })

  dsl.When("I record {string}", function*(label: string) {
    yield* record(label)
  })

  dsl.Then("the recorder holds {string}", function*(expected: string) {
    assert.strictEqual((yield* Ref.get((yield* World).recorder)).join(","), expected)
  })

  dsl.When(
    "{int} and {float} and {string} and {word} reach a step",
    function*(whole: number, fraction: number, quoted: string, bare: string) {
      yield* record(typeof whole)
      yield* record(typeof fraction)
      yield* record(typeof quoted)
      yield* record(typeof bare)
    }
  )

  dsl.When("I weigh a {fruit}", function*(fruit: Fruit) {
    yield* Ref.set((yield* World).weighed, Option.some(fruit))
  })

  dsl.Then("the weighed fruit is {string} at {int} grams", function*(name: string, grams: number) {
    const weighed = yield* Ref.get((yield* World).weighed)
    assert.deepStrictEqual(Option.getOrUndefined(weighed), { name, grams })
    yield* record("weighed")
  })

  // The one deliberate asymmetry (see README.md's methodology section): cucumber-js has no
  // per-load `ParameterTypeRegistry` identity concept to compare against, so this step's
  // cucumber-js counterpart is a no-op. Kept as a real assertion here, since effect-cucumber
  // genuinely has the plumbing to check it.
  dsl.Then("both loaded features resolve the custom parameter type against different registries", function*() {
    assert.notStrictEqual(feature.parameterTypes, secondLoadedFeature.parameterTypes)
    const matcher = createStepMatcher({
      registry: secondLoadedFeature.parameterTypes,
      entries: [{ pattern: "a crate holds a {fruit}", definition: "crate" }]
    })
    const matches = matcher.match(secondLoadedFeature.allScenarios[1]?.steps[1]?.text ?? "")
    assert.strictEqual(matches.length, 1)
    yield* record("different registries")
  })

  dsl.Then("the substituted number {int} doubles to {int}", function*(number: number, doubled: number) {
    assert.strictEqual(number * 2, doubled)
    yield* record("outline")
  })

  dsl.When("{int} row of cart data reaches a step:", function*(rows: number, table: DataTable) {
    const raw = table.raw()
    yield* record(`table:${rows}:${raw[1]?.[0] ?? "MISSING"}`)
  })

  dsl.When("the note {string} reaches a step:", function*(label: string, doc: DocString) {
    yield* record(`doc:${label}:${doc.content}:${Option.getOrElse(doc.mediaType, () => "ABSENT")}`)
  })
})
