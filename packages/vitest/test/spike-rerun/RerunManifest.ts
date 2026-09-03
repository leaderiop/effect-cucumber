/**
 * SPIKE (issue #34): the rerun-manifest FILE — a flat JSON list of `RerunKey.ts` keys for the
 * Scenarios that failed last run. Read by `describeFeature.rerun.ts`'s `rerunFailedOnly` option at
 * REGISTRATION time; written by a separate, out-of-process step
 * (`scripts/spike-write-rerun-manifest.mjs`) that reads vitest's own `--reporter=json` output after
 * a real run — this module has no opinion on HOW the manifest was produced, only on its shape on
 * disk.
 */
import * as fs from "node:fs"
import * as path from "node:path"

export interface RerunManifestFile {
  readonly failed: ReadonlyArray<string>
}

/**
 * @param manifestPath - absolute or cwd-relative path to the manifest JSON file
 * @returns `null` when the file is absent (no manifest yet — e.g. the very first run) OR
 * unparseable (a `console.warn` is emitted for the latter); a `Set` of failed keys otherwise. In
 * both `null` cases the caller's contract is "no filter, run everything" — a corrupt or missing
 * manifest must never be the reason a Scenario silently stops running.
 */
export const readRerunManifest = (manifestPath: string): ReadonlySet<string> | null => {
  let raw: string
  try {
    raw = fs.readFileSync(manifestPath, "utf8")
  } catch {
    return null
  }
  try {
    const parsed = JSON.parse(raw) as RerunManifestFile
    return new Set(parsed.failed)
  } catch (cause) {
    console.warn(
      `rerunFailedOnly: ${manifestPath} could not be parsed as JSON (${
        String(cause)
      }); ignoring it and registering every Scenario, as if rerunFailedOnly were not set.`
    )
    return null
  }
}

/**
 * Overwrites the manifest with exactly `failedKeys` — this run's failures replace last run's,
 * matching cucumber-js's/behave's rerun-file semantics (the file always reflects the LATEST run,
 * not an accumulating history).
 */
export const writeRerunManifest = (manifestPath: string, failedKeys: ReadonlySet<string>): void => {
  fs.mkdirSync(path.dirname(manifestPath), { recursive: true })
  const body: RerunManifestFile = { failed: [...failedKeys].toSorted() }
  fs.writeFileSync(manifestPath, `${JSON.stringify(body, null, 2)}\n`, "utf8")
}
