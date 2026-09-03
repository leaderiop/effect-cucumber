# ADR-EC-033: A failing step's pattern and `.feature` location are attached as `.cause` (a real `Error`, `.name` included), not folded into a rewritten top-level `.message`

> **Status:** Accepted
> **Date:** 2026-09-03
> **Context:** resolves [wayfinder ticket #18](https://github.com/leaderiop/effect-cucumber/issues/18), part of
> [effect-cucumber gap decisions #11](https://github.com/leaderiop/effect-cucumber/issues/11); closes RUN-06 and
> [spec/process/looks-done-but-isnt-checklist.md](../process/looks-done-but-isnt-checklist.md)'s P-24 row

## Context

`spec/roadmap.md` § Planned locked the mechanism before this ADR was written, more precisely than the two most
recent sketches (`gherkinWatchTriggers`, `Random.withSeed`) needed correcting:

> No custom `Reporter` needed — vitest's default reporter already prints `error.cause` recursively as "Caused
> by:". `ScenarioEffect.ts` wraps a step failure so `.cause` carries `{ step: pattern, file, line }` before it
> reaches the reporter. Rejected the `context.annotate()` alternative: it needs the vitest `TestContext` that
> `TestApi.ts`'s deliberately framework-agnostic seam currently erases, a real architectural cost `.cause` avoids
> entirely.

Confirming this against the real, installed `vitest@4.1.11` (`research/vitest-failure-reporter-surface.md`,
branch `research/vitest-failure-reporter-surface`, findings 1b/2b/4) surfaces the one thing the sketch's plain
`{ step: pattern, file, line }` shape gets wrong: `BaseReporter.printErrorInner`
(`node_modules/vitest/dist/chunks/index.UpGiHP7g.js:1782-1790`) only follows and recursively renders `.cause` as
a nested `"Caused by:"` block when

```js
typeof e.cause === "object" && e.cause && "name" in e.cause
```

A bare `{ step, file, line }` object has no `.name` at all, so it would satisfy the roadmap's own literal shape
and still be **silently invisible** to the exact mechanism the sketch names — the failure would propagate with a
`.cause` set, and vitest's default reporter would never print it, because the gate that decides whether to
recurse never passes. `research/vitest-failure-reporter-surface.md` finding 4 also confirms `@effect/vitest`
itself does nothing relevant here either way: its `runPromise` only calls `Cause.prettyErrors` for a separate
console log and re-raises the raw failed `Exit`, so nothing about `.cause`'s shape is dictated or interfered
with by the `@effect/vitest` boundary this repository sits on top of.

That same research also confirms which failure lane a real step failure actually takes. A step body written the
way this repository's own worked examples and README already teach — `assert.strictEqual(...)` inside an
`Effect.gen` generator — **throws**, and a synchronous throw inside a generator Effect's runtime steps becomes a
**defect** (`Cause.Die`), not a typed `Effect.fail` failure. `Effect.mapError` alone, which only ever sees the
typed `E` channel, would silently miss the common case entirely.

## Decision

**`StepFailureLocation`, a real `Error` subclass — not a plain object, and not a `Schema.TaggedError` like this
package's other typed failures — carries the step's pattern, its `.feature` file (`ParsedFeature.uri`) and its
line, and is attached as `.cause` on the step's own failure/defect value:**

```ts
// packages/vitest/src/Errors.ts
export class StepFailureLocation extends Error {
  readonly step: string
  readonly file: string
  readonly line: number
  constructor(args: { step: string; file: string; line: number; cause?: unknown }) {
    super(`${args.file}:${args.line}: step ${JSON.stringify(args.step)}`, { cause: args.cause })
    this.name = "StepFailureLocation" // the one field printErrorInner's `"name" in e.cause` gate requires
    this.step = args.step
    this.file = args.file
    this.line = args.line
  }
}
```

A real `Error` instance satisfies `"name" in e.cause"` by being one — `.name` is an inherited property of every
`Error`, and this constructor also sets it explicitly as an OWN property so the printed `"Caused by:
StepFailureLocation"` line names this class specifically rather than the inherited generic `"Error"`. Choosing a
plain `Error` subclass over a `Schema.TaggedError` (`StepMatchError`'s own shape, immediately above it in
`Errors.ts`) is deliberate: nothing here is ever decoded, compared by a `reason` tag, or round-tripped — its
entire job is to be constructed once and printed, and `Schema.TaggedError`'s validated-constructor machinery
would add ceremony this one-shot printer-only value has no use for.

**`ScenarioEffect.ts`'s `withStepFailureLocation` covers BOTH failure lanes a real step body can take, mirroring
the two combinators the confirmation above shows are both necessary:**

```ts
const withStepFailureLocation =
  (step: ResolvedStep) => <A, E, R>(effect: Effect.Effect<A, E, R>): Effect.Effect<A, unknown, R> => {
    const location = { step: step.pattern, file: step.uri, line: step.line }
    return effect.pipe(
      Effect.mapError((error) => attachStepFailureLocation(error, location)),
      Effect.catchDefect((defect) => Effect.die(attachStepFailureLocation(defect, location)))
    )
  }
```

`Effect.mapError` covers the typed `Effect.fail(...)` lane; `Effect.catchDefect` covers the thrown-exception
lane research confirmed is the common real-world shape. Neither touches an interruption — an interrupted step
was never really "the" failure a location should be attributed to. `ResolvedStep.uri` is a new field
(`Plan.ts`'s `planStep`, populated from `feature.uri`, the SAME value `StepMatchError` already locates itself
with) — the `.feature` file a Pickle step came from was not previously threaded past `Plan.ts` into
`ScenarioEffect.ts`, and needed to be for this wrap to have anything to attach.

Applied ONLY around the step body call (`planned.step.body(...planned.step.args)`), never around
`Before`/`BeforeStep`/`After`/`AfterStep` — a hook failure is not a step failure, and a hook already carries its
own identity via `Effect.fn(kind)`'s span name (ADR-EC-005). An `Unresolved` planned step's `StepMatchError` is
untouched for the same reason it needs nothing extra: it already self-locates, in its own `message`/`uri`/`line`
fields, built directly from the Pickle in `Plan.ts` rather than from a running step body.

**`attachStepFailureLocation` mutates the failure value IN PLACE when it is an object (the overwhelming common
case — a thrown `AssertionError`, a domain `Schema.TaggedError`), preserving reference identity, and chains any
pre-existing `.cause` onto `StepFailureLocation`'s own `.cause` rather than discarding it:**

```ts
export const attachStepFailureLocation = (
  value: unknown,
  location: { step: string; file: string; line: number }
): unknown => {
  if (typeof value === "object" && value !== null) {
    const existingCause = "cause" in value ? (value as { cause?: unknown }).cause : undefined
    ;(value as { cause?: unknown }).cause = new StepFailureLocation({ ...location, cause: existingCause })
    return value
  }
  return new Error(String(value), { cause: new StepFailureLocation(location) })
}
```

Reference-identity preservation matters beyond print quality: `packages/vitest/test/acceptance/negative/after-on-failure.feature`'s own committed claim (REQ-EC-018) already asserts a step's failure value survives to the reported `Cause` "by reference identity, walked structurally through `cause.reasons`" — a design that REPLACED the failure value with a new wrapper, rather than mutating the existing one, would have broken that standing guarantee. A non-object failure (a step failing with a bare string, say — nothing in this codebase's own steps does this, but `Effect`'s `E` channel does not forbid it) has nowhere to hang a `.cause`, so it is wrapped in a new `Error` instead; this is the one branch that changes identity, and the only one that could.

## Consequences

**Positive**:

- The step's own pattern and `.feature:line` now reach the SAME failure block a developer reads first — proven
  against a REAL `vitest run`'s printed stdout, not a synthetic value or an in-process `Exit` inspection alone
  (`scripts/verify-failure-panel.sh`, `packages/vitest/test/failure-panel-fixture/`). Closes
  [spec/process/looks-done-but-isnt-checklist.md](../process/looks-done-but-isnt-checklist.md)'s P-24 row, which
  had measured this claim FALSE.
- No `TestApi.ts` seam change, no `TestContext` crossing — the rejected `context.annotate()` alternative's real
  architectural cost (research finding: `VitestTestApi.ts` currently discards the `TestContext` `it.effect`
  would hand it) is avoided entirely, exactly as the roadmap bullet already argued.
- Composes with ADR-EC-005's existing `Effect.fn(pattern)` span rather than replacing it: the span still names
  the step in stack traces and OpenTelemetry export; this fix closes the SEPARATE gap the roadmap bullet and
  P-24's own Note distinguish — the pattern reaching a stdout block is not the same as it reaching the panel.

**Negative**:

- The roadmap sketch's literal `{ step: pattern, file, line }` shape does not survive contact with vitest's real
  `printErrorInner` gate (`"name" in e.cause`) — this ADR corrects it to a real `Error` subclass rather than
  building the plain-object shape anyway and shipping something silently inert, the same category of correction
  ADR-EC-030/031 made to their own sketches.
- P-24's own "what would complete it" suggestion (rewrite the top-level `.message` to LEAD with the step, and
  put `.feature:line` in the emitted test NAME) is not what this ADR ships. That alternative was not chosen: it
  would have changed every failing step's PRIMARY message and every emitted test's title — a much larger surface
  than the roadmap bullet ever locked, for a gap `.cause` closes without touching either. `.cause` is judged the
  correct-sized fix for what RUN-06 and the roadmap bullet actually specify, and the checklist row is updated to
  say so rather than left implying an unmet suggestion is still owed.
- A hook failure (`Before`/`BeforeStep`/`After`/`AfterStep`) still carries no step-shaped location — stated as a
  deliberate scope boundary (hooks are not steps) rather than an oversight; a hook's own `Effect.fn(kind)` span
  is what identifies it today, unchanged by this ADR.

**Trade-off accepted**: fidelity to the roadmap sketch's exact literal shape, in favor of the shape that actually
satisfies the mechanism the sketch itself named (a real `Error` with `.name`) — the same trade every prior
roadmap-correction ADR in this series has made, verified against the real installed dependency rather than
assumed from the sketch's prose.
