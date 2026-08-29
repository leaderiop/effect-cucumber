# Traceability Matrix

## Traceability chain

```
Behavior (BEH-EC-NNN)
    → Source module (packages/*/src/*.ts)      [gherkin: built; vitest: partly built]
    → Test file (packages/*/test/*.test.ts)     [both: built]
    → Invariant (INV-EC-NNN)
    → Decision (ADR-EC-NNN)
    → Acceptance scenario (REQ-EC-NNN)          [planned — no .feature files yet]
```

Sections §1–§6 are parsed by `spec/scripts/verify-traceability.sh`; column
order is a contract. The verify script checks that every ID is traced here, not
that a named file exists, so the **Source module** column mixes real and
planned locations and this note is what tells them apart.

`packages/gherkin/src` and `packages/gherkin/test` are entirely real.
`packages/vitest/src` now has real source too — `describeFeature.ts`, `Dsl.ts`,
`Step.ts`, `Registry.ts`, `CallSite.ts`, `Errors.ts`, `TestApi.ts`, `Plan.ts`,
`ScenarioEffect.ts`, `Runner.ts` and the `index.ts` barrel — and
`packages/vitest/test` has real suites. Everything else this document names under `packages/vitest`
remains **planned** and does not exist on disk: `Hooks.ts`,
`Rule.ts`, `Tags.ts`, `SharedLayer.ts`, `ScenarioOutline.ts` and
`Background.ts`.
`Plan.ts`, `ScenarioEffect.ts` and `Runner.ts` are all reachable from a
user-facing call: `describeFeature` plans its collection, writes any unused-pattern
warnings to the terminal, and emits the result, so `planFeature`,
`buildScenarioEffect` and `emitFeature` each run on the path a test author
actually takes. `packages/vitest/test/emission.test.ts` is the end-to-end
assertion of that, and the only file in the repo that calls `describeFeature` for
real.
§4's rows name only real files. See `spec/roadmap.md` for
what's actually built.

## §1 Behavior to source

| Behavior file                                                                                | Range                      | Source module (real and planned — see the preamble)                                                                                                              |
| -------------------------------------------------------------------------------------------- | -------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [01 — Steps and World](behaviors/01-steps-and-world.md)                                      | BEH-EC-001–004, BEH-EC-013 | `packages/gherkin/src/{loadFeature,Snippet}.ts`, `packages/vitest/src/{describeFeature,Dsl,Step,Registry,CallSite,Errors,Plan,ScenarioEffect,TestApi,Runner}.ts` |
| [02 — Background, hooks, shared Layers, and tags](behaviors/02-shared-layers-and-tags.md)    | BEH-EC-005–008             | `packages/vitest/src/{ScenarioEffect,Background,Hooks,SharedLayer,Tags}.ts`                                                                                      |
| [03 — Rules, Scenario Outlines, and TestClock](behaviors/03-rules-outlines-and-testclock.md) | BEH-EC-009–012             | `packages/vitest/src/{Rule,ScenarioOutline}.ts`                                                                                                                  |
| [04 — loadFeature parse and validation](behaviors/04-loadfeature-parse-and-validation.md)    | BEH-EC-014                 | `packages/gherkin/src/{loadFeature,Source,Parser,Pickles,Correlate,Validate,Errors,Model}.ts`                                                                    |
| [05 — Step matching and parameter types](behaviors/05-step-matching-and-parameter-types.md)  | BEH-EC-015                 | `packages/gherkin/src/{ParameterTypes,StepMatcher,StepArgs,Errors}.ts`                                                                                           |
| [06 — DataTable and DocString arguments](behaviors/06-datatable-and-docstring-arguments.md)  | BEH-EC-016                 | `packages/gherkin/src/{DataTable,StepArguments,Errors,Model,Correlate}.ts`                                                                                       |

## §2 Invariant traceability

INV-EC-001, INV-EC-002 and INV-EC-003 are enforced today, by the assertions their
**Test** columns name. INV-EC-002's row covers the per-Scenario scope, which is
the whole of what this milestone builds; the `shared` clause of its wording waits
on Phase 10 and the invariant entry itself says so. Every remaining row's
**Enforced by** entry is still a planned mechanism, and its **Test** column
("Not yet written") is what says so.

| Invariant                                                                                              | Description                   | Enforced by                                                                                                                     | Test                                                                                                                                                                                        |
| ------------------------------------------------------------------------------------------------------ | ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [INV-EC-001](invariants.md#inv-ec-001-fail-fast-is-structural-not-bookkept)                            | Fail-fast is structural       | A `for` loop of `yield*` in `ScenarioEffect.ts`'s `buildScenarioEffect`                                                         | `packages/vitest/test/ScenarioEffect.test.ts`                                                                                                                                               |
| [INV-EC-002](invariants.md#inv-ec-002-a-per-scenario-layer-is-fresh-every-scenario)                    | Per-Scenario Layer is fresh   | The Layer supplied once per Scenario Effect, rebuilt on every execution, with `Runner.ts` emitting one such Effect per Scenario | `packages/vitest/test/ScenarioEffect.test.ts` (per-execution freshness) and `packages/vitest/test/emission.test.ts` (isolation ACROSS two emitted Scenarios against a state-carrying Layer) |
| [INV-EC-003](invariants.md#inv-ec-003-a-steps-effect-can-only-use-services-the-ambient-layer-provides) | Step deps are compile-checked | `StepRegistrar<ROut>` + `@effect/tsgo`'s `missingEffectContext`/`missingLayerContext`                                           | `scripts/verify-tsgo-gate.sh` assertions 5/6/8                                                                                                                                              |
| [INV-EC-004](invariants.md#inv-ec-004-after-hooks-run-even-when-a-step-fails)                          | `After` always runs           | `Effect.ensuring` around the scenario Effect                                                                                    | Not yet written                                                                                                                                                                             |
| [INV-EC-005](invariants.md#inv-ec-005-a-rule-scoped-layer-is-invisible-outside-that-rule)              | Rule-scoped Layer isolation   | `Layer.provideMerge` scoped to the Rule's dsl closure                                                                           | Not yet written (type-level test)                                                                                                                                                           |
| [INV-EC-006](invariants.md#inv-ec-006-cross-step-scenario-data-survives-only-via-a-layer-provided-ref) | Cross-step state via Ref only | Convention (ADR-EC-009) — no automated enforcement yet                                                                          | None yet — candidate lint rule                                                                                                                                                              |

## §3 Decision traceability

The **Source module** column is populated as each phase's reconciliation plan
reaches the decisions that phase implemented; Phase 6 filled ADR-EC-004,
ADR-EC-017 and ADR-EC-019. A `—` there therefore means "no implementing module
is recorded here yet", **not** "unimplemented" — several unfilled rows
(ADR-EC-014 and ADR-EC-022 among them) are fully built. §1 is the complete
behavior-to-module map, and `spec/roadmap.md` remains the single authority on
what is built versus only specified. A `—` in **Affected invariants** is
different and final: it means the decision genuinely constrains no invariant.

| Decision                                                                                    | Title                                                                                                      | Affected invariants                                                                                    | Source module                                                |
| ------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------ |
| [ADR-EC-001](decisions/001-steps-are-effects.md)                                            | A step is `(...params) => Effect<A, E, R>`                                                                 | —                                                                                                      | —                                                            |
| [ADR-EC-002](decisions/002-world-is-a-context-service.md)                                   | World is a typed `Context.Service`                                                                         | [INV-EC-002](invariants.md#inv-ec-002-a-per-scenario-layer-is-fresh-every-scenario)                    | —                                                            |
| [ADR-EC-003](decisions/003-describefeature-takes-a-layer.md)                                | `describeFeature` takes a Layer                                                                            | [INV-EC-003](invariants.md#inv-ec-003-a-steps-effect-can-only-use-services-the-ambient-layer-provides) | —                                                            |
| [ADR-EC-004](decisions/004-one-it-effect-per-scenario.md)                                   | One `it.effect` per Scenario                                                                               | [INV-EC-001](invariants.md#inv-ec-001-fail-fast-is-structural-not-bookkept)                            | `packages/vitest/src/{ScenarioEffect,Runner}.ts`             |
| [ADR-EC-005](decisions/005-effect-fn-for-step-and-hook-bodies.md)                           | `Effect.fn` for step and hook bodies                                                                       | —                                                                                                      | —                                                            |
| [ADR-EC-006](decisions/006-two-layer-scopes-only.md)                                        | Two Layer scopes only                                                                                      | [INV-EC-002](invariants.md#inv-ec-002-a-per-scenario-layer-is-fresh-every-scenario)                    | —                                                            |
| [ADR-EC-007](decisions/007-cucumber-expressions-for-step-matching.md)                       | Step matching stays cucumber-expressions                                                                   | —                                                                                                      | —                                                            |
| [ADR-EC-008](decisions/008-data-tables-and-doc-strings-decode-through-schema.md)            | Data tables/doc strings decode through Schema                                                              | —                                                                                                      | —                                                            |
| [ADR-EC-009](decisions/009-cross-step-state-lives-in-a-ref.md)                              | Cross-step state lives in a Ref                                                                            | [INV-EC-006](invariants.md#inv-ec-006-cross-step-scenario-data-survives-only-via-a-layer-provided-ref) | —                                                            |
| [ADR-EC-010](decisions/010-rule-and-scenario-scoped-extra-layers.md)                        | Rule/Scenario-scoped extra Layers                                                                          | [INV-EC-005](invariants.md#inv-ec-005-a-rule-scoped-layer-is-invisible-outside-that-rule)              | —                                                            |
| [ADR-EC-011](decisions/011-official-cucumber-parser-packages.md)                            | Official cucumber parser packages                                                                          | —                                                                                                      | —                                                            |
| [ADR-EC-012](decisions/012-effect-v4-beta.md)                                               | Target Effect v4 (beta)                                                                                    | —                                                                                                      | —                                                            |
| [ADR-EC-013](decisions/013-effect-cucumber-npm-scope.md)                                    | One package per module, `@effect-cucumber` scope                                                           | —                                                                                                      | —                                                            |
| [ADR-EC-014](decisions/014-loadfeature-consumes-gherkindocument-and-pickles.md)             | `loadFeature` consumes both the `GherkinDocument` and compiled Pickles                                     | —                                                                                                      | —                                                            |
| [ADR-EC-015](decisions/015-effect-is-a-peer-dependency.md)                                  | `effect` is a peer dependency; `gherkin` package has no `effect` dependency (**Superseded by ADR-EC-021**) | —                                                                                                      | —                                                            |
| [ADR-EC-016](decisions/016-effect-tsgo-language-service-plugin.md)                          | `@effect/tsgo` wired as the `tsc` language-service plugin                                                  | [INV-EC-003](invariants.md#inv-ec-003-a-steps-effect-can-only-use-services-the-ambient-layer-provides) | —                                                            |
| [ADR-EC-017](decisions/017-background-and-scenario-are-step-definition-containers.md)       | `Background`/`Scenario` are step-definition containers                                                     | —                                                                                                      | `packages/vitest/src/{Dsl,Registry,Plan}.ts`                 |
| [ADR-EC-018](decisions/018-shared-layer-testclock-isolation.md)                             | Shared Layer keeps per-Scenario `TestClock` isolation                                                      | —                                                                                                      | —                                                            |
| [ADR-EC-019](decisions/019-fail-loudly-on-unmatched-or-ambiguous-steps.md)                  | Fail loudly on unmatched/ambiguous steps                                                                   | —                                                                                                      | `packages/vitest/src/{Plan,ScenarioEffect,Runner,Errors}.ts` |
| [ADR-EC-020](decisions/020-vitest-native-tags-for-skip-only.md)                             | Tags map to vitest's native tag system                                                                     | —                                                                                                      | —                                                            |
| [ADR-EC-021](decisions/021-effect-and-platform-are-peer-dependencies-of-gherkin.md)         | `effect`/`@effect/platform` are peer deps of `gherkin` too, v4 only — supersedes ADR-EC-015                | —                                                                                                      | —                                                            |
| [ADR-EC-022](decisions/022-option-replaces-undefined-in-gherkins-public-api.md)             | `Option<T>` replaces `T \| undefined` throughout gherkin's public API                                      | —                                                                                                      | —                                                            |
| [ADR-EC-023](decisions/023-parametertypestore-becomes-an-ambient-context-service.md)        | `ParameterTypeStore` becomes an ambient `Context.Service`, replacing `LoadFeatureOptions`                  | —                                                                                                      | —                                                            |
| [ADR-EC-024](decisions/024-vitest-owns-a-managedruntime-for-collection-time-loadfeature.md) | `@effect-cucumber/vitest` owns one module-scoped `ManagedRuntime` for collection-time `loadFeature`        | —                                                                                                      | —                                                            |
| [ADR-EC-025](decisions/025-datatable-wrapper-accessor-contract.md)                          | The DataTable wrapper's accessors fail loudly, and both step arguments arrive in source order              | —                                                                                                      | —                                                            |

## §4 Test file map

Every row below names a real file on disk. The preamble's planned/real split
applies to the **Source module** column above, never to this section.

The rows below are enumerated from disk — one per `packages/gherkin/test/*.test.ts` and
`packages/vitest/test/*.test.ts` file — plus **one deliberate non-suite entry**,
`StepArgs.types.ts`. That file is compiled by
`pnpm typecheck:test` and is never collected by vitest (its `.types.ts` suffix is outside the
vitest include glob, which is the point of the suffix), and it is where MATCH-01's type-level
claim is actually asserted. It is listed here so the claim is traceable; it is not a stray file
to be "fixed" by renaming it to `.test.ts`, which would break `pnpm test` with "No test suite
found".

| Test file                                              | Covers                             | Description                                                                                                                                                                                                                                                                                                                                                        |
| ------------------------------------------------------ | ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `packages/gherkin/test/Contracts.test.ts`              | BEH-EC-014                         | Error and warning shape, including the no-truncation policy                                                                                                                                                                                                                                                                                                        |
| `packages/gherkin/test/Correlate.test.ts`              | BEH-EC-001, BEH-EC-016             | Substitution, Background stacking, tag inheritance, origin, keyword, both scenario names, and `stepArguments` end to end                                                                                                                                                                                                                                           |
| `packages/gherkin/test/DataTable.test.ts`              | BEH-EC-016                         | Accessor semantics, both roadmap edge cases, the loud-failure paths, the `__proto__` guard, and `decodeHashes`' located error                                                                                                                                                                                                                                      |
| `packages/gherkin/test/ParameterTypeLifecycle.test.ts` | BEH-EC-015                         | A custom parameter type resolving across two `loadFeature` calls in one process                                                                                                                                                                                                                                                                                    |
| `packages/gherkin/test/ParameterTypes.test.ts`         | BEH-EC-015                         | One test per definition-time rejection, repeated builds, and store isolation                                                                                                                                                                                                                                                                                       |
| `packages/gherkin/test/Parser.test.ts`                 | BEH-EC-014                         | Parse-time throws wrapped as `MissingFile` / `ParseFailed` / `UnknownDialect` / `NoFeature`                                                                                                                                                                                                                                                                        |
| `packages/gherkin/test/Snippet.test.ts`                | BEH-EC-013                         | `generateStepSnippet`: literals generalised to cucumber-expression parameters, each annotated with the TypeScript type its transform really produces, and the pattern escaped at the injection boundary                                                                                                                                                            |
| `packages/gherkin/test/StepArguments.test.ts`          | BEH-EC-016                         | The source-order rule asserted on synthetic `PickleStepArgument` values, independent of any fixture                                                                                                                                                                                                                                                                |
| `packages/gherkin/test/StepMatcher.test.ts`            | BEH-EC-015                         | Runtime coercion, match-every-pattern, and memoization identity per (registry, pattern)                                                                                                                                                                                                                                                                            |
| `packages/gherkin/test/Validate.test.ts`               | BEH-EC-014                         | One test per reason tag, plus the Group C warnings and the placeholder false-positive guards                                                                                                                                                                                                                                                                       |
| `packages/gherkin/test/dialect.test.ts`                | BEH-EC-001                         | A non-English feature parses with no special handling                                                                                                                                                                                                                                                                                                              |
| `packages/gherkin/test/expressions-pin.test.ts`        | BEH-EC-015                         | Pins `@cucumber/cucumber-expressions@20.1.0`'s verified behavior; imports nothing from `../src`                                                                                                                                                                                                                                                                    |
| `packages/gherkin/test/loadFeature.test.ts`            | BEH-EC-001                         | Synchronous, contributes zero tests, path and `?raw` parity                                                                                                                                                                                                                                                                                                        |
| `packages/gherkin/test/schema-issue-pin.test.ts`       | BEH-EC-016                         | Pins `effect@4.0.0-rc.112`'s `SchemaError` issue-tree shape, which `decodeHashes` reads; imports nothing from `../src`                                                                                                                                                                                                                                             |
| `packages/gherkin/test/upstream-pin.test.ts`           | BEH-EC-014, BEH-EC-016             | Pins `@cucumber/gherkin@42`'s verified behavior per fixture — including the `argumentIndex` and `PickleTableRow` facts — so an upstream bump fails loudly                                                                                                                                                                                                          |
| `packages/gherkin/test/StepArgs.types.ts`              | BEH-EC-015                         | **Type-check, not a suite** — compiled by `pnpm typecheck:test`, never collected by vitest; asserts MATCH-01's type-level claim                                                                                                                                                                                                                                    |
| `packages/vitest/test/CallSite.test.ts`                | BEH-EC-013                         | Definition-site capture: `captureCallSite` returns the AUTHOR's frame and not this package's, ordering is numeric and file-first, and a site that could not be captured stays an explicit absent marker                                                                                                                                                            |
| `packages/vitest/test/Errors.test.ts`                  | BEH-EC-013, BEH-EC-014             | The drift-detection data shapes: `StepMatchError`'s two reason tags and nine fields round-tripping, and `UnusedStepDefinitionWarning`'s factory, both with the no-truncation policy asserted by exact message length                                                                                                                                               |
| `packages/vitest/test/Plan.test.ts`                    | BEH-EC-013                         | `planFeature`: the Background/Scenario/Feature scope chain with inner-shadows-outer precedence, the `UndefinedStep` error and its suggested snippet, the `AmbiguousStep` error ordered by definition site and independent of registration order, and the unused-pattern warnings                                                                                   |
| `packages/vitest/test/Registry.test.ts`                | BEH-EC-002, BEH-EC-003             | Per-instance step registration: two registries in one process share no state, `definitions()` is a snapshot, the scope stack refuses to underflow, and a definition carries the scope and the definition site current when registered                                                                                                                              |
| `packages/vitest/test/Runner.test.ts`                  | BEH-EC-001, BEH-EC-002             | `emitFeature`: one block per Feature containing one test per Scenario titled with its interpolated Pickle name, a Rule's Scenarios nested inside a block named after the Rule, Feature-level Scenarios before the Rules, each test's thunk wired to its own Scenario, and one always-passing node per unused step definition, last                                 |
| `packages/vitest/test/ScenarioEffect.test.ts`          | BEH-EC-003, BEH-EC-005             | `buildScenarioEffect`: a Background step leads and the Scenario's own follow in document order, a failing step provably stops the ones after it, an unresolved step fails in position, and the Layer is built once per Scenario and afresh on every execution                                                                                                      |
| `packages/vitest/test/Step.test.ts`                    | BEH-EC-003                         | The `Effect.fn(stepText)` auto-wrap: an already-wrapped step passes through BY IDENTITY, a bare generator is wrapped and takes the step text as its span name, and a failure inside a wrapped step keeps that span                                                                                                                                                 |
| `packages/vitest/test/describeFeature.test.ts`         | BEH-EC-002, BEH-EC-004             | Collection through `collectFeature`: one registry per call, the container a step was registered inside (ADR-EC-017), the define callback's synchrony, the definition site recorded end to end, both Layer forms normalising to one Layer with `perScenario` winning a collision, and the plan carried on the collection                                            |
| `packages/vitest/test/emission.test.ts`                | BEH-EC-001, BEH-EC-004, BEH-EC-013 | **The only file that calls `describeFeature` for real** — a parsed `.feature` source drives running tests: one per Scenario, nested under a block named after the Feature, each having run the Background step first and each against its own Layer build; plus the unused-pattern warning reaching the terminal exactly once, and `collectFeature` staying silent |

`packages/vitest/test/tsgo-gate/` is deliberately absent from the table above,
and its absence is not drift. Those files are **compile-gate fixtures**, not
vitest suites: most of them are meant not to compile, they are excluded from
`packages/vitest/tsconfig.test.json` for exactly that reason, and vitest never
collects them. They are asserted by `scripts/verify-tsgo-gate.sh`, which
compiles each one against its own isolated `tsconfig` and checks the exit code
plus the diagnostic name — that script, not this table, is where INV-EC-003's
enforcement is traced (§2).

## §5 Acceptance scenario traceability

Empty — no acceptance suite exists yet. The `.feature` files under
`packages/gherkin/test/fixtures/` are parser fixtures, not acceptance
scenarios: none carries a `@REQ-EC-NNN` tag, so nothing joins the chain here.
Each row will map a `@REQ-EC-NNN` tag to the `.feature` file carrying it and
the behavior(s) it verifies, once the acceptance suite exists.

## §6 Coverage targets

| Scope                  | Statements   | Branches     | Enforced by                                           |
| ---------------------- | ------------ | ------------ | ----------------------------------------------------- |
| `packages/vitest/src`  | 90% (target) | 90% (target) | Not yet wired — planned `vitest.config.ts` thresholds |
| `packages/gherkin/src` | 90% (target) | 90% (target) | Not yet wired — planned `vitest.config.ts` thresholds |

Targets are stated now so the eventual `vitest.config.ts` has a number to
enforce; until it exists, nothing here is actually gated.
