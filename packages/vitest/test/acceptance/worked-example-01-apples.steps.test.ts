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
 * lines 291-298.
 *
 * The library ships no `World` type (BEH-EC-004): what it ships is the constraint that the DECLARED
 * shape is the REACHABLE shape. `apples` is declared here, so a step can read it; a field that is not
 * declared here is a plain `TS2339` at the read site, which `scripts/verify-tsgo-gate.sh` assertion 7
 * is what actually proves — no running test can assert about code that does not compile.
 */
class World extends Context.Service<World, { readonly apples: Ref.Ref<number> }>()("World") {
  static readonly layer = Layer.effect(
    this,
    Effect.gen(function*() {
      return World.of({ apples: yield* Ref.make(0) })
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
})
