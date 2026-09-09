/**
 * Records where a step or hook was written, from `Error.stack`, skipping frames inside this
 * package. Paths may contain parentheses (`test/CallSite.test.ts`).
 */
import * as Order from "effect/Order"
import type { Ordering } from "effect/Ordering"
import * as Str from "effect/String"
import type { DefinitionSite } from "./Registry.ts"

const framePrefix = /^\s+at (.+)$/

const lineAndColumn = /^(.+):(\d+):(\d+)$/

const fileProtocol = "file://"

/**
 * The shared "no call site available" wording — `captureCallSite()`'s own `formatCallSite` uses it,
 * and `Hook.ts` reuses it verbatim (rather than a second, drifting copy) for a `HookEntry` whose
 * `definedAt` is `null` (ADR-EC-052).
 */
export const unrecordedLocation = "an unrecorded location"

const directoryOf = (file: string): string => {
  const lastSeparator = Math.max(file.lastIndexOf("/"), file.lastIndexOf("\\"))
  return lastSeparator === -1 ? file : file.slice(0, lastSeparator + 1)
}

const parseFrame = (frame: string): DefinitionSite | null => {
  const rest = framePrefix.exec(frame)?.[1]
  if (rest === undefined) {
    return null
  }
  // `fnName (location)` when the line ends with `)`, a bare location otherwise. A function name
  // never contains ` (`, so the FIRST ` (` opens the location even when the path has parentheses.
  const opening = rest.endsWith(")") ? rest.indexOf(" (") : -1
  const location = opening === -1 ? rest : rest.slice(opening + 2, -1)
  const matched = lineAndColumn.exec(location)
  if (matched === null) {
    return null
  }
  const [, file, line, column] = matched
  // Unreachable: all three groups are non-optional in the pattern above, so a match implies all
  // three are present.
  if (file === undefined || line === undefined || column === undefined) {
    return null
  }
  return {
    file: file.startsWith(fileProtocol) ? file.slice(fileProtocol.length) : file,
    line: Number(line),
    column: Number(column)
  }
}

/**
 * The site of the call that invoked whatever called this — the first frame outside this module's
 * own directory — or `null` when the stack offers none.
 */
export const captureCallSite = (): DefinitionSite | null => {
  const stack = new Error().stack
  if (stack === undefined) {
    return null
  }
  // Drop the header line. The error carries no message, so the header is exactly one line.
  const frames = stack.split("\n").slice(1)
  let selfDir: string | null = null
  for (const frame of frames) {
    const site = parseFrame(frame)
    if (site === null) {
      continue
    }
    if (selfDir === null) {
      selfDir = directoryOf(site.file)
      continue
    }
    if (!site.file.startsWith(selfDir)) {
      return site
    }
  }
  return null
}

/**
 * `site` as `file:line:column`, or the shared unrecorded-location wording when there is none.
 */
export const formatCallSite = (site: DefinitionSite | null): string =>
  site === null ? unrecordedLocation : `${site.file}:${site.line}:${site.column}`

/**
 * File, then line, then column — locale-aware on the file path, matching `String.prototype.localeCompare`'s
 * original semantics exactly (`Order.String`'s plain `<` is not equivalent).
 */
const definitionSiteOrder: Order.Order<DefinitionSite> = Order.Struct({
  file: Order.make<string>((left, right) => Str.localeCompare(right)(left)),
  line: Order.Number,
  column: Order.Number
})

/**
 * Rank two definition sites: by file, then line, then column, with an absent site last.
 */
export const compareCallSites = (left: DefinitionSite | null, right: DefinitionSite | null): Ordering => {
  if (left === null) {
    return right === null ? 0 : 1
  }
  if (right === null) {
    return -1
  }
  return definitionSiteOrder(left, right)
}
