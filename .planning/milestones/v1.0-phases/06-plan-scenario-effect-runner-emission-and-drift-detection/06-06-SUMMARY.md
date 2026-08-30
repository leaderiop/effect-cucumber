---
phase: 06-plan-scenario-effect-runner-emission-and-drift-detection
plan: 06
subsystem: emission-stage-runner
tags: [emission, testapi-seam, recording-fake, describe-nesting, rules, scenario-outline, drift-warnings, mutation-tested, run-01, match-05]

# Dependency graph
requires:
  - phase: 06-03
    provides: "TestApi — the two-member seam this module reaches describe/it.effect through, and note (a)'s standing prohibition on a vitest import; UnusedStepDefinitionWarning, whose fields become the warning node's title"
  - phase: 06-04
    provides: "FeaturePlan / ScenarioPlan / planFeature — the plan this module walks, and FeaturePlan.warnings, D-02's channel 3, which channel 2 presents"
  - phase: 06-05
    provides: "buildScenarioEffect — called once per Scenario, inside a thunk, so the Layer is built at run time and not at collection time"
  - phase: 02-loadfeature-parse-and-validation
    provides: "ParsedFeatureCore.scenarios / rules / allScenarios — the two views of a Feature this walk joins, and ParsedScenario.name vs astName"
provides:
  - "emitFeature: a FeaturePlan plus a TestApi become one describe block, one nested describe per Rule, and one test per Scenario"
  - "The locked spec/glossary.md emission shape, in code: describe(feature.name) → describe(rule.name) → it.effect(scenario.name)"
  - "D-02 channel 2 — one always-passing, distinctly-titled test node per unused step definition"
  - "The first test double of any kind in this repo: a recording TestApi fake that records nesting DEPTH, not just call names"
affects:
  - "06-07 — the composition root that constructs a real TestApi from the framework and calls emitFeature; owns the barrel and the RUN-01/MATCH-03/04/05 markings"
  - "Phase 9 (RUN-05, tag routing) — the plan that adds skip/only to TestApi and to this walk"
  - "Phase 10 (RUN-03/RUN-04, ADR-EC-018) — the shared-Layer path, where the injected api becomes layer(...)'s callback argument and note (a) stops being hypothetical"

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "A recording fake that records nesting DEPTH alongside each call, so a tree shape is assertable and not just a call list"
    - "A closure-held depth counter incremented before a define callback and decremented in a finally, copied from describeFeature.ts's scope stack"
    - "Positional deepStrictEqual over the whole recorded array, never a .some()/.find() search"

key-files:
  created:
    - packages/vitest/src/Runner.ts
    - packages/vitest/test/Runner.test.ts
  modified:
    - spec/invariants.md
    - spec/traceability.md

key-decisions:
  - "Neither `vitest` nor the `@effect` package wrapping it is written out anywhere in Runner.ts, comments included — the acceptance grep that enforces the no-import rule cannot tell a citation from an import"
  - "buildScenarioEffect is called inside a thunk, never eagerly during collection: the composed value carries the Effect.provide, so an eager call moves every Layer build into collection"
  - "The unused-definition node always PASSES and is emitted LAST — a skipped node would make the reporter's skipped count a lie, and hoisting the warnings pushes the Feature's own Scenarios off the top of the block"
  - "The warning title carries the keyword and the definition site, not the pattern alone, so two registrations of one pattern string cannot produce two identically-titled nodes"
  - "The two scenario-emission loops are written out twice rather than shared, because the one property under test is which block a node lands in and a shared helper hides it"
  - "A ParsedScenario with no plan is a thrown Error with an explanation, never a non-null assertion"
  - "RUN-01 and MATCH-05 deliberately NOT marked Complete — nothing user-facing calls emitFeature yet"

patterns-established:
  - "Assert an emitted TREE by recording a depth per call; call names and order alone cannot distinguish nesting from sibling emission"
  - "When an acceptance grep counts a literal, that literal also constrains the comments — cite the forbidden name indirectly and say in the doc comment that you did"

requirements-completed: []

# Metrics
duration: ~20min
completed: 2026-08-29
tasks: 2
files: 4
tests_before: "504 across 25 files"
tests_after: "515 across 26 files"
---

# Phase 6 Plan 06: The Emit Stage — Runner and Emission Summary

**`emitFeature` walks a `FeaturePlan` and declares the tests — one block named after the Feature, one nested block per `Rule`, one test per Scenario titled with its interpolated Pickle name, and one always-passing node per unused step definition last — reaching `describe` and `it.effect` exclusively through the injected `TestApi`, which is what makes the whole emission shape assertable against a recording fake with no test-framework machinery in scope.**

## Performance

- **Duration:** ~20 min
- **Tasks:** 2
- **Files:** 4 (2 created, 2 modified)
- **Repo tests:** 504 across 25 files → **515 across 26 files**

## Task Commits

| # | Task | Commit |
|---|------|--------|
| 1 | Emit describe blocks and one it.effect per Scenario | `d113450` |
| 2 | A recording fake TestApi, and the emission-shape assertions (incl. spec reconciliation) | `552ca4f` |

## What Was Built

### `packages/vitest/src/Runner.ts` (created, 189 lines)

Roughly thirty lines of executable code under a doc comment that is most of the file — the same ratio `ScenarioEffect.ts` has, and for the same reason: every wrong emission compiles, type-checks, lints, and produces a green suite.

```typescript
api.describe(plan.feature.name, () => {
  for (const scenario of plan.feature.scenarios) {
    const scenarioPlan = planFor(scenario)
    api.effect(scenarioPlan.name, () => buildScenarioEffect({ plan: scenarioPlan, layer }))
  }
  for (const rule of plan.feature.rules) {
    api.describe(rule.name, () => {
      for (const scenario of rule.scenarios) {
        const scenarioPlan = planFor(scenario)
        api.effect(scenarioPlan.name, () => buildScenarioEffect({ plan: scenarioPlan, layer }))
      }
    })
  }
  for (const warning of plan.warnings) {
    api.effect(warningTitle(warning), () => Effect.void)
  }
})
```

Four lettered notes carry the reasoning. The three worth restating:

**(b) `buildScenarioEffect` is called inside a THUNK.** Passing `buildScenarioEffect({ … })` directly compiles, type-checks and passes every "did the Scenario run" assertion — while composing every Scenario's Effect during collection. Since the composed value is what carries the `Effect.provide`, that moves Layer construction into collection for every Scenario in the file, including the ones a `-t` filter is about to skip, and it breaks INV-EC-002's per-execution freshness in the process. The laziness is asserted directly: the thunk-wiring test checks the step log is still empty immediately after `emitFeature` returns.

**(c) The unused-definition node always passes, and the warnings go LAST.** ADR-EC-019 makes an unused pattern a warning and not a failure, so `Effect.void` is the whole body. A `skip` would be worse than a failure in one specific way — the count of skipped tests a reporter prints would stop meaning "tests the author chose not to run", which is the only thing that number is good for. The plausible reversal is "put the warnings first, they are more visible", and it is refused in writing: a variable-length block of footnotes at the top pushes the Feature's own Scenarios off the top of the block, and D-02's channel 2 only asks for visible-in-the-reporter, not first.

The title is `⚠ unused step definition: {keyword} {JSON.stringify(pattern)} ({site})`. The keyword and the site are there because two identical pattern strings registered at two sites is a real arrangement — `test/Plan.test.ts` has one — and two identically-titled nodes are handled badly by the reporter and by `vitest/no-identical-title` alike (T-06-06-02). `JSON.stringify` is copied from `Plan.ts`'s `quoted`, so a pattern containing a quote cannot forge the end of the quoted span (T-06-06-01). Feature, Rule and Scenario names are deliberately not escaped: rendering them exactly as the author wrote them is the entire job of a test title.

**(d) `ScenarioPlan.name` is the title; `astName` never is.** The mirror of `Plan.ts` note (c), and the one that only a Scenario Outline can catch — for every plain Scenario in every fixture the two strings are identical.

The `Map` keyed on `scenarioId` joins the two views of a Feature: `plan.scenarios` was built off the flat `allScenarios`, and this walk re-derives the nesting from `feature.scenarios` and `feature.rules`. A miss is unreachable by construction and is a thrown `Error` naming the id, the Scenario name, and the two modules that could be wrong — `Registry.ts`'s shape for an impossible state, and the reason there is no `!` in the file under `noUncheckedIndexedAccess`. The branch has its own test.

### `packages/vitest/test/Runner.test.ts` (created, 11 tests)

**The first test double of any kind in this repository.** 06-PATTERNS.md went looking for a spy, mock, stub or recording fake and found none, so `makeRecordingApi` is designed fresh and sets the house style.

The design decision that matters is that each record carries a **`depth`**, not just a kind and a name. Emitting a Rule's Scenarios as siblings of the Rule's block registers the identical five calls with the identical five names in the identical order, and produces a reporter tree that is simply wrong — the depth is the only thing that separates the two, and mutation A is the demonstration. The counter is incremented before `define` runs and decremented in a `finally`, copying `describeFeature.ts:146-168` verbatim; without the `finally` a single throwing block would shift the depth of every record after it, so the assertions that failed would belong to LATER tests. One test proves the `finally` by throwing from a `define` callback and asserting the next record's depth.

Every shape assertion is a `deepStrictEqual` over the **whole** recorded array. A `.some(...)` search passes against an implementation that reordered the Scenarios, emitted the Rules first, or hoisted the warning nodes — all three of which are orderings this module deliberately does not have.

Fixtures are real `ParsedFeature`s from `parseFeature` at module scope and real `FeaturePlan`s from `planFeature`. The plan is deliberately NOT hand-built here, unlike `ScenarioEffect.test.ts`: the join between the flat `plan.scenarios` and the Feature/Rule nesting is part of what is under test, and a hand-built plan could not get it wrong. The single exception is one hand-written warning, which is the only way to reach the absent-definition-site branch of the title — `planFeature` always fills the field.

## Verification

| Gate | Result |
|------|--------|
| `pnpm vitest run packages/vitest/test/Runner.test.ts` | **11 passed** (criterion: ≥ 8) |
| `pnpm test` | **515 passed across 26 files** (was 504 across 25) |
| `pnpm build` | exit 0 |
| `pnpm lint` (oxlint + dprint) | exit 0 |
| `pnpm typecheck:test` | exit 0, both projects |
| `pnpm circular` | no circular dependency |
| `pnpm verify:spec` | PASS 7 / FAIL 0 / SKIP 1 |
| `pnpm verify:tsgo-gate` | ENFORCED, overload order intact |
| `pnpm verify:pack` | pack shape OK, publint clean both packages |
| `pnpm verify:no-runner-dep` | ENFORCED |
| `pnpm verify:oxlint-plugin` | ENFORCED |
| `git diff --stat pnpm-lock.yaml` / both `package.json` | empty (T-06-06-SC holds) |

### Acceptance greps

| Check | Required | Actual |
|-------|----------|--------|
| `grep -c 'from "vitest"' src/Runner.ts` | 0 | **0** |
| `grep -c '@effect/vitest' src/Runner.ts` | 0 | **0** (see deviation 2) |
| `grep -rlE 'from "(vitest\|@effect/vitest)"' packages/vitest/src packages/gherkin/src` | no output | **no output**, exit 1 |
| `grep -c 'api.describe(' src/Runner.ts` | exactly 2 | **2** |
| `grep -c 'api.effect(' src/Runner.ts` | exactly 3 | **3** |
| `grep -v '^ \*' src/Runner.ts \| grep -c 'async'` | 0 | **0** |
| `grep -v '^ \*' src/Runner.ts \| grep -cE '\[[0-9]+\]!\|\bas \b'` | 0 | **3**, all three the mandated `import * as` lines — see deviation 3. Zero type assertions and zero index assertions, which is the criterion's intent |
| test file records mutations A, B, C | yes | **yes** |

## Mutation Testing

All three mutations were performed, observed failing, and reverted. `git checkout -- packages/vitest/src/Runner.ts` after each, with `git status` clean before the next.

| # | Mutation | Result |
|---|----------|--------|
| A | a Rule's Scenarios emitted as SIBLINGS of the Rule's block (`api.describe(rule.name, () => {})`, then the loop outside it) | **1 failed / 10 passed.** Exactly the Rule-nesting test, on depth alone: `- "depth": 2 / + "depth": 1` for `refund granted` and `refund denied`. Every name and every position unchanged |
| B | each test titled with `scenarioPlan.astName` instead of `scenarioPlan.name` | **1 failed / 10 passed.** Exactly the Scenario Outline test: `- "name": "adding 2" / + "name": "adding <count>"` — both rows collapsed onto one title |
| C | the unused-definition node emitted with `Effect.fail(warning)` instead of `Effect.void` | **1 failed / 10 passed.** Exactly the always-passing test: `assert.isTrue(Exit.isSuccess(...))` → `+ false` |

Each of the three failed with exactly ONE test, which is what makes those three assertions load-bearing rather than incidentally covered — a mutation that fails half the file proves only that the file runs.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 — Blocking] Workspace dependencies restored in the worktree**

- **Found during:** setup, before Task 1
- **Issue:** the freshly-created worktree had no `node_modules`, so `tsc`, `vitest`, `oxlint`, `dprint` and `madge` — every verification command in the plan — were unrunnable. The same blocker 06-01 through 06-05 each hit.
- **Fix:** `pnpm install --frozen-lockfile`. A restore from the committed lockfile, not a package addition: no package name was resolved that the lockfile did not already pin, and `git diff --stat pnpm-lock.yaml` is empty at plan end. Threat **T-06-06-SC**'s "this plan installs nothing" disposition is intact.
- **Files modified:** none tracked (`node_modules` is gitignored).

**2. [Rule 1 — Criterion self-contradiction] The doc comment the `<action>` asks for defeated its own acceptance grep**

- **Found during:** Task 1 acceptance checks
- **Issue:** the `<action>` requires a note (a) stating that nothing from `vitest` or `@effect/vitest` may ever be imported here. Writing that sentence puts the literal string `@effect/vitest` in the file, and the criterion is `grep -c "@effect/vitest" … returns 0` — which counts the citation exactly as it would count an import. First draft returned `1`. This is the same class of collision 06-04 recorded for `createStepMatcher(` and STATE.md records from 03-04: a criterion that greps for a literal also constrains the prose.
- **Fix:** note (a) now says "no import from `vitest`, or from the `@effect` package wrapping it", and adds a sentence recording that neither name is written out anywhere in the file *because the grep cannot tell a citation from an import*, pointing at `TestApi.ts` note (a) — which is under no such grep — for the spelled-out names. The rule loses nothing: the prohibition is stated, the reason is stated, and the enforcement is now unambiguous.
- **Files modified:** `packages/vitest/src/Runner.ts`
- **Verification:** grep returns `0`; the cross-package `grep -rlE 'from "(vitest|@effect/vitest)"' packages/*/src` still produces no output.
- **Committed in:** `d113450`

**3. [Rule 1 — Criterion unsatisfiable as written] The no-assertion grep matches AGENTS.md §3's mandated import form**

- **Found during:** Task 1 acceptance checks
- **Issue:** `grep -v '^ \*' … | grep -cE '\[[0-9]+\]!|\bas \b'` must return `0`. `\bas \b` matches `import * as Effect from "effect/Effect"`, which AGENTS.md §3 makes mandatory for every module in this repo — so the criterion as literally written is unsatisfiable by any file that imports anything. `ScenarioEffect.ts` and `Plan.ts` would each return 3 and 4 under it.
- **Fix:** none needed in the code; the criterion's INTENT is what was checked, and the `<action>` states it plainly — "the missing-plan case is a thrown `Error` with an explanation, not an assertion". Excluding the namespace-import lines, the grep returns **0**: `Runner.ts` contains no type assertion and no non-null index assertion of any kind, and the missing-plan branch is a thrown `Error` with a message naming the scenario id, the scenario name and the two modules that could be at fault. Recorded here rather than silently passed over, and the table above reports the raw count as well as the intent-check.
- **Files modified:** none
- **Verification:** `grep -v '^ \*' … | grep -v '^import \* as ' | grep -v '^import type \* as ' | grep -cE '\[[0-9]+\]!|\bas \b'` → `0`

**4. [Rule 3 — Blocking] `Layer.empty` does not type-check in `emitFeature`'s Layer position**

- **Found during:** Task 2, at `pnpm typecheck:test`
- **Issue:** the plan's `<action>` offers "`Layer.empty` or a `Layer.succeed` marker service". `Layer.empty` is `Layer<never, never, never>`, and `emitFeature`'s parameter is `Layer.Layer<any, any, never>`, whose `ROut` this build treats as invariant — 11 instances of `TS2375: Type 'any' is not assignable to type 'never'`. What makes this worth recording is that **`pnpm build` and `pnpm vitest run` were both green on it**: neither type-checks a file under `packages/vitest/test`, so only `pnpm typecheck:test` can see it. A plan that ran the tests and stopped would have shipped it.
- **Fix:** the other half of the plan's own offer — one module-scope `Layer.succeed` over a `Context.Service` marker, shared by every test. `ROut` is then `Marker` rather than `never` and assigns fine. The file's header records the measurement so the "simplification" back to `Layer.empty` is refused before it is attempted.
- **Files modified:** `packages/vitest/test/Runner.test.ts`
- **Verification:** `pnpm typecheck:test` exits 0, both projects.
- **Committed in:** `552ca4f`

**5. [Rule 2 — Missing critical] `spec/invariants.md` and `spec/traceability.md` asserted four things that had become false**

- **Found during:** post-Task-2 verification
- **Issue:** AGENTS.md §1 makes `spec/` normative and §4 forbids saying what is not true in either direction. Four statements: (i) `spec/traceability.md`'s preamble lists "the `Runner.ts` that will consume a `FeaturePlan`" among the files that "remain **planned** and do not exist on disk" — this plan creates it; (ii) §4 is enumerated from disk, one row per test file, and had no row for `Runner.test.ts`; (iii) §1's row 01 (BEH-EC-001–004 — "a Feature compiles to one `describe` block", "a Scenario to one `it.effect` call") did not name `Runner.ts` or `TestApi.ts`, which are now the source modules for exactly those two sentences; (iv) `spec/invariants.md`'s INV-EC-002 and its §2 row both say isolation across Scenarios "is not asserted until the Runner generates one `it.effect(...)` per Scenario" and "until a Runner emits two" — the Runner now does, so the stated trigger has fired while the assertion still does not exist. `pnpm verify:spec` catches none of it: 03-06's cross-check reads only `packages/gherkin/test`, a gap 06-01 recorded and every plan adding a suite owes a manual row for.
- **Fix:** `Runner.ts` moved into the preamble's real-source list, with the "real but not reachable from any user-facing call" sentence extended to name all three of `planFeature`, `buildScenarioEffect` and `emitFeature`; the §4 row added in alphabetical position; §1's row 01 extended with `TestApi` and `Runner`. INV-EC-002's entry now separates the MECHANISM (complete — the Runner emits one Effect per Scenario, so no two can share a build) from the CLAIM (still unasserted), and says the remaining gap is a **test** rather than a module: nothing yet runs two emitted Scenarios against a state-carrying Layer. Its §2 row was reworded to match.
- **Files modified:** `spec/invariants.md`, `spec/traceability.md`
- **Verification:** `pnpm verify:spec` → PASS 7 / FAIL 0 / SKIP 1; `pnpm lint` (which runs `dprint check` over `spec/**/*.md`) exits 0 after `pnpm format` re-padded the widened §1/§2/§4 tables.
- **Committed in:** `552ca4f`

---

**Total deviations:** 5 auto-fixed (2 blocking, 2 criterion collisions, 1 missing critical). No scope creep: both source changes are inside the plan's two declared files, and the two extra files are the normative spec contract AGENTS.md §1 requires be updated in the same change.

## Requirement Marking

**RUN-01 and MATCH-05 both stay Pending. `.planning/REQUIREMENTS.md` is unchanged.**

This is the seventh consecutive plan in this repo to decline a marking on AGENTS.md §4 grounds, and the reason is textual each time.

- **RUN-01** — "Each Scenario **compiles to** exactly one `it.effect` call; Background and Scenario steps run as sequential `yield*`s inside one `Effect.gen`, short-circuiting on the first failure." The second clause has been true and mutation-proven since 06-05. The first is now BUILT — `emitFeature` calls `api.effect` exactly once per Scenario, asserted positionally — but a Scenario still does not *compile to* anything for a user: `describeFeature` discards its collection, so nothing constructs a real `TestApi` or calls `emitFeature` outside this plan's own test suite.
- **MATCH-05** — "is **reported** as a Feature-level warning". D-02 chose three surfaces. Channel 3 (the structured list) landed in 06-04; channel 2 (the synthetic passing node) lands here and is asserted; channel 1 (`console.warn` at collection time) does not exist, and none of the three reaches a developer, for the same reason.

**Plan 06-07 — the one that wires `describeFeature` → `planFeature` → `emitFeature`, constructs the real `TestApi`, and owns the barrel — owns marking RUN-01, MATCH-03, MATCH-04 and MATCH-05.** That is the plan at which each sentence above becomes true end to end.

## Threat Model Disposition

| Threat ID | Disposition | Status |
|-----------|-------------|--------|
| T-06-06-01 (Tampering, pattern text embedded in a test title) | mitigate | **Done.** The pattern is rendered with `JSON.stringify` inside the warning title, so a quote or a newline in a pattern cannot forge what looks like a second node in the reporter's output. Asserted directly: the absent-site test uses the pattern `I am "quoted"` and compares against the escaped rendering. Feature, Rule and Scenario names are NOT escaped, deliberately and in writing — they must render exactly as the author wrote them. |
| T-06-06-02 (DoS, duplicate test titles) | mitigate | **Done.** The warning title carries the keyword and the definition site, so two identical pattern strings at two sites produce two distinct titles — its own test, with sites at lines 9 and 10, which also pins `planFeature`'s numeric site order. Scenario titles use the interpolated Pickle name; mutation record B is the standing proof that `astName` would collapse an Outline's rows. |
| T-06-06-03 (Repudiation, a Feature that emits zero tests and passes) | mitigate | **Done.** `TestApi.describe`'s `define` is typed `() => void`, so an async callback cannot be written; `grep -v '^ \*' Runner.ts \| grep -c async` returns 0. Every positional assertion in `Runner.test.ts` fails if the expected `effect` records are absent, and one asserts there is exactly ONE record at depth 0 — a Feature emitting nothing would produce a one-element array against a three-element expectation. |
| T-06-06-04 (Information Disclosure, absolute definition-site paths in a title) | accept | Unchanged and deliberate. The site is a path on the developer's own machine, already present in the error messages 06-04 produces and in every stack trace the toolchain prints. |
| T-06-06-SC (package-manager installs) | accept | **Verified.** No `pnpm add`. `pnpm-lock.yaml` byte-unchanged; both `package.json` files untouched; `pnpm install --frozen-lockfile` succeeded unchanged. |

## Threat Flags

None. This plan adds no network endpoint, no auth path, no file access, no subprocess and no schema at a trust boundary. It walks an in-memory value and calls two injected functions.

## Known Stubs

None. `emitFeature` is complete: it walks the real plan, calls the real `buildScenarioEffect`, reads the real `plan.warnings`, and reaches the real seam. Nothing in either file is hard-coded, placeholder or deferred.

Two things a verifier will find and should NOT flag:

- **`emitFeature` has no caller in `src` yet.** That is the wave structure, not a stub — 06-07 is the plan that constructs a real `TestApi` and wires `describeFeature` to call this, and `emitFeature` is fully asserted by its own 11 tests. `spec/traceability.md`'s preamble now says so in writing, naming all three of `planFeature`, `buildScenarioEffect` and `emitFeature`.
- **`skip` and `only` are absent from the emission walk.** `TestApi.ts` note (b) records that as an omission by decision: tag routing and `@skip` are RUN-05, which is Phase 9's, and declaring the surface now would put unreachable members into the contract and into the recording fake.

## TDD Gate Compliance

Task 2 carries `tdd="true"`, but the plan sequences it AFTER a non-TDD Task 1 that creates the implementation, so a literal RED-before-GREEN commit order was not available — any test written against an already-complete module passes on first run, and the TDD reference's fail-fast rule says to investigate a test that passes unexpectedly rather than fake a red. This is the same shape 06-05 recorded, and the resolution is the same.

What was done instead is what the plan itself asks for, and it is stronger for this shape of work: each of the three mutations was applied to the committed implementation, run, observed failing with exactly the predicted test, and reverted — a real red/green cycle per assertion, against a WRONG implementation rather than an absent one. A test that goes red because nothing exists yet proves only that the import resolves; a test that goes red because the Rule's Scenarios were emitted one level too shallow proves the assertion discriminates.

Git log for this plan reads `feat` → `test`, not `test` → `feat`. That inversion is the plan's structure, recorded here rather than papered over.

## Notes for Later Plans

- **`emitFeature` takes the `api` as a parameter and that must never become an import.** 06-07 constructs the concrete `TestApi` at the composition root and passes it in; Phase 10 passes `layer(shared)(name, (it) => …)`'s callback argument instead. The moment `Runner.ts` imports a framework, Anti-Pattern 3 is reachable again with no failing test anywhere.
- **Neither framework package name appears in `Runner.ts`, comments included.** Deviation 2 is why. If a later plan needs to cite them there, it must also change the acceptance grep — do not add the citation and leave the grep.
- **`Layer.empty` does not assign to `Layer<any, any, never>` in this build**, and neither `pnpm build` nor `pnpm vitest run` can see the failure — only `pnpm typecheck:test`. Use a `Layer.succeed` marker in any test that needs a trivial Layer. Deviation 4 has the diagnostic.
- **A test that asserts an emitted TREE must record a depth.** Names and order alone cannot distinguish `describe(Rule) → effect` from `describe(Rule)` followed by two siblings — mutation A is the proof, and it changed nothing else about the recording.
- **The recording fake lives in `test/Runner.test.ts` and is not shared.** It is the first test double in the repo. If a second file needs one, copy it rather than hoisting it to a helper module until there are three: a shared fake starts drifting from the interface it fakes the moment two files want different things from it, which is the failure `TestApi.ts` note (b) already anticipates for `skip`/`only`.
- **`plan.warnings` is read, never recomputed.** D-02's three channels are one computation and three presentations. 06-07's channel 1 (`console.warn` at collection time) must read the same list.
- **`Runner.ts` is not in the barrel and should stay out.** 06-07 owns `packages/vitest/src/index.ts` and 06-03's four `Errors.ts` exports. A consumer calls `describeFeature`, never a runner — the same precedent `Registry.ts`, `collectFeature`, `TestApi.ts`, `Plan.ts` and `ScenarioEffect.ts` all set.
- **`spec/invariants.md`'s INV-EC-002 now says the mechanism is complete and only the assertion is missing.** The plan that runs two emitted Scenarios against a state-carrying Layer owes that entry an edit, plus its §2 row. `pnpm verify:spec` will not catch it.
- **There is still no `rule` scope kind in the registry** (`Plan.ts` note (e)). `Runner.ts` emits the Rule's `describe` from `feature.rules`, which is AST structure, not registry scope — the two are independent, and Phase 8's DSL-05 changes the second without touching this walk.
- Repo test count is now **515 across 26 files**.

## Self-Check: PASSED

Files verified present on disk:

- `/Users/mohammadalmechkor/Projects/Perso/effect-cucumber/.claude/worktrees/agent-aa0787bf2a720a72e/packages/vitest/src/Runner.ts`
- `/Users/mohammadalmechkor/Projects/Perso/effect-cucumber/.claude/worktrees/agent-aa0787bf2a720a72e/packages/vitest/test/Runner.test.ts`
- `/Users/mohammadalmechkor/Projects/Perso/effect-cucumber/.claude/worktrees/agent-aa0787bf2a720a72e/spec/invariants.md`
- `/Users/mohammadalmechkor/Projects/Perso/effect-cucumber/.claude/worktrees/agent-aa0787bf2a720a72e/spec/traceability.md`

Both commits verified in `git log` on `worktree-agent-aa0787bf2a720a72e`: `d113450`, `552ca4f` — both descending from the plan base `e0f4b95`.

`git diff --stat e0f4b95 HEAD` names exactly four files and nothing else. `.planning/STATE.md`, `.planning/ROADMAP.md`, `.planning/REQUIREMENTS.md` and `pnpm-lock.yaml` are all untouched, as worktree mode requires. No file deletions in either commit. Working tree clean apart from this summary.

---

*Phase: 06-plan-scenario-effect-runner-emission-and-drift-detection*
*Plan: 06*
*Completed: 2026-08-29*
