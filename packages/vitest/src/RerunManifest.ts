/**
 * Reads a rerun manifest — `{ "failed": ["<rerunKey>", ...] }` — written by the copy-paste template
 * script this package documents (`scripts/templates/write-rerun-manifest.mjs`, see README.md's
 * "Rerun failed Scenarios only" recipe) from a PRIOR `vitest run --reporter=json`'s own output
 * (ADR-EC-038). Read SYNCHRONOUSLY with `node:fs`, deliberately not through
 * `@effect-cucumber/gherkin`'s `FileSystem`-backed reader or any other `Effect`: `describeFeature`
 * runs at vitest CONFIG-LOAD/collection time, which is synchronous end to end — the same constraint
 * ADR-EC-026 already recorded for `GherkinTags.ts`'s `globSync` over the async `glob`.
 */
import * as Option from "effect/Option"
import * as Result from "effect/Result"
import * as Schema from "effect/Schema"
import { readFileSync } from "node:fs"

export const defaultRerunManifestPath = ".effect-cucumber/rerun-manifest.json"

/** The manifest's expected shape — decoded synchronously (`Schema.decodeUnknownResult`), never
 * through `Effect`: `describeFeature` runs at vitest CONFIG-LOAD/collection time (see this module's
 * header). `Schema.fromJsonString` folds "parse the JSON text" and "validate its shape" into one
 * schema, so a malformed-JSON failure and a wrong-shape failure share the same code path and the
 * same pre-formatted `SchemaError.message`. */
const RerunManifestSchema = Schema.fromJsonString(
  Schema.Struct({
    failed: Schema.Array(Schema.String)
  })
)

/**
 * `Option.none()` means "no filter" — covers `rerunFailedOnly` being unset, AND the manifest file
 * simply not existing yet (the very first run, before any manifest has ever been written: a
 * rerun-only mode that could not run without a prior successful run of its own would be useless)
 * AND a manifest that fails to parse or does not match the expected shape. Every one of those
 * degrades to "run everything" with a `console.warn` for the two failure cases — never a thrown
 * error — the same "warn, don't silently ignore, and don't fail the Feature either" posture
 * `UndeclaredTagWarning` already established (ADR-EC-026).
 *
 * @param path - the manifest file's path, resolved against `process.cwd()` the same way `node:fs`
 * resolves any relative path
 */
export const readRerunManifest = (path: string): Option.Option<ReadonlySet<string>> => {
  let raw: string
  try {
    raw = readFileSync(path, "utf8")
  } catch {
    // Missing file: the ordinary "no manifest has ever been written for this Feature" case, not a
    // warning-worthy one.
    return Option.none()
  }

  const decoded = Schema.decodeUnknownResult(RerunManifestSchema)(raw)
  if (Result.isFailure(decoded)) {
    console.warn(
      `${JSON.stringify(path)}: MalformedRerunManifest: ${decoded.failure.message} ` +
        `Treating this run as "no filter" — every Scenario will register normally. Regenerate the manifest.`
    )
    return Option.none()
  }

  return Option.some(new Set(decoded.success.failed))
}
