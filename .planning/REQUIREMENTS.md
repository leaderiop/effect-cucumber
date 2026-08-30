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
- [x] **DSL-05**: A `Rule` can extend the ambient Layer with an extra per-Scenario Layer visible only to Scenarios defined inside that Rule (ADR-EC-010)
- [x] **DSL-06**: A `ScenarioOutline`'s Examples values are typed for free by the step pattern's own cucumber-expression coercion (`{int}`, `{float}`) — no separate typed "example row" mechanism (ADR-EC-007)
- [x] **DSL-07**: Hooks (`Before`/`After`/`BeforeStep`/`AfterStep`/`BeforeAllScenarios`/`AfterAllScenarios`) accept a bare generator function, auto-wrapped with `Effect.fn(name)` (ADR-EC-005)

### Execution semantics

- [x] **RUN-01**: Each Scenario compiles to exactly one `it.effect` call; Background and Scenario steps run as sequential `yield*`s inside one `Effect.gen`, short-circuiting on the first failure (ADR-EC-004, INV-EC-001)
- [x] **RUN-02**: A Scenario's `After` hook runs whether every step succeeded or one failed, via `Effect.ensuring` (ADR-EC-005, INV-EC-004)
- [ ] **RUN-03**: A per-Scenario Layer is fresh every Scenario by default; an opt-in `shared` Layer is built once via `@effect/vitest`'s `layer(...)` (ADR-EC-006)
- [ ] **RUN-04**: A `shared` Layer still gives every Scenario its own fresh `TestClock`/`TestConsole`, via `excludeTestServices: true` plus a per-Scenario `TestEnv` — one Scenario's `TestClock.adjust` is never observable by another (ADR-EC-018, BEH-EC-012)
- [x] **RUN-05**: Every tag on a Scenario is emitted as a native vitest tag; `@skip` additionally routes to `it.effect.skip`; `@only` is never routed to `it.effect.only` (which fails CI). Running just one Scenario locally is a `--tagsFilter` choice, but not a bare one: a tag must be DECLARED in the runner's `test.tags` before any filter can select it — an undeclared tag does not fail the Feature, it is re-emitted untagged with a located warning, and `gherkinTags("<glob>")` generates the declarations from the consumer's own `.feature` files. `includeTags`/`excludeTags` on `describeFeature`'s optional fourth argument additionally filter at REGISTRATION time, so an excluded Scenario is absent from the report rather than skipped in it, and compose with `--tagsFilter` rather than replacing it (ADR-EC-026 — which supersedes ADR-EC-020 — BEH-EC-008)
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
| DSL-05 | Phase 8 | Complete |
| DSL-06 | Phase 8 | Complete |
| DSL-07 | Phase 7 | Complete |
| RUN-01 | Phase 6 | Complete |
| RUN-02 | Phase 7 | Complete |
| RUN-03 | Phase 10 | Gaps Found |
| RUN-04 | Phase 10 | Gaps Found |
| RUN-05 | Phase 9 | Complete |
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
*Last updated: 2026-08-29 after Phase 8 (Rule and Scenario Outline) — DSL-05 and DSL-06 are Complete,
each backed by a named automated assertion that fails if the requirement stops being true.*

*DSL-05 by `packages/vitest/test/Plan.test.ts`'s cross-rule isolation tests ("never lets one Rule's
registration serve another Rule's Scenario, even under one pattern text", "does not let a
Scenario-scope pattern cross into a same-named Scenario in a different Rule") and its three-level
Scenario-over-Rule-over-Feature precedence tests; by `packages/vitest/test/describeFeature.test.ts`'s
per-Rule Layer resolution tests ("provides both the Feature's ambient service and the Rule's own from
the Rule's Layer", "leaves the Feature's own Layer unable to provide the Rule's extra service",
"builds a Rule Layer whose own requirements the Feature's ambient Layer satisfies") and its
Rule/Scenario composition test ("reaches the Feature's, the Rule's and the Scenario's own service
from one merged Layer"); by `scripts/verify-tsgo-gate.sh` assertions 12 and 13 — the compile-time
boundary, where assertion 13's `rule-missing-service.ts` is assertion 12's `rule-satisfied.ts` Rule-scoped
step body byte-for-byte, registered at Feature level with no Rule in the file, checked for a non-zero
exit AND for `effect(missingEffectContext)` by name; and by `packages/vitest/test/emission.test.ts`'s
real end-to-end Rule run, whose Rule tier is a `Layer.effect`-built service DERIVED from the Feature's,
so it resolves at runtime only if `Layer.provideMerge` really composed the two.*

*DSL-06 by two separate halves, because Roadmap Phase 8 states them as two separate success criteria.*

*The TITLING half (D-03, roadmap SC#4) by `packages/vitest/test/OutlineTitle.test.ts`'s
exact-title-format tests — the placeholder-FREE Outline whose rows are otherwise byte-identical, the
standing assertion that they really are identical without the suffix, the already-interpolated
Outline where the suffix is ADDED rather than substituted, and the plain Scenario left exactly as
written — plus `packages/vitest/test/Runner.test.ts`'s `adding 1 (count=1)` / `adding 2 (count=2)`
positional assertion, and `packages/vitest/test/emission.test.ts`'s real three-row independence proof
(Pitfall 34): three rows emitted as three running tests, each asserting from inside its own step body
the value its own row carried.*

*The COERCION half — "typed for free", which Roadmap Phase 8 success criterion #3 states separately
("An Outline whose Examples columns are consumed by `{int}`/`{float}` patterns hands the step body
already-coerced `number` arguments, with no separate typed-example-row mechanism — verified by both a
type test and a runtime assertion") — rests on two PRE-EXISTING assertions that predate Phase 8 and
required no new test, both named here so the requirement is not marked Complete on the titling
evidence alone:*

*(i) the RUNTIME half is `packages/vitest/test/Plan.test.ts`'s test
`"resolves every Examples row of a Scenario Outline, proving astName is the scope key"` (lines
466-480), whose assertions `expect(resolvedOf(plan.scenarios[0]?.steps[0])?.args).toEqual([1])` and
its `[2]` equivalent for row 2 (lines 478-479) are the proof that an Outline row's Examples STRING
value `"1"` arrives at the step already coerced to the `number` `1` by the `{int}` pattern, per row,
with no separate typed-row mechanism anywhere in the codebase.*

*(ii) the TYPE half is `packages/gherkin/test/StepArgs.types.ts` line 48
(`export const intIsNumber = expectTrue(equality<StepArgs<"I have {int} cukes">, [number]>())`)
together with its `@ts-expect-error` negative at line 145 (`intIsNotString`), which prove `{int}`
resolves to `number` and never to `string` (MATCH-01). That file is compiled by
`pnpm typecheck:test` and is deliberately never collected by vitest.*

*No requirement outside DSL-05 and DSL-06 changed status. See
`.planning/phases/08-rule-and-scenario-outline/08-08-SUMMARY.md` for the per-requirement evidence.*

*The previous entry covered Phase 7 — DSL-07 and RUN-02 are Complete, each backed by a
named automated assertion that fails if the requirement stops being true: DSL-07 by
`packages/vitest/test/Hook.test.ts` (the span-name and reference-identity normalization assertions),
`scripts/verify-tsgo-gate.sh` assertions 10 and 11 (a hook requiring an unprovided service is rejected
by name), and `packages/vitest/test/Runner.test.ts`'s full six-hook ordering test; RUN-02 by
`packages/vitest/test/ScenarioEffect.test.ts`'s After-on-step-failure and failing-After-does-not-mask
assertions, and `packages/vitest/test/emission.test.ts`'s real-run hook proof. See
`.planning/phases/07-hooks/07-08-SUMMARY.md` for the per-requirement evidence. No requirement outside
DSL-07 and RUN-02 changed status. The previous entry covered Phase 6: RUN-01, MATCH-03, MATCH-04 and
MATCH-05 marked Complete in plan 06-07, the plan that wires `describeFeature` → `planFeature` →
`emitFeature` and so makes all four true end to end. Plans 06-01 through 06-06 each declined the
marking on AGENTS.md §4 grounds while the stages existed but nothing user-facing reached them. Each is
backed by a named automated assertion that fails if the requirement stops being true: RUN-01 by
`packages/vitest/test/emission.test.ts` (a real `describeFeature` call whose two emitted tests run,
pass, and prove the Background ran first) plus `Runner.test.ts`'s positional emission-shape assertions
and `ScenarioEffect.test.ts`'s recorded step order; MATCH-03 and MATCH-04 by
`packages/vitest/test/Plan.test.ts` and `Errors.test.ts` for the located error, and
`ScenarioEffect.test.ts` for it failing its own Scenario in position; MATCH-05 by
`emission.test.ts`'s terminal-channel assertions, `Runner.test.ts`'s always-passing warning node, and
`describeFeature.test.ts`'s `plan.warnings` assertions — D-02's three channels, one per test file. See
`.planning/phases/06-plan-scenario-effect-runner-emission-and-drift-detection/06-07-SUMMARY.md` for
the per-requirement evidence. The previous-previous entry covered Phase 5: DSL-01 in plan 05-04,
DSL-03 in 05-05, DSL-02/DSL-04 in 05-06.*
