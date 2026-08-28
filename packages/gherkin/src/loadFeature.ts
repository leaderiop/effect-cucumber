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
 * ## The parameter type registry is per-call too
 *
 * One `ParameterTypeRegistry` is constructed per call, alongside the per-call id generator, and
 * handed back on `ParsedFeature.parameterTypes`. Every custom parameter type recorded in the
 * store is replayed into it. ADR-EC-007's SECOND correction is the governing text: custom
 * parameter types are permanent, ordinary DATA, so a definition added at module scope is
 * correctly present in every subsequent call rather than landing once in a registry that no
 * longer exists by the time a second call needs one. A fresh registry also has nothing
 * registered into it yet, which is what makes re-acquiring the eleven built-ins safe and makes a
 * second call's replay incapable of a duplicate-name throw — the failure Pitfall 14 records three
 * times over in `cypress-cucumber-preprocessor`.
 *
 * It is built EAGERLY, once, right here. Not memoized at module scope, not cached per store, not
 * hidden behind a lazy getter: freshness IS the requirement (MATCH-02), not an implementation
 * detail anyone is free to optimise away.
 *
 * The consequence a reader must not discover the hard way: two calls yield two DIFFERENT registry
 * objects, so a `CucumberExpression` compiled against one is never valid against the other. That
 * is why `StepMatcher.ts` keys its compilation cache on the registry instance.
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
import { defaultParameterTypeStore, type ParameterTypeStore } from "./ParameterTypes.ts"
import { parseDocument } from "./Parser.ts"
import { compilePickles } from "./Pickles.ts"
import { readFeatureSource } from "./Source.ts"
import { validateFeature } from "./Validate.ts"

/**
 * The optional trailing argument of `parseFeature` and `loadFeature`.
 *
 * Every member is optional and the argument itself is optional, so BEH-EC-001's
 * `loadFeature("x.feature")` call form is unchanged.
 */
export interface LoadFeatureOptions {
  /**
   * The store whose recorded definitions are replayed into this call's fresh registry. Defaults
   * to `defaultParameterTypeStore`.
   *
   * Its reason for existing is testability. The default store is APPEND-ONLY for the life of the
   * process — there is no `remove` and no `clear`, by design — so a test that defines into it
   * cannot undo that, and every later test in the same worker inherits the definition. A hermetic
   * test therefore builds its own store with `createParameterTypeStore()` and passes it here.
   */
  readonly parameterTypes?: ParameterTypeStore
}

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
export const parseFeature = (source: string, uri: string, options?: LoadFeatureOptions): ParsedFeature => {
  const newId = IdGenerator.uuid()
  const store = options?.parameterTypes ?? defaultParameterTypeStore
  const document = parseDocument(source, uri, newId)
  const pickles = compilePickles(document, uri, newId)
  const correlated = correlateFeature(document, pickles, uri)
  return {
    ...correlated.feature,
    warnings: validateFeature(correlated),
    parameterTypes: store.buildRegistry()
  }
}

/**
 * Read a `.feature` file and parse it, synchronously.
 *
 * The path is taken verbatim and reported as the `uri`. A filesystem failure — missing file,
 * directory, permissions — throws a `LoadFeatureError` with reason `MissingFile`; everything
 * after that behaves exactly as `parseFeature` does, because it is `parseFeature`.
 *
 * `options` is forwarded unchanged. It is optional and trailing, so the one-argument form
 * BEH-EC-001 specifies still type-checks exactly as written.
 */
export const loadFeature = (path: string, options?: LoadFeatureOptions): ParsedFeature =>
  parseFeature(readFeatureSource(path), path, options)
