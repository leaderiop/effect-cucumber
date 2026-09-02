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
runs. That guarantee has one boundary, stated in full at
[INV-EC-003](./invariants.md#inv-ec-003-a-steps-effect-can-only-use-services-the-ambient-layer-provides);
the configuration a consumer sets in their own build to keep it intact is in
[`packages/vitest/README.md` § Recommended lint and compiler configuration](../packages/vitest/README.md#recommended-lint-and-compiler-configuration-for-your-step-modules).

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

| Package                    | Description                                                                                                                                                                                                                                                                                                                                                                                   | Status                                                 |
| -------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------ |
| `@effect-cucumber/gherkin` | `.feature` parsing + step-text matching (wraps `@cucumber/gherkin` / `@cucumber/cucumber-expressions`). Effect-native (`effect` peer dep, v4 only — [ADR-EC-021](decisions/021-effect-and-platform-are-peer-dependencies-of-gherkin.md)); no concrete platform runtime dependency.                                                                                                            | Built and tested — see [`spec/roadmap.md`](roadmap.md) |
| `@effect-cucumber/vitest`  | `describeFeature` with both Layer scopes, the Given/When/Then/Background/Scenario/Rule DSL (an Outline registers through `Scenario` itself, titled per Examples row — BEH-EC-010), all six hooks, tag routing, and the `it.effect`-based runner. Depends on `@effect-cucumber/gherkin` and exports ADR-EC-024's Promise-returning `loadFeature`. The package most consumers install directly. | Built and tested — see [`spec/roadmap.md`](roadmap.md) |

## Public API surface

The surface exists. `@effect-cucumber/vitest` ships a single barrel and no subpath
export, and that barrel's own doc comment in `packages/vitest/src/index.ts` is where
every export — and, just as deliberately, every internal stage that is NOT exported —
is documented today. [`spec/roadmap.md`](roadmap.md) stays the single authority on
build status, exactly as the `@effect-cucumber/gherkin` row above cites it.

`scripts/verify-api-surface.sh` (`pnpm verify:api-surface`, run in CI) compares both
tables below with the code in both directions: every export of
`packages/vitest/src/index.ts` and every member of the container interfaces in
`packages/vitest/src/Dsl.ts` must have a row, and every row must name something real.
The tables are located by the HTML comment markers above them; keep those.

<!-- api-surface:exports -->

| Export                                                                                                                                                | Kind      | Behavior                                                                                                                                                                                                     |
| ----------------------------------------------------------------------------------------------------------------------------------------------------- | --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `loadFeature`                                                                                                                                         | function  | [BEH-EC-001](./behaviors/01-steps-and-world.md#beh-ec-001-loading-a-feature-file)                                                                                                                            |
| `describeFeature`                                                                                                                                     | function  | [BEH-EC-002](./behaviors/01-steps-and-world.md#beh-ec-002-describefeature-takes-a-layer)                                                                                                                     |
| `DescribeFeatureOptions`                                                                                                                              | type      | [BEH-EC-008](./behaviors/02-shared-layers-and-tags.md#beh-ec-008-tags-and-skiponly)                                                                                                                          |
| `gherkinTags` / `GherkinTagDefinition` / `GherkinTagsOptions`                                                                                         | function  | [BEH-EC-008](./behaviors/02-shared-layers-and-tags.md#beh-ec-008-tags-and-skiponly)                                                                                                                          |
| `FeatureDsl` / `RuleDsl` / `ScenarioDsl` / `BackgroundDsl` / `StepRegistrar` / `StepParams` / `HookRegistrar` / `RuleRegistrar` / `ScenarioRegistrar` | types     | [BEH-EC-003](./behaviors/01-steps-and-world.md#beh-ec-003-a-step-is-an-effect-returning-function), [BEH-EC-006](./behaviors/02-shared-layers-and-tags.md#beh-ec-006-hooks-are-effects-and-after-always-runs) |
| `StepMatchError` / `StepMatchErrorReason`                                                                                                             | class     | [BEH-EC-013](./behaviors/01-steps-and-world.md#beh-ec-013-step-drift-fails-loudly)                                                                                                                           |
| `UnusedStepDefinitionWarning` / `UnusedStepDefinitionWarningReason`                                                                                   | types     | [BEH-EC-013](./behaviors/01-steps-and-world.md#beh-ec-013-step-drift-fails-loudly)                                                                                                                           |
| `UnknownContainerWarning` / `UnknownContainerWarningReason`                                                                                           | types     | [BEH-EC-002](./behaviors/01-steps-and-world.md#beh-ec-002-describefeature-takes-a-layer), [BEH-EC-009](./behaviors/03-rules-outlines-and-testclock.md#beh-ec-009-a-rule-can-extend-the-ambient-layer)        |
| `UndeclaredTagWarning` / `UndeclaredTagWarningReason`                                                                                                 | types     | [BEH-EC-008](./behaviors/02-shared-layers-and-tags.md#beh-ec-008-tags-and-skiponly)                                                                                                                          |
| `ExcludedScenariosNotice` / `ExcludedScenariosNoticeReason`                                                                                           | types     | [BEH-EC-008](./behaviors/02-shared-layers-and-tags.md#beh-ec-008-tags-and-skiponly)                                                                                                                          |
| `ParameterTypeStore` / `createParameterTypeStore` / `ParameterTypeDefinition`                                                                         | re-export | [BEH-EC-015](./behaviors/05-step-matching-and-parameter-types.md)                                                                                                                                            |
| `LoadFeatureError` / `StepPatternError` / `DataTableError`                                                                                            | re-export | [BEH-EC-014](./behaviors/04-loadfeature-parse-and-validation.md), [BEH-EC-016](./behaviors/06-datatable-and-docstring-arguments.md)                                                                          |
| `decodeHashes` / `DataTable` / `DocString`                                                                                                            | re-export | [BEH-EC-016](./behaviors/06-datatable-and-docstring-arguments.md)                                                                                                                                            |
| `defineSteps` / `StepModule` / `ModuleStep`                                                                                                           | function  | [BEH-EC-019](./behaviors/08-step-modules.md#beh-ec-019-typed-step-modules-are-reusable-across-features)                                                                                                      |
| `ParsedFeature` / `StepArgs`                                                                                                                          | re-export | [BEH-EC-001](./behaviors/01-steps-and-world.md#beh-ec-001-loading-a-feature-file), [BEH-EC-010](./behaviors/03-rules-outlines-and-testclock.md#beh-ec-010-scenario-outline-examples-are-typed-for-free)      |

The dsl `define` receives is not exported piecewise; its members are:

<!-- api-surface:dsl-members -->

| Member                                          | Container                                          | Behavior                                                                                                                                                                                                                                                                       |
| ----------------------------------------------- | -------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `Given` / `When` / `Then` / `And` / `But`       | every container (`Background`: `Given`/`And` only) | [BEH-EC-003](./behaviors/01-steps-and-world.md#beh-ec-003-a-step-is-an-effect-returning-function)                                                                                                                                                                              |
| `Background`                                    | Feature, Rule                                      | [BEH-EC-005](./behaviors/02-shared-layers-and-tags.md#beh-ec-005-background-is-inlined-not-a-hook-and-is-a-step-definition-container)                                                                                                                                          |
| `Scenario`                                      | Feature, Rule                                      | [BEH-EC-002](./behaviors/01-steps-and-world.md#beh-ec-002-describefeature-takes-a-layer); an Outline is registered through `Scenario` and titled per row, [BEH-EC-010](./behaviors/03-rules-outlines-and-testclock.md#beh-ec-010-scenario-outline-examples-are-typed-for-free) |
| `use`                                           | Feature, Rule, Scenario (not `Background`)         | [BEH-EC-019](./behaviors/08-step-modules.md#beh-ec-019-typed-step-modules-are-reusable-across-features)                                                                                                                                                                        |
| `Rule`                                          | Feature                                            | [BEH-EC-009](./behaviors/03-rules-outlines-and-testclock.md#beh-ec-009-a-rule-can-extend-the-ambient-layer)                                                                                                                                                                    |
| `Before` / `After` / `BeforeStep` / `AfterStep` | Feature, Rule                                      | [BEH-EC-006](./behaviors/02-shared-layers-and-tags.md#beh-ec-006-hooks-are-effects-and-after-always-runs)                                                                                                                                                                      |
| `BeforeAllScenarios` / `AfterAllScenarios`      | Feature                                            | [BEH-EC-006](./behaviors/02-shared-layers-and-tags.md#beh-ec-006-hooks-are-effects-and-after-always-runs)                                                                                                                                                                      |

### Not listed above

| Item                                     | Reason                                                                                                                                                                          |
| ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `@effect-cucumber/gherkin`'s own exports | That package's public surface (`loadFeature`'s implementation, the step-matcher) isn't finalized independently of `@effect-cucumber/vitest`'s needs yet — see `spec/roadmap.md` |
