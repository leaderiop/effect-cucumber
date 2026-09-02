/**
 * One test per Group B row of the fixture table, each asserting the DISTINCT `reason` tag its
 * failure carries.
 */
import { AstBuilder, Errors, GherkinClassicTokenMatcher, Parser as GherkinParser } from "@cucumber/gherkin"
import { IdGenerator } from "@cucumber/messages"
import * as NodeFileSystem from "@effect/platform-node/NodeFileSystem"
import * as Effect from "effect/Effect"
import * as FileSystem from "effect/FileSystem"
import * as Option from "effect/Option"
import * as PlatformError from "effect/PlatformError"
import { fileURLToPath } from "node:url"
import { describe, expect, it, vi } from "vitest"
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

/** `readFeatureSource` provided its concrete FileSystem, run to a Promise. */
const readSource = (path: string) =>
  Effect.runPromise(readFeatureSource(path).pipe(Effect.provide(NodeFileSystem.layer)))

/**
 * Run `call`, require that it rejected with a `LoadFeatureError`, and hand the error back so the
 * test can interrogate `.reason`, `.uri`, `.line` and `.cause`.
 *
 * Re-throwing anything that is NOT a `LoadFeatureError` is deliberate: a leaked Node `ENOENT`
 * or a raw `CompositeParserException` must fail the test loudly rather than be swallowed by a
 * catch-all.
 */
const captureError = async (call: () => unknown): Promise<LoadFeatureError> => {
  try {
    await call()
  } catch (thrown) {
    if (thrown instanceof LoadFeatureError) {
      return thrown
    }
    throw thrown
  }
  throw new Error("expected a LoadFeatureError, but the call returned normally")
}

/** Group B fixtures are always driven through the same read-then-parse pipeline. */
const parseFixture = async (name: string): Promise<unknown> =>
  parseDocument(await readSource(fixturePath(name)), name, IdGenerator.uuid())

const failureOf = (name: string): Promise<LoadFeatureError> => captureError(() => parseFixture(name))

describe("readFeatureSource", () => {
  it("F16 wraps a missing file as MissingFile naming the path and the ENOENT cause", async () => {
    const missing = fixturePath("this-fixture-does-not-exist.feature")
    const error = await captureError(() => readSource(missing))

    expect(error.reason).toBe("MissingFile")
    expect(error.uri).toBe(missing)
    expect(error.line).toEqual(Option.none())
    expect(error.message).toContain(missing)
    // `.cause` is the PlatformError, not the raw Node error directly: the real ENOENT details
    // live one level deeper, at `.cause.cause` — confirmed by reproduction against the real
    // `NodeFileSystem`, not assumed.
    const platformError = error.cause as { readonly cause?: { readonly code?: unknown } }
    expect(platformError.cause?.code).toBe("ENOENT")
  })

  it("reports a path that exists but is not a readable file as ReadFailed, not MissingFile", async () => {
    const directory = fixturePath("")
    const error = await captureError(() => readSource(directory))

    expect(error.reason).toBe("ReadFailed")
    expect(error.uri).toBe(directory)
    expect(error.cause).toBeDefined()
  })

  it("reports a permission failure as PermissionDenied, discriminating on the PlatformError's own tag", async () => {
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
    const error = await captureError(() =>
      Effect.runPromise(readFeatureSource("/locked/feature.feature").pipe(Effect.provide(denied)))
    )

    expect(error.reason).toBe("PermissionDenied")
    expect(error.message).toContain("permission denied")
  })
})

describe("parseDocument", () => {
  it("F17 reports the first error's line for a misplaced tag and collapses the cascade", async () => {
    const error = await failureOf("parse-failed-misplaced-tag.feature")

    expect(error.reason).toBe("ParseFailed")
    // The line comes from the FIRST collected error. Reading the composite's own `.location`
    // would give `Option.none()` here, which is the bug this assertion exists to catch.
    expect(Option.isSome(error.line)).toBe(true)
    expect(error.line).toEqual(Option.some(4))
    expect(error.message).toMatch(/2 further parse error\(s\) followed from this one/)
  })

  it("F18 gives an unknown dialect its own reason, distinct from a generic parse failure", async () => {
    const error = await failureOf("unknown-dialect.feature")

    expect(error.reason).toBe("UnknownDialect")
    expect(error.reason).not.toBe("ParseFailed")
    expect(error.line).toEqual(Option.some(1))
    expect(error.cause instanceof Errors.CompositeParserException).toBe(true)
  })

  it("F18 rejects a prototype-key dialect header as UnknownDialect rather than a TypeError-backed ParseFailed", async () => {
    const error = await failureOf("unknown-dialect-proto.feature")

    expect(error.reason).toBe("UnknownDialect")
    expect(error.line).toEqual(Option.some(1))
    expect(error.message).toContain("constructor")
  })

  it("F10 wraps an inconsistent DataTable cell count as ParseFailed", async () => {
    const error = await failureOf("parse-failed-inconsistent-cells.feature")

    expect(error.reason).toBe("ParseFailed")
    expect(error.line).toEqual(Option.some(8))
  })

  it("F15 wraps a typo'd step keyword written after a valid step as ParseFailed", async () => {
    const error = await failureOf("parse-failed-typo-keyword-after-step.feature")

    expect(error.reason).toBe("ParseFailed")
    expect(error.line).toEqual(Option.some(5))
  })

  it("F20 wraps a feature-level Background placed after a Rule as ParseFailed", async () => {
    const error = await failureOf("parse-failed-background-after-rule.feature")

    expect(error.reason).toBe("ParseFailed")
    expect(error.line).toEqual(Option.some(8))
  })

  it("F12 reports a comment-only file as NoFeature rather than parsing it to nothing", async () => {
    const error = await failureOf("no-feature.feature")

    expect(error.reason).toBe("NoFeature")
    expect(error.line).toEqual(Option.none())
    expect(error.cause).toBeUndefined()
  })

  it("F12 reports an all-blank-lines source as NoFeature, never scanning for a language header", async () => {
    // findPrototypeKeyLanguageHeader's line-scan `continue`s past every blank line looking for the
    // first non-blank one to test as a `# language:` header; a source with NO non-blank line at
    // all falls off the end of that loop, distinct from `no-feature.feature`'s comment line (which
    // IS non-blank, so it exits the loop one statement earlier).
    const error = await captureError(() => parseDocument("   \n  \n", "blank.feature", IdGenerator.uuid()))

    expect(error.reason).toBe("NoFeature")
    expect(error.line).toEqual(Option.none())
  })

  it("no raw gherkin or Node exception escapes for any Group B fixture", async () => {
    const fixtures = [
      "parse-failed-misplaced-tag.feature",
      "unknown-dialect.feature",
      "parse-failed-inconsistent-cells.feature",
      "parse-failed-typo-keyword-after-step.feature",
      "parse-failed-background-after-rule.feature",
      "no-feature.feature"
    ]
    // Independent fixtures — safe (and faster) to run concurrently rather than sequentially.
    const errors = await Promise.all(fixtures.map((name) => failureOf(name)))
    const reasons = errors.map((error) => error.reason)

    expect(reasons).toEqual([
      "ParseFailed",
      "UnknownDialect",
      "ParseFailed",
      "ParseFailed",
      "ParseFailed",
      "NoFeature"
    ])
  })

  it("F21 positive control: a well-formed feature parses and compiles to at least one pickle", async () => {
    // Without this, a `parseDocument` that rejected every input would pass every other test in
    // this file.
    const newId = IdGenerator.uuid()
    const uri = "correlation-full.feature"
    const document = parseDocument(await readSource(fixturePath(uri)), uri, newId)

    expect(document.feature?.name).toBe("correlation across every nesting level")

    const pickles = compilePickles(document, uri, newId)
    expect(pickles.length).toBeGreaterThan(0)
    expect(pickles[0]?.steps.length).toBeGreaterThan(0)
  })

  it("wraps a compile()-time Error as ParseFailed, message taken from .message", async () => {
    // `compile()` calls `newId()` once per pickle; a `newId` that throws is a controlled way to
    // exercise compilePickles's catch without malforming the document upstream produced.
    const uri = "correlation-full.feature"
    const document = parseDocument(await readSource(fixturePath(uri)), uri, IdGenerator.uuid())

    expect(() => compilePickles(document, uri, newIdThatThrows(new Error("boom")))).toThrowError(
      expect.objectContaining({ reason: "ParseFailed", message: expect.stringContaining("boom") })
    )
  })

  it("wraps a compile()-time non-Error throw as ParseFailed, message taken from String(thrown)", async () => {
    const uri = "correlation-full.feature"
    const document = parseDocument(await readSource(fixturePath(uri)), uri, IdGenerator.uuid())

    expect(() => compilePickles(document, uri, newIdThatThrows("not an Error instance"))).toThrowError(
      expect.objectContaining({ reason: "ParseFailed", message: expect.stringContaining("not an Error instance") })
    )
  })

  it("wraps a thrown non-Error, non-GherkinException value with no line and no collected errors", async () => {
    // `AstBuilder` calls `this.newId()` while building nodes, DURING `parser.parse()`, and upstream's
    // own `handleExternalError` re-throws anything it does not recognise verbatim (checked against
    // the installed @cucumber/gherkin source) — so a `newId` that throws a bare string is a
    // controlled way to reach `collectErrors`/`lineOf` with a `thrown` that is neither an `Error`
    // nor a `GherkinException`, without depending on upstream ever doing this itself.
    const source = await readSource(fixturePath("correlation-full.feature"))
    const throwingNewId = newIdThatThrows("not an Error, not a GherkinException")

    const error = await captureError(() => parseDocument(source, "correlation-full.feature", throwingNewId))

    expect(error.reason).toBe("ParseFailed")
    expect(error.line).toEqual(Option.none())
    expect(error.message).toContain("the parser threw without collecting any error")
  })

  it("wraps a thrown plain Error that is not a GherkinException, collecting it as the sole error", async () => {
    // Same mechanism as above, but the thrown value IS an `Error` — the other half of
    // collectErrors's `thrown instanceof Error ? [thrown] : []` ternary.
    const source = await readSource(fixturePath("correlation-full.feature"))
    const throwingNewId = newIdThatThrows(new Error("a plain Error, not a GherkinException"))

    const error = await captureError(() => parseDocument(source, "correlation-full.feature", throwingNewId))

    expect(error.reason).toBe("ParseFailed")
    expect(error.line).toEqual(Option.none())
    expect(error.message).toContain("a plain Error, not a GherkinException")
  })

  it("tolerates a bare parse exception that carries no errors array (Pitfall P5)", async () => {
    // Build the genuinely bare shape the way upstream produces it: with `stopAtFirstError`
    // enabled the parser throws an `UnexpectedTokenException` directly instead of collecting
    // into a `CompositeParserException`, so `.errors` is never populated.
    const source = await readSource(fixturePath("parse-failed-misplaced-tag.feature"))
    const bare: unknown = ((): unknown => {
      const parser = new GherkinParser(new AstBuilder(IdGenerator.uuid()), new GherkinClassicTokenMatcher())
      parser.stopAtFirstError = true
      try {
        parser.parse(source)
      } catch (thrown) {
        return thrown
      }
      throw new Error("expected stopAtFirstError parsing to throw a bare exception")
    })()

    expect(bare instanceof Errors.CompositeParserException).toBe(false)
    expect((bare as { readonly errors?: unknown }).errors).toBe(undefined)
    const bareLine = (bare as { readonly location?: { readonly line: number } }).location?.line

    // `parseDocument` constructs its own parser, so the only way to drive the bare shape
    // through it is to make that parser throw one. If the handler ever reads `.errors`
    // unconditionally this call raises a TypeError instead of a LoadFeatureError, and
    // `captureError` re-throws it.
    const spy = vi.spyOn(GherkinParser.prototype, "parse").mockImplementation(() => {
      throw bare
    })
    try {
      const error = await captureError(() => parseDocument("Feature: unused\n", "bare.feature", IdGenerator.uuid()))

      expect(error.reason).toBe("ParseFailed")
      expect(error.uri).toBe("bare.feature")
      // The bare shape carries its own `.location`, unlike the composite.
      expect(error.line).toEqual(Option.fromUndefinedOr(bareLine))
      expect(error.cause).toBe(bare)
    } finally {
      spy.mockRestore()
    }
  })
})
