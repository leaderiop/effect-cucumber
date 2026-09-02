/**
 * Tests for `CallSite`.
 */
import { describe, expect, it } from "@effect/vitest"
import { captureCallSite, compareCallSites, formatCallSite } from "../src/CallSite.ts"
import type { DefinitionSite } from "../src/Registry.ts"

// A recorded site, spelled once so the ordering tests read as data rather than as object literals.
const site = (file: string, line: number, column: number): DefinitionSite => ({ file, line, column })

// Stand in for `src/`'s own registrar: a helper OUTSIDE `CallSite.ts` that calls `captureCallSite`.
const captureFromThisFile = (): DefinitionSite | null => captureCallSite()
const capturedFromLine = 12
const capturedFromColumn = 58

// Run `body` with the global `Error` replaced by one whose instances carry `stackText` verbatim.
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

    // THE load-bearing assertion, and the one mutation A fails: returning frame 0 gives a file ending in
    // `src/CallSite.ts` and a line inside that module.
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

  it("reads a path containing parentheses, in both the named and the bare frame form", () => {
    const named = withStubbedErrorStack(
      [
        "Error",
        "    at captureCallSite (/repo/packages/vitest/src/CallSite.ts:3:17)",
        "    at Given (/Users/x/My (work)/steps.test.ts:3:4)"
      ].join("\n"),
      captureCallSite
    )
    const bare = withStubbedErrorStack(
      [
        "Error",
        "    at captureCallSite (/repo/packages/vitest/src/CallSite.ts:3:17)",
        "    at /Users/x/My (work)/steps.test.ts:3:4"
      ].join("\n"),
      captureCallSite
    )

    // A first-`(` split reads the named form's file as `work)/steps.test.ts` and rejects the bare form outright, so
    // every step in such a project would carry no site at all.
    expect(named).toEqual(site("/Users/x/My (work)/steps.test.ts", 3, 4))
    expect(bare).toEqual(site("/Users/x/My (work)/steps.test.ts", 3, 4))
  })

  it("reads a Windows drive-letter path", () => {
    const captured = withStubbedErrorStack(
      [
        "Error",
        "    at captureCallSite (C:\\repo\\packages\\vitest\\src\\CallSite.ts:3:17)",
        "    at Given (C:\\repo\\steps.test.ts:12:5)"
      ].join("\n"),
      captureCallSite
    )

    expect(captured).toEqual(site("C:\\repo\\steps.test.ts", 12, 5))
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

    // Not a contrived case: this is exactly the shape a `dist/` build produces, where every internal module shares
    // one directory.
    expect(captured).toBeNull()
  })
})

describe("formatCallSite renders a site, or says plainly that there is none", () => {
  it("returns the shared unrecorded-location wording for an absent site", () => {
    // The literal string, not a re-export of the constant: `packages/gherkin/src/ParameterTypes.ts` uses the same
    // wording for the same idea, and the two packages' messages must read alike.
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

    // Mutation B fails here and nowhere else.
    expect([ten, nine].toSorted(compareCallSites)).toEqual([nine, ten])
  })

  it("orders by file first, then line, then column", () => {
    const a = site("/repo/a.ts", 99, 99)
    const b1 = site("/repo/b.ts", 1, 2)
    const b2 = site("/repo/b.ts", 1, 3)
    const b3 = site("/repo/b.ts", 2, 1)

    // `a`'s line and column are both larger than every `b`, so a comparator that consulted line before file would put
    // it last instead of first.
    expect([b3, b2, b1, a].toSorted(compareCallSites)).toEqual([a, b1, b2, b3])
  })

  it("sorts an absent site after every recorded one and treats two absent sites as equal", () => {
    const first = site("/repo/a.ts", 1, 1)
    const second = site("/repo/b.ts", 1, 1)

    expect([null, second, null, first].toSorted(compareCallSites)).toEqual([first, second, null, null])
    expect(compareCallSites(null, null)).toBe(0)
  })
})
