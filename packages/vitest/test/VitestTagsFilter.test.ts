/**
 * `VitestTagsFilter.ts` is vendored verbatim from `@vitest/runner`'s own tag-expression grammar
 * (ADR-EC-059) — `TagExpression.test.ts`'s own coverage (via `HookTagExpression.test.ts` and
 * `Errors.test.ts`) exercises the plain-tag, `and`/`or`/`not` keyword, and undeclared-tag paths
 * already. This file targets the branches those callers never touch: wildcard `*` patterns, the
 * symbolic `!`/`&&`/`||` operators, and the malformed-expression error paths — proving the vendored
 * grammar still behaves exactly as upstream describes it, not just that it compiles.
 */
import { describe, expect, it } from "../src/EffectVitest.ts"
import { compileTagExpression } from "../src/TagExpression.ts"

const tags = ["@db", "@fast", "@perf-smoke", "@perf-load"]

describe("createTagsFilter — wildcard tag patterns", () => {
  it("matches any declared tag the pattern covers", () => {
    const matcher = compileTagExpression("@perf-*", tags)
    expect(matcher(["@perf-smoke"])).toBe(true)
    expect(matcher(["@perf-load"])).toBe(true)
  })

  it("does not match a tag the pattern excludes, even though it IS declared", () => {
    const matcher = compileTagExpression("@perf-*", tags)
    expect(matcher(["@db"])).toBe(false)
  })

  it("throws when no declared tag matches the wildcard pattern at all", () => {
    expect(() => compileTagExpression("@zzz-*", tags)).toThrow(/not defined in the configuration/)
  })
})

describe("createTagsFilter — symbolic operators, equivalent to their keyword form", () => {
  it("\"!\" negates, exactly like \"not\"", () => {
    const matcher = compileTagExpression("!@slow", ["@slow", "@fast"])
    expect(matcher(["@fast"])).toBe(true)
    expect(matcher(["@slow"])).toBe(false)
  })

  it("\"&&\" requires both sides, exactly like \"and\"", () => {
    const matcher = compileTagExpression("@db && @fast", tags)
    expect(matcher(["@db", "@fast"])).toBe(true)
    expect(matcher(["@db"])).toBe(false)
  })

  it("\"||\" requires either side, exactly like \"or\"", () => {
    const matcher = compileTagExpression("@db || @fast", tags)
    expect(matcher(["@db"])).toBe(true)
    expect(matcher(["@fast"])).toBe(true)
    expect(matcher([])).toBe(false)
  })
})

describe("createTagsFilter — malformed expressions raise a synchronous, named parse error", () => {
  it("an unclosed paren names the specific \")\" it is missing", () => {
    expect(() => compileTagExpression("(@db", tags)).toThrow(/missing closing "\)"/)
  })

  it("two tags with no operator between them names the unexpected trailing tag", () => {
    expect(() => compileTagExpression("@db @fast", tags)).toThrow(/unexpected "@fast"/)
  })

  it("a closing paren where an operand was expected names the unexpected \")\"", () => {
    expect(() => compileTagExpression("@db && )", tags)).toThrow(/unexpected "\)"/)
  })

  it("a trailing operator with nothing after it names the unexpected end of expression", () => {
    expect(() => compileTagExpression("@db &&", tags)).toThrow(/unexpected end of expression/)
  })

  it("a tag immediately followed by another tag inside parens still expects the closing paren", () => {
    expect(() => compileTagExpression("(@db @fast)", tags)).toThrow(/expected "\)" but got "@fast"/)
  })
})
