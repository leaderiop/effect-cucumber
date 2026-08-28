/**
 * Public entry point for `@effect-cucumber/gherkin`.
 *
 * The package does three things. It turns a `.feature` file into a `ParsedFeature`:
 * `loadFeature(path)` reads and parses one off disk, `parseFeature(source, uri)` does the same for
 * text that is already in hand — a Vite `.feature?raw` import, an inline template literal,
 * anything.
 * ([ADR-EC-021](../../../spec/decisions/021-effect-and-platform-are-peer-dependencies-of-gherkin.md)
 * supersedes the earlier "both are synchronous, both throw" contract.) `parseFeature` returns
 * `Effect<ParsedFeature, LoadFeatureError | StepPatternError, ParameterTypeStore>`. `loadFeature`
 * returns `Effect<ParsedFeature, LoadFeatureError | StepPatternError, FileSystem.FileSystem |
 * ParameterTypeStore>`: reading through `effect`'s own `FileSystem` service, and resolving the
 * current parameter-type store as an ambient `ParameterTypeStore` service
 * ([ADR-EC-023](../../../spec/decisions/023-parametertypestore-becomes-an-ambient-context-service.md)),
 * means a caller must `Effect.provide` a concrete `FileSystem` Layer (e.g. `@effect/platform-node`'s
 * `NodeFileSystem.layer`) AND a `ParameterTypeStore` Layer (`ParameterTypeStore.Default` for the
 * standard, process-wide store) before running either function's result. `Effect.runSync` no
 * longer recovers the old synchronous call shape for `loadFeature` — the real `NodeFileSystem`
 * implementation suspends internally, confirmed by reproduction, not assumed; see
 * `loadFeature.ts`'s and `Source.ts`'s doc comments for the full trade-off and
 * `test/loadFeature.test.ts` for how a module-top-level caller adapts (`await`, not `runSync`).
 * And the package owns custom parameter types as DATA and matches step text against registered
 * patterns.
 *
 * The third thing is Phase 4's: it turns a step's DocString and DataTable arguments into typed
 * values. `ParsedStep.stepArguments` carries them wrapped and in source order, a `DataTable` there
 * answers `raw()`/`hashes()`/`rowsHash()` — this package's OWN wrapper, because those accessors
 * live in `@cucumber/cucumber` and ADR-EC-011 keeps that runner out of this dependency graph — and
 * `decodeHashes(rowSchema)` decodes a table's body rows through `Schema`, naming the offending row
 * and column when one of them fails rather than reporting an index into a value the step author
 * never constructed.
 *
 * Those first two halves meet at one seam, and it is worth stating once here rather than leaving it to
 * be reassembled from three module doc comments. `defineParameterType` is called at MODULE SCOPE,
 * stays plain and `Effect`-free by design, and touches no registry at all — it appends a record
 * to `defaultParameterTypeStore`, the same singleton `ParameterTypeStore.Default` wraps. Every
 * `loadFeature` call then replays the recorded definitions into a FRESH `ParameterTypeRegistry`
 * and hands it back on `ParsedFeature.parameterTypes`. That registry is what `createStepMatcher`
 * is handed. Because it is per-call, a `CucumberExpression` compiled against one feature's
 * registry is never valid against another's — ADR-EC-007's second correction, and the reason no
 * registry here is ever a process-wide singleton (the STORE is a process-wide singleton by
 * default; the REGISTRY it builds never is).
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

/**
 * Custom parameter types, as data: define them at module scope, replayed per `loadFeature` call.
 * `ParameterTypeStore` is a real `Context.Service` now (ADR-EC-023) — a value export, not just a
 * type, since consumers need `ParameterTypeStore.Default`/`.layerOf(...)` at runtime, not only
 * its type for annotations.
 */
export {
  buildParameterTypeRegistry,
  builtInParameterTypeNames,
  createParameterTypeStore,
  defaultParameterTypeStore,
  defineParameterType,
  ParameterTypeStore
} from "./ParameterTypes.ts"
export type { ParameterTypeDefinition, ParameterTypeStoreShape } from "./ParameterTypes.ts"

/** Step matching: compile patterns against a registry and find EVERY entry matching a step text. */
export { compileExpression, createStepMatcher } from "./StepMatcher.ts"
export type { StepMatch, StepMatcher, StepPatternEntry } from "./StepMatcher.ts"

/** The compile-time counterpart of `StepMatch.args`, resolved from a pattern string literal. */
export type { BuiltInParameterTypeMap, StepArgs } from "./StepArgs.ts"

/**
 * Data tables. `.raw()`, `.hashes()` and `.rowsHash()` are this package's OWN wrapper rather than a
 * re-export: a `PickleTable` is plain data with no methods on it, and the accessors every Cucumber
 * user expects live in `@cucumber/cucumber`, the full runner, which ADR-EC-011 keeps out of this
 * dependency graph. The two fallible ones return an `Effect` and fail loudly where
 * `@cucumber/cucumber` lets the last cell win.
 *
 * `decodeHashes` is ADR-EC-008's decode-through-`Schema` path: it takes a ROW schema, wraps it
 * itself, and names the row and the column on failure instead of an array index into a value the
 * step author never wrote.
 */
export { decodeHashes, makeDataTable } from "./DataTable.ts"
export type { DataTable } from "./DataTable.ts"

/**
 * Step arguments. A step's DocString and DataTable arrive on `ParsedStep.stepArguments` already
 * wrapped and already ordered — ascending by the `argumentIndex` `@cucumber/gherkin` recorded, so
 * the order is the one the step's author wrote in the `.feature` file, not a fixed convention this
 * package chose. `stepArgumentsOf` is that rule, exported for a consumer building a `ParsedStep`
 * by hand; correlation applies it for every step already.
 */
export { stepArgumentsOf } from "./StepArguments.ts"
export type { DocString, StepArgument } from "./StepArguments.ts"

/**
 * The failure channel for a rejected parameter type definition or an unusable step pattern, and the
 * third one: a data table whose SHAPE is wrong (a repeated header column, a `rowsHash()` over a
 * table that is not two columns wide, a duplicate row key) or whose rows fail to decode against the
 * schema a step author supplied.
 */
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

/**
 * Internal build-graph exports, not public API.
 *
 * `packages/vitest/src/index.ts` reads `Gherkin.packageName` and `Gherkin.PackageName` so that
 * the cross-package project reference is exercised by `tsc -b`. Removing either one fails the
 * CI `types` job. Phase 5 owns that file and will retire both when it lands a real surface.
 */
export const packageName = "@effect-cucumber/gherkin" as const

export type PackageName = typeof packageName
