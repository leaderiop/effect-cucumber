---
phase: 10-layer-scopes-per-scenario-default-shared
reviewed: 2026-08-30T02:48:17Z
depth: standard
files_reviewed: 23
files_reviewed_list:
  - .github/workflows/check.yml
  - .gitignore
  - dprint.json
  - package.json
  - packages/vitest/README.md
  - packages/vitest/src/Runner.ts
  - packages/vitest/src/ScenarioEffect.ts
  - packages/vitest/src/TestApi.ts
  - packages/vitest/src/describeFeature.ts
  - packages/vitest/src/index.ts
  - packages/vitest/test/SharedLayerConstraint.types.ts
  - packages/vitest/test/describeFeature.test.ts
  - packages/vitest/test/emission.test.ts
  - scripts/verify-shared-layer-once.sh
  - spec/behaviors/01-steps-and-world.md
  - spec/behaviors/02-shared-layers-and-tags.md
  - spec/behaviors/03-rules-outlines-and-testclock.md
  - spec/decisions/006-two-layer-scopes-only.md
  - spec/decisions/018-shared-layer-testclock-isolation.md
  - spec/invariants.md
  - spec/overview.md
  - spec/roadmap.md
  - spec/traceability.md
findings:
  critical: 2
  warning: 6
  info: 3
  total: 11
status: issues_found
---

# Phase 10: Code Review Report

**Reviewed:** 2026-08-30T02:48:17Z
**Depth:** standard
**Files Reviewed:** 23
**Status:** issues_found

## Summary

Phase 10 replaced the collapsing `normalizeLayer` with `splitLayerArgument`, added a second
`TestApi` implementation (`sharedLayerTestApi`) routed through `@effect/vitest`'s `layer(...)`,
pinned `shared`'s error channel to `never`, and added an out-of-process CLI gate. The only
executable source change in the phase is in `packages/vitest/src/describeFeature.ts`; `Runner.ts`,
`ScenarioEffect.ts` and `TestApi.ts` changed in prose only.

Baseline verification performed during this review: `pnpm test` (32 files / 768 passed / 3 skipped),
`pnpm lint`, `pnpm typecheck:test`, `bash spec/scripts/verify-traceability.sh` and
`bash scripts/verify-shared-layer-once.sh` all pass on the reviewed tree. That green baseline is
what makes the two Critical findings below worth reading: both are silent, both were reproduced
with throwaway probes against the real runner in this working tree, and neither is visible from any
assertion currently in the repo.

The two Critical findings are resource-lifetime defects, not type or logic errors:

1. A `BeforeAllScenarios` hook's scoped resources are finalized at the end of the **first** Scenario
   while every later Scenario receives a cached success — measured as
   `["acquired", "step", "released", "step"]`.
2. On the shared path the `shared` Layer is built even when the tag filter excluded **every**
   Scenario in the Feature, because the always-passing `⚠ unused step definition` nodes are emitted
   through `sharedIt.effect` and that constructor flat-maps the shared context before running
   anything — measured as build count `1` with zero runnable Scenarios.

Documentation quality in this repo is unusually high, and the phase honestly recorded one upstream
limitation it discovered (the shared scope's release timing, `spec/behaviors/02-shared-layers-and-tags.md`).
The findings below are the ones that survived that filter.

## Narrative Findings (AI reviewer)

## Critical Issues

### CR-01: `BeforeAllScenarios` scoped resources are released after the FIRST Scenario, and every later Scenario silently gets a dead resource

**File:** `packages/vitest/src/Runner.ts:384-399`, `packages/vitest/src/Runner.ts:507-509`
**Severity:** BLOCKER

**Issue:** `makeOnce` builds the once-cell as
`Effect.suspend(() => Effect.flatMap(Deferred.into(body, deferred), () => Deferred.await(deferred)))`
and the cell is composed into each Scenario's Effect via
`Effect.flatMap(beforeAllScenariosCell, () => buildScenarioEffect(...))` (lines 539-543 and 597-601).
The cell's `body` is typed `Effect<void, unknown, Scope.Scope>`, and `Hook.ts` types every hook body
as `() => Effect<any, any, any>`, so a hook body may legitimately acquire a scoped resource. The
`Scope` it acquires against is whichever Scenario ran first — `@effect/vitest`'s `makeTester`
applies `Effect.scoped` **per test**. When that first Scenario finishes, the scope closes and the
resource is finalized. Every later Scenario reaches `Deferred.await`, which replays the cached
**success value** and nothing else, so it proceeds with a released resource and no error anywhere.

`spec/behaviors/07-hook-ordering-and-guarantees.md:111` states "BeforeAllScenarios runs AT MOST ONCE
per Feature, shared across ..."; what is actually shared is only the hook's exit value, not its
effect. Nothing in `test/Runner.test.ts` (recording fake, never runs anything) or
`test/emission.test.ts` (hooks are pure array pushes with no finalizers) can see this.

**Reproduced in this working tree** with a throwaway fixture — two Scenarios, one
`BeforeAllScenarios` doing `Effect.acquireRelease`:

```
ZZ_LOG=["acquired","step","released","step"]
```

The `"released"` sits between the two `"step"` entries. Phase 10 makes this materially worse in
practice: a `shared` Layer is the tier people put testcontainers and DB pools on, and
`BeforeAllScenarios` is the hook they will reach for to seed them.

**Fix:** the once-cell must own a scope whose lifetime is the Feature's, not the first Scenario's.
Two workable shapes:

```ts
// (a) Forbid the failure mode in the types: pin the batch to a Scope-free requirement so a
//     scoped acquisition in a BeforeAllScenarios body is a compile error rather than a
//     silently truncated lifetime.
const makeOnce = (
  body: Effect.Effect<void, unknown, never>
): Effect.Effect<void, unknown, never> => { /* ... */ }

// (b) Or give the cell its own scope, closed by the ⚙ AfterAllScenarios node (which already
//     exists and is already suppressed when no Scenario was runnable):
const featureScope = Effect.runSync(Scope.make())
const beforeAllScenariosCell = hooks.BeforeAllScenarios.length > 0
  ? makeOnce(
    runHookBatch(hooks.BeforeAllScenarios).pipe(
      Effect.provide(layer),
      Effect.provideService(Scope.Scope, featureScope)
    )
  )
  : null
// ... and close `featureScope` in the AfterAllScenarios node's finalizer.
```

Whichever is chosen, add a regression test with a real finalizer — the current hook fixtures use
plain array pushes and cannot fail.

---

### CR-02: On the shared path the `shared` Layer is built even when the tag filter excluded every Scenario

**File:** `packages/vitest/src/describeFeature.ts:1266-1283`, `packages/vitest/src/Runner.ts:630-632`
**Severity:** BLOCKER

**Issue:** `Runner.ts` deliberately emits the `⚠ unused step definition` nodes **unconditionally**
(note (g): "they describe REGISTRATION and not execution"), and equally deliberately suppresses the
`⚙ AfterAllScenarios` node when `runnableScenarioCount === 0` (note (e): it "would tear down
resources nothing ever set up"). On the shared path those warning nodes are emitted through
`sharedLayerTestApi`, whose `emit` calls `sharedIt.effect`, and the installed
`@effect/vitest@4.0.0-rc.112` implements that as

```js
effect: makeTester(effect => Effect.flatMap(contextEffect, context =>
  effect.pipe(Effect.scoped, Effect.provide(context))), it)
```

`contextEffect` is the cached build of the shared Layer. So **any** node emitted through
`sharedIt.effect` — including an always-passing node whose whole body is `Effect.void` — forces the
shared Layer to build. The `AfterAllScenarios` suppression is therefore defeated from the other
direction: the teardown node is correctly not emitted, but a warning node sets the resource up
anyway.

**Reproduced in this working tree.** Feature with one `@excluded-tag` Scenario, `excludeTags:
["@excluded-tag"]`, `{ shared: countingLayer, perScenario: Layer.empty }`, plus one unused step
definition:

```
ZZ_PROBE_BUILDS=1      # every Scenario excluded, shared Layer still built
```

Deleting only the unused step definition (so no `⚠` node is emitted) returns the count to `0`,
which confirms the warning node is the cause and not the Scenario walk.

For a `shared` tier holding a testcontainer or a database connection, this starts the container for
a Feature the caller explicitly filtered out, and does so on the strength of a stray unused pattern
that is otherwise a lint-grade warning. That is behavioural, not merely wasteful: the documented
contract of `excludeTags` is that "a Scenario the filter removes never becomes a test node at all"
(`describeFeature.ts:196-206`), and the whole point of the `shared` tier is that building it is
expensive and observable.

**Fix:** route the synthetic nodes away from the shared context, or suppress the shared block when
nothing runnable was emitted. The narrowest fix keeps `Runner.ts` framework-free by adding the
suppression at the composition root:

```ts
// In describeFeature.ts's shared arm — emit the warning/synthetic nodes through the
// module-level api, which carries no Layer services, and reserve `sharedIt` for
// Scenario nodes. Requires one extra member (or an `EmitOptions.synthetic` flag)
// on TestApi so Runner.ts can say WHICH kind of node it is without naming a framework.
const plainApi = vitestTestApi(collection.plan.feature.uri)
const sharedApi = sharedLayerTestApi(collection.plan.feature.uri, sharedIt)
```

Alternatively, keep the emission uniform and make the *shared build* lazy per node by wrapping the
synthetic bodies so they never touch `contextEffect` — but the `TestApi` seam currently gives
`Runner.ts` no way to express that distinction, so the flag has to be added deliberately rather than
inferred.

## Warnings

### WR-01: `testEnv`'s safety argument is contradicted by this repo's own measured memoisation behaviour

**File:** `packages/vitest/src/describeFeature.ts:376-382`
**Severity:** WARNING

**Issue:** the doc comment states, without qualification:

> A MODULE-SCOPE binding is safe precisely because a Layer is a BLUEPRINT and not a built value:
> every `Effect.provide(testEnv)` builds its own clock and its own console, so one constant serves
> every Scenario in every Feature without any of them sharing state.

That claim is false in exactly the configuration the rest of the file warns about. Lines 1255-1265
of the same file, and ADR-EC-018's implementation note 4, record the measured mechanism: Layer
memoisation is by **object identity** against the ambient `CurrentMemoMap`, `TestConsole.layer` is a
module-level constant identical to the framework's own, and removing `excludeTestServices: true`
therefore makes `Effect.provide(testEnv)` a memo **hit** for the console. `testEnv` is safe because
of `excludeTestServices: true`, not because "a Layer is a blueprint".

A maintainer reading only the `testEnv` block — which is where they will look when touching that
line — gets a general-sounding guarantee that would justify removing the option or hoisting the
provide, both of which are the mutations 10-04 measured as leaks.

**Fix:** restate the paragraph conditionally, e.g.

```
 * A MODULE-SCOPE binding is safe HERE because `excludeTestServices: true` keeps the framework's own
 * `TestEnv` out of the memo map `layer(...)` leaves ambient. It is NOT safe in general: Layer
 * memoisation is by object IDENTITY, and `TestConsole.layer` is the same module-level constant the
 * framework's `TestEnv` uses — see the `layer(...)` call site below and ADR-EC-018 note 4.
```

---

### WR-02: `sharedLayerTestApi` has no test coverage for tags, `@skip`, tag filtering or the D-08 degradation

**File:** `packages/vitest/src/describeFeature.ts:558-563`, `packages/vitest/test/emission.test.ts`
**Severity:** WARNING

**Issue:** every one of the six tag blocks in `emission.test.ts` (lines 1126, 1263, 1305, 1419,
1494, 1528) passes `Layer.empty` as a plain Layer, i.e. the default path. Every shared-path block
(1949, 2198, 2496) uses untagged Features. So the `makeDegradingEffect` extraction — the phase's
one non-trivial refactor of existing behaviour, whose stated purpose is that "duplicating it is how
the shared path silently loses the degradation" — is only ever exercised through `vitestTestApi`.
The shared path's `tags`/`skip` forwarding and its `strictTags` recovery are unasserted.

I verified manually that all three work today (an undeclared tag on a shared Feature produces
exactly one `UndeclaredTag` warning and an untagged re-emission; `@skip` produces a real skip). The
finding is that nothing keeps them working — a future edit to `sharedLayerTestApi`'s emit closure
that drops `emitOptions`, or wraps `self` without preserving the fallback path, turns nothing red.

**Fix:** add one shared-path Feature to `emission.test.ts` carrying a `@skip` Scenario, a declared
tag, and one Scenario whose tag is undeclared, asserted through the existing `collectionWarnings`
capture. Reuse the shape of the Phase 9 blocks with the layer argument swapped for
`{ shared: Layer.empty, perScenario: Layer.empty }`.

---

### WR-03: the structural discrimination in `makeDegradingEffect` can emit a false "undeclared tag" warning for a non-tag failure

**File:** `packages/vitest/src/describeFeature.ts:474-495`
**Severity:** WARNING

**Issue:** the recovery reasons "an emission with no tags cannot fail `strictTags`, so if the
fallback succeeded the original failure was about tags". That inference is one-directional. It is
sound that a fallback *failure* means the problem was not about tags; it is **not** sound that a
fallback *success* means it was. Any throw from the first `emit` that does not reproduce on the
second call — an order-dependent or state-dependent framework rejection, a duplicate-title guard
that only fires the first time, a future validator that mutates state on its first pass — leaves the
Scenario registered untagged *and* prints a `UndeclaredTagWarning` naming tags that were perfectly
valid, while the real cause is swallowed entirely.

Given the file's own rule that upstream prose must never become a contract, the message cannot be
matched, but the outcome can be narrowed.

**Fix:** narrow the recovery to the case it was measured for by only retrying when the emission
actually carried tags, and re-throw otherwise:

```ts
} catch (cause) {
  // A tagless emission cannot have failed strictTags, so there is nothing to degrade to.
  if (options.tags.length === 0) throw cause
  try {
    emit(name, self, { skip: options.skip })
  } catch {
    throw cause
  }
  console.warn(/* ... */)
}
```

This does not close the hole entirely, but it removes the whole class of untagged-Scenario false
positives and costs nothing.

---

### WR-04: `spec/invariants.md` misdescribes what `verify-shared-layer-once.sh` asserts

**File:** `spec/invariants.md:76-81`
**Severity:** WARNING

**Issue:** the new INV-EC-002 "Assertions" paragraph says the gate

> runs the real `vitest` CLI against a committed fixture Feature **twice**, once whole and once
> narrowed with `-t` to a single Scenario, and asserts **the shared build count is identical in
> both**

The script runs vitest **three** times (runs A, B and C — its own header and
`.github/workflows/check.yml:117` both say "invokes vitest THREE times"), and its whole-vs-filtered
**equality** assertion (B2, lines 364-373) compares the status of the *clock-isolation* Scenario,
not a build count. The build-once claim is carried separately by A2 and C2 as two independent
"passed" assertions. In a repo whose AGENTS.md §4 is "say only what is true" and whose spec is
normative, a normative document describing a gate's assertions incorrectly is the kind of drift the
rule exists to prevent.

**Fix:**

```
`scripts/verify-shared-layer-once.sh` (`pnpm verify:shared-layer-once`) is the other half: it runs
the real `vitest` CLI against the committed fixture Feature three times — whole, narrowed to the
clock-isolation Scenario, and narrowed to the build-count Scenario — asserting that the build-count
Scenario passes in both the whole and the narrowed run, and that the clock-isolation Scenario
reports the SAME status whole and filtered. No in-process test can make the second claim.
```

---

### WR-05: `report_query`'s output is consumed without validation, so a parse failure aborts the gate opaquely

**File:** `scripts/verify-shared-layer-once.sh:198-219`, `285-289`, `346-350`, `388-392`
**Severity:** WARNING

**Issue:** `report_query` runs `node -e` inside a command substitution under `set -euo pipefail`. If
the report is truncated or malformed, `JSON.parse` throws, the substitution fails, and the script
exits with a raw Node stack trace and no `fail()` message — bypassing every diagnostic the file
invests so heavily in. Separately, the numeric results are consumed as `[[ "$TOTAL_A" -eq 0 ]]`,
which coerces any non-numeric string to `0` and would therefore report "the unfiltered run reported
ZERO test results" for what is actually a query failure — a confidently misleading message, which is
precisely the failure mode the `title_is_declared` comment (lines 237-244) says the file exists to
avoid.

**Fix:** capture and validate:

```bash
report_query() {
  local report="$1" mode="$2" title="${3-}" out
  if ! out="$(REPORT="$report" QUERY_MODE="$mode" QUERY_TITLE="$title" node -e '...' 2>&1)"; then
    fail "could not read $report as a vitest JSON report (mode=$mode): $out"
  fi
  printf '%s\n' "$out"
}
```

and guard the numeric call sites with `[[ "$TOTAL_A" =~ ^[0-9]+$ ]] || fail "..."`.

---

### WR-06: `emission.test.ts` has grown to 2574 lines with 14 `describeFeature` calls coupled by module-scope mutable state and declaration order

**File:** `packages/vitest/test/emission.test.ts`
**Severity:** WARNING

**Issue:** the file now carries fourteen real `describeFeature` calls, roughly twenty module-scope
mutable accumulators (`completedScenarios`, `hookLog`, `outlineRowValues`, `ruleScenarioNames`,
`sharedBuildOrdinals`, `scopedBuildOrdinals`, `collisionWinners`, `sharedScenarioNames`,
`clockReadings`, `clockScenarioNames`, `sharedBuilds`, `scopedBuilds`, `clockSharedBuilds`, ...) and
at least eight reader `describe` blocks whose correctness depends on vitest running a file's suites
in declaration order. Every block's header restates that dependency, which is the right mitigation
for one or two blocks and is not a substitute for isolation at fourteen. Adding a block in the wrong
position, or vitest changing its ordering guarantee, breaks assertions in blocks nobody touched, and
the failure will surface as an array-comparison mismatch several hundred lines away from the edit.

This is not a defect today — the suite is green and the gate confirms the reported titles — but the
per-file blast radius is now large enough that the next addition should split rather than append.

**Fix:** split by concern into sibling files that each own their fixtures and accumulators, e.g.
`emission.hooks.test.ts`, `emission.tags.test.ts`, `emission.shared-layer.test.ts`. Note that
`scripts/verify-shared-layer-once.sh:109` hard-codes `TEST_FILE="packages/vitest/test/emission.test.ts"`
and would need to move with the four titles it depends on.

## Info

### IN-01: `.gsd/` agent-harness state added to the published library's `.gitignore` and `dprint.json`

**File:** `.gitignore:9-12`, `dprint.json:23`
**Severity:** INFO

**Issue:** commit `79cc407` adds ignore rules for a workflow harness's transient dispatch directory
to a public library's repo configuration, inside a phase whose subject is Layer scopes. It is
harmless and correctly commented, but it is tool-specific state in a shared project file and is
unrelated to everything else in the change set.

**Fix:** consider `.git/info/exclude` for personal-tooling paths, or keep it and accept that the
repo now documents one agent harness by name.

---

### IN-02: the gate's title precondition assumes every target Scenario stays a plain Scenario

**File:** `scripts/verify-shared-layer-once.sh:255-268`
**Severity:** INFO

**Issue:** `title_is_declared` matches a source line ending in `Scenario: <title>`, but the gate then
queries the **reported** title. For a plain Scenario those are equal; for a `Scenario Outline` row
`OutlineTitle.ts` appends D-03's `(col=value, ...)` suffix. If one of the four fixture Scenarios were
ever converted to an Outline, the precondition would pass on the source line while every status query
returned `ABSENT` — and B2's equality half (`ABSENT == ABSENT`) would hold vacuously, exactly the
failure the precondition was written to prevent, arrived at from a direction it does not cover.

**Fix:** add one line to the precondition loop rejecting `Scenario Outline:` for these four titles,
or note the assumption beside the `TITLE_*` constants.

---

### IN-03: `whoProvidesShared` throws synchronously from a function whose return type is an `Effect`

**File:** `packages/vitest/test/describeFeature.test.ts:328-345`
**Severity:** INFO

**Issue:** the helper is typed `(collected: FeatureCollection) => Effect.Effect<string, unknown>` but
throws a plain `Error` before constructing one when `sharedLayer` is `null`. Inside the callers'
`Effect.gen` bodies this surfaces as a defect rather than a typed failure, which is acceptable for a
guard that should be unreachable, but it makes the signature a mild lie and differs from how the rest
of the file reports impossible states.

**Fix:** `Effect.die(new Error(...))` (or `Effect.dieMessage`) keeps the signature honest and produces
the same reported outcome.

---

_Reviewed: 2026-08-30T02:48:17Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
