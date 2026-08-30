---
phase: 03-parameter-types-and-step-matching
plan: 03
subsystem: testing
tags: [cucumber-expressions, parameter-types, registry-lifecycle, error-model, vitest, typescript]

# Dependency graph
requires:
  - phase: 03-parameter-types-and-step-matching
    plan: 01
    provides: "StepPatternError + its nine reason tags (src/Errors.ts), and test/expressions-pin.test.ts pinning the eleven built-in names this module DERIVES rather than hardcodes"
  - phase: 02-loadfeature-parse-compile-correlate
    provides: "src/Validate.ts (the shape of a module that raises library errors instead of letting an upstream throw escape), test/Validate.test.ts (assert err.reason, never message text), the pnpm verify:no-runner-dep gate"
provides:
  - "packages/gherkin/src/ParameterTypes.ts — custom parameter types as plain data plus buildRegistry()'s fresh-registry-per-call replay (ADR-EC-007's second correction, implemented literally)"
  - "createParameterTypeStore / defaultParameterTypeStore / defineParameterType / buildParameterTypeRegistry / builtInParameterTypeNames — the surface 03-04 and 03-05 build on"
  - "builtInParameterTypeNames, DERIVED from a live registry, so an upstream release adding a twelfth built-in is rejected on the day it ships"
  - "packages/gherkin/test/ParameterTypes.test.ts — 31 tests, both required mutations recorded"
affects: [03-04, 03-05, 03-06, phase-05-dsl-given-when-then]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Definition-time validation with a five-check ordered gate, the last being a throwaway upstream construction inside try/catch so an unanticipated upstream throw still arrives as a named library error"
    - "A derived-from-upstream constant (builtInParameterTypeNames) paired with a dependency pin that fixes its size, so drift is both handled and visible"
    - "Per-test stores from a factory, with exactly one test permitted to touch the module-level default — an append-only store cannot be un-defined"

key-files:
  created:
    - packages/gherkin/src/ParameterTypes.ts
    - packages/gherkin/test/ParameterTypes.test.ts
  modified: []

key-decisions:
  - "define() touches no registry at all; buildRegistry() constructs a fresh one every call and is never memoized — the memoization mutation is what proves it"
  - "builtInParameterTypeNames is derived by iterating a real registry instance; no built-in name appears as a literal anywhere in the source"
  - "All five rejections fire at DEFINITION time so the error points at the caller's own define call, not at a replay inside loadFeature"
  - "A module-level default store is correct here and does not contradict ARCHITECTURE.md's Anti-Pattern 4: that anti-pattern is about mutable per-run state, this store is append-only and process-wide by design"
  - "The store is a plain object, not a Layer-provided service — ADR-EC-015 forbids effect in this package's manifest and verify:no-runner-dep enforces it; 03-06 closes the ADR's open option in writing"
  - "transform's declared return type omits PromiseLike, so an async transform is a compile error; the runtime thenable guard is StepMatcher's (03-04), and the doc comment records the split"

# Copied verbatim from 03-03-PLAN.md's `requirements` field. STILL PENDING in REQUIREMENTS.md on
# purpose: this plan ships the store and the replay, but MATCH-02 is only true end to end once
# loadFeature builds a fresh registry per call (03-05). Same reasoning and same precedent
# (PARSE-01..03 marked at 02-09) as 03-01 and 03-02 recorded. See "Deviations from Plan" §1.
requirements-completed: [MATCH-02]

# Metrics
duration: 6min
completed: 2026-08-28
---

# Phase 03 Plan 03: Custom Parameter Types as Data Summary

**Defining a custom parameter type now appends a plain record to an array and touches no `ParameterTypeRegistry` at all; every consumer builds a fresh registry and replays every record into it, so twenty builds in one process throw exactly zero times — and both halves of that claim fail the suite when mutated.**

## Performance

- **Duration:** ~6 min
- **Started:** 2026-08-28T15:06:36Z
- **Completed:** 2026-08-28T15:12:24Z
- **Tasks:** 2
- **Files modified:** 2 (both created)

## Accomplishments

- `packages/gherkin/src/ParameterTypes.ts` (336 lines) implements ADR-EC-007's second correction literally: `define` appends a `{ name, regexp, transform }` record and never constructs a registry; `buildRegistry` constructs a **fresh** `ParameterTypeRegistry` and replays every record via `new ParameterType(...)` + `registry.defineParameterType(...)`.
- Exactly **two** non-comment `new ParameterTypeRegistry()` sites exist, and they are the only two that should: the throwaway that derives `builtInParameterTypeNames`, and the fresh one inside `buildRegistry`.
- The eleven built-in names are **derived** by iterating a real registry — `grep -c '"bigdecimal"\|"biginteger"\|"byte"\|"short"'` on the source is **0**. A twelfth built-in in a `^20.1.0` minor is therefore rejected at `define` time on the day it ships, and `test/expressions-pin.test.ts` still fails first so the change is visible rather than merely handled.
- Five definition-time rejections, in a fixed order, each a named `StepPatternError`: built-in name (which is also what rejects the anonymous `""`), duplicate name naming **both** definition sites, illegal name, a `RegExp` carrying `g`/`i`/`m`/`y`, and a catch-all around a throwaway upstream construction. No upstream message text is reproduced or matched anywhere (`grep -c 'There is already a parameter type'` is 0).
- `packages/gherkin/test/ParameterTypes.test.ts` (295 lines, **31 tests**) covers all four reachable rejection reasons, the eleven-built-in loop driven by the derived set itself, the twenty-iteration repeated-build proof, reference-inequality of two consecutive builds, store isolation, a positive control, and a transform round-trip.
- Repo test count went from 273 to **304 passing** across 12 files. `pnpm build`, `pnpm lint`, `pnpm circular`, `pnpm typecheck:test`, `pnpm verify:no-runner-dep` and `pnpm test` all exit 0.

## Task Commits

Each task was committed atomically:

1. **Task 1: Create src/ParameterTypes.ts — the definition record, the store, and the derived built-in set** — `58f5fcd` (feat)
2. **Task 2: Create test/ParameterTypes.test.ts — rejections, repeated builds, and store isolation** — `304b264` (test)

## The Five Definition-Time Checks, In Order

Order is not incidental — each row explains why it sits where it does.

| # | Check | Reason tag | Why here |
|---|---|---|---|
| 1 | name is in `builtInParameterTypeNames` | `BuiltInParameterTypeName` | FIRST, which is what rejects the anonymous empty-string name too, and what makes the built-in message win for a name that is both built-in and already defined |
| 2 | name already in this store | `DuplicateParameterTypeName` | Before any upstream call, so upstream's site-less duplicate message can never reach the caller (T-03-10) |
| 3 | `ParameterType.isValidParameterTypeName(name)` is false | `IllegalParameterTypeName` | Asks the predicate and quotes the characters the predicate really rejects — upstream's own message names a different set |
| 4 | a `RegExp` carries `g`, `i`, `m` or `y` | `InvalidParameterTypeRegexp` | Checked locally rather than relying on the upstream throw, so the reason tag is precise and the message names the offending flag and source |
| 5 | throwaway upstream `ParameterType` construction in `try`/`catch` | `InvalidParameterTypeDefinition` | The catch-all: an upstream change inside `^20.1.0` surfaces as a named library error with the original as `cause`, not as a bare `CucumberExpressionError` |

Only after all five pass does `define` append the record. It returns `void` and mutates only the closed-over store.

## Mutation Proofs

Both required by the plan's acceptance criteria. In both cases the tree was restored afterwards and `git status --porcelain packages/gherkin/src` was verified **empty**.

**MUTATION PROOF 1 — the built-in check really fires at DEFINITION time.**

1. Deleted the `builtInParameterTypeNames.has(name)` block from `define` and re-inserted the identical check inside `buildRegistry`'s replay loop.
2. `pnpm vitest run packages/gherkin/test/ParameterTypes.test.ts` → **12 failed | 19 passed**. The named target, `raises the built-in rejection from the define call itself, recording nothing`, failed with `Error: expected define() to throw a StepPatternError, but it returned normally`, as did all eleven built-in-name cases.
3. Restored; `git status --porcelain packages/gherkin/src` empty; 31/31 pass.

**MUTATION PROOF 2 — `buildRegistry` really is fresh per call.**

1. Made `buildRegistry` memoize: a closed-over `ParameterTypeRegistry | undefined`, returned on every call after the first.
2. `pnpm vitest run packages/gherkin/test/ParameterTypes.test.ts` → **1 failed | 30 passed**, failing test `returns a different registry instance from every buildRegistry call` with `AssertionError: expected ParameterTypeRegistry{ …(2) } not to be ParameterTypeRegistry{ …(2) } // Object.is equality`.
3. Restored; `git status --porcelain packages/gherkin/src` empty; 31/31 pass.

The second proof is the interesting one: **the twenty-iteration loop alone does NOT catch memoization** — a memoized registry loops twenty times perfectly happily. Only the reference-inequality assertion does. The two tests are not redundant; each catches what the other misses (a memoized build passes the loop, and a registry rebuilt-but-not-replayed passes the identity check).

## Decisions Made

- **`define` touches no registry, full stop.** This is the whole plan. A fresh registry has nothing registered into it yet, so re-acquiring the built-ins can never collide, and because replay happens on every build, a module-scope definition is present in every later build rather than landing once in a registry that no longer exists. That is the failure class Pitfall 14 documents three separate times in `cypress-cucumber-preprocessor` (#298, #364, #549).
- **`builtInParameterTypeNames` is derived, and the derivation is the security control.** A hardcoded list is a spoofing surface (T-03-14): it drifts silently on an upstream release and the collision then surfaces at replay time, inside `loadFeature`, pointing at nobody's code. Derivation plus the size-11 pin gives both correct handling and visibility.
- **A module-level default store does not contradict Anti-Pattern 4.** That anti-pattern is about mutable per-run state — two `describeFeature` calls sharing one step map cross-contaminate. This store is **append-only** and *meant* to be process-wide: a custom parameter type declared at module scope in a `.steps.ts` file must be visible to every feature loaded afterwards. `createParameterTypeStore()` exists so nothing is ever forced to depend on the default one. Recorded as note (b) in the module doc comment.
- **ARCHITECTURE.md's Anti-Pattern 5 is superseded on one point and survives on another.** Its "one registry owned by `ParameterTypes.ts`" predates the second correction and is wrong now. What survives — and is `StepMatcher`'s job in 03-04 — is that a `CucumberExpression` permanently binds to the registry it was built against, so the compilation cache must be keyed on the (registry, pattern) PAIR. The module doc comment says both halves so a reader is not left to reconcile them.
- **The store is a plain object, not a `Layer`-provided service.** ADR-EC-007's correction calls this "the one place `Layer` genuinely earns its keep", but ADR-EC-015 forbids `effect` in any of this package's manifest fields and `pnpm verify:no-runner-dep` enforces that structurally. Note (c) records the contradiction explicitly and points at 03-06, which closes the ADR's open option in writing.
- **`transform` returns `T`, never `T | PromiseLike<T>`.** Pitfall 25's fix (a). The runtime guards for the `any`-cast escape route (`AsyncParameterTransform`, `ParameterTransformFailed`) are `StepMatcher`'s, and the doc comment names the split so neither half is assumed to be elsewhere's job (T-03-13).
- **No `remove`, no `clear` on the store.** A withdrawable definition would reintroduce exactly the cross-call state the design exists to eliminate. A caller wanting a different set creates a different store — which is also what makes the test file hermetic.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Correctness] `requirements mark-complete` deliberately not run for MATCH-02**

- **Found during:** Post-task state updates
- **Issue:** MATCH-02 appears in this plan's `requirements` frontmatter, but it also appears in 03-01, 03-05 and 03-06. This plan ships the store and the replay; MATCH-02's roadmap phrasing is about the lifecycle being correct end to end, and nothing in `src/` builds a registry from a real feature load yet — `loadFeature` is untouched, and 03-05 is the plan that wires it. Flipping MATCH-02 to Complete here would make REQUIREMENTS.md claim something no shipped code path does, which AGENTS.md §4 ("Say only what is true") forbids.
- **Fix:** Skipped the marking step; `.planning/REQUIREMENTS.md` is untouched and MATCH-02 remains `Pending`. Same call 03-01 (deviation 3) and 03-02 (deviation 3) made, and the same repo precedent: `PARSE-01..03` were marked at 02-09, the plan that shipped the behaviour end to end.
- **Files modified:** none
- **Verification:** `git status --porcelain .planning/REQUIREMENTS.md` is empty.
- **Committed in:** n/a — no change was made.

**2. [Rule 3 - Blocking] The five-reason grep on the TEST file resolves to four, as the plan anticipated**

- **Found during:** Task 2 acceptance checks
- **Issue:** `InvalidParameterTypeDefinition` has no reachable fixture: it can only fire when the upstream `ParameterType` constructor rejects a definition that survived all four preceding checks, and no input available today does that. Constructing one would mean either casting through `any` (pinning a fiction) or coupling the test to an upstream internal.
- **Fix:** Left the catch-all unasserted, which the plan's acceptance criterion explicitly permits ("at least 4 … may legitimately be absent"). The reason tag is exercised structurally instead: it is the only path out of the `try`/`catch`, and `pnpm typecheck:test` proves the branch is well-typed.
- **Files modified:** none
- **Verification:** the distinct-reason count on the test file is 4; on the source file it is 5.
- **Committed in:** `304b264`

**3. [Rule 2 - Coverage] Two tests added beyond the plan's list**

- **Found during:** Task 2
- **Issue:** The plan's list left two gaps that would have let a wrong implementation pass. Nothing asserted that a rejected duplicate leaves the FIRST definition intact (a `define` that cleared the store on rejection would pass every listed test), and nothing exercised the array form of `regexp`, which `toRegexpList` normalises on a different branch from the string and `RegExp` forms.
- **Fix:** Added `records only the first of two definitions sharing a name`, and extended the flagless-acceptance test with a `[/\d+/, "[a-z]+"]` array case. Both are pure additions; no listed test was dropped or weakened.
- **Files modified:** `packages/gherkin/test/ParameterTypes.test.ts`
- **Verification:** 31 tests pass (the plan asked for at least 18).
- **Committed in:** `304b264`

---

**Total deviations:** 3 auto-fixed (1 Rule 1 — correctness, 1 Rule 3 — blocking, 1 Rule 2 — coverage).
**Impact on plan:** No scope change. Deviation 1 is the third consecutive plan in this phase to decline a mechanical requirement marking for the same reason; that convention is now well established and 03-05 is the plan that should actually mark MATCH-01/MATCH-02.

## Issues Encountered

- **The twenty-iteration loop is weaker than it looks.** It passes unchanged against a memoizing `buildRegistry`, because a memoized registry loops twenty times without complaint. The reference-inequality test is what carries the fresh-per-call claim, and mutation proof 2 is what demonstrates that. Worth remembering if either test is ever "consolidated" into the other.
- **`ParameterType.isValidParameterTypeName("a/b")` returns `true`**, while upstream's own thrown message claims `/` is forbidden. The implementation asks the predicate and quotes the real character set (`[ ] ( ) $ . | ? * +`); a companion test pins `a/b` as ACCEPTED, so a future rewrite that pattern-matched that message fails exactly there.
- Every claim in the plan's `<interfaces>` block was re-verified against the installed package's own `.d.ts` and `.js` rather than trusted — including that `ParameterType`'s constructor defaults `useForSnippets` to `true` and `preferForRegexpMatch` to `false` when handed `undefined`, which is what makes passing the two optional fields straight through safe.
- `grep -c 'PromiseLike'` on the source is 2, both inside doc comments (the module header and the `transform` member doc). The declared return type contains none, which is what the criterion is about.

## Known Stubs

None. Both artifacts are complete and exercised. `ParameterTypes.ts` has no in-`src` caller yet **by design**: 03-04's `StepMatcher` and 03-05's `loadFeature` are its consumers, and the test file is its caller in the meantime, running on every push.

## Threat Flags

None. No network, auth, file-access or schema surface was added.

- **T-03-10** (a duplicate reported as an upstream error naming neither site) — mitigated: rejected before any registry exists, with both `definedAt` sites in the message and a fallback for each. `grep -c 'There is already a parameter type'` on the source is 0.
- **T-03-11** (cross-call registry state) — mitigated: `define` never touches a registry, `buildRegistry` is fresh every call, proven by the twenty-iteration loop, the reference-inequality test, and mutation proof 2.
- **T-03-12** (ReDoS via a caller-supplied regexp) — **accepted** as planned, with the library-side obligation met: `grep -c 'new RegExp'` on the source is 0, no regular expression is constructed from Gherkin text, and every pattern is handed to `CucumberExpression`.
- **T-03-13** (a caller `transform` as arbitrary code) — mitigated at the type level here (`PromiseLike` excluded); the runtime halves are 03-04's and are named in the module doc comment.
- **T-03-14** (a hardcoded built-in list drifting) — mitigated: derived from a live registry, zero built-in name literals in the source, size pinned at eleven by `expressions-pin.test.ts` and re-asserted here.
- **T-03-15** (messages listing every built-in and quoting `definedAt`) — **accepted**, consistent with the locked no-truncation decision in `Errors.ts`.
- **T-03-SC** holds: no dependency, catalog entry or lockfile line was touched. `@cucumber/cucumber-expressions` is imported through the package barrel only — `grep -c 'dist/'` on the source is 0.

## User Setup Required

None — no external service configuration required.

## Next Phase Readiness

Ready for 03-04 and 03-05. Specifically:

- **`buildRegistry()` must be called once per `loadFeature`/`parseFeature` invocation and NEVER memoized** (03-05's `key_links` says exactly this). The freshness is the requirement, not an implementation detail.
- **`StepMatcher` owns the two runtime transform guards** this module deliberately does not have: a thenable result → `AsyncParameterTransform`, a throwing transform → `ParameterTransformFailed`. The type-level rejection here only covers callers who do not cast through `any`.
- **`StepMatcher`'s compilation cache must be keyed on the (registry, pattern) PAIR**, not on the pattern alone — a fresh registry per build means a pattern-keyed cache would serve an expression bound to a dead registry. `expressions-pin.test.ts` pins the snapshot-at-construction behaviour this rests on.
- **`ParameterTypes.ts` is not exported from `packages/gherkin/src/index.ts`,** and neither is `StepPatternError`. 03-05 owns `index.ts` and its `must_haves` already names `defineParameterType`, `StepPatternError`, `createStepMatcher` and `StepArgs` as the surface to export. Until then, import by direct relative path (`../src/ParameterTypes.ts`), never through the barrel.
- **The default store is append-only for the life of the process.** `moneyDefaultStoreProbe` is claimed by `test/ParameterTypes.test.ts` and must never be reused; any new test needing a custom type creates its own store.
- **03-06 owes ADR-EC-007 an implementation note** closing the `Layer`-provided-service option against ADR-EC-015. Note (c) of the module doc comment is the source text for it.

## Self-Check: PASSED

- `packages/gherkin/src/ParameterTypes.ts` — FOUND
- `packages/gherkin/test/ParameterTypes.test.ts` — FOUND
- Commit `58f5fcd` — FOUND
- Commit `304b264` — FOUND
- `pnpm build`, `pnpm lint`, `pnpm circular`, `pnpm typecheck:test`, `pnpm verify:no-runner-dep` and `pnpm test` (304 passing, 12 files) all exit 0.

---
*Phase: 03-parameter-types-and-step-matching*
*Completed: 2026-08-28*
