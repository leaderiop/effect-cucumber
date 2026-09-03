# Spike: a working fix for the BeforeAllScenarios timeout-cascade bug

> Resolves GitHub issue [#37](https://github.com/leaderiop/effect-cucumber/issues/37)
> (part of the wayfinder map, issue [#11](https://github.com/leaderiop/effect-cucumber/issues/11)).
> Follows up on issue [#36](https://github.com/leaderiop/effect-cucumber/issues/36)'s
> [`research/parallel-scenario-execution-feasibility.md`](https://github.com/leaderiop/effect-cucumber/blob/research/parallel-scenario-execution-feasibility/research/parallel-scenario-execution-feasibility.md),
> which reached an unhedged verdict — concurrent Scenario execution is realistically buildable —
> and named the one concrete change required: move `BeforeAllScenarios` off "runs inside whichever
> Scenario attempts it first" and onto a real vitest `beforeAll`, with its own timeout budget.

This is a **spike**: a cheap, rough, working prototype built to raise the fidelity of a design
discussion, on the throwaway branch `spike/concurrent-execution`. It is not production code and is
not a PR. `packages/vitest/src/Runner.ts` was modified directly on this branch (not on `main`) so
the fix could actually be exercised under real `vitest run`, per the spike's own brief.

## Method

Read, before writing anything: `packages/vitest/src/Runner.ts` and `VitestTestApi.ts` (the real
`makeOnce`/`BeforeAllScenarios` wiring, and how `AfterAllScenarios` was ALREADY on a real `afterAll`
before this spike), `spec/behaviors/07-hook-ordering-and-guarantees.md` (the full six-hook guarantee
this spike must not regress), and `research/effect-vitest-v4-api.md` (the installed `@effect/vitest`
API surface, so this doc could match its documented conventions). Then: implemented the fix,
reproduced the bug, ran the fix against the reproduction, ran the existing hook-ordering suite, and
recorded actual `vitest run` output throughout — no step below is a paper argument.

---

## 1. What was actually wrong, restated precisely

`AfterAllScenarios` was **already** registered through a real framework `afterAll`
(`api.afterAll(afterAllScenariosTitle, ...)`, `TestApi.ts`'s `afterAll` member) before this spike —
that part of issue #36's research was slightly imprecise about the starting state. The actual bug
lived entirely in `BeforeAllScenarios`: a hand-rolled once-cell (`makeOnce`, `Deferred`-backed)
invoked from _inside_ whichever Scenario's own `it.effect` body reached it first:

```ts
// Runner.ts, main, pre-fix
const beforeAllScenariosCell = hooks.BeforeAllScenarios.length > 0
  ? makeOnce(runHookBatch(hooks.BeforeAllScenarios))
  : null
...
api.effect(titleFor(scenarioPlan), () => {
  attempted = true
  return Effect.flatMap(beforeAllScenariosCell, () => buildScenarioEffect(...))
}, ...)
```

Under sequential execution this is harmless — only the literal first Scenario is ever exposed to the
setup's duration against its own `testTimeout`. Under `sequence.concurrent: true` /
`describe.concurrent`, multiple Scenarios start their own `testTimeout` countdown at roughly the
same instant while racing the same in-flight setup. Whichever one wins the once-cell race becomes
the setup's sole executor — arbitrary, not document order — and if a **different, shorter-timeout**
sibling loses patience first, its interrupt cascades through the shared `Deferred` and fails every
other concurrently-scheduled Scenario too, even ones whose own configured timeout was never in
danger. § 3 reproduces this with real `vitest run` output.

---

## 2. The fix implemented

`BeforeAllScenarios` now runs via a real `TestApi.beforeAll` — a new member added to the `TestApi`
seam (`packages/vitest/src/TestApi.ts`), implemented in both `VitestTestApi.ts` adapters
(`vitestTestApi` for the plain path, `sharedLayerTestApi` for the shared-Layer path, mirroring the
shape their own `afterAll` members already had — the shared path's `beforeAll` re-runs
`Layer.buildWithMemoMap` against the SAME `memoMap` its own internal `beforeAll(build hold)` already
populated, reusing rather than rebuilding, exactly the technique `afterAll` already used for
teardown), and registered once at the top of `Runner.ts`'s `emitFeature`, ahead of every Scenario and
every nested Rule block:

```ts
// Runner.ts, this branch, post-fix
let beforeAllScenariosExit: Exit.Exit<void, unknown> | null = null

if (hasBeforeAllScenarios) {
  api.beforeAll(
    beforeAllScenariosTitle,
    () =>
      Effect.map(Effect.exit(runHookBatch(hooks.BeforeAllScenarios)), (exit) => {
        beforeAllScenariosExit = exit
      })
  )
}
```

Every Scenario thunk now reads the captured `Exit` instead of racing the batch:

```ts
Effect.suspend(() =>
  beforeAllScenariosExit === null
    ? runScenario()
    : Effect.flatMap(beforeAllScenariosExit, runScenario)
)
```

Two design decisions here are load-bearing, and neither was obvious going in — both are documented
in `Runner.ts`'s own header comment so a future reader does not "clean" them away.

### 2a. The captured-`Exit` indirection is NOT incidental — it is what preserves BEH-EC-017

The naive version of this fix is "just let the real `beforeAll` throw on failure." That is what
`Effect.runPromise(runHookBatch(hooks.BeforeAllScenarios))` directly inside `api.beforeAll` would do.
It was tried, empirically, against raw `vitest`:

```ts
describe("failing-beforeAll-block", () => {
  beforeAll(() => {
    throw new Error("BeforeAllScenarios blew up")
  })
  it("scenario A", () => {})
  it("scenario B", () => {})
  it("scenario C", () => {})
})
```

```
 ↓ failing-beforeAll-block > scenario A
 ↓ failing-beforeAll-block > scenario B
 ↓ failing-beforeAll-block > scenario C

⎯⎯⎯⎯⎯⎯ Failed Suites 1 ⎯⎯⎯⎯⎯⎯⎯
 FAIL  ... > failing-beforeAll-block
Error: BeforeAllScenarios blew up
...
 Test Files  1 failed (1)
      Tests  3 skipped (3)
```

A real `beforeAll` that throws produces **exactly** the shape BEH-EC-017 rules out: "If
BeforeAllScenarios fails, that SAME failure is reported by EVERY Scenario in the Feature
individually, **not by a single Feature-level failure with zero Scenario results**." A directly
failing `beforeAll` is one suite-level failure with every sibling test marked **skipped** — not
failed, skipped, so a Scenario that legitimately depended on a broken setup would report as if it
never ran at all. Naively "just moving BeforeAllScenarios to beforeAll" would have fixed the
timeout-cascade bug while silently regressing this guarantee.

The fix: the `beforeAll` body wraps the batch in `Effect.exit(...)` and **never itself throws** — it
always resolves, storing the Exit in a closure variable. Every Scenario then independently
`flatMap`s that captured Exit, so a BeforeAllScenarios failure still surfaces as N individually
failing Scenario nodes, each carrying the identical `Cause`, exactly as before. § 3.3 proves this
empirically too.

### 2b. No manual "was anything attempted" guard is needed for the new `beforeAll`'s registration

The obvious worry: a real `beforeAll`/`afterAll` registered at the Feature-block level "runs
unconditionally unless you guard it," and `AfterAllScenarios`'s existing carve-out (RUN-05,
ADR-EC-026 — "a Feature whose Scenarios are all skipped or all filtered out" must not tear down
anything, because nothing was ever set up) needs to be re-derived for `BeforeAllScenarios` under the
new trigger.

It does **not** need a hand-rolled guard. Verified empirically, three ways, against real `vitest
run` (all three throwaway probes, deleted before the final commit — not part of the fix):

- **Every Scenario `.skip`-tagged** (native `it(..., {skip: true})`, this library's actual skip
  mechanism per ADR-EC-020): the block's `beforeAll`/`afterAll` never fire at all — no log line from
  either.
- **`-t` name filter matching zero tests in the block**: same — neither hook fires, even though the
  tests are declared (not literally `.skip`), because vitest resolves the filter before scheduling
  hooks.
- **`--tagsFilter` (vitest's native tag filter, what this library's `includeTags`/`excludeTags`
  registration-time filtering and CLI filtering both route through, per ADR-EC-026) matching zero
  tests in the block**: same again.
- **Nested**: a Rule's own `describe` block, nested inside the Feature's, with every leaf `.skip`ped:
  the OUTER Feature block's `beforeAll`/`afterAll` still do not fire — vitest's scheduler recurses
  into nested blocks to decide this, not just the immediate children.

vitest's own suite scheduler already withholds a block's `beforeAll`/`afterAll` whenever **zero**
leaf tests anywhere under that block will actually run — recursively, across every exclusion
mechanism this library uses. So the guard `Runner.ts` needs for registering the new `beforeAll` is
exactly the one `AfterAllScenarios` already used for its own registration: `hooks.BeforeAllScenarios
.length > 0`. Nothing more. `AfterAllScenarios`'s own `attempted`-flag guard (unchanged by this
spike — it is still set inside each Scenario's own thunk, unrelated to where `BeforeAllScenarios`
runs) stays as defense-in-depth for the one case vitest's own scheduler cannot see: a Scenario that
registers but is deselected by a filter vitest's `include`/`skip` machinery does not model natively.
It was not removed, and did not need to change.

---

## 3. Real reproduction: the bug, then the fix, then the guarantee

All three files below are on the spike branch, under `packages/vitest/test/spike-repro-*.test.ts`.
None goes through the public `describeFeature` DSL — **the DSL has no per-Scenario `testTimeout`
knob** (`Scenario(...)`'s two forms carry a name, an optional extra Layer, and a define callback;
`EmitOptions` passed to `TestApi.effect` carries `tags`/`skip`/`contextFree`, never a timeout), so
reproducing "one short-timeout Scenario, one long-timeout Scenario in the same Feature" needed to
drive the exact same mechanism (`makeOnce` for "before," the captured-Exit `beforeAll` for "after")
directly with `@effect/vitest`'s own `it.effect(name, fn, timeoutMs)`, the same primitive
`VitestTestApi.ts` builds on. This is a real, honest gap in the DSL surfaced by trying to reproduce
the bug faithfully — noted again in § 5.

### 3.1 Before the fix: the bug, reproduced

`spike-repro-before-fix.test.ts` copies `makeOnce` **verbatim** from `main`
(`git show origin/main:packages/vitest/src/Runner.ts`, confirmed identical byte-for-byte) and races
it under `describe.concurrent`, exactly like issue #36's own empirical check: a 400ms real setup (a
real `setTimeout`, not `Effect.sleep` — `it.effect` gives each test its own simulated `TestClock`,
so a shared cell's `Effect.sleep` never advances on its own), one Scenario with a 100ms `testTimeout`,
one with a 2000ms `testTimeout`.

Actual `vitest run` output (captured before the file was switched to `.fails` for repo hygiene — see
§ 5):

```
 × short-testTimeout scenario 108ms
   → Test timed out in 100ms.
 × long-testTimeout scenario 108ms
   → All fibers interrupted without error

⎯⎯⎯⎯⎯⎯⎯ Failed Tests 2 ⎯⎯⎯⎯⎯⎯⎯
 FAIL  ... > short-testTimeout scenario
 Error: Test timed out in 100ms.
 FAIL  ... > long-testTimeout scenario
 Error: All fibers interrupted without error

 Test Files  1 failed (1)
      Tests  2 failed (2)
```

The short-timeout Scenario times out, as expected — but the long-timeout Scenario, whose own 2000ms
budget was never remotely at risk, **also** fails, with `InterruptError`, exactly the cascade issue
#36's research predicted and the exact mechanism this spike targets.

### 3.2 After the fix: the same reproduction, resolved

`spike-repro-after-fix.test.ts` is the **identical** scenario (same 400ms setup, same 100ms/2000ms
`testTimeout`s, same `describe.concurrent`), wired through this spike's actual fix — a real
`beforeAll` capturing an `Exit`, every Scenario `flatMap`ing it, exactly matching
`Runner.ts`'s real shape on this branch.

```
 ✓ short-testTimeout scenario 2ms
 ✓ long-testTimeout scenario 2ms

 Test Files  1 passed (1)
      Tests  2 passed (2)
```

Both pass — not narrowly (e.g. "the long one now also survives interruption"), but cleanly: since
the real `beforeAll` fully completes, on its own independent timeout budget, before **either**
Scenario's own body starts, neither Scenario's `testTimeout` window ever has the 400ms setup cost in
it at all. Both finish in ~2ms.

### 3.3 The guarantee this spike had to preserve, also reproduced for real

`spike-repro-failure-propagation.test.ts` proves § 2a's claim with a real run, not just an argument:
`BeforeAllScenarios` fails; both Scenarios must fail **individually**, each carrying the same error,
not one suite-level failure with both skipped.

```
 × scenario A 4ms
   → BeforeAllScenarios blew up
 × scenario B 1ms
   → BeforeAllScenarios blew up

 Test Files  1 failed (1)
      Tests  2 failed (2)
```

Both fail, independently, each with the identical message — the shape BEH-EC-017 requires, not the
"one suite failure, all skipped" shape a naive `beforeAll`-throws-directly fix would have produced
(§ 2a's first transcript).

_(All three `spike-repro-*.test.ts` files use vitest's `.fails` — "expected to fail" — modifier in
their committed form, so `pnpm test` stays green on this branch; the transcripts above are the raw
output from an actual run without `.fails`, captured before that conversion. See § 5.)_

---

## 4. Regression check: the existing hook-ordering suite, under sequential execution

Requirement: confirm the non-concurrent path — the default, unchanged case every current consumer
runs — is byte-for-byte the same guarantee it was before this spike.

`packages/vitest/test/Runner.test.ts` drives `emitFeature` through a hand-written recording
`TestApi` fake (not real vitest) and asserts exact hook-ordering logs. Adding `TestApi.beforeAll`
meant the fake needed a `beforeAll` recorder (mirroring its existing `afterAll` one), and every test
that registers a `BeforeAllScenarios` hook needed to explicitly invoke the new `beforeAll` record
FIRST — exactly the order real vitest now guarantees — rather than relying on the old "whichever
Scenario runs first triggers it implicitly" shape. Every assertion's _expected log order_ is
unchanged; only how the fake test drives the thunks to produce it changed. The headline full-ordering
test (`"BeforeAllScenarios -> (Before -> BeforeStep/step/AfterStep x2 -> After) x2 ->
AfterAllScenarios"`) still asserts the identical 22-entry log.

Real `vitest run`, whole monorepo, after the fix:

```
Test Files  46 passed (46)
     Tests  900 passed | 4 expected fail | 4 skipped (908)
```

The 4 "expected fail" are the three `spike-repro-*.test.ts` files' `.fails`-marked tests (§ 3) —
deliberately, and by design. Every pre-existing test in the repository — `Runner.test.ts`'s full
hook-ordering suite, `emission.test.ts`'s real `describeFeature`/real-vitest suite (including the
`AfterAllScenarios`-under-CLI-filter and all-Scenarios-excluded/all-skipped carve-out tests this
spike's § 2b re-derived the guard for), `Hook.test.ts`, `ScenarioEffect.test.ts`, and every other
package's suite — passes unchanged. `tsc -b --force` and `oxlint`/`dprint check` are clean across the
whole repository.

---

## 5. Honest bottom line

**This worked cleanly, with one real, load-bearing surprise along the way — not zero snags, but a
scoped one that was caught, not glossed over.**

- **The core claim from issue #36's research holds.** Moving `BeforeAllScenarios` off the once-cell
  and onto a real vitest `beforeAll` directly fixes the reproduced bug: a short-timeout sibling can
  no longer externally kill a long-timeout sibling's otherwise-fine wait, because the setup's
  duration no longer lands inside _any_ Scenario's own `testTimeout` window at all.
- **The one real snag: a real `beforeAll`'s native failure-reporting shape does not match
  `BeforeAllScenarios`'s own documented guarantee**, and this was NOT something issue #36's research
  called out explicitly — it surfaced only by actually running a failing `beforeAll` under real
  vitest and reading the output (§ 2a). The naive version of this fix — "just let it throw" — would
  have silently traded the timeout-cascade bug for a DIFFERENT regression: BEH-EC-017's "same
  failure reported by every Scenario individually" becoming "one suite failure, every Scenario
  skipped." The fix needed one additional piece (capture the Exit, never let the hook itself throw)
  that is not obvious from "move it to beforeAll" alone, and is exactly the kind of thing this kind
  of spike is for — raising this to the design discussion rather than letting a future
  implementation discover it by shipping the regression.
- **The "find the right guard" requirement resolved more cleanly than expected — because vitest's
  own scheduler already does the work.** No hand-rolled "was anything attempted" tracking was needed
  for the new `beforeAll`'s registration; vitest itself already withholds a block's `beforeAll`/
  `afterAll` whenever nothing in that block will run, across every exclusion mechanism this library
  uses (`.skip`, `-t`, `--tagsFilter`, including through nested Rule blocks) — verified empirically,
  not assumed. `AfterAllScenarios`'s existing `attempted`-flag guard was untouched and needed no
  changes.
- **One real gap surfaced, out of scope for this spike to fix: the public DSL has no way to give one
  Scenario its own `testTimeout`.** Reproducing the exact "heterogeneous timeout siblings" scenario
  the research asked for meant bypassing `describeFeature` and driving the mechanism directly with
  `@effect/vitest`'s own primitives. A real implementation of this fix might reasonably want to close
  that gap too (or explicitly decide not to), but that is a separate, scoped design question — not
  something this spike should resolve as a side effect.
- **Recommendation: adopt this fix's SHAPE (real `beforeAll`, captured-`Exit` propagation, no manual
  attempted-guard needed for registration) as the basis for a real implementation**, not this spike's
  code verbatim — a real PR should also: decide whether/how to expose an independent, configurable
  timeout for `BeforeAllScenarios`/`AfterAllScenarios` (this spike relies on vitest's default hook
  timeout, which already solves the reported bug, but a consumer with a genuinely slow setup will
  want to raise it explicitly, the way `@effect/vitest`'s own `layer(..., {timeout})` does); decide
  whether `Runner.ts`'s scenario-thunk factory (`scenarioThunk`, this spike's refactor of the
  duplicated Feature-loop/Rule-loop body construction) is worth keeping as a real dedup or whether it
  should stay inline for locality with each loop, matching the codebase's existing "written out
  rather than shared" convention elsewhere in the same file; and re-verify the DSL-timeout gap noted
  above against the maintainers' actual intent before deciding whether it needs closing.

## Files touched on this spike branch

- `packages/vitest/src/TestApi.ts` — added the `beforeAll` seam member.
- `packages/vitest/src/VitestTestApi.ts` — implemented `beforeAll` for both adapters.
- `packages/vitest/src/Runner.ts` — the actual fix: removed `makeOnce`, added the real `beforeAll`
  registration and the captured-`Exit` propagation.
- `packages/vitest/test/Runner.test.ts` — fake `TestApi` updated with a `beforeAll` recorder; the
  BeforeAllScenarios-related tests updated to drive the new emission shape (same expected outcomes).
- `packages/vitest/test/acceptance/pitfalls-checklist.test.ts` — its own separate fake `TestApi`
  updated with a no-op `beforeAll` recorder (no fixture in that suite registers the hook).
- `packages/vitest/test/spike-repro-before-fix.test.ts`, `spike-repro-after-fix.test.ts`,
  `spike-repro-failure-propagation.test.ts` — the real reproductions this document cites, kept on the
  branch as scaffolding (all `.fails`-marked so `pnpm test` stays green).
