---
phase: 09-tags
plan: 05
subsystem: testing
tags: [tags, filtering, composition-root, adapter, catch-and-degrade, vitest, effect, overloads, strictTags]

# Dependency graph
requires:
  - phase: 09-tags
    provides: "09-01's scripts/verify-testapi-seam.sh and root vitest.config.ts; 09-02's Tags.ts (makeTagFilter) and Errors.ts (makeUndeclaredTagWarning/makeExcludedScenariosNotice); 09-04's EmitOptions seam and emitFeature's required tagFilter + returned EmitOutcome"
  - phase: 05-describefeature-type-surface
    provides: "describeFeature's two overloads, their load-bearing order, and scripts/verify-tsgo-gate.sh assertion 8 which fails by name on a reorder"
  - phase: 06-plan-scenario-effect-runner-emission-and-drift-detection
    provides: "the terminal-channel warnings loop in describeFeature's own body, and the collect/collectFeature silence rule the D-10 notice's placement follows"
provides:
  - "packages/vitest/src/describeFeature.ts — the public DescribeFeatureOptions type (includeTags/excludeTags), a trailing optional fourth parameter on both overloads and the implementation signature"
  - "packages/vitest/src/describeFeature.ts — makeTagFilter(options ?? {}) as the single collapse point from the optional public argument to emitFeature's required tagFilter"
  - "packages/vitest/src/describeFeature.ts — D-10's one-line collection-time exclusion notice, printed only when excludedScenarioCount exceeds zero"
  - "packages/vitest/src/describeFeature.ts — vitestTestApi as a per-Feature FACTORY taking featureUri, with D-08's catch-and-degrade and structural (never prose-based) failure discrimination"
  - "packages/vitest/src/describeFeature.ts note (e) — the paragraph recording that this module owns the framework's undeclared-tag failure so Runner.ts never learns it exists"
affects:
  - "09-06 (integration tests against the real it.effect — the D-08 degradation path and D-10's notice are now observable end to end)"
  - "09-07 (barrel: DescribeFeatureOptions is exported from describeFeature.ts and needs the index.ts re-export)"
  - "the phase's closing plan (spec reconciliation — BEH-EC-008's MUST text and ADR-EC-020 still forbid the registration filter this plan shipped)"

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "A trailing OPTIONAL parameter added to every overload of a function whose overload ORDER is load-bearing, verified empirically by the gate that fails on a reorder rather than by reasoning"
    - "Catch-and-degrade at the single adapter permitted to name the framework, so the failure mode stays invisible to every module behind the seam"
    - "Structural discrimination of a caught failure by OUTCOME (retry without the suspect input) instead of by its message, name or class"
    - "Guarantee before report: register first, warn second, so a throwing terminal channel cannot cost a registration"
    - "A public option type collapsed to one required internal value at exactly one call site, the normalizeLayer idiom applied to a second over-permissive argument"

key-files:
  created: []
  modified:
    - packages/vitest/src/describeFeature.ts
    - spec/traceability.md

key-decisions:
  - "The options parameter is TRAILING and OPTIONAL on both overloads, which is what leaves the last-overload reporting rule note (a) depends on untouched — settled empirically, not argued"
  - "collectFeature deliberately did NOT grow the parameter: it emits nothing, so a registration filter has no meaning there, and its 'mirror exactly, including the order' sentence was amended to separate the POSITION/ORDER mirroring that is still true from the ARITY mirroring that is not"
  - "The D-10 notice is printed from describeFeature's own body (collect must stay silent for collectFeature) and necessarily AFTER the emitted block, because the count does not exist until the walk has run"
  - "The notice reads the NORMALISED tagFilter.include/exclude, never the raw options, so makeExcludedScenariosNotice's derived reason is computed from the same values that produced the count"
  - "The adapter became a per-Feature factory ONLY because of featureUri; the framework objects are still constructed in exactly one module and verify-testapi-seam still enforces it"
  - "The caught failure is discriminated by OUTCOME (a tagless re-emission cannot fail strictTags), never by message/name/instanceof — upstream prose is not a contract, and this framework's message for the case is known to contain a typo"
  - "Re-emit FIRST, warn SECOND: console.warn is a replaceable host object that can throw, and a throw there must not be able to cost the Scenario its registration"

patterns-established:
  - "Settling a RESEARCH assumption by running the gate that would fail, as the FIRST action after the edit compiles, and recording the result as the settlement rather than deferring it to end-of-plan verification"
  - "A mutation probe as a throwaway test file plus a source mutation, where the control run proves not just THAT the failure propagates but that the propagated VALUE is the original rather than the replacement"

# Requirements
requirements-completed: []
requirements-advanced: [RUN-05]

# Metrics
duration: 30min
completed: 2026-08-30
---

# Phase 9 Plan 05: describeFeature's Public Tag Options and the Catch-and-Degrade Adapter Summary

**`describeFeature(feature, layer, define, { includeTags, excludeTags })` now narrows registration with plain-array semantics where empty means no filter, prints one summary line when it removed anything, and its per-Feature adapter turns vitest's `strictTags` throw — which would otherwise collect zero tests for a whole `.feature` file — into an untagged re-emission plus a located warning, while a failure that is not about tags still propagates as the original value.**

## Performance

| Metric | Value |
|---|---|
| Duration | ~30 min (00:10 → 00:40, 2026-08-30) |
| Tasks | 2 of 2 |
| Files modified | 2 (0 created) |
| Repo test count | 713 → 713 (unchanged, by design — see below) |

The test count is deliberately unchanged. This plan's verification is the existing 713 tests staying
green under a changed public signature (proving a three-argument call behaves exactly as before), plus
`pnpm verify:tsgo-gate` and the re-throw mutation proof. Plan 09-06 owns the integration tests that
observe the new behaviour against the real `it.effect`.

## Task Commits

1. **Task 1: public `includeTags`/`excludeTags` + D-10's exclusion notice** — `0a7efd6` (feat)
2. **Task 2: per-Feature adapter factory with catch-and-degrade** — `018f670` (feat)

## RESEARCH assumption A1: SETTLED, empirically

A1 was: *"Adding an optional 4th parameter to both `describeFeature` overloads does not change which
overload TypeScript reports a failed call against."* The risk was that
`scripts/verify-tsgo-gate.sh:252`'s diagnostic-name assertion could break — or, worse, still pass
while covering nothing.

`pnpm verify:tsgo-gate` was run as the FIRST command after the signature edit compiled, before
anything else in this plan was written. It exits **0** with all **13** assertions green, and the one
that matters reports:

```
✓ an unsatisfied Layer argument is rejected by name: effect(missingLayerContext) — overload order intact
```

**A1 holds.** Assertion 8 compiles `layer-missing-rin.ts` — a three-argument `describeFeature` call
passing a `Layer<World, never, Db>` — and still gets `effect(missingLayerContext)` by name, so the
plain-Layer overload is still the one TypeScript reports against. The assertion is not merely passing:
it is passing for its stated reason, since it greps the diagnostic name rather than the exit code, and
its failure message names overload reordering as the cause it detects.

The mechanism, now written into the source above the plain-Layer overload: the parameter is TRAILING
and OPTIONAL, so a three-argument call still matches both signatures exactly as it did before, and the
last-overload reporting rule is untouched. No overload was reordered and none needed to be.

## The exact public option type

```ts
export interface DescribeFeatureOptions {
  readonly includeTags?: ReadonlyArray<string>
  readonly excludeTags?: ReadonlyArray<string>
}
```

Byte-identical to the plan's `<interfaces>` block. Both fields carry a doc comment stating D-02's
syntax decision (a plain array of tag strings, never the runner's boolean expression grammar, so there
is no second grammar to keep in sync with someone else's parser) and the empty-array rule (`undefined`
and `[]` both mean NO FILTER, so a computed-empty array can never silence a suite).

Added to BOTH overload declarations and the implementation signature — three occurrences — and to
NEITHER of `collectFeature`'s three. The full signature is now:

```ts
export function describeFeature<ROut, E>(
  feature: ParsedFeature,
  layer: Layer.Layer<ROut, E, never>,
  define: (dsl: FeatureDsl<ROut>) => void,
  options?: DescribeFeatureOptions
): void
```

`DescribeFeatureOptions` is exported from `describeFeature.ts` but is NOT yet in the `index.ts`
barrel — plan 09-07 owns that edit, exactly as the plan's `<interfaces>` comment scheduled.

## The adapter factory's discrimination strategy

```ts
const vitestTestApi = (featureUri: string): TestApi => ({
  describe,
  effect: (name, self, options) => {
    try {
      it.effect(name, self, { tags: [...options.tags], skip: options.skip })
    } catch (cause) {
      try {
        it.effect(name, self, { skip: options.skip })
      } catch {
        throw cause
      }
      console.warn(
        makeUndeclaredTagWarning({ uri: featureUri, scenarioName: name, tags: options.tags }).message
      )
    }
  }
})
```

**The discriminator is an OUTCOME, not a string.** No line in the catch path reads the caught value's
`message`, its `name`, or applies `instanceof` to it — `cause` is bound and then only ever re-thrown.
The fallback emission carries no tags at all, so `strictTags` has nothing in it to reject; if that
ALSO throws, the failure was categorically not about tags, and the ORIGINAL value is re-thrown
unmodified and unwrapped.

Three properties fall out of that shape, each of which the obvious alternative loses:

- **A dependency's wording change cannot silently disable the branch.** This repo's rule since 03-01
  is that upstream prose is not a contract, and this framework's message for the case additionally
  contains a known typo — matching on it would encode someone else's bug as our condition.
- **The re-thrown value names the DEFECT, not the recovery attempt.** Re-throwing the inner failure,
  or wrapping either in an error of ours, would point a reader at the fallback.
- **Degradation is local to the Scenario.** RESEARCH Finding 3 established by execution — not by
  reading the framework — that the throw is synchronous from the emission call, that nothing is left
  half-registered, that the tagless fallback registers cleanly, and that every later sibling in the
  same file still collects. All four are written into the factory's doc comment as facts obtained by
  running it.

**Order inside the catch is re-emit, then warn, and it is stated in the source as load-bearing.**
`console.warn` is a call into a host object a consumer's setup file is free to have replaced, so it
can throw; if it ran first and did, the Scenario would be left unregistered — which is the exact
file-level disappearance the block exists to prevent, narrowed to one Scenario. Registration is the
guarantee, the warning is the report, and the guarantee goes first.

The doc comment also records the consequence a reader needs and the reason this warns rather than
staying silent: the Scenario RUNS, but its tags do not exist for the runner, so a `--tagsFilter`
invocation naming any of them cannot select it. The `.feature` file says the tag is there and the
runner disagrees — a discrepancy no test failure will ever surface.

## The re-throw mutation proof

Performed against real source, run, observed, and reverted. The probe was a throwaway test file
(`packages/vitest/test/zz-mutation-probe.test.ts`, deleted before either commit) calling
`describeFeature` at module scope inside a `try`/`catch` and recording what escaped. Both emissions in
the adapter were mutated to throw for the probe's Scenario name only: the first with
`ORIGINAL FAILURE - not about tags`, the fallback with `FALLBACK ALSO FAILED`.

| Run | Source state | Observed |
|---|---|---|
| **Control** | re-throw intact | `Error: ORIGINAL FAILURE - not about tags` — file fails during collection, `Tests no tests` |
| **Mutation** | `throw cause` removed from the inner catch | **`NOTHING THROWN — the failure disappeared silently`** — `describeFeature` returns normally |

Verbatim control output:

```
 FAIL  packages/vitest/test/zz-mutation-probe.test.ts [ …zz-mutation-probe.test.ts ]
Error: ORIGINAL FAILURE - not about tags
 Test Files  1 failed (1)
      Tests  no tests
```

Verbatim mutation output:

```
AssertionError: expected 'NOTHING THROWN — the failure disappea…' to be 'ORIGINAL FAILURE - not about tags'
Expected: "ORIGINAL FAILURE - not about tags"
Received: "NOTHING THROWN — the failure disappeared silently"
```

**The control proves two things at once, and the second is the sharper one.** That the failure
propagates at all, and that the propagated value is `ORIGINAL FAILURE - not about tags` rather than
`FALLBACK ALSO FAILED` — so the re-throw hands back the original rather than the recovery attempt's
own throw. A `throw` inside the inner `catch` block that re-threw the WRONG value would pass a test
asserting only that something was thrown.

**One fact the mutation revealed that the plan did not predict.** Under the mutation, vitest emits a
secondary `Error: No test found in suite Probe` — because the `describe` block registered while both
emissions were prevented, so the Feature block exists and is empty. That is a symptom worth recording
rather than a signal: it names neither the Scenario nor the cause, and it appears only because this
probe's Feature had exactly one Scenario. A real Feature with other Scenarios would produce a
non-empty block and no secondary error at all — the failure would then be completely silent, which is
precisely T-09-05-03.

Working tree confirmed clean of the mutation afterwards: the file was restored from a byte copy taken
before mutating, `grep` finds no `MUTATION`/`ORIGINAL FAILURE`/`FALLBACK ALSO FAILED` marker, and the
probe file is gone (`git status` clean at both commits).

## Verification

All plan gates run and green at `018f670`:

| Gate | Result |
|---|---|
| `pnpm verify:tsgo-gate` | exit 0 — 13 `✓` assertions, assertion 8 firing by name (A1 settled) |
| `pnpm build` | exit 0 |
| `pnpm typecheck:test` | exit 0, both projects |
| `pnpm test` | 31 files, **713 tests**, all passing (unchanged) |
| `pnpm lint` (oxlint + dprint check) | exit 0 |
| `pnpm circular` | no circular dependency found (32 files) |
| `pnpm verify:testapi-seam` | exit 0 — three `✓` lines |
| `pnpm verify:spec` | PASS 7, FAIL 0, SKIP 1 |

### Acceptance greps

| Criterion | Required | Actual |
|---|---|---|
| `grep -c 'export interface DescribeFeatureOptions'` | 1 | 1 ✓ |
| `grep -c 'options?: DescribeFeatureOptions'` | 3 | 3 ✓ |
| `DescribeFeatureOptions` within `collectFeature`'s three signatures | 0 | 0 ✓ |
| plain-Layer overload still LAST | yes | yes ✓ (lines 731 / 746 / 752; and assertion 8 passes) |
| `grep -c 'makeTagFilter'` | 1 | **4** — see deviation 1 (non-comment: 2, exactly one call site) |
| `grep -c 'noTagFilter'` | 0 | 0 ✓ |
| `grep -c 'makeExcludedScenariosNotice'` | 1 | **3** — see deviation 1 (non-comment: 2, exactly one call site) |
| notice printed only when count exceeds zero | yes | yes ✓ (`if (outcome.excludedScenarioCount > 0)`) |
| non-comment `const vitestTestApi: TestApi = ` | 0 | 0 ✓ |
| non-comment `plan.feature.uri` | ≥ 1 | 2 ✓ (the adapter factory call and the notice's `uri`) |
| `grep -c 'catch'` | ≥ 1 | 10 ✓ (2 in code, 8 in prose) |
| no message/name/`instanceof` inspection in the catch path | yes | yes ✓ — `cause` is bound and only re-thrown |
| `grep -c 'makeUndeclaredTagWarning'` | 1 | **2** — see deviation 1 (non-comment: 2, exactly one call site) |
| `grep -c '\[\.\.\.'` | 1 | **3** — see deviation 2 (unchanged from the base commit) |
| `"built once at module scope"` absent | 0 | 0 ✓ |
| note (e) carries the degradation + seam-grep paragraph | yes | yes ✓ |

## Decisions Made

- **The fourth parameter is TRAILING and OPTIONAL, and that is what made the overload order a
  non-issue.** A three-argument call still matches both signatures exactly as before, so note (a)'s
  last-overload reporting rule needs no adjustment. The source says this above the plain-Layer
  overload and immediately adds that the claim is settled by `pnpm verify:tsgo-gate` and not by the
  comment — a comment asserting a compiler behaviour is exactly the thing that goes stale silently.
- **`collectFeature` did not grow the parameter, and its doc comment now separates two different
  kinds of mirroring.** The POSITION and ORDER mirroring is still exactly true and still load-bearing;
  the ARITY mirroring is not. The amended sentence states why the absence is the contract: this entry
  point registers nothing, so a registration filter has no meaning, and accepting the parameter could
  only mean ignoring it silently or filtering `collection.plan` — which `Runner.ts` note (g) already
  establishes is the worse of the two, since planning and warning deliberately cover the WHOLE Feature
  and only emission is filtered.
- **The D-10 notice reads `tagFilter.include`/`tagFilter.exclude`, never `options.includeTags`.**
  `makeExcludedScenariosNotice` DERIVES its `reason` from those two arrays' lengths (09-02's decision,
  so the reason cannot disagree with the fields beside it). Passing the raw optional options would let
  the reason be computed from a different pair of values than the filter that actually produced the
  count — the notice would name the wrong option to look at, which is the one job it has.
- **The notice is guarded on `> 0` rather than printed unconditionally.** A "0 Scenario(s) excluded"
  line on every Feature in a suite is noise that trains a reader to skip the exact line D-10 exists to
  make them read.
- **Two placement facts about the notice are written into the source because neither is visible from
  the code.** It lives in `describeFeature`'s own body and not in `collect`, for the identical reason
  the unused-definition loop does — `collectFeature` shares `collect` verbatim and must stay silent,
  or every test asserting on a plan would print what it is asserting on. And it necessarily prints
  AFTER the emitted block rather than above it like the warnings loop, because the count does not
  exist until the walk has run and computing it earlier would mean a duplicate walk that could
  disagree with the real one.
- **`makeTagFilter(options ?? {})` is the single collapse point, in `normalizeLayer`'s idiom.**
  `Tags.ts` is what turns `undefined` and `[]` into the same thing, so `options ?? {}` is the whole of
  the "no options at all" case and there is no second default anywhere in the file.
- **The factory is per-Feature only because of `featureUri`, and the source says what did NOT change.**
  The framework objects are still constructed in this one module; a factory is not a second seam, and
  `pnpm verify:testapi-seam` still enforces it. Stating the non-change matters because "it became a
  factory" reads like the seam moved.
- **The fallback OMITS `tags` rather than passing `[]`.** An empty array is still a value
  `strictTags` would have to validate, and the one thing the fallback must not do is reach the check
  that just threw.
- **Note (e) gained a paragraph on why the catch lives here rather than in `emitFeature`.** A
  `try`/`catch` one layer up compiles and behaves identically today — which is exactly why the reason
  had to be written down. It would put a framework-specific recovery path in the module whose entire
  design premise is that it has never heard of the framework.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 — Blocking] Three `grep -c` criteria count LINES, so a named import plus explanatory prose exceeds them**

- **Found during:** Tasks 1 and 2
- **Issue:** The criteria require `grep -c 'makeTagFilter'` = 1, `grep -c 'makeExcludedScenariosNotice'`
  = 1 and `grep -c 'makeUndeclaredTagWarning'` = 1. All three are unreachable: a named import puts the
  identifier on its own line before any call site exists, so the floor is 2, and each identifier is
  additionally named in the doc comment that explains what it does. Reaching exactly 1 would require a
  namespace import, which no local import in this package uses. This is STATE.md's 03-04 lesson — a
  grep criterion that counts a literal also forbids explaining it in a comment — for the fourth time
  in this phase, after 09-01's deviation 1, 09-02's deviation 2 and 09-04's deviation 1.
- **Fix:** The named imports and the explanatory prose were both kept, and the counts are reported
  here with every occurrence accounted for. The criteria's shared INTENT — that each factory is
  invoked at exactly ONE site, so the normalisation and both terminal writes happen in one place — is
  satisfied exactly and is verifiable with a comment-stripped grep:

  | Identifier | Total lines | Non-comment lines | Call sites |
  |---|---|---|---|
  | `makeTagFilter` | 4 | 2 (import + `const tagFilter = makeTagFilter(options ?? {})`) | **1** |
  | `makeExcludedScenariosNotice` | 3 | 2 (import + the guarded `console.warn`) | **1** |
  | `makeUndeclaredTagWarning` | 2 | 2 (import + the catch path's `console.warn`) | **1** |

  Deleting load-bearing explanation to satisfy a miscounted grep is the anti-pattern this repo has
  now recorded three times; naming the discrepancy is the honest alternative.
- **Files modified:** none (this is a criterion correction)
- **Committed in:** `0a7efd6`, `018f670`

**2. [Rule 3 — Blocking] `grep -c '\[\.\.\.'` is 3, not the criterion's 1, and this plan added none of them**

- **Found during:** Task 2
- **Issue:** The criterion asks for "exactly one widening spread of the tag array in the whole file".
  The file contains three `[...` lines, and `git show b9a8ec7:packages/vitest/src/describeFeature.ts`
  confirms it contained the same three BEFORE this plan touched it: the doc-comment mention, the
  `[...options.tags]` widening itself, and `[...ruleLayers.keys()].map(...)` in `collect`'s return —
  a Map-key spread with nothing to do with tags, dating from Phase 8.
- **Fix:** Reported as **3, one of which is prose and one of which is an unrelated pre-existing
  `Map.keys()` spread**. The criterion's actual claim — exactly one TAG-array widening in the package
  — holds, and the adapter's `[...options.tags]` was preserved verbatim inside the factory as plan
  09-04's hand-off note asked. Nothing was refactored to move a grep count; touching `collect`'s
  return to satisfy a criterion about tags would be a change with no reason behind it.
- **Files modified:** none (this is a criterion correction)
- **Committed in:** `018f670`

**3. [Rule 2 — Missing critical functionality] `spec/traceability.md` §1 updated**

- **Found during:** Task 2
- **Issue:** The plan names no spec file, but §1's behavior-doc-02 row said only that "`Errors.ts`
  carries BEH-EC-008's two collection-time notices" — true before this plan and incomplete after it,
  since the notices had no printer until now and the row named none. AGENTS.md §1 makes a code change
  not reflected in `spec/` in the same commit incomplete.
- **Fix:** The row now distinguishes building from printing: `Errors.ts` BUILDS both notices and
  `describeFeature.ts` PRINTS both — the `ExcludedScenariosNotice` once per Feature whose registration
  filter removed Scenarios, and the `UndeclaredTagWarning` from its own adapter's catch-and-degrade —
  and names it as where the public `includeTags`/`excludeTags` become a `Tags.ts` filter. Deliberately
  scoped to that one row: the LARGE reconciliation (BEH-EC-008's MUST-level text and worked example,
  ADR-EC-020's Decision section, REQUIREMENTS.md's RUN-05 text, `spec/roadmap.md`) is assigned by
  09-CONTEXT.md to the plan that CLOSES this phase, and duplicating it here would produce a conflict
  for that plan to resolve.
- **Files modified:** `spec/traceability.md`
- **Verification:** `pnpm verify:spec` — PASS 7, FAIL 0
- **Committed in:** `018f670`

**4. [Rule 3 — Blocking] `pnpm install` to populate the worktree's missing `node_modules`**

- **Found during:** Task 1 baseline
- **Issue:** This parallel executor runs in a fresh worktree with no installed dependencies, exactly
  as plan 09-04's deviation 5 records.
- **Fix:** `pnpm install --frozen-lockfile` — the committed lockfile restored verbatim. **No package
  added, removed, or resolved to a new version**, so Rule 3's package-legitimacy exclusion does not
  apply: nothing was installed that `pnpm-lock.yaml` did not already pin. `git status` is clean of any
  manifest or lockfile change at both commits.
- **Files modified:** none tracked

**5. [Rule 3 — Blocking] Worktree base was behind the plan's stated base commit**

- **Found during:** Startup, before Task 1
- **Issue:** The worktree spawned at `f640f4a`, an ANCESTOR of the required base
  `b9a8ec7` ("docs(phase-09): update tracking after wave 2"). Executing from there would have built
  this plan on a tree without plan 09-04's `EmitOutcome`, required `tagFilter` and `EmitOptions` — the
  entire contract this plan is written against.
- **Fix:** `git reset --hard b9a8ec7`, per the spawn instructions' base-correction step, after the
  HEAD assertion confirmed the branch was `worktree-agent-a7733ddaa6c3cadf9` and not a protected ref.
  The working tree was clean, so nothing was discarded.
- **Files modified:** none

**6. [Rule 3 — Blocking] `dprint` reformatted `spec/traceability.md` after the §1 edit**

- **Found during:** Task 2 verification
- **Issue:** The lengthened table cell put the row over `dprint`'s markdown width, so `pnpm lint`
  failed with "Found 1 not formatted file" — the check runs `dprint check` after `oxlint`.
- **Fix:** `npx dprint fmt spec/traceability.md`, the repo's own formatter with the repo's own config,
  re-padding the table's column alignment. No content changed. `pnpm lint` exits 0 afterwards.
- **Files modified:** `spec/traceability.md`
- **Committed in:** `018f670`

### Both commits build

Unlike plan 09-04, neither intermediate commit here is red. `0a7efd6` builds, type-checks, lints and
passes all 713 tests on its own, because Task 1 changed a signature only by ADDING an optional
parameter — no existing call site broke. `018f670` likewise. A bisect crossing either commit hits a
working tree.

## Requirements

**RUN-05 remains `Pending`**, advanced but not completed — the same call plans 09-03 and 09-04 made,
and for a reason that has narrowed rather than changed. Every piece of the requirement is now
implemented, including D-08's catch-and-degrade, which 09-04's summary named as the specific gap
blocking completion. What is still missing is OBSERVATION: nothing in this repo's suite has yet seen a
tag emerge from the real `it.effect`, seen the D-08 fallback fire against a genuinely undeclared tag,
or seen D-10's notice printed. This plan's own evidence for the degradation path is a mutation probe
that was deleted, not a committed test.

Plan **09-06**'s integration tests against the real `it.effect` are the first point at which the
requirement can be marked without claiming something the repo cannot back (AGENTS.md §4).

## Threat Model Coverage

| Threat ID | Disposition | Status |
|---|---|---|
| T-09-05-01 | mitigate | **Done.** Both terminal writes pass `.message` straight through from the 09-02 factories and neither is rebuilt or reformatted at the call site. `makeUndeclaredTagWarning` `JSON.stringify`s the uri, the Scenario title and each tag; `makeExcludedScenariosNotice` does the same for the uri, the Feature name and both tag lists. The comment at each call site states the two failure modes a second rendering would introduce. |
| T-09-05-02 | mitigate | **Done — 09-04's half completed here.** `if (outcome.excludedScenarioCount > 0)` prints exactly one line naming the count, the Feature, the uri and whichever option was in play, with `reason` derived from the same normalised arrays that produced the count. A stale `excludeTags` hiding a whole Feature can no longer sit behind a green run. |
| T-09-05-03 | mitigate | **Done, mutation-proven.** The catch re-emits without tags; if that also throws, the ORIGINAL value is re-thrown. No message, name or class inspection anywhere in the path — `cause` is bound and only re-thrown. The control run additionally proves the propagated value is the original rather than the fallback's own throw. |
| T-09-05-04 | mitigate | **Done.** RESEARCH Finding 3's degradation path is implemented as verified: the Scenario re-registers untagged (same name, same thunk, `skip` preserved) and every later sibling still collects, so one undeclared tag costs one Scenario its tags rather than costing a whole file every one of its tests. |
| T-09-05-05 | mitigate | **Done.** `pnpm verify:tsgo-gate` was the FIRST command run after the signature edit compiled and exits 0 with assertion 8 firing by diagnostic NAME, not merely by exit code. No overload was reordered. |
| T-09-05-06 | mitigate | **Done.** `pnpm verify:testapi-seam` exits 0. No import was added from the test framework — `describe` and `it` were already imported in this file and the factory uses nothing else. Note (e) now names the script explicitly, so the acceptance grep it referred to abstractly is findable. |
| T-09-05-SC | accept | **Done.** No package added, removed or version-changed. `pnpm install --frozen-lockfile` restored the existing lockfile only. `tinyglobby` belongs to plan 09-07 and was not touched here. |

## Threat Flags

None. This plan opens no network endpoint, no auth path, no file-access pattern and no schema at a
trust boundary. The one genuinely new surface is a `catch` block, and it narrows rather than widens:
it converts a whole-file collection failure into a per-Scenario degradation, and it re-throws
everything it cannot account for structurally.

## Known Stubs

None. `DescribeFeatureOptions` is deliberately absent from `packages/vitest/src/index.ts` — that
barrel edit is plan 09-07's, as the plan's own `<interfaces>` block scheduled and as this file's doc
comment records. That is a scheduled hand-off, not an unwired stub: the option is fully functional
today for any caller inside this package and for a consumer who does not need to NAME the type.

## Notes for Plan 09-06

- **The D-08 path has no committed test.** Its only evidence is the mutation probe recorded above,
  which was deleted. An integration test needs a tag that the root `vitest.config.ts` does NOT declare
  — which means the config's tag list is now load-bearing in the opposite direction too: adding a tag
  to it disables any test that relies on that tag being undeclared.
- **The warning goes to `console.warn`,** the same channel as the unused-definition warnings, so
  `emission.test.ts`'s existing module-scope stub-and-restore pattern for the terminal channel is the
  precedent to copy rather than invent.
- **A `describeFeature` call with a filter that excludes everything still emits the `describe` block
  and the `⚠` warning nodes** — note (g), unchanged by this plan — so an integration test asserting on
  full exclusion should expect an empty block, not an absent one, plus one notice line.
- **The notice prints AFTER the emitted block,** not above it like the unused-definition warnings. A
  test asserting on ordering of terminal output needs to know that.
- **`DescribeFeatureOptions` is importable from `../src/describeFeature.ts` today** and from the
  barrel only after 09-07.

## Notes for the phase's closing plan

The spec reconciliation 09-CONTEXT.md flagged is now genuinely owed, because the code exists:
`spec/behaviors/02-shared-layers-and-tags.md` §BEH-EC-008's MUST-level text explicitly FORBIDS a
`describeFeature`-time registration filter, and `describeFeature` now has one. ADR-EC-020's Decision
section says the same. `spec/traceability.md` §1 was updated here for the printing/building
distinction only; BEH-EC-008's own text, ADR-EC-020, `.planning/REQUIREMENTS.md`'s RUN-05 wording and
`spec/roadmap.md`'s "custom, non-reserved tags" entry are all untouched and all still say the opposite
of what ships.

## Self-Check: PASSED

Both modified files exist on disk:

- `packages/vitest/src/describeFeature.ts` — FOUND
- `spec/traceability.md` — FOUND

Both task commits are present in `git log`:

- `0a7efd6` — FOUND
- `018f670` — FOUND

Working tree clean of the mutation (source restored from a byte copy taken before mutating, probe file
deleted, `git status` clean at both commits, no marker string remaining). STATE.md and ROADMAP.md
deliberately untouched — this executor ran in a worktree and the orchestrator owns those writes after
the wave.
