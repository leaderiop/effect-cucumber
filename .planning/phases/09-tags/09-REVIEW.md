---
phase: 09-tags
reviewed: 2026-08-29T23:44:19Z
depth: standard
files_reviewed: 31
files_reviewed_list:
  - .github/workflows/check.yml
  - packages/vitest/README.md
  - packages/vitest/package.json
  - packages/vitest/src/Errors.ts
  - packages/vitest/src/GherkinTags.ts
  - packages/vitest/src/Plan.ts
  - packages/vitest/src/Runner.ts
  - packages/vitest/src/Tags.ts
  - packages/vitest/src/TestApi.ts
  - packages/vitest/src/describeFeature.ts
  - packages/vitest/src/index.ts
  - packages/vitest/test/Errors.test.ts
  - packages/vitest/test/GherkinTags.test.ts
  - packages/vitest/test/GherkinTags.types.ts
  - packages/vitest/test/Plan.test.ts
  - packages/vitest/test/Runner.test.ts
  - packages/vitest/test/ScenarioEffect.test.ts
  - packages/vitest/test/Tags.test.ts
  - packages/vitest/test/emission.test.ts
  - packages/vitest/test/fixtures/tag-scan-a.feature
  - packages/vitest/test/fixtures/tag-scan-docstring.feature
  - packages/vitest/test/fixtures/tag-scan-nested/tag-scan-b.feature
  - scripts/verify-tags-filter.sh
  - scripts/verify-testapi-seam.sh
  - spec/behaviors/02-shared-layers-and-tags.md
  - spec/behaviors/07-hook-ordering-and-guarantees.md
  - spec/decisions/020-vitest-native-tags-for-skip-only.md
  - spec/decisions/026-registration-time-tag-filtering-and-declared-tag-universe.md
  - spec/decisions/index.yaml
  - spec/roadmap.md
  - spec/traceability.md
findings:
  critical: 1
  warning: 1
  info: 0
  total: 2
status: issues_found
---

# Phase 09-tags: Code Review Report

**Reviewed:** 2026-08-29T23:44:19Z
**Depth:** standard
**Files Reviewed:** 31
**Status:** issues_found

## Summary

This phase's implementation is unusually well documented and heavily mutation-tested (`Plan.ts`,
`Runner.ts`, `Tags.ts`, `Errors.ts`, `describeFeature.ts`, and both `.test.ts` files carry extensive
"mutation-tested" ledgers). I ran the full `packages/vitest` suite (`329 passed | 3 skipped`, 14 files)
and `test/Errors.test.ts` in isolation; both are green, matching the phase's own claims.

Despite that rigor, I found and **reproduced against the real, unmodified `gherkinTags` implementation**
a genuine correctness defect in `GherkinTags.ts`'s DocString-fence tracking: a DocString that contains
an embedded, unbalanced (odd count) fence-shaped line — content most plausibly arising from someone
documenting a JSON/markdown payload with a code block inside a Gherkin `"""`/` ``` ` DocString — silently
desynchronizes the scanner's in/out-of-DocString state for the rest of the file. Every real `@tag` line
that follows the corrupted DocString is then silently dropped from the returned declaration list. This
directly contradicts the module's own documented design invariant (over-declaring is safe,
**under-declaring "costs a whole file its tests"** — see `GherkinTags.ts`'s own note (b)) and its
explicit claim that DocString content "is tracked out" (note (f)). No existing fixture or test exercises
this path, so the regression currently ships with a fully green test suite.

The rest of the reviewed surface — `Tags.ts`, `Errors.ts`'s four data/warning shapes, `Plan.ts`'s
scope-chain resolution, `Runner.ts`'s emission walk (including the `BeforeAllScenarios`/
`AfterAllScenarios` once-cell and the registration-time tag filter), and `describeFeature.ts`'s
catch-and-degrade adapter — held up under adversarial tracing: I could not find a discrepancy between
the documented contract, the code, and the (extensive) test suite for any of those modules.

## Critical Issues

### CR-01: `gherkinTags` silently drops every tag after a DocString containing an unbalanced embedded fence line

**File:** `packages/vitest/src/GherkinTags.ts:106` and `packages/vitest/src/GherkinTags.ts:129-145`

**Issue:**

`isDocStringFence` treats **both** `"""` and `` ``` `` as interchangeable DocString delimiters, and the
scan loop tracks DocString membership with a single boolean that is toggled by *either* fence character:

```ts
const isDocStringFence = (trimmed: string): boolean => trimmed.startsWith("\"\"\"") || trimmed.startsWith("```")
...
for (const file of globSync(patterns, { dot: false, onlyFiles: true })) {
  let insideDocString = false
  for (const line of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim()
    if (isDocStringFence(trimmed)) {
      insideDocString = !insideDocString
      continue
    }
    if (insideDocString || !trimmed.startsWith("@")) continue
    ...
```

Real Gherkin DocStrings support **both** `"""` and `` ``` `` fences precisely so that content opened
with one fence type can safely contain literal instances of the *other* fence type without ending the
DocString early — the closing fence must match the opening one. This implementation does not track
*which* fence opened a DocString; it treats every occurrence of either fence character as a toggle. Any
DocString body that contains a bare line starting with the *other* fence character (or an odd number of
extra same/other-fence-shaped lines, e.g. someone pasting an example Markdown code block or another
Gherkin snippet into a step's payload) desynchronizes `insideDocString` from reality. Once desynchronized,
the corruption is **not self-correcting**: the real closing fence itself gets consumed as one more toggle,
so the state can come out flipped for the remainder of the file, and every `@tag` line that follows —
possibly on Scenarios, Rules or the next Feature entirely — is silently excluded from the returned list.

This is not a hypothetical corner case. I reproduced it against the actual, unmodified source:

```
Feature: repro
  Scenario: docstring with embedded backtick fences
    Given a payload:
      """
      before code block:
      ```
      example code
      ```
      after code block, still inside docstring:
      ```
      unterminated example remains open
      """
    Then it works

  @realtag
  Scenario: this tag should be captured
    Given a step
```

Calling the real `gherkinTags()` against this file returns `[]` — `@realtag` is silently dropped.

Given `GherkinTags.ts`'s own documented design ("A MISTYPED pattern silently declares nothing... What
compensates for it is downstream" — note (b) — plus the whole point of `gherkinTags` being to keep a
runner's `test.tags` list from silently going stale), this is exactly the failure mode the module set
out to avoid: it under-declares a tag with no warning, no throw, and no test failure anywhere. Downstream,
the affected Scenario's tag becomes "undeclared" as far as the runner is concerned, so `--tagsFilter`
cannot select it, and (per D-08) every run of that suite prints an `UndeclaredTagWarning` the maintainer
has no reason to associate with an unrelated DocString elsewhere in the tree.

No fixture in `packages/vitest/test/fixtures/` exercises a DocString containing an embedded fence-shaped
line, so `packages/vitest/test/GherkinTags.test.ts`'s existing 9 tests (including the one dedicated
DocString test, `tag-scan-docstring.feature`, which contains no embedded fence) do not catch this.

**Fix:**

Track which fence character opened the DocString, and only close on the same one:

```ts
/** Which fence, if any, currently opens a DocString — `null` means "not inside one". */
type DocStringFence = "\"\"\"" | "```" | null

const openingFence = (trimmed: string): Exclude<DocStringFence, null> | null =>
  trimmed.startsWith("\"\"\"") ? "\"\"\"" : trimmed.startsWith("```") ? "```" : null

...

for (const file of globSync(patterns, { dot: false, onlyFiles: true })) {
  let fence: DocStringFence = null

  for (const line of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim()

    if (fence === null) {
      const opened = openingFence(trimmed)
      if (opened !== null) {
        fence = opened
        continue
      }
    } else if (trimmed.startsWith(fence)) {
      fence = null
      continue
    }

    if (fence !== null || !trimmed.startsWith("@")) continue

    for (const token of trimmed.split(/\s+/)) {
      if (token.startsWith("@")) names.add(token)
    }
  }
}
```

Add a regression fixture (e.g. `tag-scan-docstring-nested-fence.feature`) with a DocString containing an
embedded, unbalanced fence line followed by a real `@tag`-bearing Scenario, and assert the tag is still
captured.

## Warnings

### WR-01: No test coverage exists for mismatched/nested DocString fences, letting CR-01 ship silently

**File:** `packages/vitest/test/GherkinTags.test.ts` (whole file); fixtures under
`packages/vitest/test/fixtures/`

**Issue:** `GherkinTags.test.ts` has one DocString test (`tag-scan-docstring.feature`), and that fixture
contains a single, cleanly-closed `"""` pair with no embedded fence-shaped content. Given the module's
own doc comment explicitly calls out DocString handling as a deliberate, non-trivial exception to an
otherwise "dumb" text scan (note (f): "Its one exception is DocString content... and is tracked out"),
and given the accepted failure mode for a mistyped pattern is explicitly discussed and mitigated
elsewhere (note (b)), the DocString-fence logic itself needed a test exercising both fence characters
and an unbalanced/nested case — the exact combination this review found broken.

**Fix:** Alongside the CR-01 fix, add a fixture and test case with:
1. a DocString opened with `"""` whose body contains a bare `` ``` `` line, and
2. at least one real `@tag`-bearing Scenario after it,

then assert the tag is still present in the result. This closes the coverage gap that let CR-01 pass a
build with 100% green tests and pin `isDocStringFence`'s fence-matching behavior explicitly rather than
implicitly.

---

_Reviewed: 2026-08-29T23:44:19Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
