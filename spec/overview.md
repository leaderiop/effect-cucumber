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

| Package | Description | Status |
| ------- | ----------- | ------ |
| `@effect-cucumber/gherkin` | `.feature` parsing + step-text matching (wraps `@cucumber/gherkin` / `@cucumber/cucumber-expressions`). No Effect-specific logic. | Not yet implemented |
| `@effect-cucumber/vitest` | `describeFeature`, the Given/When/Then/Background/Scenario/ScenarioOutline/Rule DSL, hooks, the `it.effect`-based runner. Depends on `@effect-cucumber/gherkin` and re-exports `loadFeature`. The package most consumers install directly. | Not yet implemented |

## Public API surface

Not yet implemented — there is no package to export from. Once
`@effect-cucumber/vitest` exists, this section names every export, and a
`check-api-surface`-style script (see `spec/process/definitions-of-done.md`)
keeps the table honest. Until then, the intended surface is described in
`spec/behaviors/`:

| Export (planned) | Kind | Behavior |
| ----------------- | ---- | -------- |
| `loadFeature` | function | [BEH-EC-001](./behaviors/01-steps-and-world.md#beh-ec-001-loading-a-feature-file) |
| `describeFeature` | function | [BEH-EC-002](./behaviors/01-steps-and-world.md#beh-ec-002-describefeature-takes-a-layer) |
| `Given` / `When` / `Then` / `And` / `But` | DSL functions | [BEH-EC-003](./behaviors/01-steps-and-world.md#beh-ec-003-a-step-is-an-effect-returning-function) |
| `Background` | DSL function | [BEH-EC-005](./behaviors/02-shared-layers-and-tags.md#beh-ec-005-background-is-inlined-not-a-hook-and-is-a-step-definition-container) |
| `Rule` | DSL function | [BEH-EC-009](./behaviors/03-rules-outlines-and-testclock.md#beh-ec-009-a-rule-can-extend-the-ambient-layer) |
| `ScenarioOutline` | DSL function | [BEH-EC-010](./behaviors/03-rules-outlines-and-testclock.md#beh-ec-010-scenario-outline-examples-are-typed-for-free) |
| `Before` / `After` / `BeforeStep` / `AfterStep` / `BeforeAllScenarios` / `AfterAllScenarios` | hook functions | [BEH-EC-006](./behaviors/02-shared-layers-and-tags.md#beh-ec-006-hooks-are-effects-and-after-always-runs) |

### Not listed above

| Item | Reason |
| ---- | ------ |
| `@effect-cucumber/gherkin`'s own exports | That package's public surface (`loadFeature`'s implementation, the step-matcher) isn't finalized independently of `@effect-cucumber/vitest`'s needs yet — see `spec/roadmap.md` |
