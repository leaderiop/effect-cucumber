/**
 * The ONLY route by which `Runner.ts` reaches `describe` and `it.effect`.
 *
 * `Runner.ts` walks a plan and emits one `describe` per Feature and one test per Scenario. It does
 * that through an INJECTED object satisfying this interface, and it imports no test framework of
 * any kind. `describeFeature.ts`'s composition root is the single place that decides which real
 * implementation to pass, and TWO of them exist. `vitestTestApi` closes over the MODULE-LEVEL
 * `describe`/`it.effect` from `@effect/vitest` and is the default, per-Scenario path.
 * `sharedLayerTestApi` closes over the `it` that `layer(shared)((it) => …)` hands its callback —
 * the one carrying the shared Layer's services — and additionally provides a fresh simulated clock
 * and console per emitted node (ADR-EC-018). This is Pattern 3 of
 * `.planning/research/ARCHITECTURE.md`.
 *
 * Four things about this module are not visible from the code.
 *
 * (a) **No import from `vitest` or `@effect/vitest` may ever appear in this file or in
 *     `Runner.ts` — not even an `import type`.** The seam exists to disarm a verified trap, not to
 *     add indirection for its own sake. `.planning/research/ARCHITECTURE.md`'s Anti-Pattern 3
 *     records it: `layer(sharedLayer)` hands its callback a `Vitest.MethodsNonLive<R>` carrying
 *     the shared Layer's services, and calling the MODULE-LEVEL `it.effect` inside that callback
 *     still compiles and still passes, because the Scenario provides its own Layers — while
 *     silently rebuilding the "shared" resource once per Scenario. That is a direct BEH-EC-007
 *     violation with no failing test anywhere, invisible until someone counts testcontainer
 *     starts. Routing every emission through an injected object makes the wrong `it` unreachable
 *     rather than merely discouraged, and it is what lets `Runner.ts` be tested against a
 *     recording fake with no vitest machinery in scope at all (plan 06-06). A type-only import
 *     here would put a test framework back into `Runner.ts`'s type graph and make that fake harder
 *     to write, not easier — so there is none.
 *
 *     One fact about that callback's object is what made the seam workable exactly as designed,
 *     rather than needing a third member: it is a `Vitest.MethodsNonLive`, and `MethodsNonLive` has
 *     NO `describe` member at all. So the shared-path implementation satisfies `describe` below with
 *     the MODULE-LEVEL one, and that is legitimate precisely because `describe` carries no Layer
 *     services — it opens a block and nothing else, so there is nothing for it to rebuild silently.
 *     That is exactly what distinguishes it from the module-level `it.effect`, which does carry
 *     context and which Anti-Pattern 3 forbids on that path. Only the member that carries services
 *     differs between the two implementations.
 *
 *     `MethodsNonLive` additionally has no `live` member (Pitfall 29). A Feature using a `shared`
 *     Layer therefore cannot opt one Scenario out of the simulated clock, so the two paths do NOT
 *     have identical capability surfaces. That is a documented limitation of the shared scope rather
 *     than a defect, and not something this interface could paper over: a member present on one path
 *     and throwing on the other would be worse than its absence.
 *
 * (b) **`skip` and `contextFree` are FIELDS on `EmitOptions`; `only` has no representation here at
 *     all.** The three halves of this note are different KINDS of statement, and conflating them is
 *     the mistake it exists to prevent: the first two are shape choices with a live alternative, the
 *     third is a behavior decision with none.
 *
 *     `contextFree` (plan 10-07) is `skip`'s argument applied unchanged to a second field: it keeps
 *     this interface at TWO members and it makes `Runner.test.ts`'s recording fake grow a second
 *     recorded VALUE rather than a routing decision the fake cannot see. It exists so `Runner.ts` can
 *     tell `describeFeature.ts`'s composition root WHICH KIND of node an emission is — a Scenario, or
 *     one of the two synthetic node kinds — without importing or naming a test framework to do it
 *     (note (a) above is unweakened by this field; it is library-owned plain data, exactly as `tags`
 *     and `skip` already are).
 *
 *     `skip` could have been a second, skip-specific emission member beside `effect` — the test
 *     framework's own tester exposes exactly that — and it is a field on the options object
 *     instead, for two reasons. It keeps this interface at TWO members, so `Runner.ts` has one
 *     emission call to reason about rather than a branch choosing between two calls that must stay
 *     in step. And it makes 06-06's recording fake grow a recorded VALUE, comparable in an
 *     assertion, rather than a second method whose only observable is whether it was called — a
 *     fake carrying a member no assertion covers is how a fake starts drifting from the thing it
 *     fakes.
 *
 *     `only` is absent permanently, and that is a behavior decision rather than a deferral to some
 *     later plan. D-06 never routes `@only` to the test framework's only-mode: an `@only`-tagged
 *     Scenario is emitted as a plain tagged test, indistinguishable in shape from an untagged one.
 *     That is precisely what makes a committed `@only` unable to fail a CI run — the framework's
 *     `allowOnly` check is reachable only from branches guarded by some task ALREADY being in
 *     only-mode, so emitting no such task makes the check unreachable rather than merely
 *     un-triggered. Running a single Scenario locally is a caller-side `--tagsFilter '@only'`
 *     choice (ADR-EC-020), which is not something this seam could offer even if it wanted to.
 *     `Tags.ts` note (c) is the same argument from the predicate side.
 *
 * (c) **`define` returns `void`, never `void | Promise<void>`.** An async block callback returns
 *     before registering anything, so the Feature emits zero tests and PASSES — the exact failure
 *     mode `describeFeature.ts` note (c) names one layer up, restated here because this layer can
 *     reintroduce it independently. The type is the only thing that forbids it.
 *
 * (d) **`Scope.Scope` appears ONLY in the Effect's required-context position, and is never hoisted
 *     onto `TestApi` itself.** `Dsl.ts` note (b) is the reasoning and it applies unchanged: `Scope`
 *     is supplied by the runner, not by anything the test author reasons about, and putting it on
 *     the interface would make every error message name a service nobody mentioned. By the time a
 *     Scenario Effect reaches `effect`, `ScenarioEffect.ts` has already provided the Feature's
 *     Layer, so `Scope` is all that is left — and `@effect/vitest`'s module-level `effect` export
 *     is typed `Vitest.Tester<Scope.Scope>`, whose `self` position accepts exactly a
 *     `() => Effect.Effect<A, E, Scope.Scope>`. That assignability was verified against the
 *     installed `@effect/vitest@4.0.0-rc.112`'s own `dist/index.d.ts`, not assumed.
 *
 * This module contains types only: no `const`, no function, no runtime value at all. Both imports
 * are `import type`, so the emitted `dist/TestApi.js` carries zero statements beyond the bare
 * `export {}` that `moduleDetection: "force"` requires of every file. `Dsl.ts` is the precedent. If
 * a runtime statement ever appears in that emit, something was added here that does not belong.
 *
 * Its only imports are two `import type`s from `effect/*`. It is INTERNAL and is not re-exported
 * from `packages/vitest/src/index.ts`: a consumer never constructs a `TestApi`, and publishing it
 * would freeze an internal seam into the package's contract before the one module it exists for
 * has used it once — the same precedent `Registry.ts` and `collectFeature` already set.
 */
import type * as Effect from "effect/Effect"
import type * as Scope from "effect/Scope"

/**
 * How ONE emitted test node differs from a bare, untagged, running one — the library's own plain
 * data, carried across the seam and translated into whatever the real test framework wants by the
 * adapters in `VitestTestApi.ts`.
 *
 * This type names no framework type and must not start to. Modelling the framework's own options
 * type here would type-check, lint clean, pass every test in the repo, and quietly dissolve the seam
 * note (a) exists to hold open — which is why `scripts/verify-testapi-seam.sh` now scans this file
 * structurally rather than trusting the convention. `Errors.ts`'s plain-data warnings are the
 * in-package precedent for the shape: every field `readonly`, arrays `ReadonlyArray`, one doc
 * comment per field saying what the code cannot.
 */
export interface EmitOptions {
  /**
   * Every tag the Scenario carries, `@` prefixes intact, in feature → rule → scenario →
   * examples-block order.
   *
   * The array arrives ALREADY FLATTENED. `@effect-cucumber/gherkin`'s `compile()` stacked the
   * inheritance chain and `ScenarioPlan.tags` carried it here verbatim; nothing between the parse
   * and this field re-derives, re-sorts, de-duplicates or strips a prefix. The literal `@` is the
   * contract (D-04) — it is the exact byte sequence a `--tagsFilter '@slow'` invocation matches
   * against, so normalising it away would silently break every filter a consumer writes.
   *
   * `ReadonlyArray`, matching `Model.ts` and `Plan.ts` all the way up the chain. The single
   * widening to a mutable array happens in `VitestTestApi.ts`'s adapter, at the one point that
   * already touches the test framework, and NOWHERE else: a mutable array declared further up would
   * let any stage in between rewrite a Scenario's tags with nothing going red.
   */
  readonly tags: ReadonlyArray<string>
  /**
   * `true` for a `@skip`-tagged Scenario (D-05) — emitted as a real skipped test, never omitted and
   * never quietly passed.
   *
   * A skipped test's `self` thunk is NEVER invoked. That single fact is what makes two of this
   * phase's guarantees structural rather than arranged, and both are worth stating because both
   * look like things somebody would otherwise have to arrange:
   *
   * - A `@skip` Scenario's `Before`/`After` hooks do not run. `ScenarioEffect.ts` weaves every hook
   *   INSIDE the Effect `buildScenarioEffect` returns, and `Runner.ts` note (b) guarantees that
   *   function is only ever called inside the thunk. Thunk never invoked ⇒ `buildScenarioEffect`
   *   never called ⇒ no hook Effect is ever even constructed.
   * - A `@skip` Scenario containing an unresolved step reports SKIPPED, not undefined-step.
   *   `planFeature` does not throw on an unresolved step; it stores one, and its `StepMatchError` is
   *   only reached at `yield*` time inside the Effect that is never built.
   */
  readonly skip: boolean
  /**
   * Which EMISSION ROUTE this node takes on the shared path — `true` selects the Layer-free route.
   *
   * The emitter sets this per node KIND, never by analysing a body: only the library's own `⚠`
   * nodes are `true`. Every Scenario is `false` unconditionally, even one whose steps happen to
   * need nothing, because the flag is a routing decision and a Scenario's body is the author's.
   *
   * The `⚠ unused step definition` node is `contextFree: true`: its whole body is `Effect.void`, so
   * it needs nothing the shared tier or the per-Scenario tier provides. It is the ONLY node kind
   * that is: a Feature's `AfterAllScenarios` teardown is not a node at all any more — it goes through
   * `afterAll` below and reaches the shared tier through the adapter, never through this flag.
   *
   * Setting `true` on a Scenario is the mirror of that mistake and is WORSE, because one of its two
   * outcomes is silent: a Scenario naming a shared service fails loudly with a missing-service
   * defect, but one that only reads the clock or console runs against the framework's own per-test
   * services instead of `sharedLayerTestApi`'s `Effect.provide(testEnv)` — ADR-EC-018's isolation
   * argument no longer covers it, and nothing goes red. Nothing in the type system, in `Runner.ts`,
   * or in any test prevents a Scenario emission from carrying `contextFree: true` today; this note
   * is the only guard until one exists.
   *
   * Required, not optional, for note (b)'s stated reason applied unchanged here: an optional field
   * lets a future call site simply forget it and emit through whichever route the default happens to
   * be, with nothing going red — which is precisely the shape of the defect this field closes (a
   * `shared` Layer built for a Feature with every Scenario excluded, forced open by an always-passing
   * warning node routed through the shared constructor). Extending note (b) rather than writing a new
   * note: it already explains why a field beats a third interface member (one emission call to reason
   * about; a recorded VALUE the fake can compare rather than a method whose only observable is
   * whether it was called), and both halves of that argument apply to this field verbatim.
   *
   * Every Scenario node is `contextFree: false` — a Scenario's body is the author's own step Effects,
   * which may require anything either Layer tier provides.
   */
  readonly contextFree: boolean
}

/**
 * The subset of a test framework's surface `Runner.ts` uses — three members, and no more.
 */
export interface TestApi {
  /**
   * Open a nested block named `name` and run `define` inside it.
   *
   * `Runner.ts` calls this once per Feature and, where a Feature has `Rule`s, once more per Rule
   * nested inside the Feature's block — the `describe(feature.name)` / `describe(rule.name)`
   * structure locked in `spec/glossary.md`.
   *
   * `define` returns `void`, never `void | Promise<void>` — note (c). An async callback registers
   * nothing before it returns, so the block would emit zero tests and pass, and the type is the
   * only thing that forbids it.
   */
  readonly describe: (name: string, define: () => void) => void
  /**
   * Emit one test named `name` whose body is `self`'s Effect.
   *
   * One Scenario, one test, with `Background` steps inlined as the leading `yield*`s of the same
   * Effect rather than a separate hook
   * ([ADR-EC-004](../../../spec/decisions/004-one-it-effect-per-scenario.md)).
   *
   * The error channel is `unknown`, not `never` and not `StepMatchError`. A Scenario can fail with
   * a `StepMatchError` from drift detection OR with whatever error the step author's own Effect
   * declares, and this seam has no business narrowing the second one — it hands the value to the
   * reporter and nothing more.
   *
   * `Scope.Scope` is the whole of the remaining required context — note (d).
   *
   * `options` is REQUIRED, and there is no `EmitOptions | undefined`. `Runner.ts` computes a value
   * for EVERY emission it makes, the synthetic `⚠` warning nodes included, so there is no call site
   * that legitimately has nothing to say. An optional parameter
   * would let a future call site simply forget the argument and emit an untagged, never-skipped test
   * with nothing going red — the same reasoning `describeFeature.ts`'s required-fields comment and
   * `Runner.ts`'s required maps already apply one layer up.
   */
  readonly effect: (
    name: string,
    self: () => Effect.Effect<void, unknown, Scope.Scope>,
    options: EmitOptions
  ) => void
  /**
   * Run `self`'s Effect ONCE after every test in the CURRENT block has finished — whether the run
   * was whole or narrowed by `-t`/`--tagsFilter` to a single test in it, and after a failure.
   *
   * `Runner.ts` registers a Feature's `AfterAllScenarios` teardown through this, inside the
   * Feature's own block (note (e) there). A test node cannot carry that guarantee: test selection
   * skips it. A block-level teardown hook can, and the adapter in `VitestTestApi.ts` maps this
   * onto the framework's own `afterAll`, running the Effect against the same shared tier the block's
   * tests saw. `name` is reporting data only — the framework's hooks are anonymous, so it appears in
   * a failure's message rather than as a node title.
   *
   * The framework's own scope-closing hook is registered before this one and runs AFTER it (hooks of
   * this kind run in reverse registration order), so the shared tier is still open when the teardown
   * runs. That ordering is the framework's default and is what the adapter relies on.
   */
  readonly afterAll: (name: string, self: () => Effect.Effect<void, unknown, Scope.Scope>) => void
}
