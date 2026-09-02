/**
 * Tests for `worked-example-02-accounts`.
 *
 * Carries: ADR-EC-006, ADR-EC-009, ADR-EC-017, ADR-EC-018, ADR-EC-024, BEH-EC-007, BEH-EC-008, BEH-EC-012, INV-EC-006, REQ-EC-019, REQ-EC-021.
 */
import { assert } from "@effect/vitest"
import * as Clock from "effect/Clock"
import * as Context from "effect/Context"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as Option from "effect/Option"
import * as Ref from "effect/Ref"
import * as Schema from "effect/Schema"
import * as TestClock from "effect/testing/TestClock"
import { fileURLToPath } from "node:url"
import { describeFeature } from "../../src/describeFeature.ts"
import { loadFeature } from "../../src/loadFeature.ts"

// The `.feature` file beside this one, resolved relative to this module rather than to `process.cwd()`, so the pair
// keeps working whichever directory the runner was invoked from.
const featurePath = fileURLToPath(new URL("./worked-example-02-accounts.feature", import.meta.url))

// Real bytes off disk, through the real parser, at module top level.
const feature = await loadFeature(featurePath)

// The worked example's own tagged error, field for field.
class DatabaseError extends Schema.TaggedError<DatabaseError>()("DatabaseError", {
  message: Schema.String
}) {}

// How many times `Database.layer` has been BUILT, for the whole module.
const databaseBuilds = Ref.makeUnsafe(0)

// Shared per-Feature: one in-memory "database" for every Scenario in this file, from the worked example's own
// declaration, plus the `buildOrdinal` field deviation 3 above accounts for.
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
      // Captured HERE, at BUILD time, and frozen into the returned service.
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

// Per-Scenario: fresh every Scenario, from the worked example's own declaration.
class World extends Context.Service<World, {
  readonly lastError: Ref.Ref<Option.Option<DatabaseError>>
  readonly observedOrdinal: Ref.Ref<number>
  readonly observedMillis: Ref.Ref<number>
}>()("World") {
  static readonly layer = Layer.effect(
    this,
    Effect.gen(function*() {
      return World.of({
        lastError: yield* Ref.make<Option.Option<DatabaseError>>(Option.none()),
        observedOrdinal: yield* Ref.make(-1),
        observedMillis: yield* Ref.make(-1)
      })
    })
  )
}

// THE CALL UNDER TEST, and the only one in this repository's acceptance suite that passes the `{ shared, perScenario
// }` OBJECT form.
describeFeature(
  feature,
  { shared: Database.layer, perScenario: World.layer },
  (dsl) => {
    // Destructured for the two CONTAINERS only.
    const { Background, Scenario } = dsl

    Background(({ And, Given }) => {
      Given("the database is empty", function*() {
        // Why `clear` exists on the service at all — see this module's header.
        yield* (yield* Database).clear
      })

      And("the shared database was built once", function*() {
        assert.strictEqual((yield* Database).buildOrdinal, 1)
      })
    })

    Scenario("Creating a user", ({ Then, When }) => {
      When("I create a user named {string}", function*(name: string) {
        yield* (yield* Database).create(name)
      })

      Then("the database has {int} user", function*(expected: number) {
        // The count is read back out of the shared service the `When` wrote to, and compared against the number the
        // `.feature` file's own `Then` line carries.
        assert.strictEqual(yield* (yield* Database).count, expected)
      })
    })

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

    // No `.skip` here in code — the `@skip` tag in the `.feature` file is what routes this Scenario to
    // `it.effect.skip` (BEH-EC-008).
    Scenario("Deleting a missing user", ({ Then, When }) => {
      When("I delete a user named {string}", function*(name: string) {
        const { lastError } = yield* World
        yield* (yield* Database).delete(name).pipe(
          Effect.catchTag("DatabaseError", (error) => Ref.set(lastError, Option.some(error)))
        )
      })

      Then("the operation fails with {string}", function*(expected: string) {
        const error = yield* Ref.get((yield* World).lastError)
        // TWO assertions, not one `&&` chain, and the split is what makes the failures distinguishable.
        assert.isTrue(Option.isSome(error), "no DatabaseError was captured — the delete did not fail")
        assert.strictEqual(Option.getOrThrow(error).message, expected)
      })
    })

    // `Renaming a user` is `@wip`, and the fourth argument below excludes it — so it is never registered at all and
    // no step definition for it is needed here.

    Scenario("An hour passes for one account check", ({ When }) => {
      When("the account check waits an hour", function*() {
        const { observedMillis } = yield* World
        // The anchor for "one hour PAST 0".
        assert.strictEqual(yield* Clock.currentTimeMillis, 0)

        // THE one clock mutation in this file.
        yield* TestClock.adjust("1 hour")

        // BEH-EC-012's other half, and the reason this is not merely an isolation test: a step MUST be able to
        // advance the simulated clock deterministically.
        yield* Ref.set(observedMillis, yield* Clock.currentTimeMillis)
      })
    })

    Scenario("The next account check starts at zero", ({ When }) => {
      When("the next account check reads the clock", function*() {
        const { observedMillis } = yield* World
        yield* Ref.set(observedMillis, yield* Clock.currentTimeMillis)
      })
    })

    // ONE definition matched by BOTH clock Scenarios, so the two bodies cannot drift apart into asserting two
    // different things about one claim.
    dsl.Then("the account check clock reads {int}", function*(expected: number) {
      const { observedMillis } = yield* World
      assert.strictEqual(yield* Ref.get(observedMillis), expected)
    })

    // The UNCONDITIONAL half of the `clear` proof, and the reason it exists is stated in full on the Scenario below
    // it: that one's reading depends on which sibling ran, and this one's does not.
    Scenario("Clearing the database removes rows written in this same scenario", ({ Then, When }) => {
      When("this scenario writes {string} and then clears the database", function*(name: string) {
        const database = yield* Database
        yield* database.create(name)
        // The intermediate read is part of the assertion, not a debug aid: without it a `create` that silently wrote
        // nothing would make the zero below true for the wrong reason.
        assert.strictEqual(yield* database.count, 1)
        yield* database.clear
      })

      Then("the database holds {int} accounts", function*(expected: number) {
        assert.strictEqual(yield* (yield* Database).count, expected)
      })
    })

    Scenario("Every tag on this Scenario reaches the runner", ({ Then, When }) => {
      When("this scenario adds a second account named {string}", function*(name: string) {
        yield* (yield* Database).create(name)
      })

      Then("the account total across both scenarios is {int}", function*(expected: number) {
        assert.strictEqual(yield* (yield* Database).count, expected)
      })
    })
  },
  { excludeTags: ["@wip"] }
)
