---
phase: 11-composition-root-and-dogfooded-acceptance-suite
plan: "03"
subsystem: acceptance-suite
status: blocked
tags: [acceptance, dogfooding, datatable, rule-layer, scenario-outline, testclock, blocked, deviation-rule-4]

requires:
  - "11-01's acceptance directory, its README conventions, and the derived tag universe in vitest.config.ts"
  - "11-02's established pair shape (relative describeFeature import, gherkin-package loadFeature, assert-not-expect)"
  - "UNMET: a step body receiving its Gherkin DataTable — see Blocker below"
provides:
  - "A measured, reverted proof that `packages/vitest` never delivers `ParsedStep.stepArguments` to a step body, and a one-line fix with zero regressions across 786 tests"
  - "Two corrections to the phase's own inputs: `ScenarioOutline` does not exist, and `Duration.decode` is gone in effect v4"
  - "A measured weakness in `verify-traceability.sh` check 4: a tag named in §5's PROSE satisfies the gate without a row"
affects:
  - "PARSE-04 / REQ-EC-004 — currently marked Complete in REQUIREMENTS.md on evidence that does not cover the last mile"

tech-stack:
  added: []
  patterns: []

key-files:
  created:
    - .planning/phases/11-composition-root-and-dogfooded-acceptance-suite/11-03-DRAFT-worked-example-03-discounts.feature.txt
    - .planning/phases/11-composition-root-and-dogfooded-acceptance-suite/11-03-DRAFT-worked-example-03-discounts.steps.test.ts.txt
  modified: []

decisions:
  - "STOPPED under deviation Rule 4 rather than shipping the one-line library fix. The fix works and regresses nothing, but it silently settles an OPEN DESIGN QUESTION that `spec/behaviors/06` explicitly declines to answer — where a DataTable sits in a step-body signature and whether `StepArgs<P>` should see it. AGENTS.md section 1 requires the behavior doc to change in the same commit, and that text does not exist."
  - "MEASURED: `packages/vitest` contains zero occurrences of `stepArguments`. The gherkin package parses, wraps, orders and exports a step's DataTable; the runner never reads it. `Plan.ts`'s `planStep` sets `args: only.args`, the cucumber-expression matches alone."
  - "MEASURED: `ScenarioOutline` does not exist anywhere in the package. The worked example, `11-CONTEXT.md`'s Reusable Assets list and `11-PATTERNS.md` all name it. The correct call is `Scenario(...)` with the Outline's UN-INTERPOLATED name — `ScenarioKey.ts` note (c) and `Plan.ts` note (c) both say so, and it works: two rows, one registration, each row asserting its own value."
  - "MEASURED: `verify-traceability.sh` check 4 named `@REQ-EC-004` and `@REQ-EC-015` as undefined but NOT `@REQ-EC-014`, because the bare string `REQ-EC-014` already appears in §5's not-yet-carried PROSE. The gate is satisfied by a mention, not by a row."

metrics:
  duration: ~35m
  completed: 2026-08-30

actuals:
  tokens: 34000
  tasks: 0
  commits: 1
---

# Phase 11 Plan 03: Discounts Worked Example — BLOCKED

The discounts pair is written, lint-clean and type-clean, and its four tests pass the moment a
one-line change lands in `packages/vitest/src/Plan.ts`. Without that line they all fail on the same
`TypeError`, because **this library never hands a step body its Gherkin data table.** That is not a
defect in the pair; it is a hole in the runner that the plan's must-have truths cannot be satisfied
around, and closing it is a design decision rather than a bug fix. Execution stopped under deviation
Rule 4 with the working tree byte-identical to its starting state.

## The Blocker

### What is missing

`packages/gherkin` does everything ADR-EC-008 promises: it wraps a `PickleTable` as a `DataTable`
with `raw()`/`hashes()`/`rowsHash()`, orders a step's arguments, exposes them on
`ParsedStep.stepArguments`, and ships `decodeHashes` for the located-error decode.

`packages/vitest` never reads any of it. A repo-wide search puts `stepArguments` in
`packages/gherkin/{src,test}` and two READMEs, and **nowhere in `packages/vitest`**. The join point
is `packages/vitest/src/Plan.ts`, in `planStep`:

```ts
        pattern: only.pattern,
        body: only.definition.body,
        args: only.args
```

`only.args` is `StepMatcher`'s output — the coerced cucumber-expression parameters and nothing else.
`ScenarioEffect.ts` then calls `planned.step.body(...planned.step.args)`, so a step body declaring a
`DataTable` parameter receives `undefined`:

```
TypeError: Cannot read properties of undefined (reading 'hashes')
  at the cart contains: (packages/vitest/src/ScenarioEffect.ts:220:29)
```

### Why this is a genuine hole and not a misuse of the API

- **No behavior document specifies the delivery.** `spec/behaviors/06-datatable-and-docstring-arguments.md`
  lines 15-22 declines the question outright: *"What this file deliberately does not specify is the
  STEP-BODY SIGNATURE: how these arguments are positioned relative to the cucumber-expression
  arguments … That is Phase 5's DSL territory (DSL-02) and belongs with the registration API, next to
  BEH-EC-002's callback shape."* `spec/behaviors/01` (BEH-EC-002) never picks it up, and
  `spec/behaviors/05` never mentions a DataTable. The decision was deferred and then never made.
- **The gherkin package already assumes an answer that nothing consumes.**
  `packages/gherkin/src/StepArguments.ts` note (b): *"Phase 5's step-body signature spreads this array
  after the cucumber-expression arguments, which only works if the order is already settled."* That
  is the intended contract, written into shipped source, with no implementation behind it.
- **`spec/roadmap.md` never over-claims.** Line 13 says a data table reaches
  `ParsedStep.stepArguments`, which is exactly true. The roadmap is honest; the requirement register
  is not.
- **`.planning/REQUIREMENTS.md` line 15 marks PARSE-04 `[x]` Complete** with the text *"A Gherkin data
  table **reaches a step** as a `DataTable` wrapper exposing `.hashes()`…"*. True of a `ParsedStep`,
  false of a step body. That checkbox is wrong today, independently of what is decided below.

### The fix, measured and reverted

One line in `packages/vitest/src/Plan.ts`'s `planStep`:

```ts
        args: [...only.args, ...step.stepArguments]
```

Applied as a probe, measured, then reverted (`git diff` over `Plan.ts` empty, confirmed):

| Measurement | Before | After |
|-------------|--------|-------|
| Discounts pair | 4 failed | **4 passed** |
| Whole suite | 34 files / 782 passed / 4 skipped | **35 files / 786 passed / 4 skipped** |
| Regressions | — | **none** |
| `pnpm typecheck:test` | exit 0 | exit 0 |
| `pnpm lint` | exit 0 | exit 0 |

The two Outline rows emitted with BEH-EC-018's unconditional suffix naming every column:

```
Applying a valid discount code (code=SAVE10, percent=10, expected=31.50)
Applying a valid discount code (code=SAVE50, percent=50, expected=17.50)
```

### Why Rule 4 and not Rule 1 or Rule 2

The change is one line and regresses nothing, which argues for auto-fixing it. Two things argue
harder against, and they won:

1. **It silently answers the open design question.** Appending table and doc-string arguments
   positionally makes them invisible to `StepArgs<P>`, which resolves a step's parameter list from the
   pattern literal alone — a pattern says nothing about a table. So the author must hand-annotate the
   parameter, as the draft does. In a repo whose identity is INV-EC-003 and which maintains
   `packages/gherkin/test/StepArgs.types.ts` specifically to pin claims of this shape, "positionally
   appended and untyped" is a decision someone should make deliberately. The alternatives — a
   `{DataTable}`-style pattern token, widening `StepArgs<P>`, a separate accessor on a context object
   — are all still open.
2. **AGENTS.md section 1 forbids the commit shape.** *"Changing public behavior means updating the
   relevant behavior doc, invariant, and the traceability matrix in the same change."* The behavior
   doc text does not exist, and writing normative spec is design work, not execution work. It also
   lands in `packages/vitest/src/`, outside this plan's declared `files_modified`, while sibling
   worktree agents are running against the same base.

### Options

- **A — close the gap properly (recommended).** Add the one-line wiring, plus the normative
  step-body-signature requirement `spec/behaviors/06` defers (in `06` or beside BEH-EC-002 in `01`), a
  `StepArgs.types.ts` note or test pinning that a table argument is not pattern-derived, and the
  traceability rows. Then 11-03 runs as written. This is a plan of its own, not a deviation.
- **B — descope PARSE-04 from this plan.** Drop the DataTable Background, land the Rule-scoped Layer,
  the two-row Outline and the `TestClock` half (`@REQ-EC-014`, `@REQ-EC-015`) against a table-free
  Feature, and re-plan `@REQ-EC-004` behind option A. Two of three tags land now.
- **C — wire it now, spec later.** Violates AGENTS.md section 1. Not recommended, and noted only so
  the option is visibly rejected rather than silently unavailable.

Whichever is chosen, **PARSE-04's `[x]` in `.planning/REQUIREMENTS.md` should be corrected** — it is
the only v1 requirement whose evidence stops short of the behavior its own text claims.

## Two corrections to this phase's own inputs

**`ScenarioOutline` does not exist.** `spec/behaviors/03`'s worked example destructures it out of the
Rule dsl; `11-CONTEXT.md`'s "Reusable Assets" lists it among this package's public exports; and
`11-PATTERNS.md` reproduces the call. A repo-wide search finds the identifier only inside
`OutlineTitle.ts`'s prose. BEH-EC-018's own normative list is *"Given/When/Then/And/But, Background,
Scenario, and exactly four hook registrars"*, and `Dsl.ts`'s `RuleDsl` declares exactly that. The
correct call is `Scenario(...)` with the Outline's UN-INTERPOLATED name, which is the documented
mechanism rather than a workaround: `ScenarioKey.ts` note (c) and `Plan.ts` note (c) both state that
an Outline's rows share ONE registration matched on `ParsedScenario.astName`. Verified working — two
rows, one registration, each row asserting its own `expected` column. This is a **fourth**
pre-implementation line in that worked example, and its caveat block names only three.

**`Duration.decode` is gone in `effect@4.0.0-rc.112`.** `Duration.toMillis` takes a `Duration.Input`,
which is a template-literal type, so a value arriving through a `{string}` step parameter is not
assignable and no widening is permitted here. The honest conversion is `Schema.DurationFromString`,
which also makes a nonsense expiry fail loudly at the step that wrote it. `Schema.decodeUnknown` is
`Schema.decodeUnknownEffect`, and `table.hashes()` returns an Effect — both already recorded in
`packages/gherkin/src/DataTable.ts` notes (b) and (c).

**A consequence for Task 2's mutation wording.** The plan's mutation B and its
`grep -c 'hashes()' >= 1` criterion assume the Background decodes via
`Schema.decodeUnknownEffect(Schema.Array(CartRow))(yield* table.hashes())`. That form does **not**
type-check: the generator then yields a two-error union (`DataTableError | SchemaError`) that
`Effect.gen.Return`'s inference collapses to the first, producing `TS2345` plus
`effect(missingEffectError)` under `exactOptionalPropertyTypes`. The draft uses
`decodeHashes(CartRow)(table)` — the gherkin package's own purpose-built decoder, single error
channel, and the one that actually produces ADR-EC-008's located error. Task 2's criteria need
rewording to match.

## A measured weakness in the traceability gate

With the untracked `.feature` on disk and no §5 rows, `pnpm verify:spec` reported:

```
FAIL | features -> traceability | undefined: @REQ-EC-004 @REQ-EC-015
```

It named two of the three new tags. `@REQ-EC-014` passed — because the bare string `REQ-EC-014`
already appears in §5's preamble sentence listing what is *not yet carried*. Check 4 greps for the
bare id anywhere in `traceability.md`, so a tag merely MENTIONED in prose satisfies the gate without
a row. Worth a note in whichever plan owns that script; it makes the gate weaker than the acceptance
README claims.

## What was produced

Nothing was committed to `packages/`. Both draft artifacts are preserved beside this summary as
`.txt`, deliberately:

- `11-03-DRAFT-worked-example-03-discounts.feature.txt` — a `.feature` extension here would be
  swept up by `verify-traceability.sh` check 4, which greps **every** `.feature` in the repository
  and would fail `pnpm verify:spec` on the three rowless tags.
- `11-03-DRAFT-worked-example-03-discounts.steps.test.ts.txt` — a `.ts` extension would be collected
  by vitest and type-checked; as `.txt` it is inert, outside `dprint.json`'s includes glob, and
  outside every gate.

Both are lint-clean and type-clean as written; rename them into
`packages/vitest/test/acceptance/` once the blocker is resolved.

## Verification

| Gate | Result |
|------|--------|
| `pnpm typecheck:test` | exit 0 |
| `pnpm lint` | exit 0 (oxlint + dprint check) |
| `pnpm test` (drafts in place, no library change) | 4 failed — the blocker |
| `pnpm test` (drafts in place, probe applied) | 35 files, 786 passed, 4 skipped, 0 regressions |
| `pnpm verify:spec` | FAIL — expected, the §5 rows are Task 2 and Task 2 never ran |
| `git status --porcelain` on `packages/` | clean; the probe was reverted and confirmed byte-identical |

## Deviations from Plan

### Rule 4 — stopped, did not auto-fix

Documented in full under **The Blocker** above. No architectural change was made.

### Rule 3 — the worktree had no `node_modules`

A fresh worktree, so the runner was absent. Resolved with `pnpm install --frozen-lockfile`, which
restores the committed lockfile and adds no package. `pnpm-lock.yaml` is unmodified, so no
package-legitimacy checkpoint applied. Same as 11-02.

### TDD gate sequence

Task 1 is marked `tdd="true"`. The RED was observed and recorded rather than committed, matching
11-01 and 11-02: with the pair on disk, `pnpm test` failed 4/4 on the missing table argument and
`pnpm verify:spec` failed naming two of the three new tags. No GREEN commit exists, because the plan
is blocked before one is reachable.

### Not done

Tasks 1 and 2 are both incomplete. No `spec/traceability.md` rows were added, and none of mutations
A-E were run — every one of them presupposes a green pair. `.planning/STATE.md` and
`.planning/ROADMAP.md` are untouched: this ran as a parallel worktree agent and the orchestrator owns
shared-file writes.

## Known Stubs

None. Nothing partial was committed to `packages/`; the two draft artifacts are inert `.txt` files
that no gate reads and no runner collects.

## Threat Flags

None. No new network endpoints, auth paths, file access patterns, or trust-boundary schema changes.
Of the plan's four registered threats, none could be measured, because all four presuppose a green
pair — T-11-03-01 (table-to-typed-row decode), T-11-03-02 (Rule-scoped service reachable at Feature
level), T-11-03-03 (Outline rows sharing state) and T-11-03-04 (a Scenario passing without the table
reaching it) all remain OPEN and carry forward to whichever plan resumes this work. T-11-03-04 is, in
effect, what this plan discovered: the table does not reach the step at all.

## Self-Check: PASSED

Files verified present on disk:

- FOUND: `.planning/phases/11-composition-root-and-dogfooded-acceptance-suite/11-03-SUMMARY.md`
- FOUND: `.planning/phases/11-composition-root-and-dogfooded-acceptance-suite/11-03-DRAFT-worked-example-03-discounts.feature.txt`
- FOUND: `.planning/phases/11-composition-root-and-dogfooded-acceptance-suite/11-03-DRAFT-worked-example-03-discounts.steps.test.ts.txt`

Reverted probe verified: `git diff --exit-code -- packages/vitest/src/Plan.ts` is clean.
