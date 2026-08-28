/**
 * Compiling a parsed `GherkinDocument` into pickles — the executable, placeholder-substituted,
 * Background-stacked, tag-flattened form of each Scenario.
 *
 * A single function on purpose. Everything upstream's `compile` returns is passed through
 * untouched: no filtering, no sorting, no deduplication, no re-derivation. Every
 * silently-zero and silently-wrong case that `compile` is known to produce is detected in
 * `Validate.ts`, over the correlated result, where the AST is available to explain WHY. A
 * filter here would delete the evidence those checks depend on.
 *
 * `newId` is a parameter and is never constructed inside this module. It must be the SAME
 * generator the document was parsed with (decision D3): `AstBuilder` and `compile` sharing one
 * generator is what keeps AST node ids and pickle ids in one namespace. Independent generators
 * are verified to produce `scenario.id === "1"` and `pickle.id === "1"` in the same document.
 *
 * Keeping this to one function with two imports also keeps `import/no-cycle` and
 * `pnpm circular` trivially satisfied.
 */
import { compile } from "@cucumber/gherkin"
import type { GherkinDocument, IdGenerator, Pickle } from "@cucumber/messages"
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
      message: `Failed to compile pickles for ${uri}: ${thrown instanceof Error ? thrown.message : String(thrown)}`,
      cause: thrown
    })
  }
}
