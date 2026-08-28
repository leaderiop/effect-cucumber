/**
 * Public entry point for `@effect-cucumber/gherkin`.
 *
 * The package does two things. It turns a `.feature` file into a `ParsedFeature`:
 * `loadFeature(path)` reads and parses one off disk, `parseFeature(source, uri)` does the same for
 * text that is already in hand — a Vite `.feature?raw` import, an inline template literal,
 * anything. Both are synchronous and both throw a `LoadFeatureError` on a fatal problem. And it
 * owns custom parameter types as DATA and matches step text against registered patterns.
 *
 * Those two halves meet at one seam, and it is worth stating once here rather than leaving it to
 * be reassembled from three module doc comments. `defineParameterType` is called at MODULE SCOPE
 * and touches no registry at all — it appends a record. Every `loadFeature` call then replays the
 * recorded definitions into a FRESH `ParameterTypeRegistry` and hands it back on
 * `ParsedFeature.parameterTypes`. That registry is what `createStepMatcher` is handed. Because it
 * is per-call, a `CucumberExpression` compiled against one feature's registry is never valid
 * against another's — ADR-EC-007's second correction, and the reason no registry here is ever a
 * process-wide singleton.
 *
 * This is a single barrel and there is no subpath export. A subpath has to be added to BOTH
 * `exports` and `publishConfig.exports` in `package.json` or it resolves locally and 404s for
 * consumers, so one entry point is the shape that cannot drift.
 *
 * `Parser`, `Pickles`, `Correlate`, `Source` and `Validate` are deliberately NOT exported. They
 * are pipeline stages with no standalone contract; the package's own tests import them by
 * relative path.
 *
 * The third-party types below are re-exported because the contract surfaces them:
 * `ParsedFeature.document` and `ParsedFeature.pickles` are typed with `@cucumber/messages` types,
 * and `ParsedFeature.parameterTypes` with `@cucumber/cucumber-expressions`' registry. Without the
 * re-export a consumer reading any of the three would be forced to declare those packages
 * themselves.
 */

export { loadFeature, parseFeature } from "./loadFeature.ts"

export { LoadFeatureError } from "./Errors.ts"
export type { LoadFeatureErrorReason, LoadFeatureWarning, LoadFeatureWarningReason } from "./Errors.ts"

/** The `LoadFeatureOptions` argument both entry points accept. */
export type { LoadFeatureOptions } from "./loadFeature.ts"

/** Custom parameter types, as data: define them at module scope, replayed per `loadFeature` call. */
export {
  buildParameterTypeRegistry,
  builtInParameterTypeNames,
  createParameterTypeStore,
  defaultParameterTypeStore,
  defineParameterType
} from "./ParameterTypes.ts"
export type { ParameterTypeDefinition, ParameterTypeStore } from "./ParameterTypes.ts"

/** Step matching: compile patterns against a registry and find EVERY entry matching a step text. */
export { compileExpression, createStepMatcher } from "./StepMatcher.ts"
export type { StepMatch, StepMatcher, StepPatternEntry } from "./StepMatcher.ts"

/** The compile-time counterpart of `StepMatch.args`, resolved from a pattern string literal. */
export type { BuiltInParameterTypeMap, StepArgs } from "./StepArgs.ts"

/** The failure channel for a rejected parameter type definition or an unusable step pattern. */
export { StepPatternError } from "./Errors.ts"
export type { StepPatternErrorReason } from "./Errors.ts"

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

/**
 * Internal build-graph exports, not public API.
 *
 * `packages/vitest/src/index.ts` reads `Gherkin.packageName` and `Gherkin.PackageName` so that
 * the cross-package project reference is exercised by `tsc -b`. Removing either one fails the
 * CI `types` job. Phase 5 owns that file and will retire both when it lands a real surface.
 */
export const packageName = "@effect-cucumber/gherkin" as const

export type PackageName = typeof packageName
