/**
 * The third acceptance pair, and the densest composition this suite runs: a `Background` whose one
 * step takes a Gherkin data table, a `Rule` carrying its own extra Layer, a two-row
 * `Scenario Outline`, and a simulated clock advanced from inside a Rule-scoped Scenario.
 *
 * ## What this dogfoods
 *
 * `spec/behaviors/03-rules-outlines-and-testclock.md`'s "Worked example" (lines 93-265), promoted
 * from a comment block into a real `.feature` file beside this one. That example is also the one
 * whose earlier published form contained a real spec bug — `Given` was called inside a `Scenario`
 * callback that never received it — corrected by
 * `spec/decisions/017-background-and-scenario-are-step-definition-containers.md`. Running the
 * corrected form is what turns "reads consistently" into "works", which is the only difference this
 * pair exists to make.
 *
 * Three claims carry a `@REQ-EC-NNN` tag, one Scenario each (D-01):
 *
 * - `@REQ-EC-004` (PARSE-04) on `The cart subtotal comes from the decoded table`, declared at
 *   FEATURE level and deliberately OUTSIDE the Rule, so the data-table claim is not entangled with
 *   the Rule-Layer claim. Its Scenario body reads back what the Background's table decoded.
 * - `@REQ-EC-015` (DSL-06) on the `Scenario Outline`, whose two Examples rows emit two tests, each
 *   asserting its own row's total from its own row's `<percent>`.
 * - `@REQ-EC-014` (DSL-05) on `Expired discount codes are rejected`, whose steps resolve
 *   `DiscountRegistry` — a service provided ONLY by the Rule's extra Layer.
 *
 * ## The directory's two standing deviations from the worked examples apply here unchanged
 *
 * Both are stated in full in `packages/vitest/test/acceptance/README.md` and restated per file so a
 * reader comparing this to `spec/behaviors/03` does not read the difference as drift.
 *
 * 1. **`loadFeature` comes from `@effect-cucumber/gherkin`, not from `@effect-cucumber/vitest`.**
 *    ADR-EC-024's `ManagedRuntime`-backed wrapper is not exported — `spec/behaviors/03`'s own caveat
 *    block calls it the one export that package is still missing — and Phase 11 adds no public API,
 *    so this file reaches the gherkin package's Effect-returning `loadFeature` and provides
 *    `NodeFileSystem.layer` plus `ParameterTypeStore` itself.
 * 2. **`describeFeature` is imported by relative path from `../../src/describeFeature.ts`.** This
 *    suite lives inside the package it consumes, and oxlint's `effect/no-import-from-barrel-package`
 *    runs with `checkRelativeIndexImports: true`. The module object reached is the one the barrel
 *    re-exports.
 *
 * ## The worked example's three flagged lines, translated — and a fourth its caveat block missed
 *
 * That example's own caveat block (lines 104-117) names three pre-implementation lines. Each is
 * translated below rather than silently absorbed:
 *
 * 3. **`expect` is used in two step bodies and imported nowhere.** Both become `assert` from
 *    `@effect/vitest`, the rule this whole suite follows: oxlint's `vitest/no-standalone-expect`
 *    does not recognise an Effect-bodied test as a test block. `toBeCloseTo` becomes
 *    `assert.strictEqual`, which is SHARPER rather than merely different — both expected totals are
 *    exactly representable as doubles (35 x 0.9 and 35 x 0.5), so a tolerance would only widen what
 *    a wrong answer could hide.
 * 4. **The two package-root imports become one submodule namespace import per module** (AGENTS.md
 *    section 3), and `TestClock` is reached at `effect/testing/TestClock` because `effect/testing`
 *    has no barrel at all.
 *
 * The FOURTH is not in that caveat block, and this pair is what found it:
 *
 * 5. **`ScenarioOutline` does not exist.** The worked example destructures it out of the Rule's dsl
 *    and registers the Outline's steps inside it. There is no such registrar anywhere in the
 *    package: BEH-EC-018's own normative list is "Given/When/Then/And/But, Background, Scenario, and
 *    exactly four hook registrars", `packages/vitest/src/Dsl.ts`'s `RuleDsl` declares exactly that,
 *    and a repo-wide search finds the identifier only inside `OutlineTitle.ts`'s prose. The correct
 *    call is `Scenario(...)` with the Outline's UN-INTERPOLATED name, and that is not a workaround —
 *    it is the documented mechanism. `packages/vitest/src/ScenarioKey.ts` note (c) and
 *    `packages/vitest/src/Plan.ts` note (c) both state it from their own side: an Outline's rows
 *    share ONE `Scenario(...)` registration, matched on `ParsedScenario.astName`, which is precisely
 *    the string an author passes to `Scenario(...)`. Two rows, one registration.
 *
 *    `.planning/phases/11-.../11-CONTEXT.md`'s "Reusable Assets" list repeats the worked example's
 *    error and names `ScenarioOutline` among this package's public exports. It is not one.
 *
 * The fifth is not the only thing this pair found. Writing it is also what discovered that **the
 * runner never handed a step body its data table at all**, and the Background below is the first
 * caller in the repository that needed it:
 *
 * 6. **`Plan.ts` forwarded only the cucumber-expression arguments.** `packages/gherkin` had parsed,
 *    wrapped, ordered and exported a step's table since Phase 4 — `ParsedStep.stepArguments`, exactly
 *    as ADR-EC-008 promises — and `planStep` set `args: only.args`, the matcher's output alone. So
 *    `table` below arrived `undefined` and every Scenario in this file died on
 *    `Cannot read properties of undefined (reading 'hashes')`. Nothing in the suite was red, because
 *    `spec/behaviors/06` had DECLINED to specify the step-body signature and no gate can check a
 *    contract no document states. Closing it took one line in `planStep` and the normative paragraph
 *    `06` had deferred; both landed with this pair, and `packages/gherkin/test/StepArgs.types.ts`
 *    now pins the type-level half.
 *
 *    That is why `table` is ANNOTATED below rather than inferred, and the annotation is not a
 *    workaround for a weak type. `StepArgs<P>` resolves a step body's parameters from the pattern
 *    LITERAL, and `"the cart contains:"` is indistinguishable from the pattern of a step carrying
 *    nothing — a table is everything BELOW the text a pattern matches, so there is no brace token
 *    for it and deliberately none. BEH-EC-016 now requires the author to write the type, which is
 *    the only place that claim can exist.
 *
 * A seventh translation is forced by effect v4 rather than by this repo, and it is the one place
 * this file's `DiscountRegistry` is not byte-for-byte the worked example's:
 *
 * 7. **`Duration.decode` is gone, and `Duration.toMillis` will not take a plain `string`.** In
 *    `effect@4.0.0-rc.112` a `Duration.Input` is a template-literal type, so a value that arrived
 *    through a `{string}` step parameter is not assignable to it and no amount of widening makes it
 *    so — widening is exactly what this directory's zero-unsound-escape-hatch rule forbids. The
 *    honest conversion is `Schema.DurationFromString`, decoded through the same
 *    `Schema.decodeUnknownEffect` the Background's table uses, which is why `register`'s error
 *    channel carries a `SchemaError`. A nonsense expiry string fails loudly at the step that wrote
 *    it instead of silently registering a code that never expires.
 *
 * `Schema.decodeUnknown` is likewise `Schema.decodeUnknownEffect` in v4, and `table.hashes()`
 * returns an Effect rather than a plain value — `packages/gherkin/src/DataTable.ts` note (b) is why,
 * and note (c) there already records that ADR-EC-008's own worked example predates both. So the
 * example's one-liner becomes a `yield*` of the accessor feeding a `yield*` of the decode.
 *
 * ## `TestClock` transparency is the point, and `DiscountRegistry` must stay unaware of it
 *
 * `register` reads `Clock.currentTimeMillis` and `apply` compares against it. Neither mentions
 * `TestClock`, neither takes a clock parameter, and neither has a test-only branch — that is
 * BEH-EC-012's requirement stated as a service rather than as prose. `When 2 hours pass` advances
 * the simulated clock by two hours, the code registered with a one-hour window, and `apply` then
 * rejects it. Simplifying the registry to store a boolean or an absolute constant would delete the
 * claim while leaving every test green.
 *
 * ## Cross-step state goes through a `Ref`, and there is no module-scope holder at all
 *
 * Every value one step writes for a later step in the same Scenario lives in a `Ref` on `World`
 * (RUN-06, INV-EC-006, ADR-EC-009, PROH-11-03). No `let`, no `var`, and — unlike the accounts pair,
 * which has one module-scope `Ref` counting Layer builds — nothing at module scope here holds
 * mutable state of any description.
 *
 * `subtotal` and `total` initialise to `0`, exactly as the worked example declares them, and that is
 * safe here for a reason worth stating rather than assuming: `0` is not a value any assertion in
 * this Feature wants. The three expected numbers are 35, 31.5 and 17.5, so a step whose write was
 * deleted reads `0` and fails, which is what the accounts pair's `-1` initialisation had to be
 * chosen to achieve.
 *
 * ## Mutation-tested (every one performed, run, then reverted)
 *
 * The directory README's standing rule: a passing acceptance test proves nothing on its own, so each
 * entry below names what went RED and — the part that is easiest to omit — what stayed GREEN.
 *
 * - **A. The table really reaches the step.** `Gadget`'s price changed from `25.00` to `26.00` in the
 *      `.feature` file, nothing in this module touched → **3 of 4 red**, the Feature-level Scenario
 *      first with `expected 36 to equal 35`, then both Outline rows with `expected 32.4 to equal 31.5`
 *      and `expected 18 to equal 17.5`. That is one cell of Gherkin text moving three assertions in
 *      two different Scenarios, which is what proves the number was PARSED rather than hard-coded
 *      here (PROH-11-01, threat T-11-03-04). The plan predicted one red test; the Background reaches
 *      every Scenario, so it is three. `Expired discount codes are rejected` stayed GREEN and
 *      legitimately so: it asserts a rejection MESSAGE and never reads the subtotal into an
 *      assertion, so no arithmetic of its own can notice.
 * - **B. The decode is replaceable — and this one is SUPPOSED to stay green.**
 *      `decodeHashes(CartRow)(table)` replaced by a direct `yield* table.hashes()` and a hand-parse
 *      (`Number(row["price"])`) → **4 of 4 still pass**, nothing red anywhere. `Schema` is not
 *      load-bearing for the HAPPY path, and recording that honestly is the point: this mutation is
 *      kept precisely because it fails to turn anything red, and mutation C is the one that shows why
 *      the decode is worth having anyway. A reader who sees only C could conclude the schema is
 *      carrying the Scenario; B is the control that says it is not.
 * - **C. The decode is load-bearing where it matters.** `CartRow`'s `price` changed from
 *      `Schema.NumberFromString` to `Schema.Number` → **4 of 4 red**, all on the same located
 *      `DataTableError`, because every Gherkin table cell is a string (threat T-11-03-01):
 *
 *          Row 1 of the DataTable at …/worked-example-03-discounts.feature:4 failed to decode,
 *          column "price": Expected number
 *
 *      with `reason: 'RowDecodeFailed'` and `column: Some('price')`. That is ADR-EC-008's located
 *      error and BEH-EC-016's locator REQUIREMENT — the 1-based BODY-ROW ordinal, the column, the
 *      feature uri and the STEP's line (`:4`, the `Given`, not the row) — observed here from a real
 *      Feature file for the first time rather than from a synthetic `PickleTable`.
 * - **D. The Rule Layer really is Rule-scoped.** `Scenario("Expired discount codes are rejected", …)`
 *      moved out of the `Rule` callback to Feature level as `dsl.Scenario(...)`, its body
 *      byte-identical → **fails to COMPILE**, at the two step bodies that yield the service:
 *
 *          error TS377004: This Effect requires a service that is missing from the expected Effect
 *          context: `DiscountRegistry`. effect(missingEffectContext)
 *
 *      beneath a `TS2345` whose structural tail reads `is missing the following properties from type
 *      '{ subtotal; total; rejection }'` — the Feature-level dsl's `ROut` is `World` alone. So
 *      INV-EC-005's compile-time boundary holds and there is no defect to report; this is the same
 *      diagnostic NAME that `scripts/verify-tsgo-gate.sh` assertions 12/13 assert as the standing
 *      guard (threat T-11-03-02). `pnpm test` was not reached, which is the correct outcome: the
 *      claim is about code that never runs.
 * - **E. The Outline rows are independent.** The second Examples row's `expected` changed from
 *      `17.50` to the first row's `31.50` → **exactly 1 of 4 red**, `expected 17.5 to equal 31.5` on
 *      the `SAVE50` row alone. The library computed 17.5 from that row's OWN `percent` while the
 *      Feature file demanded the other row's number, so no shared `Ref` and no last-row-wins capture
 *      is in play (Pitfall 34, threat T-11-03-03). The failing test's TITLE also re-rendered as
 *      `(code=SAVE50, percent=50, expected=31.50)`, which is a free second proof that BEH-EC-018's
 *      suffix is derived per row rather than from the Outline.
 */
import { type DataTable, decodeHashes, loadFeature, ParameterTypeStore } from "@effect-cucumber/gherkin"
import * as NodeFileSystem from "@effect/platform-node/NodeFileSystem"
import { assert } from "@effect/vitest"
import * as Clock from "effect/Clock"
import * as Context from "effect/Context"
import * as Duration from "effect/Duration"
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
const featurePath = fileURLToPath(new URL("./worked-example-03-discounts.feature", import.meta.url))

/**
 * Real bytes off disk, through the real parser, at module top level.
 *
 * A genuine top-level `await` and never `Effect.runSync`: `NodeFileSystem.readFileString` suspends
 * internally, so `runSync` over a path-based `loadFeature` throws `AsyncFiberError`.
 */
const feature = await Effect.runPromise(
  loadFeature(featurePath).pipe(Effect.provide(Layer.mergeAll(NodeFileSystem.layer, ParameterTypeStore.Default)))
)

/**
 * One row of the Background's table, exactly as the worked example declares it.
 *
 * `Schema.NumberFromString` and not `Schema.Number`, and that is the whole reason the decode is not
 * decoration: every Gherkin table cell is a STRING, so a schema expecting a number rejects
 * `"10.00"` at run time. Mutation C in the record below is that swap, performed and measured.
 */
const CartRow = Schema.Struct({ item: Schema.String, price: Schema.NumberFromString })

/** The worked example's own tagged error, field for field. */
class DiscountError extends Schema.TaggedError<DiscountError>()("DiscountError", {
  message: Schema.String
}) {}

/**
 * Per-Scenario, Feature-wide: the cart's decoded subtotal plus the two cross-step scratch fields,
 * from the worked example's own declaration.
 *
 * Fresh for every Scenario, including for each Outline row — the default per-Scenario scope
 * (ADR-EC-006). That is what makes the two rows independent without either of them clearing
 * anything, which is the Pitfall 34 regression class BEH-EC-018's last requirement names.
 */
class World extends Context.Service<World, {
  readonly subtotal: Ref.Ref<number>
  readonly total: Ref.Ref<number>
  readonly rejection: Ref.Ref<Option.Option<DiscountError>>
}>()("World") {
  static readonly layer = Layer.effect(
    this,
    Effect.gen(function*() {
      return World.of({
        subtotal: yield* Ref.make(0),
        total: yield* Ref.make(0),
        rejection: yield* Ref.make<Option.Option<DiscountError>>(Option.none())
      })
    })
  )
}

/**
 * The Rule-scoped extra Layer (BEH-EC-009, INV-EC-005): only Scenarios written inside
 * `Rule("Percentage discounts expire at midnight", DiscountRegistry.layer, …)` can reach this
 * service. A step body outside that callback that yields it does not COMPILE, which is a claim about
 * code that never runs — `scripts/verify-tsgo-gate.sh` assertions 12 and 13 carry it, and mutation D
 * below is this pair's own one-off confirmation.
 *
 * Zero test-awareness, deliberately: `register` and `apply` each read `Clock.currentTimeMillis` and
 * nothing else. See this module's header on why that is the requirement rather than an incidental
 * shape.
 */
class DiscountRegistry extends Context.Service<DiscountRegistry, {
  readonly register: (code: string, percent: number, expiresIn: string) => Effect.Effect<void, Schema.SchemaError>
  readonly apply: (code: string, subtotal: number) => Effect.Effect<number, DiscountError>
}>()("DiscountRegistry") {
  static readonly layer = Layer.effect(
    this,
    Effect.gen(function*() {
      const codes = yield* Ref.make(new Map<string, { readonly percent: number; readonly expiresAt: number }>())
      return DiscountRegistry.of({
        register: (code, percent, expiresIn) =>
          Effect.gen(function*() {
            const now = yield* Clock.currentTimeMillis
            // Header translation 6: the expiry text arrives as a plain string and is decoded, never
            // widened into the template-literal input type `Duration.toMillis` asks for.
            const window = yield* Schema.decodeUnknownEffect(Schema.DurationFromString)(expiresIn)
            const expiresAt = now + Duration.toMillis(window)
            yield* Ref.update(codes, (held) => new Map(held).set(code, { percent, expiresAt }))
          }),
        apply: (code, subtotal) =>
          Effect.gen(function*() {
            const now = yield* Clock.currentTimeMillis
            const entry = (yield* Ref.get(codes)).get(code)
            if (entry === undefined) {
              return yield* Effect.fail(new DiscountError({ message: "code not found" }))
            }
            if (now > entry.expiresAt) {
              return yield* Effect.fail(new DiscountError({ message: "code expired" }))
            }
            return subtotal * (1 - entry.percent / 100)
          })
      })
    })
  )
}

// THE CALL UNDER TEST. Module scope, nothing wrapping it, nothing intercepting it. The second
// argument is the plain per-Scenario Layer form — this Feature has no shared tier, which is what
// makes each Outline row's `World` its own.
describeFeature(feature, World.layer, (dsl) => {
  // Destructured for the two CONTAINERS only. The one FEATURE-level step definition below is written
  // as `dsl.Then(...)` rather than pulled into this binding list: a bare `Then` here would shadow the
  // `Then` every `Scenario(...)` callback receives, which oxlint's `eslint(no-shadow)` rejects, and
  // the two are genuinely different registrars writing into different scopes.
  const { Background, Rule } = dsl

  // PARSE-04 / ADR-EC-008 / DSL-04. A Background is a step-definition CONTAINER (ADR-EC-017), so this
  // pattern is matched against the Background's literal Gherkin text and its body runs as the first
  // `yield*` of EVERY Scenario's own Effect — the two Outline rows and the Rule's Scenario included,
  // because a Feature-level Background reaches into a Rule (`Plan.ts`'s `isVisibleTo`, `background`
  // arm).
  Background(({ Given }) => {
    Given("the cart contains:", function*(table: DataTable) {
      // Annotated with the `DataTable` type the gherkin package exports rather than widened to make
      // the parameter compile (PROH-11-02) — and REQUIRED to be annotated, per header translation 6
      // and BEH-EC-016. It is the last parameter because table arguments are appended after the
      // pattern's own; this pattern simply has none. `decodeHashes` reads the body rows keyed by the
      // header row's cells and turns each `price` cell's string into a number in one step, keeping
      // one error channel and producing ADR-EC-008's located error.
      const rows = yield* decodeHashes(CartRow)(table)
      yield* Ref.set((yield* World).subtotal, rows.reduce((sum, row) => sum + row.price, 0))
    })
  })

  // The `@REQ-EC-004` Scenario's only step, registered at FEATURE level. It reads back what the
  // Background decoded, against the number the `.feature` file's own `Then` line carries — so the
  // 35.00 on both sides of this assertion travelled out of the Gherkin text by two different routes,
  // one through the table and the decode, the other through the cucumber-expression matcher.
  dsl.Then("the cart subtotal is {float}", function*(expected: number) {
    assert.strictEqual(yield* Ref.get((yield* World).subtotal), expected)
  })

  // BEH-EC-009 / DSL-05. Three arguments, the middle one being the Rule's own extra Layer, combined
  // with the ambient Layer by `Layer.provideMerge(ambient)(extraLayer)` (BEH-EC-018) — which is what
  // lets a Rule Layer DEPEND on ambient services rather than merely sit beside them. Both Scenarios
  // below reach `World` and `DiscountRegistry` from that one merged Layer.
  Rule("Percentage discounts expire at midnight", DiscountRegistry.layer, ({ Scenario }) => {
    // DSL-06 / BEH-EC-010 / BEH-EC-018. Registered with the Outline's UN-INTERPOLATED name — see
    // header translation 5 — so ONE registration serves BOTH Examples rows, and each emitted test
    // receives its own row's values through the step patterns' own coercion. Nothing here mentions
    // the rows, and nothing here could tell you how many there are.
    Scenario("Applying a valid discount code", ({ Given, Then, When }) => {
      Given(
        "a discount code {string} worth {int}% expiring in {string}",
        function*(code: string, percent: number, expiresIn: string) {
          // `percent` arrives as a `number` and not as the string `"10"`: the `{int}` pattern coerced
          // the Examples cell on the way in, with no typed-example mechanism anywhere. That is
          // BEH-EC-010's whole requirement, and `register`'s signature is what enforces it here —
          // a string would not compile.
          yield* (yield* DiscountRegistry).register(code, percent, expiresIn)
        }
      )

      When("I apply the discount code {string}", function*(code: string) {
        const { subtotal, total } = yield* World
        yield* Ref.set(total, yield* (yield* DiscountRegistry).apply(code, yield* Ref.get(subtotal)))
      })

      Then("the total is {float}", function*(expected: number) {
        // Row 1 expects 31.50 and row 2 expects 17.50, each out of its OWN row's `expected` column.
        // A shared `Ref` across rows, or a registration that captured the last row's values, reads
        // the other row's number here.
        assert.strictEqual(yield* Ref.get((yield* World).total), expected)
      })
    })

    // ADR-EC-017's correction, and the reason this example was worth running rather than reading: the
    // four step definitions below are registered through the `Scenario` callback's OWN dsl parameter.
    // An earlier published version of this worked example called `Given` here with nothing in scope
    // to provide it.
    Scenario("Expired discount codes are rejected", ({ Given, Then, When }) => {
      Given(
        "a discount code {string} worth {int}% expiring in {string}",
        function*(code: string, percent: number, expiresIn: string) {
          // The same pattern text as the Outline's, registered a second time in a different
          // Scenario's scope. `Plan.ts`'s `isVisibleTo` keys a `scenario`-scope registration on
          // `astName` AND `ruleId`, so the two never cross.
          yield* (yield* DiscountRegistry).register(code, percent, expiresIn)
        }
      )

      When("{int} hours pass", function*(hours: number) {
        // The anchor for "two hours PAST the registration". Without it, an expiry check that passed
        // for the wrong reason — a clock frozen somewhere else entirely — would look identical.
        assert.strictEqual(yield* Clock.currentTimeMillis, 0)
        yield* TestClock.adjust(`${hours} hours`)
      })

      When("I apply the discount code {string}", function*(code: string) {
        const { rejection, subtotal } = yield* World
        yield* (yield* DiscountRegistry).apply(code, yield* Ref.get(subtotal)).pipe(
          Effect.catchTag("DiscountError", (error) => Ref.set(rejection, Option.some(error)))
        )
      })

      Then("the discount is rejected with {string}", function*(message: string) {
        const rejection = yield* Ref.get((yield* World).rejection)
        // The message the REGISTRY produced, compared against the one the `.feature` file carries.
        // `Option.isSome` first, so a Scenario in which nothing was rejected fails rather than
        // comparing two absences.
        assert.strictEqual(Option.isSome(rejection) && rejection.value.message, message)
      })
    })
  })
})
