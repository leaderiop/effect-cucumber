---
phase: 06-plan-scenario-effect-runner-emission-and-drift-detection
plan: 02
subsystem: testing
tags: [cucumber-expressions, gherkin, step-matching, developer-experience, code-generation]

# Dependency graph
requires:
  - phase: 03-parameter-types-and-step-matching
    provides: "BuiltInParameterTypeMap (StepArgs.ts), createParameterTypeStore/buildRegistry (ParameterTypes.ts), the barrel-import-only rule for @cucumber/cucumber-expressions, and test/expressions-pin.test.ts"
  - phase: 02-loadfeature-parse-compile-correlate
    provides: "ParsedFeature.parameterTypes — the per-parse registry generateStepSnippet is handed"
provides:
  - "generateStepSnippet: an unmatched step's text turned into a copy-pasteable, correctly-typed, correctly-escaped step-definition fragment"
  - "A compile-time-enforced matched set of three: TS_TYPE_BY_PARAMETER_TYPE_NAME, BuiltInParameterTypeMap, and test/expressions-pin.test.ts"
  - "Public export of generateStepSnippet from @effect-cucumber/gherkin, reachable from packages/vitest with no new dependency"
affects: [06-01, 06-03, drift-detection, MATCH-03, undefined-step-errors]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "CucumberExpressionGenerator constructed per call, never memoized — same reasoning as StepMatcher's registry-instance-keyed cache"
    - "Generated code is quoted with JSON.stringify at the injection boundary, extending Validate.ts's precedent from messages to code-shaped output"
    - "A Record<keyof SomeMap, string> annotation used as a drift guard, so an upstream key-set change is a compile error rather than a convention"

key-files:
  created:
    - packages/gherkin/src/Snippet.ts
    - packages/gherkin/test/Snippet.test.ts
  modified:
    - packages/gherkin/src/index.ts

key-decisions:
  - "generateStepSnippet lives in @effect-cucumber/gherkin, not @effect-cucumber/vitest: importing @cucumber/cucumber-expressions from packages/vitest fails with ERR_MODULE_NOT_FOUND under pnpm's isolated layout — reproduced as a negative control during this plan, not assumed"
  - "parameterInfos[i].type is not used as the TypeScript type source; it is a JS constructor name and is wrong for {bigdecimal} and {biginteger}. The BuiltInParameterTypeMap-keyed record is used instead"
  - "A parameter type name that is not a bindable identifier is substituted with a positional argN. The reachable case is a hyphenated CUSTOM name (verified: ParameterType.isValidParameterTypeName('ripe-fruit') === true), not the anonymous {} built-in the plan named"
  - "Reserved words are rejected alongside non-identifier shapes, because the emitted body is a generator and {yield} is a legal parameter type name upstream"

patterns-established:
  - "Drift guard by annotation: a Record<keyof X, string> literal whose key set upstream owns turns an upstream addition into a compile error in every file that mirrors it"
  - "Escaping proven by round trip: the quote/backslash tests slice the emitted string literal back out of the snippet and JSON.parse it, so the assertion cannot be satisfied by hand-added quoting"

requirements-completed: [MATCH-03]

# Metrics
duration: 11min
completed: 2026-08-29
---

# Phase 6 Plan 02: Step-Definition Snippet Generation Summary

**`generateStepSnippet` turns an unmatched step's text into a compiling, correctly-escaped `Given("I have {int} apples", function*(int: number) {...})` fragment, generalising literals into cucumber-expression parameters and typing them from the eleven built-ins' verified transform outputs.**

## Performance

- **Duration:** 11 min
- **Started:** 2026-08-29T04:03:00Z
- **Completed:** 2026-08-29T04:14:00Z
- **Tasks:** 2
- **Files modified:** 3 (2 created, 1 modified)

## Accomplishments

- `generateStepSnippet({ keyword, text, registry })` delivers CONTEXT.md D-01's suggested step definition: literals generalised to `{int}`/`{string}`/custom types via upstream's `CucumberExpressionGenerator`, repeats disambiguated (`int`, `int2`), and every parameter annotated with the TypeScript type its transform really produces.
- The eleven-name TypeScript-type record is annotated `Record<keyof BuiltInParameterTypeMap, string>`, and that annotation was **proven load-bearing**: deleting the anonymous `""` entry produces `TS2741` at `pnpm build`, so this record, `StepArgs.ts`'s `BuiltInParameterTypeMap` and `test/expressions-pin.test.ts` cannot drift apart silently.
- The pattern is rendered with `JSON.stringify` (threat T-06-02-01), so a step text carrying `"`, `\` or a newline cannot terminate the emitted string literal. Both the escaped form and a `JSON.parse` round trip are asserted.
- Exported from the gherkin barrel next to the step-matching group, and **verified reachable from `packages/vitest`** — while a direct `import("@cucumber/cucumber-expressions")` from that same package still fails with `ERR_MODULE_NOT_FOUND`, which is the whole reason the module lives where it does.
- No new dependency: `packages/vitest/package.json` and `pnpm-lock.yaml` are both byte-unchanged.

## Task Commits

Each task was committed atomically. Task 1 followed the RED/GREEN cycle:

1. **Task 1 (RED): failing test for `generateStepSnippet`** — `6cf282a` (test)
2. **Task 1 (GREEN): implement `generateStepSnippet`** — `505bbdb` (feat)
3. **Task 2: export `generateStepSnippet` from the gherkin barrel** — `d376b72` (feat)

No REFACTOR commit: the GREEN implementation needed no cleanup, and an empty refactor commit would be noise.

## Files Created/Modified

- `packages/gherkin/src/Snippet.ts` (created) — `generateStepSnippet`, the built-in TypeScript-type record and its drift-guard annotation, and the identifier/reserved-word check that keeps a hyphenated or reserved parameter type name from emitting a syntax error.
- `packages/gherkin/test/Snippet.test.ts` (created) — nine behavioural tests plus the mutation record (A and B), covering built-in generalisation, repeated parameters, empty parameter lists, verbatim keyword, quote and backslash escaping, custom parameter types annotated `unknown`, non-identifier names substituted positionally, and the exact three-line shape.
- `packages/gherkin/src/index.ts` (modified) — public export with its own group doc comment, placed beside `createStepMatcher`/`compileExpression`.

## Verification

All plan gates pass:

| Gate | Result |
|------|--------|
| `pnpm vitest run packages/gherkin/test/Snippet.test.ts` | 9 tests passed (plan required ≥ 6) |
| `pnpm build` | exit 0 |
| `pnpm lint` (oxlint + dprint) | exit 0 |
| `pnpm test` | 436 tests, 21 files, all passed |
| `pnpm typecheck:test` | exit 0 |
| `pnpm verify:no-runner-dep` | ENFORCED |
| `pnpm verify:pack` | pack shape OK, publint clean for both packages |
| `pnpm circular` | no circular dependency |
| `pnpm verify:spec` | PASS 7 / FAIL 0 / SKIP 1 |

Acceptance-criteria greps on `packages/gherkin/src/Snippet.ts`: `from "@cucumber/cucumber-expressions"` = 2, `cucumber-expressions/dist` = 0, `JSON.stringify` = 2, `from "effect` = 0, `eval(`/`new Function` = 0, `Record<keyof BuiltInParameterTypeMap, string>` = 2.

Cross-package and no-new-dependency checks: `import("@effect-cucumber/gherkin")` from `packages/vitest` exits 0 with `typeof generateStepSnippet === "function"`; `grep -c cucumber-expressions packages/vitest/package.json` = 0; `git diff --stat pnpm-lock.yaml` empty; `packages/gherkin/package.json`'s `exports` and `publishConfig.exports` key sets both `['.', './package.json']`.

### Mutations performed, observed failing, and reverted

- **A.** Pattern rendered with a plain `"${pattern}"` interpolation instead of `JSON.stringify(pattern)` → both escaping tests failed; the backslash test failed with `SyntaxError: Bad escaped character in JSON`, which is the injection control failing in the most literal possible way.
- **B.** Unknown-parameter-type fallback changed from `?? "unknown"` to `?? "any"` → both custom-parameter-type tests failed, showing `function*(arg1: any)` where `unknown` was expected.
- **C (extra, not required by the plan).** The anonymous `""` entry deleted from `TS_TYPE_BY_PARAMETER_TYPE_NAME` → `pnpm build` failed with `TS2741: Property '""' is missing`. Run because the module doc comment claims the annotation makes drift a compile error, and AGENTS.md §4 forbids asserting an enforcement mechanism that has not been observed working.

## Decisions Made

- **Reserved words are rejected alongside non-identifier shapes.** `ParameterType.isValidParameterTypeName` rejects only `[ ] ( ) $ . | ? * +`, so `{yield}`, `{class}` and `{new}` are all legal parameter types today. The emitted body is a **generator**, where `yield` cannot be a parameter name even in sloppy mode, so a shape-only check would emit a syntax error for a legal input. Cost is one frozen `Set`.
- **The identifier-shape test is ASCII-only.** Being wrong in the permissive direction emits a snippet that does not parse; being wrong in the strict direction costs a positional `arg1` instead of a nicer name. The asymmetry decides it.
- **No REFACTOR pass.** The GREEN implementation was already at its final shape.

## Deviations from Plan

### Corrections to plan claims

**1. [Rule 1 — Bug] The plan's stated reachable case for the positional-name fallback was wrong; the fallback is still needed, for a different reason**

- **Found during:** Task 1
- **Issue:** The plan said "the anonymous `{}` built-in's registry name is the empty string, so this is a reachable case, not defensive padding." Probing the installed `@cucumber/cucumber-expressions@20.1.0` shows the anonymous built-in has `useForSnippets: false` (as do `word`, `double`, `bigdecimal`, `byte`, `short`, `long`, `biginteger`), so `generateExpressions` **never** emits it and the empty-string name is unreachable through this code path. Writing the plan's rationale into the doc comment would have violated AGENTS.md §4.
- **Fix:** Kept the fallback — it is genuinely reachable — but re-justified it against a case that was verified rather than assumed: a **custom** parameter type whose name is legal upstream but is not a bindable identifier. Verified `ParameterType.isValidParameterTypeName("ripe-fruit") === true`, and that a registry carrying it generalises `"I eat an apple now"` to `"I eat an {ripe-fruit} now"` with `parameterNames: ["ripe-fruit"]`. That is the case the test now pins, and it exercises the `unknown` fallback at the same time. The doc comment and the test comment both state the hyphen reason, not the empty-string one.
- **Files modified:** `packages/gherkin/src/Snippet.ts`, `packages/gherkin/test/Snippet.test.ts`
- **Verification:** "substitutes a positional name for a parameter type name that is not a JavaScript identifier" passes and asserts `function*(arg1: unknown)`.
- **Committed in:** `505bbdb` / `6cf282a`

**2. [Rule 2 — Missing critical] Reserved-word rejection added to the identifier check**

- **Found during:** Task 1
- **Issue:** The plan specified "not a valid JavaScript identifier". A shape-only regex accepts `yield`, `class`, `new` and `function`, all of which are legal cucumber parameter type names and all of which produce a snippet that does not parse — `yield` most sharply, since the emitted body is a generator. Emitting non-compiling code from a function whose entire purpose is "paste this" is a correctness failure, not a nicety.
- **Fix:** Added a frozen `reservedWords` set checked alongside the shape regex, documented with the `yield`-in-a-generator rationale.
- **Files modified:** `packages/gherkin/src/Snippet.ts`
- **Verification:** `pnpm build`, `pnpm lint`, full suite green; the behaviour shares the `argN` path the hyphen test pins.
- **Committed in:** `505bbdb`

**3. [Rule 3 — Blocking] Workspace dependencies restored in the worktree**

- **Found during:** Setup, before Task 1
- **Issue:** The freshly-created worktree had no `node_modules`, so nothing could be built, linted or run.
- **Fix:** `pnpm install --frozen-lockfile` — a restore from the committed lockfile, not a package addition. No package name was resolved from the network that the lockfile did not already pin, so the plan's T-06-02-SC "this plan installs nothing new" disposition is intact.
- **Verification:** `git status --short` clean immediately afterwards; `git diff --stat pnpm-lock.yaml` empty at plan end.
- **Committed in:** nothing to commit (`node_modules` is gitignored)

### Additions beyond the plan

**4. Two extra tests and one extra mutation.** The plan required ≥ 6 tests and mutations A and B. Delivered 9 tests — adding a backslash-escaping case (the one that fails mutation A most legibly) and an exact-whole-string assertion pinning the three-line shape — and a third mutation (C, above) verifying the drift-guard claim the module doc comment makes.

---

**Total deviations:** 3 auto-fixed (1 bug/plan-claim correction, 1 missing critical, 1 blocking) + 1 scope addition.
**Impact on plan:** Every deviation is inside the plan's two declared source files and serves an acceptance criterion or an AGENTS.md §4 truthfulness obligation. No new dependency, no new published surface beyond the single planned export, no scope creep.

## Issues Encountered

- The worktree started at commit `f640f4a`, one behind the plan's stated base `18f7b10`. Corrected with `git reset --hard 18f7b10` after the branch-namespace assertion passed, per the startup protocol.
- Getting a raw `"` into a *generated pattern* is harder than it looks: `the user "bob" logs in` generalises to `the user {string} logs in`, consuming the quotes entirely. The escaping test therefore uses `I have 5 "apples` (an unbalanced quote), which upstream leaves in the source as `I have {int} "apples` — a pattern that carries both a parameter and a raw quote, which is exactly what the test needs.

## Known Stubs

None. The literal `// TODO: implement this step` in `Snippet.ts` is **product output** — it is the body of the snippet handed to the developer to fill in — not an unfinished branch in this codebase. A verifier grepping for `TODO` will find it and should not flag it.

## Threat Flags

None. `generateStepSnippet` introduces no network endpoint, no auth path, no file access and no schema change. Its one trust boundary (author-controlled `.feature` text reaching a code-shaped output string) is T-06-02-01 in the plan's own register, mitigated by `JSON.stringify` and pinned by mutation A. `grep -c 'eval(\|new Function'` returns 0, which is T-06-02-02's stated check.

## Deferred Items

- **`spec/` does not yet describe `generateStepSnippet`.** AGENTS.md §1 asks that a public-behaviour change land with its spec update in the same commit. This was deliberately not done here: the plan's `files_modified` declares three source files and no spec file, sibling agents 06-01 and 06-03 are executing in parallel against the same phase, and the function is not reachable from any user-facing behaviour until the vitest Plan stage consumes it. The natural home is an amendment to ADR-EC-019 / BEH-EC-013 recording the suggested-snippet addition (CONTEXT.md D-01), made once in the phase-closing plan that actually wires the undefined-step error. `pnpm verify:spec` passes today (7 PASS / 0 FAIL).

## Next Phase Readiness

- `generateStepSnippet` is importable from `@effect-cucumber/gherkin` inside `packages/vitest` today, verified by running it. Whichever plan builds the undefined-step error can call it directly: `generateStepSnippet({ keyword: step.keyword.trim(), text: pickleStep.text, registry: parsedFeature.parameterTypes })`.
- Note for the caller: the returned string has **no trailing newline** and no surrounding punctuation, by design — the error-message builder adds its own, matching `StepPatternMessages.ts`'s `sentences.join(" ")` convention.
- No blockers. No shared orchestrator artifacts (`STATE.md`, `ROADMAP.md`) were touched, per the parallel-execution contract.

## Self-Check: PASSED

Files verified present: `packages/gherkin/src/Snippet.ts`, `packages/gherkin/test/Snippet.test.ts`, `packages/gherkin/src/index.ts`, `.planning/phases/06-plan-scenario-effect-runner-emission-and-drift-detection/06-02-SUMMARY.md`.

Commits verified on `worktree-agent-a52f869bae8036753`: `6cf282a`, `505bbdb`, `d376b72`, `3b25ca8` — all four descend from the plan base `18f7b10`.

---
*Phase: 06-plan-scenario-effect-runner-emission-and-drift-detection*
*Completed: 2026-08-29*
