/**
 * The composition root of `@effect-cucumber/gherkin`: Source, then Parser, then Pickles, then
 * Correlate, then Validate. Every module below this one is a leaf or near-leaf; this is the only
 * file that knows the order they run in.
 *
 * Two entry points ship, and they are not alternatives. `parseFeature(source, uri)` is the
 * testable core and needs no filesystem — it is what a Vite `.feature?raw` import feeds, and a
 * `?raw` string is verified byte-identical to what `readFileSync` returns for the same file.
 * `loadFeature(path)` is a two-line wrapper over it and is the signature BEH-EC-001 specifies.
 * Dropping either one costs something real: path-only breaks the watch-mode-friendly consumer
 * path, source-only contradicts the normative signature.
 *
 * ## Synchronous, permanently
 *
 * `loadFeature` returns a `ParsedFeature` — a plain value, not a deferred one, and not an Effect.
 * This is a one-way door. `PITFALLS.md` rates the recovery cost HIGH (it is a public API break)
 * and marks the change "Never" in its technical-debt table, because a consumer writes
 * `const feature = loadFeature("x.feature")` at module top level, above every `describe`, where
 * there is nothing to yield to.
 *
 * ## Failures throw
 *
 * A function returning a plain value has exactly one in-signature failure mode, so every fatal
 * problem leaves here as a `LoadFeatureError`. That matches ARCHITECTURE.md Anti-Pattern 6
 * ("synchronous functions that throw typed error classes"), and it has a known consequence worth
 * stating rather than discovering: because the call site is module top level, a throw becomes a
 * vitest COLLECTION error for the whole file, not a single failing test. The whole file goes red
 * with one message and no per-Scenario detail.
 *
 * That is exactly why the validation messages are shaped `uri:line: Reason: what to do` — the one
 * message a collection error shows has to be enough on its own. Phase 6 may catch and re-route at
 * the `describeFeature` boundary, where per-Scenario reporting is available; that is a
 * presentation change at a different layer, not a change to this signature.
 *
 * Non-fatal findings do not throw. They arrive as `ParsedFeature.warnings`, which is always an
 * array and is usually empty.
 *
 * ## Node ids are per-call
 *
 * One uuid-backed id generator is constructed per call and shared by `AstBuilder` and by
 * `compile` (decision D3). Sharing matters: two independent generators are verified to hand a
 * Scenario and a pickle the same id inside one document, and a counter-based generator is
 * verified to give two different files' first Scenarios the same id.
 *
 * The consequence of uuid is that two calls on identical source produce different `id` values.
 * Node ids are therefore stable only within one `ParsedFeature`. Never persist them, never write
 * them into a fixture, and never compare them across two calls — compare `astName`, `name`,
 * `tags`, or a step's `text` and `line` instead.
 *
 * ## Markdown feature files are out of scope
 *
 * `Parser.ts` uses `GherkinClassicTokenMatcher` only; `GherkinInMarkdownTokenMatcher` is
 * deliberately unused. Nothing in `spec/` or `REQUIREMENTS.md` mentions Markdown feature files
 * for this milestone, so the omission is a decision, not an oversight.
 */
import { IdGenerator } from "@cucumber/messages"
import { correlateFeature } from "./Correlate.ts"
import type { ParsedFeature } from "./Model.ts"
import { buildParameterTypeRegistry } from "./ParameterTypes.ts"
import { parseDocument } from "./Parser.ts"
import { compilePickles } from "./Pickles.ts"
import { readFeatureSource } from "./Source.ts"
import { validateFeature } from "./Validate.ts"

/**
 * Parse feature-file text into a `ParsedFeature`.
 *
 * `uri` is supplied by the caller and is never read off the document: `Parser.parse(source)` does
 * not set `GherkinDocument.uri`, so a string parse has no other source for it. It is what every
 * error and warning message names, so pass the path or module id a reader would recognise.
 *
 * Throws a `LoadFeatureError` for any fatal problem — an unparseable file, an unknown
 * `# language:` dialect, a file with no `Feature:`, or one of the silent-miscompile shapes
 * `Validate.ts` rejects.
 */
export const parseFeature = (source: string, uri: string): ParsedFeature => {
  const newId = IdGenerator.uuid()
  const document = parseDocument(source, uri, newId)
  const pickles = compilePickles(document, uri, newId)
  const correlated = correlateFeature(document, pickles, uri)
  return {
    ...correlated.feature,
    warnings: validateFeature(correlated),
    parameterTypes: buildParameterTypeRegistry()
  }
}

/**
 * Read a `.feature` file and parse it, synchronously.
 *
 * The path is taken verbatim and reported as the `uri`. A filesystem failure — missing file,
 * directory, permissions — throws a `LoadFeatureError` with reason `MissingFile`; everything
 * after that behaves exactly as `parseFeature` does, because it is `parseFeature`.
 */
export const loadFeature = (path: string): ParsedFeature => parseFeature(readFeatureSource(path), path)
