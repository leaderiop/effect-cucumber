/**
 * Public entry point for `@effect-cucumber/vitest`.
 *
 * The package runs a `.feature` file as vitest tests where every step is an `Effect`. A test author
 * calls `describeFeature(feature, layer, define)` with a `ParsedFeature` from
 * `@effect-cucumber/gherkin`, the ambient `Layer` the Feature's steps run against, and a callback
 * that registers step definitions through the `Given`/`When`/`Then`/`And`/`But` registrars and the
 * `Background`/`Scenario` containers.
 *
 * `layer` takes either of two forms
 * ([ADR-EC-006](../../../spec/decisions/006-two-layer-scopes-only.md)): a plain `Layer`, which is the
 * per-Scenario scope and is rebuilt fresh for every Scenario, or `{ shared, perScenario }`, where
 * `shared` is built once for the whole Feature. `perScenario` is required in the object form even
 * when there is no per-Scenario state — write `perScenario: Layer.empty`.
 *
 * Whichever form is used, the dsl handed to `define` is parameterised by exactly that Layer's output
 * type, so a step whose Effect requires a service the Layer does not provide is a type error where
 * the step is written rather than a runtime "service not found" discovered when the Scenario runs
 * ([ADR-EC-003](../../../spec/decisions/003-describefeature-takes-a-layer.md), INV-EC-003). That
 * check is the package's whole reason to exist, and
 * [ADR-EC-016](../../../spec/decisions/016-effect-tsgo-language-service-plugin.md)'s build gate is
 * what keeps it from decaying silently.
 *
 * **Current state.** `describeFeature` emits one `it.effect` per Scenario, nested inside a
 * `describe` named after the Feature and, where the document has `Rule`s, a further nested
 * `describe` per Rule. A Background's steps are the leading `yield*`s of the same Effect rather than
 * a separate hook, so they run first and the first failure ends the Scenario. A step whose text
 * matched no registered pattern visible to it, or more than one at the same scope level, fails ITS
 * OWN Scenario with a located `StepMatchError` and leaves every other Scenario runnable. A
 * registered pattern that matched no step anywhere in the Feature is a warning rather than a
 * failure, surfaced on three channels: `console.warn` at collection time, an always-passing test
 * node last in the block, and a structured list on the plan. All six hooks — `Before`, `After`,
 * `BeforeStep`, `AfterStep`, `BeforeAllScenarios`, `AfterAllScenarios` — are registered through the
 * Feature-level dsl: `Before` gates the Scenario's steps, and every `Before` in a batch runs
 * independently with their failures combined rather than the batch stopping at the first one; `After`
 * and `AfterStep` are guaranteed to run whether the thing they guard succeeded or failed, and never
 * mask its error; `BeforeAllScenarios` runs once per Feature and its failure reaches every Scenario;
 * `AfterAllScenarios` runs as a trailing node regardless of what failed before it.
 *
 * **Both Layer scopes are real at run time, not only in the types** (RUN-03, RUN-04,
 * [ADR-EC-018](../../../spec/decisions/018-shared-layer-testclock-isolation.md)). A plain `Layer` in
 * the second argument IS the per-Scenario scope and is built fresh for every Scenario. The `shared`
 * half of `{ shared, perScenario }` is built EXACTLY ONCE for the whole Feature, through the test
 * framework's own `layer(...)` helper, while the `perScenario` half beside it is still rebuilt for
 * every Scenario — the two tiers travel as two values and are never merged, and where both name the
 * same service the `perScenario` implementation is the one a step resolves. Every Scenario gets its
 * OWN simulated clock and its OWN console on both forms, so one Scenario's `TestClock.adjust` is
 * never observable by another. A `shared` Layer's error channel must be `never`, and that constraint
 * is not stylistic: the framework builds a shared Layer with `Effect.orDie`, so a typed failure there
 * becomes an unrecoverable defect raised out of a setup hook, attributed to no Scenario, no step and
 * no `.feature` file. Pinning the channel moves the choice to where the types can see it — a caller
 * writes `Layer.catchAll` or `Layer.orDie` themselves and the collapse is visible in their own
 * source. One capability does not carry across, and it is stated here rather than left to be
 * discovered: the `it` the framework hands the shared block has no live-clock member, so a Feature
 * using a `shared` Layer cannot opt a single Scenario out of the simulated clock.
 *
 * **Tags** (RUN-05, [ADR-EC-020](../../../spec/decisions/020-vitest-native-tags-for-skip-only.md)).
 * Every tag on a Scenario reaches the emitted test as a native runner tag, including the ones it
 * inherits from its `Feature`, its `Rule` and its `Examples` block. `@skip` additionally emits the
 * test as skipped, so neither its steps nor any of its hooks run. `@only` is emitted as a plain tag
 * and is NEVER routed to the runner's only-mode, so an `@only` left in a committed `.feature` file
 * cannot fail a CI run that forbids only-marking. `includeTags`/`excludeTags` on `describeFeature`'s
 * optional fourth argument narrow what is REGISTERED rather than what runs: a Scenario the filter
 * excludes is absent from the report entirely rather than listed in it as skipped, and one summary
 * line naming the count, the Feature and the option that removed them prints when the filter removed
 * anything at all.
 *
 * One prerequisite comes with all of that, and it is stated here rather than left to be discovered:
 * a tag must be DECLARED in the runner's own config or the runner rejects the emission. This library
 * catches that rejection, re-emits the test untagged and prints a warning naming the `.feature` file,
 * the Scenario and the tags it carried — so the Scenario still runs, but its tags do not exist for the
 * runner and a `--tagsFilter` naming any of them cannot select it. `gherkinTags("<glob>")`, exported
 * below, is the supported way to produce those declarations from the same `.feature` files the tags
 * are written in.
 *
 * `loadFeature`, exported below, is the Promise-returning wrapper of
 * [ADR-EC-024](../../../spec/decisions/024-vitest-owns-a-managedruntime-for-collection-time-loadfeature.md):
 * a Feature file awaits it once at module top level and hands the result to `describeFeature`.
 * `spec/roadmap.md` remains the single authority on what is built.
 *
 * ## Export policy
 *
 * This is a SINGLE barrel and there is no subpath export. A subpath has to be added to BOTH
 * `exports` and `publishConfig.exports` in `package.json` or it resolves locally and 404s for
 * consumers, so one entry point is the shape that cannot drift.
 *
 * ## Deliberately NOT exported
 *
 * `createRegistry` (and its `Registry`/`StepDefinition` types), `register` from `Step.ts`,
 * `captureCallSite` from `CallSite.ts`, `planFeature` from `Plan.ts`, `buildScenarioEffect` from
 * `ScenarioEffect.ts`, `emitFeature` from `Runner.ts`, the `TestApi` seam they reach the framework
 * through, and `collectFeature` from `describeFeature.ts`. Every one of them is an internal stage of
 * `describeFeature` with no standalone consumer contract, following `@effect-cucumber/gherkin`'s own
 * precedent, where `Parser`, `Pickles`, `Correlate`, `Source` and `Validate` are internal and only
 * `loadFeature` is published. This package's tests import them by relative path.
 *
 * The same is true of `registerHook`, `groupHooks` and `runHookBatch` from `Hook.ts`, `HookSet` and
 * `HookBody` (also `Hook.ts` — `HookSet` appears in `FeatureCollection`, which is itself not
 * exported), and `createHookRegistry` (with its `HookKind`/`HookDefinition`/`HookRegistryShape`
 * types) from `HookRegistry.ts`. Each is an internal stage of `describeFeature` with no standalone
 * consumer contract, exactly like the modules above it in this list.
 *
 * The same is true of everything RUN-05 added BEHIND `describeFeature`: `EmitOptions` from
 * `TestApi.ts`, which is the per-emission argument the seam carries; the outcome value `emitFeature`
 * returns, which is how the emission walk reports its excluded-Scenario count back to the caller that
 * prints the notice; and the whole of `Tags.ts` — `makeTagFilter`, `shouldEmit`, `isSkipped`, the
 * `TagFilter` type and the `skipTag`/`onlyTag` constants. Each is an internal stage of
 * `describeFeature` with no standalone consumer contract, exactly like the modules above it: a
 * consumer writes tags in a `.feature` file and declares them in a config, and never constructs a
 * filter, an emission option or an outcome.
 *
 * `GherkinTags.ts` is the one module on the OTHER side of this ledger, and the reason it is there is
 * not that it is more useful than the rest — it is that there is no internal stage to freeze. It is
 * called from a consumer's own config file rather than from inside the register → plan → emit
 * pipeline, so exporting it commits this project to a single function signature it already has to
 * keep, not to the shape of a join between two stages — a join Phase 10 has since changed.
 *
 * The omission is a decision, not an oversight, and the cost of getting it wrong is asymmetric: a
 * published internal stage is a contract this project then has to keep, through every change to the
 * pipeline it is a stage of. `collectFeature` is the sharpest case — it is the in-package join point
 * a test asserts a `FeatureCollection` against, and exporting it would freeze that collection's
 * shape, `plan` field included, into the package's contract. `TestApi` is the next sharpest: TWO
 * implementations now flow through it since Phase 10 (RUN-03/RUN-04) — the module-level one and the
 * one `layer(...)` hands the shared block — and a consumer never constructs either.
 */

/** The entry point. Everything else in this package is reached through the dsl it hands `define`. */
export { describeFeature } from "./describeFeature.ts"

/**
 * Read and parse a `.feature` file at module top level (ADR-EC-024, BEH-EC-001).
 *
 * Returns a `Promise<ParsedFeature>` — the one deliberately Promise-returning surface in the
 * library — because `describeFeature` needs an already-resolved value during vitest's synchronous
 * collection. It runs `@effect-cucumber/gherkin`'s Effect-returning `loadFeature` on one
 * module-scoped `ManagedRuntime` over `NodeFileSystem.layer`; `@effect/platform-node` is therefore a
 * peer dependency of this package. The names re-exported beside it are what a Feature file needs
 * without a second import: the store a custom parameter type is declared in, the typed failures the
 * load can reject with, and the argument types a step body annotates.
 */
export {
  createParameterTypeStore,
  DataTableError,
  decodeHashes,
  LoadFeatureError,
  ParameterTypeStore,
  StepPatternError
} from "@effect-cucumber/gherkin"
export type { DataTable, DocString, ParameterTypeDefinition, ParsedFeature, StepArgs } from "@effect-cucumber/gherkin"
export { loadFeature } from "./loadFeature.ts"

/**
 * The optional fourth argument's type, exported for annotation.
 *
 * A consumer computing an options object before passing it — from an environment variable, from a
 * CLI flag, from a shared helper the whole suite calls — needs the name to annotate it. This is the
 * same reason `FeatureDsl` and `StepRegistrar` are exported: neither is constructed by this package
 * on the consumer's behalf, and a value whose type is unnameable can only be written inline.
 *
 * Both of its fields are plain arrays of tag strings and never the runner's boolean tag-expression
 * grammar, and `undefined` and `[]` both mean NO FILTER — so a computed-empty array cannot silence a
 * suite. `describeFeature.ts` states both rules on the fields themselves.
 */
export type { DescribeFeatureOptions } from "./describeFeature.ts"

/**
 * Produce a runner config's tag declarations from the `.feature` files the tags are written in
 * (RUN-05, 09-CONTEXT.md D-09).
 *
 * This is the one module in this package that is CONSUMER-FACING rather than an internal pipeline
 * stage, and it exists because of a fact about the runner that is easy to miss: a `--tagsFilter`
 * expression is validated against the tag list declared in `test.tags` REGARDLESS of whether the
 * runner's strict-tags check is on. A tag that is written in a `.feature` file but not declared in
 * the config therefore cannot select anything — which is the entirety of ADR-EC-020's "run just one
 * Scenario locally" story, unavailable to a real consumer unless they maintain that list by hand and
 * never forget an entry.
 *
 * `gherkinTags` takes a GLOB PATTERN, or an array of them, resolved against `process.cwd()` exactly
 * like every other glob-taking Node tool — there is deliberately no default, so it never scans a
 * tree its caller did not name, and an empty pattern throws rather than quietly declaring nothing.
 * Its result spreads straight into `test.tags` beside any hand-written entries, which
 * `packages/vitest/test/GherkinTags.types.ts` proves at compile time against the runner's own type.
 *
 * It is also why this package carries one non-workspace runtime dependency: expanding a glob
 * synchronously at config-load time needs a library, because `fs.globSync` requires Node 22 and this
 * package supports Node 20. `GherkinTags.ts`'s notes (c) and (d) carry the full argument.
 */
export { gherkinTags } from "./GherkinTags.ts"
export type { GherkinTagDefinition } from "./GherkinTags.ts"

/**
 * The compile-time surface `define` receives, exported for annotation.
 *
 * A consumer needs these to write a define callback as a named function rather than inline — the
 * `ROut` type argument is the ambient Layer's output. `BackgroundDsl` is `Given`/`And` only, which
 * is the real Gherkin grammar and not an oversight
 * ([ADR-EC-017](../../../spec/decisions/017-background-and-scenario-are-step-definition-containers.md)).
 * `HookRegistrar` is what a consumer annotates a hook body with when it is written as a named
 * function rather than inline — the same reason `StepRegistrar` is exported for a step.
 */
export type { BackgroundDsl, FeatureDsl, HookRegistrar, ScenarioDsl, StepRegistrar } from "./Dsl.ts"

/**
 * The two channels step drift reaches a consumer through (BEH-EC-013, ADR-EC-019).
 *
 * `StepMatchError` is the FAILURE: a Pickle step whose text resolved to zero registered patterns
 * (MATCH-03) or to more than one at the same scope level (MATCH-04). It arrives in a failing
 * Scenario's error channel, which is a value a consumer catches and narrows on `reason` — so the
 * class has to be reachable by name, and matching on message text instead is the thing this export
 * exists to make unnecessary.
 *
 * `UnusedStepDefinitionWarning` is NOT a failure and never enters an error channel: a registered
 * pattern that matched no step in the whole Feature is dead code, not a broken Scenario (MATCH-05,
 * same ADR). It is exported specifically so 06-CONTEXT.md D-02's channel 3 — the structured list —
 * is inspectable and assertable by a consumer, rather than only readable as terminal text or as a
 * test node's title. `@effect-cucumber/gherkin`'s barrel exports `LoadFeatureWarning` alongside
 * `LoadFeatureError` for the same reason, and this mirrors it.
 *
 * `UndeclaredTagWarning` and `ExcludedScenariosNotice` join them for the identical reason, and they
 * belong in this block rather than in one of their own because they are the same KIND of thing:
 * structured collection-time reports that are not failures and never enter an error channel. The
 * first is printed when a Scenario carried a tag the runner's config does not declare — the test is
 * re-emitted untagged so it still runs, and the warning is the only signal that its tags are gone.
 * The second is printed once per Feature whose `includeTags`/`excludeTags` removed Scenarios, which
 * is the one thing a green run cannot tell a reader by itself. Both are exported so a consumer can
 * assert on the structured value rather than on terminal text, exactly as
 * `UnusedStepDefinitionWarning` already is.
 *
 * The `*Reason` unions come with all of them: they are the discriminants a consumer branches on, and
 * a `reason` field whose type is unnameable forces a string comparison at every call site.
 */
export { StepMatchError } from "./Errors.ts"
export type {
  ExcludedScenariosNotice,
  ExcludedScenariosNoticeReason,
  StepMatchErrorReason,
  UndeclaredTagWarning,
  UndeclaredTagWarningReason,
  UnusedStepDefinitionWarning,
  UnusedStepDefinitionWarningReason
} from "./Errors.ts"
