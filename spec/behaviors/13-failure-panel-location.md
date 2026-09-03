# 13 — Failure panel: step text and `.feature` file:line

What a failing step's entry in the runner's own failure output carries, beyond the Scenario name and
the assertion. [ADR-EC-005](../decisions/005-effect-fn-for-step-and-hook-bodies.md) already gives a
step a named tracing span (`Effect.fn(pattern)`), which reaches stack traces and an OpenTelemetry
export; this file specifies a DIFFERENT reach — the same location data landing in the block a reader
of `vitest run`'s own default terminal output sees first, without a custom `Reporter`.

> **See:** [ADR-EC-033](../decisions/033-stepfailurelocation-attached-as-cause-not-a-rewritten-message.md)

See [`spec/roadmap.md`](../roadmap.md) for what is built versus what is only specified — this
document describes the contract, not the build status.

---

## BEH-EC-025: A step's own failure (or defect) carries its pattern and `.feature` location as `.cause`

```
REQUIREMENT: When a step's body fails — through a typed Effect.fail OR through a
             thrown exception (a defect, Cause.Die; the common shape, since
             assert.strictEqual and similar THROW rather than yield*
             Effect.fail) — the failure/defect value MUST carry a
             StepFailureLocation as its own .cause before it can propagate
             past ScenarioEffect.ts.

             StepFailureLocation MUST be a real Error subclass, with .name
             set to the literal string "StepFailureLocation" as an OWN
             property, and MUST carry step (the step's cucumber-expression
             PATTERN, not its interpolated text), file (ParsedFeature.uri)
             and line (the step's own line in that file) as own fields. A
             plain { step, file, line } object with no .name is NOT
             sufficient: vitest's own default reporter only recurses into
             .cause and renders it as "Caused by:" when the cause carries a
             .name (confirmed against the installed vitest, ADR-EC-033).
```

```
REQUIREMENT: The wrap MUST preserve the ORIGINAL failure value's reference
             identity when it is an object (the common case) — mutating
             .cause onto it rather than replacing it with a reconstruction.
             Any .cause the original failure already carried MUST survive,
             chained as StepFailureLocation's OWN .cause, never silently
             dropped.

             The wrap applies ONLY to a step's own body — never to a
             Before/BeforeStep/After/AfterStep hook's failure (a hook is not
             a step and already carries its own identity via Effect.fn(kind)),
             and never to an Unresolved planned step's StepMatchError (it
             already self-locates, in its own message/uri/line fields, built
             directly from the Pickle rather than from a running step body).
```

### Why `.cause`, not a rewritten top-level `.message` or an emitted-test-name change

The roadmap bullet this behavior implements considered and rejected `context.annotate()` (needs the
`TestContext` `TestApi.ts`'s framework-agnostic seam currently erases). It did NOT literally survive
contact with vitest's real reporter unmodified either — see
[ADR-EC-033](../decisions/033-stepfailurelocation-attached-as-cause-not-a-rewritten-message.md) for
the full correction: a bare `{ step, file, line }` object has no `.name`, so it would be silently
invisible to the exact mechanism the roadmap named. `StepFailureLocation` being a real `Error` is what
makes the mechanism work at all, not an implementation detail.

### Signatures

```ts
export class StepFailureLocation extends Error {
  readonly step: string
  readonly file: string
  readonly line: number
}

export const attachStepFailureLocation: (
  value: unknown,
  location: { readonly step: string; readonly file: string; readonly line: number }
) => unknown
```

### Worked example

Internal mechanism, not public API — neither `StepFailureLocation` nor `attachStepFailureLocation`
is exported from `@effect-cucumber/vitest`'s barrel (a consumer never constructs one; `ScenarioEffect.ts`
applies the wrap automatically around every step body). A fragment, not a compiled example, for that
reason:

```ts
// packages/vitest/src/ScenarioEffect.ts, inside the step loop
yield * withStepFailureLocation(planned.step)(planned.step.body(...planned.step.args))

// A step-shaped failure value, the way `assert.strictEqual` throwing one looks:
const original = new Error("expected 5 to equal 6")
const attached = attachStepFailureLocation(original, {
  step: "I should have {int} apples",
  file: "features/apples.feature",
  line: 6
})
// The SAME object, by reference — `attached === original` — with a new StepFailureLocation now
// hanging off its `.cause`, which is what vitest's own default reporter recurses into and prints as
// a nested "Caused by:" block.
```

### Where this is proven

Two proofs, at two different levels, matching the pattern this repository already uses for a claim
about what a real running framework does versus what a value looks like in isolation:

| Level                                                                   | Artifact                                                                                                                                                                                                                                                                                                                                                                                                                   |
| ----------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| In-process — the wrap attaches the right shape                          | `packages/vitest/test/ScenarioEffect.test.ts`'s own RUN-06 describe block: both failure lanes (typed `Effect.fail` and a thrown defect), reference-identity preservation, pre-existing-`.cause` chaining, and the two scope boundaries (a hook's own failure, an `Unresolved` step's `StepMatchError`) — all against `Exit`/`Cause` inspection, never against printed text.                                                |
| Real output — the wrap is genuinely visible in what `vitest run` prints | `scripts/verify-failure-panel.sh` against `packages/vitest/test/failure-panel-fixture/failing.steps.test.ts` — a deliberately failing Scenario, run through the real `describeFeature`, whose real `vitest run` stdout is captured and grepped for the failing step's own pattern, its `.feature:line`, and a `"Caused by: StepFailureLocation"` line — proving vitest's DEFAULT reporter, unmodified, is what renders it. |

Not carried by `@REQ-EC-NNN`/`spec/traceability.md` §5: `failing.steps.test.ts` is deliberately
excluded from every normal `vitest run` (it fails on purpose) and is not handed to `describeFeature`
by anything `pnpm test` collects, the same category `packages/vitest/test/acceptance/negative/`'s
starved fixtures and `packages/vitest/test/tsgo-gate/`'s non-compiling fixtures already occupy —
proven by a dedicated script, not by an acceptance Scenario a passing `pnpm test` run would need to
include.

---

_Previous: [12 — An Outline column no step pattern references](./12-outline-typed-example-column.md)_
