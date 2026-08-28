/**
 * MATCH-02: a custom parameter type declared once as data is present in every registry built
 * afterwards, repeated builds in one process never throw, and each name a registry already
 * provides is rejected by the `define` call itself.
 *
 * **Every test below creates its OWN store with `createParameterTypeStore()`, except the single
 * test dedicated to the module-level default one.** That is not a style preference. The default
 * store is append-only for the life of the process — there is no `remove` and no `clear`, by
 * design — so a test that defined into it would make every later test in the same worker
 * order-dependent, and a second run of the same name would fail with `DuplicateParameterTypeName`
 * for reasons that have nothing to do with what that test was checking. The store-isolation test
 * below is what makes the rest of this file hermetic.
 *
 * Assertions read `err.reason`, never the message text, following `Validate.test.ts`. The two
 * exceptions are the two places where the MESSAGE *is* the requirement: the built-in rejection
 * must name the offending name, and the duplicate rejection must name BOTH definition sites.
 * Those assert on the substring carrying the requirement, not on the prose around it.
 *
 * Imports reach `../src/*.ts` directly, never `../src/index.ts`:
 * `effect/no-import-from-barrel-package` runs with `checkRelativeIndexImports: true`.
 */
import * as Option from "effect/Option"
import { describe, expect, it } from "vitest"
import { StepPatternError } from "../src/Errors.ts"
import {
  buildParameterTypeRegistry,
  builtInParameterTypeNames,
  createParameterTypeStore,
  defaultParameterTypeStore,
  defineParameterType
} from "../src/ParameterTypes.ts"

/** A transform whose result is trivially checkable, reused by most definitions below. */
const amount = (...match: Array<string>): number => Number(match[0])

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
    // The core MATCH-02 property, and the one a process-global registry fails on iteration two
    // with upstream's duplicate-name throw (Pitfall 14, reproduced across three
    // cypress-cucumber-preprocessor issues).
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
    // Pitfall 14's fourth "how to avoid" bullet: the error must point at the caller's own define
    // call, not at a replay deep inside loadFeature. Two things prove it here — the store is still
    // empty afterwards, and no buildRegistry call was needed to surface the failure.
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
    // The message IS the requirement here: a duplicate reported without both sites sends the
    // caller hunting for the other definition (threat T-03-10).
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

  it("records into the module-level default store and replays it, sharing nothing with a fresh store", () => {
    // The ONLY test in this file that touches the default store, and `moneyDefaultStoreProbe` is
    // deliberately never reused anywhere: the default store is append-only for the life of the
    // process, so defining this name a second time would fail with DuplicateParameterTypeName.
    defineParameterType({
      name: "moneyDefaultStoreProbe",
      regexp: /\d+/,
      transform: amount,
      definedAt: Option.some("packages/gherkin/test/ParameterTypes.test.ts"),
      useForSnippets: Option.none(),
      preferForRegexpMatch: Option.none()
    })

    expect(buildParameterTypeRegistry().lookupByTypeName("moneyDefaultStoreProbe")).toBeDefined()
    expect(defaultParameterTypeStore.definitions().some((definition) => definition.name === "moneyDefaultStoreProbe"))
      .toBe(true)
    expect(createParameterTypeStore().buildRegistry().lookupByTypeName("moneyDefaultStoreProbe")).toBeUndefined()
  })
})
