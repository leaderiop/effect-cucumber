---
phase: 06-plan-scenario-effect-runner-emission-and-drift-detection
plan: 07
subsystem: composition-root
tags: [composition-root, emission, drift-detection, barrel, testapi-injection, console-warn, requirements-marked, mutation-tested, run-01, match-03, match-04, match-05]

# Dependency graph
requires:
  - phase: 06-03
    provides: "TestApi — the two-member seam the concrete implementation is built against; Errors.ts's four names, which this plan publishes"
  - phase: 06-04
    provides: "planFeature / FeaturePlan — the Plan stage this composition root now calls, and FeaturePlan.warnings, whose already-assembled message is passed to the terminal verbatim"
  - phase: 06-05
    provides: "buildScenarioEffect — reached transitively through emitFeature"
  - phase: 06-06
    provides: "emitFeature — the Emit stage, and its standing requirement that the api arrive as a parameter and never as an import"
  - phase: 05-describefeature-type-surface
    provides: "describeFeature's two overloads and their load-bearing order, collect() as the one shared implementation, and the FeatureCollection this plan extends"
provides:
  - "A working runner: describeFeature(feature, layer, define) emits real, running vitest tests"
  - "The composition root proper — Register → Plan → Emit as one flat ordered sequence, and the only module in packages/vitest/src permitted to import a test framework"
  - "D-02 channel 1: console.warn at collection time, from describeFeature's body and never from collect"
  - "FeatureCollection.plan — D-02 channel 3 on the collection, so collectFeature exposes warnings without printing them"
  - "The public drift-detection surface: StepMatchError and the three companion types on the barrel"
  - "RUN-01, MATCH-03, MATCH-04, MATCH-05 marked Complete, each backed by a named assertion"
affects:
  - "Phase 7 (DSL-07, RUN-02) — hooks wrap the Scenario Effect; the composition root is where the hook registry joins the pipeline"
  - "Phase 8 (DSL-05, DSL-06) — a rule scope kind in the registry, which changes the Register stage this file drives"
  - "Phase 9 (RUN-05) — skip/only on TestApi, which changes the object constructed here"
  - "Phase 10 (RUN-03/RUN-04) — a DIFFERENT TestApi flows through the same parameter; note (e) is written for that plan's author"

# Tech tracking
tech-stack:
  added:
    - "@types/node (catalog:, devDependencies of packages/vitest only — already in the tree via packages/gherkin; no new package resolved)"
  patterns:
    - "A composition root that constructs the concrete dependency at module scope and passes it by value, keeping every stage below it framework-free"
    - "A test that counts its own emitted tests from the inside, because a suite cannot notice a test that was never registered"
    - "Stub-call-restore at MODULE scope with assertions in a later `it`, for anything that registers test nodes"

key-files:
  created:
    - packages/vitest/test/emission.test.ts
  modified:
    - packages/vitest/src/describeFeature.ts
    - packages/vitest/src/index.ts
    - packages/vitest/test/describeFeature.test.ts
    - packages/vitest/package.json
    - packages/vitest/tsconfig.json
    - packages/vitest/tsconfig.test.json
    - packages/vitest/test/tsgo-gate/tsconfig.json
    - pnpm-lock.yaml
    - .planning/REQUIREMENTS.md
    - spec/invariants.md
    - spec/roadmap.md
    - spec/traceability.md

key-decisions:
  - "planFeature is called inside `collect`, the SHARED implementation, not in describeFeature alone — planning in one entry point only would be exactly the drift `collect` exists to prevent"
  - "console.warn is in describeFeature's body and NOT in collect, so collectFeature stays silent for a test asserting on plan.warnings"
  - "warning.message is passed through verbatim; the terminal text and the structured list are one string, never two renderings"
  - "The tsgo-gate fixture tsconfig needed types: [\"node\"] too — every fixture imports the package, which resolves to src/"
  - "emission.test.ts's Feature is entirely happy-path; a failing emitted test is not a legible way to assert that drift detection works"
  - "The no-emit mutation SURVIVED the first draft and forced a new assertion — the file now counts completed Scenarios from the inside"
  - "RUN-01/MATCH-03/04/05 marked Complete here, the seventh-plan-running decision to defer finally reversed because all four are now true end to end"

patterns-established:
  - "A test file that asserts on emitted tests needs one assertion that fails when NOTHING is emitted; every other assertion in such a file is vacuously true under that mutation"
  - "Anything that registers vitest nodes must be called at collection time, so a stub around it installs and restores at module scope and the assertions read a recorded array from a later `it`"

requirements-completed: [RUN-01, MATCH-03, MATCH-04, MATCH-05]

# Metrics
duration: ~35min
completed: 2026-08-29
tasks: 3
files: 13
tests_before: "515 across 26 files"
tests_after: "526 across 27 files"
---

# Phase 6 Plan 07: The Composition Root — Wiring, Warnings, and the Public Surface Summary

**`describeFeature` stops discarding its collection: it plans it, prints every unused-pattern warning to the terminal, and emits real, running vitest tests through a `TestApi` this module is the only one in `packages/vitest/src` allowed to construct — which makes RUN-01, MATCH-03, MATCH-04 and MATCH-05 true end to end for the first time, and marks all four Complete.**

## Performance

- **Duration:** ~35 min
- **Tasks:** 3
- **Files:** 13 (1 created, 12 modified)
- **Repo tests:** 515 across 26 files → **526 across 27 files**

## Task Commits

| # | Task | Commit |
|---|------|--------|
| 1 | Put node globals in scope for packages/vitest | `380b5b6` |
| 2 | Make describeFeature plan, warn, and emit | `c40be84` |
| 3 | Publish the drift-detection surface and prove the runner end to end | `1d56e5b` |

## What Was Built

### `packages/vitest/src/describeFeature.ts` — the composition root, wired

The eleven-line body that replaces one discarded call:

```typescript
const collection = collect(feature, layer, define)

for (const warning of collection.plan.warnings) {
  console.warn(warning.message)
}

emitFeature({ api: vitestTestApi, plan: collection.plan, layer: collection.layer })
```

Three placement decisions carry the weight, and each has a mutation behind it.

**`planFeature` is called inside `collect`, not here.** `collect`'s own doc comment says it exists so `describeFeature` and `collectFeature` cannot drift into two behaviours, and planning in only one of them would have been precisely that drift — `collectFeature` would have returned a collection whose `plan` was computed on a different code path, or absent. What the two entry points differ on is emission, and that is now the only thing they differ on.

**`console.warn` is here and NOT in `collect`.** The inverse placement compiles, type-checks, passes `pnpm lint`, and prints the right words — it just makes `collectFeature` noisy, so every test asserting on `plan.warnings` also spams the reporter with the warnings it is asserting on. Mutation A is the demonstration and it fails exactly one assertion.

**`warning.message` is passed through, never rebuilt.** D-02's three channels are one computation and three presentations. Mutation B rebuilds the string at the call site from the warning's own fields, and it is instructive: the rebuilt message still contained the pattern, the keyword and the Feature name, so three of the four assertions passed. The **definition site** is the fact a rebuild loses, and it is also where `Plan.ts`'s `JSON.stringify` quoting lives — which is what stops a pattern containing a control character from rewriting the terminal line (T-06-07-01).

The concrete seam is one line at module scope, `const vitestTestApi: TestApi = { describe, effect: it.effect }`, and note (e) is written for Phase 10's author: the seam is a parameter rather than an import because RUN-03/RUN-04 will pass a **different** `TestApi` through it — the `it` object `layer(shared)(name, (it) => …)` hands its callback. Both are valid `TestApi`s, neither substitutes for the other, and that is exactly why the choice belongs at a call site.

`FeatureCollection` gained `plan: FeaturePlan`, following `Model.ts:193-205`'s precedent that the producing stage adds its own field at the join seam. Neither overload moved; `pnpm verify:tsgo-gate` still reports ENFORCED on all nine checks.

### `packages/vitest/test/emission.test.ts` (created, 8 tests) — the only file that calls `describeFeature` for real

A parsed `.feature` source with a one-step Background and two Scenarios, a `Context.Service` holding a `Ref`, and step definitions that read it back. Each Scenario's `Then` compares the **whole accumulated log**, and that single comparison pins three separate properties that each fail silently on their own: that the Background ran and ran FIRST (the log must open with `opened`), that the steps ran in document order, and that each Scenario got its own Layer build — a shared build would leave the second Scenario reading `opened,first,opened,second`. That last one is INV-EC-002's previously-unasserted half.

The `Then` body also asserts on vitest's `currentTestName`, which must START with the Feature's name. Emitted as siblings of the block instead, every test name and every result is identical and this is the only line that changes. `Runner.test.ts` proves the same property structurally against a recording fake by recording a nesting DEPTH; this proves it against the real framework, which is the half a fake cannot reach.

The reporter output is the acceptance criterion, and it reads the way a Feature file does:

```
✓ Emission > the first scenario records its own entry
✓ Emission > the second scenario records a different entry
✓ Drift > one matched step
✓ Drift > ⚠ unused step definition: Given "a step no Scenario in this Feature ever writes" (…/emission.test.ts:254:7)
```

**The terminal channel is stubbed at MODULE scope, and asserted inside an `it`.** That split is forced, not stylistic: `describeFeature` REGISTERS test nodes, and vitest rejects a registration made while a test is running. So the stub-call-restore runs at collection time into a module-scope array, and the `it` reads it afterwards. The original is captured before anything installs a stub so the restore can be asserted by **reference identity** — every weaker check (still a function, still callable, right arity) passes against a leaked stub, and actually calling it to see whether it records would print to this suite's own stderr.

### `packages/vitest/src/index.ts` — the public surface

`StepMatchError` plus `StepMatchErrorReason`, `UnusedStepDefinitionWarning` and `UnusedStepDefinitionWarningReason`, in one group with a doc comment, mirroring how gherkin's barrel exports `LoadFeatureWarning` alongside `LoadFeatureError`. `Errors.ts`'s closing paragraph reserved this edit for plan 06-07 back in 06-03; it is redeemed here.

Nothing else was added. The "Deliberately NOT exported" paragraph now names `planFeature`, `buildScenarioEffect`, `emitFeature`, `captureCallSite`, `TestApi` and `collectFeature` explicitly, so the omission reads as a decision (T-06-07-03) — and it states the asymmetry: a published internal stage is a contract this project then has to keep through every change to the pipeline it is a stage of.

The "**Current state**" paragraph said "it emits ZERO vitest tests. Test emission is Phase 6's." It now describes what the package actually does, and names what is still missing with `spec/roadmap.md` cited as the authority — hooks (Phase 7), Rule-scoped Layers and typed Outline Examples (Phase 8), tag routing and `@skip` (Phase 9), and the build-once `shared` Layer with its `TestClock` isolation (Phase 10), with the honest note that `{ shared, perScenario }` is accepted and type-checked today while both halves are built per Scenario at runtime.

## Verification

| Gate | Result |
|------|--------|
| `pnpm install --frozen-lockfile` | exit 0 against the committed lockfile |
| `pnpm build` | exit 0, no `TS2584`, no `TS2688` |
| `pnpm lint` (oxlint + dprint) | exit 0 |
| `pnpm test` | **526 passed across 27 files** (was 515 across 26) |
| `pnpm test` run twice | identical output — no console stub leaked |
| `pnpm typecheck:test` | exit 0, both projects |
| `pnpm circular` | no circular dependency |
| `pnpm verify:pack` | pack shape OK, publint clean both packages |
| `pnpm verify:tsgo-gate` | **ENFORCED**, nine checks, overload order intact |
| `pnpm verify:oxlint-plugin` | ENFORCED |
| `pnpm verify:no-runner-dep` | ENFORCED |
| `pnpm verify:spec` | PASS 7 / FAIL 0 / SKIP 1 |
| `pnpm vitest run packages/vitest/test/emission.test.ts` | 8 passed; reporter shows `Emission` containing two passing tests |

### Acceptance greps and assertions

| Check | Required | Actual |
|-------|----------|--------|
| `grep -c 'planFeature(' src/describeFeature.ts` | exactly 1 | **1** |
| `grep -c 'emitFeature(' src/describeFeature.ts` | exactly 1 | **1** |
| `grep -c 'console.warn' src/describeFeature.ts` | exactly 1 | **1**, in `describeFeature`'s body, not in `collect` |
| `grep -c '@effect/vitest' src/describeFeature.ts` | exactly 1 | **1** (the import; see deviation 3) |
| `grep -rlE 'from "(vitest\|@effect/vitest)"' packages/vitest/src` | only describeFeature.ts | **only `describeFeature.ts`** |
| `grep -c 'Emits ZERO vitest tests' src/describeFeature.ts` | 0 | **0** |
| `grep -c 'emits ZERO vitest tests\|Test emission is Phase 6' src/index.ts` | 0 | **0** |
| `@types/node` is `catalog:` in devDependencies only | yes | **yes**, and absent from `dependencies`/`peerDependencies` |
| `git diff pnpm-workspace.yaml` | empty | **empty** — no version moved |
| `exports` vs `publishConfig.exports` key sets | identical | **identical** (`[".", "./package.json"]`) |
| barrel exports `StepMatchError` as a runtime value | yes | **yes** (see deviation 4 for how it was checked) |
| internal stages documented as unexported AND not exported | yes | **yes**, both halves of the `node -e` criterion |
| `git diff .planning/REQUIREMENTS.md` requirement/status lines | exactly 8 | **exactly 8** (see deviation 5 for the footer) |

## Mutation Testing

Three mutations, each applied to the committed implementation, run, and reverted with `git checkout --` and a clean `git status` before the next.

| # | Mutation | Result |
|---|----------|--------|
| A | `describeFeature` warns from inside `collect` instead of from its own body | **1 failed / 6 passed.** Exactly the `collectFeature`-stays-silent assertion: `expected 2 to be 1` |
| B | the warn call is passed a string rebuilt at the call site instead of `warning.message` | **1 failed / 6 passed.** Exactly the definition-site assertion. The rebuilt message still contained the pattern, the keyword and the Feature name, so the three assertions above it passed — which is the point |
| C | `describeFeature` calls `collect` and never emits | **1 failed / 3 passed** — *after* the fix below. See deviation 1: this mutation SURVIVED the first draft |

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 — Missing critical] The no-emit mutation survived the first draft of `emission.test.ts`, and threat T-06-07-05 was unmitigated**

- **Found during:** Task 3, running the mutation the plan itself mandates
- **Issue:** the first draft asserted only on what the emitted tests did *while running*. Under the mutation — `describeFeature` collects and plans but never calls the emission stage — nothing was emitted, so nothing ran, so nothing asserted. Vitest reported **`7 passed → 3 passed`** and the repo went **522 → 518**, with **nothing red anywhere**. The plan's own `must_haves`, its mutation record D in `describeFeature.test.ts`, and threat T-06-07-05's disposition all assert that this file is where that regression goes red. It was not. A test suite cannot notice a test that was never registered by looking at the tests that were — it has to count them from the inside.
- **Fix:** each Scenario's final step now pushes its full `currentTestName()` into a module-scope array, and a `describe` block declared LAST in the file (vitest runs a file's suites in declaration order) compares that array positionally against both expected names. One `toEqual` over the whole array pins four properties at once: that tests were emitted at all, that there is exactly one per Scenario, that they ran in document order, and that the Feature's name is their parent. The file's header records the survival rather than quietly presenting a mutation that always worked.
- **Files modified:** `packages/vitest/test/emission.test.ts`
- **Verification:** mutation re-applied → **1 failed / 3 passed**, `expected [] to deeply equal [ …(2) ]`. Reverted; 8 passed.
- **Committed in:** `1d56e5b`

**2. [Rule 3 — Blocking] `packages/vitest/test/tsgo-gate/tsconfig.json` also needed `types: ["node"]`**

- **Found during:** Task 2, at `pnpm verify:tsgo-gate`
- **Issue:** the plan's verified fact 1 identified two configs that compile `packages/vitest/src` and therefore need node globals. There is a third. Every tsgo-gate fixture imports `@effect-cucumber/vitest` the way a real consumer writes it, that self-reference resolves through the package's `exports["."]` to `packages/vitest/src/`, and the new `console.warn` was `TS2584` in all seven fixture programs — including the POSITIVE controls, turning the gate from ENFORCED into a false failure with a misleading diagnostic ("the DSL positive control failed to compile — a scoped step was wrongly rejected").
- **Fix:** `types: ["node"]` on the shared parent `tsconfig.json`, which all seven siblings extend, with a comment naming why it reaches that file specifically. One edit.
- **Files modified:** `packages/vitest/test/tsgo-gate/tsconfig.json`
- **Verification:** `pnpm verify:tsgo-gate` → ENFORCED, all nine checks, overload order intact.
- **Committed in:** `c40be84`

**3. [Rule 1 — Criterion collision] The doc comment the `<action>` asks for would have defeated its own acceptance grep**

- **Found during:** Task 2 acceptance checks
- **Issue:** the `<action>` asks note (e) to record that this is the only module permitted to import a test framework, and to name what Phase 10 will pass instead. Writing the framework's package name in that prose puts a second occurrence of the literal `@effect/vitest` in the file, and the criterion is `grep -c '@effect/vitest' … returns exactly 1`. Same class as 06-06's deviation 2 and 06-04's `createStepMatcher(` collision: a criterion that greps for a literal also constrains the comments.
- **Fix:** note (e) refers to "a test framework" and "the Effect test constructor", and cites `TestApi.ts` note (a) — which is under no such grep — as the place both names are spelled out. Nothing is lost: the prohibition, its reason, and the Phase 10 hand-off are all stated. The same care applies to `planFeature(`, `emitFeature(` and `console.warn`, each of which is under an exactly-once grep and therefore appears in prose only without the trailing paren.
- **Files modified:** `packages/vitest/src/describeFeature.ts`
- **Verification:** all four greps return exactly 1.

**4. [Rule 1 — Criterion unsatisfiable as written] The barrel `node -e` check cannot run from the repo root**

- **Found during:** Task 3 acceptance checks
- **Issue:** the criterion is `node -e "import('@effect-cucumber/vitest')…" run from the repo root exits 0`. The root `package.json` declares no dependency on either workspace package, so pnpm creates no `node_modules/@effect-cucumber` symlink at the root and the import is `ERR_MODULE_NOT_FOUND` — independent of this plan's changes, and true before it as well.
- **Fix:** none needed in the code; the criterion's INTENT — `StepMatchError` is a runtime value reachable from the package's public barrel — was checked two ways, both exit 0: through the package's own self-reference (`@effect-cucumber/vitest` resolved from inside `packages/vitest`, `typeof StepMatchError === "function"`), and directly against `dist/index.js`, which is what `publishConfig.exports` maps `"."` to and therefore what a consumer actually loads.
- **Files modified:** none

**5. [Rule 2 — Missing critical] `REQUIREMENTS.md`'s footer asserted its own last update was Phase 5**

- **Found during:** Task 3, marking the requirements
- **Issue:** the acceptance criterion says the diff should touch only the eight requirement/status lines. Leaving the footer alone satisfies that literally and leaves the file saying "Last updated: 2026-08-29 after Phase 5" immediately below a Phase 6 change — false, and AGENTS.md §4 makes a false statement in a tracking document a defect rather than a nit. Plan 05-06 maintained this footer, so the precedent is that it is maintained.
- **Fix:** the footer rewritten to name Phase 6, the four requirements, the plan that marked them, and the named assertion backing each — including which test file covers which of D-02's three channels. The criterion's actual intent, "no other requirement's status changed", holds exactly: `git diff` shows 8 insertions / 8 deletions across the requirement list and the status table, and the footer is one further line pair.
- **Files modified:** `.planning/REQUIREMENTS.md`
- **Verification:** `git diff --numstat` on the requirement and status lines is 8/8; no requirement outside RUN-01 and MATCH-03..05 changed.

**6. [Rule 2 — Missing critical] Four statements in `spec/` had become false**

- **Found during:** post-Task-3 verification
- **Issue:** AGENTS.md §1 makes `spec/` normative and §4 forbids saying what is not true in either direction. (i) `spec/invariants.md`'s INV-EC-002 said its second half was **planned** and named "nothing yet runs two emitted Scenarios against a state-carrying Layer" as the gap — `emission.test.ts` is exactly that, and 06-06's summary explicitly left this edit to whichever plan wrote it. (ii) `spec/traceability.md`'s preamble said `planFeature`, `buildScenarioEffect` and `emitFeature` are "real but none of the three is reachable from any user-facing call yet" — all three now run on the path a test author takes. (iii) §4 is enumerated from disk and had no row for `emission.test.ts`; §2's INV-EC-002 row still said isolation across Scenarios "stays untested". (iv) **`spec/roadmap.md`'s "Current state" said "no runner" and "nothing emits `it.effect` yet"** — and the newly-rewritten `index.ts` cites that document as the single authority on what is built, so the citation would have pointed at a false statement. Its "Unit tests" gate row also still listed three `packages/vitest` test files; there are nine. `pnpm verify:spec` catches none of this: 03-06's cross-check reads only `packages/gherkin/test`.
- **Fix:** INV-EC-002 is no longer "half built" — its entry now says both halves hold for the per-Scenario scope, names `emission.test.ts` as the assertion, and separates out the `shared` clause of its own wording as Phase 10's, with the note that building a `shared` Layer too often cannot make one Scenario see another's state (a missed optimisation, not a violated invariant). The traceability preamble, §2 preamble and §2 row updated to match; a §4 row added for `emission.test.ts` in alphabetical position. `spec/roadmap.md`'s headline, narrative paragraph, "Packages exist" row and "Unit tests" row all rewritten.
- **Files modified:** `spec/invariants.md`, `spec/roadmap.md`, `spec/traceability.md`
- **Verification:** `pnpm verify:spec` → PASS 7 / FAIL 0 / SKIP 1; `pnpm lint` exits 0 after `pnpm format` re-padded the widened tables.
- **Committed in:** `1d56e5b`

**7. [Rule 3 — Blocking] Workspace dependencies restored in the worktree**

- **Found during:** setup, before Task 1
- **Issue:** the freshly-created worktree had no `node_modules`, so every verification command in the plan was unrunnable. The same blocker 06-01 through 06-06 each hit.
- **Fix:** `pnpm install --frozen-lockfile`. A restore from the committed lockfile, resolving no package the lockfile did not already pin.
- **Files modified:** none tracked (`node_modules` is gitignored).

---

**Total deviations:** 7 auto-fixed (2 blocking, 3 missing-critical, 2 criterion collisions). Deviation 1 is the one that mattered: without it this plan would have shipped a file whose entire stated purpose — catching a runner that emits nothing — it did not fulfil.

## Requirement Marking

**RUN-01, MATCH-03, MATCH-04 and MATCH-05 are all marked Complete.** This reverses seven consecutive plans' decision to defer, and the reason each deferral gave is now satisfied textually.

- **RUN-01** — "Each Scenario **compiles to** exactly one `it.effect` call; Background and Scenario steps run as sequential `yield*`s inside one `Effect.gen`, short-circuiting on the first failure." 06-06 marked the second clause proven and the first clause *built but not reachable*: "a Scenario still does not compile to anything for a user". It does now. `emission.test.ts` runs a real `describeFeature` call and asserts, positionally, that exactly two tests completed, one per Scenario, each nested under the Feature and each having run the Background first.
- **MATCH-03 / MATCH-04** — the located `StepMatchError` and its message content were proven against values in 06-04, and its landing in the containing Scenario's error channel *in position* in 06-05. What was missing was a user-facing path reaching either. `describeFeature` now walks the same plan those tests assert on.
- **MATCH-05** — "is **reported** as a Feature-level warning". D-02 chose three surfaces. Channel 3 landed in 06-04, channel 2 in 06-06, and 06-06's summary recorded that channel 1 "does not exist, and none of the three reaches a developer". Channel 1 exists as of this plan, and all three now reach one.

Each is backed by a named assertion that fails if the requirement stops being true, and the REQUIREMENTS.md footer records which — one test file per D-02 channel, which is the split that makes the three surfaces independently defensible.

## Threat Model Disposition

| Threat ID | Disposition | Status |
|-----------|-------------|--------|
| T-06-07-01 (Tampering, ANSI/control characters in a terminal warning) | mitigate | **Done.** `warning.message` is passed through unchanged; the pattern inside it was quoted with `JSON.stringify` by `Plan.ts`, which escapes control characters, so a pattern containing an ANSI escape or a carriage return cannot rewrite the terminal line or forge a second warning. Mutation B is the standing proof that the message is not rebuilt — and it is stronger than expected, because the rebuild it applied still printed the right pattern and keyword while losing the escaping and the site. |
| T-06-07-02 (Tampering, supply chain — the `@types/node` declaration) | accept | **Verified.** No new package entered the tree: `@types/node` was already pinned at `^26.4.0` in `pnpm-workspace.yaml`'s default catalog and already declared by `packages/gherkin`. The lockfile diff is **three lines** — one importer entry resolving to the same `26.4.0`. `pnpm-workspace.yaml` is byte-unchanged, `pnpm install --frozen-lockfile` succeeds against the committed lockfile, and `devDependencies`-only placement is re-asserted by `pnpm verify:pack` and `pnpm verify:no-runner-dep`. |
| T-06-07-03 (Elevation of Privilege, over-exporting internal stages) | mitigate | **Done.** Only the one error class and three types were added. `planFeature`, `emitFeature`, `buildScenarioEffect`, `captureCallSite`, `TestApi` and `collectFeature` all stay internal, asserted by the two-part `node -e` criterion that greps the barrel for both halves — documented as unexported AND not actually exported. |
| T-06-07-04 (Information Disclosure, absolute definition-site paths in CI logs) | accept | Unchanged and deliberate, as at T-06-01-03 and T-06-06-04. The site now also reaches stdout via `console.warn`, which is the same class of exposure as the reporter title it already had, and the same paths every stack trace prints. |
| T-06-07-05 (Repudiation, a Feature that silently emits nothing) | mitigate | **Done — but only after deviation 1.** The plan's disposition assumed `emission.test.ts` would catch this by construction. It did not: the mutation ran green with a smaller test count. The `completedScenarios` block added in deviation 1 is what makes the disposition real, and it is asserted by the mutation failing `1 failed / 3 passed`. |
| T-06-07-06 (Tampering, a leaked `console.warn` stub) | mitigate | **Done.** Restored in a `finally`, and asserted by REFERENCE against the original captured before any stub was installed — a weaker "is still a function" check passes against a leak. `pnpm test` run twice produces identical output (526/27 both times). |

## Threat Flags

None. This plan adds no network endpoint, no auth path, no subprocess and no schema at a trust boundary. The one new output channel is `console.warn` on a string this repo assembled, and T-06-07-01 covers it.

## Known Stubs

None. `describeFeature` is complete for this phase's scope: it registers, plans, warns and emits, all against real values, with no placeholder and no hard-coded return.

Four things a verifier will find and should NOT flag:

- **`skip`/`only` are absent from `TestApi`.** Tag routing and `@skip` are RUN-05, Phase 9's. `TestApi.ts` note (b) records it as an omission by decision.
- **`{ shared, perScenario }` builds both halves per Scenario.** ADR-EC-018's build-once path is RUN-03/RUN-04, Phase 10's. The argument form is accepted and type-checked today; `index.ts`'s "Current state", `spec/roadmap.md` and INV-EC-002's entry all say so in writing rather than implying the optimisation exists.
- **No hook surface.** DSL-07/RUN-02 are Phase 7's.
- **`collectFeature` is still unexported.** That is the standing policy, now written out with its reasoning in the barrel's "Deliberately NOT exported" paragraph.

## TDD Gate Compliance

Task 3 carries `tdd="true"`, and a literal RED-before-GREEN commit order was not available for it: the plan sequences it after Task 2, which builds the implementation, and the one part of Task 3 that could have gone red first — the barrel export — cannot be reached from a test at all, because `effect/no-import-from-barrel-package` runs with `checkRelativeIndexImports: true` and fails `pnpm lint` on any relative import of `index.ts`. That criterion is a `node -e` check by design, not a test. This is the same shape 06-05 and 06-06 both recorded, and the resolution is the same.

What was done instead is stronger for this shape of work, and this plan has the receipt: each of the three mutations was applied to the committed implementation, run, and observed. Two failed with exactly the predicted single assertion. **The third passed** — and that is the entire value of the exercise. A test written before an absent implementation goes red because the import does not resolve, which proves only that the file loads. A test run against a WRONG implementation either discriminates or it does not, and mutation C did not, until deviation 1 fixed it.

Git log for this plan reads `chore` → `feat` → `feat`. That ordering is the plan's structure, recorded here rather than papered over.

## Notes for Later Plans

- **`emission.test.ts` is the canary for every future emission change, and its last block is the load-bearing one.** Any plan that changes what `describeFeature` emits owes that positional `toEqual` an update. Do NOT weaken it to a `.length` check or a `.some()` search — deviation 1 is the record of what a file without it fails to catch.
- **Anything that registers vitest nodes must be called at COLLECTION time.** Vitest rejects a registration made from inside a running test, so a stub around `describeFeature` installs and restores at module scope and the assertions read a recorded array from a later `it`. Phase 9's `@skip`/`@only` tests will hit this immediately.
- **`console.warn` belongs in `describeFeature`'s body and must never migrate into `collect`.** `collectFeature`'s silence is a contract two tests assert. Mutation A is the demonstration.
- **Four literals in `describeFeature.ts` are under exactly-once greps** — `planFeature(`, `emitFeature(`, `console.warn` and `@effect/vitest`. Prose in that file must avoid all four, and note (e) says so. If a later plan needs to cite one, it must change the criterion too, not just add the citation.
- **`packages/vitest/test/tsgo-gate/tsconfig.json` compiles `packages/vitest/src` transitively.** Any new ambient global used in `src` needs a `types` entry in THREE configs, not two: the package config, the test config, and the gate config. Deviation 2 has the diagnostic, and the failure message it produces names the wrong problem entirely.
- **Phase 10 changes the object at `describeFeature.ts`'s `vitestTestApi`, not `Runner.ts`.** Note (e) is written for that plan's author. The moment `Runner.ts` imports a framework, ARCHITECTURE.md's Anti-Pattern 3 is reachable again with no failing test anywhere.
- **`spec/roadmap.md`'s "Current state" is now cited by `packages/vitest/src/index.ts` as the authority on what is built.** Any plan that ships user-visible capability owes that document an edit, and `pnpm verify:spec` will not catch a stale one. Its "Unit tests" gate row is enumerated from disk and needs a bump whenever a test file is added.
- **`emitFeature` and `planFeature` now have a caller in `src`.** The "no caller yet" caveat in 06-04's and 06-06's summaries is discharged; `spec/traceability.md`'s preamble says so.
- Repo test count is now **526 across 27 files**.

## Self-Check: PASSED

Files verified present on disk (all 13 appear in `git diff --stat d9bb507..HEAD`, which names exactly these and nothing else):

- `/Users/mohammadalmechkor/Projects/Perso/effect-cucumber/.claude/worktrees/agent-ac9b112d1c679d4ae/packages/vitest/src/describeFeature.ts`
- `/Users/mohammadalmechkor/Projects/Perso/effect-cucumber/.claude/worktrees/agent-ac9b112d1c679d4ae/packages/vitest/src/index.ts`
- `/Users/mohammadalmechkor/Projects/Perso/effect-cucumber/.claude/worktrees/agent-ac9b112d1c679d4ae/packages/vitest/test/emission.test.ts`
- `/Users/mohammadalmechkor/Projects/Perso/effect-cucumber/.claude/worktrees/agent-ac9b112d1c679d4ae/packages/vitest/test/describeFeature.test.ts`
- `/Users/mohammadalmechkor/Projects/Perso/effect-cucumber/.claude/worktrees/agent-ac9b112d1c679d4ae/packages/vitest/test/tsgo-gate/tsconfig.json`
- `/Users/mohammadalmechkor/Projects/Perso/effect-cucumber/.claude/worktrees/agent-ac9b112d1c679d4ae/packages/vitest/package.json`
- `/Users/mohammadalmechkor/Projects/Perso/effect-cucumber/.claude/worktrees/agent-ac9b112d1c679d4ae/packages/vitest/tsconfig.json`
- `/Users/mohammadalmechkor/Projects/Perso/effect-cucumber/.claude/worktrees/agent-ac9b112d1c679d4ae/packages/vitest/tsconfig.test.json`
- `/Users/mohammadalmechkor/Projects/Perso/effect-cucumber/.claude/worktrees/agent-ac9b112d1c679d4ae/pnpm-lock.yaml`
- `/Users/mohammadalmechkor/Projects/Perso/effect-cucumber/.claude/worktrees/agent-ac9b112d1c679d4ae/.planning/REQUIREMENTS.md`
- `/Users/mohammadalmechkor/Projects/Perso/effect-cucumber/.claude/worktrees/agent-ac9b112d1c679d4ae/spec/invariants.md`
- `/Users/mohammadalmechkor/Projects/Perso/effect-cucumber/.claude/worktrees/agent-ac9b112d1c679d4ae/spec/roadmap.md`
- `/Users/mohammadalmechkor/Projects/Perso/effect-cucumber/.claude/worktrees/agent-ac9b112d1c679d4ae/spec/traceability.md`

Three commits verified in `git log` on `worktree-agent-ac9b112d1c679d4ae`: `380b5b6`, `c40be84`, `1d56e5b` — all descending from the plan base `d9bb507`. No file deletions in any of the three.

`.planning/STATE.md` and `.planning/ROADMAP.md` are untouched, as worktree mode requires. `.planning/REQUIREMENTS.md` is modified, which this plan's file list explicitly authorises.

---

*Phase: 06-plan-scenario-effect-runner-emission-and-drift-detection*
*Plan: 07*
*Completed: 2026-08-29*
