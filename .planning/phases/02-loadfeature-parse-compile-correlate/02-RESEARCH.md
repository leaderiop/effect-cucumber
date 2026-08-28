# Phase 2: `loadFeature` — Parse, Compile, Correlate - Research

**Researched:** 2026-08-28
**Domain:** Gherkin AST↔Pickle correlation over `@cucumber/gherkin@42.0.1`, in a zero-Effect, synchronous, pure-data package
**Confidence:** HIGH — every behavioral claim below was reproduced this session by executing the packages installed in this repo. Three claims inherited from `.planning/research/PITFALLS.md` were **refuted or materially refined**; those are called out explicitly.

> **No CONTEXT.md exists for this phase.** `/gsd:discuss-phase` was skipped. Every design
> call this document makes is therefore a *recommendation from evidence*, not a locked user
> decision. Six of them are genuine one-way doors and are collected in
> [Decisions the Plan Must Lock](#decisions-the-plan-must-lock) — the planner should treat
> that section as the discuss-phase substitute.

---

<phase_requirements>

## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| **PARSE-01** | A `.feature` file can be loaded via `loadFeature`, which parses it via `@cucumber/gherkin` and has no observable effect on the test run by itself (BEH-EC-001) | [Decision D1](#d1-loadfeaturepath--parsefeaturesource-uri--ship-both) settles the sync signature; [Pitfall P1](#pitfall-p1-a-vitest-file-with-no-describeit-is-a-hard-failure-so-success-criterion-1-cannot-be-tested-literally) proves the naive test for "contributes zero tests" is impossible and gives the two that work |
| **PARSE-02** | `loadFeature` correlates the raw `GherkinDocument` with `compile()`'s Pickle output — substituted step text, inherited tags, stacked Background steps (ADR-EC-014) | [Verified Id & Correlation Contract](#the-verified-id-and-correlation-contract) — every field re-verified this session, including the two indices and the `origin`/keyword recovery that pickles alone cannot give |
| **PARSE-03** | A Background step with a leftover un-interpolated `<placeholder>` fails with a specific, named error rather than a confusing downstream "unmatched step" (ADR-EC-014 correction) | [The Fixture Table](#the-fixture-table-the-phases-real-scope) rows F7–F9 + [Decision D4](#d4-the-leftover-placeholder-check-must-be-column-aware-not-a-bare--regex) — a bare `<...>` regex has **verified false positives**; the check must be Examples-column-aware |

</phase_requirements>

---

## Summary

`@cucumber/gherkin@42.0.1`'s `Parser.parse()` + `compile()` pair does exactly what ADR-EC-014
says it does, and the correlation spine described in `.planning/research/ARCHITECTURE.md`
(two `Map` indices built during one AST walk) is correct as written — I re-verified every field
of the id contract against the installed package rather than trusting the prior write-up. The
real work of this phase is not the happy path; it is the **eleven distinct ways `compile()`
produces a silently wrong or silently empty result**, each of which must become a named,
located `LoadFeatureError`.

Executing the installed packages produced **five findings that are not in PITFALLS.md**, three
of which change the plan's scope:

1. **A `Scenario Outline:` with no `Examples:` block at all produces one pickle with the step
   text left un-interpolated** (`Given a <x>`). This is a different code path from the
   empty-`Examples:` case (which produces *zero* pickles) and PITFALLS.md's table does not
   contain it. It is exactly detectable via `dialects[language].scenarioOutline`.
2. **Placeholders inside a Background step's DataTable cells and DocString content are also
   left un-interpolated** under an Outline. PITFALLS.md says to check "every Pickle step's
   text" — checking only `text` misses this.
3. **A typo'd step keyword written before any valid step is silently swallowed into
   `scenario.description`** and the step vanishes from both the AST and the pickle, with no
   error. The same typo written *after* a valid step is a loud parse error. Position-dependent,
   not previously documented anywhere in the research corpus.
4. **Two Scenarios in one Feature may legally share a name**, which makes the name-based
   scope-matching that both ARCHITECTURE.md (Open Question 4) and this phase's success
   criterion 4 depend on *ambiguous*. This needs a decision, not just an implementation.
5. **A bare `/<[^>]*>/` leftover-placeholder check has verified false positives** on legitimate
   step text (`2 < 3`, `<div>hello</div>`, `<a@b.com>`).

And **three PITFALLS.md claims were refuted or refined** — see
[Corrections to Prior Research](#corrections-to-prior-research). The most consequential:
Pitfall 30's recommended check is unnecessary work (Gherkin's grammar already rejects the
input), and Pitfall 7's missing-trailing-pipe fixture will silently test the wrong thing unless
the pipe is omitted from **both** the header and the body row.

**Primary recommendation:** Build `parseFeature(source, uri)` as the testable core and
`loadFeature(path)` as a two-line `readFileSync` wrapper over it; run one AST walk that builds
both correlation indices *and* a `Set` of the Examples column names per Outline; then run a
single `validate` pass over the correlated result that emits every row of
[the fixture table](#the-fixture-table-the-phases-real-scope) as a distinct
`LoadFeatureError` reason. Write the fixtures first — they are the phase's actual specification.

---

## Architectural Responsibility Map

This phase lives entirely inside one tier, which is itself the finding: nothing in Phase 2 may
reach for Effect, vitest, or a test runner.

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Read `.feature` bytes from disk | Node filesystem (`node:fs`) | Vite module graph (`?raw`) | BEH-EC-001's signature is `(path: string) => ParsedFeature`; async fs is forbidden by Pitfall 2. The `?raw` path is the *consumer's* choice and enters via `parseFeature`, not `loadFeature` |
| Gherkin lexing/parsing | `@cucumber/gherkin` `Parser` | — | ADR-EC-011: never hand-roll. Owns dialects, error positions, grammar |
| Placeholder substitution, tag inheritance, Background stacking | `@cucumber/gherkin` `compile()` | — | ADR-EC-014 + Anti-Pattern 1: re-deriving any of these drifts from Cucumber semantics |
| Structure (Feature▸Rule▸Scenario), keyword, step origin, un-interpolated names | `GherkinDocument` AST walk | — | Verified absent from `Pickle`/`PickleStep`; only recoverable via `astNodeIds` → AST |
| Correlation (AST ⋈ Pickle) | `@effect-cucumber/gherkin` `Correlate` | — | ADR-EC-014's core; this library owns `ParsedFeature` |
| Silent-failure detection & error typing | `@effect-cucumber/gherkin` `Validate` + `Errors` | — | ADR-EC-019 "fail loudly". Upstream will not do this (see [Open Questions](#open-questions)) |
| Error *transport* (thrown vs. `Effect` error channel) | **Plain thrown classes** | — | ADR-EC-015 forbids `effect` in this package **in any manifest field**; `Data.TaggedError` is unavailable. See [Decision D2](#d2-errors-are-plain-classes-extending-error-datataggederror-is-not-available) |
| Step matching / parameter types | **Phase 3** — not this phase | — | Independent subtree (ARCHITECTURE.md); no dependency either way |
| `DataTable` wrapper (`.hashes()`) | **Phase 4** — not this phase | — | This phase passes the raw `PickleStepArgument` through; see [Scope Boundary](#scope-boundary-what-this-phase-must-not-build) |

---

## Project Constraints (from AGENTS.md, STATE.md, and spec/)

There is no `CLAUDE.md`. `AGENTS.md` is this repo's equivalent and is normative. These
directives have the same authority as locked decisions — a plan that violates one is wrong,
not merely unconventional.

### Hard constraints (a violation fails CI)

| Constraint | Source | Consequence for Phase 2 |
|------------|--------|-------------------------|
| **`@effect-cucumber/gherkin` must never gain an `effect` dependency in any field** | ADR-EC-015; STATE.md "New since 01-04" | No `Data.TaggedError`, no `Effect`, no `Schema` in this package. If the phase concludes it needs Effect, that is an **ADR revision**, not a manifest edit |
| **No semicolons, double quotes, 120 cols, no trailing commas** | STATE.md 01-03; `dprint.json` | Run `pnpm lint-fix`, never hand-format. `dprint check` is a required CI step |
| **`erasableSyntaxOnly` + `verbatimModuleSyntax` workspace-wide** | `tsconfig.base.json`; STATE.md 01-01 | **Verified this session:** `constructor(readonly reason: string)` fails with `TS1294`. Error classes must declare fields explicitly and assign in the constructor body. Type-only imports must be `import type` |
| **All `effect`/`@effect/*` imports are submodule namespace imports** | STATE.md 01-03; vendored oxlint rule | Not applicable in this package (no Effect), but applies to any Phase 2 test living under `packages/vitest` |
| **Version bumps happen only in `pnpm-workspace.yaml`** | STATE.md 01-04 | A new devDependency uses `catalog:` (dev pins) or `catalog:peer` (peer ranges). The two are **not** interchangeable |
| **`--frozen-lockfile` on every CI install** | STATE.md 01-06 | Any manifest change must land with the regenerated `pnpm-lock.yaml` **in the same commit** |
| **Every CI step is a root `package.json` script** | STATE.md 01-06 | A new gate (e.g. typechecking test files) needs a root script *and* a `check.yml` step. "A script nobody runs is back to being a convention" |
| **`files: ["src/**/*.ts", "dist"]`** | STATE.md 01-04 | `.feature` fixtures under `test/` are correctly excluded from the tarball. Do not add them |
| **`exports` is the only resolution surface; no `main`/`types`** | STATE.md 01-04 | A subpath export (e.g. `./errors`) must be added to **both** `exports` and `publishConfig.exports`, or it 404s for consumers while working locally. Prefer a single barrel |

### Spec-fidelity constraints

- **`spec/` is normative; code follows the spec** (AGENTS.md §1). A change to public behavior
  updates the behavior doc, the invariant, and `spec/traceability.md` **in the same change**.
  `pnpm verify:spec` is a required CI step.
- **Say only what is true** (AGENTS.md §4). Do not write a spec doc as if a capability is
  enforced when it is not.
- **IDs are permanent and contiguous** (AGENTS.md §6). If this phase needs a new behavior for
  `loadFeature`'s failure path (Gap 3 — it does), allocate the next free `BEH-EC-NNN`; never
  renumber or reuse.
- **`packages/gherkin/src/index.ts` is a placeholder that says so.** Phase 2 replaces it
  (STATE.md 01-01).
- Spec `` ```typescript `` fences are *runnable examples* that will be compiled against the
  real API once it exists (AGENTS.md §2). `` ```ts `` is reference-only. Any spec example
  Phase 2 writes should be `typescript` if it can compile.
- `spec/**/*.md` is dprint-formatted **including its fenced blocks** (STATE.md 01-03). Run
  `pnpm format` after editing spec files.

---

## Scope Boundary: What This Phase Must **Not** Build

The roadmap parallelizes Phases 2, 3, 4, and 5. Straying across these lines creates merge
conflicts in `packages/gherkin/src/` with no compensating benefit.

| Out of scope | Owned by | Why it's tempting |
|--------------|----------|-------------------|
| `StepMatcher`, `CucumberExpression`, `ParameterTypeRegistry` | Phase 3 | `@cucumber/cucumber-expressions` is already a declared dependency of this package |
| `DataTable` wrapper (`.hashes()`/`.raw()`/`.rowsHash()`) | Phase 4 | The correlation pass touches `PickleStepArgument`; the urge to wrap it there is strong. **Pass it through unwrapped** and let Phase 4 wrap it |
| DocString + DataTable calling convention | Phase 4 | Verified reachable in v42 (fixture F25 belongs to *this* phase's fixture set, but the *convention* is Phase 4's API decision) |
| Anything importing `vitest`, `@effect/vitest`, or `effect` | Phase 5/6 | ADR-EC-015 |
| Drift detection (MATCH-03/04/05) | Phase 6 | Needs the registered step tree, which does not exist yet |
| Test titles / `file:line` naming (Gap 4, Pitfalls 21/23) | Phase 6 | This phase must **expose** `pickle.location` on `ParsedScenario`; it must not decide the title format |

**One deliberate exception:** this phase must expose *both* the un-interpolated AST scenario
name and the interpolated pickle name on `ParsedScenario`. That is success criterion 4, it is
ARCHITECTURE.md's Open Question 4, and retrofitting it into `Model.ts` after Phase 6 consumes
the contract is expensive.

---

## Standard Stack

No new runtime dependencies. Every package this phase needs is already installed and declared.

### Core (already present — verified in `packages/gherkin/package.json` and `node_modules`)

| Library | Declared range | Installed | Purpose | Why standard |
|---------|---------------|-----------|---------|--------------|
| `@cucumber/gherkin` | `^42.0.1` | 42.0.1 | `Parser`, `AstBuilder`, `GherkinClassicTokenMatcher`, `compile`, `Errors`, `dialects` | ADR-EC-011: official parser, no bespoke alternative. `[VERIFIED: npm registry — latest is 42.0.1, published 2026-08-05]` |
| `@cucumber/messages` | `^34.2.1` | 34.2.1 | All message *types* + `IdGenerator` | `IdGenerator` is **not** re-exported by `@cucumber/gherkin`. Pitfall 16 (a live defect at research time) is **already fixed** — the explicit dependency exists |
| `@cucumber/cucumber-expressions` | `^20.1.0` | 20.1.0 | — | Declared, but **Phase 3's** concern. Untouched here |

`[VERIFIED: source read]` `@cucumber/gherkin`'s full export surface, read from the installed
package this session:

```
AstBuilder, Errors, GherkinClassicTokenMatcher, GherkinInMarkdownTokenMatcher,
Parser, TokenScanner, compile, dialects, generateMessages, makeSourceEnvelope
```

Two of these matter and are **not mentioned anywhere in the prior research corpus**:

- **`dialects`** — a record of 80 languages, each with `scenario`, `scenarioOutline`,
  `background`, `rule`, `examples` keyword arrays. `[VERIFIED]`
  `dialects.en.scenarioOutline === ["Scenario Outline", "Scenario Template"]`;
  `dialects.en.scenario === ["Example", "Scenario"]`;
  `dialects.fr.scenarioOutline === ["Plan du scénario", "Plan du Scénario"]`.
  **This is what makes the Outline-vs-Scenario checks (F3, F4) exact rather than heuristic, in
  every language.** It is typed — `dialects[lang]` narrows to `Dialect | undefined` under
  `noUncheckedIndexedAccess`, verified compiling.
- **`generateMessages` / `makeSourceEnvelope`** — a higher-level envelope-streaming API. Not
  needed; noted so nobody rediscovers it mid-plan and reopens the design.

### Supporting (dev-only — **must be added**, see Wave 0)

| Package | Range to use | Purpose | Currently |
|---------|-------------|---------|-----------|
| `vitest` | `catalog:` (→ `^4.1.0`) | Test runner for this package's own tests | **Not declared** in `packages/gherkin`. That package has **no `devDependencies` block at all** |
| `@types/node` | `catalog:` (→ `^26.4.0`) | Types for `node:fs` | In the catalog; **installed nowhere in the repo** |

### Alternatives Considered

| Instead of | Could use | Tradeoff |
|------------|-----------|----------|
| `readFileSync` in `loadFeature` | `?raw` import only, drop the path API | Violates BEH-EC-001's literal signature and forces every consumer onto a Vite-specific import. **Rejected** — ship both (D1) |
| `IdGenerator.incrementing()` | `IdGenerator.uuid()` | `[VERIFIED]` `incrementing()` collides across files (both files' first Scenario gets id `"1"`). `uuid()` costs a UUID per node and is collision-free by construction. **Take `uuid()`** (D3) |
| Hand-rolled `origin` detection via `astNodeIds.length` | AST-walk `byStepId` index | `[VERIFIED]` the length heuristic is right for Outline pickles and **wrong for plain-Scenario pickles** (both Background and Scenario steps are length 1). The index is mandatory |
| `err.name` to discriminate parse errors | `instanceof Errors.*` | `[VERIFIED]` `CompositeParserException.name === "Error"` — the classes do **not** set `.name`. Switching on `.name` silently matches nothing |

**Installation (Wave 0):**

```bash
# 1. add to pnpm-workspace.yaml catalog if not present (@types/node already is)
# 2. add to packages/gherkin/package.json devDependencies as catalog: refs
pnpm install   # regenerate pnpm-lock.yaml — must be committed in the SAME commit (--frozen-lockfile)
```

---

## Package Legitimacy Audit

`slopcheck@0.6.1` installed and run this session (`slopcheck install ...`). Note: `slopcheck
install` **attempts a real `npm install`** as a side effect; here it failed harmlessly on this
repo's `catalog:` protocol and left the working tree clean (verified with `git status`). A
future run should prefer `slopcheck scan`.

| Package | Registry | Age | Source repo | Maintainer | slopcheck | Disposition |
|---------|----------|-----|-------------|------------|-----------|-------------|
| `@cucumber/gherkin` | npm | created 2020-01-10; 42.0.1 published 2026-08-05 | github.com/cucumber/gherkin | `cukebot <cukebot@cucumber.io>` | `[OK]` | Approved — already installed |
| `@cucumber/messages` | npm | created 2020-01-09 | github.com/cucumber/messages | `cukebot` | `[OK]` | Approved — already installed |
| `@cucumber/cucumber-expressions` | npm | created 2020-01-10 | github.com/cucumber/cucumber-expressions | `cukebot` | `[OK]` | Approved — not used this phase |
| `vitest` | npm | — | github.com/vitest-dev/vitest | — | `[SUS]` | **Approved anyway — false positive.** slopcheck's only complaint is *"Suspiciously close to 'vite'. Could be a typosquat."* `vitest` is the repo's already-installed, catalog-pinned runner (4.1.11) and `@effect/vitest@4.0.0-rc.112` declares it as a peer. Documented so the planner does not gate it |
| `@types/node` | npm | — | DefinitelyTyped | — | not run (types-only) | Approved — already in `pnpm-workspace.yaml`'s catalog |

**Packages removed due to `[SLOP]`:** none.
**Packages flagged `[SUS]`:** `vitest` — adjudicated a false positive above; **no
`checkpoint:human-verify` needed.**

**Postinstall check** `[VERIFIED: npm view]` — none of the three `@cucumber/*` packages
declares a `postinstall`. Their `scripts` blocks contain only `fix`/`lint`/`test`/`build`
(biome, mocha, tsc).

**Net:** this phase adds **zero new runtime dependencies**. The supply-chain surface is
unchanged from Phase 1.

---

## Architecture Patterns

### System Architecture

```
   .feature bytes                    .feature?raw string
   (consumer path)                   (consumer path, Vite module graph)
         │                                    │
         │  loadFeature(path)                 │  parseFeature(source, uri)
         ▼                                    │
   ┌───────────────┐                          │
   │ Source        │  readFileSync            │
   │  ENOENT ──────┼──▶ LoadFeatureError      │
   │               │     reason:"MissingFile" │
   └───────┬───────┘                          │
           │  { uri, data }                   │
           └──────────────┬───────────────────┘
                          ▼
              ┌──────────────────────────┐
       newId ─┤ Parser.parse(data)       │──throws──▶ CompositeParserException
    (uuid,    │  AstBuilder(newId)       │            │  .errors[] {message,location}
     ONE per  │  ClassicTokenMatcher     │            │  NoSuchLanguageException (nested)
     call,    └────────────┬─────────────┘            ▼
     shared)               │ GherkinDocument     LoadFeatureError
           ┌───────────────┤   .feature may be     reason:"ParseFailed" | "UnknownDialect"
           │               │   UNDEFINED           (first error prominent, rest collapsed)
           │               ▼
           │      doc.feature === undefined ──▶ LoadFeatureError reason:"NoFeature"
           │               │
           │               ▼
           │   ┌───────────────────────────────────────────┐
           │   │  AST WALK  (one pass, four outputs)       │
           │   │  ① byStepId:  step.id ─▶ {step, owner,    │
           │   │      ruleId}   owner ∈ feature-background │
           │   │                      | rule-background    │
           │   │                      | scenario           │
           │   │  ② astScenarios: ordered, w/ ruleId,      │
           │   │      keyword, UN-interpolated name        │
           │   │  ③ exampleColumns: scenarioId ─▶ Set<col> │
           │   │  ④ dialect = dialects[feature.language]   │
           │   └───────────────┬───────────────────────────┘
           │                   │
           └──▶ compile(doc, uri, newId) ──▶ readonly Pickle[]
                               │
                               ▼
                    ┌──────────────────────────┐
                    │ ⑤ byScenarioId:          │
                    │   astNodeIds[0] ─▶ Pickle[]  ◀── one-to-MANY
                    └────────────┬─────────────┘
                                 ▼
                    ┌──────────────────────────┐
                    │  CORRELATE               │
                    │  per AST scenario node:  │
                    │   join ①②③⑤             │
                    │   recover keyword+origin │
                    │   keep astName AND       │
                    │        pickleName        │
                    └────────────┬─────────────┘
                                 ▼
                    ┌──────────────────────────┐
                    │  VALIDATE  (11 checks)   │──▶ LoadFeatureError (named + located)
                    │  see the Fixture Table   │    ── or ── Warning[] on ParsedFeature
                    └────────────┬─────────────┘
                                 ▼
                           ParsedFeature
                    (cross-package contract; Model.ts)
                                 ▼
                    ══ package boundary ══  →  Phase 5/6
```

**The load-bearing property:** validation is a **separate pass over the correlated result**,
not checks scattered through the walk. That is what lets the fixture table be a 1:1 test
table, and what lets a fixture assert *which* error fired rather than "something threw."

### Recommended Project Structure

Follows `.planning/research/ARCHITECTURE.md`'s decomposition, minus the Phase 3/4 modules.

```
packages/gherkin/src/
├── index.ts        # public barrel: loadFeature, parseFeature, types, error classes
├── Errors.ts       # LoadFeatureError + LoadFeatureErrorReason union
├── Source.ts       # readFeatureSource(path) -> {uri, data}   [the ONLY node:fs import]
├── Model.ts        # ParsedFeature/ParsedRule/ParsedScenario/ParsedStep  [the contract]
├── Parser.ts       # parseDocument(data, uri, newId) -> GherkinDocument  [error wrapping]
├── Pickles.ts      # compilePickles(doc, uri, newId) -> readonly Pickle[]
├── Correlate.ts    # the AST walk + the two indices + the join
├── Validate.ts     # the 11 checks; the fixture table's 1:1 counterpart
└── loadFeature.ts  # Source ∘ Parser ∘ Pickles ∘ Correlate ∘ Validate

packages/gherkin/test/
├── fixtures/*.feature      # ONE fixture per table row; named after the reason
├── Correlate.test.ts       # PARSE-02 — the row-by-row assertions
├── Validate.test.ts        # PARSE-03 — one test per LoadFeatureErrorReason
├── loadFeature.test.ts     # PARSE-01 — sync, top-level, ?raw and path parity
└── dialect.test.ts         # Gap 5 — `# language: fr`
```

**Why `Validate.ts` is separate from `Correlate.ts`:** several checks (F3, F4, F5, F13) need
the *correlated* view — an AST node plus its pickle set. Inlining them into the walk means the
walk both builds and judges, and a fixture failure can no longer tell you whether correlation
or validation broke.

**Why `Source.ts` isolates `node:fs`:** `parseFeature(source, uri)` must be usable with no
filesystem at all (it is the `?raw` entry point, and it is what every correlation test calls).
Keeping the single `node:fs` import in a one-function module also confines the
browser-incompatibility to one file.

### Pattern 1: One id generator per `loadFeature` call, shared by `AstBuilder` **and** `compile`

**What:** construct `IdGenerator.uuid()` once; pass the same function to both.

**Why both halves matter — `[VERIFIED]` this session:**

- *Fresh `incrementing()` per file collides.* Two different Features parsed with two fresh
  `incrementing()` generators both gave their Scenario id `"1"` and their Pickle id `"3"`. Any
  cross-file map keyed on a node id is corrupt.
- *Independent generators for parse and compile collide with each other.* Parsing with one
  `incrementing()` and compiling with another gave `scenario.id === "1"` **and**
  `pickle.id === "1"` in the same document. `astNodeIds` still correctly referenced the parse
  generator's ids, so correlation survived — but any structure keyed on "some id" now has two
  meanings for `"1"`.
- *`Parser` instances are reusable.* `parse()` resets the builder and token matcher; two
  sequential parses with one shared generator gave ids `1` and `3`. Reuse is safe but buys
  nothing here — construct per call for clarity.

```typescript
// Source: verified against @cucumber/gherkin@42.0.1 this session
import { AstBuilder, GherkinClassicTokenMatcher, Parser, compile } from "@cucumber/gherkin"
import { IdGenerator } from "@cucumber/messages"

const newId = IdGenerator.uuid()                         // ONE per loadFeature call
const parser = new Parser(new AstBuilder(newId), new GherkinClassicTokenMatcher())
const document = parser.parse(source)
const pickles = compile(document, uri, newId)            // SAME generator
```

### Pattern 2: The verified id and correlation contract

Every row re-read from the installed `@cucumber/gherkin@42.0.1` and `@cucumber/messages@34.2.1`
this session. `[VERIFIED]`

| Field | Value | Notes |
|-------|-------|-------|
| `Pickle.astNodeIds` | `[scenario.id]` for a plain Scenario | |
| `Pickle.astNodeIds` | `[scenario.id, examplesRow.id]` per Examples row | Every row of one Outline shares `astNodeIds[0]` → index as `Map<id, Pickle[]>`, never `Map<id, Pickle>` |
| `Pickle` keys | `id, uri, location, astNodeIds, name, language, steps, tags` | **`location` and `language` exist** — PITFALLS.md implies you must look up the row node for the line. You do not |
| `Pickle.location` | the **Examples body row's** location for an Outline; the Scenario's otherwise | Verified: a 2-row Outline at lines 9 and 10 gave `{line:9}` and `{line:10}` |
| `PickleStep` keys | `id, text, type, argument, astNodeIds` | **No `location`, no `keyword`.** Both require the `byStepId` lookup |
| `PickleStep.astNodeIds` | `[step.id]`, plus `examplesRow.id` for interpolated Outline *scenario* steps | Background steps under an Outline stay length 1 — see the anti-pattern below |
| `Pickle.tags` | feature ⧺ rule ⧺ scenario ⧺ **examples-block** tags, flattened, in that order | Verified exactly: `["@featuretag","@ruletag","@scenariotag","@exampletag"]`. Per-Examples-block tags land only on that block's rows |
| `Pickle.steps` | feature-Background ⧺ rule-Background ⧺ scenario steps, in run order | |
| `Pickle.name`, `PickleStep.text` | `interpolate()`d — **with the documented exceptions** | See F7/F8 |
| AST `Step.keyword` | `"Given "`, `"And "`, `"* "` — **includes a trailing space** | Trim before comparing or storing |
| AST `Step.keywordType` | `Context \| Action \| Outcome \| Conjunction \| Unknown` | `And`/`But` → `Conjunction`; `*` → `Unknown` |
| `PickleStep.type` | `Context \| Action \| Outcome \| Unknown` — **no `Conjunction`** | `And b` after `Given a` reports `Context`; `But d` after `When c` reports `Action`. Confirms Anti-Pattern 7 empirically |
| `GherkinDocument.uri` | **`undefined`** when parsing from a string | `Parser.parse(source)` never sets it. `ParsedFeature.uri` must come from the caller |
| `GherkinDocument.feature` | **`undefined`** (not `null`) for an empty/comment-only file | PITFALLS.md writes `feature == null`; `=== null` would miss it |

**The two indices, built in one AST walk:**

```typescript
// Source: derived from the verified contract above; type-checked against this repo's
// tsconfig.base.json (strict, noUncheckedIndexedAccess, exactOptionalPropertyTypes,
// erasableSyntaxOnly) — compiles clean.
import type { Pickle, Step } from "@cucumber/messages"

export type StepOwner = "feature-background" | "rule-background" | "scenario"

export interface AstStepInfo {
  readonly step: Step                 // .keyword, .location, .text all live here
  readonly owner: StepOwner
  readonly ruleId: string | undefined
}

// ① built while walking Feature.children and Rule.children
const byStepId = new Map<string, AstStepInfo>()

// ⑤ built from the pickle array — note Array, not a single Pickle
const byScenarioId = new Map<string, Array<Pickle>>()
for (const p of pickles) {
  const key = p.astNodeIds[0]                       // string | undefined here
  if (key === undefined) continue                   // defensive; see cucumber-js idiom below
  const bucket = byScenarioId.get(key)
  if (bucket === undefined) byScenarioId.set(key, [p])
  else bucket.push(p)
}
```

`noUncheckedIndexedAccess` is **on**, so `p.astNodeIds[0]` is `string | undefined` and the
guard is mandatory, not stylistic. This aligns with cucumber-js's own defensive idiom
(`ids.map(id => map[id]).filter(x => x != null)[0]`) — `astNodeIds` legitimately contains ids
absent from any given map.

### Pattern 3: Dialect-aware Outline detection

`compile()` branches on `examples.length === 0`, **never on the keyword** — which is precisely
why F3 and F4 are silent. `dialects` closes the gap exactly, in all 80 languages.

```typescript
// Source: @cucumber/gherkin@42.0.1 `dialects` export, verified this session
import { dialects } from "@cucumber/gherkin"

export const isOutlineKeyword = (language: string, keyword: string): boolean => {
  const d = dialects[language]                      // Dialect | undefined
  return d === undefined ? false : d.scenarioOutline.includes(keyword.trim())
}
```

`[VERIFIED]` truth table — the entire basis for checks F3 and F4:

| AST `keyword` | `examples.length` | pickles produced | verdict |
|---|---|---|---|
| `Scenario` | 0 | 1 | normal |
| `Scenario Outline` | 1 (with body rows) | N | normal |
| `Scenario Outline` | **0** | **1, step text left as `a <x>`** | **ERROR (F3)** |
| `Scenario Outline` | 1 (empty or header-only) | **0** | **ERROR (F1/F2)** |
| `Scenario` | **1** | **N, compiled as an Outline** | **ERROR (F4)** |
| `Plan du scénario` (fr) | 1 | N | normal — `feature.language === "fr"` |

### Anti-Pattern: inferring step origin from `astNodeIds.length`

Tempting, and **verified wrong exactly half the time**:

- In an *Outline* pickle: Background step `astNodeIds === ["0"]` (length 1); Scenario step
  `astNodeIds === ["2","4"]` (length 2). The heuristic works.
- In a *plain Scenario* pickle: Background step `["0"]`, Scenario step `["16"]` — **both
  length 1**. The heuristic gives no signal.

Use the `byStepId` index. It is built anyway for keyword and line recovery.

### Anti-Pattern: re-deriving substitution, tag inheritance, or Background stacking

ADR-EC-014 forbids it and ARCHITECTURE.md's Anti-Pattern 1 explains why. Iterate
`pickle.steps` in order; read `pickle.tags`; read `pickle.name`. The AST walk exists **only**
to recover what pickles structurally cannot carry: keyword, origin, Rule membership,
un-interpolated names, Examples column names, and step line numbers.

---

## The Fixture Table (the phase's real scope)

PITFALLS.md's "Looks Done But Isn't" checklist, expanded into the executable fixture set the
roadmap asks for, with **every row re-verified against `@cucumber/gherkin@42.0.1` this
session**. Rows marked **NEW** are not in PITFALLS.md. Rows marked **REFINED**/**REFUTED**
correct it.

Fixture files should be named for the reason they trigger, so a failing test names the defect.

### Group A — silently zero or silently wrong `compile()` output → `LoadFeatureError`

| # | Fixture | Verified behavior | Detection | Reason tag |
|---|---------|-------------------|-----------|-----------|
| F1 | `Scenario Outline` + `Examples:` with **no header row** | 0 pickles, no error. AST node orphaned | AST scenario id absent from `byScenarioId` | `EmptyExamples` |
| F2 | `Scenario Outline` + `Examples:` with a **header but no body rows** | 0 pickles, no error | same | `EmptyExamples` |
| F3 **NEW** | `Scenario Outline:` with **no `Examples:` block at all** | **1 pickle**, step text `a <x>` left literal | `isOutlineKeyword` ∧ `examples.length === 0` | `OutlineWithoutExamples` |
| F4 | plain `Scenario:` **with** an `Examples:` table | **N pickles**, compiled as an Outline | `isScenarioKeyword` ∧ `examples.length > 0` | `ScenarioKeywordWithExamples` |
| F5 | Scenario with **zero steps** | 1 pickle, `steps: []`, **and its Background steps are dropped too** | `pickle.steps.length === 0` | `ZeroStepScenario` |
| F6 | Zero-step Scenario **inside a Rule that has a Background** | same — rule Background dropped as well | same | `ZeroStepScenario` |
| F7 | `<name>` in a **feature Background** step, Feature contains an Outline | literal `<name>` in **every** Examples row's pickle | leftover `<col>` where `col` ∈ that Outline's Examples header | `UninterpolatedPlaceholder` |
| F8 **NEW** | `<name>` in a Background step's **DataTable cell** (or DocString), under an Outline | cell value stays `"<x>"`; the Scenario step's own table cell *is* interpolated to `"1"` | same check applied to `argument.dataTable.rows[].cells[].value` and `argument.docString.content` | `UninterpolatedPlaceholder` |
| F12 | comment-only or empty file | parses fine; `doc.feature === undefined`; 0 pickles | `doc.feature === undefined` | `NoFeature` |
| F22 **NEW** | **two Scenarios with the identical name** in one Feature | legal; 2 pickles, distinct `astNodeIds`, identical `name` | duplicate un-interpolated names within one scope | `DuplicateScenarioName` — see [D5](#d5-duplicate-scenario-names-must-be-rejected-here-not-discovered-in-phase-6) |

### Group B — parse-time throws → wrap, do not leak

| # | Fixture | Verified behavior | Reason tag |
|---|---------|-------------------|-----------|
| F16 | missing file | `readFileSync` throws Node `ENOENT` (`.code`, `.path`, `.syscall`) | `MissingFile` |
| F17 | malformed `.feature` (misplaced tag before `Background:`) | `CompositeParserException`; `.errors` had **9** entries for one bad line; **`.location` on the composite is `undefined`** — locations live only on `.errors[i].location` | `ParseFailed` |
| F18 | `# language: xx` | `CompositeParserException` wrapping **one** `NoSuchLanguageException` at `{line:1,column:1}`, message `Language not supported: xx` | `UnknownDialect` (distinct from `ParseFailed`) |
| F10 **REFINED** | Examples **body row only** missing its trailing `\|` | **THROWS** `AstBuilderException: inconsistent cell count within the table` at the row. Already loud | `ParseFailed` |
| F15 **NEW** | typo'd step keyword **after** a valid step (`Given y` then `Ginve x`) | **THROWS** `CompositeParserException` at the typo's line. Already loud | `ParseFailed` |
| F20 **REFUTED** | feature-level `Background:` written **after** a `Rule:` | **THROWS** `UnexpectedTokenException` — Gherkin's grammar forbids it outright. **PITFALLS.md Pitfall 30's premise ("Gherkin syntax permits it") is false; its recommended check is dead work.** Keep the fixture to *pin* the parse error; delete the check | `ParseFailed` |

### Group C — silent-wrong, but detection is heuristic → **warning**, not error

Emitting these as hard errors would reject legitimate feature files. See
[D4](#d4-the-leftover-placeholder-check-must-be-column-aware-not-a-bare--regex) and
[D6](#d6-warnings-need-a-carrier-on-parsedfeature).

| # | Fixture | Verified behavior | Detection |
|---|---------|-------------------|-----------|
| F9 **REFINED** | Examples **header *and* body row both** missing the trailing `\|` | Last column silently dropped (header cells `["a"]`, body `["1"]` — **counts consistent**, so the F10 guard does not fire) and `<b>` survives as literal text. This is upstream [cucumber/gherkin#22](https://github.com/cucumber/gherkin/issues/22), **still open** (confirmed via GitHub API this session; title *"Gherkin quietly ignores unfinished table cells"*, opened 2021-05-04). **A fixture that omits the pipe only on the body row tests F10 instead and passes for the wrong reason.** | leftover `<name>` where `name` ∉ header columns |
| F11 | duplicate Examples header columns `\| a \| a \|` | First column wins for both occurrences (`<a> twice <a>` → `1 twice 1`). No error. [cucumber/gherkin#28](https://github.com/cucumber/gherkin/issues/28) | duplicate values in `tableHeader.cells` |
| F13 | `Rule:` containing no Scenarios | 0 pickles, silent | AST rule with zero scenario children |
| F14 **NEW** | typo'd step keyword **before** any valid step (`Ginve x` then `Given y`) | **Silently swallowed into `scenario.description`** (`"  Ginve x"`); the AST has 1 step, the pickle has 1 step, no error at any layer. A step the author wrote simply does not exist | non-empty `description` on a Scenario/Background. Cheap high-signal version: **include the description verbatim in the `ZeroStepScenario` message**, since that is where a swallowed sole step lands |

### Group D — correctness fixtures (PARSE-02, no error expected)

| # | Fixture | What it must assert |
|---|---------|---------------------|
| F21 | Background + Rule + Rule-Background + Outline + tags at feature/rule/scenario/examples level | **Row by row**: step texts substituted; Background steps first in `feature-bg, rule-bg, scenario` order; `origin` correct on each; `keyword` recovered from the AST (trailing space trimmed); tags flattened in feature⧺rule⧺scenario⧺examples order |
| F23 | Two different Features loaded in **one process** | Union of node ids has no duplicates (D3's regression pin) |
| F24 | Outline with **two** `Examples:` blocks, tags on each | 3 scenarios from 2 blocks; per-block tags land only on that block's rows; all share `astNodeIds[0]` |
| F19 | `# language: fr` (`Fonctionnalité`/`Contexte`/`Scénario`/`Etant donné que`) | Parses with **zero** special handling. `feature.language === "fr"`, keyword `"Fonctionnalité"`, step keyword `"Etant donné que "`, pickles normal. **Gap 5 closed** |
| F26 | Outline whose interpolated row names **all differ** from the outline title | `ParsedScenario` exposes **both** `astName` (un-interpolated `"outline <name>"`) and `name` (interpolated `"outline a"`). Success criterion 4 |
| F27 | 3-row Outline with a title that does **not** reference the varying column | 3 scenarios, **identical `name`**, **distinct `location.line`**. Pins the raw material Phase 6 needs for unique titles; this phase must not invent the title |
| F25 | Step carrying **both** a DocString and a DataTable | Both survive correlation with `argumentIndex` 1 and 2. **Fixture only** — the calling convention is Phase 4's decision |

---

## Decisions the Plan Must Lock

No CONTEXT.md exists, so these are unresolved. Each is cheap now and expensive later.

### D1: `loadFeature(path)` **and** `parseFeature(source, uri)` — ship both

BEH-EC-001 specifies `(path: string) => ParsedFeature`. Pitfall 3 (watch mode) requires the
`?raw` string path. These are not in conflict — one is a two-line wrapper over the other.

```typescript
export const parseFeature = (source: string, uri: string): ParsedFeature => { /* the core */ }
export const loadFeature  = (path: string): ParsedFeature =>
  parseFeature(readFeatureSource(path), path)
```

`[VERIFIED]` in this repo, vitest 4.1.11, **no config file needed**: a test file importing
`./fixtures/probe.feature?raw` at module top level received a `string`, and
`readFileSync(new URL("./fixtures/probe.feature", import.meta.url), "utf8")` produced a
**byte-identical** value. Both parse+compile fine at module evaluation time.

Recommend `parseFeature` be the entry point every correlation/validation test calls — it needs
no filesystem, so fixtures can be inline template literals where a file adds nothing.

**Must not happen:** an async or `Effect`-returning `loadFeature`. PITFALLS.md rates the
recovery cost HIGH (public API break) and marks it "Never" in the technical-debt table.

### D2: Errors are plain classes extending `Error`; `Data.TaggedError` is **not** available

ADR-EC-015 + STATE.md forbid `effect` in this package in any manifest field. ARCHITECTURE.md's
Anti-Pattern 6 says "Using `Data.TaggedError` for those classes is fine" — **that is not
available here**, and following it would trigger the ADR revision STATE.md warns about.

`[VERIFIED]` — this shape compiles clean under this repo's exact `tsconfig.base.json` (strict,
`erasableSyntaxOnly`, `verbatimModuleSyntax`, `noUncheckedIndexedAccess`,
`exactOptionalPropertyTypes`) and passes `dprint check` and `oxlint`:

```typescript
export type LoadFeatureErrorReason =
  | "MissingFile"
  | "ParseFailed"
  | "UnknownDialect"
  | "NoFeature"
  | "OutlineWithoutExamples"
  | "EmptyExamples"
  | "ZeroStepScenario"
  | "UninterpolatedPlaceholder"
  | "ScenarioKeywordWithExamples"
  | "DuplicateScenarioName"

export class LoadFeatureError extends Error {
  readonly _tag = "LoadFeatureError"
  readonly reason: LoadFeatureErrorReason
  readonly uri: string
  readonly line: number | undefined
  constructor(args: {
    reason: LoadFeatureErrorReason
    uri: string
    line?: number
    message: string
    cause?: unknown
  }) {
    super(args.message, args.cause === undefined ? undefined : { cause: args.cause })
    this.name = "LoadFeatureError"
    this.reason = args.reason
    this.uri = args.uri
    this.line = args.line
  }
}
```

Two hard constraints proven this session:

- **Parameter properties are forbidden.** `constructor(readonly reason: string)` fails with
  `TS1294: This syntax is not allowed when 'erasableSyntaxOnly' is enabled.` Declare fields,
  assign in the body.
- **`this.name` must be set explicitly.** `@cucumber/gherkin`'s own error classes do not — their
  `.name` is `"Error"` — which is why `instanceof Errors.CompositeParserException` is the only
  reliable discriminator upstream. Do not repeat that mistake downstream.

`readonly _tag` is a plain string-literal property, not an Effect import; it keeps the class
trivially adaptable when `@effect-cucumber/vitest` maps it into an error channel in Phase 6.

**One reason tag per fixture-table row** is what makes success criterion 3 ("a *distinct*,
named `LoadFeatureError`") testable: assert `err.reason`, not the message text.

### D3: `IdGenerator.uuid()`, one per call, shared by `AstBuilder` and `compile`

`[VERIFIED]` — `incrementing()` collides both across files and between the parse and compile
generators (see Pattern 1). `uuid()` removes both failure modes structurally, at the cost of a
UUID per node.

**Consequence for a future memo:** PITFALLS.md's performance note suggests memoizing
`loadFeature` by source string. With `uuid()` that is still correct (the memoized
`ParsedFeature` is reused wholesale), but the ids differ between two `loadFeature` calls on
identical source. Never persist or compare node ids across calls.

### D4: The leftover-placeholder check must be **column-aware**, not a bare `<...>` regex

This is PARSE-03's core mechanism and the naive form is wrong. `[VERIFIED]` false positives on
legitimate, correctly-parsed step text:

```
"the assertion 2 < 3 holds"
"the html is <div>hello</div>"
"an email <a@b.com>"
```

All three survive `compile()` unchanged and are perfectly valid Gherkin. A
`/<[^>]*>/` check errors on all three.

**Recommended split — one exact check, one heuristic:**

| Check | Rule | Verdict | Catches | False positives |
|-------|------|---------|---------|-----------------|
| **α (exact)** | in a pickle correlated to an Outline, a `<name>` where `name` **is** one of *that Outline's* Examples header columns | **ERROR** `UninterpolatedPlaceholder` | F7 (Background-in-Outline — the ADR-EC-014 correction, i.e. PARSE-03 itself), F8 (Background table cells) | **none** — the column name is proof of intent |
| **β (heuristic)** | in a pickle correlated to an Outline, a `<name>` where `name` is **not** a header column | **WARNING**, naming the columns that *do* exist | F9 (dropped column), a `<typo>` in a placeholder name | `<div>`-shaped text inside an Outline |

Check α must scan **step text, DocString content, and every DataTable cell value** (F8).
Check β applies only to Outline-correlated pickles — a plain Scenario has no columns and must
never be scanned, which removes the `2 < 3` / `<a@b.com>` class entirely.

This is precisely the check ADR-EC-014's correction blockquote demands, and its prescribed
message ("this is a known `@cucumber/gherkin` limitation for Backgrounds nested under a
Scenario Outline, not a bug in your Background text") should be used verbatim for the F7 case.

### D5: Duplicate Scenario names must be rejected **here**, not discovered in Phase 6

`[VERIFIED]` two Scenarios named `dup` in one Feature parse fine, yield distinct AST ids
(`"1"`, `"3"`), and two pickles both named `"dup"`.

Success criterion 4 and ARCHITECTURE.md's Open Question 4 both settle on matching a Scenario to
its registered definition **by the un-interpolated AST name**. Neither noticed that names are
not unique. Phase 6 will join `ParsedFeature` against the registry by that name and hit a
genuine ambiguity with no good runtime answer.

**Recommendation:** `loadFeature` rejects a Feature containing two Scenarios with the same
un-interpolated name **within the same scope** (Feature-level, or within one Rule), reason
`DuplicateScenarioName`, message naming both line numbers. This is strictly additive, costs one
`Map` during the walk, and turns a Phase-6 design hole into an authoring-time error — exactly
the project's stated core value applied to one more axis.

Open sub-question the planner should decide: is the *scope* for uniqueness the Feature or the
Rule? Recommend **per-scope** (two Rules may each contain a `Scenario: happy path`), because
Phase 6's scope-chain resolution (ARCHITECTURE.md Pattern 5) is already per-scope.

### D6: Warnings need a carrier on `ParsedFeature`

Group C is non-fatal but must not be silent. `ParsedFeature` needs a
`readonly warnings: ReadonlyArray<LoadFeatureWarning>` field (same reason-tag treatment, no
throw). Phase 6 already needs a Feature-level warning channel for MATCH-05 ("a registered
pattern matching zero steps is a Feature-level warning, not a hard failure") — build one
carrier now, not two later.

Decide *how a warning surfaces to a human* in Phase 6, not here. This phase only produces the
data.

### D7: Test-file type-checking is currently unwired — decide, don't inherit

`tsc -b` covers `include: ["src"]` only. `packages/vitest/test/` is deliberately outside the
solution build (STATE.md 01-02), and the root `tsconfig.json` references only the two package
projects. **Phase 2 is the first phase to write real test files**, so it inherits an open
question Phase 1 explicitly deferred: are `packages/gherkin/test/**` type-checked at all?

They are transpiled-not-checked by vitest either way, so tests can be wrong in ways CI never
catches. If the answer is "yes, check them," STATE.md's rule applies: it needs a **root
`package.json` script** *and* a `check.yml` step, or it is a convention, not a gate.

---

## Don't Hand-Roll

| Problem | Don't build | Use instead | Why |
|---------|-------------|-------------|-----|
| Placeholder substitution | your own `interpolate()` | `compile()`'s output | ADR-EC-014; Cucumber's exact semantics including the documented exceptions |
| Tag inheritance | union of feature/rule/scenario tag arrays | `pickle.tags` | Verified flattening order includes per-Examples-block tags, which a hand-roll forgets |
| Background stacking | concatenating `Background.steps` onto `Scenario.steps` | `pickle.steps` | Verified ordering is feature-bg ⧺ rule-bg ⧺ scenario; ADR-EC-014 explicitly forbids reimplementation |
| Knowing a keyword is a Scenario Outline in language X | a hardcoded English string list | `dialects[language].scenarioOutline` | 80 languages, shipped, typed, already a dependency |
| Node ids | a counter of your own | `IdGenerator.uuid()` | Verified collision behavior of the alternative |
| Gherkin lexing, dialect headers, error positions | anything | `Parser` | ADR-EC-011; explicitly out of scope in REQUIREMENTS.md |
| An Outline row's reported line number | looking up `astNodeIds.at(-1)` in a row-id map | `pickle.location` | Verified per-row precise; the lookup is dead code |
| Discriminating gherkin's error classes | `err.name === "..."` | `instanceof Errors.X` | Verified `.name` is `"Error"` on every one of them |

**Key insight:** every one of the eleven silent failures below is a case where `@cucumber/gherkin`
does the *right* thing for its own purpose (producing runnable pickles) and the *wrong* thing
for ours (telling an author their feature file is broken). `cucumber-js` layers its own
validation on top; a naive wrapper does not. This phase **is** that validation layer — it is
not incidental hardening, it is the deliverable.

---

## Common Pitfalls

### Pitfall P1: A vitest file with no `describe`/`it` is a hard failure, so success criterion 1 cannot be tested literally

`[VERIFIED]` — a test file containing only a top-level `?raw` import and a `console.log`
produced:

```
FAIL  packages/gherkin/test/__notests.test.ts
Error: No test suite found in file .../__notests.test.ts
Test Files  1 failed (1)
```

Roadmap success criterion 1 says `loadFeature` "called at module top level in a vitest file
with no steps registered, contributes zero tests and produces no error." A plan that writes
that file verbatim produces a **red** suite and the phase looks broken.

**Two formulations that do work — use both:**

1. **Behavioral:** a test file that calls `loadFeature` at module top level *and* contains
   exactly one `it`, asserting the parse succeeded. The file reporting exactly one test is the
   evidence that `loadFeature` contributed none.
2. **Structural (stronger, and the one to gate on):** `@effect-cucumber/gherkin` declares no
   dependency on `vitest`, `@effect/vitest`, or `effect` in `dependencies`/`peerDependencies`,
   and no file under `packages/gherkin/src/` imports them. A `loadFeature` that cannot reach a
   test runner **cannot** register a test — this proves PARSE-01 by construction rather than by
   observation. It also directly guards ADR-EC-015. This is a natural root script + `check.yml`
   step, consistent with STATE.md's rule.

### Pitfall P2: `@types/node` is not installed anywhere — `node:fs` will not compile

`[VERIFIED]`, and it blocks `Source.ts`'s first line:

```
with types:[]      → error TS2591: Cannot find name 'node:fs'.
with types:["node"] → error TS2688: Cannot find type definition file for 'node'.
```

Both are needed: `@types/node` (in the catalog at `^26.4.0`, installed in **no** package) added
to `packages/gherkin`'s `devDependencies` as `catalog:`, **and** `"types": ["node"]` added to
`packages/gherkin/tsconfig.json` — the workspace-wide `types: []` is inherited and suppresses
everything (STATE.md 01-01: "Packages opt into ambient types only when actually needed"; Phase 2
is when it is needed).

`packages/gherkin/package.json` currently has **no `devDependencies` block at all**, so `vitest`
must be added there too or `import { describe, it, expect } from "vitest"` has no types.

Both changes require a regenerated `pnpm-lock.yaml` in the same commit (`--frozen-lockfile`).

### Pitfall P3: The F9 fixture will silently test the wrong thing

Copying PITFALLS.md's Pitfall 7 row ("Examples row missing its trailing `|` → last column
silently dropped") and writing a fixture with the pipe omitted from the **body row only**
produces `AstBuilderException: inconsistent cell count within the table` — a *loud* parse
error, i.e. **not the bug**. A test asserting "this errors" then passes for entirely the wrong
reason and the real silent-drop path stays untested.

The pipe must be omitted from **both the header and the body row**. `[VERIFIED]`: header cells
`["a"]`, body cells `["1"]`, counts consistent, and the step compiles to `"1 and <b>"`.

### Pitfall P4: Pitfall 30's check is dead work

`[VERIFIED REFUTATION]` — a feature-level `Background:` after a `Rule:` throws
`UnexpectedTokenException` at the `Background:` line. Gherkin's grammar (`Feature := header
Background? ScenarioDefinition* Rule*`) forbids it. PITFALLS.md asserts "Gherkin syntax permits
it; the semantics silently differ" and recommends a one-line AST-walk check.

**Do not implement that check.** Keep a fixture that pins the parse error so the assumption is
guarded if upstream ever relaxes the grammar; delete the walk-time check from scope.

### Pitfall P5: The cascading-error handler must survive two error shapes

`[VERIFIED]`:

- Default (`stopAtFirstError === false`): `CompositeParserException`, `.errors` present,
  **`.location === undefined` on the composite**. One misplaced tag produced **9** errors, all
  variations of "expected: #TagLine, #RuleLine, #Comment, #Empty" covering the rest of the file.
  The parser hard-stops past ~10 collected errors.
- `stopAtFirstError = true`: a bare `UnexpectedTokenException` with **no `.errors` array** and
  `.location` present.

Normalise as `err.errors ?? [err]` (cucumber-js's own idiom). Reading `.errors` unconditionally
throws a `TypeError` *while handling a parse error* — the worst place for a second bug. Report
the **first** error prominently with the rest collapsed; the real defect is buried under eight
consequences.

`NoSuchLanguageException` arrives through the *same* composite wrapper, so the handler must
inspect `errors[0]` via `instanceof` to route it to the distinct `UnknownDialect` reason rather
than a generic `ParseFailed`.

### Pitfall P6: `doc.feature` is `undefined`, not `null`

`[VERIFIED]` for both a comment-only file and an empty string. PITFALLS.md and ADR discussion
both write `gherkinDocument.feature == null`. Loose `==` covers it; a `=== null` check does
not, and `if (!doc.feature)` is fine. Worth one deliberate line rather than an accidental one.

### Pitfall P7: A swallowed step is invisible at every layer

`[VERIFIED]` — `Scenario: ok` followed by `Ginve x` then `Given y` yields
`scenario.description === "  Ginve x"`, an AST with **one** step, and a pickle with **one**
step. No error anywhere. The author wrote two steps; one silently does not exist. The same typo
*after* a valid step is a loud parse error, so the behavior is position-dependent and will not
be found by casual testing.

There is no exact detector (a description is legal Gherkin). The cheap, high-signal mitigation
is to **quote the scenario's `description` inside the `ZeroStepScenario` error message** —
which is where a swallowed *sole* step lands, and turns the single most confusing case into a
self-explaining one. Anything beyond that (edit-distance against dialect keywords) is
speculative; flag it, do not build it.

---

## Code Examples

### Recovering keyword, line, and origin for one pickle step

```typescript
// Source: verified field-by-field against @cucumber/messages@34.2.1 this session.
// PickleStep has no `keyword` and no `location` — both come from the AST via byStepId.
const resolveStep = (
  ps: PickleStep,
  byStepId: ReadonlyMap<string, AstStepInfo>
): ParsedStep => {
  const sourceId = ps.astNodeIds[0]
  const info = sourceId === undefined ? undefined : byStepId.get(sourceId)
  if (info === undefined) {
    throw new LoadFeatureError({
      reason: "ParseFailed",
      uri,
      message: `Pickle step ${JSON.stringify(ps.text)} references unknown AST node ${sourceId}`
    })
  }
  return {
    text: ps.text,                       // already interpolated (with F7/F8 exceptions)
    keyword: info.step.keyword.trim(),   // AST keyword carries a TRAILING SPACE
    keywordType: info.step.keywordType,  // Context|Action|Outcome|Conjunction|Unknown
    origin: info.owner,                  // feature-background|rule-background|scenario
    line: info.step.location.line,       // PickleStep carries no location
    argument: ps.argument                // raw; Phase 4 wraps it
  }
}
```

### Reconciling AST scenarios against pickles in both directions

```typescript
// Source: the F1/F2/F3/F4 rows of the fixture table, each reproduced this session.
for (const node of astScenarios) {
  const produced = byScenarioId.get(node.id) ?? []
  const isOutline = isOutlineKeyword(language, node.keyword)

  if (isOutline && node.examples.length === 0) {
    // F3: compile() takes the plain-Scenario branch; ONE pickle, placeholders left literal
    fail("OutlineWithoutExamples", node)
  } else if (isOutline && produced.length === 0) {
    // F1/F2: Examples with no header, or a header with no body rows
    fail("EmptyExamples", node)
  } else if (!isOutline && node.examples.length > 0) {
    // F4: compile() branches on examples.length, never on the keyword
    fail("ScenarioKeywordWithExamples", node)
  }

  for (const pickle of produced) {
    if (pickle.steps.length === 0) fail("ZeroStepScenario", node)  // F5/F6 — bg dropped too
  }
}
```

### The exact (check α) leftover-placeholder scan

```typescript
// Source: D4. Scans text AND arguments; scoped to Outline-correlated pickles;
// matched against THAT outline's own Examples header columns -> zero false positives.
const PLACEHOLDER = /<([^<>]+)>/g

const scanForLeftovers = (pickle: Pickle, columns: ReadonlySet<string>): Array<string> => {
  const found: Array<string> = []
  const check = (s: string): void => {
    for (const m of s.matchAll(PLACEHOLDER)) {
      const name = m[1]
      if (name !== undefined && columns.has(name)) found.push(name)
    }
  }
  for (const step of pickle.steps) {
    check(step.text)
    const doc = step.argument?.docString
    if (doc !== undefined) check(doc.content)
    const table = step.argument?.dataTable
    if (table !== undefined) {
      for (const row of table.rows) for (const cell of row.cells) check(cell.value)
    }
  }
  return found
}
```

---

## Runtime State Inventory

Not applicable — this is a greenfield phase adding new source files to an existing package. No
rename, refactor, or migration. No stored data, live service config, OS-registered state, or
secrets are involved.

One artifact note: `packages/gherkin/dist/` currently holds the build output of the Phase 1
placeholder `index.ts`. It is git-ignored and regenerated by `tsc -b`; replacing `index.ts` is
sufficient. `packages/gherkin/tsconfig.tsbuildinfo` likewise.

---

## State of the Art

| Old approach | Current approach | When changed | Impact on this phase |
|---|---|---|---|
| One step argument: DocString **or** DataTable | v42 permits **both**, with `argumentIndex` recording source order | `@cucumber/gherkin@42.0.0`, 2026-07 | The `if (docString) … else if (dataTable)` shape in every pre-v42 example silently drops one. Fixture F25 belongs here; the calling convention is Phase 4's |
| `Errors` deep-imported from `dist/Errors.js` | `Errors` is a named export of the package index | — | Use `import { Errors } from "@cucumber/gherkin"`; no deep import needed |
| Look up `astNodeIds.at(-1)` in a row-id map for the reported line | `Pickle.location` is already the per-row location | — | Removes a whole index the prior research implied was necessary |
| Hardcoded English keyword strings | `dialects` export (80 languages) | — | Makes F3/F4 exact in every language instead of English-only |

**Deprecated / not applicable here:**
- `ARCHITECTURE.md`'s suggestion that `Data.TaggedError` is acceptable in this package —
  superseded by ADR-EC-015 + STATE.md ("must never gain an `effect` dependency in any field").
- `PITFALLS.md` Pitfall 16 (undeclared `@cucumber/messages`) — **already fixed**; the explicit
  dependency is present and resolves.

---

## Corrections to Prior Research

Recorded so the planner does not implement work that the installed library already handles, and
so a fixture is not written that tests the wrong thing. Every correction below was produced by
running the package, per PITFALLS.md's own gap 8 ("trust the installed package over any
secondhand report, **including this document's**").

| Source claim | Verified reality | Planning consequence |
|---|---|---|
| **PITFALLS.md Pitfall 30** — "a `Background:` written after a `Rule:` … Gherkin syntax permits it; the semantics silently differ." Recommends a walk-time check | **Parse error** (`UnexpectedTokenException`). The grammar forbids it | **Remove the check from scope.** Keep a fixture that pins the parse error |
| **PITFALLS.md Pitfall 7 table** — "Examples row missing its trailing `\|` → last column silently dropped" | True **only if the header also lacks it**. Row-only → loud `AstBuilderException` | Fixture F9 must omit the pipe on **both** lines, or it tests F10 and passes for the wrong reason |
| **PITFALLS.md Pitfall 12** — cites `cucumber/gherkin#11` as the open issue about Background steps being indistinguishable | `#11` is titled *"gherkin: Compiling empty scenarios"* (open since 2017-08-18), about **zero-step scenarios**. Its author advocates emitting them as *undefined* test cases | Citation error only. It is actually **corroborating evidence for F5**: upstream's own preferred direction is "undefined," never "green pass" |
| **PITFALLS.md Pitfall 7 / ADR discussion** — `gherkinDocument.feature == null` | The value is `undefined` | Use `=== undefined` or a falsy check; never `=== null` |
| **PITFALLS.md Pitfall 11** — "flag any un-interpolated `<...>` remaining in any pickle step's **text**" | Verified false positives on legitimate text; and placeholders also survive in **DataTable cells and DocString content** | Split into exact check α (column-aware, scans arguments too) and heuristic check β (warning). See D4 |
| **ARCHITECTURE.md Anti-Pattern 6** — "`Data.TaggedError` … is fine" | ADR-EC-015 + STATE.md forbid `effect` in this package in any field | Plain classes extending `Error`. See D2 |
| **ARCHITECTURE.md Open Question 4** — match a Scenario to its scope by the un-interpolated AST name | Two Scenarios may legally share a name | Names are necessary but not sufficient; reject duplicates at `loadFeature`. See D5 |
| **PITFALLS.md Pitfall 21** — `Pickle.location` "is per-row precise for Outlines" | Confirmed — and `Pickle` also carries `uri` and `language` | No correction; noted because the same document elsewhere implies a row-id lookup is needed. It is not |

---

## Environment Availability

| Dependency | Required by | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js | everything | ✓ | v22.22.0 local; CI matrix 22 + 24 | — |
| pnpm | install/build | ✓ | 10.26.1 (`packageManager`) | — |
| `@cucumber/gherkin` | parse + compile | ✓ | 42.0.1, resolves from `packages/gherkin` | — |
| `@cucumber/messages` | `IdGenerator` + types | ✓ | 34.2.1, **explicitly declared** (Pitfall 16 already fixed) | — |
| `vitest` | this package's tests | ✓ installed (4.1.11) | **✗ not declared in `packages/gherkin`** | none — add as `catalog:` |
| `@types/node` | `node:fs` in `Source.ts` | **✗ installed nowhere** | catalog says `^26.4.0` | none — **blocking**, see P2 |
| `typescript` (tsgo) | `tsc -b` gate | ✓ | catalog `^7.0.2` | — |
| `dprint` / `oxlint` | format + lint gates | ✓ | 0.56.1 / 1.80.0 | — |
| Vite `?raw` transform | the watch-mode-friendly consumer path | ✓ verified working, **no config file needed** | via vitest 4.1.11 / vite 8.2.2 | `readFileSync` (also verified) |
| `slopcheck` | supply-chain gate | ✓ installed this session | 0.6.1 | — |
| Context7 MCP / `ctx7` CLI | library docs | ✗ neither available | — | **Direct source reading of the installed packages** — a strictly stronger source for this phase |

**Missing dependencies with no fallback (blocking, Wave 0):**
- `@types/node` in `packages/gherkin` + `"types": ["node"]` in its tsconfig — `node:fs` will
  not type-check without both.
- `vitest` in `packages/gherkin`'s `devDependencies` — no `devDependencies` block exists today.

**Missing with a fallback:** Context7 — superseded by direct package inspection.

---

## Validation Architecture

`workflow.nyquist_validation` is absent from `.planning/config.json` → treated as enabled.

### Test framework

| Property | Value |
|----------|-------|
| Framework | `vitest@4.1.11` (root devDependency, `catalog:` → `^4.1.0`) |
| Config file | **none** — vitest runs on defaults from the repo root and discovers `**/*.test.ts`, excluding `node_modules` and `dist`. `[VERIFIED]`: `packages/gherkin/test/*.test.ts` is picked up with zero configuration, and `?raw` imports transform correctly |
| Existing suite | 3 files / 40 tests, **all** in `tools/oxlint/effect/test/` (vendored upstream rule tests). **`packages/*` has no tests today** |
| Quick run command | `pnpm vitest run packages/gherkin` |
| Full suite command | `pnpm test` (= `vitest run`) |

### Phase requirements → test map

| Req | Behavior | Test type | Automated command | Exists? |
|-----|----------|-----------|-------------------|---------|
| PARSE-01 | `loadFeature` is synchronous; `?raw` and path forms agree | unit | `pnpm vitest run packages/gherkin/test/loadFeature.test.ts` | ❌ Wave 0 |
| PARSE-01 | the gherkin package cannot reach a test runner (structural proof, P1) | gate script | new root script + `check.yml` step | ❌ Wave 0 |
| PARSE-02 | F21 row-by-row: substitution, Background order, `origin`, keyword, tag inheritance | unit | `pnpm vitest run packages/gherkin/test/Correlate.test.ts` | ❌ Wave 0 |
| PARSE-02 | F24 multi-Examples-block tags; F23 no cross-file id collision; F26 both names exposed; F27 distinct locations | unit | same file | ❌ Wave 0 |
| PARSE-03 | one test per `LoadFeatureErrorReason`, asserting `err.reason` (not message text) | unit | `pnpm vitest run packages/gherkin/test/Validate.test.ts` | ❌ Wave 0 |
| PARSE-03 | Group B parse-error wrapping incl. the `stopAtFirstError` second shape (P5) | unit | same file | ❌ Wave 0 |
| Gap 5 | `# language: fr` parses with no special handling | unit | `pnpm vitest run packages/gherkin/test/dialect.test.ts` | ❌ Wave 0 |
| all | package builds under the strict config | build | `pnpm build` | ✓ wired (CI `types` job) |
| all | style gates | lint | `pnpm lint` | ✓ wired (CI `lint` job) |

### Sampling rate

- **Per task commit:** `pnpm vitest run packages/gherkin` (sub-second — the whole package is pure functions over strings)
- **Per wave merge:** `pnpm test && pnpm build && pnpm lint`
- **Phase gate:** `pnpm test`, `pnpm build`, `pnpm verify:tsgo-gate`, `pnpm lint`,
  `pnpm verify:oxlint-plugin`, `pnpm verify:pack`, `pnpm circular`, `pnpm verify:spec` — i.e.
  every job in `check.yml`, all green, before `/gsd:verify-work`

### Wave 0 gaps

- [ ] `packages/gherkin/package.json` — add a `devDependencies` block: `vitest: "catalog:"`,
      `@types/node: "catalog:"`; commit the regenerated `pnpm-lock.yaml` in the same commit
- [ ] `packages/gherkin/tsconfig.json` — add `"types": ["node"]` (blocking for `node:fs`)
- [ ] `packages/gherkin/test/fixtures/*.feature` — one file per fixture-table row, named for its reason
- [ ] `packages/gherkin/test/Correlate.test.ts`, `Validate.test.ts`, `loadFeature.test.ts`, `dialect.test.ts`
- [ ] Decide + wire test-file type-checking (D7) — if yes: a root script **and** a `check.yml` step
- [ ] Decide whether the PARSE-01 structural gate (P1) is a root script; if yes, add the CI step
- [ ] Allocate a new `BEH-EC-NNN` for `loadFeature`'s failure path (Gap 3) and update
      `spec/traceability.md` — `pnpm verify:spec` is a required check

*Framework install: none needed — `vitest@4.1.11` is already installed at the root.*

---

## Security Domain

`security_enforcement` is absent from `.planning/config.json` → treated as enabled. This is a
build-time developer library that parses developer-authored files; the attack surface is
correspondingly narrow, but two items are real.

### Applicable ASVS categories

| ASVS category | Applies | Standard control |
|---------------|---------|------------------|
| V2 Authentication | no | No identities, no sessions |
| V3 Session Management | no | No sessions |
| V4 Access Control | no | Library code; the caller's filesystem permissions govern |
| V5 Input Validation | **yes** | A `.feature` file is untrusted-ish input (dev-authored, but may be vendored or generated). **All parsing is delegated to `@cucumber/gherkin`; this phase adds no custom lexer, no `new RegExp` built from feature content, and no `eval`** |
| V6 Cryptography | no | None used. `IdGenerator.uuid()` is an identifier source, not a security primitive — do not describe it as one |
| V12 File & Resource | **yes** | `loadFeature(path)` calls `readFileSync` on a caller-supplied path |
| V14 Configuration | partial | Covered by Phase 1's packaging gates (`verify:pack`, publint) |

### Known threat patterns for this stack

| Pattern | STRIDE | Standard mitigation | Status |
|---------|--------|---------------------|--------|
| ReDoS via a `RegExp` built from Gherkin content | Denial of Service | Never construct a `RegExp` from feature text. The `PLACEHOLDER` regex in D4 is a **fixed literal** matched *against* feature text — the safe direction. `compile()`'s own `interpolate` builds a `RegExp` per Examples column, but that is upstream's code and its input is a column *name* | Mitigated by design; verify no dynamic `RegExp` appears in `packages/gherkin/src` |
| Credential leakage through verbose error output into CI logs | Information Disclosure | Feature files legitimately contain fixture credentials. Error messages should carry **step text and `file:line`**, never a full DataTable or DocString dump. Truncate any table/doc content that does appear | **Design constraint for `Errors.ts` — decide the truncation policy in this phase**, since the message formats are being written now |
| Path traversal via `loadFeature(path)` | Tampering | The caller already controls the path and runs in their own process; no privilege boundary is crossed. **No sanitisation warranted** — adding it would be security theatre | N/A by design |
| Supply-chain: a malicious `@cucumber/*` update | Tampering | Ranges are `^`-pinned with a committed `pnpm-lock.yaml`; `--frozen-lockfile` in every CI job; slopcheck `[OK]` on all three | Already enforced by Phase 1 |
| Duplicate `effect` runtime | Tampering | Not applicable — this package has **no** `effect` dependency (ADR-EC-015) | N/A by design |

**The one live item for this phase:** the error-message truncation policy. It is cheap to
decide while writing `Errors.ts` and awkward to retrofit once messages are asserted in tests.

---

## Assumptions Log

| # | Claim | Section | Risk if wrong |
|---|-------|---------|---------------|
| A1 | Rejecting duplicate Scenario names is the right resolution to the name-collision hole, rather than falling back to positional matching | D5 | If a real user Feature legitimately repeats a Scenario name, `loadFeature` rejects a previously-valid file. Additive-error recovery cost is LOW, but it is a **product** decision, not a technical one — the strongest candidate for user confirmation |
| A2 | Group C items (F9, F11, F13, F14) are warnings rather than errors | D6, Fixture Table | Too lenient → a silently-dropped Examples column ships as a warning nobody reads. Too strict → legitimate files rejected. The error/warning split is a policy call |
| A3 | The `warnings` carrier belongs on `ParsedFeature` now rather than being added in Phase 6 | D6 | If Phase 6 wants a different warning shape (MATCH-05), the field is rebuilt. Cost is LOW — internal, pre-publish |
| A4 | Shipping both `loadFeature(path)` and `parseFeature(source, uri)` is preferable to a single entry point | D1 | Two public entry points is more surface. The alternative (path only) breaks Pitfall 3's watch-mode fix; (source only) contradicts BEH-EC-001's literal signature |
| A5 | The `_tag` field is worth carrying on `LoadFeatureError` for Phase 6's benefit | D2 | Harmless if unused; a plain string literal with no Effect coupling |
| A6 | Uniqueness scope for D5 is per-scope (Feature vs. Rule) rather than whole-Feature | D5 | Whole-Feature is stricter and would reject two Rules each containing `Scenario: happy path` — plausibly a legitimate pattern |
| A7 | Truncating DataTable/DocString content in error messages is the right default | Security Domain | Over-truncation makes errors less useful; under-truncation risks leaking fixture credentials into public CI logs |
| A8 | Test-file type-checking is worth wiring (D7) | D7 | If skipped, test files can contain type errors CI never catches. If wired, it costs a script + CI step and may surface pre-existing issues in `packages/vitest/test/` |

**None of A1–A8 is a verified fact.** Each is a recommendation from evidence. A1, A2, A6, and
A7 are the four the planner should most consider surfacing to the user before locking.

---

## Open Questions

1. **Should `loadFeature` throw, or return a result type?**
   - Known: BEH-EC-001's signature is `(path: string) => ParsedFeature` — a plain value, so
     throwing is the only in-signature failure mode. ARCHITECTURE.md's Anti-Pattern 6 confirms
     "synchronous functions that throw typed error classes."
   - Unclear: `loadFeature` is called at module top level, so a throw becomes a vitest
     **collection** error for the whole file — degrading the message quality that Gap 3 exists
     to improve.
   - Recommendation: **throw** (spec-conformant), and make the message excellent —
     `uri:line: <reason>: <what to do>`. Phase 6 can catch and re-route at the
     `describeFeature` boundary where per-Scenario reporting is available. Revisit only if
     Phase 6 finds the collection-error framing unacceptable.

2. **Nothing upstream will fix any of this.**
   - Known: `cucumber/gherkin#11` (empty scenarios, open since 2017) and `#22` (unfinished
     table cells, open since 2021) are both **still open** — confirmed via the GitHub API this
     session. `#22`'s own title is "Gherkin quietly ignores unfinished table cells."
   - Also known (PITFALLS.md gap 10): there is **no** upstream issue at all for
     headerless-Examples-yields-zero-pickles, for `incrementing()` id collisions, or for
     Background-placeholders-not-interpolated. F3, F14, and F22 from this session are likewise
     unreported.
   - Recommendation: treat every fixture-table row as permanent library behavior. Pin each with
     a test so an upstream bump that *changes* the behavior fails loudly rather than silently
     altering this library's semantics.

3. **Does `ParsedFeature` re-export `@cucumber/messages` types, or wrap them?**
   - Known: PITFALLS.md Pitfall 16 notes every `@cucumber/messages` type in the public API
     becomes part of this library's API surface, forcing consumers to declare the dependency
     themselves. ARCHITECTURE.md keeps `document` and `pickles` on `ParsedFeature` as escape
     hatches, which necessarily exposes them.
   - Unclear: whether Phase 6 actually needs those escape hatches.
   - Recommendation: keep `document`/`pickles` (cheap, and removing them later is additive-safe
     in reverse), **and** re-export the handful of types they surface (`GherkinDocument`,
     `Pickle`, `PickleStep`, `Location`) from the barrel so consumers are not forced into
     `@cucumber/messages`. Do **not** add a subpath export for them — STATE.md's rule about
     dual `exports`/`publishConfig.exports` maintenance makes a single barrel the safer shape.

4. **What is the "phase" for `# language:` Markdown features?**
   - Known: `GherkinInMarkdownTokenMatcher` is exported and unused. PITFALLS.md gap 7 flags it
     as untested. Nothing in `spec/` or REQUIREMENTS.md mentions Markdown features.
   - Recommendation: **out of scope, explicitly.** `loadFeature` uses
     `GherkinClassicTokenMatcher` only. Note it in the phase summary so a future reader knows
     the omission was deliberate. `# language: fr` (classic syntax) **is** in scope and
     verified free (F19).

---

## Sources

### Primary — executed against the packages installed in this repository (HIGH confidence)

All behavioral claims marked `[VERIFIED]` come from these, run on 2026-08-28:

- **`@cucumber/gherkin@42.0.1`** — three Node probe scripts covering ~30 fixtures:
  empty/headerless/absent `Examples`, zero-step Scenarios (feature- and Rule-Background),
  plain-`Scenario`-with-Examples, Background-placeholder non-interpolation (text, DocString,
  DataTable cells), multi-`Examples`-block tags, tag inheritance order, `astNodeIds` cardinality,
  `Pickle`/`PickleStep` key inventories, `pickle.location` per Outline row, keyword and
  `keywordType` recovery, `IdGenerator` collision (across files and across parse/compile),
  `Parser` reuse, cascading `CompositeParserException` (9 errors for one bad line),
  `stopAtFirstError` both shapes, `NoSuchLanguageException`, `# language: fr`, missing/duplicate
  Examples header columns, duplicate Scenario names, typo'd step keywords (both positions),
  Background-after-Rule, comment-only and empty files, empty Rules, `dialects` contents,
  DocString+DataTable coexistence, and error-class prototype chains
- **`@cucumber/messages@34.2.1`** — `IdGenerator` (`uuid`, `incrementing`), message type shapes
- **`vitest@4.1.11` in this repo** — `?raw` import vs. `readFileSync` byte-identity at module
  top level; default test discovery under `packages/gherkin/test/`; the
  `Error: No test suite found in file` failure for a describe-less file
- **`tsc` (TypeScript 7 via `@effect/tsgo`) against `tsconfig.base.json`** — the `LoadFeatureError`
  class, both correlation indices, `dialects` narrowing, and `argument` access all compile clean;
  parameter properties fail with `TS1294`; `node:fs` fails with `TS2591`/`TS2688` without
  `@types/node` **and** `"types": ["node"]`
- **`dprint@0.56.1` + `oxlint@1.80.0`** — the proposed code shapes pass both gates unmodified

### Secondary (HIGH — official registry / issue tracker, checked this session)

- `npm view` for `@cucumber/gherkin` (42.0.1, published 2026-08-05), `@cucumber/messages`
  (34.2.1), `@cucumber/cucumber-expressions` (20.1.0), `vitest` (4.1.11); repository URLs,
  creation dates, maintainer (`cukebot@cucumber.io`), and absence of `postinstall` scripts
- `slopcheck@0.6.1` — all three `@cucumber/*` packages `[OK]`; `vitest` `[SUS]` (adjudicated a
  false positive)
- GitHub API — [cucumber/gherkin#22](https://github.com/cucumber/gherkin/issues/22) *"Gherkin
  quietly ignores unfinished table cells"*, **open**, 2021-05-04;
  [cucumber/gherkin#11](https://github.com/cucumber/gherkin/issues/11) *"gherkin: Compiling
  empty scenarios"*, **open**, 2017-08-18

### Project-normative (HIGH)

- `spec/decisions/` — ADR-EC-011, **014** (+ its correction blockquote), **015**, 016, 019
- `spec/behaviors/01-steps-and-world.md` — BEH-EC-001's exact signature
- `AGENTS.md`, `.planning/STATE.md` (accumulated Phase 1 constraints), `.planning/ROADMAP.md`,
  `.planning/REQUIREMENTS.md`
- `tsconfig.base.json`, `pnpm-workspace.yaml`, `packages/gherkin/package.json`,
  `.github/workflows/check.yml`

### Prior research (HIGH, with the corrections recorded above)

- `.planning/research/PITFALLS.md` — Pitfalls 2, 3, 7–12, 16, 24, 30; the "Looks Done But Isn't"
  checklist. Three claims refuted/refined this session
- `.planning/research/ARCHITECTURE.md` — module decomposition, the Parse–Compile–Correlate
  pattern, Anti-Patterns 1/6/7, Open Question 4
- `.planning/research/FEATURES.md` — Gaps 3, 4, 5

### Not available this session

- **Context7 MCP** (`mcp__context7__*`) — not exposed to this agent; **`ctx7` CLI** — not
  installed. Neither was needed: reading the installed package source is a strictly stronger
  source than documentation for every claim in this document, and it is what produced all five
  new findings and all three corrections.

---

## Metadata

**Confidence breakdown:**

| Area | Level | Reason |
|------|-------|--------|
| Library behavior (the fixture table) | **HIGH** | Every row reproduced this session against the exact installed version. Three prior claims refuted by reproduction |
| Id/correlation contract | **HIGH** | Every field re-read from the installed packages; the `Pickle.location`/`language` and `dialects` findings were missed by prior research |
| Module structure | **MEDIUM-HIGH** | Follows ARCHITECTURE.md's verified decomposition; not validated against a shipped implementation |
| Wave 0 blockers | **HIGH** | `@types/node` and `vitest` absence both reproduced with real compiler/runner exit codes |
| Error/warning policy split (D4, D6) | **MEDIUM** | The *mechanisms* are verified; the severity assignment is a judgement call (Assumptions A2, A6) |
| D5 duplicate-name rejection | **MEDIUM** | The collision is verified; rejecting it is a product decision (Assumption A1) |
| Security domain | **MEDIUM-HIGH** | Narrow surface, correctly scoped; the truncation policy is an open design item |

**Research date:** 2026-08-28
**Valid until:** ~2026-09-27 (30 days). `@cucumber/gherkin` moves slowly — 42.0.1 is 3 weeks
old and the behaviors above have been stable for years, several since 2017. Re-verify the
fixture table on any `@cucumber/gherkin` major bump; the pinned fixtures will do it for you.

---
*Phase research for: effect-cucumber Phase 2 — `loadFeature` (Parse, Compile, Correlate)*
*Researched: 2026-08-28*
