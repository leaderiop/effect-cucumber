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
examples and a wayfinder research pass verifying every third-party API
assumption against the real installed packages, before any code was
written — see `spec/roadmap.md` § Current state.)

### Active

Derived from `spec/behaviors/` (BEH-EC-001 through BEH-EC-012). Each maps to
one or more ADRs in `spec/decisions/` for full rationale.

- [ ] `loadFeature` parses `.feature` files, correlating the raw
      `GherkinDocument` (structure) with `compile()`'s `Pickle[]` output
      (substituted step text, inherited tags, stacked Background steps) —
      ADR-EC-014
- [ ] `describeFeature` takes a Layer; a step's Effect can only use services
      that Layer provides — ADR-EC-003
- [ ] A step is `(...params) => Effect<A, E, R>`; `Given`/`When`/`Then`
      accept a bare generator, auto-wrapped with `Effect.fn` — ADR-EC-001,
      ADR-EC-005
- [ ] `World` is a typed `Context.Service`, not an untyped context bag —
      ADR-EC-002
- [ ] `Background` steps are inlined as the first `yield*`s of every
      Scenario's Effect, not a separate vitest hook — ADR-EC-004
- [ ] Hooks (`Before`/`After`/`BeforeStep`/`AfterStep`/`BeforeAllScenarios`/
      `AfterAllScenarios`) are Effects; `After` always runs via
      `Effect.ensuring` — ADR-EC-005
- [ ] Two Layer scopes only: per-Scenario (default, fresh every Scenario) and
      an opt-in `shared` Layer built once via `@effect/vitest`'s `layer(...)`
      — ADR-EC-006
- [ ] `@skip`/`@only` tags map to `it.effect.skip`/`.only`; excluded tags are
      filtered before `it.effect` is ever called — BEH-EC-008
- [ ] `Rule` can extend the ambient Layer with an extra per-Scenario Layer,
      visible only to Scenarios inside that Rule — ADR-EC-010
- [ ] `Scenario Outline` Examples are typed for free via cucumber-expression
      coercion (`{int}`/`{float}`) — no separate typed "example row"
      mechanism needed — ADR-EC-007
- [ ] Cross-step scenario state lives in a `Ref` from `World`, never a bare
      closure variable — ADR-EC-009
- [ ] `TestClock` composes transparently — a step reading `Clock` sees
      `@effect/vitest`'s simulated clock with zero test-specific code —
      confirmed against real `effect@4.0.0-rc.112`
- [ ] Data tables decode through Schema, via `@effect-cucumber/gherkin`'s own
      `DataTable` wrapper (`.hashes()` isn't native to `@cucumber/gherkin`) —
      ADR-EC-008

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
- `spec/roadmap.md` § Planned items — unreferenced-Examples-column Schema
  fallback, custom/non-reserved tag filtering beyond `@skip`/`@only`,
  Scenario-level retry semantics, a lint rule enforcing ADR-EC-009 — parked
  because they're not required by the behaviors as currently specified

## Context

- Extensive spec already exists at `spec/` (14 ADRs, 12 behaviors across 3
  files with full worked examples, invariants, glossary, overview, roadmap) —
  this is not a greenfield design effort, the design is locked. `spec/` is
  normative per `AGENTS.md` §1.
- A GitHub-tracked wayfinder map (issue #1, `leaderiop/effect-cucumber`) has
  already fully resolved: verifying `@cucumber/gherkin`'s real parsed output
  shape (2 conflicts found and fixed via ADR-EC-008/ADR-EC-014), verifying
  `@cucumber/cucumber-expressions`' real API (1 conflict found and fixed via
  ADR-EC-007), verifying `@effect/vitest`'s real v4-rc API surface (zero
  conflicts — all 5 assumptions matched), and scaffolding the pnpm workspace.
- The pnpm workspace exists (`packages/gherkin`, `packages/vitest`, both
  correctly linked, dependencies installed) but has **no source files yet**.
- Package versions, confirmed against the live npm registry as of
  2026-08-28: `effect@4.0.0-rc.112`, `@effect/vitest@4.0.0-rc.112` (exact
  pins, same monorepo, lockstep versioning), `vitest@^4.1.0`,
  `@cucumber/gherkin@^42.0.1`, `@cucumber/cucumber-expressions@^20.1.0`,
  `typescript@^7.0.2`.

## Constraints

- **Tech stack**: TypeScript, Effect v4 (`rc`), vitest v4, pnpm workspaces —
  locked (ADR-EC-012, ADR-EC-013), not open questions for this milestone.
- **Dependencies**: `@cucumber/gherkin`, `@cucumber/cucumber-expressions` —
  locked (ADR-EC-011), no bespoke parser/matcher.
- **Spec fidelity**: every requirement above traces to a specific ADR/BEH
  entry in `spec/`; a phase that can't cite one is out of scope for this
  milestone, not a signal to invent new API surface.

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Full spec (14 ADRs, 12 behaviors) written and stress-tested before any code | Design decisions and third-party API assumptions verified cheaply, before implementation cost was sunk into a wrong assumption | ✓ Good — 3 real conflicts with third-party libraries caught by research before writing code against them |
| GSD execution flow chosen over a plain coding session or a second wayfinder map | Wanted phase-based planning with a verification loop, on top of (not replacing) the existing spec | — Pending |
| Build order: `@effect-cucumber/gherkin` before `@effect-cucumber/vitest` | No Effect-specific logic in gherkin, lower-risk to get right standalone; vitest package depends on it | — Pending |

---
*Last updated: 2026-08-28 after initialization*
