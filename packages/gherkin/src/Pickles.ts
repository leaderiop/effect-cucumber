/**
 * Compiling a parsed `GherkinDocument` into pickles — placeholder-substituted, Background-stacked, tag-flattened.
 * Everything upstream's `compile` returns passes through untouched; `Validate.ts` judges the correlated result,
 * and a filter here would delete its evidence. `newId` must be the SAME generator the document was parsed with
 * (independent generators collide, `test/upstream-pin.test.ts`).
 */
import { compile } from "@cucumber/gherkin"
import type { GherkinDocument, IdGenerator, Pickle } from "@cucumber/messages"
import * as Option from "effect/Option"
import { LoadFeatureError } from "./Errors.ts"

/**
 * Compile every executable Scenario of `document` into a pickle.
 *
 * A Scenario Outline yields one pickle per Examples body row. A `compile` failure leaves this
 * function as a `LoadFeatureError` with reason `ParseFailed`; no upstream exception escapes.
 */
export const compilePickles = (
  document: GherkinDocument,
  uri: string,
  newId: IdGenerator.NewId
): ReadonlyArray<Pickle> => {
  try {
    return compile(document, uri, newId)
  } catch (thrown) {
    throw new LoadFeatureError({
      reason: "ParseFailed",
      uri,
      line: Option.none(),
      message: `Failed to compile pickles for ${uri}: ${thrown instanceof Error ? thrown.message : String(thrown)}`,
      cause: thrown
    })
  }
}
