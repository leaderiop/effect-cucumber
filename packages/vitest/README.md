# @effect-cucumber/vitest

The package most consumers install directly. It provides `describeFeature`, the Given/When/Then/Background/Scenario
DSL, the six-hook `Before`/`After`/`BeforeStep`/`AfterStep`/`BeforeAllScenarios`/`AfterAllScenarios` surface, and the
`it.effect`-based runner that turns a Gherkin `.feature` file into ordinary vitest `describe`/`it` calls — no plugin
and no custom reporter. `Rule` containers, their own `Background` and hooks, and per-row-titled Scenario Outlines all
ship; "## Status" below says what is still waiting on a later phase. It depends on
[`@effect-cucumber/gherkin`](../gherkin) for parsing and exports the Promise-returning `loadFeature` a Feature file
awaits at module top level (ADR-EC-024).

## Status

Published on npm as `0.1.0` (pre-1.0: the API can still move). The registration surface and the runner have both shipped.

`describeFeature(feature, layer, define)` is real. It takes either a plain `Layer` or
`{ shared, perScenario }` (`perScenario` is a required key — write `perScenario: Layer.empty` for a Feature with no
per-Scenario-fresh state), and hands `define` a dsl whose `Given`/`When`/`Then`/`And`/`But` accept a bare generator
function — auto-wrapped with `Effect.fn(stepText)` so the step text becomes the span name — or an already-wrapped
function, which is passed through by identity rather than wrapped twice. `Background` receives `Given`/`And` only, per
real Gherkin grammar; `Scenario` receives all five.

**The core value is enforced, not aspirational.** A step whose Effect requires a service the ambient Layer does not
provide is a compile error where the step is written, by name — `effect(missingEffectContext)` — as is a Layer argument
whose own requirements are unsatisfied (`effect(missingLayerContext)`), and a read of a `World` field absent from its
declared type (`TS2339`). `pnpm verify:tsgo-gate` asserts all of that on every push against committed
satisfied/starved fixture pairs, checking the exit code _and_ the diagnostic name, so the guarantee cannot decay into a
rejection that no longer proves anything.

**A Feature file runs.** `describeFeature` emits one `describe` named after the Feature, containing one `it.effect` per
Scenario titled with its interpolated name — nested inside a further `describe` per `Rule` where the Feature has them. Both blocks are registered
unshuffled, so a Feature's Scenarios run in document order even under `--sequence.shuffle` — Gherkin order is meaningful,
and `pnpm test:shuffle` proves it on every push.
Each Scenario's Background steps run first, as leading `yield*`s inside the same `Effect.gen`, so the first failure
short-circuits every step after it. A step matching no registered pattern, or more than one, fails its own Scenario
with a located `StepMatchError` — the ambiguous case naming every matching pattern with the file and line it was
defined at, in a deterministic order — and a registered pattern that matches no step in the Feature is a non-fatal
warning on three channels: the terminal, the reporter, and the collected plan.

**Hooks run, and the guarantees are real.** All six hooks — `Before`, `After`, `BeforeStep`, `AfterStep`,
`BeforeAllScenarios`, `AfterAllScenarios` — are registered through the same dsl object as `Given`/`When`/`Then`, and
accept a bare generator function auto-wrapped with `Effect.fn` using the hook's own name as its span. A Feature may
register more than one hook of a kind, and they run in registration order; a batch of same-kind hooks is independent
— a failing hook does not stop the rest of its batch, and every failure in the batch reaches the one reported failure,
combined rather than first-wins. A Scenario's own steps run only if every `Before` hook succeeded. `After`, `AfterStep`
and `AfterAllScenarios` each run whether the thing they guard succeeded or failed, and never mask its error.
`BeforeAllScenarios` runs once per Feature, shared across every Scenario, and its failure is reported by every
Scenario individually. Both once-per-Feature hooks see the **shared** tier only — the plain-Layer form gives them no
service at all — so a hook that must seed state every Scenario reads puts that state in `shared`; reaching for a
per-Scenario service from either is a compile error by name. `AfterAllScenarios` is the Feature block's own teardown
hook rather than a test node, so it still
runs once when a run is narrowed with `-t` or `--tagsFilter` to one Scenario, and does nothing when no Scenario in the
Feature was attempted; a failure in it reports against the Feature's block. It relies on vitest's default
`sequence.hooks: "stack"` ordering to run before the shared tier is released — `"list"` is not supported.

Two preconditions come with the once-per-Feature hooks and are stated rather than left to be discovered.
`BeforeAllScenarios` is a once-cell: it runs inside the **first attempted Scenario's** timeout budget (raise
`testTimeout` for slow setup), and its first exit — success, failure, or the timeout interrupting it — is what every later
Scenario reports; it is never retried, so a Scenario tagged `@retry` (below) cannot make a failed setup pass — every
retry attempt re-observes the SAME already-settled once-cell rather than re-running `BeforeAllScenarios` itself
(measured, not assumed: `packages/vitest/test/Runner.test.ts`, ADR-EC-034 design question 2). And Scenarios must run
sequentially: a Feature emitted under `sequence.concurrent: true` or inside your own `describe.concurrent` is unsupported,
because two Scenarios could enter the once-cell together.

**Both once-per-Feature hooks are scoped to one Feature — for a hook that should run once per SUITE, reach for vitest's
own `globalSetup`/`globalTeardown` instead.** `BeforeAllScenarios`/`AfterAllScenarios` deliberately don't reach across
Features (each Feature's once-cell is its own), so a suite-wide "provision this once for every Feature in the run"
concern belongs in `globalSetup` (an array of module paths in `vitest.config.ts`, each exporting a `setup`/`teardown`
pair, run once per worker before/after the whole run) rather than a new construct here — this package intentionally adds
no typed wrapper around it, since every comparable Cucumber implementation that supports a suite-wide hook hits the same
worker-isolation caveat this library's Feature-scoped once-cell already documents above.

**Both Layer scopes are real at run time, not only in the types.** `describeFeature`'s second argument takes either a
plain `Layer` — the default, per-Scenario scope, built fresh for every Scenario, so nothing one Scenario's Layer built
is visible to the next — or `{ shared, perScenario }`, where `shared` is built exactly once for the whole Feature
through `@effect/vitest`'s own `layer(...)` helper and released when the Feature's block ends (before the next Feature
in the same file starts), while `perScenario` beside it is still rebuilt every Scenario.
`perScenario` is a **required** key even for a Feature with no per-Scenario-fresh state at all: write
`perScenario: Layer.empty`. `perScenario` may be built **from** `shared` — its input type is bounded by the shared
tier's output, so a per-Scenario `World` over a shared `Database` is one `Layer.effect` away, while an input neither
tier provides is a compile error at the `describeFeature` call. The two tiers are never merged into one, so where both name the same service the
`perScenario` implementation is the one a step resolves. Every Scenario keeps its **own** simulated clock and its own
console on both scopes — one Scenario's `TestClock.adjust` is never observable by another, whichever form the Feature
used. **A step should read this ambient `TestClock` directly** — `yield* TestClock.adjust(...)` from
`effect/testing/TestClock`, not wrap its own work in a second `.pipe(Effect.provide(TestClock.layer()))`. Code ported
from `cucumber-js` is the likely place to carry that over by habit, since there is no ambient `TestClock` there and one
has to be built by hand. It is not merely redundant: nested underneath real concurrent dispatch and an `Effect.timeout`
(a `Promise.all`-style fan-out racing a deadline, say), the second, nested clock can lose to the real one, and a
retry-with-backoff genuinely waits in wall-clock time instead of resolving against simulated time — the failure mode is
an indefinite hang, not a wrong answer, which makes it slow to trace back to the extra `provide`. **The step that
genuinely needs real time** — asserting a real HTTP call's actual latency, say — is not "just don't": `effect/testing/TestClock`'s
own `TestClock.withLive(effect)` runs one Effect against the real system clock, scoped to just that Effect, while
leaving the ambient simulated `TestClock` in place for everything around it. It never re-provides a second `TestClock`
service, so it sidesteps the whole footgun above rather than being another way to trigger it — reach for it instead of
a nested `Effect.provide(TestClock.layer())` whenever a step's own real-time need is genuine, not habit carried over
from `cucumber-js`.

**Captured console output is already assertable, with zero setup.** Because `TestConsole.layer` is already part of the
ambient `testEnv` every Scenario gets, a step can `yield* TestConsole.logLines` (or `TestConsole.errorLines`) today to
read back what earlier steps in the same Scenario logged — e.g. `Then("the following was logged:", function*(doc) { const lines = yield* TestConsole.logLines; assert.deepStrictEqual(lines, [doc.content]) })`.
Nothing to import beyond `effect/testing/TestConsole`; no library change makes this work, it already does.

One constraint comes
with `shared`, and it is a type error rather than advice: its error channel must be `never`.
`@effect/vitest` builds a shared Layer with `Effect.orDie`, so a typed failure there — a testcontainer that will not
start, the realistic case — becomes an unrecoverable defect raised out of a setup hook, attributed to no Scenario, no
step and no `.feature` file. Handle it where the types can see the choice instead: `Layer.catchAll` to substitute a
fallback, or `Layer.orDie` to make the collapse explicit in your own source. One capability does not carry across
either — the `it` the framework hands a shared block has no live-clock member, so a Feature using `shared` cannot opt a
single Scenario out of the simulated clock. The reverse holds for the shared tier itself: it is built once, before any
Scenario's simulated clock exists, so a shared Layer that forks a sleeping fiber or reads the clock at build time runs on
wall-clock time. Only step bodies and the per-Scenario tier see the `TestClock`.

A fake counter-based "expensive resource" is the smallest thing that shows what the build-once guarantee buys. Both
Scenarios in the Feature below read the same build:

```ts
import { describeFeature, loadFeature } from "@effect-cucumber/vitest"
import { assert } from "@effect/vitest"
import * as Context from "effect/Context"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import { fileURLToPath } from "node:url"

// Real bytes off disk, once, at module top level. `loadFeature` runs on a module-scoped
// ManagedRuntime over NodeFileSystem.layer and resolves to a ParsedFeature; pass a second argument
// (`ParameterTypeStore.layer([{ name: "money", ... }])`) when the file declares custom parameter types.
// Both of this Feature's Scenarios run the same two steps.
const feature = await loadFeature(fileURLToPath(new URL("./catalog.feature", import.meta.url)))

class Catalog extends Context.Service<Catalog, { readonly buildOrdinal: number }>()("Catalog") {}

let catalogBuilds = 0

// `Layer.effect`, not `Layer.succeed`: only `Layer.effect` has a build-time body, and the body is
// the thing being counted. Its error channel is `never`, which is what `shared` requires.
const catalogLayer = Layer.effect(
  Catalog,
  Effect.gen(function*() {
    yield* Effect.void
    catalogBuilds += 1
    return Catalog.of({ buildOrdinal: catalogBuilds })
  })
)

describeFeature(feature, { shared: catalogLayer, perScenario: Layer.empty }, ({ Then, When }) => {
  When("the catalog is read", function*() {
    // Build 1 in BOTH Scenarios — the shared Layer was built once for the whole Feature. Pass
    // `catalogLayer` as a plain Layer instead and this reads 1, then 2.
    const catalog = yield* Catalog
    assert.strictEqual(catalog.buildOrdinal, 1)
  })

  Then("the catalog was built once", function*() {
    yield* Effect.void
    assert.strictEqual(catalogBuilds, 1)
  })
})
```

That is the shape `packages/vitest/test/emission.test.ts` asserts on every push, counter and all, so the example above
stays honest against something that actually runs rather than drifting into a second description of the same
behaviour.

**A `Rule` can extend the ambient Layer, and so can a single `Scenario`.** `Rule(name, extraLayer, define)` merges
`extraLayer` onto the Feature's Layer with `Layer.provideMerge`, so the Rule's Layer may itself depend on the Feature's
services rather than merely sit beside them — and a step inside that Rule can use the extra service while the identical
step written outside it does not compile, by name (`effect(missingEffectContext)`, asserted by
`pnpm verify:tsgo-gate`). `Scenario(name, extraLayer, define)` does the same thing for one Scenario, onto whatever was
ambient where it was written, so a Scenario inside a Rule reaches all three tiers. Both are always per-Scenario scope,
built fresh for every Scenario — there is no "shared within a Rule" tier. Both containers also have a two-argument form,
`Rule(name, define)` and `Scenario(name, define)`, for the ordinary case that needs no extra services; a Rule declared
that way contributes nothing to its Scenarios' ambient Layer.

A Rule scopes more than its Layer. `Before`, `After`, `BeforeStep` and `AfterStep` declared inside a Rule apply to that
Rule's Scenarios only, and compose with the Feature's own: the Feature's Before-shaped hooks run first and then the
Rule's, while the Rule's After-shaped hooks run first and then the Feature's — outer setup before inner, inner
guarantee before outer, matching the emitted `describe`/`describe` nesting. `BeforeAllScenarios` and `AfterAllScenarios`
stay Feature-only and are a compile error on a Rule's dsl. A Rule also gets its own `Background` (`Given`/`And` only,
like the Feature's), so a `.feature` file with a `Rule:`-level `Background:` has somewhere to register its steps; Rule-
and Feature-level registrations never resolve each other's steps, and the innermost matching scope wins.

**Steps are reusable across Features through typed step modules.** `defineSteps<R>(define)` records step definitions
in a shared file without registering them anywhere; every container's `use(module)` registers them into that
container's scope — Feature-scoped at Feature level, Rule-scoped inside a `Rule` — exactly as if they had been written
there, with the module file as their definition site. `R` is what the module's steps need and is declared, not
inferred: a Feature whose Layer lacks a service the module names cannot `use` it, by name
(`effect(missingEffectContext)`, asserted by `pnpm verify:tsgo-gate`). Using one module twice in one scope is an
ambiguity like any duplicate; `Background` cannot `use` a module.

```ts
// steps/apples.ts
export const applesSteps = defineSteps<World>(({ Given, Then, When }) => {
  Given("I have {int} apples", function*(count) {
    yield* Ref.set((yield* World).apples, count)
  })
  // ...
})

// checkout.steps.test.ts
describeFeature(feature, World.layer, ({ Rule, use }) => {
  use(applesSteps)
  Rule("Limits", ({ use: useInRule }) => useInRule(limitSteps))
})
```

**Step parameters are typed by the pattern, and Scenario Outline rows are typed for free and individually filterable.**
`Given("I have {int} apples", function*(count) { … })` receives `count: number` with no annotation, and
`function*(count: string)` on that pattern is a compile error: the body's parameters are `StepParams<P>`, the pattern's
holes typed by `StepArgs`. Two positions stay `any` on purpose — a custom parameter type's hole (its transform's type is
runtime data, so your own annotation types it) and the trailing `DataTable`/`DocString` parameter (not part of the text a
pattern matches; see the BEH-EC-016 note in the spec). An Examples value consumed by an `{int}` or `{float}` pattern
reaches the step body already coerced to `number` — the pattern's own cucumber-expression coercion does it, with no
separate typed-example-row mechanism. Each row emits its own test, titled with the row's interpolated
name plus every Examples column and that row's value for it —
`Applying a valid discount code (code=SAVE10, percent=10, expected=31.50)` — appended whether or not the title text
already referenced a placeholder, so `-t` can filter on any column value. Two rows of one Outline share no mutable
state: each is its own test against its own Layer build, and observes only its own row's values.

**An Examples column no step's pattern references still reaches every step of that row, typed through `Schema`.**
`ParsedScenario.exampleRow` (`Option.none()` for a plain Scenario) carries the raw row — `header`, `values` and a
`raw` record zipping the two — and `Plan.ts` appends it to `StepParams<P>`'s existing trailing tail (the same tail
DataTable/DocString already use, BEH-EC-016) for EVERY step of that row, whether or not that step's own author
declared a trailing parameter for it. A step body that wants a typed view of it calls `decodeExamplesRow`, the same
`Schema`-decode mechanism `decodeHashes` already gives a DataTable (ADR-EC-008), applied one level up to a whole row —
no Schema is declared anywhere ahead of time, not on `describeFeature`, not on `loadFeature` (ADR-EC-032):

```ts
import { decodeExamplesRow, type ExamplesRow } from "@effect-cucumber/vitest"
import * as Schema from "effect/Schema"

// `priority` is never mentioned in any step's text — only in the Examples header.
const ShipmentRow = Schema.Struct({ sku: Schema.String, priority: Schema.NumberFromString })

When("the shipment is decoded", function*(row: ExamplesRow) {
  const { priority, sku } = yield* decodeExamplesRow(ShipmentRow)(row)
  // ...
})
```

**Tags reach the runner, and `@skip`/`@only` behave as specified.** Every tag on a Scenario becomes a native runner tag
on the emitted test, inherited `Feature`, `Rule` and `Examples` tags included, each keeping the literal `@` prefix it
carries in the `.feature` file. `@skip` additionally emits the test as skipped, so neither its steps nor any of its
hooks run — which is also why a `@skip` Scenario containing an unmatched step reports skipped rather than undefined.
`@only` is emitted as a plain tag and is NEVER routed to the runner's only-mode, so an `@only` left in a committed
`.feature` file cannot fail a CI run that forbids only-marking. `includeTags`/`excludeTags`, on `describeFeature`'s
optional fourth argument, narrow what is REGISTERED rather than what runs: an excluded Scenario never becomes a test
and is absent from the report entirely rather than listed in it as skipped, and one summary line naming the count, the
Feature and the option that removed them prints whenever the filter removed anything. Both take a plain array of tag
strings — never the runner's boolean tag-expression grammar — and `undefined` and `[]` both mean no filter. The
runner's own `--tagsFilter` still works independently on whatever was registered; the two compose.

**`@retry` wraps a Scenario in `@effect/vitest`'s own `flakyTest`, fixed at its own defaults.** Up to 10 attempts
(`Schedule.recurs(10)`), bounded by a 30-second wall-clock cap — no numeric parameter, the same convention `@skip`/
`@only` already carry:

```ts
import { describeFeature, loadFeature } from "@effect-cucumber/vitest"
import * as Context from "effect/Context"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"

// A `.feature` file with:
//   @retry
//   Scenario: A call that occasionally times out still gets asserted on
//     When I call the flaky endpoint
//     Then the response is recorded
const feature = await loadFeature("./flaky.feature")

class World extends Context.Service<World, { readonly name: string }>()("World") {
  static readonly layer = Layer.succeed(this, World.of({ name: "world" }))
}

describeFeature(feature, World.layer, ({ Scenario }) => {
  Scenario("A call that occasionally times out still gets asserted on", ({ Then, When }) => {
    When("I call the flaky endpoint", function*() {
      // A real call would go here — this step may fail; @retry gives it up to 10 attempts.
      yield* Effect.void
    })
    Then("the response is recorded", function*() {
      yield* Effect.void
    })
  })
})
```

A Scenario that fails on an early attempt and passes on a later one is reported PASSING, not flaky-and-red. The
per-Scenario Layer rebuilds fresh for EVERY attempt — the same "fresh every Scenario" guarantee `perScenario`
already has, extended to "fresh every attempt" — and a `shared` Layer beside it in the same Feature still builds
exactly once, unaffected by any Scenario next to it retrying. Two things `@retry` does NOT reset between attempts,
worth knowing before reaching for it: `BeforeAllScenarios`'s once-cell (above — a retry cannot rescue a failed
setup), and the ambient simulated `TestClock`/`TestConsole` — a step that advances the simulated clock on a failed
attempt leaves that state in place for the next one. Every `Before`/`After`/`BeforeStep`/`AfterStep` hook on a
`@retry` Scenario re-runs on every attempt, not only the first. See
[ADR-EC-034](../../spec/decisions/034-retry-tag-wraps-flakytest-at-the-testapi-seam.md) and
[BEH-EC-026](../../spec/behaviors/14-scenario-retries.md) for the full detail and the measurements behind each claim.

**One prerequisite comes with tags, and it is not optional.** A tag must be DECLARED in your `vitest.config.ts`'s
`test.tags`, or the runner rejects the emission — and a `--tagsFilter` pattern is validated against that same list
regardless of the `strictTags` setting. This package catches the rejection, re-emits the test untagged and prints a
warning naming the `.feature` file, the Scenario and the tag, so the Scenario still runs; but its tags do not exist for
the runner, so no `--tagsFilter` can select it. `gherkinTags` is the supported way to keep that list correct:

```ts
import { gherkinTags } from "@effect-cucumber/vitest"
import { defineConfig } from "vitest/config"

export default defineConfig({
  test: { tags: gherkinTags("features/**/*.feature") }
})
```

`@skip` and `@only` are declared like any other tag the moment a `.feature` file carries them; add a hand-written
`{ name: "@skip" }` beside the spread only if you want to filter on a tag before any file uses it.

It takes a glob pattern (or an array of them) and has no default — it never scans a tree you did not name. Relative
patterns resolve against `process.cwd()` unless you pass `{ cwd }`; a config file should pass its own directory,
`gherkinTags("features/**/*.feature", { cwd: fileURLToPath(new URL(".", import.meta.url)) })`, so the declared list does
not change with the directory the runner was invoked from. It is why this package carries one non-workspace runtime dependency, `tinyglobby`: expanding a
glob synchronously at config-load time needs a library, since `fs.globSync` requires Node 22 and this package supports
Node 20.

**Editing a `.feature` file under `vitest --watch` needs one more line, and `gherkinWatchTriggers` is it.**
`loadFeature(path)` — the pattern every acceptance pair in this repository and this README use — reads a `.feature`
file with a plain `fs` call, which is invisible to Vite's module graph: without this plugin, editing one triggers no
rerun at all under a watching runner. `gherkinWatchTriggers` is a Vite plugin, exported alongside `gherkinTags`, that
appends a `.feature`-file trigger to Vitest's own `test.watchTriggerPatterns` config option so the edit is picked up
(ADR-EC-030, BEH-EC-022):

```ts
import { gherkinTags, gherkinWatchTriggers } from "@effect-cucumber/vitest"
import { fileURLToPath } from "node:url"
import { defineConfig } from "vitest/config"

const cwd = fileURLToPath(new URL(".", import.meta.url))
const featureGlob = "features/**/*.feature"

export default defineConfig({
  test: { tags: gherkinTags(featureGlob, { cwd }) },
  // The SAME glob gherkinTags already consumes — pass it again here rather than deriving one from
  // the other, so each call stays independently readable.
  plugins: [gherkinWatchTriggers(featureGlob, { cwd })]
})
```

Take the same argument `gherkinTags` does — a glob or an array of them, plus an optional `{ cwd }` — and has the same
no-default, throws-on-empty stance. **It must go in your ROOT `vitest.config.ts`, not a workspace project's own
config** — `watchTriggerPatterns` is not a per-workspace-project option, the same cost `gherkinTags`'s `test.tags`
already asks for. There is no per-file correlation to a specific `.steps.test.ts`: a `.feature` file can be loaded
from any test module under any name, and step definitions can be reused across Features (`defineSteps`,
ADR-EC-027), so there is no mapping this plugin could rely on in general. Instead, editing any `.feature` file your
glob matches reruns your WHOLE `test.include` set — conservative rather than surgical, and stated as a real
trade-off rather than hidden (ADR-EC-030's "Negative" section has the full reasoning and the alternatives it
rejected).

**A failing step's own pattern and its `.feature` file:line reach the failure panel, always on, no config.** A
failing step's own failure (or a thrown exception, which is the common shape — `assert.strictEqual` throws) gains a
`.cause` before it can propagate, and vitest's own DEFAULT reporter prints that recursively as a nested "Caused by:"
block directly under the assertion — no custom `Reporter`, no config to opt in (ADR-EC-033, BEH-EC-025):

```
FAIL apples.steps.test.ts > Adding apples > Adding apples the wrong way
AssertionError: expected 5 to equal 6
    ...
Caused by: StepFailureLocation: features/apples.feature:6: step "I should have {int} apples"
```

This is a different reach than `Effect.fn(stepText)`'s own tracing span below — that span exists whether the step
passes or fails and reaches a stack trace/OpenTelemetry export; this reaches the SAME block a reader of `vitest run`'s
own terminal output sees first, only on a failure.

## Observability recipe

Every step and hook already runs inside an `Effect.fn(stepText)` span (ADR-EC-005), and Gherkin parameter values are
reachable from inside a step body via `yield* Effect.annotateCurrentSpan("key", value)` — the current span at that
point is exactly the one `Effect.fn` created for that step, so no library change is needed to enrich it. Getting those
spans to a real backend is one Layer, not new code from this package: install `@effect/opentelemetry` (pinned to the
same rc line as `effect`) plus whichever OTel-JS exporter you want, and provide `NodeSdk.layer({ ... })` (or
`WebSdk.layer` in a browser target) alongside your own ambient Layer —

```ts
import { NodeSdk } from "@effect/opentelemetry"
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-http"
import { BatchSpanProcessor } from "@opentelemetry/sdk-trace-base"

const TracingLive = NodeSdk.layer({
  resource: { serviceName: "my-suite" },
  spanProcessor: new BatchSpanProcessor(new OTLPTraceExporter())
})

describeFeature(feature, Layer.merge(World.layer, TracingLive), ({ Then }) => {/* ... */})
```

— and every `Effect.fn(stepText)` span this package already produces exports for real. `NodeSdk.layer`'s
`Configuration` also takes a `metricReader` and a `logRecordProcessor`, built only when supplied, so a metrics-only or
logs-only setup is the same one-Layer shape. Trace-context propagation into a step's own outbound calls
(`effect/Tracer`'s `externalSpan`) is a property of what that step's Effect does, not something this package wires —
it composes unassisted once the exporter Layer above is in place.

**This package now runs its own spec.** The dogfooded acceptance suite is built: real `.feature` files under
[`test/acceptance/`](./test/acceptance), paired with `.steps.test.ts` modules, driven by the real `describeFeature`
and producing real passing `it.effect` tests as part of the ordinary `pnpm test`. The three worked examples from
`spec/behaviors/01`–`03` are among them, so the specification's examples are executed rather than merely read. All 22
v1 requirements carry a `@REQ-EC-NNN` acceptance tag.

**Two limitations are worth knowing before you rely on this package.** Editing a `.feature` file under a watching
runner does **not** trigger a rerun when the file was loaded by path, because a filesystem read is invisible to
Vite's module graph — the `?raw` import form does rerun. And a failing step's entry in the runner's failure panel
names the Scenario and the assertion, but neither the step text nor the `.feature` file and line — the step pattern
does reach a separate stdout block (`Effect.fn(pattern)`'s own span), which is not the same thing. See
[`spec/roadmap.md`](../../spec/roadmap.md) for what is built versus what is only specified — it remains the single
authority on build status.

## Recommended lint and compiler configuration for your step modules

**The claim this package makes.** A step whose Effect requires a service the ambient Layer does not provide is a
compile error where the step is written. That is
[INV-EC-003](../../spec/invariants.md#inv-ec-003-a-steps-effect-can-only-use-services-the-ambient-layer-provides), and
it is the package's whole reason to exist.

**The boundary on it.** The guarantee holds for step bodies free of `any`. A bare `any`, and an `Effect<any, any, any>`,
are assignable to everything — so a step body containing either compiles against **any** ambient Layer, including one
that provides none of the services the body reaches for. The requirement the step would otherwise declare is erased
before the check has anything to check, and what you get instead is a runtime "service not found" in a suite that
type-checks. No DSL signature can prevent that, because the erasure happens inside your own step body and not at the
boundary the invariant guards.

That is not a caveat better types could remove, so the remedy is configuration in your build rather than a change in
ours. Three settings, covering three different ways the escape hatch gets in:

```jsonc
// tsconfig.json — the IMPLICIT half: a binding TypeScript would otherwise infer
// as `any` because nothing annotated it. A step's pattern-hole parameters are
// NOT in this category — they are typed from the pattern — but a custom
// parameter type's hole and the trailing DataTable/DocString parameter are `any`
// unless you annotate them, and `noImplicitAny` does not see a contextually
// typed `any`, so annotate those two positions.
{
  "compilerOptions": {
    "noImplicitAny": true, // implied by "strict": true, which is what this repository runs
  },
}
```

```jsonc
// .oxlintrc.json — the EXPLICIT half: an `any` you wrote. This one rule flags a
// bare `any` annotation and each of the three in `Effect<any, any, any>`
// separately, and it needs nothing beyond the `typescript` plugin.
{
  "plugins": ["typescript"],
  "rules": {
    "typescript/no-explicit-any": "error",
  },
}
```

```jsonc
// .oxlintrc.json — the FLOW half: a value that is ALREADY `any` arriving from an
// untyped dependency, where your own source contains no `any` token for either
// setting above to see. This is Pitfall 6's "one dependency shipping
// Effect<any, any, any>" case.
//
// These are TYPE-AWARE rules. They require `options.typeAware` AND the separate
// `oxlint-tsgolint` package; without it oxlint reports
// "Failed to find tsgolint executable" and, if you enable the rules WITHOUT
// `--type-aware`, they are silently inert — measured against oxlint 1.80.0.
// Named here with that cost stated rather than recommended as if it were free.
{
  "options": { "typeAware": true },
  "rules": {
    "typescript/no-unsafe-assignment": "error",
    "typescript/no-unsafe-call": "error",
    "typescript/no-unsafe-member-access": "error",
    "typescript/no-unsafe-return": "error",
    "typescript/no-unsafe-argument": "error",
  },
}
```

Using ESLint rather than oxlint? The same rules are `@typescript-eslint/no-explicit-any` and
`@typescript-eslint/no-unsafe-*`.

**Why this is a recommendation and not an enforcement.** This package cannot see your build. There is no signature it
could ship that would close the hole, and no runtime check that could observe it — the whole failure mode is the
_absence_ of a diagnostic, so there is nothing to catch. The honest thing is to tell you where the guarantee ends and
which switch extends it.

**What this repository does about it, so the advice is not merely advice.** This library's own acceptance suite — the
code here that plays the consumer's part — is scanned by
[`scripts/verify-acceptance-no-any.sh`](../../scripts/verify-acceptance-no-any.sh) on every push, which fails naming
the file and the line. The compile-gate fixtures under [`test/tsgo-gate/`](./test/tsgo-gate) carry the same
prohibition, stated in [`scripts/verify-tsgo-gate.sh`](../../scripts/verify-tsgo-gate.sh)'s own failure message: do not
add `any` to a fixture to make it pass. Both exist because `pnpm build`, `pnpm typecheck:test`, `pnpm test` and
`pnpm lint` were all measured GREEN against an acceptance step body with one `any` substituted into it — no oxlint rule
enabled in this repository objects to the escape-hatch type, which is exactly why the rules above are worth turning on
in yours. See [`test/acceptance/README.md`](./test/acceptance/README.md) § "Zero `any`".

**A second, unrelated escape hatch has the same shape: a closure variable standing in for the `Ref` INV-EC-006
requires.** [`spec/decisions/009-cross-step-state-lives-in-a-ref.md`](../../spec/decisions/009-cross-step-state-lives-in-a-ref.md)
requires every value one step hands a later step in the same Scenario to live in a `Ref` obtained from a
Layer-provided service — never a `let`/`var` closed over by the `Scenario`/`Rule`/`Background` callback, and never a
module-scope array or object a step mutates in place as a stand-in for one. Nothing in the type system rejects a
closure variable — a step body threading state through one type-checks and, worse, PASSES on a clean single run; it
only leaks across a retry, a re-run, or a `-t`-narrowed selection, which is exactly the failure mode `pnpm test`
alone cannot catch (the same "absence of a diagnostic" shape as the `any` boundary above). This library's own
acceptance suite is scanned for it by
[`scripts/verify-acceptance-ref-state.sh`](../../scripts/verify-acceptance-ref-state.sh) — hardcoded to this
repository's own paths and carve-out count, so it does not travel — and
[`scripts/templates/verify-consumer-ref-state.sh`](../../scripts/templates/verify-consumer-ref-state.sh) is the same
script generalized into a template you copy into your own repository: the glob selecting your step modules and the
number of `GATE-ALLOW-MUTATION` carve-outs your tree currently has are arguments instead of constants, and the
positive control proving the regex still matches a real declaration is a synthetic fixture generated on the fly
rather than a path into this repository's own source, so the copy needs nothing about your module layout to run:

```sh
# Wire this into your own CI. features/steps and the pattern below are examples — point them at
# wherever your own *.steps.test.ts (or equivalent) files live; 0 is the carve-out count to start
# with if you have none yet.
scripts/verify-ref-state.sh features/steps '*.steps.test.ts' 0
```

There is deliberately no DSL-level enforcement of this one either, for the identical reason the `any` boundary above
has none: the failure mode is a closure the type system accepts, not a value the runtime can observe and reject.

## Testing helpers

Two small, standalone helpers, exported as the `Testing` namespace — called directly inside a
step's `Effect.gen` body, never through the DSL. Both are grounded in real duplication found in a
downstream consumer's own acceptance suite; see
[ADR-EC-028](../../spec/decisions/028-testing-failuretag-fails-the-assertion.md) and
[ADR-EC-029](../../spec/decisions/029-settlethroughclock-parameterized-fork-adjust-join.md) for the
full evidence and the rejected alternatives.

**`Testing.failureTag(exit)` narrows a failed `Exit`'s typed tag, or fails the assertion itself.**
It replaces the hand-rolled `fault instanceof Error && "_tag" in fault ? String(fault._tag) :
"Unknown"` ternary a consumer otherwise writes against `Cause.squash(exit.cause)` — a pattern that
silently degrades a defect, an interruption, an untagged error, or an unexpected success to the same
opaque `"Unknown"` string. `Testing.failureTag` is a plain synchronous function — call it directly,
the same way `@effect/vitest`'s own `assert.*` is already called inside a step body, never
`yield*`'d — and it fails loudly, naming the actual value, on anything that isn't a failed `Exit`
whose squashed value carries a string `_tag`:

```ts
import { Testing } from "@effect-cucumber/vitest"
import { assert } from "@effect/vitest"
import * as Effect from "effect/Effect"

// Inside a step body (a bare generator, or one already wrapped with Effect.fn):
function*() {
  const exit = yield* Effect.exit(someEffectThatMightFail)
  const tag = Testing.failureTag(exit) // "RateLimited", or the assertion fails naming the actual value
  assert.strictEqual(tag, "RateLimited")
}
```

**`Testing.settleThroughClock(effect, options?)` forks an Effect, advances the ambient `TestClock`
until it settles, and joins it.** It replaces a fork/`TestClock.adjust`/poll/join helper found
duplicated byte-for-byte across three files in the same downstream consumer, differing only in the
adjust interval — which is exactly why `step` stays a caller parameter here rather than a hardcoded
constant. `options.step` defaults to `"1 second"`, `options.maxSteps` to `12` (both grounded in the
real call sites — see ADR-EC-029). If the forked Effect has not settled after `maxSteps` advances,
`settleThroughClock` interrupts it and dies naming the bound tried, instead of hanging on `Fiber.join`
indefinitely the way the duplicated helper it replaces would have:

```ts
import { describeFeature, loadFeature, Testing } from "@effect-cucumber/vitest"
import { assert } from "@effect/vitest"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import { fileURLToPath } from "node:url"

const feature = await loadFeature(fileURLToPath(new URL("./retries.feature", import.meta.url)))

// A retry-with-backoff that needs real simulated time to resolve — three sleeps, in this example.
const flakyCallWithBackoff = Effect.gen(function*() {
  yield* Effect.sleep("1 minute")
  yield* Effect.sleep("1 minute")
  yield* Effect.sleep("1 minute")
  return "ok"
})

describeFeature(feature, Layer.empty, ({ When }) => {
  When("the flaky call eventually succeeds after retrying with backoff", function*() {
    const result = yield* Testing.settleThroughClock(flakyCallWithBackoff, {
      step: "1 minute",
      maxSteps: 12
    })
    assert.strictEqual(result, "ok")
  })
})
```

## Migrating from cucumber-js

This section is about the TRANSLATION from cucumber-js's shapes to this library's — the DSL
mechanics themselves (`Rule`, `Background`, the six hooks, `perScenario`/`shared`) are documented
above and not repeated here. Grounded in a real migration feasibility assessment of a downstream
consumer's own cucumber-js suite (dozens of `.feature` files, hundreds of step definitions, no
`Scenario Outline`, no `Rule:`, no custom parameter types, data tables in a couple of files): the
Gherkin surface itself almost always ports cleanly, because both tools parse the same `.feature`
grammar through the same family of official Cucumber packages. **The real cost lives in one place —
how cross-step state is modeled — plus a smaller, structural cost in how tag-scoped hooks are
registered.** Both are covered below, in that order, followed by data tables (a non-issue) and an
honest inventory of what does and doesn't have a mechanical 1:1 mapping.

### 1. The `World` class → a Layer

cucumber-js hands every Scenario a fresh instance of your `World` subclass and binds it to `this` in
every step and hook; a step reads and writes plain mutable fields on it directly. Nothing about that
instance is an `Effect` — so a step whose own logic needs to run as one has no ambient Effect context
to compose into. It bridges out and back in by hand: build (or reuse) a `Layer`/runtime, run the
Effect synchronously, and unpack the `Exit` into more mutable fields. That bridge is rebuilt, and paid
for, on every step that needs it, because nothing carries an Effect fiber across step boundaries.

In this library, a Scenario's steps are already `yield*`s inside one `Effect.gen` (this repository's
own "Fail-fast is structural, not bookkept" design philosophy — see
[`spec/overview.md`](../../spec/overview.md)). There is no `World` the framework constructs and binds
to `this` — "the World" is an ordinary `Context.Service` your own Layer provides, exactly like any
other dependency, and a step reads it with `yield* World`. A step's own Effect-shaped logic (a
discount calculation, an API call, anything) is just another Effect the SAME `Effect.gen` composes
directly — nothing to bridge, because the step and the logic are already running in the same place.

BEFORE — a small, realistic cucumber-js `World` subclass, its manual `reset()` invoked from a
tag-free `Before` hook, and a step that bridges into Effect-land per call:

```ts
import { Before, Given, setWorldConstructor, Then, When, World } from "@cucumber/cucumber"
import * as Effect from "effect/Effect"
import * as Schema from "effect/Schema"
import assert from "node:assert"

class DiscountError extends Schema.TaggedError<DiscountError>()("DiscountError", {
  code: Schema.String
}) {}

const applyDiscount = (code: string, subtotal: number): Effect.Effect<number, DiscountError> =>
  code === "SAVE10" ? Effect.succeed(subtotal * 0.9) : Effect.fail(new DiscountError({ code }))

class CheckoutWorld extends World {
  cartTotal = 0
  lastError: string | undefined = undefined

  reset(): void {
    this.cartTotal = 0
    this.lastError = undefined
  }
}

setWorldConstructor(CheckoutWorld)

Before(function(this: CheckoutWorld) {
  this.reset()
})

Given("an empty cart", function(this: CheckoutWorld) {
  this.cartTotal = 0
})

When("I add an item priced at {float}", function(this: CheckoutWorld, price: number) {
  this.cartTotal += price
})

When("I apply the discount code {string}", function(this: CheckoutWorld, code: string) {
  // The bridge into Effect-land, rebuilt on every step: nothing here is `yield*`-composable with
  // the step before or after it, so every step that needs Effect pays this synchronous round trip.
  const exit = Effect.runSyncExit(applyDiscount(code, this.cartTotal))
  if (exit._tag === "Success") {
    this.cartTotal = exit.value
  } else {
    this.lastError = code
  }
})

Then("the cart total is {float}", function(this: CheckoutWorld, expected: number) {
  assert.strictEqual(this.cartTotal, expected)
})
```

AFTER — the same state as a `Context.Service`, provided as this library's default (per-Scenario)
Layer through `describeFeature`'s second argument, with no bridge and no manual reset:

```ts
import { describeFeature, loadFeature } from "@effect-cucumber/vitest"
import { assert } from "@effect/vitest"
import * as Context from "effect/Context"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as Ref from "effect/Ref"
import * as Schema from "effect/Schema"
import { fileURLToPath } from "node:url"

const feature = await loadFeature(fileURLToPath(new URL("./checkout.feature", import.meta.url)))

class DiscountError extends Schema.TaggedError<DiscountError>()("DiscountError", {
  code: Schema.String
}) {}

const applyDiscount = (code: string, subtotal: number): Effect.Effect<number, DiscountError> =>
  code === "SAVE10" ? Effect.succeed(subtotal * 0.9) : Effect.fail(new DiscountError({ code }))

// Every mutable `World` field becomes a `Ref` field on a `Context.Service`, per
// spec/decisions/009-cross-step-state-lives-in-a-ref.md — never a closure variable.
class World extends Context.Service<World, {
  readonly cartTotal: Ref.Ref<number>
  readonly lastError: Ref.Ref<string | undefined>
}>()("World") {
  static readonly layer = Layer.effect(
    this,
    Effect.gen(function*() {
      return World.of({
        cartTotal: yield* Ref.make(0),
        lastError: yield* Ref.make<string | undefined>(undefined)
      })
    })
  )
}

// `World.layer` passed directly as the plain-Layer (per-Scenario) form: rebuilt fresh for every
// Scenario, which is what cucumber-js's own per-Scenario `World` instance already gave you — so
// there is no hook left to write just to reset it. A hand-rolled `reset()` invoked from `Before`
// has no equivalent to port because there is nothing left for it to do.
describeFeature(feature, World.layer, ({ Given, Then, When }) => {
  Given("an empty cart", function*() {
    yield* Ref.set((yield* World).cartTotal, 0)
  })

  When("I add an item priced at {float}", function*(price: number) {
    yield* Ref.update((yield* World).cartTotal, (total) => total + price)
  })

  When("I apply the discount code {string}", function*(code: string) {
    // The SAME `applyDiscount` Effect as the "before" side — but `yield*`'d directly into this
    // step's own `Effect.gen`, not run synchronously and unpacked. No `Exit`, no bridge.
    const { cartTotal, lastError } = yield* World
    const subtotal = yield* Ref.get(cartTotal)
    yield* applyDiscount(code, subtotal).pipe(
      Effect.tap((discounted) => Ref.set(cartTotal, discounted)),
      Effect.catchTag("DiscountError", (error) => Ref.set(lastError, error.code))
    )
  })

  Then("the cart total is {float}", function*(expected: number) {
    assert.strictEqual(yield* Ref.get((yield* World).cartTotal), expected)
  })
})
```

Two mechanical translations worth naming directly: a mutable field becomes a `Ref` field (never a
bare `let`/`var`, [ADR-EC-009](../../spec/decisions/009-cross-step-state-lives-in-a-ref.md)), and a
`World` method that built a Layer and called `Effect.runSync`/`Effect.runSyncExit` becomes an
ordinary Effect the step `yield*`s — the "build a Layer per call" part disappears entirely, since the
ambient Layer is already built once per Scenario by `describeFeature` itself. If your `World` has
state that must genuinely survive across every Scenario in one Feature (not the common case — most
`World` fields are reset every Scenario, matching this library's per-Scenario default), that state
moves into the `shared` half of `{ shared, perScenario }` instead of `perScenario`, per the Layer
scopes documented above — not into a bigger `World`.

### 2. Tag-scoped `Before` hooks → per-Feature (or per-Rule) `Before`

cucumber-js's `Before({ tags: "@admin" }, fn)` registers `fn` once, globally, and the framework
decides at RUN time — per Scenario, by evaluating the tag expression — whether to run it. This
library has no equivalent registration, because it has no global hook registry to filter: `Before` is
always called from inside one `describeFeature` (or `Rule`) call, which already scopes it to that
Feature's (or Rule's) Scenarios syntactically. The filtering a tag did at run time becomes a placement
decision at registration time.

**When a tag corresponds 1:1 to one Feature file** — the common case — move the hook body into that
Feature's own `Before`:

```ts
import { describeFeature, loadFeature } from "@effect-cucumber/vitest"
import * as Context from "effect/Context"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as Ref from "effect/Ref"
import { fileURLToPath } from "node:url"

const feature = await loadFeature(fileURLToPath(new URL("./admin-panel.feature", import.meta.url)))

class Session extends Context.Service<Session, { readonly loggedInAs: Ref.Ref<string | undefined> }>()("Session") {
  static readonly layer = Layer.effect(
    this,
    Effect.gen(function*() {
      return Session.of({ loggedInAs: yield* Ref.make<string | undefined>(undefined) })
    })
  )
}

describeFeature(feature, Session.layer, ({ Before, Given }) => {
  // Replaces cucumber-js's globally registered `Before({ tags: "@admin" }, ...)`: this Feature file
  // IS the `@admin` tag's scope, so the hook is registered here instead of filtered at runtime.
  Before(function*() {
    yield* Ref.set((yield* Session).loggedInAs, "admin@example.com")
  })

  Given("I am on the admin dashboard", function*() {
    yield* Effect.void
  })
})
```

**When a tag scopes only a subset of one Feature's Scenarios**, and that subset is already grouped
under a Gherkin `Rule:`, put the hook in that `Rule`'s own `Before` instead — a Rule-scoped `Before`
runs only for its Rule's Scenarios and composes with the Feature's own (outer setup before inner, per
the ordering already documented above), which is exactly the partial scoping a tag gave you.

**When neither applies** — the tag cuts across Scenarios in more than one Feature file, or across a
subset of one Feature's Scenarios that isn't `Rule:`-shaped — there is no structural equivalent to
reach for. The honest options are to regroup those Scenarios under a `Rule:` (turning the tag boundary
into a real Gherkin boundary), or to fold the conditional logic the hook was doing into the step
bodies that need it. There is no tag-filtered hook registry in this library to lean on instead.

### 3. Data tables

This is not a real migration cost. A Gherkin data table under a step is the same table either way —
cucumber-js hands it to your step as a raw array-of-arrays your own code decodes by hand; this
library's `decodeHashes(schema)(table)` does the same decode through `Schema`, typed, with the
`DataTable` type already carrying `raw`/`hashes` for the untyped case. See the `Background`'s cart
table in [`worked-example-03-discounts.steps.test.ts`](./test/acceptance/worked-example-03-discounts.steps.test.ts)
or [BEH-EC-016](../../spec/behaviors/06-datatable-and-docstring-arguments.md) — nothing about the
`.feature` file itself changes.

### 4. What does and doesn't have a mechanical 1:1 mapping

**Clean port, mechanical:**

- A `.feature` file's Gherkin text, unchanged — both tools parse the same grammar through the same
  family of official `@cucumber/*` packages.
- Simple `Given`/`When`/`Then` steps with no custom parameter type: the step's PATTERN copies over
  verbatim (`{int}`, `{string}`, `{float}` come from the identical `@cucumber/cucumber-expressions`
  engine); only the body's signature changes, from a callback/promise taking `this` to a generator
  function returning an `Effect`.
- Data tables (§3 above) and `DocString` arguments — decode mechanism changes, the `.feature` file
  does not.

**Real rework, not mechanical:**

- The `World` class → Layer/`Context.Service` migration (§1). This is a state-management rewrite —
  deciding what's per-Scenario versus Feature-shared state, moving every field into a `Ref`, and
  removing the per-step Effect bridge — not a syntax swap. It is the highest-leverage piece of a
  migration precisely because it is the only piece with real cost.
- Tag-scoped global hooks whose tag doesn't align with a Feature or a `Rule:` boundary (§2's third
  case) — there is no registration this library offers that reproduces run-time, cross-file tag
  filtering; the Gherkin structure has to change to make the scope structural.

**New capability cucumber-js never had, not merely a port:** compile-time Layer-completeness checking
— [INV-EC-003](../../spec/invariants.md#inv-ec-003-a-steps-effect-can-only-use-services-the-ambient-layer-provides),
this package's whole reason to exist per [`spec/overview.md`](../../spec/overview.md#design-philosophy).
A step whose Effect requires a service the ambient Layer doesn't provide is a compile error where the
step is written, by name — not a `World` field that's `undefined` at run time because some other
Feature's setup never ran, discovered only when that Scenario executes. A migrated `World` that
becomes a fully-typed `Context.Service` gets this guarantee for every step that reads it, which is not
something the cucumber-js suite being migrated away from could offer at any point in its life. The
simulated `TestClock` and captured `TestConsole` every Scenario already gets for free (documented
above) are the same kind of gain: capability the migration adds, not merely preserves.

## Install

```sh
pnpm add -D @effect-cucumber/vitest effect@rc @effect/vitest@rc @effect/platform-node@rc vitest
```

> **The `@rc` tags are required.** npm's `latest` tag for `effect` still points at the v3 line (`3.22.x`); `4.0.0` has
> no stable release yet. Installing without `@rc` gets you Effect v3 and a wall of type errors against a v4-only
> library. The same applies to `@effect/vitest` and `@effect/platform-node`, whose `latest` tags are also on the v3 line.

## Requirements

Requires Effect v4 (`4.0.0-rc.112` or newer) and vitest `>=4.1.0 <5.0.0`. Node `>=20`.

`effect`, `@effect/vitest`, `@effect/platform-node` and `vitest` are peer dependencies — you install them, this package
does not bundle its own copies. `@effect/platform-node` is what `loadFeature` reads the `.feature` file through.
