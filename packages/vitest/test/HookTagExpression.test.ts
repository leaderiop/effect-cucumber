/**
 * Tests for `HookTagExpression`.
 *
 * Carries: ADR-EC-035, BEH-EC-027.
 */
import { describe, expect, it } from "vitest"
import { compileHookTagExpr, featureTagUniverse, HookTagExpressionError } from "../src/HookTagExpression.ts"

describe("featureTagUniverse", () => {
  it("returns every literal tag across every Scenario handed to it, deduplicated", () => {
    const universe = featureTagUniverse([
      { tags: ["@db", "@slow"] },
      { tags: ["@db"] },
      { tags: [] }
    ])

    expect([...universe].toSorted()).toEqual(["@db", "@slow"])
  })

  it("returns an empty array for a Feature with no tags anywhere", () => {
    expect(featureTagUniverse([{ tags: [] }, { tags: [] }])).toEqual([])
  })

  it("returns an empty array for zero Scenarios", () => {
    expect(featureTagUniverse([])).toEqual([])
  })
})

describe("HookTagExpressionError", () => {
  it("stringifies a non-Error cause rather than reading a .message that does not exist", () => {
    // The real createTagsFilter always throws an Error, but the constructor itself does not assume
    // that — this fixture proves the fallback branch, not merely the common one compileHookTagExpr
    // ever actually reaches.
    const error = new HookTagExpressionError({
      kind: "Before",
      tagExpr: "@nonexistent",
      featureUri: "checkout.feature",
      cause: "a plain string cause, not an Error"
    })

    expect(error.message).toContain("a plain string cause, not an Error")
    expect(error.cause).toBe("a plain string cause, not an Error")
  })
})

describe("compileHookTagExpr", () => {
  it("returns null, unconsulted, for tagExpr: null — the unconditional hook shape", () => {
    const matcher = compileHookTagExpr({
      tagExpr: null,
      availableTags: [],
      kind: "Before",
      featureUri: "test.feature"
    })

    expect(matcher).toBeNull()
  })

  it("compiles a bare tag into a matcher that reads a Scenario's own tags", () => {
    const matcher = compileHookTagExpr({
      tagExpr: "@db",
      availableTags: ["@db", "@slow"],
      kind: "Before",
      featureUri: "test.feature"
    })

    expect(matcher).not.toBeNull()
    expect(matcher?.(["@db"])).toBe(true)
    expect(matcher?.(["@slow"])).toBe(false)
    expect(matcher?.([])).toBe(false)
  })

  it("compiles and/or/not/parens exactly as vitest's own createTagsFilter grammar does", () => {
    const matcher = compileHookTagExpr({
      tagExpr: "(@db or @cache) and not @slow",
      availableTags: ["@db", "@cache", "@slow"],
      kind: "Before",
      featureUri: "test.feature"
    })

    expect(matcher?.(["@db"])).toBe(true)
    expect(matcher?.(["@cache"])).toBe(true)
    expect(matcher?.(["@db", "@slow"])).toBe(false)
    expect(matcher?.([])).toBe(false)
  })

  it("throws HookTagExpressionError for a tag literal absent from availableTags", () => {
    expect(() =>
      compileHookTagExpr({
        tagExpr: "@nonexistent",
        availableTags: ["@db"],
        kind: "After",
        featureUri: "checkout.feature"
      })
    ).toThrowError(HookTagExpressionError)
  })

  it("names the offending kind, expression and .feature file on the thrown error, and preserves the underlying cause", () => {
    let caught: unknown = null
    try {
      compileHookTagExpr({
        tagExpr: "@nonexistent",
        availableTags: ["@db"],
        kind: "AfterStep",
        featureUri: "checkout.feature"
      })
    } catch (error) {
      caught = error
    }

    expect(caught).toBeInstanceOf(HookTagExpressionError)
    const hookError = caught as HookTagExpressionError
    expect(hookError.kind).toBe("AfterStep")
    expect(hookError.tagExpr).toBe("@nonexistent")
    expect(hookError.featureUri).toBe("checkout.feature")
    expect(hookError.name).toBe("HookTagExpressionError")
    expect(hookError.message).toContain("checkout.feature")
    expect(hookError.message).toContain("@nonexistent")
    expect(hookError.message).toContain("AfterStep")
    // The underlying vitest parser error is preserved as `.cause`, never dropped.
    expect(hookError.cause).toBeInstanceOf(Error)
  })

  it("throws when the tag universe is empty, exactly like vitest's own createTagsFilter does", () => {
    expect(() =>
      compileHookTagExpr({
        tagExpr: "@db",
        availableTags: [],
        kind: "Before",
        featureUri: "test.feature"
      })
    ).toThrowError(HookTagExpressionError)
  })
})
