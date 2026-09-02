/**
 * Public entry point for `@effect-cucumber/gherkin`. `loadFeature(path)` and `parseFeature(source, uri)` turn a
 * `.feature` file into a `ParsedFeature`; both are Effects requiring `ParameterTypeStore` (ADR-EC-023), the first
 * also `FileSystem.FileSystem`, so a caller provides both Layers and runs with `Effect.runPromise`. Custom
 * parameter types are DATA declared through `ParameterTypeStore.layer([...])` and replayed per call into the fresh
 * registry on `ParsedFeature.parameterTypes`, which `createStepMatcher` takes; there is no process-wide store.
 * `ParsedStep.stepArguments` carries a step's DocString and DataTable wrapped and in source order, and
 * `decodeHashes` decodes table rows through `Schema` (ADR-EC-008).
 *
 * A single barrel, no subpath export. `Parser`, `Pickles`, `Correlate`, `Source` and `Validate` are pipeline
 * stages and are not exported. The third-party types below are re-exported because `document`, `pickles` and
 * `parameterTypes` surface them.
 */

export { loadFeature, parseFeature } from "./loadFeature.ts"

export { LoadFeatureError } from "./Errors.ts"
export type { LoadFeatureErrorReason, LoadFeatureWarning, LoadFeatureWarningReason } from "./Errors.ts"

/** Custom parameter types, as data; `ParameterTypeStore` is a real `Context.Service` (ADR-EC-023). */
export { builtInParameterTypeNames, createParameterTypeStore, ParameterTypeStore } from "./ParameterTypes.ts"
export type { ParameterTypeDefinition, ParameterTypeStoreShape } from "./ParameterTypes.ts"

/** Step matching: compile patterns against a registry and find EVERY entry matching a step text. */
export { compileExpression, createStepMatcher } from "./StepMatcher.ts"
export type { StepMatch, StepMatcher, StepPatternEntry } from "./StepMatcher.ts"

/** The suggested definition an undefined-step error carries (BEH-EC-013). Exported because its caller is
 * `@effect-cucumber/vitest`, which cannot reach `@cucumber/cucumber-expressions` itself. */
export { generateStepSnippet } from "./Snippet.ts"

/** The compile-time counterpart of `StepMatch.args`, resolved from a pattern string literal. */
export type { BuiltInParameterTypeMap, StepArgs } from "./StepArgs.ts"

/** Data tables: this package's OWN accessors (the upstream ones live in the runner ADR-EC-011 excludes), and
 * `decodeHashes` (ADR-EC-008). */
export { decodeHashes, makeDataTable } from "./DataTable.ts"
export type { DataTable } from "./DataTable.ts"

/** Step arguments, wrapped and ordered by `argumentIndex`; `stepArgumentsOf` is that rule, exported. */
export { stepArgumentsOf } from "./StepArguments.ts"
export type { DocString, StepArgument } from "./StepArguments.ts"

/** The failure channels for a rejected parameter type or step pattern, and for a data table. */
export { StepPatternError } from "./Errors.ts"
export type { StepPatternErrorReason } from "./Errors.ts"

export { DataTableError } from "./Errors.ts"
export type { DataTableErrorReason } from "./Errors.ts"

export type {
  GherkinDocument,
  Location,
  ParameterTypeRegistry,
  ParsedFeature,
  ParsedFeatureCore,
  ParsedRule,
  ParsedScenario,
  ParsedStep,
  Pickle,
  PickleStep,
  PickleStepArgument,
  StepKeywordType,
  StepOwner
} from "./Model.ts"
