---
phase: 09-tags
plan: 06
subsystem: testing
tags: [tags, skip, only, integration, emission, strictTags, catch-and-degrade, vitest, effect, deferral]

# Dependency graph
requires:
  - phase: 09-tags
    provides: "09-01's vitest.config.ts tag universe and its reserved @undeclared-on-purpose slot; 09-02's Errors.ts message factories; 09-03's ScenarioPlan.tags; 09-04's EmitOptions/skip at the seam and the AfterAllScenarios runnable-count conjunct; 09-05's DescribeFeatureOptions and the per-Feature catch-and-degrade adapter"
  - phase: 06-plan-scenario-effect-runner-emission-and-drift-detection
    provides: "packages/vitest/test/emission.test.ts itself — the only file in the repo that calls describeFeature for real, and its module-scope-stub-then-assert-inside-an-it idiom"
provides:
  - "packages/vitest/test/emission.test.ts — six new real describeFeature calls (the 5th through 10th), carrying runtime acceptance for roadmap criteria 1, 2 and 3, D-03, D-06, D-07, D-08 and D-10"
  - "packages/vitest/test/emission.test.ts — a COLLECTION-PHASE console.warn capture (collectionWarnings + warningsFor + a beforeAll restore), which is the only shape that can observe a tag warning at all"
  - "packages/vitest/src/Runner.ts — an optional onEmitted(outcome) callback invoked as the LAST statement inside the emission walk, plus note (h) recording why the returned EmitOutcome is unsafe under a deferring framework and why it is kept anyway"
  - "packages/vitest/src/describeFeature.ts — D-10's exclusion notice moved onto onEmitted, which is what makes it print at all"
  - "the measured fact that vitest DEFERS a describe factory, and its two consequences: a wrap-the-call warning capture is permanently empty, and a synchronously-read EmitOutcome is always zero"
affects:
  - "09-07 (barrel plan — disjoint file set; no coordination needed)"
  - "09-08 (CLI gate — the @only and @skip Scenario titles it greps for are listed below)"
  - "the phase's closing plan (RUN-05 is now fully observable; spec reconciliation for BEH-EC-008/ADR-EC-020 is still owed)"

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "A collection-phase terminal capture, installed at module scope and removed in beforeAll, for observing output produced by a DEFERRED suite factory rather than by the call that registered it"
    - "Filtering captured terminal lines by the artefact's uri rather than by array position, so each block reads only its own and collection order is not encoded in an assertion"
    - "Asserting a security control by matching the JSON.stringify'd form specifically, so the assertion fails against a bare interpolation that a toContain check would accept"
    - "Pairing a must-be-zero counter with a must-be-non-zero sibling counter in the same comparison, so zero means 'correctly suppressed' rather than 'nothing ran at all'"
    - "Reporting a walk's outcome through a callback fired INSIDE the walk rather than through a return value, when whether the walk has run at return time is the injected collaborator's choice"

key-files:
  created: []
  modified:
    - packages/vitest/test/emission.test.ts
    - packages/vitest/src/Runner.ts
    - packages/vitest/src/describeFeature.ts
    - spec/traceability.md

key-decisions:
  - "Task 1's claim is carried by an EMPTY warning capture, not by a non-zero test count: the plan's structural argument was falsified by 09-05's shipped catch-and-degrade, which keeps the file green when a tag is rejected"
  - "The warning capture spans the whole COLLECTION phase instead of wrapping each describeFeature call, because vitest defers the describe factory and a wrapped capture is silently, permanently empty"
  - "The D-08 probe Scenario carries exactly ONE tag, so the block's assertions are about the mechanism rather than about the over-reporting defect recorded below"
  - "excludeTags absence is asserted by TITLE via currentTestName(), never by a total count — a count cannot separate 'never registered' from 'registered and skipped', which is D-03's whole distinction"
  - "OPTION B per coordinator decision: emitFeature gains an OPTIONAL onEmitted callback fired inside the walk, and KEEPS its EmitOutcome return value, so Runner.ts's 33 test call sites and four outcome assertions are untouched"
  - "The accepted cost of Option B is two ways to obtain one value where one is a trap; it is documented on Runner.ts note (h), on EmitOutcome, and on the parameter itself, with 'new code uses onEmitted' stated explicitly"
  - "describeFeature DISCARDS the return value entirely rather than reading both, so there is exactly one live source of the count in the composition root"

patterns-established:
  - "Measuring a framework's collection/execution phase boundary with a throwaway probe before trusting a plan's assumption about when a side effect is observable"
  - "Recording a mutation whose predicted outcome was FALSIFIED, together with the second mutation that recovers the predicted outcome, rather than reporting the prediction as met"
  - "Keeping a known-unsafe API beside its safe replacement when removing it would churn correct downstream assertions, provided the trap is documented at every site a caller can reach it from"

# Requirements
requirements-completed: [RUN-05]
requirements-advanced: []

# Metrics
duration: 45min
completed: 2026-08-30
---

# Phase 9 Plan 06: Runtime Tag Acceptance Through the Real describeFeature Summary

**Six new real `describeFeature` calls prove at runtime that a four-level-tagged Feature collects and runs, that a `@skip` Scenario executes no step and no hook and is harmless even with an unmatched step, that a fully-skipped Feature runs no teardown, that an undeclared tag warns with quoted text and keeps running, and that a registration filter excludes without a trace while an empty array excludes nothing — and, in the course of proving it, found and fixed a shipped defect: vitest DEFERS its `describe` factory, so D-10's exclusion notice had never printed once.**

## Performance

| Metric | Value |
|---|---|
| Duration | ~45 min (00:26 → 00:55, 2026-08-30) |
| Tasks | 3 of 3, plus a coordinator-decided source fix |
| Files modified | 4 (0 created) |
| Repo test count | 713 passed → **732 passed + 3 skipped** (735) |
| `emission.test.ts` count | 20 passed → **39 passed + 3 skipped** (42) |
| Real `describeFeature` calls in the file | 4 → **10** |

## Task Commits

1. **Task 1: a four-level-tagged Feature collects and runs for real** — `82a16ab` (test)
2. **Task 2: `@skip` runs no step, no hook and no teardown** — `f619271` (test)
3. **Task 3: the D-08 degradation and the D-03 registration filter** — `66bcfaa` (test)
4. **D-10 fix: report the emission outcome from inside the walk (Option B)** — `a674068` (fix)

---

## The defect this plan found, and the fix the coordinator chose

### What was wrong

`describeFeature.ts` read `emitFeature`'s returned `EmitOutcome` on the statement after `emitFeature`
returns:

```ts
const outcome = emitFeature({ ... })
if (outcome.excludedScenarioCount > 0) { console.warn(makeExcludedScenariosNotice({ ... }).message) }
```

`emitFeature` increments `excludedScenarioCount` **inside** the `api.describe(...)` factory. `Runner.ts`
stated the assumption that makes this correct — *"That same synchronous-`define` guarantee is what lets
the returned counts be read immediately after the outermost `describe` call returns"* — and against
`Runner.test.ts`'s recording fake it holds, because that fake invokes `define` synchronously.

**Against the real framework it did not hold.** vitest's `describe(name, factory)` registers a suite
collector and runs `factory` later, when the runner collects the file. So at the moment
`describeFeature` read the outcome the walk had not happened, `excludedScenarioCount` was `0`, the
`> 0` guard never opened, and **the notice never printed — not late, never.** A stale `excludeTags`
hiding a whole Feature sat behind a green run, which is the exact failure D-10 exists to prevent.

Measured three ways before any code changed:

| Probe | Result |
|---|---|
| Throwaway file calling `describeFeature(..., { excludeTags: ["@wip"] })` with `console.warn` captured across the whole module body **and** re-read after the tests ran | both captures **empty**, while the exclusion itself worked (2 of 3 Scenarios absent) |
| A temporary assertion in `emission.test.ts` expecting one notice line for `test/exclude-tags.feature` | `expected [] to have a length of 1 but got +0`, with the sibling title assertion proving 2 Scenarios *were* excluded |
| Same file with `--disableConsoleIntercept` | no notice line anywhere in the output |

### Why nothing caught it before

`Runner.test.ts`'s four `excludedScenarioCount` assertions are correct **about the fake** and silent
about the framework. 09-05's summary marked T-09-05-02 *"Done… A stale `excludeTags` hiding a whole
Feature can no longer sit behind a green run"* — that claim did not hold against the real entry point
until this plan. **That summary's T-09-05-02 row should be read as superseded by this one.** This is
precisely the class of defect `emission.test.ts` exists for, and the same shape as the file's own
historical mutation C: an implementation perfectly correct at the seam that produces nothing at all.

### The fix: Option B, as decided by the coordinator

`emitFeature` gained an **optional** `onEmitted?: (outcome: EmitOutcome) => void`, invoked as the
**last statement inside** the emission walk, and **kept** its `EmitOutcome` return value.
`describeFeature.ts` now prints D-10's notice from that callback and discards the return value.

```ts
// Runner.ts — last statement inside api.describe(...)'s callback
onEmitted?.({ excludedScenarioCount })
})

// still returned, for a caller whose api.describe IS synchronous
return { excludedScenarioCount }
```

**Why the return value is kept — and this is a deliberate, accepted cost, not an oversight.** Removing
it would churn 33 `emitFeature` call sites in `Runner.test.ts` plus its four
`deepStrictEqual(outcome, …)` assertions, every one of which is *correct about the recording fake it
drives* — the fake runs `define` synchronously, so the returned counts are accurate there. A caller
that genuinely supplies a synchronous `TestApi` (the fake today; possibly Phase 10's shared-Layer
`TestApi`) can still read it. **The price is that two ways to obtain one value now exist and one of
them is a trap.** That trade-off was accepted per the coordinator's decision, and it is mitigated by
documenting the trap at all three places a caller can reach it:

- `Runner.ts` **note (h)** — a new note, with the shipped-defect story and the closing line *"New code
  uses `onEmitted`."*
- `EmitOutcome`'s own doc comment — *"It is delivered TWICE… only one of the two is safe against a real
  test framework."*
- The `@param args.onEmitted` tag, and an inline comment on the `return` statement itself marking it
  correct only for a synchronous `api.describe`.

`describeFeature.ts` reads **only** the callback — the return value is discarded outright rather than
read as a fallback — so the composition root has exactly one live source of the count.

Two properties of `Runner.ts` are preserved unchanged: it still writes nothing to a terminal (the
callback is supplied by the composition root, which is where the `> 0` "is this worth telling a human"
guard also stays), and it still walks the Feature exactly once.

`onEmitted` is the module's **one optional field**, which is a deliberate departure from 09-04's
"required, never optional" doctrine for `emitFeature`'s other eight: it is a reporting hook, and a
caller that wants no report — `Runner.test.ts`'s fake asserting on the return value — is making a real
choice rather than forgetting an argument. Documented as such on the parameter.

### The same deferral also invalidated the plan's Task 1 design

The plan asked Task 1 to wrap its `describeFeature` call in a warning capture. That capture is
**permanently and silently empty** — the `it.effect` emissions, and therefore D-08's `console.warn`,
happen inside the deferred factory, after `describeFeature` has returned. A wrapped capture would not
have failed; it would have passed for the wrong reason forever. Caught by running it; the fix is the
collection-phase capture described below.

---

## What each block asserts

### Task 1 — `Feature: Four-level tagging` (5th real call)

`@featuretag` / `@ruletag` / `@scenariotag` / `@exampletag` across a Feature, a Rule, a Scenario
Outline and its Examples block — mirroring `packages/gherkin/test/Correlate.test.ts:173`'s inheritance
fixture — plus a `@slow` Scenario, an `@only` Scenario and an untagged one.

- `expect(fourLevelStepRuns).toEqual(["untagged", "slow", "only-tagged", "outline:alpha"])` — every
  Scenario ran, in document order, Feature-level before the Rule's. A tag changes nothing about
  whether a Scenario runs (D-06, D-07).
- `expect(warningsFor("test/four-level-tags.feature")).toEqual([])` — **the block's real claim.**

**The plan's structural argument was falsified and replaced.** The plan asked this block to rest on
"a non-zero, all-green test count is itself proof the validator accepted these tags". It is not:
09-05's catch-and-degrade keeps the file green when a tag is *rejected*, re-emitting the Scenario
untagged. Measured — swapping `@slow` for an undeclared tag leaves the file at its full green count.
Only the warning channel separates "accepted" from "rejected and silently dropped", so an empty
capture is the assertion. The block's doc comment states this in full, because the falsified reading
is the obvious one.

Criterion 3 (`@only` never becomes an only-modifier) is carried structurally, per RESEARCH Finding 15:
`vitest.config.ts` pins `allowOnly: false`, so this suite passing *is* the assertion.

### Task 2 — `Feature: Skip runs nothing` + `Feature: Every Scenario in this Feature is skipped` (6th, 7th)

- `expect(skipHookCounts).toEqual({ before: 1, after: 1, beforeStep: 2, afterStep: 2, skippedBodies: 0, runnableBodies: 2 })`
  — one runnable Scenario with two steps accounts for every hook firing, and neither `@skip`
  Scenario's step bodies ran. `runnableBodies: 2` is what makes the zeros non-vacuous: without it,
  a Feature that was skipped wholesale would satisfy "the skipped bodies did not run".
- `expect(allSkippedCounts).toEqual({ beforeAllScenarios: 0, afterAllScenarios: 0, body: 0 })` — the
  runtime half of 09-04's suppression conjunct. **Both** hooks are asserted, not just teardown:
  `beforeAllScenarios: 0` is what makes `afterAllScenarios: 0` mean "correctly suppressed" rather
  than "skipped along with everything else". The asymmetry is the bug shape.

**Pitfall 15** is live in the second `@skip` Scenario: it contains a step no definition matches, and
it reports *skipped* rather than *undefined*. The file header's "deliberately, entirely happy-path"
rule was amended to name this as the second sanctioned deviation, with the chain that makes it safe
(`planFeature` stores an unresolved step; its `StepMatchError` is reached only at `yield*` time inside
an Effect a skipped test never builds).

### Task 3 — three Features (8th, 9th, 10th)

- **D-08.** `@undeclared-on-purpose` on one Scenario: it ran, its sibling ran, and exactly one warning
  names the file, the Scenario and the tag, each matched in `JSON.stringify`'d form. The quoting is
  `Errors.ts` note (f)'s control against a tag forging a second terminal line (T-09-06-01), so the
  assertion matches the quote characters and would fail against a bare interpolation that a
  `toContain(tag)` check would accept.
- **D-03.** `excludeTags: ["@wip"]` — absence asserted **by title**, via `currentTestName()` recorded
  from each step body, compared as a whole array against the single surviving title. A count cannot
  separate "never registered" from "registered and skipped".
- **D-10.** Exactly one notice line for that Feature, asserted on its count (`2 Scenario(s)`), the
  option that caused it (`excludeTags`), the quoted tag and Feature name, and the `never registered`
  sentence that stops "excluded" being read as "skipped". The line as actually rendered:

  ```
  "test/exclude-tags.feature": ExcludedByExcludeTags: 2 Scenario(s) in Feature "excludeTags removes
  Scenarios from registration" were excluded by excludeTags ["@wip"]. They were never registered, so
  they appear nowhere in this run's output — not even as skipped. Widen or remove the filter to run them.
  ```

  **This is the only assertion in the repo that fails if the notice regresses to reading `emitFeature`'s
  synchronous return value** — proven by mutation VII below.
- **Empty-array rule.** `excludeTags: []` on the *same* `@wip` tag the block above excludes, so
  emptiness is provably what decides. Both Scenarios ran; no notice printed.

## Mutation proofs

All five performed against real source, run, observed, reverted. `git status` is clean of every one.

| # | Mutation | Observed |
|---|---|---|
| **I** | Four-level block emits `@mutation-undeclared-tag`, degradation intact | **Plan's prediction FALSIFIED.** File stays at its full green count; one located `UndeclaredTag` warning printed (visible only under `--disableConsoleIntercept`). This is what proved the validator is live *and* that a test-count-based assertion would be vacuous |
| **II** | Same tag, with the adapter's catch-and-degrade bypassed | `packages/vitest/test/emission.test.ts (0 test)` → `Tests no tests`. The plan's predicted outcome, recovered — and it is the degradation, not the tag, that separates the two |
| **III** | Same tag, against the **new** empty-capture assertion | **1 of 26 fails**, and only that one, printing the offending warning verbatim. The assertion is not vacuous |
| **IV** | `Tags.ts`'s `isSkipped` forced to `false` | **3 of 33 fail.** The unmatched-step Scenario turns RED with `UndefinedStep` — proving the `@skip` is what carries Pitfall 15, not the absence of a definition — and both counter assertions fail (`before: 3, after: 3`; `beforeAllScenarios: 1`) |
| **V** | `runnableScenarioCount > 0` conjunct dropped from `Runner.ts` | **1 of 33 fails**, with exactly the predicted asymmetry: `afterAllScenarios: 1` beside `beforeAllScenarios: 0` — teardown run against a setup that structurally cannot have happened |
| **VI** | Catch-and-degrade bypassed with the **committed** `@undeclared-on-purpose` Scenario in place | `(0 test)` / `Tests no tests` — the whole-file collapse D-08 exists to prevent, now provable from committed source rather than a temporary edit |
| **VII** | `describeFeature.ts`'s `onEmitted` guard neutered, simulating a regression to the stale return value | **1 of 42 fails**, and only that one: *"printed exactly one D-10 notice…"* → `expected [] to have a length of 1 but got +0`. Confirms the new assertion is what guards the fix, and that nothing else in the repo does |

## Verification

| Gate | Result |
|---|---|
| `pnpm exec vitest run packages/vitest/test/emission.test.ts` | exit 0 — **39 passed, 3 skipped (42)** |
| `pnpm exec vitest run packages/vitest/test/emission.test.ts --allowOnly=false` | exit 0 — criterion 3 verified deterministically |
| `pnpm test` | 31 files, **732 passed + 3 skipped (735)**, exit 0 |
| `pnpm build` | exit 0 |
| `pnpm typecheck:test` | exit 0, both projects |
| `pnpm lint` (oxlint + dprint check) | exit 0 |
| `pnpm circular` | no circular dependency found (32 files) |
| `pnpm verify:testapi-seam` | exit 0 — three `✓` lines; `Runner.ts` still imports no framework |
| `pnpm verify:spec` | PASS 7, FAIL 0, SKIP 1 |

### Acceptance greps

| Criterion | Required | Actual |
|---|---|---|
| `grep -c '\.only(' packages/vitest/test/emission.test.ts` | 0 | **0** ✓ |
| `grep -v '^\s*//' vitest.config.ts \| grep -c 'undeclared-on-purpose'` | 0 | **0** ✓ — probe tag still undeclared |
| all four of `@featuretag`, `@ruletag`, `@scenariotag`, `@exampletag` present, plus `@slow` and `@only` | yes | yes ✓ |
| skipped tests reported | ≥ 2 | **3** ✓ |
| non-zero test count | yes | 41 ✓ |

## Titles plan 09-08's CLI gate greps for

**`@only`-tagged** (Feature `Four-level tagging`):
- `an only-tagged Scenario emits a plain tag and no modifier`

**`@skip`-tagged** (3 total, and the file's entire skipped count):
- `a skipped Scenario runs none of its own step bodies` — Feature `Skip runs nothing`
- `a skipped Scenario whose step matches no definition is still just skipped` — Feature `Skip runs nothing`
- `the only Scenario here, and it is skipped` — Feature `Every Scenario in this Feature is skipped`

**`@slow`-tagged:** `a slow-tagged Scenario is a plain pass-through and runs like any other`

**Four-level-tagged Outline row** (carries all four `…tag` entries):
`a four-level-tagged row carrying alpha (value=alpha)` — Feature `Four-level tagging`, Rule `a tagged rule`

**`@wip`-tagged and EXCLUDED** (present in the `.feature` source, absent from any run):
- `the first wip Scenario, which excludeTags removes`
- `the second wip Scenario, which excludeTags removes`

**`@undeclared-on-purpose`** (emitted UNTAGGED after degradation — a `--tagsFilter` run cannot select it):
`a Scenario carrying an undeclared tag still runs`

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 — Bug] Task 1's warning capture had to span COLLECTION, not wrap the call**

- **Found during:** Task 1
- **Issue:** The plan's design (and the file's existing `recordWarnings` idiom) wraps a single
  `describeFeature` call. vitest DEFERS a `describe` factory, so every `it.effect` emission — and
  therefore D-08's `console.warn` — happens after `describeFeature` has returned. A wrapped capture
  records zero lines *always*, and would have passed for the wrong reason permanently.
- **Fix:** One module-scope stub installed for the whole collection phase, removed in a top-level
  `beforeAll`, with `warningsFor(uri)` letting each block read only its own lines. The drift block's
  existing "restored the original console.warn, by reference" assertion is what proves the removal
  happened — it runs after `beforeAll`, so a leaked stub goes red. `recordWarnings`' two module-scope
  calls run earlier in the file and are untouched; `warnCalls`, `countAfterDescribeFeature` and
  `countAfterCollectFeature` all keep meaning exactly what they meant.
- **Files modified:** `packages/vitest/test/emission.test.ts`
- **Committed in:** `82a16ab`

**2. [Rule 1 — Bug] Task 1's stated proof was falsified; the block was given a real assertion**

- **Found during:** Task 1, mutation I
- **Issue:** The plan's Task 1 rests on "a tagged Feature that COLLECTS AT ALL is itself proof the
  validator accepted those tag strings", and its acceptance criterion predicts that an undeclared tag
  "collapses the file to zero tests". Both were true before plan 09-05 and are false after it: the
  catch-and-degrade re-emits the Scenario untagged and the file stays green.
- **Fix:** The block asserts `warningsFor(...)` is empty instead. Mutation III confirms the new
  assertion fails — and *only* it fails — under an undeclared tag, and mutation II recovers the plan's
  predicted collapse by additionally bypassing the degradation. The block's doc comment states the
  falsified reading explicitly, since it is the one a reader will reach for.
- **Files modified:** `packages/vitest/test/emission.test.ts`
- **Committed in:** `82a16ab`

**3. [Rule 2 — Say only what is true] Three file-header claims went stale**

- **Found during:** Tasks 1 and 2
- **Issue:** AGENTS.md §4. The header called 08-07's block "the FOURTH **and last** real
  `describeFeature` call in this file" (twice, in a doc comment and an inline comment), and stated
  "The **one** deviation from happy-path is the unused pattern in the drift block".
- **Fix:** Both "last" claims now read "the last of the pre-Phase-9 ones", the parenthetical call
  inventory names the six new ones, the happy-path rule names **both** deviations with the chain that
  makes the unmatched-step one safe, and a new header section records the deferral fact and why the
  tag blocks are appended last.
- **Files modified:** `packages/vitest/test/emission.test.ts`
- **Committed in:** `82a16ab`, `f619271`

**4. [Rule 3 — Blocking] `pnpm install` to populate the worktree's missing `node_modules`**

- **Found during:** Startup
- **Issue:** This parallel executor runs in a fresh worktree with no installed dependencies — the same
  condition plans 09-04 and 09-05 record.
- **Fix:** `pnpm install --frozen-lockfile`. **No package added, removed, or resolved to a new
  version**, so Rule 3's package-legitimacy exclusion does not apply: nothing was installed that
  `pnpm-lock.yaml` did not already pin. `git status` clean of any manifest or lockfile change.
- **Files modified:** none tracked

**5. [Rule 3 — Blocking] Worktree base was far behind the plan's stated base commit**

- **Found during:** Startup, before Task 1
- **Issue:** The worktree spawned at `f640f4a` ("docs(01): capture phase context") — an ancestor of the
  required base `67d96b7` by the whole project history. Executing from there would have built against
  a tree with no `packages/*` at all.
- **Fix:** `git reset --hard 67d96b7`, per the spawn instructions' base-correction step, after the HEAD
  assertion confirmed the branch was `worktree-agent-a1a02ac08aba13b3e` and not a protected ref. The
  working tree was clean, so nothing was discarded.
- **Files modified:** none

### Escalated, then fixed under direction

**6. [Rule 4 — Architectural, ESCALATED and RESOLVED] D-10's exclusion notice never printed**

- **Found during:** Task 1 (the deferral), confirmed against D-10 during Task 3
- **Issue:** See *The defect this plan found* above. `describeFeature` read `emitFeature`'s return
  value before vitest had run the `describe` factory that populates it, so the count was always `0`
  and the notice never printed.
- **Escalation:** Raised as a checkpoint rather than auto-fixed, because the fix changes
  `emitFeature`'s outcome-reporting contract — 33 call sites and a design 09-04 documented at length
  in `Runner.ts` notes (e)/(g) and on `EmitOutcome`. Three options (A: required callback, drop the
  return; B: optional callback, keep the return; C: re-derive the count in `describeFeature`) were
  written up with costs.
- **Decision:** The coordinator chose **Option B** — optional `onEmitted`, return value retained, no
  `Runner.ts`/`Runner.test.ts` call-site churn, with the "two ways to get the same outcome" trade-off
  accepted as an intentional cost and documented rather than treated as an oversight.
- **Fix:** Implemented as decided. `Runner.ts` gained the optional parameter, the in-walk invocation
  and note (h); `describeFeature.ts` moved the notice onto the callback and discards the return value;
  `emission.test.ts` gained the notice assertion. Mutation VII proves the assertion guards it.
- **Files modified:** `packages/vitest/src/Runner.ts`, `packages/vitest/src/describeFeature.ts`,
  `packages/vitest/test/emission.test.ts`
- **Committed in:** `a674068`

**7. [Rule 2 — Say only what is true] `spec/traceability.md` §4's `emission.test.ts` row**

- **Found during:** the D-10 fix
- **Issue:** AGENTS.md §1. The row described the file's Phase 6–8 coverage only, and gained none of
  RUN-05's runtime half. Note that §1's behavior-doc-02 row needed **no** change: it already claimed
  `describeFeature.ts` PRINTS the `ExcludedScenariosNotice` once per Feature whose filter removed
  Scenarios — a claim that was FALSE when 09-05 wrote it and is TRUE now. The code caught up to the
  spec rather than the reverse.
- **Fix:** The §4 row gains BEH-EC-008 and a sentence naming the five new runtime claims, including
  that the D-10 assertion is the only thing in the repo that fails on a regression to the synchronous
  return value. `npx dprint fmt` re-padded the table.
- **Files modified:** `spec/traceability.md`
- **Verification:** `pnpm verify:spec` — PASS 7, FAIL 0
- **Committed in:** `a674068`

## Findings for the phase owner

**1. The `UndeclaredTagWarning` over-reports which tags are undeclared.**
`Errors.ts` documents `tags` as *"The OFFENDING tags — those `strictTags` did not recognise — … not the
Scenario's whole tag list"*. `describeFeature.ts` passes `options.tags`, the whole list. Observed
verbatim during mutation I:

> `… carries 2 tag(s) this project's vitest config does not declare: "@featuretag", "@mutation-undeclared-tag"`

`@featuretag` **is** declared. A developer following this message would try to declare a tag that is
already declared. The adapter cannot compute the offending subset without reading the framework's
message, which 09-05 forbids on purpose — so the honest fix is to change the field's documented
meaning and the message wording ("carries tags this project's vitest config does not fully declare"),
not the data. Touches `Errors.ts` and `Errors.test.ts`'s exact-`message.length` assertion, so it is
out of this plan's file set. Sidestepped here by giving the D-08 probe Scenario exactly one tag.

**2. vitest intercepts `console` output by default.** A warning that *is* printed appears nowhere in
the reporter without `--disableConsoleIntercept`. This cost real time during this plan and is now
recorded in the source beside the capture helper.

## Threat Model Coverage

| Threat ID | Disposition | Status |
|---|---|---|
| T-09-06-01 | mitigate | **Done.** The D-08 assertion matches `JSON.stringify("@undeclared-on-purpose")`, the quoted uri and the quoted Scenario title. A message interpolating any of them bare fails these and would pass a `toContain(value)` check. |
| T-09-06-02 | mitigate | **Done, and it required a source fix.** Absence is asserted by TITLE (whole-array comparison against the single surviving name), never by a total count. Exactly one notice line is asserted, naming the count `2`, the `excludeTags` option, the quoted tag and Feature name, and the `never registered` sentence. The notice did not print at all before this plan; mutation VII confirms this assertion is the only guard on the fix. **Supersedes 09-05's T-09-05-02 "Done" row**, which was correct about the code as written and wrong about what a real run produced. |
| T-09-06-03 | mitigate | **Done.** Every gate asserts a non-zero test count, and mutations II and VI both show that `Tests no tests` is precisely what an undeclared tag produces once the degradation is removed. |
| T-09-06-04 | mitigate | **Done.** `grep -c '\.only('` is **0**, and the file passes under `--allowOnly=false` as a committed acceptance command. |
| T-09-06-05 | mitigate | **Done.** `grep -v '^\s*//' vitest.config.ts \| grep -c 'undeclared-on-purpose'` is **0**. Both `vitest.config.ts` note (d) and the new block's own comment state that declaring it deletes the test's meaning while leaving it green. |
| T-09-06-SC | accept | **Done.** No package added, removed or version-changed. `pnpm install --frozen-lockfile` restored the existing lockfile only; `tinyglobby` belongs to plan 09-07 and was not touched. |

## Known Stubs

None. The one gap this plan opened — D-10's unasserted notice — was closed by the coordinator-directed
fix rather than carried forward. `Runner.ts`'s retained `EmitOutcome` return value is **not** a stub: it
is a working, correct API for a synchronous `TestApi`, kept by decision, with its one unsafe usage
documented at every site a caller can reach it from.

## Requirements

**RUN-05 is COMPLETE.** All six of this plan's `must_haves` truths are now observed end to end against
the real framework, which is the bar plans 09-03, 09-04 and 09-05 each deferred to this one:

- ✅ A tagged Feature collects and runs through the real `describeFeature`
- ✅ A `@skip` Scenario's `Before`/`After`/`BeforeStep`/`AfterStep` never run
- ✅ A `@skip` Scenario's step bodies never run
- ✅ A `@skip` Scenario with an unmatched step does not fail the run
- ✅ An undeclared tag still runs and prints one warning naming file, Scenario and tag
- ✅ A run whose `excludeTags` removed Scenarios prints one summary line saying how many and why

Nothing here claims something the repo cannot back (AGENTS.md §4): every one of the six has a committed
assertion in `emission.test.ts` driven by a real `describeFeature` call, and five of the six have a
recorded mutation showing the assertion fails when the behaviour is removed.

**Still owed by the phase's closing plan** (unchanged by this plan): `spec/behaviors/02`'s BEH-EC-008
MUST-level text and ADR-EC-020's Decision section still FORBID the `describeFeature`-time registration
filter that 09-05 shipped, and `.planning/REQUIREMENTS.md`'s RUN-05 wording and `spec/roadmap.md` are
untouched. Only `spec/traceability.md` was reconciled here and in 09-05.

## Threat Flags

None. This plan opens no network endpoint, no auth path, no file-access pattern and no schema at a
trust boundary. The one new surface is an optional in-process callback parameter, and the only thing
crossing it is a `{ excludedScenarioCount: number }` struct built inside the same module.

## Self-Check: PASSED

All four modified files exist on disk:

- `packages/vitest/test/emission.test.ts` — FOUND
- `packages/vitest/src/Runner.ts` — FOUND
- `packages/vitest/src/describeFeature.ts` — FOUND
- `spec/traceability.md` — FOUND

All four commits present in `git log`:

- `82a16ab` — FOUND
- `f619271` — FOUND
- `66bcfaa` — FOUND
- `a674068` — FOUND

Working tree clean of every mutation: `Tags.ts`, `Runner.ts` and `describeFeature.ts` were each
restored from a byte copy taken before mutating and confirmed by `git status`/`git diff --stat`; both
throwaway probe files (`zz-tagprobe.test.ts`, `zz-defer-probe.test.ts`) and every temporary `DBG_`
print were removed, and `grep` finds no marker string remaining. STATE.md and ROADMAP.md deliberately
untouched — this executor ran in a worktree and the orchestrator owns those writes after the wave.
