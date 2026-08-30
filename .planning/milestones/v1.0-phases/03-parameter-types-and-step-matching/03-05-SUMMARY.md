---
phase: 03-parameter-types-and-step-matching
plan: 05
subsystem: api
tags: [cucumber-expressions, parameter-types, step-matching, barrel-exports, lifecycle, gherkin]

# Dependency graph
requires:
  - phase: 03-parameter-types-and-step-matching
    provides: "03-03's ParameterTypeStore / buildRegistry (custom types as data), 03-04's createStepMatcher + per-(registry, pattern) compilation cache, 03-02's StepArgs, 03-01's StepPatternError"
  - phase: 02-loadfeature-parse-compile-correlate
    provides: "parseFeature/loadFeature composition root, the ParsedFeature contract, the fixture corpus"
provides:
  - "ParsedFeature.parameterTypes — the per-call ParameterTypeRegistry join point Phase 6's Plan hands to createStepMatcher"
  - "LoadFeatureOptions — an optional trailing store override on both parseFeature and loadFeature"
  - "a FRESH registry built once per parseFeature invocation, never memoized (MATCH-02)"
  - "the real package barrel: defineParameterType, createStepMatcher, StepPatternError, StepArgs and the rest of the Phase 3 surface"
  - "test/ParameterTypeLifecycle.test.ts — roadmap success criterion 2 in executable form"
affects: [04-datatable-and-schema, 05-registration-dsl, 06-plan-and-step-drift]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Per-call resource construction at the composition root (id generator, then registry) rather than module-scope memoization"
    - "An optional trailing options argument as the hermeticity seam for an append-only process-wide default"
    - "Single-barrel public surface: no subpath export, asserted byte-identical package.json"

key-files:
  created:
    - packages/gherkin/test/ParameterTypeLifecycle.test.ts
  modified:
    - packages/gherkin/src/Model.ts
    - packages/gherkin/src/loadFeature.ts
    - packages/gherkin/src/index.ts

key-decisions:
  - "parameterTypes lands on ParsedFeature, not ParsedFeatureCore — Correlate.ts knows nothing about parameter types and stays untouched"
  - "The registry is built EAGERLY, once per parseFeature call, from a store resolved as options?.parameterTypes ?? defaultParameterTypeStore"
  - "LoadFeatureOptions exists for testability: the default store is append-only for the life of the process, so a hermetic test must supply its own"
  - "ParameterTypeRegistry is re-exported from Model.ts and the barrel so no consumer must declare @cucumber/cucumber-expressions"
  - "No subpath export was added; packages/gherkin/package.json is byte-identical after the plan"

patterns-established:
  - "Freshness proven by reference INEQUALITY, never by a repetition loop — a memoized registry passes a twenty-call loop happily"
  - "An end-to-end lifecycle claim is proven by an actual createStepMatcher match, not by lookupByTypeName returning something"

requirements-completed: [MATCH-01, MATCH-02]

# Metrics
duration: 14min
completed: 2026-08-28
---

# Phase 3 Plan 05: loadFeature registry lifecycle and the public surface Summary

**A custom parameter type declared once as data now resolves in two separate `loadFeature` calls in one process — each call builds its own fresh `ParameterTypeRegistry`, hands it back on `ParsedFeature.parameterTypes`, and the whole Phase 3 surface is reachable from the single package barrel with no manifest change.**

## Performance

- **Duration:** ~14 min
- **Started:** 2026-08-28T17:24:00Z
- **Completed:** 2026-08-28T17:38:00Z
- **Tasks:** 3
- **Files modified:** 4 (3 modified, 1 created)

## Accomplishments

- `ParsedFeature` gained `readonly parameterTypes: ParameterTypeRegistry` — the additive join point Phase 6's `Plan` needs. `ParsedFeatureCore` and `Correlate.ts` are untouched.
- `parseFeature` builds one fresh registry per invocation from a store the caller may override, and `loadFeature` forwards the new optional `LoadFeatureOptions` unchanged. `grep -c 'buildRegistry()'` in `loadFeature.ts` is exactly 1.
- `index.ts` stopped being a parse-only barrel: `defineParameterType`, `createParameterTypeStore`, `defaultParameterTypeStore`, `buildParameterTypeRegistry`, `builtInParameterTypeNames`, `compileExpression`, `createStepMatcher`, `StepPatternError` and the types `ParameterTypeDefinition`, `ParameterTypeStore`, `StepMatch`, `StepMatcher`, `StepPatternEntry`, `StepArgs`, `BuiltInParameterTypeMap`, `StepPatternErrorReason`, `LoadFeatureOptions`, `ParameterTypeRegistry` are all reachable. No subpath export added; `git diff --stat packages/gherkin/package.json` is empty.
- `test/ParameterTypeLifecycle.test.ts` (189 lines, 8 tests) is roadmap success criterion 2 in executable form, and the only Phase 3 test that goes through the real `loadFeature`.
- Repo test count: **337 across 14 files** (329 across 13 before this plan).
- **MATCH-01 and MATCH-02 are now Complete in REQUIREMENTS.md** — the marking every prior Phase 3 plan deliberately declined, handed forward in each of their handoff notes to the plan that made the lifecycle true end to end.

## Task Commits

1. **Task 1: Add parameterTypes to the ParsedFeature contract** — `176e85a` (feat)
2. **Task 2: Build a fresh registry per call in loadFeature.ts and publish the real barrel** — `fc7c269` (feat)
3. **Task 3: Create test/ParameterTypeLifecycle.test.ts — the MATCH-02 end-to-end proof** — `9c50ef1` (test)

## Files Created/Modified

- `packages/gherkin/src/Model.ts` — `ParsedFeature.parameterTypes` plus its doc comment recording that two calls hold two different registries and that this is why `StepMatcher.ts` keys its cache on the registry instance; a type-only `ParameterTypeRegistry` import from the `@cucumber/cucumber-expressions` barrel and a re-export of it. The module's only LOCAL import is still `./Errors.ts`.
- `packages/gherkin/src/loadFeature.ts` — `LoadFeatureOptions`, the third parameter on `parseFeature` and the second on `loadFeature`, the store resolution and the single `store.buildRegistry()`, plus a new "The parameter type registry is per-call too" doc section citing ADR-EC-007's second correction.
- `packages/gherkin/src/index.ts` — the real public surface, grouped under short purpose comments, with the module doc comment rewritten to state the seam (define at module scope → replay per `loadFeature` call → hand the registry to `createStepMatcher`). `packageName`/`PackageName` survive verbatim; `Parser`/`Pickles`/`Correlate`/`Source`/`Validate` stay unexported.
- `packages/gherkin/test/ParameterTypeLifecycle.test.ts` — 8 tests over two different fixtures (`correlation-full.feature`, `dialect-fr.feature`) plus one inline source.

## Decisions Made

- **The field is on `ParsedFeature`, not `ParsedFeatureCore`.** The split already existed for `warnings` and carries the same meaning here: `Correlate.ts` produces the core and knows nothing about parameter types; `loadFeature.ts` joins. Putting it on the core would have forced a `Correlate.ts` change for no reason and made the contract non-additive for Phase 5/6 (threat T-03-28).
- **`buildRegistry()` is called exactly once per `parseFeature` invocation, eagerly.** Not at module scope, not cached per store, not behind a lazy getter. A fresh registry has nothing registered into it yet, which is what makes re-acquiring the eleven built-ins safe and makes a second call's replay incapable of a duplicate-name throw (threat T-03-23).
- **`LoadFeatureOptions.parameterTypes` is a testability seam, and it is the reason the lifecycle test is hermetic.** `defaultParameterTypeStore` is append-only for the life of the process, so a test defining into it would make every later test in the same worker order-dependent (threat T-03-24). The lifecycle test's `defineParameterType(` count is 0.
- **`ParameterTypeRegistry` is re-exported from both `Model.ts` and the barrel**, following the rule `Model.ts`'s module doc comment already recorded for the `@cucumber/messages` types: a third-party type the public contract surfaces is re-exported by its owning module so a consumer is never forced to declare the third-party package.
- **The registry is a mandatory field, not an optional one.** That is what made the Task 1 deviation below necessary, and it is the right trade: an optional `parameterTypes` would let a Phase 6 consumer forget it exists.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Task 1 alone does not compile; minimal `loadFeature.ts` wiring added to keep the tree green**

- **Found during:** Task 1 (Add parameterTypes to the ParsedFeature contract)
- **Issue:** Task 1's acceptance criteria require `pnpm build` to exit 0, but adding a REQUIRED field to `ParsedFeature` while `loadFeature.ts` still returns `{ ...correlated.feature, warnings }` is a type error by construction. The plan scoped Task 1 to `Model.ts` alone, so as written the task cannot satisfy its own build gate. Making the field optional was rejected — the plan's own acceptance criterion pins the exact non-optional declaration, and an optional field is a worse contract.
- **Fix:** Task 1's commit also carries a two-line `loadFeature.ts` change: import `buildParameterTypeRegistry` from `./ParameterTypes.ts` and add `parameterTypes: buildParameterTypeRegistry()` to the returned object. Task 2 then replaced it with the store-resolution form (`options?.parameterTypes ?? defaultParameterTypeStore`, then `store.buildRegistry()`) exactly as specified.
- **Files modified:** `packages/gherkin/src/loadFeature.ts` (in addition to `packages/gherkin/src/Model.ts`)
- **Verification:** `pnpm build && pnpm lint && pnpm circular` exit 0 at Task 1's commit; every Task 1 grep criterion still passes, and every Task 2 grep criterion passes at Task 2's commit — including `buildRegistry()` count exactly 1, which the intermediate `buildParameterTypeRegistry()` spelling does not disturb.
- **Committed in:** `176e85a` (part of the task commit)

---

**Total deviations:** 1 auto-fixed (1 × Rule 3 — blocking issue)
**Impact on plan:** No scope creep. The deviation moved two lines of Task 2's work one commit earlier so that no commit in this plan leaves the tree unbuildable; the final state of every file is exactly what the plan specifies.

## Verification

All gates exit 0 on the final tree:

| Gate | Result |
|------|--------|
| `pnpm build` | ✓ |
| `pnpm lint` (oxlint + dprint check) | ✓ |
| `pnpm circular` | ✓ |
| `pnpm typecheck:test` | ✓ |
| `pnpm verify:no-runner-dep` | ✓ |
| `pnpm verify:pack` | ✓ (publint clean for both packages) |
| `pnpm test` | ✓ 337 tests, 14 files |
| `git diff --stat packages/gherkin/package.json` | empty |
| both `exports` key sets | `.,./package.json` — unchanged |

### Mutation proof (required by Task 3)

`parseFeature` was mutated to build the registry ONCE at module scope and reuse it
(`const MUTATION_registry = defaultParameterTypeStore.buildRegistry()`, returned unchanged for
every call). `pnpm vitest run packages/gherkin/test/ParameterTypeLifecycle.test.ts` then reported
**4 failed | 4 passed (8)**, and the headline failure is the required one:

```
× hands the two calls two DIFFERENT registry objects
```

The other three that fell over — the two-call headline criterion, the twenty-call loop, and
`parseFeature honours the same option` — failed on `lookupByTypeName("money")` being `undefined`,
because a module-scope registry built from the DEFAULT store never sees a custom type recorded in
a caller-supplied store. That is a second, independent way the mutation is caught.

The mutation was reverted with `git checkout -- packages/gherkin/src/loadFeature.ts`;
`git status --porcelain packages/gherkin/src` is **empty** and the lifecycle test is back to
**8 passed (8)**.

Worth recording for a future reader: the reference-inequality test is the one assertion that
catches a memoized registry built from the SAME store the caller passed — the twenty-call loop
does not, because a memoized registry loops happily. 03-03's summary said so; this mutation
confirms it from the other end.

## Issues Encountered

None beyond the Task 1 build-order deviation documented above.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

Phase 3 is one plan from done. Constraints 03-06 and Phases 4–6 must respect:

- **`ParsedFeature.parameterTypes` is the Phase 6 join point.** A `Plan` gets its registry off the feature it was built for, never by calling `buildParameterTypeRegistry()` itself — otherwise the registry the expressions compile against is not the one the feature carries, and `StepMatcher`'s `(registry, pattern)` cache silently does the wrong thing.
- **Never memoize the per-call registry, and never make `parameterTypes` optional.** Both are defended: a `buildRegistry()` count of exactly 1 in `loadFeature.ts`, plus the recorded mutation above.
- **`loadFeature`'s signature is now `(path, options?)` and `parseFeature`'s is `(source, uri, options?)`.** BEH-EC-001's one-argument call form is unchanged and has its own regression test. **03-06 owes BEH-EC-014's `Signatures` block the update** — the plan says so explicitly and nothing else in the repo carries that text.
- **The barrel is now real, so anything added to `packages/gherkin/src/index.ts` from here on is public API.** It is also still a SINGLE barrel: a future subpath must be added to both `exports` and `publishConfig.exports` or it 404s for consumers while resolving locally. A `node -e` assertion on both key sets is in this plan's verification and should be reused rather than re-derived.
- **Tests still import `../src/*.ts` directly, never `../src/index.ts`** — `effect/no-import-from-barrel-package` runs with `checkRelativeIndexImports: true`. The barrel existing does not change that rule.
- **`ParameterTypeLifecycle.test.ts` must never write to `defaultParameterTypeStore`.** It reads built-ins from it and nothing else; a `defineParameterType(` count of 0 is an acceptance criterion. The one deliberate default-store probe in the repo remains `ParameterTypes.test.ts`'s `moneyDefaultStoreProbe`.
- **03-06 still owes ADR-EC-007 the implementation note** closing its `Layer`-provided-service option against ADR-EC-015, with note (c) of `ParameterTypes.ts`'s module doc comment as the source text.

## Threat Flags

None — no new network endpoint, auth path, file access pattern or trust-boundary schema change. The plan's own register covers everything this plan touched, and T-03-27 (registry construction cost per call) remains explicitly **accepted**, not mitigated: a construction is eleven built-in registrations plus N recorded custom types, all allocation-only, and the research says not to pre-optimise it.

## Self-Check: PASSED

---
*Phase: 03-parameter-types-and-step-matching*
*Completed: 2026-08-28*
