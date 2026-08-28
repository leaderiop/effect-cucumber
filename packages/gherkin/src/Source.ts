/**
 * Reading `.feature` bytes off disk. This is the ONLY module in `@effect-cucumber/gherkin`
 * that imports `node:fs`, and it exists as a separate one-function module precisely so that
 * it can stay that way.
 *
 * The reason the split is worth a file of its own: `parseFeature(source, uri)` must be usable
 * with no filesystem at all. It is the entry point a Vite `?raw` import feeds, and it is what
 * every correlation and validation test calls. Confining the single `node:fs` import here
 * keeps the package's browser-incompatibility to one file instead of smearing it across the
 * parse pipeline. A later gate script asserts that this file is still the only `node:fs`
 * consumer under `src/`, so a second one is a build failure rather than a silent regression.
 *
 * `node:fs` only resolves because `packages/gherkin/tsconfig.json` opts in with
 * `"types": ["node"]`; the workspace base config sets `"types": []`.
 *
 * On the path argument: it is taken verbatim. No resolution, no canonicalisation, no
 * containment check. The caller already chose the path and already runs in their own process,
 * so no privilege boundary is crossed here and a traversal guard would be security theatre
 * (threat T-02-03, dispositioned `accept`).
 */
import * as fs from "node:fs"
import { LoadFeatureError } from "./Errors.ts"

/**
 * The part of a Node `SystemError` worth naming in a message. Verified: a missing file throws
 * with `code` `"ENOENT"`, a `syscall` of `"open"`, and a `path`.
 */
interface SystemErrorFields {
  readonly code: string
  readonly syscall: string
}

/**
 * A type guard rather than a cast: the caught value is genuinely `unknown`, and `readFileSync`
 * can reject for reasons that are not Node `SystemError`s at all.
 */
const isSystemError = (value: unknown): value is SystemErrorFields => {
  if (typeof value !== "object" || value === null) {
    return false
  }
  return "code" in value && typeof value.code === "string" &&
    "syscall" in value && typeof value.syscall === "string"
}

const describeFailure = (thrown: unknown): string => {
  if (isSystemError(thrown)) {
    return `${thrown.code} (${thrown.syscall})`
  }
  return thrown instanceof Error ? thrown.message : String(thrown)
}

/**
 * Read a `.feature` file as UTF-8 text.
 *
 * Every filesystem failure — a missing file, a directory, a permissions error — leaves this
 * function as a `LoadFeatureError` with reason `MissingFile`. A raw Node `ENOENT` never
 * escapes the package.
 */
export const readFeatureSource = (path: string): string => {
  try {
    return fs.readFileSync(path, "utf8")
  } catch (thrown) {
    throw new LoadFeatureError({
      reason: "MissingFile",
      uri: path,
      message: `Cannot read feature file ${path}: ${describeFailure(thrown)}`,
      cause: thrown
    })
  }
}
