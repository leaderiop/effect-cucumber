/**
 * The ONLY route by which `Runner.ts` reaches `describe` and `it.effect`.
 *
 * `Runner.ts` walks a plan and emits one `describe` per Feature and one test per Scenario. It does
 * that through an INJECTED object satisfying this interface, and it imports no test framework of
 * any kind. `describeFeature.ts`'s composition root is the single place that decides which real
 * implementation to pass — today the module-level `describe`/`it.effect` from `@effect/vitest`;
 * from Phase 10, the `it` that `layer(shared)(name, (it) => …)` hands its callback on the
 * shared-Layer path. This is Pattern 3 of `.planning/research/ARCHITECTURE.md`.
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
 * (b) **`skip` and `only` are deliberately absent.** `@effect/vitest`'s `Tester` has both, and
 *     ARCHITECTURE.md's Pattern 3 sketch shows both, but nothing in Phase 6 calls either: tag
 *     routing and `@skip` are RUN-05, which is Phase 9's job and the plan that adds them here.
 *     Declaring them now would put unreachable surface into the contract and force 06-06's
 *     recording fake to implement two members no assertion covers, which is how a fake starts
 *     drifting from the thing it fakes. This is an omission by decision, recorded per AGENTS.md
 *     §4, not a gap.
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
 * The subset of a test framework's surface `Runner.ts` uses — two members, and no more.
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
   */
  readonly effect: (name: string, self: () => Effect.Effect<void, unknown, Scope.Scope>) => void
}
