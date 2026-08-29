# Requirements: effect-cucumber

**Defined:** 2026-08-28
**Core Value:** A Scenario's dependencies are checked at compile time via a `Layer` — a step that needs a service the ambient Layer doesn't provide is a type error at authoring time, never a runtime failure discovered when the Scenario runs.

## v1 Requirements

Each requirement traces to a specific behavior/decision in `spec/` — see the cited `BEH-EC-NNN`/`ADR-EC-NNN`. A requirement without a citation is not in scope; propose a spec change first.

### Parsing (`@effect-cucumber/gherkin`)

- [x] **PARSE-01**: A `.feature` file can be loaded via `loadFeature`, which parses it via `@cucumber/gherkin` and has no observable effect on the test run by itself (BEH-EC-001)
- [x] **PARSE-02**: `loadFeature` correlates the raw `GherkinDocument` structure with `compile()`'s Pickle output, so a step's text arrives already placeholder-substituted, its tags already inherited, and Background steps already stacked ahead of it (ADR-EC-014)
- [x] **PARSE-03**: A Background step with a leftover un-interpolated `<placeholder>` (the known `@cucumber/gherkin` limitation for a Background nested under a Scenario Outline) fails with a specific, named error rather than a confusing downstream "unmatched step" (ADR-EC-014 correction)
- [x] **PARSE-04**: A Gherkin data table reaches a step as a `DataTable` wrapper exposing `.hashes()`/`.raw()`/`.rowsHash()` (`.hashes()` is not native to `@cucumber/gherkin`), whose rows decode through `Schema`; a step whose Gherkin carries both a DocString and a DataTable receives both (ADR-EC-008) *[added during roadmap creation — listed as an active requirement in PROJECT.md and delivered by research Phase 3, but had no REQ-ID]*

### Step matching

- [x] **MATCH-01**: Step patterns use cucumber-expressions syntax (`{int}`, `{float}`, `{string}`, `{word}`, custom types) (ADR-EC-007)
- [x] **MATCH-02**: A custom parameter type is defined once as data and replayed into a fresh `ParameterTypeRegistry` on every `loadFeature` call, with no duplicate-registration failure across repeated calls (ADR-EC-007 correction)
- [x] **MATCH-03**: A Pickle step matching zero registered patterns fails the containing Scenario, naming the unmatched step text and its source location (ADR-EC-019, BEH-EC-013)
- [x] **MATCH-04**: A Pickle step matching more than one registered pattern fails the same way, naming every matching pattern rather than silently picking the first registered (ADR-EC-019, BEH-EC-013)
- [x] **MATCH-05**: A registered pattern matching zero steps across the whole Feature is reported as a Feature-level warning, not a hard failure (ADR-EC-019, BEH-EC-013)

### Registration DSL (`@effect-cucumber/vitest`)

- [x] **DSL-01**: `describeFeature` takes a Layer (or `{ shared, perScenario }`); a step whose Effect requires a service the Layer doesn't provide fails to compile (ADR-EC-003), backed by `@effect/tsgo`'s `missingLayerContext`/`missingEffectContext` diagnostics failing the build (ADR-EC-016)
- [x] **DSL-02**: A step is `(...params) => Effect<A, E, R>`; `Given`/`When`/`Then`/`And`/`But` accept a bare generator function, auto-wrapped with `Effect.fn(stepText)` internally (ADR-EC-001, ADR-EC-005)
- [x] **DSL-03**: `World` is a typed `Context.Service`; a field is unreachable by a step unless it appears in World's declared type (ADR-EC-002)
- [x] **DSL-04**: `Background` and `Scenario` are step-definition containers — `Background` receives `{ Given, And }`, `Scenario` receives `{ Given, When, Then, And, But }` — and a Background's literal Gherkin text is matched against a registered pattern exactly like any other step (ADR-EC-017)
- [ ] **DSL-05**: A `Rule` can extend the ambient Layer with an extra per-Scenario Layer visible only to Scenarios defined inside that Rule (ADR-EC-010)
- [ ] **DSL-06**: A `ScenarioOutline`'s Examples values are typed for free by the step pattern's own cucumber-expression coercion (`{int}`, `{float}`) — no separate typed "example row" mechanism (ADR-EC-007)
- [x] **DSL-07**: Hooks (`Before`/`After`/`BeforeStep`/`AfterStep`/`BeforeAllScenarios`/`AfterAllScenarios`) accept a bare generator function, auto-wrapped with `Effect.fn(name)` (ADR-EC-005)

### Execution semantics

- [x] **RUN-01**: Each Scenario compiles to exactly one `it.effect` call; Background and Scenario steps run as sequential `yield*`s inside one `Effect.gen`, short-circuiting on the first failure (ADR-EC-004, INV-EC-001)
- [x] **RUN-02**: A Scenario's `After` hook runs whether every step succeeded or one failed, via `Effect.ensuring` (ADR-EC-005, INV-EC-004)
- [ ] **RUN-03**: A per-Scenario Layer is fresh every Scenario by default; an opt-in `shared` Layer is built once via `@effect/vitest`'s `layer(...)` (ADR-EC-006)
- [ ] **RUN-04**: A `shared` Layer still gives every Scenario its own fresh `TestClock`/`TestConsole`, via `excludeTestServices: true` plus a per-Scenario `TestEnv` — one Scenario's `TestClock.adjust` is never observable by another (ADR-EC-018, BEH-EC-012)
- [ ] **RUN-05**: Every tag on a Scenario is emitted as a native vitest tag; `@skip` additionally routes to `it.effect.skip`; `@only` is never routed to `it.effect.only` (which fails CI) — running just one Scenario locally is a `--tagsFilter` choice (ADR-EC-020, BEH-EC-008)
- [ ] **RUN-06**: Cross-step scenario state (a running total, a caught error) lives in a `Ref` obtained from `World`, demonstrated consistently in every worked example — not yet automatable, but the convention is load-bearing given retries reuse the same registered step closures (ADR-EC-009, INV-EC-006)

## v2 Requirements

Deferred to a future milestone. Tracked but not in the current roadmap.

### Reusability

- **REUSE-01**: A step definition can be shared and reused across multiple Scenarios/Features without being re-registered verbatim in each one — genuinely harder here than in any comparable library, since a shared step's `R` must reconcile against every consuming Layer, with no ecosystem precedent to copy (Gap 2, GSD Features research)

### Advanced Outline/tag/retry support

- **OUTLINE-01**: A `ScenarioOutline` Examples column not referenced by any step's pattern is available to the step body as a typed value, decoded via `Schema`
- **RETRY-01**: A Scenario can opt into `it.effect`'s retry behavior; a retried Scenario rebuilds its per-Scenario Layer fresh per attempt provided `Effect.provide` composition order is correct (composition-order requirement already confirmed by GSD Pitfalls research, implementation deferred)

### Tooling

- **LINT-01**: A lint rule flags a `let`/`var` declared inside a `Scenario`/`Rule`/`Background` callback that a step function closes over, automating the RUN-06 convention

## Out of Scope

Explicitly excluded. Documented to prevent scope creep.

| Feature | Reason |
|---------|--------|
| Publishing to npm | This milestone's destination is "working and tested," not "published" |
| A bespoke Gherkin parser | Depends on official `@cucumber/gherkin` instead (ADR-EC-011) |
| A bespoke step-matching syntax | cucumber-expressions is reused verbatim (ADR-EC-007) |
| A third "shared within a Rule" Layer scope | Promote to the Feature's `shared` Layer instead (ADR-EC-006, ADR-EC-010) |
| A custom cucumber HTML/report format | Defer to vitest's own reporters |
| A vitest plugin or custom test discovery mechanism | A `.feature` file is plain data; the `.steps.ts` module is what vitest discovers, unmodified |
| GxP/regulatory compliance tooling | Not a regulated domain |
| Step-stub codegen from `.feature` files | A naive version emits `Effect<void, never, never>`, which type-checks against any Layer and actively undercuts the type-safety value proposition (GSD Features research) |
| Scenario-level parallelism inside one feature file | Not requested by any behavior; adds real complexity to fail-fast/World semantics |

## Traceability

Phase numbers refer to `.planning/ROADMAP.md`. Note: research/SUMMARY.md numbers the
same phases 0-10; the roadmap numbers them 1-11 (a straight +1 shift).

| Requirement | Phase | Status |
|-------------|-------|--------|
| PARSE-01 | Phase 2 | Complete |
| PARSE-02 | Phase 2 | Complete |
| PARSE-03 | Phase 2 | Complete |
| PARSE-04 | Phase 4 | Complete |
| MATCH-01 | Phase 3 | Complete |
| MATCH-02 | Phase 3 | Complete |
| MATCH-03 | Phase 6 | Complete |
| MATCH-04 | Phase 6 | Complete |
| MATCH-05 | Phase 6 | Complete |
| DSL-01 | Phase 5 | Complete |
| DSL-02 | Phase 5 | Complete |
| DSL-03 | Phase 5 | Complete |
| DSL-04 | Phase 5 | Complete |
| DSL-05 | Phase 8 | Pending |
| DSL-06 | Phase 8 | Pending |
| DSL-07 | Phase 7 | Complete |
| RUN-01 | Phase 6 | Complete |
| RUN-02 | Phase 7 | Complete |
| RUN-03 | Phase 10 | Pending |
| RUN-04 | Phase 10 | Pending |
| RUN-05 | Phase 9 | Pending |
| RUN-06 | Phase 11 | Pending |

**Coverage:**
- v1 requirements: 22 total (21 originally defined + PARSE-04 added during roadmap creation)
- Mapped to phases: 22 ✓
- Unmapped: 0
- Duplicated across phases: 0

Phase 1 (Workspace, toolchain, dependency policy) carries no v1 requirement — it is an
enabling phase citing ADR-EC-012/013/015/016 rather than a user-facing behavior.

---
*Requirements defined: 2026-08-28*
*Last updated: 2026-08-29 after Phase 6 (plan/Scenario Effect/runner emission and drift detection) — RUN-01, MATCH-03, MATCH-04 and MATCH-05 marked Complete in plan 06-07, the plan that wires `describeFeature` → `planFeature` → `emitFeature` and so makes all four true end to end. Plans 06-01 through 06-06 each declined the marking on AGENTS.md §4 grounds while the stages existed but nothing user-facing reached them. Each is backed by a named automated assertion that fails if the requirement stops being true: RUN-01 by `packages/vitest/test/emission.test.ts` (a real `describeFeature` call whose two emitted tests run, pass, and prove the Background ran first) plus `Runner.test.ts`'s positional emission-shape assertions and `ScenarioEffect.test.ts`'s recorded step order; MATCH-03 and MATCH-04 by `packages/vitest/test/Plan.test.ts` and `Errors.test.ts` for the located error, and `ScenarioEffect.test.ts` for it failing its own Scenario in position; MATCH-05 by `emission.test.ts`'s terminal-channel assertions, `Runner.test.ts`'s always-passing warning node, and `describeFeature.test.ts`'s `plan.warnings` assertions — D-02's three channels, one per test file. See `.planning/phases/06-plan-scenario-effect-runner-emission-and-drift-detection/06-07-SUMMARY.md` for the per-requirement evidence. No requirement outside RUN-01 and MATCH-03..05 changed status. The previous entry covered Phase 5: DSL-01 in plan 05-04, DSL-03 in 05-05, DSL-02/DSL-04 in 05-06.*
