/**
 * Custom parameter types as DATA (ADR-EC-007, ADR-EC-023): `define` appends a record to a store, and every
 * `buildRegistry()` constructs a FRESH `ParameterTypeRegistry` and replays the records into it. No registry is
 * touched at definition time, so nothing can double-register or outlive the build that made it.
 *
 * There is no process-wide store: `ParameterTypeStore.Default` builds a fresh built-ins-only store per Layer build,
 * `ParameterTypeStore.layer(definitions)` one carrying custom types, `createParameterTypeStore()` a plain one. The
 * store is a `Context.Service` so `loadFeature`/`parseFeature` receive it ambiently.
 *
 * Rejections detectable from the definition alone happen at DEFINITION time. A preferential-regexp collision is
 * only knowable at replay and surfaces from `buildRegistry` as `InvalidParameterTypeDefinition`, never as a
 * feature-file `ParseFailed` (`test/ParameterTypes.test.ts`). `transform` omits upstream's `PromiseLike` half:
 * `Argument.getValue` returns transforms unwrapped (`test/expressions-pin.test.ts`); `StepMatcher.ts` guards the
 * `any` escape route at run time. This module constructs no regular expression of its own.
 */
import { ParameterType, ParameterTypeRegistry } from "@cucumber/cucumber-expressions"
import * as Context from "effect/Context"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as Option from "effect/Option"
import { StepPatternError } from "./Errors.ts"
import { describeParameterTypeName as describeName, raiseStepPatternError as fail } from "./StepPatternMessages.ts"

/**
 * One custom parameter type, as data. `T` is what the transform produces and what a step body receives;
 * `StepArgs`' `Custom` parameter is the compile-time counterpart. The three trailing fields are `Option`s
 * (ADR-EC-022), supplied explicitly at every construction site.
 */
export interface ParameterTypeDefinition<T> {
  /** The name written between braces in a step pattern: `money` is used as `{money}`. */
  readonly name: string
  /**
   * What the parameter matches. A string is a regexp SOURCE, not a literal, and is handed to
   * upstream verbatim. An array registers several alternatives for the same name.
   */
  readonly regexp: string | RegExp | ReadonlyArray<string | RegExp>
  /** Turn the matched text into a value. Never `PromiseLike`: the result reaches the step body unwrapped. */
  readonly transform: (...match: Array<string>) => T
  /** A human-readable definition site, quoted verbatim in the `DuplicateParameterTypeName` message. */
  readonly definedAt: Option.Option<string>
  /** Passed straight through to upstream at replay time (unwrapped there). Upstream defaults it to `true`. */
  readonly useForSnippets: Option.Option<boolean>
  /** Passed straight through to upstream at replay time (unwrapped there). Upstream defaults it to `false`. */
  readonly preferForRegexpMatch: Option.Option<boolean>
}

/**
 * The built-in names, read off a real registry rather than hardcoded, so a new upstream built-in is rejected at
 * `define` time by name instead of colliding at replay. `test/expressions-pin.test.ts` pins the current eleven.
 */
const deriveBuiltInParameterTypeNames = (): ReadonlySet<string> => {
  const names = new Set<string>()
  for (const parameterType of new ParameterTypeRegistry().parameterTypes) {
    if (parameterType.name !== undefined) {
      names.add(parameterType.name)
    }
  }
  return names
}

/**
 * Every name a fresh `ParameterTypeRegistry` already occupies. A custom definition may not use
 * one — including the anonymous empty-string name, which a pattern writes as `{}`.
 */
export const builtInParameterTypeNames: ReadonlySet<string> = deriveBuiltInParameterTypeNames()

/** Flags upstream's constructor rejects; checked here so the message names the flag. */
const rejectedRegexpFlags: ReadonlyArray<string> = ["g", "i", "m", "y"]

/** The characters `ParameterType.isValidParameterTypeName` rejects; upstream's own message names a different
 * set, so this library asks the predicate and quotes this list (`test/expressions-pin.test.ts`). */
const illegalNameCharacters = "[ ] ( ) $ . | ? * +"

/** The fallback used when a definition recorded no `definedAt` — including an explicit `""`. */
const unrecordedLocation = "an unrecorded location"

/** `value`, or `unrecordedLocation` when it is `Option.none()` or an explicit empty string. */
const locationOf = (value: Option.Option<string>): string =>
  Option.match(value, {
    onNone: () => unrecordedLocation,
    onSome: (site) => site === "" ? unrecordedLocation : site
  })

/** The built-in set, rendered for a message, so the caller needs no docs lookup. */
const listBuiltInNames = (): string =>
  [...builtInParameterTypeNames].map((name) => (name === "" ? "the anonymous \"\"" : name)).join(", ")

/** Normalise the three accepted `regexp` shapes to one list, without copying an array needlessly. */
const toRegexpList = (regexp: ParameterTypeDefinition<unknown>["regexp"]): ReadonlyArray<string | RegExp> =>
  typeof regexp === "string" || regexp instanceof RegExp ? [regexp] : regexp

/** The upstream value for one record — a NEW instance per build. `null` type: the prototype-coercion path is
 * never used; `false`: never a built-in. */
const toUpstreamParameterType = (definition: ParameterTypeDefinition<unknown>): ParameterType<unknown> =>
  new ParameterType<unknown>(
    definition.name,
    toRegexpList(definition.regexp),
    null,
    definition.transform,
    // Upstream expects `boolean | undefined`; unwrapping the Option here is the boundary, not a leak.
    Option.getOrUndefined(definition.useForSnippets),
    Option.getOrUndefined(definition.preferForRegexpMatch),
    false
  )

/**
 * A new, empty store sharing no state with any other. Append-only, with no `remove` or `clear`: a withdrawable
 * definition would reintroduce cross-call state. `ParameterTypeStoreShape` is derived from this return type.
 */
export const createParameterTypeStore = () => {
  const records: Array<ParameterTypeDefinition<unknown>> = []

  /** Record a custom parameter type; touches no registry. Throws `StepPatternError` at the caller's own frame. */
  const define = <T>(definition: ParameterTypeDefinition<T>): void => {
    const { name } = definition

    // FIRST: rejects the anonymous empty name too, and the built-in message wins over the duplicate one.
    if (builtInParameterTypeNames.has(name)) {
      fail({
        reason: "BuiltInParameterTypeName",
        parameterTypeName: name,
        sentences: [
          `${describeName(name)} is one of the parameter types every registry pre-registers`,
          `(${listBuiltInNames()}), and upstream throws on any attempt to redefine one.`,
          "Choose a different name for this custom parameter type."
        ]
      })
    }

    // `records` searched directly: a handful of entries, and no second structure to drift.
    const existing = records.find((recorded) => recorded.name === name)
    if (existing !== undefined) {
      fail({
        reason: "DuplicateParameterTypeName",
        parameterTypeName: name,
        sentences: [
          `${describeName(name)} was already defined in this store at ${locationOf(existing.definedAt)},`,
          `and is being defined again at ${locationOf(definition.definedAt)}.`,
          "Remove one of the two definitions, or give one of them a different name.",
          "Set `definedAt` on each definition to make both sites appear here by name."
        ]
      })
    }

    if (!ParameterType.isValidParameterTypeName(name)) {
      fail({
        reason: "IllegalParameterTypeName",
        parameterTypeName: name,
        sentences: [
          `${describeName(name)} was rejected by ParameterType.isValidParameterTypeName.`,
          `A parameter type name may not contain any of ${illegalNameCharacters}.`,
          "Remove the offending character."
        ]
      })
    }

    for (const entry of toRegexpList(definition.regexp)) {
      // A string source is compiled once here so a malformed one fails at DEFINITION time, not later inside
      // `new CucumberExpression` as an `InvalidStepPattern` blaming the step author.
      if (typeof entry === "string") {
        try {
          RegExp(entry)
        } catch (cause) {
          fail({
            reason: "InvalidParameterTypeRegexp",
            parameterTypeName: name,
            sentences: [
              `the regexp source ${JSON.stringify(entry)} supplied for ${describeName(name)}`,
              `is not a valid regular expression: ${cause instanceof Error ? cause.message : String(cause)}.`,
              "Fix the source, or pass a RegExp literal so the mistake is a syntax error at the call site."
            ],
            cause
          })
        }
      }
      if (entry instanceof RegExp) {
        for (const flag of rejectedRegexpFlags) {
          if (entry.flags.includes(flag)) {
            fail({
              reason: "InvalidParameterTypeRegexp",
              parameterTypeName: name,
              sentences: [
                `the regexp /${entry.source}/${entry.flags} supplied for ${describeName(name)}`,
                `carries the ${flag} flag, which upstream's ParameterType constructor rejects.`,
                `Drop the ${flag} flag.`
              ]
            })
          }
        }
      }
    }

    // A copy of the array form: `regexp` is replayed on every build, so the caller's array must not alias it.
    const record: ParameterTypeDefinition<unknown> = Array.isArray(definition.regexp)
      ? { ...definition, regexp: [...definition.regexp] }
      : definition

    // Catch-all: anything the checks above did not name is upstream rejecting the definition for a reason this
    // library did not anticipate; it still reaches the caller as a named error carrying the original as `cause`.
    // Not reachable today: the two checks above (`isValidParameterTypeName`, `rejectedRegexpFlags`) already
    // duplicate the only two rejection reasons the installed `ParameterType` constructor has — verified by
    // reading its source. Kept for the same reason as `buildRegistry`'s two catches below: an upstream minor
    // could add a third check this library has not learned yet.
    try {
      toUpstreamParameterType(record)
    } catch (cause) {
      fail({
        reason: "InvalidParameterTypeDefinition",
        parameterTypeName: name,
        sentences: [
          `@cucumber/cucumber-expressions rejected the definition of ${describeName(name)}`,
          "for a reason this library does not recognise; the original failure is attached as `cause`.",
          "This most likely means the dependency changed behaviour within its major range."
        ],
        cause
      })
    }

    records.push(record)
  }

  /** Every recorded definition, in definition order. The returned array is a copy. */
  const definitions = (): ReadonlyArray<ParameterTypeDefinition<unknown>> => [...records]

  /** A FRESH registry with the built-ins plus every record replayed; never memoised, two calls never share. */
  const buildRegistry = (): ParameterTypeRegistry => {
    const registry = new ParameterTypeRegistry()
    for (const record of records) {
      // Wrapped: a caller aliasing a mutable field, or an upstream minor, could still make this throw, and it
      // must reach `loadFeature`'s caller as a `StepPatternError`.
      let upstream: ParameterType<unknown>
      try {
        upstream = toUpstreamParameterType(record)
      } catch (cause) {
        // `return`: `fail` always throws, but a statement call leaves `upstream` unassigned to the compiler.
        return fail({
          reason: "InvalidParameterTypeDefinition",
          parameterTypeName: record.name,
          sentences: [
            `@cucumber/cucumber-expressions rejected the definition of ${describeName(record.name)}`,
            "while replaying it into a fresh registry, for a reason this library does not",
            "recognise; the original failure is attached as `cause`. This most likely means the",
            "dependency changed behaviour within its major range."
          ],
          cause
        })
      }
      // `defineParameterType` is where upstream detects a PREFERENTIAL regexp collision, which cannot run at
      // `define` time because it depends on what the fresh registry already holds.
      try {
        registry.defineParameterType(upstream)
      } catch (cause) {
        return fail({
          reason: "InvalidParameterTypeDefinition",
          parameterTypeName: record.name,
          sentences: [
            `@cucumber/cucumber-expressions rejected ${describeName(record.name)} while registering it`,
            `into a fresh registry: ${cause instanceof Error ? cause.message : String(cause)}`,
            "A type with `preferForRegexpMatch` set may not share a regexp source with another",
            "preferential type, the built-ins included. Drop `preferForRegexpMatch` or change the regexp.",
            "The original failure is attached as `cause`."
          ],
          cause
        })
      }
    }
    return registry
  }

  return { define, definitions, buildRegistry }
}

/** The shape `createParameterTypeStore()` returns, derived so the two cannot drift. */
export type ParameterTypeStoreShape = ReturnType<typeof createParameterTypeStore>

/**
 * The store as an ambient `Context.Service` (ADR-EC-023): `loadFeature`/`parseFeature` require it and nothing
 * provides it by default. `.of(...)` lifts a plain shape into the branded service value.
 */
export class ParameterTypeStore
  extends Context.Service<ParameterTypeStore, ParameterTypeStoreShape>()("@effect-cucumber/gherkin/ParameterTypeStore")
{
  /** Wrap any `ParameterTypeStoreShape` — `createParameterTypeStore()`'s or a hand-built one — as a provide-able Layer. */
  static readonly layerOf = (store: ParameterTypeStoreShape): Layer.Layer<ParameterTypeStore> =>
    Layer.succeed(ParameterTypeStore, ParameterTypeStore.of(store))

  /** A FRESH built-ins-only store per Layer build; two builds never see each other's definitions. */
  static readonly Default: Layer.Layer<ParameterTypeStore> = Layer.sync(
    ParameterTypeStore,
    () => ParameterTypeStore.of(createParameterTypeStore())
  )

  /**
   * The consumer-facing way to declare custom parameter types: a fresh store carrying the built-ins plus
   * `definitions`, replayed in order; a rejected definition is a `StepPatternError` in the Layer's error channel
   * (`test/ParameterTypes.test.ts`).
   */
  static readonly layer = (
    definitions: ReadonlyArray<ParameterTypeDefinition<unknown>>
  ): Layer.Layer<ParameterTypeStore, StepPatternError> =>
    Layer.effect(
      ParameterTypeStore,
      Effect.suspend(() => {
        try {
          const store = createParameterTypeStore()
          for (const definition of definitions) {
            store.define(definition)
          }
          return Effect.succeed(ParameterTypeStore.of(store))
        } catch (thrown) {
          return thrown instanceof StepPatternError ? Effect.fail(thrown) : Effect.die(thrown)
        }
      })
    )
}
