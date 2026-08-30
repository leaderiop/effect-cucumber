---
phase: 02-loadfeature-parse-compile-correlate
reviewed: 2026-08-28T13:19:50Z
depth: standard
files_reviewed: 22
files_reviewed_list:
  - .github/workflows/check.yml
  - package.json
  - packages/gherkin/package.json
  - packages/gherkin/src/Correlate.ts
  - packages/gherkin/src/Errors.ts
  - packages/gherkin/src/Model.ts
  - packages/gherkin/src/Parser.ts
  - packages/gherkin/src/Pickles.ts
  - packages/gherkin/src/Source.ts
  - packages/gherkin/src/Validate.ts
  - packages/gherkin/src/index.ts
  - packages/gherkin/src/loadFeature.ts
  - packages/gherkin/test/Contracts.test.ts
  - packages/gherkin/test/Correlate.test.ts
  - packages/gherkin/test/Parser.test.ts
  - packages/gherkin/test/Validate.test.ts
  - packages/gherkin/test/dialect.test.ts
  - packages/gherkin/test/feature-raw.d.ts
  - packages/gherkin/test/loadFeature.test.ts
  - packages/gherkin/test/upstream-pin.test.ts
  - packages/gherkin/tsconfig.json
  - packages/gherkin/tsconfig.test.json
  - scripts/verify-no-runner-dep.sh
findings:
  critical: 0
  warning: 2
  info: 2
  total: 4
status: issues_found
---

# Phase 2: Code Review Report

**Reviewed:** 2026-08-28T13:19:50Z
**Depth:** standard
**Files Reviewed:** 22
**Status:** issues_found

## Summary

`@effect-cucumber/gherkin`'s parse/compile/correlate/validate pipeline is unusually well
documented and its zero-runtime-dependency-on-a-runner constraint (ADR-EC-015) is
mechanically enforced by `scripts/verify-no-runner-dep.sh`, which was not flagged here — that
is an intentional, correctly implemented architectural boundary, not an omission. `Source.ts`'s
lack of path sanitisation is likewise a documented, accepted decision (threat T-02-03) and is
not re-flagged. No hardcoded secrets, no `eval`/dangerous-function usage, no empty catch
blocks, and no debug artifacts were found by pattern scan.

Two real defects were found by tracing the code rather than trusting the docstrings on their
word: (1) `validateFeature`'s two-pass structure means a `LoadFeatureError` is not actually
thrown in strict document order across check categories, contradicting the module's own stated
contract, and (2) `packages/gherkin/package.json` ships `@cucumber/cucumber-expressions` as a
runtime `dependency` that is imported nowhere in `src/` or `test/`, adding an unused
consumer-facing dependency to a package whose entire design philosophy (stated repeatedly in
the docstrings) is minimal surface area. Two lower-severity observations are also recorded.

## Warnings

### WR-01: `validateFeature` does not throw errors in strict document order across check categories, contradicting its own documented contract

**File:** `packages/gherkin/src/Validate.ts:633-693`
**Issue:**

The module docstring (lines 22-25) states: *"It throws on the FIRST error in document order,
deterministically, so a fixture can assert *which* error fired."* `validateFeature` implements
this as two **separate, sequential** loops over `index.astScenarios`:

1. Lines 633-661: the Group A structural loop — `OutlineWithoutExamples`, `EmptyExamples`,
   `ScenarioKeywordWithExamples`, `ZeroStepScenario`, `DuplicateScenarioName`. This loop runs to
   completion over **every** node before the function proceeds.
2. Lines 679-693: the placeholder scan loop — `UninterpolatedPlaceholder` — which only begins
   after loop 1 has finished without throwing.

Because loop 1 must exhaust the *entire* document before loop 2 examines even its first node, a
feature file with an early `UninterpolatedPlaceholder` defect (say, at line 5) and a later Group
A defect (say, a `DuplicateScenarioName` at line 40) will throw `DuplicateScenarioName`, not the
earlier `UninterpolatedPlaceholder` — even though the placeholder problem occurs first in the
document. This is not a hypothetical: the two check categories are structurally independent
(different loops, different node subsets), so any file combining an Outline placeholder defect
with a later structural defect elsewhere in the same file exhibits this. No fixture in
`test/fixtures/` combines two different error categories in one file, so the gap is untested and
will not be caught by CI.

This matters because `loadFeature` throws at module top level (per `loadFeature.ts`'s own
docstring), so the *one* message a vitest collection error shows is whatever this function
happened to throw first — and per this bug, that is not reliably the earliest defect in the
file, contrary to the explicit, load-bearing claim in the module doc that a fixture can assert
"which error fired" based on document order.

**Fix:** Merge the two passes into one loop over `index.astScenarios`, running the placeholder
scan for a node immediately after that node's Group A checks (or collect all candidate errors
into one array annotated with their line, then throw the minimum-line one) before advancing to
the next node in document order. Example sketch:

```ts
for (const node of index.astScenarios) {
  // ...existing Group A checks (outline/examples, zero-step, duplicate-name)...

  // Run the placeholder scan for THIS node here, not in a later pass, so any
  // UninterpolatedPlaceholder found on this node is compared against this
  // node's own Group A errors by actual source line, and both compete fairly
  // against errors on later nodes.
  const columns = index.exampleColumns.get(node.id)
  if (columns !== undefined && columns.size > 0 && isOutlineKeyword(index.language, node.keyword)) {
    for (const pickle of index.byScenarioId.get(node.id) ?? []) {
      for (const leftover of scanPlaceholders(pickle)) {
        const info = astStepOf(leftover.step, index.byStepId)
        if (columns.has(leftover.name)) {
          throw uninterpolatedPlaceholder(uri, node, leftover, info)
        }
        warnings.push(unknownPlaceholder(uri, node, leftover, info, columns))
      }
    }
  }
}
```

### WR-02: `@cucumber/cucumber-expressions` is a declared runtime dependency but is never imported

**File:** `packages/gherkin/package.json:47-51`
**Issue:** `dependencies` lists `"@cucumber/cucumber-expressions": "^20.1.0"` alongside
`@cucumber/gherkin` and `@cucumber/messages`. A repo-wide search confirms nothing under
`packages/gherkin/src/` or `packages/gherkin/test/` imports `@cucumber/cucumber-expressions` —
only `@cucumber/gherkin` and `@cucumber/messages` are actually used (verified: `grep -rn
"cucumber-expressions" packages/gherkin/src packages/gherkin/test` returns no matches). This
ships an unused package to every consumer of `@effect-cucumber/gherkin`, contradicting the
package's own stated design goal of minimal dependency surface (the same philosophy that
motivates ADR-EC-015 and the `verify-no-runner-dep.sh` gate), and it is not caught by that gate
because the script only checks for `vitest`, `@effect/vitest`, and `effect` — not for genuinely
unused dependencies in general.
**Fix:** Remove `@cucumber/cucumber-expressions` from `dependencies` in
`packages/gherkin/package.json` unless it is intended for a near-future phase, in which case
defer adding it until it is actually imported (YAGNI — nothing in this phase's fixture table or
`ADR-EC-014` references cucumber expressions matching).

## Info

### IN-01: `StepKeywordType` is exported only as a type, so consumers cannot reference its runtime enum members without adding `@cucumber/messages` themselves

**File:** `packages/gherkin/src/Model.ts:163`, `packages/gherkin/src/index.ts:27-40`
**Issue:** `StepKeywordType` is a real TypeScript `enum` in `@cucumber/messages` (`UNKNOWN`,
`CONTEXT`, `ACTION`, `OUTCOME`, `CONJUNCTION` — confirmed in
`@cucumber/messages`'s `messages.d.ts`), not a string-literal type alias. `ParsedStep.keywordType`
(`Model.ts:59`) exposes it as a first-class, consumer-facing field — unlike `document` and
`pickles`, which the package's own docstring calls "escape hatches." Both `Model.ts:163` and
`index.ts:27-40` re-export `StepKeywordType` with `export type { ... }` only, so a consumer who
wants to branch on `step.keywordType === StepKeywordType.Conjunction` cannot get the enum's
runtime value from `@effect-cucumber/gherkin` — they must add `@cucumber/messages` as their own
dependency to reference the enum members, which is exactly the burden `index.ts`'s docstring
says the `@cucumber/messages` re-export exists to avoid ("Without the re-export a consumer
reading either escape hatch would be forced to declare `@cucumber/messages` themselves").
**Fix:** Re-export `StepKeywordType` as a value as well as a type (`export { StepKeywordType }`
in addition to, or instead of, `export type { StepKeywordType }`), since `keywordType` is a
first-class field of the public `ParsedStep` contract, not merely an escape hatch.

### IN-02: `ParseFailed` is reused as the reason tag for both parse-stage and compile-stage failures

**File:** `packages/gherkin/src/Pickles.ts:37-42`, `packages/gherkin/src/Parser.ts:147-153`
**Issue:** `Parser.ts` throws `reason: "ParseFailed"` for a genuine `@cucumber/gherkin` parse
error, and `Pickles.ts` throws the *same* `reason: "ParseFailed"` when `compile()` itself throws
(a distinct upstream call, at a distinct pipeline stage, with a distinct message prefix "Failed
to compile pickles for..."). `LoadFeatureErrorReason`'s own doc comment
(`Errors.ts:39-41`) states "One member per Group A / Group B row of the phase fixture table," implying
one tag per distinct failure mode, yet these two genuinely different upstream failure sources
collapse onto one tag. A consumer discriminating purely on `err.reason === "ParseFailed"` (the
pattern this package's own tests use throughout, e.g. `Validate.test.ts`) cannot tell whether
parsing or compiling failed without inspecting the message text, which the rest of the design
otherwise goes out of its way to avoid (see `Contracts.test.ts`'s comment: "Assertions target
`err.reason`, never message text.").
**Fix:** Either document explicitly that `ParseFailed` is deliberately shared across both
stages (a one-line addition to `LoadFeatureErrorReason`'s doc comment), or give the `compile()`
failure path in `Pickles.ts` its own reason tag (e.g. `CompileFailed`) for symmetry with the
rest of the reason-tag design.

---

_Reviewed: 2026-08-28T13:19:50Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
