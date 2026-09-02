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
 * one `ParsedFeature` — never persist or compare them across calls. One `ParameterTypeRegistry` is built EAGERLY
 * per call from the provided store (freshness is MATCH-02's requirement). Markdown feature files are out of scope.
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
 * synchronous pipeline throws is a DEFECT (`Effect.die`), never relabelled `ParseFailed`
 * (`test/loadFeature.test.ts`). `ParameterTypeStore` is required, not defaulted: an internal default could not
 * be overridden by `Effect.provide`.
 */
export const parseFeature = Effect.fn("parseFeature")(function*(source: string, uri: string) {
  const store = yield* ParameterTypeStore
  return yield* Effect.suspend((): Effect.Effect<ParsedFeature, LoadFeatureError | StepPatternError> => {
    try {
      const newId = IdGenerator.uuid()
      const document = parseDocument(source, uri, newId)
      const pickles = compilePickles(document, uri, newId)
      const correlated = correlateFeature(document, pickles, uri)
      return Effect.succeed({
        ...correlated.feature,
        warnings: validateFeature(correlated),
        parameterTypes: store.buildRegistry()
      })
    } catch (thrown) {
      return thrown instanceof LoadFeatureError || thrown instanceof StepPatternError
        ? Effect.fail(thrown)
        : Effect.die(thrown)
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
