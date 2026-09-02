/**
 * Turn a consumer's own `.feature` files into the tag declarations their runner config needs.
 *
 * This is the config-time half of RUN-05. The runner validates a `--tagsFilter` expression against
 * the tag list declared in `test.tags` REGARDLESS of whether its strict-tags check is on, so a tag
 * that exists in a `.feature` file but not in that list cannot be used to select anything — which is
 * the entirety of ADR-EC-020's "run just one Scenario locally" story. Maintaining that list by hand
 * means every new tag in every `.feature` file is a second edit in a second file, and forgetting it
 * degrades silently from the author's point of view. This helper produces the list from the files
 * themselves:
 *
 * ```ts
 * // vitest.config.ts
 * test: { tags: gherkinTags("features/**\/*.feature") }
 * ```
 *
 * `@skip` and `@only` need no hand-written entry: they are declared like any other tag the moment
 * a `.feature` file carries them. A hand-written entry beside the spread only matters for a tag no
 * file uses yet.
 *
 * (The backslash in that example is an artifact of writing a glob inside a block comment — `*` then
 * `/` would end the comment. Write `features/**` followed by `/*.feature`, with no backslash.)
 *
 * The argument is a GLOB PATTERN, or an array of them — the same value every other glob-consuming
 * Node tool a consumer already runs would accept, and the same shape the underlying library's own
 * `patterns` parameter takes, so there is nothing new to learn here.
 *
 * Six things about this module are not visible from the code.
 *
 * (a) **The pattern is REQUIRED and there is no default.** A helper with a default would scan
 *     whatever directory the config happened to be loaded from, which is an implicit
 *     whole-working-directory walk nobody asked for. Every expansion this module performs was named
 *     by its caller. An empty pattern — `""` or `[]` — THROWS, naming this function, in the same
 *     explanatory style as `Runner.ts`'s `planFor` miss: a helper asked to expand nothing returns
 *     nothing, a config declaring nothing makes every tag in the suite undeclared, and silence is
 *     the failure mode there rather than a convenience.
 *
 * (b) **A pattern that matches nothing returns `[]` and does NOT throw, and that is deliberately
 *     different from (a).** Those are two different situations and only one of them is
 *     unambiguously a mistake. A zero-match pattern is indistinguishable from a project that
 *     legitimately has no `.feature` files yet — a fresh checkout, a package being scaffolded — so
 *     throwing would break a valid config. The residual risk is real and stated rather than hidden:
 *     a MISTYPED pattern silently declares nothing. What compensates for it is downstream and
 *     already shipped — a Scenario carrying a tag the runner does not know about is re-emitted
 *     untagged with a warning naming the file, the Scenario and the tag, one per Scenario, so an
 *     empty declaration list degrades loudly at run time even though it is quiet here.
 *
 * (c) **The sync glob, and not its Promise-returning sibling, because a runner config is evaluated
 *     synchronously at load time.** This is the same constraint that rules out reusing
 *     `@effect-cucumber/gherkin`'s `loadFeature`: `NodeFileSystem.readFileString` suspends
 *     internally and `Effect.runSync` on it throws `AsyncFiberError` — reproduced against the real
 *     package, not assumed. That precedent forces both halves of this module to be synchronous:
 *     `globSync` for discovery and `readFileSync` for reading.
 *
 * (d) **Why a package rather than the platform or a hand-rolled matcher.** `fs.globSync` landed in
 *     Node 22 and this package declares `"node": ">=20"`, so the platform is not an option here.
 *     A hand-written matcher is worse than it looks — character classes, extglobs and brace
 *     expansion are exactly where one goes subtly wrong — so the expansion is delegated to an
 *     audited single-purpose library that this repo's lockfile already resolved at `0.2.17` as a
 *     transitive dependency of the test runner. Declaring it adds a manifest entry and an importer
 *     edge, not a new artifact from the registry. `dot` and `onlyFiles` are passed EXPLICITLY even
 *     though both already match the library's defaults: both are load-bearing (no dotfile trees, no
 *     directory entry handed to `readFileSync`) and pinning them means a future default change
 *     cannot silently widen the scan. Everything else — directory expansion, globstar, brace
 *     expansion, symlink following — is left at the library's defaults, which includes traversing a
 *     symlinked directory inside a matched tree. That is accepted: the caller names the tree, and
 *     the only data leaving this function is `@`-prefixed tag names.
 *
 * (e) **Patterns resolve against `process.cwd()` BY DEFAULT; a config file passes its own
 *     directory as `cwd`.** A relative pattern with no option means "relative to wherever the
 *     runner was invoked", exactly like every other glob-taking tool — and that is the contract a
 *     caller gets wrong when the suite is run from a package directory rather than the repo root.
 *     `options.cwd` fixes the base explicitly: a config passes `fileURLToPath(new URL(".",
 *     import.meta.url))` and the scan no longer depends on the invocation directory. Matches come
 *     back RELATIVE to that base (absolute paths are off), so every match is resolved against the
 *     same base before it is read; the two cannot disagree.
 *
 * (f) **This is a TEXT SCAN, not a parse, and the error direction is what makes that acceptable.**
 *     It does not run the Gherkin compiler and cannot say which Scenario a tag lands on. It does
 *     not need to: the only question a runner config asks is which tag NAMES exist in the suite.
 *     Over-declaring a tag costs nothing — a declared tag no Scenario carries is inert — while
 *     under-declaring one costs a whole file its tests, so the scan is deliberately inclusive.
 *     Its one exception is DocString content, which is prose the author wrote for a step rather
 *     than a tag line, and is tracked out.
 *
 * Unlike every other module in this package, this one is CONSUMER-FACING and is exported from
 * `index.ts`: it is called from a consumer's own config file, not from inside the
 * register → plan → emit pipeline, so there is no internal stage being frozen into the package's
 * contract. It is also a leaf — one external import, no local ones — and imports nothing from the
 * rest of the package.
 */
import * as fs from "node:fs"
import * as path from "node:path"
import { globSync } from "tinyglobby"

/**
 * One entry in a runner config's tag list.
 *
 * Structurally the subset of the runner's own tag-definition type that this helper can produce from
 * a `.feature` file: a name and nothing else. Every other field on that type — description,
 * priority, the inherited test options — is a config-author's editorial choice about a tag, not a
 * fact recoverable from the file the tag appears in, so this module does not invent one.
 * `packages/vitest/test/GherkinTags.types.ts` is where the resulting array is proven to spread into
 * the runner's own array type.
 */
export interface GherkinTagDefinition {
  /** The tag exactly as written in the `.feature` file, `@` prefix included. */
  readonly name: string
}

/**
 * Options for `gherkinTags`. Every field is optional and the empty object is the default behaviour.
 */
export interface GherkinTagsOptions {
  /**
   * The directory relative patterns resolve against. Defaults to `process.cwd()` — note (e). A
   * config file passes its own directory so the scan does not depend on where the runner was invoked.
   */
  readonly cwd?: string
}

/**
 * Which fence, if any, currently opens a DocString — `null` means "not inside one". Both `"""` and
 * `` ``` `` are legal Gherkin fences (see note (f)), but a DocString only closes on the SAME fence
 * that opened it — a bare line of the other fence character (or the runner's own, unbalanced) inside
 * the body is prose, not a closer. Treating either character as a toggle regardless of which one is
 * open desyncs on any DocString containing an odd number of the other fence's lines, silently
 * swallowing every real `@tag` for the rest of the file.
 */
type DocStringFence = "\"\"\"" | "```" | null

const openingFence = (trimmed: string): Exclude<DocStringFence, null> | null =>
  trimmed.startsWith("\"\"\"") ? "\"\"\"" : trimmed.startsWith("```") ? "```" : null

/**
 * Expand `pattern`, scan every matched file for Gherkin tags, and return them de-duplicated and
 * sorted ascending so a config's declared list is stable across runs and across filesystem ordering.
 *
 * @param pattern - a glob pattern, or an array of them, resolved against `options.cwd`, which
 *                  defaults to `process.cwd()` — note (e). Required, with no default; `""` and `[]`
 *                  throw — note (a).
 * @param options - `{ cwd }` to pin the directory the patterns resolve against.
 * @throws Error when the pattern is empty. A pattern that matches no file is NOT an error — note (b).
 */
export const gherkinTags = (
  pattern: string | ReadonlyArray<string>,
  options: GherkinTagsOptions = {}
): ReadonlyArray<GherkinTagDefinition> => {
  const patterns = typeof pattern === "string" ? [pattern] : pattern
  const cwd = options.cwd ?? process.cwd()

  if (patterns.length === 0 || patterns.some((entry) => entry.trim() === "")) {
    throw new Error(
      `gherkinTags: a glob pattern is required and must not be empty (received ${
        JSON.stringify(pattern)
      }). Pass the pattern that matches your .feature files, for example gherkinTags("features/**/*.feature"). There is deliberately no default: a helper that scanned the whole working directory would declare tags nobody asked it to look for, and a helper that returned an empty list here would leave every tag in the suite undeclared without saying so.`
    )
  }

  const names = new Set<string>()

  for (const file of globSync(patterns, { cwd, dot: false, onlyFiles: true })) {
    let fence: DocStringFence = null

    for (const line of fs.readFileSync(path.resolve(cwd, file), "utf8").split(/\r?\n/)) {
      const trimmed = line.trim()

      if (fence === null) {
        const opened = openingFence(trimmed)
        if (opened !== null) {
          fence = opened
          continue
        }
      } else if (trimmed.startsWith(fence)) {
        fence = null
        continue
      }

      if (fence !== null || !trimmed.startsWith("@")) continue

      for (const token of trimmed.split(/\s+/)) {
        if (token.startsWith("@")) names.add(token)
      }
    }
  }

  return [...names].toSorted().map((name) => ({ name }))
}
