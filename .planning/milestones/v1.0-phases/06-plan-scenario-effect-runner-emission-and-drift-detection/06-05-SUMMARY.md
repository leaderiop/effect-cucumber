---
phase: 06-plan-scenario-effect-runner-emission-and-drift-detection
plan: 05
subsystem: scenario-effect-composition
tags: [scenario-effect, fail-fast, inv-ec-001, inv-ec-002, layer-freshness, mutation-tested, run-01]

# Dependency graph
requires:
  - phase: 06-04
    provides: "ScenarioPlan / PlannedStep / ResolvedStep / StepBody — the value objects this module consumes, and the ResolvedPlannedStep/UnresolvedPlannedStep named-union deviation that makes the narrowing writable"
  - phase: 06-03
    provides: "StepMatchError (the value an Unresolved step fails with) and TestApi.effect's Effect<void, unknown, Scope.Scope> signature, which this module's return type is written to satisfy"
  - phase: 05-describefeature-type-surface
    provides: "Step.ts's register (the body is already wrapped, so this module never re-wraps) and FeatureCollection.layer (the single merged Layer this module provides)"
provides:
  - "buildScenarioEffect: one ScenarioPlan plus one Layer become one Effect<void, unknown, Scope.Scope>"
  - "INV-EC-001 made structural and, for the first time in this repo, asserted — by a recorded execution order rather than by an absent exception"
  - "INV-EC-002's per-execution half: the Layer is supplied once per Scenario and rebuilt on every run"
  - "A test fixture pattern for proving sequential-vs-interleaved execution, which needs a real suspension point to discriminate at all"
affects:
  - "06-06 (Runner) — its only caller; it passes the result to TestApi.effect as a thunk and must not run it"
  - "06-07 — wires describeFeature → planFeature → buildScenarioEffect → Runner and owns the barrel"
  - "Phase 10 (RUN-03/RUN-04, ADR-EC-018) — the shared-Layer path; note (b) records why no memoised branch exists here yet"

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "A `for` loop of `yield*` inside one Effect.gen as the IMPLEMENTATION of a fail-fast invariant, with the combinator alternatives named and refused in a doc note"
    - "The Layer's own construction pushes what it built onto a list, so 'how many times was this Layer built' is an assertable fact"
    - "A test fixture that brackets a real suspension point (`Effect.yieldNow`) with :start/:end markers, so sequential execution is distinguishable from interleaved"

key-files:
  created:
    - packages/vitest/src/ScenarioEffect.ts
    - packages/vitest/test/ScenarioEffect.test.ts
  modified:
    - spec/invariants.md
    - spec/traceability.md

key-decisions:
  - "The for loop is the invariant, not an implementation of it: Effect.forEach would move the guarantee from 'the language cannot do otherwise' to 'this combinator's default concurrency happens to be 1'"
  - "The Layer is supplied once around the whole Scenario Effect and never per step — per-step provision compiles, type-checks and passes every 'did it fail' assertion while giving each step its own World"
  - "An Unresolved step becomes a failure in position, never an up-front scan, because how far the Scenario got is the developer's evidence"
  - "The test fixture needs a real suspension point: without one, mutation A (unbounded concurrency) SURVIVES the whole file, because a synchronous step body never suspends and unbounded concurrency degenerates to sequential"
  - "RUN-01 deliberately NOT marked Complete — nothing calls it.effect yet"

patterns-established:
  - "Prove a concurrency claim by bracketing a suspension point, never by a single record per unit of work — measured, not assumed"
  - "Make 'how many times was this built' observable by having the Layer record its own builds, rather than comparing Layer object references"

requirements-completed: []

# Metrics
duration: ~15min
completed: 2026-08-29
tasks: 2
files: 4
tests_before: "496 across 24 files"
tests_after: "504 across 25 files"
---

# Phase 6 Plan 05: The ScenarioEffect Stage Summary

**`buildScenarioEffect` turns one `ScenarioPlan` into exactly one `Effect` — Background steps leading, the Scenario's own following, a `for` loop of `yield*`s inside one `Effect.gen` so that a failing step structurally prevents every step after it, and the Feature's Layer supplied once around the whole thing and rebuilt on every execution.**

## Performance

- **Duration:** ~15 min
- **Tasks:** 2
- **Files:** 4 (2 created, 2 modified)
- **Repo tests:** 496 across 24 files → **504 across 25 files**

## Task Commits

| # | Task | Commit |
|---|------|--------|
| 1 | Compose the Scenario Effect | `76ae8c3` |
| 2 | Prove fail-fast, order, and Layer freshness | `f3a6010` |
| — | Spec reconciliation (deviation 2) | `14dfdf0` |

## What Was Built

### `packages/vitest/src/ScenarioEffect.ts` (created, 155 lines)

Twelve lines of executable code under a doc comment that is most of the file, which is the correct ratio for a module whose every wrong implementation compiles, type-checks, lints and passes a naive test.

```typescript
Effect.gen(function*() {
  for (const planned of args.plan.steps) {
    if (isUnresolved(planned)) {
      return yield* Effect.fail(planned.error)
    }
    yield* planned.step.body(...planned.step.args)
  }
}).pipe(Effect.provide(args.layer))
```

Three lettered notes carry the reasoning that is not visible from the code:

**(a) The `for` loop IS the invariant; a combinator would only simulate it.** INV-EC-001's own words are "fail-fast is structural, not bookkept", and a generator that has failed simply stops advancing — there is no flag anywhere to get out of sync. The plausible tidy-up is `Effect.forEach(plan.steps, runStep)`, which short-circuits *today* and is therefore green on every test that only checks THAT a Scenario failed. It moves the guarantee from "the language cannot do otherwise" to "this combinator's default concurrency happens to be 1", and adding `{ concurrency: "unbounded" }` — a change that reads like a performance win — interleaves the steps with nothing in the type system objecting. Mutation A is the demonstration.

**(b) The Layer is supplied ONCE, around the whole Scenario, never per step.** Moving the provision inside the loop compiles, type-checks, lints, and leaves every "did this Scenario pass" assertion green — while rebuilding the Layer once per step, so each step gets its own `World`, its own `Ref`, its own testcontainer. A Scenario that stores a value in step one and reads it back in step three then reads an *empty* World rather than a stale one, which looks like a bug in the step author's code and is not. `Effect<A, E, R>` is identical either way.

**(c) An `Unresolved` step becomes a failure IN POSITION.** An up-front scan is shorter and reads as a nice early exit, and it is wrong twice: ADR-EC-019 fails the containing Scenario, and how far the Scenario got is the evidence that tells the developer whether the undefined step is the only problem. Nor is this ARCHITECTURE.md's Anti-Pattern 2 — no matching happens here at all; `Plan.ts` did the matching at plan time, and only the verdict is deferred to the position it belongs to.

The module imports `effect/Effect` and three type-only imports. It knows nothing about any test framework, and `isUnresolved` is a type predicate over a destructured `_tag` because `oxlint(no-underscore-dangle)` forbids the member access — the workaround 06-04 exported both union members by name to make possible.

### `packages/vitest/test/ScenarioEffect.test.ts` (created, 8 tests)

Every plan value is an object literal in this file, never routed through `planFeature` — a `Plan.ts` regression must not fail here too, or a red run stops saying which module broke.

The fixture Layer keeps a `Ref` **inside** the service and pushes each build's `Ref` onto a list, so one observation answers three questions at once: what ran, in what order, and how many times the Layer was built. That is what makes mutation C fail two tests rather than none.

## Verification

| Gate | Result |
|------|--------|
| `pnpm vitest run packages/vitest/test/ScenarioEffect.test.ts` | **8 passed** (criterion: ≥ 6) |
| `pnpm test` | **504 passed across 25 files** (was 496 across 24) |
| `pnpm build` | exit 0 |
| `pnpm lint` (oxlint + dprint) | exit 0 |
| `pnpm typecheck:test` | exit 0, both projects |
| `pnpm circular` | no circular dependency |
| `pnpm verify:spec` | PASS 7 / FAIL 0 / SKIP 1 |
| `pnpm verify:tsgo-gate` | ENFORCED, 9/9 assertions |
| `pnpm verify:pack` | pack shape OK, publint clean both packages |
| `pnpm verify:no-runner-dep` | ENFORCED |
| `pnpm verify:oxlint-plugin` | ENFORCED |
| `git diff pnpm-lock.yaml` / both `package.json` | empty (T-06-05-SC holds) |
| `packages/vitest/src/Step.ts` | unmodified — no re-wrapping introduced |

### Acceptance greps

| Check | Required | Actual |
|-------|----------|--------|
| `grep -v '^ \*' src/ScenarioEffect.ts \| grep -c vitest` | 0 | **0** |
| `grep -v '^ \*' src/ScenarioEffect.ts \| grep -cE 'Effect\.(forEach\|all\|reduce)'` | 0 | **0** |
| `grep -v '^ \*' src/ScenarioEffect.ts \| grep -c 'Effect.fn'` | 0 | **0** |
| `grep -c 'Effect.provide' src/ScenarioEffect.ts` | exactly 1 | **1** |
| `grep -v '^ \*' src/ScenarioEffect.ts \| grep -cE 'catchAll\|catchTag\|try \{'` | 0 | **0** |
| declared return type | `Effect.Effect<void, unknown, Scope.Scope>` | **exact** |
| `grep -c 'toThrow' test/ScenarioEffect.test.ts` | 0 | **0** |
| `expect(` inside an `it.effect` body | 0 | **0** — both occurrences are in the one sync `it`, and `pnpm lint` (`vitest/no-standalone-expect`) is the operative check |
| test file records mutations A, B, C | yes | **yes** |

## Mutation Testing

All three mutations were performed, observed failing, and reverted. `git status` was clean and `git diff HEAD` empty after each revert, so `ScenarioEffect.ts` is byte-identical to its committed state.

| # | Mutation | Result |
|---|----------|--------|
| A | the `for` loop replaced with `Effect.forEach(args.plan.steps, …, { concurrency: "unbounded" })` | **3 failed / 5 passed.** Ordering: `[…'one:start', 'two:start', 'three:start', 'four:start', 'one:end'…]` against the expected strict bracketing. Fail-fast: `expected ['one:start','two:start',…(3)] to deeply equal ['one:start','one:end','two:start']` — steps three and four ran. Unresolved: `expected ['one:start'] to deeply equal ['one:start','one:end']` |
| B | the `Unresolved` branch changed from `Effect.fail` to a no-op `continue` | **1 failed / 7 passed.** Exactly the unresolved test, reported as `expected 'the Scenario unexpectedly succeeded' to equal StepMatchError: …` — the Exit-based assertion's fallback string doing precisely the job `Step.test.ts` says it exists for |
| C | the Layer provided inside the loop, once per step | **3 failed / 5 passed.** `expected 4 to equal 1` for the build count; the ordering test's `builds[0]` holds only `['background:start','background:end']`; fail-fast reads `['one:start','one:end']` because step two's log went to a different `Ref` |

Mutation B failing with exactly ONE test is what makes the unresolved-step assertion load-bearing rather than incidentally covered.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 — Blocking] Workspace dependencies restored in the worktree**

- **Found during:** setup, before Task 1
- **Issue:** the freshly-created worktree had no `node_modules`, so `tsc`, `vitest`, `oxlint`, `dprint` and `madge` — every verification command in the plan — were unrunnable. The same blocker 06-01 through 06-04 each hit.
- **Fix:** `pnpm install --frozen-lockfile`. A restore from the committed lockfile, not a package addition: no package name was resolved that the lockfile did not already pin, and `git diff --stat pnpm-lock.yaml` is empty at plan end. Threat **T-06-05-SC**'s "this plan installs nothing" disposition is intact.
- **Files modified:** none tracked (`node_modules` is gitignored).

**2. [Rule 1 — Bug in the test, found by mutation testing] The ordering assertion was unfalsifiable, and mutation A SURVIVED the first draft of the whole file**

- **Found during:** Task 2, running mutation A
- **Issue:** the first draft recorded one entry per step — `["background", "one", "two", "three"]` — exactly as the plan's `<action>` describes. Under mutation A (`Effect.forEach` with `{ concurrency: "unbounded" }`) **all eight tests still passed.** The cause is that every step body was built from `Ref.update` alone and so never suspends: a fibre running it runs it to completion before the next is forked, unbounded concurrency degenerates to sequential execution, and a failure in step two still interrupts three and four before they are scheduled. A log of bare names therefore cannot tell interleaved from sequential execution at all — it asserted an ordering the fixture had made unobservable, which is the precise defect the plan's `<verification>` block ("all three recorded mutations were performed, observed failing") exists to catch.
- **Fix:** each step body now brackets a real suspension point — `${name}:start`, `yield* Effect.yieldNow`, `${name}:end` — which is what every non-trivial step has. Sequential execution logs `[a:start, a:end, b:start, b:end]`; concurrent execution logs `[a:start, b:start, …]` regardless of the order the fibres happen to resume in. Mutation A then fails **three** tests. `recordingStep`'s doc comment records the measurement and forbids the "simplification" back to one entry per step.
- **Files modified:** `packages/vitest/test/ScenarioEffect.test.ts`
- **Verification:** mutation A re-run: 3 failed / 5 passed (was 0 failed / 8 passed).
- **Committed in:** `f3a6010`

**3. [Rule 2 — Missing critical] `spec/invariants.md` and `spec/traceability.md` asserted four things that had become false**

- **Found during:** post-Task-2 verification
- **Issue:** AGENTS.md §1 makes `spec/` normative and §4 forbids describing a planned capability as if it were enforced — and the reverse is equally a false statement. Four of them: (i) `spec/invariants.md`'s header said "One of these — INV-EC-003 — is enforced by code today", and INV-EC-001's entry was labelled **Source (planned)**, naming a "scenario-Effect builder" that now exists and is tested; (ii) INV-EC-002's entry was labelled planned, though its per-execution half is now real and asserted; (iii) `spec/traceability.md`'s §2 said "Every other row's **Enforced by** entry is still a planned mechanism" with INV-EC-001/002's **Test** columns reading "Not yet written"; (iv) §4 is enumerated from disk, one row per test file, and had no row for `ScenarioEffect.test.ts`. `pnpm verify:spec` cannot catch any of it — 03-06's cross-check reads only `packages/gherkin/test`, a gap 06-01 recorded and every plan adding a suite owes a manual row for.
- **Fix:** INV-EC-001's `Source` label drops "(planned)", names `buildScenarioEffect` and its test. INV-EC-002 is labelled **Source (half built)** with both halves spelled out — the per-execution freshness that is asserted, and the cross-Scenario isolation that is not until a Runner emits two Scenarios. Both headers were rewritten to match. `ScenarioEffect.ts` joins the preamble's real-source list and §1's row 02, with the existing "real but not reachable from any user-facing call" sentence extended to cover it. §4 gains its row.
- **Files modified:** `spec/invariants.md`, `spec/traceability.md`
- **Verification:** `pnpm verify:spec` → PASS 7 / FAIL 0 / SKIP 1; `pnpm lint` (which runs `dprint check` over `spec/**/*.md`) exits 0.
- **Committed in:** `14dfdf0`

**4. [Rule 3 — Blocking] `@effect/tsgo`'s `effect(floatingEffect)` forbids the laziness test's expression statement**

- **Found during:** Task 2, at `pnpm typecheck:test`
- **Issue:** the sync test asserting that `buildScenarioEffect` runs nothing calls it and discards the result, which is an Effect-valued expression statement — exactly what `effect(floatingEffect)` exists to reject. Binding it to `_scenario` did not help either: TypeScript's `noUnusedLocals` (TS6133) exempts underscore-prefixed *parameters*, not locals.
- **Fix:** the value is bound and then asserted on (`expect(scenario).toBeTypeOf("object")`), which is not filler — it says a value came back, so the empty build list above is laziness rather than a `buildScenarioEffect` that returned early without composing anything. A comment at the binding says why it exists.
- **Files modified:** `packages/vitest/test/ScenarioEffect.test.ts`
- **Committed in:** `f3a6010`

**5. [Trivial] `expect` imported only because a sync test uses it**

The plan's `<action>` lists `{ assert, describe, expect, it }` as the import and separately requires zero `expect` inside any `it.effect`. Both hold: the one synchronous `it` (the laziness test) uses `expect` twice, every `it.effect` uses `assert`. Had no sync test existed, `expect` would have had to be dropped from the import or `typescript/no-unused-vars` would have failed the lint.

---

**Total deviations:** 4 auto-fixed plus 1 trivial note. No scope creep: both source changes are inside the plan's two declared files, and the two extra files are the normative spec contract AGENTS.md §1 requires be updated in the same change.

## Requirement Marking

**RUN-01 stays Pending. `.planning/REQUIREMENTS.md` is unchanged.**

RUN-01 reads: "Each Scenario compiles to exactly **one `it.effect` call**; Background and Scenario steps run as sequential `yield*`s inside one `Effect.gen`, short-circuiting on the first failure." The second clause is done, mutation-proven, and now traced in `spec/invariants.md`. The first is not: nothing in this repo calls `it.effect` for a Scenario, because `Runner.ts` does not exist. `buildScenarioEffect` has no caller in `src` at all.

**Plan 06-06 (Runner) plus 06-07 (the wiring) own marking it.** This is the sixth consecutive plan in this repo to decline a marking on AGENTS.md §4 grounds, and the reason is textual each time.

## Threat Model Disposition

| Threat ID | Disposition | Status |
|-----------|-------------|--------|
| T-06-05-01 (EoP, executing `planned.step.body`) | accept | Unchanged and deliberate. Running the developer's own step definitions, with arguments from their own `.feature` file, in their own test process, is the product. There is no privilege boundary to elevate across. |
| T-06-05-02 (Tampering, state leaking via a memoised Layer) | mitigate | **Done.** The Layer is supplied once per Scenario Effect and never memoised, so every execution rebuilds it. The freshness test observes a BUILT value across two runs — two different `Ref`s, each holding only its own execution's records — rather than comparing Layer object references, per `Registry.ts` note (a). Mutation record C is the standing guard against moving the provision. |
| T-06-05-03 (DoS, a step that never completes) | accept | Unchanged. No timeout is added here; vitest's own per-test timeout bounds it, passed through unchanged by the `TestApi.effect` seam. A second timeout would fight the framework's and produce two competing failure messages. |
| T-06-05-04 (Repudiation, a swallowed step failure) | mitigate | **Done.** No `catchAll`, `catchTag`, `orElse` or `try`/`catch` appears in the module — asserted by grep, 0 matches outside the doc comment. The "surfaces the step's own error value, unmodified" test asserts the squashed cause is REFERENCE-equal to the object the step failed with, and the unresolved test does the same for the `StepMatchError` instance. |
| T-06-05-SC (package-manager installs) | accept | **Verified.** No `pnpm add`. `pnpm-lock.yaml` byte-unchanged; both `package.json` files untouched; `pnpm install --frozen-lockfile` succeeded unchanged. |

## Threat Flags

None. This plan adds no network endpoint, no auth path, no file access, no subprocess and no schema at a trust boundary. It composes two in-memory values into a third.

## Known Stubs

None. `buildScenarioEffect` is complete: it iterates the real step list, calls the real bodies, fails with the real errors and supplies the real Layer. Nothing in either file is hard-coded, placeholder or deferred.

One thing a verifier will find and should NOT flag: **`buildScenarioEffect` has no caller in `src` yet.** That is the wave structure, not a stub — 06-06 writes the `Runner.ts` that calls it, and it is fully asserted by its own 8 tests rather than by a downstream user. `spec/traceability.md`'s preamble now says this in writing.

## TDD Gate Compliance

Task 2 carries `tdd="true"`, but the plan sequences it AFTER a non-TDD Task 1 that creates the implementation, so a literal RED-before-GREEN commit order was not available: any test written against an already-complete module passes on first run, and the TDD reference's fail-fast rule says to investigate a test that passes unexpectedly rather than fake a red.

What was done instead is stronger for this shape of work, and it is what the plan itself asks for: each of the three mutations was applied to the committed implementation, run, observed failing with the predicted test, and reverted — a real red/green cycle per assertion, against a wrong implementation rather than against an absent one. Mutation A's survival on the first attempt is the proof that this was not ceremony: it found a genuinely unfalsifiable assertion that a conventional RED phase would never have surfaced, because the test would have gone red for the trivial reason that nothing existed yet.

Git log for this plan reads `feat` → `test` → `docs`, not `test` → `feat`. That inversion is the plan's structure, recorded here rather than papered over.

## Notes for Later Plans

- **Never re-run a `buildScenarioEffect` result expecting memoisation.** Every execution rebuilds the Layer. That is INV-EC-002 and it is asserted; `Runner.ts` must pass the result to `TestApi.effect` as a thunk and let the framework decide when to run it.
- **Do not add a shared/per-Scenario branch here.** ADR-EC-018's shared path is Phase 10's reason to exist. A memoised branch added in anticipation breaks INV-EC-002 for every Feature that never asked for one.
- **`PlannedStep` still narrows only through a predicate over a destructured `_tag`.** `ScenarioEffect.ts`'s `isUnresolved` is the third copy of that helper in this package (after `Plan.ts`'s doc note and `Plan.test.ts`'s pair). If a fourth is needed, consider exporting one from `Plan.ts` rather than copying again.
- **A concurrency claim needs a suspension point to be testable.** Deviation 2 is the measurement: `Ref.update`-only bodies make `{ concurrency: "unbounded" }` indistinguishable from sequential. Any later test of hook ordering, `Effect.ensuring` (INV-EC-004) or shared-Layer sequencing needs the same `:start`/`yieldNow`/`:end` bracketing, or it will assert nothing.
- **Prove "how many times was this built" by having the Layer record its own builds.** Reference inequality of the Layer object proves nothing (`Registry.ts` note (a)); reference inequality of what it BUILT does.
- **`ScenarioEffect.ts` is not in the barrel and should stay out.** 06-07 owns `packages/vitest/src/index.ts`. A composed Scenario Effect is an internal stage, following the `Registry.ts` / `TestApi.ts` / `Plan.ts` precedent.
- **`spec/invariants.md`'s header now says TWO invariants are enforced.** The next plan to enforce one (INV-EC-004 via `Effect.ensuring`, or INV-EC-002's second half via the Runner) owes that sentence an edit, plus its own §2 row and §4 row. `pnpm verify:spec` will not catch it.
- Repo test count is now **504 across 25 files**.

## Self-Check: PASSED

Files verified present on disk:

- `/Users/mohammadalmechkor/Projects/Perso/effect-cucumber/.claude/worktrees/agent-ae04052af9ae85902/packages/vitest/src/ScenarioEffect.ts`
- `/Users/mohammadalmechkor/Projects/Perso/effect-cucumber/.claude/worktrees/agent-ae04052af9ae85902/packages/vitest/test/ScenarioEffect.test.ts`
- `/Users/mohammadalmechkor/Projects/Perso/effect-cucumber/.claude/worktrees/agent-ae04052af9ae85902/spec/invariants.md`
- `/Users/mohammadalmechkor/Projects/Perso/effect-cucumber/.claude/worktrees/agent-ae04052af9ae85902/spec/traceability.md`

All three commits verified in `git log` on `worktree-agent-ae04052af9ae85902`: `76ae8c3`, `f3a6010`, `14dfdf0` — all descending from the plan base `99e4ef7`.

`git diff --stat 99e4ef7 HEAD` names exactly four files and nothing else. `.planning/STATE.md`, `.planning/ROADMAP.md`, `.planning/REQUIREMENTS.md` and `pnpm-lock.yaml` are all untouched, as worktree mode requires. No file deletions in any commit. Working tree clean apart from this summary.

---

*Phase: 06-plan-scenario-effect-runner-emission-and-drift-detection*
*Plan: 05*
*Completed: 2026-08-29*
