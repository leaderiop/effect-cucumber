/**
 * The fourth acceptance pair, and the first one whose subject is the PIPELINE rather than a worked example: what
 * `loadFeature` produces, what correlation puts on a `ParsedScenario` before a step ever runs, and the order a
 * Scenario's steps run in.
 *
 * Carries: ADR-EC-014, ADR-EC-017, ADR-EC-022, ADR-EC-024, BEH-EC-014, BEH-EC-015, BEH-EC-016, REQ-EC-001, REQ-EC-002, REQ-EC-005, REQ-EC-006, REQ-EC-017.
 */
import {
  createParameterTypeStore,
  createStepMatcher,
  type DataTable,
  type DocString,
  ParameterTypeStore
} from "@effect-cucumber/gherkin"
import { assert } from "@effect/vitest"
import * as Context from "effect/Context"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as Option from "effect/Option"
import * as Ref from "effect/Ref"
import { fileURLToPath } from "node:url"
import { describeFeature } from "../../src/describeFeature.ts"
import { loadFeature } from "../../src/loadFeature.ts"

// The `.feature` file beside this one, resolved relative to this module rather than `process.cwd()`.
const featurePath = fileURLToPath(new URL("./parsing-and-matching.feature", import.meta.url))

// The second `.feature` file's path.
const secondLoadPath = fileURLToPath(new URL("./parsing-and-matching-second-load.feature", import.meta.url))

// What the `{fruit}` custom parameter type's transform produces.
interface Fruit {
  readonly name: string
  readonly grams: number
}

const fruitWeights: ReadonlyMap<string, number> = new Map([["banana", 118], ["apple", 182], ["fig", 50]])

// This file's OWN store, sharing no state with the process-wide one.
const acceptanceStore = createParameterTypeStore()

// Module scope, and it touches no registry — BEH-EC-015's first requirement for a custom parameter type: declaring
// one appends a plain record to a store, and the registry does not exist yet.
acceptanceStore.define<Fruit>({
  name: "fruit",
  regexp: ["banana", "apple", "fig"],
  // Synchronous by requirement: the matched value is read back UNWRAPPED, so a promise here would reach the step body
  // where its declared parameter type says `Fruit`.
  transform: (matched: string): Fruit => ({ name: matched, grams: fruitWeights.get(matched) ?? 0 }),
  definedAt: Option.some("packages/vitest/test/acceptance/parsing-and-matching.steps.test.ts"),
  useForSnippets: Option.none(),
  preferForRegexpMatch: Option.none()
})

const parseRequirements = ParameterTypeStore.layerOf(acceptanceStore)

// Real bytes off disk, through the real parser, at module top level.
const feature = await loadFeature(featurePath, parseRequirements)

// The second load.
const secondLoadedFeature = await loadFeature(secondLoadPath, parseRequirements)

// Per-Scenario: one ordered log of what the Scenario's steps observed, in the order they observed it, plus the one
// value `@REQ-EC-006` carries across a step boundary.
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

// Append one observation to the recorder.
const record = (label: string) =>
  Effect.gen(function*() {
    const { recorder } = yield* World
    yield* Ref.update(recorder, (held) => [...held, label])
  })

// Every emitted Scenario whose UN-INTERPOLATED name is `astName`.
const scenariosNamed = (astName: string) => feature.allScenarios.filter((scenario) => scenario.astName === astName)

// The Outline's un-interpolated name, written once so the two places that need it cannot drift.
const outlineAstName = "Substituted placeholders reach the step for <number>"

// THE CALL UNDER TEST.
describeFeature(feature, World.layer, (dsl) => {
  // Destructured for the one CONTAINER.
  const { Background } = dsl

  // ADR-EC-017: a Background is a step-definition CONTAINER, so this pattern is matched against the Background's
  // literal Gherkin text and its body runs as the first `yield*` of EVERY Scenario's own Effect.
  Background(({ Given }) => {
    Given("the recorder is empty", function*() {
      assert.deepStrictEqual(yield* Ref.get((yield* World).recorder), [])
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
    const first = scenario?.steps[0]
    // `origin` and not `astNodeIds.length`: `Model.ts` records that the length heuristic is verified WRONG for
    // plain-Scenario pickles, where a Background step and a Scenario step both have length 1.
    assert.strictEqual(first?.text, "the recorder is empty")
    assert.strictEqual(first?.origin, "feature-background")
    yield* record(first?.origin ?? "no origin")
  })

  dsl.Then("this scenario carries the feature-level tag it inherited", function*() {
    const [scenario] = scenariosNamed("Correlation reaches the step")
    const tags = scenario?.tags ?? []
    // `@featuretag` is declared on the Feature and on no Scenario.
    assert.deepStrictEqual([...tags], ["@featuretag", "@REQ-EC-002"])
    yield* record("@featuretag")
  })

  dsl.Then("the sibling outline's names arrived interpolated", function*() {
    const rows = scenariosNamed(outlineAstName)
    assert.strictEqual(rows.length, 2)
    // One Outline node, two emitted Scenarios: each keeps the un-interpolated `astName` a step definition is matched
    // on, and carries its own row's substituted `name`.
    assert.deepStrictEqual(rows.map((row) => row.astName), [outlineAstName, outlineAstName])
    assert.deepStrictEqual(rows.map((row) => row.name), [
      "Substituted placeholders reach the step for 7",
      "Substituted placeholders reach the step for 11"
    ])
    // The substitution reaches the STEP text too, not only the name — and no `<token>` survives it.
    assert.deepStrictEqual(rows.map((row) => row.steps[1]?.text), [
      "the substituted number 7 doubles to 14",
      "the substituted number 11 doubles to 22"
    ])
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
      assert.strictEqual(typeof whole, "number")
      assert.strictEqual(typeof fraction, "number")
      assert.strictEqual(typeof quoted, "string")
      assert.strictEqual(typeof bare, "string")
      assert.strictEqual(whole, 42)
      assert.strictEqual(fraction, 3.5)
      // `{string}` arrives with its surrounding quotes already stripped; `{word}` never had any.
      assert.strictEqual(quoted, "quoted text")
      assert.strictEqual(bare, "bareword")
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
    // The Gherkin text supplied the bare word `banana`; what crossed the step boundary is an object carrying a
    // numeric weight the text never mentioned.
    assert.deepStrictEqual(Option.getOrUndefined(weighed), { name, grams })
    yield* record("weighed")
  })

  dsl.Then("both loaded features resolve the custom parameter type against different registries", function*() {
    assert.notStrictEqual(feature.parameterTypes, secondLoadedFeature.parameterTypes)
    assert.notStrictEqual(feature.parameterTypes.lookupByTypeName("fruit"), undefined)
    assert.notStrictEqual(secondLoadedFeature.parameterTypes.lookupByTypeName("fruit"), undefined)

    // Resolution, not mere presence.
    const matcher = createStepMatcher({
      registry: secondLoadedFeature.parameterTypes,
      entries: [{ pattern: "a crate holds a {fruit}", definition: "crate" }]
    })
    const matches = matcher.match(secondLoadedFeature.allScenarios[1]?.steps[1]?.text ?? "")
    assert.strictEqual(matches.length, 1)
    assert.deepStrictEqual(matches[0]?.args, [{ name: "banana", grams: 118 }])
    yield* record("different registries")
  })

  dsl.Then("the substituted number {int} doubles to {int}", function*(number: number, doubled: number) {
    assert.strictEqual(number * 2, doubled)
    yield* record("outline")
  })

  dsl.When("{int} row of cart data reaches a step:", function*(rows: number, table: DataTable) {
    assert.strictEqual(typeof rows, "number")
    const { _tag } = table
    assert.strictEqual(_tag, "DataTable")

    const raw = table.raw()
    // `raw()` includes the header row, so the single body row is index 1 — the accessor's documented shape, read here
    // rather than restated.
    assert.strictEqual(raw.length, rows + 1)
    yield* record(`table:${rows}:${raw[1]?.[0] ?? "MISSING"}`)
  })

  dsl.When("the note {string} reaches a step:", function*(label: string, doc: DocString) {
    assert.strictEqual(typeof label, "string")
    const { _tag } = doc
    assert.strictEqual(_tag, "DocString")

    // `mediaType` is an `Option` (ADR-EC-022), and the `.feature` file writes one — so an implementation that dropped
    // the annotation while keeping the content is caught here.
    yield* record(`doc:${label}:${doc.content}:${Option.getOrElse(doc.mediaType, () => "ABSENT")}`)
  })
})
