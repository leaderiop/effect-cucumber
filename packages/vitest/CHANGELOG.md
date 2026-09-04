# @effect-cucumber/vitest

## 0.3.0

### Minor Changes

- 9a1eb6d: `BeforeAllScenarios` now runs through a real vitest `beforeAll`, registered once at the Feature block
  level ahead of every Scenario and every nested Rule, instead of a hand-rolled once-cell reached from
  inside whichever Scenario's own body got there first. This fixes a real bug: under concurrent
  scheduling (`sequence.concurrent: true`, or your own `describe.concurrent`), a short-`testTimeout`
  Scenario racing the same in-flight setup as a long-`testTimeout` one could time out and
  cascade-interrupt the other, even though the other's own budget was never at risk. Concurrent
  Scenario execution is now supported — opt in the ordinary vitest way, no new option needed —
  and every BEH-EC-017 guarantee (BeforeAllScenarios running exactly once, its failure reported by
  every Scenario individually, never masked) holds unchanged under it.
  
  Add a `@timeout-<positive integer milliseconds>` Scenario tag (e.g. `@timeout-5000`), giving one
  Scenario its own real `it.effect` timeout independent of the Feature's own `testTimeout` — the thing
  that actually makes concurrent execution worth turning on, since without it every Scenario in a
  concurrently-scheduled Feature still shares one budget:
  
  ```gherkin
  Feature: Checkout
  
    @timeout-500
    Scenario: a fast-budget Scenario
      ...
  
    @timeout-10000
    Scenario: a Scenario that legitimately needs a larger real timeout
      ...
  ```
  
  Most specific declaration wins when the tag appears at more than one level (Feature, Rule, Scenario,
  an Outline's Examples row), the same inheritance order every other tag already follows. A malformed
  occurrence is a loud, located `Error` at registration time.
  
  See [ADR-EC-040](../spec/decisions/040-beforeallscenarios-real-beforeall-captured-exit-and-timeout-suffix-tag.md)
  and [BEH-EC-032](../spec/behaviors/19-concurrent-execution-and-scenario-timeout.md), and
  `packages/vitest/README.md`'s hook-guarantees section for the full detail.

## 0.2.0

### Minor Changes

- 957f0f8: Add `attach(contentType, data)` — a `World.attach()` equivalent, exported alongside the DSL.
  Attach evidence from a step or a per-Scenario hook, and see it rendered directly under that
  Scenario's real failure panel in vitest's own DEFAULT reporter — no custom `Reporter` needed:
  
  ```ts
  import { attach, describeFeature } from "@effect-cucumber/vitest"
  
  describeFeature(feature, World.layer, ({ Then }) => {
    Then("the order total is {int}", function*(expected: number) {
      const { total } = yield* World
      yield* attach("text/plain", `computed total: ${total}`)
      yield* Effect.sync(() => assert.strictEqual(total, expected))
    })
  })
  ```
  
  `attach` is reachable from `Given`/`When`/`Then`/`And`/`But`, and from
  `Before`/`After`/`BeforeStep`/`AfterStep` (Feature-level or Rule-level, tagged or unconditional) —
  every body kind that runs inside the Scenario's own `it.effect`. It is a COMPILE error inside
  `BeforeAllScenarios`/`AfterAllScenarios`, never a silent no-op: neither hook runs inside a
  Scenario's own `it.effect`, so there is no live `vitest.TestContext` to attach against.
  
  A `@retry`'d Scenario's attachments accumulate across every attempt rather than resetting — the
  evidence a failed first attempt left behind is still visible after a passing later one, consistent
  with the ambient `TestClock`/`TestConsole` already not resetting between `@retry` attempts.
  
  See [ADR-EC-036](../spec/decisions/036-attachments-a-world-shaped-service-crossing-the-testapi-seam-in-vitesttestapi.md)
  and [BEH-EC-028](../spec/behaviors/15-attachments.md).
- c2558d3: Every Scenario now records two `Effect.Metric`s the moment it completes — `effect_cucumber.scenario.duration`
  (a duration histogram) and `effect_cucumber.scenario.result` (a counter, tagged `outcome: "pass" | "fail"`).
  Always-on, no opt-out, no Gherkin tag and no `describeFeature` argument — consistent with `Effect.fn` tracing
  spans already being always-on.
  
  A Scenario tagged `@retry` contributes exactly ONE increment and ONE duration sample, for its final attempt
  only — never one per attempt. An intermediate attempt that fails before a later one passes is never separately
  counted as `outcome: "fail"`.
  
  Getting both metrics to a real backend is one line added to the `NodeSdk.layer` the README's Observability
  recipe already shows for trace spans — its `Configuration` already accepts a `metricReader`:
  
  ```ts
  import { NodeSdk } from "@effect/opentelemetry"
  import { OTLPMetricExporter } from "@opentelemetry/exporter-metrics-otlp-http"
  import { PeriodicExportingMetricReader } from "@opentelemetry/sdk-metrics"
  
  const TelemetryLive = NodeSdk.layer({
    resource: { serviceName: "my-suite" },
    metricReader: new PeriodicExportingMetricReader({ exporter: new OTLPMetricExporter() })
  })
  ```
  
  One caveat: every Scenario runs under the ambient SIMULATED `TestClock`, so `scenario.duration` reads ~0ms
  unless a step itself calls `TestClock.adjust(...)` — a real limitation of running under a simulated clock, not
  a bug. The simulated clock is also not reset between a `@retry` Scenario's own attempts, so a retried Scenario's
  one recorded sample reflects cumulative simulated time across every attempt.
  
  See [ADR-EC-037](../spec/decisions/037-effect-metric-wraps-outside-flakytest-in-vitesttestapi.md) and
  [BEH-EC-029](../spec/behaviors/16-scenario-metrics.md).
- 518d65b: Add `gherkinWatchTriggers(pattern, options?)`, a Vite plugin exported beside `gherkinTags`.
  
  Editing a `.feature` file loaded through `loadFeature(path)` (a plain `fs` read, invisible to Vite's
  module graph) currently triggers no rerun at all under `vitest --watch`. `gherkinWatchTriggers`
  appends a `.feature`-file trigger to Vitest's own `test.watchTriggerPatterns` config option, so the
  edit is picked up:
  
  ```ts
  import { gherkinTags, gherkinWatchTriggers } from "@effect-cucumber/vitest"
  import { defineConfig } from "vitest/config"
  
  const featureGlob = "features/**/*.feature"
  
  export default defineConfig({
    test: { tags: gherkinTags(featureGlob) },
    plugins: [gherkinWatchTriggers(featureGlob)]
  })
  ```
  
  Must go in the consumer's ROOT `vitest.config.ts` — `watchTriggerPatterns` is not a
  per-workspace-project option, the same cost `gherkinTags`'s `test.tags` already asks for. No static
  `.feature`-to-test-file mapping exists in general (a `.feature` can be loaded from any test module
  under any name, and step definitions can be reused across Features via `defineSteps`), so editing any
  tracked `.feature` file reruns the consumer's whole `test.include` set rather than a single file —
  conservative rather than surgical, and stated as a deliberate trade-off.
  
  See [ADR-EC-030](../spec/decisions/030-gherkinwatchtriggers-plugin-reruns-the-whole-test-include-set.md).
- 428255b: Add `scripts/templates/verify-consumer-ref-state.sh` (LINT-01): a copyable, generalized version of
  this repository's own `scripts/verify-acceptance-ref-state.sh` for a consumer's own step modules.
  
  Enforces the same rule ADR-EC-009/INV-EC-006 require of this repository's own acceptance suite: a
  value one step hands a later step in the same Scenario must live in a `Ref` obtained from a
  Layer-provided service, never a `let`/`var` closure variable or a module-scope array/object mutated
  in place as a stand-in for one. `pnpm test` cannot catch a violation — it passes on a clean single
  run and only leaks across a retry, a re-run, or a narrowed `-t` selection.
  
  The step-modules directory/glob and the number of `GATE-ALLOW-MUTATION` carve-outs are CLI
  arguments (or env vars) instead of hardcoded constants, and the positive control proving the regex
  still matches a real declaration is a synthetic fixture generated on the fly rather than a path into
  this repository's own source — the copy needs nothing about a consumer's module layout to run.
  Documented in `packages/vitest/README.md`'s "Recommended lint and compiler configuration" section.
- 96cbf93: Add `ExamplesRow`/`decodeExamplesRow`/`ExamplesRowError` (`@effect-cucumber/gherkin`, re-exported
  from `@effect-cucumber/vitest`): a Scenario Outline column no step's cucumber-expression pattern
  references now still reaches a step body, typed through `Schema`.
  
  `ParsedScenario.exampleRow` (`Option.none()` for a plain Scenario, `Option.some(ExamplesRow)` for an
  Outline row) carries the row's raw `header`/`values`/`raw` record. `StepParams<P>`'s existing
  trailing tail (already used for DataTable/DocString) now also carries this Scenario's `ExamplesRow`
  for every step of an Outline row:
  
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
  
  `decodeExamplesRow(rowSchema)(row)` decodes `row.raw` through a caller-supplied `Schema`, the same
  mechanism `decodeHashes` already gives a DataTable (ADR-EC-008) — no `Schema` is declared anywhere
  ahead of a step body that wants one, not on `describeFeature`, not on `loadFeature`. A step that does
  not annotate a trailing parameter is unaffected: the tail was already unchecked.
  
  `OutlineTitle.ts` was rewritten in the same change to read `exampleRow` instead of independently
  re-walking the `GherkinDocument` a second time for its own `(col=value, ...)` title suffix — an
  internal simplification, no observable change to emitted titles.
  
  See [ADR-EC-032](../spec/decisions/032-outline-examplesrow-carries-the-raw-row-decoded-on-demand-not-a-per-feature-schema.md).
- 16c39c3: Every emitted Scenario's ambient `effect/Random` is now seeded deterministically, with zero consumer
  wiring — the same "ambient by default" treatment `TestClock`/`TestConsole` already get. A step
  reaching for `Random.next`, `Random.nextIntBetween`, `Random.shuffle`, etc. gets the same value on
  every run, and two Scenario Outline rows always draw independent sequences (derived from the
  Feature's own uri plus the Scenario's fully emitted title, which `OutlineTitle.ts` already
  disambiguates per Outline row).
  
  Implemented as a `Random.withSeed` wrap around every emitted Scenario's composed Effect in
  `Runner.ts` — a combinator over an `Effect`, not a `Layer`, since `effect@4.0.0-rc.112`'s
  `Random.withSeed` has no `Layer` form. Composes outside the per-Scenario Layer `buildScenarioEffect`
  already provides, so a consumer's own Layer providing its own `Random` implementation still wins for
  any step inside it.
  
  See [ADR-EC-031](../spec/decisions/031-random-withseed-wraps-the-scenario-effect-not-a-layer.md) and
  [BEH-EC-023](../spec/behaviors/11-scenario-seeding.md).
- 0fe9eaf: Add `rerunFailedOnly`/`rerunManifestPath` to `describeFeature`'s optional fourth argument — filter
  Scenario registration to only the Scenarios a prior run's manifest names as failed:
  
  ```ts
  describeFeature(feature, Layer.empty, ({ Given, Then, When }) => {
    // ...steps...
  }, {
    rerunFailedOnly: true,
    rerunManifestPath: ".effect-cucumber/rerun-manifest.json" // the default; usually omitted
  })
  ```
  
  Each Scenario's rerun key is a `(uri, ruleName, title)` triple, stable ACROSS separate
  `loadFeature()` calls — unlike this library's own internal `ScenarioKey.ts` key, whose `ruleId`
  comes from a fresh `IdGenerator.uuid()` on every parse. The write side — converting a
  `vitest run --reporter=json` report into a manifest — ships as a copy-paste template,
  `scripts/templates/write-rerun-manifest.mjs`, that you wire into your own CI.
  
  A manifest key that matches no Scenario in the current `.feature` file (renamed, removed, or from a
  different revision) warns once and is ignored; a Feature or Rule the filter leaves with zero
  Scenarios gets one synthetic skipped node in place of the empty block, instead of tripping vitest's
  own "No test found in suite" crash.
  
  See [ADR-EC-038](../spec/decisions/038-rerun-failed-only-uri-scoped-key-stamped-via-task-meta-not-a-reporter.md)
  and [BEH-EC-030](../spec/behaviors/17-rerun-failed-only.md), and `packages/vitest/README.md`'s
  "Rerun failed Scenarios only" section.
- fd158b2: Add a fourth `Rule` arity — `Rule(name, extraLayer, narrow, define)` — that narrows or REPLACES
  (not only extends) the World a Rule's own Scenarios see, and export `narrowRuleDsl` as the
  sanctioned way to build the `narrow` callback's return value:
  
  ```ts
  import { describeFeature, narrowRuleDsl } from "@effect-cucumber/vitest"
  
  describeFeature(feature, AuditContext.layer, ({ Rule }) => {
    Rule(
      "Remediation",
      RemediationService.layer,
      (wideDsl) => narrowRuleDsl(wideDsl, project), // project: WorldProjection<Wide, Narrow>
      (dsl) => {
        dsl.Given("the audit produces a remediation report", function*() {
          // Only RemediationWorld is reachable here — not AuditContext, not a sibling Rule's world.
          yield* (yield* RemediationWorld).report
        })
      }
    )
  })
  ```
  
  `project` is a real function, backed by `Effect.updateContext`, that reshapes the Rule's actual
  ambient context — hand-written per Rule, the one real ongoing cost of this feature, not
  auto-derived. In exchange, a step inside a narrowed Rule cannot reach a sibling Rule's narrowed
  World or the Feature's own ambient service, rejected by name (`effect(missingEffectContext)`) —
  the one case the existing three-argument form's `RuleDsl<ROut | R2>` union cannot express, since
  `|` only ever grows what a step may reach for.
  
  The existing two- and three-argument `Rule` forms are unchanged. A Scenario's own extra Layer
  cannot be nested inside a narrowed Rule — unsupported, and fails loudly with an `Error` at
  registration time rather than silently mis-narrowing.
  
  See [ADR-EC-039](../spec/decisions/039-rule-world-narrowing-via-effect-updatecontext-in-narrowruledsl.md)
  and [BEH-EC-031](../spec/behaviors/18-rule-world-narrowing.md), and `packages/vitest/README.md`'s
  "A `Rule` can narrow or replace the ambient World" section.
- 3f84ac8: Add `@retry`: a Gherkin tag that wraps a Scenario in `@effect/vitest`'s own `flakyTest`, fixed at its
  own defaults — up to 10 attempts (`Schedule.recurs(10)`), bounded by a 30-second wall-clock cap. No
  numeric parameter, the same convention `@skip`/`@only` already carry.
  
  ```gherkin
  @retry
  Scenario: A call that occasionally times out still gets asserted on
    When I call the flaky endpoint
    Then the response is recorded
  ```
  
  A Scenario that fails on an early attempt and passes on a later one is reported PASSING, not
  flaky-and-red. The per-Scenario Layer rebuilds fresh for EVERY attempt — the existing "fresh every
  Scenario" guarantee, extended to "fresh every attempt" — and a `shared` Layer beside it in the same
  Feature still builds exactly once, unaffected by any Scenario next to it retrying.
  
  Two things `@retry` does NOT reset between attempts: `BeforeAllScenarios`'s once-cell (already
  documented as never retried, so `@retry` cannot rescue a failed setup) and the ambient simulated
  `TestClock`/`TestConsole` — a step that advances the simulated clock on a failed attempt leaves that
  state in place for the next one. Every `Before`/`After`/`BeforeStep`/`AfterStep` hook re-runs on every
  attempt, not only the first.
  
  See [ADR-EC-034](../spec/decisions/034-retry-tag-wraps-flakytest-at-the-testapi-seam.md) and
  [BEH-EC-026](../spec/behaviors/14-scenario-retries.md).
- 2afcfef: Add tag-expression-scoped hooks: `Before`, `After`, `BeforeStep` and `AfterStep` accept an
  additional, additive second call form — a leading tag-expression string, ahead of the body —
  narrowing that hook to only the Scenarios whose own tags satisfy it. Parsed and evaluated by the
  SAME grammar and engine vitest's own `--tagsFilter` uses (`and`/`or`/`not`/`&&`/`||`/`!`/parens),
  via its exported `createTagsFilter` — no new dependency's grammar to learn, and confirmed NOT
  `@cucumber/tag-expressions`, which remains absent from this repository's dependency tree entirely.
  
  ```ts
  describeFeature(feature, World.layer, ({ Before, Scenario }) => {
    // Runs for every Scenario in this Feature, exactly as Before(fn) always has.
    Before(function*() {
      yield* Effect.void
    })
  
    // Runs ONLY for a Scenario whose own tags satisfy this expression.
    Before("@db and not @slow", function*() {
      yield* Ref.set((yield* Session).usesDatabase, true)
    })
  })
  ```
  
  `Before(fn)` keeps working exactly as it does today — the tag-expression form is additive, never a
  replacement — and composes with existing Rule/Feature hook scoping: a Rule-scoped `Before("@db",
  fn)` narrows to that Rule's Scenarios AND further narrows to only the `@db`-tagged ones among them.
  `BeforeAllScenarios`/`AfterAllScenarios` do NOT accept a tag expression — passing one is a compile
  error by arity, since a once-per-Feature hook has no single Scenario's tags to check against when
  it actually runs.
  
  Every tag literal a hook's own expression names must already be declared somewhere in that
  Feature — the same "declared tag universe" rule `includeTags`/`excludeTags` already require,
  extended to this second call site — or `describeFeature` throws a located `HookTagExpressionError`
  naming the offending hook and its `.feature` file at registration time.
  
  See [ADR-EC-035](../spec/decisions/035-tag-expression-scoped-hooks-reuse-vitests-createtagsfilter.md)
  and [BEH-EC-027](../spec/behaviors/07-hook-ordering-and-guarantees.md).
- 53679af: Add `Testing.failureTag` and `Testing.settleThroughClock`, exported as a new `Testing` namespace.
  
  `Testing.failureTag(exit)` narrows a failed `Exit`'s typed error to its `_tag`, or fails the current
  assertion itself — naming the actual value — on anything that isn't a tagged failure (a success, a
  defect, an interruption, or an untagged error). It replaces a hand-rolled `fault instanceof Error &&
  "_tag" in fault ? String(fault._tag) : "Unknown"` pattern that silently degrades all of those cases
  to the same opaque string.
  
  `Testing.settleThroughClock(effect, { step?, maxSteps? })` forks an Effect, repeatedly advances the
  ambient `TestClock` until it settles or `maxSteps` advances have run (defaults: `step: "1 second"`,
  `maxSteps: 12`), then joins it — dying with a message naming the bound tried, rather than hanging
  indefinitely, if the fork never settles in time. It replaces a duplicated fork/adjust/poll/join
  helper.
  
  See [ADR-EC-028](../spec/decisions/028-testing-failuretag-fails-the-assertion.md) and
  [ADR-EC-029](../spec/decisions/029-settlethroughclock-parameterized-fork-adjust-join.md).

### Patch Changes

- cc54639: A failing step's own cucumber-expression pattern and its `.feature` file:line now reach the failure
  panel a reader sees first, always on, no configuration needed.
  
  Previously, a failing step's entry named only the Scenario and the assertion — the step's own text
  reached a _separate_ stdout block, through the tracing span `Effect.fn(pattern)` already gives every
  step (ADR-EC-005), which is not the same place a reader looks first.
  
  `ScenarioEffect.ts` now wraps a step's own body call (covering both a typed `Effect.fail` and the
  more common thrown-exception defect, e.g. `assert.strictEqual`) so the failure gains a `.cause`
  before it can propagate — a real `StepFailureLocation` `Error`, which vitest's own DEFAULT reporter
  recurses into and prints as a nested "Caused by:" block, directly under the assertion:
  
  ```
  FAIL apples.steps.test.ts > Adding apples > Adding apples the wrong way
  AssertionError: expected 5 to equal 6
      ...
  Caused by: StepFailureLocation: features/apples.feature:6: step "I should have {int} apples"
  ```
  
  No custom `Reporter`, no `TestContext` crossing, nothing to opt into. `StepFailureLocation` is
  internal (not exported) — this is a pure output-quality change, closing
  [spec/process/looks-done-but-isnt-checklist.md](../spec/process/looks-done-but-isnt-checklist.md)'s
  P-24 item, which had measured the gap this closes.
  
  See [ADR-EC-033](../spec/decisions/033-stepfailurelocation-attached-as-cause-not-a-rewritten-message.md).
- Updated dependencies [96cbf93]
  - @effect-cucumber/gherkin@0.2.0

## 0.1.0

### Minor Changes

- 878220b: First pre-release of both packages (0.1.0). Effect v4 release-candidate line only: `.feature` parsing,
  step matching and DataTable/DocString wrapping in `@effect-cucumber/gherkin`; `describeFeature`, the
  Given/When/Then DSL, Rules, Scenario Outlines, all six hooks, tag routing, both Layer scopes and the
  Promise-returning `loadFeature` in `@effect-cucumber/vitest`.

### Patch Changes

- Updated dependencies [878220b]
  - @effect-cucumber/gherkin@0.1.0
