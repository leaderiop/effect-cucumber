# 02 — Background, hooks, shared Layers, and tags

See [`spec/roadmap.md`](../roadmap.md) for what is built versus what is only
specified — this document describes the contract, not the build status. The
header note that used to sit here said `@effect-cucumber/vitest` did not exist
yet; it does, and the `typescript` fences below are written against its real
API per AGENTS.md §2.

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

> **Correction (2026-08-30, Phase 10 implementation, measured against the installed
> `@effect/vitest@4.0.0-rc.112` rather than reasoned about):** the BUILD half of the
> requirement above shipped as written and is asserted on every push. The RELEASE half
> ships in a **weaker form than the wording claims**, and the divergence is recorded here
> rather than by narrowing the requirement to fit what was built.
>
> **What holds.** `packages/vitest/src/describeFeature.ts` calls the framework's
> `layer(sharedTier, { excludeTestServices: true })` in its one-argument form, which builds
> the shared Layer exactly once for everything its callback registers. The shared build
> ordinals every Scenario reaches are asserted as `[1, 1, 1]` in
> `packages/vitest/test/emission.test.ts`, and `pnpm verify:shared-layer-once` re-asserts
> the same count from a real CLI run, whole and `-t`-filtered. Release happens exactly
> ONCE, never once per Scenario — measured, not assumed.
>
> **What does not hold: WHEN.** The scope is closed at the teardown of whatever suite was
> current when `layer(...)` was called — not at the moment the Feature's own block
> finishes. The exact branch is `@effect/vitest`'s `dist/internal/internal.js`, the
> one-argument arm of `layer`: it computes `blockTasks` by filtering the current suite's
> task list for entries its callback added, and takes the `blockTasks.length === 0` early
> return, which registers `V.afterAll(() => closeScope())` on the current suite and nothing
> else. It reaches that branch because this library's emission lands inside a
> `describe(feature.name, …)` factory that **vitest defers** — at the instant `collectTasks`
> runs, the newly created suite carries no tests yet, so the filter yields an empty list.
> The non-empty arm's `beforeEach` + `onTestFinished` countdown, which is what WOULD close
> the scope immediately after the block's last test, is therefore never registered.
>
> **Measured.** Two throwaway probes, both run against the real runner. Probe 1 — a shared
> Layer whose build body registers a finalizer, two Scenarios, and a trailing sibling test
> in the same file — observed `["acquired", "scenario read 1", "scenario read 1"]`: no
> release yet, after every Scenario in the Feature had run. Probe 2 wrapped the same
> `describeFeature` call in an ordinary `describe`, making that wrapper the current suite,
> and a test outside the wrapper observed `["acquired", "scenario read 1", "scenario read 1",
> "released"]`. The release point is the enclosing suite's teardown, and for the ordinary
> case — a `describeFeature` call at module top level — that is the whole FILE's teardown.
>
> **Consequence for a caller**, and the reason this is a correction rather than a footnote:
> a `shared` Layer holding a scarce external resource (a database connection, a
> testcontainer) keeps holding it until the file finishes, not until the Feature does. Two
> Features in one file, each with its own `shared` Layer, hold both resources concurrently
> for the second Feature's whole run. Nothing here is a leak — every scope is closed once —
> but "released after every Scenario in the Feature has run" reads as a tighter promise
> than the runner makes. Tightening it would mean either forbidding the deferred `describe`
> nesting this library depends on for Feature and Rule blocks, or upstreaming a change to
> `@effect/vitest`; neither was in Phase 10's scope, and the requirement is left standing so
> the gap stays visible.

> **Correction (2026-08-30, Phase 10 gap closure, plan 10-07, measured against the installed
> `@effect/vitest@4.0.0-rc.112` rather than reasoned about):** the correction above covers the
> RELEASE half. This one covers the BUILD half, which the requirement's wording does not
> mention a boundary for — and the boundary is a STRENGTHENING of the requirement, not a
> divergence from it, unlike the correction above.
>
> **What the requirement says.** Built exactly once for the whole Feature.
>
> **What that leaves unstated.** How many times a Feature with NO runnable Scenario builds
> it. Read literally, "exactly once" would say once. The answer that matches the rest of the
> system is zero, because
> [ADR-EC-026](../decisions/026-registration-time-tag-filtering-and-declared-tag-universe.md)'s
> registration-time exclusion contract is that "a Scenario the filter excludes never becomes a
> test and is ABSENT from the report" — never present as skipped — and a tier built for a
> Feature nobody asked to run is a cost with no observer.
>
> **What shipped, and when.** It built once even for a Feature with every Scenario excluded,
> until plan 10-07, because the library's own always-passing unused-step-definition nodes
> travelled the same emission route as the Scenarios, and that route builds the memoised
> shared tier before running ANY body — including a body that is just `Effect.void`. The
> `AfterAllScenarios` teardown node was already suppressed in this situation (this behavior's
> own carve-out, [BEH-EC-017](./07-hook-ordering-and-guarantees.md)); the warning node that
> forced the very build teardown would have needed was not.
>
> **What holds now, and where it is asserted.**
> `packages/vitest/test/emission.test.ts`'s "a shared Layer with every Scenario excluded
> stays unbuilt, even with an unused step definition (10-07)" block: a Feature with both
> tiers declared, an `excludeTags` filter removing its one Scenario, and one unused step
> definition, asserts the shared build counter stays at `0` while the unused definition is
> still reported. Proven non-vacuous by mutation (plan 10-07 Task 3): restoring the pre-fix
> routing turns the counter assertion RED, reading `1`; deleting the unused step definition
> instead turns the non-vacuity control RED while the counter assertion stays GREEN at `0` —
> the two mutations separate "the fix works" from "nothing was ever emitted at all".
>
> **Consequence for a caller**, stated the way the correction above states its own: a `shared`
> tier holding a testcontainer or a database connection is no longer started for a Feature the
> caller explicitly filtered out on the strength of one stray unused pattern.

## BEH-EC-008: Tags map to vitest's native tag system; `@skip` also routes to `it.effect.skip`

> **See:** [ADR-EC-020](../decisions/020-vitest-native-tags-for-skip-only.md) (superseded), [ADR-EC-026](../decisions/026-registration-time-tag-filtering-and-declared-tag-universe.md)

```
REQUIREMENT: Every tag on a Scenario (including inherited Feature/Rule/
             Examples tags) MUST be emitted as a native vitest tag on the
             generated it.effect call, keeping the literal @ prefix it
             carries in the .feature file. A Scenario tagged @skip MUST
             additionally compile to it.effect.skip instead of it.effect.
             A Scenario tagged @only MUST NOT compile to it.effect.only
             (vitest fails CI on any committed .only) — @only is emitted as
             a plain tag only; running just that Scenario is a caller-side
             `vitest --tagsFilter '@only'` choice, not something the library
             forces onto every run.
```

```
REQUIREMENT: includeTags and excludeTags, on describeFeature's optional
             fourth argument, MUST act as a registration filter — filtering
             at REGISTRATION time, so a Scenario the filter excludes never
             becomes a test and is ABSENT from the report rather than
             present in it as skipped. Both MUST accept a plain array of tag
             strings, never vitest's boolean tag-expression grammar, and
             undefined and an empty array MUST both mean NO FILTER, so a
             computed-empty array can never silence a suite. Native vitest
             tag filtering (--tagsFilter) MUST continue to work
             independently on whatever was registered, reporting
             non-matching tests as skipped rather than removing them: the
             registration filter and the CLI filter COMPOSE, and neither
             replaces the other.
```

```
REQUIREMENT: Every emitted tag MUST be DECLARED in the runner's config — a
             --tagsFilter pattern is validated against that declaration list
             regardless of the runner's strict-tags setting. A tag that is
             not declared MUST NOT fail the Feature: the library MUST catch
             the runner's rejection, re-emit the test UNTAGGED so the
             Scenario still runs, and print one located warning naming the
             .feature file, the Scenario and every tag that Scenario carried
             — the Scenario's tags then do not exist for the runner, so no
             --tagsFilter can select it. That warning MUST claim only that
             AT LEAST ONE of the listed tags is undeclared, never that all
             of them are: the runner rejects a tag array as a unit and names
             the offenders only in its own message text, which the library
             deliberately does not read. gherkinTags, a config-time helper
             taking a GLOB PATTERN (or an array of patterns) over the
             consumer's own .feature files, is the supported way to generate
             those declarations.
```

### Worked example

First the runner config, because without it none of the tags below can be
selected by `--tagsFilter` — the declaration list is what a filter pattern is
validated against. `gherkinTags` takes a glob over the consumer's own
`.feature` files and returns entries that spread straight into `test.tags`,
beside any hand-written ones:

```typescript
// vitest.config.ts — gherkinTags is real and exported (this phase). The result type is
// the runner's own TestTagDefinition[], proven at compile time by
// packages/vitest/test/GherkinTags.types.ts.
import { gherkinTags } from "@effect-cucumber/vitest"
import { defineConfig } from "vitest/config"

export default defineConfig({
  test: {
    // The glob is resolved against process.cwd(). There is deliberately no default —
    // the helper never scans a tree its caller did not name.
    tags: [...gherkinTags("features/**/*.feature"), { name: "@skip" }, { name: "@only" }]
  }
})
```

Then the Feature itself:

```typescript
// describeFeature, its optional fourth argument, and the dsl below are real and
// compile-gated (this phase). The `loadFeature` import is ADR-EC-024's planned
// ManagedRuntime wrapper, not yet shipped from @effect-cucumber/vitest — see
// packages/vitest/README.md "## Status". This fence is still not compiled either way;
// the doc-examples check is not wired yet (spec/roadmap.md).
import { describeFeature, loadFeature } from "@effect-cucumber/vitest"
import { Context, Effect, Layer, Option, Ref, Schema } from "effect"
import { expect } from "vitest"

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
//   @wip
//   Scenario: Renaming a user
//     When I rename a user
//     Then nothing happens yet

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

    // "Renaming a user" is @wip, and the fourth argument below excludes it — so it is
    // never registered at all and no step definition for it is needed here.
  },
  // The optional fourth argument. A plain array of tag strings, never a boolean
  // expression; `undefined` and `[]` both mean NO FILTER. The @wip Scenario never
  // becomes a test and is absent from the report — unlike `--tagsFilter '!@wip'`,
  // which would report it as skipped.
  { excludeTags: ["@wip"] }
)
```

`Database.clear` in Background running per-Scenario against a _shared_ Layer
is exactly why `clear` exists on `Database` at all — without it, "Creating a
user" would leak into "Deleting a missing user"'s count.

The three tag mechanisms in that example are deliberately different things.
`@skip` still emits a test and reports it as skipped, so a reader sees it in
the output. `excludeTags` removes "Renaming a user" from registration, so it
appears nowhere at all — one summary line naming the count, the Feature and the
option that removed them is printed when the filter removed anything, because a
green run cannot otherwise tell a reader that a whole Feature is hiding behind a
stale filter. And `--tagsFilter`, unused above, would narrow whatever survived
registration without removing anything from the report.

---

_Next: [03 — Rules, Scenario Outlines, and TestClock](./03-rules-outlines-and-testclock.md)_
