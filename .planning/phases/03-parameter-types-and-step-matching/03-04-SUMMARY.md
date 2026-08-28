---
phase: 03-parameter-types-and-step-matching
plan: 04
subsystem: testing
tags: [cucumber-expressions, step-matching, memoization, parameter-types, error-model, vitest, typescript]

# Dependency graph
requires:
  - phase: 03-parameter-types-and-step-matching
    plan: 01
    provides: "StepPatternError + the four reason tags this module raises (src/Errors.ts), and test/expressions-pin.test.ts pinning construction-time throws, parameter-type snapshotting, the unwrapped Promise, and the two-patterns-one-step fact"
  - phase: 03-parameter-types-and-step-matching
    plan: 02
    provides: "StepArgs<P> — the compile-time half of MATCH-01, whose companion assertion lives inside this plan's test file"
  - phase: 03-parameter-types-and-step-matching
    plan: 03
    provides: "createParameterTypeStore().buildRegistry() — the fresh-registry-per-call source every test here builds its registry from, and the ParameterTypeDefinition whose transform guards this module owns"
provides:
  - "packages/gherkin/src/StepMatcher.ts — compileExpression (memoized per (registry, pattern) in a registry-keyed WeakMap) and createStepMatcher (match-every-entry, never first-wins)"
  - "StepPatternEntry<D> / StepMatch<D> / StepMatcher<D> — the D-opaque payload shape Phase 6's Plan step joins against, with no effect dependency"
  - "the two runtime transform guards ParameterTypes.ts deliberately lacks: AsyncParameterTransform for a thenable, ParameterTransformFailed for a throwing transform"
  - "packages/gherkin/test/StepMatcher.test.ts — 25 tests, both required mutations recorded"
affects: [03-05, 03-06, phase-05-dsl-given-when-then, phase-06-step-drift-detection]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "A two-level cache — WeakMap keyed on an instance, holding a Map keyed on a string — as the literal encoding of a compound memoization key, where the outer key also governs collectability"
    - "Lazy compilation behind the first call that needs it, so fail-fast survives without module-evaluation-order coupling"
    - "Returning every match and refusing to interpret zero or many, leaving the interpretation to the layer that holds the source location"

key-files:
  created:
    - packages/gherkin/src/StepMatcher.ts
    - packages/gherkin/test/StepMatcher.test.ts
  modified: []

key-decisions:
  - "match returns EVERY matching entry, in registration order, and never sorts, dedupes, prefers or throws for zero-or-many — ADR-EC-019's interpretation is Phase 6's job, where the Scenario and its location are in hand"
  - "The compilation cache is a WeakMap keyed on the registry INSTANCE holding a per-registry pattern Map; a pattern-only Map is forbidden and the mutation proof shows exactly what it breaks"
  - "Compilation is lazy: createStepMatcher compiles nothing, the first match compiles every entry — fail-fast at Plan time without Pitfall 13's module-evaluation-order coupling"
  - "A failed compilation is deliberately not cached, so a second match reports the same named failure rather than a confusing absence"
  - "A null from getValue (a non-participating optional group) is passed through, never filtered — positional correspondence with the pattern's parameters is what StepArgs' tuple claims"
  - "Upstream construction failures are discriminated structurally on a string undefinedParameterTypeName property; UndefinedParameterTypeError is not exported from the package barrel at all"

# Copied verbatim from 03-04-PLAN.md's `requirements` field. STILL PENDING in REQUIREMENTS.md on
# purpose: this plan completes the runtime half of the coercion claim, but nothing reachable from
# `@effect-cucumber/gherkin`'s public API uses it — index.ts still exports neither
# createStepMatcher nor defineParameterType. 03-05 owns index.ts and is the plan that makes
# MATCH-01 true through the published surface. Same reasoning and same precedent (PARSE-01..03
# marked at 02-09) as 03-01, 03-02 and 03-03 recorded. See "Deviations from Plan" §1.
requirements-completed: [MATCH-01]

# Metrics
duration: 9min
completed: 2026-08-28
---

# Phase 03 Plan 04: StepMatcher — Match Every Pattern, Compile Once Per Registry Summary

**A step text matched by two registered patterns now comes back as two matches carrying the number `5` and the string `"5"` rather than whichever definition was written first, and one pattern compiled against two registries yields two different expressions — both claims fail the suite the moment the implementation stops holding them.**

## Performance

- **Duration:** ~9 min
- **Started:** 2026-08-28T17:15:44Z
- **Completed:** 2026-08-28T17:24:40Z
- **Tasks:** 2
- **Files modified:** 2 (both created)

## Accomplishments

- `packages/gherkin/src/StepMatcher.ts` (327 lines) exports `compileExpression` and `createStepMatcher`, plus the three `D`-opaque interfaces (`StepPatternEntry<D>`, `StepMatch<D>`, `StepMatcher<D>`) Phase 6's `Plan` step joins against without this package ever gaining an `effect` dependency.
- The cache is `WeakMap<ParameterTypeRegistry, Map<string, CucumberExpression>>` — a registry-keyed outer map holding a pattern-keyed inner one, which is the literal encoding of "memoized per `(registry, pattern)`". A registry that goes out of scope takes its compiled expressions with it, so nothing has to know when a feature load ends.
- `match(text)` iterates **every** entry in registration order, skips a `null` result, and returns the accumulated array — empty for zero matches, length two for two. It does not sort, dedupe, prefer or throw for a zero-or-many outcome (`grep -c '\.toSorted(\|\.sort(\|\[0\]!'` is **0**).
- All four failure reasons this module owns are raised as named `StepPatternError`s: `UndefinedParameterType` and `InvalidStepPattern` from compilation, `ParameterTransformFailed` and `AsyncParameterTransform` from argument extraction. Discrimination of the upstream throw is **structural** (`undefinedParameterTypeName`); `grep -c 'instanceof UndefinedParameterTypeError\|dist/'` is **0**.
- This module constructs zero regular expressions (`grep -c 'new RegExp'` is **0**) and imports nothing local but `./Errors.ts` — not `./ParameterTypes.ts`, not `./index.ts`.
- `packages/gherkin/test/StepMatcher.test.ts` (390 lines, **25 tests**) covers all four built-ins by value *and* by `typeof`, the two-patterns-one-step fixture, its order-reversed companion, reference identity in both directions, all four failure reasons, and a parameterless positive control.
- Repo test count went from 304 to **329 passing** across 13 files. `pnpm build`, `pnpm lint`, `pnpm circular`, `pnpm typecheck:test`, `pnpm verify:no-runner-dep` and `pnpm test` all exit 0.

## Task Commits

Each task was committed atomically:

1. **Task 1: Create src/StepMatcher.ts — the memoized compilation cache** — `3ee4f48` (feat)
2. **Task 2: Create test/StepMatcher.test.ts — coercion, match-all, and the memoization identity proof** — `2c7e871` (test)

## What `match` Returns, And What It Refuses To Decide

| Step text vs. entries | Result | Why not something else |
|---|---|---|
| matches two entries | array of length 2, both `definition` payloads present, args `[5]` and `["5"]` | first-wins would make a step argument's TYPE a function of registration order |
| matches zero entries | `[]` | a throw here would turn a per-Scenario failure into a whole-file collection error (ADR-EC-019) |
| matches one of three | array of length 1 carrying that entry's payload | — |
| matcher has no entries | `[]` for any text | — |
| pattern names an unregistered type | **throws** `StepPatternError` | an invalid pattern is not a matching outcome; reporting "no match" would hide a typo behind MATCH-03 |

Zero and many are returned, not interpreted. MATCH-03 and MATCH-04 interpret them in Phase 6, where the Scenario and its source location are in hand and the error can name them.

## Mutation Proofs

Both required by the plan's acceptance criteria. In both cases the tree was restored afterwards and `git status --porcelain packages/gherkin/src` was verified **empty**, with 25/25 passing again.

**MUTATION PROOF 1 — match-all is load-bearing.**

1. Added `return matches` immediately after the `matches.push(...)` inside `match`'s loop, i.e. made it return on the first successful entry.
2. `pnpm vitest run packages/gherkin/test/StepMatcher.test.ts` → **2 failed | 23 passed**. The named target, `returns both matches when two registered patterns match one step text`, failed with `AssertionError: expected [ { …(3) } ] to have a length of 2 but got 1`. Its order-reversed companion failed too, with `expected Set{ 'I have {word} apples' } to deeply equal Set{ 'I have {int} apples' }` — which is the registration-order dependency itself, made visible.
3. Restored; `git status --porcelain packages/gherkin/src` empty; 25/25 pass.

**MUTATION PROOF 2 — the cache key is load-bearing.**

1. Replaced the registry-keyed `WeakMap` with a single module-level `Map<string, CucumberExpression>` keyed on the pattern alone, and simplified `compileExpression` accordingly.
2. `pnpm vitest run packages/gherkin/test/StepMatcher.test.ts` → **2 failed | 23 passed**. The named target, `returns two different expression instances for one pattern against two different registries`, failed with `AssertionError: expected CucumberExpression{ …(5) } not to be CucumberExpression{ …(5) } // Object.is equality`.
3. Restored; `git status --porcelain packages/gherkin/src` empty; 25/25 pass.

The **second** failure in proof 2 is the one worth reading, because nobody designed for it: `compiles nothing at construction, so an unregistered parameter type surfaces at the first match` also failed. Under a pattern-only cache, the `I pay {money}` expression compiled earlier against a registry that *had* `money` was served to a later matcher built on a registry that did **not**, so no `UndefinedParameterType` was raised at all and a step silently matched against a parameter type its registry never contained. That is exactly the stale-binding failure Pitfall 13 predicts, reproduced accidentally and end to end inside this suite.

## Decisions Made

- **`match` returns every match, and refuses to interpret zero or many.** Upstream detects no ambiguity across two patterns (pinned in `expressions-pin.test.ts`), so the choice is entirely this library's. Returning every match is what makes MATCH-04's ambiguity error possible in Phase 6; a `throw` here would move a per-Scenario failure to a whole-file collection error, the exact regression ADR-EC-019 exists to prevent. Compilation failures are the one exception and do throw — an invalid pattern is broken for every step text, so surfacing it as "no match" would hide a typo behind MATCH-03's unmatched-step error, pointing at the Scenario instead of at the pattern.
- **The cache is registry-keyed, and the doc comment says why in the strongest terms available.** `buildRegistry()` returns a fresh registry every call by MATCH-02's design, and an expression snapshots its resolved parameter types at construction, so a pattern-only cache does not merely miss an optimisation — it silently serves a binding to a registry that no longer describes anything. `WeakMap` rather than `Map` so nothing needs to know when a feature load is over.
- **Compilation is lazy, and `createStepMatcher` compiles nothing at all.** Matching has to try every entry anyway, so the first `match` call is the natural compilation point. It still gives fail-fast on an invalid pattern at Plan time, before any Scenario body runs, while keeping construction free of the module-evaluation-order coupling Pitfall 13 describes (a custom parameter type registered after the steps module was evaluated turning an eager `new CucumberExpression` into a collection-time abort).
- **A failed compilation is not cached.** Caching the failure would need a second cache shape; not caching it means a second `match` re-runs the construction and reports the same named failure, which a test asserts. The cost is one wasted construction on an already-broken pattern.
- **A `null` from `getValue` is passed through, never filtered.** An optional group that did not participate yields `null`, and dropping it would shift every argument after it out of alignment with the tuple `StepArgs<P>` claims. Recorded in `extractValue`'s doc comment.
- **The thenable check is structural, not `instanceof Promise`.** A transform may return a thenable from any promise implementation, and every one of them reaches the step body equally unwrapped. The type-level prohibition on `ParameterTypeDefinition.transform` covers the honest caller; this guard covers the `any`-cast and plain-JavaScript ones, and the test exercises exactly that cast.
- **`D` is never inspected.** The matcher takes a registry and returns the caller's payload untouched, which is how a package forbidden by ADR-EC-015 from depending on `effect` still serves Phase 6's `R`-typed step definitions.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Correctness] `requirements mark-complete` deliberately not run for MATCH-01**

- **Found during:** Post-task state updates
- **Issue:** MATCH-01 appears in this plan's `requirements` frontmatter, and this plan does complete the *runtime* half of roadmap success criterion 1 that 03-02 explicitly left open. But MATCH-01 as written in REQUIREMENTS.md is about step patterns *using* cucumber-expressions syntax, and nothing a consumer can reach does so yet: `packages/gherkin/src/index.ts` exports neither `createStepMatcher` nor `defineParameterType` nor `StepPatternError`, and `loadFeature` does not build a registry. Flipping MATCH-01 to Complete here would make REQUIREMENTS.md claim something no published code path does, which AGENTS.md §4 ("Say only what is true") forbids.
- **Fix:** Skipped the marking step; `.planning/REQUIREMENTS.md` is untouched and MATCH-01 remains `Pending`. Same call 03-01 (deviation 3), 03-02 (deviation 3) and 03-03 (deviation 1) made, and the same repo precedent: `PARSE-01..03` were marked at 02-09, the plan that shipped the behaviour end to end. **03-05 owns `index.ts` and should mark MATCH-01 and MATCH-02 together.**
- **Files modified:** none
- **Verification:** `git status --porcelain .planning/REQUIREMENTS.md` is empty.
- **Committed in:** n/a — no change was made.

**2. [Rule 2 - Robustness] `compileExpression` split into a cache half and a construction half**

- **Found during:** Task 1
- **Issue:** The plan describes `compileExpression` as constructing "inside a `try`/`catch`, stores it, and returns it". Written literally, the compiled value has to be a `let` assigned inside the `try` and read after the `catch`, which makes its definite assignment depend on TypeScript proving the `catch` block's `fail(...)` calls are never-returning — a narrowing rule with real preconditions that a later refactor (inlining `fail`, or dropping its `: never` annotation) could silently break, turning a compile error into nothing at all.
- **Fix:** Extracted a private `constructExpression(registry, pattern)` whose `catch` arms `return fail(...)`. The behaviour is identical and the observable surface is unchanged; the cache read/write in `compileExpression` is now a straight line with no `let`.
- **Files modified:** `packages/gherkin/src/StepMatcher.ts`
- **Verification:** `pnpm build` exits 0; all 25 tests pass; both mutation proofs still fail by name.
- **Committed in:** `3ee4f48`

**3. [Rule 2 - Coverage] Three tests added beyond the plan's list**

- **Found during:** Task 2
- **Issue:** The plan's list left three gaps a wrong implementation could walk through. Nothing asserted that `entries` is exposed unchanged and in order (a matcher that reordered its own entries would pass every listed test), nothing asserted that a compilation failure is reported *again* on a second `match` rather than degrading to "no match", and the undefined-parameter-type case bundled the laziness claim into the same test as the error-shape claim, so a failure would not say which had broken.
- **Fix:** Added `exposes its entries unchanged, in registration order`, `raises the same failure again on a second match, rather than reporting no match`, and split the undefined-parameter-type case into a laziness test and a full-error-shape test. All are pure additions; no listed test was dropped or weakened.
- **Files modified:** `packages/gherkin/test/StepMatcher.test.ts`
- **Verification:** 25 tests pass (the plan asked for at least 22).
- **Committed in:** `2c7e871`

**4. [Rule 3 - Blocking] A comment naming the forbidden array-ordering methods tripped the plan's own grep**

- **Found during:** Task 2 acceptance checks
- **Issue:** The Set-comparison test carried a comment explaining why neither ordering method is used, spelling both of them out. `grep -c 'toSorted\|\.sort(' packages/gherkin/test/StepMatcher.test.ts` therefore returned 1 against an acceptance criterion demanding 0, even though no ordering call exists in the file.
- **Fix:** Reworded the comment to `expressions-pin.test.ts`'s phrasing ("the immutable ES2023 ordering method is unavailable under this repo's ES2022 lib and the in-place one is rejected by oxlint's `unicorn(no-array-sort)`"), which says the same thing without either literal. The grep is now 0.
- **Files modified:** `packages/gherkin/test/StepMatcher.test.ts`
- **Verification:** `grep -c 'toSorted\|\.sort(' packages/gherkin/test/StepMatcher.test.ts` is 0; `pnpm lint` exits 0.
- **Committed in:** `2c7e871`

---

**Total deviations:** 4 auto-fixed (1 Rule 1 — correctness, 2 Rule 2 — robustness/coverage, 1 Rule 3 — blocking).
**Impact on plan:** No scope change. Deviation 1 is the fourth consecutive plan in this phase to decline a mechanical requirement marking for the same reason; 03-05 is the plan that should actually mark MATCH-01 and MATCH-02. Deviation 4 is worth remembering when writing a grep-based acceptance criterion: a prohibition expressed as a literal string also prohibits *explaining* it in a comment.

## Issues Encountered

- **The pattern-only cache mutation broke a test nobody wrote for it**, and that accident is the clearest available demonstration of Pitfall 13: an expression compiled against a registry carrying `money` was served to a matcher whose registry had no `money`, and the undefined-parameter-type error simply never fired. A reader tempted to "simplify" the two-level cache should reproduce that before deciding.
- **`ParameterType.name` is `string | undefined` upstream**, and `exactOptionalPropertyTypes` makes that matter: `StepPatternError`'s `parameterTypeName?: string` will not accept `string | undefined`. Normalised with `?? ""`, which is not a fudge — `""` is the genuine registry name of the anonymous `{}` parameter type, and `describeName` renders it as such.
- **`"I have {int} cukes}"` is a perfectly valid pattern** (a stray closing brace is literal text). `"I have {int cukes"` is the unclosed-brace case that actually throws, and it is what the `InvalidStepPattern` test uses. Verified against the installed package rather than assumed.
- Every claim in the plan's `<interfaces>` block was re-verified against the installed package's own `.d.ts`: `Argument.getValue<T>(thisObj: unknown): T | null`, `Group.value: string` (not optional), and `CucumberExpression.match(text): readonly Argument[] | null`.

## Known Stubs

None. Both artifacts are complete and exercised. `StepMatcher.ts` has no in-`src` caller yet **by design**: 03-05's `index.ts` and Phase 6's `Plan` are its consumers, and the test file is its caller in the meantime, running on every push.

## Threat Flags

None. No network, auth, file-access or schema surface was added.

- **T-03-16** (first-match-wins deciding a step argument's type by registration order) — mitigated: `match` returns every entry and is forbidden from ordering or preferring. Proven by the two-patterns-one-step fixture (length 2, `5` and `"5"`), the order-reversed companion, and mutation proof 1.
- **T-03-17** (a memoized expression serving a stale registry binding) — mitigated: registry-keyed `WeakMap` holding a per-registry pattern `Map`, proven by reference inequality across two registries and mutation proof 2, which also surfaced the failure mode itself.
- **T-03-18** (a transform throwing synchronously out of `getValue`) — mitigated: every `getValue` call is wrapped; a throw becomes `ParameterTransformFailed` naming the parameter type and quoting the raw matched text.
- **T-03-19** (an async transform handing a `Promise` to a step body) — mitigated: a structural thenable check raises `AsyncParameterTransform`. The test drives it through the deliberate `as unknown as` cast that simulates the plain-JavaScript caller.
- **T-03-20** (ReDoS through a regex built from Gherkin or pattern text) — mitigated: `grep -c 'new RegExp'` on the source is **0**; all regex construction and escaping is `CucumberExpression`'s. A catastrophically backtracking *custom* parameter-type regexp remains possible and is accepted at 03-03's boundary.
- **T-03-21** (an invalid pattern surfacing as an upstream throw naming a column number) — mitigated: both compilation failure modes are re-raised as `StepPatternError` with `pattern` set and the full pattern in the message; `UndefinedParameterType` additionally sets `parameterTypeName` and states the fix.
- **T-03-22** (the raw matched text quoted in full) — **accepted**, consistent with the locked no-truncation decision in `Errors.ts`. A test asserts the message contains a 73-character raw token whole and introduces no ellipsis.
- **T-03-SC** holds: no dependency, catalog entry or lockfile line was touched. `@cucumber/cucumber-expressions` is reached through the package barrel only — the source contains no deep path into that package's published build directory.

## User Setup Required

None — no external service configuration required.

## Next Phase Readiness

Ready for 03-05 and 03-06. Specifically:

- **03-05 owns `packages/gherkin/src/index.ts`** and its `must_haves` already names `defineParameterType`, `StepPatternError`, `createStepMatcher` and `StepArgs` as the surface to export. Until then, import by direct relative path (`../src/StepMatcher.ts`), never through the barrel.
- **03-05 should mark MATCH-01 and MATCH-02 complete in REQUIREMENTS.md.** Four consecutive plans have now deferred the marking on the same "say only what is true" grounds; 03-05 is where both requirements become true through the published surface.
- **`buildRegistry()` must still be called once per `loadFeature`/`parseFeature` invocation and never memoized.** This module's cache does not change that: it keys on the registry it is handed, so a fresh registry per call is correct and cheap — the second load simply recompiles, which is the point.
- **`match` must not grow a `throw` for zero-or-many, and must not grow a sort.** Phase 6's MATCH-03/MATCH-04 consume the array as-is and supply the Scenario location the error needs. An acceptance grep and mutation proof 1 both defend this; do not "helpfully" collapse the array to a single best match.
- **`StepMatch<D>.args` is `ReadonlyArray<unknown>`, deliberately.** Phase 5's DSL narrows it with `StepArgs<P>` at the call site; this package cannot, because a custom parameter type's transform return type is not recoverable from a pattern string at runtime.
- **`compileExpression` is exported and is part of the tested surface**, mainly so the memoization claim is assertable by reference identity. Callers should normally go through `createStepMatcher`.
- Repo test count is now **329 across 13 files** (304 before this plan).

## Self-Check: PASSED

- `packages/gherkin/src/StepMatcher.ts` — FOUND
- `packages/gherkin/test/StepMatcher.test.ts` — FOUND
- Commit `3ee4f48` — FOUND
- Commit `2c7e871` — FOUND
- `pnpm build`, `pnpm lint`, `pnpm circular`, `pnpm typecheck:test`, `pnpm verify:no-runner-dep` and `pnpm test` (329 passing, 13 files) all exit 0.

---
*Phase: 03-parameter-types-and-step-matching*
*Completed: 2026-08-28*
