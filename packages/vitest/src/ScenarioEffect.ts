/**
 * Composes one Scenario — hooks, Background steps, Scenario steps — into ONE Effect.
 *
 * Invariants a reader must not tidy away:
 * - Steps are sequential `yield*`s in one `Effect.gen`, so fail-fast is structural (INV-EC-001,
 *   `test/ScenarioEffect.test.ts`).
 * - `After`/`AfterStep` run through `Effect.onExit` and never mask the guarded failure; the
 *   per-Scenario Layer is provided OUTERMOST, so hooks run before its finalizers (BEH-EC-006).
 * - The per-Scenario Layer is provided fresh on every execution and never memoised (INV-EC-002).
 */
import * as Effect from "effect/Effect"
import type * as Scope from "effect/Scope"
import { type HookSet, runHookBatch } from "./Hook.ts"
import type { ErasedExtraLayer, PlannedStep, ScenarioPlan, UnresolvedPlannedStep } from "./Plan.ts"

const isUnresolved = (planned: PlannedStep): planned is UnresolvedPlannedStep => {
  const { _tag } = planned
  return _tag === "Unresolved"
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
    // The Before GATE — one `yield*` and nothing else. Note (d).
    yield* runHookBatch(args.hooks.Before)
    // A loop of `yield*` inside ONE generator, and not a combinator over the list: the
    // short-circuit below is the absence of a next iteration, not a check anyone maintains.
    for (const planned of args.plan.steps) {
      if (isUnresolved(planned)) {
        // In position, after the steps before it have already run. Note (c).
        return yield* Effect.fail(planned.error)
      }
      // The wrap is unconditional even when both batches are empty: `runHookBatch([])` succeeds
      // immediately.
      yield* Effect.gen(function*() {
        yield* runHookBatch(args.hooks.BeforeStep)
        // Called, never re-wrapped: `Step.ts`'s `register` normalised this body at registration (ADR-EC-005).
        yield* planned.step.body(...planned.step.args)
      }).pipe(
        Effect.onExit(() => runHookBatch(args.hooks.AfterStep))
      )
    }
    // The success value is discarded on purpose. A Scenario's result is that it finished.
  }).pipe(
    // The finalizer ignores its `exit` on purpose: After hooks receive no exit (ADR-EC-005).
    Effect.onExit(() => runHookBatch(args.hooks.After)),
    Effect.provide(args.layer)
  )
