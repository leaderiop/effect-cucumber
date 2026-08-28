# Feature Research

**Domain:** Gherkin/Cucumber BDD layer hosted on an existing JS test runner (vitest/jest/playwright)
**Researched:** 2026-08-28
**Confidence:** HIGH for cucumber-js / jest-cucumber / @amiceli-vitest-cucumber / playwright-bdd feature inventories (Context7 + official docs/README). MEDIUM for quickpickle (WebSearch + npm page only; its own docs site did not resolve).

> **Scope note.** effect-cucumber's feature surface is already locked in `spec/behaviors/`
> (BEH-EC-001…012) and `spec/decisions/` (14 ADRs). This document is a **gap-check**,
> not a redesign: it categorizes what the ecosystem ships, then asks which table-stakes
> capability the existing 12 behaviors do not cover. Items already parked in
> `spec/roadmap.md` § Planned / § Explicitly not planned are marked as such and are
> **not** re-proposed.

---

## The comparable set

| Library | Host runner | Binding model | Why it's in the survey |
|---|---|---|---|
| `@cucumber/cucumber` (cucumber-js) | its own CLI | global step registry, `.feature` files are the test files | The reference implementation — defines what "Gherkin support" means |
| `@amiceli/vitest-cucumber` | vitest | steps declared inside `Scenario` callbacks, plus global `defineSteps` | The closest comparable; `spec/overview.md` positions effect-cucumber directly against it |
| `jest-cucumber` | jest | steps inside `defineFeature`, plus `autoBindSteps` for global steps | Same "reimagined for the host runner" philosophy, older and widely used |
| `playwright-bdd` | playwright | global registry + `bddgen` codegen into real `.spec.js` files | The "codegen instead of a plugin" school |
| `quickpickle` | vitest (vite plugin) | vite plugin makes `.feature` files themselves test files | The dissenting architecture — shows the plugin route is still live |

---

## Feature Landscape

### Table Stakes (Users Expect These)

| Feature | Why Expected | Complexity | effect-cucumber status |
|---|---|---|---|
| Parse real Gherkin with the official parser | Every serious library uses `@cucumber/gherkin`; a bespoke parser is a red flag | LOW (dependency) | **Covered** — BEH-EC-001, ADR-EC-011/014 |
| `Given`/`When`/`Then`/`And`/`But` with cucumber-expression params (`{int}`, `{string}`, `{word}`, custom types) | Universal across all five; migrating a suite must not mean rewriting `.feature` files | LOW–MED | **Covered** — BEH-EC-003, ADR-EC-007 (incl. `ParameterTypeRegistry` lifecycle correction) |
| Background | Gherkin core; all five | LOW | **Covered** — BEH-EC-005 (inlined per-Scenario, stronger than a `beforeEach`) |
| Scenario Outline + Examples | Gherkin core; all five | MED | **Covered** — BEH-EC-010 |
| Rule | Gherkin 6; cucumber-js, @amiceli, playwright-bdd, quickpickle | MED | **Covered** — BEH-EC-009 (plus a Rule-scoped Layer, which nobody else has) |
| Data tables + doc strings | Gherkin core; all five expose a `DataTable` accessor API | MED | **Covered** — ADR-EC-008 (own `.hashes()` wrapper; `.hashes()` is not native to `@cucumber/gherkin`) |
| Scenario hooks: Before/After, and After running on failure | cucumber-js `Before`/`After`; @amiceli `BeforeEachScenario`/`AfterEachScenario`; jest-cucumber leans on jest's | LOW–MED | **Covered** — BEH-EC-006, INV-EC-004 (`Effect.ensuring`) |
| Suite-level hooks (BeforeAll/AfterAll) | cucumber-js `BeforeAll`/`AfterAll` | LOW | **Covered** — `BeforeAllScenarios`/`AfterAllScenarios`, BEH-EC-006 |
| Step hooks (BeforeStep/AfterStep) | cucumber-js documents them as first-class | LOW | **Covered** — BEH-EC-006 |
| Fail-fast within a scenario (a failed step skips the rest) | Cucumber's "Skipped" status; universal expectation | LOW here | **Covered** — INV-EC-001, structural via Effect's error channel |
| Per-scenario isolated state ("World") | cucumber-js `this`/World; @amiceli `context`; quickpickle world constructors; jest-cucumber closure vars | MED | **Covered** — BEH-EC-004/011, ADR-EC-002/009 (typed `Context.Service`, the headline differentiator) |
| Skip / focus a scenario from the feature file | `@skip`/`@only` in @amiceli and playwright-bdd; `--tags` in cucumber-js | LOW | **Covered** — BEH-EC-008 |
| Tag-based include/exclude filtering | cucumber-js `tags` (full tag expressions); jest-cucumber `tagFilter` with and/or/not/parens; @amiceli `includeTags`/`excludeTags` | MED | **Partial** — `excludeTags` only (BEH-EC-008). Richer tag expressions **already parked** in roadmap § Planned |
| **Detecting drift between the `.feature` file and the step definitions** | See "Gap 1" below — *all four* runner-hosted comparables ship this, most on by default | LOW–MED | **NOT COVERED — real gap** |
| Reusable step definitions across scenarios/features | See "Gap 2" — cucumber-js (registry is the default), jest-cucumber `autoBindSteps`, @amiceli `defineSteps`, playwright-bdd global steps | HIGH here | **NOT COVERED — real gap** |
| Sensible failure output when the `.feature` file itself is bad | cucumber-js reports parse errors with line/column | LOW | **NOT COVERED — small gap (Gap 3)** |
| Distinguishable test names per Outline row | cucumber-js appends example values; jest-cucumber has `scenarioNameTemplate` | LOW | **NOT COVERED — small gap (Gap 4)** |
| Watch mode, parallelism, `-t` filtering, coverage, IDE integration | The whole reason to host on a runner instead of using cucumber-js | ZERO | **Covered by construction** — `spec/overview.md` "no plugin, no custom reporter"; reduces to real `describe`/`it.effect` |
| Non-English dialects (`# language: fr`) | @amiceli "Spoken Languages"; cucumber-js `language`; playwright-bdd i18n | LOW (likely free) | **Unstated — probably free (Gap 5)** |

### Differentiators (Competitive Advantage)

| Feature | Value Proposition | Complexity | Who has it |
|---|---|---|---|
| **Compile-time-checked scenario dependencies via `Layer`** | The single biggest differentiator. Nobody else type-checks that a step's dependencies are actually provided; every comparable fails at runtime with a missing-service/undefined-context error | HIGH | **effect-cucumber only** (BEH-EC-002, INV-EC-003) |
| **Typed World as a `Context.Service`** | Replaces `context: any` (@amiceli), `this` (cucumber-js), and closure vars (jest-cucumber). A field that "doesn't exist yet" is a compile error | MED | **effect-cucumber only** (BEH-EC-004) |
| **`TestClock` composing transparently** | Time-dependent scenarios become deterministic with zero test-awareness in the code under test. No comparable has any answer here — they all need real timers or hand-rolled clock injection | LOW (inherited from `@effect/vitest`) | **effect-cucumber only** (BEH-EC-012) |
| **Rule-scoped extra Layer** | A `Rule` becomes a real type boundary, not just a `describe` nesting level. cucumber-js/@amiceli treat Rule as pure grouping | MED | **effect-cucumber only** (BEH-EC-009, INV-EC-005) |
| **Structural fail-fast** | Every comparable maintains a bookkeeping flag ("has a prior step failed?"). Effect's error channel makes it impossible to get wrong | LOW | **effect-cucumber only** (INV-EC-001) |
| Two explicit Layer scopes (per-Scenario default, opt-in shared) | Makes the expensive-fixture-vs-isolation tradeoff explicit and typed. Others reach for module-level singletons | MED | **effect-cucumber only** (BEH-EC-007, ADR-EC-006) |
| Schema-decoded data tables | Table decode failure is a typed error in `E`, not a thrown exception | MED | **effect-cucumber only** (ADR-EC-008) |
| Step stub codegen from a `.feature` file | @amiceli's CLI, playwright-bdd's `bddgen` "Missing steps found" snippets, cucumber-js snippets | MED | Comparables — see anti-features for why the naive version misfires here |
| Cucumber-HTML / Allure / Cucumber Reports output | playwright-bdd (cucumber-html, allure), cucumber-js (`format`, `publish`) | HIGH | Comparables — **deliberately out of scope** (defer to vitest reporters) |
| Step decorators on Page Object classes | playwright-bdd `@Given` on class methods | MED | playwright-bdd — Effect services already fill this role |
| Retry / `retryTagFilter` | cucumber-js `retry` + `retryTagFilter`; playwright-bdd inherits playwright's | MED | Comparables — **already parked** in roadmap § Planned |
| Line-number targeting (`foo.feature:12`) | cucumber-js, quickpickle plugin | LOW | Comparables — `vitest -t "<scenario>"` is the equivalent, free |

### Anti-Features (Commonly Requested, Often Problematic)

| Feature | Why Requested | Why Problematic | Alternative |
|---|---|---|---|
| Own CLI / own test discovery / vite plugin making `.feature` files the test files | It's what cucumber-js and quickpickle do; "feels like real Cucumber" | You forfeit the runner's watch mode, `-t`, coverage attribution, IDE gutter icons, and error source-mapping — the entire reason to host on vitest. jest-cucumber, @amiceli, and playwright-bdd all rejected it | Keep `.feature` as plain data read by `loadFeature`; the `.steps.ts` module is what vitest discovers — **already decided** (`spec/overview.md`). *Honest caveat: quickpickle and the new `@deepracticex/vitest-cucumber` both went the plugin route, so this is a live fork in the ecosystem, not unanimous* |
| Untyped mutable `context` / `world` bag threaded through steps | Every comparable does it; it's the familiar shape | `context.foo` is `any`; a typo or a step-ordering mistake surfaces as `undefined` three steps later. This is the specific defect effect-cucumber exists to fix | Typed `Context.Service` + `Ref` — **already decided** (ADR-EC-002/009) |
| Cucumber's `pending` status (yellow, neither pass nor fail) | Fidelity to Cucumber's six step statuses | vitest is binary pass/fail. A third status needs a custom reporter, which is out of scope. Both jest-cucumber and @amiceli hard-error instead of going yellow | Hard error on an unimplemented step (see Gap 1), or route to `it.effect.todo` |
| Custom HTML/JSON/cucumber-messages report format | Stakeholder-facing "living documentation" | Requires a reporter, a message bus, and step-level status tracking — a second product | vitest reporters — **already decided** |
| A third "shared within a Rule" Layer scope | Symmetry with the per-Scenario/shared pair | Combinatorial scope explosion for a case solvable by promoting to the Feature's `shared` Layer | **Already decided** (ADR-EC-006/010) |
| Auto-generating step stubs from `.feature` files | @amiceli and playwright-bdd both ship it; obvious DX win | A generated stub cannot know the step's `R` — it emits `Effect<void, never, never>`, which type-checks against any Layer, so codegen silently produces the *least* type-safe possible step and undercuts the core value | If ever built, generate against a named World/Layer type the user supplies, not a blank stub |
| Scenario-level parallelism inside one feature file | "Scenarios are independent, run them concurrently" | Concurrent fibers over a `shared` Layer race on exactly the state the `shared` scope exists to hold; vitest gives file-level parallelism for free at the right grain | vitest's file-level parallelism; keep one sequential `it.effect` per Scenario (ADR-EC-004) |
| Attachments / screenshots / `attach()` | cucumber-js and playwright-bdd have it | Only meaningful with a report format to attach *to* — couples straight back to the ruled-out custom reporter, and this library targets unit/integration tests, not browser e2e | Out of scope; not a gap |

---

## Gap Analysis Against the Locked 12 Behaviors

Five gaps found. Two are genuine table stakes; three are small.

### Gap 1 — Feature↔step-definition drift is undetected (**REAL, table stakes, recommend closing**)

**Nothing in BEH-EC-001…012 says what happens when a Pickle step has no matching registered pattern, when a registered pattern matches no Pickle step, or when two patterns match the same step.**

Every comparable treats this as a headline feature, not an extra:

- **cucumber-js** — `Undefined` and `Ambiguous` are two of the six first-class step statuses; `strict` config fails the run; snippets are generated for undefined steps.
- **jest-cucumber** — four independent toggles under `errors`, **all defaulting to `true`**: `missingScenarioInStepDefinitions`, `missingStepInStepDefinitions`, `missingScenarioInFeature`, `missingStepInFeature`. Bidirectional, on by default.
- **@amiceli/vitest-cucumber** — `StepAbleStepsNotCalledError` (feature step with no implementation), `MissingSteppableError` (step declared outside any Scenario), plus wrong-step-type and undefined-Outline-variable checks. The README's own summary of the library is that it "validates scenario alignment, detects missing steps, and verifies step types match feature definitions" — it *is* the product.
- **playwright-bdd** — `bddgen` fails the build with "Missing steps found" plus copy-pasteable snippets; there are open issues asking to *relax* it, which is the strongest evidence it's expected.

Two reasons this matters more here than elsewhere. First, `spec/overview.md`'s stated mission is that a missing dependency is a compile error rather than "a runtime failure discovered when the scenario runs" — a step in the `.feature` file with no implementation is precisely that class of failure, left unaddressed. Second, ADR-EC-014's own § Consequences (Negative) already names the mechanism — "a step's DSL registration has no relationship to which Pickle step it matches beyond text pattern matching" — but no behavior states a *requirement* about it. The spec knows the hole exists and stops short of specifying the behavior.

- **Would be:** a new behavior (BEH-EC-013), extending **BEH-EC-003** (step registration) and **ADR-EC-014** (Pickle correlation).
- **Complexity: LOW–MEDIUM.** By the time `describeFeature`'s `define` callback returns, both sets are in hand: the Pickle's ordered step list and the registered pattern list. It is set arithmetic plus one policy decision (throw at describe time vs. emit a failing/`todo` `it.effect`). No new dependency, no parser work.
- **Open design question worth deciding, not researching:** three-way choice — throw at registration (@amiceli), fail the generated test (cucumber-js `strict`), or `it.effect.todo` (most vitest-native). Also whether unmatched-in-the-other-direction (a registered pattern no step uses) is an error or a warning; jest-cucumber makes both errors by default.

### Gap 2 — No reusable step definitions across Scenarios or Features (**REAL, table stakes, but genuinely hard here**)

Under the spec as written, `Given`/`When`/`Then` are only reachable from inside a `Scenario`/`ScenarioOutline`/`Background`/`Rule` callback (BEH-EC-003, and every worked example). A step used by ten scenarios is written ten times. **BEH-EC-012's own worked example demonstrates the problem**: `Given('a discount code {string} worth {int}% expiring in {string}', …)` appears verbatim twice, in two Scenarios inside one Rule.

All four comparables solve this, and it is the default in three of them:

- **cucumber-js** — a global step registry is the only model; steps are inherently shared.
- **jest-cucumber** — `loadFeatures(glob)` + `autoBindSteps(features, [stepDefinitions])`, documented as the way to "scale better as your test suite grows."
- **@amiceli/vitest-cucumber** — `defineSteps(({ Given }) => …)`, described as "globally pre-define steps that are available in all features without re-implementation." Notably, this is the library effect-cucumber positions itself against, and it has this.
- **playwright-bdd** — global `Given`/`When`/`Then` plus class decorators with inheritance.

- **Would be:** a new behavior extending **BEH-EC-003** (step registration scope) and **BEH-EC-002** (`describeFeature`'s Layer).
- **Complexity: HIGH — and uniquely so for this library.** A shared step is `(...params) => Effect<A, E, R>` for some `R`, and every `describeFeature` that consumes it must provide that `R`. So a step library is really a *typed* step library: either the collection is parameterized by its `R` and `describeFeature` checks the consuming Layer against the union of every imported step's `R`, or the library is bound to a declared World/service type up front. This is a real design problem with no ecosystem answer to copy — the comparables can hand-wave it because their steps are untyped.
- **Recommendation:** this is a genuine table-stakes gap but a poor fit for the current milestone. Its answer touches the project's central type-level mechanism, and getting the milestone's core proven first is the right sequencing. Flag it for the *next* milestone rather than absorbing it into this one. Users will hit it on their second feature file, so it should not sit in "not planned."

### Gap 3 — `loadFeature`'s failure path is unspecified (**REAL, small**)

BEH-EC-001 states only what `loadFeature` must do on success (parse via `@cucumber/gherkin`; register no test). It says nothing about a missing file, a malformed `.feature`, or an unsupported dialect. cucumber-js surfaces parse errors with line and column. Because `loadFeature` is called at module top level, a raw throw here surfaces as a vitest *collection* error — a materially worse experience than a named error pointing at a line.

- **Would be:** extends **BEH-EC-001**. **Complexity: LOW** (`@cucumber/gherkin`'s parser already produces positioned errors; this is a wrapping/message decision).

### Gap 4 — Scenario Outline row test titles are unspecified (**REAL, small**)

BEH-EC-010 covers *typing* of Examples values but never says how each Examples row appears as a distinct vitest test. This matters more here than in comparables precisely *because* of the "no custom reporter" decision (`spec/overview.md`): the vitest test title **is** the report, and it's also what `vitest run -t "<pattern>"` filters on — a capability `spec/overview.md` explicitly promises works unmodified. Two rows named identically are indistinguishable in output and unfilterable. cucumber-js appends example values; jest-cucumber exposes `scenarioNameTemplate` with `featureTitle`/`scenarioTitle`/tags.

- **Would be:** extends **BEH-EC-010** (and touches **BEH-EC-008**, since tag routing and test naming are the same code path). **Complexity: LOW** — each `Pickle` already carries its substituted name.

### Gap 5 — Non-English dialects unstated (**probably a non-gap; confirm cheaply**)

@amiceli documents "Spoken Languages", cucumber-js has a `language` option, playwright-bdd has i18n. `@cucumber/gherkin`'s parser reads the `# language:` header from the file itself, so a French `.feature` most likely parses with zero code. The only exposure is if the runner ever compares a step's *keyword type* (Given/When/Then) against the DSL function used — a check that only exists if Gap 1 is closed with keyword-type validation (as @amiceli does). **Complexity: LOW, probably zero.** Confirm during Gap 1's design; do not schedule a phase for it.

### Explicitly NOT gaps (already covered or already parked — do not re-open)

| Ecosystem feature | Why it's not a gap |
|---|---|
| Full tag expressions (`@a and not @b`) | `@skip`/`@only` + `excludeTags` specified (BEH-EC-008); richer tags **already parked**, roadmap § Planned |
| Retry / `retryTagFilter` | **Already parked**, roadmap § Planned |
| HTML/JSON/Allure/Cucumber Reports output | **Already ruled out** — vitest reporters |
| Own CLI / plugin / test discovery | **Already ruled out** — `.steps.ts` is the discovered module |
| Parallel, sharding, watch, coverage, `-t` filtering | Free from vitest by construction |
| Custom parameter types | ADR-EC-007 + its correction (explicit `ParameterTypeRegistry` lifecycle) |
| Tagged/conditional hooks (`Before({tags: '@x'})`, cucumber-js) | Not covered, but not table stakes — only cucumber-js has it among the four; a differentiator-tier nicety, cheap later |
| `DataTable.raw()` / `.rowsHash()` / `.transpose()` | ADR-EC-008 already scopes "`.hashes()`, and whatever else the DSL needs" — an implementation detail, not a spec gap |
| Per-step / per-scenario timeouts | `it.effect` accepts a timeout; plumbing detail, not a behavior |
| `attach()` / screenshots | Anti-feature here (see table) |
| World / context bag | Covered and deliberately inverted — BEH-EC-004 |

---

## Feature Dependencies

```
BEH-EC-001 loadFeature (parse + compile + correlate)
    ├──requires──> ADR-EC-014 Pickle↔GherkinDocument correlation
    │                  └──enables──> BEH-EC-005 Background inlining
    │                  └──enables──> BEH-EC-008 tag routing (inherited tags)
    │                  └──enables──> BEH-EC-010 Outline substitution
    │                  └──enables──> GAP 1 drift detection (needs the ordered step list)
    │                  └──enables──> GAP 4 Outline row titles (needs the Pickle name)
    └──should gain──> GAP 3 parse-failure behavior

BEH-EC-002 describeFeature takes a Layer
    └──requires──> BEH-EC-003 step registration
                       └──requires──> ADR-EC-007 cucumber-expressions matching
    └──gates──────> GAP 2 shared step libraries (a shared step's R must reconcile
                    with the consuming Layer — this is why Gap 2 is HIGH complexity)

GAP 1 drift detection ──must come after──> BEH-EC-003 + BEH-EC-008
    (an @skip'd or excludeTags-filtered Scenario must NOT be reported as having
     missing steps — playwright-bdd shipped this exact bug and fixed it in issue #73)

GAP 1 ──conflicts with──> a "pending" step status
    (vitest is binary; pick error-or-todo, not a third state)
```

---

## MVP Definition

### Launch With (v1) — the locked 12, plus one

- [x] BEH-EC-001…012 as specified — no change recommended to any of them
- [ ] **GAP 1: feature↔step drift detection** — the one table-stakes capability genuinely missing. Cheap (LOW–MED), and directly on-mission: it converts "runtime failure discovered when the scenario runs" into an authoring-time error, which is the project's stated core value applied to the one axis the Layer check doesn't cover
- [ ] **GAP 3: `loadFeature` failure behavior** — LOW cost, and a top-level throw otherwise degrades into a vitest collection error
- [ ] **GAP 4: Outline row test titles** — LOW cost, and load-bearing for the "vitest reporters + `-t` filtering are our reporting story" decision

### Add After Validation (v1.x)

- [ ] **GAP 2: reusable step definitions** (`defineSteps`-equivalent) — trigger: the first user with two feature files sharing a step, which is essentially immediate. Deferred only because its design touches the central type mechanism and deserves its own milestone
- [ ] Full tag expressions / custom non-reserved tags — already in roadmap § Planned
- [ ] Unreferenced-Examples-column Schema fallback — already in roadmap § Planned
- [ ] Tagged/conditional hooks (`Before` restricted to a tag expression) — depends on tag expressions landing first

### Future Consideration (v2+)

- [ ] Scenario-level retry — already parked; needs `@effect/vitest` retry semantics confirmed against per-Scenario Layer rebuild
- [ ] Lint rule enforcing ADR-EC-009 — already parked
- [ ] Type-aware step stub codegen — only worth it if it can emit a step bound to a real World type (see anti-features)

---

## Feature Prioritization Matrix

| Feature | User Value | Implementation Cost | Priority |
|---|---|---|---|
| BEH-EC-001…012 (locked spec) | HIGH | MEDIUM–HIGH | P1 |
| Gap 1 — drift detection | HIGH | LOW–MEDIUM | **P1** |
| Gap 4 — Outline row titles | MEDIUM | LOW | **P1** |
| Gap 3 — `loadFeature` error path | MEDIUM | LOW | **P1** |
| Gap 5 — dialect confirmation | LOW | ~ZERO | P2 (fold into Gap 1) |
| Gap 2 — shared step libraries | HIGH | HIGH | **P2** (next milestone) |
| Full tag expressions | MEDIUM | MEDIUM | P2 (already parked) |
| Tagged hooks | LOW | LOW | P3 |
| Retry | LOW | MEDIUM | P3 (already parked) |
| Report formats / CLI / plugin | LOW | HIGH | P3 — ruled out |

---

## Competitor Feature Analysis

| Feature | cucumber-js | @amiceli/vitest-cucumber | jest-cucumber | playwright-bdd | effect-cucumber |
|---|---|---|---|---|---|
| Parser | `@cucumber/gherkin` | `@cucumber/gherkin` | `@cucumber/gherkin` | `@cucumber/gherkin` | `@cucumber/gherkin` (ADR-EC-011) |
| Test discovery | own CLI, `.feature` is the test | `.spec.ts` calls `describeFeature` | `.steps.ts` calls `defineFeature` | `bddgen` emits `.spec.js` | `.steps.ts` calls `describeFeature` — no plugin |
| Step binding scope | global registry | per-Scenario **+ global `defineSteps`** | per-feature **+ `autoBindSteps`** | global + decorators | **per-Scenario only — Gap 2** |
| Missing-step detection | `Undefined` status + `strict` + snippets | `StepAbleStepsNotCalledError` (headline feature) | 4 `errors.*` toggles, all default `true` | `bddgen` fails + snippets | **none — Gap 1** |
| World | `this`, untyped | `context`, `any` | closure vars | fixtures + World | **typed `Context.Service`** |
| DI / dependency checking | none | none | none | playwright fixtures (runtime) | **`Layer`, compile-time** |
| Deterministic time | none | none | jest fake timers (manual) | none | **`TestClock`, transparent** |
| Tag filtering | full tag expressions | `includeTags`/`excludeTags` | `tagFilter` (and/or/not/parens) | tag expressions + `@only`/`@skip`/`@fail`/`@fixme` | `@skip`/`@only` + `excludeTags` |
| Rule | grouping only | grouping only | not supported | grouping only | **grouping + a scoped Layer** |
| Reporters | own formatters + publish | vitest | jest | cucumber-html, allure | vitest (by decision) |
| Retry | `retry` + `retryTagFilter` | — | jest retry | playwright retries | parked |
| i18n | `language` option | documented | via parser | documented | unstated (likely free) |

---

## Sources

- cucumber-js configuration reference — https://github.com/cucumber/cucumber-js/blob/main/docs/configuration.md (HIGH)
- Cucumber API docs, step statuses / hooks / data tables — https://cucumber.io/docs/cucumber/api/?lang=javascript (HIGH)
- `@amiceli/vitest-cucumber` — https://github.com/amiceli/vitest-cucumber and Context7 `/amiceli/vitest-cucumber` (`describe-feature.md`, `errors.md`, `configuration.md`, `API-SURFACE.md`) (HIGH)
- jest-cucumber configuration — https://github.com/bencompton/jest-cucumber/blob/master/docs/AdditionalConfiguration.md (HIGH)
- jest-cucumber automatic step binding — https://github.com/bencompton/jest-cucumber/blob/master/docs/AutomaticStepBinding.md (HIGH)
- playwright-bdd docs — https://vitalets.github.io/playwright-bdd/ (MEDIUM: section inventory only; the missing-steps behavior corroborated by issues #17, #59, #73, #201) (MEDIUM)
- quickpickle — https://github.com/dnotes/quickpickle and https://www.npmjs.com/package/quickpickle (MEDIUM: WebSearch/npm summaries; the project's own docs site did not resolve)
- Vitest discussion #10481, community Cucumber-runtime vite plugin — https://github.com/vitest-dev/vitest/discussions/10481 (MEDIUM: community post, zero maintainer replies — cited only as evidence the plugin architecture is still contested)
- effect-cucumber's own `spec/` (overview, invariants, roadmap, behaviors 01–03, ADR-EC-007/008/014) and `.planning/PROJECT.md` (HIGH — primary)

---
*Feature research for: Gherkin/Cucumber BDD on a JS test runner*
*Researched: 2026-08-28*
