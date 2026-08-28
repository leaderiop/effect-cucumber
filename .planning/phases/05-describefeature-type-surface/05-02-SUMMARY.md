---
phase: 05-describefeature-type-surface
plan: 02
subsystem: dsl-type-surface-and-step-registration
tags: [dsl, types, effect-fn, span, tsgo, mutation-tested, oxlint]
requires:
  - "05-01 (packages/vitest/tsconfig.test.json — this plan's test file is only type-checked because of it)"
provides:
  - "StepRegistrar / ScenarioDsl / BackgroundDsl / FeatureDsl — the compile-time surface describeFeature composes"
  - "register() — isGeneratorFn discrimination plus the guarded Effect.fn(pattern) auto-wrap"
  - "@effect/vitest is now usable: exempted from effect/no-import-from-barrel-package"
affects:
  - "plan 05-03, which composes FeatureDsl + register + createRegistry into describeFeature and owns index.ts"
  - "plan 05-04, whose tsgo-gate fixtures assert against this exact union order"
  - "plan 05-06, which corrects BEH-EC-003's published signature to match Dsl.ts"
  - "every later phase writing an it.effect test — the barrel-rule exemption unblocks them all"
tech-stack:
  added: []
  patterns:
    - "types-only module with lettered module-doc notes (StepArgs.ts precedent), zero runtime emit"
    - "runtime type predicate to narrow a two-branch function union without a cast"
    - "load-bearing type-ordering duplicated rather than aliased, each copy carrying its own warning"
key-files:
  created:
    - packages/vitest/src/Dsl.ts
    - packages/vitest/src/Step.ts
    - packages/vitest/test/Step.test.ts
  modified:
    - .oxlintrc.json
decisions:
  - "Scope.Scope is spelled on BOTH union members rather than factored into a StepContext alias — measured: the alias keeps missingEffectContext but degrades the author-facing message to StepContext<World>"
  - "The step-function union order is duplicated in Step.ts rather than imported from Dsl.ts, so each copy carries its own warning"
  - "@effect/vitest exempted from the barrel rule by negative lookahead, scoped to that one package name"
  - "assert inside it.effect, expect in sync tests — vitest/no-standalone-expect does not recognise it.effect"
  - "DSL-01/02/04 all stay Pending — nothing a consumer can reach exists until 05-03 ships describeFeature"
metrics:
  duration: ~15m
  completed: 2026-08-29
  tasks: 3
  files: 4
  tests_before: "412 across 18 files"
  tests_after: "417 across 19 files"
---

# Phase 5 Plan 02: The DSL Type Surface and the Step Auto-Wrap Summary

Landed `FeatureDsl<ROut>` — the single point where INV-EC-003 is mechanically enforced — plus the
`register` seam that auto-wraps a bare generator with the step text as its span name, with both
of the phase's silent-failure modes reproduced against the real compiler rather than trusted.

## What Was Built

### Task 1 — `Dsl.ts`, the compile-time surface

`StepRegistrar<ROut>`, `ScenarioDsl<ROut>`, `BackgroundDsl<ROut>` and `FeatureDsl<ROut>`, types only.
`dist/Dsl.js` contains exactly `export {}` and the sourcemap pragma — zero runtime statements,
matching `StepArgs.ts`'s precedent. Both imports are `import type`.

The module doc carries lettered notes (a)–(e), each naming the plausible tidy-up that would break
the guarantee silently. The two load-bearing ones are not theory here — I reproduced them:

**Note (a), the union order, verified live.** Rather than trust RESEARCH.md Finding 2, I compiled a
throwaway fixture (`_probe.ts` plus its own single-file tsconfig, both deleted before the commit)
against this exact `Dsl.ts`. Result:

```
error TS377004: This Effect requires a service that is missing from the expected
Effect context: `Db`. effect(missingEffectContext)
```

and the `TS2345` chain terminating in `Type 'Db' is not assignable to type 'Scope | World'` — exactly
what Finding 2 predicts for generator-branch-first. The positive half compiled clean in the same run:
a step doing `yield* Effect.acquireRelease(...)` against a `FeatureDsl<World>` produced no error,
confirming note (b)'s `Scope` placement (RESEARCH Finding 8) in the same probe.

**A rejected refactor, recorded in note (b).** The plan's acceptance criteria asked that `Scope.Scope`
appear in code exactly once. The verified surface spells `ROut | Scope.Scope` on *both* union members,
so the literal grep returns 2. The only ways to reach 1 are a one-line collapse (forbidden by note (a),
which requires the member order to stay visible) or a `type StepContext<ROut> = ROut | Scope.Scope`
alias. I measured the alias instead of guessing: it **keeps** `effect(missingEffectContext)` firing,
but it degrades the human-readable `TS2345` line from `Type 'Db' is not assignable to type
'Scope | World'` to `Type 'Db' is not assignable to type 'StepContext<World>'` — naming an internal
type instead of the Layer output the test author reasons about, and under
`exactOptionalPropertyTypes` that line is already the eighth of the chain (RESEARCH Pitfall 3). I kept
the literal form and wrote the measurement into note (b) so the alias is not reintroduced later to
satisfy the grep. See "Deviations" for the criterion's disposition.

### Task 2 — `Step.ts`, the guarded auto-wrap

`register(pattern, fn)` returns `Effect.fn(pattern)(fn)` for a bare generator and `fn` itself,
by identity, for an already-wrapped function (ADR-EC-005's "unchanged"). `isGeneratorFn` is the
`Object.prototype.toString.call(f) === "[object GeneratorFunction]"` discriminator, written as a
**type predicate** so both branches narrow to their union member with no cast anywhere in the file.
`Effect.fn(` appears exactly once — the single guarded wrap site.

The union order is duplicated from `Dsl.ts` rather than imported. Note (b) says why: aliasing it into
one shared exported type would make its member *order* an implementation detail of a name, one edit
away from a reorder by someone who never sees the constraint. Written twice, each copy carries its
own warning and its own "if you change one, change the other."

### Task 3 — `Step.test.ts`, DSL-02's runtime proof

Five tests, all five required assertions. Two are written more strictly than they look like they need
to be, and the mutations below are what justify that.

## Verification

| Check | Result |
|-------|--------|
| `pnpm build` | exit 0; `dist/Dsl.d.ts` declares all four interfaces, `dist/Dsl.js` has zero statements |
| `pnpm typecheck:test` | exit 0, both projects |
| `pnpm test` | 417 passed across 19 files (was 412 across 18) |
| `pnpm lint` | exit 0 |
| `bash scripts/verify-tsgo-gate.sh` | 4/4 assertions, `tsgo gate: ENFORCED` (unchanged) |
| Union order in `Dsl.ts` | `Effect.gen.Return` on code line 11, `Effect.Effect<` on 12 |
| Union order in `Step.ts` | `Effect.gen.Return` on line 81, `Effect.Effect<` on 82 |
| `Scope.Scope` placement | 2 code occurrences, both inside `StepRegistrar`'s `fn` parameter; **0** on `FeatureDsl`/`ScenarioDsl`/`BackgroundDsl` |
| Zero runtime emit in `Dsl.ts` | `grep -cE '^\s*(export )?(const\|function\|class\|let\|var) '` → 0 |
| `[object GeneratorFunction]` in `Step.ts` | 1 |
| `toString().startsWith` in `Step.ts` | 0 |
| `Effect.fn(` in `Step.ts` | 1 |
| Lettered notes (a)–(e) in `Dsl.ts` | 5 |
| `grep -c 'from "../src/index.ts"'` in the test | 0 |

### Mutation proofs (both performed, then reverted, suite confirmed green after)

**Mutation A — `register` wraps unconditionally (guard dropped).** Exactly **1 test failed**:
*"comes back as the identical reference, not a re-wrap"*
(`AssertionError: expected [Function] to be [Function] // Object.is equality`).

The informative part is what did **not** fail: the other four Step tests all passed. A re-wrapping
implementation returns a callable that behaves identically on every input, so argument transparency,
the span name and the error channel are all satisfied by the defect. Reference identity is the only
check that separates "accepted unchanged" from "accepted and quietly re-wrapped" — the file header
now says so with this run behind it.

**Mutation B — `register` returns `fn` unconditionally (never wraps).** **3 tests failed**, including
the required *"makes the step text observable as the span name"*. The span assertion is therefore not
vacuous: it reads the active span from inside the running body, and an implementation that never calls
`Effect.fn` cannot satisfy it.

Also informative: *"resolves to the generator's return value with its arguments intact"* **passed**
under mutation B, because `yield*` delegates to a raw generator object and produces the right value
anyway. That test cannot detect a missing wrap, which is precisely why assertion 4 exists alongside it.
Do not collapse the two.

## Deviations from Plan

**1. [Rule 3 - Blocking] Restored the dependency tree in the worktree**
- **Found during:** setup, before Task 1
- **Issue:** the worktree had no `node_modules`, so `tsc`, `vitest`, `oxlint` and `dprint` were all
  unrunnable — the same blocker plan 05-01 hit.
- **Fix:** `pnpm install --frozen-lockfile`. Restores the tree already described by the committed
  lockfile; no package added, no manifest dependency field changed, so T-05-SC's "installs zero
  packages" disposition still holds.
- **Files modified:** none tracked.

**2. [Rule 3 - Blocking] `@effect/vitest` was unimportable under `effect/no-import-from-barrel-package`**
- **Found during:** Task 3
- **Issue:** the rule's `checkPatterns` include `^@effect/[^/]+$`, which matches `@effect/vitest`, and
  the rule rejects **both** named and namespace imports from a matched package. There is therefore no
  spelling of `import { it } from "@effect/vitest"` that passes lint — and `it.effect` has no other
  source. The rule's own suggested fixes (`@effect/vitest/describe`, `/expect`, `/it`) do not resolve:
  that package maps `"."` to `dist/index.js` and its only other file is `dist/utils.js`. The rule
  encodes Effect's module-per-file convention, which `@effect/vitest` does not follow. This is the
  repo's first `@effect/vitest` usage, so nothing had hit it before — but AGENTS.md §5 mandates
  `it.effect` for every test, and Phase 6 is built on it.
- **Fix:** exempted exactly that one package name in `.oxlintrc.json` via negative lookahead —
  `^@effect/(?!vitest$)[^/]+$` — with a comment stating the reason and naming both wrong fixes
  (widening back to `^@effect/[^/]+$`, or switching off the rule for test files, which would also
  stop catching `import { Effect } from "effect"`). Verified the lookahead still matches
  `@effect/platform` and `@effect/tsgo`, and that `@effect/vitest/utils` remains covered by the
  fourth pattern. The vendored rule under `tools/oxlint/effect/` was **not** edited — that would
  break its documented `curl` resync path.
- **Files modified:** `.oxlintrc.json`
- **Commit:** `b2ae636`

**3. [Rule 1 - Unsatisfiable criterion] Task 1's `Scope.Scope` count is 2, not 1**
- **Found during:** Task 1
- **Issue:** the criterion `grep -c 'Scope.Scope'` → exactly 1 cannot hold for the RESEARCH-verified
  surface, which spells `ROut | Scope.Scope` on both union members — and `grep -c` counts lines. The
  two escapes are a one-line collapse (forbidden by note (a)) and a type alias.
- **Fix:** kept the verified two-line form, and verified the criterion's **intent** instead, which is
  the substantive half: `Scope` must not leak past the step-function parameter. Both occurrences sit
  on adjacent lines inside `StepRegistrar`'s `fn` parameter; `FeatureDsl`, `ScenarioDsl`,
  `BackgroundDsl` and every Layer position have zero. The alias alternative was measured and rejected
  on error-message quality (see Task 1 above), and the measurement is recorded in note (b) so a later
  editor does not adopt it to satisfy the grep.
- **Files modified:** none beyond `Dsl.ts` itself.

**4. [Rule 1 - Unsatisfiable criterion] Task 2's `toString().startsWith` count**
- **Found during:** Task 2
- **Issue:** the criterion requires `grep -c 'toString().startsWith'` → 0, but this repo's documented
  comment style (PATTERNS "state the invisible constraint, name the plausible wrong fix") requires
  naming the rejected discriminator. My first draft named it literally and the grep returned 1.
- **Fix:** rephrased to name the wrong fix without spelling the call chain — "sniffing the function's
  own source text via `Function.prototype.toString` for a leading `function*`" — which satisfies both
  the grep (now 0) and the convention. The comment also now records that both of its failure modes
  fail in the *same* direction: a real generator mistaken for an already-wrapped one, passed through
  and silently losing its span.
- **Files modified:** none beyond `Step.ts` itself.

**5. [Rule 2 - Lint conformance] `assert` inside `it.effect`, `expect` in the sync tests**
- **Found during:** Task 3
- **Issue:** `vitest/no-standalone-expect` does not recognise `it.effect` as a test block, so an
  `expect` nested in the `Effect.gen` body it takes is reported as standalone and fails `pnpm lint`
  (3 occurrences).
- **Fix:** used `assert.strictEqual` inside the three `it.effect` bodies — outside that rule's scope,
  and the form `@effect/vitest`'s own documentation uses — while the two synchronous tests keep
  `expect` inside `it`, where the rule is satisfied. Documented in the test file's header, with an
  explicit "do not make them consistent" so the split is not flattened later. Also hoisted the bare
  generator fixture to module scope for `unicorn/consistent-function-scoping`.
- **Files modified:** `packages/vitest/test/Step.test.ts`

**6. [Rule 1 - Stale expectation] Task 3's test-count criterion said 15 → 16; the real baseline is 18 → 19**
- **Found during:** Task 3
- **Issue:** the criterion was written against an older baseline. Plan 05-01 already recorded the same
  drift and left the repo at 412 tests across 18 files.
- **Fix:** verified the substantive half — *exactly one new test file* — against the real baseline:
  **18 → 19 files, 412 → 417 tests**. The absolute numbers in the plan are stale, not the requirement.
- **Files modified:** none.

## Requirements Status

**DSL-01, DSL-02 and DSL-04 all stay Pending in REQUIREMENTS.md**, following the precedent 05-01 set
(and Phase 3 set four times): a requirement is marked when it is true end to end for something a
consumer can reach.

- **DSL-02** ("a step is `(...params) => Effect<A, E, R>`; `Given`/`When`/`Then`/`And`/`But` accept a
  bare generator, auto-wrapped with `Effect.fn(stepText)`") is the closest to done — the shape and the
  auto-wrap both exist and are mutation-proven. But no `Given` exists yet that a test author can call:
  `register` is internal and `FeatureDsl` is an uninhabited type until 05-03 constructs one. The
  requirement names the registrars, not the seam beneath them.
- **DSL-01** needs `describeFeature` and its two overloads (05-03) plus the gate fixtures (05-04).
  This plan built the type surface the fixtures will fail against and confirmed the diagnostic fires,
  but no `describeFeature` exists.
- **DSL-04** needs the `Background`/`Scenario` callbacks wired to `createRegistry`'s scope stack and
  the literal-text matching. `BackgroundDsl`/`ScenarioDsl` are the type half only.

Plan 05-03 is where all three become reachable and should mark them.

## Known Stubs

None. `packages/vitest/src/index.ts` remains the Phase 1 placeholder that says so in its own doc
comment — untouched by this plan and owned by 05-03. `Dsl.ts` and `Step.ts` are both complete for
what they claim to be; neither has a placeholder branch, a TODO, or a hardcoded value.

## Notes for Later Plans

- **`Dsl.ts` note (a) and `Step.ts` note (b) must stay in sync.** The union order is written out twice
  on purpose. A reorder in either file keeps every test green and silently drops
  `effect(missingEffectContext)` from the DSL. **05-04's fixture is the only behavioral guard** — its
  reorder mutation is not optional.
- **Do not introduce a `StepContext<ROut>` alias to make the `Scope.Scope` grep return 1.** Measured
  and rejected on error-message quality; note (b) carries the measurement.
- **`register` must stay out of `packages/vitest/src/index.ts`** (05-03's file), like `Registry`.
- **`@effect/vitest` is now importable**, and it is the *only* `@effect/*` package exempt from the
  barrel rule. A new Effect package still gets the rule; do not widen the lookahead.
- **Inside `it.effect`, use `assert`, not `expect`** — `vitest/no-standalone-expect` will fail the
  build otherwise. This applies to every Effect test written from here on, including Phase 6's.
- **`Effect.currentSpan` works under `it.effect`** with no extra tracer wiring — confirmed by the
  passing span test. 05-04 and Phase 6 can use it directly.
- **A test asserting only a step's return value cannot detect a missing wrap** (mutation B: that test
  passed while three others failed). Any future "the step ran correctly" test needs a span assertion
  beside it to be non-vacuous.
- **Every new tsgo-gate fixture still needs its own `tsconfig.<name>.json`** (05-01's note). The
  throwaway probe used in Task 1 followed that and was deleted, config included.
- Repo test count is now **417 across 19 files**.

## Threat Flags

None. This plan shipped two dependency-light source modules, one unit test and one lint-config
exemption — no network, no I/O, no parsing of external data, no auth, no persistence, no new trust
boundary. Dispositions from the plan's register:

- **T-05-04** (union order) — mitigated here by note (a), the line-order assertions, and the live
  probe that confirmed `effect(missingEffectContext)` actually fires against this file. The
  behavioral guard remains 05-04's assertion 6 and its reorder mutation.
- **T-05-05** (`any` widening) — `Dsl.ts` contains `any` in exactly two positions, both
  `Params extends ReadonlyArray<any>`, both documented in note (d). No other position uses it.
- **T-05-06** (span naming) — mitigated and demonstrated: mutation B's never-wrap form fails the span
  assertion.
- **T-05-SC** (package installs) — holds. The `--frozen-lockfile` install added nothing and changed no
  manifest dependency field. The `.oxlintrc.json` edit is a lint-rule scope change, not a dependency.

## Self-Check: PASSED

All four claimed files verified present on disk (`packages/vitest/src/Dsl.ts`,
`packages/vitest/src/Step.ts`, `packages/vitest/test/Step.test.ts`, `.oxlintrc.json`); all three task
commits verified in `git log` (`6f18752`, `84cb6de`, `b2ae636`). Working tree clean after both
mutations were reverted — `git diff` on `Step.ts` is empty, and the Task 1 probe fixture and its
tsconfig were deleted before that task's commit.
