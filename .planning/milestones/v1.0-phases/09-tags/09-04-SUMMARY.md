---
phase: 09-tags
plan: 04
subsystem: testing
tags: [tags, filtering, emission, seam, vitest, effect, runner, skip, only]

# Dependency graph
requires:
  - phase: 09-tags
    provides: "09-01's vitest.config.ts tag universe and scripts/verify-testapi-seam.sh; 09-02's Tags.ts (shouldEmit/isSkipped/noTagFilter/makeTagFilter); 09-03's ScenarioPlan.tags"
  - phase: 06-plan-scenario-effect-runner-emission-and-drift-detection
    provides: "emitFeature's two-loop emission walk, planFor's unreachable-by-construction throw, and the TestApi seam Runner.ts reaches the framework through"
provides:
  - "packages/vitest/src/TestApi.ts — EmitOptions, the library-owned tag/skip data on the emission seam, and TestApi.effect's required third parameter"
  - "packages/vitest/src/Runner.ts — EmitOutcome, a required tagFilter argument, the registration filter as a `continue` inside BOTH Scenario loops, per-Scenario emit options, and AfterAllScenarios suppression when nothing runnable emitted"
  - "packages/vitest/src/Runner.ts note (g) — both forbidden filter placements with their exact failure modes, plus the two things that deliberately still emit under full exclusion"
  - "packages/vitest/src/describeFeature.ts — the forwarding adapter carrying the single ReadonlyArray -> string[] widening in the package"
  - "packages/vitest/test/Runner.test.ts — the emissionOf sibling projection and 14 assertions carrying roadmap criteria 1, 3 and 4 plus the Pitfall 4 warning-invariance guard"
affects:
  - "09-05 (describeFeature's public includeTags/excludeTags options, the catch-and-degrade adapter, and D-10's notice — calls emitFeature and reads EmitOutcome)"
  - "09-06 (integration emission tests against the real it.effect)"
  - "09-07 (barrel decisions; EmitOptions and EmitOutcome are internal today)"

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Library-owned plain-data options crossing an injected seam, with the framework's own option type named only in the single adapter"
    - "A required argument with a NAMED no-op sentinel instead of an optional one, when the two plausible defaults differ in whether they delete a suite"
    - "Sibling test projection rather than a widened one, so pre-existing assertions keep meaning what they meant and the new claim is made separately"
    - "A counter that is deliberately NOT the complement of another (runnable vs excluded), with the collapse it prevents written into the code"

key-files:
  created: []
  modified:
    - packages/vitest/src/TestApi.ts
    - packages/vitest/src/Runner.ts
    - packages/vitest/src/describeFeature.ts
    - packages/vitest/test/Runner.test.ts
    - spec/traceability.md

key-decisions:
  - "EmitOptions.skip is a FIELD, not a second skip-specific TestApi member: it keeps the interface at two members and makes the recording fake grow a comparable VALUE rather than a method whose only observable is whether it was called"
  - "TestApi.effect's third parameter is REQUIRED with no `| undefined`: Runner.ts computes a value for every emission including the synthetic nodes, so an optional argument could only ever be a forgotten one"
  - "emitFeature returns EmitOutcome rather than void, and prints nothing: the excluded count cannot be computed anywhere else without duplicating the walk, and a terminal write here would spam Runner.test.ts's dozens of direct calls"
  - "runnableScenarioCount is tracked separately from excludedScenarioCount rather than derived: a @skip Scenario is emitted (so not excluded) and never invoked (so not runnable), and deriving one from the other would emit a teardown node for a fully-@skip Feature"
  - "The synthetic ⚙ and ⚠ nodes carry `{ tags: [], skip: false }` from one shared constant — giving them the Feature's tags would let a --tagsFilter run skip a Feature's teardown and would push author strings through a second framework validation site"
  - "⚠ warning nodes and the describe blocks still emit under full exclusion; only the ⚙ node is suppressed. The first two are about registration and findability, the third is about resource lifecycle"
  - "Runner.test.ts got a SIBLING projection (emissionOf) rather than a widened shapeOf, so none of the fifteen pre-09-04 shape assertions changed"

patterns-established:
  - "A note amendment that separates the guarantee being preserved from the case being removed, when a conjunct is added to a condition an earlier note argued for as unconditional"
  - "A mutation that reproduces a RESEARCH finding deliberately (W) recorded alongside the three that guard assertions, because a reproduced failure mode is evidence a placement argument is not theoretical"

# Requirements
requirements-completed: []
requirements-advanced: [RUN-05]

# Metrics
duration: 35min
completed: 2026-08-30
---

# Phase 9 Plan 04: Tags at the Emission Seam Summary

**`TestApi.effect` now carries the library's own `EmitOptions` as a required third argument, and `emitFeature` applies the registration filter inside its own walk — so an excluded Scenario produces no emission record at all, a `@skip` one produces a real skip with its tags intact, an `@only` one produces nothing but a plain tag, and a Feature with nothing runnable emits no teardown node.**

## Performance

| Metric | Value |
|---|---|
| Duration | ~35 min (23:45 → 00:20, 2026-08-29/30) |
| Tasks | 3 of 3 |
| Files modified | 5 (0 created) |
| Repo test count | 699 → 713 (+14) |
| `Runner.test.ts` test count | 25 → 39 (+14) |

## Task Commits

1. **Task 1: Add `EmitOptions` to `TestApi.ts` and rewrite note (b)** — `a5d9e14` (feat)
2. **Task 2: Filter and option-carry inside `emitFeature`'s walk; suppress `AfterAllScenarios`** — `f4acc6d` (feat)
3. **Task 3: Assert the emission contract in `Runner.test.ts`** — `2446d04` (test)

## The contracts plan 09-05 implements against

### `packages/vitest/src/TestApi.ts`

```ts
export interface EmitOptions {
  readonly tags: ReadonlyArray<string>
  readonly skip: boolean
}

export interface TestApi {
  readonly describe: (name: string, define: () => void) => void
  readonly effect: (
    name: string,
    self: () => Effect.Effect<void, unknown, Scope.Scope>,
    options: EmitOptions
  ) => void
}
```

Byte-identical to the plan's `<interfaces>` block. Both imports are still `import type`, there is
still no runtime value in the file, and `pnpm verify:testapi-seam` exits 0.

### `packages/vitest/src/Runner.ts`

```ts
export interface EmitOutcome {
  readonly excludedScenarioCount: number
}

export const emitFeature = (
  args: {
    readonly api: TestApi
    readonly plan: FeaturePlan
    readonly layer: Layer.Layer<any, any, never>
    readonly hooks: HookSet
    readonly ruleHooks: ReadonlyMap<string, HookSet>
    readonly ruleLayers: ReadonlyMap<string, Layer.Layer<any, any, never>>
    readonly scenarioLayers: ReadonlyMap<string, Layer.Layer<any, any, never>>
    readonly tagFilter: TagFilter
  }
): EmitOutcome
```

`tagFilter` is the EIGHTH field and is required; `noTagFilter` is what a caller that filters nothing
passes. `excludedScenarioCount` counts excluded Scenarios across BOTH loops and is never incremented
for a `@skip` Scenario — that one is emitted, so it was not excluded.

### `packages/vitest/src/describeFeature.ts`

```ts
const vitestTestApi: TestApi = {
  describe,
  effect: (name, self, options) => it.effect(name, self, { tags: [...options.tags], skip: options.skip })
}
```

Still one module-scope constant, not yet a factory — plan 09-05 owns the `featureUri`-carrying factory
and the catch-and-degrade. The `emitFeature` call passes `tagFilter: noTagFilter` and discards the
return value; the comment at the call site names 09-05 as the plan that replaces both.

## The exact wording of the amended note (e)

The plan asked for this verbatim. The paragraph now reads (the second sentence onward is new; the
paragraph that follows it in the file is unchanged from Phase 7):

> `AfterAllScenarios`, by contrast, is not a once-cell at all: it is ONE extra node emitted after
> every Scenario (Rules included) and before the warnings, whose body runs the batch directly, AND
> ONLY WHEN AT LEAST ONE RUNNABLE SCENARIO WAS EMITTED. That last conjunct is new and the rest of this
> note is not; the distinction matters, because the guarantee the paragraph below describes is
> untouched by it. What D-09's "runs always" is about is a FAILURE not being able to stop teardown — a
> failed Scenario, or a failed `BeforeAllScenarios` — and that still holds exactly as written. What the
> conjunct removes is the VACUOUS case, which is a different thing entirely: when no runnable Scenario
> was emitted, `BeforeAllScenarios` is a once-cell reachable only from inside a Scenario thunk, so it
> structurally CANNOT have run, and an `AfterAllScenarios` node would tear down resources nothing ever
> set up. "Runnable" means both halves: a Scenario the tag filter kept AND one that is not
> `@skip`-tagged — a skipped test's thunk is never invoked either, so it reaches the once-cell no more
> than an excluded one does. A Feature that declares no Scenarios at all falls in the same case for the
> same reason and is not a separate rule. Note that a failing Scenario is still runnable and still
> emits the node: it RAN, so it reached the cell.

## The exact wording of the new note (g)

> (g) **The registration-time tag filter runs INSIDE this walk, after `planFor` and before anything is
> emitted, and the two places it looks like it belongs are both broken.** D-03 makes an excluded
> Scenario never become a test node at all — absent from the output rather than reported as skipped —
> and this is the only point in the pipeline where that is expressible. Both plausible relocations are
> recorded here because both COMPILE, and one of them is silent.
>
> *Filtering `plan.scenarios` before `emitFeature` is handed it* — the obvious reading of "filter at
> registration time", done one layer up in `describeFeature.ts` — is loud and immediate: this walk does
> not iterate `plan.scenarios`, it iterates `plan.feature.scenarios` and LOOKS THE PLAN UP through
> `planFor`. Removing an entry from the plan while leaving the parsed document intact is exactly the
> state `planFor`'s throw declares impossible, so the whole file dies on "no ScenarioPlan for scenario
> id …", blaming `Plan.ts` for a filter written elsewhere.
>
> *Filtering inside `planFeature`* is the dangerous one, because nothing goes red. `planFeature`
> accumulates the set of step definitions each Scenario's steps resolved to, and every registered
> definition outside that set becomes an `UnusedStepDefinitionWarning` (MATCH-05, ADR-EC-019). Drop the
> excluded Scenarios before that pass and every definition used ONLY by them newly reports as unused —
> on all three of 06-CONTEXT.md D-02's channels at once. Warning nodes always pass, so a tag filter
> would quietly rewrite this Feature's drift-detection output behind a green run. Planning and warning
> cover the WHOLE Feature; only emission is filtered. The property that buys is worth stating
> positively: a tag filter cannot change which step definitions are considered defined or used, ever.
>
> Two things deliberately still emit when every Scenario is filtered out, and they are decisions rather
> than omissions. The `⚠` warning nodes emit, because they describe REGISTRATION and not execution —
> suppressing them would make a filtered run look like a Feature with no unused definitions, which is a
> different and false claim. And the `describe` blocks emit even when they end up empty, for that
> reason plus note (c)'s: a Feature or Rule the reader can find in the reporter and see is empty beats
> one that silently is not there. Only the `⚙ AfterAllScenarios` node is suppressed, and note (e) has
> the reason, which is about resource lifecycle rather than about visibility.

## Mutation proofs

All four were performed against real source, run, observed, and reverted. Every count below is what
the runner actually reported. After each revert, `git diff --stat` showed the mutated file unmodified
relative to its commit.

| # | Mutation | Observed | Named tests among the failures |
|---|---|---|---|
| **1 (V)** | Feature-level loop's `continue` removed — the exclusion is counted and the Scenario emits anyway | **4 of 39 fail** | "excludeTags removes the excluded Scenarios ENTIRELY — absent by title, not present-and-skipped"; "includeTags restricts emission to matching Scenarios, across the Rule's nested loop too"; "excludes a tag named in BOTH arrays"; "suppresses the node when EVERY Scenario is filtered out" |
| **2 (W)** | Filter moved to a pre-filter of `plan.scenarios` in `describeFeature.ts` (RESEARCH Finding 12 reproduced deliberately) | **`test/emission.test.ts` dies: `Tests no tests`** | Not an assertion failure — a thrown `Error` during collection |
| **3 (X)** | `runnableScenarioCount > 0` conjunct dropped from the `AfterAllScenarios` condition | **3 of 39 fail** | "suppresses the node when EVERY Scenario is @skip-tagged"; "suppresses the node when EVERY Scenario is filtered out"; "suppresses the node for a Feature that declares no Scenario at all" |
| **4 (Y)** | `Tags.ts`'s `isSkipped` made to always return `false` | **4 of 713 fail across the repo** | In `Runner.test.ts`: "emits a @skip Scenario with skip true…" and "suppresses the node when EVERY Scenario is @skip-tagged". In `Tags.test.ts`: "is true for a Scenario tagged @skip" and "is true when @skip sits among other tags" |

**Mutation 1's fact is the one the plan asked for:** the `excludedScenarioCount` half of each failing
test still passes under it — the counter is exactly what the mutation leaves intact — so the failures
are carried by the TITLE assertions and not by a count. That is the difference between asserting D-03
("the Scenario is absent") and asserting the weaker "fewer Scenarios emitted".

**Mutation 2's output, verbatim:**

```
Error: emitFeature: no ScenarioPlan for scenario id "76fd5101-f451-419e-9876-c99d0239949e"
("the first scenario records its own entry"). Every Scenario reachable from feature.scenarios and
feature.rules must appear in the plan, so this is a bug in Plan.ts or in Runner.ts, not in the
.feature file.
 Test Files  1 failed (1)
      Tests  no tests
```

`Tests no tests` is the part worth keeping: the whole file dies during collection rather than any
assertion failing, and the message blames `Plan.ts` for a filter written two modules away. Pitfall 3
predicted exactly this text.

**Mutation 4 diverged from the plan's prediction, correctly.** The plan expected the `@skip` assertion
to fail "while every other assertion still passes"; the fully-skipped suppression test fails too,
because that condition genuinely reads `isSkipped`. The important half of the prediction holds: nothing
in the SC1, SC3 or SC4 blocks moves, so the skip flag and the tag array are asserted independently.

## Verification

All plan gates run and green at `2446d04`:

| Gate | Result |
|---|---|
| `pnpm build` | exit 0 |
| `pnpm typecheck:test` | exit 0, both projects |
| `pnpm lint` (oxlint + dprint check) | exit 0 |
| `pnpm circular` | no circular dependency found (32 files) |
| `pnpm test` | 31 files, **713 tests**, all passing (was 699) |
| `pnpm verify:testapi-seam` | exit 0 — three `✓` lines |
| `pnpm verify:tsgo-gate` | exit 0 — 10 `✓` assertions, unchanged (this plan touches no overload) |
| `pnpm verify:spec` | PASS 7, FAIL 0, SKIP 1 |

### Acceptance greps

| Criterion | Required | Actual |
|---|---|---|
| `grep -c 'export interface EmitOptions' src/TestApi.ts` | 1 | 1 ✓ |
| non-comment `const`/`function` lines in `src/TestApi.ts` | 0 | 0 ✓ |
| `grep -cE '^import ' src/TestApi.ts` (both `import type`) | 2 | 2 ✓ |
| `grep -c 'skipEffect' src/TestApi.ts` | 0 | 0 ✓ (see deviation 1) |
| `"Phase 9"` / `"deliberately absent"` in `src/TestApi.ts` | absent | 0 / 0 ✓ |
| `TestApi` member count | 2 | 2 ✓ |
| `grep -c 'readonly tagFilter: TagFilter' src/Runner.ts` | 1 | 1 ✓ |
| `grep -c 'export interface EmitOutcome' src/Runner.ts` | 1 | 1 ✓ |
| `grep -c 'shouldEmit(' src/Runner.ts` | 2 | 2 ✓ |
| `grep -c 'isSkipped(' src/Runner.ts` | 2 | 2 ✓ |
| `grep -cE 'console\.(warn\|log\|error)' src/Runner.ts` | 0 | 0 ✓ |
| non-comment `api.describe(` in `src/Runner.ts`, none with a third argument | 2 | 2 ✓ |
| `grep -c 'All EIGHT fields' src/describeFeature.ts` | 1 | 1 ✓ |
| `grep -c 'noTagFilter' src/describeFeature.ts` | 1 | **2** — see deviation 2 |
| `grep -c 'from "../src/index.ts"' test/Runner.test.ts` | 0 | 0 ✓ |
| new tests in `test/Runner.test.ts` | ≥ 10 | **14** ✓ (25 → 39) |

## Decisions Made

- **`skip` is a field on `EmitOptions`, not a second `TestApi` member.** Two reasons, both written into
  note (b): it keeps the interface at two members, so `Runner.ts` has one emission call rather than a
  branch choosing between two calls that must stay in step; and it makes the recording fake grow a
  recorded VALUE an assertion can compare, rather than a method whose only observable is whether it was
  called. A fake carrying a member no assertion covers is how a fake starts drifting.
- **`only` is absent permanently, and note (b) says so as a behavior decision rather than a deferral.**
  D-06 never routes `@only` to the framework's only-mode; the framework's `allowOnly` check is
  reachable only from branches guarded by some task already being in only-mode, so emitting no such
  task makes it unreachable rather than merely un-triggered.
- **The third parameter is required with no `| undefined`.** `Runner.ts` computes a value for every
  emission it makes, the synthetic nodes included, so there is no call site that legitimately has
  nothing to say — an optional parameter could only ever be a forgotten one, and forgetting it emits an
  untagged, never-skipped test with nothing going red.
- **`emitFeature` returns `EmitOutcome` and prints nothing.** The count cannot be computed outside this
  walk without duplicating it (and then disagreeing with it), and a terminal write in `Runner.ts` would
  spam `Runner.test.ts`'s two dozen direct calls — the same rule `describeFeature.ts` already states
  for `collectFeature`. A struct rather than a bare number, so a later plan adding a second reported
  quantity is not a breaking change.
- **`runnableScenarioCount` is tracked separately rather than derived from `excludedScenarioCount`.**
  The two are not complements: a `@skip` Scenario is EMITTED (so not excluded) and its thunk is never
  invoked (so not runnable). Deriving one from the other collapses that distinction and emits a
  teardown node for a fully-`@skip` Feature — which is precisely Pitfall 6.
- **The synthetic `⚙` and `⚠` nodes share one `emptyEmitOptions` constant.** Giving them the enclosing
  Feature's tags is the plausible tidy-up and is wrong twice: a `--tagsFilter` invocation would then
  select or skip a Feature's teardown, which nobody asked to filter, and it would push
  author-controlled strings through a second framework validation site for no benefit. Sharing one
  value is safe for `noTagFilter`'s reason — every field is `readonly`, `tags` is a `ReadonlyArray`,
  and the adapter spreads it into a fresh array before anything could mutate it.
- **`⚠` nodes and the `describe` blocks still emit under full exclusion; only `⚙` is suppressed.**
  Recorded in note (g) as decisions, not omissions. The first two are about registration and reporter
  findability; the third is about tearing down what was never set up.
- **`Runner.test.ts` got a sibling projection, not a widened one.** `emissionOf` sits beside `shapeOf`
  so none of the fifteen pre-existing shape assertions changed. The corollary is written into both the
  helper's comment and the file header: a value absent from a projection is invisible to every
  assertion comparing through it, so all fifteen would pass against an implementation that emitted
  every Scenario untagged.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 — Blocking] Note (b) paraphrases the rejected alternative rather than naming it**

- **Found during:** Task 1
- **Issue:** The plan's action text asks note (b) to say that `skip` is a field "rather than as a
  second `skipEffect` member on this interface", while the same task's acceptance criterion requires
  `grep -c 'skipEffect' packages/vitest/src/TestApi.ts` to be 0. The two cannot both be satisfied
  literally — this is STATE.md's 03-04 lesson (a grep criterion that counts a literal also forbids
  explaining it in a comment) for the third time in this phase, after 09-01's deviation 1 and 09-02's
  deviation 2.
- **Fix:** The note reads "a second, skip-specific emission member beside `effect`". No meaning is
  lost — the alternative is still named precisely enough to evaluate — and the grep is 0.
- **Files modified:** `packages/vitest/src/TestApi.ts`
- **Committed in:** `a5d9e14`

**2. [Rule 3 — Blocking] `grep -c 'noTagFilter' describeFeature.ts` is 2, not the criterion's 1**

- **Found during:** Task 2
- **Issue:** The criterion counts LINES, and a named import puts the identifier on two of them: the
  `import { noTagFilter } from "./Tags.ts"` statement and the `tagFilter: noTagFilter` call site. The
  only way to reach exactly 1 is a namespace import (`import * as Tags`), which no local import in this
  package uses — every one of `describeFeature.ts`'s eleven local imports is named, and `Runner.ts`'s
  new `Tags.ts` import is named too.
- **Fix:** The named import was kept and the criterion is reported as **2, both accounted for**
  (`describeFeature.ts:106` and `:732`). The criterion's intent — that the call site passes the
  sentinel rather than defaulting or omitting it — is satisfied and asserted by
  `pnpm build`. Bending the import style to satisfy a miscounted grep is the anti-pattern this repo has
  already recorded twice; naming the discrepancy is the honest alternative.
- **Files modified:** none (this is a criterion correction)
- **Committed in:** `f4acc6d`

**3. [Rule 3 — Blocking] `test/Runner.test.ts` had to be updated in Task 2, not only Task 3**

- **Found during:** Task 2
- **Issue:** The plan scopes Task 2's edits to `Runner.ts` plus "the two minimal `describeFeature.ts`
  edits", but its own acceptance criteria require `pnpm typecheck:test` and `pnpm test` to exit 0 at
  that task. Adding a required eighth field to `emitFeature` breaks all 24 call sites in
  `Runner.test.ts` immediately, and adding a required third parameter to `TestApi.effect` breaks the one
  place that drives the fake directly.
- **Fix:** Task 2 makes the mechanical fixture update only — a new `unfiltered` constant spread into
  every existing call, and `{ tags: [], skip: false }` on the one direct `api.effect`. **No pre-existing
  assertion changed**, which is Task 2's own criterion and is what the `unfiltered` constant's comment
  is about: every assertion written before this plan must hold byte-for-byte under `noTagFilter`. All
  new assertions landed in Task 3 as planned. This is STATE.md's 03-05 lesson applied from the start,
  the same way plan 09-03 applied it.
- **Files modified:** `packages/vitest/test/Runner.test.ts`
- **Committed in:** `f4acc6d`

**4. [Rule 2 — Missing critical functionality] `spec/traceability.md` updated**

- **Found during:** Task 3
- **Issue:** The plan names no spec file, but §4's `Runner.test.ts` row asserted the `⚙ AfterAllScenarios`
  node's "running always (D-09)" — false the moment Task 2 landed — and the row carried no BEH-EC-008.
  AGENTS.md §1 makes a code change not reflected in `spec/` in the same commit incomplete, and §4
  forbids stating something the repo cannot back.
- **Fix:** The row's D-09 clause now distinguishes the FAILURE guarantee that is unchanged from the
  vacuous case that is now suppressed, gains BEH-EC-008, and describes RUN-05's emission half.
  `TestApi.ts` joins behavior doc 02's module list in §1 with a sentence naming `EmitOptions` as the
  seam the tag and skip data crosses.
- **Files modified:** `spec/traceability.md`
- **Verification:** `pnpm verify:spec` — PASS 7, FAIL 0
- **Committed in:** `2446d04`

**5. [Rule 3 — Blocking] `pnpm install` to populate the worktree's missing `node_modules`**

- **Found during:** Task 1 verification
- **Issue:** This parallel executor runs in a fresh worktree with no installed dependencies.
- **Fix:** `pnpm install --frozen-lockfile` — the committed lockfile restored verbatim. **No package
  added, removed, or resolved to a new version**, so Rule 3's package-legitimacy exclusion does not
  apply: nothing was installed that `pnpm-lock.yaml` did not already pin. `git status` is clean of any
  manifest or lockfile change.
- **Files modified:** none tracked

### One intermediate commit does not build

`a5d9e14` (Task 1) makes `TestApi.effect`'s third parameter required while `Runner.ts` still passes
two arguments, so `pnpm build` is red at that commit and green again at `f4acc6d`. This follows the
plan, whose Task 1 verify is deliberately `pnpm verify:testapi-seam` alone; it is recorded here rather
than silently, because a bisect crossing that one commit will hit a compile error rather than a test
failure. The consuming fixtures are scoped into the very next commit, which is the mitigation
STATE.md's 03-05 entry asks for.

## Requirements

**RUN-05 remains `Pending`**, advanced but not completed — the same call plan 09-03 made and for the
same reason. The requirement is "every tag on a Scenario is emitted as a native vitest tag; `@skip`
additionally routes to `it.effect.skip`". Every piece of that is now true at the SEAM and asserted
against a recording fake, and `describeFeature.ts`'s adapter does forward both to the real `it.effect`
— but nothing has yet been observed emerging from the real framework, and D-08's catch-and-degrade path
(which decides what happens when a Feature author writes an undeclared tag) does not exist yet. Plan
**09-06**'s integration tests against the real `it.effect` are the first point at which the requirement
can be marked without claiming something the repo cannot back (AGENTS.md §4).

## Threat Model Coverage

| Threat ID | Disposition | Status |
|---|---|---|
| T-09-04-01 | mitigate | **Done.** No node title is built from a tag anywhere in this plan. `afterAllScenariosTitle` is still a bare constant and `warningTitle` still `JSON.stringify`s its pattern; both are untouched. Asserted by the no-third-argument-on-`api.describe` criterion and by the SC3 test's "`@only` appears in no record name" scan. |
| T-09-04-02 | mitigate (partial, completed in 09-05) | **This plan's half done.** `emitFeature` returns `excludedScenarioCount`, asserted for both loops (2 from the Feature-level loop, 3 spanning both, 5 for full exclusion, 0 under `noTagFilter`). 09-05 owns printing D-10's notice. |
| T-09-04-03 | mitigate | **Done.** The filter lives inside the walk. The Pitfall 4 double-emission assertion is labelled as the only thing that can observe a regression, and mutation W reproduces the alternative placement's failure on purpose. |
| T-09-04-04 | mitigate | **Done.** `AfterAllScenarios` is suppressed when no runnable Scenario was emitted, with mutation X proving the conjunct is load-bearing in all three ways of reaching zero. |
| T-09-04-05 | mitigate | **Done.** `EmitOptions` has no only channel, so the seam gives the library no way to reach only-mode at all; `Runner.ts` branches on nothing but `isSkipped`. The SC3 block states the structural argument and asserts the observable sibling claim. |
| T-09-04-06 | mitigate | **Done.** `pnpm verify:testapi-seam` exits 0 and was run as a verify command on Tasks 1 and 2. |
| T-09-04-SC | accept | **Done.** No package added, removed or version-changed. `pnpm install --frozen-lockfile` restored the existing lockfile only. `tinyglobby` belongs to plan 09-07 and was not touched here. |

## Threat Flags

None. This plan opens no network endpoint, no auth path, no file-access pattern and no schema at a
trust boundary. Every file touched is a pure, synchronous, in-process transform; the only data crossing
a boundary is the tag array, which already crossed one in plan 09-03 and reaches a second (the
framework's tag validation) only through `describeFeature.ts`'s adapter, whose failure mode is plan
09-05's and 09-06's D-08 work.

## Known Stubs

None. `EmitOptions` and `EmitOutcome` are deliberately absent from `packages/vitest/src/index.ts` —
`TestApi.ts`'s and `Runner.ts`'s closing paragraphs both already state that neither module is
re-exported, and plan 09-07 owns any barrel decision. That is a scheduled hand-off, not an unwired
stub. `describeFeature.ts` discarding `emitFeature`'s return value is likewise scheduled, and the call
site's comment names 09-05 as the plan that starts reading it.

## Notes for Plan 09-05

- **`emitFeature` returns `EmitOutcome`; read `excludedScenarioCount` from it.** It is already correct
  across both loops and is 0 under `noTagFilter`. Do not recount anywhere else.
- **Replace `tagFilter: noTagFilter` with `makeTagFilter(options)`** and nothing else at that call
  site. The filter's placement is settled and note (g) says why; do not move it.
- **The adapter is still a module-scope constant.** Turning it into a `featureUri`-carrying factory is
  09-05's, and `describeFeature.ts` note (e)'s "built once at module scope" sentence must move with it
  (AGENTS.md §4). The `[...options.tags]` widening already exists and should be preserved verbatim
  inside whatever the factory becomes.
- **`EmitOptions` is a two-member interface and should stay one.** The catch-and-degrade fallback
  re-emission needs `{ skip: options.skip }` with no tags, which needs no new field.
- **The one direct `api.effect` call in `test/Runner.test.ts`** (the depth-counter test) passes
  `{ tags: [], skip: false }` inline. If `EmitOptions` grows a field, that is the site that will fail
  to compile first.
- **`⚠` warning nodes survive full exclusion by decision.** If 09-05's notice makes a fully-excluded
  Feature print, the warning nodes are still emitted alongside it — that is note (g), and the Pitfall 4
  test asserts it.

## Self-Check: PASSED

All five modified files exist on disk:

- `packages/vitest/src/TestApi.ts` — FOUND
- `packages/vitest/src/Runner.ts` — FOUND
- `packages/vitest/src/describeFeature.ts` — FOUND
- `packages/vitest/test/Runner.test.ts` — FOUND
- `spec/traceability.md` — FOUND

All three task commits are present in `git log`:

- `a5d9e14` — FOUND
- `f4acc6d` — FOUND
- `2446d04` — FOUND

Working tree clean of every mutation (all four reverted from backups and confirmed by
`git diff --stat`). STATE.md and ROADMAP.md deliberately untouched — this executor ran in a worktree
and the orchestrator owns those writes after the wave.
