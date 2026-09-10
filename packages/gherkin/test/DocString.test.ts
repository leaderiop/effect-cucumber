/**
 * Tests for `DocString.ts` (ADR-EC-046, BEH-EC-016): `decodeDocString`, mirroring
 * `DataTable.test.ts`'s `decodeHashes` coverage one level shallower — a `DocString` decodes to ONE
 * value, with no row/column to locate, only uri/line.
 */
import * as Data from "effect/Data"
import * as Effect from "effect/Effect"
import * as Option from "effect/Option"
import * as Schema from "effect/Schema"
import { decodeDocString } from "../src/DocString.ts"
import { DocStringError } from "../src/Errors.ts"
import type { DocString } from "../src/StepArguments.ts"
import { assert, describe, it } from "./support/EffectVitestIt.ts"

/** The uri and line every DocString below is located at, so the locator assertions have a target. */
const uri = "features/checkout.feature"
const line = 12

/** Build a `DocString` at the shared `uri`/`line`, mediaType absent unless given. */
const docStringOf = (content: string, mediaType?: string): DocString => ({
  _tag: "DocString",
  content,
  mediaType: Option.fromUndefinedOr(mediaType),
  uri,
  line
})

/**
 * `succeeds`/`fails` below fail the Effect with this instead of a plain `Error`: `@effect/tsgo`'s
 * `globalErrorInEffectFailure` check (ADR-EC-016) flags an untagged `Error` in an Effect's failure
 * channel — the same convention `DataTable.test.ts`/`ExamplesRow.test.ts` already establish.
 */
class UnexpectedOutcome extends Data.TaggedError("UnexpectedOutcome")<{ readonly message: string }> {}

/** A decode that must succeed, as an Effect resolving to the decoded value. */
const succeeds = <A>(effect: Effect.Effect<A, DocStringError>): Effect.Effect<A, UnexpectedOutcome> =>
  Effect.mapError(
    effect,
    (error) =>
      new UnexpectedOutcome({ message: `expected decodeDocString to succeed, but it failed with ${error.reason}` })
  )

/** A decode that must fail, as an Effect resolving to the `DocStringError` it failed with. */
const fails = <A>(effect: Effect.Effect<A, DocStringError>): Effect.Effect<DocStringError, UnexpectedOutcome> =>
  Effect.matchEffect(effect, {
    onFailure: (error) => Effect.succeed(error),
    onSuccess: (value): Effect.Effect<DocStringError, UnexpectedOutcome> =>
      Effect.fail(
        new UnexpectedOutcome({
          message: `expected decodeDocString to fail, but it succeeded with ${JSON.stringify(value)}`
        })
      )
  })

/**
 * Narrows away `undefined`, or throws. A plain function defined OUTSIDE any `Effect.gen` body on
 * purpose — `@effect/tsgo`'s `globalErrorInEffectFailure` check (ADR-EC-016) flags a `new Error(...)`
 * lexically inside an `Effect.gen` generator, even one that's thrown rather than failed/died with;
 * calling a plain helper from inside the generator keeps the construction outside that scope. Copied
 * from `DataTable.test.ts`.
 */
const definedOrThrow = <A>(value: A | undefined, message: string): A => {
  if (value === undefined) {
    throw new Error(message)
  }
  return value
}

describe("decodeDocString", () => {
  const User = Schema.Struct({ name: Schema.String, age: Schema.Number })

  it.effect("decodes a well-formed DocString through Schema.fromJsonString(Struct)", () =>
    Effect.gen(function*() {
      const docString = docStringOf(JSON.stringify({ name: "alice", age: 30 }))
      const value = yield* succeeds(decodeDocString(Schema.fromJsonString(User))(docString))
      assert.deepStrictEqual(value, { name: "alice", age: 30 })
    }))

  it.effect("fails with a located DocStringError naming uri/line on malformed JSON", () =>
    Effect.gen(function*() {
      const docString = docStringOf("not json at all")
      const error = yield* fails(decodeDocString(Schema.fromJsonString(User))(docString))

      assert.instanceOf(error, DocStringError)
      assert.strictEqual(error.reason, "DecodeFailed")
      assert.strictEqual(error.uri, uri)
      assert.deepStrictEqual(error.line, Option.some(line))
      assert.include(error.message, uri)
      assert.include(error.message, String(line))
    }))

  it.effect("quotes the full untruncated content in the message", () =>
    Effect.gen(function*() {
      const longContent = "x".repeat(500)
      const docString = docStringOf(longContent)
      const { message } = yield* fails(decodeDocString(Schema.fromJsonString(User))(docString))

      assert.include(message, longContent)
      assert.isFalse(message.includes("…"))
      assert.isFalse(message.endsWith("..."))
    }))

  it.effect("carries the underlying SchemaError as cause", () =>
    Effect.gen(function*() {
      const docString = docStringOf("not json at all")
      const error = yield* fails(decodeDocString(Schema.fromJsonString(User))(docString))

      const cause = definedOrThrow(
        error.cause as { readonly _tag: string } | undefined,
        "expected the decode failure to carry the underlying SchemaError as its cause"
      )
      const { _tag } = cause
      assert.strictEqual(_tag, "SchemaError")
    }))
})
