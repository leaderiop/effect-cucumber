/**
 * Composes one Scenario — hooks, Background steps, Scenario steps — into ONE Effect.
 *
 * Invariants a reader must not tidy away:
 * - Steps are sequential `yield*`s in one `Effect.gen`, so fail-fast is structural (INV-EC-001,
 *   `test/ScenarioEffect.test.ts`).
 * - `After`/`AfterStep` run through `Effect.onExit` and never mask the guarded failure; the
 *   per-Scenario Layer is provided OUTERMOST, so hooks run before its finalizers (BEH-EC-006).
 * - The per-Scenario Layer is provided fresh on every execution and never memoised (INV-EC-002).
 * - A step's OWN failure or defect (never a hook's — a hook batch gains its OWN `HookFailureLocation`
 *   one module over, inside `Hook.ts`'s `runHookBatch`, ADR-EC-052/BEH-EC-033 — and every hook kind
 *   keeps its own `Effect.fn(kind)` span identity besides, ADR-EC-005) is wrapped with
 *   `withStepFailureLocation` before it can propagate, so `.cause` carries the step's pattern and
 *   `.feature` location before the failure ever reaches vitest's reporter (ADR-EC-033). An
 *   `Unresolved` planned step's `StepMatchError` is NOT wrapped here either: it already locates
 *   itself, in its own `message`/`uri`/`line` fields, since `Plan.ts` builds it directly from the
 *   Pickle rather than from a running step body — the one scope boundary ADR-EC-033 still keeps,
 *   now that ADR-EC-052 has closed the hook one.
 */
import * as Effect from "effect/Effect"
import * as Match from "effect/Match"
import type * as Scope from "effect/Scope"
import { attachStepFailureLocation, withFailureLocation } from "./Errors.ts"
import { type HookSet, runHookBatch } from "./Hook.ts"
import type { ErasedExtraLayer, ResolvedStep, ScenarioPlan } from "./Plan.ts"

/**
 * Attach `step`'s own pattern/`.feature` location to whatever it fails or dies with, before either
 * can propagate past this point (ADR-EC-033), via the shared `withFailureLocation` combinator
 * (ADR-EC-056) both this and `Hook.ts`'s `runHookBatch` call — this wrapper only supplies WHICH
 * located-error to attach (`attachStepFailureLocation`) and the step's own location.
 */
const withStepFailureLocation =
  (step: ResolvedStep) => <A, E, R>(effect: Effect.Effect<A, E, R>): Effect.Effect<A, unknown, R> => {
    const location = { step: step.pattern, file: step.uri, line: step.line }
    return withFailureLocation((value) => attachStepFailureLocation(value, location))(effect)
  }

/**
 * Compose one Scenario's planned steps into the single Effect that runs it.
 *
 * @param args.plan - one Scenario's steps, already resolved by `Plan.ts` and already in run order
 * @param args.hooks - the Feature's registered hooks, grouped by kind, from `FeatureCollection.hooks`
 */
export const buildScenarioEffect = Effect.fnUntraced(
  function*(
    args: {
      readonly plan: ScenarioPlan
      readonly layer: ErasedExtraLayer
      readonly hooks: HookSet
    }
  ): Effect.fn.Return<void, unknown, Scope.Scope> {
    // This Scenario's own already-flattened, inherited tags — the ONE value every tag-expression-
    // scoped hook batch below is checked against (ADR-EC-035, BEH-EC-027). Read once, not per batch.
    const scenarioTags = args.plan.tags
    // The Before GATE — one `yield*` and nothing else. Note (d).
    yield* runHookBatch("Before", args.hooks.Before, scenarioTags)
    // A loop of `yield*` inside ONE generator, and not a combinator over the list: the
    // short-circuit below is the absence of a next iteration, not a check anyone maintains.
    for (const planned of args.plan.steps) {
      // Match.tag/Match.orElse, never an if/switch on `_tag` (project convention). The early
      // `return` an `if` gave us isn't needed: `yield* Effect.fail(...)` inside `Effect.gen`
      // already aborts the generator, so later steps still never run after an Unresolved one.
      yield* Match.value(planned).pipe(
        Match.tag("Unresolved", (unresolved) => Effect.fail(unresolved.error)),
        // The wrap is unconditional even when both batches are empty: `runHookBatch([], ...)`
        // succeeds immediately.
        Match.orElse((resolved) =>
          Effect.gen(function*() {
            yield* runHookBatch("BeforeStep", args.hooks.BeforeStep, scenarioTags)
            // Called, never re-wrapped: `Step.ts`'s `register` normalised this body at
            // registration (ADR-EC-005). The location wrap covers ONLY this call — a
            // BeforeStep/AfterStep hook failure is not a step failure and gains its OWN
            // `HookFailureLocation` inside `runHookBatch` instead (ADR-EC-052).
            yield* withStepFailureLocation(resolved.step)(resolved.step.body(...resolved.step.args))
          }).pipe(
            Effect.onExit(() => runHookBatch("AfterStep", args.hooks.AfterStep, scenarioTags))
          )
        )
      )
    }
    // The success value is discarded on purpose. A Scenario's result is that it finished.
  },
  // The finalizer ignores its `exit` on purpose: After hooks receive no exit (ADR-EC-005).
  (effect, args) =>
    effect.pipe(
      Effect.onExit(() => runHookBatch("After", args.hooks.After, args.plan.tags)),
      Effect.provide(args.layer)
    )
)
