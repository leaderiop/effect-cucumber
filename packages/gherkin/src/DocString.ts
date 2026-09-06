/**
 * `decodeDocString` (ADR-EC-046) — the DocString counterpart of `DataTable.ts`'s `decodeHashes` and
 * `ExamplesRow.ts`'s `decodeExamplesRow`, one level shallower than both: a `DocString` decodes to
 * ONE value with no row/column to locate, only the uri/line `StepArguments.ts` already carries on
 * it. A standalone function, not a method on `DocString`, for the same reason `decodeHashes` is not
 * a method on `DataTable`: `StepArguments.ts`'s own header states every function there is total,
 * with no failure surface, so decode logic that CAN fail needs its own module.
 */
import * as Effect from "effect/Effect"
import * as Option from "effect/Option"
import * as Schema from "effect/Schema"
import { DocStringError } from "./Errors.ts"
import type { DocString } from "./StepArguments.ts"

/**
 * Build a `DocStringError` naming the DocString's own uri/line, quoting its content WHOLE — no
 * ellipsis, no truncation, per `Errors.ts`'s note (b) — the same policy `DataTable.ts`'s
 * `rowDecodeFailed` and `ExamplesRow.ts`'s `rowDecodeFailed` already follow.
 */
const docStringDecodeFailed = (docString: DocString, schemaError: Schema.SchemaError): DocStringError =>
  new DocStringError({
    reason: "DecodeFailed",
    uri: docString.uri,
    line: Option.some(docString.line),
    message:
      `The DocString at ${docString.uri}:${docString.line} failed to decode: ${schemaError.message} The content was ${
        JSON.stringify(docString.content)
      }.`,
    cause: schemaError
  })

/**
 * Decode a step's DocString `content` through a `Schema`, naming the DocString's uri/line on
 * failure (ADR-EC-046, mirroring `decodeHashes`/`decodeExamplesRow`, ADR-EC-008/ADR-EC-032). The
 * type parameter mirrors `Schema.decodeUnknownEffect`'s own, so a schema's decoding services
 * propagate into the resulting Effect's `R` channel rather than being erased to `never`.
 */
export const decodeDocString =
  <S extends Schema.Constraint>(schema: S) =>
  (docString: DocString): Effect.Effect<S["Type"], DocStringError, S["DecodingServices"]> =>
    Effect.mapError(
      Schema.decodeUnknownEffect(schema)(docString.content),
      (schemaError) => docStringDecodeFailed(docString, schemaError)
    )
