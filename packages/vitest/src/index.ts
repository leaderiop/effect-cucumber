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
 * **Current state.** `describeFeature` collects step definitions and normalises the Layer; it emits
 * ZERO vitest tests. Test emission is Phase 6's (`spec/roadmap.md` is the single place that says
 * what is actually built). The type surface below is final; the runtime is not yet wired to vitest.
 *
 * ## Export policy
 *
 * This is a SINGLE barrel and there is no subpath export. A subpath has to be added to BOTH
 * `exports` and `publishConfig.exports` in `package.json` or it resolves locally and 404s for
 * consumers, so one entry point is the shape that cannot drift.
 *
 * ## Deliberately NOT exported
 *
 * `createRegistry` (and its `Registry`/`StepDefinition` types), `register` from `Step.ts`, and
 * `collectFeature` from `describeFeature.ts`. All three are internal stages of `describeFeature`
 * with no standalone consumer contract, following `@effect-cucumber/gherkin`'s own precedent, where
 * `Parser`, `Pickles`, `Correlate`, `Source` and `Validate` are internal and only `loadFeature` is
 * published. This package's tests import them by relative path.
 *
 * `collectFeature` in particular is Phase 6's in-package join point, reached by relative import and
 * not a published surface: RUN-01 reads a `FeatureCollection` and emits `it.effect` from it.
 * Exporting it now would freeze the collection's shape into the package's contract before the one
 * consumer it exists for has used it once.
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
 */
export type { BackgroundDsl, FeatureDsl, ScenarioDsl, StepRegistrar } from "./Dsl.ts"
