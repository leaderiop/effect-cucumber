/**
 * Public entry point of `@effect-cucumber/vitest`: `describeFeature`, `loadFeature`, `defineSteps`,
 * `gherkinTags`, `Testing`, the dsl types, and the error/warning types. One barrel, no subpath
 * exports; its rows are gate-checked against `spec/overview.md` by `scripts/verify-api-surface.sh`.
 *
 * Deliberately NOT exported (internal stages of `describeFeature` with no consumer contract):
 * `Registry.ts`, `Step.ts`, `CallSite.ts`, `Plan.ts`, `ScenarioEffect.ts`, `Runner.ts`, `Hook.ts`,
 * `HookRegistry.ts`, `Tags.ts`, `TestApi.ts`, `Collect.ts`, `VitestTestApi.ts`, `OutlineTitle.ts`,
 * `ScenarioKey.ts`. Tests import them by relative path.
 */

export { describeFeature } from "./describeFeature.ts"

/**
 * Read and parse a `.feature` file at module top level (ADR-EC-024, BEH-EC-001).
 */
export {
  createParameterTypeStore,
  DataTableError,
  decodeHashes,
  LoadFeatureError,
  ParameterTypeStore,
  StepPatternError
} from "@effect-cucumber/gherkin"
export type { DataTable, DocString, ParameterTypeDefinition, ParsedFeature, StepArgs } from "@effect-cucumber/gherkin"
export { loadFeature } from "./loadFeature.ts"

/**
 * The optional fourth argument's type, exported for annotation.
 */
export type { DescribeFeatureOptions } from "./describeFeature.ts"

export { gherkinTags } from "./GherkinTags.ts"
export type { GherkinTagDefinition, GherkinTagsOptions } from "./GherkinTags.ts"

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
  StepRegistrar
} from "./Dsl.ts"

/**
 * Cross-Feature step reuse (ADR-EC-027, BEH-EC-019).
 */
export { defineSteps } from "./StepModule.ts"
export type { StepModule } from "./StepModule.ts"

/**
 * The two channels step drift reaches a consumer through (BEH-EC-013, ADR-EC-019).
 */
export { StepMatchError } from "./Errors.ts"
export type {
  ExcludedScenariosNotice,
  ExcludedScenariosNoticeReason,
  StepMatchErrorReason,
  UndeclaredTagWarning,
  UndeclaredTagWarningReason,
  UnknownContainerWarning,
  UnknownContainerWarningReason,
  UnusedStepDefinitionWarning,
  UnusedStepDefinitionWarningReason
} from "./Errors.ts"

/**
 * Standalone test-authoring helpers, called directly inside a step body rather than through the
 * DSL: `Testing.failureTag` and `Testing.settleThroughClock` (ADR-EC-028, ADR-EC-029, BEH-EC-020,
 * BEH-EC-021).
 */
export * as Testing from "./Testing.ts"
