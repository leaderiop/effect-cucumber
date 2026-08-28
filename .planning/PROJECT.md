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

(None yet — no code has shipped. Design was validated through three worked
examples, a wayfinder research pass verifying every third-party API
assumption against the real installed packages, and a four-dimension GSD
research pass (Stack/Features/Architecture/Pitfalls) that found and fixed
three real bugs in the spec itself — all before any code was written. See
`spec/roadmap.md` § Current state.)

### Active

Derived from `spec/behaviors/` (BEH-EC-001 through BEH-EC-013). Each maps to
one or more ADRs in `spec/decisions/` for full rationale.

- [ ] `loadFeature` parses `.feature` files, correlating the raw
      `GherkinDocument` (structure) with `compile()`'s `Pickle[]` output
      (substituted step text, inherited tags, stacked Background steps),
      failing loudly on the known exception (an un-interpolated placeholder
      in a Background nested under a Scenario Outline) — ADR-EC-014
- [ ] `describeFeature` takes a Layer; a step's Effect can only use services
      that Layer provides — ADR-EC-003, backed by `@effect/tsgo`'s
      `missingLayerContext`/`missingEffectContext` diagnostics — ADR-EC-016
- [ ] A step is `(...params) => Effect<A, E, R>`; `Given`/`When`/`Then`
      accept a bare generator, auto-wrapped with `Effect.fn` — ADR-EC-001,
      ADR-EC-005
- [ ] `World` is a typed `Context.Service`, not an untyped context bag —
      ADR-EC-002
- [ ] `Background` and `Scenario` are step-definition containers — a
      Background's literal Gherkin text is matched against a registered
      `Given`/`And` pattern exactly like any other step, not run
      unconditionally — ADR-EC-017. Background steps are inlined as the
      first `yield*`s of every Scenario's Effect, not a separate vitest hook
      — ADR-EC-004
- [ ] Hooks (`Before`/`After`/`BeforeStep`/`AfterStep`/`BeforeAllScenarios`/
      `AfterAllScenarios`) are Effects; `After` always runs via
      `Effect.ensuring` — ADR-EC-005
- [ ] Two Layer scopes only: per-Scenario (default, fresh every Scenario) and
      an opt-in `shared` Layer built once via `@effect/vitest`'s `layer(...)`
      with `excludeTestServices: true` so `TestClock` stays per-Scenario even
      on the shared path — ADR-EC-006, ADR-EC-018
- [ ] Every tag maps to vitest's native tag system; `@skip` additionally
      routes to `it.effect.skip`. `@only` is emitted as a plain tag, not
      `it.effect.only` (which fails CI) — ADR-EC-020, BEH-EC-008
- [ ] `Rule` can extend the ambient Layer with an extra per-Scenario Layer,
      visible only to Scenarios inside that Rule — ADR-EC-010
- [ ] `Scenario Outline` Examples are typed for free via cucumber-expression
      coercion (`{int}`/`{float}`) — no separate typed "example row"
      mechanism needed — ADR-EC-007
- [ ] Cross-step scenario state lives in a `Ref` from `World`, never a bare
      closure variable — ADR-EC-009
- [ ] `TestClock` composes transparently on **both** Layer scopes — a step
      reading `Clock` sees `@effect/vitest`'s simulated clock with zero
      test-specific code, confirmed against real `effect@4.0.0-rc.112` —
      BEH-EC-012, ADR-EC-018
- [ ] Data tables decode through Schema, via `@effect-cucumber/gherkin`'s own
      `DataTable` wrapper (`.hashes()` isn't native to `@cucumber/gherkin`) —
      ADR-EC-008
- [ ] A Pickle step matching zero or more-than-one registered pattern fails
      loudly, naming the step text and every ambiguous match; a registered
      pattern matching zero steps in the Feature is a warning — ADR-EC-019,
      BEH-EC-013

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
  verified working) but has **no source files yet**.
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
| Adopt the `excludeTestServices` shared-Layer TestClock fix (ADR-EC-018) rather than a documented carve-out | Fully verified working, costs nothing but isolated internal complexity in the `shared`-Layer runner path | — Pending |
| Fold step-drift detection (BEH-EC-013) into this milestone rather than deferring | Table stakes across every comparable library; the one failure-mode gap the Layer check doesn't cover; low-medium cost since it reuses ADR-EC-014's correlation data | — Pending |
| Defer reusable step definitions (Gap 2) to a later milestone | Genuinely harder here than in any comparable library — a shared step's `R` must reconcile against every consuming Layer, no ecosystem precedent | — Pending |
| Adopt vitest v4 native tags for `@skip`/`@only`/custom tags instead of `it.effect.only` | `it.effect.only` fails CI by design (verified); native tags nearly close the parked "custom tags" item for free | — Pending |

---
*Last updated: 2026-08-28 after GSD research (Stack/Features/Architecture/Pitfalls) and spec corrections*
