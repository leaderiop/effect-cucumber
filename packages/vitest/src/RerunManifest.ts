/**
 * Reads a rerun manifest — `{ "failed": ["<rerunKey>", ...] }` — written by the copy-paste template
 * script this package documents (`scripts/templates/write-rerun-manifest.mjs`, see README.md's
 * "Rerun failed Scenarios only" recipe) from a PRIOR `vitest run --reporter=json`'s own output
 * (ADR-EC-038). Read SYNCHRONOUSLY with `node:fs`, deliberately not through
 * `@effect-cucumber/gherkin`'s `FileSystem`-backed reader or any other `Effect`: `describeFeature`
 * runs at vitest CONFIG-LOAD/collection time, which is synchronous end to end — the same constraint
 * ADR-EC-026 already recorded for `GherkinTags.ts`'s `globSync` over the async `glob`.
 */
import { readFileSync } from "node:fs"

export const defaultRerunManifestPath = ".effect-cucumber/rerun-manifest.json"

const isStringArray = (value: unknown): value is ReadonlyArray<string> =>
  Array.isArray(value) && value.every((entry) => typeof entry === "string")

/**
 * `null` means "no filter" — covers `rerunFailedOnly` being unset, AND the manifest file simply not
 * existing yet (the very first run, before any manifest has ever been written: a rerun-only mode
 * that could not run without a prior successful run of its own would be useless) AND a manifest that
 * fails to parse or does not match the expected shape. Every one of those degrades to "run
 * everything" with a `console.warn` for the two failure cases — never a thrown error — the same
 * "warn, don't silently ignore, and don't fail the Feature either" posture `UndeclaredTagWarning`
 * already established (ADR-EC-026).
 *
 * @param path - the manifest file's path, resolved against `process.cwd()` the same way `node:fs`
 * resolves any relative path
 */
export const readRerunManifest = (path: string): ReadonlySet<string> | null => {
  let raw: string
  try {
    raw = readFileSync(path, "utf8")
  } catch {
    // Missing file: the ordinary "no manifest has ever been written for this Feature" case, not a
    // warning-worthy one.
    return null
  }

  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch (cause) {
    console.warn(
      `${JSON.stringify(path)}: MalformedRerunManifest: could not parse as JSON (${
        cause instanceof Error ? cause.message : String(cause)
      }). Treating this run as "no filter" — every Scenario will register normally. Regenerate the manifest.`
    )
    return null
  }

  const failed = typeof parsed === "object" && parsed !== null && "failed" in parsed
    ? (parsed as { failed: unknown }).failed
    : undefined

  if (!isStringArray(failed)) {
    console.warn(
      `${
        JSON.stringify(path)
      }: MalformedRerunManifest: expected { "failed": string[] }, got something else. Treating this run as "no filter" — every Scenario will register normally. Regenerate the manifest.`
    )
    return null
  }

  return new Set(failed)
}
