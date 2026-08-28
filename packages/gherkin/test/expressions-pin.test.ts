/**
 * Pins the verified behavior of `@cucumber/cucumber-expressions@20.1.0`.
 *
 * This file imports NOTHING from `../src`. It talks to the upstream package directly, on
 * purpose: when it fails, a dependency changed its semantics. That separation is what lets a
 * later failure in `ParameterTypes.test.ts` or `StepMatcher.test.ts` be attributed to this
 * library's own code rather than to a bump of `@cucumber/cucumber-expressions`, which is
 * declared as `^20.1.0` and is therefore free to move under us within the major.
 *
 * Every non-obvious claim the rest of Phase 3 is designed around lives here: eleven built-ins
 * pre-registered by the registry constructor, a duplicate-name throw that includes those
 * built-ins, a CONSTRUCTION-time throw for an unregistered `{customType}`, no ambiguity
 * detection across two step patterns, and an unwrapped `Promise` out of an async transform.
 *
 * The three error classes needed to discriminate an upstream failure —
 * `CucumberExpressionError`, `UndefinedParameterTypeError` and `AmbiguousParameterTypeError` —
 * are NOT exported from the package barrel; they are reachable only by a deep path into the
 * published build directory. That is why this library discriminates STRUCTURALLY (an
 * undefined-parameter-type failure carries a string `undefinedParameterTypeName` property) and
 * never by `instanceof` against a deep import, never by the `name` property (which reports the
 * useless string `"Error"`), and never by message text. `isValidParameterTypeName` below is the sharpest illustration: the
 * message upstream throws names a different character set than the pattern actually rejects.
 */
import { type Argument, CucumberExpression, ParameterType, ParameterTypeRegistry } from "@cucumber/cucumber-expressions"
import { describe, expect, it } from "vitest"

/** The eleven names `new ParameterTypeRegistry()` pre-registers. `""` is the anonymous `{}`. */
const builtInNames: ReadonlyArray<string> = [
  "int",
  "float",
  "word",
  "string",
  "",
  "double",
  "bigdecimal",
  "byte",
  "short",
  "long",
  "biginteger"
]

const customType = (name: string): ParameterType<number> =>
  new ParameterType(name, /\d+/, null, (raw: string) => Number(raw))

const matchAgainst = (
  pattern: string,
  text: string,
  registry: ParameterTypeRegistry = new ParameterTypeRegistry()
): ReadonlyArray<Argument> | null => new CucumberExpression(pattern, registry).match(text)

/**
 * Runs `action` and returns whatever it threw.
 *
 * Used in place of `expect(...).toThrow()` throughout this file. oxlint's
 * `vitest(require-to-throw-message)` is error-level and would force every upstream throw to be
 * asserted by its MESSAGE — exactly the coupling this file exists to avoid, since those
 * messages are upstream prose free to change inside a patch release. Returning the thrown
 * value lets each test assert `instanceof Error` and, where one exists, a structural property.
 */
const thrownBy = (action: () => unknown): unknown => {
  try {
    action()
  } catch (error) {
    return error
  }
  throw new Error("expected the action to throw, but it returned normally")
}

/** Throws rather than returning a sentinel, so a broken pin fails at the assertion it belongs to. */
const soleValue = (pattern: string, text: string, registry?: ParameterTypeRegistry): unknown => {
  const args = registry === undefined ? matchAgainst(pattern, text) : matchAgainst(pattern, text, registry)
  if (args === null) {
    throw new Error(`expected ${pattern} to match ${text}, but match() returned null`)
  }
  const first = args[0]
  if (first === undefined) {
    throw new Error(`expected ${pattern} to yield an argument for ${text}, but it yielded none`)
  }
  // `thisObj` is typed `unknown` and this library never binds a `this`, so `undefined` is the
  // honest argument here — not `null`.
  return first.getValue(undefined)
}

interface BuiltInCase {
  readonly label: string
  readonly pattern: string
  readonly text: string
  readonly runtimeType: string
}

const builtInCases: ReadonlyArray<BuiltInCase> = [
  { label: "{int}", pattern: "v {int}", text: "v 5", runtimeType: "number" },
  { label: "{float}", pattern: "v {float}", text: "v 5.5", runtimeType: "number" },
  { label: "{word}", pattern: "v {word}", text: "v hi", runtimeType: "string" },
  { label: "{string}", pattern: "v {string}", text: "v \"hi\"", runtimeType: "string" },
  { label: "{double}", pattern: "v {double}", text: "v 5.5", runtimeType: "number" },
  { label: "{bigdecimal}", pattern: "v {bigdecimal}", text: "v 5.5", runtimeType: "string" },
  { label: "{byte}", pattern: "v {byte}", text: "v 5", runtimeType: "number" },
  { label: "{short}", pattern: "v {short}", text: "v 5", runtimeType: "number" },
  { label: "{long}", pattern: "v {long}", text: "v 5", runtimeType: "number" },
  { label: "{biginteger}", pattern: "v {biginteger}", text: "v 5", runtimeType: "bigint" },
  { label: "the anonymous {}", pattern: "v {}", text: "v hi", runtimeType: "string" }
]

const illegalNameCharacters: ReadonlyArray<string> = ["[", "]", "(", ")", "$", ".", "|", "?", "*", "+"]

const rejectedRegexpFlags: ReadonlyArray<string> = ["g", "i", "m", "y"]

describe("upstream @cucumber/cucumber-expressions parameter type registry", () => {
  it("pre-registers exactly the eleven built-in parameter type names in a fresh registry", () => {
    // A Set rather than an ordered array, matching upstream-pin.test.ts: the immutable ES2023
    // ordering method is unavailable under this repo's ES2022 lib, and the in-place one is
    // rejected by oxlint's unicorn(no-array-sort). Set equality asserts the same thing.
    // This is the pin that lets ParameterTypes.ts DERIVE its built-in set from a real registry
    // instead of hardcoding one that can silently drift from the dependency.
    const registry = new ParameterTypeRegistry()
    const names = new Set([...registry.parameterTypes].map((parameterType) => parameterType.name))

    expect(names.size).toBe(11)
    expect(names).toEqual(new Set(builtInNames))
  })

  it("throws when the same custom parameter type name is registered twice into one registry", () => {
    const registry = new ParameterTypeRegistry()
    registry.defineParameterType(customType("money"))

    // Discriminated by `instanceof Error` only: the concrete class is not exported from the
    // barrel, and its `name` property reports the string "Error", so neither is a usable
    // discriminator.
    expect(thrownBy(() => registry.defineParameterType(customType("money")))).toBeInstanceOf(Error)
  })

  it("throws when a custom parameter type shadows the built-in int", () => {
    const registry = new ParameterTypeRegistry()

    expect(thrownBy(() => registry.defineParameterType(customType("int")))).toBeInstanceOf(Error)
  })

  it("lets two independently constructed registries each accept the same custom name", () => {
    // The property the fresh-registry-per-call lifecycle depends on (ADR-EC-007's second
    // correction): custom types are replayed into a new registry every call, so a second
    // loadFeature() must not trip the duplicate-name throw pinned above.
    const first = new ParameterTypeRegistry()
    const second = new ParameterTypeRegistry()

    first.defineParameterType(customType("money"))
    second.defineParameterType(customType("money"))

    expect(soleValue("I pay {money}", "I pay 5", first)).toBe(5)
    expect(soleValue("I pay {money}", "I pay 7", second)).toBe(7)
  })
})

describe("upstream @cucumber/cucumber-expressions built-in transforms", () => {
  for (const builtInCase of builtInCases) {
    it(`transforms ${builtInCase.label} to a runtime ${builtInCase.runtimeType}`, () => {
      expect(typeof soleValue(builtInCase.pattern, builtInCase.text)).toBe(builtInCase.runtimeType)
    })
  }

  it("strips the surrounding double quotes from a {string} match", () => {
    expect(soleValue("v {string}", "v \"hi\"")).toBe("hi")
  })

  it("matches integer text with {float} but returns null for decimal text with {int}", () => {
    expect(soleValue("v {float}", "v 5")).toBe(5)
    expect(matchAgainst("v {int}", "v 5.5")).toBeNull()
  })
})

describe("upstream @cucumber/cucumber-expressions construction-time failures", () => {
  it("throws at construction for an unregistered parameter type, never reaching match", () => {
    let matchWasReached = false
    let thrown: unknown

    try {
      const expression = new CucumberExpression("I pay {money}", new ParameterTypeRegistry())
      // Unreachable if the pin holds. The flag proves the throw came from `new`, not `match`.
      matchWasReached = true
      expression.match("I pay 5")
    } catch (error) {
      thrown = error
    }

    expect(matchWasReached).toBe(false)
    expect(thrown).toBeInstanceOf(Error)

    // Structural discrimination: `UndefinedParameterTypeError` is not exported from the barrel.
    const undefinedName = (thrown as { readonly undefinedParameterTypeName?: unknown }).undefinedParameterTypeName
    expect(typeof undefinedName).toBe("string")
    expect(undefinedName).toBe("money")
  })

  it("snapshots the resolved parameter types at construction rather than following the registry", () => {
    // Why a compilation cache must be keyed on the (registry, pattern) PAIR: the registry is
    // mutable, an already-built expression is not affected by a later registration, and a
    // pattern-only cache key would serve a stale binding.
    const registry = new ParameterTypeRegistry()
    const built = new CucumberExpression("I pay {int}", registry)

    registry.defineParameterType(customType("money"))

    expect(built.match("I pay 5")).toHaveLength(1)
    expect(new CucumberExpression("I pay {money}", registry).match("I pay 5")).toHaveLength(1)
  })

  for (const flag of rejectedRegexpFlags) {
    it(`rejects a parameter type RegExp carrying the ${flag} flag`, () => {
      // A throw, not a message: the message is upstream prose and is not a contract.
      const thrown = thrownBy(() => new ParameterType("flagged", new RegExp("\\d+", flag), null, (raw: string) => raw))

      expect(thrown).toBeInstanceOf(Error)
    })
  }
})

describe("upstream @cucumber/cucumber-expressions parameter type names", () => {
  for (const character of illegalNameCharacters) {
    it(`rejects a parameter type name containing ${character}`, () => {
      expect(ParameterType.isValidParameterTypeName(`a${character}b`)).toBe(false)
    })
  }

  it("accepts a slash, a brace pair and a plain word as parameter type names", () => {
    // NOTE the trap this library must not fall into: the message upstream throws for an
    // invalid name reads "{, }, (, ), \\ or /", while ILLEGAL_PARAMETER_NAME_PATTERN is
    // /([[\]()$.|?*+])/. The message and the implementation disagree, so a check that
    // pattern-matched that message would reject names the package happily accepts. Ask the
    // predicate; never read the prose.
    expect(ParameterType.isValidParameterTypeName("a/b")).toBe(true)
    expect(ParameterType.isValidParameterTypeName("{bad}")).toBe(true)
    expect(ParameterType.isValidParameterTypeName("int")).toBe(true)
  })
})

describe("upstream @cucumber/cucumber-expressions matching semantics", () => {
  it("does not detect two step patterns both matching one step text", () => {
    // Pitfall 15, and the reason MATCH-03/04 exist: neither construction nor match complains,
    // and the argument's runtime TYPE depends on which definition was registered first.
    const asInt = soleValue("I have {int} apples", "I have 5 apples")
    const asWord = soleValue("I have {word} apples", "I have 5 apples")

    expect(asInt).toBe(5)
    expect(typeof asInt).toBe("number")
    expect(asWord).toBe("5")
    expect(typeof asWord).toBe("string")
  })

  it("treats a parenthesised suffix as an optional group yielding no argument", () => {
    expect(matchAgainst("I have apple(s)", "I have apple")).toHaveLength(0)
    expect(matchAgainst("I have apple(s)", "I have apples")).toHaveLength(0)
  })

  it("treats a slash as an alternation yielding no argument", () => {
    expect(matchAgainst("I am happy/sad", "I am sad")).toHaveLength(0)
    expect(matchAgainst("I am happy/sad", "I am happy")).toHaveLength(0)
  })

  it("matches literal parentheses only when they are backslash-escaped", () => {
    expect(matchAgainst("I have apple\\(s\\)", "I have apple(s)")).toHaveLength(0)
    expect(matchAgainst("I have apple(s)", "I have apple(s)")).toBeNull()
  })

  it("treats a backslash before a brace as an escape of the whole parameter", () => {
    expect(matchAgainst("a \\{int} b", "a {int} b")).toHaveLength(0)
    expect(matchAgainst("a \\{int} b", "a 5 b")).toBeNull()
  })

  it("anchors every expression, so a pattern does not match text surrounding it", () => {
    expect(matchAgainst("foo", "foo")).toHaveLength(0)
    expect(matchAgainst("foo", "xfoox")).toBeNull()
  })
})

describe("upstream @cucumber/cucumber-expressions custom transforms", () => {
  it("returns an unwrapped Promise out of getValue for an async transform", () => {
    // Pitfall 25: the step body would receive a Promise where its declared parameter type says
    // `number`. StepMatcher must reject an async transform rather than hand this through.
    const registry = new ParameterTypeRegistry()
    registry.defineParameterType(
      new ParameterType("later", /\d+/, null, async (raw: string) => Number(raw))
    )

    const value = soleValue("v {later}", "v 5", registry)

    expect(value instanceof Promise).toBe(true)
  })

  it("throws synchronously out of getValue for a transform that throws", () => {
    // Pitfall 25 again: this happens during argument extraction, outside any Effect, so it
    // bypasses the structured error channel unless StepMatcher guards it.
    const registry = new ParameterTypeRegistry()
    registry.defineParameterType(
      new ParameterType("boom", /\d+/, null, () => {
        throw new Error("transform failed")
      })
    )

    const args = matchAgainst("v {boom}", "v 5", registry)
    expect(args).toHaveLength(1)

    expect(() => args?.[0]?.getValue(undefined)).toThrow("transform failed")
  })
})
