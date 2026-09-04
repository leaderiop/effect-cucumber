# ADR-EC-040: BeforeAllScenarios moves off a hand-rolled once-cell onto a real vitest `beforeAll`, captures its Exit rather than throwing, and Scenarios gain a `@timeout-<ms>` tag for concurrent execution to be useful

> **Status:** Accepted and implemented — `packages/vitest/src/Runner.ts` (the `beforeAll`
> registration and `beforeAllScenariosExit` capture, `makeOnce`/`Deferred` removed entirely),
> `packages/vitest/src/TestApi.ts` (the new `beforeAll` seam member, `EmitOptions.timeout`),
> `packages/vitest/src/VitestTestApi.ts` (both adapters' `beforeAll` implementations, the
> `timeout` threading through `makeDegradingEffect`), `packages/vitest/src/Tags.ts`
> (`readScenarioTimeoutTag`), proven by `packages/vitest/test/Runner.test.ts`,
> `packages/vitest/test/Tags.test.ts`, `packages/vitest/test/emission.test.ts`'s new
> shared-tier `BeforeAllScenarios` proof, the acceptance pair
> (`packages/vitest/test/acceptance/scenario-timeout.feature`/`.steps.test.ts`, `@REQ-EC-032`),
> and — from OUTSIDE the test process, across two real `vitest run` invocations —
> `scripts/verify-concurrent-execution.sh`
> **Date:** 2026-09-04
> **Context:** implements the "Concurrent Scenario execution" entry locked under
> `spec/roadmap.md`'s § Planned ([#37](https://github.com/leaderiop/effect-cucumber/issues/37),
> itself downstream of [#36](https://github.com/leaderiop/effect-cucumber/issues/36)'s feasibility
> research), building on a real, working spike (`origin/spike/concurrent-execution`,
> `research/concurrent-execution-spike.md`) that reproduced the exact bug for real and proved the
> fix's SHAPE — re-verified here against a `main` the spike's own write-up flagged as having moved
> materially since (retries, tagged hooks, Attachments, Metric, rerun-failed-only and Rule-narrowing
> all touched `Runner.ts`/`VitestTestApi.ts`)

## Context

`AfterAllScenarios` was already registered through a real framework `afterAll` before this ADR.
`BeforeAllScenarios` was not: it ran through a hand-rolled once-cell (`makeOnce`, backed by
`Deferred`) invoked from INSIDE whichever Scenario's own `it.effect` body reached it first. Under
sequential execution this is harmless — the literal first Scenario alone is ever exposed to the
setup's real duration, against its own `testTimeout`. Under concurrent scheduling, multiple
Scenarios' fibers can race into the once-cell at roughly the same instant, each starting its OWN
`testTimeout` countdown against the shared in-flight setup; whichever Scenario's timeout is smallest
can time out first, and its interrupt cascades through the shared `Deferred`, failing every other
concurrently-scheduled Scenario too — including one whose own, larger budget was never at risk. This
is a real bug, reproduced for real (§1 below), not a theoretical one.

The spike proved the fix's shape works: move `BeforeAllScenarios` onto a real `beforeAll`,
registered once at the Feature block level, and — critically — capture its `Exit` in a closure
variable rather than letting a failing `beforeAll` throw directly, because a real vitest `beforeAll`
that throws marks every sibling test SKIPPED, not failed, which silently regresses BEH-EC-017's "the
SAME failure is reported by EVERY Scenario individually" guarantee. The spike also found, empirically,
that no manual "was anything attempted" guard is needed for the new `beforeAll`'s own registration —
vitest's own scheduler already withholds a block's `beforeAll`/`afterAll` whenever nothing in that
block will run. Both findings are re-verified here, independently, against the CURRENT `main`
(§1–§2), not merely cited from the spike.

The spike also surfaced, and explicitly left open, that the public DSL has no way to give one
Scenario its own `testTimeout` — every Scenario in a Feature shares the ONE `testTimeout` the Feature
(or vitest's own default) sets. `spec/roadmap.md`'s own "Concurrent Scenario execution" entry (already
present, locked) says ship both together: concurrent execution alone gains nothing for a Feature with
genuinely heterogeneous per-Scenario budgets, since every Scenario would still share one timeout. This
ADR designs and ships that knob too.

## Decision

### 1. `BeforeAllScenarios` moves onto a real `TestApi.beforeAll`, registered once, ahead of every Scenario and every Rule

`TestApi.ts` gains a fourth seam member, mirroring `afterAll`'s own shape exactly:

```ts
export interface TestApi {
  readonly describe: (name: string, define: () => void) => void
  readonly effect: (name: string, self: () => Effect.Effect<void, unknown, Scope.Scope>, options: EmitOptions) => void
  readonly beforeAll: (name: string, self: () => Effect.Effect<void, unknown, Scope.Scope>) => void
  readonly afterAll: (name: string, self: () => Effect.Effect<void, unknown, Scope.Scope>) => void
}
```

`Runner.ts`'s `emitFeature` registers it as the FIRST statement inside `api.describe(plan.feature.name,
...)`, guarded by the same `hooks.BeforeAllScenarios.length > 0` check `AfterAllScenarios` already
used:

```ts
if (hasBeforeAllScenarios) {
  api.beforeAll(
    beforeAllScenariosTitle,
    () =>
      Effect.map(Effect.exit(runHookBatch(hooks.BeforeAllScenarios, [])), (exit) => {
        beforeAllScenariosExit = exit
      })
  )
}
```

`makeOnce`/`Deferred` are removed entirely — not deprecated, not kept alongside as a fallback. Every
Scenario thunk (Feature-level and Rule-nested alike) now reads the captured Exit through one small
helper instead of racing a once-cell:

```ts
const withBeforeAllScenarios = (
  effect: Effect.Effect<void, unknown, Scope.Scope>
): Effect.Effect<void, unknown, Scope.Scope> =>
  !hasBeforeAllScenarios || beforeAllScenariosExit === null
    ? effect
    : Effect.flatMap(beforeAllScenariosExit, () => effect)
```

`beforeAllScenariosExit === null` is reachable only if a Scenario's thunk somehow ran before its
Feature's own `beforeAll` — never true under real vitest scheduling (a `beforeAll` always resolves
before any `it` in its own block starts, sequential or concurrent). The check is defensive, not load-
bearing.

### 2. The captured-Exit indirection is what preserves BEH-EC-017 — verified, not assumed

The naive version of this fix — `Effect.runPromise(runHookBatch(...))` directly inside
`api.beforeAll`, letting a failure propagate straight to vitest — was tried, for real, against real
`vitest run`:

```
 FAIL  ... > failing-beforeAll-block
Error: BeforeAllScenarios blew up
 Test Files  1 failed (1)
      Tests  3 skipped (3)
```

Every sibling test reports **skipped**, not failed — exactly the shape BEH-EC-017 rules out ("not by
a single Feature-level failure with zero Scenario results"). The fix: the `beforeAll` body wraps the
batch in `Effect.exit(...)` and never itself throws, storing the result in
`beforeAllScenariosExit` (a closure variable). Every Scenario then independently `flatMap`s that
captured Exit, so a BeforeAllScenarios failure still surfaces as N individually FAILING Scenario
nodes, each carrying the identical `Cause` — INV-EC-011. Proven for real, under real CONCURRENT
scheduling (not merely sequential, which the spike's own transcript above already covered), by
`scripts/verify-concurrent-execution.sh`'s second run (§6).

### 3. No manual "was anything attempted" guard needed for the new `beforeAll`'s own registration

Re-verified, independently, against the current `main`'s real emitted shape (three throwaway probes
run and discarded, not committed): a Feature whose every Scenario is `.skip`-tagged, one narrowed to
zero tests by `-t`, one narrowed to zero by `--tagsFilter`, and one where every leaf inside a nested
Rule block is skipped — in all four cases, neither `beforeAll` nor `afterAll` fires at all. vitest's
own suite scheduler recurses into nested blocks to decide this, not merely the immediate children. So
the guard `Runner.ts` needs for registering the new `beforeAll` is exactly the one `AfterAllScenarios`
already used: `hooks.BeforeAllScenarios.length > 0`, nothing more.
`AfterAllScenarios`'s own `attempted`-flag guard (set inside each Scenario's own thunk, unrelated to
where `BeforeAllScenarios` runs) is untouched — it remains defense-in-depth for the one case vitest's
own scheduler cannot model: a Scenario deselected by a filter this library applies at REGISTRATION
time, which vitest's own `include`/`skip` machinery never sees as "skipped" at all (it was simply
never emitted).

### 4. The per-Scenario timeout knob: a `@timeout-<positive integer milliseconds>` Gherkin tag

Shape chosen: a reserved tag, read from the Scenario's own already-flattened, inherited tags
(`Tags.ts`'s `readScenarioTimeoutTag`), the SAME mechanism `@retry`/`@skip` already use — not a new
`Scenario(...)` call-arity or a `DescribeFeatureOptions` field. Precedent: every other per-Scenario
behavioral flag in this DSL (`@skip`, `@retry`) is already Gherkin-tag-driven, needs no DSL signature
change, and composes for free with Rule/Feature/Examples-row inheritance (ADR-EC-026) and with
`describeFeature`'s existing `includeTags`/`excludeTags` filtering. A `Scenario`-level TypeScript
option was considered and rejected: it would be a FIFTH shape competing with `ScenarioRegistrar`'s
existing two-argument/three-argument forms and ADR-EC-039's Rule-narrowing four-argument form, adding
real signature surface for a value that — like `@retry` — is naturally a per-Scenario Gherkin-level
concern, not a TypeScript-level one.

```ts
// Tags.ts
const timeoutTagPattern = /^@timeout-(\d+)$/
export const readScenarioTimeoutTag = (tags: ReadonlyArray<string>): number | null => {/* last match wins */}
```

The LAST matching occurrence in the flattened array wins — Feature/Rule tags come first, Scenario and
Examples-row tags come last (ADR-EC-026's own flattening order), so the MOST SPECIFIC declaration
overrides an inherited default, the same "closer wins" semantics a reader would expect.

**A real wall this session hit, that the spike did not anticipate**: the tag's parameter was
ORIGINALLY designed as a parenthesised call, `@timeout(5000)`, mirroring an ordinary function-call
reading. Building the acceptance pair and the cross-run fixture with that shape failed at
`vitest.config.ts` LOAD time, repository-wide, with a HARD startup error:

```
Error: Tag name "@timeout(500)" is invalid. Tag names cannot contain "!", "*", "&", "|", "(", or ")".
```

vitest's own `test.tags` declaration mechanism rejects a tag NAME containing parentheses outright —
not a warning, not a graceful degrade, a startup failure. This repository's own `vitest.tags.ts`
unconditionally scans and declares every tag any `packages/vitest/test/acceptance/**/*.feature` file
carries (`declaredTags`, `GherkinTags.ts`), so a single parenthesised `@timeout(...)` tag anywhere in
the acceptance suite would have broken `vitest.config.ts` for the WHOLE repository, not merely
degraded that one Scenario. This was discovered only by actually trying to use the tag where it
needed to live, not by reasoning about the design in the abstract — exactly the kind of thing real
implementation surfaces that a paper design does not. The fix: the parameter is a HYPHEN suffix,
`@timeout-5000`, which contains none of the six characters vitest's tag-name grammar forbids
(`!`, `*`, `&`, `|`, `(`, `)`). Every other aspect of the design (last-match-wins inheritance, loud
malformed-tag throw, registration-time decision in `Runner.ts`, application only in
`VitestTestApi.ts`) is unchanged from the original plan.

A malformed occurrence — `@timeout` alone, a non-numeric suffix, a non-positive value, or the
rejected parenthesised shape — is a loud, located, registration-time `Error` (`Tags.ts`), the same
"fail loudly rather than silently degrade" posture ADR-EC-019/ADR-EC-039 already established: a
silently-ignored malformed timeout would leave a Scenario back on the Feature's shared default with
no signal anything was wrong.

**A second, real, disclosed cost**: `@timeout-<ms>` can never be declared under a CONSUMER's own
`test.tags` strict declaration either, for the identical structural reason — wait, that reason (the
hyphen fix) no longer applies to the hyphen form itself, but a genuinely different limitation remains:
`test.tags` is meant for a FIXED, enumerable vocabulary declared once; `@timeout-<ms>` is
parameterized per Scenario, so a consumer with many different timeout values would need to enumerate
every literal value they use (`@timeout-500`, `@timeout-2000`, `@timeout-30000`, ...) in their own
config, or accept the existing `UndeclaredTagWarning` degrade path (ADR-EC-026) for Scenarios using
values they didn't enumerate. This is the same cost `@retry`/`@skip` never have (fixed, single-value
tags a consumer declares once) — recorded here rather than hidden.

### 5. `EmitOptions.timeout` carries the decision across the seam; `VitestTestApi.ts` alone applies it

```ts
export interface EmitOptions {
  readonly tags: ReadonlyArray<string>
  readonly skip: boolean
  readonly retry: boolean
  readonly contextFree: boolean
  readonly scenario: boolean
  readonly rerunKey: string | null
  readonly timeout: number | null
}
```

`Runner.ts` decides (`readScenarioTimeoutTag(scenarioPlan.tags)`), never applies — the same
"decide here, apply one module over" split `retry`/`rerunKey` already established, because
`Runner.ts`/`TestApi.ts` may not import a test framework (`scripts/verify-testapi-seam.sh`).
`VitestTestApi.ts`'s `makeDegradingEffect` threads it into the reduced options object it hands
`it.effect`, converting the library's `number | null` (ADR-EC-038's `rerunKey` convention) into
`@effect/vitest`'s real `TestOptions.timeout?: number` — an OMITTED key on `null`, via a spread,
rather than an explicit `timeout: undefined`, which this repository's `exactOptionalPropertyTypes`
rejects on an optional field just as it rejects `null`:

```ts
const timeout = options.timeout === null ? {} : { timeout: options.timeout }
emit(name, observedSelf, { tags: [...options.tags], skip: options.skip, rerunKey: options.rerunKey, ...timeout })
```

This reaches `@effect/vitest`'s REAL, installed signature — verified directly against
`node_modules/@effect/vitest`'s own `.d.ts` (rc.112): `it.effect(name, self, timeout?: number |
V.TestOptions)`, and `V.TestOptions.timeout?: number` (from `@vitest/runner`'s own `TestOptions`),
not a characterization inferred from documentation.

### 6. `BeforeAllScenarios` on the shared-Layer path needs its OWN explicit re-provision — a real correctness gap this move opens, closed here

Before this ADR, `BeforeAllScenarios` ran INSIDE whichever Scenario's own body reached the once-cell
first — which, on the shared-Layer path, is `@effect/vitest`'s own `layer(...)`-provisioned
`methods.effect`, ambiently supplying the shared tier to whatever runs inside it. A real, separate
`beforeAll` registered directly through vitest's own `beforeAll` import runs OUTSIDE that
provisioning entirely — `layer(...)` only auto-provides the built shared services to
`methods.effect`/`methods.it`-registered bodies, never to a bare `beforeAll`. Moving
`BeforeAllScenarios` to a real `beforeAll` without addressing this would have left its real `RShared`
requirement with NOTHING supplying it at runtime on the shared path — a defect this ADR's own
implementation caught and fixed, not merely inherited from the spike (the spike's own local
reconstruction never exercised `sharedLayerTestApi` at all).

The fix, mirroring `sharedLayerTestApi`'s existing `afterAll` implementation exactly: re-run
`Layer.buildWithMemoMap(sharedTier, memoMap, scope)` against the SAME `memoMap` the block's own
`beforeAll(build hold)` (registered earlier, by the `describe` factory) already populated —
`beforeAll`s run in registration order, so the hold's build has already completed by the time this
one fires, and reusing the memoized build costs nothing extra:

```ts
beforeAll: ;
;((_name, self) => {
  requireSharedIt("beforeAll")
  beforeAll(() =>
    Effect.runPromise(Effect.scoped(Effect.gen(function*() {
      const scope = yield* Effect.scope
      const services = yield* Layer.buildWithMemoMap(sharedTier, memoMap, scope)
      yield* self().pipe(Effect.provide(testEnv), Effect.provide(services))
    })))
  )
})
```

Proven for real, not merely by type-checking: `packages/vitest/test/emission.test.ts`'s
`sharedBuildFeature` now also registers a `BeforeAllScenarios` reading the shared `SharedProbe`
service, asserting `sharedBeforeAllObservations` reads `buildOrdinal: 1` — the SAME build the three
Scenarios and the existing `AfterAllScenarios` teardown already observed, never a second, independent
build.

### 7. Opting into concurrent execution: an ordinary vitest config setting, not new plumbing

`Runner.ts`'s `api.describe(name, define)` implementations (`VitestTestApi.ts`) call
`describe(name, { shuffle: false }, define)` — never pinning `concurrent: false`. A consumer opts a
Feature's emitted Scenarios into concurrent scheduling the ordinary vitest way:
`test.sequence.concurrent: true` in `vitest.config.ts` (project-wide, or scoped to a specific test
file's own config). No new option on `describeFeature`, `DescribeFeatureOptions`, or the DSL was
needed or added — this was already possible before this ADR, and this ADR's whole point is making it
SAFE to actually use, not inventing the mechanism to reach it.

## Real proof — reproduced, not simulated

**1. The ORIGINAL bug, reproduced independently against current `main`'s pre-fix mechanism.** Before
touching any source, `makeOnce`'s exact `Deferred`-based implementation was copied verbatim from
`Runner.ts` (confirmed materially unchanged from the spike's own snapshot — same wording, same
shape) into a standalone throwaway file, raced under `describe.concurrent` with a real 400ms setup, a
100ms-`testTimeout` Scenario and a 2000ms-`testTimeout` Scenario — the spike's exact reproduction,
run fresh, independently, this session:

```
 × short-testTimeout scenario 108ms
   → Test timed out in 100ms.
 × long-testTimeout scenario 107ms
   → All fibers interrupted without error

 Test Files  1 failed (1)
      Tests  2 failed (2)
```

The short-timeout Scenario times out as expected; the long-timeout Scenario, whose own 2000ms budget
was never remotely at risk, ALSO fails, with `InterruptError` — the exact cascade this ADR fixes.
(Throwaway file, deleted after capturing this transcript — not committed, since the old mechanism no
longer exists in this repository's source for a permanent regression test to run against.)

**2. The fix, proven against the real, shipped mechanism.** The identical reproduction — same 400ms
`BeforeAllScenarios`, same `@timeout-100`/`@timeout-2000` Scenarios — now lives permanently at
`packages/vitest/test/concurrent-fixture/timeout-cascade.steps.test.ts`, run for real under this
fixture's own `sequence.concurrent: true` config by `scripts/verify-concurrent-execution.sh`:

```
✓ run 1: both the short-@timeout and long-@timeout Scenarios passed under real concurrent execution
✓ run 1: neither Scenario's own reported duration shows the 400ms shared setup — it ran outside both budgets entirely
```

Both Scenarios pass, each in single-digit milliseconds (the script asserts each Scenario's own
`--reporter=json` `duration` is under 300ms — comfortably clear of the 400ms setup cost that would
have leaked in under the old mechanism).

**3. BEH-EC-017 preserved under real concurrent execution.**
`packages/vitest/test/concurrent-fixture/failing-beforeall.steps.test.ts` — a deliberately failing
`BeforeAllScenarios`, two Scenarios, the SAME `sequence.concurrent: true` fixture:

```
✓ run 2 exited non-zero, as a deliberately failing BeforeAllScenarios must
✓ run 2: both Scenarios individually reported failed (never skipped)
✓ run 2: both Scenarios carry the IDENTICAL BeforeAllScenarios failure message — BEH-EC-017 holds under real concurrent execution
```

Exactly two individually-failed assertion results, both carrying the identical message — never
vitest's own "one suite failure, every sibling skipped" shape.

**4. Zero regression on sequential execution — the single most important check.** The FULL existing
monorepo suite, unchanged, before any new test was added by this ADR:

```
$ pnpm test
 Test Files  60 passed (60)
      Tests  1036 passed | 4 skipped (1040)
```

Byte-for-byte the SAME counts `main` reported before this ADR's changes — every existing assertion
about hook ordering, shared-Layer builds, retries, attachments, metrics, rerun-failed-only and Rule
narrowing passes unchanged, proving `Runner.ts`/`VitestTestApi.ts` — the single most shared code path
in the codebase — was not disturbed for any consumer who never opts into concurrency or the new tag.
`pnpm test:shuffle` reports the identical counts.

## Does not reopen BEH-EC-006 / ADR-EC-006

The shared-tier build-once guarantee (ADR-EC-006, BEH-EC-006) is untouched: `sharedLayerTestApi`'s
`beforeAll` re-provision (§6) REUSES the existing memoized build via the same `memoMap` the block's
own `beforeAll(build hold)` already populated — it never triggers a second build, confirmed by the
real `sharedBeforeAllObservations` proof reading `buildOrdinal: 1`, the identical ordinal every other
consumer of the shared tier in that Feature already observed.

## Consequences

**Positive**:

- Fixes a real, reproduced bug: a short-`@timeout` Scenario can no longer externally kill a
  long-`@timeout` sibling merely by racing the same in-flight `BeforeAllScenarios`.
- Concurrent Scenario execution is now genuinely usable — a consumer opts in with an ordinary vitest
  setting, and BEH-EC-017's guarantees hold unchanged under it, proven for real.
- The per-Scenario `@timeout-<ms>` tag is what makes concurrency worth turning on at all; without it,
  every Scenario in a concurrently-scheduled Feature still shares one budget.
- A real, previously-latent correctness gap on the shared-Layer path (§6) was caught and fixed as part
  of this move, not left for a future bug report.
- Zero regression on the default, unchanged sequential path — proven by the full existing suite,
  byte-for-byte.

**Negative**:

- `makeOnce`/`Deferred` is gone; any external code depending on `Runner.ts`'s internal shape (none
  exists — it is not exported) would have broken. No public API changed.
- `TestApi.beforeAll` is a new, mandatory seam member — every hand-rolled `TestApi` fake in this
  repository's own test suite (`Runner.test.ts`, `pitfalls-checklist.test.ts`) needed a recorder added,
  a real, if mechanical, ripple.
- `@timeout-<ms>` cannot be declared, value-by-value, in a consumer's own `test.tags` strict
  declaration the way a fixed-value tag like `@retry` can (§4) — a real, disclosed cost for a consumer
  who also opts into that vitest feature.
- Concurrent execution is opt-in and entirely a consumer's own vitest config choice; this library adds
  no new flag to `describeFeature` for it and cannot detect or warn about a misconfigured
  `sequence.concurrent` the way it could a mis-declared tag.

**Trade-off accepted**: a hyphen-suffixed tag (`@timeout-5000`) instead of the originally-planned,
more conventional-looking parenthesised call (`@timeout(5000)`) — a real constraint discovered by
actually building the acceptance and cross-run fixtures, not a stylistic preference, and the direct
alternative to leaving this repository's own `vitest.config.ts` unable to load at all.
