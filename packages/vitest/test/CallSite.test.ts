/**
 * D-03's capture mechanism, proven at runtime: the site a step definition records is the AUTHOR's
 * own `Given`/`When`/`Then` line, not a line inside this package.
 *
 * The defect this file exists to catch is silent in every other check. `captureCallSite` returning
 * frame 0 — its own line inside `src/CallSite.ts` — compiles, type-checks, lints, and produces a
 * perfectly well-formed `{ file, line, column }` for every step in the repo. Every structural
 * assertion ("is an object", "has a numeric line", "is not null") passes against it. The only thing
 * that separates a correct capture from a confidently wrong one is asserting the EXACT file and the
 * EXACT line the call was written on, which is why the first test below hard-codes a line number and
 * says so in a comment rather than deriving it from anything.
 *
 * The ordering half has the same shape. `compareCallSites` comparing `line` as a string still
 * returns a total, deterministic, `sort`-compatible order — it just puts line 10 before line 9,
 * which reads as a plausible ordering right up until an ambiguous-step error lists its matches in
 * an order the reader cannot explain. Asserting "the result is sorted" or "the result has three
 * elements" passes against it; asserting 9 comes before 10 does not.
 *
 * Mutation-tested (both performed, then reverted, both confirmed failing):
 * - A. `captureCallSite` returns frame 0 instead of the first frame outside its own directory →
 *      the caller-line test fails, reporting a `file` ending in `src/CallSite.ts`.
 * - B. `compareCallSites` compares `line` with `String(...)` comparison instead of subtraction →
 *      the 9-before-10 test fails.
 *
 * ## `expect` in every test here
 *
 * All of these are synchronous and none uses `it.effect`, so oxlint's `vitest/no-standalone-expect`
 * is satisfied by `expect` called directly inside `it`. `test/Step.test.ts`'s header explains when
 * the `assert` form is required instead; nothing in this file meets that condition.
 *
 * ## Imports
 *
 * `../src/CallSite.ts` directly, never `../src/index.ts`: `effect/no-import-from-barrel-package`
 * runs with `checkRelativeIndexImports: true` and fails `pnpm lint` on a relative value-import whose
 * basename is `index.*`. `CallSite` is not in that barrel anyway (CallSite.ts's closing note).
 */
import { describe, expect, it } from "@effect/vitest"
import { captureCallSite, compareCallSites, type DefinitionSite, formatCallSite } from "../src/CallSite.ts"

/** A recorded site, spelled once so the ordering tests read as data rather than as object literals. */
const site = (file: string, line: number, column: number): DefinitionSite => ({ file, line, column })

/**
 * Stand in for `src/`'s own registrar: a helper OUTSIDE `CallSite.ts` that calls `captureCallSite`.
 *
 * POSITION-SENSITIVE. `capturedFromLine` below is the literal line number of the `captureCallSite()`
 * call in the arrow beneath this comment, and `capturedFromColumn` its literal column. Editing
 * anything above this point in the file moves them and the first test fails until both literals are
 * updated. That brittleness is deliberate and is the whole assertion: an off-by-one in frame
 * selection, or a hoist of the capture out of the caller, changes exactly these two numbers.
 */
const captureFromThisFile = (): DefinitionSite | null => captureCallSite()
const capturedFromLine = 52
const capturedFromColumn = 58

/**
 * Run `body` with the global `Error` replaced by one whose instances carry `stackText` verbatim.
 *
 * The only way to reach `captureCallSite`'s absent-site branches and its tolerance for the frame
 * shapes this runtime does not happen to produce here. A real stack taken inside vitest always has
 * a frame outside `src/`, and never contains a `file://` frame at the depth that matters, so those
 * cases cannot be provoked by calling the function normally. The swap is restored in a `finally`
 * and the window is a single synchronous call.
 */
const withStubbedErrorStack = <A>(stackText: string, body: () => A): A => {
  const RealError = globalThis.Error
  class StubError extends RealError {
    override stack = stackText
  }
  globalThis.Error = StubError as unknown as ErrorConstructor
  try {
    return body()
  } finally {
    globalThis.Error = RealError
  }
}

describe("captureCallSite returns the caller's frame, not its own", () => {
  it("names this test file and the exact line the call was written on", () => {
    const captured = captureFromThisFile()

    // THE load-bearing assertion, and the one mutation A fails: returning frame 0 gives a file
    // ending in `src/CallSite.ts` and a line inside that module. Both halves are asserted — the
    // file alone would still pass for a helper defined elsewhere in this file.
    expect(captured?.file.endsWith("CallSite.test.ts")).toBe(true)
    expect(captured?.line).toBe(capturedFromLine)
    expect(captured?.column).toBe(capturedFromColumn)
  })

  it("skips a frame carrying no line:column rather than crashing on it", () => {
    const captured = withStubbedErrorStack(
      [
        "Error",
        "    at captureCallSite (/repo/packages/vitest/src/CallSite.ts:3:17)",
        "    at new Promise (<anonymous>)",
        "    at Given (/repo/packages/vitest/test/example.test.ts:12:5)"
      ].join("\n"),
      captureCallSite
    )

    expect(captured).toEqual(site("/repo/packages/vitest/test/example.test.ts", 12, 5))
  })

  it("strips a file:// prefix so stored and rendered sites use one form", () => {
    const captured = withStubbedErrorStack(
      [
        "Error",
        "    at captureCallSite (file:///repo/packages/vitest/src/CallSite.ts:3:17)",
        "    at run (file:///repo/packages/vitest/test/example.test.ts:302:11)"
      ].join("\n"),
      captureCallSite
    )

    expect(formatCallSite(captured)).toBe("/repo/packages/vitest/test/example.test.ts:302:11")
  })
})

describe("captureCallSite reports absence rather than fabricating a site", () => {
  it("returns null when the stack carries no frames at all", () => {
    expect(withStubbedErrorStack("Error", captureCallSite)).toBeNull()
  })

  it("returns null when every frame lives in its own directory", () => {
    const captured = withStubbedErrorStack(
      [
        "Error",
        "    at captureCallSite (/repo/packages/vitest/src/CallSite.ts:3:17)",
        "    at registrar (/repo/packages/vitest/src/describeFeature.ts:132:5)"
      ].join("\n"),
      captureCallSite
    )

    // Not a contrived case: this is exactly the shape a `dist/` build produces, where every
    // internal module shares one directory. Returning `describeFeature.js`'s line there would be
    // worse than returning nothing, because it reads as a real answer.
    expect(captured).toBeNull()
  })
})

describe("formatCallSite renders a site, or says plainly that there is none", () => {
  it("returns the shared unrecorded-location wording for an absent site", () => {
    // The literal string, not a re-export of the constant: `packages/gherkin/src/ParameterTypes.ts`
    // uses the same wording for the same idea, and the two packages' messages must read alike.
    expect(formatCallSite(null)).toBe("an unrecorded location")
  })

  it("renders file:line:column for a recorded site", () => {
    expect(formatCallSite(site("/repo/packages/vitest/test/example.test.ts", 12, 5))).toBe(
      "/repo/packages/vitest/test/example.test.ts:12:5"
    )
  })
})

describe("compareCallSites gives a total, numeric, deterministic order", () => {
  it("puts line 9 before line 10 in the same file", () => {
    const nine = site("/repo/a.ts", 9, 1)
    const ten = site("/repo/a.ts", 10, 1)

    // Mutation B fails here and nowhere else. A string comparison of "9" and "10" is a perfectly
    // stable order — it is simply the wrong one, and no other assertion in this file can see it.
    expect([ten, nine].toSorted(compareCallSites)).toEqual([nine, ten])
  })

  it("orders by file first, then line, then column", () => {
    const a = site("/repo/a.ts", 99, 99)
    const b1 = site("/repo/b.ts", 1, 2)
    const b2 = site("/repo/b.ts", 1, 3)
    const b3 = site("/repo/b.ts", 2, 1)

    // `a`'s line and column are both larger than every `b`, so a comparator that consulted line
    // before file would put it last instead of first.
    expect([b3, b2, b1, a].toSorted(compareCallSites)).toEqual([a, b1, b2, b3])
  })

  it("sorts an absent site after every recorded one and treats two absent sites as equal", () => {
    const first = site("/repo/a.ts", 1, 1)
    const second = site("/repo/b.ts", 1, 1)

    expect([null, second, null, first].toSorted(compareCallSites)).toEqual([first, second, null, null])
    expect(compareCallSites(null, null)).toBe(0)
  })
})
