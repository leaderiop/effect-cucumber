/**
 * The two concrete `TestApi` adapters over `@effect/vitest` (F-22).
 *
 * The ONLY module in this package that names a test framework: `Runner.ts` and `TestApi.ts` are
 * forbidden to (`scripts/verify-testapi-seam.sh`), and `describeFeature.ts` composes these rather
 * than reaching for the framework itself.
 */
import { afterAll, beforeAll, describe, it, layer, type Vitest } from "@effect/vitest"
import * as Effect from "effect/Effect"
import * as Exit from "effect/Exit"
import * as Layer from "effect/Layer"
import * as Scope from "effect/Scope"
import * as TestClock from "effect/testing/TestClock"
import * as TestConsole from "effect/testing/TestConsole"
import { makeUndeclaredTagWarning } from "./Errors.ts"
// `StepBody` is declared in `Plan.ts` and borrowed here, never the reverse — and the planning stage
// is imported FROM there INTO this module, so an edge pointing back the other way would be an
// `import/no-cycle` violation and a `pnpm circular` failure. See that module's closing paragraph.
import type { ErasedLayer } from "./Plan.ts"
// The composite `scenarioLayers` key, in a LEAF module both this file and `Runner.ts` import rather
// than private to either — `ScenarioKey.ts`'s own header has the argument. `Runner.ts` reads back
// what the `Scenario` container below writes, and it cannot import this file (that edge would close a
// cycle with the `emitFeature` import above), so a shared leaf is the only way both sides can build
// one encoding instead of two that compile while disagreeing.
import type { TestApi } from "./TestApi.ts"

/**
 * The per-Scenario simulated clock and console, rebuilt here from the two PUBLIC `effect` modules.
 *
 * Four things about this constant are not visible from the code, and every one of them is
 * load-bearing for ADR-EC-018.
 *
 * The test framework has an equivalent of its own and does NOT export it — writing
 * `import { TestEnv } from "@effect/vitest"` does not compile. So it is reconstructed, and this
 * definition is equivalent to the framework's own, and `test/upstream-pin.test.ts` asserts that
 * equivalence against the installed build (a `TestClock` and a `TestConsole` are present under
 * `it.effect` and under `Effect.provide(testEnv)` alike). Both halves come from `effect` itself, so
 * nothing here depends on a private export staying where it is.
 *
 * The clock half is CALLED, with parens. `TestClock.layer` without them is the constructor function,
 * not a Layer, and dropping the parens is the single most plausible tidy-up on this line. It would
 * silently reintroduce the cross-Scenario clock leak ADR-EC-018 exists to prevent — the one where a
 * Scenario that runs after another Scenario advanced the clock starts at the advanced time.
 *
 * A MODULE-SCOPE binding is safe precisely because a Layer is a BLUEPRINT and not a built value:
 * every `Effect.provide(testEnv)` builds its own clock and its own console, so one constant serves
 * every Scenario in every Feature without any of them sharing state. Hoisting a BUILT context here
 * instead — "it is only test services, build it once" — is exactly the leak above, arrived at from
 * the other direction. Measured during this phase's planning: three Scenarios under one shared Layer
 * each read `Clock.currentTimeMillis` as 0, after a preceding Scenario had advanced the clock by an
 * hour.
 *
 * It is used on the SHARED path only, and provided per EMITTED NODE — note (e). The default path
 * gets an equivalent pair from the framework's own test constructor, per test, and needs nothing
 * from here.
 */
export const testEnv = Layer.mergeAll(TestConsole.layer, TestClock.layer())
/**
 * D-08's catch-and-degrade, as ONE implementation shared by BOTH concrete adapters below.
 *
 * One and not two, because the adapters differ in exactly one thing — which framework `it` they emit
 * through — and this recovery must be identical on both. Duplicating it is how the shared path
 * silently loses the degradation: a missing `catch` block turns nothing red, because the failure it
 * recovers from happens only for a Feature that carries a tag no `vitest.config.ts` declares.
 *
 * `emit` takes the same three arguments the framework's own test constructor does, with `tags`
 * OPTIONAL — that optionality is what lets the fallback below OMIT the key rather than pass an empty
 * array, which is the difference between not reaching the check that just threw and reaching it with
 * a value it would have to validate.
 *
 * `[...options.tags]` is THE single tag-array widening in this package: `EmitOptions.tags` is a
 * `ReadonlyArray<string>` — as it is in `Model.ts`, `Plan.ts` and `TestApi.ts`, all the way from the
 * parse — while vitest's own options type wants a mutable `string[]`. It lives here because this is
 * already the one module permitted to name a test framework at all. Widening `ScenarioPlan.tags` or
 * `EmitOptions.tags` instead would "fix" the same assignment error by letting every stage upstream
 * rewrite a Scenario's tags in place.
 *
 * ## The `try`/`catch`: D-08's catch-and-degrade
 *
 * `vitest@4.1.11`'s `strictTags` defaults to `true`, so emitting a tag no `vitest.config.ts` declares
 * THROWS. Left alone, that throw escapes collection and the ENTIRE `.feature` file reports zero tests
 * collected — one undeclared tag on one Scenario deleting every Scenario in the file, which is the
 * failure mode this block exists to convert into one warning about one Scenario.
 *
 * Four facts here were established by RUNNING it (RESEARCH Finding 3), not by reading the framework
 * or reasoning about it, and each one is load-bearing for the shape below:
 *
 * - the throw is SYNCHRONOUS from the emission call, so an ordinary `try`/`catch` around that one
 *   statement actually catches it — nothing is on a promise or an event loop turn;
 * - nothing is left half-registered by it, so the catch path is not cleaning up after a partial
 *   registration and does not need to;
 * - the tagless re-emission registers CLEANLY from inside the catch block; and
 * - every later sibling in the same file still collects afterwards, which is the whole point —
 *   degradation is local to the Scenario rather than to the file.
 *
 * The consequence a reader needs, and the reason this warns rather than staying silent: the Scenario
 * RUNS, but its tags do not exist as far as the runner is concerned, so a `--tagsFilter` invocation
 * naming any of them cannot select it. The `.feature` file still says the tag is there and the runner
 * disagrees. That is a discrepancy no test failure will ever surface, so the warning names the file,
 * the Scenario, every tag the Scenario carried, and where to declare them. It names the WHOLE tag
 * list and says at least one of them is undeclared, rather than naming the offenders: the offending
 * subset appears only in the framework's own message text, and the structural discrimination below
 * is precisely a refusal to read that text. `Errors.ts`'s note on `UndeclaredTagWarning.tags`
 * carries the argument.
 *
 * ## Why the failure is discriminated STRUCTURALLY, and never by message, name or class
 *
 * Not every throw from an emission call is about tags, and swallowing an unrelated one behind an
 * untagged re-emission would be a silent loss of signal (T-09-05-03). The obvious discriminator is
 * the caught value's `message`, its `name`, or an `instanceof` against a framework error type, and
 * all three are refused here. This repo's rule since plan 03-01 is that upstream PROSE never becomes
 * a contract — a wording change in a dependency's patch release would silently turn this branch off,
 * and the framework's own message for this case is additionally known to contain a typo, so matching
 * it would mean encoding somebody else's bug as our condition.
 *
 * The discriminator used instead is an OUTCOME, and it is exact rather than heuristic: the fallback
 * emission carries NO tags at all, so `strictTags` has nothing to reject in it. If the fallback
 * throws too, the failure was categorically not about tags — and in that case the ORIGINAL caught
 * value is re-thrown, unmodified and unwrapped, because it is the one that describes what actually
 * went wrong. Replacing it with the fallback's throw, or with an error of ours, would name the
 * recovery attempt instead of the defect.
 *
 * ## Order inside the catch: re-emit FIRST, then warn
 *
 * The two statements read equally well in either order and only one is correct. `console.warn` is a
 * call into a host object a consumer's setup file is free to have replaced, so it can throw; if it
 * did, and it ran first, the Scenario would be left unregistered — silently absent from the run,
 * which is precisely the file-level disappearance this whole block exists to prevent, narrowed to one
 * Scenario. Registration is the guarantee and the warning is the report, so the guarantee goes first.
 *
 * @param featureUri - the `.feature` file every warning from this adapter is located against
 * @param emit - the framework emission to degrade around, taking the framework's own three arguments
 */
const makeDegradingEffect = (
  featureUri: string,
  emit: (
    name: string,
    self: Parameters<TestApi["effect"]>[1],
    options: { readonly tags?: Array<string>; readonly skip: boolean }
  ) => void
): TestApi["effect"] =>
(name, self, options) => {
  try {
    emit(name, self, { tags: [...options.tags], skip: options.skip })
  } catch (cause) {
    try {
      // The SAME name and the SAME thunk, so the Scenario a reader is looking for is still the one
      // that appears — and `skip` preserved, because a `@skip` Scenario whose tags were undeclared
      // is still a skipped Scenario. Only `tags` is dropped, and it is OMITTED rather than passed
      // as an empty array: an empty array is a value `strictTags` would have to validate, and the
      // one thing this call must not do is reach the check that just threw.
      emit(name, self, { skip: options.skip })
    } catch {
      // Structural discrimination, and the only branch that reaches it: an emission with no tags
      // cannot fail `strictTags`, so whatever is wrong here was never about tags. `cause` and not
      // the inner throw — the original is the one that describes the defect.
      throw cause
    }
    console.warn(
      makeUndeclaredTagWarning({ uri: featureUri, scenarioName: name, tags: options.tags }).message
    )
  }
}
/**
 * The DEFAULT path's concrete `TestApi` — the module-level `describe`/`it` pair, built once PER
 * FEATURE by this factory. Note (e).
 *
 * It used to be a module-scope constant and is not one any more, for exactly one reason: `featureUri`.
 * D-08's warning has to name the `.feature` file it came from, a uri is per-Feature data, and module
 * scope is the one place in this file where no Feature exists yet. What did NOT change is the part
 * note (e) is actually about — the concrete framework objects are still constructed HERE and nowhere
 * else, and `pnpm verify:testapi-seam` still enforces that. A factory is not a second seam.
 *
 * `describe` is vitest's own and is re-exported by the package this module imports it from; the
 * Effect-aware test constructor is that package's, and its `self` parameter is
 * `() => Effect<A, E, Scope>`, which is exactly what `TestApi.effect` declares (`TestApi.ts` note
 * (d), verified against the installed build rather than assumed).
 *
 * The thunk is forwarded UNWRAPPED. The framework's own module-level test constructor already
 * provides a fresh simulated clock and console per test, so `testEnv` has no business on this path —
 * providing it here as well would be a second, redundant pair layered over the framework's own.
 *
 * @param featureUri - the `.feature` file every warning from this adapter is located against
 */
export const vitestTestApi = (featureUri: string): TestApi => ({
  // `shuffle: false`: a Feature's Scenarios run in DOCUMENT order even under `--sequence.shuffle`
  // (BEH-EC-002). Gherkin order is meaningful — a hooks Feature whose second Scenario observes the
  // first's teardown is the acceptance suite's own example — so the block opts out of shuffling.
  describe: (name, define) => {
    describe(name, { shuffle: false }, define)
  },
  effect: makeDegradingEffect(featureUri, (name, self, emitOptions) => {
    it.effect(name, self, emitOptions)
  }),
  // The framework's own block-level teardown hook, run to a Promise the way its Effect-aware test
  // constructor would run a body: scoped, against a fresh simulated clock and console. Nothing on the
  // plain path has a shared tier to reach.
  afterAll: (_name, self) => {
    afterAll(() => Effect.runPromise(self().pipe(Effect.scoped, Effect.provide(testEnv))))
  }
})
/**
 * The SHARED path's concrete `TestApi` — the second one, and the reason note (e) says the seam is a
 * PARAMETER rather than an import.
 *
 * **The Feature block IS `layer(...)`'s own `describe`.** `Runner.ts` emits exactly one top-level
 * `describe` per Feature, first, before any test node (`emitFeature`'s walk opens it before either
 * Scenario loop). This adapter's `describe` therefore opens the FIRST block it is asked for as its
 * OWN `describe(name, { shuffle: false }, factory)` and calls the framework's `layer(sharedTier,
 * options)(callback)` — the one-argument form — INSIDE that factory. At that moment the current
 * suite is the Feature block, so the framework's `beforeAll(build)` and `afterAll(closeScope)` land
 * on it: the shared tier is built when the Feature's block starts and released when it ends, not
 * when the whole file does (ADR-EC-018 implementation notes 8 and 9; BEH-EC-007). Owning the
 * `describe` is what lets the block carry `shuffle: false`, the same document-order guarantee the
 * plain path gives (BEH-EC-002). Every later `describe` — a Rule's — is nested inside, unshuffled
 * too. Measured: `Feature > Rule > Scenario`, one Feature-named level;
 * `emission.test.ts`'s lifecycle block observes the release point from the second Feature.
 *
 * The one-argument form called at FILE level (this adapter's first shape) registered its hooks on
 * the file suite, because vitest defers a `describe` factory and the form diffs the CURRENT suite's
 * task list; called inside the Feature's own factory, the current suite is the Feature. That is
 * the "released at file end" divergence BEH-EC-007's first correction records, and why the call
 * site moved.
 *
 * **`memoMap` is passed in, never made here**, so the composition root and any hook that must reach
 * the SAME memoised build (`afterAll` below) share one map: `Layer.buildWithMemoMap` against the map
 * the framework built through is a memo HIT, refcounted, never a rebuild.
 *
 * **Two emission routes**, chosen per node by `EmitOptions.contextFree`: the library's own `⚠` nodes,
 * whose body is `Effect.void`, go through the module-level constructor (`vitestTestApi`'s `effect`,
 * reused as a value so `makeDegradingEffect` stays ONE implementation); every Scenario goes through
 * the `it` the framework's callback handed back, which carries the shared tier's services.
 *
 * **`Effect.provide(testEnv)` at the EMISSION boundary** is ADR-EC-018's per-Scenario clock/console
 * isolation, and `excludeTestServices: true` at the `layer(...)` call is its other half; the two guard
 * DIFFERENT services (ADR-EC-018 note 4) and neither is redundant. `ScenarioEffect.ts` stays ignorant
 * of the two paths (its note (b)).
 *
 * Pitfall 29: the `it` the framework hands back is a `MethodsNonLive` with no `live` member, so a
 * Feature using a `shared` Layer cannot opt one Scenario out of the simulated clock. Documented
 * limitation, not a defect.
 *
 * @param featureUri - the `.feature` file every warning from this adapter is located against
 * @param sharedTier - the Feature's shared Layer, built once for the Feature's block
 * @param memoMap - the memo map the framework builds `sharedTier` through
 */
export const sharedLayerTestApi = (featureUri: string, sharedTier: ErasedLayer, memoMap: Layer.MemoMap): TestApi => {
  const contextFreeEffect = vitestTestApi(featureUri).effect
  // Set by the FIRST `describe` — the Feature block — and read by every emission inside it. `null`
  // before that block opens: an emission arriving earlier has no shared tier to run against, and
  // silently routing it to the module-level constructor would be Anti-Pattern 3 (the shared resource
  // rebuilt per Scenario), so it throws instead.
  let sharedIt: Vitest.MethodsNonLive<any> | null = null
  const requireSharedIt = (member: string): Vitest.MethodsNonLive<any> => {
    if (sharedIt === null) {
      throw new Error(
        `describeFeature: the shared-path TestApi's ${member} was called before its first describe — Runner.ts must open the Feature block before emitting anything into it.`
      )
    }
    return sharedIt
  }
  const sharedRouteEffect = makeDegradingEffect(featureUri, (name, self, emitOptions) => {
    requireSharedIt("effect").effect(name, () => self().pipe(Effect.provide(testEnv)), emitOptions)
  })
  // The module-level `describe`, under a name oxlint's vitest rules do not recognise as a test-file
  // call: this is a library adapter forwarding a block, not a test declaring one.
  return {
    describe: (name, define) => {
      if (sharedIt !== null) {
        describe(name, { shuffle: false }, define)
        return
      }
      // The Feature block is OUR `describe` (so it can carry `shuffle: false`, like the plain path),
      // and the framework's `layer(...)` is called INSIDE its factory in the one-argument form: at that
      // moment the current suite is this block, so the framework's `beforeAll(build)` and
      // `afterAll(closeScope)` land on the Feature block exactly as the named `layer(...)(name, cb)` form's would. Measured by
      // `emission.test.ts`'s lifecycle block and `verify-shared-layer-once.sh`.
      describe(name, { shuffle: false }, () => {
        // HOLD one memo-map reference to the shared build for the whole block. The framework's
        // one-argument form closes ITS scope from the last block test's `onTestFinished` — before any
        // `afterAll` runs — so without this hold the AfterAllScenarios teardown (registered below,
        // during `define()`) would find the memoised build released and rebuild it. `beforeAll` here
        // is registered FIRST and so runs first; the release `afterAll` is registered before the
        // framework's and the teardown's, and under vitest's default `sequence.hooks: "stack"` runs
        // LAST — teardown, then the framework's close, then this release. Pinned by
        // `emission.test.ts`'s "teardown ... not a rebuild" observer and `verify-shared-layer-once.sh`.
        const hold = Scope.makeUnsafe()
        beforeAll(() => Effect.runPromise(Effect.asVoid(Layer.buildWithMemoMap(sharedTier, memoMap, hold))))
        afterAll(() => Effect.runPromise(Scope.close(hold, Exit.void)))
        layer(sharedTier, { excludeTestServices: true, memoMap })((methods) => {
          sharedIt = methods
          define()
        })
      })
    },
    effect: (name, self, emitOptions) =>
      emitOptions.contextFree
        // Nothing here can force the shared Layer to build.
        ? contextFreeEffect(name, self, emitOptions)
        : sharedRouteEffect(name, self, emitOptions),
    // Registered INSIDE the Feature block (asserted by `requireSharedIt`), so it lands
    // on the Feature's own block after the framework's scope-closing `afterAll` and therefore runs
    // BEFORE it under the framework's default reverse hook order. The shared tier is reached by
    // building `sharedTier` through the SAME memo map the framework built it through: a memo hit,
    // refcounted against a scope of this hook's own, never a rebuild — measured against the installed
    // build, and the reason `memoMap` is a parameter of this adapter rather than a local.
    afterAll: (_name, self) => {
      requireSharedIt("afterAll")
      afterAll(() =>
        Effect.runPromise(
          Effect.scoped(
            Effect.gen(function*() {
              const scope = yield* Effect.scope
              const services = yield* Layer.buildWithMemoMap(sharedTier, memoMap, scope)
              yield* self().pipe(Effect.provide(testEnv), Effect.provide(services))
            })
          )
        )
      )
    }
  }
}
