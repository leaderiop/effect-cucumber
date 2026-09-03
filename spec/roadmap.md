# Roadmap

## Current state

**`@effect-cucumber/gherkin`'s parse pipeline, step matcher, and DataTable /
DocString wrapper have shipped; `@effect-cucumber/vitest` now RUNS a Feature —
`describeFeature` emits one `it.effect` per Scenario, with drift detection on
three channels.** `loadFeature`/`parseFeature` and the `ParsedFeature`
contract are built and tested
([04 — loadFeature parse and validation](behaviors/04-loadfeature-parse-and-validation.md)),
as are custom parameter types and step matching
([05 — Step matching and parameter types](behaviors/05-step-matching-and-parameter-types.md)),
and a step's DocString and data table now reach `ParsedStep.stepArguments`
wrapped and in source order
([06 — DataTable and DocString arguments](behaviors/06-datatable-and-docstring-arguments.md)).
`describeFeature` and its step-registration DSL are built and compile-gated too
([01 — Steps and World](behaviors/01-steps-and-world.md)) — a step requiring a
service the ambient Layer does not provide fails `tsc` by name, asserted on
every push by `scripts/verify-tsgo-gate.sh`. The runner is built as of Phase 6:
a Feature compiles to one `describe` block, each Scenario to one `it.effect`
whose Background steps lead, each against its own Layer build; a step matching
zero or many registered patterns fails its own Scenario with a located
`StepMatchError`, and a pattern matching no step is a warning on the terminal, in
the reporter, and on the plan (MATCH-03/04/05, RUN-01 — requirement ids
now carried by `spec/traceability.md` §5). Hooks are built too, as of Phase 7: all six —
`Before`, `After`, `BeforeStep`, `AfterStep`, `BeforeAllScenarios`,
`AfterAllScenarios` — run in a fixed order, with `Before` gating a Scenario's
steps, `After`/`AfterStep`/`AfterAllScenarios` guaranteed via `Effect.onExit`,
and independent hook batches whose failures combine rather than first-winning
(DSL-07, RUN-02 — see
[07 — Hook ordering and guarantees](behaviors/07-hook-ordering-and-guarantees.md)).
Rules and Scenario Outlines are built too, as of Phase 8: `Rule(name, extraLayer,
define)` and `Scenario(name, extraLayer, define)` both extend whatever Layer was
ambient at that call site via `Layer.provideMerge`, still per-Scenario-fresh; a
Rule-scoped service is a real compile-time boundary, rejected by name outside its
own Rule; a Rule carries its own `Background` and its own
`Before`/`After`/`BeforeStep`/`AfterStep`, which nest inside the Feature's
(Feature-then-Rule on the way in, Rule-then-Feature on the way out); and every
Outline row emits its own test, titled with every Examples column and that row's
value for it, provably sharing no state with its siblings (DSL-05, DSL-06 — see
[BEH-EC-018](behaviors/03-rules-outlines-and-testclock.md)).
Tags are built too, as of Phase 9: every tag on a Scenario — the ones it
inherits from its `Feature`, `Rule` and `Examples` block included — reaches the
emitted test as a native runner tag with its literal `@` prefix; `@skip`
additionally emits the test as skipped, so neither its steps nor any of its
hooks run; `@only` is emitted as a plain tag and is NEVER routed to only-mode,
so a committed `@only` cannot fail a CI run that forbids only-marking; and
`includeTags`/`excludeTags` on `describeFeature`'s optional fourth argument
filter at REGISTRATION time, so an excluded Scenario is absent from the report
rather than listed in it as skipped, with one summary line printed when the
filter removed anything. Two things came with that and are stated here rather
than left to be discovered: every emitted tag must be DECLARED in the runner's
config or the runner rejects it — the library catches that, re-emits the test
untagged and prints a located warning — and `gherkinTags("<glob>")` is the
config-time helper that generates those declarations from a consumer's own
`.feature` files, which is why `packages/vitest` now carries one non-workspace
runtime dependency (`tinyglobby`). A Feature whose Scenarios are all skipped or
all filtered out emits no `AfterAllScenarios` node
(RUN-05 — see [ADR-EC-026](decisions/026-registration-time-tag-filtering-and-declared-tag-universe.md),
which supersedes ADR-EC-020, and
[BEH-EC-008](behaviors/02-shared-layers-and-tags.md)).
Both Layer scopes are built too, as of Phase 10: a `shared` Layer is built
exactly once for the whole Feature through `@effect/vitest`'s `layer(...)`,
while the `perScenario` tier beside it is still rebuilt for every Scenario, and
the two tiers travel as two values that are never merged — so where both name
the same service, `perScenario` is the one a step resolves. Every Scenario keeps
its own simulated clock and its own console on both scopes, delivered by
`excludeTestServices: true` at the `layer(...)` call site and a per-Scenario
`TestEnv` provided at the emission boundary — two guards over two DIFFERENT
services, not one change spelled twice (ADR-EC-018's implementation note has the
memo-map identity argument). One type-level constraint came with it: `shared`
must be `Layer<R, never, never>`, because the framework builds a shared Layer
through `Effect.orDie` and would otherwise raise a typed failure as a defect out
of a setup hook, attributed to no Scenario at all; `perScenario` is deliberately
left unconstrained (RUN-03, RUN-04 — see
[ADR-EC-018](decisions/018-shared-layer-testclock-isolation.md) and
[BEH-EC-007](behaviors/02-shared-layers-and-tags.md)).
And as of Phase 11 the library runs its own spec: the three worked examples from
[`spec/behaviors/01`](behaviors/01-steps-and-world.md) through
[`03`](behaviors/03-rules-outlines-and-testclock.md) execute as real `.feature` plus
`.steps.test.ts` pairs under `packages/vitest/test/acceptance/`, driven by the real
`describeFeature` and producing real passing `it.effect` tests rather than a second
prose description of one. All 22 v1 requirements carry a `@REQ-EC-NNN` acceptance tag
(and `REQ-EC-023`, BEH-EC-019's step modules, joined them in the audit remediation),
and `pnpm verify:spec` reports the count and fails if the ids stop being contiguous, stop
occurring exactly once, or lose their row in [`traceability.md`](traceability.md) §5.
Step definitions are reusable across Features as of the audit remediation (F-29,
[BEH-EC-019](behaviors/08-step-modules.md), ADR-EC-027): `defineSteps<R>` returns a
typed module value and every container's `use(module)` registers it into that
container's scope, with a module needing a service the Feature's Layer lacks
rejected by name at the `use` call.
Two standalone testing helpers are built too, grounded in real duplication found in a
downstream consumer's own acceptance suite: `Testing.failureTag(exit)` narrows a failed
`Exit`'s typed tag or fails the current assertion by name — never a silent `"Unknown"`
string — and `Testing.settleThroughClock(effect, { step?, maxSteps? })` forks an Effect,
advances the ambient `TestClock` up to `maxSteps` times, and joins it, dying (not hanging)
with a located message if it never settles. Both are exported from a new
[`packages/vitest/src/Testing.ts`](../packages/vitest/src/Testing.ts), re-exported as the
`Testing` namespace from the package barrel (
[BEH-EC-020/021](behaviors/09-testing-helpers.md),
[ADR-EC-028](decisions/028-testing-failuretag-fails-the-assertion.md),
[ADR-EC-029](decisions/029-settlethroughclock-parameterized-fork-adjust-join.md)).
The cross-step-state convention is enforced structurally for the first time —
`scripts/verify-acceptance-ref-state.sh` gives INV-EC-006 its first real mechanism, over
this repository's own acceptance suite; a consumer's own step modules remain a convention
unless they adopt `scripts/templates/verify-consumer-ref-state.sh` (LINT-01, shipped —
see below). INV-EC-003's boundary condition gained a gate of its own,
`scripts/verify-acceptance-no-any.sh`, and a consumer-facing configuration recommendation
in [`packages/vitest/README.md`](../packages/vitest/README.md). And the "Looks Done But
Isn't" checklist is now a normative document at
[`process/looks-done-but-isnt-checklist.md`](process/looks-done-but-isnt-checklist.md) —
twenty-four items, each EXECUTED by a named artifact rather than cited, with a coverage
cross-check that reads the document's own table so "runs in full" is counted rather than
claimed. Two of the twenty-four measured FALSE as originally worded and say so in writing
rather than having been narrowed quietly: an acceptance `.feature` edit does not trigger a
watch-mode rerun for the path-based `loadFeature` form every committed pair uses (only the
`?raw` form reruns, and that WAS a product gap, not a test gap — `gherkinWatchTriggers`
(below) is the shipped fix; this checklist item's own fixture still uses the `?raw` form
deliberately, since it is what the item measures, not what a consumer is told to write), and
a failing step's
entry in the runner's failure panel names the Scenario and the assertion but neither the
step text nor the `.feature` file and line — the step PATTERN does reach a separate stdout
block, through ADR-EC-005's `Effect.fn(pattern)` span, which is not the same thing and is
recorded as not the same thing
(RUN-06 — see [ADR-EC-009](decisions/009-cross-step-state-lives-in-a-ref.md) and
[INV-EC-006](invariants.md#inv-ec-006-cross-step-scenario-data-survives-only-via-a-layer-provided-ref)).
All of it stress-tested against
three worked examples (see `spec/behaviors/`) and against four rounds of GSD
research (Stack, Features, Architecture, Pitfalls — archived on the `planning-archive` branch),
which found and fixed real bugs in the spec itself (ADR-EC-014/007's
corrections, ADR-EC-017's Background/Scenario fix) in addition to verifying
assumptions against the actually-installed dependencies. The 11-phase,
bottom-up build order both Architecture and Pitfalls research converged on is
complete; its per-phase record is archived with the research.

Three items move from § Planned to shipped in the same push. **LINT-01**
ships as the script route it was locked to: `scripts/verify-acceptance-ref-state.sh`
generalized into [`scripts/templates/verify-consumer-ref-state.sh`](../scripts/templates/verify-consumer-ref-state.sh) — the
step-modules directory/glob and the carve-out count become arguments instead
of this repository's own hardcoded constants, and the positive control that
proves the regex still matches a real declaration is a synthetic fixture
generated on the fly rather than a path into this repository's own source, so
the copy needs nothing about a consumer's module layout to run. Documented in
`packages/vitest/README.md`'s "Recommended lint and compiler configuration"
section, beside the existing `any`-boundary recommendation it is structurally
identical to. No new ADR: same category as `scripts/verify-acceptance-ref-state.sh`
itself, an enforcement mechanism for ADR-EC-009/INV-EC-006 rather than a new
design decision.
**A watch-mode rerun trigger** ships as `gherkinWatchTriggers`
([ADR-EC-030](decisions/030-gherkinwatchtriggers-plugin-reruns-the-whole-test-include-set.md),
[BEH-EC-022](behaviors/10-watch-mode.md)), a Vite plugin exported beside
`gherkinTags` that appends a `.feature`-file trigger to Vitest's own
`test.watchTriggerPatterns`, grounded in the REAL `WatcherTriggerPattern`
shape (`pattern: RegExp`, `testsToRun: (file, match) => string[] | ...`) —
materially more than "append the glob," which is what made this an ADR and
not only an implementation. Since no static `.feature`-to-test-file mapping
exists in general, a tracked `.feature` file changing reruns the consumer's
whole `test.include` set — conservative rather than surgical, and the ADR
records the naming-convention and live-`Vitest`-instance alternatives it
rejected. Covered by `packages/vitest/test/GherkinWatchTriggers.test.ts`,
calling the plugin's `config()` hook and the `testsToRun` it returns directly
rather than through a live watcher — the same category as `gherkinTags`
itself, config-time and barrel-exported, no acceptance pair.
**Per-Scenario/Example deterministic `Random` seeding** ships as a
`Random.withSeed` wrap around every emitted Scenario's composed Effect in
`Runner.ts`
([ADR-EC-031](decisions/031-random-withseed-wraps-the-scenario-effect-not-a-layer.md),
[BEH-EC-023](behaviors/11-scenario-seeding.md),
[INV-EC-007](invariants.md#inv-ec-007-a-scenarios-ambient-random-is-seeded-deterministic-and-distinct-per-outline-row)) —
**not** a `Layer` joined into `testEnv`'s `Layer.mergeAll`, correcting this
section's own original framing: `Random.withSeed` is a combinator over an
already-built `Effect`, read directly out of the installed `effect@4.0.0-rc.112`,
with no `Layer` form to join. The seed is the Feature's own `uri` plus the
Scenario's fully emitted title — already disambiguated per Outline row and
per byte-identical-title occurrence by `OutlineTitle.ts`, so no separate row
index needs threading through the plan — and composes OUTSIDE the
per-Scenario Layer `buildScenarioEffect` already provides, so a consumer's
own `Random` implementation still wins where one is provided. Proven against
the real running framework, not a synthetic value:
`packages/vitest/test/acceptance/random-seeding.feature` +
`.steps.test.ts` (`REQ-EC-024`, `spec/traceability.md` §5) has two Outline
rows each independently recomputing what its own seed should produce, and a
trailing Scenario proving the two rows' captured values differ from each
other; `packages/vitest/test/ScenarioSeed.test.ts` covers the pure
derivation function alone.
**An Examples column not referenced by any step's pattern** ships as
`ExamplesRow`/`decodeExamplesRow`
([ADR-EC-032](decisions/032-outline-examplesrow-carries-the-raw-row-decoded-on-demand-not-a-per-feature-schema.md),
[BEH-EC-024](behaviors/12-outline-typed-example-column.md)) — the raw Examples row (column name →
string) an Outline row's Pickle correlates to, appended to `StepParams<P>`'s existing trailing tail
(already used for DataTable/DocString, BEH-EC-003/016) for EVERY step of that row, decoded on demand
by a step body through `decodeExamplesRow(rowSchema)(row)`, the same `Schema`-decode mechanism
`decodeHashes` already gives a DataTable (ADR-EC-008). **Not** a per-Feature `Schema` declaration —
correcting this section's own original framing: `describeFeature`'s real signature has no
Feature-scoped surface to attach one to, and one Feature can carry more than one Examples header (a
single Outline can even have two, across two `Examples:` blocks with different columns), so no
single per-Feature `Schema` could be correct in general. `ParsedScenario.exampleRow` is the new field
(`Option.none()` for a plain Scenario), built once per Scenario in `Correlate.ts` alongside the AST
walk it already performs for Examples-column validation; `OutlineTitle.ts` was rewritten in the same
change to read that field instead of independently re-walking the AST a second time for its own
`(col=value, ...)` title suffix, removing a latent duplication rather than adding a third copy of it.
Proven against the real running framework:
`packages/vitest/test/acceptance/outline-typed-column.feature` +
`.steps.test.ts` (`REQ-EC-025`, `spec/traceability.md` §5) has an Outline row whose `note`/`priority`
columns are referenced by NO step's pattern text anywhere in the Feature, reaching a step body only
through the trailing `ExamplesRow`, decoded against an independently hand-copied expectation, while
the pattern-referenced `sku` column is cross-checked equal from a DIFFERENT step than the one that
decodes the row; `packages/gherkin/test/ExamplesRow.test.ts` covers `makeExamplesRow`/
`decodeExamplesRow`'s own unit semantics and `correlateFeature`'s population of `exampleRow` directly.
**Citing the failing step's text and `.feature` file:line in the runner's failure panel** ships as
`StepFailureLocation`/`attachStepFailureLocation`
([ADR-EC-033](decisions/033-stepfailurelocation-attached-as-cause-not-a-rewritten-message.md),
[BEH-EC-025](behaviors/13-failure-panel-location.md)) — `ScenarioEffect.ts` wraps a step's own body
call (both failure lanes: a typed `Effect.fail` AND the more common thrown-exception defect) so its
`.cause` carries a real `StepFailureLocation` `Error` before the failure can propagate, exactly as
the roadmap locked, with one correction the real installed `vitest@4.1.11` forced: a bare
`{ step, file, line }` object has no `.name`, and vitest's own default reporter only recurses into
`.cause` and prints it as "Caused by:" when the cause carries one — so `StepFailureLocation` is a
real `Error` subclass, not a plain object, which is what makes the roadmap's own named mechanism
actually fire. No custom `Reporter`, and no `TestApi.ts` seam change — the rejected
`context.annotate()` alternative's real cost (the `TestContext` `VitestTestApi.ts` currently
discards) stays avoided exactly as planned. Closes
[`spec/process/looks-done-but-isnt-checklist.md`](process/looks-done-but-isnt-checklist.md)'s P-24
row, which had measured this claim FALSE. Proven at two levels: in-process, against `Exit`/`Cause`
inspection (`packages/vitest/test/ScenarioEffect.test.ts`'s own RUN-06 describe block), and against a
REAL `vitest run`'s printed stdout (`scripts/verify-failure-panel.sh`,
`packages/vitest/test/failure-panel-fixture/failing.steps.test.ts` — a deliberately failing pair,
excluded from every normal run, collected only by that script's own standalone
`vitest.config.ts`).

| Gate                                              | Status                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| ------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Packages exist                                    | Yes — both scaffolded and correctly linked. `@effect-cucumber/gherkin` has real source (`loadFeature`, `parseFeature`, the `ParsedFeature` contract, the error/warning surface, custom parameter types as data, the step matcher, the `DataTable` wrapper with `raw()`/`hashes()`/`rowsHash()`/`decodeHashes`, and the step-argument accessors behind `ParsedStep.stepArguments`); `@effect-cucumber/vitest` has real source too — `describeFeature` with both Layer argument forms (a plain `Layer`, or `{ shared, perScenario }`), the `FeatureDsl`/`RuleDsl`/`ScenarioDsl`/`BackgroundDsl`/`StepRegistrar`/`HookRegistrar`/`ScenarioRegistrar` type surface, per-instance step registration through `Registry.ts`, and the `Effect.fn(stepText)` auto-wrap with identity pass-through for an already-wrapped step. **The runner is built:** `Plan.ts` joins the registered definitions against the Feature and resolves every Pickle step, `ScenarioEffect.ts` composes each Scenario into one Effect, `Runner.ts` emits the `describe`/`it.effect` tree through an injected `TestApi`, and `describeFeature.ts` is the composition root that wires the three and constructs the concrete `TestApi`                                          |
| `tsc -b`                                          | Wired (`tsconfig.base.json`/`tsconfig.json`/per-package configs) and building both packages for real                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| `@effect/tsgo` (Effect-aware type checking)       | Wired, gating the build (ADR-EC-016), and the gate itself is asserted by `pnpm verify:tsgo-gate` — eighteen checks, each pairing an exit code with the diagnostic it is about, so a diagnostic that stops firing fails CI instead of passing quietly. Assertions 12 and 13 extend it past INV-EC-003 to INV-EC-005: a Rule-scoped service used outside its Rule is rejected by name; assertion 11b (F-10) rejects a once-per-Feature hook that reaches for a per-Scenario service                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| Unit tests                                        | Yes for both. `packages/gherkin` has fifteen `test/*.test.ts` files over a `.feature` fixture set — the fifteenth being `Snippet`, added in Phase 6 for the step-definition snippet an unmatched step suggests — plus one type-check-only `.types.ts` file compiled by `pnpm typecheck:test`. `packages/vitest` has fourteen — `CallSite`, `Errors`, `GherkinTags`, `Hook`, `HookRegistry`, `OutlineTitle`, `Plan`, `Registry`, `Runner`, `ScenarioEffect`, `Step`, `Tags`, `describeFeature` and `emission`, the last being the only file in the repo that calls `describeFeature` for real and lets vitest run what it emits — plus TWO type-check-only `.types.ts` files of its own (`GherkinTags.types.ts` and, as of Phase 10, `SharedLayerConstraint.types.ts`), all mapped in [`spec/traceability.md`](traceability.md) §4, plus fourteen compile-gate fixtures under `test/tsgo-gate/src/` that vitest never collects (most are deliberately non-compiling) and that `scripts/verify-tsgo-gate.sh` asserts in fifteen checks on every push. As of Phase 11 `packages/vitest/test` also carries the seven-file acceptance suite one directory deeper, under `test/acceptance/` — which is why §4 enumerates from three globs and not two |
| Acceptance suite (this library dogfooding itself) | Built and running, as of Phase 11. `packages/vitest/test/acceptance/` holds five `.feature` + `.steps.test.ts` pairs — the three worked examples from `spec/behaviors/01`–`03`, plus a parsing/matching pair and a hooks pair — driven by the real `describeFeature` and producing real passing `it.effect` tests. Beside them sit one untagged sixth `.feature` (loaded by the parsing pair for its data alone) and five starved fixtures under `acceptance/negative/`, whose tags are redeemed by `negative-requirements.test.ts` rather than by a run. All 22 v1 requirements carry a `@REQ-EC-NNN` tag and `pnpm verify:spec` check 5 reports the count. Two gates guard the suite's own discipline: `pnpm verify:acceptance-ref-state` (INV-EC-006) and `pnpm verify:acceptance-no-any` (INV-EC-003's boundary). Every pair carries a numbered mutation record in its module doc comment, because a passing acceptance test proves nothing on its own                                                                                                                                                                                                                                                                                      |
| `bash spec/scripts/verify-traceability.sh`        | Wired and passing (checks spec-to-spec consistency only)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| Doc-examples compile check                        | Wired — `pnpm verify:doc-examples`, run in the `package` CI job                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| Coverage thresholds                               | Wired — `pnpm coverage`, 90%/90% statements/branches per package (`spec/traceability.md` §6), Node 24 CI leg only                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| GSD project planning                              | Complete and archived on the `planning-archive` branch; `.planning/` is no longer tracked on `main` (F-27)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |

## Blocking first release (resolved — kept for history)

Both packages are published on npm as `0.1.0` (see the README's "## Status"), so nothing below is still blocking;
this section is the record of what the first release required, not a live punch list. The
dependency-graph-verified 11-phase build order (Phase 0 tooling policy → Phase 1 `loadFeature` → Phase 2 parameter
types → ... → Phase 9 shared Layer → Phase 10 composition root + dogfooded acceptance suite) came out of the
research archived on the `planning-archive` branch. High-level shape:

1. Finish Phase 0 tooling/dependency policy — **done.** Peer deps fixed via ADR-EC-015, extended to
   `@effect-cucumber/gherkin` via ADR-EC-021, `@effect/tsgo` wired via ADR-EC-016; `publishConfig.exports`, pnpm
   catalogs and CI (`.github/workflows/`) are all in place, and ADR-EC-021's Follow-up items that gated this —
   the `Source.ts`/`loadFeature.ts`/`Errors.ts` rewrite, the `BEH-EC-001` update, and the `ParameterTypeStore`-as-Layer
   migration (`Context.Service` in `packages/gherkin/src/ParameterTypes.ts`) — are all shipped. One follow-up from
   that ADR is still genuinely undecided and tracked under "Under consideration" below: which package owns
   `ManagedRuntime` construction.
2. Implement `@effect-cucumber/gherkin`'s parse→compile→correlate pipeline
   (the riskiest phase — several silent-failure edge cases in
   `@cucumber/gherkin`'s `compile()` must become loud errors here).
3. ~~Finish `@effect-cucumber/vitest`'s register→plan→emit pipeline.~~ **Done in
   Phase 6.** All three stages ship: **register** (BEH-EC-002–004:
   `describeFeature`, both Layer forms, the dsl containers, the step auto-wrap,
   and the compile gate that makes an unprovided service a type error),
   **plan** (`Plan.ts` resolves every Pickle step against the registered
   definitions, with step drift — BEH-EC-013 — failing the Scenario it belongs
   to), and **emit** (`ScenarioEffect.ts` composes each Scenario into one
   Effect, `Runner.ts` emits the `describe`/`it.effect` tree). Proven end to end
   against a hand-written `.feature` file in
   `packages/vitest/test/emission.test.ts`. Hooks (Phase 7) are also built, layered
   on top of the pipeline rather than inside it: all six kinds run in a fixed
   order around each Scenario, sharing one `BeforeAllScenarios`/`AfterAllScenarios`
   execution per Feature and guaranteeing `After`/`AfterStep`/`AfterAllScenarios`
   via `Effect.onExit`. Rules and Scenario Outlines (Phase 8) are built on top of
   it too: a `ruleId` on every registration and on every hook, ruleId-equality
   scope matching in `Plan.ts`, `Layer.provideMerge` per Rule and per Scenario in
   `describeFeature.ts`, `mergeHookSets` for the Rule/Feature hook ordering, and
   `OutlineTitle.ts` for the per-row test title — no `Rule.ts` and no
   `ScenarioOutline.ts` were needed (see [`spec/traceability.md`](traceability.md)'s
   §1 preamble for why). Tag routing and `@skip`/`@only` (Phase 9) are built on
   top of it as well: `Tags.ts` holds the reserved constants and the
   registration filter, `Runner.ts` carries each Scenario's tags and its skip
   flag across the `TestApi` seam, `VitestTestApi.ts`'s adapter is the one
   place that names the framework's option object and the one place that
   catches an undeclared-tag rejection, and `GherkinTags.ts` is the config-time
   helper a consumer calls to declare the tag universe in the first place. Both
   Layer scopes (Phase 10) are built on top of it as well, and again no new
   module was needed: `describeFeature.ts`'s composition root carries the one
   branch (`collection.sharedLayer === null` selects the default path), calls
   `@effect/vitest`'s `layer(...)` in its one-argument form on the other, and
   constructs a SECOND `TestApi` over the `it` that call hands back — which is
   exactly what the seam was made a parameter for. `Runner.ts` and
   `ScenarioEffect.ts` are unchanged in behaviour on both paths. The dogfooded
   acceptance suite (Phase 11) is built as well, and needed no new source module
   either — that is the point of it: it exercises the package through the same
   public entry points a consumer uses. ADR-EC-024's wrapped `loadFeature` is
   exported too (`packages/vitest/src/loadFeature.ts`, proven by
   `packages/vitest/test/loadFeature.test.ts`), and the acceptance suite loads
   every Feature through it. The doc-examples compile check and the coverage
   thresholds — the merge-gate table's last two "Not wired" rows — are also
   done: `pnpm verify:doc-examples` and `pnpm coverage`.

## Planned

Every item below traces to a resolved wayfinder ticket on
[effect-cucumber gap decisions](https://github.com/leaderiop/effect-cucumber/issues/11)
(a downstream "BDD Quality Ceiling" audit, this repo's own gaps, and a
completeness survey against comparable Cucumber implementations and Effect's
own testing ecosystem). **Design locked** means the shape below is decided
and ready to build; **spike in progress** means a working prototype is being
built to de-risk the decision before it locks.

- **Retries / `it.flakyTest` at the Scenario level — design locked.**
  `@effect/vitest@4.0.0-rc.112` ships `it.flakyTest`/`flakyTest`
  (`scoped → sandbox → retry(recurs(10), 30s cap) → orDie`), and this
  repository's own `ScenarioEffect.ts` already provides the per-Scenario
  Layer innermost — the composition-order requirement
  [ADR-EC-009](decisions/009-cross-step-state-lives-in-a-ref.md) exists to
  protect is preserved for free. Exposed via a `@retry` Gherkin tag (fixed at
  `flakyTest`'s own defaults for v1, consistent with `@skip`/`@only` carrying
  no parameter) rather than a code-level option; wraps `buildScenarioEffect`
  in `flakyTest` before it reaches `it.effect`.
  ([#13](https://github.com/leaderiop/effect-cucumber/issues/13))
- **A Rule that can narrow or replace the ambient World's `Context.Service`,
  not only extend it — design locked, spike-proven.** A working `.types.ts`
  spike compiled a third `RuleRegistrar` overload —
  `<R2,E2,RNarrowed>(name, extraLayer, narrow: (dsl: RuleDsl<ROut|R2>) => RuleDsl<RNarrowed>, define: (dsl: RuleDsl<RNarrowed>) => void)`,
  backed by real `Effect.updateContext` calls — with BOTH compiler directions
  proven, not just designed: the narrowed World type-checks and runs
  correctly (real service values reached only through the reshaped Tags),
  and a step reaching for the now-hidden Feature-level ambient service is
  rejected by name (`effect(missingEffectContext)`) — the exact case the
  current `RuleDsl<ROut | R2>` union cannot reject today. One real,
  documented cost: the context-reshaping function is hand-written per Rule,
  not auto-derived, stated as a tradeoff rather than hidden (the same way
  INV-EC-003's `any`-boundary cost is documented, not hidden). Does not
  reopen [ADR-EC-006](decisions/006-two-layer-scopes-only.md)'s "no third
  Layer scope" decision — this narrows the RESULT type a Rule's Scenarios
  see, not a new build-once tier. (BDD Quality Ceiling Gap #3;
  [#23](https://github.com/leaderiop/effect-cucumber/issues/23))
- **Global (suite-wide) `BeforeAll`/`AfterAll` hooks — design locked: docs
  only, no new DSL surface.** vitest's own `globalSetup`/`globalTeardown`
  already covers the suite-wide case today; every framework surveyed that
  supports this hits the same worker-isolation caveat this library's
  Feature-scoped once-cell already documents. Closes with a README section
  showing `globalSetup`/`globalTeardown` as the sanctioned path — revisit a
  typed wrapper only if the concurrent-execution work below ends up
  touching this same hook-lifecycle code anyway.
  ([#35](https://github.com/leaderiop/effect-cucumber/issues/35))
- **Tagged/conditional hooks — design locked, spike-proven.** A working
  spike ran a real `Before("@db and not @slow", fn)`-style overload against
  a real tagged `.feature` fixture — 4/4 passing, confirmed running only for
  matching Scenarios. Correction to the original research: the parser isn't
  `@cucumber/tag-expressions` (not in this repo's dependency tree at all) —
  it's `@vitest/runner`'s own exported `createTagsFilter`, the same function
  backing vitest's `--tagsFilter`, so no new dependency is needed.
  `BeforeAllScenarios`/`AfterAllScenarios` are excluded from the overload —
  no coherent single-Scenario tag set exists to check there, consistent with
  their existing Rule-dsl restriction. Composes additively with existing
  Rule/Feature scoping; the existing "independent batch, combined failure"
  guarantee survives (a filtered-out hook is excluded before the batch is
  assembled, proven with a dedicated test). One recurring cost carried over
  from ADR-EC-026: this needs the same pre-declared "tag universe" CLI
  filtering already requires. ([#32](https://github.com/leaderiop/effect-cucumber/issues/32))
- **Attachments — a `World.attach()` equivalent — design locked,
  spike-proven.** A working spike attached data from inside a step and saw
  it rendered directly under a real failure panel via `context.annotate()`
  — end to end, not simulated. `VitestTestApi.ts` (already permitted to name
  vitest) captures the per-test `TestContext` from `@effect/vitest`'s
  `it.effect` callback and provides a live `Attachments` service built from
  it, mirroring `testEnv`'s existing crossing mechanism. Needs `TestApi.ts`
  widened to `Scope.Scope | Attachments` — a small, type-only,
  seam-compliant change (`scripts/verify-testapi-seam.sh` still passes
  against it). `AfterAllScenarios` never receives a live `TestContext`, so
  `Attachments` is a **compile-time-rejected** capability there, not a
  silent runtime no-op — consistent with how per-Scenario-only services are
  already rejected by name at that hook elsewhere in this DSL.
  ([#33](https://github.com/leaderiop/effect-cucumber/issues/33))
- **Rerun-failed-only support — design locked, spike-proven.** A working
  spike ran the full write→read cycle for real: a 3-Scenario Feature with
  one deliberate failure, run once (all 3 ran), a script converted vitest's
  own `--reporter=json` output into a manifest, run again with
  `rerunFailedOnly` — exactly 1 of 3 registered. Key finding:
  `ScenarioKey.ts`'s existing `(ruleId, astName)` key is NOT reusable across
  runs — `ruleId`/`ParsedScenario.id` come from a fresh `IdGenerator.uuid()`
  on every `loadFeature()` call, random per parse. The real stable key is
  `(featureName, ruleName, emittedTitle)`, reusing `OutlineTitle.ts`'s
  existing per-row disambiguation. Write side is a standalone script over
  `--reporter=json`, not a custom `Reporter` — `task.meta` is
  JSON-reporter-only ([#17](https://github.com/leaderiop/effect-cucumber/issues/17)'s
  finding already settled this). Two rough edges found by actually running
  it, both must land before this ships (not optional polish): a Feature
  whose every key is stale collapses to vitest's own "No test found in
  suite" crash — needs a synthetic skip node — and the key needs the
  Feature's file `uri` added, since same-named Features in different files
  would otherwise collide. ([#34](https://github.com/leaderiop/effect-cucumber/issues/34))
- **`Effect.Metric` at the Scenario emission boundary — design locked,
  spike-proven, ships always-on.** A working spike wired `Metric.timer`
  (duration) and `Metric.counter` (pass/fail, tagged by outcome) into the
  REAL `Runner.ts` at both its `buildScenarioEffect` call sites (+16/−4
  lines, zero `TestApi.ts` changes) — full 899-test suite green, and the
  metrics themselves observed correct when actually run
  (`scenario.result: {pass:1, fail:1}`, `scenario.duration` histogram
  matching). Always-on, no opt-out, consistent with `Effect.fn` tracing
  spans already being always-on (ADR-EC-005). Composes with the
  `@effect/opentelemetry` exporter recipe already shipped in
  `packages/vitest/README.md`. Two things this locks in for #13 (retries)
  to honor: the metrics wrapper must sit OUTSIDE any retry combinator, or a
  Scenario that fails then eventually passes double/triple-counts terminal
  outcomes; and every Scenario runs under the ambient simulated `TestClock`
  (ADR-EC-018), so `scenario.duration` reads ~0ms unless a step itself
  advances the clock — worth a documented caveat beside the metric.
  ([#26](https://github.com/leaderiop/effect-cucumber/issues/26))
- **Concurrent Scenario execution — design locked, spike-proven, ships with
  a new per-Scenario timeout knob.** A working spike reproduced the exact
  bug for real first (a 400ms `BeforeAllScenarios`, a 100ms-timeout Scenario
  and a 2000ms-timeout Scenario under `describe.concurrent`: the long one
  failed too, killed by the short one's interrupt cascade) and then
  confirmed the fix resolves it (both pass in ~2ms) by moving
  `BeforeAllScenarios`/`AfterAllScenarios` onto a real vitest `beforeAll`
  with its own timeout budget, registered once at the Feature block level,
  every Scenario reading a captured `Exit` rather than racing the batch.
  Caught and fixed a real regression risk along the way: a naive "let
  `beforeAll` throw" version breaks BEH-EC-017's "same failure reported by
  every Scenario individually" guarantee (a real vitest `beforeAll` failure
  marks siblings _skipped_, not failed) — fixed by capturing the `Exit`
  instead. The "nothing attempted" carve-out needed no new tracking — vitest
  already withholds a block's `beforeAll`/`afterAll` when nothing inside it
  will run (verified against `.skip`, `-t`, and `--tagsFilter`, including
  nested Rules). Full monorepo suite (900 tests) unchanged under sequential
  execution. Ships together with a per-Scenario `testTimeout` configuration
  knob — surfaced by the spike as a real gap, and the actual thing that
  makes concurrent execution useful (without it, every Scenario still
  shares the Feature's one timeout, undercutting the point of running them
  concurrently). ([#37](https://github.com/leaderiop/effect-cucumber/issues/37);
  feasibility research: [#36](https://github.com/leaderiop/effect-cucumber/issues/36))

## Under consideration

- **An oxlint plugin for LINT-01** — deferred behind the shipped shell-script
  route ([`scripts/templates/verify-consumer-ref-state.sh`](../scripts/templates/verify-consumer-ref-state.sh),
  documented in `packages/vitest/README.md`'s "Recommended lint and compiler
  configuration" section) until oxlint's JS/TS plugin API graduates out of
  alpha; this repo's own `tools/oxlint/effect/` proves the API works today,
  the concern is upstream stability, not feasibility.
- **Which package owns `ManagedRuntime` construction** — `@effect-cucumber/vitest` itself, or a separate thin
  adapter shared with a future non-vitest runner package. Raised as a Follow-up item in
  [ADR-EC-021](decisions/021-effect-and-platform-are-peer-dependencies-of-gherkin.md) during the `Source.ts`/
  `loadFeature.ts`/`Errors.ts` rewrite; not decided by that ADR and still open.
- **Vendored `@effect/oxc` rules** (`tools/oxlint/effect/`, from GSD Stack
  research) — 4 of Effect's own 5 unpublished oxlint rules, MIT-licensed,
  with `no-unused-internal` deliberately excluded (its one rule requiring
  `typescript <7.0.0`, incompatible with this project's TS 7). Currently
  untracked, not yet formally adopted — decide during Phase 0 planning
  whether to commit `tools/` and wire it into the lint config, or drop it.
- **A scheduled canary CI job against a floating `effect@rc`** — GSD Stack
  research's own prescription, not an ecosystem convention (no comparable
  project does this). Optional, not a hard requirement for Phase 0.
- **dprint's `semiColons: "asi"` (no-semicolon) house style** — Effect's own
  convention, flagged by research as a real stylistic commitment worth an
  explicit yes/no rather than silent inheritance when `dprint.json` is
  copied over in Phase 0.

## Explicitly not planned

| Item                                                                        | Why                                                                                                                                                                                                                                                                                                                                                                                                               |
| --------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A bespoke Gherkin parser                                                    | [ADR-EC-011](decisions/011-official-cucumber-parser-packages.md) — depend on official `@cucumber/gherkin` instead                                                                                                                                                                                                                                                                                                 |
| A bespoke step-matching syntax                                              | [ADR-EC-007](decisions/007-cucumber-expressions-for-step-matching.md) — cucumber-expressions is reused verbatim                                                                                                                                                                                                                                                                                                   |
| A third "shared within a Rule" Layer scope                                  | [ADR-EC-006](decisions/006-two-layer-scopes-only.md), [ADR-EC-010](decisions/010-rule-and-scenario-scoped-extra-layers.md) — promote to the Feature's `shared` Layer instead                                                                                                                                                                                                                                      |
| A custom cucumber HTML/report format                                        | Not a goal for v1 — defer to vitest's own reporters                                                                                                                                                                                                                                                                                                                                                               |
| A vitest plugin or custom test DISCOVERY mechanism                          | Not needed — a `.feature` file is plain data; the `.steps.ts` module is what vitest discovers, unmodified (see `spec/overview.md`). Narrower than it sounds: a Vite plugin appending to `test.watchTriggerPatterns` (§ Planned, watch-mode rerun) is a watch-trigger config helper, not a discovery mechanism — it doesn't change what vitest treats as a test file, only when an already-discovered test reruns. |
| GxP/regulatory compliance tooling                                           | Out of scope — this is a testing library, not a regulated domain, unlike some sibling projects that adopted this same spec-driven method                                                                                                                                                                                                                                                                          |
| An `it.live`/`@live` tag to opt a Scenario out of the simulated `TestClock` | Considered and rejected for now — narrow value, and `TestClock.withLive` (§ Planned, once its doc lands) already gives a code-level answer to the same need without new DSL surface. Revisit only if real demand surfaces.                                                                                                                                                                                        |
