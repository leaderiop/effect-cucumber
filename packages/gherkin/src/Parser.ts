/**
 * Parsing `.feature` text into a `GherkinDocument`; no raw `@cucumber/gherkin` exception leaves this module.
 *
 * A parse failure arrives as a `CompositeParserException` whose `.errors` holds the real errors and whose own
 * `.location` is `undefined`, so `err.errors ?? [err]` is read and the line comes off the FIRST error.
 * Discrimination is `instanceof`, never `name`: every upstream error class reports `"Error"`
 * (`test/upstream-pin.test.ts`). `GherkinClassicTokenMatcher` only — Markdown feature files are out of scope.
 * `GherkinDocument.uri` is `undefined` for a string parse, so every `uri` comes from the caller. `newId` is the
 * caller's: one uuid generator per `loadFeature` call is shared with `compile`, because independent or
 * counter-based generators collide (`test/upstream-pin.test.ts`).
 */
import { AstBuilder, dialects, Errors, GherkinClassicTokenMatcher, Parser as GherkinParser } from "@cucumber/gherkin"
import type { GherkinDocument, IdGenerator } from "@cucumber/messages"
import * as Option from "effect/Option"
import { LoadFeatureError, type LoadFeatureErrorReason } from "./Errors.ts"

/** Builds a `LoadFeatureError`, lifting the plain `line` into the `Option` field. */
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

/** The concrete errors a caught parse failure stands for: `errors` exists on every `GherkinException` and is
 * `undefined` outside a composite. */
const collectErrors = (thrown: unknown): ReadonlyArray<Error> => {
  if (thrown instanceof Errors.GherkinException) {
    return thrown.errors ?? [thrown]
  }
  return thrown instanceof Error ? [thrown] : []
}

/** The 1-based line of an upstream error, read off the FIRST collected error — a composite has none. */
const lineOf = (thrown: unknown): number | undefined => {
  if (thrown instanceof Errors.GherkinException) {
    return thrown.location?.line
  }
  return undefined
}

/** One misplaced tag cascades into a wall of errors; the first is reproduced in full and the rest collapse to
 * a count plus their lines (no individual message is truncated). */
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
 * A `# language:` header naming a prototype-chain key (`constructor`, `__proto__`) with its line: upstream indexes
 * its dialect table bare and dies with `TypeError: keywords is not iterable`. An ordinary unknown language is
 * left to upstream's own `NoSuchLanguageException` (`test/upstream-pin.test.ts`).
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

  // `undefined`, not `null`, for a comment-only file (`test/upstream-pin.test.ts`); `eqeqeq` is an error here.
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
