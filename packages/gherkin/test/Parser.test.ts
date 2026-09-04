/**
 * One test per Group B row of the fixture table, each asserting the DISTINCT `reason` tag its
 * failure carries.
 */
import { AstBuilder, Errors, GherkinClassicTokenMatcher, Parser as GherkinParser } from "@cucumber/gherkin"
import { IdGenerator } from "@cucumber/messages"
import * as NodeFileSystem from "@effect/platform-node/NodeFileSystem"
import { assert, describe, it, vi } from "@effect/vitest"
import * as Data from "effect/Data"
import * as Effect from "effect/Effect"
import * as FileSystem from "effect/FileSystem"
import * as Option from "effect/Option"
import * as PlatformError from "effect/PlatformError"
import { fileURLToPath } from "node:url"
import { LoadFeatureError } from "../src/Errors.ts"
import { parseDocument } from "../src/Parser.ts"
import { compilePickles } from "../src/Pickles.ts"
import { readFeatureSource } from "../src/Source.ts"

const fixturePath = (name: string): string => fileURLToPath(new URL(`./fixtures/${name}`, import.meta.url))

/**
 * An `IdGenerator.NewId` that throws `value` on every call — `AstBuilder` and `compile()` both call `newId()`
 * while building nodes, so this is a controlled way to make either one fail with a chosen `thrown` value.
 */
const newIdThatThrows = (value: unknown): IdGenerator.NewId => () => {
  throw value
}

/** `readFeatureSource` provided its concrete FileSystem — a bare Effect, `yield*`-ed inside `it.effect`. */
const readSource = (path: string) => readFeatureSource(path).pipe(Effect.provide(NodeFileSystem.layer))

/**
 * `parseDocument`/`compilePickles` throw directly rather than returning an Effect. Wraps a call
 * to either as an Effect whose failure channel is a TAGGED carrier of the raw thrown value,
 * unwrapped by `captureError` below — `@effect/tsgo`'s `unknownInEffectCatch` check (ADR-EC-016)
 * flags `Effect.try`'s `catch` returning bare `unknown`, wanting a real type; plain
 * `Effect.try(f)` (no explicit `catch`) would satisfy that but wraps the caught throw in an
 * `UnknownException`, hiding the real `LoadFeatureError` one level deeper than `captureError`'s
 * `instanceof` check needs to reach — this keeps the raw value AND gives it a name.
 */
class RawThrow extends Data.TaggedError("RawThrow")<{ readonly cause: unknown }> {}

const tryThrow = <A>(thunk: () => A): Effect.Effect<A, RawThrow> =>
  Effect.try({ try: thunk, catch: (cause) => new RawThrow({ cause }) })

/**
 * Runs `effect`, requires it fails, and resolves to the `LoadFeatureError` it failed with.
 *
 * Anything that is NOT a `LoadFeatureError` dies rather than being absorbed: a leaked Node
 * `ENOENT` or a raw `CompositeParserException` must fail the test loudly rather than be swallowed
 * by a catch-all. Accepts both a typed `LoadFeatureError` failure directly (from `readSource`)
 * and a `tryThrow`-wrapped synchronous throw (from `parseDocument`/`compilePickles`) uniformly,
 * unwrapping the latter's `.cause` before the `instanceof` check.
 */
const captureError = <A>(effect: Effect.Effect<A, LoadFeatureError | RawThrow>): Effect.Effect<LoadFeatureError> =>
  Effect.matchEffect(effect, {
    onFailure: (failure) => {
      const thrown = failure instanceof RawThrow ? failure.cause : failure
      return thrown instanceof LoadFeatureError ? Effect.succeed(thrown) : Effect.die(thrown)
    },
    onSuccess: () => Effect.die(new Error("expected a LoadFeatureError, but the call returned normally"))
  })

/** Group B fixtures are always driven through the same read-then-parse pipeline. */
const parseFixture = (name: string): Effect.Effect<unknown, LoadFeatureError | RawThrow> =>
  Effect.gen(function*() {
    const source = yield* readSource(fixturePath(name))
    return yield* tryThrow(() => parseDocument(source, name, IdGenerator.uuid()))
  })

const failureOf = (name: string): Effect.Effect<LoadFeatureError> => captureError(parseFixture(name))

/** Drives `stopAtFirstError` parsing to throw its bare (non-Composite) exception directly. */
const bareParseException = (source: string): unknown => {
  const parser = new GherkinParser(new AstBuilder(IdGenerator.uuid()), new GherkinClassicTokenMatcher())
  parser.stopAtFirstError = true
  try {
    parser.parse(source)
  } catch (thrown) {
    return thrown
  }
  throw new Error("expected stopAtFirstError parsing to throw a bare exception")
}

describe("readFeatureSource", () => {
  it.effect("F16 wraps a missing file as MissingFile naming the path and the ENOENT cause", () =>
    Effect.gen(function*() {
      const missing = fixturePath("this-fixture-does-not-exist.feature")
      const error = yield* captureError(readSource(missing))

      assert.strictEqual(error.reason, "MissingFile")
      assert.strictEqual(error.uri, missing)
      assert.deepStrictEqual(error.line, Option.none())
      assert.include(error.message, missing)
      // `.cause` is the PlatformError, not the raw Node error directly: the real ENOENT details
      // live one level deeper, at `.cause.cause` — confirmed by reproduction against the real
      // `NodeFileSystem`, not assumed.
      const platformError = error.cause as { readonly cause?: { readonly code?: unknown } }
      assert.strictEqual(platformError.cause?.code, "ENOENT")
    }))

  it.effect("reports a path that exists but is not a readable file as ReadFailed, not MissingFile", () =>
    Effect.gen(function*() {
      const directory = fixturePath("")
      const error = yield* captureError(readSource(directory))

      assert.strictEqual(error.reason, "ReadFailed")
      assert.strictEqual(error.uri, directory)
      assert.isDefined(error.cause)
    }))

  it.effect("reports a permission failure as PermissionDenied, discriminating on the PlatformError's own tag", () =>
    Effect.gen(function*() {
      const denied = FileSystem.layerNoop({
        readFileString: () =>
          Effect.fail(
            PlatformError.systemError({
              _tag: "PermissionDenied",
              module: "FileSystem",
              method: "readFileString",
              description: "EACCES: permission denied"
            })
          )
      })
      const error = yield* captureError(readFeatureSource("/locked/feature.feature").pipe(Effect.provide(denied)))

      assert.strictEqual(error.reason, "PermissionDenied")
      assert.include(error.message, "permission denied")
    }))
})

describe("parseDocument", () => {
  it.effect("F17 reports the first error's line for a misplaced tag and collapses the cascade", () =>
    Effect.gen(function*() {
      const error = yield* failureOf("parse-failed-misplaced-tag.feature")

      assert.strictEqual(error.reason, "ParseFailed")
      // The line comes from the FIRST collected error. Reading the composite's own `.location`
      // would give `Option.none()` here, which is the bug this assertion exists to catch.
      assert.isTrue(Option.isSome(error.line))
      assert.deepStrictEqual(error.line, Option.some(4))
      assert.match(error.message, /2 further parse error\(s\) followed from this one/)
    }))

  it.effect("F18 gives an unknown dialect its own reason, distinct from a generic parse failure", () =>
    Effect.gen(function*() {
      const error = yield* failureOf("unknown-dialect.feature")

      assert.strictEqual(error.reason, "UnknownDialect")
      assert.notStrictEqual(error.reason, "ParseFailed")
      assert.deepStrictEqual(error.line, Option.some(1))
      assert.isTrue(error.cause instanceof Errors.CompositeParserException)
    }))

  it.effect(
    "F18 rejects a prototype-key dialect header as UnknownDialect rather than a TypeError-backed ParseFailed",
    () =>
      Effect.gen(function*() {
        const error = yield* failureOf("unknown-dialect-proto.feature")

        assert.strictEqual(error.reason, "UnknownDialect")
        assert.deepStrictEqual(error.line, Option.some(1))
        assert.include(error.message, "constructor")
      })
  )

  it.effect("F10 wraps an inconsistent DataTable cell count as ParseFailed", () =>
    Effect.gen(function*() {
      const error = yield* failureOf("parse-failed-inconsistent-cells.feature")

      assert.strictEqual(error.reason, "ParseFailed")
      assert.deepStrictEqual(error.line, Option.some(8))
    }))

  it.effect("F15 wraps a typo'd step keyword written after a valid step as ParseFailed", () =>
    Effect.gen(function*() {
      const error = yield* failureOf("parse-failed-typo-keyword-after-step.feature")

      assert.strictEqual(error.reason, "ParseFailed")
      assert.deepStrictEqual(error.line, Option.some(5))
    }))

  it.effect("F20 wraps a feature-level Background placed after a Rule as ParseFailed", () =>
    Effect.gen(function*() {
      const error = yield* failureOf("parse-failed-background-after-rule.feature")

      assert.strictEqual(error.reason, "ParseFailed")
      assert.deepStrictEqual(error.line, Option.some(8))
    }))

  it.effect("F12 reports a comment-only file as NoFeature rather than parsing it to nothing", () =>
    Effect.gen(function*() {
      const error = yield* failureOf("no-feature.feature")

      assert.strictEqual(error.reason, "NoFeature")
      assert.deepStrictEqual(error.line, Option.none())
      assert.isUndefined(error.cause)
    }))

  it.effect("F12 reports an all-blank-lines source as NoFeature, never scanning for a language header", () =>
    Effect.gen(function*() {
      // findPrototypeKeyLanguageHeader's line-scan `continue`s past every blank line looking for
      // the first non-blank one to test as a `# language:` header; a source with NO non-blank
      // line at all falls off the end of that loop, distinct from `no-feature.feature`'s comment
      // line (which IS non-blank, so it exits the loop one statement earlier).
      const error = yield* captureError(
        tryThrow(() => parseDocument("   \n  \n", "blank.feature", IdGenerator.uuid()))
      )

      assert.strictEqual(error.reason, "NoFeature")
      assert.deepStrictEqual(error.line, Option.none())
    }))

  it.effect("no raw gherkin or Node exception escapes for any Group B fixture", () =>
    Effect.gen(function*() {
      const fixtures = [
        "parse-failed-misplaced-tag.feature",
        "unknown-dialect.feature",
        "parse-failed-inconsistent-cells.feature",
        "parse-failed-typo-keyword-after-step.feature",
        "parse-failed-background-after-rule.feature",
        "no-feature.feature"
      ]
      // Independent fixtures — safe (and faster) to run concurrently rather than sequentially.
      const errors = yield* Effect.all(fixtures.map((name) => failureOf(name)), { concurrency: "unbounded" })
      const reasons = errors.map((error) => error.reason)

      assert.deepStrictEqual(reasons, [
        "ParseFailed",
        "UnknownDialect",
        "ParseFailed",
        "ParseFailed",
        "ParseFailed",
        "NoFeature"
      ])
    }))

  it.effect("F21 positive control: a well-formed feature parses and compiles to at least one pickle", () =>
    Effect.gen(function*() {
      // Without this, a `parseDocument` that rejected every input would pass every other test in
      // this file.
      const newId = IdGenerator.uuid()
      const uri = "correlation-full.feature"
      const source = yield* readSource(fixturePath(uri))
      const document = parseDocument(source, uri, newId)

      assert.strictEqual(document.feature?.name, "correlation across every nesting level")

      const pickles = compilePickles(document, uri, newId)
      assert.isAbove(pickles.length, 0)
      assert.isAbove(pickles[0]?.steps.length ?? -1, 0)
    }))

  it.effect("wraps a compile()-time Error as ParseFailed, message taken from .message", () =>
    Effect.gen(function*() {
      // `compile()` calls `newId()` once per pickle; a `newId` that throws is a controlled way to
      // exercise compilePickles's catch without malforming the document upstream produced.
      const uri = "correlation-full.feature"
      const source = yield* readSource(fixturePath(uri))
      const document = parseDocument(source, uri, IdGenerator.uuid())

      const error = yield* captureError(
        tryThrow(() => compilePickles(document, uri, newIdThatThrows(new Error("boom"))))
      )

      assert.strictEqual(error.reason, "ParseFailed")
      assert.include(error.message, "boom")
    }))

  it.effect("wraps a compile()-time non-Error throw as ParseFailed, message taken from String(thrown)", () =>
    Effect.gen(function*() {
      const uri = "correlation-full.feature"
      const source = yield* readSource(fixturePath(uri))
      const document = parseDocument(source, uri, IdGenerator.uuid())

      const error = yield* captureError(
        tryThrow(() => compilePickles(document, uri, newIdThatThrows("not an Error instance")))
      )

      assert.strictEqual(error.reason, "ParseFailed")
      assert.include(error.message, "not an Error instance")
    }))

  it.effect("wraps a thrown non-Error, non-GherkinException value with no line and no collected errors", () =>
    Effect.gen(function*() {
      // `AstBuilder` calls `this.newId()` while building nodes, DURING `parser.parse()`, and
      // upstream's own `handleExternalError` re-throws anything it does not recognise verbatim
      // (checked against the installed @cucumber/gherkin source) — so a `newId` that throws a
      // bare string is a controlled way to reach `collectErrors`/`lineOf` with a `thrown` that is
      // neither an `Error` nor a `GherkinException`, without depending on upstream ever doing
      // this itself.
      const source = yield* readSource(fixturePath("correlation-full.feature"))
      const throwingNewId = newIdThatThrows("not an Error, not a GherkinException")

      const error = yield* captureError(
        tryThrow(() => parseDocument(source, "correlation-full.feature", throwingNewId))
      )

      assert.strictEqual(error.reason, "ParseFailed")
      assert.deepStrictEqual(error.line, Option.none())
      assert.include(error.message, "the parser threw without collecting any error")
    }))

  it.effect("wraps a thrown plain Error that is not a GherkinException, collecting it as the sole error", () =>
    Effect.gen(function*() {
      // Same mechanism as above, but the thrown value IS an `Error` — the other half of
      // collectErrors's `thrown instanceof Error ? [thrown] : []` ternary.
      const source = yield* readSource(fixturePath("correlation-full.feature"))
      const throwingNewId = newIdThatThrows(new Error("a plain Error, not a GherkinException"))

      const error = yield* captureError(
        tryThrow(() => parseDocument(source, "correlation-full.feature", throwingNewId))
      )

      assert.strictEqual(error.reason, "ParseFailed")
      assert.deepStrictEqual(error.line, Option.none())
      assert.include(error.message, "a plain Error, not a GherkinException")
    }))

  it.effect("tolerates a bare parse exception that carries no errors array (Pitfall P5)", () =>
    Effect.gen(function*() {
      // Build the genuinely bare shape the way upstream produces it: with `stopAtFirstError`
      // enabled the parser throws an `UnexpectedTokenException` directly instead of collecting
      // into a `CompositeParserException`, so `.errors` is never populated.
      const source = yield* readSource(fixturePath("parse-failed-misplaced-tag.feature"))
      const bare = bareParseException(source)

      assert.isFalse(bare instanceof Errors.CompositeParserException)
      assert.isUndefined((bare as { readonly errors?: unknown }).errors)
      const bareLine = (bare as { readonly location?: { readonly line: number } }).location?.line

      // `parseDocument` constructs its own parser, so the only way to drive the bare shape
      // through it is to make that parser throw one. If the handler ever reads `.errors`
      // unconditionally this call raises a TypeError instead of a LoadFeatureError, and
      // `captureError` dies on it instead of absorbing it.
      const spy = vi.spyOn(GherkinParser.prototype, "parse").mockImplementation(() => {
        throw bare
      })
      const error = yield* captureError(
        tryThrow(() => parseDocument("Feature: unused\n", "bare.feature", IdGenerator.uuid()))
      ).pipe(Effect.ensuring(Effect.sync(() => spy.mockRestore())))

      assert.strictEqual(error.reason, "ParseFailed")
      assert.strictEqual(error.uri, "bare.feature")
      // The bare shape carries its own `.location`, unlike the composite.
      assert.deepStrictEqual(error.line, Option.fromUndefinedOr(bareLine))
      assert.strictEqual(error.cause, bare)
    }))
})
