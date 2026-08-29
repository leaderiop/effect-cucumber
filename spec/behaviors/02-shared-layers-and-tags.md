# 02 — Background, hooks, shared Layers, and tags

_Pre-implementation: `@effect-cucumber/vitest` doesn't exist yet (see
`spec/roadmap.md`). Code fences below describe the intended API — reference
material, not a compiled example._

---

## BEH-EC-005: Background is inlined, not a hook, and is a step-definition container

> **Invariant:** [INV-EC-001](../invariants.md#inv-ec-001-fail-fast-is-structural-not-bookkept)
> **See:** [ADR-EC-004](../decisions/004-one-it-effect-per-scenario.md), [ADR-EC-017](../decisions/017-background-and-scenario-are-step-definition-containers.md)

```
REQUIREMENT: Background steps MUST run as the first yield*s of every
             Scenario's Effect, in declaration order, ahead of that
             Scenario's own steps. They MUST NOT be implemented as a vitest
             beforeEach — a Background failure MUST short-circuit the
             Scenario's own steps via the same Effect error channel a
             regular step failure uses.

REQUIREMENT: Background's DSL callback MUST receive Given/And as a dsl
             parameter (matching real Gherkin grammar, which permits only
             Given/And inside a Background block). A Background step's
             literal Gherkin text MUST be matched against a registered
             Given/And pattern exactly like any other step — it MUST NOT be
             possible to write a Background whose body runs regardless of
             what its Gherkin text says.
```

## BEH-EC-006: Hooks are Effects, and `After` always runs

> **Invariant:** [INV-EC-004](../invariants.md#inv-ec-004-after-hooks-run-even-when-a-step-fails)
> **See:** [ADR-EC-005](../decisions/005-effect-fn-for-step-and-hook-bodies.md)

```ts
export const Before: (fn: () => Generator<any, void, any> | Effect.Effect<void, any, any>) => void
export const After: (fn: () => Generator<any, void, any> | Effect.Effect<void, any, any>) => void
export const BeforeStep: (fn: (stepText: string) => Generator<any, void, any>) => void
export const AfterStep: (fn: (stepText: string) => Generator<any, void, any>) => void
```

```
REQUIREMENT: The After hook, if declared, MUST execute whether every step in
             its Scenario succeeded or one of them failed. The runner MUST
             achieve this via Effect.ensuring around the Scenario's Effect —
             the After hook body itself carries no special exemption from
             fail-fast.
```

> **Correction (2026-08-29, Phase 7 implementation, verified against the installed
> `effect@4.0.0-rc.112` build and `packages/vitest/src/{Dsl,ScenarioEffect}.ts`):** two independent
> corrections, filed together because both were surfaced by the same implementation pass.
>
> **(i) The four published free-standing signatures are not the export shape.** `Before`, `After`,
> `BeforeStep` and `AfterStep` above are written as module-level `export const` functions. DSL-04
> forbids exactly that — a module-level registry — for the identical reason BEH-EC-003's
> free-standing `Given` signature was corrected in Phase 5 (see `spec/behaviors/01-steps-and-world.md`):
> a hook is a `readonly` member of the `FeatureDsl<ROut>` object `describeFeature` hands its `define`
> callback, typed `HookRegistrar<ROut>` (`packages/vitest/src/Dsl.ts`), reached as
> `({ After, Before, ... }) => { ... }` inside that callback — never imported and called as a
> top-level function. `packages/vitest/src/index.ts` exports `HookRegistrar` as a type for exactly
> this reason, and exports no `Before`/`After`/etc. value.
>
> The published `BeforeStep`/`AfterStep` parameter `(stepText: string)` is also wrong. Every hook
> body — `Before`, `After`, `BeforeStep` and `AfterStep` alike — receives NO arguments;
> `BeforeStep`/`AfterStep` are not handed the step they bracket (ADR-EC-005's Negative consequence,
> `HookRegistrar<ROut>`'s zero-parameter call signature). A hook wanting the current step's text
> annotates its own span manually (`Effect.annotateCurrentSpan`), per ADR-EC-005.
>
> **(ii) The `Effect.ensuring` REQUIREMENT above names the GUARANTEE, not the combinator that
> delivers it.** In the installed `effect@4.0.0-rc.112` build, `Effect.ensuring`'s finalizer is typed
> `Effect<X, never, R1>` — its error channel is `never`, so a hook body that can itself fail is not
> even assignable to it, and forcing it through by widening the type merges no causes: a failing
> `After` hook would silently REPLACE the step's own failure rather than combining with it, which is
> exactly the masking the do-not-mask requirement (see [BEH-EC-017](./07-hook-ordering-and-guarantees.md))
> forbids. `Effect.onExit` is the combinator the runner actually uses, because its documented
> behavior — the finalizer runs on success, on failure and on interruption, and BOTH causes are
> merged when the wrapped Effect and the finalizer both fail — is what INV-EC-004 plus the
> do-not-mask requirement together need. See
> [BEH-EC-017](./07-hook-ordering-and-guarantees.md) for the full six-hook ordering this guarantee is
> one piece of, and `packages/vitest/src/ScenarioEffect.ts` for where `Effect.onExit` is actually
> composed.

## BEH-EC-007: A shared Layer is opt-in and built once

> **See:** [ADR-EC-006](../decisions/006-two-layer-scopes-only.md)

```
REQUIREMENT: When describeFeature's second argument has a `shared` field, that
             Layer MUST be built exactly once for the whole Feature (via
             @effect/vitest's layer(...) helper) and its resources MUST be
             released once, after every Scenario in the Feature has run — not
             once per Scenario.
```

## BEH-EC-008: Tags map to vitest's native tag system; `@skip` also routes to `it.effect.skip`

> **See:** [ADR-EC-020](../decisions/020-vitest-native-tags-for-skip-only.md)

```
REQUIREMENT: Every tag on a Scenario (including inherited Feature/Rule/
             Examples tags) MUST be emitted as a native vitest tag on the
             generated it.effect call. A Scenario tagged @skip MUST
             additionally compile to it.effect.skip instead of it.effect.
             A Scenario tagged @only MUST NOT compile to it.effect.only
             (vitest fails CI on any committed .only) — @only is emitted as
             a plain tag only; running just that Scenario is a caller-side
             `vitest --tagsFilter '@only'` choice, not something the library
             forces onto every run. excludeTags-style filtering MUST be
             implemented as native vitest tag filtering (--tagsFilter), not
             a describeFeature-time registration filter.
```

### Worked example

```typescript
// Pre-implementation reference — not yet compiled against a real API.
import { describeFeature, loadFeature } from "@effect-cucumber/vitest"
import { Context, Effect, Layer, Option, Ref, Schema } from "effect"

// @effect-cucumber/vitest's loadFeature (ADR-EC-024) returns a Promise, already wired to a
// shared NodeFileSystem.layer and defaulting ParameterTypeStore — distinct from
// @effect-cucumber/gherkin's own Effect-returning loadFeature (see BEH-EC-001).
const feature = await loadFeature("./accounts.feature")
// accounts.feature:
//   Background:
//     Given the database is empty
//   Scenario: Creating a user
//     When I create a user named "Ada"
//     Then the database has 1 user
//   @skip
//   Scenario: Deleting a missing user
//     When I delete a user named "Ghost"
//     Then the operation fails with "not found"

class DatabaseError extends Schema.TaggedError<DatabaseError>()("DatabaseError", {
  message: Schema.String
}) {}

// Shared per-Feature: one in-memory "database" for every Scenario in this file
class Database extends Context.Service<Database, {
  readonly create: (name: string) => Effect.Effect<void>
  readonly delete: (name: string) => Effect.Effect<void, DatabaseError>
  readonly count: Effect.Effect<number>
  readonly clear: Effect.Effect<void>
}>()("Database") {
  static readonly layer = Layer.effect(
    this,
    Effect.gen(function*() {
      const users = yield* Ref.make<ReadonlySet<string>>(new Set())
      return Database.of({
        create: (name) => Ref.update(users, (s) => new Set([...s, name])),
        delete: (name) =>
          Effect.gen(function*() {
            const current = yield* Ref.get(users)
            if (!current.has(name)) return yield* new DatabaseError({ message: "not found" })
            yield* Ref.update(users, (s) => {
              const next = new Set(s)
              next.delete(name)
              return next
            })
          }),
        count: Effect.map(Ref.get(users), (s) => s.size),
        clear: Ref.set(users, new Set())
      })
    })
  )
}

// Per-Scenario: fresh every Scenario, holds the last caught error for "Then it fails" steps
class World extends Context.Service<World, {
  readonly lastError: Ref.Ref<Option.Option<DatabaseError>>
}>()("World") {
  static readonly layer = Layer.effect(
    this,
    Effect.gen(function*() {
      return World.of({ lastError: yield* Ref.make(Option.none()) })
    })
  )
}

describeFeature(
  feature,
  { shared: Database.layer, perScenario: World.layer },
  ({ Background, Scenario }) => {
    // Background is a step-definition container (ADR-EC-017), restricted to
    // Given/And like real Gherkin grammar — the registered pattern is
    // matched against the literal "Given the database is empty" text from
    // accounts.feature, exactly like any other step.
    Background(({ Given }) => {
      Given("the database is empty", function*() {
        yield* (yield* Database).clear
      })
    })

    Scenario("Creating a user", ({ When, Then }) => {
      When("I create a user named {string}", function*(name: string) {
        yield* (yield* Database).create(name)
      })

      Then("the database has {int} user", function*(expected: number) {
        expect(yield* (yield* Database).count).toBe(expected)
      })
    })

    // No `.skip` here in code — the @skip tag in accounts.feature is what
    // routes this Scenario to `it.effect.skip`.
    Scenario("Deleting a missing user", ({ When, Then }) => {
      When("I delete a user named {string}", function*(name: string) {
        const world = yield* World
        yield* (yield* Database).delete(name).pipe(
          Effect.catchTag("DatabaseError", (e) => Ref.set(world.lastError, Option.some(e)))
        )
      })

      Then("the operation fails with {string}", function*(message: string) {
        const error = yield* Ref.get((yield* World).lastError)
        expect(Option.isSome(error) && error.value.message).toBe(message)
      })
    })
  }
)
```

`Database.clear` in Background running per-Scenario against a _shared_ Layer
is exactly why `clear` exists on `Database` at all — without it, "Creating a
user" would leak into "Deleting a missing user"'s count.

---

_Next: [03 — Rules, Scenario Outlines, and TestClock](./03-rules-outlines-and-testclock.md)_
