---
phase: 03-parameter-types-and-step-matching
plan: 02
subsystem: testing
tags: [cucumber-expressions, type-level, template-literal-types, parameter-types, typescript, ci-gate]

# Dependency graph
requires:
  - phase: 03-parameter-types-and-step-matching
    plan: 01
    provides: "test/expressions-pin.test.ts — the runtime pin of the same eleven built-in parameter types this module declares at the type level"
  - phase: 02-loadfeature-parse-compile-correlate
    provides: "packages/gherkin/src/Model.ts (the types-only module convention), packages/gherkin/tsconfig.test.json + the `pnpm typecheck:test` CI step this type test rides on"
provides:
  - "BuiltInParameterTypeMap — the eleven built-in parameter type names mapped to their verified TypeScript types, including biginteger -> bigint and bigdecimal -> string"
  - "StepArgs<P, Custom> — a cucumber-expression pattern string literal resolved to the tuple of coerced argument types, usable directly as a rest-parameter list"
  - "packages/gherkin/test/StepArgs.types.ts — 18 exact-equality positives + 6 @ts-expect-error negatives, compiled by pnpm typecheck:test, never collected by vitest"
affects: [03-03, 03-04, 03-05, 03-06, phase-05-dsl-given-when-then]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Recursive template-literal inference on brace pairs (never per character) to walk a pattern literal without exhausting instantiation depth"
    - "A compiled-but-never-executed `.types.ts` probe: type-checked by tsconfig.test.json, invisible to vitest's include glob"
    - "Exact type EQUALITY assertions (mutually-assignable conditionals) rather than assignability, so a type widened to unknown cannot pass"

key-files:
  created:
    - packages/gherkin/src/StepArgs.ts
    - packages/gherkin/test/StepArgs.types.ts
  modified: []

key-decisions:
  - "StepArgs recurses on brace pairs, not characters — a per-character walk hits TS2589 on a realistic step pattern; the doc comment records the prohibition"
  - "An unregistered {name} resolves to `unknown`, not to a compile error, because a custom parameter type is runtime data; the `Custom` type parameter is the escape hatch"
  - "Built-ins beat the `Custom` map deliberately, mirroring the runtime rule that defineParameterType rejects an already-registered name"
  - "The type test asserts exact equality, not assignability, and both directions are proven load-bearing by two recorded mutations"
  - "StepArgs is deliberately NOT exported from src/index.ts yet — it becomes public API in the plan that ships the matcher surface consumers can reach"

# Copied verbatim from 03-02-PLAN.md's `requirements` field. STILL PENDING in REQUIREMENTS.md
# on purpose: this plan ships the type-level half of MATCH-01; the runtime half (03-04) and the
# public surface (03-03/03-06) are what let the requirement be claimed end to end. Same reasoning
# and same precedent (PARSE-01..03 marked at 02-09) as 03-01 recorded.
requirements-completed: [MATCH-01]

# Metrics
duration: 7min
completed: 2026-08-28
---

# Phase 03 Plan 02: StepArgs — Type-Level Parameter Coercion Summary

**`StepArgs<"I have {int} cukes">` is now exactly the tuple `[number]`, and the claim is held up by exact-equality assertions and `@ts-expect-error` negatives inside a required CI type-check — both directions proven non-vacuous by a recorded mutation.**

## Performance

- **Duration:** ~7 min
- **Started:** 2026-08-28T14:54:54Z
- **Completed:** 2026-08-28T15:02:00Z
- **Tasks:** 2
- **Files modified:** 2 (both created)

## Accomplishments

- `packages/gherkin/src/StepArgs.ts` (131 lines) declares `BuiltInParameterTypeMap` — all eleven built-ins, each carrying the type the installed `@cucumber/cucumber-expressions@20.1.0` was **observed** to produce, not the intuitive one — and `StepArgs<P, Custom>`, which resolves a pattern string literal to the tuple of argument types a step body receives.
- The module has **zero imports** and emits **zero runtime statements**: the compiled `dist/StepArgs.js` is the module doc comment, the bare `export {}` that workspace-wide `moduleDetection: "force"` requires of every file, and the sourcemap pragma. It joins `Errors.ts` as a leaf of the package's module DAG.
- `packages/gherkin/test/StepArgs.types.ts` (160 lines) asserts MATCH-01's type-level claim with **18 positive exact-equality assertions** (17 `expectTrue` calls plus the rest-parameter assignment) and **6 `@ts-expect-error` negatives**, each a separately named exported const so a failure names itself.
- The type test is compiled by `pnpm typecheck:test` — a required step in `check.yml`'s `types` job — and is **not** collected by vitest: `pnpm vitest list | grep -c 'StepArgs.types'` is 0, and the suite is unchanged at **273 tests across 11 files**, exactly the count 03-01 left behind.
- `pnpm build`, `pnpm lint`, `pnpm circular`, `pnpm typecheck:test` and `pnpm test` all exit 0.

## Task Commits

Each task was committed atomically:

1. **Task 1: Create src/StepArgs.ts — BuiltInParameterTypeMap and StepArgs<P, Custom>** — `fabab63` (feat)
2. **Task 2: Create test/StepArgs.types.ts — the MATCH-01 type test** — `2f72bb1` (test)

## What `StepArgs` Actually Resolves

Every row below is asserted by a named const in `test/StepArgs.types.ts`:

| Pattern | Resolves to | Why |
|---|---|---|
| `"I have {int} cukes"` | `[number]` | MATCH-01's headline claim |
| `"I paid {float} euros"` | `[number]` | |
| `"my name is {string}"` | `[string]` | quotes already stripped by the transform |
| `"the {word} is red"` | `[string]` | |
| `"I have {int} cukes and {float} kg of {word} named {string}"` | `[number, number, string, string]` | left-to-right, no reordering |
| `"no parameters here"` | `[]` | the empty tuple, not `never[]` |
| `"I have {int} cuke(s)"` | `[number]` | an optional group has no brace pair |
| `"I am happy/sad"` | `[]` | an alternation has no brace pair |
| `"literal a \{int} b"` | `[]` | the backslash escape makes it literal text upstream |
| `"count {}"` | `[string]` | the anonymous built-in, registry name `""` |
| `"balance {biginteger}"` | `[bigint]` | verified, counterintuitive |
| `"balance {bigdecimal}"` | `[string]` | verified, counterintuitive |
| `"I pay {money}"` | `[unknown]` | unregistered name, no compile error |
| `"I pay {money}"` + `{ money: {...} }` | `[{...}]` | the `Custom` escape hatch |
| `"I have {int} apples"` + `{ int: string }` | `[number]` | a custom map may not shadow a built-in |

Plus the property none of the equality assertions can catch on their own: `(...args: StepArgs<"I have {int} cukes and {word} left">) => void` accepts `(count: number, fruit: string) => void`, so the result is a genuine tuple and not a widened array. That is the exact regression Phase 5's `Given` signature cannot survive.

## Mutation Proofs

Both required by the plan's acceptance criteria and recorded here. In both cases the tree was restored and `git status --porcelain packages/gherkin/src` was verified empty afterwards.

**MUTATION PROOF 1 — the positives are load-bearing.**

1. Changed `readonly int: number` to `readonly int: string` in `src/StepArgs.ts`.
2. `pnpm typecheck:test` → **exit 1**, with 5 × `TS2345: Argument of type 'false' is not assignable to parameter of type 'true'` at `packages/gherkin/test/StepArgs.types.ts` lines 48, 61, 71, 112 and 116, plus `TS2322` on the rest-parameter assignment at line 130 and `TS2578: Unused '@ts-expect-error' directive` at line 144 (the `[string]` negative stops erroring once `{int}` *is* a string).
3. Restored; `grep -c 'readonly int: number'` back to 1; `git status --porcelain packages/gherkin/src` empty; `pnpm typecheck:test` exit 0.

**MUTATION PROOF 2 — the `@ts-expect-error` negatives are load-bearing.**

1. Changed `ResolveParameterType` so every branch resolved to the top type (`any`), i.e. `StepArgs` still produces a tuple of the right arity but of useless element types.
2. `pnpm typecheck:test` → **exit 1**, with 12 × `TS2345` and — the point of the proof — `TS2578: Unused '@ts-expect-error' directive` at lines 144 and 147. An assignability-only test suite would have passed this mutation completely.
3. Restored; `git status --porcelain packages/gherkin/src` empty; `pnpm typecheck:test` exit 0.

Both directions therefore fail when the type is broken, which is what makes the assertions evidence rather than decoration (threat T-03-07).

## Decisions Made

- **Brace-pair recursion, never per character.** `P extends \`${infer Head}{${infer Name}}${infer Tail}\`` walks left to right because TypeScript infers the shortest `Head`. The per-character alternative exhausts instantiation depth (`TS2589`) on a step pattern of a few dozen characters; note (c) in the module doc comment records the prohibition so nobody "simplifies" it later.
- **An unknown `{name}` is `unknown`, not an error.** A custom parameter type is registered as runtime data; its transform's return type is unrecoverable from a string literal. Failing to compile would make every custom type unusable. `Custom` is the opt-in narrowing, and built-ins win over it to mirror the runtime rejection of a shadowing `defineParameterType` call.
- **The `Custom` default is `Record<never, never>`, not `{}`.** `Record<string, never>` would have been wrong in a way that is easy to miss: its `keyof` is `string`, so *every* name would have hit the custom branch and resolved to `never`, silently killing the `unknown` fallback and every built-in-precedence assertion.
- **Escape-of-an-escape is deliberately not modelled.** A pattern of the form `\\{int}` (a literal backslash followed by a real parameter) is treated as escaped. No pattern in this library's own suite needs it, and this is the safe direction: an argument missing from the tuple is a compile error at the call site, never a silent mistype. Recorded in the `StepArgs` doc comment.
- **`StepArgs` is not exported from `src/index.ts`.** The plan's `files_modified` excludes `index.ts`, and nothing a consumer can reach uses `StepArgs` yet — Phase 5's `Given`/`When`/`Then` signatures are its first caller. The plan that ships the public matcher surface owns the export, exactly as 03-01 left `StepPatternError` unexported for the plan that first raises it.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Correctness] The "emitted JS is empty" verify command measures comment retention, not runtime footprint**

- **Found during:** Task 1
- **Issue:** The plan's third verify command asserts `dist/StepArgs.js` is empty apart from its sourcemap comment. It is not, and cannot be: workspace-wide `moduleDetection: "force"` emits a bare `export {};` for every file, and `tsc` preserves a leading module doc comment that is not attached to an elided import. (`dist/Model.js` looks "empty" only by accident — its doc comment sits directly on an `import type` statement and is elided with it.) The command as written would fail for a module that is provably free of runtime values, and passing it would have meant deleting the module documentation the plan itself mandates.
- **Fix:** Ran a strictly *stronger* form of the same check — strip block comments, line comments and the bare `export {}` marker, then require the remainder to be empty. It passes: the emit carries **zero statements**. The module doc comment was corrected in the same edit to state what is actually true (AGENTS.md §4), naming `export {}` and the sourcemap pragma explicitly rather than claiming an empty file.
- **Files modified:** `packages/gherkin/src/StepArgs.ts` (doc comment only)
- **Verification:** the stripping check exits 0; the intent of the criterion — "proof the module carries no runtime value" — is met more tightly than the literal command would have.
- **Committed in:** `fabab63` (Task 1 commit)

**2. [Rule 3 - Blocking] dprint reformatted the `StepArgs` conditional type**

- **Found during:** Task 1
- **Issue:** `pnpm lint` (which runs `dprint check`) exited 20 on the hand-written line breaks of the nested conditional type.
- **Fix:** `pnpm dprint fmt packages/gherkin/src/StepArgs.ts`. Formatting only; the type is unchanged and every gate was re-run afterwards.
- **Files modified:** `packages/gherkin/src/StepArgs.ts`
- **Verification:** `pnpm lint` exits 0.
- **Committed in:** `fabab63` (Task 1 commit)

**3. [Rule 1 - Correctness] `requirements mark-complete` deliberately not run for MATCH-01**

- **Found during:** Post-task state updates
- **Issue:** MATCH-01 appears in this plan's `requirements` frontmatter, but it also appears in all six Phase 3 plans'. This plan ships the type-level half; roadmap success criterion 1 explicitly asks for the coercion to be asserted "at runtime and in a type test", and the runtime half is 03-04's. Flipping MATCH-01 to Complete here would make REQUIREMENTS.md claim something no runtime code does yet, which AGENTS.md §4 ("Say only what is true") forbids.
- **Fix:** Skipped the marking step; `.planning/REQUIREMENTS.md` is untouched and MATCH-01 remains `Pending`. This is the same call 03-01 made (its deviation 3) and follows the repo precedent that `PARSE-01..03` were marked at 02-09, the plan that shipped the behaviour end to end.
- **Files modified:** none
- **Verification:** `git status --porcelain .planning/REQUIREMENTS.md` is empty.
- **Committed in:** n/a — no change was made.

---

**Total deviations:** 3 auto-fixed (2 Rule 1 — correctness, 1 Rule 3 — blocking).
**Impact on plan:** No scope change. Deviation 1 is worth reading before the next types-only module lands in this package: "the emitted JS is byte-empty" is not a portable acceptance criterion under `moduleDetection: "force"`; "the emitted JS contains no statement" is.

## Issues Encountered

- The plan's acceptance grep for the eleven built-in keys is written as ten `readonly <name>` alternates plus a separate `readonly "":` count. Both pass (10 and 1), but note that the first grep is satisfiable by prose in a doc comment as well as by code — the count is only meaningful because the interface really does declare all ten. The `biginteger: bigint` and `bigdecimal: string` greps are the ones with real teeth.
- Every claim in the plan's `<interfaces>` block was re-verified through the type checker rather than trusted: the `{}` anonymous case (does `infer Name` accept the empty string between braces? yes), the escape case, and the tuple-vs-array question were all probed in a scratch file that was deleted before Task 1 was committed.

## Known Stubs

None. Both artifacts are complete. `StepArgs` has no in-repo caller yet **by design** — Phase 5's DSL signatures are its consumer, and 03-04 supplies the runtime half of the same claim. The type test is that caller in the meantime, and it runs on every push.

## Threat Flags

None. No network, auth, file-access or schema surface was added.

- **T-03-06** (a map claiming a type the runtime does not produce) is mitigated as planned: every entry was verified by execution, the same eleven facts are pinned in `test/expressions-pin.test.ts`, and the two counterintuitive entries are grepped for literally.
- **T-03-07** (a vacuous type test) is mitigated by exact equality, a zero `any` grep, and the two mutation proofs above.
- **T-03-08** (a type test dropping out of CI) is mitigated by the file's location under `packages/gherkin/test` and by the module doc comment explaining why the `.types.ts` suffix must not be renamed.
- **T-03-09** (instantiation-depth exhaustion) is mitigated by brace-pair recursion; no `TS2589` was seen at any point, including on the 60-character four-parameter pattern.
- **T-03-SC** holds: no dependency, catalog entry or lockfile line was touched, and `src/StepArgs.ts` has zero imports of any kind.

## User Setup Required

None.

## Next Phase Readiness

- **`StepArgs` and `BuiltInParameterTypeMap` must be added to `packages/gherkin/src/index.ts`** by the plan that makes them reachable from a consumer (Phase 5's DSL is the first real caller; 03-03/03-06 may want them sooner). Import them by direct relative path — `../src/StepArgs.ts`, never through `../src/index.ts` — because `effect/no-import-from-barrel-package` runs with `checkRelativeIndexImports: true`.
- **`BuiltInParameterTypeMap` and `test/expressions-pin.test.ts` are a matched pair.** A `^20.1.0` bump that changes any built-in's runtime type must change both in the same commit, or the type system starts asserting something the runtime does not do.
- **03-04's runtime assertion completes roadmap success criterion 1.** This plan owns the type-test half only; the criterion asks for both.
- **The `.types.ts` suffix is a repeatable pattern** for any future compile-time-only claim in this package: `tsconfig.test.json` compiles it, vitest ignores it. Do not rename such a file to `.test.ts` — it would fail `pnpm test` with "No test suite found".

## Self-Check: PASSED

- `packages/gherkin/src/StepArgs.ts` — FOUND
- `packages/gherkin/test/StepArgs.types.ts` — FOUND
- Commit `fabab63` — FOUND
- Commit `2f72bb1` — FOUND
- `pnpm build`, `pnpm lint`, `pnpm circular`, `pnpm typecheck:test`, `pnpm test` (273 passing, 11 files) all exit 0.

---
*Phase: 03-parameter-types-and-step-matching*
*Completed: 2026-08-28*
