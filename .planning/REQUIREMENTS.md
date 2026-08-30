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
- [x] **RUN-03**: A per-Scenario Layer is fresh every Scenario by default; an opt-in `shared` Layer is built once via `@effect/vitest`'s `layer(...)` (ADR-EC-006)
- [x] **RUN-04**: A `shared` Layer still gives every Scenario its own fresh `TestClock`/`TestConsole`, via `excludeTestServices: true` plus a per-Scenario `TestEnv` — one Scenario's `TestClock.adjust` is never observable by another (ADR-EC-018, BEH-EC-012)
- [x] **RUN-05**: Every tag on a Scenario is emitted as a native vitest tag; `@skip` additionally routes to `it.effect.skip`; `@only` is never routed to `it.effect.only` (which fails CI). Running just one Scenario locally is a `--tagsFilter` choice, but not a bare one: a tag must be DECLARED in the runner's `test.tags` before any filter can select it — an undeclared tag does not fail the Feature, it is re-emitted untagged with a located warning, and `gherkinTags("<glob>")` generates the declarations from the consumer's own `.feature` files. `includeTags`/`excludeTags` on `describeFeature`'s optional fourth argument additionally filter at REGISTRATION time, so an excluded Scenario is absent from the report rather than skipped in it, and compose with `--tagsFilter` rather than replacing it (ADR-EC-026 — which supersedes ADR-EC-020 — BEH-EC-008)
- [x] **RUN-06**: Cross-step scenario state (a running total, a caught error) lives in a `Ref` obtained from `World`, demonstrated consistently in every worked example — not yet automatable, but the convention is load-bearing given retries reuse the same registered step closures (ADR-EC-009, INV-EC-006)

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
| RUN-03 | Phase 10 | Complete |
| RUN-04 | Phase 10 | Complete |
| RUN-05 | Phase 9 | Complete |
| RUN-06 | Phase 11 | Complete |

**Coverage:**

- v1 requirements: 22 total (21 originally defined + PARSE-04 added during roadmap creation)
- Mapped to phases: 22 ✓
- **Complete: 22 ✓ — Pending: 0**, as of Phase 11 plan 09
- Unmapped: 0
- Duplicated across phases: 0

Each of the 22 also carries a `@REQ-EC-NNN` acceptance tag on a `.feature` file under
`packages/vitest/test/acceptance/`, asserted by `spec/scripts/verify-traceability.sh` check 5 —
contiguous ids, each occurring exactly once, each with a row in `spec/traceability.md` §5. That
check is a different claim from the table above and neither substitutes for the other: the table
says a phase delivered the requirement, the check says a tagged Scenario exists for it.

Phase 1 (Workspace, toolchain, dependency policy) carries no v1 requirement — it is an
enabling phase citing ADR-EC-012/013/015/016 rather than a user-facing behavior.

---
*Requirements defined: 2026-08-28*

*Last updated: 2026-08-30 after Phase 11 (Composition Root and Dogfooded Acceptance Suite) — RUN-06 is
Complete, and with it the v1 set reads 22 of 22. RUN-06 was the last requirement standing and the
only one that had ever been described in its own text as "not yet automatable". That clause is now
false, which is the reason it can be marked: what follows names, for each of Phase 11's four roadmap
success criteria, the artifact that goes RED if the criterion stops being true. Nothing here is
marked on the strength of a document.*

***Criterion 1 — the worked examples run green end to end.*** *The three pairs under
`packages/vitest/test/acceptance/` are `worked-example-01-apples`, `worked-example-02-accounts` and
`worked-example-03-discounts`, each a `.feature` file beside a `.steps.test.ts` module, each driven
by the real `describeFeature` and collected by the ordinary `pnpm test`. What makes them evidence
rather than decoration is the numbered mutation record each carries in its own module doc comment,
performed, run and reverted. Two entries from pair 01 carry the whole argument. Mutation **C**:
`When I eat 1 apples` became `When I eat 2 apples` in the `.feature` file with no TypeScript touched,
and the Scenario went red with `expected 1 to equal 2` — so both numbers travelled out of the Gherkin
text, through the parser and the cucumber-expression matcher, into the step body; a Scenario with the
value hard-coded survives that mutation untouched. Mutation **D**: the `Given I have {int} apples`
body was emptied, and the Scenario went red with `expected -1 to equal 2` — the `-1` being the
Layer's own fresh `Ref.make(0)` minus the `When`'s 1, which proves the `Then` read the `Ref` the
earlier steps WROTE rather than recomputing anything. Mutation **B** is the standing warning beside
them: with `Ref.get` replaced by the literal the assertion expects, all four tests STAYED GREEN. A
passing acceptance test is not evidence by itself, and this file says so in writing.*

***Criterion 2 — cross-step state flows through a `Ref` from World, with no closed-over mutable
binding.*** *`scripts/verify-acceptance-ref-state.sh` (`pnpm verify:acceptance-ref-state`) is the
enforcement, and it is a structural scan rather than a review note. Four assertions: a POPULATION
control requiring at least five `*.steps.test.ts` modules under the acceptance directory, so the gate
cannot pass by scanning nothing; a REGEX control requiring the same declaration pattern to find real
mutable bindings in `packages/vitest/src/Runner.ts`, so it cannot pass by running a dead pattern; the
gate itself, forbidding a `let` or `var` at any scope in an acceptance step module; and the narrow
half of PROH-11-03, an in-place array-mutator call standing in for one. Comment lines are stripped
first, or the gate would forbid its own documentation. Its recorded mutation is the reason it exists:
with ONE mutable binding added to an acceptance step module, `pnpm test` (37 files, 796 passed),
`pnpm build`, `pnpm lint` and `pnpm typecheck:test` were all measured GREEN, and only this gate went
red. Both controls were themselves mutation-proven (B1/B2 against the directory, C against the
regex).*

***Criterion 3 — 22 of 22 covered.*** *`spec/scripts/verify-traceability.sh` check 5
(`pnpm verify:spec`) asserts that the `@REQ-EC-NNN` ids are contiguous, that each occurs exactly
once across every `.feature` file in the repository, and that each has a row in
`spec/traceability.md` §5 — and it prints the count. The current run reports
"22/22 requirements covered by a passing test, each tagged once, each with a §5 row", with 9 PASS / 0
FAIL / 0 SKIP overall. Check 4 is the other half, in the opposite direction: it fails on a
`@REQ-EC-NNN` tag found on a `.feature` file OUTSIDE the acceptance directory, so the parser corpus
cannot quietly inflate the count. That row requirement is not theoretical — mutation E on pair 01
deleted the `REQ-EC-022` row from §5 and `pnpm verify:spec` exited 1 naming the tag.*

***Criterion 4 — the checklist runs in full, and the escape-hatch wording is addressed.***
*`spec/process/looks-done-but-isnt-checklist.md` is normative and carries 24 ids, P-01 through P-24,
each with a named executor rather than a citation. Three artifacts execute them:
`packages/vitest/test/acceptance/pitfalls-checklist.test.ts` (13),
`scripts/verify-pitfalls-checklist.sh` (10) and `scripts/verify-watch-rerun.sh` (1). "Runs in full"
is COUNTED rather than claimed: that second script ends in a coverage cross-check that parses the
document's own table and proves each id's named executor really carries it in the anchored form,
printing the 13 / 10 / 1 split. Two of its mutations are what make that non-vacuous — with `P-04`
stripped from its test title, `pnpm test` stayed green at IDENTICAL counts and only the cross-check
went red; with P-09's Executed by cell repointed at the wrong artifact, the same. D-04's two halves:
`scripts/verify-acceptance-no-any.sh` (`pnpm verify:acceptance-no-any`) enforces INV-EC-003's
boundary condition over the acceptance suite, and the consumer-facing recommendation lives in
`packages/vitest/README.md` § "Recommended lint and compiler configuration for your step modules",
cross-referenced from `spec/overview.md` and from INV-EC-003 itself.*

***What RUN-06 does NOT claim, stated so the marking is honest.*** *The enforcement covers THIS
repository's own acceptance step modules and nothing else. A shell script scanning
`packages/vitest/test/acceptance/` cannot travel to a consumer's repository, so for a consumer the
`Ref`-through-World convention remains exactly that — a reviewed convention, demonstrated by every
worked example and enforced by nothing. **LINT-01** (see § v2 above) — a lint rule flagging a
`let`/`var` declared inside a `Scenario`/`Rule`/`Background` callback that a step function closes
over — is the mechanism that would close that half, and it is deferred to a later milestone. The gate
is also narrower than the invariant in a second way: it scans DECLARATIONS, so PROH-11-03's
module-scope `const` holder written to by a step is caught only in its common in-place-mutator form,
and the general case stays a review rule. Do not read a green run as "no module-scope holder
exists".*

***Three assumptions from the spec-less edge probe, carried out of this phase OPEN rather than
closed.*** *Recorded here because a phase-closing document is where they would otherwise be lost.*

- ***ASSUMPTION-11-A (adjacency)*** *— the acceptance step modules each declare a same-named
  `Context.Service` id and are assumed not to collide because vitest isolates modules per file.
  Unresolved, and now permanent for this milestone. It held in practice, and plan 11-08's mutation G
  is evidence the separation it forces earns its cost.*
- ***ASSUMPTION-11-B (empty / single-element)*** *— partly mitigated by the population and parse
  controls in plans 11-05 and 11-08, and still an assumption in that both controls depend on external
  files continuing to contain what they contain. Plan 11-08 measured the mitigation to be narrower
  than predicted: the row-count control's irreplaceable job is the GROWTH direction (a 25th row is
  outside a `1..N` loop and only the count sees it), not the shrink direction, which the contiguity
  loop catches on its own.*
- ***ASSUMPTION-11-C (ordering)*** *— unresolved, and the most consequential of the three. Several
  acceptance assertions depend on vitest running a file's tests in DECLARATION ORDER, which is
  observed behavior rather than a documented contract; shuffled sequencing would break them. Checklist
  item P-21 runs the Outline case under shuffled sequencing, but no acceptance file is run shuffled as
  a whole. This is an open follow-up, not a closed question.*

*Two further open items measured by plan 11-08 and not to be lost either, both product gaps rather
than test gaps: an acceptance `.feature` edit does NOT trigger a watch-mode rerun for the path-based
`loadFeature` + `NodeFileSystem` form every committed pair uses (only the `?raw` form reruns, in
~620 ms); and a failing step's entry in the runner's failure panel names the Scenario and the
assertion but neither the step text nor the `.feature` file and line — the step PATTERN does reach a
separate stdout block via ADR-EC-005's `Effect.fn(pattern)` span, which is not the same thing. Both
are recorded as Notes on their checklist rows (P-14, P-24) with the fix named.*

*No requirement outside RUN-06 changed status.*

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
