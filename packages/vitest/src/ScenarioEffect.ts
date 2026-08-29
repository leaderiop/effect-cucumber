/**
 * The ScenarioEffect stage: one `ScenarioPlan` in, one Effect out.
 *
 * `Plan.ts` has already done every join this pipeline needs — it matched each Pickle step against
 * the definitions visible to it, coerced the arguments, and recorded a typed failure for the steps
 * that resolved to none or to many. This module does the one thing left: it turns that list into a
 * single Effect in which the steps run in list order, the first failure stops every step after it,
 * and the Feature's Layer is available to all of them.
 * [ADR-EC-004](../../../spec/decisions/004-one-it-effect-per-scenario.md) is the decision record and
 * [INV-EC-001](../../../spec/invariants.md#inv-ec-001-fail-fast-is-structural-not-bookkept) is the
 * invariant this composition exists to make true.
 *
 * It knows nothing about matching, nothing about the scope chain, and — deliberately — nothing about
 * any test framework: it imports neither `vitest` nor `@effect/vitest`, not even as a type.
 * `Runner.ts` is what hands the result to `TestApi.effect`, and `TestApi.ts` note (a) is why that
 * separation is enforced rather than merely observed. Keeping this module this small is also what
 * makes INV-EC-001 assertable with a `Ref` counter and no test-framework machinery at all.
 *
 * **Background steps need no special handling here, and must not be given any.** `Correlate.ts`
 * builds `ParsedScenario.steps` from `pickle.steps`, which already carries the Background's steps
 * ahead of the Scenario's own — `Model.ts`'s "do not re-stack Background steps" — and `Plan.ts`
 * preserves that order verbatim. So ADR-EC-004's "Background inlined as the leading `yield*`s" is
 * satisfied by iterating the list exactly as given. Partitioning on `origin`, or lifting the
 * background steps into their own Effect and yielding it first, would at best reproduce the order
 * the list already has and at worst silently reorder it.
 *
 * Three things about this module are not visible from the code.
 *
 * (a) **The `for` loop of `yield*` IS the invariant; a combinator would only simulate it.** The
 *     short-circuit is structural: once a step's Effect fails, the generator simply stops advancing,
 *     so there is no "has a prior step failed" flag anywhere to get out of sync. That is INV-EC-001
 *     in its own words — "fail-fast is structural, not bookkept". The plausible tidy-up is
 *     `Effect.forEach(plan.steps, runStep)`, and it is the thing this note exists to refuse:
 *     sequential `Effect.forEach` happens to short-circuit today, so the swap is green on every test
 *     that only checks THAT a Scenario failed, and it moves the guarantee from "the language cannot
 *     do otherwise" to "this combinator's default concurrency happens to be 1". Add
 *     `{ concurrency: "unbounded" }` — a change that reads like a performance win — and the steps
 *     interleave, a `When` runs before its `Given`, and nothing in the type system objects.
 *     `Effect.all` over a pre-built array is worse still: it builds every step's Effect before
 *     running any of them. `test/ScenarioEffect.test.ts`'s recorded-order assertion is what fails
 *     when either substitution is made, and mutation A there is the demonstration.
 *
 *     For the same reason there is no `catch`, no recovery combinator and no per-step wrapping of
 *     the failure: a step's error must reach the Scenario's error channel as the value the step
 *     failed with, because that value is what the reporter prints to the developer. Re-tagging it,
 *     or converting it to a defect, loses the only description of the failure that the step author
 *     actually wrote.
 *
 * (b) **The Layer reaches the Scenario ONCE, around the whole composed Effect, and never per step.**
 *     Moving the provision inside the loop compiles, type-checks, lints, and leaves every "did this
 *     Scenario pass" assertion green — while rebuilding the Layer once per step, so each step gets
 *     its own `World`, its own `Ref`, its own testcontainer. A Scenario that stores a value in step
 *     one and reads it back in step three then reads an empty `World` rather than a stale one, which
 *     looks like a bug in the step author's code and is not. Nothing in the type system can see the
 *     difference: `Effect<A, E, R>` is identical either way. The freshness test in
 *     `test/ScenarioEffect.test.ts` (mutation C) is the guard.
 *
 *     Fresh per EXECUTION is the other half, and it comes for free from returning an unexecuted
 *     Effect: the Layer is built when the Effect runs, so two runs build it twice. That is
 *     INV-EC-002 for the per-Scenario case. This phase provides the Feature's single merged Layer
 *     uniformly, with no shared/per-Scenario distinction at runtime — ADR-EC-018's shared path is
 *     Phase 10's entire reason to exist (RUN-03/RUN-04), and adding a memoised branch here in
 *     anticipation would break INV-EC-002 for every Feature that does not ask for one.
 *
 * (c) **An `Unresolved` step becomes a failure IN POSITION, not an up-front rejection.** The loop
 *     could scan the list first and fail before step one, which is shorter and reads as a nice
 *     early exit. It is wrong twice. ADR-EC-019 fails the CONTAINING SCENARIO on an unmatched or
 *     ambiguous step, and a Scenario whose fourth step is undefined still ran its first three — how
 *     far it got is the evidence that tells the developer whether the undefined step is the only
 *     problem, and an up-front check destroys it. `Plan.ts` note (a) makes the same argument for why
 *     the union member lives in the step list rather than on the Scenario. Nor is this
 *     ARCHITECTURE.md's Anti-Pattern 2 ("matching inside the running Effect"): no matching happens
 *     here at all. `Plan.ts` did the matching, at plan time, against a registry this module never
 *     sees; all that is deferred to run time is delivering the verdict at the position it belongs to.
 *
 * (d) **`Before` is a GATE built out of one `yield*` and nothing else.** The plausible tidy-up is an
 *     explicit "if any Before failed, skip the steps" check — a boolean this generator would have to
 *     maintain and could get out of sync with the loop it guards, which is exactly the bookkeeping
 *     INV-EC-001 exists to forbid. There is no such flag: `runHookBatch(args.hooks.Before)`'s own
 *     failure simply stops the generator from advancing to the `for` loop below it, the identical
 *     structural short-circuit note (a) already relies on for a step's own failure. The test that goes
 *     red if this is "tidied" into an explicit flag is `test/ScenarioEffect.test.ts`'s three-failing-
 *     Before test: the flag compiles, still gates correctly in the passing case, and only a bug in the
 *     flag's own bookkeeping would ever surface — precisely the invisible failure mode INV-EC-001 rules
 *     out by construction rather than by discipline. D-02/D-03's independence and cause-combining for
 *     the batch itself live entirely inside `Hook.ts`'s `runHookBatch` and are not re-implemented here.
 *
 * (e) **`After` is guaranteed via `Effect.onExit`, never `Effect.ensuring`.** BEH-EC-006's literal text
 *     says "via `Effect.ensuring`", and the plausible tidy-up is "match the spec, use `ensuring`" — it
 *     does not compile: `Effect.ensuring`'s finalizer error channel is `never` in the installed
 *     `effect@4.0.0-rc.112` build (verified against `Effect.d.ts`, not assumed), so a fallible `After`
 *     hook is not even assignable to it. Widening the hook type to force it through would compile, but
 *     `ensuring` merges no causes — a failing `After` hook would then silently replace the step's own
 *     failure instead of combining with it, exactly the masking roadmap SC #4 forbids.
 *     `test/ScenarioEffect.test.ts`'s step-fails-and-After-fails test is what goes red: both original
 *     error objects must stay recoverable by reference identity from the reported cause, and `ensuring`
 *     cannot produce that. Plan 07-08 corrects BEH-EC-006's stale text; this module does not compile
 *     against it.
 *
 * The three `any`s in `Layer.Layer<any, any, never>` are erased detail rather than a widening of any
 * contract, and the reasoning is `describeFeature.ts`'s verbatim — its `FeatureCollection.layer`
 * carries the identical declaration for the identical reason. `Dsl.ts`'s `StepRegistrar<ROut>` has
 * already checked every step body against the ambient Layer's output at authoring time, which is the
 * whole of ADR-EC-003's compile-time guarantee, and by the time a Layer reaches this module that
 * check is behind it. This type never appears in a position a caller writes against. If one of the
 * two declarations is ever narrowed, narrow both: they describe the same value.
 *
 * `./Plan.ts` is a local, type-only import. `./Hook.ts` is a local import too, both a value
 * (`runHookBatch`) and a type (`HookSet`) — the module that groups a Feature's registered hooks by
 * kind and runs one kind's batch independently, D-02/D-03's own home. This module is INTERNAL and is
 * not re-exported from `packages/vitest/src/index.ts` — `Runner.ts` is its one caller, a consumer
 * never builds a Scenario Effect by hand, and publishing it would freeze an internal stage into the
 * package's contract. `Registry.ts`, `collectFeature`, `TestApi.ts` and `Plan.ts` all set the same
 * precedent.
 */
import * as Effect from "effect/Effect"
import type * as Layer from "effect/Layer"
import type * as Scope from "effect/Scope"
import { type HookSet, runHookBatch } from "./Hook.ts"
import type { PlannedStep, ScenarioPlan, UnresolvedPlannedStep } from "./Plan.ts"

/**
 * Whether `planned` is the step-did-not-resolve member of the union.
 *
 * Destructured rather than written as `planned._tag`, and a type predicate rather than a `boolean`.
 * Both are forced: oxlint's `no-underscore-dangle` rejects reading a leading-underscore property
 * through member access while permitting object destructuring, and destructuring alone does not
 * NARROW the union — so the check has to be lifted into a predicate with a named type to narrow to.
 * `Plan.ts` exports both union members by name for exactly this, and `test/Plan.test.ts` carries the
 * same pair of helpers.
 */
const isUnresolved = (planned: PlannedStep): planned is UnresolvedPlannedStep => {
  const { _tag } = planned
  return _tag === "Unresolved"
}

/**
 * Compose one Scenario's planned steps into the single Effect that runs it.
 *
 * The steps run in list order — Background first, because the list already says so — and the first
 * failure ends the Scenario, because a generator that has failed does not advance. Every `Before`
 * hook runs first, gating the step loop structurally (D-04, note (d)); every `After` hook is
 * guaranteed to run — on success, on a step failure, and even when a `Before` hook itself failed —
 * via `Effect.onExit` wrapped around the whole composed generator (note (e)). The Feature's Layer is
 * supplied around the whole thing, so what comes back requires only `Scope.Scope`, which is precisely
 * what `@effect/vitest`'s `it.effect` supplies and what `TestApi.effect` declares.
 *
 * The result is UNEXECUTED. `Runner.ts` passes it to `TestApi.effect` as a thunk, and every
 * execution builds the Layer again — note (b).
 *
 * The explicit return annotation is required, not stylistic: `composite: true` demands it for
 * declaration emit on anything exported.
 *
 * The error channel is `unknown` rather than a union of `StepMatchError` and the step bodies' own
 * errors. A step body's `E` is erased by the time it reaches a `StepBody`, and narrowing here would
 * mean asserting a type this module has no evidence for; `TestApi.effect` declares the same
 * `unknown` for the same reason, and a reporter needs no more.
 *
 * @param args.plan - one Scenario's steps, already resolved by `Plan.ts` and already in run order
 * @param args.layer - the Feature's single merged Layer, from `FeatureCollection.layer`
 * @param args.hooks - the Feature's registered hooks, grouped by kind, from `FeatureCollection.hooks`
 */
export const buildScenarioEffect = (
  args: {
    readonly plan: ScenarioPlan
    readonly layer: Layer.Layer<any, any, never>
    readonly hooks: HookSet
  }
): Effect.Effect<void, unknown, Scope.Scope> =>
  Effect.gen(function*() {
    // The Before GATE — one `yield*` and nothing else. Note (d).
    yield* runHookBatch(args.hooks.Before)
    // A loop of `yield*` inside ONE generator, and not a combinator over the list: the short-circuit
    // below is the absence of a next iteration, not a check anyone maintains. Note (a).
    for (const planned of args.plan.steps) {
      if (isUnresolved(planned)) {
        // In position, after the steps before it have already run. Note (c).
        return yield* Effect.fail(planned.error)
      }
      // Called, never re-wrapped: `Step.ts`'s `register` normalised this body at registration time
      // (ADR-EC-005), and wrapping it again is not a compile error and not a test failure — it is a
      // duplicated span, which only `Step.ts`'s reference-identity assertion can see.
      //
      // `args` is spread positionally and unmodified, `null`s from non-participating optional groups
      // included: dropping one shifts every later argument by a place.
      yield* planned.step.body(...planned.step.args)
    }
    // The success value is discarded on purpose. A Scenario's result is that it finished.
  }).pipe(
    // Wraps the WHOLE generator, Before gate included, so After also runs when a Before hook failed
    // (D-07's "the guarantee wraps the whole unit" principle). The finalizer ignores its `exit`
    // argument on purpose: After hooks receive no arguments (ADR-EC-005's Negative consequence), and
    // giving them the exit would be a signature this phase deliberately does not have. Note (e).
    Effect.onExit(() => runHookBatch(args.hooks.After)),
    Effect.provide(args.layer)
  )
