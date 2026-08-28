/**
 * Public entry point for `@effect-cucumber/gherkin`.
 *
 * The package turns a `.feature` file into a `ParsedFeature`: `loadFeature(path)` reads and
 * parses one off disk, `parseFeature(source, uri)` does the same for text that is already in
 * hand — a Vite `.feature?raw` import, an inline template literal, anything. Both are
 * synchronous and both throw a `LoadFeatureError` on a fatal problem.
 *
 * This is a single barrel and there is no subpath export. A subpath has to be added to BOTH
 * `exports` and `publishConfig.exports` in `package.json` or it resolves locally and 404s for
 * consumers, so one entry point is the shape that cannot drift.
 *
 * `Parser`, `Pickles`, `Correlate`, `Source` and `Validate` are deliberately NOT exported. They
 * are pipeline stages with no standalone contract; the package's own tests import them by
 * relative path.
 *
 * The `@cucumber/messages` types below are re-exported because `ParsedFeature.document` and
 * `ParsedFeature.pickles` are typed with them. Without the re-export a consumer reading either
 * escape hatch would be forced to declare `@cucumber/messages` themselves.
 */

export { loadFeature, parseFeature } from "./loadFeature.ts"

export { LoadFeatureError } from "./Errors.ts"
export type { LoadFeatureErrorReason, LoadFeatureWarning, LoadFeatureWarningReason } from "./Errors.ts"

export type {
  GherkinDocument,
  Location,
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
