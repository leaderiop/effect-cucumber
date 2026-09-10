# ADR-EC-052: A failing hook gains a `HookFailureLocation` `.cause`, naming its own kind and registration call site — closing ADR-EC-033's hook carve-out

> **Status:** Accepted
> **Date:** 2026-09-06

## Context

[ADR-EC-033](033-stepfailurelocation-attached-as-cause-not-a-rewritten-message.md) gave a failing
step's own pattern and `.feature:line` a `.cause` a reader sees in the SAME failure panel vitest's
default reporter prints first — `StepFailureLocation`, a real `Error` subclass, attached by
`ScenarioEffect.ts`'s `withStepFailureLocation` around a step body's call, covering both the typed
`Effect.fail` lane and the thrown-defect lane.

That ADR's own **Negative** consequences section drew a line around what it fixed, in words it stated
as a deliberate choice rather than an oversight:

> A hook failure (`Before`/`BeforeStep`/`After`/`AfterStep`) still carries no step-shaped location —
> stated as a deliberate scope boundary (hooks are not steps) rather than an oversight; a hook's own
> `Effect.fn(kind)` span is what identifies it today, unchanged by this ADR.

`ScenarioEffect.test.ts` pinned that carve-out literally, in a test titled `"does NOT attach a
location to a Before hook's own failure (out of scope for ADR-EC-033)"`, and `Hook.test.ts`'s
combined-failure tests asserted the RAW original thrown value survived `Cause.squash` untouched — no
`.cause` at all.

This ADR closes that carve-out. A hook failure reaching a real `vitest run`'s printed output today
carries only its `Effect.fn(kind)` span name in the stdout trace — never its own `.feature` file or
the line the failing `Before`/`After`/etc. call itself sits on, and never in the SAME panel a step's
own location now reaches. That asymmetry is no longer justified once the mechanism ADR-EC-033 already
built (a real `Error` subclass attached as `.cause`, printed by vitest's own unmodified default
reporter) is understood to generalize past steps with no new architecture required — only a second,
analogous class and a second call-site capture, reusing infrastructure (`CallSite.ts`'s
`captureCallSite`) already wired for exactly this purpose on the step side.

## Decision

**`HookFailureLocation`, `StepFailureLocation`'s sibling, carries the FAILING HOOK'S OWN kind, its
`.feature` file and the line its OWN registration call (`Before(...)`, `After(...)`, and so on — never
the Scenario it happened to be running for) sits on:**

```ts
// packages/vitest/src/Errors.ts
export class HookFailureLocation extends Error {
  readonly hookKind: HookKind
  readonly file: string
  readonly line: number
  constructor(args: { hookKind: HookKind; file: string; line: number; cause?: unknown }) {
    super(`${args.file}:${args.line}: ${args.hookKind} hook`, { cause: args.cause })
    this.name = "HookFailureLocation" // the same printErrorInner gate ADR-EC-033 already satisfies
    this.hookKind = args.hookKind
    this.file = args.file
    this.line = args.line
  }
}
```

**The location is the hook's OWN registration call site, not the Scenario's.** `CallSite.ts`'s
`captureCallSite()` — already used by `Collect.ts`'s step-registration `registrar` closure — is now
also called inline, from INSIDE both hook-registrar closures (`Collect.ts`'s Feature-level
`hookRegistrar` and Rule-level `ruleHookRegistrar`), so the captured stack frame is the test author's
own `Before(...)`/`After(...)` call, not `Collect.ts`'s. The captured `DefinitionSite` threads through
as a new field at every layer already carrying a hook's other per-registration data:
`HookDefinition.definedAt?` (`HookRegistry.ts`) → `HookEntry.definedAt?` (`Hook.ts`'s `groupHooks`) →
the location `runHookBatch` builds per entry. Both new fields are OPTIONAL and `createHookRegistry`'s
`register` gains an OPTIONAL TRAILING `definedAt` parameter defaulting to `null` — deliberately, so no
existing raw `HookEntry`/`HookDefinition` object literal across `Hook.test.ts`/`HookRegistry.test.ts`/
`ScenarioEffect.test.ts` that is unrelated to failure-location testing needs to change.

**`runHookBatch` gains a leading `kind: HookKind` parameter — every call site already knows this
statically — and wraps each entry's body in BOTH failure lanes, mirroring
`withStepFailureLocation`:**

```ts
// packages/vitest/src/Hook.ts
export const runHookBatch = (
  kind: HookKind,
  entries: ReadonlyArray<HookEntry>,
  scenarioTags: ReadonlyArray<string>
): ErasedEffect =>
  Effect.gen(function*() {
    const failures: Array<Cause.Cause<unknown>> = []
    for (const entry of entries) {
      if (entry.matches !== null && !entry.matches(scenarioTags)) continue
      const location = {
        hookKind: kind,
        file: entry.definedAt?.file ?? unrecordedLocation,
        line: entry.definedAt?.line ?? 0
      }
      const located = entry.body().pipe(
        Effect.mapError((error) => attachHookFailureLocation(error, location)),
        Effect.catchDefect((defect) => Effect.die(attachHookFailureLocation(defect, location)))
      )
      const exit = yield* Effect.exit(located)
      if (Exit.isFailure(exit)) failures.push(exit.cause)
    }
    // ...combine as before
  })
```

Every existing `runHookBatch` call site (`ScenarioEffect.ts`'s four, `Runner.ts`'s two) now passes its
own statically-known `HookKind` literal as the new leading argument — `"Before"`, `"After"`,
`"BeforeStep"`, `"AfterStep"`, `"BeforeAllScenarios"`, `"AfterAllScenarios"` — and nothing else about
any of those six call sites changes.

**`attachHookFailureLocation` reuses `attachStepFailureLocation`'s exact mutate-in-place mechanics**,
extracted into one shared private helper, `attachFailureLocation`, generic over a FACTORY function
(`(cause: unknown) => Error`) rather than over the located-error class itself — `StepFailureLocation`
and `HookFailureLocation` carry different identifying fields (`step` vs `hookKind`), so there is no
shared field shape to be generic over, only the "build the concrete instance given the pre-existing
cause" step:

```ts
const attachFailureLocation = (value: unknown, makeLocation: (cause: unknown) => Error): unknown => {
  if (typeof value === "object" && value !== null) {
    const existingCause = "cause" in value ? (value as { cause?: unknown }).cause : undefined
    ;(value as { cause?: unknown }).cause = makeLocation(existingCause)
    return value
  }
  return new Error(String(value), { cause: makeLocation(undefined) })
}
export const attachStepFailureLocation = (value: unknown, location: {...}): unknown =>
  attachFailureLocation(value, (cause) => new StepFailureLocation({ ...location, cause }))
export const attachHookFailureLocation = (value: unknown, location: {...}): unknown =>
  attachFailureLocation(value, (cause) => new HookFailureLocation({ ...location, cause }))
```

`attachStepFailureLocation`'s PUBLIC signature and observable behaviour are byte-for-byte unchanged —
every existing `StepFailureLocation`-touching test (`ScenarioEffect.test.ts`'s ADR-EC-033 describe
block) passes unmodified against the refactored implementation.

**A batch with more than one failing hook of the SAME kind gets a DISTINCT `HookFailureLocation` per
entry**, each naming that entry's OWN `definedAt` — never one shared instance reused across every
failure in the batch, since the location object (and the `HookFailureLocation` it builds) is
constructed fresh inside the per-entry loop iteration, from that entry's own `definedAt`.

**An entry with no recorded `definedAt`** — a raw test fixture that never set the optional field, or
the rare case `captureCallSite()` itself returned `null` — still gets a `HookFailureLocation`, naming
the shared `unrecordedLocation` wording (`CallSite.ts`, now exported rather than module-private so
`Hook.ts` can reuse the identical string `Runner.ts`'s `UnusedStepDefinitionWarning` printing already
uses) and line `0`, rather than skipping the wrap conditionally.

**The two tests that pinned the carve-out as intentional are rewritten to assert the opposite**, as a
deliberate, documented behavior change rather than an accidental regression:

- `ScenarioEffect.test.ts`'s `"does NOT attach a location to a Before hook's own failure (out of scope
  for ADR-EC-033)"` is renamed and rewritten to `"attaches a HookFailureLocation to a Before hook's own
  failure (ADR-EC-052 closes ADR-EC-033's hook carve-out)"`, asserting a `HookFailureLocation` IS
  attached, naming the right `hookKind`/`file`/`line`, with the original raw failure value still
  reference-identical underneath its new `.cause`.
- `Hook.test.ts`'s combined-failure and single-failure `runHookBatch` tests, and its tag-filtered
  "survivors still combine" test, are rewritten the same way — each now asserts a DISTINCT
  `HookFailureLocation` per originally-failing entry, with the original error(s) still recoverable by
  reference identity underneath.

## Consequences

**Positive**:

- A failing hook's own kind and its `.feature:line` now reach the SAME failure panel a reader sees
  first — the identical claim ADR-EC-033 already proved for a step, now proven for a hook, and by the
  identical mechanism: no custom `Reporter`, no `TestApi.ts` seam change, no `TestContext` crossing.
  `scripts/verify-failure-panel.sh` is extended with a second, hook-shaped fixture Scenario to prove
  this against a REAL `vitest run`'s printed stdout, not only an in-process `Exit` inspection.
- Closes ADR-EC-033's own named scope boundary rather than leaving it as permanent policy — the ONE
  scope boundary that remains after this ADR is an `Unresolved` step's `StepMatchError`, which already
  self-locates from `Plan.ts`'s own Pickle-derived fields and needs no wrap.
- Reuses `CallSite.ts`'s existing `captureCallSite`/`DefinitionSite` machinery verbatim — no new
  call-site-capture mechanism invented, only a second call site (`Collect.ts`'s two hook-registrar
  closures) added to the one that already exists for steps.
- `attachStepFailureLocation`'s extraction into a shared `attachFailureLocation` helper is a pure
  refactor: its own tests pass unmodified, proving step behavior is untouched by adding hook behavior
  beside it.

**Negative**:

- This is a genuine, deliberate BEHAVIOR CHANGE, not merely an additive one: two tests that previously
  asserted "no location is attached to a hook failure" now assert the opposite. A consumer whose own
  test suite happened to assert byte-identical hook failure values (rather than recovering the
  original by `Cause.squash`/reference-identity walk, the pattern this codebase's own tests already
  use) would see a new `.cause` appear where none did before. This is judged an acceptable, expected
  consequence of closing a scope boundary the original ADR explicitly flagged as a gap, not a silent
  regression — recorded here, and in ADR-EC-033's own Correction section below, precisely so nobody
  discovers it undocumented.
- A hook failing with a bare, non-object value (a string or number — nothing in this codebase's own
  hook bodies do this, but `Effect`'s `E` channel does not forbid it) loses reference identity to the
  same degree `attachStepFailureLocation` already accepted for a step: it is wrapped in a new `Error`
  rather than mutated in place, because a primitive has nowhere to hang a `.cause`. This is the
  identical, pre-existing trade-off ADR-EC-033 already made, extended here rather than reconsidered.

**Trade-off accepted**: the same one ADR-EC-033 already made — a hook failure's raw non-object shape
(rare, no real hook body in this codebase produces one) loses identity in exchange for a genuine
`.cause`-carrying location every OTHER hook failure gets, in favor of closing a real, named gap between
what a step's failure panel shows and what a hook's shows.

---

> **Correction (2026-09-10, extended by [ADR-EC-056](056-withfailurelocation-combinator-unifies-the-step-hook-wrap.md)):**
> the **Decision** section above shows `runHookBatch` calling `Effect.mapError`/`Effect.catchDefect`
> inline, per entry. As of ADR-EC-056, it instead calls the same shared `withFailureLocation`
> combinator (`Errors.ts`) `ScenarioEffect.ts`'s `withStepFailureLocation` calls, rather than each
> hand-copying the identical two-line wrap. This is a pure internal refactor: `attachHookFailureLocation`'s
> signature and every observable behavior described above are unchanged, proven by this ADR's own
> tests passing unmodified.
