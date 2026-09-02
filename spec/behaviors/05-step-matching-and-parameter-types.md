# 05 — Step matching and parameter types

How a step's text becomes typed arguments.
[BEH-EC-014](./04-loadfeature-parse-and-validation.md) specifies how a `.feature` file becomes a
`ParsedFeature`; this file specifies what happens to the step text inside it — how a pattern
resolves that text to arguments already coerced to the right TypeScript types, and how a custom
parameter type gets into the registry those arguments are resolved against.

What this file deliberately does **not** specify is the verdict on a step that matches no pattern,
or one that matches more than one. Returning every match is a matching rule and belongs here;
[BEH-EC-013](./01-steps-and-world.md) owns what zero or many matches _mean_ and where the resulting
error is raised, because that decision needs the Scenario and its source location, which this layer
does not have.

See [`spec/roadmap.md`](../roadmap.md) for what is built versus what is only specified — this
document describes the contract, not the build status.

---

## BEH-EC-015: Step text resolves to typed arguments against a per-call parameter type registry

> **See:** [ADR-EC-007](../decisions/007-cucumber-expressions-for-step-matching.md), [ADR-EC-019](../decisions/019-fail-loudly-on-unmatched-or-ambiguous-steps.md)

A step pattern is a cucumber-expression, reused verbatim rather than reimplemented (ADR-EC-007).
That choice buys argument coercion for free — but only if three things are true at once, and each
of them is a place a naive implementation goes wrong in a way nothing fails on.

The parameters have to arrive at the step body as the types the body declares, not as the strings
the feature file contained. A custom parameter type has to be usable from a `.steps.ts` module's
top level without the author knowing that a registry exists, and without a second feature load
throwing on the first one's registrations. And a step text that two patterns both match has to stay
visibly ambiguous, because the alternative — the first registration wins — makes an argument's type
depend on the order two unrelated `Given` calls happen to appear in.

```
REQUIREMENT: A step pattern is a cucumber-expression. Its arguments MUST arrive
             at the step body already coerced to the parameter type's
             TypeScript type — both at runtime and in the type system, so what
             the step body declares is what it actually receives. The eleven
             built-in names every registry pre-registers coerce as follows:

               {int}        number
               {float}      number
               {word}       string
               {string}     string, with the surrounding quotes already
                            stripped
               {double}     number
               {bigdecimal} string, NOT number — the raw text is kept so an
                            arbitrary-precision decimal survives
               {byte}       number
               {short}      number
               {long}       number, NOT bigint
               {biginteger} bigint — the one built-in whose value cannot be
                            compared with === against a numeric literal
               {}           string — the anonymous type, whose registry name is
                            the empty string, applies no transform

             {float} also matches integer text; {int} does NOT match a decimal.

             A construct that is not a parameter contributes NO argument. An
             optional group (s), an alternation a/b, and a parameter escaped by
             a preceding backslash all contribute nothing to the argument list,
             and MUST NOT shift the position of any argument that follows.

             Consequence, and the reason no separate mechanism exists for it: a
             Scenario Outline's Examples values are typed for free. compile()
             substitutes the example value into the step text, the pattern's own
             coercion then converts it, so a typed "example row" mechanism is
             neither specified nor needed for the common case.
```

```
REQUIREMENT: A custom parameter type MUST be declared as a plain
             { name, regexp, transform } record appended to a store this
             library owns. Declaring one MUST NOT touch a
             ParameterTypeRegistry: at declaration time there is no registry
             in play at all, only data.

             Every loadFeature / parseFeature call MUST construct a FRESH
             ParameterTypeRegistry and replay every recorded record into it.
             A definition made once at module scope is therefore present in
             every subsequent call, and a duplicate-registration failure can
             never occur across calls — a fresh registry has nothing registered
             into it yet.

             Two declarations MUST be rejected, and both MUST be rejected at
             DECLARATION time rather than at replay time or at match time, so
             that the error points at the caller's own call rather than at a
             frame several modules away inside loadFeature:

               a name colliding with one of the registry's pre-registered
               built-ins — rejected, never shadowed

               a name already recorded in the same store — rejected with a
               message naming BOTH definition sites, so the caller does not
               have to search for the other one

             A regexp given as a STRING source MUST be compiled once at
             declaration time and rejected (InvalidParameterTypeRegexp) if it
             is malformed; upstream stores string sources unparsed, so without
             this the failure would surface at step-compile time blaming the
             step author's pattern. A RegExp carrying a flag upstream rejects
             (g, i, m, y) is rejected the same way.

             One rejection is only knowable at REPLAY time, because it depends
             on what the fresh registry already holds: a definition with
             preferForRegexpMatch set whose regexp source coincides with
             another preferential type's (the built-in {int} among them). It
             MUST surface from loadFeature / parseFeature as a StepPatternError
             (InvalidParameterTypeDefinition) naming the parameter type, and
             MUST NOT be reported as a feature-file ParseFailed.

             A transform MUST be synchronous. The matched value is read back
             unwrapped, so an async transform would hand a step body a Promise
             where its declared parameter type says otherwise.
```

```
REQUIREMENT: A step matcher MUST evaluate a step text against EVERY registered
             pattern and return every match, never the first registered one.
             The reason belongs in the requirement rather than a footnote:
             @cucumber/cucumber-expressions does not detect two step patterns
             both matching one step text, so a first-match-wins matcher makes a
             step argument's TYPE depend on the order the step definitions were
             written in, and a refactor that reorders them silently changes
             what a test asserts, with nothing failing anywhere.

             Zero matches and many matches MUST both be returned as data rather
             than thrown. Deciding what either outcome means — and raising the
             error that names the step text, the Scenario, and every ambiguous
             pattern — is BEH-EC-013's job under ADR-EC-019, not this layer's.

             Compilation MUST be memoized per (registry, pattern) pair and
             NEVER per pattern alone. A compiled expression permanently binds
             to, and snapshots the parameter types of, the registry it was
             constructed with, so a pattern-keyed cache serves an expression
             bound to a registry that no longer describes anything the moment a
             second registry exists.
```

### Two decisions a reader will otherwise ask about

**Why the store's data stays a plain object even though its delivery is now a `Layer`.**
[ADR-EC-007](../decisions/007-cucumber-expressions-for-step-matching.md)'s correction floated
exposing custom-type registration as a `Context.Service` + `Layer`-provided service, and called
it "the one place `Layer` genuinely earns its keep" — but at the time
[ADR-EC-015](../decisions/015-effect-is-a-peer-dependency.md) forbade `@effect-cucumber/gherkin`
from declaring `effect` in any manifest field at all, ruling the option out entirely.
[ADR-EC-021](../decisions/021-effect-and-platform-are-peer-dependencies-of-gherkin.md) reversed
that constraint, and [ADR-EC-023](../decisions/023-parametertypestore-becomes-an-ambient-context-service.md)
is what actually spends the newly-available option — but only on HOW a store reaches
`loadFeature`/`parseFeature`, not on what a store IS. `createParameterTypeStore()` still returns a
plain object (`ParameterTypeStoreShape`, `define`/`definitions`/`buildRegistry`, zero `Effect`
ceremony); `ParameterTypeStore` is a `Context.Service` class that wraps one, giving
`loadFeature`/`parseFeature` an ambient requirement the same way `FileSystem.FileSystem` already
was, instead of a hand-passed argument. There is no process-wide store (ADR-EC-023, as amended):
`ParameterTypeStore.layer(definitions)` is how a caller declares custom types, as a Layer carrying
a fresh store, and `ParameterTypeStore.Default` builds a fresh built-ins-only store per build.

**Why a built-in name is rejected rather than shadowed.** Allowing a custom type to override
`{int}` would make the meaning of `{int}` depend on which modules happened to be imported, in which
order — the same class of order-dependence the match-every-pattern rule exists to remove. The
rejection is raised by the declaration call itself, so the error points at the caller's own code
rather than surfacing later as a coercion that quietly produced the wrong type.

### Signatures

```ts
export interface ParameterTypeDefinition<T> {
  readonly name: string
  readonly regexp: string | RegExp | ReadonlyArray<string | RegExp>
  readonly transform: (...match: Array<string>) => T
  readonly definedAt: Option.Option<string>
  readonly useForSnippets: Option.Option<boolean>
  readonly preferForRegexpMatch: Option.Option<boolean>
}

export const createParameterTypeStore: () => ParameterTypeStoreShape
export const builtInParameterTypeNames: ReadonlySet<string>

export class ParameterTypeStore extends Context.Service<ParameterTypeStore, ParameterTypeStoreShape>()(
  "@effect-cucumber/gherkin/ParameterTypeStore"
) {
  static readonly layerOf: (store: ParameterTypeStoreShape) => Layer.Layer<ParameterTypeStore>
  static readonly layer: (
    definitions: ReadonlyArray<ParameterTypeDefinition<unknown>>
  ) => Layer.Layer<ParameterTypeStore, StepPatternError>
  static readonly Default: Layer.Layer<ParameterTypeStore>
}

export const compileExpression: (registry: ParameterTypeRegistry, pattern: string) => CucumberExpression
export const createStepMatcher: <D>(
  args: { registry: ParameterTypeRegistry; entries: ReadonlyArray<StepPatternEntry<D>> }
) => StepMatcher<D>

export interface ParsedFeature extends ParsedFeatureCore {
  readonly warnings: ReadonlyArray<LoadFeatureWarning>
  readonly parameterTypes: ParameterTypeRegistry
}
```

`ParameterTypeDefinition`'s three optional-in-spirit fields are `Option<T>`, never `T | undefined`,
per [ADR-EC-022](../decisions/022-option-replaces-undefined-in-gherkins-public-api.md) — a caller
constructs every one of them explicitly as `Option.some(x)`/`Option.none()`. `ParameterTypeStoreShape`
is `ReturnType<typeof createParameterTypeStore>`, a derived type rather than a hand-written
interface; it is what both `createParameterTypeStore()` and `ParameterTypeStore` (the ambient
`Context.Service`, [ADR-EC-023](../decisions/023-parametertypestore-becomes-an-ambient-context-service.md))
are typed over. A registry is built from a store by that store's own `.buildRegistry()`, or
reached ambiently through `loadFeature`/`parseFeature`'s `ParameterTypeStore` requirement; a rejected
definition handed to `ParameterTypeStore.layer` fails in the Layer's error channel as a
`StepPatternError`, never as a throw at module scope.

`ParameterTypeRegistry` is re-exported by the package because `ParsedFeature` surfaces it;
`CucumberExpression` is the cucumber-expressions library's own type and is reached through
`compileExpression`'s return value rather than named by a consumer.

`StepArgs` is the compile-time counterpart of a match's arguments — a type-level function from the
pattern string literal to the tuple the step body receives, which is what makes the coercion
requirement above true in the type system and not only at runtime:

```ts
type A = StepArgs<"I have {int} cukes"> // [number]
type B = StepArgs<"I have {int} kg of {word}"> // [number, string]
type C = StepArgs<"literal a \\{int} b"> // []        — the escaped parameter contributes nothing
type D = StepArgs<"I pay {money}"> // [unknown]  — a name no built-in claims
type E = StepArgs<"I pay {money}", { money: number }> // [number]   — narrowed by the Custom map
```

An unregistered `{name}` resolves to `unknown` rather than to a compile error: a custom parameter
type is runtime data, and nothing about its transform's return type is recoverable from a pattern
string literal. The second type parameter is the escape hatch for a caller who wants it narrowed,
and a built-in always wins over it — mirroring the runtime rejection above.

### Worked example

`loadFeature` here is `@effect-cucumber/gherkin`'s own — `Effect`-returning, requiring
`FileSystem.FileSystem | ParameterTypeStore` — never the distinct, `Promise`-returning
`@effect-cucumber/vitest` wrapper [ADR-EC-024](../decisions/024-vitest-owns-a-managedruntime-for-collection-time-loadfeature.md)
describes; see [BEH-EC-001](./01-steps-and-world.md)'s worked example for that one.

```typescript
import { createStepMatcher, loadFeature, ParameterTypeStore, type StepMatch } from "@effect-cucumber/gherkin"
import { NodeFileSystem } from "@effect/platform-node"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as Option from "effect/Option"

// A custom parameter type is data handed to a Layer: ParameterTypeStore.layer builds a fresh
// store carrying the built-ins plus these definitions, and every loadFeature call the Layer is
// provided to replays them into its own fresh registry. There is no process-wide store to write
// into (ADR-EC-023, as amended); a rejected definition fails in the Layer's error channel.
const parameterTypes = ParameterTypeStore.layer([{
  name: "money",
  regexp: "\\d+",
  // Synchronous, by requirement — the value is handed to the step body unwrapped.
  transform: (amount: string): number => Number(amount),
  definedAt: Option.some("checkout.steps.ts"),
  useForSnippets: Option.none(),
  preferForRegexpMatch: Option.none()
}])

// Matching FileSystem.FileSystem, no Layer is baked in internally, so the store is provided
// explicitly here. Layer.mergeAll, not chained .pipe(Effect.provide(a), Effect.provide(b)) calls:
// @effect/tsgo's multipleEffectProvide diagnostic fails the build on the chained form
// (ADR-EC-016).
const feature = await Effect.runPromise(
  loadFeature("checkout.feature").pipe(Effect.provide(Layer.mergeAll(NodeFileSystem.layer, parameterTypes)))
)

// The registry comes off the feature this matcher will be used against, never from a registry
// built independently — an expression binds permanently to the registry it was compiled with.
const matcher = createStepMatcher({
  registry: feature.parameterTypes,
  entries: [
    { pattern: "I pay {money} for {int} items", definition: "pay" },
    { pattern: "I have {int} items", definition: "have" }
  ]
})

const resolve = (text: string): StepMatch<string> => {
  const matches = matcher.match(text)
  switch (matches.length) {
    case 1:
      // args is [number, number] for the first pattern: {money} through the transform above,
      // {int} through the built-in.
      return matches[0]!
    case 0:
      // BEH-EC-013's territory, not this layer's: an unmatched step is reported there, naming the
      // step text and its source location.
      throw new Error(`no registered pattern matches: ${text}`)
    default:
      // Also BEH-EC-013's: every matching pattern is named, rather than the first one silently
      // winning and fixing this step's argument types by registration order.
      throw new Error(`${matches.length} patterns match: ${text}`)
  }
}
void resolve
```

---

_Previous: [04 — loadFeature parse and validation](./04-loadfeature-parse-and-validation.md)_

_Next: [06 — DataTable and DocString arguments](./06-datatable-and-docstring-arguments.md)_
