/**
 * Composes one Scenario — hooks, Background steps, Scenario steps — into ONE Effect.
 *
 * Invariants a reader must not tidy away:
 * - Steps are sequential `yield*`s in one `Effect.gen`, so fail-fast is structural (INV-EC-001,
 *   `test/ScenarioEffect.test.ts`).
 * - `After`/`AfterStep` run through `Effect.onExit` and never mask the guarded failure; the
 *   per-Scenario Layer is provided OUTERMOST, so hooks run before its finalizers (BEH-EC-006).
 * - The per-Scenario Layer is provided fresh on every execution and never memoised (INV-EC-002).
 * - A step's OWN failure or defect (never a hook's — Before/BeforeStep/After/AfterStep keep their
 *   own `Effect.fn(kind)` span identity, ADR-EC-005) is wrapped with `withStepFailureLocation`
 *   before it can propagate, so `.cause` carries the step's pattern and `.feature` location before
 *   the failure ever reaches vitest's reporter (ADR-EC-033). An `Unresolved` planned step's
 *   `StepMatchError` is NOT wrapped here: it already locates itself, in its own `message`/`uri`/
 *   `line` fields, since `Plan.ts` builds it directly from the Pickle rather than from a running
 *   step body.
 */
import * as Effect from "effect/Effect"
import type * as Scope from "effect/Scope"
import { attachStepFailureLocation } from "./Errors.ts"
import { type HookSet, runHookBatch } from "./Hook.ts"
import type { ErasedExtraLayer, PlannedStep, ResolvedStep, ScenarioPlan, UnresolvedPlannedStep } from "./Plan.ts"

const isUnresolved = (planned: PlannedStep): planned is UnresolvedPlannedStep => {
  const { _tag } = planned
  return _tag === "Unresolved"
}

/**
 * Attach `step`'s own pattern/`.feature` location to whatever it fails or dies with, before either
 * can propagate past this point (ADR-EC-033). Covers BOTH channels a real step body can
 * fail through: a typed `Effect.fail` (`Effect.mapError`) and a thrown exception, which Effect's
 * own runtime turns into a DEFECT rather than a typed failure (`Effect.catchDefect`) — the more
 * common of the two in practice, since `assert.strictEqual` and friends THROW rather than
 * `yield* Effect.fail(...)`. Neither branch touches an interruption, which is the correct silence:
 * an interrupted step was never really "the" failure to attribute a location to.
 */
const withStepFailureLocation =
  (step: ResolvedStep) => <A, E, R>(effect: Effect.Effect<A, E, R>): Effect.Effect<A, unknown, R> => {
    const location = { step: step.pattern, file: step.uri, line: step.line }
    return effect.pipe(
      Effect.mapError((error) => attachStepFailureLocation(error, location)),
      Effect.catchDefect((defect) => Effect.die(attachStepFailureLocation(defect, location)))
    )
  }

/**
 * Compose one Scenario's planned steps into the single Effect that runs it.
 *
 * @param args.plan - one Scenario's steps, already resolved by `Plan.ts` and already in run order
 * @param args.hooks - the Feature's registered hooks, grouped by kind, from `FeatureCollection.hooks`
 */
export const buildScenarioEffect = (
  args: {
    readonly plan: ScenarioPlan
    readonly layer: ErasedExtraLayer
    readonly hooks: HookSet
  }
): Effect.Effect<void, unknown, Scope.Scope> =>
  Effect.gen(function*() {
    // This Scenario's own already-flattened, inherited tags — the ONE value every tag-expression-
    // scoped hook batch below is checked against (ADR-EC-035, BEH-EC-027). Read once, not per batch.
    const scenarioTags = args.plan.tags
    // The Before GATE — one `yield*` and nothing else. Note (d).
    yield* runHookBatch(args.hooks.Before, scenarioTags)
    // A loop of `yield*` inside ONE generator, and not a combinator over the list: the
    // short-circuit below is the absence of a next iteration, not a check anyone maintains.
    for (const planned of args.plan.steps) {
      if (isUnresolved(planned)) {
        // In position, after the steps before it have already run. Note (c).
        return yield* Effect.fail(planned.error)
      }
      // The wrap is unconditional even when both batches are empty: `runHookBatch([], ...)` succeeds
      // immediately.
      yield* Effect.gen(function*() {
        yield* runHookBatch(args.hooks.BeforeStep, scenarioTags)
        // Called, never re-wrapped: `Step.ts`'s `register` normalised this body at registration (ADR-EC-005).
        // The location wrap covers ONLY this call — a BeforeStep/AfterStep hook failure is not a step
        // failure and keeps propagating unwrapped.
        yield* withStepFailureLocation(planned.step)(planned.step.body(...planned.step.args))
      }).pipe(
        Effect.onExit(() => runHookBatch(args.hooks.AfterStep, scenarioTags))
      )
    }
    // The success value is discarded on purpose. A Scenario's result is that it finished.
  }).pipe(
    // The finalizer ignores its `exit` on purpose: After hooks receive no exit (ADR-EC-005).
    Effect.onExit(() => runHookBatch(args.hooks.After, args.plan.tags)),
    Effect.provide(args.layer)
  )
