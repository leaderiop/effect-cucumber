/**
 * The composition root of `@effect-cucumber/gherkin`: Source, Parser, Pickles, Correlate, Validate, in that order.
 *
 * Two entry points, not alternatives: `parseFeature(source, uri)` is the filesystem-free core (what a `?raw`
 * import feeds) and `loadFeature(path)` composes it with `Source.ts`. Both are Effects (ADR-EC-021) requiring
 * `ParameterTypeStore` (ADR-EC-023), `loadFeature` also `FileSystem.FileSystem`; a caller provides both Layers.
 * `Effect.runSync` cannot run `loadFeature`: `NodeFileSystem.readFileString` suspends and `runSync` throws
 * `AsyncFiberError` (`test/loadFeature.test.ts`), so a Feature file awaits `Effect.runPromise` at top level.
 *
 * Every fatal problem fails the Effect with `LoadFeatureError | StepPatternError`; warnings arrive on
 * `ParsedFeature.warnings`. One uuid id generator is built per call and shared by `AstBuilder` and `compile`
 * (`test/upstream-pin.test.ts`: separate or counter-based generators collide), so node ids are stable only within
 * one `ParsedFeature` — never persist or compare them across calls. One `ParameterTypeRegistry` is obtained EAGERLY
 * per call from the provided store, by calling `buildRegistry()` — BEH-EC-015 requires a store carrying custom
 * parameter types to build fresh every call, and `ParameterTypeStore.layer(...)`/`createParameterTypeStore()`
 * still do; `ParameterTypeStore.layerDefault`'s zero-customization case instead returns one process-wide shared
 * registry (ADR-EC-045), which is what lets Feature files with no custom parameter types share `StepMatcher.ts`'s
 * compiled-expression cache. Markdown feature files are out of scope.
 */
import { IdGenerator } from "@cucumber/messages"
import * as Effect from "effect/Effect"
import { correlateFeature } from "./Correlate.ts"
import { LoadFeatureError, StepPatternError } from "./Errors.ts"
import type { ParsedFeature } from "./Model.ts"
import { ParameterTypeStore } from "./ParameterTypes.ts"
import { parseDocument } from "./Parser.ts"
import { compilePickles } from "./Pickles.ts"
import { readFeatureSource } from "./Source.ts"
import { validateFeature } from "./Validate.ts"

/**
 * Parse feature-file text. `uri` is the caller's, named by every message. Fails with `LoadFeatureError` for a
 * fatal problem or `StepPatternError` when the store rejects a custom type at replay; anything else the
 * synchronous pipeline throws is a DEFECT, never relabelled `ParseFailed` (`test/loadFeature.test.ts`) —
 * `Effect.try`'s `catch` rethrows anything it doesn't recognize, which Effect treats as a defect rather than a
 * typed failure. `ParameterTypeStore` is required, not defaulted: an internal default could not be overridden by
 * `Effect.provide`.
 */
export const parseFeature = Effect.fn("parseFeature")(function*(source: string, uri: string) {
  const store = yield* ParameterTypeStore
  return yield* Effect.try({
    try: (): ParsedFeature => {
      const newId = IdGenerator.uuid()
      const document = parseDocument(source, uri, newId)
      const pickles = compilePickles(document, uri, newId)
      const correlated = correlateFeature(document, pickles, uri)
      return {
        ...correlated.feature,
        warnings: validateFeature(correlated),
        parameterTypes: store.buildRegistry()
      }
    },
    catch: (thrown): LoadFeatureError | StepPatternError => {
      if (thrown instanceof LoadFeatureError || thrown instanceof StepPatternError) return thrown
      throw thrown
    }
  })
})

/**
 * Read a `.feature` file and parse it. The path is the `uri`. A filesystem failure fails with `MissingFile`,
 * `PermissionDenied` or `ReadFailed` (`Source.ts`); everything after composes with `parseFeature`.
 */
export const loadFeature = Effect.fn("loadFeature")(function*(path: string) {
  const source = yield* readFeatureSource(path)
  return yield* parseFeature(source, path)
})
