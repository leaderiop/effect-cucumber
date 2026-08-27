# effect-cucumber — API Design

## Problem

- `@effect/vitest` gives Effect-native tests (`it.effect`, `it.layer`, `TestClock`, scoped resources) but no Gherkin.
- `@amiceli/vitest-cucumber` gives Gherkin-on-vitest (`describeFeature`, `Given/When/Then`, Background, Outlines, tags) but step bodies are plain `(ctx, ...params) => MaybePromise` — no Layer-based DI, no TestClock, no structured error channel, world state is an untyped `context: any`.

Goal: steps are Effects. Dependencies for a scenario come from a `Layer`, not manual setup in a shared mutable object. Gherkin parsing/step-matching is reused, not reinvented.

## Non-goals (v1)

- No new Gherkin parser — depend on `@cucumber/gherkin` + `@cucumber/cucumber-expressions` directly (see Open Decision 1).
- Not a replacement test runner — output is still vitest tests; `vitest run`/watch/reporters work unchanged.
- No HTML/cucumber-report output — defer to vitest reporters for v1.

## Core decisions

### 1. A step is `(...params) => Effect<void, E, R>`

```ts
Given('I have {int} apples', function* (count: number) {
  const world = yield* World
  yield* Ref.update(world.apples, () => count)
})
```

The DSL wraps the generator with `Effect.fn(stepText)` internally (see #4), so the value it produces is `(...params) => Effect<void, E, R>` either way. No `ctx` parameter. vitest-cucumber uses `ctx` for two things — assertions and a mutable `context` bag — both replaced below.

### 2. World is a typed Effect service, not `context: any`

vitest-cucumber's `context: T` is a plain object every step mutates by convention; nothing stops a step from reading a field before it's set, and `T` is usually `any` in practice. Replace it with a `Context.Service` (v4 shape — see Decisions log), built by a `Layer` like any other dependency:

```ts
class World extends Context.Service<World, {
  readonly apples: Ref.Ref<number>
}>()('World') {
  static readonly layer = Layer.effect(this, Effect.gen(function* () {
    return World.of({ apples: yield* Ref.make(0) })
  }))
}
```

Steps `yield* World` to get typed, compiler-checked access. This also means World composes with real app services under test — it's just another entry in the Layer.

### 3. `describeFeature` takes a Layer; step requirements are typechecked against it

```ts
describeFeature(
  feature,                    // from loadFeature(...)
  World.layer,                // Layer<World, E, never> — fresh per Scenario
  ({ Background, Scenario, Given, When, Then }) => {
    Background(function* () { ... })

    Scenario('Eating apples', () => {
      Given('I have {int} apples', function* (n) { ... })
      When('I eat {int} apples', function* (n) { ... })
      Then('I have {int} apples left', function* (n) { ... })
    })
  },
)
```

If a step's Effect requires an `R` the Layer doesn't provide, it's a **type error at the step definition**, not a runtime "service not found." This is the main gap this library closes versus both source libraries (neither typechecks scenario dependencies).

### 4. Execution: one `it.effect` per Scenario; fail-fast is free

Each Scenario compiles to:

```ts
it.effect(scenarioName, () =>
  Effect.gen(function* () {
    yield* backgroundStepsEffect
    yield* scenarioStepsEffect   // sequential yield*
  }).pipe(Effect.provide(layer)))
```

Background + Scenario steps are sequential `yield*` inside one `Effect.gen`. Effect's error channel already short-circuits on the first failing step — no manual "skip remaining steps" bookkeeping needed, unlike a hand-rolled promise-chain runner.

To make a failure's stack/message tell you *which Given/When/Then* failed, the DSL wraps each step body with **`Effect.fn(stepText)`** instead of a manual `Effect.withSpan`. `Effect.fn(name)(function*(...args) { ... })` already gives a named tracing span plus improved stack traces, and its shape — `(...params) => Effect<A, E, R>` — is exactly a step definition's shape. Concretely, `Given`/`When`/`Then` accept a bare generator function and apply `Effect.fn(stepText)` to it internally:

```ts
Given('I have {int} apples', function* (n: number) {
  const { apples } = yield* World
  yield* Ref.set(apples, n)
})
```

No `Effect.gen` wrapper needed — `Effect.gen(function*(){})` is for an inline, unnamed, parameterless Effect value; a step is never that, it's always a named function with params, which is precisely what `Effect.fn` is for. If a step needs extra pipeable behavior (e.g. `Effect.retry`, `Effect.catchTag`) that doesn't compose with the internal auto-wrap, drop down to calling `Effect.fn(stepText)(function* (...) {...}, Effect.retry(...))` explicitly and pass the resulting function straight to `Given`/`When`/`Then` — the DSL accepts either form, since both produce `(...params) => Effect<A, E, R>`. Scenarios stay single vitest tests, not one-test-per-step, matching how vitest-cucumber reports today.

Gets `it.effect`'s test services for free: `TestClock`, `TestConsole`, a fresh `Scope` closed at test end (so `Effect.acquireRelease` in a step or Background is safe without wrapping in `Effect.scoped` manually).

### 5. Hooks are Effects, `After` always runs

Same treatment as steps: hooks accept a bare generator function, and the DSL wraps it with `Effect.fn(name)` internally — `name` is just the hook's own name (`"Before"`, `"After"`, ...) since there's no per-call step text to use. This is purely about how the hook *body* is authored (named span, better stack trace); it's orthogonal to how the runner *guarantees* the hook runs, which is still `Effect.ensuring` applied by the runner around the scenario Effect, not something the hook author writes.

```ts
Before(function* () { ... })

After(function* () { ... })
// runner composes this as: scenarioEffect.pipe(Effect.ensuring(afterHookEffect))
// so it fires even if a Given/When/Then failed — the hook body itself doesn't opt into that

BeforeStep(function* (stepText: string) { ... })  // stepText is the about-to-run step's text
AfterStep(function* (stepText: string) { ... })   // stepText is the step that just ran

BeforeAllScenarios(function* () { ... })          // feature-level, see #6
AfterAllScenarios(function* () { ... })
```

`BeforeStep`/`AfterStep` still get one span per hook definition (`"BeforeStep"`/`"AfterStep"`), not one per step invocation — if you want the current step's text on the span, annotate it from inside the hook body (`Effect.annotateCurrentSpan({ step: stepText })`) rather than expecting `Effect.fn`'s name to vary per call.

### 6. Two Layer scopes: per-Scenario (default) and per-Feature (opt-in)

- Per-Scenario (default, shown above): fresh state every Scenario — right for fakes/in-memory adapters, mirrors `it.effect`.
- Per-Feature (opt-in): one Layer instance shared across all Scenarios in the feature — right for expensive resources (testcontainers, a real DB connection). Implemented by delegating straight to `@effect/vitest`'s own `layer(...)` helper (not reimplemented) — see Test runner integration below for why.

```ts
describeFeature(feature, {
  shared: Database.layer,      // built once, via @effect/vitest's `layer(...)`
  perScenario: World.layer,    // fresh per Scenario, merged with `shared`
}, define)
```

### 7. Step matching stays cucumber-expressions

Same `{int}`, `{string}`, `{word}`, custom types via `defineParameterExpression` — this is the one piece worth reusing verbatim (see Open Decision 1) so migrating an existing vitest-cucumber suite is a rewrite of step *bodies* into Effects, not of feature files or step patterns.

### 8. Data tables / doc strings decode through Schema

```ts
Given('the following users:', function* (table: DataTable) {
  const users = yield* Schema.decodeUnknown(Schema.Array(User))(table.hashes())
  ...
})
```

Decode failures are just another typed error in the step's `E` channel, not a thrown exception you have to remember to catch.

### 9. Cross-step scenario state must live in a `Ref` from a Layer, never a closure variable

`Scenario(name, () => { Given(...); When(...); Then(...) })`'s callback runs exactly **once, at registration time** — when `describeFeature`'s define callback executes, before any `it.effect` body has run. It doesn't re-run per test execution; it runs once to collect the Given/When/Then function references into that Scenario's step list. Those captured functions are what the generated `it.effect` body invokes, possibly more than once (retries, `it.flakyTest`, a rerun in watch mode without a full module reload).

That means a bare `let` declared inside a `Scenario`/`Rule`/`Background` callback is a single shared variable across *every* execution of that Scenario's `it.effect` — it is never reset between runs, which silently reintroduces the exact cross-run state leakage `World` was built to prevent (decision #2). **Rule:** any value one step computes and a later step consumes — a running total, a caught error, a derived subtotal — must live in a `Ref` obtained from `World` (or another Layer-provided service), never a `let` in the enclosing closure.

### 10. `Rule` and `Scenario` can extend the ambient Layer with an extra per-Scenario Layer

```ts
Rule(name, extraLayer, (dsl) => { ... })     // extraLayer available only to Scenarios inside this Rule
Scenario(name, extraLayer, () => { ... })    // same, scoped to just this one Scenario
```

`extraLayer` is combined with whatever's already ambient (the Feature's `perScenario`, plus `shared` if present) via `Layer.provideMerge(ambient)(extraLayer)` — so `extraLayer` can itself depend on ambient services, and both remain available to steps afterward. There is **no third scope**: this is always per-Scenario, built fresh every Scenario, same lifecycle as the Feature's default Layer. A resource that needs to be shared across every Scenario *within a Rule* (not the whole Feature) isn't supported directly — promote it into the Feature's `shared` Layer instead.

Hooks (`Before`/`After`/`BeforeStep`/`AfterStep`) declared inside a `Rule`'s dsl apply only to Scenarios within that Rule. Hooks declared at the Feature's top-level dsl apply to every Scenario in the Feature, including ones nested inside a Rule.

## Test runner integration

No vitest plugin, no custom reporter, no vitest config changes. A `.feature` file is plain data read by `loadFeature` — vitest never sees it directly. The file vitest's own `include` glob discovers is the `.steps.ts` file, which is an ordinary test module that happens to call `describeFeature`. Everything below reduces to real `describe`/`it.effect` calls, so `vitest run`, watch mode, `-t "<pattern>"`, and reporters all work unmodified.

**Structural mapping:**

| Gherkin | vitest / `@effect/vitest` |
|---|---|
| `Feature` | `describe(feature.name, () => { ... })` |
| `Rule` (nested under Feature) | nested `describe(rule.name, () => { ... })` |
| `Scenario` | `it.effect(scenario.name, () => scenarioEffect)` |
| `Scenario Outline` + `Examples` row *i* | `it.effect(\`${scenario.name} (example ${i})\`, ...)` — one call per row |
| `Background` | inlined as the first `yield*`s of every Scenario's `Effect.gen`, not a separate vitest hook |
| `@skip` tag | `it.effect.skip(...)` instead of `it.effect(...)` |
| `@only` tag | `it.effect.only(...)` instead of `it.effect(...)` |
| other tags / `excludeTags` | filtered at *registration* time — `describeFeature` simply doesn't call `it.effect(...)` for an excluded Scenario, so vitest never even sees it as a skipped test |
| `BeforeAllScenarios` / `AfterAllScenarios` | the generated `describe` block's own `beforeAll`/`afterAll`, each running `Effect.runPromise(hookEffect.pipe(Effect.provide(sharedLayer)))` |

**Why the "shared" per-Feature Layer delegates to `@effect/vitest`'s `layer(...)` instead of hand-rolled `beforeAll`/`afterAll`:** `layer(SomeLayer)((it) => { it.effect(...); it.layer(NestedLayer)("group", (it) => { ... }) })` already gives build-once memoization, correct teardown via the layer's own `Scope`, and nested-group support — exactly what a shared Feature-level resource (a testcontainer, a DB connection) needs. Reimplementing that with manual `beforeAll`/`Ref`/`afterAll` bookkeeping would just be a worse copy of something `@effect/vitest` already does correctly. Concretely, `describeFeature(feature, { shared, perScenario }, define)` desugars to:

```ts
describe(feature.name, () => {
  layer(shared)((it) => {
    for (const scenario of feature.scenarios) {
      const run = scenario.tags.includes('@skip') ? it.effect.skip
        : scenario.tags.includes('@only') ? it.effect.only
        : it.effect

      run(scenario.name, () =>
        scenarioEffect(scenario).pipe(Effect.provide(perScenario)))
    }
  })
})
```

When there's no `shared` Layer (the common, per-Scenario-only case), this collapses to the simpler form already shown in decision #4 — `it.effect(scenario.name, () => scenarioEffect.pipe(Effect.provide(perScenario)))` directly under `describe(feature.name, ...)`, with no `layer(...)` wrapper at all.

**Result in the vitest UI/CLI:** a run shows `Eating apples > Eating apples ✓` (Feature name, then Scenario name) exactly like nested `describe`/`it` blocks, because that's literally what they are. `vitest run -t "Eating apples"` filters by Scenario name for free, since Scenario names are real test names, not something a custom reporter has to re-derive from Gherkin.

## Full example

```ts
import { describeFeature, loadFeature } from '@effect-cucumber/vitest'
import { Context, Effect, Layer, Ref } from 'effect'

const feature = loadFeature('./apples.feature')

class World extends Context.Service<World, { apples: Ref.Ref<number> }>()('World') {
  static readonly layer = Layer.effect(this, Effect.gen(function* () {
    return World.of({ apples: yield* Ref.make(0) })
  }))
}

describeFeature(feature, World.layer, ({ Background, Scenario, Given, When, Then }) => {
  Scenario('Eating apples', () => {
    Given('I have {int} apples', function* (n: number) {
      const { apples } = yield* World
      yield* Ref.set(apples, n)
    })

    When('I eat {int} apples', function* (n: number) {
      const { apples } = yield* World
      yield* Ref.update(apples, (a) => a - n)
    })

    Then('I have {int} apples left', function* (expected: number) {
      const { apples } = yield* World
      const actual = yield* Ref.get(apples)
      expect(actual).toBe(expected)
    })
  })
})
```

## Worked example: Background + tags + shared Layer

Stress-tests the mapping table above against a feature with a `Background`, a `@skip`-tagged Scenario, and a shared per-Feature Layer alongside a per-Scenario one.

**`accounts.feature`**
```gherkin
Feature: User accounts

  Background:
    Given the database is empty

  Scenario: Creating a user
    When I create a user named "Ada"
    Then the database has 1 user

  @skip
  Scenario: Deleting a missing user
    When I delete a user named "Ghost"
    Then the operation fails with "not found"
```

**`accounts.steps.ts`**
```ts
import { describeFeature, loadFeature } from '@effect-cucumber/vitest'
import { Context, Effect, Layer, Option, Ref, Schema } from 'effect'

const feature = loadFeature('./accounts.feature')

class DatabaseError extends Schema.TaggedError<DatabaseError>()('DatabaseError', {
  message: Schema.String,
}) {}

// Shared per-Feature: one in-memory "database" for every Scenario in this file
class Database extends Context.Service<Database, {
  readonly create: (name: string) => Effect.Effect<void>
  readonly delete: (name: string) => Effect.Effect<void, DatabaseError>
  readonly count: Effect.Effect<number>
  readonly clear: Effect.Effect<void>
}>()('Database') {
  static readonly layer = Layer.effect(this, Effect.gen(function* () {
    const users = yield* Ref.make<ReadonlySet<string>>(new Set())
    return Database.of({
      create: (name) => Ref.update(users, (s) => new Set([...s, name])),
      delete: (name) => Effect.gen(function* () {
        const current = yield* Ref.get(users)
        if (!current.has(name)) return yield* new DatabaseError({ message: 'not found' })
        yield* Ref.update(users, (s) => { const next = new Set(s); next.delete(name); return next })
      }),
      count: Effect.map(Ref.get(users), (s) => s.size),
      clear: Ref.set(users, new Set()),
    })
  }))
}

// Per-Scenario: fresh every Scenario, holds the last caught error for "Then it fails" steps
class World extends Context.Service<World, {
  readonly lastError: Ref.Ref<Option.Option<DatabaseError>>
}>()('World') {
  static readonly layer = Layer.effect(this, Effect.gen(function* () {
    return World.of({ lastError: yield* Ref.make(Option.none()) })
  }))
}

describeFeature(
  feature,
  { shared: Database.layer, perScenario: World.layer },
  ({ Background, Scenario, When, Then }) => {
    Background(function* () {
      yield* (yield* Database).clear
    })

    Scenario('Creating a user', () => {
      When('I create a user named {string}', function* (name: string) {
        yield* (yield* Database).create(name)
      })

      Then('the database has {int} user', function* (expected: number) {
        expect(yield* (yield* Database).count).toBe(expected)
      })
    })

    // No `.skip` here in code — the @skip tag in accounts.feature is what
    // routes this Scenario to `it.effect.skip` (see desugaring below).
    Scenario('Deleting a missing user', () => {
      When('I delete a user named {string}', function* (name: string) {
        const world = yield* World
        yield* (yield* Database).delete(name).pipe(
          Effect.catchTag('DatabaseError', (e) => Ref.set(world.lastError, Option.some(e))),
        )
      })

      Then('the operation fails with {string}', function* (message: string) {
        const error = yield* Ref.get((yield* World).lastError)
        expect(Option.isSome(error) && error.value.message).toBe(message)
      })
    })
  },
)
```

**What this desugars to** (hand-expanded, per the mapping table — `describeFeature` generates this, you never write it):

```ts
import { describe } from 'vitest'
import { layer } from '@effect/vitest'
import { Effect } from 'effect'

describe('User accounts', () => {
  layer(Database.layer)((it) => {
    // Background steps aren't a hook — they're the first `yield*`s of every Scenario's Effect
    const background = Effect.fn('Given the database is empty')(function* () {
      yield* (yield* Database).clear
    })

    // Scenario: Creating a user — no tags, so plain `it.effect`
    const createUserStep = Effect.fn('I create a user named {string}')(function* (name: string) {
      yield* (yield* Database).create(name)
    })
    const countStep = Effect.fn('the database has {int} user')(function* (expected: number) {
      expect(yield* (yield* Database).count).toBe(expected)
    })

    it.effect('Creating a user', () =>
      Effect.gen(function* () {
        yield* background()
        yield* createUserStep('Ada')
        yield* countStep(1)
      }).pipe(Effect.provide(World.layer)))

    // Scenario: Deleting a missing user — @skip tag routes to `it.effect.skip`
    const deleteStep = Effect.fn('I delete a user named {string}')(function* (name: string) { /* ... */ })
    const failsStep = Effect.fn('the operation fails with {string}')(function* (message: string) { /* ... */ })

    it.effect.skip('Deleting a missing user', () =>
      Effect.gen(function* () {
        yield* background()
        yield* deleteStep('Ghost')
        yield* failsStep('not found')
      }).pipe(Effect.provide(World.layer)))
  })
})
```

`Database.layer` is built once by `layer(...)` and shared by both Scenarios (memoized); `World.layer` is provided fresh per `it.effect`, so each Scenario gets its own `lastError` Ref even though they share the same `Database`. Running this shows:

```
✓ User accounts > Creating a user
↓ User accounts > Deleting a missing user (skipped)
```

`Database.clear` in `Background` running per-Scenario against a *shared* layer is exactly why `clear` exists on `Database` in the first place — without it, "Creating a user" would leak into "Deleting a missing user"'s count. That interaction (shared Layer + Background-as-reset) is a real design tension worth keeping in mind once Rules/Outlines are added: a `Background` can't assume a fresh Layer if the Layer is `shared`, so step authors are responsible for resetting shared state themselves — the DSL can't do it for them.

## Worked example: Rule + ScenarioOutline + TestClock + a Rule-scoped Layer

Stress-tests decisions #9 and #10, plus `TestClock` integration and `Scenario Outline`/`Examples` typing.

**`discounts.feature`**
```gherkin
Feature: Checkout discounts

  Background:
    Given the cart contains:
      | item   | price |
      | Widget | 10.00 |
      | Gadget | 25.00 |

  Rule: Percentage discounts expire at midnight

    Scenario Outline: Applying a valid discount code
      Given a discount code "<code>" worth <percent>% expiring in "1 hour"
      When I apply the discount code "<code>"
      Then the total is <expected>

      Examples:
        | code   | percent | expected |
        | SAVE10 | 10      | 31.50    |
        | SAVE50 | 50      | 17.50    |

    Scenario: Expired discount codes are rejected
      Given a discount code "OLD5" worth 5% expiring in "1 hour"
      When 2 hours pass
      And I apply the discount code "OLD5"
      Then the discount is rejected with "code expired"
```

Note there's no explicit Schema-decoded "example row" object anywhere below — `<code>`, `<percent>`, `<expected>` are substituted into the step *text* by the Gherkin parser before matching, so `{string}`/`{int}`/`{float}` in the step pattern already coerce them the same way they would for a hand-written Scenario. This resolves the "ScenarioOutline typing" question from earlier: nothing extra is needed for the common case, since example values are almost always referenced from inside a step's pattern anyway.

**`discounts.steps.ts`**
```ts
import { describeFeature, loadFeature } from '@effect-cucumber/vitest'
import { Clock, Context, Duration, Effect, Layer, Option, Ref, Schema } from 'effect'
import { TestClock } from 'effect/testing'

const feature = loadFeature('./discounts.feature')

const CartRow = Schema.Struct({ item: Schema.String, price: Schema.NumberFromString })

class DiscountError extends Schema.TaggedError<DiscountError>()('DiscountError', {
  message: Schema.String,
}) {}

// Per-Scenario, Feature-wide: cart contents + cross-step scratch state (decision #9 — no bare `let`s)
class World extends Context.Service<World, {
  readonly subtotal: Ref.Ref<number>
  readonly total: Ref.Ref<number>
  readonly rejection: Ref.Ref<Option.Option<DiscountError>>
}>()('World') {
  static readonly layer = Layer.effect(this, Effect.gen(function* () {
    return World.of({
      subtotal: yield* Ref.make(0),
      total: yield* Ref.make(0),
      rejection: yield* Ref.make(Option.none()),
    })
  }))
}

// Rule-scoped extra Layer (decision #10) — only Scenarios inside "Percentage discounts
// expire at midnight" can `yield* DiscountRegistry`; steps outside the Rule wouldn't compile
// if they tried.
class DiscountRegistry extends Context.Service<DiscountRegistry, {
  readonly register: (code: string, percent: number, expiresIn: string) => Effect.Effect<void>
  readonly apply: (code: string, subtotal: number) => Effect.Effect<number, DiscountError>
}>()('DiscountRegistry') {
  static readonly layer = Layer.effect(this, Effect.gen(function* () {
    const codes = yield* Ref.make(new Map<string, { percent: number; expiresAt: number }>())
    return DiscountRegistry.of({
      register: (code, percent, expiresIn) => Effect.gen(function* () {
        const now = yield* Clock.currentTimeMillis
        const expiresAt = now + Duration.toMillis(Duration.decode(expiresIn))
        yield* Ref.update(codes, (m) => new Map(m).set(code, { percent, expiresAt }))
      }),
      apply: (code, subtotal) => Effect.gen(function* () {
        const now = yield* Clock.currentTimeMillis
        const entry = (yield* Ref.get(codes)).get(code)
        if (!entry) return yield* new DiscountError({ message: 'code not found' })
        if (now > entry.expiresAt) return yield* new DiscountError({ message: 'code expired' })
        return subtotal * (1 - entry.percent / 100)
      }),
    })
  }))
}

describeFeature(feature, World.layer, ({ Background, Rule }) => {
  Background(function* (table) {
    const rows = yield* Schema.decodeUnknown(Schema.Array(CartRow))(table.hashes())
    yield* Ref.set((yield* World).subtotal, rows.reduce((sum, r) => sum + r.price, 0))
  })

  Rule('Percentage discounts expire at midnight', DiscountRegistry.layer, ({ ScenarioOutline, Scenario }) => {
    ScenarioOutline('Applying a valid discount code', ({ Given, When, Then }) => {
      Given('a discount code {string} worth {int}% expiring in {string}',
        function* (code: string, percent: number, expiresIn: string) {
          yield* (yield* DiscountRegistry).register(code, percent, expiresIn)
        })

      When('I apply the discount code {string}', function* (code: string) {
        const subtotal = yield* Ref.get((yield* World).subtotal)
        const result = yield* (yield* DiscountRegistry).apply(code, subtotal)
        yield* Ref.set((yield* World).total, result)
      })

      Then('the total is {float}', function* (expected: number) {
        expect(yield* Ref.get((yield* World).total)).toBeCloseTo(expected)
      })
    })

    Scenario('Expired discount codes are rejected', () => {
      Given('a discount code {string} worth {int}% expiring in {string}',
        function* (code: string, percent: number, expiresIn: string) {
          yield* (yield* DiscountRegistry).register(code, percent, expiresIn)
        })

      When('{int} hours pass', function* (hours: number) {
        yield* TestClock.adjust(`${hours} hours`)
      })

      When('I apply the discount code {string}', function* (code: string) {
        const subtotal = yield* Ref.get((yield* World).subtotal)
        const outcome = yield* Effect.either((yield* DiscountRegistry).apply(code, subtotal))
        if (outcome._tag === 'Left') yield* Ref.set((yield* World).rejection, Option.some(outcome.left))
      })

      Then('the discount is rejected with {string}', function* (message: string) {
        const rejection = yield* Ref.get((yield* World).rejection)
        expect(Option.isSome(rejection) && rejection.value.message).toBe(message)
      })
    })
  })
})
```

What this exercises:

- **`TestClock` composes transparently.** `DiscountRegistry.apply` reads `Clock.currentTimeMillis` with no awareness it's under test — `it.effect` swaps in `TestClock` automatically (decision #4), and `When('{int} hours pass', ...)` advances it deterministically with `TestClock.adjust`. No real `setTimeout`/sleeping, no flakiness.
- **The Rule-scoped Layer is a real type boundary.** `DiscountRegistry` is only in scope for steps defined inside this `Rule`'s callback — a `Given`/`When`/`Then` written at the Feature's top level (outside any `Rule`) that tried `yield* DiscountRegistry` wouldn't typecheck, because the Feature's own Layer is just `World.layer`.
- **Everything crossing steps goes through `World`'s Refs** (`subtotal`, `total`, `rejection`) — including the two Scenarios inside the same Rule, which each get a *fresh* `World` (per-Scenario default), so there's no leakage between "Applying a valid discount code" and "Expired discount codes are rejected" the way there was between the two Scenarios sharing `Database` in the accounts example.

## Module boundaries

Monorepo under the `@effect-cucumber` npm scope — each module is its own published package, not a subpath export of one package:

- **`@effect-cucumber/gherkin`** — `.feature` parsing + step-text matching (thin wrapper over `@cucumber/gherkin` / `@cucumber/cucumber-expressions`). No Effect-specific logic; a dependency of `vitest`, but installable and testable standalone.
- **`@effect-cucumber/vitest`** — `describeFeature`, the Given/When/Then/Background/Scenario/ScenarioOutline/Rule DSL, hooks, the `it.effect`-based runner. Depends on `@effect-cucumber/gherkin` and re-exports `loadFeature` from it, so this is the one package most consumers install directly.

## Decisions log

1. **Parser dependency** — depend directly on `@cucumber/gherkin` + `@cucumber/cucumber-expressions`, not on `@amiceli/vitest-cucumber`'s internals. Official, stable, public API.
2. **Effect version** — target the **v4 beta** (`Context.Service`, `effect/testing`). All examples above use v4 shapes. Since v4 is beta, pin an exact version and expect breakage on beta bumps until it stabilizes.
3. **Package namespace** — `@effect-cucumber` scope, monorepo with one package per module (`@effect-cucumber/gherkin`, `@effect-cucumber/vitest`, ...) rather than a single unscoped package with subpath exports.

## Open items (not yet designed)

Resolved since the last pass: ScenarioOutline/Examples typing (built-in cucumber-expression coercion already handles it — see the discounts worked example), Rule Layer scoping and Scenario-level Layer composition (decision #10), and tag → skip/only mapping (Test runner integration section). Remaining gaps:

- **An Examples column not referenced by any step's pattern** — the rare case where a Scenario Outline needs a raw example value that never appears inside a `Given`/`When`/`Then` string (so cucumber-expressions never gets a chance to coerce it). Needs a fallback — likely an optional typed `example` argument decoded via `Schema`, passed alongside the DSL object to `ScenarioOutline`'s callback.
- **Custom, non-reserved tags** — `@skip`/`@only` are covered; arbitrary user tags (e.g. `@slow`, `@wip`) and how `excludeTags` filtering surfaces in the public API (a `describeFeature` option? a separate `defineTagFilter`?) isn't designed yet.
- **Retries / `it.flakyTest` at the Scenario level** — whether/how a Scenario opts into `it.effect`'s retry behavior, and how that interacts with decision #9 (a retried Scenario re-invokes the same step closures against a *freshly built* per-Scenario Layer each attempt, or the same one across attempts? — needs to match `it.effect`'s own retry semantics once confirmed).

## Suggested next steps

1. Scaffold as a workspace monorepo — root `package.json` + workspace config, `packages/gherkin` and `packages/vitest`, each with its own `package.json` (`name: @effect-cucumber/gherkin` / `@effect-cucumber/vitest`) and shared root `tsconfig.json`. (Package manager/workspace tool — pnpm workspaces is the common default in the Effect ecosystem — worth confirming before scaffolding.)
2. Implement `packages/gherkin` first (parsing + step matching) in isolation and publish it against real `.feature` fixtures — no Effect-specific logic, easiest to get right and test on its own.
3. Implement `packages/vitest` (`describeFeature`, DSL, `it.effect`-based runner) depending on `@effect-cucumber/gherkin`, proving out Background + Scenario + one Given/When/Then against a single hand-written `.feature` file before touching Outline/Rule/tags.
4. Resolve the "Open items" above as each corresponding feature is built, not all up front.
