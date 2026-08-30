/**
 * The fourth acceptance pair, and the first one whose subject is the PIPELINE rather than a worked
 * example: what `loadFeature` produces, what correlation puts on a `ParsedScenario` before a step
 * ever runs, and the order a Scenario's steps run in.
 *
 * ## What this dogfoods
 *
 * `spec/behaviors/04-loadfeature-parse-and-validation.md` (BEH-EC-014) and
 * `spec/behaviors/05-step-matching-and-parameter-types.md` (BEH-EC-015), the two documents whose
 * claims every prior phase proved against synthetic values and inline fixture strings. Here each
 * one is observed from inside a running step whose input is a real `.feature` file on disk.
 *
 * Five claims carry a `@REQ-EC-NNN` tag, one Scenario each (D-01), and one Scenario Outline carries
 * none because it is evidence for another Scenario rather than a requirement of its own:
 *
 * - `@REQ-EC-001` (PARSE-01) on `A second loaded feature is data and nothing else`, whose steps
 *   read the SECOND loaded feature's `name` and `allScenarios.length` back out of the value the
 *   parser returned.
 * - `@REQ-EC-002` (PARSE-02) on `Correlation reaches the step`, whose steps read the running
 *   Scenario's own correlated model: the Background origin on its first `ParsedStep`, the
 *   Feature-level tag it inherited, and a sibling Outline's interpolated names.
 * - `@REQ-EC-005` (MATCH-01) on `Cucumber-expression arguments arrive coerced`, whose one step
 *   receives `{int}`, `{float}`, `{string}` and `{word}` and asserts the runtime type of each.
 * - `@REQ-EC-006` (MATCH-02) on `A custom parameter type resolves in both loads`, whose steps prove
 *   a type declared ONCE as data resolves in two `loadFeature` calls in one process, against two
 *   provably different registries.
 * - `@REQ-EC-017` (RUN-01) on `Background steps lead and the Scenario's own follow`, whose recorded
 *   order is the observable form of "one Scenario is one Effect with sequential yields".
 *
 * ## PARSE-01's other half is NOT stated here, and naming it is the point
 *
 * PARSE-01 is two claims joined by an "and": a `.feature` file loaded through `loadFeature` yields
 * data a step can read, AND that load contributes no tests of its own. This pair states the first
 * half only. The second is a claim about ABSENCE — that something did NOT happen — and a passing
 * Scenario cannot make one. It is carried by `scripts/verify-no-runner-dep.sh`, a structural scan,
 * and by `packages/gherkin/test/loadFeature.test.ts`, which exercises the loader outside a runner
 * altogether. The `REQ-EC-001` row in `spec/traceability.md` §5 names both.
 *
 * What this file does contribute to that half is the second load itself: a real, tagless
 * `.feature` file sitting in this directory, parsed at module scope and deliberately never handed
 * to `describeFeature`. `secondLoadedFeature` is named for that reason and no other.
 *
 * ## MATCH-02 is carried by ONE assertion, and it is not the one a reader expects
 *
 * Both module-scope loads are given `ParameterTypeStore.layerOf(acceptanceStore)` — this file's own
 * store — and never the built-ins-only layer the other three pairs in this directory use. That is
 * not isolation hygiene; it is the setup MATCH-02 needs, because a custom parameter type has to
 * exist before "does it survive a second load" is a question at all.
 *
 * The trap is that the setup looks like the proof. Two `loadFeature` calls both returning without
 * throwing is what a duplicate-registration bug would break, so it is tempting to stop there — and
 * it stays GREEN against the failure this requirement actually guards, which is a MEMOISED registry
 * handed to both calls. BEH-EC-015 requires a FRESH `ParameterTypeRegistry` per call with every
 * recorded definition replayed into it, and `Model.ts` spells out the consequence: a
 * `CucumberExpression` binds permanently to the registry it was compiled against, which is why
 * `StepMatcher.ts`'s compilation cache is keyed on the registry INSTANCE. So the assertion carrying
 * MATCH-02 is the reference INEQUALITY between the two `parameterTypes` values, and mutation E
 * below is the measurement: make the two sides reference-equal and only that assertion goes red
 * while both loads keep succeeding.
 *
 * MATCH-01 has a half this file cannot state either. Every assertion here is a runtime `typeof`,
 * and the requirement is "both at runtime and in the type system". The compile-time half — that
 * `StepArgs<"I have {int} cukes">` IS `[number]` — is carried by
 * `packages/gherkin/test/StepArgs.types.ts`, and the `REQ-EC-005` row in `spec/traceability.md` §5
 * names it.
 *
 * ## ASSUMPTION-11-B, observed rather than assumed
 *
 * `parsing-and-matching-second-load.feature` is the first `.feature` file in this directory with no
 * `.steps.test.ts` partner and no tag of its own. Three things were measured about it, not reasoned
 * about, and all three came back benign, so the plan's documented fallback — moving the fixture
 * under a `support/` subdirectory — was NOT taken:
 *
 * 1. `gherkinTags` tolerated it. `vitest.config.ts` derives half the tag universe by globbing every
 *    `.feature` under this directory, recursively; a file carrying no tag simply contributes no
 *    entry, and the de-duplicated array vitest receives is unchanged in length by its presence.
 * 2. `pnpm verify:spec` stayed green. `spec/scripts/verify-traceability.sh` check 4 greps every
 *    `.feature` in the repository for `@REQ-EC-NNN` and fails on a tag with no §5 row; a file with
 *    zero occurrences of the pattern is invisible to it, which is the correct outcome and the
 *    reason this fixture must never acquire a tag.
 * 3. It produced no collection noise. `pnpm test` reports the same file count with and without it,
 *    because vitest's include glob collects test modules and a `.feature` is not one — the same
 *    fact this directory's README states from the other direction about the `.steps.test.ts`
 *    suffix.
 *
 * The one convention it does break is the README's "each entry here is a PAIR". That sentence is
 * about `.steps.test.ts` modules and the `.feature` files they RUN; this fixture is run by nothing,
 * and a future scanner that assumes a partner for every acceptance `.feature` would have to treat
 * it as the documented exception it is.
 *
 * ## The directory's two standing deviations apply here unchanged
 *
 * Both are stated in full in `packages/vitest/test/acceptance/README.md` and restated per file so a
 * reader comparing this to `spec/behaviors/04` and `05` does not read the difference as drift.
 *
 * 1. **`loadFeature` comes from `@effect-cucumber/gherkin`, not from `@effect-cucumber/vitest`.**
 *    ADR-EC-024's `ManagedRuntime`-backed wrapper is not exported, so this file reaches the gherkin
 *    package's `Effect`-returning `loadFeature` and provides `NodeFileSystem.layer` plus a
 *    `ParameterTypeStore` Layer itself — which is exactly the shape BEH-EC-014's own worked example
 *    shows a caller using today.
 * 2. **`describeFeature` is imported by relative path from `../../src/describeFeature.ts`.** This
 *    suite lives inside the package it consumes, and oxlint's `effect/no-import-from-barrel-package`
 *    runs with `checkRelativeIndexImports: true`. The module object reached is the one the barrel
 *    re-exports.
 *
 * Both loads use a genuine top-level `await` and never `Effect.runSync`:
 * `NodeFileSystem.readFileString` suspends internally, so `runSync` over a path-based `loadFeature`
 * throws `AsyncFiberError`.
 *
 * ## Every step records itself, and that is the file's shape rather than decoration
 *
 * Each step body appends one label to `World.recorder` describing what it OBSERVED — the origin it
 * found, the tag it found, the runtime types it received. Two Scenarios then assert the recorded
 * sequence in full. This buys three things at once that separate mechanisms would otherwise each
 * need: RUN-01's ordering claim (the Background's label is first because the Background's step ran
 * first, in the same Effect), RUN-06's no-closure-state claim (every cross-step value goes through
 * a `Ref` on a Layer-provided service — no `let`, no `var`, no module-scope holder), and per-Scenario
 * Layer freshness, which the Background asserts head-on by requiring the recorder to be EMPTY when
 * it runs. A recorder shared across Scenarios fails that assertion in every Scenario but the first.
 *
 * ## Mutation-tested (every one performed, run, then reverted)
 *
 * The directory README's standing rule: a passing acceptance test proves nothing on its own, so
 * each entry names what went RED and — the part that is easiest to omit — what stayed GREEN. This
 * pair emits SEVEN tests: five tagged Scenarios and the Outline's two rows.
 *
 * - **A. The second load's data really reaches the step.** The second `.feature` file's Feature name
 *      changed, nothing in this module touched → **exactly 1 of 7 red**,
 *      `expected 'Parsing and matching, a renamed second load' to equal 'Parsing and matching, the
 *      second load'`. `@REQ-EC-006` stayed GREEN and legitimately so: it reads the SAME second
 *      feature, but only its registry and its step text, and a Feature name cannot reach either.
 *      That narrow blast radius is the point — the assertion is bound to the file's contents rather
 *      than to the fact that a second load happened.
 * - **B. Background steps really lead, and the count really matters.** The `Background:` block
 *      deleted from `parsing-and-matching.feature`, this module untouched → **3 of 7 red**:
 *      `@REQ-EC-002`'s origin assertion (`expected 'the first step of this scenario carries the
 *      Background origin' to equal 'the recorder is empty'` — with the Background gone, the first
 *      `ParsedStep` is the Scenario's own), `@REQ-EC-017`'s ordering (`expected 'first,second' to
 *      equal 'the recorder is empty,first,second'`) and `@REQ-EC-005`'s recorded prefix. Stayed
 *      GREEN: `@REQ-EC-001`, `@REQ-EC-006` and both Outline rows, none of which read the prefix.
 *
 *      The entry is worth more than its three red tests. An EIGHTH test appeared —
 *      `⚠ unused step definition: Given "the recorder is empty"`, emitted by the library and named
 *      after the now-orphaned registration — so the collected count went 7 → 8. This directory's
 *      README says to assert the collected COUNT because a pair that silently stops running looks
 *      like a smaller number nobody is watching; here the same rule catches a number moving the
 *      other way, and the number moving is the runner reporting the defect by name.
 * - **C. The coercion comes from the PATTERN, not from the body.** `{int}` changed to `{word}` for
 *      the integer argument, in this module only, the `.feature` file untouched → **exactly 1 red**,
 *      `expected 'string' to equal 'number'` on the first `typeof` assertion. The body's declared
 *      parameter type stayed `number` and the compiler said nothing, which is the finding rather
 *      than an aside: `StepRegistrar` infers `Params` from the body it is given, so a pattern and a
 *      body can disagree with each other and only a runtime assertion notices. That is exactly why
 *      MATCH-01's type-level half lives in `packages/gherkin/test/StepArgs.types.ts` and not here.
 * - **D. BOTH loads really carry the custom type.** The SECOND load only, swapped from this file's
 *      store to the built-ins-only layer → **exactly 1 red**, `expected undefined to not equal
 *      undefined`: `lookupByTypeName("fruit")` on the second registry found nothing. Note which
 *      assertion did NOT fail — the reference-inequality one directly above it still passed, because
 *      two loads still produced two objects. D and E fail on two different assertions in the same
 *      step body and neither substitutes for the other.
 * - **E. Reference inequality is the assertion carrying MATCH-02.** Measured twice, and the second
 *      measurement is the one that matters:
 *
 *      **E1**, both sides of the inequality pointed at `feature.parameterTypes` → **exactly 1 red**,
 *      `expected ParameterTypeRegistry{ …(2) } to not equal ParameterTypeRegistry{ …(2) }`.
 *
 *      **E2**, the inequality assertion DELETED outright and nothing else touched → **the whole
 *      suite green, 793 passed, 0 failed.** Both loads still succeed, both registries still resolve
 *      `fruit`, and the second registry still matches the second file's step text through
 *      `createStepMatcher`. Every remaining assertion in this Scenario is equally satisfied by a
 *      MEMOISED registry handed to both calls — which is precisely the Pitfall 14 bug MATCH-02
 *      exists to forbid. One line is the whole difference between traceability theater and coverage,
 *      and E2 is the measurement that says so instead of the record asserting it.
 */
import { createParameterTypeStore, createStepMatcher, loadFeature, ParameterTypeStore } from "@effect-cucumber/gherkin"
import * as NodeFileSystem from "@effect/platform-node/NodeFileSystem"
import { assert } from "@effect/vitest"
import * as Context from "effect/Context"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as Option from "effect/Option"
import * as Ref from "effect/Ref"
import { fileURLToPath } from "node:url"
import { describeFeature } from "../../src/describeFeature.ts"

/** The `.feature` file beside this one, resolved relative to this module rather than `process.cwd()`. */
const featurePath = fileURLToPath(new URL("./parsing-and-matching.feature", import.meta.url))

/**
 * The second `.feature` file's path. It is loaded below and handed to nothing — see the header's
 * PARSE-01 section for why a file that is parsed and never emitted is the artifact this pair needs.
 */
const secondLoadPath = fileURLToPath(new URL("./parsing-and-matching-second-load.feature", import.meta.url))

/**
 * What the `{fruit}` custom parameter type's transform produces.
 *
 * A structured value rather than a prettier string, deliberately: the transform's OUTPUT has to be
 * distinguishable from its INPUT, or a step body receiving the raw matched text back unchanged is
 * indistinguishable from one receiving a transformed value.
 */
interface Fruit {
  readonly name: string
  readonly grams: number
}

const fruitWeights: ReadonlyMap<string, number> = new Map([["banana", 118], ["apple", 182], ["fig", 50]])

/**
 * This file's OWN store, sharing no state with the process-wide one.
 *
 * The repo reserves exactly one probe of the process-wide default store, in
 * `packages/gherkin/test/ParameterTypes.test.ts`, and this file must not become a second: that store
 * is append-only for the life of the process, so a definition added to it from here would be visible
 * to every other test file that loads a feature afterwards, in whatever order vitest happened to run
 * them. A private store is what keeps MATCH-02's claim about THIS file's two loads.
 */
const acceptanceStore = createParameterTypeStore()

// Module scope, and it touches no registry — BEH-EC-015's first requirement for a custom parameter
// type: declaring one appends a plain record to a store, and the registry does not exist yet. The
// regexp is the ARRAY form, three alternatives for one name, so nothing here has to reason about how
// an alternation inside a single source string is grouped. `definedAt` is what a duplicate-name
// rejection would quote, and this file is the honest answer.
acceptanceStore.define<Fruit>({
  name: "fruit",
  regexp: ["banana", "apple", "fig"],
  // Synchronous by requirement: the matched value is read back UNWRAPPED, so a promise here would
  // reach the step body where its declared parameter type says `Fruit`.
  transform: (matched: string): Fruit => ({ name: matched, grams: fruitWeights.get(matched) ?? 0 }),
  definedAt: Option.some("packages/vitest/test/acceptance/parsing-and-matching.steps.test.ts"),
  useForSnippets: Option.none(),
  preferForRegexpMatch: Option.none()
})

/**
 * The requirements BOTH loads below are given — and `layerOf(acceptanceStore)` rather than the
 * built-ins-only `Default` layer, which is the whole of MATCH-02's setup.
 *
 * One store, two `loadFeature` calls, in one process. BEH-EC-015 requires each call to construct a
 * FRESH `ParameterTypeRegistry` and replay every recorded definition into it, and that is the
 * property Pitfall 14 records `cypress-cucumber-preprocessor` getting wrong three separate times
 * behind a module-level singleton registry: the second load either throws on the first load's
 * registrations or silently loses them.
 */
const parseRequirements = Layer.mergeAll(NodeFileSystem.layer, ParameterTypeStore.layerOf(acceptanceStore))

/** Real bytes off disk, through the real parser, at module top level. This one IS emitted. */
const feature = await Effect.runPromise(loadFeature(featurePath).pipe(Effect.provide(parseRequirements)))

/**
 * The second load. Its constant is named for the single reason it exists: to be DATA that a step
 * reads back, proving a `loadFeature` call is a value-producing call and nothing more.
 */
const secondLoadedFeature = await Effect.runPromise(loadFeature(secondLoadPath).pipe(Effect.provide(parseRequirements)))

/**
 * Per-Scenario: one ordered log of what the Scenario's steps observed, in the order they observed
 * it, plus the one value `@REQ-EC-006` carries across a step boundary.
 *
 * `weighed` starts as `Option.none()` rather than as a zero-weight placeholder, so a Scenario whose
 * writing step was deleted fails on the absence instead of comparing two empty values.
 */
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

/**
 * Append one observation to the recorder.
 *
 * A plain function returning an `Effect` that REQUIRES `World`, matching `emission.test.ts`'s own
 * `append` helper. It holds no state of its own — the state lives in the Layer-provided `Ref`, which
 * is what keeps this a helper rather than the module-scope holder PROH-11-03 forbids.
 */
const record = (label: string) =>
  Effect.gen(function*() {
    const { recorder } = yield* World
    yield* Ref.update(recorder, (held) => [...held, label])
  })

/**
 * Every emitted Scenario whose UN-INTERPOLATED name is `astName`.
 *
 * A filter and not a find, because the Outline's rows deliberately share one `astName` and differ
 * only in their interpolated `name` — which is the whole of `@REQ-EC-002`'s substitution claim.
 */
const scenariosNamed = (astName: string) => feature.allScenarios.filter((scenario) => scenario.astName === astName)

/** The Outline's un-interpolated name, written once so the two places that need it cannot drift. */
const outlineAstName = "Substituted placeholders reach the step for <number>"

// THE CALL UNDER TEST. Module scope, nothing wrapping it, nothing intercepting it. The second
// argument is the plain per-Scenario Layer form: this Feature has no shared tier, so every Scenario
// — including each Outline row — gets its own `World` and therefore its own empty recorder.
describeFeature(feature, World.layer, (dsl) => {
  // Destructured for the one CONTAINER. The step definitions below are written as `dsl.Then(...)`
  // and `dsl.When(...)` rather than pulled into this binding list: a bare `Then` here would shadow
  // the `Then` a `Scenario(...)` callback receives, which oxlint's `eslint(no-shadow)` rejects.
  const { Background } = dsl

  // ADR-EC-017: a Background is a step-definition CONTAINER, so this pattern is matched against the
  // Background's literal Gherkin text and its body runs as the first `yield*` of EVERY Scenario's
  // own Effect. The emptiness assertion is what makes the step's name true rather than decorative —
  // and it is a per-Scenario Layer freshness probe: a recorder shared across Scenarios arrives here
  // already holding the previous Scenario's labels.
  Background(({ Given }) => {
    Given("the recorder is empty", function*() {
      assert.deepStrictEqual(yield* Ref.get((yield* World).recorder), [])
      yield* record("the recorder is empty")
    })
  })

  // ── @REQ-EC-001 (PARSE-01) ────────────────────────────────────────────────────────────────────
  // Both steps read the SECOND feature — the one `describeFeature` never saw. The literals they
  // assert against are that file's own contents, so a change to it turns these red without this
  // module being touched (mutation A).

  dsl.Then("the second loaded feature is named {string}", function*(expected: string) {
    assert.strictEqual(secondLoadedFeature.name, expected)
    yield* record("named")
  })

  dsl.Then("the second loaded feature holds {int} scenarios", function*(expected: number) {
    assert.strictEqual(secondLoadedFeature.allScenarios.length, expected)
    yield* record("counted")
  })

  // ── @REQ-EC-002 (PARSE-02) ────────────────────────────────────────────────────────────────────
  // Correlation is ADR-EC-014's contract: `loadFeature` CORRELATES the AST with `compile()`'s
  // pickles rather than re-deriving them, so Background stacking, tag inheritance and placeholder
  // substitution have already happened by the time a step body can look. Each step below records
  // the value it OBSERVED, and the Scenario's last step asserts the three of them in order.

  dsl.Then("the first step of this scenario carries the Background origin", function*() {
    const [scenario] = scenariosNamed("Correlation reaches the step")
    const first = scenario?.steps[0]
    // `origin` and not `astNodeIds.length`: `Model.ts` records that the length heuristic is
    // verified WRONG for plain-Scenario pickles, where a Background step and a Scenario step both
    // have length 1. This is the field that makes stacking observable rather than inferred.
    assert.strictEqual(first?.text, "the recorder is empty")
    assert.strictEqual(first?.origin, "feature-background")
    yield* record(first?.origin ?? "no origin")
  })

  dsl.Then("this scenario carries the feature-level tag it inherited", function*() {
    const [scenario] = scenariosNamed("Correlation reaches the step")
    const tags = scenario?.tags ?? []
    // `@featuretag` is declared on the Feature and on no Scenario. It is present here because
    // `compile()` flattened the inheritance and correlation read it off the pickle — the tags on
    // this Scenario are its OWN plus everything above it, in feature-then-scenario order.
    assert.deepStrictEqual([...tags], ["@featuretag", "@REQ-EC-002"])
    yield* record("@featuretag")
  })

  dsl.Then("the sibling outline's names arrived interpolated", function*() {
    const rows = scenariosNamed(outlineAstName)
    assert.strictEqual(rows.length, 2)
    // One Outline node, two emitted Scenarios: each keeps the un-interpolated `astName` a step
    // definition is matched on, and carries its own row's substituted `name`. That the two differ
    // is the substitution; that `astName` survives is what lets one registration serve both rows.
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

  // ── @REQ-EC-017 (RUN-01) ──────────────────────────────────────────────────────────────────────
  // One Scenario is one Effect whose steps are sequential yields. The recorded array is that claim
  // made observable: the Background's label is first because the Background's step ran first, in
  // the same Effect and against the same `Ref`, and the two `I record` labels follow in document
  // order. Registered at FEATURE level, so `the recorder holds {string}` serves every Scenario in
  // this Feature that asks for it rather than being registered once per Scenario scope.

  dsl.When("I record {string}", function*(label: string) {
    yield* record(label)
  })

  dsl.Then("the recorder holds {string}", function*(expected: string) {
    assert.strictEqual((yield* Ref.get((yield* World).recorder)).join(","), expected)
  })

  // ── @REQ-EC-005 (MATCH-01) ────────────────────────────────────────────────────────────────────
  // Four built-ins in one pattern. Every value in the Gherkin text below is written as text, and
  // every parameter this body declares is a TypeScript type — the coercion between them comes from
  // the pattern and from nothing else, which is what mutation C measures by changing `{int}` to
  // `{word}` and watching the first assertion report a string. The value assertions are the second
  // half of the claim and are not redundant with the `typeof` ones: `strictEqual(whole, 42)` is
  // what separates a coerced `42` from the string `"42"`, and `{bigdecimal}` is the built-in that
  // proves the distinction is real rather than incidental — it keeps its raw text on purpose.

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

  // ── @REQ-EC-006 (MATCH-02) ────────────────────────────────────────────────────────────────────
  // The custom parameter type declared at module scope, resolving in a step body and in the SECOND
  // load's own registry. Three separate claims, and only the third one is MATCH-02:
  //
  //   1. the transform ran — a step body declaring `Fruit` receives a structured value, not the
  //      matched text;
  //   2. both loads carry the definition — neither threw a duplicate-registration error and neither
  //      lost it;
  //   3. the two registries are DIFFERENT OBJECTS. That is the assertion doing the work. Two loads
  //      both succeeding stays green against a memoised registry, which is exactly what mutation E
  //      measures; only reference inequality distinguishes "replayed into a fresh registry per call"
  //      from "handed the same registry twice", and a `CucumberExpression` binds permanently to the
  //      registry it was compiled against, so the difference is not academic.

  dsl.When("I weigh a {fruit}", function*(fruit: Fruit) {
    yield* Ref.set((yield* World).weighed, Option.some(fruit))
  })

  dsl.Then("the weighed fruit is {string} at {int} grams", function*(name: string, grams: number) {
    const weighed = yield* Ref.get((yield* World).weighed)
    // The Gherkin text supplied the bare word `banana`; what crossed the step boundary is an object
    // carrying a numeric weight the text never mentioned.
    assert.deepStrictEqual(Option.getOrUndefined(weighed), { name, grams })
    yield* record("weighed")
  })

  dsl.Then("both loaded features resolve the custom parameter type against different registries", function*() {
    assert.notStrictEqual(feature.parameterTypes, secondLoadedFeature.parameterTypes)
    assert.notStrictEqual(feature.parameterTypes.lookupByTypeName("fruit"), undefined)
    assert.notStrictEqual(secondLoadedFeature.parameterTypes.lookupByTypeName("fruit"), undefined)

    // Resolution, not mere presence. The matcher is built from the SECOND feature's registry and run
    // against that file's own step text, so the second load's custom type is exercised end to end
    // rather than counted in a lookup table — BEH-EC-015's "the registry comes off the feature this
    // matcher will be used against, never from a registry built independently".
    const matcher = createStepMatcher({
      registry: secondLoadedFeature.parameterTypes,
      entries: [{ pattern: "a crate holds a {fruit}", definition: "crate" }]
    })
    const matches = matcher.match(secondLoadedFeature.allScenarios[1]?.steps[1]?.text ?? "")
    assert.strictEqual(matches.length, 1)
    assert.deepStrictEqual(matches[0]?.args, [{ name: "banana", grams: 118 }])
    yield* record("different registries")
  })

  // ── The untagged Outline ──────────────────────────────────────────────────────────────────────
  // Evidence for `@REQ-EC-002`, not a requirement of its own, so it carries no tag (D-01 puts each
  // tag on exactly one Scenario). Its two rows are what the substitution assertions above read, and
  // each row asserts its OWN `<doubled>` against its OWN `<number>` — a registration that captured
  // one row's values, or a `Ref` shared across rows, reads the other row's number here.

  dsl.Then("the substituted number {int} doubles to {int}", function*(number: number, doubled: number) {
    assert.strictEqual(number * 2, doubled)
    yield* record("outline")
  })
})
