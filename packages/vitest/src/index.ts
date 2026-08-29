/**
 * Public entry point for `@effect-cucumber/vitest`.
 *
 * The package runs a `.feature` file as vitest tests where every step is an `Effect`. A test author
 * calls `describeFeature(feature, layer, define)` with a `ParsedFeature` from
 * `@effect-cucumber/gherkin`, the ambient `Layer` the Feature's steps run against, and a callback
 * that registers step definitions through the `Given`/`When`/`Then`/`And`/`But` registrars and the
 * `Background`/`Scenario` containers.
 *
 * `layer` takes either of two forms
 * ([ADR-EC-006](../../../spec/decisions/006-two-layer-scopes-only.md)): a plain `Layer`, which is the
 * per-Scenario scope and is rebuilt fresh for every Scenario, or `{ shared, perScenario }`, where
 * `shared` is built once for the whole Feature. `perScenario` is required in the object form even
 * when there is no per-Scenario state — write `perScenario: Layer.empty`.
 *
 * Whichever form is used, the dsl handed to `define` is parameterised by exactly that Layer's output
 * type, so a step whose Effect requires a service the Layer does not provide is a type error where
 * the step is written rather than a runtime "service not found" discovered when the Scenario runs
 * ([ADR-EC-003](../../../spec/decisions/003-describefeature-takes-a-layer.md), INV-EC-003). That
 * check is the package's whole reason to exist, and
 * [ADR-EC-016](../../../spec/decisions/016-effect-tsgo-language-service-plugin.md)'s build gate is
 * what keeps it from decaying silently.
 *
 * **Current state.** `describeFeature` emits one `it.effect` per Scenario, nested inside a
 * `describe` named after the Feature and, where the document has `Rule`s, a further nested
 * `describe` per Rule. A Background's steps are the leading `yield*`s of the same Effect rather than
 * a separate hook, so they run first and the first failure ends the Scenario. A step whose text
 * matched no registered pattern visible to it, or more than one at the same scope level, fails ITS
 * OWN Scenario with a located `StepMatchError` and leaves every other Scenario runnable. A
 * registered pattern that matched no step anywhere in the Feature is a warning rather than a
 * failure, surfaced on three channels: `console.warn` at collection time, an always-passing test
 * node last in the block, and a structured list on the plan. All six hooks — `Before`, `After`,
 * `BeforeStep`, `AfterStep`, `BeforeAllScenarios`, `AfterAllScenarios` — are registered through the
 * Feature-level dsl: `Before` gates the Scenario's steps, and every `Before` in a batch runs
 * independently with their failures combined rather than the batch stopping at the first one; `After`
 * and `AfterStep` are guaranteed to run whether the thing they guard succeeded or failed, and never
 * mask its error; `BeforeAllScenarios` runs once per Feature and its failure reaches every Scenario;
 * `AfterAllScenarios` runs as a trailing node regardless of what failed before it.
 *
 * What is NOT built yet, with `spec/roadmap.md` as the single authority on build status: a `Rule`
 * that extends the ambient Layer with its own per-Scenario Layer, and typed `Scenario Outline`
 * Examples, are Phase 8 (DSL-05, DSL-06) — a Rule's Scenarios run today and are nested correctly, but
 * nothing can REGISTER at Rule scope; tag routing, `@skip` and the `@only` policy are Phase 9
 * (RUN-05), so a tag is currently inert; and the opt-in `shared` Layer built once per Feature,
 * together with the per-Scenario `TestClock` isolation that has to accompany it, is Phase 10
 * (RUN-03, RUN-04) — the `{ shared, perScenario }` argument form is accepted and type-checked today,
 * but both halves are built per Scenario at runtime.
 *
 * ## Export policy
 *
 * This is a SINGLE barrel and there is no subpath export. A subpath has to be added to BOTH
 * `exports` and `publishConfig.exports` in `package.json` or it resolves locally and 404s for
 * consumers, so one entry point is the shape that cannot drift.
 *
 * ## Deliberately NOT exported
 *
 * `createRegistry` (and its `Registry`/`StepDefinition` types), `register` from `Step.ts`,
 * `captureCallSite` from `CallSite.ts`, `planFeature` from `Plan.ts`, `buildScenarioEffect` from
 * `ScenarioEffect.ts`, `emitFeature` from `Runner.ts`, the `TestApi` seam they reach the framework
 * through, and `collectFeature` from `describeFeature.ts`. Every one of them is an internal stage of
 * `describeFeature` with no standalone consumer contract, following `@effect-cucumber/gherkin`'s own
 * precedent, where `Parser`, `Pickles`, `Correlate`, `Source` and `Validate` are internal and only
 * `loadFeature` is published. This package's tests import them by relative path.
 *
 * The same is true of `registerHook`, `groupHooks` and `runHookBatch` from `Hook.ts`, `HookSet` and
 * `HookBody` (also `Hook.ts` — `HookSet` appears in `FeatureCollection`, which is itself not
 * exported), and `createHookRegistry` (with its `HookKind`/`HookDefinition`/`HookRegistryShape`
 * types) from `HookRegistry.ts`. Each is an internal stage of `describeFeature` with no standalone
 * consumer contract, exactly like the modules above it in this list.
 *
 * The omission is a decision, not an oversight, and the cost of getting it wrong is asymmetric: a
 * published internal stage is a contract this project then has to keep, through every change to the
 * pipeline it is a stage of. `collectFeature` is the sharpest case — it is the in-package join point
 * a test asserts a `FeatureCollection` against, and exporting it would freeze that collection's
 * shape, `plan` field included, into the package's contract. `TestApi` is the next sharpest: Phase
 * 10 (RUN-03/RUN-04) changes which implementation flows through it, and a consumer never constructs
 * one.
 */

/** The entry point. Everything else in this package is reached through the dsl it hands `define`. */
export { describeFeature } from "./describeFeature.ts"

/**
 * The compile-time surface `define` receives, exported for annotation.
 *
 * A consumer needs these to write a define callback as a named function rather than inline — the
 * `ROut` type argument is the ambient Layer's output. `BackgroundDsl` is `Given`/`And` only, which
 * is the real Gherkin grammar and not an oversight
 * ([ADR-EC-017](../../../spec/decisions/017-background-and-scenario-are-step-definition-containers.md)).
 * `HookRegistrar` is what a consumer annotates a hook body with when it is written as a named
 * function rather than inline — the same reason `StepRegistrar` is exported for a step.
 */
export type { BackgroundDsl, FeatureDsl, HookRegistrar, ScenarioDsl, StepRegistrar } from "./Dsl.ts"

/**
 * The two channels step drift reaches a consumer through (BEH-EC-013, ADR-EC-019).
 *
 * `StepMatchError` is the FAILURE: a Pickle step whose text resolved to zero registered patterns
 * (MATCH-03) or to more than one at the same scope level (MATCH-04). It arrives in a failing
 * Scenario's error channel, which is a value a consumer catches and narrows on `reason` — so the
 * class has to be reachable by name, and matching on message text instead is the thing this export
 * exists to make unnecessary.
 *
 * `UnusedStepDefinitionWarning` is NOT a failure and never enters an error channel: a registered
 * pattern that matched no step in the whole Feature is dead code, not a broken Scenario (MATCH-05,
 * same ADR). It is exported specifically so 06-CONTEXT.md D-02's channel 3 — the structured list —
 * is inspectable and assertable by a consumer, rather than only readable as terminal text or as a
 * test node's title. `@effect-cucumber/gherkin`'s barrel exports `LoadFeatureWarning` alongside
 * `LoadFeatureError` for the same reason, and this mirrors it.
 *
 * The two `*Reason` unions come with them: they are the discriminants a consumer branches on, and a
 * `reason` field whose type is unnameable forces a string comparison at every call site.
 */
export { StepMatchError } from "./Errors.ts"
export type { StepMatchErrorReason, UnusedStepDefinitionWarning, UnusedStepDefinitionWarningReason } from "./Errors.ts"
