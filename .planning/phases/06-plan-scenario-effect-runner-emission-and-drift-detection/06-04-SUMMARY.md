---
phase: 06-plan-scenario-effect-runner-emission-and-drift-detection
plan: 04
subsystem: plan-stage-step-resolution-and-drift-detection
tags: [step-matching, scope-chain, drift-detection, cucumber-expressions, mutation-tested, match-03, match-04, match-05]

# Dependency graph
requires:
  - phase: 06-01
    provides: "DefinitionSite / StepDefinition.definedAt, formatCallSite and compareCallSites — the D-03 ordering primitive this plan is the first consumer of"
  - phase: 06-02
    provides: "generateStepSnippet — the D-01 suggested step definition the UndefinedStep error carries"
  - phase: 06-03
    provides: "StepMatchError, UnusedStepDefinitionWarning and makeUnusedStepDefinitionWarning — the data shapes this plan is the first producer of"
  - phase: 05-describefeature-type-surface
    provides: "createRegistry / RegistryScope / the describeFeature collection whose StepBody type this plan relocates"
  - phase: 03-parameter-types-and-step-matching
    provides: "createStepMatcher's match-every-pattern contract, which is what makes MATCH-04 detectable at all"
provides:
  - "planFeature: a ParsedFeature plus a definition list joined into a FeaturePlan in which every step is Resolved or carries a located StepMatchError"
  - "StepBody, relocated out of describeFeature.ts and exported, so the Plan stage can name it without a cycle"
  - "ResolvedStep / PlannedStep / ResolvedPlannedStep / UnresolvedPlannedStep / ScenarioPlan / FeaturePlan — the value objects everything downstream consumes"
  - "The Background/Scenario/Feature scope chain with inner-shadows-outer precedence (ARCHITECTURE.md Pattern 5, the two levels that exist)"
  - "The UndefinedStep and AmbiguousStep messages, both self-contained and both located"
  - "FeaturePlan.warnings — MATCH-05 / D-02 channel 3, deterministic and non-fatal"
affects:
  - "06-05/06-06 (ScenarioEffect + Runner) — consume PlannedStep in position; a resolution failure is step N's failure, not the Scenario's"
  - "06-07 — wires planFeature into describeFeature and owns the barrel edit"
  - "MATCH-03, MATCH-04, MATCH-05 — all three still Pending, deliberately; see Requirement Marking"

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Scope-chain resolution as a RANK over the matcher's results, not a walk up a chain — because the matcher already returned every match at once"
    - "Named type-predicate helpers over a destructured `_tag`, because oxlint's no-underscore-dangle rejects member access on a leading-underscore property"
    - "Both members of a discriminated union exported by name, so a consumer can write the predicate that rule forces"

key-files:
  created:
    - packages/vitest/src/Plan.ts
    - packages/vitest/test/Plan.test.ts
  modified:
    - packages/vitest/src/describeFeature.ts
    - spec/traceability.md

key-decisions:
  - "A resolution failure stays IN POSITION as a PlannedStep union member, never hoisted to a failure field on the Scenario — otherwise an undefined step at the END of a Scenario stops the earlier steps from running at all"
  - "Level precedence is a rank: inner (background/scenario) shadows outer (feature); two matches at the SAME rank is the ambiguity. Treating any two matches as ambiguous would make a Feature-level default impossible to override"
  - "astName is the scope-match key and name never is — matching on name resolves nothing for any Scenario Outline row while working perfectly on every plain Scenario"
  - "One matcher per planFeature call over the whole definition list, against feature.parameterTypes — the only arrangement in which MATCH-04 can see two competing patterns at once"
  - "The ambiguous list is ordered by definition SITE via compareCallSites + toSorted (D-03), never alphabetically and never by registration order"
  - "A pattern counts as USED when it was visible AND matched, not when it was selected — a shadowed-but-matching pattern is not dead code"
  - "The used-set is keyed on the StepDefinition object reference, never on the pattern string"
  - "MATCH-03/04/05 deliberately NOT marked Complete — this plan computes the errors, nothing yet fails a Scenario with one"

patterns-established:
  - "Export both members of a discriminated union by name when a lint rule forbids member access on the discriminant, so the predicate has a type to narrow to"
  - "A stubbed error builder with a STABLE signature in the non-TDD task, so the following TDD task is an edit with a real RED phase rather than a rewrite"

requirements-completed: []

# Metrics
duration: ~22min
completed: 2026-08-29
tasks: 3
files: 4
tests_before: "472 across 23 files"
tests_after: "496 across 24 files"
---

# Phase 6 Plan 04: The Plan Stage — Step Resolution and Drift Detection Summary

**`planFeature` joins a `ParsedFeature` against a registered step tree and resolves every Pickle step through a two-level scope chain to exactly one definition — or to an `UndefinedStep` carrying a copy-pasteable snippet, an `AmbiguousStep` whose pattern list is ordered by definition site and provably independent of registration order, or a non-fatal unused-pattern warning.**

## Performance

- **Duration:** ~22 min
- **Tasks:** 3 (two of them TDD, so five commits)
- **Files:** 4 (2 created, 2 modified)
- **Repo tests:** 472 across 23 files → **496 across 24 files**

## Task Commits

| # | Task | Gate | Commit |
|---|------|------|--------|
| 1 | Plan types and scope-chain resolution | — | `89a364f` |
| 2 | MATCH-03 and MATCH-04, the two drift errors | RED | `c271148` |
| 2 | " | GREEN | `8f8559e` |
| 3 | MATCH-05, unused step definition warnings | RED | `47f70c1` |
| 3 | " | GREEN | `edf3e6c` |

No REFACTOR commit on either TDD task: both GREEN implementations landed at their final shape, and an empty refactor commit is noise.

## What Was Built

### `packages/vitest/src/Plan.ts` (created, 503 lines)

The middle stage of ARCHITECTURE.md's Register→Plan→Emit pipeline, and the phase's only fan-in point. Exports `planFeature`, `StepBody`, `ResolvedStep`, `PlannedStep` (plus both its members by name), `ScenarioPlan` and `FeaturePlan`.

Seven lettered notes carry the reasoning that is not visible from the code. The four worth restating:

**(a) A resolution failure stays IN POSITION in the step list.** `PlannedStep` is a union, not a `failure` field on `ScenarioPlan`. The consequence is the point: a Scenario whose third step is undefined still runs steps one and two and then fails at step three — cucumber-js's behaviour (PITFALLS.md Pitfall 15), and what makes INV-EC-001's fail-fast fall out for free under ADR-EC-004. Hoisted to the Scenario, an undefined step written at the END would stop the earlier steps from running at all, and the developer would lose the one piece of evidence — how far the Scenario got — that says whether the undefined step is the only problem.

**(b) Level precedence is a RANK, not a walk.** A visible match ranks `0` for `background`/`scenario` scope and `1` for `feature`; the lowest rank with at least one match wins. That is Pattern 5's "first match wins walking up the chain", expressed as a rank because the matcher already returned every match at once. The plausible wrong reading — any two matches are ambiguous — makes every Scenario-level override of a Feature-level default an error, so overriding becomes impossible and the shared default has to be deleted. That is precisely the duplication the scope chain removes.

**(c) `astName` is the scope key, `name` never is.** A Scenario Outline compiles to one `ParsedScenario` per Examples row, all sharing one `astName` and each with a distinct interpolated `name`. Matching on `name` compiles, type-checks and works perfectly on every plain Scenario in the suite, then resolves nothing for any Outline row. `name` has exactly one job here: the `it.effect` title.

**(g) "Used" means visible AND matched, not selected.** A Feature-level pattern that matched a step and then lost to a Scenario-level override is not dead code — it matched. Under the "was selected" reading it is reported unused, so the arrangement note (b) exists to support produces a warning telling the author to delete the default. ADR-EC-019's own wording is "a registered pattern that matches zero steps across the whole Feature", which is the visible-and-matched reading.

### The two messages, printed in full and read

Both were rendered from a real run and read end to end (the plan's `<human-check>`):

```
test/checkout.feature:4: UndefinedStep: the step "I add 3 apples" in Scenario "paying" matched none
of the step definitions visible to it. An unmatched step cannot run, so this Scenario fails rather
than passing with a step that silently did nothing. Register a definition for it: When("I add {int}
apples", function*(int: number) {
  // TODO: implement this step
})
```

```
test/shop.feature:4: AmbiguousStep: the step "I do the thing" in Scenario "A" matched 2 step
definitions, all registered at the same scope, listed here in definition-site order. "I do the
{word}" was registered as a Given at /repo/test/shop.steps.ts:9:5. "I do the thing" was registered
as a Given at /repo/test/shop.steps.ts:10:5. Resolving this by registration order would make the
step's argument types and behaviour depend on the order the definitions happen to be written in, so
an unrelated refactor that reorders two registrations would silently change what this test asserts:
`I have {int} apples` and `I have {word} apples` both match `I have 5 apples`, yielding the number 5
from one and the string "5" from the other. Delete all but one of them, or narrow their patterns so
only one can match this step.
```

**Judgement: both stand alone.** Each opens with a `file:line` an editor can jump to, names the step text and the Scenario verbatim, states the harm concretely rather than abstractly, and closes with an action. The undefined one hands over pasteable source; the ambiguous one hands over both sites to go reconcile. A developer who has never opened this codebase can act on either without reading a source file. No rewrite needed.

### `registrarKeywordOf` — and why it is not Anti-Pattern 7

The snippet's registrar name is the step's own literal keyword whenever that keyword is one of the five, which covers every English Feature. `keywordType` is consulted only where the literal keyword provably cannot be a registrar name: a localized Feature (`Etant donné`) or the `*` keyword. ARCHITECTURE.md Anti-Pattern 7 forbids inferring the REPORTED keyword this way, because `And`/`But` collapse into the preceding step's type — and nothing reported here is derived this way. `ResolvedStep.keyword` and every message carry the literal keyword, always. A `*`-keyword test pins that the fallback still produces one of the five.

### `packages/vitest/test/Plan.test.ts` (created, 24 tests)

Every `ParsedFeature` fixture is parsed with the real `parseFeature` at module scope — five of them: `checkout` (Background plus two Scenario steps with an `{int}`), `twoScenarios` (identically-worded steps in A and B), `single`, `split`, `outline` (two Examples rows) and `starKeyword`. No type assertion anywhere. `definitions` are hand-built `StepDefinition<StepBody>` literals, which is the only way to place a definition at an arbitrary scope with an arbitrary `definedAt`.

Five assertions are stricter than they look, each recorded in the file's header: inner-shadows-outer uses two DIFFERENT patterns so the assertion can name which one won; the Outline case asserts BOTH rows; order-independence compares the `message` strings and not just the arrays; the 9-before-10 case is the only thing in the repo that tells a numeric site order from a string one; and the two-definitions-one-pattern case is the only thing that tells an identity-keyed used-set from a string-keyed one.

## Verification

| Gate | Result |
|------|--------|
| `pnpm vitest run packages/vitest/test/Plan.test.ts` | **24 passed** (criteria: ≥ 6, ≥ 14, ≥ 21) |
| `pnpm test` | **496 passed across 24 files** (was 472 across 23) |
| `pnpm build` | exit 0 |
| `pnpm lint` (oxlint + dprint) | exit 0 |
| `pnpm typecheck:test` | exit 0, both projects |
| `pnpm circular` | no circular dependency |
| `pnpm verify:spec` | PASS 7 / FAIL 0 / SKIP 1 |
| `pnpm verify:tsgo-gate` | ENFORCED, 6/6 assertions including overload order |
| `pnpm verify:pack` | pack shape OK, publint clean both packages |
| `pnpm verify:no-runner-dep` | ENFORCED |
| `pnpm verify:oxlint-plugin` | ENFORCED |
| `git diff --stat pnpm-lock.yaml` | empty (T-06-04-SC holds) |

### Acceptance greps

| Check | Required | Actual |
|-------|----------|--------|
| `grep -c 'buildParameterTypeRegistry' src/Plan.ts` | 0 | **0** |
| `grep -c 'feature.parameterTypes' src/Plan.ts` | ≥ 1 | **2** |
| `grep -c 'createStepMatcher(' src/Plan.ts` | exactly 1 | **1** |
| `grep -v '^ \*' src/Plan.ts \| grep -c 'filterMap'` | 0 | **0** |
| `grep -c 'from "./describeFeature.ts"' src/Plan.ts` | 0 | **0** |
| `describeFeature.ts` has `import type { StepBody } from "./Plan.ts"` | 1 | **1** |
| `grep -c 'compareCallSites' src/Plan.ts` | ≥ 1 | **3** |
| `grep -c 'generateStepSnippet(' src/Plan.ts` | exactly 1 | **1** |
| `grep -v '^ \*' src/Plan.ts \| grep -c 'Order.combineAll'` | 0 | **0** |
| `grep -v '^ \*' src/Plan.ts \| grep -cE '\.sort\('` | 0 | **0** |
| `grep -c 'makeUnusedStepDefinitionWarning' src/Plan.ts` | ≥ 1 | **2** |
| `grep -c 'Mutation-tested' test/Plan.test.ts` | ≥ 1, entries A/B/C ×2 | **2 blocks, both A/B/C** |
| `packages/gherkin/src/StepMatcher.ts` modified | no | **unmodified**; its own `toSorted`/`.sort(`/`[0]!` grep still returns 0 |

## Mutation Testing

All **six** mutations were actually performed, observed failing, and reverted. `Plan.ts` was diffed byte-for-byte against its pre-mutation state after each set.

### Task 2 — the drift errors

| # | Mutation | Result |
|---|----------|--------|
| A | `ambiguousStep` renders the matches in `StepMatcher`'s order (the `toSorted` dropped) | **3 failed / 14 passed.** 9-before-10, order-independence and unrecorded-location all fail |
| B | The site comparison replaced with `formatCallSite(...).localeCompare(...)` | **1 failed / 16 passed.** Only "orders line 9 before line 10" fails — `expected [ 'I do the thing', 'I do the {word}' ] to deeply equal [ 'I do the {word}', 'I do the thing' ]`. Nothing else in the repo can see it |
| C | `undefinedStep` sets `suggestion: Option.none()` | **3 failed / 14 passed.** `expected null not to be null`, and `expected null to be 'When("I add {int} apples"…'` |

### Task 3 — the unused-pattern warnings

| # | Mutation | Result |
|---|----------|--------|
| A | The used-set records only the SELECTED definition, not every visible match | **1 failed / 23 passed.** "does NOT report a pattern that matched but lost to an inner-scope registration" — `expected [ { …(8) } ] to deeply equal []` |
| B | The used-set keyed on `definition.pattern` instead of the object reference | **1 failed / 23 passed.** "tracks two definitions sharing one pattern string at two scopes independently" — `expected [] to have a length of 1 but got +0` |
| C | The warning sort dropped | **1 failed / 23 passed.** "returns warnings in an order that does not depend on the registration order" — `expected [ 'unused later', 'unused earlier' ] to deeply equal [ 'unused earlier', 'unused later' ]` |

Every one of the six failed with exactly the test the plan predicted, and B in both sets failed with exactly ONE test — which is what makes those two assertions load-bearing rather than incidentally covered.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 — Blocking] Workspace dependencies restored in the worktree**

- **Found during:** setup, before Task 1
- **Issue:** the freshly-created worktree had no `node_modules`, so `tsc`, `vitest`, `oxlint`, `dprint` and `madge` — every verification command in the plan — were unrunnable. Same blocker 06-01, 06-02 and 06-03 each hit.
- **Fix:** `pnpm install --frozen-lockfile`. A restore from the committed lockfile, not a package addition: no package name was resolved that the lockfile did not already pin, `git status` was clean immediately afterwards, and `git diff --stat pnpm-lock.yaml` is empty at plan end. Threat **T-06-04-SC**'s "this plan installs nothing" disposition is intact.
- **Files modified:** none tracked (`node_modules` is gitignored).

**2. [Rule 1 — Bug] `oxlint(no-underscore-dangle)` makes `planned._tag` unwritable, so both union members are exported by name**

- **Found during:** Task 1, at `pnpm lint`
- **Issue:** the plan specifies `PlannedStep` as an inline anonymous union and every natural consumer spelling is `planned._tag === "Resolved"`. That is 13 lint errors: the rule rejects reading a leading-underscore property through member access. `packages/vitest/test/Errors.test.ts` already carries the workaround — `const { _tag } = x`, which the rule's `allowInObjectDestructuring` permits — but destructuring alone does not NARROW the union, so a type predicate is needed, and a predicate needs a named type to narrow to.
- **Fix:** split the union into two exported named members, `ResolvedPlannedStep` and `UnresolvedPlannedStep`, with `PlannedStep` as their union. The shape the plan specified is byte-identical; only the naming changed. The test file carries `isResolved`/`isUnresolved` predicates built on the destructured discriminant, and `PlannedStep`'s doc comment records why the members are named, so 06-05/06-06 find the answer before rediscovering the lint failure.
- **Files modified:** `packages/vitest/src/Plan.ts`, `packages/vitest/test/Plan.test.ts`
- **Verification:** `pnpm lint` exits 0; `pnpm typecheck:test` exits 0 with the narrowing working through the predicates.
- **Committed in:** `89a364f`

**3. [Rule 1 — Criterion self-contradiction] The explicit `createStepMatcher` type argument defeated its own acceptance grep**

- **Found during:** Task 1 acceptance checks
- **Issue:** `grep -c 'createStepMatcher(' packages/vitest/src/Plan.ts` must return exactly `1`. The first draft wrote `createStepMatcher<StepDefinition<StepBody>>({ … })`, which is the explicit, arguably clearer spelling — and which contains no `createStepMatcher(` substring at all, so the grep returned `0`. This is the same class of collision STATE.md records from 03-04, in a new direction: a criterion that greps for a literal also constrains the syntax used to produce it.
- **Fix:** left the type argument to inference, which is both what the criterion demands and independently better — `entries` is the single source of the payload type, and writing the argument is the one thing that could let it disagree. A comment at the call site says so, so the tidy-up is refused before it happens.
- **Files modified:** `packages/vitest/src/Plan.ts`
- **Verification:** grep returns `1`; `pnpm build` and `pnpm typecheck:test` exit 0 with `D` inferred as `StepDefinition<StepBody>`.
- **Committed in:** `89a364f`

**4. [Rule 2 — Missing critical] `spec/traceability.md` asserted three things that had become false**

- **Found during:** post-Task-3 verification
- **Issue:** three separate false statements, all in a document AGENTS.md §1 makes normative. (i) The preamble lists `Plan.ts` among the files that "remain planned and do not exist on disk" — this plan creates it. (ii) §4 is enumerated from disk, one row per test file, and was missing rows for `packages/gherkin/test/Snippet.test.ts` (06-02), `packages/vitest/test/Errors.test.ts` (06-03) and `packages/vitest/test/Plan.test.ts` (this plan). (iii) §1's BEH-EC-013 row did not name `Snippet.ts` or vitest's `Errors.ts`. `pnpm verify:spec` cannot catch any of it — 03-06's cross-check reads only `packages/gherkin/test`, which 06-01 already recorded as a known gap that every plan adding a suite owes a manual row for.
- **Fix:** moved `Plan.ts` (with `Errors.ts` and `TestApi.ts`) into the preamble's real-source list and added a sentence saying `Plan.ts` is real but not yet reachable from any user-facing call, so the document does not overclaim in the other direction; added the three §4 rows; extended §1's row 01. 06-02's summary explicitly deferred its own spec reconciliation to "the phase-closing plan that actually wires the undefined-step error", which is this one.
- **Files modified:** `spec/traceability.md`
- **Verification:** `pnpm verify:spec` → PASS 7 / FAIL 0 / SKIP 1; `pnpm lint` (which runs `dprint check` over `spec/**/*.md`) exits 0.
- **Committed in:** `edf3e6c`

---

**Total deviations:** 4 auto-fixed (1 blocking, 2 criterion/lint collisions, 1 missing critical). No scope creep: every source change is inside the plan's two declared files, and the one extra file is a documentation contract the repo enforces by convention rather than by script.

## Requirement Marking

**MATCH-03, MATCH-04 and MATCH-05 all stay Pending. `.planning/REQUIREMENTS.md` is unchanged.**

This is the fifth consecutive time a plan in this repo has declined a marking on "say only what is true" grounds (AGENTS.md §4), and the reason is textual:

- **MATCH-03** — "A Pickle step matching zero registered patterns **fails the containing Scenario**". `planFeature` now BUILDS that error, completely, with its location and its snippet. Nothing fails a Scenario with it, because nothing emits a Scenario yet: `describeFeature` still discards its collection (`describeFeature.ts`'s own note says so) and `Runner.ts` does not exist.
- **MATCH-04** — same verb, same gap. The ordering D-03 asks for is done and mutation-proven; the failure is not.
- **MATCH-05** — "is **reported** as a Feature-level warning". D-02 chose three surfaces deliberately: `console.warn`, a synthetic passing test node, and this structured list. Only the third exists, and it is attached to a plan value no user-facing call returns yet.

**Plan 06-07 — the one that wires `planFeature` into `describeFeature` and emits through the `TestApi` seam — owns marking all three.** That is the plan at which each sentence above becomes true end to end.

## Threat Model Disposition

| Threat ID | Disposition | Status |
|-----------|-------------|--------|
| T-06-04-01 (DoS, match all × count) | accept | Unchanged and deliberate. One matcher per Feature, one `match()` per step, the scope filter applied to the results. "Match all, count them" is the only arrangement in which Pitfall 15's ambiguity is detectable, and note (d) records that pre-optimising is wrong. |
| T-06-04-02 (catastrophic backtracking in a custom parameter type) | transfer | Unchanged. Every regex belongs to `@cucumber/cucumber-expressions@20.1.0` or to the developer's own `defineParameterType`. `Plan.ts` constructs no regular expression of any kind over step text — it contains none at all. |
| T-06-04-03 (step text embedded in a code-shaped suggestion) | mitigate | **Done.** The snippet's pattern is rendered by `generateStepSnippet` with `JSON.stringify` (06-02's mutation A pins it). This module additionally routes every step text, pattern and Feature name it names in a message through a `quoted` helper that is `JSON.stringify`, copying `Validate.ts` — so a text containing a quote cannot make the message ambiguous about where it ends. Asserted: the message tests compare against `JSON.stringify(...)` output, not hand-quoted strings. |
| T-06-04-04 (args spread into the step body) | accept | Unchanged. `args` is passed through positionally and UNMODIFIED, including a `null` from a non-participating optional group — dropping it would shift every later argument. Running the developer's own function on values from their own `.feature` file is the product. |
| T-06-04-05 (a failure with no location) | mitigate | **Done.** Every `StepMatchError` this module builds sets `uri` from `feature.uri` and `line` to `Option.some(step.line)` — `Option.none()` is unreachable on the fail path. Every ambiguous entry renders `formatCallSite`, which is a real site or the explicit `an unrecorded location` marker. Both are asserted, and the unrecorded-location case has its own test. |
| T-06-04-SC (package-manager installs) | accept | **Verified.** No `pnpm add`. `pnpm-lock.yaml` byte-unchanged; both `package.json` files untouched; `pnpm install --frozen-lockfile` succeeded unchanged. |

## Threat Flags

None. This plan adds no network endpoint, no auth path, no file access, no subprocess and no schema at a trust boundary. It reads two in-memory values the process already holds and returns a third.

## Known Stubs

None. Every value this plan introduces is wired to a real producer and a real consumer within the module: `planFeature` returns a complete `FeaturePlan`, `warnings` is computed rather than hard-coded, and both error builders are the real ones. Task 1's stub builders existed for exactly one commit and were replaced in Task 2's GREEN.

Two things a verifier will find and should NOT flag:

- **`// TODO: implement this step` appears in test output and in the summary above.** It is `generateStepSnippet`'s PRODUCT — the body of the snippet handed to a developer to fill in — not an unfinished branch. 06-02's summary flags the same string for the same reason.
- **`planFeature` has no caller in `src` yet.** That is the wave structure, not a stub: 06-07 is the plan that wires it into `describeFeature`, and it is fully asserted by its own 24 tests rather than by a downstream user. `spec/traceability.md`'s preamble now says this in writing.

## Notes for Later Plans

- **`PlannedStep` narrows through `isResolved`/`isUnresolved`-style predicates, never `planned._tag === "…"`.** `oxlint(no-underscore-dangle)` fails `pnpm lint` on the member access. Both union members are exported by name for exactly this; copy the predicates from `test/Plan.test.ts`.
- **A resolution failure is step N's failure.** `ScenarioEffect` must run the steps in list order and fail at the first `Unresolved` one — not check the list up front and fail the Scenario before step 1. Note (a) is the argument, and it is what makes fail-fast structural rather than bookkept.
- **`args` reaches the step body positionally and unmodified, `null`s included.** Do not filter, do not compact.
- **`ScenarioPlan.name` is the `it.effect` title; `ScenarioPlan.astName` is not.** For an Outline the astName is identical across every row, so titling with it produces N identically-named tests and `vitest(no-identical-title)` will not save you — it only sees literals.
- **`FeaturePlan.warnings` is D-02's channel 3 and is already deterministic.** Channels 1 (`console.warn` at collection time) and 2 (a synthetic passing test node) both read THIS list; do not recompute either from the definitions.
- **`Plan.ts` must never import `describeFeature.ts`.** The edge points the other way and `pnpm circular` is the guard. If the Plan stage needs something `describeFeature.ts` owns, declare it in `Plan.ts` and import it from there — which is exactly what happened to `StepBody`.
- **`Plan.ts` is not in the barrel and should stay out of it.** 06-07 owns `packages/vitest/src/index.ts` and 06-03's four `Errors.ts` exports; a `FeaturePlan` is an internal stage, following the `Registry.ts`/`collectFeature` precedent.
- **There is still no `rule` scope kind.** Phase 8's DSL-05 adds Rule as a container; when it does, `isVisibleTo` gains a case and `scopeRank` gains a level between `0` and `1`. Note (e) says so, so the third level is a known absence rather than a discovered one.
- **The `*`-keyword and localized-dialect path is exercised.** `registrarKeywordOf` is the only place `keywordType` is read, and it feeds the snippet alone. Do not extend it to anything reported.
- Repo test count is now **496 across 24 files**.

## Self-Check: PASSED

Files verified present on disk:

- `/Users/mohammadalmechkor/Projects/Perso/effect-cucumber/.claude/worktrees/agent-ae06913964e425b93/packages/vitest/src/Plan.ts`
- `/Users/mohammadalmechkor/Projects/Perso/effect-cucumber/.claude/worktrees/agent-ae06913964e425b93/packages/vitest/test/Plan.test.ts`
- `/Users/mohammadalmechkor/Projects/Perso/effect-cucumber/.claude/worktrees/agent-ae06913964e425b93/packages/vitest/src/describeFeature.ts`
- `/Users/mohammadalmechkor/Projects/Perso/effect-cucumber/.claude/worktrees/agent-ae06913964e425b93/spec/traceability.md`

All five commits verified in `git log` on `worktree-agent-ae06913964e425b93`: `89a364f`, `c271148`, `8f8559e`, `47f70c1`, `edf3e6c` — all descending from the plan base `4849b30`.

`git diff --stat 4849b30 HEAD` names exactly four files and nothing else. `.planning/STATE.md`, `.planning/ROADMAP.md`, `.planning/REQUIREMENTS.md` and `pnpm-lock.yaml` are all untouched, as worktree mode requires. No file deletions in any commit. Working tree clean, no untracked files, and the temporary message-printing suite used for the `<human-check>` was deleted before any commit.

---

*Phase: 06-plan-scenario-effect-runner-emission-and-drift-detection*
*Plan: 04*
*Completed: 2026-08-29*
