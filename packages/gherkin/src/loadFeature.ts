/**
 * The composition root of `@effect-cucumber/gherkin`: Source, then Parser, then Pickles, then
 * Correlate, then Validate. Every module below this one is a leaf or near-leaf; this is the only
 * file that knows the order they run in.
 *
 * Two entry points ship, and they are not alternatives. `parseFeature(source, uri)` is the
 * testable core and needs no filesystem — it is what a Vite `.feature?raw` import feeds, and a
 * `?raw` string is verified byte-identical to what `readFileSync` returns for the same file.
 * `loadFeature(path)` composes it with `Source.ts#readFeatureSource` and is the signature
 * BEH-EC-001 specifies. Dropping either one costs something real: path-only breaks the
 * watch-mode-friendly consumer path, source-only contradicts the normative signature.
 *
 * ## `Effect`-returning, not a one-way door after all
 *
 * This section used to open with "Synchronous, permanently" and call the plain-value return a
 * one-way door PITFALLS.md rated "Never" to reverse, because a public API break. It was reversed
 * anyway:
 * [ADR-EC-021](../../../spec/decisions/021-effect-and-platform-are-peer-dependencies-of-gherkin.md)
 * supersedes [ADR-EC-015](../../../spec/decisions/015-effect-is-a-peer-dependency.md) on exactly
 * this point, on the explicit basis that this library serves Effect users exclusively and
 * Effect-native capability is worth the migration cost, not on any claim that the original
 * reasoning was wrong.
 *
 * `parseFeature` returns `Effect<ParsedFeature, LoadFeatureError | StepPatternError,
 * ParameterTypeStore>`. `loadFeature` returns `Effect<ParsedFeature, LoadFeatureError |
 * StepPatternError, FileSystem.FileSystem | ParameterTypeStore>` — both real requirements now,
 * not `never`. `FileSystem.FileSystem` composes with `Source.ts#readFeatureSource`, which reads
 * through `effect`'s own `FileSystem` service. `ParameterTypeStore` — see
 * [ADR-EC-023](../../../spec/decisions/023-parametertypestore-becomes-an-ambient-context-service.md)
 * — replaces the `LoadFeatureOptions.parameterTypes` argument this package used to take; both
 * functions now `yield*` it rather than receive it as a parameter. A caller must `Effect.provide`
 * a `FileSystem` Layer AND a `ParameterTypeStore` Layer before running either function's result —
 * `@effect/platform-node`'s `NodeFileSystem.layer` and `ParameterTypeStore.Default` for this
 * package's own tests (see `test/loadFeature.test.ts`), or whatever Layers a consumer's own
 * program supplies.
 *
 * ## `Effect.runSync` no longer recovers the old synchronous call — confirmed, not assumed
 *
 * The original migration (before adopting the real `FileSystem` service) kept
 * `Effect.runSync(loadFeature(path))` working, because the interim implementation wrapped a
 * genuinely synchronous `node:fs.readFileSync`. That is no longer true:
 * `NodeFileSystem.readFileString` suspends internally, and `Effect.runSync` on it throws
 * `AsyncFiberError` — reproduced directly against the real `@effect/platform-node` package, not
 * assumed from documentation. `loadFeature(path)` must be run with `Effect.runPromise` (or
 * composed into a larger `Effect` program) now; the vitest-module-top-level pattern BEH-EC-001
 * was written around uses a top-level `await` instead — see `test/loadFeature.test.ts`'s doc
 * comment for the executable proof and exactly what changed.
 *
 * ## Failures fail the Effect, not the process
 *
 * Every fatal problem leaves `parseFeature`/`loadFeature` as a failed
 * `Effect<_, LoadFeatureError | StepPatternError>`, matching this package's existing error
 * union — no new failure mode was introduced by this migration, only a new channel for the same
 * two classes. A caller who wants the collection-time-throw behavior BEH-EC-001 originally
 * specified gets it via a module-top-level `await Effect.runPromise(...)`, which throws exactly
 * as an unhandled promise rejection at that call site would; a caller building a larger Effect
 * program instead composes the failure with `Effect.catchTag`/`catchTags` like any other typed
 * Effect failure.
 *
 * That is exactly why the validation messages are shaped `uri:line: Reason: what to do` — a
 * collection-time-thrown error shows only the one message, so it has to be enough on its own.
 * Phase 6 may catch and re-route at the `describeFeature` boundary, where per-Scenario
 * reporting is available; that is a presentation change at a different layer, not a change to
 * this signature.
 *
 * Non-fatal findings do not fail the Effect. They arrive as `ParsedFeature.warnings`, which is
 * always an array and is usually empty.
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
 * store `yield* ParameterTypeStore` resolves to is replayed into it. ADR-EC-007's SECOND
 * correction is the governing text: custom parameter types are permanent, ordinary DATA, so a
 * definition added at module scope (`defineParameterType`, still plain and `Effect`-free — see
 * `ParameterTypes.ts`) is correctly present in every subsequent call rather than landing once in
 * a registry that no longer exists by the time a second call needs one. A fresh registry also has
 * nothing registered into it yet, which is what makes re-acquiring the eleven built-ins safe and
 * makes a second call's replay incapable of a duplicate-name throw — the failure Pitfall 14
 * records three times over in `cypress-cucumber-preprocessor`.
 *
 * `ParameterTypeStore.Default` provides `defaultParameterTypeStore` — the same module-scope
 * singleton `defineParameterType` writes into — so `Effect.provide(ParameterTypeStore.Default)`
 * reproduces exactly the behavior the old `options` argument's absence used to give for free. A
 * caller wanting isolation provides `ParameterTypeStore.layerOf(createParameterTypeStore())`
 * instead of the old `{ parameterTypes: Option.some(store) }` argument.
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
import * as Effect from "effect/Effect"
import * as Option from "effect/Option"
import { correlateFeature } from "./Correlate.ts"
import { LoadFeatureError, StepPatternError } from "./Errors.ts"
import type { ParsedFeature } from "./Model.ts"
import { ParameterTypeStore } from "./ParameterTypes.ts"
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
 * Fails the returned `Effect` with a `LoadFeatureError` for any fatal problem — an unparseable
 * file, an unknown `# language:` dialect, a file with no `Feature:`, or one of the
 * silent-miscompile shapes `Validate.ts` rejects — or a `StepPatternError` if
 * `store.buildRegistry()` rejects a recorded custom parameter type at replay time (see
 * `ParameterTypes.ts`). `parseDocument`/`compilePickles`/`correlateFeature`/`validateFeature`
 * are unchanged, still-synchronous, still-throwing functions; `Effect.try` is the only thing
 * here that turns that throw into a typed failure, and its `catch` is total over exactly the
 * two classes this pipeline can throw — confirmed by grepping every `throw new` in this
 * package's pipeline modules, not assumed. Anything else reaching `catch` would mean a
 * dependency changed behaviour under this package; it is still reported as a well-typed
 * `LoadFeatureError` rather than crashing unrecognisably, matching this codebase's existing
 * "no bare upstream error" policy (see `ParameterTypes.ts`'s own catch-alls).
 *
 * `ParameterTypeStore` is resolved via `yield*`, not a function argument — a caller MUST
 * `Effect.provide` a `ParameterTypeStore` Layer (`ParameterTypeStore.Default` for the standard
 * behavior, or `ParameterTypeStore.layerOf(createParameterTypeStore())` for isolation) before
 * running the result. See ADR-EC-023 for why there is no internal default: providing one here
 * would make it permanently un-overridable (confirmed by reproduction — `Effect.provide`
 * cannot override a requirement a function already closed over internally).
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
    catch: (thrown): LoadFeatureError | StepPatternError =>
      thrown instanceof LoadFeatureError || thrown instanceof StepPatternError
        ? thrown
        : new LoadFeatureError({
          reason: "ParseFailed",
          uri,
          line: Option.none(),
          message: `parseFeature failed for ${uri} with an error this library did not anticipate: `
            + `${thrown instanceof Error ? thrown.message : String(thrown)}`,
          cause: Option.some(thrown)
        })
  })
})

/**
 * Read a `.feature` file and parse it.
 *
 * The path is taken verbatim and reported as the `uri`. A filesystem failure — missing file,
 * directory, permissions — fails the Effect with a `LoadFeatureError` with reason `MissingFile`;
 * everything after that behaves exactly as `parseFeature` does, because it composes with it.
 *
 * BEH-EC-001's one-argument form (`loadFeature("x.feature")`) still type-checks exactly as
 * written — the second `LoadFeatureOptions` argument this signature used to carry is gone
 * entirely (ADR-EC-023), not replaced by anything, since there was nothing left in it once
 * `parameterTypes` moved to an ambient `Effect.provide`. Run the result with
 * `Effect.provide(<FileSystem Layer>, <ParameterTypeStore Layer>)` then `Effect.runPromise` —
 * see this module's doc comment for why `Effect.runSync` no longer works here.
 */
export const loadFeature = Effect.fn("loadFeature")(function*(path: string) {
  const source = yield* readFeatureSource(path)
  return yield* parseFeature(source, path)
})
