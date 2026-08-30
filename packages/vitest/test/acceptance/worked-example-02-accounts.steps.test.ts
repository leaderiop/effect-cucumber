/**
 * The second acceptance pair, and the ONLY one that exercises the `{ shared, perScenario }` object
 * form — the one code path STATE.md records as behaving differently from every other.
 *
 * ## What this dogfoods
 *
 * `spec/behaviors/02-shared-layers-and-tags.md`'s "Worked example" (lines 235-399), promoted from a
 * comment block into a real `.feature` file beside this one: a shared `Database` Layer, a
 * per-Scenario `World`, a `Background` that is a step-definition container rather than a hook, a
 * `@skip` Scenario that is REPORTED skipped, and a `@wip` Scenario that is ABSENT from the report
 * because `excludeTags` removed it at registration time.
 *
 * The three tag mechanisms in that example are deliberately different things, and this file is where
 * the difference stops being prose. `@skip` still emits a test and reports it skipped, so a reader
 * sees it. `excludeTags` removes `Renaming a user` from registration, so it appears nowhere at all —
 * which is why this file registers NO step definitions for it. `--tagsFilter`, unused here, would
 * narrow whatever survived registration without removing anything from the report;
 * `scripts/verify-tags-filter.sh` is where that third mechanism is carried.
 *
 * ## The directory's two standing deviations from the worked examples apply here unchanged
 *
 * Both are stated in full in `packages/vitest/test/acceptance/README.md` and restated per file so a
 * reader comparing this to `spec/behaviors/02` does not read the difference as drift.
 *
 * 1. **`loadFeature` comes from `@effect-cucumber/gherkin`, not from `@effect-cucumber/vitest`.**
 *    ADR-EC-024's `ManagedRuntime`-backed wrapper is not exported, and Phase 11 adds no public API,
 *    so this file reaches the gherkin package's Effect-returning `loadFeature` and provides
 *    `NodeFileSystem.layer` plus `ParameterTypeStore` itself.
 * 2. **`describeFeature` is imported by relative path from `../../src/describeFeature.ts`.** This
 *    suite lives inside the package it consumes, and oxlint's `effect/no-import-from-barrel-package`
 *    runs with `checkRelativeIndexImports: true`. The module object reached is the one the barrel
 *    re-exports.
 *
 * A third deviation is specific to THIS pair, and it is an ADDITION rather than a translation:
 *
 * 3. **The `Background` has a SECOND step the worked example does not have, and `Database` has a
 *    `buildOrdinal` field the worked example does not have.** `And the shared database was built
 *    once` reads that ordinal and asserts it is 1, from inside a body that runs as the first
 *    `yield*`s of EVERY Scenario's own Effect. The worked example is illustrative prose and makes no
 *    attempt to make BEH-EC-007's build-once claim observable; an acceptance pair has to. Putting the
 *    assertion in the Background rather than in one Scenario is what turns "the shared tier is built
 *    once" from a claim one Scenario makes into a claim every Scenario in the file re-makes — so a
 *    shared tier rebuilt per Scenario turns every Scenario after the first one red, not just a
 *    designated witness. It is also a second, free proof of DSL-04: `BackgroundDsl` really does hand
 *    out `And` as well as `Given` (ADR-EC-017), and nothing else in this repo's acceptance suite
 *    exercises that half.
 *
 * ## Why `Database.clear` exists, and where its own proof lives
 *
 * `spec/behaviors/02`'s closing paragraph: `Database.clear` in a Background running per-Scenario
 * against a SHARED Layer is exactly why `clear` is on the service at all — without it, one Scenario's
 * users leak into the next Scenario's count. `Creating a user` cannot prove that on its own, because
 * it is the FIRST Scenario and there is nothing before it to leak. The Scenario that proves it is
 * `Every tag on this Scenario reaches the runner`, declared last: it creates a second user and
 * asserts the count is 1, which reads 2 the moment the Background's `clear` stops running. That is
 * threat T-11-02-01's mitigation, and it is deliberately carried by a Scenario OTHER than the one
 * that looks like it should carry it.
 *
 * ## Cross-step state goes through a `Ref`, and the one module-scope holder is not an exception
 *
 * Every value one step writes for a later step in the same Scenario lives in a `Ref` obtained from
 * `World` or from the shared `Database` (RUN-06, INV-EC-006, ADR-EC-009, PROH-11-03). There is no
 * `let`, no `var`, and no module-scope mutable array or counter standing in for Scenario state.
 * `databaseBuilds` below is a module-scope `Ref` and is NOT that thing: it counts Layer BUILDS, is
 * written only inside `Database.layer`'s build body, and is never read by a step — a step reads the
 * immutable `buildOrdinal` field the build captured out of it. Its own comment says so at the
 * declaration.
 *
 * ## Imports
 *
 * `assert` from `@effect/vitest` inside step bodies, never `expect`: oxlint's
 * `vitest/no-standalone-expect` does not recognise an Effect-bodied test as a test block. The worked
 * example's `expect(...)` calls and its barrel `import { Context, Effect, ... } from "effect"` are
 * both translated — submodule namespace imports per AGENTS.md section 3.
 */
import { loadFeature, ParameterTypeStore } from "@effect-cucumber/gherkin"
import * as NodeFileSystem from "@effect/platform-node/NodeFileSystem"
import { assert } from "@effect/vitest"
import * as Context from "effect/Context"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as Option from "effect/Option"
import * as Ref from "effect/Ref"
import * as Schema from "effect/Schema"
import { fileURLToPath } from "node:url"
import { describeFeature } from "../../src/describeFeature.ts"

/**
 * The `.feature` file beside this one, resolved relative to this module rather than to
 * `process.cwd()`, so the pair keeps working whichever directory the runner was invoked from.
 */
const featurePath = fileURLToPath(new URL("./worked-example-02-accounts.feature", import.meta.url))

/**
 * Real bytes off disk, through the real parser, at module top level.
 *
 * A genuine top-level `await` and never `Effect.runSync`: `NodeFileSystem.readFileString` suspends
 * internally, so `runSync` over a path-based `loadFeature` throws `AsyncFiberError`.
 */
const feature = await Effect.runPromise(
  loadFeature(featurePath).pipe(Effect.provide(Layer.mergeAll(NodeFileSystem.layer, ParameterTypeStore.Default)))
)

/** The worked example's own tagged error, field for field. */
class DatabaseError extends Schema.TaggedError<DatabaseError>()("DatabaseError", {
  message: Schema.String
}) {}

/**
 * How many times `Database.layer` has been BUILT, for the whole module.
 *
 * This is Layer-construction bookkeeping and NOT cross-step Scenario state, so PROH-11-03 does not
 * reach it — and the distinction is structural rather than a promise. It is written in exactly one
 * place, `Database.layer`'s build body, and read in exactly that same place; no step body mentions
 * it. What a step reads is `buildOrdinal`, an immutable `number` the build captured out of this
 * counter at the instant it ran, so the value a step sees NAMES the build it reached rather than
 * reporting however many builds have happened by the time the step runs.
 *
 * A `const` holding a `Ref` rather than a bare `let`, deliberately: `scripts/verify-acceptance-ref-state.sh`
 * (plan 11-05) counts `let` and `var` in this directory after stripping comments, and a gate that
 * this file could only satisfy by exempting itself would be a gate with a hole in it.
 */
const databaseBuilds = Ref.makeUnsafe(0)

/**
 * Shared per-Feature: one in-memory "database" for every Scenario in this file, from the worked
 * example's own declaration, plus the `buildOrdinal` field deviation 3 above accounts for.
 *
 * `Layer.effect` and not `Layer.succeed`, and the error channel is `never` rather than merely
 * happening to be: `describeFeature`'s object overload constrains `shared` to
 * `Layer<R, never, never>` (note (f) of `describeFeature.ts`, plan 10-01), so a failable Layer in
 * this position does not compile at all. `packages/vitest/test/SharedLayerConstraint.types.ts` is
 * where that claim is carried; this block must not be the thing that discovers it.
 */
class Database extends Context.Service<Database, {
  readonly create: (name: string) => Effect.Effect<void>
  readonly delete: (name: string) => Effect.Effect<void, DatabaseError>
  readonly count: Effect.Effect<number>
  readonly clear: Effect.Effect<void>
  readonly buildOrdinal: number
}>()("Database") {
  static readonly layer = Layer.effect(
    this,
    Effect.gen(function*() {
      // Captured HERE, at BUILD time, and frozen into the returned service. Reading the counter from
      // inside a step instead would report the total build count at step time, which is a different
      // claim and a weaker one: it cannot tell "one build, reached by everybody" from "one build so
      // far, and this Scenario reached some other one".
      const buildOrdinal = yield* Ref.updateAndGet(databaseBuilds, (builds) => builds + 1)
      const users = yield* Ref.make<ReadonlySet<string>>(new Set<string>())
      return Database.of({
        buildOrdinal,
        create: (name) => Ref.update(users, (held) => new Set([...held, name])),
        delete: (name) =>
          Effect.gen(function*() {
            const current = yield* Ref.get(users)
            if (!current.has(name)) {
              return yield* Effect.fail(new DatabaseError({ message: "not found" }))
            }
            yield* Ref.update(users, (held) => {
              const next = new Set(held)
              next.delete(name)
              return next
            })
          }),
        count: Ref.get(users).pipe(Effect.map((held) => held.size)),
        clear: Ref.set(users, new Set<string>())
      })
    })
  )
}

/**
 * Per-Scenario: fresh every Scenario, from the worked example's own declaration.
 *
 * `lastError` is that declaration verbatim. `observedOrdinal` is this pair's own addition and exists
 * for the same reason every field in the apples pair's `World` does — the `@REQ-EC-019` Scenario's
 * `When` writes what it observed and its `Then` reads it back, so the value crosses a step boundary
 * and therefore has to cross it through a `Ref` (RUN-06).
 */
class World extends Context.Service<World, {
  readonly lastError: Ref.Ref<Option.Option<DatabaseError>>
  readonly observedOrdinal: Ref.Ref<number>
}>()("World") {
  static readonly layer = Layer.effect(
    this,
    Effect.gen(function*() {
      return World.of({
        lastError: yield* Ref.make<Option.Option<DatabaseError>>(Option.none()),
        observedOrdinal: yield* Ref.make(0)
      })
    })
  )
}

// THE CALL UNDER TEST, and the only one in this repository's acceptance suite that passes the
// `{ shared, perScenario }` OBJECT form. Module scope, nothing wrapping it, nothing intercepting it.
// The fourth argument is the registration-time filter; everything below is asserted by vitest
// RUNNING what this registered, and by `Renaming a user` never appearing at all.
describeFeature(
  feature,
  { shared: Database.layer, perScenario: World.layer },
  ({ Background, Scenario }) => {
    // DSL-04 / ADR-EC-017. A Background is a step-definition CONTAINER and not a hook: the patterns
    // registered here are matched against the literal Gherkin text in the `.feature` file exactly
    // like any other step, and both bodies run as the first `yield*`s of every Scenario's own Effect
    // rather than in a `beforeEach`. `Given` and `And` only — the omission of `When`/`Then` is the
    // contract, matching real Gherkin grammar.
    Background(({ And, Given }) => {
      Given("the database is empty", function*() {
        // Why `clear` exists on the service at all — see this module's header. Against a SHARED
        // Layer the users written by one Scenario are still there for the next one.
        yield* (yield* Database).clear
      })

      And("the shared database was built once", function*() {
        // BEH-EC-007 / RUN-03, re-asserted by every Scenario in this Feature because this body runs
        // inside every Scenario's own Effect. A shared tier rebuilt per Scenario reads 2, then 3,
        // then 4 here. The value is read off the RESOLVED service, so a Layer built once and handed
        // to nobody could not produce it.
        assert.strictEqual((yield* Database).buildOrdinal, 1)
      })
    })

    Scenario("Creating a user", ({ Then, When }) => {
      When("I create a user named {string}", function*(name: string) {
        yield* (yield* Database).create(name)
      })

      Then("the database has {int} user", function*(expected: number) {
        // The count is read back out of the shared service the `When` wrote to, and compared against
        // the number the `.feature` file's own `Then` line carries. Both values travelled out of the
        // Gherkin text through the parser and the cucumber-expression matcher.
        assert.strictEqual(yield* (yield* Database).count, expected)
      })
    })

    // RUN-03's headline claim, carried by a Scenario of its own rather than only by the Background:
    // the tag has to sit on exactly one Scenario (D-01), and that Scenario's own body has to make the
    // claim the tag names, or the row in section 5 is pointing at somebody else's assertion.
    Scenario("The shared database is built once", ({ Then, When }) => {
      When("the account scenario reads the shared build ordinal", function*() {
        const { observedOrdinal } = yield* World
        yield* Ref.set(observedOrdinal, (yield* Database).buildOrdinal)
      })

      Then("the observed shared build ordinal is {int}", function*(expected: number) {
        const { observedOrdinal } = yield* World
        assert.strictEqual(yield* Ref.get(observedOrdinal), expected)
      })
    })

    // No `.skip` here in code — the `@skip` tag in the `.feature` file is what routes this Scenario
    // to `it.effect.skip` (BEH-EC-008). The definitions below are still REGISTERED, because the
    // Scenario is still emitted and still has to plan; neither body runs, and no hook runs for it.
    Scenario("Deleting a missing user", ({ Then, When }) => {
      When("I delete a user named {string}", function*(name: string) {
        const { lastError } = yield* World
        yield* (yield* Database).delete(name).pipe(
          Effect.catchTag("DatabaseError", (error) => Ref.set(lastError, Option.some(error)))
        )
      })

      Then("the operation fails with {string}", function*(expected: string) {
        const error = yield* Ref.get((yield* World).lastError)
        assert.strictEqual(Option.isSome(error) && error.value.message, expected)
      })
    })

    // `Renaming a user` is `@wip`, and the fourth argument below excludes it — so it is never
    // registered at all and no step definition for it is needed here. That absence is the assertion:
    // an `excludeTags` that filtered at RUN time instead would leave two unmatched steps and a red
    // Feature. Unlike `--tagsFilter '!@wip'`, which would report the Scenario as skipped.
  },
  { excludeTags: ["@wip"] }
)
