# ADR-EC-056: One `withFailureLocation` combinator replaces the duplicated step/hook `Effect.mapError`/`catchDefect` wrap — extends ADR-EC-033 and ADR-EC-052, no observable behavior change

> **Status:** Accepted
> **Date:** 2026-09-10

## Context

[ADR-EC-033](033-stepfailurelocation-attached-as-cause-not-a-rewritten-message.md) attached a
`StepFailureLocation` `.cause` to a failing step's own failure/defect, via `ScenarioEffect.ts`'s
`withStepFailureLocation`. [ADR-EC-052](052-hookfailurelocation-extends-stepfailurelocation-to-hooks.md)
did the identical thing for hooks, inside `Hook.ts`'s `runHookBatch`. Both already share one private
"build the located error" helper, `Errors.ts`'s `attachFailureLocation`, generic over a factory
function — extracted by ADR-EC-052 itself.

What neither ADR shared was the **Effect-level wrap around it**. `withStepFailureLocation` and
`runHookBatch`'s inline per-entry wrap were, independently, the identical two-line pattern:

```ts
effect.pipe(
  Effect.mapError((error) => attachXFailureLocation(error, location)),
  Effect.catchDefect((defect) => Effect.die(attachXFailureLocation(defect, location)))
)
```

— hand-copied once for steps and once for hooks, differing only in which `attachXFailureLocation` and
which `location` shape. This is exactly the kind of duplication a third registration-point-shaped
call site (were one ever added) could get wrong by re-deriving "which two channels does a body
actually fail through" from scratch, rather than reusing a combinator that already answers it.

An unrelated audit of this library's Vitest-5-feature and DSL surface, done in the same session as
this ADR, flagged the two independent implementations as a maintainability risk under the name
"uniform failure-location tracing." On inspection, the risk was real but narrower than first framed:
both call sites already correctly covered every registration point (`runHookBatch` already wraps all
six `HookKind`s uniformly, since every kind flows through the same loop) — there was no actual
coverage GAP left open by ADR-EC-033/ADR-EC-052, only the duplicated-wrap risk above.

## Decision

**`Errors.ts` gains one exported combinator, `withFailureLocation`, generic over the `attach` function
rather than over step-vs-hook:**

```ts
export const withFailureLocation =
  (attach: (value: unknown) => unknown) => <A, E, R>(effect: Effect.Effect<A, E, R>): Effect.Effect<A, unknown, R> =>
    effect.pipe(
      Effect.mapError((error) => attach(error)),
      Effect.catchDefect((defect) => Effect.die(attach(defect)))
    )
```

**`ScenarioEffect.ts`'s `withStepFailureLocation` and `Hook.ts`'s `runHookBatch` both call it**, each
supplying only which located-error to attach and its own location — `attachStepFailureLocation`/
`attachHookFailureLocation`, unchanged, still partially applied to a per-call `location` object exactly
as before:

```ts
// ScenarioEffect.ts
const withStepFailureLocation = (step: ResolvedStep) => <A, E, R>(effect: Effect.Effect<A, E, R>) => {
  const location = { step: step.pattern, file: step.uri, line: step.line }
  return withFailureLocation((value) => attachStepFailureLocation(value, location))(effect)
}

// Hook.ts, inside runHookBatch's per-entry loop
const located = withFailureLocation((value) => attachHookFailureLocation(value, location))(entry.body())
```

**No public signature changes, no behavior changes.** `attachStepFailureLocation` and
`attachHookFailureLocation` are untouched — same signature, same mutate-in-place/preserve-existing-
`.cause` mechanics from `attachFailureLocation`. `withFailureLocation` is a pure extraction of the
`Effect.mapError`/`Effect.catchDefect` pair both call sites already ran; every existing test in
`ScenarioEffect.test.ts`'s and `Hook.test.ts`'s ADR-EC-033/ADR-EC-052 `describe` blocks passes
unmodified against the refactored implementation, which is the proof this ADR relies on rather than
new assertions: identical observable behavior through a shared mechanism is what "pure refactor" means
here.

**`Errors.test.ts` gains one small, direct test** of `withFailureLocation` itself, using a stand-in
`attach` function rather than either real located-error class — pinning the combinator's own generic
contract (both failure lanes, defect included) independently of which caller uses it.

## Consequences

**Positive**:

- One combinator, not two hand-copied ones — a future third registration-point-shaped call site (if
  one is ever added) reuses `withFailureLocation` rather than re-deriving the two-lane wrap, closing
  the actual (duplication, not coverage) risk this ADR was written to address.
- Zero behavior change: `attachStepFailureLocation`/`attachHookFailureLocation`'s public contracts, and
  therefore every currently-printed failure panel, are untouched. This is provable by the existing
  test suite passing without modification, not merely asserted.
- `withFailureLocation`'s own generic contract is now pinned by a direct unit test in `Errors.test.ts`,
  independent of the step/hook call sites that happen to use it today.

**Negative**:

- None identified. This is a narrower, purely mechanical extraction — unlike ADR-EC-052, which made a
  genuine, deliberate behavior change (hooks gaining a location they previously lacked), this ADR
  changes no observable behavior at all.

**Trade-off accepted**: none — a strict reduction in duplication with no offsetting cost.

## Correction to ADR-EC-033 and ADR-EC-052's own code excerpts

Both ADR-EC-033's and ADR-EC-052's **Decision** sections show, verbatim, the inline
`Effect.mapError`/`Effect.catchDefect` pair each ADR shipped inside `withStepFailureLocation` /
`runHookBatch` respectively. Those excerpts are historical — they describe what the code looked like
when each ADR was accepted, and are left as originally written, append-only, per this project's own
convention. As of this ADR, both call sites instead call the shared `withFailureLocation` combinator
above; the OBSERVABLE behavior those excerpts describe (which `.cause` is attached, under which two
failure lanes, preserving which reference identity) is exactly what `withFailureLocation` still
provides, unchanged.
