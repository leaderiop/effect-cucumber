---
phase: 11-composition-root-and-dogfooded-acceptance-suite
plan: "08"
subsystem: gates-and-process
tags: [checklist, gates, watch-mode, packaging, tag-filter, mutation-testing, ci, rc-bump]
status: complete

requires:
  - "11-07's spec/process/looks-done-but-isnt-checklist.md — the P-01..P-24 table and its Executed by column"
  - "11-07's pitfalls-checklist.test.ts — the thirteen in-process items and the anchoring warning it measured"
  - "scripts/verify-tags-filter.sh — the runner-driving gate idiom: repo-local binary, JSON report read as data, per-run vacuity control, exact-title precondition"
  - "scripts/verify-pack.sh — the packed-tarball reading this plan reuses the command of but not the assertions of"
  - "packages/vitest/test/tsgo-gate/ — the step-expect-error and step-satisfied fixtures P-08 and P-09 compile"
provides:
  - "scripts/verify-watch-rerun.sh — P-14 as a real watch-mode gate, the one gate in the repo that mutates a file, and it mutates a copy"
  - "scripts/verify-pitfalls-checklist.sh — the ten CLI items plus the coverage cross-check that makes 'runs in full' a counted claim"
  - "spec/process/rc-bump-checklist.md — P-18's own subject, and step 6 is P-15's full release-time form"
  - "two new CI steps in the test job, both Node-24-guarded, both root package.json scripts"
  - "a measured finding: the committed acceptance pairs do NOT rerun on a .feature edit; only the ?raw form does"
  - "a measured finding: P-24's claim is false today — no step text, no .feature:line in vitest's Failed Tests panel"
affects:
  - "spec/process/looks-done-but-isnt-checklist.md — three rows gained Notes (P-18, P-21, P-24), the executor column is now machine-read, and a new section defines the ANCHORED form"
  - "spec/README.md — a Process row for the rc-bump checklist"
  - "scripts/verify-watch-rerun.sh — amended in Task 2 to carry the anchored P-14 success line the cross-check reads"

tech-stack:
  added: []
  patterns:
    - "A gate that must mutate a file mutates a COPY inside the repository at a path the default include glob already reaches, deleted by a trap installed BEFORE the first write — never a committed fixture, and never a config-glob change to make an out-of-tree copy discoverable"
    - "A completeness cross-check anchors on the EXECUTING form (a test title followed by a word; an assertion's own echo line at the start of a line), never on the bare id and never even on the quoted id — a file that documents its own anchor satisfies a grep for that anchor"
    - "A node program that has to talk about backticks, apostrophes and pipes is written to a temp FILE, not passed to `node -e` inside a command substitution: two rounds of quote-dodging produced a program that parsed and a comment that no longer said what it meant"
    - "Where a checklist item's claim turns out to be FALSE, the item keeps its wording, gains a Note recording the measurement in both directions, and executes a REDUCED form that is still a real regression guard — never a rewording to match what was convenient to assert"
    - "A mutation record is corrected by the mutation, not written from the plan: two of this plan's four recorded expectations were wrong and the corrections are the useful entries"

key-files:
  created:
    - scripts/verify-watch-rerun.sh
    - scripts/verify-pitfalls-checklist.sh
    - spec/process/rc-bump-checklist.md
  modified:
    - package.json
    - .github/workflows/check.yml
    - spec/process/looks-done-but-isnt-checklist.md
    - spec/README.md

decisions:
  - "The watch gate drives the `?raw` import form, not the path-based `loadFeature` form the committed acceptance pairs use. Measured both ways: ?raw reruns in ~620ms, the path form does not rerun at all inside a 60s poll. Pitfall 3 predicted exactly this and the gate proves the form that works rather than pretending the suite reruns."
  - "P-24's item is FALSE today and the row now says so at length. A deliberately failing step gives vitest's `Failed Tests` panel a Scenario title, an assertion message and seven frames of effect internals — no step text, no `.feature`, no line number. The executed form is reduced to 'the attributed step frame reaches the reader at all', which is a real guard on ADR-EC-005's span."
  - "The anchored form needed a TRAILING ASCII LETTER, not just an opening quote. Plan 11-07's warning said anchor on the quoted id; measured here, that form STILL returns 2 in the in-process file, because 11-07's own header quotes it while explaining the hazard. The sixth instance of count-your-own-prose, and the first caught by the gate being written rather than after."
  - "P-12's two nodes are Gherkin `Scenario:` titles inside an inline Feature source, not arguments to a test call, so the anchor has two accepted prefixes rather than one."
  - "P-13 and P-21 run against a temp acceptance pair the gate writes, because no committed acceptance Feature carries an `@only` Scenario or a three-row Outline. Adding two committed pairs for two items would enlarge a suite whose size is asserted elsewhere."
  - "P-22 keeps its own invocation separate from P-13's and P-21's (ASSUMPTION-11-A), and the separation earned its cost: mutation G shows the two halves of P-22 are not interchangeable."

metrics:
  duration: ~2h
  completed: 2026-08-30

actuals:
  tokens: 21747
  tasks: 3
  commits: 3
---

# Phase 11 Plan 08: The CLI Half of the Checklist, and the Count That Makes It Complete Summary

Roadmap success criterion 4 says the 24-item checklist "runs in full and passes". As of this plan it
**literally does, and the completeness is counted rather than claimed**: thirteen in-process tests
(11-07), ten CLI assertions and one watch gate (this plan), with a cross-check that reads the
document's own table and proves each id's named executor really carries it. Two of the twenty-four
items turned out to be about things the library does not do yet, and both say so in writing rather
than being quietly narrowed.

## What was built

**`scripts/verify-watch-rerun.sh`** — P-14. Starts the repo-local runner in WATCH mode over a copy of
the smallest committed acceptance Scenario, appends a new Scenario to the copy's `.feature`, and
asserts a rerun picks it up: present **and** passing, with run 2's total strictly greater than run
1's. Four assertions, two of which are vacuity controls. It is the only gate in this repository that
mutates a file, and it mutates a copy inside the acceptance directory under a trap installed before
the first write — `git status --porcelain` was measured empty on the success path and on two distinct
failure paths.

**`scripts/verify-pitfalls-checklist.sh`** — 1038 lines executing P-08, P-09, P-13, P-15, P-16, P-17,
P-18, P-21, P-22 and P-24, each assertion echoing its own id, followed by the coverage cross-check.
Four runner invocations, two `pnpm pack`s, four type-checks, three READMEs and one document parse.

**`spec/process/rc-bump-checklist.md`** — seven steps. The acceptance suite is the gate and not `tsc`;
only `pnpm-workspace.yaml` is edited; the two catalogs mean different things and are not the same
edit; `pnpm verify:pack` is re-run because a `catalog:` specifier expands verbatim at pack time; the
peer ranges are checked by hand because nothing enforces they stay in sync with `@effect/vitest`'s
own; step 6 is P-15's full two-package-manager scratch-consumer install with the exact commands and
the expected single-version result; step 7 is the prose version floor nothing asserts.

**Two CI steps**, both in the `test` job, both after `pnpm test` and after the two existing
runner-driving gates, both `if: matrix.node-version == 24` with the reasoning the existing two use.
A mechanical cross-check confirms all 21 `run:` steps in the workflow are root `package.json`
scripts.

## The two items whose claims are false, measured rather than suspected

**P-14 is true only for a form the acceptance suite does not use.** Measured both ways against this
repository:

| Load form                                               | Edit the `.feature` under a watching runner |
| ------------------------------------------------------- | --------------------------------------------- |
| `import source from "./x.feature?raw"` + `parseFeature` | rerun carrying the new Scenario in **622 ms** |
| `loadFeature(path)` + `NodeFileSystem.layer`            | **no rerun at all** inside a 60-second poll |

The second row is what every committed pair under `packages/vitest/test/acceptance/` does. Pitfall 3
predicted it — `fs` reads are invisible to Vite's module graph, and vitest invalidates by module
graph — and this is the reproduction. The gate drives the `?raw` form, because that is the form
Pitfall 3 names as the fix and the form a consumer must be told about; the METHOD NOTE records the
gap rather than hiding it behind a green line. The two alternatives were rejected with reasons, not
by preference: `forceRerunTriggers` is silently disabled by any dot-prefixed path segment, and this
repository's own parallel-execution worktrees live under one, so it would do nothing exactly where a
gate most needs to be trustworthy; `watchTriggerPatterns` is root-config-only and would mean editing
the committed `vitest.config.ts` to make a gate pass.

**P-24's claim is false today.** A deliberately failing step produces:

- the `Failed Tests` panel: the Scenario title, `AssertionError: expected 3 to equal 99`, the source
  frame in the `.steps.test.ts`, and seven frames of `effect` fiber internals. No step text, no
  `.feature`, no line number.
- the **stdout block**: `at the failing probe counter is {int} (…/ScenarioEffect.ts:220)` —
  ADR-EC-005's `Effect.fn(pattern)` span, naming the step PATTERN (not the interpolated text), in
  exactly the place Pitfall 31 says is insufficient.

The row keeps its wording, gains a Note stating both surfaces and naming Pitfall 31's own fix as what
would complete it, and the gate executes the reduced form: the attributed step frame reaches the
reader at all, plus a control that the probe genuinely failed. That reduced form is not decoration —
the day the `Effect.fn(pattern)` wrap stops being applied, the step name vanishes from every failure
in the project and nothing else in the repository notices.

## The anchored form, and the sixth count-your-own-prose

Plan 11-07's parting warning was that the cross-check must anchor on the QUOTED id rather than the
bare one. That warning was necessary and not sufficient. Measured here against the unmutated file:

| Pattern                       | Count | Why                                                                                         |
| ----------------------------- | ----- | ------------------------------------------------------------------------------------------- |
| bare `P-04`                   | 10    | prose, section comments, the header's per-item enumeration                                  |
| the quoted title anchor       | **2** | the real title, **and** 11-07's header quoting this very anchor while explaining the hazard |
| the same, plus an ASCII letter | 1     | the real title alone                                                                        |

So the anchored forms shipped are:

- **a gate script** — `echo`, a quote, the check glyph, the id, a space, an em dash and a space, at
  the **start of a line**. An assertion's own success line; a comment cannot match it.
- **the in-process file** — the id preceded by a string literal's opening quote **or** by a Gherkin
  `Scenario:` keyword (P-12's two nodes are Scenario titles inside an inline Feature source, not
  arguments to a test call), **and followed by an ASCII letter**. Prose about a title is followed by
  punctuation — an apostrophe in the `P-04` quotation, an ellipsis in both `P-12` ones.

`scripts/verify-watch-rerun.sh` was amended in Task 2 to carry the anchored `P-14` line; it had none
when Task 1 committed it, and the cross-check named it immediately.

## Mutation Record

Seven performed, run, then reverted; `git status --porcelain` clean before each commit was staged.
Full detail lives in each script's METHOD NOTE, beside the code it attacks.

| #   | Mutation                                                              | Went RED                                                               | Stayed GREEN                                                                                |
| --- | --------------------------------------------------------------------- | ------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------- |
| A   | appended Scenario uses an UNREGISTERED step pattern                   | assertion 3's **status** half: "failed", expected "passed"             | assertion 3's **presence** half — the rerun did happen                                      |
| B   | the `.feature` edit skipped, bound shortened to 6 s                   | the timeout path, with a message naming the log; tree clean afterwards | everything before it; assertion 4 never reached                                             |
| C   | `trap` commented out, failure forced right after the copy was written | —                                                                      | the copied `.feature` SURVIVED into the tree, as did the temp dir                           |
| D   | `P-04` stripped from its test title, assertions untouched             | `pnpm verify:pitfalls`, naming the id                                  | **`pnpm test`: 39 files, 816 passed, 4 skipped — identical counts**                         |
| E   | P-09's **Executed by** cell repointed to the other script             | the cross-check, naming P-09 and the artifact                          | `pnpm test`, and every item assertion                                                       |
| F   | leading pipe removed from four rows, giving a 20-row parse            | the ROW-COUNT CONTROL, first, naming both numbers                      | (see below — the contiguity check also catches it)                                          |
| G   | P-22's unselected-Scenario checks dropped **and the filter removed**  | **nothing** — exit 0                                                   | **everything, including the line claiming the filter selected exactly the tagged Scenario** |

Four entries carry more than their row, and two of them corrected what this plan expected to find.

**A is the reason assertion 3 checks presence AND status.** The rerun genuinely happened and
genuinely carried the new Scenario — the presence half was green. A presence-only assertion would
have passed on a rerun that picked up a Scenario the runner could not run, which proves nothing about
the item.

**C landed narrower than predicted and the narrowing is the point.** Only the copied `.feature`
survived, not both files, because the forced failure fired before the `.gate.test.ts` was written.
That is precisely why the trap goes in before the first write rather than after the copy: a trap
registered after the write cannot clean up a failure during it.

**F corrected its own record.** The plan predicted the id assertions would pass vacuously without the
row-count control. They do not: with the control's early return disabled and the same breakage in
place, the contiguity loop printed four "P-0N is missing from the table" lines. So the control's real
value is narrower and worth stating accurately — one message naming both numbers instead of N
messages that read as though the document lost N rows, and the one case the `1..N` loop structurally
cannot see: a parse yielding **more** rows than expected. ASSUMPTION-11-B's mitigation stands, for a
reason the plan had backwards.

**G is the sharpest measurement in the plan and it is worse than the plan guessed.** With P-22's
unselected-Scenario checks disabled, the gate stayed green with `--tagsFilter` removed from the
invocation **entirely**, still printing a line claiming the filter selected exactly the tagged
Scenario. A run with no filter at all satisfies the blunt form, because every Scenario passing
includes the tagged one passing. The blunt form is not a weaker assertion about filtering; it is not
an assertion about filtering.

## Verification

| Gate                               | Result                                                             |
| ---------------------------------- | -------------------------------------------------------------------- |
| `pnpm verify:watch-rerun`          | ENFORCED, exit 0                                                   |
| `pnpm verify:pitfalls`             | ENFORCED, exit 0 — all 24 ids printed, 13 / 10 / 1                 |
| `pnpm test`                        | 39 files, 816 passed, 4 skipped (baseline, unchanged)              |
| `pnpm verify:spec`                 | **PASS 9, FAIL 0, SKIP 0** — 292 links resolve, 22/22 requirements |
| `pnpm lint`                        | exit 0 (oxlint + dprint check)                                     |
| `pnpm typecheck:test`              | exit 0                                                             |
| `pnpm build`                       | exit 0                                                             |
| `pnpm circular`                    | no circular dependency                                             |
| `pnpm verify:pack`                 | OK                                                                 |
| `pnpm verify:tsgo-gate`            | ENFORCED                                                           |
| `pnpm verify:oxlint-plugin`        | ENFORCED                                                           |
| `pnpm verify:no-runner-dep`        | ENFORCED                                                           |
| `pnpm verify:testapi-seam`         | ENFORCED                                                           |
| `pnpm verify:tags-filter`          | ENFORCED                                                           |
| `pnpm verify:shared-layer-once`    | ENFORCED                                                           |
| `pnpm verify:acceptance-ref-state` | ENFORCED                                                           |
| `pnpm verify:acceptance-no-any`    | ENFORCED                                                           |
| `git status --porcelain`           | clean; all seven mutations reverted                                |

Plan-specific criteria, checked mechanically:

- Both gates leave `git status --porcelain` EMPTY after a successful run and after a deliberately
  failed one — measured on mutation B (watch), mutations D/E/F (pitfalls) and mutation C, which is
  the counter-example with the trap removed.
- Every `run:` step in `.github/workflows/check.yml` is a root `package.json` script: 21 steps, 0
  inline commands, confirmed by a `node -e` cross-check over the workflow and the manifest.
- `EXPECTED_CHECKLIST_ROWS` appears exactly once in `scripts/verify-pitfalls-checklist.sh`.

## Deviations from Plan

### Rule 1 — the plan's fixtures for P-13, P-21 and P-24 do not exist, so the gate writes them

The plan says "drive the runner over the acceptance Feature containing an `@only`-tagged Scenario"
and "the acceptance Feature containing the three-row Outline". Neither exists: no acceptance
`.feature` carries `@only`, and the two Outlines that exist have two rows each. Adding two committed
pairs for two items' benefit would enlarge a suite whose size two other gates assert, so the gate
writes a temp pair and deletes it. P-21's row gained a Note saying so. P-24's failing probe was
always going to be temporary — a committed failing fixture makes `pnpm test` red for ever.

### Rule 1 — the plan's watch subject cannot rerun, so the copy is generated rather than copied verbatim

The plan asks to copy the smallest acceptance pair. Its `.feature` IS copied, extracted by Scenario
title out of `worked-example-01-apples.feature` with a positive control on the extraction. Its
`.steps.test.ts` is not: that file loads through `NodeFileSystem`, which measurably does not rerun,
so copying it verbatim would produce a gate that fails for a reason unrelated to watching. The
generated module is small and uses `?raw` plus `parseFeature`. Both measurements are in the METHOD
NOTE.

### Rule 1 — the `@REQ-EC-NNN` tag is stripped from the copied Gherkin

`spec/scripts/verify-traceability.sh` check 4 greps EVERY `.feature` in the repository. A temp file
carrying an acceptance tag would make a concurrent `pnpm verify:spec` assert over a file that is
about to vanish. The extraction starts at the `Scenario:` line, which drops the tag line naturally.

### Rule 1 — three parse and quoting defects the gate found on its own first runs

Each is recorded in place beside the code it broke, because each is a shape someone will
re-introduce:

1. **A markdown escaped pipe.** P-04's item text contains two escaped pipes, so a naive split on
   every pipe handed that row seven cells and read the last word of the item as its executor. Caught
   by the per-row existence check — the cross-check finding a defect in its own parser rather than in
   the document.
2. **A backtick inside `node -e` inside a command substitution.** A backtick there opens a nested
   command substitution. The whole cross-check program moved to a temp FILE written by a quoted
   heredoc, after a second round of the same class: an apostrophe in a comment terminated the
   single-quoted program. A file says exactly what it says.
3. **A step pattern registered twice.** The first draft of the probe module registered the same
   Cucumber expression under both `Given` and `Then` — which is P-06's ambiguous-match failure,
   correctly reported by the library. The `Given` pattern was renamed.

### Rule 1 — `buildScenarioTitles` appends the Examples columns, so P-21 collects titles by prefix

D-03's emitted Outline title carries a `(column=value)` suffix, not the un-interpolated text. Rather
than hard-code that suffix format — which would make P-21 go red on a title-format change that has
nothing to do with P-21 — the gate collects the three titles from the report by prefix and asserts on
them as a set: exactly three, all distinct, each Examples value appearing in exactly one, all
passing.

### Rule 2 — `spec/README.md` needed a Process row

The same finding 11-07 recorded: there is no `spec/process/index.yaml`, but `spec/README.md` carries
a hand-maintained Process table, so a new `spec/process/` document gets a row there.

### Rule 2 — the checklist document's "Executed by is never a link" paragraph had expired

Its stated reason was that two of the three artifacts did not exist yet. All three exist now. The
paragraph was rewritten around the reason that is now primary and permanent: **the column is
machine-read**, and a markdown link would make the parsed value a link construct rather than a path.

### Rule 3 — the worktree had no `node_modules`

Fresh worktree; resolved with `pnpm install --frozen-lockfile`. `pnpm-lock.yaml` unmodified, no
package added, so no package-legitimacy checkpoint applied. Seventh consecutive plan to hit this.

### Not done, deliberately

`.planning/STATE.md`, `.planning/ROADMAP.md` and `.planning/REQUIREMENTS.md` are untouched — this ran
as a parallel worktree agent and the orchestrator owns shared-file writes. **RUN-06 remains `Pending`
in `REQUIREMENTS.md`**, per this phase's standing convention: the closing plan marks it.

## Assumptions

**ASSUMPTION-11-A (adjacency) held, and mutation G is the evidence it earned its runtime cost.** P-13
and P-21 drive the same temp file and P-22 drives a committed one; all three keep separate
invocations and separate echoed ids per PROH-11-04. The cost is one extra vitest run. What it buys is
visible in G: P-22's two halves are not interchangeable, and a P-22 folded into P-13's run would have
been a P-22 whose filter was somebody else's invocation flag.

**ASSUMPTION-11-B (empty / single-element) resolved narrower than the plan predicted, and the
correction is recorded in the script.** The plan assumed the row-count control is what stops a broken
parse from being vacuous. Measured: with the control disabled, the contiguity loop catches a
shrinking parse on its own. The control's real and irreplaceable job is the growth direction — a 25th
row is outside a `1..EXPECTED_CHECKLIST_ROWS` loop and only the count sees it. The mitigation stands;
the reasoning behind it was wrong and is now right.

**ASSUMPTION-11-C (ordering) held, with numbers.** Observed rerun latency ~620 ms in the standalone
probe, ~1 s through the gate's own polling. `RERUN_TIMEOUT_SECONDS` is 60, and the METHOD NOTE says
in so many words that it is a bound rather than a measurement of correctness. Mutation B exercised
the timeout path at a shortened 6 s bound and it failed by name with the log printed, not by hanging.

## Notes for Future Plans

- **The acceptance suite does not rerun in watch mode.** This is the most consequential thing this
  plan measured and it is a product gap, not a test gap: a contributor editing an acceptance
  `.feature` under a watching runner sees stale results, silently. Closing it means either an ambient
  `*.feature?raw` module declaration for `packages/vitest` plus the `moduleDetection` override
  (11-PATTERNS blocking fact 3), or `watchTriggerPatterns` in the root config with the caveat that it
  is root-config-only. Both are real edits to committed files and both are out of this plan's scope.
- **P-24 is owed its full form, and Pitfall 31 already wrote the fix.** Re-raise a step failure with
  a message that LEADS with the step, and put the `.feature` file and line in the emitted test name.
  Both are `packages/vitest/src` changes. When they land, P-24's Note shrinks and its assertion grows
  an arm.
- **The anchored form is now a contract across three artifacts and one document.** A new checklist
  item means a row, an executor, an anchored line in that executor, and `EXPECTED_CHECKLIST_ROWS`,
  all in the same commit. The cross-check is what makes that non-optional, and the document's own
  "An executor carries an id only in the ANCHORED form" section is what tells the next person the
  shape.
- **A `node -e` program inside a command substitution is a trap this repo will hit again.** Backticks
  open nested substitutions and apostrophes terminate the program, so any program that needs to
  discuss markdown, shell or prose belongs in a heredoc-written temp file. Two of this plan's three
  quoting defects were that one shape.
- **`pnpm pack` does not need `pnpm build` first** if only the manifest is being read.
  `verify-pack.sh` builds because it also asserts the tarball CONTENTS; a manifest-only reader can
  skip it, which is why `verify:pitfalls` costs two packs rather than a build plus two packs.

## Known Stubs

None. Every one of the eleven items this plan executes reads a value the library or the toolchain
actually produced — a JSON report from a real run, a manifest out of a real tarball, a compiler exit
code, a document parsed from disk. Two items execute a REDUCED form (P-24 here, P-15's structural
precondition inherited from 11-07), and in both cases the reduction is stated in the checklist row,
in the script's METHOD NOTE and in this summary, with the thing that would complete it named.

The two temp pairs the gates write are not stubs: they are fixtures with a lifetime shorter than the
process that reads them, deleted by a trap whose absence was measured as mutation C.

## Threat Flags

None — no new network endpoints, no auth paths, no trust-boundary schema changes. Both new scripts
read committed files and write only into a `mktemp -d` directory plus six named paths inside the
repository, each of which is asserted to be untracked and non-existent before it is written.

All six registered threats have a measured mitigation:

| Threat                                                             | Mitigation, measured                                                                                                                                                                                       |
| -------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| T-11-08-01 (the watch gate editing a committed fixture)            | Copy under a trap installed before the first write; a `git ls-files --error-unmatch` precondition refuses to run if either work path is ever committed. Mutation C measured what the trap's absence costs. |
| T-11-08-02 (a watching runner left running)                        | `cleanup` kills and waits on the runner on EXIT, INT and TERM. Mutation B exercised the timeout path and the process was gone afterwards.                                                                  |
| T-11-08-03 (a vacuous completeness claim from an empty parse)      | The row-count control plus an independent contiguity loop. Mutation F measured both, and corrected which one does what.                                                                                    |
| T-11-08-04 (reading the source manifest instead of the packed one) | P-15 and P-16 read `package/package.json` out of an extracted tarball; the assertion that the peer effect range is a range and not a pin is only expressible there.                                        |
| T-11-08-05 (a checklist item losing its executor silently)         | Mutations D and E: both loss modes caught, `pnpm test` green at identical counts in both.                                                                                                                  |
| T-11-08-06 (a gate that exists but never runs)                     | Two CI steps, both root `package.json` scripts, confirmed by a mechanical cross-check over all 21 `run:` steps.                                                                                            |

## Self-Check: PASSED

Files verified present on disk:

- FOUND: `scripts/verify-watch-rerun.sh` (436 lines, executable, mutations A-C recorded)
- FOUND: `scripts/verify-pitfalls-checklist.sh` (1038 lines, executable, mutations D-G recorded)
- FOUND: `spec/process/rc-bump-checklist.md` (7 steps; step 1 names the acceptance suite as the gate)
- FOUND: `.github/workflows/check.yml` (both new steps in the `test` job, Node-24-guarded)
- FOUND: `package.json` (`verify:watch-rerun` and `verify:pitfalls` both present)
- FOUND: `spec/process/looks-done-but-isnt-checklist.md` (24 rows; Notes on P-18, P-21, P-24; the ANCHORED form section)
- FOUND: `spec/README.md` (Process row for the rc-bump checklist)

Commits verified in `git log`:

- FOUND: `49b2e23` test(11-08): execute checklist item P-14 as a real watch-mode gate
- FOUND: `85e22dc` test(11-08): execute the ten CLI checklist items and count the checklist's completeness
- FOUND: `079681e` ci(11-08): run both new gates on every push, and record what they catch
