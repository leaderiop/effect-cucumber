---
phase: 11-composition-root-and-dogfooded-acceptance-suite
reviewed: 2026-08-30T21:30:00Z
depth: standard
files_reviewed: 45
files_reviewed_list:
  - .github/workflows/check.yml
  - AGENTS.md
  - README.md
  - package.json
  - packages/gherkin/src/StepArguments.ts
  - packages/gherkin/test/StepArgs.types.ts
  - packages/vitest/README.md
  - packages/vitest/package.json
  - packages/vitest/src/Plan.ts
  - packages/vitest/test/acceptance/README.md
  - packages/vitest/test/acceptance/hooks.feature
  - packages/vitest/test/acceptance/hooks.steps.test.ts
  - packages/vitest/test/acceptance/negative-requirements.test.ts
  - packages/vitest/test/acceptance/negative/README.md
  - packages/vitest/test/acceptance/negative/after-on-failure.feature
  - packages/vitest/test/acceptance/negative/ambiguous-step.feature
  - packages/vitest/test/acceptance/negative/background-placeholder.feature
  - packages/vitest/test/acceptance/negative/unmatched-step.feature
  - packages/vitest/test/acceptance/negative/unused-pattern.feature
  - packages/vitest/test/acceptance/parsing-and-matching-second-load.feature
  - packages/vitest/test/acceptance/parsing-and-matching.feature
  - packages/vitest/test/acceptance/parsing-and-matching.steps.test.ts
  - packages/vitest/test/acceptance/pitfalls-checklist.test.ts
  - packages/vitest/test/acceptance/worked-example-01-apples.feature
  - packages/vitest/test/acceptance/worked-example-01-apples.steps.test.ts
  - packages/vitest/test/acceptance/worked-example-02-accounts.feature
  - packages/vitest/test/acceptance/worked-example-02-accounts.steps.test.ts
  - packages/vitest/test/acceptance/worked-example-03-discounts.feature
  - packages/vitest/test/acceptance/worked-example-03-discounts.steps.test.ts
  - pnpm-lock.yaml
  - scripts/verify-acceptance-no-any.sh
  - scripts/verify-acceptance-ref-state.sh
  - scripts/verify-pitfalls-checklist.sh
  - scripts/verify-watch-rerun.sh
  - spec/README.md
  - spec/behaviors/06-datatable-and-docstring-arguments.md
  - spec/invariants.md
  - spec/overview.md
  - spec/process/definitions-of-done.md
  - spec/process/looks-done-but-isnt-checklist.md
  - spec/process/rc-bump-checklist.md
  - spec/roadmap.md
  - spec/scripts/verify-traceability.sh
  - spec/traceability.md
  - vitest.config.ts
findings:
  critical: 3
  warning: 11
  info: 5
  total: 19
status: issues_found
---

# Phase 11: Code Review Report

**Reviewed:** 2026-08-30T21:30:00Z
**Depth:** standard
**Files Reviewed:** 45 (46 listed minus `pnpm-lock.yaml`, reviewed only for the one added entry)
**Status:** issues_found

## Summary

The phase delivers one line of library-source behaviour change (`Plan.ts`'s `args: [...only.args, ...step.stepArguments]`), four new bash gates, five acceptance pairs, two non-pair acceptance test modules, and a large volume of spec prose. The library change is correct and the suite is green. The defects are concentrated in the *gates* — which are this phase's actual product — and in the enforcement claims the spec now makes about them.

Independently executed during this review (read-only, no source modified):

- `pnpm test` → 39 files, 816 passed, 4 skipped
- `pnpm typecheck:test` → exit 0 (both projects)
- `pnpm lint` → exit 0
- `pnpm circular` → no cycles
- `pnpm verify:spec` → 9 PASS / 0 FAIL / 0 SKIP, "22/22 requirements"
- `pnpm verify:acceptance-ref-state`, `pnpm verify:acceptance-no-any`, `pnpm verify:pitfalls`, `pnpm verify:watch-rerun` → all ENFORCED, working tree left clean by both mutating gates

Green is not the finding. Three defects below are cases where a gate reports ENFORCED (or a document claims enforcement) against a state it cannot actually see, and one is a regression guard that does not exist for two thirds of the contract the phase just made normative. All three were reproduced, not reasoned about.

## Critical Issues

### CR-01: `packed_manifest` swallows every one of its own failure diagnostics — the gate exits 1 silently

**File:** `scripts/verify-pitfalls-checklist.sh:277-289`, called at `:728-729`
**Severity:** BLOCKER

`packed_manifest` is invoked inside a command substitution:

```bash
VITEST_MANIFEST="$(packed_manifest "@effect-cucumber/vitest" "vitest")"
```

It contains three `fail` calls (`:281-282` pack failure, `:285` no tarball, `:287` no `package/package.json`). `fail` writes to **stdout** and `exit 1`s. Inside `$( )` that stdout is captured into `VITEST_MANIFEST` and the `exit 1` terminates only the subshell. Under `set -euo pipefail` the assignment then fails and the script dies — with the entire diagnostic (`✗ pitfalls checklist: NOT ENFORCED` plus the explanation about `catalog:` references) discarded into a variable nobody prints.

Reproduced:

```
$ bash swallow.sh   # minimal repro of the same shape
EXIT=1
```

No output at all. In CI this is a red step with an empty log, in a script whose own preconditions section says a missing target "must fail HERE, **by name**". This directly contradicts the file's stated contract and defeats the reason `pnpm pack` failure is checked at all — the comment at `:282` explains that a broken `catalog:` reference "surfaces here and nowhere else".

**Fix:** Have `fail` write to stderr, and/or return the path via a nameref/global instead of stdout.

```bash
fail() {
  {
    echo ""
    echo "✗ pitfalls checklist: NOT ENFORCED"
    echo ""
    echo "  $1"
    echo ""
  } >&2
  exit 1
}

# and hoist the path out of the substitution:
packed_manifest() { # sets PACKED_MANIFEST
  local name="$1" slug="$2" dest="$TMP_DIR/pack-$slug"
  ...
  PACKED_MANIFEST="$dest/package/package.json"
}
packed_manifest "@effect-cucumber/vitest" "vitest"; VITEST_MANIFEST="$PACKED_MANIFEST"
```

Redirecting `fail` to stderr alone fixes the message loss; hoisting the call out of `$( )` additionally makes the `exit 1` reach the top-level shell rather than relying on errexit.

---

### CR-02: `DECLARATION_RE` is blind to destructured `let`/`var` — INV-EC-006's "first automated enforcement" is escapable by one character

**File:** `scripts/verify-acceptance-ref-state.sh:132`
**Severity:** BLOCKER

```bash
DECLARATION_RE='(^|[^A-Za-z0-9_$])(let|var)[[:space:]]+[A-Za-z_$]'
```

The trailing `[A-Za-z_$]` requires an *identifier* character after the keyword, so every binding-pattern form is invisible. Reproduced against the script's own `scan` pipeline:

```
input:  const x = 1 / let {a} = obj / let [b] = arr / var {c} = obj / let plain = 1
output: 5:let plain = 1
```

Three of the four mutable declarations are not reported. This matters more than the arity suggests because destructuring is this suite's *dominant* binding style — every acceptance step body is written `const { apples } = yield* World`. A module-scope `let { count } = { count: 0 }` reassigned from a step body is precisely the defect INV-EC-006 forbids, and it passes the gate.

The script's METHOD NOTE has a "WHAT THIS GATE DOES NOT CATCH" section (`:55-63`) that enumerates the `const`-holder carve-out. This hole is not in it, and mutation C only proved the regex is *live* (a dead pattern is caught), never that it is *complete*. `spec/invariants.md:287-291` and `spec/roadmap.md` both now state INV-EC-006 as enforced on the strength of this regex.

**Fix:**

```bash
# `let`/`var` followed by an identifier OR a binding pattern (`{` / `[`).
DECLARATION_RE='(^|[^A-Za-z0-9_$])(let|var)[[:space:]]+([A-Za-z_$]|\{|\[)'
```

Then re-run the mutation record's item A against a `let { probe } = ...` form and add it to the record, so the completeness claim is measured rather than assumed.

---

### CR-03: The newly-normative append-order and DocString halves of `planStep`'s join have no regression guard

**File:** `packages/vitest/src/Plan.ts:608`; contract at `spec/behaviors/06-datatable-and-docstring-arguments.md` (new REQUIREMENT block)
**Severity:** BLOCKER

The phase's own narrative (`worked-example-03-discounts.steps.test.ts:76-84`) records that `planStep` silently forwarded only the matcher's arguments for five phases because "no gate can check a contract no document states". The document now states three things:

1. `stepArguments` is delivered at all;
2. it is **APPENDED**, never prepended;
3. it covers **both** a `DataTable` and a `DocString`.

Only (1) is guarded. Grepped across the whole repository:

- `packages/vitest/test/Plan.test.ts` asserts `args` at `:443`, `:446`, `:518-519` only — every one of those steps carries no table and no doc string.
- The single runtime exercise is `worked-example-03-discounts.steps.test.ts:317`, whose pattern `"the cart contains:"` has **zero** cucumber-expression parameters. Its own comment concedes it: *"It is the last parameter because table arguments are appended after the pattern's own; this pattern simply has none."* With zero pattern arguments, append and prepend are indistinguishable.
- **No test anywhere delivers a `DocString` to a step body.** `pitfalls-checklist.test.ts:800-824` (P-20) asserts `step.stepArguments` on the *parsed model*, before `planStep` runs; it never reaches `ResolvedStep.args` or a body.
- `packages/gherkin/test/StepArgs.types.ts:161-163` (`patternArgumentsKeepTheirIndicesBesideATable`) pins the *type-level* claim, which is unaffected by the runtime order — `StepArgs` returns `[number]` whether `planStep` appends or prepends.

So flipping `:608` to `[...step.stepArguments, ...only.args]` leaves the entire suite green, and the DocString arm could be dropped entirely with nothing red. That is the same class of silent gap the phase was written to close, reintroduced one layer down.

**Fix:** Add two `Plan.test.ts` cases (synthetic `ParsedStep`s are already the file's idiom) plus one acceptance step:

```ts
// Plan.test.ts — append order with a real pattern argument present
expect(resolvedOf(plan.scenarios[0]?.steps[0])?.args)
  .toEqual([3, { _tag: "DataTable", /* … */ }])

// Plan.test.ts — a DocString reaches args
expect(resolvedOf(/* … */)?.args)
  .toEqual([{ _tag: "DocString", content: "…", mediaType: Option.none() }])
```

and, in `worked-example-03`, give the Background's table step a pattern parameter
(`Given {int} rows of the cart contain:` → `function*(rows: number, table: DataTable)`) so the append order is observed end to end from a real `.feature` file.

## Warnings

### WR-01: `COMMENT_RE` strips Gherkin `*` step lines, so the no-`any` gate cannot see them

**File:** `scripts/verify-acceptance-no-any.sh:129`
**Severity:** WARNING

```bash
COMMENT_RE='^[0-9]+:[[:space:]]*(//|\*|/\*|#)'
```

The `\*` alternative is there to strip JSDoc continuation lines, but it is applied to `.feature` files too — and `*` is a **legal Gherkin step keyword** anywhere a step keyword goes, a fact `packages/vitest/src/Plan.ts:341-343` documents explicitly. Reproduced:

```
    * a step mentioning any thing      →  <NO HIT — gate blind>
```

A `*`-keyword acceptance step carrying the forbidden token passes the gate silently, which is exactly the state assertion 3's silence is asked to certify against. (The same alternative also hides any `.ts` line beginning with `*`, e.g. a wrapped multiplication chain, though dprint makes that unlikely.)

**Fix:** Use a per-language comment pattern rather than one union.

```bash
TS_COMMENT_RE='^[0-9]+:[[:space:]]*(//|\*|/\*)'
FEATURE_COMMENT_RE='^[0-9]+:[[:space:]]*#'
scan() {
  local file="$1" pattern="$2" comment
  case "$file" in *.feature) comment="$FEATURE_COMMENT_RE" ;; *) comment="$TS_COMMENT_RE" ;; esac
  grep -n '' "$file" | grep -vE "$comment" | grep -E "$pattern" || true
}
```

Add it to the mutation record as an E3 (the token on a `*` step line must be reported).

---

### WR-02: Two documents claim `verify-traceability.sh` check 4 enforces the acceptance-directory rule "in both directions". It enforces neither direction of it.

**File:** `AGENTS.md:84-88`; `packages/vitest/test/acceptance/README.md:13-18`
**Severity:** WARNING

AGENTS.md §5: *"One exception, enforced in both directions by `spec/scripts/verify-traceability.sh` check 4: the parser corpus … must NOT carry the tag — `packages/vitest/test/acceptance/` is the only directory where a `.feature` file may."*

Check 4 (`spec/scripts/verify-traceability.sh:126-143`) does one thing: for every `@REQ-EC-NNN` found in any `.feature` file anywhere, `grep -q` that id in `traceability.md`. It performs **no directory scoping at all**, and its second half is satisfied by a prose mention — a weakness this very phase records four separate times. The acceptance README additionally attributes check 5's "§5 row" requirement to check 4.

Check 5 catches a stray tag *today*, but only incidentally: the id space is saturated at 22/22, so any tag placed elsewhere lands as `duplicated` or `outofrange`. The moment `EXPECTED_REQ_COUNT` is bumped to 23 for a newly allocated requirement, a `@REQ-EC-023` written into `packages/gherkin/test/fixtures/` passes every check while the documents still say it cannot. This is the failure mode AGENTS.md §4 exists to prevent, in a file that states §4.

**Fix:** Either scope the check —

```bash
stray=$(grep -rlE '@REQ-EC-[0-9]{3}' "$ROOT_DIR" --include='*.feature' 2>/dev/null \
  | grep -v '^.*/packages/vitest/test/acceptance/' || true)
[[ -z "$stray" ]] || report FAIL "REQ tags confined to acceptance/" "outside acceptance:${stray}"
```

— or reword both documents to say the directory rule is a **convention** and that check 5 catches a violation only while the id set is complete.

---

### WR-03: `verify-traceability.sh`'s own usage block says the merge gate always passes `--strict`. It does not.

**File:** `spec/scripts/verify-traceability.sh:10-11`; contradicted by `.github/workflows/check.yml:209` and `package.json:19`
**Severity:** WARNING

```
# Usage: bash spec/scripts/verify-traceability.sh [--strict]
#   --strict  treat SKIP as FAIL (the merge gate always passes it)
```

`pnpm verify:spec` is `bash spec/scripts/verify-traceability.sh` with no flag, and CI runs `pnpm verify:spec`. `spec/process/definitions-of-done.md` row 6 now *documents the contradiction* ("CI runs it WITHOUT `--strict`, contrary to that script's own usage comment. Currently moot") instead of resolving it. Recording a known-false statement in a second file does not make the first one true, and the moot-ness is load-bearing on today's 0-SKIP run — the day a check SKIPs, the gate passes and the document says it should not have.

**Fix:** Either change `package.json:19` to `bash spec/scripts/verify-traceability.sh --strict`, or correct line 11 to `(the merge gate does not pass it — see spec/process/definitions-of-done.md row 6)`.

---

### WR-04: Gate-generated artifacts are not gitignored; a hard kill leaves a deliberately-failing test file in the tree

**File:** `scripts/verify-pitfalls-checklist.sh:160-165`; `scripts/verify-watch-rerun.sh:112-113`; `.gitignore`
**Severity:** WARNING

Six paths are written into version-controlled directories:

- `packages/vitest/test/acceptance/pitfalls-gate-probe.{feature,gate.test.ts}`
- `packages/vitest/test/acceptance/pitfalls-gate-failing.{feature,gate.test.ts}` — **contains a step that fails on purpose**
- `packages/vitest/test/tsgo-gate/src/pitfalls-gate-p08-probe.ts` and its tsconfig
- `packages/vitest/test/acceptance/watch-rerun-gate.{feature,gate.test.ts}`

The `trap ... EXIT INT TERM` covers ordinary exits, `fail`, Ctrl-C and SIGTERM. It does not cover `SIGKILL`, an OOM kill, or a CI runner timeout. In those cases a `*.gate.test.ts` that vitest's default include glob collects — one of which asserts a deliberate failure — is left in the working tree, along with an untagged `.feature` in the one directory `vitest.config.ts:94` derives its tag universe from. The next `pnpm test` goes red for a reason no source change explains.

This repository already established the precedent for exactly this case: `.gitignore:17-19` carries `.oxlint-probe/` with the comment *"The script removes them on exit; this entry only guards against a hard kill leaving a deliberate lint violation on disk."* The four new gates got no equivalent.

**Fix:** Add to `.gitignore`, with the same comment:

```gitignore
# Transient fixtures written by scripts/verify-pitfalls-checklist.sh and
# scripts/verify-watch-rerun.sh. Both remove them on exit; these entries only
# guard against a hard kill leaving a deliberately-failing test on disk.
packages/vitest/test/acceptance/*.gate.test.ts
packages/vitest/test/acceptance/pitfalls-gate-*.feature
packages/vitest/test/acceptance/watch-rerun-gate.feature
packages/vitest/test/tsgo-gate/src/pitfalls-gate-*.ts
packages/vitest/test/tsgo-gate/tsconfig.pitfalls-gate-*.json
```

---

### WR-05: The two largest TypeScript modules in the acceptance directory are outside both structural gates

**File:** `packages/vitest/test/acceptance/negative-requirements.test.ts:33-38`; `packages/vitest/test/acceptance/pitfalls-checklist.test.ts:74-86`
**Severity:** WARNING

`negative-requirements.test.ts` (463 lines) and `pitfalls-checklist.test.ts` (936 lines) are not `*.steps.test.ts`, so neither `verify-acceptance-ref-state.sh` nor `verify-acceptance-no-any.sh` scans them. Both files say so honestly in their own headers and state that the rules are "honoured here by hand". That is 1,399 of the directory's ~2,900 TypeScript lines governed by convention only, inside the phase whose Success Criterion 2 is *automated* enforcement.

The population control makes this worse rather than better: `MIN_STEP_MODULES=5` prints `✓ population control: 5 acceptance step module(s)` and the script then prints `acceptance suite cross-step state via Ref only: ENFORCED` — a claim about "the acceptance suite" made from a scan of 5 of its 7 TypeScript modules.

**Fix:** Widen the `find` to every `.ts` under the directory and keep the population control on `*.steps.test.ts`:

```bash
SCANNED_TS="$(find "$ACCEPTANCE_DIR" -type f -name '*.ts' | sort)"
```

`pitfalls-checklist.test.ts:320` uses `records.push(...)` in a function-local recording fake, so assertion 4 would need a narrow, *documented* carve-out (or the fake rewritten with spread) — which is a better state than the rule being unenforced there at all. Failing that, downgrade the two scripts' closing lines from "the acceptance suite" to "every acceptance step module".

---

### WR-06: `verify-traceability.sh` checks 4 and 5 grep the entire repository root, including `node_modules/`, `.git/` and `.planning/`

**File:** `spec/scripts/verify-traceability.sh:127`, `:183`
**Severity:** WARNING

```bash
grep -rhoE '@REQ-EC-[0-9]{3}' "$ROOT_DIR" --include='*.feature'
```

`ROOT_DIR` is the repo root. `--include` limits by name but not by directory, so the walk descends into `node_modules/` (which today contains 0 `.feature` files, but `@cucumber/*` packages routinely ship testdata corpora), `.git/`, `.planning/`, and any transient directory a concurrently running gate created. Two consequences: the "carried exactly once" claim is a claim about *the filesystem*, not about the source tree; and a dependency upgrade that pulls in a `.feature` corpus can turn `pnpm verify:spec` red or, worse, silently satisfy the duplicate check.

**Fix:** Drive the scan from git's own index, which is the set the claim is actually about:

```bash
occurrences=$(git -C "$ROOT_DIR" grep -hoE '@REQ-EC-[0-9]{3}' -- '*.feature' 2>/dev/null | sed 's/^@//' | sort)
```

`git grep` also skips the transient `.feature` files the two mutating gates create, which removes the concurrency hazard `verify-watch-rerun.sh:250-253` currently mitigates by hand.

---

### WR-07: `verify-watch-rerun.sh` extracts its Scenario by substring, with no uniqueness guard

**File:** `scripts/verify-watch-rerun.sh:238-239`, `:255-260`
**Severity:** WARNING

The precondition is `grep -q "Scenario: $EXISTING_TITLE\$"` — an existence check, not a uniqueness check. The extraction is then:

```awk
index($0, title) { inblock = 1; print; next }
```

`index()` is a substring test. A future Scenario titled `Eating apples in bulk`, or a second `Scenario: Eating apples` under a `Rule:`, would match too, so the copy silently gains extra Scenarios. `TOTAL_1` then rises and assertion 4 (`TOTAL_2 > TOTAL_1`) becomes weaker without anything reporting it. The step-count control at `:265-268` is `-lt 3`, so it does not notice a *larger* extraction either.

**Fix:** Anchor the awk match and assert exactly one occurrence up front:

```bash
occurrences=$(grep -cE "^[[:space:]]*Scenario: ${EXISTING_TITLE}$" "$SOURCE_FEATURE")
[[ "$occurrences" -eq 1 ]] || fail "…$occurrences Scenarios titled exactly \"$EXISTING_TITLE\"; expected 1."
```

```awk
$0 ~ "^[[:space:]]*Scenario: " title "$" { inblock = 1; print; next }
```

and tighten the step control to an exact `-ne 3`.

---

### WR-08: BEH-EC-016's new "the author MUST annotate the trailing parameter" REQUIREMENT has no enforcement of any kind

**File:** `spec/behaviors/06-datatable-and-docstring-arguments.md` (new REQUIREMENT block); mechanism at `packages/vitest/src/Dsl.ts:160-165`
**Severity:** WARNING

`StepRegistrar` infers `Params` **from the body**, not from `StepArgs<pattern>`:

```ts
<Params extends ReadonlyArray<any>, A, E>(
  pattern: string,
  fn: ((...p: Params) => …) | …
): void
```

So `Given("the cart contains:", function*(table: string) { … })` compiles, lints, type-checks, and hands the body a `DataTable` object at runtime — the annotation is unchecked in both directions. `parsing-and-matching.steps.test.ts:148-154` (mutation C) already records this for pattern arguments: *"a pattern and a body can disagree with each other and only a runtime assertion notices."* The new REQUIREMENT inherits that hole, and the spec text (*"the annotation is the only place that claim exists"*) reads as though the annotation is load-bearing when nothing verifies it.

**Fix (documentation, at minimum):** State in BEH-EC-016 that the annotation is unverified — an author who writes the wrong type gets a runtime shape error, not a compile error — and cite `Dsl.ts` note (d) for why `Params` cannot be constrained to `StepArgs<P>` without breaking generator inference. A `tsgo-gate` fixture pinning the mis-annotation as *accepted* would make the gap a measured fact rather than an omission.

---

### WR-09: `worked-example-02`'s `clear`-is-load-bearing proof holds only in a whole-file run — and the repo's own P-22 gate runs that file filtered

**File:** `packages/vitest/test/acceptance/worked-example-02-accounts.steps.test.ts:444-462`; `packages/vitest/test/acceptance/worked-example-02-accounts.feature:36-39`; `scripts/verify-pitfalls-checklist.sh:587`
**Severity:** WARNING

The module header (`:48-57`) and the inline comment at `:444-448` both state that `Then the account total across both scenarios is 1` is what proves the Background's `clear` ran against the shared tier: *"Delete the `clear` and this Scenario reads 2."*

That is true only when `Creating a user` ran first and wrote `Ada`. Under any narrowed selection it is false, and the repository performs exactly such a selection on exactly this file:

```bash
run_vitest "$ACCOUNTS_STEPS" "$P22_REPORT" "$P22_LOG" --tagsFilter="$FILTER_TAG"   # @slow
```

With `@slow` selected, `Creating a user` is skipped, no `Ada` exists, and the Scenario reads 1 whether `clear` runs or not. The same is true of any `-t` narrowing — the ADR-EC-018 divergence class `verify-shared-layer-once.sh` exists to police.

This is not a live failure (the gate only asserts pass/skip), but it is a coverage claim that is silently conditional on run shape, in the module that most loudly documents its own mutation record.

**Fix:** Make the assertion self-contained — have the `@REQ-EC-021` Scenario create its own second account *and* assert the count before creating it, e.g. add `Given the database has 0 users` ahead of the `When`, so a leaked `Ada` fails at a step whose meaning does not depend on which sibling ran. Or move the `clear` proof to a Scenario that writes and re-reads within itself, and reword the header accordingly.

---

### WR-10: `verify-pitfalls-checklist.sh`'s `report_query` lacks the JSON guard its sibling script has

**File:** `scripts/verify-pitfalls-checklist.sh:235-257` vs `scripts/verify-watch-rerun.sh:184-206`
**Severity:** WARNING

`verify-watch-rerun.sh` wraps `JSON.parse` in try/catch and answers `UNREADABLE`, with a comment explaining that a half-written report must not read as "the runner never reran". The pitfalls gate's otherwise-identical helper has no guard:

```js
const report = JSON.parse(fs.readFileSync(process.env.REPORT, "utf8"))
```

A truncated or absent-key report makes node throw; under `set -e` the enclosing `P13_TOTAL="$(report_query …)"` kills the script with a raw node stack trace and **no** `fail` banner, no `cat "$P13_LOG"`, and no indication of which item was running. The four runs here are `vitest run` (one shot), so truncation is unlikely — but the failure mode is the same silent-exit shape as CR-01, and the mitigation already exists one file over.

**Fix:** Copy the try/catch and the `UNREADABLE` sentinel from `verify-watch-rerun.sh:186-192`, and treat `UNREADABLE` as a named `fail` at each call site.

---

### WR-11: All four new gates write their failure banners to stdout, not stderr

**File:** `scripts/verify-acceptance-no-any.sh:131-138`; `scripts/verify-acceptance-ref-state.sh:144-151`; `scripts/verify-watch-rerun.sh:132-139`; `scripts/verify-pitfalls-checklist.sh:192-199`
**Severity:** WARNING

`fail() { echo …; exit 1; }` with no `>&2`. Three consequences: CR-01's total message loss; `pnpm verify:… > /dev/null` hides the failure while still exiting 1; and any future caller that pipes a gate's stdout (as `packed_manifest` already effectively does) inherits the same bug. The pre-existing `scripts/verify-tsgo-gate.sh` convention should be checked and matched.

**Fix:** Brace-group each `fail` body and redirect once: `{ echo ""; …; } >&2; exit 1`.

## Info

### IN-01: literal `entr(y|ies)` printed in gate output

**File:** `spec/scripts/verify-traceability.sh:58`
Prints `26 entr(y|ies) resolve` verbatim. Cosmetic, but this is the output a reader scans for a FAIL. Use `entries` or a small pluralisation.

### IN-02: `comm` in check 5 compares locale-collated against C-generated lists

**File:** `spec/scripts/verify-traceability.sh:202-203`, `:212`
`distinct` and `rows` come from `sort` (locale collation); `expected` is built by a `printf` loop (C order). All ids are same-shape ASCII so the orders coincide today, and `comm` warns rather than fails on unsorted input — so a future id family with a different shape could produce a wrong `missing`/`outofrange` set instead of an error. Prefix the sorts with `LC_ALL=C`.

### IN-03: `Option.isSome(x) && x.value.message` compared against a `string`

**File:** `packages/vitest/test/acceptance/worked-example-02-accounts.steps.test.ts:394`; `packages/vitest/test/acceptance/worked-example-03-discounts.steps.test.ts:405`
`assert.strictEqual(false, "not found")` is a correct-but-opaque failure for the absent case, and the `worked-example-02` instance sits inside a `@skip` Scenario, so it has never executed. Prefer `assert.isTrue(Option.isSome(e)); assert.strictEqual(e.value.message, expected)` — two lines, two distinguishable failures.

### IN-04: `TSC` relies on unquoted word splitting and has no executable precondition

**File:** `scripts/verify-pitfalls-checklist.sh:170`, `:312`
`TSC="node node_modules/typescript/bin/tsc"` is expanded unquoted at four call sites. `VITEST` gets a `[[ -x … ]]` precondition; `TSC` gets none, so a missing `node_modules/typescript` surfaces as an opaque node error inside P-08 rather than as a named precondition failure. Use an array (`TSC=(node node_modules/typescript/bin/tsc)` / `"${TSC[@]}"`) and add `[[ -f node_modules/typescript/bin/tsc ]] || fail …`.

### IN-05: `[[ -e "$tracked" ]] && fail …` relies on errexit's AND-list exemption

**File:** `scripts/verify-pitfalls-checklist.sh:324`; `scripts/verify-watch-rerun.sh:235`
Verified correct under bash 5.3 (`set -euo pipefail` does not exit when the left side of an `&&` list fails), so this is not a bug today. It is one refactor away from being one — moving the line out of the loop, or adding a command after it, changes the semantics silently. `if [[ -e "$tracked" ]]; then fail …; fi` costs one line and does not depend on the exemption.

---

_Reviewed: 2026-08-30T21:30:00Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
