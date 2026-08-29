---
phase: 09-tags
plan: 08
subsystem: testing
tags: [tags, cli-gate, mutation-testing, vitest, tagsFilter, excludeTags, skip, reporter, ci, structural-gate]

# Dependency graph
requires:
  - phase: 09-tags
    provides: "09-06's six real describeFeature calls in packages/vitest/test/emission.test.ts, and the four Scenario titles this gate names — the @only-tagged one, a @skip-tagged one, an untagged one, and the first excludeTags-removed @wip one"
  - phase: 09-tags
    provides: "09-01's vitest.config.ts tag universe, which declares @only — a --tagsFilter pattern must itself be declared regardless of the strict-tags setting (RESEARCH Finding 2)"
  - phase: 01
    provides: "scripts/verify-no-runner-dep.sh's gate-script conventions: METHOD NOTE, fail(), preconditions that fail on an absent target, a positive control per assertion, one ✓ line per passing assertion"
provides:
  - "scripts/verify-tags-filter.sh — eight assertions over two scoped vitest runs, proving from OUTSIDE the process that a CLI tag filter selects the tagged Scenario, that a @skip Scenario is REPORTED skipped, and that an excludeTags exclusion is ABSENT rather than skipped"
  - "package.json — the verify:tags-filter script"
  - ".github/workflows/check.yml — the gate runs on every PR, in the test job, after pnpm test, on the Node 24 matrix leg"
  - "the measured fact that the repo's in-process tag coverage stops at the TestApi seam and the undeclared-tag validator, leaving describeFeature.ts's vitestTestApi adapter unwatched — a one-tag drop there keeps all 741 tests green"
  - "the measured fact that a containment grep is not sufficient as this gate's own positive control, because ABSENT is assertion 4's EXPECTED value"
affects:
  - "the phase's closing plan (RUN-05's CLI-observable half is now gated; spec reconciliation for BEH-EC-008/ADR-EC-020 is still owed by that plan, unchanged by this one)"

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Asserting on a runner's MACHINE-READABLE report parsed with node -e, never on reporter glyphs, because glyph output varies with TTY, colour and reporter settings while the structured result does not"
    - "Anchoring a gate's title preconditions on the WHOLE title (prefix adjacency plus end-of-line) rather than containment, when one of the gate's assertions expects ABSENCE — a containment grep lets a suffix rename pass the whole gate green"
    - "Ordering a gate's broad 'nothing failed' assertion LAST, so its six narrow, subject-specific assertions get to report first and a reader is told 'the tag never reached the task' rather than 'a test failed'"
    - "Pairing absent-from-the-report against present-and-skipped as a matched assertion pair, so two filtering mechanisms are provably distinguishable and neither can masquerade as the other"
    - "Recording the mutation whose predicted outcome was FALSIFIED alongside the narrower mutation that isolates the claim, and naming in the source which of the two must be used when re-verifying"

key-files:
  created:
    - scripts/verify-tags-filter.sh
  modified:
    - package.json
    - .github/workflows/check.yml

key-decisions:
  - "The plan's mutation 1 (empty tag array in Runner.ts) was run and FALSIFIED its own predicted asymmetry — it fails 5 tests across 2 files, so `pnpm test` does not stay green. A narrower mutation at describeFeature.ts's adapter isolates the claim, and the METHOD NOTE now cites that one and explicitly forbids simplifying back to the blunt one"
  - "The METHOD NOTE does NOT claim the suite is blind to tags. Two in-process gates DO watch them — Runner.test.ts at the seam, emission.test.ts via the undeclared-tag warning — and the real, narrower gap is everything between TestApi.effect and the framework's own option object"
  - "The title preconditions match EXACTLY, not by containment, after a suffix rename of the excludeTags-removed Scenario was measured passing the entire gate green"
  - "Run A's zero-failures check became assertion 8 (last) rather than part of assertion 2, so an unrelated in-process regression never preempts the six tag-specific assertions"
  - "--allowOnly=false is passed on the command line rather than left to vitest.config.ts, so assertion 2's only-modifier claim is true of this invocation regardless of config drift; whether the config also pins it is 09-01's gate"
  - "The CI step is gated to the Node 24 matrix leg: the claim is structural and does not vary by Node version, and the gate invokes vitest twice"

patterns-established:
  - "Proving a gate's own positive control is load-bearing by temporarily WEAKENING it and observing the gate go green under a mutation, rather than asserting the control's necessity"
  - "Correcting a plan's stated method claim in the shipped source comment when execution falsifies it, and recording both the falsified and the recovering mutation"

# Requirements
requirements-completed: [RUN-05]
requirements-advanced: []

# Metrics
duration: 15min
completed: 2026-08-30
---

# Phase 9 Plan 08: The CLI-Observable Tag Gate Summary

**A 367-line mutation-tested gate proves from outside the test process that `--tagsFilter '@only'` selects exactly the `@only`-tagged Scenario, that a `@skip` Scenario is REPORTED skipped by the real reporter, and that an `excludeTags` exclusion is ABSENT from the report while a CLI-narrowed Scenario is present-and-skipped — and, in proving it, measured that the plan's own stated asymmetry was wrong in one direction (the suite is not blind to tags) and that the gate's positive control was too weak in the other (a suffix rename passed it green).**

## Performance

| Metric | Value |
|---|---|
| Duration | ~15 min (00:59 → 01:14, 2026-08-30) |
| Tasks | 2 of 2 |
| Files | 1 created, 2 modified |
| Gate assertions | 8 (7 from the plan, plus a deferred zero-failures check) |
| Mutations run | 6 (5 predicted outcomes, 1 falsified, 1 counterfactual) |
| Repo test count | 741 passed + 3 skipped (744), unchanged by this plan |

## Task Commits

1. **Task 1: `scripts/verify-tags-filter.sh`** — `d394874` (test)
2. **Task 2: npm script + CI step** — `1092e54` (chore)

---

## What the gate asserts

Two scoped runs of `packages/vitest/test/emission.test.ts` — never the whole suite — through
`node_modules/.bin/vitest` with `--reporter=json --outputFile=<tmp>`, parsed with `node -e` as
structured data. There is no reporter-glyph matching anywhere in the file (`grep -c '↓'` is **0**).

**Run A** — unfiltered, `--allowOnly=false`:

| # | Assertion | Observed |
|---|---|---|
| 1 | VACUITY: non-zero result count | 42 results |
| 2 | The `@only`-tagged Scenario is `passed` | criterion 3 from outside the process |
| 3 | The `@skip`-tagged Scenario is `skipped` | criterion 2's reporter half |
| 4 | The `excludeTags`-removed Scenario is **ABSENT** | D-03 — not skipped, absent |

**Run B** — the same file with `--tagsFilter='@only'`:

| # | Assertion | Observed |
|---|---|---|
| 5 | VACUITY: at least one test `passed` | 1 passed |
| 6 | The `@only`-tagged Scenario is `passed` | the filter selected it |
| 7 | The untagged Scenario is `skipped` and **PRESENT** | RESEARCH Finding 7 |

**Assertion 8** (deferred to last, see deviation 2): run A reported 0 failed tests.

Assertions 4 and 7 are the matched pair. `excludeTags` is a registration filter — the Scenario is
never handed to the runner, so it leaves no node at all. A CLI filter is a mode narrowing — it sets
non-matching tests to skip and never removes them. Absent versus present-and-skipped is a real,
observable difference, and asserting both is what proves neither mechanism is masquerading as the
other. Each has its own mutation proof below.

## The four Scenario titles the gate depends on

Each is declared as a shell variable at the top of the script with a comment naming the criterion it
carries. All four are plain `Scenario:` lines in `emission.test.ts`'s inline `.feature` sources
(plan 09-06):

| Constant | Title | Carries |
|---|---|---|
| `TITLE_ONLY` | `an only-tagged Scenario emits a plain tag and no modifier` | criteria 3 and 4; the filter target in run B |
| `TITLE_SKIP` | `a skipped Scenario runs none of its own step bodies` | criterion 2's reporter half |
| `TITLE_UNTAGGED` | `an untagged Scenario still inherits the Feature's own tag` | criterion 4's narrowed-to-skip half |
| `TITLE_EXCLUDED` | `the first wip Scenario, which excludeTags removes` | D-03 |

## The CI job it was added to

The **`test`** job in `.github/workflows/check.yml` — the one that runs `pnpm test` — because this
gate invokes the runner and belongs with the other runner work rather than in the `package` job. It
sits **after** `pnpm test`, so an ordinary suite failure is reported before this narrower gate's
output.

The `test` job is a matrix of Node 22 and 24. The step is gated to **Node 24 only**
(`if: matrix.node-version == 24`): the claim is structural — what the runner registers does not vary
by Node version — and the gate itself invokes vitest twice, so running it on both legs would double
its cost to re-prove an identical fact. The reason is written into the step's rationale comment.

No inline command was added anywhere: the step is `pnpm verify:tags-filter`, and
`"verify:tags-filter": "bash scripts/verify-tags-filter.sh"` sits immediately after
`verify:testapi-seam` in the root `package.json`.

### Script cross-check confirmation

Re-confirmed by a `node -e` pass over every `run:` line in the workflow (including the `- if:` /
`run:` two-line form this plan introduced): **16 `run:` lines checked, 0 inline commands.** Every one
is either `pnpm install --frozen-lockfile` — the package manager's own install, not a script — or a
bare `pnpm <script>` whose `<script>` exists in the root `package.json`. So every CI step still runs
identically on a developer's machine.

---

## Mutation proofs

All six run against real source, observed, and reverted. `git status` is clean of every one.

### 1a — the plan's literal mutation, and its FALSIFIED prediction

`Runner.ts`: both `{ tags: scenarioPlan.tags, skip }` emission sites changed to `{ tags: [], skip }`.

The plan predicted "`pnpm test` still exits 0 while assertion 6 fails — the exact asymmetry the
METHOD NOTE claims." **The gate fired as predicted; the asymmetry did not.**

| | Result |
|---|---|
| `bash scripts/verify-tags-filter.sh` | **RED at assertion 5** — `the run filtered on @only reported ZERO passed tests` |
| `pnpm test` | **RED: 5 failed across 2 files** (32 files, 736 passed, 3 skipped) |

Two in-process gates catch it, which is why the prediction was wrong:

- `Runner.test.ts` — `emits a @skip Scenario with skip true, its tags still present…` and
  `puts @only in options.tags and NOWHERE else in the whole recording`. It watches the **TestApi
  seam** against a recording fake, so a tag dropped *before* the seam is visible to it.
- `emission.test.ts` — `printed exactly one warning, naming the file, the Scenario and the tag in
  QUOTED form` → `expected [] to have a length of 1 but got +0`. D-08's warning requires the
  framework's validator to REJECT an undeclared tag; with no tags emitted there is nothing to reject.

A narrower variant (`Runner.ts` filtering out only `@only`) is still caught: `pnpm test` goes to
2 failed, both in `Runner.test.ts`. The seam is genuinely covered.

### 1c — the mutation that isolates the claim

`describeFeature.ts`'s `vitestTestApi` adapter — the composition root's single call into the
framework's own option object:

```ts
it.effect(name, self, { tags: [...options.tags].filter((t) => t !== "@only"), skip: options.skip })
```

| | Result |
|---|---|
| `pnpm test` | **GREEN — 32 files, 741 passed, 3 skipped, exit 0** |
| `bash scripts/verify-tags-filter.sh` | **RED at assertion 5** — the filter selected nothing |

**This is the asymmetry, and it is the one the shipped METHOD NOTE cites.** The tag reaches the seam
(so `Runner.test.ts` is satisfied), reaches the validator (so D-08's warning still prints), and is
then discarded on its way onto the real task — and nothing else in the repo goes red. A test cannot
observe what its own run registered; only a filtering invocation can.

The script's METHOD NOTE now records both, and states explicitly: *"Do not 'simplify' 1c back into 1a
when re-verifying."*

### 2 — a renamed Scenario fails the precondition BY NAME

`emission.test.ts`: `Scenario: an only-tagged Scenario emits a plain tag and no modifier` →
`… no modifier RENAMED`.

```
✗ tag filter gate: NOT ENFORCED

  no Scenario in packages/vitest/test/emission.test.ts is titled exactly:
  "an only-tagged Scenario emits a plain tag and no modifier". …
```

Fails **before any run**, at the precondition, naming the missing title.

### 2b — the counterfactual that made the precondition load-bearing

**Found by running mutation 2 against the first draft of the script**, which used
`grep -qF -- "$title"`. That containment grep matched the renamed line, the precondition passed, and
assertion 2 then failed with `"ABSENT"`. Loud, but the wrong message — and for
`TITLE_EXCLUDED`, **ABSENT is assertion 4's EXPECTED value**.

So the dangerous case was measured directly: suffix-rename `the first wip Scenario, which excludeTags
removes`, and temporarily weaken the precondition back to a containment grep.

| Precondition | Result under the suffix rename |
|---|---|
| `grep -qF -- "$title"` (containment) | **ALL 8 ASSERTIONS GREEN — `tag filter gate: ENFORCED`**, with assertion 4 observing a Scenario that no longer exists |
| `title_is_declared` (exact) | **RED at the precondition**, naming the title |

The fix is `title_is_declared`: a line must END with `Scenario: <title>` after trailing whitespace is
trimmed. Prepending to a title breaks the `Scenario: ` adjacency; appending breaks the end-of-line
match. Both directions now fail by name. Recorded in the script's own comment, including the
measurement.

### 3 — `isSkipped` forced false fails assertion 3

`Tags.ts`: `tags.includes(skipTag)` → `tags.includes(skipTag) && false`.

```
✗ the @skip-tagged Scenario is "passed" in the unfiltered run, expected "skipped".
```

Run A's vacuity control also moved from 42 to **43** results, the three previously-skipped tests
having become runnable.

### 4 — the registration `continue` removed fails assertion 4

`Runner.ts`: the `continue` inside `if (!shouldEmit(tagFilter, scenarioPlan.tags))` deleted, leaving
the counter increment as a no-op branch.

```
✗ the excludeTags-removed Scenario appears in the report with status "passed",
  expected it to be ABSENT.
```

Run A's vacuity control moved from 42 to **44** results — both excluded `@wip` Scenarios registered
and ran. This is the assertion that separates a registration filter from every other mechanism.

### A note on assertion 7

Assertion 7 has no source mutation of its own, and this is a real limit rather than an oversight:
"a CLI filter narrows to skip and never removes" is a property of **vitest**, not of this library, so
no edit to `packages/vitest/src` can flip it. It is guarded instead by assertion 5, which runs first
against the same report — under mutation 1c, where the filter matches nothing and every test in run B
is skipped, assertion 7 would still pass and assertion 5 is what fires. Its ABSENT branch is reported
with its own distinct message, so a runner that started deleting non-matching tests would be named
rather than merely counted.

## Verification

| Gate | Result |
|---|---|
| `bash scripts/verify-tags-filter.sh` | exit 0 — 9 `✓` lines (1 precondition + 8 assertions) |
| `pnpm verify:tags-filter` | exit 0 — identical output through the npm script |
| `pnpm test` | 32 files, **741 passed + 3 skipped (744)**, exit 0 — unaffected |
| `pnpm lint` (oxlint + dprint check) | exit 0 |
| `pnpm verify:spec` | PASS 7, FAIL 0, SKIP 1 |
| `pnpm verify:testapi-seam` | exit 0 — three `✓` lines |

### Acceptance criteria

| Criterion | Required | Actual |
|---|---|---|
| `node -e "…scripts['verify:tags-filter'] === 'bash scripts/verify-tags-filter.sh'…"` | exit 0 | **0** ✓ |
| `grep -c 'pnpm verify:tags-filter' .github/workflows/check.yml` | 1 | **1** ✓ |
| that step sits after `pnpm test` in the same job | yes | line 97 vs line 79, both in `test` ✓ |
| `grep -c '↓' scripts/verify-tags-filter.sh` | 0 | **0** ✓ |
| runs scoped to `packages/vitest/test/emission.test.ts`, not the whole suite | yes | one `TEST_FILE`, passed to both runs ✓ |
| `scripts/verify-tags-filter.sh` min_lines 70 | ≥ 70 | **367** ✓ |
| every workflow `run:` line is a root `package.json` script | yes | 16 checked, 0 inline ✓ |

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 — Bug] The precondition was a containment grep, and could be passed vacuously**

- **Found during:** Task 1, running mutation 2
- **Issue:** `grep -qF -- "$title" "$TEST_FILE"` matches a renamed title that still CONTAINS the old
  one. For `TITLE_EXCLUDED` that is not merely a worse error message — ABSENT is what assertion 4
  expects, so a suffix rename made the whole gate pass green while assertion 4 observed a Scenario
  that had ceased to exist. Measured directly (mutation 2b above): all 8 assertions green,
  `tag filter gate: ENFORCED`.
- **Fix:** `title_is_declared`, which requires some line to END with `Scenario: <title>`. Both rename
  directions now fail at the precondition by name.
- **Files modified:** `scripts/verify-tags-filter.sh`
- **Commit:** `d394874`

**2. [Rule 2 — Correctness] Run A's zero-failures check moved to assertion 8, last**

- **Found during:** Task 1, running mutation 1a
- **Issue:** The plan folds "a real only-modifier would fail here" into assertion 2. Implemented as a
  zero-failures check inside assertion 2, it fired under mutation 1a *before* the six tag-specific
  assertions could speak — reporting "1 test failed" when the useful answer was "the filter selected
  nothing". It is the one check in the file that any in-process regression can trip.
- **Fix:** Split out as assertion 8, placed after all seven, with a comment recording the measurement
  and why the ordering is load-bearing. Assertion 2 keeps the `passed`-status claim; assertion 8
  keeps the run-wide one.
- **Files modified:** `scripts/verify-tags-filter.sh`
- **Commit:** `d394874`

**3. [Rule 2 — Say only what is true] The METHOD NOTE's stated asymmetry was false as drafted**

- **Found during:** Task 1, mutation 1a
- **Issue:** AGENTS.md §4. The plan's wording — and the first draft of the METHOD NOTE — claims
  "the library could drop every tag and every in-process assertion would still be green". Measured
  false: `Runner.test.ts`'s two D-05/D-06 assertions watch the seam, and `emission.test.ts`'s D-08
  assertion needs a tag to reach the validator. Dropping every tag fails 5 tests across 2 files.
- **Fix:** The METHOD NOTE now names both in-process gates, states the narrower real gap
  (`TestApi.effect` → the framework's option object, i.e. `describeFeature.ts`'s `vitestTestApi`),
  cites mutation 1c's measured numbers, and explicitly instructs a future reader not to simplify 1c
  back into 1a. A gate whose stated rationale is false invites weakening.
- **Files modified:** `scripts/verify-tags-filter.sh`
- **Commit:** `d394874`

**4. [Rule 3 — Blocking] `pnpm install` to populate the worktree's missing `node_modules`**

- **Found during:** Startup
- **Issue:** This parallel executor runs in a fresh worktree with no installed dependencies — the
  same condition plans 09-04, 09-05 and 09-06 record. This gate cannot invoke the runner without it.
- **Fix:** `pnpm install --frozen-lockfile`. **No package added, removed, or resolved to a new
  version**, so Rule 3's package-legitimacy exclusion does not apply: nothing was installed that
  `pnpm-lock.yaml` did not already pin. `git status` clean of any manifest or lockfile change.
- **Files modified:** none tracked

**5. [Rule 3 — Blocking] Worktree base was the whole project history behind the plan's stated base**

- **Found during:** Startup, before Task 1
- **Issue:** The worktree spawned at `f640f4a` ("docs(01): capture phase context"), an ancestor of
  the required base `dc1a63d` by the entire project history — no `packages/*` at all.
- **Fix:** `git reset --hard dc1a63d`, per the spawn instructions' base-correction step, after the
  HEAD assertion confirmed the branch was `worktree-agent-ac8743ea6e618b40d` and not a protected ref.
  The working tree was clean, so nothing was discarded.
- **Files modified:** none

### Additions beyond the plan's literal text

**6. `--allowOnly=false` passed on the command line**

The plan says assertion 2 relies on "the CI-mode only-policy this repo's config sets". Passing the
flag explicitly makes assertion 2's claim true of *this invocation* regardless of config drift, and
whether `vitest.config.ts` also pins it is plan 09-01's gate rather than this one's. Recorded in the
`run_vitest` comment.

**7. `AMBIGUOUS` as a distinct query answer**

`report_query`'s `status` mode returns `AMBIGUOUS` when two results share a title, rather than
silently taking the first match. Two identically-titled nodes would make a status assertion mean
something other than what it reads — the same hazard `Runner.ts` note (c) records for reporter output.

## Findings for the phase owner

**1. The in-process tag coverage stops one layer short of the framework, and now has a named gate.**
`Runner.test.ts` covers `Runner.ts` → `TestApi.effect`. `emission.test.ts` covers a tag reaching the
validator. Nothing in-process covers `describeFeature.ts`'s `vitestTestApi` adapter — the six lines
that build the framework's actual option object — and mutation 1c shows a one-tag drop there costs
nothing in a full suite run. `scripts/verify-tags-filter.sh` is currently the only thing in the repo
that observes it. Worth knowing before anyone edits that adapter.

**2. The JSON reporter exposes `tags` per test result directly.** Each `assertionResults` entry
carries a `tags` array (e.g. `["@featuretag","@only"]`), so a future gate could assert the emitted
tag set verbatim rather than inferring it from a filter's selection. Deliberately NOT used here: the
plan's claim is about what a *filter* does, and reading the reported tag array would prove the tag
was recorded without proving the runner's own filtering acts on it. Recorded because it is the
obvious "simplification" someone will reach for.

## Threat Model Coverage

| Threat ID | Disposition | Status |
|---|---|---|
| T-09-08-01 | mitigate | **Done, with a corrected claim.** The METHOD NOTE names the asymmetry and mutation 1c demonstrates it: 741 tests green, this gate the only thing red. The plan's own version of the claim was too broad and is recorded as falsified (mutation 1a) rather than repeated. |
| T-09-08-02 | mitigate | **Done, and it required strengthening the precondition.** All four titles are matched EXACTLY, and each run carries a non-zero vacuity control (42 results in run A, 1 passed in run B). Mutation 2 shows the precondition fires; mutation 2b shows the originally-drafted containment grep did NOT, passing the entire gate green under a suffix rename. |
| T-09-08-03 | mitigate | **Done.** The report is parsed with `node -e` as structured JSON; `grep -c '↓' scripts/verify-tags-filter.sh` is **0**, and there is no glyph matching of any kind in the file. |
| T-09-08-04 | mitigate | **Done.** Run A passes `--allowOnly=false` on the command line, assertion 2 requires the `@only`-tagged Scenario to be `passed`, and assertion 8 requires the run to report zero failures. |
| T-09-08-05 | mitigate | **Done.** Assertions 4 and 7 are a matched pair — ABSENT versus present-and-skipped — with mutation 4 proving assertion 4 (the excluded Scenario appears as `passed`, result count 42 → 44). Assertion 7's limit is recorded above: no source mutation can flip a property of the runner itself, so it is guarded by assertion 5 running first against the same report. |
| T-09-08-SC | accept | **Done.** No package added, removed or version-changed. `pnpm install --frozen-lockfile` restored the existing lockfile only; `tinyglobby` belongs to plan 09-07 and was not touched. |

## Known Stubs

None. Every assertion in the gate observes a real run of real source, and every one except assertion
7 has a recorded mutation showing it fails when the behaviour is removed. Assertion 7's absence of a
mutation is a documented property of what it asserts, not deferred work.

## Requirements

**RUN-05's CLI-observable half is now gated.** 09-06 completed RUN-05's in-process runtime acceptance;
this plan adds the three claims no in-process test can make, and puts them on every PR:

- ✅ A CLI tag filter selects exactly the Scenarios carrying that tag and skips the rest
- ✅ A Scenario removed by `excludeTags` is absent from the report, while one narrowed out by a CLI
  filter is reported skipped — the two mechanisms are distinguishable in output
- ✅ A `@skip` Scenario is reported skipped by the real reporter, not merely un-executed
- ✅ The gate fails loudly if the Scenario titles it depends on are renamed

Nothing here claims something the repo cannot back (AGENTS.md §4): each of the four has a committed
assertion in `scripts/verify-tags-filter.sh`, and the one plan claim that execution falsified is
recorded as falsified in both this summary and the shipped source comment rather than restated.

**Still owed by the phase's closing plan** (unchanged by this plan): `spec/behaviors/02`'s BEH-EC-008
MUST-level text and ADR-EC-020's Decision section still FORBID the `describeFeature`-time registration
filter that 09-05 shipped, and `.planning/REQUIREMENTS.md`'s RUN-05 wording and `spec/roadmap.md` are
untouched. `spec/` was not modified by this plan — it adds a gate over already-specified behavior and
introduces no new public contract, and `pnpm verify:spec` is PASS 7 / FAIL 0 unchanged.

## Threat Flags

None. This plan opens no network endpoint, no auth path and no schema at a trust boundary. It adds
one shell script that reads two files it already had access to, invokes the repo-local runner twice,
and writes two JSON reports into a `mktemp -d` directory removed by an `EXIT` trap.

## Self-Check: PASSED

All three files exist on disk:

- `scripts/verify-tags-filter.sh` — FOUND (367 lines)
- `package.json` — FOUND (carries `verify:tags-filter`)
- `.github/workflows/check.yml` — FOUND (carries the `pnpm verify:tags-filter` step)

Both commits present in `git log`:

- `d394874` — FOUND
- `1092e54` — FOUND

Working tree clean of every mutation: `Runner.ts`, `Tags.ts`, `describeFeature.ts` and
`emission.test.ts` were each restored from a byte copy taken before mutating, and the temporarily
weakened copy of the gate script was restored the same way; `git status` and `git diff --stat` were
both empty before the Task 1 commit. STATE.md and ROADMAP.md deliberately untouched — this executor
ran in a worktree and the orchestrator owns those writes after the wave.
