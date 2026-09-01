/**
 * Custom parameter types are DATA, not a live registry — ADR-EC-007's second correction,
 * implemented literally.
 *
 * (a) **The governing rule.** A call that defines a custom parameter type appends a plain
 *     `{ name, regexp, transform }` record to an array this library owns. Nothing touches a
 *     `ParameterTypeRegistry` at definition time. Every consumer that needs a registry calls
 *     `buildRegistry()`, which constructs a FRESH one and replays every recorded record into it.
 *     Definitions are permanent, ordinary data: safe to add at any point before any consumer
 *     builds, correctly present in every subsequent build, with no cross-call state and no
 *     duplicate-registration risk ever surfacing.
 *
 *     That single decision closes the whole failure class the correction's predecessor was
 *     self-contradictory about. A fresh registry has nothing registered into it yet, so
 *     re-acquiring the built-ins can never collide; and because replay happens on every build, a
 *     definition added at module scope is present in every later build rather than landing once
 *     in a registry that no longer exists by the time the second consumer asks for one. Pitfall 14
 *     documents that exact bug three separate times in `cypress-cucumber-preprocessor`
 *     (issues #298, #364, #549), where the root cause is a module-level singleton registry.
 *
 *     ARCHITECTURE.md's Anti-Pattern 5 ("one registry owned by `ParameterTypes.ts`") predates the
 *     correction and is superseded on that point. What survives of it is the part that still
 *     matters and is `StepMatcher`'s job: a `CucumberExpression` permanently binds to the registry
 *     instance it was built against, so a compilation cache must be keyed on the (registry,
 *     pattern) PAIR, and no expression may ever get a private registry of its own.
 *
 * (b) **Why a module-level default store is correct here** even though Anti-Pattern 4 forbids a
 *     module-level singleton for the vitest package's step `Registry`. That anti-pattern is about
 *     mutable PER-RUN state: two `describeFeature` calls sharing one step map cross-contaminate,
 *     and its tests become order-dependent. This store holds APPEND-ONLY definitions that are
 *     meant to be process-wide — a custom parameter type declared at module scope in a
 *     `.steps.ts` file is supposed to be visible to every feature loaded afterwards, which is the
 *     entire point of (a). `createParameterTypeStore()` exists so that a test — or any caller
 *     wanting isolation — never has to depend on the default one.
 *
 * (c) **Why the store is a plain object and not a `Layer`-provided service.** ADR-EC-007's
 *     correction floats exposing custom-type registration as a `Context.Service` + `Layer`, and
 *     calls it "the one place `Layer` genuinely earns its keep". It cannot be done in THIS
 *     package: ADR-EC-015 forbids `@effect-cucumber/gherkin` from declaring `effect` in any
 *     manifest field, and `pnpm verify:no-runner-dep` enforces that structurally by scanning both
 *     the source tree and the consumer-facing manifest fields. The ADR is left with an open option
 *     that its own sibling ADR rules out; plan 03-06 adds the implementation note that closes it
 *     in writing rather than leaving a reader to infer the contradiction. A future
 *     `@effect-cucumber/vitest` may wrap a store in a `Layer` — the store being a plain value is
 *     what makes that possible without this package moving.
 *
 * (d) **Every rejection this library can detect from the definition alone happens at DEFINITION
 *     time**, so the error points at the caller's own `define` call rather than at a frame inside
 *     `loadFeature`. One class of rejection is only knowable at REPLAY time, because it depends on
 *     what else the fresh registry already holds: a definition with `preferForRegexpMatch` set
 *     whose regexp source coincides with another preferential type's (the built-in `{int}` uses
 *     `\d+`, for example). Upstream raises that from `defineParameterType`, and `buildRegistry`
 *     wraps it as a `StepPatternError` (`InvalidParameterTypeDefinition`) naming the parameter
 *     type — never as a feature-file `ParseFailed`. Asserted by `test/ParameterTypes.test.ts`
 *     ("a preferential regexp collision is rejected at replay time").
 *
 * The `transform` signature below deliberately omits the `PromiseLike<T>` half of upstream's
 * return type. That is Pitfall 25's fix (a): `Argument.getValue` returns a transform's result
 * UNWRAPPED, so an async transform would hand a step body a promise where its declared parameter
 * type says `number`. Rejecting it at the type level costs nothing here. The runtime guard for the
 * escape route — a caller who casts through `any` — lives in `StepMatcher.ts`, which raises
 * `AsyncParameterTransform` for a thenable and `ParameterTransformFailed` for a throwing
 * transform. Neither half is the other's job; both halves are needed.
 *
 * This module never constructs a regular expression. Every pattern it is handed goes to
 * `CucumberExpression`, which owns all regex construction and escaping (threat T-03-12).
 *
 * Local imports: `./Errors.ts` and `./StepPatternMessages.ts` only. Third-party: the
 * `@cucumber/cucumber-expressions` barrel, never a deep path into that package's published build
 * directory.
 */
import { ParameterType, ParameterTypeRegistry } from "@cucumber/cucumber-expressions"
import * as Context from "effect/Context"
import * as Layer from "effect/Layer"
import * as Option from "effect/Option"
import { describeParameterTypeName as describeName, raiseStepPatternError as fail } from "./StepPatternMessages.ts"

/**
 * One custom parameter type, as data.
 *
 * `T` is the type the transform produces, and therefore the type a step body receives for this
 * parameter. `StepArgs`' `Custom` type parameter is the compile-time counterpart.
 *
 * `definedAt`, `useForSnippets`, `preferForRegexpMatch` are `Option<T>`, not TS-optional
 * `T | undefined` — every construction of this interface (this package's own call sites,
 * `test/ParameterTypeLifecycle.test.ts`'s, and any external caller's) must supply all three
 * explicitly as `Option.some(x)`/`Option.none()`. Unlike `Errors.ts`'s classes this is a plain
 * interface, not a `Schema.TaggedError`, so nothing structurally forces this — it is a
 * consistency choice, matching the same "full `Option`, no `undefined`" scope applied to the
 * rest of this package's public surface.
 */
export interface ParameterTypeDefinition<T> {
  /** The name written between braces in a step pattern: `money` is used as `{money}`. */
  readonly name: string
  /**
   * What the parameter matches. A string is a regexp SOURCE, not a literal, and is handed to
   * upstream verbatim. An array registers several alternatives for the same name.
   */
  readonly regexp: string | RegExp | ReadonlyArray<string | RegExp>
  /**
   * Turn the matched text into a value.
   *
   * The return type is `T`, NOT `T | PromiseLike<T>` as upstream declares it. See the module doc
   * comment: an async transform is a compile error by design, because its promise would reach the
   * step body unwrapped.
   */
  readonly transform: (...match: Array<string>) => T
  /**
   * A human-readable definition site — a `file:line`, a module name, anything recognisable. Used
   * verbatim in the `DuplicateParameterTypeName` message, which names BOTH sites so the caller
   * does not have to search for the other one.
   */
  readonly definedAt: Option.Option<string>
  /** Passed straight through to upstream at replay time (unwrapped there). Upstream defaults it to `true`. */
  readonly useForSnippets: Option.Option<boolean>
  /** Passed straight through to upstream at replay time (unwrapped there). Upstream defaults it to `false`. */
  readonly preferForRegexpMatch: Option.Option<boolean>
}

/**
 * Read the built-in names off a real registry instance rather than writing them down.
 *
 * DERIVED, never hardcoded, and this is load-bearing: `@cucumber/cucumber-expressions` is declared
 * `^20.1.0` and is free to move under us within the major. A release that adds a twelfth built-in
 * is then rejected at `define` time on the day it ships, with a named error, instead of silently
 * colliding at replay time inside `loadFeature`. A hardcoded list would drift in silence
 * (threat T-03-14).
 *
 * `test/expressions-pin.test.ts` pins the current set at eleven names against the real package, so
 * such a change is still VISIBLE rather than merely handled — that pin fails first, and its
 * failure names the dependency rather than this library.
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

/**
 * The flags upstream's `ParameterType` constructor rejects outright. Checked here rather than
 * relying on the upstream throw, so the reason tag is precise and the message names the flag.
 */
const rejectedRegexpFlags: ReadonlyArray<string> = ["g", "i", "m", "y"]

/**
 * The characters `ParameterType.isValidParameterTypeName` actually rejects, after unescaping.
 *
 * Upstream's own thrown message names a DIFFERENT set. This library asks the predicate and quotes
 * this list; it never reads or matches that message. Both facts are pinned in
 * `test/expressions-pin.test.ts`.
 */
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

/**
 * Build the upstream value for one record.
 *
 * A NEW instance per build, deliberately, rather than one cached at definition time: the ADR's
 * correction prescribes replay via `new ParameterType(...)`, and following it literally removes
 * any question about one instance being shared across two registries.
 *
 * `null` is passed for the `type` (constructor/factory) argument — this library never uses
 * upstream's prototype-coercion path; a `transform` is always supplied instead. `false` is passed
 * for `builtin`, because by construction nothing here can be one.
 */
const toUpstreamParameterType = (definition: ParameterTypeDefinition<unknown>): ParameterType<unknown> =>
  new ParameterType<unknown>(
    definition.name,
    toRegexpList(definition.regexp),
    null,
    definition.transform,
    // Upstream's own constructor is plain JS and expects `boolean | undefined`, not an
    // `Option` — this is the boundary where this package's Option-typed public surface meets
    // a library that has no notion of Option, so unwrapping here is expected, not a leak.
    Option.getOrUndefined(definition.useForSnippets),
    Option.getOrUndefined(definition.preferForRegexpMatch),
    false
  )

/**
 * A new, empty store sharing no state with any other store — including
 * `defaultParameterTypeStore`.
 *
 * An append-only collection of custom parameter type definitions, plus the replay that turns
 * them into a registry. There is no `remove` and no `clear`, on purpose: a definition that could
 * be withdrawn would reintroduce exactly the cross-call state (a) exists to eliminate. A caller
 * wanting a different set of definitions creates a different store.
 *
 * The returned shape — `ParameterTypeStoreShape`, defined right below as
 * `ReturnType<typeof createParameterTypeStore>` rather than a hand-written interface, so the two
 * can never drift apart — has zero `Effect` ceremony, exactly as before this module's
 * `ParameterTypeStore` `Context.Service` class was added: that class is what lets
 * `loadFeature`/`parseFeature` receive a store as an ambient dependency instead of a function
 * argument, but the store itself is unchanged, plain data with plain methods.
 */
export const createParameterTypeStore = () => {
  const records: Array<ParameterTypeDefinition<unknown>> = []

  /**
   * Record a custom parameter type. Touches no registry. Throws a `StepPatternError` — with the
   * caller's own `define` call at the top of the stack — if the definition is rejected.
   */
  const define = <T>(definition: ParameterTypeDefinition<T>): void => {
    const { name } = definition

    // FIRST, and this ordering matters: it is what rejects the anonymous empty-string name too,
    // and what guarantees the built-in message wins over the duplicate one for a name that is
    // both.
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

    // Searches `records` directly rather than a parallel name->site map: the store never holds
    // more than a handful of definitions, and a second structure kept in sync by hand is a second
    // place for `define` and this check to silently drift apart.
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
      // A string source is compiled here, once, purely to reject a malformed one at DEFINITION
      // time. Upstream's `ParameterType` constructor stores string sources unparsed, so without
      // this check `"("` would only fail later — inside `new CucumberExpression`, as an
      // `InvalidStepPattern` blaming the step author's pattern (audit finding F-05).
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

    // A copy, not the caller's own array: `definition.regexp` is stored and replayed by
    // `buildRegistry` on every future `loadFeature` call, so aliasing the caller's array would let
    // a mutation made after `define` returns retroactively change an already-recorded definition.
    // A single `string`/`RegExp` value needs no copy — only the array form is caller-mutable here.
    const record: ParameterTypeDefinition<unknown> = Array.isArray(definition.regexp)
      ? { ...definition, regexp: [...definition.regexp] }
      : definition

    // The catch-all. Everything the four checks above name is already gone, so a throw here means
    // upstream rejected the definition for a reason this library did not anticipate — a `^20.1.0`
    // minor moving under us. It still reaches the caller as a named library error carrying the
    // original as `cause`, rather than as a bare upstream error with a column number and no
    // context (threat T-03-03).
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

  /**
   * A FRESH registry, carrying the built-ins plus every recorded definition replayed into it.
   *
   * Safely callable an unbounded number of times, and never memoized. Two calls return two
   * different instances; that is the property MATCH-02 rests on.
   */
  const buildRegistry = (): ParameterTypeRegistry => {
    const registry = new ParameterTypeRegistry()
    for (const record of records) {
      // Wrapped, not a bare call: `record` was already validated once by `define`, but a
      // consumer holding a reference to a mutable field it did NOT copy (or a `^20.1.0` minor
      // moving under us) could still make this throw. Every OTHER upstream call this store makes
      // is wrapped this way; leaving replay bare would let exactly that throw escape every
      // `loadFeature`/`parseFeature` call as a raw, unwrapped exception instead of the
      // `StepPatternError` those functions document themselves as always throwing.
      let upstream: ParameterType<unknown>
      try {
        upstream = toUpstreamParameterType(record)
      } catch (cause) {
        // `return`, not a bare call: `fail` always throws, but a statement-position call leaves
        // `upstream` "used before being assigned" to the compiler — the same definite-assignment
        // narrowing `StepMatcher.ts`'s `constructExpression` split exists to satisfy.
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
      // Wrapped for the same reason: `defineParameterType` is where upstream detects a
      // PREFERENTIAL regexp collision (two `preferForRegexpMatch` types sharing one regexp source,
      // the built-ins included), a check that cannot run at `define` time because it depends on
      // what the fresh registry already holds — note (d).
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

/**
 * The shape `createParameterTypeStore()` returns, derived rather than hand-written so the two
 * can never drift apart. This is what the `ParameterTypeStore` `Context.Service` class below is
 * parameterised over — `createParameterTypeStore()`'s own return value is unaffected either way,
 * it is still called with zero `Effect` ceremony, exactly as it always has been.
 */
export type ParameterTypeStoreShape = ReturnType<typeof createParameterTypeStore>

/**
 * The process-wide store, and the one a caller gets by default.
 *
 * Append-only for the life of the process by design — see (b) in the module doc comment. A test
 * that needs isolation uses `createParameterTypeStore()` instead; a definition added here cannot
 * be withdrawn.
 */
export const defaultParameterTypeStore: ParameterTypeStoreShape = createParameterTypeStore()

/**
 * Record a custom parameter type in the default store.
 *
 * This is the call a `.steps.ts` module makes at module scope. It touches no registry, so calling
 * it before, between or after any number of `loadFeature` calls is equally correct. Deliberately
 * plain and `Effect`-free, even though `ParameterTypeStore` below is a real `Context.Service` now
 * — a step-definition author declaring a custom parameter type should never need to reach for
 * `Effect.gen`/`Effect.provide` just to register one.
 */
export const defineParameterType = <T>(definition: ParameterTypeDefinition<T>): void =>
  defaultParameterTypeStore.define(definition)

/**
 * Build a fresh registry from the default store. Called once per `loadFeature`, never memoized.
 */
export const buildParameterTypeRegistry = (): ParameterTypeRegistry => defaultParameterTypeStore.buildRegistry()

/**
 * The `ParameterTypeStore` shape delivered as an ambient `Effect` dependency, replacing the
 * `LoadFeatureOptions.parameterTypes` argument this package used to take.
 * [ADR-EC-023](../../../spec/decisions/023-parametertypestore-becomes-an-ambient-context-service.md)
 * is the decision record — read it before changing anything here, especially the reasoning
 * behind there being NO internal default baked into `parseFeature`/`loadFeature` themselves.
 *
 * `Context.Service<ParameterTypeStore, ParameterTypeStoreShape>()(...)`, matching the pattern
 * ADR-EC-002 already established for `World` in the (not yet built) `@effect-cucumber/vitest`
 * DSL: the Tag class IS the public name, its Shape is the plain interface above, and `.of(...)`
 * lifts a plain shape value into the branded Service value `yield*` resolves to.
 */
export class ParameterTypeStore
  extends Context.Service<ParameterTypeStore, ParameterTypeStoreShape>()("@effect-cucumber/gherkin/ParameterTypeStore")
{
  /** Wrap any `ParameterTypeStoreShape` — `createParameterTypeStore()`'s or a hand-built one — as a provide-able Layer. */
  static readonly layerOf = (store: ParameterTypeStoreShape): Layer.Layer<ParameterTypeStore> =>
    Layer.succeed(ParameterTypeStore, ParameterTypeStore.of(store))

  /**
   * Wraps `defaultParameterTypeStore` — the SAME singleton `defineParameterType` writes into —
   * so a `.steps.ts` module's module-scope `defineParameterType` calls are visible to any
   * `loadFeature`/`parseFeature` call this Layer is provided to, exactly matching today's
   * behavior. Not provided automatically: see the class doc comment and ADR-EC-023.
   */
  static readonly Default: Layer.Layer<ParameterTypeStore> = ParameterTypeStore.layerOf(defaultParameterTypeStore)
}
