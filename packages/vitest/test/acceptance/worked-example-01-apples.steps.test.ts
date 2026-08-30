/**
 * The library running its own spec: a real `.feature` FILE on disk, loaded from disk, driving real
 * passing tests through the real `describeFeature`.
 *
 * This is the first file in `packages/vitest/test/acceptance/`, and it is the first `.feature` file
 * in the repository that is neither a parser fixture (`packages/gherkin/test/fixtures/`) nor a
 * tag-scanning fixture (`packages/vitest/test/fixtures/`). `packages/vitest/test/emission.test.ts`
 * comes closest — it is the only other file that calls `describeFeature` for real — but its Feature
 * source is an inline string with throwaway step bodies. Here the source is a committed file, the
 * step texts are the ones `spec/behaviors/01-steps-and-world.md` publishes, and the Scenario carries
 * a `@REQ-EC-NNN` tag that joins `spec/traceability.md` section 5.
 *
 * ## What this dogfoods
 *
 * `spec/behaviors/01-steps-and-world.md`'s "Worked example" — the Given/When/Then/`World` base case,
 * whose `World` shape at lines 291-298 is reproduced below field for field. The `{int}` placeholders
 * in that example's step patterns are the same ones the `.feature` file supplies concrete values for.
 *
 * ## Two deliberate deviations from that worked example
 *
 * Both are recorded here rather than silently absorbed, because a reader comparing the two files will
 * otherwise read them as drift. `packages/vitest/test/acceptance/README.md` states both as standing
 * conventions for this whole directory.
 *
 * 1. **`loadFeature` comes from `@effect-cucumber/gherkin`, not from `@effect-cucumber/vitest`.** The
 *    worked example opens with `import { describeFeature, loadFeature } from "@effect-cucumber/vitest"`,
 *    and that `loadFeature` is ADR-EC-024's `ManagedRuntime`-backed wrapper, which is not exported and
 *    is the one export `packages/vitest` is still missing (`spec/behaviors/03`'s own caveat block says
 *    so). Phase 11 adds no public API, so this file reaches the gherkin package's Effect-returning
 *    `loadFeature` and provides `NodeFileSystem.layer` plus `ParameterTypeStore` itself — exactly what
 *    that caveat block says a caller does today.
 * 2. **`describeFeature` is imported by relative path from `../../src/describeFeature.ts`, not from
 *    the package barrel.** A real consumer writes
 *    `import { describeFeature } from "@effect-cucumber/vitest"`. This suite lives INSIDE the package
 *    it consumes, and oxlint's `effect/no-import-from-barrel-package` runs with
 *    `checkRelativeIndexImports: true`, so a relative import of `index.ts` fails `pnpm lint`. The
 *    module object reached here is the same one the barrel re-exports; `emission.test.ts`,
 *    `Step.test.ts` and `describeFeature.test.ts` all take the same path for the same reason.
 *
 * ## Why the filename ends `.steps.test.ts` and not `.steps.ts`
 *
 * The suffix is load-bearing, not decorative. Vitest's default include glob is
 * `**\/*.{test,spec}.?(c|m)[jt]s?(x)`, and `vitest.config.ts` note (c) forbids changing the include
 * and exclude globs. A file named `worked-example-01-apples.steps.ts` would be collected by nothing:
 * no error, no failing test, just a Feature that silently never runs. Every acceptance pair in this
 * directory carries the same suffix for the same reason.
 *
 * ## Top-level `await`, not `Effect.runSync`
 *
 * `NodeFileSystem.readFileString` suspends internally, so `Effect.runSync` over a path-based
 * `loadFeature` throws `AsyncFiberError` — reproduced against the real package, not assumed
 * (`packages/gherkin/test/loadFeature.test.ts`'s header, and ADR-EC-021's correction inside
 * BEH-EC-001). `describeFeature` must be called at MODULE scope with an already-resolved feature
 * value, and ESM's genuine top-level `await` is what reconciles the two: vitest's module loader waits
 * for it to settle before collecting anything below.
 *
 * ## Cross-step state goes through a `Ref` on `World`, never a closure variable
 *
 * Every value one step writes for a later step in the same Scenario lives in a `Ref` obtained from
 * the Layer-provided `World` service (RUN-06, INV-EC-006, ADR-EC-009). There is no `let`, no `var`,
 * and no module-scope mutable holder standing in for one — the module-scope escape hatch is closed
 * too, because satisfying the letter of the no-`let` rule with a module-scope array defeats its
 * entire intent (PROH-11-03).
 *
 * ## Imports
 *
 * `assert` from `@effect/vitest` inside step bodies, never `expect`: oxlint's
 * `vitest/no-standalone-expect` does not recognise an Effect-bodied test as a test block. Same rule,
 * same workaround, as `emission.test.ts`, `Step.test.ts` and `describeFeature.test.ts`.
 */
import { loadFeature, ParameterTypeStore } from "@effect-cucumber/gherkin"
import * as NodeFileSystem from "@effect/platform-node/NodeFileSystem"
import { assert } from "@effect/vitest"
import * as Context from "effect/Context"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as Ref from "effect/Ref"
import { fileURLToPath } from "node:url"
import { describeFeature } from "../../src/describeFeature.ts"

/**
 * The `.feature` file beside this one, resolved relative to this module rather than to
 * `process.cwd()`, so the pair keeps working whichever directory the runner was invoked from.
 */
const featurePath = fileURLToPath(new URL("./worked-example-01-apples.feature", import.meta.url))

/** The load-bearing line: real bytes off disk, through the real parser, at module top level. */
const feature = await Effect.runPromise(
  loadFeature(featurePath).pipe(Effect.provide(Layer.mergeAll(NodeFileSystem.layer, ParameterTypeStore.Default)))
)

/**
 * The test author's own `World`, shape for shape from `spec/behaviors/01-steps-and-world.md`
 * lines 291-298, plus one field.
 *
 * The library ships no `World` type (BEH-EC-004): what it ships is the constraint that the DECLARED
 * shape is the REACHABLE shape. `apples` is declared here, so a step can read it; a field that is not
 * declared here is a plain `TS2339` at the read site, which `scripts/verify-tsgo-gate.sh` assertion 7
 * is what actually proves — no running test can assert about code that does not compile.
 *
 * `basket` is the second declared field, and it is here so that DSL-03's Scenario has a field to
 * exercise that is distinct from the one the worked example already uses. Both are `Ref`s, because
 * every value one step writes for a later step in the same Scenario has to be (RUN-06, INV-EC-006).
 */
class World extends Context.Service<World, {
  readonly apples: Ref.Ref<number>
  readonly basket: Ref.Ref<ReadonlyArray<string>>
}>()("World") {
  static readonly layer = Layer.effect(
    this,
    Effect.gen(function*() {
      return World.of({ apples: yield* Ref.make(0), basket: yield* Ref.make<ReadonlyArray<string>>([]) })
    })
  )
}

// THE CALL UNDER TEST. Module scope, nothing wrapping it, nothing intercepting it — exactly the call
// a consumer writes. Everything below is asserted by vitest RUNNING what this registered.
describeFeature(feature, World.layer, ({ Scenario }) => {
  Scenario("Eating apples", ({ Given, Then, When }) => {
    Given("I have {int} apples", function*(n: number) {
      const { apples } = yield* World
      yield* Ref.set(apples, n)
    })

    When("I eat {int} apples", function*(n: number) {
      const { apples } = yield* World
      yield* Ref.update(apples, (remaining) => remaining - n)
    })

    Then("I have {int} apples left", function*(expected: number) {
      const { apples } = yield* World
      // Read back through the SAME `Ref` the two steps above wrote. Comparing against a value
      // recomputed here would pass with the cross-step plumbing removed.
      const actual = yield* Ref.get(apples)
      assert.strictEqual(actual, expected)
    })
  })

  // DSL-02 (BEH-EC-003). Every step body in this file is a BARE generator function — none is
  // pre-wrapped with `Effect.fn` — so the registrar accepted an unwrapped generator and the library
  // wrapped it. What makes this Scenario the one that CLAIMS that, rather than a fourth restatement
  // of it, is that the value asserted below is computed inside the body from the Gherkin file's own
  // argument: 21 arrives as a `number`, the body doubles it, and 42 is read back out. A registrar
  // that accepted the generator and never invoked it leaves `apples` at the Layer's 0.
  Scenario("A bare generator step body is registered and run", ({ Then, When }) => {
    When("I double {int} apples", function*(n: number) {
      const { apples } = yield* World
      yield* Ref.set(apples, n * 2)
    })

    Then("the doubled count is {int}", function*(expected: number) {
      const { apples } = yield* World
      assert.strictEqual(yield* Ref.get(apples), expected)
    })
  })

  // DSL-03 (BEH-EC-004), positive half. `basket` IS declared on `World`'s shape above, so a step may
  // read it and gets back what the previous step wrote. The negative half — that a field ABSENT from
  // that shape is unreachable — is a claim about what does not compile, so no test here can make it;
  // `scripts/verify-tsgo-gate.sh` assertion 7 carries it, and the section 5 row says so.
  Scenario("A World field is typed and reachable", ({ Given, Then }) => {
    Given("I put {string} and {string} in the basket", function*(first: string, second: string) {
      const { basket } = yield* World
      yield* Ref.update(basket, (held) => [...held, first, second])
    })

    Then("the basket holds {string}", function*(expected: string) {
      const { basket } = yield* World
      assert.strictEqual((yield* Ref.get(basket)).join(","), expected)
    })
  })

  // DSL-01 (BEH-EC-002), positive half — the project's core value, from the runtime side. The step
  // below yields `World` and the ambient Layer resolves it. The negative half is the whole point of
  // the requirement and is unstatable here: a step requiring a service the ambient Layer does NOT
  // provide is a type error at authoring time, so there is no runtime in which to observe it.
  // `scripts/verify-tsgo-gate.sh` assertions 5, 6 and 8 carry it, and the section 5 row says so.
  //
  // The `Given` records what it FOUND rather than merely resolving and discarding it, so the
  // assertion is about a value that came out of the Layer's own build effect (`Ref.make(0)` and
  // `Ref.make([])`) rather than about the step having run at all.
  Scenario("A step reaches a service the ambient Layer provides", ({ Given, Then }) => {
    Given("a step resolves the ambient World service", function*() {
      const { apples, basket } = yield* World
      const reading = `${yield* Ref.get(apples)} apples, ${(yield* Ref.get(basket)).length} in the basket`
      yield* Ref.update(basket, (held) => [...held, reading])
    })

    Then("the resolved World reported {string}", function*(expected: string) {
      const { basket } = yield* World
      assert.deepStrictEqual(yield* Ref.get(basket), [expected])
    })
  })
})
