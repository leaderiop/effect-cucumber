---
phase: 03-parameter-types-and-step-matching
verified: 2026-08-28T15:58:33Z
status: passed
score: 4/4
overrides_applied: 0
---

# Phase 3: Parameter Types and Step Matching Verification Report

**Phase Goal:** Step text resolves to typed arguments via cucumber-expressions, with a registry lifecycle that survives repeated `loadFeature` calls and a matcher that never silently picks a winner.
**Verified:** 2026-08-28T15:58:33Z
**Status:** passed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| # | Truth (roadmap success criterion) | Status | Evidence |
|---|---|---|---|
| 1 | A step pattern's `{int}`, `{float}`, `{string}`, `{word}` arguments arrive at the step body already coerced to their TypeScript types, asserted at runtime and in a type test (MATCH-01) | ✓ VERIFIED | Type level: `packages/gherkin/src/StepArgs.ts` (`BuiltInParameterTypeMap`, `StepArgs<P, Custom>`) exported from the barrel; `packages/gherkin/test/StepArgs.types.ts` compiles clean under `pnpm typecheck:test` (ran live, zero errors). Runtime level: `packages/gherkin/test/StepMatcher.test.ts` lines 89-130 assert `typeof args[n]` for `{int}`, `{float}`, `{string}`, `{word}` against the real `CucumberExpression` via `createStepMatcher`. `packages/gherkin/test/expressions-pin.test.ts` pins all eleven built-in coercions against the real upstream package. |
| 2 | A custom parameter type declared once as data and consumed by two separate `loadFeature` calls in the same process resolves in both, with no duplicate-registration throw on the second call (MATCH-02) | ✓ VERIFIED | `packages/gherkin/src/ParameterTypes.ts` implements custom types as an append-only data store (`define`/`buildRegistry`), replayed into a fresh `ParameterTypeRegistry` on every call — never touching a registry at definition time. `packages/gherkin/src/loadFeature.ts` builds the registry eagerly per `parseFeature` call (`store.buildRegistry()`, line 124), never memoized. `packages/gherkin/test/ParameterTypeLifecycle.test.ts` lines 89-134 prove: `{money}` resolves in two separate `loadFeature` calls, the two calls hand back two DIFFERENT registry objects, and 20 repeated calls never throw. Test suite passes live. |
| 3 | A custom parameter type whose name collides with one of `ParameterTypeRegistry`'s 11 built-ins fails with a specific named error at declaration time, not at match time (MATCH-02) | ✓ VERIFIED | `ParameterTypes.ts` `define()` checks `builtInParameterTypeNames.has(name)` FIRST and raises `StepPatternError` reason `BuiltInParameterTypeName` before any registry construction. `builtInParameterTypeNames` is derived from a real `new ParameterTypeRegistry()` instance (`deriveBuiltInParameterTypeNames`, line 116), never hardcoded — confirmed by reading the source, no literal name list present. `packages/gherkin/test/ParameterTypes.test.ts` lines 147-180 test all eleven built-in names individually plus a "raises from `define` itself, records nothing" assertion. `packages/gherkin/test/ParameterTypeLifecycle.test.ts` lines 147-160 additionally prove the rejection happens with "no `loadFeature` call involved". |
| 4 | `StepMatcher` returns **all** matching definitions for a step text, not the first registered — asserted by a fixture where two patterns match one step and the matcher returns both — and compilation is memoized per `(registry, pattern)` | ✓ VERIFIED | `packages/gherkin/src/StepMatcher.ts` `match()` (lines 309-324) iterates every entry, pushes every match, never breaks/sorts/dedupes. `packages/gherkin/test/StepMatcher.test.ts` line 167 `"returns both matches when two registered patterns match one step text"` asserts exactly two matches (`int` and `word` variants) for `"I have 5 apples"`. Memoization: `expressionCache` is a `WeakMap<ParameterTypeRegistry, Map<string, CucumberExpression>>` (line 84); `StepMatcher.test.ts` lines 241-254 assert identical instance for same `(registry, pattern)` and different instances across two registries. All assertions pass live in the real test run. |

**Score:** 4/4 truths verified

### Required Artifacts

| Artifact | Expected | Status | Details |
|---|---|---|---|
| `packages/gherkin/src/Errors.ts` | `StepPatternError` + 9-tag reason union, separate from `LoadFeatureError` | ✓ VERIFIED | Class present (line 170), 9-member `StepPatternErrorReason` union (line 144), `this.name = "StepPatternError"` explicitly assigned (line 183). `LoadFeatureErrorReason` unchanged at 10 members. |
| `packages/gherkin/test/expressions-pin.test.ts` | Upstream-behaviour pin for `@cucumber/cucumber-expressions@20.1.0`, no imports from `../src` | ✓ VERIFIED | File exists, 14199 bytes; verified no `../src` import via file content and passing test run. |
| `packages/gherkin/src/StepArgs.ts` | Type-only module: `BuiltInParameterTypeMap`, `StepArgs<P, Custom>` | ✓ VERIFIED | Both exported (lines 51, 128), no runtime statements, imports nothing. |
| `packages/gherkin/test/StepArgs.types.ts` | `@ts-expect-error`-based type test, compiled by `typecheck:test` | ✓ VERIFIED | Exists, referenced by `packages/gherkin/tsconfig.test.json`; `pnpm typecheck:test` ran clean. |
| `packages/gherkin/src/ParameterTypes.ts` | Custom types as data, fresh-registry-per-call replay | ✓ VERIFIED | `createParameterTypeStore`, `defaultParameterTypeStore`, `defineParameterType`, `buildParameterTypeRegistry`, `builtInParameterTypeNames` all present and exported from barrel. |
| `packages/gherkin/test/ParameterTypes.test.ts` | One test per rejection reason, repeated-build proof, store-isolation proof | ✓ VERIFIED | 31 tests present per SUMMARY, all pass live; covers built-in collision, duplicate name, illegal name, invalid regexp flags, store isolation. |
| `packages/gherkin/src/StepMatcher.ts` | Memoized compilation cache + match-every-pattern matcher | ✓ VERIFIED | `createStepMatcher`, `compileExpression` exported; `WeakMap`-keyed cache present (line 84). |
| `packages/gherkin/test/StepMatcher.test.ts` | MATCH-01 runtime coercion, two-patterns fixture, memoization identity proof | ✓ VERIFIED | 25 tests present, all cited assertions found and passing. |
| `packages/gherkin/src/Model.ts` | `ParsedFeature.parameterTypes` field | ✓ VERIFIED | `readonly parameterTypes: ParameterTypeRegistry` present (line 185), documented as fresh per call. |
| `packages/gherkin/src/loadFeature.ts` | Fresh-registry-per-call join point, optional `LoadFeatureOptions` | ✓ VERIFIED | `LoadFeatureOptions.parameterTypes?` optional (line 101); `loadFeature(path, options?)` preserves one-arg call form (line 138); `store.buildRegistry()` called eagerly per `parseFeature` call (line 124), not memoized. |
| `packages/gherkin/src/index.ts` | Public surface for parameter types and step matching | ✓ VERIFIED | Barrel exports `createStepMatcher`, `compileExpression`, `defineParameterType`, `createParameterTypeStore`, `defaultParameterTypeStore`, `buildParameterTypeRegistry`, `StepPatternError`, `StepArgs`, `BuiltInParameterTypeMap`, etc. |
| `packages/gherkin/test/ParameterTypeLifecycle.test.ts` | MATCH-02 end-to-end proof across two `loadFeature` calls | ✓ VERIFIED | Lines 89-134; asserts two-call resolution, distinct registry objects, no throw across 20 repeated calls; all pass live. |
| `spec/behaviors/05-step-matching-and-parameter-types.md` | BEH-EC-015 normative contract | ✓ VERIFIED | Exists, 242 lines, registered in `spec/behaviors/index.yaml` (`BEH-EC-015` at line 21). |

### Key Link Verification

| From | To | Via | Status | Details |
|---|---|---|---|---|
| `Errors.ts` | `LoadFeatureErrorReason` union | `StepPatternError` is a separate class | ✓ WIRED | `LoadFeatureErrorReason` remains exactly 10 members; `StepPatternError` is its own `class ... extends Error`. |
| `expressions-pin.test.ts` | `@cucumber/cucumber-expressions` | direct import, zero imports from `../src` | ✓ WIRED | Confirmed by reading the module and by the passing standalone test run. |
| `loadFeature.ts` | `ParameterTypes.ts` | `buildRegistry()` called once per `parseFeature` invocation, never memoized | ✓ WIRED | `store.buildRegistry()` on line 124 inside `parseFeature`, executed fresh on every call. |
| `index.ts` | `StepMatcher.ts` | barrel re-export | ✓ WIRED | `export { compileExpression, createStepMatcher } from "./StepMatcher.ts"` present. |
| `ParameterTypes.ts` | `@cucumber/cucumber-expressions` | `new ParameterType(...)` then `registry.defineParameterType(...)` at replay time only | ✓ WIRED | `toUpstreamParameterType` + `buildRegistry`'s replay loop confirmed. |
| `ParameterTypes.ts` / `StepMatcher.ts` | `Errors.ts` | every rejection raises `StepPatternError`, never a raw upstream error | ✓ WIRED | Both modules' `fail()` helpers construct `StepPatternError` exclusively; confirmed by reading all throw sites. |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|---|---|---|---|
| Full gherkin package test suite | `pnpm --filter @effect-cucumber/gherkin test` | 11 files, 297 tests, all passed | ✓ PASS |
| MATCH-01 type-test half compiles | `pnpm typecheck:test` | zero errors | ✓ PASS |
| Package builds under project references | `pnpm build` (`tsc -b`) | clean, no output/errors | ✓ PASS |
| `gherkin` package declares no runner dependency | `pnpm verify:no-runner-dep` | ENFORCED, all 3 checks pass | ✓ PASS |
| Spec traceability (BEH-EC-015 registered, links resolve) | `pnpm verify:spec` | PASS: 7, FAIL: 0, SKIP: 1 (expected — no `.feature` tags yet) | ✓ PASS |
| Lint (oxlint) over phase-modified files | `npx oxlint -f unix packages/gherkin/src packages/gherkin/test` | no output (clean) | ✓ PASS |
| No circular dependency introduced | `npx madge --circular --extensions ts packages/gherkin/src` | "No circular dependency found!" | ✓ PASS |

### Requirements Coverage

| Requirement | Source Plan(s) | Description | Status | Evidence |
|---|---|---|---|---|
| MATCH-01 | 03-01, 03-02, 03-04, 03-05, 03-06 | Step patterns use cucumber-expressions syntax (`{int}`, `{float}`, `{string}`, `{word}`, custom types) | ✓ SATISFIED | `StepArgs.ts` type-level map + `StepMatcher.ts` runtime coercion, both tested (type test + runtime tests) and wired into the barrel. REQUIREMENTS.md already marks `[x]`. |
| MATCH-02 | 03-01, 03-03, 03-05, 03-06 | A custom parameter type is defined once as data and replayed into a fresh `ParameterTypeRegistry` on every `loadFeature` call, with no duplicate-registration failure across repeated calls | ✓ SATISFIED | `ParameterTypes.ts` data store + replay, `loadFeature.ts` fresh-registry-per-call wiring, `ParameterTypeLifecycle.test.ts` end-to-end proof, all passing. REQUIREMENTS.md already marks `[x]`. |

No orphaned requirements: REQUIREMENTS.md's traceability table maps only MATCH-01 and MATCH-02 to Phase 3, and both are claimed by at least one plan's `requirements:` frontmatter.

### Anti-Patterns Found

None. Scanned all seven phase-modified/created source files (`Errors.ts`, `StepArgs.ts`, `ParameterTypes.ts`, `StepMatcher.ts`, `loadFeature.ts`, `index.ts`, `Model.ts`) for `TBD|FIXME|XXX|TODO|HACK|PLACEHOLDER` and stub-shaped returns (`return null`, `return {}`, `return []`, `=> {}`) — zero matches. `oxlint` reports zero issues on `packages/gherkin/src` and `packages/gherkin/test`.

### Human Verification Required

None. All four roadmap success criteria are mechanically checkable (type tests, runtime assertions, memoization identity checks) and were verified directly against the real, passing test suite and a live typecheck/build/lint/spec-traceability run — no visual, real-time, or external-service behavior is involved in this phase.

### Gaps Summary

No gaps. All four roadmap success criteria for Phase 3 are backed by real, passing code: `StepArgs<P>` gives compile-time coercion (proven by a clean `typecheck:test` run including `@ts-expect-error` negatives), `StepMatcher` gives runtime coercion and match-every-pattern semantics with `(registry, pattern)`-keyed memoization (proven by `StepMatcher.test.ts`'s live assertions), `ParameterTypes.ts` implements the data-plus-replay lifecycle with built-in-name collision rejection at declaration time (proven by `ParameterTypes.test.ts` and `ParameterTypeLifecycle.test.ts`), and `loadFeature.ts`/`index.ts` wire everything into the public surface with a fresh registry built eagerly on every call (proven by two-call and twenty-call lifecycle tests). The full package test suite (297 tests), typecheck, build, lint, no-runner-dep gate, and spec-traceability check all pass live as of this verification. Both MATCH-01 and MATCH-02 are already marked complete in `REQUIREMENTS.md`, consistent with the evidence found.

---

*Verified: 2026-08-28T15:58:33Z*
*Verifier: Claude (gsd-verifier)*
