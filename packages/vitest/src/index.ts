/**
 * Public entry point of `@effect-cucumber/vitest`: `describeFeature`, `collectFeature`,
 * `assertNoUnusedStepDefinitions`, `loadFeature`, `defineSteps`, `gherkinTags`, `Testing`,
 * `Attachments`/`attach`, the dsl types, the error/warning types, and `@effect/vitest`'s own
 * surface (`it`, `layer`, `assert`, `flakyTest`, etc., plus vitest's own re-exports), re-exported via
 * `EffectVitest.ts` (ADR-EC-059). One barrel, no subpath exports; its rows are gate-checked against
 * `spec/overview.md` by `scripts/verify-api-surface.sh`.
 *
 * Deliberately NOT exported (internal stages of `describeFeature` with no consumer contract):
 * `Registry.ts`, `Step.ts`, `CallSite.ts`, `Plan.ts`, `ScenarioEffect.ts`, `Runner.ts`, `Hook.ts`,
 * `HookRegistry.ts`, `HookTagExpression.ts`, `Tags.ts`, `TestApi.ts`, `Collect.ts`, `VitestTestApi.ts`,
 * `OutlineTitle.ts`, `ScenarioKey.ts`, `RerunKey.ts`, `RerunManifest.ts`, `VitestTagsFilter.ts`. Tests
 * import them by relative path.
 */

/**
 * `collectFeature`: register and plan a Feature without emitting anything — `describeFeature`
 * minus the Emit stage. Promoted to the public barrel (ADR-EC-053) specifically so
 * `assertNoUnusedStepDefinitions` below has a real, documented way to be handed something: its
 * whole design assumes a consumer calls `collectFeature()` themselves, across every Feature in
 * their suite, so the collector it feeds must be public API, not test-only-via-relative-import.
 */
export { collectFeature, describeFeature, MutuallyExclusiveTagFilterError } from "./describeFeature.ts"
export type { FeatureCollection } from "./describeFeature.ts"

/**
 * A `World.attach()` equivalent — attach evidence to the running Scenario from a step or a
 * per-Scenario hook (ADR-EC-036, BEH-EC-028). Compile-time-rejected from `BeforeAllScenarios`/
 * `AfterAllScenarios`.
 */
export { attach, Attachments } from "./Attachments.ts"
export type { AttachmentsShape } from "./Attachments.ts"

/**
 * Read and parse a `.feature` file at module top level (ADR-EC-024, BEH-EC-001).
 */
export {
  createParameterTypeStore,
  DataTableError,
  decodeDocString,
  decodeExamplesRow,
  decodeHashes,
  DocStringError,
  ExamplesRowError,
  LoadFeatureError,
  ParameterTypeStore,
  StepPatternError
} from "@effect-cucumber/gherkin"
export type {
  DataTable,
  DocString,
  DocStringErrorReason,
  ExamplesRow,
  ExamplesRowErrorReason,
  ParameterTypeDefinition,
  ParsedFeature,
  StepArgs
} from "@effect-cucumber/gherkin"
export { loadFeature } from "./loadFeature.ts"

/**
 * The optional fourth argument's type, exported for annotation.
 */
export type { DescribeFeatureOptions } from "./describeFeature.ts"

export { gherkinTags, InvalidGherkinTagsPatternError } from "./GherkinTags.ts"
export type { GherkinTagDefinition, GherkinTagsOptions } from "./GherkinTags.ts"

/**
 * A `.feature` file rerun trigger for watch mode (ADR-EC-030, BEH-EC-022).
 */
export { gherkinWatchTriggers, InvalidGherkinWatchTriggersPatternError } from "./GherkinWatchTriggers.ts"
export type { GherkinWatchTriggersOptions } from "./GherkinWatchTriggers.ts"

/**
 * The compile-time surface `define` receives, exported for annotation.
 */
export type {
  BackgroundDsl,
  FeatureDsl,
  HookRegistrar,
  ModuleStep,
  RuleDsl,
  RuleRegistrar,
  ScenarioDsl,
  ScenarioRegistrar,
  StepParams,
  StepRegistrar,
  TaggedHookRegistrar
} from "./Dsl.ts"

/**
 * Cross-Feature step reuse (ADR-EC-027, BEH-EC-019).
 */
export { defineSteps } from "./StepModule.ts"
export type { StepModule } from "./StepModule.ts"

/**
 * A Rule that narrows or replaces (not merely extends) the World its own Scenarios see
 * (ADR-EC-039, BEH-EC-031). Called from inside `RuleRegistrar`'s third-overload `narrow`
 * callback: `Rule(name, extraLayer, (dsl) => narrowRuleDsl(dsl, project), define)`.
 */
export { narrowRuleDsl, UnsupportedScenarioExtraLayerError } from "./RuleNarrowing.ts"
export type { WorldProjection } from "./RuleNarrowing.ts"

/**
 * The two channels step drift reaches a consumer through (BEH-EC-013, ADR-EC-019).
 */
export { StepMatchError } from "./Errors.ts"
export type {
  ExcludedScenariosNotice,
  ExcludedScenariosNoticeReason,
  StaleRerunManifestKeyWarning,
  StaleRerunManifestKeyWarningReason,
  StepMatchErrorReason,
  UndeclaredTagWarning,
  UndeclaredTagWarningReason,
  UnknownContainerWarning,
  UnknownContainerWarningReason,
  UnusedStepDefinitionWarning,
  UnusedStepDefinitionWarningReason
} from "./Errors.ts"

/**
 * The suite-wide half of strict mode (BEH-EC-013, ADR-EC-053): call once, across every
 * `collectFeature()` result in a suite, to throw naming every unused-step-definition warning's own
 * message. Independent of `DescribeFeatureOptions.strict`, the per-Feature half — a consumer may
 * use either, both, or neither.
 */
export { assertNoUnusedStepDefinitions, UnusedStepDefinitionsError } from "./StrictMode.ts"

/**
 * Standalone test-authoring helpers, called directly inside a step body rather than through the
 * DSL: `Testing.failureTag` and `Testing.settleThroughClock` (ADR-EC-028, ADR-EC-029, BEH-EC-020,
 * BEH-EC-021).
 */
export * as Testing from "./Testing.ts"

/**
 * `@effect-cucumber/vitest`'s own vendored `@effect/vitest` replacement (ADR-EC-059): `it`,
 * `layer`, `assert`, `flakyTest`, `describeWrapped`, `addEqualityTesters`, `makeMethods`, the
 * `Vitest` namespace types, and vitest's own re-exported surface (`describe`, `beforeAll`,
 * `afterAll`, `expect`, `vi`, …). Consumers use these instead of installing `@effect/vitest`
 * themselves — see `packages/vitest/README.md`'s installation section.
 */
export * from "./EffectVitest.ts"

/**
 * An optional, richer JUnit-XML reporter, adding Scenario tags and `attach()` output as
 * `<properties>`/`<system-out>` on top of what vitest's own built-in `--reporter=junit` already
 * provides for free (ADR-EC-060).
 */
export { GherkinJUnitReporter } from "./JUnitReporter.ts"
export type { GherkinJUnitReporterOptions } from "./JUnitReporter.ts"
