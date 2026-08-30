---
phase: 11-composition-root-and-dogfooded-acceptance-suite
fixed_at: 2026-08-30T22:10:00Z
review_path: .planning/phases/11-composition-root-and-dogfooded-acceptance-suite/11-REVIEW.md
iteration: 1
findings_in_scope: 19
fixed: 19
skipped: 0
status: all_fixed
---

# Phase 11: Code Review Fix Report

**Fixed at:** 2026-08-30T22:10:00Z
**Source review:** `.planning/phases/11-composition-root-and-dogfooded-acceptance-suite/11-REVIEW.md`
**Iteration:** 1

**Summary:**

- Findings in scope: 19 (`fix_scope: all` — 3 Critical, 11 Warning, 5 Info)
- Fixed: 19
- Skipped: 0

**Where verification ran — both places.** Per-fix verification and every mutation measurement ran
**inside the isolated worktree** (`.claude/worktrees/rf-11-…`), created with
`git worktree add -b gsd-reviewfix/11-…` with `pnpm install --frozen-lockfile` run inside it so the
project's own gates could execute. A worktree-only result is not reproducible after teardown, so the
**full gate set was then re-run in the main checkout** after the fast-forward: 17/17 exit 0 there
too, with the mutating gates leaving the working tree clean. The numbers below are reproducible from
the tree you are looking at.

**Full CI gate set, all green after the last commit (confirmed in the main checkout):**

```
build  lint  typecheck:test  test  circular  verify:spec  verify:pack  verify:tsgo-gate
verify:oxlint-plugin  verify:no-runner-dep  verify:testapi-seam  verify:tags-filter
verify:shared-layer-once  verify:acceptance-ref-state  verify:acceptance-no-any
verify:watch-rerun  verify:pitfalls
```

17/17 exit 0. `pnpm test` reports 39 files, 821 passed, 4 skipped (816 → 821: three new
`Plan.test.ts` cases, one new acceptance Scenario for CR-03, one for WR-09).

Every fix below was **mutation-tested**: the defect was reproduced against the pre-fix code, the fix
applied, and the mutation re-run to confirm the guard bites. The measurements are recorded in the
source files themselves (each gate's `MUTATION RECORD`), not only here.

## Fixed Issues

### CR-01: `packed_manifest` swallows its own failure diagnostics

**Files modified:** `scripts/verify-pitfalls-checklist.sh`
**Commit:** `9fbe520`
**Applied fix:** `fail` now brace-groups its banner and redirects to stderr, and `packed_manifest`
returns via a global `PACKED_MANIFEST` instead of stdout, so its two call sites are plain calls
rather than `$( )`. Both halves were needed: stderr stops the message being captured, and hoisting
puts the `exit 1` in the top-level shell instead of a subshell.

Reproduced the shape before and after — before, exit 1 with **no output at all**; after, the full
banner on stderr with exit 1.

### CR-02: `DECLARATION_RE` blind to destructured `let`/`var`

**Files modified:** `scripts/verify-acceptance-ref-state.sh`
**Commit:** `e894101`
**Applied fix:** the trailing character class became `([A-Za-z_$]|\{|\[)`, so binding patterns are
matched. Recorded as mutation A′ in the script's own record.

Measured through the script's `scan` pipeline: a five-line probe (`let {a}`, `let [b]`, `var {c}`,
`let plain`, `const x`) reported **1 of 5 before, 5 of 5 after**. Then the live arm —
`let { probe } = { probe: 0 }` at module scope in `hooks.steps.test.ts`, exactly the dominant
binding style in this suite: **gate GREEN before** (printing `ENFORCED` against a live violation),
**RED after**, naming the file and line.

### CR-03: no regression guard for the append order or the DocString arm

**Files modified:** `packages/vitest/test/Plan.test.ts`,
`packages/vitest/test/acceptance/parsing-and-matching.feature`,
`packages/vitest/test/acceptance/parsing-and-matching.steps.test.ts`,
`packages/vitest/test/acceptance/worked-example-03-discounts.steps.test.ts`,
`spec/behaviors/06-datatable-and-docstring-arguments.md`
**Commit:** `17c1a29`
**Applied fix:** three new `Plan.test.ts` cases over a new fixture whose steps carry an `{int}`
**beside** the table and the doc string — the smallest arrangement in which append and prepend
differ — plus an untagged end-to-end acceptance Scenario in `parsing-and-matching` exercising both
arms through a real `.feature` file. BEH-EC-016 gained a table naming where each of its three
clauses is enforced.

Both mutations confirmed: flipping `Plan.ts:608` to `[...step.stepArguments, ...only.args]` fails
2 unit tests **and** the acceptance Scenario; dropping `...step.stepArguments` fails all 3 unit
tests. Both were **green across the whole repository** before this commit.

**Deviation from the review's suggested fix, deliberate.** The review proposed widening
`worked-example-03`'s Background to `Given {int} rows of the cart contain:`. That Background is
`spec/behaviors/03`'s worked example executed *verbatim* — editing its Gherkin to suit a gate would
break the dogfooding claim the pair exists to make. The end-to-end observation went into
`parsing-and-matching` instead (untagged, following the precedent of that file's existing untagged
Outline, so no `@REQ-EC-NNN` was allocated against a saturated 22/22 id space). `worked-example-03`'s
misleading comment was corrected in place to say it *cannot* observe the append order and to point at
what does.

### WR-01: `COMMENT_RE` strips Gherkin `*` step lines

**Files modified:** `scripts/verify-acceptance-no-any.sh`
**Commit:** `e8c2d17`
**Applied fix:** one union pattern split into `TS_COMMENT_RE` and `FEATURE_COMMENT_RE`, selected per
file extension in `scan`. Recorded as mutation E3.

Measured: a `*`-keyword step carrying the forbidden token in `hooks.feature` was **not reported
before** (gate printed `ENFORCED`), **reported after** at `hooks.feature:6`. Mutations E and E2 were
re-measured against the split and are unchanged, so the two comment carve-outs still hold.

### WR-02: two documents claim check 4 enforces the directory rule "in both directions"

**Files modified:** `spec/scripts/verify-traceability.sh`, `AGENTS.md`,
`packages/vitest/test/acceptance/README.md`, `packages/gherkin/test/fixtures/README.md`
**Commit:** `b47b215`
**Applied fix:** made the claim true rather than reworded it — check 4 now also asserts that no
`.feature` file outside `packages/vitest/test/acceptance/` carries a REQ tag, reported by file name.
The acceptance README's misattribution of check 5's "§5 row" requirement to check 4 was corrected,
and AGENTS.md §5 now spells out which check owns which half.

Measured: a tagged `.feature` planted in `packages/gherkin/test/fixtures/` is now reported by name
by check 4 (previously only caught incidentally by check 5, and only while the id space stays
saturated).

### WR-03: the usage block says the merge gate always passes `--strict`

**Files modified:** `package.json`, `spec/scripts/verify-traceability.sh`,
`spec/process/definitions-of-done.md`
**Commit:** `06411c7`
**Applied fix:** resolved in the direction both documents already claimed — `verify:spec` now passes
`--strict`. A no-op today at 0 SKIP, and the point is the day it is not. DoD row 6 now records a
resolution instead of a known-false statement.

`pnpm verify:spec` reports `PASS: 9 FAIL: 0 SKIP: 0 (strict: skips count as failures)`.

### WR-04: gate-generated artifacts are not gitignored

**Files modified:** `.gitignore`, `scripts/verify-pitfalls-checklist.sh`,
`scripts/verify-watch-rerun.sh`
**Commit:** `4b31def`
**Applied fix:** all six transient paths added to `.gitignore` with the `.oxlint-probe/` precedent's
reasoning. Verified all eight candidate paths are ignored and that **no tracked file** is shadowed
(`git ls-files | git check-ignore --stdin` is empty).

Both scripts' headers were corrected in the same commit: they claimed `git status --porcelain` was
the evidence of a clean tree, which is no longer true now the paths are ignored. The live detector is
the `[[ -e ]]` precondition on the next run, and the `git ls-files --error-unmatch` precondition is
what stops the ignore entries becoming permission to commit one.

### WR-05: the two largest acceptance modules are outside both structural gates

**Files modified:** `scripts/verify-acceptance-ref-state.sh`, `scripts/verify-acceptance-no-any.sh`,
`packages/vitest/test/acceptance/pitfalls-checklist.test.ts`,
`packages/vitest/test/acceptance/negative-requirements.test.ts`
**Commit:** `467e4f9`
**Applied fix:** both gates now scan every `.ts` under the acceptance directory; the population
control stays on `*.steps.test.ts`, which is what it is a control *on*. Closing lines now name the
file count instead of claiming "the acceptance suite" from a partial scan.

The `records.push` pair the review flagged got a **per-occurrence** carve-out rather than a file-level
one: a trailing `// GATE-ALLOW-MUTATION: <reason>` marker, with the reason required by the pattern,
every use printed on the success path, and a constant `ALLOWED_MUTATIONS=2` asserted for **exact**
equality so the exemption can neither grow nor leave slack behind.

Four mutations, all caught: a `let` in `negative-requirements.test.ts` (green before, red after); an
unmarked `push` in `pitfalls-checklist.test.ts` (green before, red after); a deleted marker with the
constant unchanged; a marker with no reason.

### WR-06: checks 4 and 5 grep the entire repository root

**Files modified:** `spec/scripts/verify-traceability.sh`, `scripts/verify-watch-rerun.sh`
**Commit:** `bea6a3f`
**Applied fix:** both scans now run through one `feature_tags` helper using
`git grep --untracked -- '*.feature' ':(exclude).planning/'`.

`--untracked` rather than plain `git grep` is deliberate and was measured three ways: a **new,
unstaged** tagged `.feature` is still seen (plain `git grep` would pass by not looking); a
**gitignored** transient gate fixture is invisible; a **`node_modules` vendored corpus** is invisible
— that last one went RED under the old filesystem walk, which is the dependency-upgrade failure mode
in full. A non-git checkout now SKIPs by name (a FAIL under `--strict`) instead of reporting an empty
scan as a clean one.

### WR-07: Scenario extracted by substring with no uniqueness guard

**Files modified:** `scripts/verify-watch-rerun.sh`
**Commit:** `5cda5df`
**Applied fix:** the precondition counts occurrences and requires exactly 1; the awk match is
anchored (`$0 ~ "^[[:space:]]*Scenario: " title "$"`); the step control became an exact `-ne` against
a named `EXPECTED_EXTRACTED_STEPS=3` so a **larger** extraction is caught too. Recorded as mutation D.

Measured: with a `Eating apples in bulk` Scenario added, the old `index()` rule extracted **6** step
lines, the anchored rule extracts **3**. With a duplicate exact title, the new uniqueness count fails
by name; `grep -q` passed.

### WR-08: BEH-EC-016's annotation REQUIREMENT has no enforcement

**Files modified:** `spec/behaviors/06-datatable-and-docstring-arguments.md`,
`packages/vitest/src/Dsl.ts`, `scripts/verify-tsgo-gate.sh`,
`packages/vitest/test/tsgo-gate/src/step-table-annotation-unchecked.ts` *(new)*,
`packages/vitest/test/tsgo-gate/tsconfig.step-table-annotation.json` *(new)*
**Commit:** `43fe636`
**Applied fix:** took the review's optional upgrade as well as its documentation minimum. BEH-EC-016
now states inside the REQUIREMENT that the annotation is unverified in both directions, and `Dsl.ts`
note (d) carries the corollary the spec now cites it for.

The new `tsgo-gate` fixture is a **characterization** fixture — the only one in that directory that
pins a gap rather than a guarantee — asserting that four wrong forms (mis-annotated `DataTable`,
mis-annotated `DocString`, omitted parameter, parameter for an argument-less step) still compile
clean. Confirmed exit 0. Its failure message says explicitly that a non-zero exit is an
*improvement* and instructs the reader to delete the case and the matching spec paragraph together,
so the claim cannot go stale in the good direction unnoticed.

### WR-09: `worked-example-02`'s `clear` proof holds only in a whole-file run

**Files modified:** `packages/vitest/test/acceptance/worked-example-02-accounts.feature`,
`packages/vitest/test/acceptance/worked-example-02-accounts.steps.test.ts`
**Commit:** `bf69c9d`
**Applied fix:** a cross-Scenario claim cannot be made self-contained, so the proof was **split**.
A new untagged Scenario writes a row, asserts the count is 1, calls `clear` and asserts 0 — all
within one Scenario, so it holds under any selection. The existing cross-Scenario Scenario keeps its
role and both the module header and the inline comment now state that its reading is conditional on
run shape.

Measured with `Database.clear` neutered to `Effect.void`:

| Run | Result |
| --- | --- |
| whole file | 2 FAILED — both halves caught it |
| `--tagsFilter=@slow` (P-22's exact shape) | **1 PASSED, 6 skipped — green against a dead `clear`** |
| `-t "Clearing the database removes rows"` | 1 FAILED — the unconditional half, alone |

The middle row is the finding; the bottom row is the fix. `--tagsFilter=@slow` still cannot catch a
dead `clear` because it selects neither half — a property of selecting one tagged Scenario, not
something a test can fix. What changed is that a dead `clear` is now catchable by *some* narrowed
run rather than only by the whole-file run.

### WR-10: `report_query` lacks the JSON guard its sibling has

**Files modified:** `scripts/verify-pitfalls-checklist.sh`
**Commit:** `1dc9b47`
**Applied fix:** the guard was put in the **bash wrapper**, not at the twelve call sites — a sentinel
every caller must remember to test is one a thirteenth caller forgets. An unreadable report now
produces a named `fail` (on stderr, so it survives the `$( )` every call site uses) instead of a raw
node stack trace with no banner and no indication of which item was running.

Verified both paths in isolation: multi-line `titles` mode is unchanged, and a truncated report
produces the named banner with exit 1. The remaining lossy shape — process substitution, where
errexit does not propagate — is documented at the helper.

### WR-11: all four new gates write failure banners to stdout

**Files modified:** `scripts/verify-acceptance-no-any.sh`, `scripts/verify-acceptance-ref-state.sh`,
`scripts/verify-watch-rerun.sh`, `scripts/verify-pitfalls-checklist.sh`
**Commit:** `4aeaee5`
**Applied fix:** each `fail` body brace-grouped and redirected once. The **context lines printed
immediately before each `fail`** (41 of them: violation lists, `cat "$LOG"`, tsc output) were
redirected too — otherwise a diagnostic arrives split across two streams, which is worse than the
original.

Verified the property the finding names: with a live violation planted,
`bash scripts/verify-acceptance-ref-state.sh > /dev/null` still prints the violation list *and* the
banner, exit 1.

I checked `scripts/verify-tsgo-gate.sh` as the review asked. There is **no pre-existing stderr
convention to match** — it writes to stdout, as do the other seven older gates. See "Note for the
next reviewer" below.

### IN-01: literal `entr(y|ies)` printed in gate output

**Files modified:** `spec/scripts/verify-traceability.sh`
**Commit:** `59a6635`
**Applied fix:** real singular/plural branch. Output now reads `7 entries resolve`.

### IN-02: `comm` compares locale-collated against C-generated lists

**Files modified:** `spec/scripts/verify-traceability.sh`
**Commit:** `95bafb5`
**Applied fix:** `LC_ALL=C` on both sorts feeding `comm`. Verified identical results under
`LC_ALL=en_US.UTF-8` and the default.

### IN-03: `Option.isSome(x) && x.value.message` compared against a `string`

**Files modified:** `packages/vitest/test/acceptance/worked-example-02-accounts.steps.test.ts`,
`packages/vitest/test/acceptance/worked-example-03-discounts.steps.test.ts`
**Commit:** `2e7ac6d`
**Applied fix:** split into `assert.isTrue(Option.isSome(...), "<reason>")` plus
`assert.strictEqual(Option.getOrThrow(...).message, expected)`.

Demonstrated the improvement by making the registry accept the code: the absent case now reports
`no DiscountError was captured — the code was accepted` instead of
`expected false to equal "code expired"`.

### IN-04: `TSC` relies on unquoted word splitting and has no precondition

**Files modified:** `scripts/verify-pitfalls-checklist.sh`
**Commit:** `10549d1`
**Applied fix:** `TSC=(node "$TSC_BIN")` expanded as `"${TSC[@]}"` at all four call sites, plus a
`[[ -f "$TSC_BIN" ]]` precondition beside the runner's.

Verified the precondition fires by name with the compiler moved aside.

### IN-05: `[[ -e "$tracked" ]] && fail …` relies on errexit's AND-list exemption

**Files modified:** `scripts/verify-pitfalls-checklist.sh`, `scripts/verify-watch-rerun.sh`
**Commit:** `217c34c`
**Applied fix:** both converted to explicit `if` blocks. Verified both branches — the gates still
pass (false branch does not exit) and the true branch still fails by name.

## Note for the next reviewer

Two things this pass deliberately did **not** change, both out of the review's scope and neither a
defect introduced here:

1. **Eight pre-existing gate scripts still write failure banners to stdout** —
   `verify-tsgo-gate.sh`, `verify-pack.sh`, `verify-oxlint-plugin.sh`, `verify-no-runner-dep.sh`,
   `verify-testapi-seam.sh`, `verify-tags-filter.sh`, `verify-shared-layer-once.sh` and
   `spec/scripts/verify-traceability.sh`. WR-11 scoped the finding to the four new gates, and those
   are fixed. The repository now has two conventions rather than one; unifying it is a small,
   mechanical follow-up.
2. **`MIN_STEP_MODULES=5` is duplicated** across the two acceptance gates with a comment in each
   saying to keep them in step. Not raised by the review, and left alone.

---

_Fixed: 2026-08-30T22:10:00Z_
_Fixer: Claude (gsd-code-fixer)_
_Iteration: 1_
