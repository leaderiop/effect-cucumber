---
phase: 07-hooks
reviewed: 2026-08-29T00:00:00Z
depth: standard
files_reviewed: 25
files_reviewed_list:
  - packages/vitest/README.md
  - packages/vitest/src/Dsl.ts
  - packages/vitest/src/Hook.ts
  - packages/vitest/src/HookRegistry.ts
  - packages/vitest/src/Runner.ts
  - packages/vitest/src/ScenarioEffect.ts
  - packages/vitest/src/describeFeature.ts
  - packages/vitest/src/index.ts
  - packages/vitest/test/Hook.test.ts
  - packages/vitest/test/HookRegistry.test.ts
  - packages/vitest/test/Runner.test.ts
  - packages/vitest/test/ScenarioEffect.test.ts
  - packages/vitest/test/describeFeature.test.ts
  - packages/vitest/test/emission.test.ts
  - packages/vitest/test/tsgo-gate/src/hook-missing-service.ts
  - packages/vitest/test/tsgo-gate/src/hook-satisfied.ts
  - packages/vitest/test/tsgo-gate/tsconfig.hook-missing.json
  - packages/vitest/test/tsgo-gate/tsconfig.hook-ok.json
  - scripts/verify-tsgo-gate.sh
  - spec/behaviors/02-shared-layers-and-tags.md
  - spec/behaviors/06-datatable-and-docstring-arguments.md
  - spec/behaviors/07-hook-ordering-and-guarantees.md
  - spec/behaviors/index.yaml
  - spec/decisions/005-effect-fn-for-step-and-hook-bodies.md
  - spec/invariants.md
findings:
  critical: 0
  warning: 4
  info: 1
  total: 5
status: issues_found
---

# Phase 07-hooks: Code Review Report

**Reviewed:** 2026-08-29T00:00:00Z
**Depth:** standard
**Files Reviewed:** 25
**Status:** issues_found

## Summary

This phase adds the six-hook surface (`Before`/`After`/`BeforeStep`/`AfterStep`/`BeforeAllScenarios`/
`AfterAllScenarios`) to `@effect-cucumber/vitest`. The implementation is unusually disciplined:
`Hook.ts`, `HookRegistry.ts`, `ScenarioEffect.ts` and `Runner.ts` each carry extensive doc comments
recording mutation-testing results, and the accompanying test suites (`Hook.test.ts`,
`HookRegistry.test.ts`, `ScenarioEffect.test.ts`, `Runner.test.ts`, `emission.test.ts`) assert ordering
and independent-batch/combined-cause behavior through recorded execution logs and reference-identity
checks rather than weaker "did it fail" assertions. I traced the production code
(`Dsl.ts`/`Hook.ts`/`HookRegistry.ts`/`ScenarioEffect.ts`/`Runner.ts`/`describeFeature.ts`/`index.ts`)
line by line against the spec (`spec/behaviors/07-hook-ordering-and-guarantees.md`,
`spec/invariants.md` INV-EC-004) and against `Step.ts`'s `register`, which `Hook.ts` delegates to. I
did not find a reproducible logic defect in the documented guarantees (D-01 through D-09 all hold as
written and as tested). What I did find are real gaps the extensive in-file documentation never
addresses: two places where the six-hook temporal guarantees quietly depend on an *unenforced* runtime
assumption (sequential, non-concurrent test execution within one file), one place where independent
Layer builds mean `BeforeAllScenarios`/`AfterAllScenarios`/a Scenario's own hooks cannot actually share
a resource despite the hook names suggesting they can, one place where a fiber interruption is treated
identically to an ordinary hook failure inside a batch loop, and one edge case (a Feature with a
`BeforeAllScenarios` hook but zero Scenarios) that silently drops the hook's own failure. None of these
rises to a definite BLOCKER — each is either scoped by this phase's own stated boundaries or a rare
edge case — but all four WARNINGs are real, none is a style preference, and none is discussed anywhere
in this phase's (considerable) documentation, which is itself notable given how thoroughly every other
subtlety in these files is called out.

## Warnings

### WR-01: The six-hook temporal ordering (D-08/D-09) is not structurally enforced — it depends on vitest running one file's tests sequentially, which nothing in this code guarantees or checks

**File:** `packages/vitest/src/Runner.ts:170-185` (`makeOnce`) and `packages/vitest/src/Runner.ts:287-294` (the `AfterAllScenarios` node)

**Issue:** Every other guarantee in this phase is structural — `Before` gates the step loop because a
generator that failed simply doesn't advance (`ScenarioEffect.ts` note (d)), `After`/`AfterStep` are
guaranteed via `Effect.onExit`, which Effect itself runs regardless of scheduling. `BeforeAllScenarios`
running exactly once (D-08) and `AfterAllScenarios` running only after every Scenario (D-09) are
different: they are NOT guaranteed by any synchronization Effect provides.

- `makeOnce`'s own doc comment says the plain `started` boolean is "sound because the framework runs
  the tests of one file sequentially, and every node this module emits runs to completion before the
  next one begins — there is no interleaving for two callers to race inside." That is an assumption
  about the *caller's* scheduler, not something `makeOnce` (or anything in `Runner.ts`) checks or
  enforces. If two Scenario thunks from the same Feature are ever invoked concurrently — e.g. a
  consumer sets vitest's `sequence.concurrent: true`, or marks the containing `describe` `.concurrent`
  — `started` can be read by both callers before either sets it to `true`, and `BeforeAllScenarios`
  runs twice, silently violating D-08 with no failing assertion anywhere (this exact race is why
  `started` is a plain boolean rather than an `Effect`-native primitive; a `Ref`/`Effect.once`-style
  guard would not have this window).
- The `AfterAllScenarios` node (`Runner.ts:287-294`) is emitted as a plain sibling `it.effect` with no
  synchronization to the Scenario nodes at all — no `Deferred`, no barrier, nothing. Its "runs after
  every Scenario" guarantee is entirely a side effect of vitest's default sequential-within-a-file
  scheduling. Under the same concurrency configuration above, `AfterAllScenarios` could run while a
  Scenario is still in flight or before it has even started, directly contradicting the D-09 wording
  ("runs once, after every Scenario in the Feature has been attempted") that `Runner.ts` note (e)
  itself quotes.

This gap is not called out anywhere in this phase's documentation, even though every other assumption
in these files gets its own numbered note. A future reader enabling vitest's concurrency options (a
one-line `vitest.config.ts` change, not something this package can prevent) gets silent D-08/D-09
violations with a green test suite.

**Fix:** Either (a) document the sequential-execution precondition prominently — e.g. in
`packages/vitest/README.md`'s hooks section, not only in an internal source comment — and consider
detecting/rejecting concurrent scheduling defensively, or (b) make the guarantee structural: replace
`started` with an actual `Ref`-guarded check-and-set (still synchronous-safe, but correct under
concurrent callers), and give `AfterAllScenarios` a real barrier (e.g. a second `Deferred` per Scenario
that `AfterAllScenarios`'s body awaits) so the ordering holds regardless of the framework's scheduling
mode.

---

### WR-02: `BeforeAllScenarios`, `AfterAllScenarios`, and each Scenario's own hooks/steps each build an independent Layer instance, so a resource cannot actually be shared between them despite the hook names implying it can

**File:** `packages/vitest/src/Runner.ts:243-245` (the once-cell's own `Effect.provide(layer)`) and `packages/vitest/src/Runner.ts:287-294` (the `AfterAllScenarios` node's own, separate `Effect.provide(layer)`)

**Issue:** `beforeAllScenariosCell` is built as
`makeOnce(runHookBatch(hooks.BeforeAllScenarios).pipe(Effect.provide(layer)))` — one Layer build, shared
by every caller via the once-cell. The `AfterAllScenarios` node, by contrast, builds its own,
independent `runHookBatch(hooks.AfterAllScenarios).pipe(Effect.provide(layer))` inside its own thunk —
a *second*, unrelated build of the same Layer. Every Scenario's own `Before`/steps/`After` likewise
provide a third (fourth, fifth, ...) independent build via `ScenarioEffect.ts`'s
`buildScenarioEffect`. For a stateful Layer (`Layer.effect`/`Layer.scoped` constructing a fresh `Ref`,
opening a connection, starting a testcontainer, etc.), this means a resource acquired inside a
`BeforeAllScenarios` hook body is invisible to an `AfterAllScenarios` hook body and to every Scenario's
own hooks — each sees its own freshly-built instance. A test author who writes
`BeforeAllScenarios(() => acquire())` / `AfterAllScenarios(() => release())` expecting the intuitive
"set up once, tear down once" bookend semantics those names suggest gets two disconnected resources
instead: the one `BeforeAllScenarios` set up is never released, and `AfterAllScenarios` releases a
resource nothing ever used.

This is consistent with this milestone's documented scope (`ScenarioEffect.ts` note (b): "This phase
provides the Feature's single merged Layer uniformly, with no shared/per-Scenario distinction at
runtime"; the roadmap defers the build-once `shared` Layer to Phase 10), so it is not a regression
against this phase's stated invariants. But `packages/vitest/README.md`'s hooks paragraph and
`spec/behaviors/07-hook-ordering-and-guarantees.md`'s worked example both present
`BeforeAllScenarios`/`AfterAllScenarios` as ordinary bookend hooks with no caveat about Layer identity,
and nothing in either document (or in `Runner.ts`'s otherwise-exhaustive lettered notes) warns a reader
that a resource cannot be threaded between them today. A user reading only the README will write code
that leaks resources.

**Fix:** Add an explicit caveat to `packages/vitest/README.md`'s hooks paragraph (and ideally to
`BEH-EC-017` itself) stating that until Phase 10's build-once `shared` Layer ships,
`BeforeAllScenarios`/`AfterAllScenarios`/a Scenario's own hooks each see an independently-built Layer
instance, so cross-hook resource sharing requires routing state through something outside the Layer
(e.g. a module-scope handle) until the shared-Layer path exists.

---

### WR-03: `runHookBatch`'s independent-batch loop treats a fiber interruption identically to an ordinary hook failure and keeps running the rest of the batch

**File:** `packages/vitest/src/Hook.ts:174-194`

**Issue:**

```ts
for (const hook of hooks) {
  const exit = yield* Effect.exit(hook())
  if (Exit.isFailure(exit)) {
    failures.push(exit.cause)
  }
}
```

`Effect.exit` converts *any* failure — including an interruption cause delivered to the fiber running
`hook()` (e.g. a vitest per-test timeout interrupting the fiber mid-hook) — into an ordinary `Exit`
value. The loop does not distinguish `Cause.isInterruptedOnly(exit.cause)` from an author-thrown
failure: it pushes the interruption cause onto `failures` exactly like any other error and proceeds to
run the *next* hook in the batch. The result is that once a batch's current hook is interrupted (e.g.
by a timeout), the remaining hooks in that same batch still run to completion — potentially doing
further I/O, further suspensions, and further side effects — after the fiber was told to stop. None of
this file's seven lettered notes (which discuss ordering, `Cause.combine`, and `Effect.ensuring` in
detail) mention interruption at all, so it is unclear whether continuing past an interrupt was a
deliberate choice or simply never considered.

**Fix:** Either document this as intentional (hooks are meant to behave like `finally` blocks and
should run to completion even under interruption — a defensible position, but it should be stated, not
silent), or short-circuit the loop when the collected cause is purely an interruption:

```ts
for (const hook of hooks) {
  const exit = yield* Effect.exit(hook())
  if (Exit.isFailure(exit)) {
    failures.push(exit.cause)
    if (Cause.isInterruptedOnly(exit.cause)) {
      break
    }
  }
}
```

---

### WR-04: A Feature that registers `BeforeAllScenarios` but has zero Scenarios silently never runs (and never surfaces the failure of) that hook

**File:** `packages/vitest/src/Runner.ts:243-282`

**Issue:** `beforeAllScenariosCell` (lines 243-245) is constructed whenever
`hooks.BeforeAllScenarios.length > 0`, but the `Effect.suspend` thunk inside `makeOnce` (`Runner.ts:175`)
only runs when something actually `yield*`s the cell — which happens exclusively inside a Scenario's
own emitted thunk (lines 251-260 and 270-279). If `plan.feature.scenarios` and every `rule.scenarios`
are both empty (a syntactically valid, if unusual, `.feature` file with a Feature but no Scenarios), no
thunk ever touches `beforeAllScenariosCell`, so the registered `BeforeAllScenarios` hook body never
executes at all — including a `BeforeAllScenarios` hook that is *expected* to fail and whose failure
D-08 says "is reported by every Scenario individually." With zero Scenarios there is nothing to report
it to, so the failure (and the hook itself) simply vanishes with no test node, no warning, and no
non-zero exit code anywhere. This is a narrow edge case, but it is a real, silent divergence from the
stated contract for a valid input.

**Fix:** When `hooks.BeforeAllScenarios.length > 0` (or `hooks.AfterAllScenarios.length > 0`) and the
Feature has no Scenarios at all, either force the once-cell (or the `AfterAllScenarios` batch) to run
via its own dedicated node — similar to the existing `AfterAllScenarios` node emitted unconditionally —
so a Feature-wide hook registered against an empty Feature still executes and still reports its own
failure, rather than being silently dropped.

## Info

### IN-01: `emitFeature`'s AfterAllScenarios and BeforeAllScenarios rebuild the Layer via two structurally-identical `.pipe(Effect.provide(layer))` call sites with no shared helper

**File:** `packages/vitest/src/Runner.ts:244` and `packages/vitest/src/Runner.ts:289-291`

**Issue:** Both call sites independently write `runHookBatch(hooks.X).pipe(Effect.provide(layer))`,
which is exactly the pattern that motivates WR-02 above — the duplication itself is fine (each site
genuinely does something different: one is wrapped in `makeOnce`, the other isn't), but a reader
looking only at one of the two sites has no local signal that the other exists and builds its own,
disconnected Layer instance. This is not a maintainability defect on its own, but it is the same code
shape that produces WR-02's behavioral surprise, and a short comment cross-referencing the two sites
(the way this file cross-references almost everything else) would make the Layer-independence easier to
notice during a future edit.

**Fix:** Optional — a one-line comment at each site pointing at the other (`// A SEPARATE Layer build
from beforeAllScenariosCell's own — see note (e).`) would make the independence explicit rather than
implicit, consistent with this file's existing documentation style.

---

_Reviewed: 2026-08-29T00:00:00Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
