---
phase: 09-tags
plan: 02
subsystem: testing
tags: [tags, filtering, warnings, plain-data, vitest, effect, security]

# Dependency graph
requires:
  - phase: 02-loadfeature-parse-compile-correlate
    provides: "ParsedScenario.tags — the already-flattened, inheritance-resolved ReadonlyArray<string> this plan reads and never recomputes"
  - phase: 06-plan-scenario-effect-runner-emission-and-drift-detection
    provides: "Errors.ts's interface + reason-union + make… factory triple, its note (c)/(d)/(e) conventions, and Plan.ts's quoted = JSON.stringify convention"
provides:
  - "packages/vitest/src/Tags.ts — a dependency-free leaf holding skipTag, onlyTag, TagFilter, noTagFilter, makeTagFilter, shouldEmit and isSkipped"
  - "Empty-and-absent-mean-no-filter semantics, mutation-proven: a computed-empty includeTags/excludeTags can never delete a suite behind a green run"
  - "Errors.ts's UndeclaredTagWarning (D-08) and ExcludedScenariosNotice (D-10) plain-data types plus their message-building factories"
  - "Errors.ts note (f): every author-controlled string is JSON.stringify'd before interpolation, and the caught framework error's own text is never rendered"
  - "A reason DERIVED from the two tag arrays rather than accepted, so the notice cannot point at a filter that was not in play"
affects:
  - "09-04 (Plan/Runner tag threading — consumes shouldEmit/isSkipped)"
  - "09-05 (describeFeature filtering and terminal output — consumes both factories)"
  - "09-07 (barrel edit — owns adding UndeclaredTagWarning/ExcludedScenariosNotice to index.ts, and any Tags.ts barrel decision)"

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Dependency-free leaf module for a value two pipeline stages must agree on (ScenarioKey.ts's precedent, applied to tag semantics)"
    - "Empty array normalised to 'no filter' at the boundary, with the failure mode it prevents written into the factory's own doc comment"
    - "Derived discriminant: a reason computed from the struct's own fields rather than accepted, when a caller-supplied value could disagree with them"
    - "Exact message.length pinned as a hard-coded constant for a FACTORY-BUILT message, the only enforceable form of the no-truncation policy on a string the caller did not supply"
    - "One forging fixture carrying both a quote and a real newline, so a half-correct escaping fix cannot pass half the suite"

key-files:
  created:
    - packages/vitest/src/Tags.ts
    - packages/vitest/test/Tags.test.ts
  modified:
    - packages/vitest/src/Errors.ts
    - packages/vitest/test/Errors.test.ts
    - spec/traceability.md

key-decisions:
  - "undefined and [] are the same input to makeTagFilter and both mean NO FILTER — never 'match nothing' — because D-03 makes a filtered-out Scenario never become a test node, so 'match nothing' deletes a suite behind a green run"
  - "Exclude is its own conjunct in shouldEmit, not a fallback: a tag named in both arrays excludes, because the safe reading of an author's self-contradiction is the one that runs fewer tests"
  - "Set semantics (includes/some) rather than occurrence counting, because ParsedScenario.tags is a flattened inheritance chain and a Feature-and-Scenario duplicate tag is ordinary"
  - "onlyTag gets a named constant despite nothing branching on it, so D-06's deliberate inertness is recorded in the source rather than inferred from a missing branch"
  - "makeExcludedScenariosNotice DERIVES reason from the two arrays; a caller-supplied reason could disagree with the same struct's other fields and nothing would go red"
  - "UndeclaredTagWarning carries no line number: the offending tags may be inherited from a Feature, Rule or Examples block, so a Scenario line would point at the wrong scope"
  - "Neither new type stores or renders the caught framework error's own message — upstream prose never becomes this library's contract (03-01/03-03 precedent)"

patterns-established:
  - "A factory-built message is pinned by exact character count against a fixture carrying a 1000-character tag; the number moves on a reword, which is the intended cost"
  - "Mutation logs in test-file headers record OBSERVED failure counts, not predicted ones"

# Requirements
requirements-completed: []
requirements-advanced: [RUN-05]

# Metrics
duration: 12min
completed: 2026-08-29
---

# Phase 9 Plan 02: Tags Leaf and Collection-Time Notices Summary

**The two dependency-free leaves the rest of Phase 9 composes from now exist: `Tags.ts`, where an absent or empty tag filter provably means "run everything" rather than "run nothing", and two new plain-data notices in `Errors.ts` whose messages quote every author-controlled string before it reaches a terminal.**

## Performance

- **Duration:** ~12 min
- **Started:** 2026-08-29T21:34Z
- **Completed:** 2026-08-29T21:47Z
- **Tasks:** 3 of 3
- **Files created:** 2
- **Files modified:** 3

## Accomplishments

- `packages/vitest/src/Tags.ts` exists as a true leaf: `grep -cE '^import '` is `0`. No framework import, no `effect/*` import, no local import.
- The empty-array claim is asserted directly and **mutation-proven**: removing `filter.include.length === 0 ||` from `shouldEmit` fails 7 named tests, three of which name the caller mistake they defend against.
- `Errors.ts` grew from two shapes to four — one failure and three warnings — with note (c) generalised, note (d) extended to cover tag-list caps, and a new note (f) stating the `JSON.stringify` control and the refusal to re-emit upstream prose.
- `makeExcludedScenariosNotice` derives its `reason`, so the notice cannot name a filter that was not in play. All three reason members have their own named test; dropping the both-arrays arm fails one of them while the other two still pass.
- 31 new tests in `Tags.test.ts`, 12 new tests in `Errors.test.ts`. Full suite: **696 passing across 31 files**, up from 653.

## Task Commits

1. **Task 1: Create `packages/vitest/src/Tags.ts`** — `45fecb8` (feat)
2. **Task 2: Add `packages/vitest/test/Tags.test.ts` and its traceability row** — `55764ce` (test)
3. **Task 3: Add `UndeclaredTagWarning` and `ExcludedScenariosNotice` to `Errors.ts`** — `f1495f0` (feat)

## The final exported surface of `Tags.ts`

Plans 09-04 and 09-05 implement against exactly this. It matches the plan's `<interfaces>` block with one
addition, noted as deviation 1 below.

```ts
export const skipTag = "@skip"
export const onlyTag = "@only"

export interface TagFilter {
  readonly include: ReadonlyArray<string>
  readonly exclude: ReadonlyArray<string>
}

export const noTagFilter: TagFilter // = { include: [], exclude: [] }

export const makeTagFilter: (options: {
  readonly includeTags?: ReadonlyArray<string> | undefined
  readonly excludeTags?: ReadonlyArray<string> | undefined
}) => TagFilter

export const shouldEmit: (filter: TagFilter, tags: ReadonlyArray<string>) => boolean

export const isSkipped: (tags: ReadonlyArray<string>) => boolean
```

`shouldEmit`'s body, verbatim — the mutation target below:

```ts
(filter.include.length === 0 || filter.include.some((tag) => tags.includes(tag))) &&
  !filter.exclude.some((tag) => tags.includes(tag))
```

## The exact message formats

Both are single-line — zero raw newlines, structurally — so a tag containing one cannot start what
reads as a second line of this library's output.

**`makeUndeclaredTagWarning`**, rendered for `uri: "features/checkout.feature"`,
`scenarioName: "a shopper fills a basket"`, `tags: ["@slow"]`:

```
"features/checkout.feature": UndeclaredTag: Scenario "a shopper fills a basket" carries 1 tag(s) this project's vitest config does not declare: "@slow". The Scenario still ran, but it was emitted UNTAGGED, so a --tagsFilter run naming any of those tags cannot select it. Declare them under test.tags in your vitest config: https://vitest.dev/guide/test-tags
```

Every `"…"` span above is `JSON.stringify` output, not hand-added quotes. Tags are joined with `", "`,
each quoted individually. No cap and no ellipsis.

**`makeExcludedScenariosNotice`**, all three derived reasons, for `featureName: "Checkout"`,
`uri: "features/checkout.feature"`, `count: 3`:

```
"features/checkout.feature": ExcludedByIncludeTags: 3 Scenario(s) in Feature "Checkout" were excluded by includeTags ["@slow"]. They were never registered, so they appear nowhere in this run's output — not even as skipped. Widen or remove the filter to run them.

"features/checkout.feature": ExcludedByExcludeTags: 3 Scenario(s) in Feature "Checkout" were excluded by excludeTags ["@wip"]. They were never registered, so they appear nowhere in this run's output — not even as skipped. Widen or remove the filter to run them.

"features/checkout.feature": ExcludedByBothTagFilters: 3 Scenario(s) in Feature "Checkout" were excluded by includeTags ["@slow"] and excludeTags ["@wip"]. They were never registered, so they appear nowhere in this run's output — not even as skipped. Widen or remove the filter to run them.
```

The derived `reason` appears as the message's own middle segment, so the derivation is observable in
the terminal and not only in the struct.

## Files Created/Modified

- `packages/vitest/src/Tags.ts` *(new, 177 lines)* — reserved constants, `TagFilter`, `noTagFilter`, `makeTagFilter`, `shouldEmit`, `isSkipped`. Four-note module header: (a) why this is a module and not a private helper in `Runner.ts` (`spec/traceability.md` §1 already named it; `TestApi.ts`'s closing paragraph forbids a runtime value there), (b) empty means no filter, (c) `@only` is deliberately inert, (d) internal, plan 09-07 owns any barrel decision.
- `packages/vitest/test/Tags.test.ts` *(new, 31 tests)* — nine named claim groups; the mutation log records four performed-and-reverted mutations with observed failure counts.
- `packages/vitest/src/Errors.ts` — header rewritten from "two shapes" to "four shapes: one failure and three warnings"; note (c) generalised to every warning; note (d) extended to cover tag-list caps; new note (f) on the `JSON.stringify` control and the no-upstream-prose rule; module-private `quoted`/`quotedList` helpers; `UndeclaredTagWarningReason`, `UndeclaredTagWarning`, `makeUndeclaredTagWarning`, `ExcludedScenariosNoticeReason`, `ExcludedScenariosNotice`, `excludedScenariosNoticeReason` (private) and `makeExcludedScenariosNotice`; closing paragraph names plan 09-07 as the barrel owner for the four new exports.
- `packages/vitest/test/Errors.test.ts` — 12 new tests across three new `describe` blocks; two new strictness rationales in the header; mutation log extended with C, D and E.
- `spec/traceability.md` — new §4 row for `Tags.test.ts` covering BEH-EC-008; `Errors.test.ts`'s row gained BEH-EC-008 and a description of the two notices; preamble and §1's behavior-doc-02 row moved `Tags.ts` from planned to real and added `Errors.ts` to that row's module list.

## Verification

All plan gates run and green at `f1495f0`:

- `pnpm build` — exit 0
- `pnpm lint` (oxlint + dprint check) — exit 0
- `pnpm circular` — no circular dependency found (32 files)
- `pnpm typecheck:test` — exit 0, both test projects
- `pnpm exec vitest run` — 31 files, 696 tests, all passing
- `pnpm verify:spec` — PASS 7, FAIL 0, SKIP 1

Acceptance greps, all confirmed:

| Grep | Required | Actual |
|---|---|---|
| `grep -cE '^import ' src/Tags.ts` | 0 | 0 |
| `export const skipTag = "@skip"` on a non-comment line | 1 | 1 |
| `export const onlyTag = "@only"` on a non-comment line | 1 | 1 |
| `export (const\|interface) (noTagFilter\|makeTagFilter\|shouldEmit\|isSkipped\|TagFilter)` non-comment | 5 | 5 |
| `grep -c 'from "../src/index.ts"' test/Tags.test.ts` | 0 | 0 |
| `grep -c 'Tags.test.ts' spec/traceability.md` | ≥1 | 1 |
| `grep -cE '^import ' src/Errors.ts` | 2 | 2 (`effect/Option`, `effect/Schema`) |
| `grep -c 'UndeclaredTagWarning' src/Errors.ts` | ≥4 | 12 |
| `grep -c 'ExcludedScenariosNotice' src/Errors.ts` | ≥4 | 13 |
| `grep -c 'Schema.TaggedError' src/Errors.ts` | unchanged | 6 → 6 (see deviation 2) |
| `grep -c 'message.length' test/Errors.test.ts` | +2 or more | 3 → 5 |

`pnpm verify:testapi-seam` (the D-11 script) was NOT run: plan 09-01 creates it and is a sibling in
the same wave, so it does not exist in this worktree. Nothing in this plan touches `Runner.ts` or
`TestApi.ts`, so the seam is untouched by construction.

### Mutation testing

Every mutation below was performed, run, observed, and reverted. Counts are what the runner actually
reported, not predictions.

**`Tags.ts` — the plan's required proof is mutation A.**

| Mutation | Failures | Named tests among them |
|---|---|---|
| A. `shouldEmit`'s include half reduced from `filter.include.length === 0 \|\| …` to the `some(…)` alone | **7** | "makeTagFilter({}) emits every Scenario, including one with no tags at all"; "an explicitly EMPTY includeTags emits every Scenario, never none of them"; "an explicitly EMPTY excludeTags silences nothing" |
| B. exclude made a fallback (`some(…) \|\| !some(…)`) instead of a conjunct | 6 | "a tag named in BOTH arrays excludes — exclude wins the conflict"; "a Scenario must survive both halves, not either one" |
| C. both `includes` calls replaced with a `toLowerCase()` comparison | 2 | exactly the two case-sensitivity tests, and nothing else |
| D. `isSkipped` replaced with `tags.some((tag) => tag.startsWith(skipTag))` | 1 | "is false for @skipped — not a prefix match" |

Mutation A is the plan's acceptance criterion: **the empty-array assertions are not vacuous.**

**`Errors.ts`.**

| Mutation | Threat | Failures | Named tests among them |
|---|---|---|---|
| C. `quotedList` drops its `.map(quoted)` and joins raw tag strings | T-09-02-01, T-09-02-02 | 6 | both "escapes a tag containing a quote and a newline instead of letting it forge a second line" tests |
| D. `quoted` gains a `.slice(0, 200)` | T-09-02-04 | 3 | both "renders a message of exactly the expected length, truncating nothing" tests |
| E. `excludedScenariosNoticeReason` drops the both-arrays arm | — | 4 | "reports ExcludedByBothTagFilters when both are non-empty" — while the other two derivation tests still pass |

Mutation C's fact is the security one: with raw interpolation, the fixture tag
`@wip"\n⚠ unused step definition: Then "forged"` really does place a `⚠`-prefixed line at the start of
its own terminal row, indistinguishable from output `Runner.ts` produces. With `quoted`, the newline
renders as the two characters `\n` and the message stays one line.

## Decisions Made

- **`undefined` and `[]` are the same input, and both mean no filter.** Written into `makeTagFilter`'s own doc comment together with the failure it prevents, because the plausible "tightening" — `includeTags: []` meaning "match nothing" — deletes a suite from existence behind a green run: D-03 makes a filtered-out Scenario never become a test node, and zero tests emitted is indistinguishable from zero tests failed.
- **Exclude wins a conflict.** The exclude half is a conjunct, not a fallback. An author who wrote one tag into both lists has contradicted themselves, and the safe reading of a contradiction is the one that runs fewer tests — visible in a test count — rather than more.
- **Membership, never occurrence counting.** `ParsedScenario.tags` is a flattened inheritance chain, so a tag written on both a Feature and one of its Scenarios genuinely appears twice. Anything counting occurrences would treat that ordinary document differently from the identical one that wrote the tag once.
- **`onlyTag` exists as a named constant although nothing branches on it.** D-06's inertness is recorded in the source rather than inferred from a missing branch, following `Errors.ts`'s and `TestApi.ts` note (b)'s convention of writing down what was deliberately left out.
- **`UndeclaredTagWarning` carries no `line`.** The producer has `ParsedScenario.location`, but the offending tags may have been inherited from the Feature, the Rule or an Examples block, so a single Scenario line would point at the wrong scope for an inherited tag. Naming no line is honest; naming the wrong one is not.
- **`makeExcludedScenariosNotice` derives its `reason`, and `makeUnusedStepDefinitionWarning` still accepts one.** The divergence is deliberate and is written into the derivation helper's comment: the older union has one member and cannot disagree with anything, while this one has three, all describing the same struct's other two fields.
- **The unreachable fourth combination (both arrays empty) falls into `ExcludedByExcludeTags` and gets no member of its own.** Under `noTagFilter` semantics `shouldEmit` returns true for every Scenario, so `count` is zero and no notice is built. A member for it would need a message no consumer can produce and a test asserting output nobody can observe; throwing would turn a benign summary line into a hard collection failure.
- **`reason` is not a parameter of `makeUndeclaredTagWarning`.** Its union has one member, so accepting it would let a caller pass the only legal value and nothing else.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 — Blocking] `makeTagFilter`'s optional fields need an explicit `| undefined`**

- **Found during:** Task 1
- **Issue:** The plan's `<interfaces>` block writes `readonly includeTags?: ReadonlyArray<string>`. `tsconfig.base.json` sets `exactOptionalPropertyTypes: true` workspace-wide, under which that type rejects a caller passing an explicitly-`undefined` property — which is precisely what a consumer spreading a partially-built options object does, and exactly the "computed value came out absent" case this function exists to normalise.
- **Fix:** Both fields are declared `?: ReadonlyArray<string> | undefined`. This widens what callers may pass and narrows nothing; the returned `TagFilter` is unchanged, so plans 09-04 and 09-05 are unaffected on the consuming side.
- **Files modified:** `packages/vitest/src/Tags.ts`
- **Verification:** `pnpm build`, `pnpm typecheck:test` both exit 0; `test/Tags.test.ts` asserts `makeTagFilter({ includeTags: undefined, excludeTags: undefined })` equals `noTagFilter`.
- **Committed in:** `45fecb8`

**2. [Rule 2 — Missing critical functionality] Three prose mentions of `Schema.TaggedError` reworded to keep the acceptance grep's count unchanged**

- **Found during:** Task 3
- **Issue:** The acceptance criterion is `grep -c 'Schema.TaggedError' packages/vitest/src/Errors.ts` unchanged, parenthesised as "neither new type is one". The new doc comments legitimately said "not a `Schema.TaggedError`" three more times, pushing the count 6 → 9 while both new types are plainly interfaces.
- **Fix:** Those three prose mentions read "a tagged `Schema` error class" instead. The count is back to 6, and the only remaining occurrence in a declaration position is `StepMatchError`'s own `extends` clause. No meaning was dropped.
- **Files modified:** `packages/vitest/src/Errors.ts`
- **Verification:** `grep -c 'Schema.TaggedError' packages/vitest/src/Errors.ts` → 6, matching `git show HEAD~1:…` → 6
- **Committed in:** `f1495f0`

**3. [Rule 2 — Missing critical functionality] `spec/traceability.md`'s preamble and §1 updated beyond the §4 row the plan named**

- **Found during:** Tasks 2 and 3
- **Issue:** The plan asked only for a §4 row. But the preamble stated in so many words that `Tags.ts` "remains **planned** and does not exist on disk", and §1's behavior-doc-02 row said `Tags` remains planned — both false the moment Task 1 landed. AGENTS.md §1 makes a code change not reflected in `spec/` in the same commit incomplete, and §4 forbids describing a built thing as planned.
- **Fix:** The preamble moves `Tags.ts` into the real list and leaves `SharedLayer.ts` as the only planned module; §1's row says `Tags.ts` is real as of Phase 9 and adds `Errors.ts` (which now carries BEH-EC-008's two notices) to that row's module list; `Errors.test.ts`'s §4 row gained BEH-EC-008 and a description of the two new notices.
- **Files modified:** `spec/traceability.md`
- **Verification:** `pnpm verify:spec` — PASS 7, FAIL 0
- **Committed in:** `55764ce`, `f1495f0`

**4. [Rule 3 — Blocking] `pnpm install` run to populate the worktree's missing `node_modules`**

- **Found during:** Task 1 verification
- **Issue:** The worktree had no `node_modules`, so `pnpm build` failed with `sh: tsc: command not found`.
- **Fix:** `pnpm install --frozen-lockfile` — the lockfile restored verbatim, 214 packages, 0 downloaded (all reused from store). **No package was added, removed or resolved to a new version**, so the package-legitimacy exclusion on Rule 3 does not apply: nothing was installed that `pnpm-lock.yaml` did not already pin.
- **Files modified:** none tracked
- **Verification:** `git status --short` clean of any lockfile or manifest change
- **Committed in:** n/a (no tracked file changed)

### Documentation corrections

The mutation logs in both test-file headers were rewritten after the mutations were actually run, to
record observed failure counts rather than the predicted ones drafted alongside the tests. AGENTS.md
§4 — a header claiming "three tests fail" when seven do is a statement the file cannot back.

## Known Stubs

None. Both modules are complete for their own scope. The four new `Errors.ts` exports and everything in
`Tags.ts` are deliberately absent from `packages/vitest/src/index.ts` — that is stated in each type's
doc comment and in `Errors.ts`'s closing paragraph, with plan 09-07 named as the owner, following the
convention plans 03-01, 03-02 and 06-07 set. This is a scheduled hand-off, not an unwired stub.

## Threat Model Coverage

| Threat ID | Disposition | Status |
|---|---|---|
| T-09-02-01 | mitigate | **Done.** Every author-controlled component of `makeUndeclaredTagWarning`'s message goes through `quoted` (= `JSON.stringify`); asserted against a tag containing both `"` and `\n`; mutation C proves the assertion discriminates. |
| T-09-02-02 | mitigate | **Done.** Same control and same assertion on `makeExcludedScenariosNotice`. Neither message is ever a test node title. |
| T-09-02-03 | mitigate | **Done.** `undefined` and `[]` both mean no filter, asserted in three separately-named tests, mutation-proven by A (7 failures). |
| T-09-02-04 | mitigate | **Done.** Exact `message.length` pinned per new type against a 1000-character-tag fixture; mutation D proves it. |
| T-09-02-05 | accept-by-avoidance | **Done.** Neither type has a field for the caught error, and neither message renders its text; asserted structurally by an `Object.keys` equality test on `UndeclaredTagWarning`. |
| T-09-02-SC | accept | **Done.** No package added, removed or version-changed. `pnpm install --frozen-lockfile` restored the existing lockfile only. `tinyglobby` belongs to plan 09-07 and was not touched here. |

## Threat Flags

None. Nothing in this plan opens a network endpoint, an auth path, a file-access pattern or a schema
boundary. Both files are pure, synchronous, in-process data transforms with no I/O.

## Notes for Plans 09-04 / 09-05 / 09-07

- `shouldEmit` and `isSkipped` are the only two predicates; `Tags.ts` treats no other tag specially (D-07).
- Pass `noTagFilter` rather than making a filter parameter optional — the sentinel exists so `emitFeature`'s filter argument can be required (`emptyHookSet` is the precedent).
- `makeExcludedScenariosNotice` takes `count`; it does not compute one. It is built once per Feature, never once per excluded Scenario (D-10).
- `makeUndeclaredTagWarning` takes only the OFFENDING tags, not the Scenario's whole tag list.
- Plan 09-07 owns the `index.ts` barrel edit for `UndeclaredTagWarning`, `UndeclaredTagWarningReason`, `ExcludedScenariosNotice` and `ExcludedScenariosNoticeReason`, and any decision about `Tags.ts`.
- If either message is reworded, `UNDECLARED_MESSAGE_LENGTH` (1361) and `BOTH_FILTERS_MESSAGE_LENGTH` (1286) in `test/Errors.test.ts` move with it. That is by design.

## Self-Check: PASSED

All five source/spec files claimed above exist on disk, and all four commits (`45fecb8`, `55764ce`,
`f1495f0`, `11ca87c`) are present in `git log`. Working tree clean; no untracked files. STATE.md and
ROADMAP.md deliberately untouched — this executor ran in a worktree and the orchestrator owns those
writes after the wave.
