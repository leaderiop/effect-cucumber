/**
 * Parsing `.feature` text into a `GherkinDocument`, with every upstream throw normalised into
 * a `LoadFeatureError`. No raw `@cucumber/gherkin` exception leaves this module.
 *
 * Four things here are load-bearing and none of them are obvious from the code alone.
 *
 * (a) Two error shapes, one handler. With the default `stopAtFirstError === false` a parse
 *     failure arrives as a `CompositeParserException` whose `.errors` array holds the real
 *     errors and whose OWN `.location` is `undefined`. With `stopAtFirstError = true` the
 *     throw is a bare `UnexpectedTokenException` with no `.errors` array and a `.location`
 *     that IS set. Reading `.errors` unconditionally raises a `TypeError` while handling a
 *     parse error — the worst possible place for a second bug — so the cucumber-js idiom
 *     `err.errors ?? [err]` is used instead. Threat T-02-04.
 *
 * (b) Discrimination is by `instanceof Errors.X`, never by the error's `name` property. Every
 *     one of `@cucumber/gherkin`'s error classes inherits `Error`'s `name`, so all of them
 *     report the useless string `"Error"` and a switch over `name` silently matches nothing,
 *     quietly misclassifying an unknown dialect as a generic parse failure. Threat T-02-11.
 *     Note also that `UnexpectedTokenException` is NOT a member of the `Errors` namespace
 *     that `@cucumber/gherkin@42.0.1` exports (it holds only `AstBuilderException`,
 *     `CompositeParserException`, `GherkinException`, `NoSuchLanguageException` and
 *     `ParserException`), so it can only be reached via `Errors.GherkinException`. It needs
 *     no special case: everything that is not a `NoSuchLanguageException` becomes
 *     `ParseFailed`.
 *
 * (c) `GherkinClassicTokenMatcher` only. `GherkinInMarkdownTokenMatcher` — Markdown feature
 *     files — is deliberately out of scope for this milestone. The omission is a decision,
 *     not an oversight.
 *
 * (d) `GherkinDocument.uri` is `undefined` when parsing from a string: `Parser.parse(source)`
 *     never sets it. Every `uri` this package reports therefore comes from the caller and
 *     never from the document.
 *
 * The `newId` parameter is required and is never defaulted here. Exactly one uuid-backed id
 * generator per `loadFeature` call is shared by `AstBuilder` AND by `compile`
 * (decision D3), and `loadFeature.ts` owns constructing it. Both failure modes of violating
 * that are verified: a fresh `incrementing()` per file gives two different Features' first
 * Scenarios the same id `"1"`, corrupting any cross-file map; and independent generators for
 * parse and compile produce `scenario.id === "1"` and `pickle.id === "1"` in one document, so
 * `"1"` acquires two meanings.
 */
import { AstBuilder, dialects, Errors, GherkinClassicTokenMatcher, Parser as GherkinParser } from "@cucumber/gherkin"
import type { GherkinDocument, IdGenerator } from "@cucumber/messages"
import * as Option from "effect/Option"
import { LoadFeatureError, type LoadFeatureErrorReason } from "./Errors.ts"

/**
 * `line`/`cause` are `Option<T>` fields now (see `Errors.ts`), always required and never
 * ambiguous the way `exactOptionalPropertyTypes`'s `T | undefined` asymmetry was — no ternary
 * needed here any more, `Option.fromUndefinedOr` handles both cases uniformly.
 */
const loadFeatureError = (args: {
  reason: LoadFeatureErrorReason
  uri: string
  line: number | undefined
  message: string
  cause: unknown
}): LoadFeatureError =>
  new LoadFeatureError({
    reason: args.reason,
    uri: args.uri,
    line: Option.fromUndefinedOr(args.line),
    message: args.message,
    cause: args.cause
  })

/**
 * Flatten a caught parse failure into the list of concrete errors it stands for.
 *
 * `errors` is a declared class field on `GherkinException`, so it EXISTS on every instance and
 * holds `undefined` unless `CompositeParserException.create` filled it in. `?? [thrown]` is
 * what makes the bare single-exception shape survive; a plain `thrown.errors` would hand the
 * rest of the handler an `undefined` to iterate.
 */
const collectErrors = (thrown: unknown): ReadonlyArray<Error> => {
  if (thrown instanceof Errors.GherkinException) {
    return thrown.errors ?? [thrown]
  }
  return thrown instanceof Error ? [thrown] : []
}

/**
 * The 1-based source line an upstream error points at, or `undefined`.
 *
 * `GherkinException.location` is typed non-optional but is genuinely `undefined` on a
 * `CompositeParserException`, which is exactly why the line must be read off the FIRST
 * collected error and never off the composite.
 */
const lineOf = (thrown: unknown): number | undefined => {
  if (thrown instanceof Errors.GherkinException) {
    return thrown.location?.line
  }
  return undefined
}

/**
 * One misplaced tag is verified to produce a wall of cascading errors, every one of them a
 * consequence of the first and all of them covering the rest of the file. Reporting all of
 * them verbatim buries the only line the author needs to fix.
 *
 * So: the first error is reproduced in full, and the remainder collapses to a count plus the
 * lines they landed on. Only the COUNT of consequences is dropped — no individual error's own
 * text is ever truncated, per the package's full-content policy.
 */
const describeParseFailure = (uri: string, errors: ReadonlyArray<Error>): string => {
  const [first, ...rest] = errors
  const head = first === undefined
    ? `Failed to parse ${uri}: the parser threw without collecting any error.`
    : `Failed to parse ${uri}:\n${first.message}`
  if (rest.length === 0) {
    return head
  }
  const lines = rest.map((error) => {
    const line = lineOf(error)
    return line === undefined ? "unknown line" : `line ${line}`
  })
  return `${head}\n\n${rest.length} further parse error(s) followed from this one (${
    lines.join(", ")
  }). They are usually consequences of the first — fix that one and re-run.`
}

/** Upstream's own header pattern (`GherkinClassicTokenMatcher.LANGUAGE_PATTERN`), reproduced verbatim. */
const languageHeader = /^\s*#\s*language\s*:\s*([a-zA-Z\-_]+)\s*$/

/**
 * A `# language:` header naming a key that `dialects` only has through its prototype chain —
 * `constructor`, `toString`, `__proto__` — with its line, or `undefined` when there is no such
 * header. Upstream indexes its dialect table bare, so such a header reaches `new Parser` as a
 * function where a dialect is expected and dies with `TypeError: keywords is not iterable`,
 * which the catch below could only report as a generic `ParseFailed` (audit finding F-31).
 * A header naming an ordinary unknown language is deliberately NOT caught here: upstream rejects
 * it itself with a `NoSuchLanguageException`, and that path stays pinned by `upstream-pin.test.ts`.
 */
const findPrototypeKeyLanguageHeader = (
  source: string
): { readonly language: string; readonly line: number } | undefined => {
  const lines = source.split(/\r?\n/)
  for (const [index, text] of lines.entries()) {
    if (text.trim() === "") continue
    const match = languageHeader.exec(text)
    if (match === null) return undefined
    const language = match[1] ?? ""
    return !Object.hasOwn(dialects, language) && language in dialects ? { language, line: index + 1 } : undefined
  }
  return undefined
}

/**
 * Parse feature-file text into a `GherkinDocument`.
 *
 * Throws a `LoadFeatureError` with reason `UnknownDialect` for an unrecognised `# language:`
 * header, `ParseFailed` for any other parse failure, and `NoFeature` when the file parses
 * cleanly but declares no `Feature:` at all.
 */
export const parseDocument = (source: string, uri: string, newId: IdGenerator.NewId): GherkinDocument => {
  const prototypeKeyHeader = findPrototypeKeyLanguageHeader(source)
  if (prototypeKeyHeader !== undefined) {
    throw new LoadFeatureError({
      reason: "UnknownDialect",
      uri,
      line: Option.some(prototypeKeyHeader.line),
      message: `Unknown dialect in ${uri}:\n(${prototypeKeyHeader.line}:1): Language not supported: `
        + `${prototypeKeyHeader.language}`
    })
  }
  let document: GherkinDocument
  try {
    const parser = new GherkinParser(new AstBuilder(newId), new GherkinClassicTokenMatcher())
    document = parser.parse(source)
  } catch (thrown) {
    const errors = collectErrors(thrown)
    const [first] = errors
    if (first instanceof Errors.NoSuchLanguageException) {
      throw loadFeatureError({
        reason: "UnknownDialect",
        uri,
        line: lineOf(first),
        message: `Unknown dialect in ${uri}:\n${first.message}`,
        cause: thrown
      })
    }
    throw loadFeatureError({
      reason: "ParseFailed",
      uri,
      line: lineOf(first),
      message: describeParseFailure(uri, errors),
      cause: thrown
    })
  }

  // Verified `undefined`, NOT `null`, for a comment-only file and for an empty string. Written
  // as a strict comparison against `undefined` rather than the loose nullish comparison some
  // upstream notes suggest: `eqeqeq` is an error in this repo, and the lint rule wins.
  if (document.feature === undefined) {
    throw new LoadFeatureError({
      reason: "NoFeature",
      uri,
      line: Option.none(),
      message: `${uri} parsed cleanly but declares no Feature:. A file with only comments or `
        + `whitespace is valid Gherkin and contributes no scenarios.`
    })
  }
  return document
}
