# Overview

## Mission

`@effect-cucumber` runs Gherkin `.feature` files as vitest tests where every
step is an `Effect`. It closes the gap between `@effect/vitest` (Effect-native
tests, no Gherkin) and `@amiceli/vitest-cucumber` (Gherkin-on-vitest, but
plain-promise steps and an untyped `context: any` world): steps get
Layer-based dependency injection, `TestClock`/`TestConsole` for free, and
compile-time-checked scenario dependencies instead of a runtime
"service not found."

## Design philosophy

**Steps are Effects, not promises.** A step is `(...params) => Effect<A, E, R>`.
No `ctx` parameter — assertions come from ordinary `expect`, and the mutable
`context` bag other libraries thread through steps is replaced by a typed
Effect service (see [Glossary — World](./glossary.md#world)).

**A missing dependency is a compile error.** `describeFeature` takes a `Layer`;
if a step's Effect needs an `R` the Layer doesn't provide, that's a type error
at the step definition, not a runtime failure discovered when the scenario
runs.

**Fail-fast is structural, not bookkept.** A Scenario's steps are sequential
`yield*`s inside one `Effect.gen`. Effect's own error channel short-circuits on
the first failing step — no separate "skip remaining steps" mechanism to get
wrong.

**No plugin, no custom reporter.** Everything reduces to real vitest
`describe`/`it.effect`/`layer(...)` calls (from `@effect/vitest`). A `.feature`
file is plain data read by `loadFeature`; vitest's file discovery only ever
sees the `.steps.ts` module that calls it. `vitest run -t "<pattern>"`, watch
mode, and reporters all work unmodified.

**Reuse the official Gherkin toolchain.** Parsing and step-text matching
(`{int}`, `{string}`, custom parameter types) come from `@cucumber/gherkin` and
`@cucumber/cucumber-expressions` — official, stable packages — not a
bespoke parser or another library's internals.

## Packages

Monorepo under the `@effect-cucumber` npm scope. One package per module, not
subpath exports of a single package.

| Package                    | Description                                                                                                                                                                                                                                                                                                                       | Status                                                 |
| -------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------ |
| `@effect-cucumber/gherkin` | `.feature` parsing + step-text matching (wraps `@cucumber/gherkin` / `@cucumber/cucumber-expressions`). Effect-native (`effect` peer dep, v4 only — [ADR-EC-021](decisions/021-effect-and-platform-are-peer-dependencies-of-gherkin.md)); no concrete platform runtime dependency.                                                | Built and tested — see [`spec/roadmap.md`](roadmap.md) |
| `@effect-cucumber/vitest`  | `describeFeature` with both Layer scopes, the Given/When/Then/Background/Scenario/ScenarioOutline/Rule DSL, all six hooks, tag routing, and the `it.effect`-based runner. Depends on `@effect-cucumber/gherkin`; ADR-EC-024's wrapped `loadFeature` is the one export still to come. The package most consumers install directly. | Built and tested — see [`spec/roadmap.md`](roadmap.md) |

## Public API surface

The surface exists. `@effect-cucumber/vitest` ships a single barrel and no subpath
export, and that barrel's own doc comment in `packages/vitest/src/index.ts` is where
every export — and, just as deliberately, every internal stage that is NOT exported —
is documented today. [`spec/roadmap.md`](roadmap.md) stays the single authority on
build status, exactly as the `@effect-cucumber/gherkin` row above cites it.

What is still planned is the ENFORCEMENT of the table below: a
`check-api-surface`-style script (see `spec/process/definitions-of-done.md`) that
keeps this section honest against the barrel rather than beside it. Until that script
exists, the table names the behavior each export is specified by and nothing checks
that the two agree — `loadFeature` in particular is the one row that does NOT
correspond to an export of this package yet (ADR-EC-024), and a consumer reaches
`@effect-cucumber/gherkin`'s own `loadFeature` instead:

| Export                                                                                       | Kind           | Behavior                                                                                                                              |
| -------------------------------------------------------------------------------------------- | -------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| `loadFeature`                                                                                | function       | [BEH-EC-001](./behaviors/01-steps-and-world.md#beh-ec-001-loading-a-feature-file)                                                     |
| `describeFeature`                                                                            | function       | [BEH-EC-002](./behaviors/01-steps-and-world.md#beh-ec-002-describefeature-takes-a-layer)                                              |
| `Given` / `When` / `Then` / `And` / `But`                                                    | DSL functions  | [BEH-EC-003](./behaviors/01-steps-and-world.md#beh-ec-003-a-step-is-an-effect-returning-function)                                     |
| `Background`                                                                                 | DSL function   | [BEH-EC-005](./behaviors/02-shared-layers-and-tags.md#beh-ec-005-background-is-inlined-not-a-hook-and-is-a-step-definition-container) |
| `Rule`                                                                                       | DSL function   | [BEH-EC-009](./behaviors/03-rules-outlines-and-testclock.md#beh-ec-009-a-rule-can-extend-the-ambient-layer)                           |
| `ScenarioOutline`                                                                            | DSL function   | [BEH-EC-010](./behaviors/03-rules-outlines-and-testclock.md#beh-ec-010-scenario-outline-examples-are-typed-for-free)                  |
| `Before` / `After` / `BeforeStep` / `AfterStep` / `BeforeAllScenarios` / `AfterAllScenarios` | hook functions | [BEH-EC-006](./behaviors/02-shared-layers-and-tags.md#beh-ec-006-hooks-are-effects-and-after-always-runs)                             |

### Not listed above

| Item                                     | Reason                                                                                                                                                                          |
| ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `@effect-cucumber/gherkin`'s own exports | That package's public surface (`loadFeature`'s implementation, the step-matcher) isn't finalized independently of `@effect-cucumber/vitest`'s needs yet — see `spec/roadmap.md` |
