# Project Research Summary

**Project:** effect-cucumber
**Domain:** Effect-native Gherkin/Cucumber BDD layer hosted on vitest (two-package TypeScript library monorepo, Effect v4 ecosystem)
**Researched:** 2026-08-28
**Confidence:** HIGH overall (see per-area breakdown below)

## Executive Summary

effect-cucumber is a small, two-package (`@effect-cucumber/gherkin` + `@effect-cucumber/vitest`) library that reimplements Gherkin/Cucumber BDD on top of vitest rather than shipping its own CLI — the same "reimagined for the host runner" school as `@amiceli/vitest-cucumber` and `jest-cucumber`, but with a genuinely novel differentiator: compile-time-checked scenario dependencies via `Layer`, a typed `Context.Service` World, and `TestClock` composing transparently. No comparable library (cucumber-js, `@amiceli/vitest-cucumber`, jest-cucumber, playwright-bdd) has an answer to any of these three. The locked 12 behaviors and 14 ADRs already cover essentially all Gherkin table-stakes except three cheap, real gaps (feature↔step drift detection, `loadFeature` failure reporting, and Outline row test titling) and one hard, deliberately-deferred gap (reusable step definitions across features, which needs its own milestone because a shared step's `R` must reconcile against every consuming Layer).

The recommended approach is to build strictly bottom-up along the verified dependency graph: `gherkin`'s parse→compile→correlate pipeline first (the riskiest phase, because `@cucumber/gherkin`'s `compile()` has several silent-failure edge cases that must be turned into loud errors), then the vitest package's registration→plan→emit pipeline, with the compile-time `R`-checking type-test file written *before* any runtime code in that phase. Tooling should follow the Effect v4 ecosystem's convention exactly (oxlint + dprint + `tsc -b` only + ESM-only + `publishConfig.exports` swap + pnpm catalogs + peer-dependency `effect`) rather than the more commonly-searched-for v3/legacy patterns (ESLint, `@effect/build-utils`, dual CJS/ESM), which are frozen and actively wrong for this stack.

The dominant risk is not "will this be hard to build" but "will it silently lie" — several defects found in the underlying libraries (`@cucumber/gherkin`'s `compile()`, `@effect/vitest`'s `layer()`) produce a **green test that ran nothing or ran the wrong thing**, which is the worst possible failure mode for a BDD tool whose entire value proposition is trustworthy authoring-time feedback. Two dependency/packaging defects have already been fixed directly in the repo (see below); everything else in this summary — including three genuine bugs discovered in the locked spec itself — is still open and needs a decision before or during roadmap execution.

## Already Resolved (do not re-open)

Two research-driven fixes have already been applied to the repo, formalized as **ADR-EC-015** and **ADR-EC-016**:

- **ADR-EC-015:** `effect` moved from a hard `dependency` to a `peerDependency` (`^4.0.0-rc.112`) in `@effect-cucumber/vitest`; `effect` dropped **entirely** from `@effect-cucumber/gherkin` (it has no Effect-specific logic, matching ADR-EC-013's original charter — this closes STACK.md's open question #3 as **decided: no**). `@cucumber/messages` added as an explicit dependency of `@effect-cucumber/gherkin` (fixes PITFALLS.md's Pitfall 16, a live `ERR_MODULE_NOT_FOUND` defect that blocked `loadFeature`'s first line of code).
- **ADR-EC-016:** `@effect/tsgo` wired as the `tsc` language-service plugin (registered under the legacy plugin name `"@effect/language-service"`), with `ignoreEffect{Warnings,Errors}InTscExitCode: false` — diagnostic errors (`missingLayerContext`, `missingEffectContext`, `duplicatePackage`, `floatingEffectInVitest`) genuinely fail `tsc -b`, deliberately diverging from upstream Effect's own more permissive posture.

Everything else below is open.

## CRITICAL: Spec-Contradicting Findings

These are not generic recommendations — they are places where research found the **locked spec itself is wrong or internally inconsistent**, verified against the actual installed libraries. These need a decision before the phases that touch them, not just a "keep in mind."

### 1. `spec/behaviors/03-rules-outlines-and-testclock.md`'s own worked example is broken

The example destructures only `{ Background, Rule }` at feature level, then calls `Given(...)` inside a bare `Scenario('Expired…', () => {…})` callback — but that callback is never given `Given` as a parameter, and `Given` is not in scope. Meanwhile `01`'s worked example destructures `Given/When/Then` from `describeFeature`'s outer dsl and uses them ambiently inside `Scenario`, and `ScenarioOutline` in the same spec *does* receive `({ Given, When, Then })` as a callback parameter. The three worked examples are mutually inconsistent about whether `Scenario`'s callback receives a dsl object at all. (ARCHITECTURE.md Open Question #2; corroborated by PITFALLS.md Pitfall 11's note that `spec/behaviors/03` needs correction.)

**Recommended resolution:** give `Scenario` the same `(dsl) => void` callback shape as `ScenarioOutline` and `Rule`, while keeping the ambient destructure-from-outer-scope form also working (the scope-stack architecture supports both). Treat `03`'s unbound `Given` as a pre-implementation documentation bug to fix, not a behavior to implement literally. **Must be resolved before the `Registry`/`Dsl` modules are finalized (Phase 4/P4 below).**

### 2. ADR-EC-014's claim about what `compile()` substitutes is false in a specific, undocumented case — and ADR-EC-007's correction states a lifecycle that cannot be implemented as written

ADR-EC-014 states that `compile()` substitutes Gherkin placeholders, treated in the spec as a blanket guarantee. It is **not** true for Background steps nested inside a Scenario Outline: `compileScenarioOutline` pushes Background steps with empty `variableCells`, so a `<placeholder>` in a Background step stays a literal, un-interpolated string in every Outline row — producing a confusing "undefined step" failure that points at the wrong root cause (PITFALLS.md Pitfall 11, `[VERIFIED]`).

Separately, and independently, **ADR-EC-007's correction is internally self-contradictory**: it assumes both "one `ParameterTypeRegistry` per `loadFeature` call/process" *and* that custom parameter types are registered "up front" at module top level — but a fresh-registry-per-call model means a top-level registration call only ever populates the registry that existed at that moment, while a process-global registry throws on any duplicate name the second time a feature file registers the same custom type. `ParameterTypeRegistry`'s constructor also pre-populates 11 built-in names, and `defineParameterType` throws on any collision — including with those built-ins (PITFALLS.md Pitfall 14, `[VERIFIED]`, and the single most-reported failure class in this whole library category across comparable projects).

**Recommended resolution:** amend ADR-EC-014's Consequences to state the Background-in-Outline exception explicitly, with a `loadFeature`-time check that fails loudly on any un-interpolated `<...>` remaining in any pickle step. Amend ADR-EC-007's correction to the "custom types are data, replayed into a fresh registry per call" model (PITFALLS.md's recommended fix) — this is also the one place Effect's `Layer` genuinely eliminates a failure class the rest of the ecosystem has no answer for. **Both need a spec amendment before Phase 1 (correlation) and Phase 2 (parameter types) respectively.**

### 3. `@effect/vitest`'s `layer(...)` shares `TestClock` across every Scenario in a Feature — directly contradicting a stated core-value requirement

`PROJECT.md` states: *"TestClock composes transparently — a step reading `Clock` sees `@effect/vitest`'s simulated clock with zero test-specific code."* This holds only on the **plain, non-shared** path. `layer(L)(...)` builds `Layer.provideMerge(L, TestEnv)` (where `TestEnv` bundles `TestClock`/`TestConsole`) **exactly once** and memoizes it for the whole block, whereas the plain `it.effect` path provides `TestEnv` fresh per test. Reproduced directly: inside a `shared`-Layer Feature, one Scenario's `TestClock.adjust("1 hour")` leaks into every subsequent Scenario in that Feature — Scenario execution order becomes semantically load-bearing, and a suite that passes run whole can fail under `-t` filtering, or vice versa (PITFALLS.md Pitfall 1, `[VERIFIED]` with a working fix reproduced: pass `excludeTestServices: true` to `layer(...)` and provide `TestEnv` yourself, per-Scenario, inside each generated `it.effect` body — this restores per-Scenario `TestClock` isolation **without** losing the shared Layer's build-once memoization).

**This is Critical and specifically gates BEH-EC-012/ADR-EC-006's shared-Layer feature (P9).** If the `excludeTestServices` fix is not adopted, `spec/invariants.md` must carry an explicit, loud carve-out to INV-EC-002 rather than silently shipping the leak.

## Key Findings

### Recommended Stack

Full detail: `STACK.md`. The Effect ecosystem's library tooling bifurcated between a frozen v3 pattern (ESLint, `@effect/build-utils`, dual CJS/ESM, `@effect/dtslint`) and the current v4 pattern this project must follow — verified against Effect's own `main`, `@typeonce/effect-machine`, and `effect-mq`.

**Core technologies:**
- **oxlint + dprint** — linting/formatting; Effect's `main` runs exactly this; `@effect/eslint-plugin` is frozen since April 2025. Effect's own Effect-specific oxlint rules (`@effect/oxc`) are unpublished but MIT-licensed — vendor 4 of its 5 rules (done, see `tools/oxlint/effect/`; `no-unused-internal` excluded because it requires `typescript <7.0.0`, incompatible with this project's TS 7).
- **`tsc -b` only, no bundler** — every v4 reference project emits with `tsc` alone; verified locally that TypeScript 7.0.2 fully supports `-b`, `composite`, `declaration`, `declarationMap`, and `rewriteRelativeImportExtensions` (this falsifies widely-repeated 2026 blog claims that TS 7's Go-native compiler dropped these).
- **ESM-only, `publishConfig.exports` swap pattern** — not a choice: `effect@4`, `@effect/vitest@4`, `@cucumber/gherkin@42`, and `@cucumber/cucumber-expressions@20` are all ESM-only with no CJS build; a CJS `@effect-cucumber/gherkin` could not `require()` its own primary dependency.
- **`effect` as `peerDependency`** — DONE (ADR-EC-015). Every comparable library (`@effect/vitest`, effect-machine, effect-mq) does the same; the alternative silently installs two copies of `effect` whose brand checks pass each other's identity in v4 (string-literal TypeIds), producing late, quiet, hard-to-diagnose failures rather than a clean type error.
- **pnpm catalogs** for the effect/@effect-vitest/vitest/typescript pin, one bump point across both packages — but a catalog entry for a peer dependency must hold a *range*, not an exact pin, or `pnpm pack` bakes the pin into the published peer range (Pitfall 20).
- **`@effect/tsgo`** — DONE (ADR-EC-016), gives `missingLayerContext`/`missingEffectContext`/`duplicatePackage` as a second, type-aware enforcement layer on top of INV-EC-003.
- **Changesets with a `fixed` group**, **tstyche** for type-level tests, **npm trusted publishing (OIDC)** — all direct copies of Effect/effect-machine convention.
- **Node 24 primary, `[22, 24]` CI matrix**; **`node-version: 24`** is Active LTS as of the research date.

**Explicitly rejected:** ESLint, `@effect/build-utils`, dual CJS/ESM, tsup/tsdown/rollup/unbuild, `@effect/language-service` (the TS5/6-era package — TS 7 needs `@effect/tsgo` instead, same plugin name though), `@effect/dtslint`, Nx/Turborepo/Lerna, projen, Biome, semantic-release, vitest 5 (still beta/rc and unsupported by `@effect/vitest@4.0.0-rc.112`'s peer range).

**Open, not yet decided:** pnpm version bump to 11.x; whether to adopt `publint`, `madge`, `pkg-pr-new`; dprint's `semiColons: "asi"` (no-semicolon) house style — a real stylistic commitment, flag for an explicit decision; a scheduled canary CI job against a floating `effect@rc` (no ecosystem precedent found — this would be a novel prescription, not a convention to copy); a documented policy that every Effect rc bump ships as a minor changeset while pre-1.0.

### Expected Features

Full detail: `FEATURES.md`. The locked 12 behaviors (BEH-EC-001…012) cover essentially all Gherkin/Cucumber table stakes already. Gap analysis against five comparable libraries found five gaps, two of which are real table-stakes omissions:

**Must have (cheap, recommend folding into the initial milestone alongside the locked 12):**
- **Gap 1 — feature↔step-definition drift detection.** Nothing in the spec currently defines behavior for an unmatched Pickle step, an unused registered pattern, or an ambiguous match. Every comparable library treats this as a headline feature (three of four have it on by default). Directly on-mission: it converts a class of runtime failure into an authoring-time error, which is the project's stated core value applied to the one axis the Layer check doesn't cover. LOW-MEDIUM complexity.
- **Gap 3 — `loadFeature` failure behavior** (missing file, malformed `.feature`, unsupported dialect) is unspecified; a raw throw at module top level currently degrades into an unhelpful vitest *collection* error. LOW complexity.
- **Gap 4 — Scenario Outline row test titles** are unspecified, but load-bearing given the "vitest reporters + `-t` filtering are our reporting story" decision — two Outline rows with the same title are unfilterable and indistinguishable in output. LOW complexity.

**Should have, but explicitly deferred to the next milestone:**
- **Gap 2 — reusable step definitions across Scenarios/Features.** BEH-EC-012's own worked example demonstrates the problem (the same step is written verbatim twice). This is table stakes — three of four comparables make it the default — but it is genuinely HIGH complexity here specifically because a shared step's `R` must reconcile against every consuming Layer, a problem with no ecosystem precedent to copy (every comparable's steps are untyped, so they can hand-wave it). Users will hit it on their second feature file; do not park it indefinitely, but do not absorb it into the first milestone either.

**Confirm cheaply, don't schedule a phase:** Gap 5 (non-English dialects) is probably free — `@cucumber/gherkin`'s parser reads the `# language:` header itself — confirm only if Gap 1's drift detection ever needs to compare a step's literal keyword.

**Already correctly out of scope, do not re-open:** full tag expressions and retry (already parked in `spec/roadmap.md`), any HTML/JSON/Allure report format, an own CLI/plugin/test-discovery mechanism, step-stub codegen from `.feature` files (the naive version emits `Effect<void, never, never>`, which type-checks against any Layer and actively undercuts the type-safety value proposition), scenario-level parallelism inside one feature file, `attach()`/screenshots.

### Architecture Approach

Full detail: `ARCHITECTURE.md`. A strict, one-directional pipeline in each of the two packages, joined by exactly one cross-package data contract (`ParsedFeature`). `@effect-cucumber/gherkin` is synchronous, has no Effect runtime dependency, and does Source -> Parser -> Pickles -> Correlate (the ADR-EC-014 join of `GherkinDocument` structure and `Pickle` execution data by `astNodeIds`) -> `ParsedFeature`. `@effect-cucumber/vitest` runs `describeFeature` as three strictly sequential passes — **Register** (run the `define` callback once, build a scope tree; nothing executes), **Plan** (join `ParsedFeature`'s scenarios against the registered scope tree, resolve every step's text to a definition via cucumber-expressions matching), **Emit** (walk the plan, call `describe`/`it.effect`) — with a `TestApi` seam so `Runner` is the *only* module that ever imports `describe`/`it`, making 90% of the library unit-testable without vitest-in-vitest.

**Major components:**
1. **`Correlate`** (gherkin) — the riskiest, highest-value module in the whole project. Builds the two-`Map` index (`astNodeId -> Pickle[]` and `step.id -> origin`) that makes placeholder substitution, tag inheritance, Background stacking, and keyword recovery all fall out for free, matching Cucumber's exact semantics rather than a hand-rolled reimplementation.
2. **`Plan`** (vitest) — the only place resolution happens: joins the correlated `ParsedFeature` against the registered scope tree via a scope-chain walk (Scenario -> Rule -> Feature), resolving every step's text and typed args *before* any test runs — the architectural reason undefined/ambiguous steps can be a collection-time-ish concern rather than a runtime one.
3. **`ScenarioEffect` + `Runner`** (vitest) — compose one `Effect.gen` per scenario (hooks + ordered steps + `Effect.ensuring`), then emit it through the `TestApi` seam, which absorbs the one real surprise in `@effect/vitest`: `layer(...)`'s callback receives a *different* `it` object than the module-level import.

**Suggested build order** (verified dependency graph, 12-phase grouping) is bottom-up: gherkin's parsing subtree first (riskiest, most fixture-driven), then its parameter-type/step-matcher subtree in parallel, then the vitest package's registration half, then the two packages' one cross-package integration point (`Plan`), then scenario-effect building, hooks, tags, the shared-Layer path last (because it is the one path whose behavior genuinely differs), and dogfooded acceptance last of all.

### Critical Pitfalls (top ones beyond the three spec-contradicting findings above)

Full detail: `PITFALLS.md` (34 pitfalls total, HIGH confidence — nearly all `[VERIFIED]` by running the actual installed libraries).

1. **Async registration silently produces zero tests, no error, no warning** — vitest's collector is a synchronous-registration protocol; `layer(...)`'s 1-arg callback form never awaits. Any async `loadFeature`/`describeFeature` path is a one-way door: fix the API shape (synchronous `loadFeature`, e.g. via Vite's `?raw` import) in Phase 1, because this cannot be walked back after publish without a breaking API change.
2. **`compile()` silently drops or duplicates tests on authoring mistakes** — an empty-Examples Outline yields zero pickles; a zero-step Scenario yields a vacuously-passing green test; `astNodeIds` is one-to-many and a naive `Map` keyed on it silently keeps only the last Examples row. All are silent, all must become loud `LoadFeatureError`s in Phase 1, with fixture-driven regression tests for each.
3. **A vacuous generic `R` constraint would make the project's entire reason to exist decorative rather than real.** Copying the Effect v3 `YieldWrap` idiom for the step-parameter type (a plausible mistake when working from training data or an outdated tutorial) compiles fine and silently rejects nothing, because v4 removed `YieldWrap`. The mitigation is procedural: ship a `@ts-expect-error` negative type-test file as the **first task** of the `describeFeature` type-surface phase, checked under `tsc --noEmit` in CI, so a future regression fails loudly.
4. **Undeclared `@cucumber/messages`** — already fixed (ADR-EC-015), but was a live `ERR_MODULE_NOT_FOUND` blocking `loadFeature`'s first line.
5. **Step ambiguity is entirely this library's problem to solve** — `cucumber-expressions` never detects two patterns matching one step text; a naive "first registration wins" runner makes step-argument type depend on definition order, silently changing under refactor. Must match against *all* registered patterns and fail on 0 or >1 matches.
6. **The `latest` npm dist-tag points at v3** for both `effect` and `@effect/vitest` — every install instruction this project publishes must carry `@rc` explicitly, or new users install the wrong major and get incomprehensible errors.

## Implications for Roadmap

Based on combined research, the phase structure below merges ARCHITECTURE.md's 12-phase module-dependency grouping with PITFALLS.md's P0-P10 pitfall-to-phase mapping (the two independently converged on nearly the same shape — strong cross-validation). P0's dependency/packaging items are partially done (ADR-EC-015/016); the remainder is genuinely still open.

### Phase 0: Workspace, toolchain, and dependency/version policy
**Rationale:** Blocks everything downstream; several items here (peer deps, `@cucumber/messages`) already caused a live compile blocker once.
**Delivers:** Finalized package manifests (peerDependency shape — done; `publishConfig.exports` swap — open), pnpm catalog for the rc pins (open, watch Pitfall 20's pack-time-expansion trap), oxlint/dprint config, `@effect/tsgo` wiring (done), CI job structure, README install instructions carrying `@rc` explicitly (Pitfall 19), an rc-bump checklist naming the acceptance suite as the regression gate (Pitfall 18).
**Avoids:** Pitfalls 16 (done), 17 (done), 18, 19, 20.
**Research flag:** Standard patterns — copy Effect/effect-machine's config near-verbatim; skip deep research-phase.

### Phase 1: `@effect-cucumber/gherkin` — `loadFeature` (parse, compile, correlate)
**Rationale:** The riskiest phase in the whole project — `@cucumber/gherkin`'s `compile()` has multiple silent-failure edge cases (empty Examples, zero-step Scenarios, id collisions, un-interpolated Background placeholders in Outlines) that must become loud, typed errors here or they surface as confusing failures or false-green tests much later.
**Delivers:** `Source`, `Parser`, `Pickles`, `Model`, `Correlate`, `DataTable` skeleton, `loadFeature` composition, and a fixture suite covering every row of the "silent-wrong compile() outputs" table.
**Also resolves:** Spec-contradicting finding #2 (ADR-EC-014 substitution exception), Open Question #4 (match Scenario to registered scope by the AST node's un-interpolated name, not the interpolated pickle name), Open Question #1 (`Background` as a step container, consistent with `Scenario`), Gap 3 (`loadFeature` failure path), and the API-shape decision that Pitfall 2 says is otherwise unfixable after publish (synchronous `loadFeature`, `?raw`-style feature loading).
**Avoids:** Pitfalls 2, 3, 7, 8, 9, 10, 11, 12, 24, 30 — nearly half of all pitfalls found map here.
**Research flag:** Needs research/careful design during planning — this is the highest-density phase for both spec gaps and verified library defects.

### Phase 2: Parameter types + step matching
**Rationale:** Independent of Phase 1's parsing subtree (parallelizable), but must resolve before `Plan` can match steps.
**Delivers:** `ParameterTypes` (one registry, custom types as replayable data — not a module singleton), `StepMatcher` (lazy compilation, memoized per `(registry, pattern)`, matches against *all* patterns, not first-match).
**Also resolves:** Spec-contradicting finding #2's ADR-EC-007 half (registry lifecycle amendment).
**Avoids:** Pitfalls 13, 14, 15, 25, 28.
**Research flag:** Needs the spec amendment decided before implementation; pattern itself (fresh-registry-per-call, data-driven custom types) is already fully specified by research.

### Phase 3: DataTable / DocString wrapper
**Rationale:** Pure, self-contained, no upstream dependency — good parallel-wave filler.
**Delivers:** `.hashes()`/`.raw()`/`.rowsHash()` wrapper (ADR-EC-008's correction), and the calling convention for a step that receives **both** a DocString and a DataTable (a real `@cucumber/gherkin@42` capability the spec doesn't contemplate).
**Avoids:** Pitfall 33.
**Research flag:** Standard, low-risk — skip deep research-phase.

### Phase 4: `describeFeature`'s type surface (`Dsl`/`Registry`, compile-time `R` checking)
**Rationale:** The project's entire value proposition lives here; get the type test infrastructure in place before any runtime registration code.
**Delivers:** `StepDefinition` normalization (generator-vs-Effect detection), `Registry` (per-instance scope stack, never a module singleton), `Dsl` with `R`-threading, and — as the explicit **first task**, before any of the above — a `@ts-expect-error`-based negative type-test file proving an unprovided-service step fails to compile, plus a positive test proving `Effect.acquireRelease` (which needs `Scope` in `ROut`) compiles.
**Also resolves:** Spec-contradicting finding #1 (`Scenario`'s dsl-callback shape, fixing the `spec/behaviors/03` bug).
**Avoids:** Pitfalls 4, 5, 6, 27.
**Research flag:** Pattern is well-specified by this research pass (the exact type signatures to use/avoid are documented); implementation risk is in disciplined execution, not unknowns.

### Phase 5: Scenario-Effect builder + `Runner` emission
**Rationale:** First point where the two packages' registration/planning halves produce something vitest actually runs.
**Delivers:** `Layers` (shared vs per-scenario provision as an explicit parameter, not an implicit branch), `ScenarioEffect` (fail-fast + `Effect.ensuring`), `TestApi` seam, `Runner`. Also where Gap 1 (drift detection) and Gap 4 (Outline row test titles) get implemented, since both need the resolved plan.
**Avoids:** Pitfalls 21, 23, 26, 31.
**Research flag:** Standard once Phase 4's types are settled.

### Phase 6: Hooks (Before/After, BeforeStep/AfterStep, BeforeAll/AfterAll)
**Rationale:** Needs `ScenarioEffect`'s structure but no new architectural pattern.
**Delivers:** BEH-EC-006, INV-EC-004 verification.
**Research flag:** Standard — skip deep research-phase.

### Phase 7: Rule / Scenario Outline / Rule-scoped extra Layers
**Rationale:** Exercises the scope-chain and Outline-row machinery built in Phases 1 and 4 together.
**Delivers:** BEH-EC-009/010, plus the loop-variable-capture regression test (Outline rows must not share mutable state — a bug `@amiceli/vitest-cucumber` itself shipped).
**Avoids:** Pitfall 34.
**Research flag:** Standard.

### Phase 8: Tags (`@skip`/`@only`, exclude filtering)
**Rationale:** vitest v4 ships a native test-tag system that maps almost exactly onto Gherkin tags and sidesteps the CI `.only` failure mode entirely — a genuine "closes a parked roadmap item for nearly free" opportunity worth designing deliberately rather than defaulting to `.only`/`.skip`.
**Delivers:** BEH-EC-008, plus (recommended) native vitest tag emission as the `@only`/tag-filtering mechanism instead of `.only`.
**Avoids:** Pitfalls 15's skip-ordering rule, 22, 32.
**Research flag:** Light research recommended — vitest v4's native tag API is new enough that its config-time tag-declaration requirement is worth confirming against the installed version before committing to the design.

### Phase 9: Shared Layer via `@effect/vitest`'s `layer(...)`
**Rationale:** Isolated on purpose — it is the one path whose behavior genuinely differs from the default, and it is where Critical Spec-Contradicting Finding #3 must be resolved.
**Delivers:** BEH-EC-007, with the `excludeTestServices: true` + manually-provided per-Scenario `TestEnv` fix (verified working), or an explicit, loud `spec/invariants.md` carve-out if that fix is rejected. Also: constrain the shared Layer's type to `Layer<R, never, never>` so a failable shared Layer is a type error rather than an unrecoverable defect (Pitfall 27).
**Avoids:** Pitfalls 1 (Critical), 27, 29.
**Research flag:** The fix is already fully verified by this research pass — low remaining research need, but this phase must not be skipped or deprioritized given the severity.

### Phase 10: Composition root (`describeFeature`) + dogfooded acceptance suite
**Rationale:** Everything converges here; this is also the traceability-closing phase.
**Delivers:** The BEH-EC-001-004 worked example running end to end; `@REQ-EC-NNN`-tagged acceptance `.feature` files; the "Looks Done But Isn't" checklist from PITFALLS.md run in full; INV-EC-003's wording amended to "for step bodies free of `any`" (Pitfall 6) with a lint recommendation.
**Research flag:** Standard — this is validation, not new design.

### Phase Ordering Rationale

- **Bottom-up along the verified module-dependency graph**, not by user-facing feature. Phases 2 and 3 have no dependency on Phase 1 and can run in a parallel wave; Phase 4 depends only on `effect` and on `ParsedFeature`'s *types* (not its implementation), so it can also start before Phase 1 fully completes.
- **The two hard, one-way-door API decisions are pulled to the earliest possible phase**: `loadFeature`'s sync/async signature (Phase 1) and the step-parameter generic type shape (Phase 4, first task) are both flagged by research as effectively unfixable after the first publish without a breaking change.
- **The shared-Layer path is deliberately last** among the "core DSL" phases (Phase 9) because it is the one code path proven to behave differently from every other, and de-risking the default path first means the eventual fix is additive rather than a rework.
- **Gap 2 (reusable step definitions) is deliberately excluded from this phase list entirely** — flag it for the roadmap's "next milestone" or "v1.x" section rather than a phase, per FEATURES.md's explicit recommendation; its design touches the central `R`-reconciliation mechanism and deserves to follow a working core.

### Research Flags

Needs deeper research/design during planning:
- **Phase 1** (`loadFeature`/correlate) — highest density of verified library defects and unresolved spec ambiguities; the fixture-driven test list in PITFALLS.md's "Looks Done But Isn't" checklist should become the phase's acceptance criteria directly.
- **Phase 8** (tags) — vitest v4's native tag API is new; confirm its config-time tag-declaration mechanics against the installed vitest version before finalizing the design.

Phases with standard, already-fully-specified patterns (skip `/gsd:research-phase`):
- **Phase 0** — copy Effect/effect-machine tooling config near-verbatim.
- **Phase 3, 4, 5, 6, 7, 10** — architecture, module boundaries, and the exact type signatures/fixes to use are already fully documented by this research pass; remaining work is disciplined implementation against a known checklist, not open design.
- **Phase 9** — the fix (`excludeTestServices: true`) is already verified working; the remaining work is a decision (adopt the fix vs. document a carve-out), not research.

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | Verified against live npm registry, Effect's own `main` branch, two published third-party Effect v4 libraries, and one claim (TS 7 build-mode support) verified by running TypeScript 7.0.2 locally. |
| Features | HIGH (MEDIUM for quickpickle specifically) | Cross-referenced against 4 comparable libraries' official docs/source; quickpickle's own docs site did not resolve, so that one data point rests on WebSearch/npm-page summaries only. |
| Architecture | MEDIUM-HIGH | Third-party API shapes are HIGH (verified against packages actually installed in this repo). The recommended internal module structure is derived from the locked spec plus verified APIs, not validated against a shipped reference implementation of this exact design — reasonable but not empirically proven. |
| Pitfalls | HIGH | The large majority of pitfalls are `[VERIFIED]` by directly running the installed `@cucumber/gherkin@42.0.1`, `@cucumber/cucumber-expressions@20.1.0`, `effect@4.0.0-rc.112`, `@effect/vitest@4.0.0-rc.112`, and `vitest@4.1.11` in this repo, or by `tsc`-checking a probe file. A handful of packaging/prerelease-policy items (Pitfalls 17-20) are MEDIUM-HIGH, resting partly on downstream breakage reports rather than a reproduction inside this repo. |

**Overall confidence:** HIGH. This is an unusually well-verified research pass — most claims across all four documents were reproduced against the actual installed dependencies rather than inferred from documentation or training data, and the two independent research streams (ARCHITECTURE.md's phase grouping and PITFALLS.md's P0-P10 mapping) converged on nearly the same phase structure without having been asked to align.

### Gaps to Address

- **Gap 2 (reusable step definitions across Scenarios/Features)** — genuine table-stakes gap, deliberately deferred; needs its own design pass before its own milestone, not a phase in this roadmap. Flag prominently so it isn't silently dropped.
- **Three spec-contradicting findings above** (Scenario dsl-callback shape / `spec/behaviors/03` bug, ADR-EC-014's substitution exception + ADR-EC-007's internally-inconsistent registry lifecycle, `layer(...)`'s shared TestClock) — each needs an explicit decision recorded as a spec amendment before its corresponding phase, not just a code fix.
- **`excludeTags`'s exact signature location on `describeFeature`** is referenced by BEH-EC-008 but not specified anywhere — treat as an options-object parameter, decide during Phase 8 planning.
- **dprint's `semiColons: "asi"` (no-semicolon) house style** — a real, visible stylistic commitment; needs an explicit yes/no during Phase 0 rather than being silently inherited.
- **Whether `tstyche` and the planned doc-example type-check gate overlap or should be one mechanism** — unexplored by research; low priority, resolve opportunistically during Phase 10.
- **No ecosystem precedent for CI against a moving prerelease** — the "weekly canary" workflow in STACK.md §3.4 is this research's own prescription, not a convention to copy; treat it as optional/nice-to-have for Phase 0, not a hard requirement.
- **Non-English Gherkin dialects** — probably free, but genuinely untested; a cheap confirmation check to fold into Phase 1's fixture suite rather than a separate phase.

## Sources

### Primary (HIGH confidence)
- Live npm registry (`npm view`, `npm pack`) and unpacked tarballs for `effect`, `@effect/vitest`, `@cucumber/gherkin`, `@cucumber/cucumber-expressions`, `@cucumber/messages`, `vitest`, `typescript`, `pnpm`, `oxlint`, `dprint`, and ~30 other Effect-ecosystem/tooling packages (2026-08-28).
- `Effect-TS/effect` `main` branch — package.json, tsconfig, lint/format config, CI workflows, changeset config, `packages/vitest` source.
- `typeonce-dev/effect-machine` and `TeamWarp/effect-mq` — third-party Effect v4 library monorepos, read directly.
- Local empirical verification: a two-package composite TS 7.0.2 project-reference build; multiple `tsc --noEmit` type probes against `effect@4.0.0-rc.112`; multiple real `vitest run`/`vitest watch` executions reproducing the shared-TestClock leak, async-registration silent failure, duplicate test names, and `.only`-under-CI behavior; direct source reads of `@cucumber/gherkin@42.0.1`'s `compile.js` and `@cucumber/messages@34.2.1`'s type definitions.
- This project's own `spec/` (ADR-EC-001 through 016, BEH-EC-001 through 012, invariants, roadmap) — normative per `AGENTS.md` §1.
- Official docs: pnpm catalogs, npm trusted publishing (OIDC GA), nodejs.org LTS schedule.
- Cucumber ecosystem: cucumber-js, `@amiceli/vitest-cucumber`, jest-cucumber, playwright-bdd official docs/README/source, cross-referenced against Context7 and GitHub issues.

### Secondary (MEDIUM confidence)
- Downstream breakage reports for Effect v4 prerelease duplicate-install issues (`prisma/composer#196`, `systemfsoftware#217`, `Threadlines#113`).
- playwright-bdd's missing-steps behavior, corroborated across multiple GitHub issues rather than a single doc.
- The exact vitest isolation/`pool` interaction behind Pitfall 14's non-determinism (reasoned from vitest's module-isolation model; a direct reproduction was defeated by the scratch probe environment).

### Tertiary (LOW confidence, superseded)
- quickpickle's own docs site (did not resolve; relied on WebSearch/npm page only).
- Two 2026 blog posts claiming TypeScript 7.0's Go-native compiler lacks `--build`/`--declaration` support — directly falsified by local testing of the installed `typescript@7.0.2` and not relied upon.

---
*Research completed: 2026-08-28*
*Ready for roadmap: yes*
