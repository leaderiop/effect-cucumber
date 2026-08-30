# effect-cucumber

## What This Is

`@effect-cucumber` runs Gherkin `.feature` files as vitest tests where every
step is an `Effect`. It closes the gap between `@effect/vitest`
(Effect-native tests, no Gherkin) and `@amiceli/vitest-cucumber`
(Gherkin-on-vitest, but plain-promise steps and an untyped `context: any`
world): steps get Layer-based dependency injection, `TestClock`/`TestConsole`
for free, and compile-time-checked scenario dependencies instead of a
runtime "service not found."

## Core Value

A Scenario's dependencies are checked at compile time via a `Layer` — a step
that needs a service the ambient Layer doesn't provide is a type error at
authoring time, never a runtime failure discovered when the Scenario runs.

## Requirements

### Validated

- [x] `loadFeature` parses `.feature` files, correlating the raw
      `GherkinDocument` (structure) with `compile()`'s `Pickle[]` output
      (substituted step text, inherited tags, stacked Background steps),
      failing loudly on the known exception (an un-interpolated placeholder
      in a Background nested under a Scenario Outline) — ADR-EC-014.
      Validated in Phase 2 (`loadFeature` — Parse, Compile, Correlate):
      shipped as `@effect-cucumber/gherkin`'s public API
      (`loadFeature`/`parseFeature`), with every verified silent-failure mode
      of `compile()` (27 fixture rows) surfacing as a named, located
      `LoadFeatureError` or `LoadFeatureWarning` instead of a false-green
      test. 211 tests passing; full `check.yml` gate green.
- [x] Data tables decode through Schema, via `@effect-cucumber/gherkin`'s own
      `DataTable` wrapper (`.hashes()` isn't native to `@cucumber/gherkin`) —
      ADR-EC-008. Validated in Phase 4 (DataTable / DocString): `.raw()`,
      `.hashes()`, and `.rowsHash()` ship with `decodeHashes` mapping a
      `Schema` decode failure to a `DataTableError` naming the exact row and
      column; a step carrying both a DocString and a DataTable receives both,
      in documented, mutation-proven argument order — ADR-EC-025,
      BEH-EC-016. 404 tests passing; full `check.yml` gate green.
- [x] `describeFeature` takes a Layer; a step's Effect can only use services
      that Layer provides — ADR-EC-003, backed by `@effect/tsgo`'s
      `missingLayerContext`/`missingEffectContext` diagnostics — ADR-EC-016.
      Validated in Phase 5 (`describeFeature` Type Surface): a committed
      satisfied/starved `tsgo-gate` fixture pair proves an unprovided-service
      step fails to compile, named by diagnostic; mutation-tested by
      reordering the `StepRegistrar` union and the `describeFeature` overloads
      and observing the named diagnostic (not just the exit code) drop out.
      9/9 gate assertions; 427 tests passing; full `check.yml` gate green.
- [x] `Background` and `Scenario` are step-definition containers — a
      Background's literal Gherkin text is matched against a registered
      `Given`/`And` pattern exactly like any other step, not run
      unconditionally — ADR-EC-017. Background steps are inlined as the
      first `yield*`s of every Scenario's Effect, not a separate vitest hook
      — ADR-EC-004. Container shapes shipped in Phase 5; the literal-text-
      matching half validated in Phase 6 (Plan, Scenario-Effect, Runner
      Emission, and Drift Detection): `Plan.ts`'s scope-chain resolution
      matches every Pickle step (Background included) against the registry,
      and `ScenarioEffect.ts` composes Background steps first, then the
      Scenario's own, as sequential `yield*`s inside one `Effect.gen`.
- [x] A Pickle step matching zero or more-than-one registered pattern fails
      loudly, naming the step text and every ambiguous match; a registered
      pattern matching zero steps in the Feature is a warning — ADR-EC-019,
      BEH-EC-013. Validated in Phase 6: `StepMatchError`'s `UndefinedStep`/
      `AmbiguousStep` variants and `UnusedStepDefinitionWarning` are wired
      through `describeFeature`'s Register → Plan → Warn → Emit pipeline —
      RUN-01, MATCH-03, MATCH-04, MATCH-05. 526 tests passing; full
      `check.yml` gate green.
- [x] A step is `(...params) => Effect<A, E, R>`; `Given`/`When`/`Then`
      accept a bare generator, auto-wrapped with `Effect.fn` — ADR-EC-001,
      ADR-EC-005. Validated in Phase 5: `Step.ts`'s `isGeneratorFn` guard
      auto-wraps a bare generator with `Effect.fn(stepText)` and passes an
      already-wrapped function through by reference identity; the step text
      is observable as the span name (DSL-02).
- [x] `World` is a typed `Context.Service`, not an untyped context bag —
      ADR-EC-002. Validated in Phase 5: reading a field absent from World's
      declared type is a plain `TS2339` compile error (not an Effect
      diagnostic), proven by a dedicated negative fixture (DSL-03).
- [x] Hooks (`Before`/`After`/`BeforeStep`/`AfterStep`/`BeforeAllScenarios`/
      `AfterAllScenarios`) are Effects; `After` always runs via
      `Effect.onExit` — ADR-EC-005. Validated in Phase 7 (Hooks): all six
      hooks accept a bare generator function and are registered auto-wrapped
      as a named `Effect.fn`; a 36-entry append-only `Ref` log proves the
      full ordering across a two-Scenario Feature
      (`BeforeAllScenarios` → (`Before` → `BeforeStep`/step/`AfterStep` per
      step → `After`) per Scenario → `AfterAllScenarios`); `After` and
      `AfterStep` are guaranteed via `Effect.onExit`, not `Effect.ensuring`
      (whose finalizer error channel is `never` in `effect@4.0.0-rc.112`),
      and a failing `After` never masks the original step failure —
      DSL-07, RUN-02, INV-EC-004. 575 tests passing; full `check.yml` gate
      green.
- [x] Every tag maps to vitest's native tag system; `@skip` additionally
      routes to `it.effect.skip`. `@only` is emitted as a plain tag, not
      `it.effect.only` (which fails CI) — ADR-EC-026 (supersedes ADR-EC-020),
      BEH-EC-008. Validated in Phase 9 (Tags): every tag inherited from
      Feature/Rule/Scenario/Examples reaches the emitted node in that order;
      `@skip` routes to `it.effect.skip` with no `Before`/`After` running;
      `@only` stays inert under `allowOnly: false` so a committed `.only`
      fails CI by design; `includeTags`/`excludeTags` filter at registration
      time (not vitest's own `--testNamePattern`), proven against a real
      `vitest` CLI run (not just an in-process recording fake) via
      `scripts/verify-tags-filter.sh`. `gherkinTags(pattern)` (D-09) derives
      the config's declared tag universe from `.feature` files themselves.
      743 tests passing; full `check.yml` gate green.
- [x] `Rule` can extend the ambient Layer with an extra per-Scenario Layer,
      visible only to Scenarios inside that Rule; `Scenario Outline` Examples
      are typed for free via cucumber-expression coercion — no separate
      typed "example row" mechanism — ADR-EC-007, ADR-EC-010. Validated in
      Phase 8 (Rule and Scenario Outline): `FeatureDsl.Rule` composes
      `Layer.provideMerge(featureLayer)(extraLayer)` at registration; a
      Rule-scoped `Before`/`After`/`BeforeStep`/`AfterStep` carries that
      Rule's id and never leaks into the Feature's own hooks or another
      Rule's (three-way isolation test, mutation-proven); an Outline's rows
      share one `Scenario(...)` registration keyed on the AST node's own
      un-interpolated name, each row titled `name (col=value, ...)` from its
      own Examples row.
- [x] Two Layer scopes only: per-Scenario (default, fresh every Scenario) and
      an opt-in `shared` Layer built once via `@effect/vitest`'s `layer(...)`
      with `excludeTestServices: true` so `TestClock` stays per-Scenario even
      on the shared path — ADR-EC-006, ADR-EC-018. `TestClock` composes
      transparently on both scopes — a step reading `Clock` sees the
      simulated clock with zero test-specific code, confirmed against real
      `effect@4.0.0-rc.112` — BEH-EC-012. Validated in Phase 10 (Layer
      Scopes): both entry-point overloads constrain `shared` to
      `Layer<R, never, never>` at compile time (`SharedLayerConstraint.types.ts`,
      6 pinned cases); `emission.test.ts` asserts shared-build ordinals
      `[1,1,1]` against per-Scenario ordinals `[1,2,3]` on the same Feature,
      simulated-clock readings `[0,0,0,0]` across four Scenarios sharing a
      Layer, and Rule-scoped-extra-Layer-over-shared-tier ordinals
      `[1,1]`/`[1,2]` in the same run; `scripts/verify-shared-layer-once.sh`
      re-asserts the shared-build-once count from a real, external `vitest`
      CLI run rather than only the in-process recording fake. One measured
      correction recorded rather than silently narrowed: the `shared` tier's
      resources release at the enclosing suite's teardown (the whole file's,
      for a module-top-level call), not literally "after every Scenario in
      the Feature," documented in `spec/behaviors/02-shared-layers-and-tags.md`
      against the exact `@effect/vitest` internals this was measured
      against.
- [x] Cross-step scenario state lives in a `Ref` from `World`, never a bare
      closure variable — ADR-EC-009, INV-EC-006. Validated in Phase 11
      (Composition Root and Dogfooded Acceptance Suite):
      `scripts/verify-acceptance-ref-state.sh` structurally scans every
      `packages/vitest/test/acceptance/*.steps.test.ts` module and fails,
      naming file and line, on any mutable binding (including destructured
      forms) a step could close over — the first automated enforcement of
      this convention anywhere in the repository, with a population control
      and a regex control so it cannot pass by scanning nothing. The
      library's own three worked examples (`spec/behaviors/01`-`03`) run
      green end to end as real `.feature` + `.steps.test.ts` pairs
      exercising this convention, and all 22 v1 requirements now carry a
      `@REQ-EC-NNN` acceptance tag (`pnpm verify:spec` reports 22/22 as a
      derived count). The 24-item "Looks Done But Isn't" checklist
      (`spec/process/looks-done-but-isnt-checklist.md`) runs in full across
      three executors (13 in-process tests, 10 CLI assertions, one
      watch-mode gate), with a coverage cross-check proving no item lost its
      executor.

### Active

All v1 requirements (derived from `spec/behaviors/`, BEH-EC-001 through
BEH-EC-013) are validated as of Phase 11 — v1.0 is complete. The following
are the v2-deferred items already on record in the archived requirements
(`.planning/milestones/v1.0-REQUIREMENTS.md`), candidates for the next
milestone rather than newly discovered gaps:

- [ ] Reusable step definitions across Scenarios/Features (REUSE-01) —
      genuinely harder here than in comparable libraries, since a shared
      step's `R` must reconcile against every consuming Layer, with no
      ecosystem precedent to copy
- [ ] A `ScenarioOutline` Examples column unreferenced by any step's pattern,
      available to the step body as a typed value decoded via `Schema`
      (OUTLINE-01)
- [ ] Retry support for a Scenario, rebuilding its per-Scenario Layer fresh
      per attempt (RETRY-01) — composition-order requirement already
      confirmed by research, implementation deferred
- [ ] A lint rule flagging a `let`/`var` inside a `Scenario`/`Rule`/
      `Background` callback that a step closes over (LINT-01) — automates
      the RUN-06/INV-EC-006 convention beyond what
      `verify:acceptance-ref-state` can reach outside this repository

### Out of Scope

- Publishing to npm — this milestone's destination is "working and tested,"
  not "published" (already ruled out on the wayfinder map)
- A bespoke Gherkin parser — depends on official `@cucumber/gherkin` instead
  (ADR-EC-011)
- A bespoke step-matching syntax — cucumber-expressions is reused verbatim
  (ADR-EC-007)
- A third "shared within a Rule" Layer scope — promote to the Feature's
  `shared` Layer instead (ADR-EC-006, ADR-EC-010)
- A custom cucumber HTML/report format — defer to vitest's own reporters
- A vitest plugin or custom test discovery mechanism — a `.feature` file is
  plain data; the `.steps.ts` module is what vitest discovers, unmodified
- GxP/regulatory compliance tooling — not a regulated domain
- **Reusable step definitions across Scenarios/Features** — a real
  table-stakes gap (GSD Features research), deliberately deferred to a later
  milestone: a shared step's `R` must reconcile against every consuming
  Layer, with no ecosystem precedent to copy. Ship a working core first.
- `spec/roadmap.md` § Planned items — unreferenced-Examples-column Schema
  fallback, Scenario-level retry semantics, a lint rule enforcing ADR-EC-009
  — parked because they're not required by the behaviors as currently
  specified

## Context

- Extensive spec already exists at `spec/` (20 ADRs, 13 behaviors across 3
  files with full worked examples, invariants, glossary, overview, roadmap) —
  this is not a greenfield design effort, the design is locked. `spec/` is
  normative per `AGENTS.md` §1.
- A GitHub-tracked wayfinder map (issue #1, `leaderiop/effect-cucumber`) has
  fully resolved: verifying `@cucumber/gherkin`'s real parsed output shape,
  `@cucumber/cucumber-expressions`' real API, and `@effect/vitest`'s real
  v4-rc API surface, plus scaffolding the pnpm workspace.
- A four-dimension GSD research pass (Stack/Features/Architecture/Pitfalls —
  see `.planning/research/SUMMARY.md`) went further: verified 34 pitfalls
  against the actually-installed libraries (most `[VERIFIED]` by literally
  running them), found 5 feature gaps against 4 comparable libraries, derived
  an 11-phase build order from the verified module dependency graph (two
  independent research streams converged on nearly the same phase
  structure), and — critically — found and the user confirmed fixes for
  three real bugs/contradictions in the *locked spec itself*: a broken
  worked example (ADR-EC-017), an internally-contradictory registry
  lifecycle (ADR-EC-007's amendment), and a shared-Layer `TestClock` leak
  that contradicted a stated core-value requirement (ADR-EC-018).
- The pnpm workspace exists (`packages/gherkin`, `packages/vitest`, both
  correctly linked, dependencies installed, `@effect/tsgo` wired and
  verified working). `packages/gherkin` now has real source
  (`Source`/`Parser`/`Pickles`/`Correlate`/`Validate`/`loadFeature`, shipped
  in Phase 2) and no longer has "no source files yet" — `packages/vitest`
  shipped its own real source across Phases 5-6 (`Registry`/`describeFeature`/
  `TestApi`/`Errors`/`Plan`/`ScenarioEffect`/`Runner`) and no longer has "no
  source files yet" either.
- `effect` and `@effect/vitest` are `peerDependencies` of
  `@effect-cucumber/vitest` (ADR-EC-015), not hard dependencies — avoids a
  verified duplicate-package risk to `Context.Service` identity.
  `@effect-cucumber/gherkin` has no `effect` dependency at all.
- Package versions, confirmed against the live npm registry as of
  2026-08-28: `effect@4.0.0-rc.112`, `@effect/vitest@4.0.0-rc.112`,
  `vitest@^4.1.0`, `@cucumber/gherkin@^42.0.1`, `@cucumber/messages@^34.2.1`,
  `@cucumber/cucumber-expressions@^20.1.0`, `typescript@^7.0.2`,
  `@effect/tsgo@^0.38.0`.
- An untracked `tools/oxlint/effect/` directory holds 4 of Effect's own 5
  unpublished `@effect/oxc` oxlint rules, vendored (MIT-licensed) during
  Stack research — not yet formally adopted; see `spec/roadmap.md` §
  Under consideration.
- **v1.0 shipped 2026-08-30**: ~29,600 lines of TypeScript across
  `packages/gherkin` and `packages/vitest`, 85 plans across 11 phases, 22/22
  v1 requirements validated with a named automated assertion each. Not
  published to npm (out of scope this milestone — see Out of Scope below).

## Constraints

- **Tech stack**: TypeScript 7, Effect v4 (`rc`), vitest v4, pnpm workspaces
  — locked (ADR-EC-012, ADR-EC-013), not open questions for this milestone.
- **Dependencies**: `@cucumber/gherkin`, `@cucumber/messages`,
  `@cucumber/cucumber-expressions` — locked (ADR-EC-011), no bespoke
  parser/matcher.
- **Tooling**: oxlint + dprint (not ESLint/Prettier), `tsc -b` only (no
  bundler), `@effect/tsgo` gating the build — matches the Effect v4 ecosystem
  convention, verified against `effect-ts/effect`'s own `main` branch.
- **Spec fidelity**: every requirement above traces to a specific ADR/BEH
  entry in `spec/`; a phase that can't cite one is out of scope for this
  milestone, not a signal to invent new API surface.

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Full spec (20 ADRs, 13 behaviors) written and stress-tested before any code | Design decisions and third-party API assumptions verified cheaply, before implementation cost was sunk into a wrong assumption | ✓ Good — multiple real conflicts with third-party libraries, and real bugs in the spec itself, caught by research before writing code against them |
| GSD execution flow chosen over a plain coding session or a second wayfinder map | Wanted phase-based planning with a verification loop, on top of (not replacing) the existing spec | ✓ Good — GSD's own 4-dimension research pass found the spec's three critical bugs, which a plain coding session likely wouldn't have surfaced before implementation started |
| Build order: `@effect-cucumber/gherkin` before `@effect-cucumber/vitest` | No Effect-specific logic in gherkin, lower-risk to get right standalone; vitest package depends on it | ✓ Good — corroborated independently by GSD Architecture research's dependency-graph analysis |
| Adopt the `excludeTestServices` shared-Layer TestClock fix (ADR-EC-018) rather than a documented carve-out | Fully verified working, costs nothing but isolated internal complexity in the `shared`-Layer runner path | ✓ Good — shipped in Phase 10; `TestClock` confirmed per-Scenario on the shared path against real `effect@4.0.0-rc.112`, with the shared tier's actual release-timing boundary measured and documented rather than assumed |
| Fold step-drift detection (BEH-EC-013) into this milestone rather than deferring | Table stakes across every comparable library; the one failure-mode gap the Layer check doesn't cover; low-medium cost since it reuses ADR-EC-014's correlation data | ✓ Good — shipped in Phase 6 as `StepMatchError`/`UnusedStepDefinitionWarning`, wired through `describeFeature`'s Plan → Warn → Emit sequence |
| Defer reusable step definitions (Gap 2) to a later milestone | Genuinely harder here than in any comparable library — a shared step's `R` must reconcile against every consuming Layer, no ecosystem precedent | ✓ Good — v1.0 shipped without it as scoped; remains Out of Scope for a future milestone |
| Adopt vitest v4 native tags for `@skip`/`@only`/custom tags instead of `it.effect.only` | `it.effect.only` fails CI by design (verified); native tags nearly close the parked "custom tags" item for free | ✓ Good — shipped in Phase 9 as registration-time filtering (ADR-EC-026, superseding ADR-EC-020's forbid-filtering stance once the trade-off was re-examined against real usage) |

---
*Last updated: 2026-08-30 after Phase 11 (Composition Root and Dogfooded Acceptance Suite) completion — milestone v1.0 complete, all 11 phases shipped*
