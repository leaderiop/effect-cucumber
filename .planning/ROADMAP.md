# Roadmap: effect-cucumber

## Overview

This milestone takes a fully-specified but zero-source-file workspace to a working, tested `@effect-cucumber/gherkin` + `@effect-cucumber/vitest` pair that runs `.feature` files as `it.effect` tests with compile-time-checked Layer dependencies. The build order is strictly bottom-up along the verified module dependency graph: harden the toolchain so a wrong-Layer type error can actually fail a build, then the pure-data gherkin package (parse → compile → correlate, plus parameter types, step matching, and data tables), then the vitest package's type surface (where the entire value proposition lives, and where the negative type test is written *before* any runtime code), then registration → plan → emit, then hooks, Rules/Outlines, tags, and — deliberately last among core paths — the `shared` Layer, the one code path proven to behave differently from every other. A dogfooded acceptance suite closes traceability.

Destination is "working and tested," not "published."

## Phases

**Phase Numbering:**

- Integer phases (1, 2, 3): Planned milestone work
- Decimal phases (2.1, 2.2): Urgent insertions (marked with INSERTED)

Decimal phases appear between their surrounding integers in numeric order.

> **Note on numbering:** research/SUMMARY.md numbers these Phase 0-10. This roadmap numbers them 1-11 (GSD phases start at 1). The mapping is a straight `+1` shift: research Phase 0 = Phase 1 here, research Phase 10 = Phase 11 here. Content is unchanged.

- [x] **Phase 1: Workspace, Toolchain, and Dependency Policy** - The repo builds/lints/formats/type-checks under the Effect v4 convention, and a Layer type error genuinely fails the build (completed 2026-08-28)
- [x] **Phase 2: `loadFeature` — Parse, Compile, Correlate** - A `.feature` file becomes a correlated `ParsedFeature`; every known silent-wrong `compile()` output becomes a loud typed error (completed 2026-08-28)
- [ ] **Phase 3: Parameter Types and Step Matching** - cucumber-expression coercion works, custom types replay into a fresh registry per call, and matching considers every registered pattern
- [ ] **Phase 4: DataTable / DocString** - Gherkin tables reach steps through a wrapper that decodes rows via `Schema`
- [ ] **Phase 5: `describeFeature` Type Surface** - An unprovided-service step is a compile error, proven by a negative type-test file written first
- [ ] **Phase 6: Plan, Scenario-Effect, Runner Emission, and Drift Detection** - Scenarios run as one fail-fast `it.effect` each; unmatched/ambiguous/unused steps fail loudly
- [ ] **Phase 7: Hooks** - All six hooks are Effects, ordered correctly, with `After` guaranteed via `Effect.ensuring`
- [ ] **Phase 8: Rule and Scenario Outline** - Rule-scoped extra Layers and per-row-typed Outline examples
- [ ] **Phase 9: Tags** - Gherkin tags become native vitest tags; `@skip` skips, `@only` never breaks CI
- [ ] **Phase 10: Layer Scopes (per-Scenario default + `shared`)** - Both scopes work, and `TestClock` stays per-Scenario even on the shared path
- [ ] **Phase 11: Composition Root and Dogfooded Acceptance Suite** - The spec's worked examples run green end to end, closing traceability

## Phase Details

### Phase 1: Workspace, Toolchain, and Dependency Policy

**Goal**: The two-package workspace builds, lints, formats, and type-checks under the Effect v4 convention — and the `@effect/tsgo` Layer diagnostics are a real build gate, not advice.
**Depends on**: Nothing (first phase)
**Requirements**: None — enabling phase. Cites ADR-EC-012, ADR-EC-013, ADR-EC-015, ADR-EC-016 (per PROJECT.md's spec-fidelity constraint, a phase must cite a spec entry; these are stack/tooling ADRs that carry no user-facing REQ-ID).
**Success Criteria** (what must be TRUE):

  1. `tsc -b` compiles both packages clean from a cold cache, emitting `.d.ts` + declaration maps, with cross-package project references resolving.
  2. A probe file containing a deliberate `missingLayerContext` (or `missingEffectContext`) diagnostic makes `tsc -b` exit non-zero — proving ADR-EC-016's gate is enforced, not advisory.
  3. `oxlint` (including the vendored `@effect/oxc` rules) and `dprint --check` both run clean over the repo, and CI runs build + lint + format + test on Node 22 and 24.
  4. `pnpm pack` on each package yields an ESM-only tarball with the `publishConfig.exports` shape applied, an `effect` peer *range* (not the catalog's exact rc pin — Pitfall 20), and a README install line carrying `@rc` explicitly (Pitfall 19).

**Plans**: 6 plans (6 waves, sequential — every plan shares config surface with the one before it)

Plans:

- [x] 01-01-PLAN.md — Fix `tsconfig.base.json` (TS 7 removed `esModuleInterop`) and add placeholder entry points so the cold composite build emits declarations
- [x] 01-02-PLAN.md — Prove ADR-EC-016's tsgo gate with a `missingLayerContext` / `floatingEffect` fixture and `pnpm verify:tsgo-gate`
- [x] 01-03-PLAN.md — Adopt Effect's dprint config (ASI), wire oxlint with the vendored Effect rules, and track `tools/` in git
- [x] 01-04-PLAN.md — Two-catalog dependency policy (pins for dev, ranges for peers) and publishable ESM-only manifests
- [x] 01-05-PLAN.md — `pnpm verify:pack` tarball assertions (Pitfall 20 guard, publint) and `@rc`-carrying README install lines
- [x] 01-06-PLAN.md — CI: `check.yml` merge gate with a Node 22/24 test matrix, plus `snapshot.yml` pkg-pr-new previews

Open decisions to close in this phase: dprint `semiColons: "asi"` (explicit yes/no), pnpm 11.x bump, whether to adopt `publint`/`madge`/`pkg-pr-new`, and whether the weekly `effect@rc` canary CI job is in or out (research's own prescription, no ecosystem precedent — optional).

**Research flag**: Skip `/gsd:research-phase` — copy Effect / effect-machine config near-verbatim.

### Phase 2: `loadFeature` — Parse, Compile, Correlate

**Goal**: A `.feature` file becomes a fully correlated `ParsedFeature`, and every verified silent-failure mode of `@cucumber/gherkin`'s `compile()` surfaces as a loud, named, located error instead of a false-green test.
**Depends on**: Phase 1
**Requirements**: PARSE-01, PARSE-02, PARSE-03
**Success Criteria** (what must be TRUE):

  1. `loadFeature` is **synchronous** and, called at module top level in a vitest file with no steps registered, contributes zero tests and produces no error (PARSE-01) — the one-way-door API decision from Pitfall 2, settled here.
  2. For a fixture with a Background, a Scenario Outline, and feature/rule/scenario tags, every returned scenario's steps arrive placeholder-substituted, with Background steps stacked first, tags inherited, and the Gherkin keyword recovered from the AST — asserted row by row (PARSE-02).
  3. Every row of the silent-wrong-`compile()` table has a fixture producing a distinct, named `LoadFeatureError` citing file and line: empty `Examples`, zero-step Scenario, one-to-many `astNodeIds`, un-interpolated `<placeholder>` in a Background nested under an Outline, missing file, malformed `.feature`, unknown dialect (PARSE-03, Gap 3).
  4. A Scenario is matched to its registered definition by the AST node's **un-interpolated** name, not the interpolated pickle name — demonstrated by an Outline whose interpolated names all differ (Open Question #4).
  5. A `# language:` non-English fixture parses without special handling (cheap Gap 5 confirmation).

**Spec amendment**: already done — see the correction blockquote in `spec/decisions/014-loadfeature-consumes-gherkindocument-and-pickles.md` (spec-contradicting finding #2, first half). No open blocker here.

**Plans**: 11 plans (8 waves — a mostly-sequential module DAG with three parallel pairs)

Plans:
**Wave 1**

- [x] 02-01-PLAN.md — Wave 0 toolchain: `vitest` + `@types/node` as catalog devDeps, `types: ["node"]`, regenerated lockfile (blocking package-legitimacy checkpoint)

**Wave 2** *(blocked on Wave 1 completion)*

- [x] 02-02-PLAN.md — Contracts: `Errors.ts` (10 error reasons, 4 warning reasons, no-truncation policy) and `Model.ts` (`ParsedFeature`)
- [x] 02-03-PLAN.md — The fixture corpus (F1–F27, ~28 `.feature` files) plus `upstream-pin.test.ts` pinning `@cucumber/gherkin@42`'s verified behavior

**Wave 3** *(blocked on Wave 2 completion)*

- [x] 02-04-PLAN.md — `Source.ts` / `Parser.ts` / `Pickles.ts`: every upstream throw wrapped as `MissingFile` / `ParseFailed` / `UnknownDialect` / `NoFeature`

**Wave 4** *(blocked on Wave 3 completion)*

- [x] 02-05-PLAN.md — `Correlate.ts`: one AST walk, both indices, the join, and the F21 row-by-row PARSE-02 assertions

**Wave 5** *(blocked on Wave 4 completion)*

- [x] 02-06-PLAN.md — Correlation closeout: F23 id independence, F24 multi-Examples tags, F25 dual arguments, F26/F27 scenario names and locations
- [x] 02-07-PLAN.md — `Validate.ts` structural checks (F1–F6) and per-scope duplicate Scenario name rejection (F22)

**Wave 6** *(blocked on Wave 5 completion)*

- [x] 02-08-PLAN.md — `Validate.ts` column-aware placeholder scan (F7/F8 error, F9 warning) and the four Group C warnings

**Wave 7** *(blocked on Wave 6 completion)*

- [x] 02-09-PLAN.md — `loadFeature.ts` + the real barrel, the PARSE-01 behavioral proof, and the `# language: fr` dialect test

**Wave 8** *(blocked on Wave 7 completion)*

- [x] 02-10-PLAN.md — Gates: `verify:no-runner-dep` (PARSE-01 structural proof) and `typecheck:test` (D7), both wired into `check.yml`
- [x] 02-11-PLAN.md — Spec: BEH-EC-014, traceability §1 correction + real §4 test map, ADR-EC-014 correction amendment, status docs

Decisions locked at planning time (no CONTEXT.md; surfaced directly to the developer): duplicate Scenario names are **rejected**, scoped **per-scope** (Feature or single Rule); Group C heuristic detections are **warnings**, carried on `ParsedFeature.warnings`; error messages carry **full content, never truncated** (developer override of the researcher's truncate-by-default recommendation).

**Research flag**: **Needs `/gsd:research-phase`** — highest density of verified library defects and unresolved spec ambiguities. PITFALLS.md's "Looks Done But Isn't" checklist should become this phase's fixture list directly. *(Done — see `02-RESEARCH.md`, `02-PATTERNS.md`, `02-VALIDATION.md`.)*

### Phase 3: Parameter Types and Step Matching

**Goal**: Step text resolves to typed arguments via cucumber-expressions, with a registry lifecycle that survives repeated `loadFeature` calls and a matcher that never silently picks a winner.
**Depends on**: Phase 1 (parallelizable with Phases 2 and 4 — no dependency on Phase 2's parsing subtree)
**Requirements**: MATCH-01, MATCH-02
**Success Criteria** (what must be TRUE):

  1. A step pattern's `{int}`, `{float}`, `{string}`, `{word}` arguments arrive at the step body already coerced to their TypeScript types, asserted at runtime and in a type test (MATCH-01).
  2. A custom parameter type declared once as data and consumed by two separate `loadFeature` calls in the same process resolves in both, with no duplicate-registration throw on the second call (MATCH-02).
  3. A custom parameter type whose name collides with one of `ParameterTypeRegistry`'s 11 built-ins fails with a specific named error at declaration time, not at match time (MATCH-02).
  4. `StepMatcher` returns **all** matching definitions for a step text, not the first registered — asserted by a fixture where two patterns match one step and the matcher returns both — and compilation is memoized per `(registry, pattern)`.

**Spec amendment**: already done — see the second correction blockquote in `spec/decisions/007-cucumber-expressions-for-step-matching.md` (spec-contradicting finding #2, second half). No open blocker here.

**Plans**: TBD — set by `/gsd:plan-phase 3`

**Research flag**: Skip — the fresh-registry-per-call / data-driven-custom-types pattern is already fully specified by research. The spec amendment is a decision, not research.

### Phase 4: DataTable / DocString

**Goal**: Gherkin data tables and doc strings reach step bodies as typed values through the library's own wrapper.
**Depends on**: Phase 1 (parallelizable with Phases 2 and 3 — pure, self-contained)
**Requirements**: PARSE-04
**Success Criteria** (what must be TRUE):

  1. `.raw()`, `.hashes()`, and `.rowsHash()` each return the documented shape for a table fixture, including the single-column and header-only edge cases (`.hashes()` is not native to `@cucumber/gherkin` — ADR-EC-008).
  2. A `.hashes()` result decodes through a `Schema` into typed rows; a row that fails the schema produces a decode error naming the offending row and column, not a generic parse failure.
  3. A step whose Gherkin carries **both** a DocString and a DataTable (a real `@cucumber/gherkin@42` capability the spec doesn't contemplate) receives both, in a documented, tested argument order.

**Plans**: TBD — set by `/gsd:plan-phase 4`

**Research flag**: Skip — standard, low-risk.

### Phase 5: `describeFeature` Type Surface

**Goal**: The project's core value is mechanically enforced — a step whose Effect needs a service the ambient Layer doesn't provide fails to compile, and that fact is guarded by a test that would fail if it ever stopped being true.
**Depends on**: Phase 1 (needs only `effect` and `ParsedFeature`'s *types*, so it can start before Phase 2 completes)
**Requirements**: DSL-01, DSL-02, DSL-03, DSL-04
**Success Criteria** (what must be TRUE):

  1. A `@ts-expect-error`-based negative type-test file, checked under `tsc --noEmit` in CI, proves a step requiring an unprovided service does not compile — and removing a service from an ambient Layer flips a previously-passing case to failing (DSL-01). **This file is the phase's first task, written before any runtime registration code** (Pitfall 3: a vacuous generic `R` constraint compiles fine and rejects nothing).
  2. A positive type test proves a step using `Effect.acquireRelease` (which puts `Scope` in `ROut`) still compiles against a plain Layer (DSL-01).
  3. `Given`/`When`/`Then`/`And`/`But` accept a bare generator function and register it auto-wrapped as `Effect.fn(stepText)` — the step text is observable in a failure's span/trace (DSL-02).
  4. `World` is reachable from a step as a typed `Context.Service`, and reading a field absent from World's declared type is a compile error in the negative type-test file (DSL-03).
  5. `Background`'s callback receives `{ Given, And }` and `Scenario`'s receives `{ Given, When, Then, And, But }`; two `Registry` instances constructed in one process share no state (per-instance scope stack, never a module singleton) (DSL-04).

**Spec amendment**: already done — see `spec/decisions/017-background-and-scenario-are-step-definition-containers.md` (`Scenario` now takes the same `(dsl) => void` form as `ScenarioOutline`/`Rule`, ambient-destructure form still valid); `spec/behaviors/03`'s worked example is corrected (spec-contradicting finding #1). No open blocker here.

**Plans**: TBD — set by `/gsd:plan-phase 5`

**Research flag**: Skip — exact type signatures to use and avoid are documented; risk is disciplined execution, not unknowns.

### Phase 6: Plan, Scenario-Effect, Runner Emission, and Drift Detection

**Goal**: A loaded feature and a registered step tree join into real vitest tests — one fail-fast `it.effect` per Scenario — and any mismatch between the two is an error naming exactly what drifted.
**Depends on**: Phases 2, 3, 4, 5 (first cross-package integration point)
**Requirements**: RUN-01, MATCH-03, MATCH-04, MATCH-05
**Success Criteria** (what must be TRUE):

  1. A Feature with a one-step Background and two Scenarios emits exactly two `it.effect` calls through the `TestApi` seam, each running the Background step first, then its own steps, in order, inside one `Effect.gen` (RUN-01, INV-EC-001).
  2. A Scenario whose second of four steps fails is reported failed, and steps three and four provably never ran (asserted via a `Ref` counter) (RUN-01).
  3. A step text matching zero registered patterns fails its Scenario with an error naming the step text and its `file:line` source location (MATCH-03).
  4. A step text matching two registered patterns fails naming **every** matching pattern and its definition site, deterministically regardless of registration order (MATCH-04).
  5. A registered pattern that matches no step anywhere in the Feature produces a Feature-level warning while the suite still passes (MATCH-05).

**Plans**: TBD — set by `/gsd:plan-phase 6`

**Research flag**: Skip — standard once Phase 5's types are settled.

### Phase 7: Hooks

**Goal**: All six hooks are Effects with a defined execution order, and `After` runs whether the Scenario passed or failed.
**Depends on**: Phase 6
**Requirements**: DSL-07, RUN-02
**Success Criteria** (what must be TRUE):

  1. Each of `Before`/`After`/`BeforeStep`/`AfterStep`/`BeforeAllScenarios`/`AfterAllScenarios` accepts a bare generator function and is registered auto-wrapped as a named `Effect.fn` (DSL-07).
  2. An append-only `Ref` log asserts the full ordering across a two-Scenario Feature: `BeforeAllScenarios` → (`Before` → `BeforeStep`/`AfterStep` per step → `After`) per Scenario → `AfterAllScenarios` (DSL-07).
  3. `After` runs and its effect is observable in the log both when every step succeeded and when a step failed mid-Scenario, via `Effect.ensuring` (RUN-02, INV-EC-004).
  4. A failing `After` does not mask or replace the original step failure in the reported error.

**Plans**: TBD — set by `/gsd:plan-phase 7`

**Research flag**: Skip — standard.

### Phase 8: Rule and Scenario Outline

**Goal**: Rules can narrow the ambient Layer for the Scenarios inside them, and Outline rows are typed, distinctly titled, and independent.
**Depends on**: Phase 6
**Requirements**: DSL-05, DSL-06
**Success Criteria** (what must be TRUE):

  1. A step inside a `Rule` compiles while using a service provided only by that Rule's extra per-Scenario Layer; the identical step body placed outside the Rule is a compile error in the negative type-test file (DSL-05).
  2. The Rule's extra Layer is built fresh per Scenario and is not reachable at runtime from Scenarios outside that Rule (DSL-05).
  3. An Outline whose Examples columns are consumed by `{int}`/`{float}` patterns hands the step body already-coerced `number` arguments, with no separate typed-example-row mechanism — verified by both a type test and a runtime assertion (DSL-06).
  4. Each Outline row produces a distinct, `-t`-filterable test title, and two rows provably share no mutable state (regression test for the loop-variable-capture bug `@amiceli/vitest-cucumber` shipped — Pitfall 34, Gap 4).

**Plans**: TBD — set by `/gsd:plan-phase 8`

**Research flag**: Skip — standard.

### Phase 9: Tags

**Goal**: Every Gherkin tag becomes a native vitest tag, `@skip` skips, and `@only` can never break CI.
**Depends on**: Phase 6
**Requirements**: RUN-05
**Success Criteria** (what must be TRUE):

  1. Every tag on a Scenario — including tags inherited from its Feature and Rule — appears as a native vitest tag on the emitted test (RUN-05).
  2. `@skip` additionally routes to `it.effect.skip`: the test is reported skipped and its `Before`/`After` hooks do not run (RUN-05, Pitfall 15's skip-ordering rule).
  3. A Feature containing an `@only`-tagged Scenario passes a CI-mode run (the mode where `.only` fails by design) — proving `@only` is emitted as a plain tag and never `it.effect.only` (RUN-05).
  4. A tag filter selects exactly the tagged Scenarios, and `excludeTags` on `describeFeature`'s options object excludes them (RUN-05; `excludeTags`' exact signature location is decided in this phase — currently unspecified in the spec).

**Plans**: TBD — set by `/gsd:plan-phase 9`

**Research flag**: **Light research recommended** — vitest v4's native tag API is new; confirm its config-time tag-declaration mechanics against the installed `vitest@4.1.x` before finalizing the design.

### Phase 10: Layer Scopes (per-Scenario default + `shared`)

**Goal**: Both Layer scopes work as specified, and a `shared` Layer never costs a Scenario its own `TestClock`.
**Depends on**: Phase 6 (deliberately last among core DSL phases — the one path proven to behave differently)
**Requirements**: RUN-03, RUN-04
**Success Criteria** (what must be TRUE):

  1. Default path: a Layer whose construction increments a counter is built once per Scenario (N Scenarios → N builds), and service state set in one Scenario is unobservable in the next (RUN-03).
  2. `shared` path: the same Layer is built exactly once for the whole Feature (N Scenarios → 1 build), via `@effect/vitest`'s `layer(...)` (RUN-03).
  3. On the `shared` path, `TestClock.adjust("1 hour")` in one Scenario is not observable in any later Scenario, and each Scenario gets its own `TestConsole` — and the Feature yields identical results run whole vs. filtered to a single Scenario (RUN-04, BEH-EC-012). Achieved via `excludeTestServices: true` plus a per-Scenario `TestEnv` provided inside each generated `it.effect` body.
  4. A `shared` Layer whose error channel is not `never` is a compile error rather than an unrecoverable runtime defect (RUN-03 hardening, Pitfall 27).

**Spec decision**: already made and applied — the `excludeTestServices` fix was adopted (not a carve-out), see `spec/decisions/018-shared-layer-testclock-isolation.md`. No open blocker here.

**Plans**: TBD — set by `/gsd:plan-phase 10`

**Research flag**: Skip — the fix is already verified working. Remaining work is a recorded decision plus implementation. This phase must not be deprioritized.

### Phase 11: Composition Root and Dogfooded Acceptance Suite

**Goal**: The library runs its own spec — the worked examples execute end to end as real feature files, and every v1 requirement has a test that proves it.
**Depends on**: Phases 1-10
**Requirements**: RUN-06
**Success Criteria** (what must be TRUE):

  1. Every worked example in `spec/behaviors/01`-`03` runs green end to end as a real `.feature` + `.steps.ts` pair in the repo (the examples were already corrected — see `spec/decisions/014`, `007`, `017`, `018` — so this proves the corrected form actually works, not just that it reads consistently).
  2. Cross-step Scenario state in every acceptance suite flows through a `Ref` obtained from `World`; no acceptance step closes over a `let`/`var` declared in a `Scenario`/`Rule`/`Background` callback (RUN-06, INV-EC-006).
  3. Every v1 requirement has at least one `@REQ`-tagged acceptance Scenario, and a traceability check reports 22/22 requirements covered by a passing test.
  4. PITFALLS.md's "Looks Done But Isn't" checklist runs in full and passes, and INV-EC-003's wording is amended to "for step bodies free of `any`" (Pitfall 6).

**Plans**: TBD — set by `/gsd:plan-phase 11`

**Research flag**: Skip — this is validation, not new design.

## Parallelization

Phases 2, 3, 4, and 5 depend only on Phase 1 and can run as one parallel wave (Phase 5 needs only `ParsedFeature`'s *types*, not Phase 2's implementation). Phase 6 is the join point. Phases 7, 8, 9, and 10 depend only on Phase 6 and form a second parallel wave. Phase 11 depends on everything.

```
1 ──┬── 2 ──┐
    ├── 3 ──┤
    ├── 4 ──┼── 6 ──┬── 7 ──┐
    └── 5 ──┘       ├── 8 ──┤
                    ├── 9 ──┼── 11
                    └── 10 ─┘
```

## Deferred to Next Milestone

Not phases in this roadmap — flagged here so they are not silently dropped.

- **REUSE-01** (reusable step definitions across Scenarios/Features) — table stakes across every comparable library, genuinely HIGH complexity here because a shared step's `R` must reconcile against every consuming Layer, with no ecosystem precedent. Needs its own design pass and its own milestone. Users hit this on their second feature file.
- **OUTLINE-01** (unreferenced Examples column decoded via `Schema`), **RETRY-01** (Scenario-level retry with per-attempt Layer rebuild), **LINT-01** (lint rule automating the RUN-06 convention).
- Publishing to npm — this milestone's destination is "working and tested."

## Progress

**Execution Order:**
Phases execute in numeric order: 1 → 2 → 3 → 4 → 5 → 6 → 7 → 8 → 9 → 10 → 11 (subject to the parallelization graph above).

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Workspace, Toolchain, Dependency Policy | 6/6 | Complete   | 2026-08-28 |
| 2. `loadFeature` — Parse, Compile, Correlate | 11/11 | Complete   | 2026-08-28 |
| 3. Parameter Types and Step Matching | 0/TBD | Not started | - |
| 4. DataTable / DocString | 0/TBD | Not started | - |
| 5. `describeFeature` Type Surface | 0/TBD | Not started | - |
| 6. Plan, Scenario-Effect, Runner, Drift Detection | 0/TBD | Not started | - |
| 7. Hooks | 0/TBD | Not started | - |
| 8. Rule and Scenario Outline | 0/TBD | Not started | - |
| 9. Tags | 0/TBD | Not started | - |
| 10. Layer Scopes (per-Scenario + `shared`) | 0/TBD | Not started | - |
| 11. Composition Root and Acceptance Suite | 0/TBD | Not started | - |

---
*Roadmap created: 2026-08-28 — depth: comprehensive*
