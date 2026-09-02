/**
 * MATCH-02: a custom parameter type declared once as data is present in every registry built
 * afterwards, repeated builds in one process never throw, and each name a registry already
 * provides is rejected by the `define` call itself.
 */
import * as Cause from "effect/Cause"
import * as Effect from "effect/Effect"
import * as Exit from "effect/Exit"
import * as Option from "effect/Option"
import { describe, expect, it } from "vitest"
import { StepPatternError } from "../src/Errors.ts"
import { parseFeature } from "../src/loadFeature.ts"
import { builtInParameterTypeNames, createParameterTypeStore, ParameterTypeStore } from "../src/ParameterTypes.ts"

/** A transform whose result is trivially checkable, reused by most definitions below. */
const amount = (...match: Array<string>): number => Number(match[0])

/** The store one build of `ParameterTypeStore.Default` provides. */
const buildStore = (): ReturnType<typeof createParameterTypeStore> =>
  Effect.runSync(
    Effect.gen(function*() {
      return yield* ParameterTypeStore
    }).pipe(Effect.provide(ParameterTypeStore.Default))
  )

/**
 * Runs `action`, asserts it threw a `StepPatternError`, and returns it.
 *
 * A throw of any other kind is re-thrown rather than absorbed: swallowing it would let a
 * `TypeError` inside `define` masquerade as a correctly reported rejection. Returning normally is
 * itself a failure, and says so.
 *
 * This is deliberately not `expect(...).toThrow()`: oxlint's `vitest(require-to-throw-message)` is
 * error-level in this repo and would force every rejection to be pinned by its message prose.
 */
const rejectedBy = (action: () => void): StepPatternError => {
  try {
    action()
  } catch (thrown) {
    if (thrown instanceof StepPatternError) {
      return thrown
    }
    throw thrown
  }
  throw new Error("expected define() to throw a StepPatternError, but it returned normally")
}

/** Title-friendly rendering of a built-in name; the anonymous one is the empty string. */
const describeBuiltIn = (name: string): string => name === "" ? "the anonymous {} name" : `{${name}}`

/** RegExp literals rather than a constructed pattern, one per flag upstream rejects. */
const flaggedRegexps: ReadonlyArray<{ readonly flag: string; readonly regexp: RegExp }> = [
  { flag: "g", regexp: /\d+/g },
  { flag: "i", regexp: /\d+/i },
  { flag: "m", regexp: /\d+/m },
  { flag: "y", regexp: /\d+/y }
]

describe("a custom parameter type is data, not a registration", () => {
  it("records a definition without ever constructing a registry", () => {
    const store = createParameterTypeStore()
    store.define({
      name: "money",
      regexp: /\d+/,
      transform: amount,
      definedAt: Option.none(),
      useForSnippets: Option.none(),
      preferForRegexpMatch: Option.none()
    })

    // ADR-EC-007's second correction, verbatim: "nothing touches a ParameterTypeRegistry at
    // definition time". The observable form of that clause is this — the recorded definitions are
    // readable, and complete, without `buildRegistry` having been called even once.
    const definitions = store.definitions()
    expect(definitions).toHaveLength(1)
    expect(definitions[0]?.name).toBe("money")
  })

  it("replays a recorded definition into the registry it builds", () => {
    const store = createParameterTypeStore()
    store.define({
      name: "money",
      regexp: /\d+/,
      transform: amount,
      definedAt: Option.none(),
      useForSnippets: Option.none(),
      preferForRegexpMatch: Option.none()
    })

    const registry = store.buildRegistry()
    expect(registry.lookupByTypeName("money")).toBeDefined()
    expect(registry.lookupByTypeName("nope")).toBeUndefined()
  })

  it("is immune to the caller mutating the regexp array after define() returns", () => {
    // `define` must copy a caller-supplied regexp array, not alias it: a definition is
    // documented as "permanent, ordinary data" (module doc comment (a)), so a mutation the
    // caller makes to their own array after define() returns must never retroactively change
    // what a later buildRegistry() replays.
    const store = createParameterTypeStore()
    const patterns = [/\d+/]
    store.define({
      name: "money",
      regexp: patterns,
      transform: amount,
      definedAt: Option.none(),
      useForSnippets: Option.none(),
      preferForRegexpMatch: Option.none()
    })

    patterns.push(/[A-Z]+/)

    const parameterType = store.buildRegistry().lookupByTypeName("money")
    expect(parameterType?.regexpStrings).toEqual(["\\d+"])
  })

  it("replays the recorded transform itself, so it survives the record and replay round trip", () => {
    const store = createParameterTypeStore()
    store.define({
      name: "money",
      regexp: /\d+/,
      transform: (...match: Array<string>) => ({ amount: Number(match[0]), currency: "EUR" }),
      definedAt: Option.none(),
      useForSnippets: Option.none(),
      preferForRegexpMatch: Option.none()
    })

    const parameterType = store.buildRegistry().lookupByTypeName("money")
    expect(parameterType).toBeDefined()
    // `transform(thisObj, groupValues)` is upstream's own calling convention; this library never
    // binds a `this`, so `undefined` is the honest first argument.
    expect(parameterType?.transform(undefined, ["42"])).toEqual({ amount: 42, currency: "EUR" })
  })

  it("returns a different registry instance from every buildRegistry call", () => {
    const store = createParameterTypeStore()
    store.define({
      name: "money",
      regexp: /\d+/,
      transform: amount,
      definedAt: Option.none(),
      useForSnippets: Option.none(),
      preferForRegexpMatch: Option.none()
    })

    const first = store.buildRegistry()
    const second = store.buildRegistry()

    expect(first).not.toBe(second)
    expect(first.lookupByTypeName("money")).toBeDefined()
    expect(second.lookupByTypeName("money")).toBeDefined()
  })

  it("builds twenty registries in a row from one store without throwing", () => {
    const store = createParameterTypeStore()
    store.define({
      name: "money",
      regexp: /\d+/,
      transform: amount,
      definedAt: Option.none(),
      useForSnippets: Option.none(),
      preferForRegexpMatch: Option.none()
    })
    store.define({
      name: "planet",
      regexp: /[a-z]+/,
      transform: (...match: Array<string>) => match[0] ?? "",
      definedAt: Option.none(),
      useForSnippets: Option.none(),
      preferForRegexpMatch: Option.none()
    })

    let built = 0
    let last = store.buildRegistry()
    for (let iteration = 0; iteration < 20; iteration += 1) {
      last = store.buildRegistry()
      built += 1
    }

    expect(built).toBe(20)
    expect(last.lookupByTypeName("money")).toBeDefined()
    expect(last.lookupByTypeName("planet")).toBeDefined()
  })

  it("builds a registry carrying every built-in even when the store holds no definitions", () => {
    // POSITIVE CONTROL. Without it, an implementation that rejected or dropped everything would
    // satisfy every rejection test in this file.
    const registry = createParameterTypeStore().buildRegistry()

    expect(registry.lookupByTypeName("int")).toBeDefined()
    expect(registry.lookupByTypeName("string")).toBeDefined()
  })
})

describe("a name the registry already provides is rejected at definition time", () => {
  it("derives exactly eleven built-in names, including the anonymous empty string", () => {
    // What makes the loop below a real eleven-case assertion rather than however many names an
    // implementation happened to derive. The same eleven are pinned against the real package in
    // test/expressions-pin.test.ts.
    expect(builtInParameterTypeNames.size).toBe(11)
    expect(builtInParameterTypeNames.has("")).toBe(true)
  })

  for (const builtInName of builtInParameterTypeNames) {
    it(`rejects ${describeBuiltIn(builtInName)} because a fresh registry already provides it`, () => {
      const store = createParameterTypeStore()

      const error = rejectedBy(() =>
        store.define({
          name: builtInName,
          regexp: /\d+/,
          transform: amount,
          definedAt: Option.none(),
          useForSnippets: Option.none(),
          preferForRegexpMatch: Option.none()
        })
      )

      expect(error.reason).toBe("BuiltInParameterTypeName")
      expect(error.parameterTypeName).toEqual(Option.some(builtInName))
      // The message names the offending name — for the anonymous type, by the word that
      // identifies it, since its name is the empty string and would match anything.
      expect(error.message).toContain(builtInName === "" ? "anonymous" : builtInName)
    })
  }

  it("raises the built-in rejection from the define call itself, recording nothing", () => {
    const store = createParameterTypeStore()

    expect(
      rejectedBy(() =>
        store.define({
          name: "int",
          regexp: /\d+/,
          transform: amount,
          definedAt: Option.none(),
          useForSnippets: Option.none(),
          preferForRegexpMatch: Option.none()
        })
      ).reason
    )
      .toBe("BuiltInParameterTypeName")
    expect(store.definitions()).toHaveLength(0)
  })
})

describe("a name defined twice in one store is rejected at definition time", () => {
  it("names both definition sites when each definition recorded one", () => {
    const store = createParameterTypeStore()
    store.define({
      name: "money",
      regexp: /\d+/,
      transform: amount,
      definedAt: Option.some("steps/money.ts:3"),
      useForSnippets: Option.none(),
      preferForRegexpMatch: Option.none()
    })

    const error = rejectedBy(() =>
      store.define({
        name: "money",
        regexp: /\d+/,
        transform: amount,
        definedAt: Option.some("steps/other.ts:9"),
        useForSnippets: Option.none(),
        preferForRegexpMatch: Option.none()
      })
    )

    expect(error.reason).toBe("DuplicateParameterTypeName")
    expect(error.message).toContain("steps/money.ts:3")
    expect(error.message).toContain("steps/other.ts:9")
  })

  it("still names the parameter type when neither definition recorded a site", () => {
    const store = createParameterTypeStore()
    store.define({
      name: "money",
      regexp: /\d+/,
      transform: amount,
      definedAt: Option.none(),
      useForSnippets: Option.none(),
      preferForRegexpMatch: Option.none()
    })

    const error = rejectedBy(() =>
      store.define({
        name: "money",
        regexp: /\d+/,
        transform: amount,
        definedAt: Option.none(),
        useForSnippets: Option.none(),
        preferForRegexpMatch: Option.none()
      })
    )

    expect(error.reason).toBe("DuplicateParameterTypeName")
    expect(error.parameterTypeName).toEqual(Option.some("money"))
    expect(error.message).toContain("money")
    expect(error.message).toContain("an unrecorded location")
  })

  it("falls back to the same placeholder for an explicit empty-string definedAt", () => {
    // `??` treats only `undefined`/`null` as missing; an explicit `""` would slip past it and
    // leave a dangling "at ," in the message. Assert the placeholder, not merely its absence.
    const store = createParameterTypeStore()
    store.define({
      name: "money",
      regexp: /\d+/,
      transform: amount,
      definedAt: Option.some(""),
      useForSnippets: Option.none(),
      preferForRegexpMatch: Option.none()
    })

    const error = rejectedBy(() =>
      store.define({
        name: "money",
        regexp: /\d+/,
        transform: amount,
        definedAt: Option.none(),
        useForSnippets: Option.none(),
        preferForRegexpMatch: Option.none()
      })
    )

    expect(error.message).not.toContain("at ,")
    expect(error.message).toContain("an unrecorded location")
  })

  it("records only the first of two definitions sharing a name", () => {
    const store = createParameterTypeStore()
    store.define({
      name: "money",
      regexp: /\d+/,
      transform: amount,
      definedAt: Option.none(),
      useForSnippets: Option.none(),
      preferForRegexpMatch: Option.none()
    })
    rejectedBy(() =>
      store.define({
        name: "money",
        regexp: /[a-z]+/,
        transform: amount,
        definedAt: Option.none(),
        useForSnippets: Option.none(),
        preferForRegexpMatch: Option.none()
      })
    )

    expect(store.definitions()).toHaveLength(1)
  })
})

describe("a malformed definition is rejected at definition time", () => {
  it("rejects a name carrying a character the upstream predicate refuses", () => {
    const store = createParameterTypeStore()

    const error = rejectedBy(() =>
      store.define({
        name: "pla(net)",
        regexp: /[a-z]+/,
        transform: amount,
        definedAt: Option.none(),
        useForSnippets: Option.none(),
        preferForRegexpMatch: Option.none()
      })
    )

    expect(error.reason).toBe("IllegalParameterTypeName")
    expect(error.parameterTypeName).toEqual(Option.some("pla(net)"))
  })

  it("accepts a name containing a slash, which upstream's own message wrongly calls illegal", () => {
    // Pinning the real behaviour rather than the prose: upstream's thrown message claims `/` is
    // among the forbidden characters, while its ILLEGAL_PARAMETER_NAME_PATTERN permits it. This
    // library asks the predicate, so `a/b` is accepted — and a rewrite that matched on that
    // message instead would fail exactly here.
    const store = createParameterTypeStore()
    store.define({
      name: "a/b",
      regexp: /[a-z]+/,
      transform: amount,
      definedAt: Option.none(),
      useForSnippets: Option.none(),
      preferForRegexpMatch: Option.none()
    })

    expect(store.buildRegistry().lookupByTypeName("a/b")).toBeDefined()
  })

  for (const { flag, regexp } of flaggedRegexps) {
    it(`rejects a regexp carrying the ${flag} flag`, () => {
      const store = createParameterTypeStore()

      const error = rejectedBy(() =>
        store.define({
          name: "flagged",
          regexp,
          transform: amount,
          definedAt: Option.none(),
          useForSnippets: Option.none(),
          preferForRegexpMatch: Option.none()
        })
      )

      expect(error.reason).toBe("InvalidParameterTypeRegexp")
      expect(error.message).toContain(flag)
      expect(store.definitions()).toHaveLength(0)
    })
  }

  it("rejects a malformed string regexp source at definition time, never at step-compile time", () => {
    const store = createParameterTypeStore()

    const error = rejectedBy(() =>
      store.define({
        name: "bad",
        regexp: "(",
        transform: amount,
        definedAt: Option.none(),
        useForSnippets: Option.none(),
        preferForRegexpMatch: Option.none()
      })
    )

    expect(error.reason).toBe("InvalidParameterTypeRegexp")
    expect(Option.getOrUndefined(error.parameterTypeName)).toBe("bad")
    expect(error.cause).toBeDefined()
    expect(store.definitions()).toHaveLength(0)
  })

  it("rejects a malformed source inside a regexp list too", () => {
    const store = createParameterTypeStore()

    const error = rejectedBy(() =>
      store.define({
        name: "badList",
        regexp: [/\d+/, "[unclosed"],
        transform: amount,
        definedAt: Option.none(),
        useForSnippets: Option.none(),
        preferForRegexpMatch: Option.none()
      })
    )

    expect(error.reason).toBe("InvalidParameterTypeRegexp")
    expect(store.definitions()).toHaveLength(0)
  })

  it("accepts a flagless RegExp and a plain string regexp source", () => {
    const store = createParameterTypeStore()
    store.define({
      name: "flagless",
      regexp: /\d+/,
      transform: amount,
      definedAt: Option.none(),
      useForSnippets: Option.none(),
      preferForRegexpMatch: Option.none()
    })
    store.define({
      name: "fromSource",
      regexp: "\\d+",
      transform: amount,
      definedAt: Option.none(),
      useForSnippets: Option.none(),
      preferForRegexpMatch: Option.none()
    })
    store.define({
      name: "fromList",
      regexp: [/\d+/, "[a-z]+"],
      transform: amount,
      definedAt: Option.none(),
      useForSnippets: Option.none(),
      preferForRegexpMatch: Option.none()
    })

    const registry = store.buildRegistry()
    expect(registry.lookupByTypeName("flagless")).toBeDefined()
    expect(registry.lookupByTypeName("fromSource")).toBeDefined()
    expect(registry.lookupByTypeName("fromList")).toBeDefined()
  })
})

describe("stores share no state", () => {
  it("lets two independently created stores each define the same name", () => {
    const first = createParameterTypeStore()
    const second = createParameterTypeStore()

    first.define({
      name: "money",
      regexp: /\d+/,
      transform: amount,
      definedAt: Option.none(),
      useForSnippets: Option.none(),
      preferForRegexpMatch: Option.none()
    })
    second.define({
      name: "money",
      regexp: /\d+/,
      transform: amount,
      definedAt: Option.none(),
      useForSnippets: Option.none(),
      preferForRegexpMatch: Option.none()
    })
    first.define({
      name: "planet",
      regexp: /[a-z]+/,
      transform: amount,
      definedAt: Option.none(),
      useForSnippets: Option.none(),
      preferForRegexpMatch: Option.none()
    })

    expect(first.buildRegistry().lookupByTypeName("planet")).toBeDefined()
    expect(second.buildRegistry().lookupByTypeName("planet")).toBeUndefined()
    expect(second.definitions()).toHaveLength(1)
  })

  it("ParameterTypeStore.Default builds a FRESH store per Layer build, so two builds share nothing", () => {
    // mutation: turning `Default` back into a Layer over one module-level store turns this red —
    // the second build would then see the first build's definition.
    const first = buildStore()
    first.define({
      name: "firstBuildOnly",
      regexp: /\d+/,
      transform: amount,
      definedAt: Option.none(),
      useForSnippets: Option.none(),
      preferForRegexpMatch: Option.none()
    })
    const second = buildStore()

    expect(first.buildRegistry().lookupByTypeName("firstBuildOnly")).toBeDefined()
    expect(second.definitions()).toHaveLength(0)
    expect(second.buildRegistry().lookupByTypeName("firstBuildOnly")).toBeUndefined()
  })

  it("ParameterTypeStore.layer(definitions) provides a store carrying the built-ins plus every definition", () => {
    const store = Effect.runSync(
      Effect.gen(function*() {
        return yield* ParameterTypeStore
      }).pipe(
        Effect.provide(ParameterTypeStore.layer([{
          name: "money",
          regexp: /\d+/,
          transform: amount,
          definedAt: Option.none(),
          useForSnippets: Option.none(),
          preferForRegexpMatch: Option.none()
        }]))
      )
    )

    expect(store.buildRegistry().lookupByTypeName("money")).toBeDefined()
    expect(store.buildRegistry().lookupByTypeName("int")).toBeDefined()
  })

  it("ParameterTypeStore.layer(definitions) fails in the Layer's error channel on a rejected definition", () => {
    const money = {
      name: "money",
      regexp: /\d+/,
      transform: amount,
      definedAt: Option.none(),
      useForSnippets: Option.none(),
      preferForRegexpMatch: Option.none()
    }
    const exit = Effect.runSyncExit(
      Effect.gen(function*() {
        return yield* ParameterTypeStore
      }).pipe(Effect.provide(ParameterTypeStore.layer([money, money])))
    )

    const failure = Exit.isFailure(exit) ? Cause.squash(exit.cause) : undefined
    expect(failure).toBeInstanceOf(StepPatternError)
    expect((failure as StepPatternError).reason).toBe("DuplicateParameterTypeName")
  })
})

describe("a rejection only knowable at replay time is still a named library error", () => {
  /**
   * `{int}` is registered preferentially with the source `\d+`, so a custom preferential type
   * over the same source collides inside upstream's `defineParameterType` — a check that has no
   * registry to run against at `define` time. Before this test existed the raw upstream
   * `CucumberExpressionError` escaped `buildRegistry`, and `parseFeature`'s catch-all relabelled
   * it as a feature-file `ParseFailed` (audit finding F-04).
   */
  const preferentialDigits = (store: ReturnType<typeof createParameterTypeStore>): void =>
    store.define({
      name: "digits",
      regexp: /\d+/,
      transform: amount,
      definedAt: Option.none(),
      useForSnippets: Option.none(),
      preferForRegexpMatch: Option.some(true)
    })

  it("a preferential regexp collision is rejected at replay time as InvalidParameterTypeDefinition", () => {
    const store = createParameterTypeStore()
    preferentialDigits(store)

    const error = rejectedBy(() => store.buildRegistry())

    expect(error.reason).toBe("InvalidParameterTypeDefinition")
    expect(Option.getOrUndefined(error.parameterTypeName)).toBe("digits")
    expect(error.message).toContain("preferForRegexpMatch")
    expect(error.cause).toBeDefined()
  })

  it("reaches parseFeature as a StepPatternError, never as a feature-file ParseFailed", () => {
    const store = createParameterTypeStore()
    preferentialDigits(store)
    const source = "Feature: F\n  Scenario: S\n    Given 3 apples\n"

    const exit = Effect.runSyncExit(
      parseFeature(source, "inline.feature").pipe(Effect.provide(ParameterTypeStore.layerOf(store)))
    )
    const failure = Exit.isFailure(exit) ? Cause.squash(exit.cause) : undefined

    expect(failure).toBeInstanceOf(StepPatternError)
    expect(failure instanceof StepPatternError ? failure.reason : undefined).toBe("InvalidParameterTypeDefinition")
  })
})
