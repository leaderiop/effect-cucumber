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
 * ## `TestClock` isolation, and what the declaration ORDER does and does not buy
 *
 * `An hour passes for one account check` advances the simulated clock by an hour;
 * `The next account check starts at zero` is declared IMMEDIATELY AFTER it and asserts the clock it
 * reads is still 0 (RUN-04, BEH-EC-012, ADR-EC-018). The adjacency exists so a reader can see the
 * claim without cross-referencing, and because both Scenarios need to be in the same `shared`-Layer
 * Feature for the claim to be about the shared path at all.
 *
 * The adjacency is NOT the guarantee, and the distinction is ASSUMPTION-11-C. That vitest runs a
 * file's tests in DECLARATION order is observed behaviour of the installed runner, not a documented
 * contract — `--sequence.shuffle` would break the reading of these two Scenarios as "one after the
 * other" while breaking nothing about the isolation itself. Mutation C in the record below is what
 * separates the two: swapping the pair's declaration order leaves both assertions GREEN, because
 * each Scenario gets its own `TestEnv` regardless of who ran before it. So the assumption is about
 * this file's READABILITY, never about the mechanism.
 *
 * ## RUN-05, and the claim this file deliberately does NOT make
 *
 * `Every tag on this Scenario reaches the runner` carries `@REQ-EC-021` and `@slow`, and it runs
 * green. It is tempting to write that its RUNNING proves both tags were accepted by the runner's
 * validator, on the theory that an undeclared tag collapses its whole file to zero tests. **That
 * theory is false, and it was measured false by the pair beside this one** (plan 11-01, mutation A;
 * `packages/vitest/test/acceptance/README.md`'s closing section; `vitest.config.ts` note (e)).
 * `describeFeature.ts`'s D-08 catch-and-degrade intercepts the collection-time throw and re-emits
 * each Scenario UNTAGGED behind one located warning, so with every acceptance tag undeclared
 * `pnpm test` still exits 0 and this file still produces every one of its tests. What actually
 * breaks is the thing the declaration exists for: `--tagsFilter` fails inside the runner's own
 * `createTagsFilter`.
 *
 * So this Scenario's green status is evidence for exactly two things — a Scenario carrying more than
 * one tag is registered and runs, and the tag universe `vitest.config.ts` derives from this
 * directory's `.feature` files really does cover a tag that appears in BOTH halves of that config's
 * de-duplication (`@slow` is hand-written AND found by the glob; nothing before this file exercised
 * that overlap). The half about tags reaching the emitted node is carried by
 * `scripts/verify-tags-filter.sh`, and the absence of an `UndeclaredTagWarning` naming this file on
 * stderr is the in-process corroboration. Mutation D below records what an undeclared tag does to
 * THIS pair, rather than assuming it matches the prediction.
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
 * example's `expect(...)` calls are translated to `assert`, and its single barrel import of the
 * `effect` package root is translated to one submodule namespace import per module, per AGENTS.md
 * section 3. `effect/testing` has no barrel at all, so `TestClock` is reached at its own path.
 *
 * That paragraph is worded around the barrel import rather than quoting it, deliberately: this
 * plan's acceptance criterion counts the literal in this file and expects zero, and a criterion that
 * forbids a literal forbids spelling it out to explain the rule as well. The repo has now hit that
 * same edge four times (STATE.md 03-04, 10-01, 10-02, and here).
 */
import { loadFeature, ParameterTypeStore } from "@effect-cucumber/gherkin"
import * as NodeFileSystem from "@effect/platform-node/NodeFileSystem"
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
 * `lastError` is that declaration verbatim. `observedOrdinal` and `observedMillis` are this pair's
 * own additions and exist for the same reason every field in the apples pair's `World` does — a
 * `When` writes what it observed and its `Then` reads it back, so the value crosses a step boundary
 * and therefore has to cross it through a `Ref` (RUN-06).
 *
 * Both observation fields start at `-1` and not at `0`, and that is the difference between a sharp
 * assertion and a vacuous one. `The next account check starts at zero` asserts a reading of `0`; a
 * field initialised to `0` would make that Scenario pass with its writing step DELETED, which is
 * exactly the mutation the directory README's minimum set calls D. `-1` is not a reachable clock
 * reading and not a reachable build ordinal, so the reading step's write is load-bearing for both.
 */
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

// THE CALL UNDER TEST, and the only one in this repository's acceptance suite that passes the
// `{ shared, perScenario }` OBJECT form. Module scope, nothing wrapping it, nothing intercepting it.
// The fourth argument is the registration-time filter; everything below is asserted by vitest
// RUNNING what this registered, and by `Renaming a user` never appearing at all.
describeFeature(
  feature,
  { shared: Database.layer, perScenario: World.layer },
  (dsl) => {
    // Destructured for the two CONTAINERS only. The one FEATURE-level step definition below is
    // written as `dsl.Then(...)` rather than pulled into this binding list, and that is not a style
    // wobble: a bare `Then` here would shadow the `Then` every `Scenario(...)` callback receives —
    // oxlint's `eslint(no-shadow)` says so — and the two are genuinely different registrars writing
    // into different scopes. Spelling the Feature-level one out is what keeps that visible.
    const { Background, Scenario } = dsl

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

    // RUN-04 / BEH-EC-012 / ADR-EC-018, first half. This Scenario is the one that breaks the clock
    // for everyone after it — and it is not exempt from the claim it breaks: it reads 0 at its own
    // start like every other Scenario in this Feature does.
    Scenario("An hour passes for one account check", ({ When }) => {
      When("the account check waits an hour", function*() {
        const { observedMillis } = yield* World
        // The anchor for "one hour PAST 0". Without it, `3600000` would be consistent with a clock
        // that started at 3600000 and ignored the adjustment entirely.
        assert.strictEqual(yield* Clock.currentTimeMillis, 0)

        // THE one clock mutation in this file. A second one anywhere would make the next Scenario's
        // "still starts at zero" ambiguous about which adjustment it survived.
        yield* TestClock.adjust("1 hour")

        // BEH-EC-012's other half, and the reason this is not merely an isolation test: a step MUST
        // be able to advance the simulated clock deterministically. A `TestClock` that silently
        // ignored the adjustment would leave the NEXT Scenario's assertion green.
        yield* Ref.set(observedMillis, yield* Clock.currentTimeMillis)
      })
    })

    // RUN-04's second half, and the assertion the whole `shared` path exists to keep true. Declared
    // IMMEDIATELY AFTER the Scenario above — see the header's note on ASSUMPTION-11-C for what that
    // adjacency does and does not buy.
    Scenario("The next account check starts at zero", ({ When }) => {
      When("the next account check reads the clock", function*() {
        const { observedMillis } = yield* World
        yield* Ref.set(observedMillis, yield* Clock.currentTimeMillis)
      })
    })

    // ONE definition matched by BOTH clock Scenarios, so the two bodies cannot drift apart into
    // asserting two different things about one claim. The expected value comes out of each
    // Scenario's own `.feature` line — `3600000` for the one that advanced the clock, `0` for the
    // one after it — so the two readings are compared against numbers that travelled through the
    // parser and the cucumber-expression matcher rather than against constants written here.
    dsl.Then("the account check clock reads {int}", function*(expected: number) {
      const { observedMillis } = yield* World
      assert.strictEqual(yield* Ref.get(observedMillis), expected)
    })

    // RUN-05, and the Scenario that also closes threat T-11-02-01. `Ada` was written into the SHARED
    // database by the first Scenario in this Feature, so a total of 1 here is only reachable if the
    // Background's `clear` really ran against the shared tier between the two. Delete the `clear` and
    // this Scenario reads 2 — which is what makes `clear`'s presence on the service load-bearing
    // rather than decorative, the point `spec/behaviors/02`'s closing paragraph makes in prose.
    //
    // What this Scenario does NOT prove on its own is that its two tags reached the runner — see the
    // header's RUN-05 note. It proves a multi-tag Scenario is registered and runs; the ABSENCE of an
    // `UndeclaredTagWarning` for this file on stderr is the other half of that observation, and
    // `scripts/verify-tags-filter.sh` carries the `--tagsFilter` half no in-process test can.
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
