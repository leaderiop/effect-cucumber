/**
 * Where a step definition was written — captured at registration time from the runtime stack.
 *
 * D-03 orders an ambiguous-step error's list of matching patterns by source location, so that the
 * reader is pointed at the two `Given`s to go reconcile rather than handed an order that depends on
 * which module vitest happened to import first. Nothing in this repo threaded a source location
 * through the DSL before this module: `ParameterTypeDefinition.definedAt` one package over is
 * caller-supplied, and no stack-reading code of any kind existed in either package's `src` tree.
 * This is the mechanism that closes that gap, and `test/CallSite.test.ts` is the only thing in the
 * repo that can tell a correct capture from a confidently wrong one.
 *
 * Three things about this module are not visible from the code.
 *
 * (a) **Frame selection is by DIRECTORY, never by a frame count.** The obvious form — "the caller is
 *     frame 2" — is true today and silently wrong tomorrow. It holds only while exactly one function
 *     sits between the author's `Given(...)` and this module; the moment `describeFeature`'s
 *     registrar gains a wrapper, or `Step.ts`'s normalisation grows a helper, frame 2 becomes a line
 *     inside this package. The failure is not an exception and not a type error: every step in the
 *     suite gets a well-formed `{ file, line, column }` naming `describeFeature.ts`, the ambiguous
 *     error still renders, and its ordering is still deterministic — it just describes this library
 *     instead of the user's code. So `selfDir` is derived from frame 0 (always `captureCallSite`
 *     itself) at capture time, and the first frame outside that directory wins. That also keeps
 *     working from `dist/`, where every internal module shares one directory and a frame count would
 *     be off by a different amount again. Mutation record A in the test file is the standing proof.
 *
 * (b) **`new Error().stack`, and NOT V8's dedicated stack-capture helper on the `Error` constructor
 *     — the one `@types/node` declares and `lib.es5.d.ts` does not.** That helper is a V8 extension,
 *     and `packages/vitest/tsconfig.json` inherits `types: []` from `tsconfig.base.json`, so it does
 *     not type-check here at all; adding `types: ["node"]` to reach it would pull ambient Node
 *     globals into a package that otherwise needs none. Its name is deliberately never spelled out
 *     anywhere in this file, because an acceptance criterion greps for that name to prove the helper
 *     is unused, and a grep cannot tell a use from an explanation of a non-use (the same collision
 *     `packages/gherkin/test/expressions-pin.test.ts` works around). `Error.stack` IS typed, by
 *     `lib.es5.d.ts`, and is what this module reads. `Error.stackTraceLimit` is likewise untyped here
 *     and is deliberately not mutated: its default of 10 in this runtime is more than enough, since
 *     the caller's frame is two or three deep, and a global mutation would leak into every other
 *     stack in the process.
 *
 * (c) **This module's ONE import is a type, it points at `Registry.ts`, and the direction is the
 *     whole reason `DefinitionSite` is declared over there rather than here.** `Registry.ts` note (c)
 *     states that it "deliberately has no dependencies of any kind", with an acceptance criterion
 *     asserting its import count is zero — so the type has to live in the container and be borrowed
 *     by the leaf, not the reverse. Moving the declaration back here to "keep the capture
 *     self-contained" inverts that and breaks the criterion. There is no cycle either way, because
 *     `Registry.ts` imports nothing.
 *
 *     Absence is `null` and not an `Option` for the same reason: the `Option` spelling would pull
 *     `effect/Option` into a type that ends up on `StepDefinition`. `null` is already this package's
 *     spelling for real absence — `RegistryScope.name` is `string | null` and not an optional
 *     property, for the `exactOptionalPropertyTypes` reason given there.
 *
 * `captureCallSite` must be called from the frame whose location you want — see
 * `describeFeature.ts`'s registrar, where the call sits directly inside the arrow the author invokes
 * as `Given`/`When`/`Then`. Hoisting it to a variable or to an enclosing scope captures that
 * enclosing scope instead, silently.
 *
 * Not re-exported from `packages/vitest/src/index.ts`. A definition site is an internal stage of
 * `describeFeature`, exactly as the registry behind it is (`Registry.ts` note (d)); publishing it
 * would freeze the capture's shape into the package's contract before the ambiguous-step error that
 * consumes it exists.
 */
import type { DefinitionSite } from "./Registry.ts"

/**
 * One V8 stack frame, split into its location and its line and column.
 *
 * Anchored at both ends and applied one line at a time, against a stack that `Error.stackTraceLimit`
 * caps at ten frames (threat T-06-01-01). The two location groups are `[^()]`-classes rather than
 * `.`, which is not cosmetic: it makes the split point — the first ` (` — unambiguous, so the engine
 * has no alternative partition to backtrack through. Widening either to `.*`/`.+` reintroduces
 * exactly that ambiguity.
 *
 * The three frame shapes this runtime actually produces are all matched:
 *
 *     at fnName (/abs/path/File.ts:3:17)
 *     at /abs/path/file.test.ts:6:20
 *     at fnName (file:///abs/path/x.js:302:11)
 *
 * and the fourth, `at new Promise (<anonymous>)`, yields no match because it carries no
 * `line:column` — which is why the caller SKIPS a non-matching line instead of stopping at it.
 */
const frameLocation = /^\s+at (?:[^()]* \()?([^()]+):(\d+):(\d+)\)?$/

/** The ESM scheme V8 prefixes to a frame under `node_modules`, stripped so one form is compared. */
const fileProtocol = "file://"

/** The fallback wording for a definition that has no recorded site — see `formatCallSite`. */
const unrecordedLocation = "an unrecorded location"

/**
 * `file` up to and including its last path separator, or `file` itself if it has none.
 *
 * Both separators are accepted. On Windows a frame reads `C:\repo\src\CallSite.ts`, and matching
 * only `/` would leave `selfDir` equal to the whole path, so frame 0's own module would be the first
 * frame not starting with it and `captureCallSite` would return its own line on that platform alone.
 */
const directoryOf = (file: string): string => {
  const lastSeparator = Math.max(file.lastIndexOf("/"), file.lastIndexOf("\\"))
  return lastSeparator === -1 ? file : file.slice(0, lastSeparator + 1)
}

/** One stack line as a site, or `null` when it carries no `line:column` to read. */
const parseFrame = (frame: string): DefinitionSite | null => {
  const matched = frameLocation.exec(frame)
  if (matched === null) {
    return null
  }
  const [, file, line, column] = matched
  // Unreachable: all three groups are non-optional in the pattern above, so a match implies all
  // three are present. The check exists because `noUncheckedIndexedAccess` types the lookups as
  // possibly-undefined, and the alternative is three non-null assertions.
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
 * The site of the call that invoked whatever called this — the first frame outside this module's own
 * directory — or `null` when the stack offers none.
 *
 * `null` means the capture genuinely failed (no stack, or nothing outside this package), never "not
 * captured on purpose". Callers render it through `formatCallSite`, which says so in words rather
 * than printing an empty `:` pair.
 *
 * The explicit return annotation is required, not stylistic: `composite: true` demands it for
 * declaration emit on anything exported.
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
      // The first parseable frame is always `captureCallSite` itself — note (a).
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
 *
 * The wording is `packages/gherkin/src/ParameterTypes.ts`'s `unrecordedLocation` verbatim, so a
 * reader who has already met "an unrecorded location" in a `DuplicateParameterTypeName` message
 * recognises it here instead of learning a second phrasing for the same idea.
 */
export const formatCallSite = (site: DefinitionSite | null): string =>
  site === null ? unrecordedLocation : `${site.file}:${site.line}:${site.column}`

/**
 * Rank two definition sites: by file, then line, then column, with an absent site last.
 *
 * Returns a number suitable for `Array.prototype.toSorted`. The line and column comparisons are
 * SUBTRACTION and must stay so — comparing them as strings still yields a total, stable, plausible
 * order, one that simply puts line 10 before line 9. Mutation record B in `test/CallSite.test.ts` is
 * the standing proof; nothing else in the repo can see the difference.
 *
 * Written with native comparisons rather than the `combineAll` combinator from Effect's own ordering
 * module, which would be the idiomatic spelling of exactly this. That combinator is confirmed to
 * THROW in this build (`effect@4.0.0-rc.112`); `packages/gherkin/src/Validate.ts`'s sort carries the
 * same note for the same reason. Revisit when the rc moves, not before. As in note (b), the module's
 * name is deliberately not written out here — an acceptance criterion greps for it to prove this
 * file does not import it.
 */
export const compareCallSites = (left: DefinitionSite | null, right: DefinitionSite | null): number => {
  if (left === null) {
    return right === null ? 0 : 1
  }
  if (right === null) {
    return -1
  }
  const byFile = left.file.localeCompare(right.file)
  if (byFile !== 0) {
    return byFile
  }
  const byLine = left.line - right.line
  return byLine === 0 ? left.column - right.column : byLine
}
