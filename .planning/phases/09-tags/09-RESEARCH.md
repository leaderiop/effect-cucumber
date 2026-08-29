# Phase 9: Tags - Research

**Researched:** 2026-08-29
**Domain:** vitest v4 native test tags; `@effect/vitest` `Tester` options plumbing; registration-time filtering in `@effect-cucumber/vitest`'s emission seam
**Confidence:** HIGH (every load-bearing claim was verified empirically against the installed `vitest@4.1.11` / `@vitest/runner@4.1.11` / `@effect/vitest@4.0.0-rc.112` in this repo, not read from training data)

---

## Summary

Phase 9 is smaller in code than it looks and larger in *consequences* than CONTEXT.md assumes. The
mechanical parts are all confirmed working: `ParsedScenario.tags` is already fully flattened with
literal `@` prefixes, `@effect/vitest`'s `it.effect` forwards a `V.TestOptions` object straight
through to vitest's `it(name, options, fn)`, both `{ skip: true }` and `it.effect.skip` produce a
reported-skipped test, and a plain `@only` tag survives a CI-mode run untouched. All four were run,
not reasoned about.

**One CONTEXT.md decision is factually wrong and must be corrected before planning.** D-04's closing
bullet states *"vitest's `strictTags` … is off by default — arbitrary per-Feature tags need no static
declaration."* The opposite is true: `strictTags` defaults to **`true`** in vitest 4.1.11
(`strictTags: config.strictTags ?? true`, and `vitest --help` prints `(default: true)`). With this
repo's current state — no `vitest.config.ts` at all — emitting *any* tag throws synchronously at
collection and fails the **entire test file with zero tests collected**. `.planning/research/PITFALLS.md`
Pitfall 32 already recorded this correctly ("the tag universe must be declared in config, or
registration throws [VERIFIED in source]"); the discuss-phase session contradicted it. A second,
independent trap compounds it: `--tagsFilter` requires the filtered tag to be declared in
`config.tags` **regardless of `strictTags`** — `strictTags: false` silences the test-side check but
does not enable filtering. That means ADR-EC-020's entire `--tagsFilter '@slow && !@wip'` story does
not work for a consumer out of the box.

The good news is that the throw is **catchable at the `it.effect(...)` call site** (verified: a
`try`/`catch` around one tagged emission caught the error, a tagless fallback emission registered
cleanly, and every later sibling in the file still collected). That gives this phase a
seam-preserving mitigation that requires no vitest config from a consumer and turns vitest's
unhelpful raw message into the library's own error naming the `.feature` file — exactly what Pitfall
22 and Pitfall 32 both asked for.

**Primary recommendation:** Emit tags via `TestOptions.tags` on the third argument of `it.effect`,
routing `@skip` through `TestOptions.skip` (not `.skip`, so `TestApi` keeps a single `effect`
member); wrap the real emission in `describeFeature.ts`'s `vitestTestApi` adapter in a
catch-and-degrade that re-emits untagged plus a located library error; apply `includeTags`/
`excludeTags` **inside `emitFeature`'s walk** (never by pre-filtering `plan.scenarios`, which trips
`Runner.ts`'s own "unreachable by construction" throw, and never at plan time, which corrupts the
unused-step-definition warnings); and add a root `vitest.config.ts` declaring the tags this repo's
own fixtures use plus `allowOnly: false`, which makes the repo's whole suite the automated proof of
success criterion 3 with no new machinery.

---

## User Constraints (from CONTEXT.md)

### Locked Decisions

Copied verbatim from `.planning/phases/09-tags/09-CONTEXT.md` `## Implementation Decisions`.

> ### Library-level tag filtering (extends beyond ADR-EC-020)
>
> ADR-EC-020 (Accepted, 2026-08-28) explicitly decided `excludeTags`-style filtering should be
> **pure vitest `--tagsFilter` CLI filtering**, with no `describeFeature`-time registration filter.
> The user deliberately overrides that scope boundary for this phase:
>
> - **D-01:** Add BOTH `includeTags` and `excludeTags` to `describeFeature`'s options object — not
>   just `excludeTags` as ROADMAP.md originally named. Symmetric API: `includeTags` restricts
>   registration to a tag set, `excludeTags` removes a tag set.
> - **D-02:** Syntax is a **plain array of tag strings** (e.g. `excludeTags: ["@slow", "@wip"]`) —
>   not vitest's boolean expression grammar (`"@slow && !@wip"`). No expression parser to write,
>   document, or keep in sync with vitest's own `--tagsFilter` grammar.
> - **D-03:** Filtering happens at **registration time, skipping emission entirely** — a Scenario
>   excluded by `excludeTags` (or not selected by `includeTags`) never becomes an `it.effect` call.
>   It does not appear in test output at all, as if the Scenario were absent from the `.feature`
>   file. (Contrast with `@skip`, which still emits the test but as `it.effect.skip` — this option
>   is a coarser, author-side filter, not another skip mechanism.)
> - **This is additive, not a replacement.** vitest's native `--tagsFilter` CLI mechanism still
>   works independently on whatever tests DO get emitted — `includeTags`/`excludeTags` narrows what
>   `describeFeature` registers in the first place; `--tagsFilter` narrows what runs among
>   registered tests. The two compose (registration-time filter, then CLI-time filter), they don't
>   compete.
> - **Spec impact:** This decision amends ADR-EC-020's stated scope. The planner/researcher should
>   flag this to the spec-reconciliation step of whichever plan closes this phase (mirroring how
>   Phase 8's final plan reconciled spec against what was actually built) — ADR-EC-020's "Decision"
>   section will need an amendment noting the `includeTags`/`excludeTags` addition, or a follow-up
>   ADR should supersede it. Do not silently let the ADR text and the shipped code diverge.
>
> ### Everything else in RUN-05: follow the existing ADR/BEH exactly, no open questions
>
> - **D-04:** Every tag (including inherited ones) is emitted as a native vitest tag via the
>   `tags` field of vitest's `TestOptions` (the object form of `it.effect`'s third parameter,
>   `V.TestOptions`) — confirmed against the installed `vitest@4.1.11` / `@vitest/runner@4.1.11`
>   type declarations: `TestOptions.tags?: string[] | string`. Tag strings keep their literal `@`
>   prefix from the `.feature` file (e.g. `"@skip"`, not `"skip"`) — this matches ADR-EC-020's own
>   `--tagsFilter '@slow && !@wip'` examples and requires no normalization.
> - **D-05:** `@skip` additionally routes to `it.effect.skip` (a real vitest skip, not just a tag).
>   Since `it.effect.skip` never invokes the test body, and `Plan.ts`'s `planFeature` never throws
>   for an unresolved step (`StepMatchError` is only surfaced when that step's Effect actually
>   runs — see `Plan.ts`'s own documented behavior), routing `@skip` scenarios through the real
>   `.skip` path automatically satisfies Pitfall 15's requirement ("a `@skip` Scenario containing an
>   unmatched step reports skipped, not undefined") with no extra design needed.
> - **D-06:** `@only` is NEVER routed to `it.effect.only`. It is emitted as a plain tag only.
> - **D-07:** Only `@skip` and `@only` are reserved/special-cased. Every other tag (`@slow`, `@wip`,
>   anything a Feature author writes) is a plain pass-through tag with no library-defined behavior
>   beyond being filterable.
> - No vitest config changes are needed: the project currently has no `vitest.config.ts` at all
>   (defaults), and vitest's `strictTags` (which would require pre-declaring every used tag) is off
>   by default — arbitrary per-Feature tags need no static declaration.

> ⚠️ **The final bullet of D-04 is FALSIFIED by this research.** `strictTags` defaults to `true`,
> and `--tagsFilter` additionally requires config-declared tags irrespective of `strictTags`. See
> Finding 1 and Finding 2. Everything else in the decision block is confirmed correct. The planner
> must NOT plan against "no vitest config changes are needed" — a `vitest.config.ts` is required for
> this repo's own acceptance tests, and a consumer-facing degradation path is required for the
> library to be usable without one.

### Claude's Discretion

> - Exact shape of the `TestApi.ts` interface extension (how tags/skip options thread from
>   `Runner.ts` through to the real `it.effect` call) — this is implementation architecture, not a
>   user-facing decision. `TestApi.ts` note (b) already documents that `skip`/`only` were
>   *deliberately* left off the interface in Phase 6, reserved for this phase.
> - Whether `it.effect`'s `TestOptions.skip` field or a separate `.skip` method call is used to
>   route `@skip` — both are valid per vitest's type surface; pick whichever keeps `TestApi.ts`'s
>   existing "no vitest import in Runner.ts" seam (note (a)) intact.
> - Tag matching for `@skip`/`@only`/`includeTags`/`excludeTags` is exact-string, case-sensitive
>   (Cucumber tag convention) — no fuzzy or case-insensitive matching was discussed or requested.

### Deferred Ideas (OUT OF SCOPE)

> None — discussion stayed within phase scope. The `includeTags`/`excludeTags` addition is an
> extension of RUN-05's existing scope (tag filtering was already named in BEH-EC-008 "with no
> decided mechanism"), not a new capability requiring its own phase.
>
> ### Reviewed Todos (not folded)
> None — `todo.match-phase` returned zero matches for Phase 9.

---

## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| RUN-05 | Every tag on a Scenario is emitted as a native vitest tag; `@skip` additionally routes to `it.effect.skip`; `@only` is never routed to `it.effect.only` (which fails CI) — running just one Scenario locally is a `--tagsFilter` choice (ADR-EC-020, BEH-EC-008) | Findings 1–8 establish the exact vitest 4.1.11 mechanics (tag declaration requirement, filter semantics, skip semantics, `allowOnly` mechanics). Findings 9–14 establish the extension points in `Plan.ts` / `Runner.ts` / `TestApi.ts` / `describeFeature.ts`. Code Examples give verified call shapes. Pitfalls 1–8 name the failure modes that must be tested. |

---

## Project Constraints (from AGENTS.md)

There is no `CLAUDE.md`; `AGENTS.md` is the equivalent and is normative.

| # | Directive | Impact on this phase |
|---|-----------|----------------------|
| §1 | `spec/` is normative. *"Changing public behavior means updating the relevant behavior doc, invariant, and the traceability matrix in the same change."* | D-01..D-03 change public behavior **and contradict a MUST-level requirement**. Both `spec/decisions/020-…md` **and** `spec/behaviors/02-shared-layers-and-tags.md` §BEH-EC-008 must be amended in the same change. `bash spec/scripts/verify-traceability.sh` must pass afterwards. |
| §2 | Three fence languages: `` ```typescript `` = runnable/compiled example, `` ```ts `` = signature listing. | BEH-EC-008's worked example must stay a `typescript` fence and must be updated if the `describeFeature` signature grows a 4th parameter. |
| §3 | Submodule namespace imports (`import * as Effect from "effect/Effect"`). Enforced by the vendored oxlint rule `effect(no-import-from-barrel-package)` (`bash scripts/verify-oxlint-plugin.sh`). | Any new import in this phase follows the submodule form. |
| §4 | *"Say only what is true."* Don't describe a planned capability as enforced. | If the phase ships a degraded-tags fallback rather than full config-time tag declaration, BEH-EC-008 must say so explicitly. |
| §5 | Tests use `@effect/vitest` (`it.effect`, `it.layer`, `TestClock`). Every `.feature` file in the library's own suite is tagged `@REQ-EC-NNN`. | **Forward dependency:** once Phase 12's dogfooding suite tags its `.feature` files `@REQ-EC-NNN`, every one of those tags becomes a native vitest tag and must be declared in `vitest.config.ts` (or hit the fallback). Plan the config to be extendable. |
| §6 | Permanent IDs with `EC` infix, allocated contiguously, never renumbered or reused. | A superseding ADR (if chosen over amending ADR-EC-020) takes the next free `ADR-EC-NNN`. |

**Project skills:** No `.claude/skills/` or `.agents/skills/` directory exists in this repo. `docs/agents/issue-tracker.md` and `docs/agents/domain.md` are referenced from AGENTS.md's "Agent skills" section; neither adds a constraint on this phase beyond "issues live in GitHub Issues" and "domain vocabulary lives in `spec/`".

---

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Tag parsing & Feature→Rule→Examples inheritance | `@effect-cucumber/gherkin` (`Correlate.ts`) | — | **Already built.** `pickle.tags` is flattened by `@cucumber/gherkin`'s own `compile()`; `Correlate.ts` maps `tag.name`. Nothing in this phase touches it. [VERIFIED: `packages/gherkin/test/Correlate.test.ts:173`] |
| Carrying per-Scenario tags into the emission stage | `packages/vitest/src/Plan.ts` (`ScenarioPlan`) | `Runner.ts` reading `ParsedScenario.tags` off the walk | `ScenarioPlan` already copies `name`/`astName`/`ruleId` off `ParsedScenario`; `tags` is the same kind of value. See Finding 11 for the trade-off against the alternative. |
| Deciding which Scenarios get emitted at all (`includeTags`/`excludeTags`) | `packages/vitest/src/Runner.ts` (`emitFeature`'s walk) | — | Filtering earlier corrupts warnings (Finding 13) or trips `planFor`'s throw (Finding 12). Filtering later is impossible — emission is the last stage. |
| Translating a Scenario's tag set into framework options | `packages/vitest/src/Runner.ts` → `TestApi` | — | `Runner.ts` computes `{ tags, skip }` as **library-owned plain data**, never a vitest type — `TestApi.ts` note (a). |
| Reaching the real `it.effect` with those options | `packages/vitest/src/describeFeature.ts` (`vitestTestApi`) | — | The composition root is the ONLY module allowed to name vitest — `describeFeature.ts` note (e). |
| Catching vitest's `strictTags` throw and degrading | `packages/vitest/src/describeFeature.ts` (`vitestTestApi`) | `Errors.ts` for the located error type | Only the adapter can see the throw, and only it knows the vitest error. `Runner.ts` must not learn about it. |
| Declaring the tag universe for a run | `vitest.config.ts` (**does not exist yet**) | a future `gherkinTags(glob)` helper | vitest requires this at config-load time; no library-side mechanism can substitute. Finding 2. |
| Filtering *runs* among emitted tests | vitest CLI (`--tagsFilter`) | — | ADR-EC-020's "no custom CLI" posture. Composes with, does not replace, the registration filter. |

---

## Standard Stack

No new packages. Everything this phase needs is already installed.

### Core

| Library | Version (verified installed) | Purpose | Why Standard |
|---------|------------------------------|---------|--------------|
| `vitest` | `4.1.11` | Native tag system (`TestOptions.tags`, `test.tags`, `--tagsFilter`, `--listTags`, `strictTags`, `allowOnly`) | ADR-EC-020 selected it; it is the runner this package integrates with. [VERIFIED: `node_modules/.pnpm/vitest@4.1.11_vite@8.2.2`] |
| `@vitest/runner` | `4.1.11` | The collector that owns tag validation, filtering, and `.only` mode interpretation | Transitive; its `dist/chunk-artifact.js` is the ground truth for every semantic claim below. |
| `@effect/vitest` | `4.0.0-rc.112` | `it.effect` / `it.effect.skip`, which forward `V.TestOptions` verbatim | AGENTS.md §5 mandates it; ADR-EC-004 emits one `it.effect` per Scenario. |
| `@effect-cucumber/gherkin` | `workspace:^` | `ParsedScenario.tags` — already flattened & inherited | ADR-EC-014; nothing to change. |

### Alternatives Considered

| Instead of | Could Use | Trade-off |
|------------|-----------|-----------|
| `TestOptions.skip: true` for `@skip` | `it.effect.skip(name, self, opts)` as a second `TestApi` member | Both verified working. The options field keeps `TestApi` at **two** members (`describe`, `effect`) instead of three, so the recording fake in `Runner.test.ts` grows a field rather than a method — `TestApi.ts` note (b)'s stated worry ("force 06-06's recording fake to implement two members no assertion covers") argues for the field. **Recommend the options field.** |
| Filtering inside `emitFeature` | Pre-filtering `collection.plan.scenarios` in `describeFeature.ts` | The pre-filter is **broken**, not merely worse: `emitFeature` walks `plan.feature.scenarios`, not `plan.scenarios`, so a removed plan entry hits `planFor`'s `throw new Error("emitFeature: no ScenarioPlan for scenario id …")`. Finding 12. |
| Filtering inside `emitFeature` | Filtering at `planFeature` time | Silently corrupts MATCH-05 / ADR-EC-019 unused-definition warnings. Finding 13. |
| Plain array `includeTags`/`excludeTags` (D-02) | vitest's boolean expression grammar | Locked by D-02. Worth noting the grammar vitest actually implements, for documentation parity: `&&`/`and`, `||`/`or`, `!`/`not`, parentheses, and `*` wildcards, precedence `not` > `and` > `or`. [VERIFIED: `parseOrExpression`/`parseAndExpression`/`createWildcardRegex` in `chunk-artifact.js`; CITED: vitest.dev/guide/test-tags#syntax] |

**Installation:** one package, added post-research — `tinyglobby@0.2.17` as a direct dependency of
`packages/vitest` (plan 09-07). See the Package Legitimacy Audit below. No other `npm install` /
`pnpm add` step in this phase.

---

## Package Legitimacy Audit

**Amended 2026-08-29, post-plan-checker.** This section originally recorded ZERO new packages for
Phase 9. That is no longer true. The plan-checker found that plan 09-07 had implemented
`gherkinTags` with an explicit path array rather than D-09's literal `gherkinTags(glob)`; the user
was asked and confirmed the glob-string signature is required, which needs a glob implementation.
**ONE new direct dependency is therefore introduced by Phase 9, audited and accepted:**
`tinyglobby@0.2.17`, declared in `packages/vitest`'s `dependencies` (CONTEXT.md D-09 addendum).

Every other dependency this phase uses (`vitest`, `@vitest/runner`, `@effect/vitest`,
`@effect-cucumber/gherkin`) is already resolved in this repo's lockfile and was vendored by earlier
phases.

| Package | Registry | Disposition |
|---------|----------|-------------|
| `tinyglobby@0.2.17` | npm | **ACCEPTED** — confirmed by the user by name and exact version. Already resolved in this repo's `pnpm-lock.yaml` at exactly `0.2.17` as a transitive dependency of the test runner itself, so declaring it adds a manifest entry and a lockfile importer edge: no new artifact from the registry and no new publisher to trust. Single-purpose, actively maintained glob library; its published `index.d.mts` was read directly during planning to fix the API used. Declared as `^0.2.17` per this repo's runtime-dependency convention — exact pins are devDependencies only, per `pnpm-workspace.yaml`. |

**Why a package rather than the platform or a hand-rolled matcher:** `fs.globSync` landed in Node 22
and `packages/vitest` declares `"engines": { "node": ">=20" }`; a partial hand-written matcher would
mishandle character classes and brace expansion. `globSync` and not `glob` because a runner config is
evaluated synchronously at load time.

**Packages removed due to slopcheck `[SLOP]` verdict:** none
**Packages flagged as suspicious `[SUS]`:** none — `tinyglobby` is neither. It is already installed in
this repo at the audited version, and the human confirmation an `[ASSUMED]` verdict would require has
already been given at higher fidelity: the user named the package and its exact version.

---

## Findings

### Finding 1 — `strictTags` defaults to `true`; an undeclared tag fails the WHOLE test file [VERIFIED: empirical run + source + `vitest --help`]

This directly falsifies CONTEXT.md D-04's last bullet.

Three independent confirmations:

1. **Source:** `vitest/dist/chunks/cli-api.CnMVyzaz.js:9336` — `strictTags: config.strictTags ?? true`, alongside `tags: config.tags || []`.
2. **CLI help:** `npx vitest --help` prints `--strictTags   Should Vitest throw an error if test has a tag that is not defined in the config. (default: true)`.
3. **Empirical run** in this repo, with its current zero-config state:

```
$ npx vitest run packages/vitest/test/__tagprobe.test.ts
 ❯ packages/vitest/test/__tagprobe.test.ts (0 test)
 FAIL  packages/vitest/test/__tagprobe.test.ts
Error: The Vitest config does't define any "tags", cannot apply "@slow" tag for this test.
       See: https://vitest.dev/guide/test-tags
 Test Files  1 failed (1)
      Tests  no tests
```

The throw originates in `@vitest/runner`'s `createSuiteCollector`'s `task()`:

```js
const tagsOptions = testTags.map((tag) => {
  const tagDefinition = runner.config.tags?.find((t) => t.name === tag)
  if (!tagDefinition && runner.config.strictTags) {
    throw createNoTagsError(runner.config.tags, tag)
  }
  return tagDefinition
})
```
*(`@vitest/runner@4.1.11/dist/chunk-artifact.js:1716-1720`)*

**Severity for this project specifically:** a Gherkin runner's tags come from arbitrary `.feature`
files written by a user who has never heard of `vitest.config.ts`. Under the naive implementation,
adding `@wip` to one Scenario turns that whole Feature file into `0 tests` with an error naming
neither the `.feature` file nor the Scenario — and vitest's own message contains a typo ("does't"),
which will make it unsearchable in the user's mind.

`.planning/research/PITFALLS.md` Pitfall 32 documented this correctly and the discuss-phase session
contradicted it. Treat PITFALLS.md as authoritative here.

### Finding 2 — `--tagsFilter` requires config-declared tags REGARDLESS of `strictTags` [VERIFIED: empirical run + source]

`strictTags: false` is **not** a complete escape hatch. It disables the *test-side* validation only.
The *filter-side* validation is unconditional:

```js
function resolveTagPattern(tagPattern, availableTags) {
  if (tagPattern.includes("*")) {
    const regex = createWildcardRegex(tagPattern)
    if (!availableTags.some((tag) => regex.test(tag.name))) {
      throw createNoTagsError(availableTags, tagPattern, "tag pattern")
    }
    return regex
  }
  if (!availableTags.length || !availableTags.some((tag) => tag.name === tagPattern)) {
    throw createNoTagsError(availableTags, tagPattern, "tag pattern")
  }
  return null
}
```
*(`chunk-artifact.js:1412-1424` — no `strictTags` guard anywhere in the function)*

Empirically, with `strictTags: false` in config and no `tags` array:

```
$ npx vitest run -c vitest.tagprobe.config.ts --tagsFilter '@slow'
Error: The Vitest config does't define any "tags", cannot apply "@slow" tag pattern for this test.
 Test Files   (1)      Tests  no tests      Errors  1 error
```

**Consequence for ADR-EC-020:** the ADR's central promise — *"running just one Scenario locally is a
caller-side `vitest --tagsFilter '@only'` choice"* — **does not work** without a `vitest.config.ts`
declaring `{ name: "@only" }`. This is not a nice-to-have; it is the whole `@only` story. There is no
wildcard workaround: a declared tag literally named `"@*"` does not satisfy a filter for `"@slow"`
(the wildcard expansion runs on the *filter* pattern, matched against declared *names*).

### Finding 3 — the `strictTags` throw is CATCHABLE at the call site, and degradation works cleanly [VERIFIED: empirical run]

This is the key enabling finding for a good design. The error is thrown synchronously from
`it(...)`, so the caller can catch it, re-emit without tags, and continue:

```ts
describe("catchability", () => {
  try {
    it.effect("tagged undeclared", () => Effect.void, { tags: ["@undeclared"] })
  } catch (e) {
    caught = e instanceof Error ? e.message : String(e)
    it.effect("fallback without tags", () => Effect.void)
  }
  it.effect("later sibling still collects", () => Effect.sync(() => {
    expect(caught).toContain("@undeclared")
  }))
})
```

Result: **both** tests collected and passed; the file did not fail; the caught message contained the
tag name. Nothing is left in a half-registered state by the throw.

**Design implication:** `describeFeature.ts`'s `vitestTestApi` — the one module permitted to name
vitest (`describeFeature.ts` note (e)) — can wrap each real `it.effect` call. On catch it can:
- re-emit the test with `tags` omitted (and `skip` preserved), so the Scenario still runs; and
- surface the library's own located error/warning naming `feature.uri`, the Scenario title and the
  offending tag — which is precisely what Pitfall 22 ("names the wrong thing") and Pitfall 32's
  concrete test both demand.

This keeps `TestApi.ts` note (a) intact: `Runner.ts` never learns that the failure mode exists.

**Open decision for the planner (Open Question 1):** does the fallback *warn* (Scenario still runs,
tags silently unavailable for filtering) or *fail loudly*? Warning matches ADR-EC-019's precedent for
"dead code, not a broken Scenario" and keeps a zero-config consumer working; failing matches
"say only what is true" and prevents a user believing `--tagsFilter` will work. Recommend **warn on
the library's own channel** and document the config requirement, mirroring the unused-definition
warning's three channels (06-CONTEXT.md D-02).

### Finding 4 — `@effect/vitest`'s `Tester` takes `TestOptions` as the THIRD argument and forwards it verbatim [VERIFIED: type decls + implementation source + empirical run]

Signature (`@effect/vitest@4.0.0-rc.112/dist/index.d.ts:33`):

```ts
<A, E>(name: string, self: TestFunction<A, E, R, [V.TestContext]>, timeout?: number | V.TestOptions): void
```

Implementation (`dist/internal/internal.js:40-42, 68-75`):

```js
const testOptions = timeout => typeof timeout === "number" ? { timeout } : timeout ?? {}
const f    = (name, self, timeout) => it(name, testOptions(timeout), ctx => run(ctx, [ctx], self))
const skip = (name, self, timeout) => it.skip(name, testOptions(timeout), ctx => run(ctx, [ctx], self))
```

So a `TestOptions` object passed third lands unchanged as vitest's second argument. **Note that
Pitfall 32's illustrative snippet `it.effect(pickle.name, { tags: … }, fn)` puts the options SECOND
and is wrong for `@effect/vitest`** — CONTEXT.md D-04 has it right ("the object form of `it.effect`'s
third parameter").

Empirically confirmed with the real API, under a config declaring the tags:

```
 ✓ effect probe > plain tagged 2ms          // it.effect(name, self, { tags: ["@slow"] })
 ↓ effect probe > skip via options          // it.effect(name, self, { tags: ["@skip"], skip: true })
 ↓ effect probe > skip via method           // it.effect.skip(name, self, { tags: ["@skip"] })
 ✓ effect probe > only-tagged 0ms           // it.effect(name, self, { tags: ["@only"] })
```

Both skip routes work; `it.effect.skip` also accepts the options object. `TestOptions.skip` is
equivalent to `.skip` at the collector level: `mode = this.only ?? options.only ? "only" : this.skip ?? options.skip ? "skip" : …` (`chunk-artifact.js:1934`).

### Finding 5 — a skipped test never invokes the thunk, so `Before`/`After` hooks structurally cannot run [VERIFIED: source read + architecture read]

Success criterion 2 ("its `Before`/`After` hooks do not run") is satisfied *by construction* in this
codebase, not by arrangement — and the reason is worth stating in the plan so nobody "improves" it.

`packages/vitest/src/ScenarioEffect.ts`'s `buildScenarioEffect` weaves `Before`, `BeforeStep`,
`AfterStep` and `After` **inside the returned Effect** (`yield* runHookBatch(args.hooks.Before)` …
`Effect.onExit(() => runHookBatch(args.hooks.After))`). There is no vitest `beforeEach`/`afterEach`
anywhere in `packages/vitest/src`. `Runner.ts` note (b) additionally guarantees `buildScenarioEffect`
is only called *inside* the thunk handed to `TestApi.effect`, never eagerly.

A vitest test in `mode: "skip"` never calls its handler. Therefore the thunk is never invoked,
`buildScenarioEffect` is never called, and no hook Effect is ever constructed — let alone run.

The same chain satisfies Pitfall 15's skip-ordering rule (a `@skip` Scenario with an unmatched step
reports *skipped*, not *undefined*), and CONTEXT.md D-05's reasoning is confirmed correct:
`planFeature` never throws for an unresolved step, it stores an `UnresolvedPlannedStep` whose
`StepMatchError` is only reached at `yield*` time inside the Effect.

⚠️ **The one asymmetry to decide (Pitfall 6 below):** `Runner.ts` note (e)'s `AfterAllScenarios` is
its *own emitted test node*, not part of any Scenario's Effect — so it **still runs** when every
Scenario in a Feature is `@skip`-tagged, while `BeforeAllScenarios` (a once-cell living inside the
Scenario thunks) does not. A Feature-level `@skip` therefore produces "AfterAll ran, BeforeAll
didn't".

### Finding 6 — `@only` under CI: the mechanics, and why criterion 3 holds structurally [VERIFIED: source + empirical positive and negative controls]

- Default: `allowOnly: !isCI` (`vitest/dist/chunks/defaults.9aQKnqFk.js:46`). GitHub Actions sets
  `CI=true`, so this repo's own CI already runs with `allowOnly: false`.
- The failure is **per-task**, not a process abort: `checkAllowOnly` sets
  `task.result = { state: "fail", errors: [Error("[Vitest] Unexpected .only modifier. Remove it or pass --allowOnly argument to bypass this error")] }` (`chunk-artifact.js:1032-1041`).
- `checkAllowOnly` is reachable **only** from branches guarded by `t.mode === "only"` inside
  `interpretTaskModes`, and `interpretTaskModes` is only called with `onlyMode = someTasksAreOnly(file)`.

So: if the library never emits `only`, `hasOnlyTasks` is `false`, `onlyMode` is `false`, and
`checkAllowOnly` is unreachable. Criterion 3 is a structural property, not a behavioural accident.

**Positive control** (an `@only`-*tagged* test under CI): passes.

```
$ CI=true npx vitest run -c vitest.tagprobe.config.ts --reporter=verbose
 ✓ effect probe > only-tagged 1ms
 Test Files  1 passed (1)
```

**Negative control** (a real `it.effect.only`, proving the test is not vacuous):

```
$ npx vitest run -c vitest.tagprobe.config.ts --allowOnly=false --reporter=verbose
 FAIL  only control > real only
Error: [Vitest] Unexpected .only modifier. Remove it or pass --allowOnly argument to bypass this error
 Test Files  1 failed (1)      Tests  1 failed | 1 skipped (2)
```

`--allowOnly=false` is a deterministic, env-independent way to force CI mode locally.

### Finding 7 — `--tagsFilter` SKIPS non-matching tests; it does not remove them [VERIFIED: empirical run + source]

```js
if (testTagsFilter && !testTagsFilter(t.tags || [])) {
  t.mode = "skip"
}
```
*(`chunk-artifact.js:967-969`)*

Observed:

```
$ npx vitest run -c … --tagsFilter '@slow' --reporter=verbose
 ↓ probe > plain
 ✓ probe > slow 1ms
 ↓ probe > skip via option
 ↓ probe > only tag not only mode
      Tests  1 passed | 3 skipped (4)
```

**This is exactly the distinction D-03 asserts and it is real and observable.** A Scenario excluded by
`excludeTags` is *absent* from the report; a Scenario excluded by `--tagsFilter` appears as `↓
skipped`. A test for criterion 4 can therefore assert both mechanisms by their different reporter
footprints, and neither can masquerade as the other.

Ordering inside `interpretTaskModes` is: `only`-mode resolution → location filter → name pattern →
`testIds` → tag filter. Tag filtering runs last and only ever *narrows* to `skip`; it never un-skips
a `@skip` test. Composition per D-03 is confirmed sound.

### Finding 8 — vitest tags inherit from parent suites and are de-duplicated [VERIFIED: source]

```js
const parentTags = parentTask?.tags || []
const testTags = unique([...parentTags, ...toArray(options.tags)])
```
*(`chunk-artifact.js:1714-1715`)*

Two consequences:

1. Because `Correlate.ts` already flattens Feature → Rule → Scenario → Examples tags onto every
   `ParsedScenario`, the library should emit tags **only on the test node**, never additionally on the
   `describe`. Emitting on both is harmless (deduped) but adds a `TestApi.describe` options parameter
   for no gain, and suite tags are separately validated by `validateTags(runner.config, suiteTags)`
   (`chunk-artifact.js:1848`) — one more place to throw.
2. If a tag appears on both a Feature and a Scenario, `pickle.tags` may contain it twice. vitest's
   `unique()` handles the emitted side. The library's own `includeTags`/`excludeTags`/`@skip` matching
   should use set/`includes` semantics so duplicates are inert.

### Finding 9 — `ParsedScenario.tags` is already exactly the right value [VERIFIED: existing repo test]

`packages/gherkin/test/Correlate.test.ts:173`:

```ts
expect(onlyScenario().tags).toEqual(["@featuretag", "@ruletag", "@scenariotag", "@exampletag"])
```

- Literal `@` prefixes retained — no normalisation needed (D-04 confirmed).
- Order is feature → rule → scenario → examples, matching `Model.ts`'s documented contract
  (*"already flattened by `compile()` in feature then rule then scenario then examples-block order.
  Do not recompute inheritance."*).
- Type is `ReadonlyArray<string>`.

### Finding 10 — `TestOptions.tags` is `string[]` (mutable) and augmentation-sensitive [VERIFIED: type decls]

```ts
tags?: keyof TestTags extends never ? string[] | string : TestTags[keyof TestTags] | TestTags[keyof TestTags][]
```
*(`@vitest/runner@4.1.11/dist/tasks.d-DEYaIMIu.d.ts:826`)*

Two small but real consequences:

- `ReadonlyArray<string>` is **not** assignable to `string[]`. The adapter in `describeFeature.ts`
  must spread: `{ tags: [...tags] }`. Keep `TestApi`'s own field `ReadonlyArray<string>` (immutability
  is the repo's convention throughout `Plan.ts`/`Model.ts`) and do the widening at the one place that
  already touches vitest.
- `TestTags` is a user-augmentable interface. A consumer who writes
  `declare module "vitest" { interface TestTags { … } }` narrows `tags` to a literal union. This
  cannot break the *published* package (`publishConfig.exports` points at `./dist`, whose `.d.ts` is
  already fixed), but it would break a consumer who compiles this package from source. `[ASSUMED]`
  low-risk; worth a one-line note rather than a mitigation.

### Finding 11 — `ScenarioPlan` has no `tags` field; two ways to get one [VERIFIED: source read]

Current shape (`packages/vitest/src/Plan.ts:224-230`):

```ts
export type ScenarioPlan = {
  readonly scenarioId: string
  readonly name: string
  readonly astName: string
  readonly ruleId: Option.Option<string>
  readonly steps: ReadonlyArray<PlannedStep>
}
```

**Option A (recommended): add `readonly tags: ReadonlyArray<string>`.** `planFeature` already maps
`feature.allScenarios.map((scenario): ScenarioPlan => ({ scenarioId: scenario.id, name: scenario.name,
astName: scenario.astName, ruleId: scenario.ruleId, steps: … }))` — one more line. The value becomes
assertable in `Plan.test.ts`, and `emitFeature`'s per-Scenario data stays in one object.
Cost: `Runner.test.ts`'s hand-built `ScenarioPlan` fixtures each gain a field.

**Option B: read `scenario.tags` off the `ParsedScenario` the walk already holds.** `emitFeature`'s
loops iterate `plan.feature.scenarios` / `rule.scenarios`, which *are* `ParsedScenario`s, so `.tags`
is in scope with zero changes to `Plan.ts`. Cost: `Runner.test.ts`'s `ParsedFeature` fixtures must
carry tags instead, and the value is untestable from `Plan.test.ts`.

**Counter-evidence to weigh:** `FeaturePlan`'s own doc comment argues against copying (*"a plan that
copied a subset would have to grow a field every time the runner learned to read one more"*) — but
that sentence is about *Feature*-level fields, and `ScenarioPlan` already copies three
`ParsedScenario` fields. Option A is consistent with the existing precedent; the planner should note
the tension explicitly in whichever module comment it lands in, per this repo's documentation norms.

### Finding 12 — pre-filtering `plan.scenarios` triggers `Runner.ts`'s "unreachable by construction" throw [VERIFIED: source read]

The obvious implementation of D-03 — filter `collection.plan.scenarios` in `describeFeature.ts`
before calling `emitFeature` — **breaks**. `emitFeature` does not iterate `plan.scenarios`; it
iterates the parsed document and *looks up* the plan:

```ts
const planFor = (scenario: ParsedScenario): ScenarioPlan => {
  const found = planById.get(scenario.id)
  if (found === undefined) {
    throw new Error(`emitFeature: no ScenarioPlan for scenario id … Every Scenario reachable from
      feature.scenarios and feature.rules must appear in the plan, so this is a bug in Plan.ts or in
      Runner.ts, not in the .feature file.`)
  }
  return found
}
```

Removing an entry from `plan.scenarios` while leaving `plan.feature` intact is precisely the state
that message declares impossible. **The filter must live inside `emitFeature`'s walk** (a `continue`
in each Scenario loop), which means `emitFeature` grows an argument — a predicate or the two tag
arrays. Given `emitFeature`'s existing style of declaring every field required rather than
defaulting (see `describeFeature.ts`'s "All SEVEN fields" comment), prefer a **required** argument
with an explicit "no filter" representation over an optional one.

### Finding 13 — filtering at plan time would corrupt the unused-step-definition warnings [VERIFIED: source read]

`planFeature` computes `used: Set<StepDefinition>` while resolving each Scenario's steps, and every
registered definition not in that set becomes an `UnusedStepDefinitionWarning` (MATCH-05,
ADR-EC-019). If `includeTags`/`excludeTags` removed Scenarios *before* planning, every step
definition used exclusively by an excluded Scenario would newly report as unused — on all three of
06-CONTEXT.md D-02's channels (terminal, an emitted node, and `plan.warnings`).

That is a silent behavioural regression with no failing test: the warnings are always-passing nodes.
**Plan and warn over the whole Feature; filter only at emission.** This also gives the desirable
property that `excludeTags` cannot change which steps are considered defined.

### Finding 14 — `describeFeature` has NO options object today; adding one touches four overloads and a CI gate [VERIFIED: source read]

ROADMAP criterion 4 and CONTEXT D-01 both say "`describeFeature`'s options object" as though one
exists. It does not. The current public signature is three positional parameters with two overloads
(`packages/vitest/src/describeFeature.ts:657-676`):

```ts
export function describeFeature<RShared, RScenario, E1, E2>(
  feature: ParsedFeature,
  layer: { readonly shared: Layer.Layer<RShared, E1, never>; readonly perScenario: Layer.Layer<RScenario, E2, never> },
  define: (dsl: FeatureDsl<RShared | RScenario>) => void
): void
// The plain-Layer overload is LAST, and must stay last — note (a).
export function describeFeature<ROut, E>(
  feature: ParsedFeature,
  layer: Layer.Layer<ROut, E, never>,
  define: (dsl: FeatureDsl<ROut>) => void
): void
```

Constraints the planner must honour:

- **`collectFeature` mirrors these two overloads exactly, "including the order"** (its own doc
  comment) — four overload declarations to update, not two.
- **The plain-Layer overload must remain LAST** — `describeFeature.ts` note (a). `scripts/verify-tsgo-gate.sh:252`
  fails with a message naming exactly this if the order flips, because TypeScript reports a failed
  overloaded call against the *last* overload and `effect(missingLayerContext)` depends on it.
  **Re-run `pnpm verify:tsgo-gate` after any signature change.**
- The natural shape is an optional **fourth** parameter (`options?: { includeTags?: …; excludeTags?: … }`)
  on both overloads. An optional trailing parameter should not change which overload TypeScript
  reports against, but that is an assumption the tsgo gate will settle empirically.
- `index.ts` exports `describeFeature` and a set of types; if the options type is named it must be
  exported (the barrel's own doc comment records the "add to BOTH `exports` and
  `publishConfig.exports`" rule for subpaths — not applicable here, but the barrel discipline is).

### Finding 15 — this repo has no `vitest.config.ts`, and this phase needs one [VERIFIED: filesystem + CI read]

```
$ find . -maxdepth 3 -name "vitest.config*" -o -maxdepth 3 -name "vite.config*" | grep -v node_modules
(nothing)
```

`pnpm test` at the root is bare `vitest run`. `.github/workflows/check.yml:79` runs `pnpm test`.

Success criterion 1 ("every tag … appears as a native vitest tag on the emitted test") cannot be
demonstrated by an automated test in this repo without a config declaring those tags — under
defaults, the demonstration file simply fails to collect (Finding 1). So a root `vitest.config.ts`
is **required work in this phase**, not optional polish.

Recommended minimal shape:

```ts
import { defineConfig } from "vitest/config"

export default defineConfig({
  test: {
    // Every tag any fixture .feature or inline feature source in this repo uses.
    // strictTags stays at its default `true` on purpose: a typo'd tag in a fixture
    // should fail loudly here, which is exactly the check a consumer gets too.
    tags: [
      { name: "@skip" },
      { name: "@only" }
      // + one entry per tag added by Phase 12's @REQ-EC-NNN dogfooding suite
    ],
    // Makes every local run behave like CI, so the @only criterion-3 assertion is
    // deterministic instead of depending on whether process.env.CI happens to be set.
    allowOnly: false
  }
})
```

Two things NOT to do:
- Do not set `include`/`exclude`. Omitting them preserves vitest's defaults, which is what every
  existing test file in this repo relies on. Adding an explicit `include` is the likeliest way to
  silently stop running a package's tests.
- Do not set `strictTags: false` globally to make the problem go away. It would (a) not fix
  `--tagsFilter` (Finding 2) and (b) delete the repo's only protection against a typo'd tag in a
  fixture.

**Trade-off on `allowOnly: false`:** it also stops a developer using `.only` locally without passing
`--allowOnly`. That is a real DX cost. The alternative — relying on GitHub Actions' automatic
`CI=true` — makes criterion 3 hold in CI but be unverifiable locally, and gives an assertion that
passes locally for the wrong reason. Recommend `allowOnly: false` plus a comment naming the reason.

### Finding 16 — the "no vitest import in `Runner.ts`" rule is convention-enforced, not script-enforced, for `packages/vitest` [VERIFIED: source read]

`Runner.ts` note (a) and `TestApi.ts` note (a) both reference "an acceptance grep that enforces the
rule". The only such script, `scripts/verify-no-runner-dep.sh`, scans `packages/gherkin/src` only
(`SRC_DIR="packages/gherkin/src"`) and enforces ADR-EC-021, a different rule about a different
package. **No script currently checks that `packages/vitest/src/Runner.ts` or `TestApi.ts` is free of
vitest imports.**

This matters because Phase 9 is the first phase that gives someone a concrete reason to reach for
`import type { TestOptions } from "vitest"` inside `TestApi.ts` ("we're modelling vitest's options
anyway"). That import would type-check, lint clean, pass every test, and quietly undo the seam
Anti-Pattern 3 exists for. Two mitigations, either acceptable:

- Define the tag/skip option shape as the library's **own** type in `TestApi.ts` (recommended
  regardless), so nobody needs the import; and/or
- Add the missing grep to this phase (a small `scripts/verify-testapi-seam.sh` mirroring
  `verify-no-runner-dep.sh`'s method note, including its positive control). Note both files
  deliberately avoid spelling the forbidden package names in prose so the grep can't false-positive
  on a citation — any new script must strip comments the same way.

The second is arguably out of scope for RUN-05 but is the cheapest moment to add it. Flag to the
user rather than deciding unilaterally.

---

## Architecture Patterns

### System Architecture Diagram

```
                 .feature source
                        │
                        ▼
        ┌───────────────────────────────┐
        │  @effect-cucumber/gherkin      │   tags flattened here, ALREADY DONE
        │  Correlate.ts → ParsedScenario │   ["@featuretag","@ruletag","@scenariotag","@exampletag"]
        └───────────────┬───────────────┘
                        │ ParsedFeature (tags per Scenario)
                        ▼
        ┌───────────────────────────────┐
        │  describeFeature.ts (COMPOSITION ROOT)                    │
        │  · reads new 4th arg: { includeTags?, excludeTags? }      │
        │  · REGISTER (Registry/Dsl)   · PLAN (planFeature)         │
        │  · warnings → terminal (channel 1)                        │
        └───────────────┬───────────────────────────────────────────┘
                        │ FeaturePlan  (warnings computed over the WHOLE feature —
                        │               Finding 13: never filter before this point)
                        ▼
        ┌───────────────────────────────────────────────────────────┐
        │  Runner.ts  emitFeature()   — the ONLY emission stage      │
        │                                                            │
        │  for each Scenario in document order:                       │
        │      tags ← scenarioPlan.tags                               │
        │                │                                            │
        │      ┌─────────▼──────────┐                                 │
        │      │ registration filter│  D-03: include/exclude          │
        │      │ (Finding 12: HERE, │  no match → `continue`,         │
        │      │  not before)       │  emits NOTHING                  │
        │      └─────────┬──────────┘                                 │
        │                │ survives                                   │
        │      ┌─────────▼──────────┐                                 │
        │      │ @skip present?     │──yes──▶ options.skip = true     │
        │      └─────────┬──────────┘                                 │
        │                │  (@only: no special handling — D-06)       │
        │                ▼                                            │
        │      api.effect(title, thunk, { tags, skip })               │
        │      ── library-owned plain data, NO vitest type ──         │
        └───────────────┬───────────────────────────────────────────┘
                        │ TestApi (injected seam — TestApi.ts note (a))
            ┌───────────┴────────────┐
            ▼                        ▼
   ┌─────────────────┐      ┌────────────────────────────┐
   │ Runner.test.ts  │      │ describeFeature.ts          │
   │ recording fake  │      │ vitestTestApi ADAPTER       │
   │ (asserts shape) │      │ · [...tags]  (Finding 10)   │
   └─────────────────┘      │ · try { it.effect(…opts) }  │
                            │   catch → re-emit untagged  │
                            │          + located warning  │
                            │          (Finding 3)        │
                            └──────────┬─────────────────┘
                                       ▼
                            ┌────────────────────────┐
                            │ @effect/vitest it.effect│  opts is the THIRD arg
                            └──────────┬─────────────┘
                                       ▼
                            ┌────────────────────────┐
                            │ vitest collector        │
                            │ · strictTags validation │◀── vitest.config.ts test.tags
                            │ · unique(parent+own)    │    (Findings 1, 15)
                            └──────────┬─────────────┘
                                       ▼
                            ┌────────────────────────┐
                            │ interpretTaskModes      │
                            │ · only-mode (unreached) │◀── allowOnly (Finding 6)
                            │ · --tagsFilter → "skip" │◀── CLI (Finding 7)
                            └────────────────────────┘
```

### Pattern 1: library-owned option data, widened only at the adapter

**What:** `TestApi.effect` grows a third parameter typed with the library's own shape; nothing named
`vitest` appears in `TestApi.ts` or `Runner.ts`.

**When to use:** always in this package — `TestApi.ts` note (a) forbids even an `import type`.

```ts
// packages/vitest/src/TestApi.ts — library-owned, no vitest anywhere
/**
 * How one emitted test node differs from the default. Deliberately NOT vitest's `TestOptions`:
 * naming that type here would put a test framework back into `Runner.ts`'s type graph, which is
 * exactly what note (a) forbids and what makes the recording fake writable.
 */
export interface EmitOptions {
  /** Every tag on the Scenario, `@` prefixes intact, in feature→rule→scenario→examples order. */
  readonly tags: ReadonlyArray<string>
  /** `true` for a `@skip`-tagged Scenario. The body is then never invoked at all. */
  readonly skip: boolean
}

export interface TestApi {
  readonly describe: (name: string, define: () => void) => void
  readonly effect: (
    name: string,
    self: () => Effect.Effect<void, unknown, Scope.Scope>,
    options: EmitOptions
  ) => void
}
```

```ts
// packages/vitest/src/describeFeature.ts — the ONLY module that names vitest
const vitestTestApi: TestApi = {
  describe,
  effect: (name, self, options) =>
    // `[...options.tags]`: vitest's TestOptions.tags is `string[]`, ours is ReadonlyArray — Finding 10.
    it.effect(name, self, { tags: [...options.tags], skip: options.skip })
}
```

**Anti-pattern this replaces:** adding a `skipEffect` member, or an `only` member, to `TestApi`.
`TestApi.ts` note (b) already argues against surface no assertion covers.

### Pattern 2: catch-and-degrade at the adapter (Finding 3)

**What:** the adapter wraps the real `it.effect` so vitest's `strictTags` throw becomes a located
library warning plus an untagged re-emission, rather than a file that collects zero tests.

**When to use:** every real emission. This is the single highest-value line of code in the phase.

```ts
const vitestTestApi = (featureUri: string): TestApi => ({
  describe,
  effect: (name, self, options) => {
    try {
      it.effect(name, self, { tags: [...options.tags], skip: options.skip })
    } catch (cause) {
      // vitest's own message names neither the .feature file nor the Scenario, and contains a typo
      // ("does't") that makes it unsearchable. Pitfall 22 and Pitfall 32 both ask for this
      // replacement. Verified catchable, and verified that the fallback registration and every
      // later sibling in the file still collect normally.
      console.warn(undeclaredTagWarning({ featureUri, scenario: name, tags: options.tags, cause }).message)
      it.effect(name, self, { skip: options.skip })
    }
  }
})
```

**Note:** `featureUri` means the adapter can no longer be a module-scope constant; it becomes a
factory called once per `describeFeature`. That is a change to `describeFeature.ts` note (e)'s
"built once at module scope" and the note must be updated in the same change, per AGENTS.md §4.

### Pattern 3: registration filter as a `continue` inside the emission walk (Findings 12, 13)

```ts
// inside emitFeature, before api.effect(...) — both the Feature loop and the Rule loop
const scenarioPlan = planFor(scenario)
if (!shouldEmit(scenarioPlan.tags)) {
  continue    // D-03: never becomes an it.effect call at all
}
```

where `shouldEmit` is derived once per `emitFeature` call from the two arrays:

```ts
// Exact-string, case-sensitive matching — CONTEXT.md's discretion note.
// `undefined` means "no filter". An EMPTY array must also mean "no filter", not "match nothing":
// a caller computing `excludeTags` from a variable that happens to be empty should get their whole
// suite, not silence. See Open Question 2.
const shouldEmit = (tags: ReadonlyArray<string>): boolean =>
  (include.length === 0 || tags.some((t) => include.includes(t))) &&
  !tags.some((t) => exclude.includes(t))
```

### Anti-Patterns to Avoid

- **Pre-filtering `collection.plan.scenarios`.** Trips `planFor`'s throw — Finding 12.
- **Filtering inside `planFeature`.** Corrupts the unused-definition warnings — Finding 13.
- **`import type { TestOptions } from "vitest"` in `TestApi.ts`.** No script currently catches it
  (Finding 16); it silently undoes Anti-Pattern 3's protection.
- **Emitting tags on the `describe` as well as the test.** Redundant (vitest already inherits and
  dedupes, Finding 8) and adds a second `validateTags` call site that can throw.
- **`strictTags: false` as the fix for Finding 1.** Doesn't fix `--tagsFilter` (Finding 2) and
  removes the repo's protection against typo'd fixture tags.
- **Setting `include`/`exclude` in the new `vitest.config.ts`.** Silently changes which files run.
- **Reordering `describeFeature`'s overloads.** `verify-tsgo-gate.sh:252` exists for exactly this.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Tag inheritance Feature→Rule→Examples→Scenario | A tag-merging walk over the AST | `ParsedScenario.tags` | Already flattened by `@cucumber/gherkin`'s `compile()`; `Model.ts` says *"Do not recompute inheritance."* Finding 9. |
| Tag filter expression parsing (`&&`, `\|\|`, `!`, `*`) | A boolean expression parser | vitest's `--tagsFilter` (D-02 explicitly scopes the library's own option to plain arrays) | vitest ships a tokenizer + recursive-descent parser with wildcard support and documented precedence. Duplicating it means keeping two grammars in sync forever. |
| Marking a test skipped | Registering a passing test that returns early, or a custom "skipped" reporter node | `TestOptions.skip: true` (or `it.effect.skip`) | A real skip reports as `↓`, keeps the skipped count meaningful (`Runner.ts` note (c) argues this exact point for warning nodes), and — critically — the handler is never invoked, which is what makes Finding 5 structural. |
| Per-tag timeouts / retries (`@slow`, `@flaky`) | A tag→option mapping table in the library | `test.tags: [{ name: "@slow", timeout: 30_000 }]` in the consumer's `vitest.config.ts` | `TestTagDefinition extends Omit<TestOptions, "tags" \| "shuffle">`, and the collector merges `{ ...tagsOptions, ...ownOptions }` — the test's own options win, with `priority` breaking ties among tags. Free, and it is the consumer's policy, not the library's. |
| Detecting `.only` in CI | A `process.env.CI` check in `describeFeature` | Never emitting `only` (D-06) | Finding 6: `checkAllowOnly` is unreachable when no task is in `only` mode. Pitfall 22's option 1 (library-side CI detection) is obsoleted by ADR-EC-020's option 2. |

**Key insight:** every hand-rolled version in this table is *also* a second source of truth that
`--listTags`, the vitest UI, and the VS Code extension would not see. Native tags are the only
representation the surrounding tooling can read.

---

## Common Pitfalls

### Pitfall 1: Assuming `strictTags` is off (the CONTEXT.md D-04 error)

**What goes wrong:** the first Feature with any tag turns into `0 tests` and a red file, with an
error naming neither the `.feature` file nor the Scenario.
**Why it happens:** `strictTags` reads like an opt-in strictness flag. It is not; it defaults on.
**How to avoid:** Finding 15's `vitest.config.ts` for this repo; Finding 3's catch-and-degrade for
consumers.
**Warning signs:** `Test Files 1 failed (1) / Tests no tests`; the string `does't define any "tags"`.

### Pitfall 2: Assuming `strictTags: false` restores `--tagsFilter`

**What goes wrong:** a consumer follows the "just set `strictTags: false`" advice, tags emit fine,
and then `--tagsFilter '@slow'` fails the run with the same class of error.
**Why it happens:** `resolveTagPattern` has no `strictTags` guard (Finding 2).
**How to avoid:** document that `--tagsFilter` requires `test.tags` declarations, full stop.
**Warning signs:** `cannot apply "@X" tag pattern for this test` — note *pattern*, which distinguishes
the filter-side error from the test-side one.

### Pitfall 3: Pre-filtering the plan (Finding 12)

**What goes wrong:** `emitFeature: no ScenarioPlan for scenario id …` — a thrown `Error`, not a test
failure, so the whole file dies and the message blames `Plan.ts`.
**How to avoid:** filter in the walk.
**Warning signs:** the throw's own text mentions "this is a bug in Plan.ts or in Runner.ts, not in
the .feature file" — if you see it while implementing a tag filter, this is why.

### Pitfall 4: Filtering before planning corrupts warnings (Finding 13)

**What goes wrong:** `excludeTags: ["@wip"]` makes every step definition used only by `@wip`
Scenarios report as an unused definition, on all three warning channels.
**Why it's silent:** warning nodes always pass. Nothing goes red.
**How to avoid:** plan the whole Feature, filter at emission.
**Warning signs:** a `⚠ unused step definition:` node appears or disappears when a tag filter option
changes. Worth an explicit regression test — it is the only thing that can see this.

### Pitfall 5: Reordering `describeFeature`'s overloads while adding the options parameter

**What goes wrong:** `pnpm verify:tsgo-gate` fails, or — worse — still passes while
`effect(missingLayerContext)` stops covering the layer argument.
**How to avoid:** add the parameter to both overloads without touching their order; run
`pnpm verify:tsgo-gate` and `pnpm typecheck:test`.
**Warning signs:** the gate's own failure text at `verify-tsgo-gate.sh:252` names this exact cause.

### Pitfall 6: `AfterAllScenarios` runs for a fully-skipped Feature; `BeforeAllScenarios` does not (Finding 5)

**What goes wrong:** a Feature tagged `@skip` at the Feature level reports every Scenario skipped —
and then runs the `⚙ AfterAllScenarios` node, tearing down resources that were never set up.
**Why it happens:** `Runner.ts` note (e): `BeforeAllScenarios` is a once-cell reached only from
inside Scenario thunks, while `AfterAllScenarios` is its own emitted sibling node deliberately
designed to run unconditionally.
**How to avoid:** decide explicitly (Open Question 3). Candidate: skip the `AfterAllScenarios` node
when every Scenario in the Feature is skipped or filtered out. Whatever is chosen must be written
into `Runner.ts` note (e), which currently asserts "runs always" as a virtue.
**Warning signs:** an `AfterAllScenarios` hook that assumes `BeforeAllScenarios` ran.

### Pitfall 7: Empty `describe` blocks after filtering

**What goes wrong:** `excludeTags` removes every Scenario in a Rule (or in a whole Feature), leaving
an empty `describe(rule.name)` — plus, if the Feature had unused definitions, a block containing
nothing but `⚠` warning nodes. Reporter output that says "here is a Feature" and shows nothing.
**How to avoid:** decide whether to suppress the enclosing `describe` when no Scenario survives, and
whether the `⚙ AfterAllScenarios` and `⚠` nodes should still emit in that case (Open Question 3).
**Warning signs:** a Feature block in the reporter with zero test nodes under it.

### Pitfall 8: The `ReadonlyArray` → `string[]` boundary (Finding 10)

**What goes wrong:** `Type 'readonly string[]' is not assignable to type 'string[]'` at the adapter.
**How to avoid:** `[...tags]` at the adapter only; keep `ReadonlyArray<string>` everywhere upstream,
matching `Model.ts` and `Plan.ts`. Do not widen `ScenarioPlan.tags` to a mutable array to "fix" it.

---

## Code Examples

All snippets below were executed against this repo's installed `vitest@4.1.11` /
`@effect/vitest@4.0.0-rc.112` unless marked otherwise.

### Emitting tags and skip through `it.effect` [VERIFIED: executed]

```ts
// Source: executed in this repo, 2026-08-29. Requires vitest.config.ts declaring the tags.
import { it } from "@effect/vitest"
import * as Effect from "effect/Effect"
import { describe } from "vitest"

describe("effect probe", () => {
  it.effect("plain tagged", () => Effect.void, { tags: ["@slow"] })
  it.effect("skip via options", () => Effect.void, { tags: ["@skip"], skip: true })
  it.effect.skip("skip via method", () => Effect.void, { tags: ["@skip"] })
  it.effect("only-tagged", () => Effect.void, { tags: ["@only"] })
})
// Reporter: ✓ plain tagged | ↓ skip via options | ↓ skip via method | ✓ only-tagged
// Under CI=true: identical. No .only anywhere, so allowOnly is never consulted.
```

### The catch-and-degrade adapter [VERIFIED: executed]

```ts
// Source: executed in this repo, 2026-08-29 — the throw is catchable, the fallback registers,
// and every later sibling in the same file still collects.
try {
  it.effect("tagged undeclared", () => Effect.void, { tags: ["@undeclared"] })
} catch (cause) {
  // cause.message contains: The Vitest config does't define any "tags", cannot apply "@undeclared" …
  it.effect("tagged undeclared", () => Effect.void)   // untagged fallback — runs normally
}
```

### The `vitest.config.ts` this phase must add [VERIFIED: executed, minus the comments]

```ts
// Source: vitest.dev/guide/test-tags + executed variants in this repo, 2026-08-29
import { defineConfig } from "vitest/config"

export default defineConfig({
  test: {
    tags: [{ name: "@skip" }, { name: "@only" }],
    allowOnly: false
  }
})
```

### CLI shapes worth documenting [VERIFIED: executed]

```sh
vitest run --tagsFilter '@slow'         # non-matching tests report as ↓ skipped, not removed
vitest run --tagsFilter '!@wip'         # ! / not, && / and, || / or, (), and * wildcards
vitest run --listTags                   # lists declared tags; --listTags=json for machine output
vitest run --allowOnly=false            # deterministic CI mode locally (Finding 6 negative control)
vitest run --strictTags=false           # silences test-side validation ONLY; --tagsFilter still errors
```

---

## Runtime State Inventory

Phase 9 is a code + config change with no data migration surface. Each category was checked
explicitly rather than left blank.

| Category | Items Found | Action Required |
|----------|-------------|------------------|
| Stored data | **None** — this package persists nothing. Verified: no database, cache, or datastore client anywhere under `packages/*/src`; `Registry.ts` is a per-call in-memory container. | none |
| Live service config | **None** — no external service. The only "config that lives outside git" analogue is a developer's local vitest CLI flags, which are transient. | none |
| OS-registered state | **None** — no scheduled tasks, daemons, or process managers. CI is GitHub Actions, defined in-repo at `.github/workflows/check.yml`. | none |
| Secrets / env vars | **`CI`** is read implicitly by vitest (`allowOnly: !isCI`) and set automatically by GitHub Actions. Not a secret; not set by this repo. Finding 15's `allowOnly: false` makes the phase's behaviour independent of it. | none, but document the dependency |
| Build artifacts | **`packages/vitest/dist`** (tsc `composite: true` build output) will be stale after the `TestApi`/`Plan` type changes. `tsconfig` project references handle this on `pnpm build`. No `.egg-info`-style orphan artifacts exist. | `pnpm build` after the change |

---

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| `vitest` | The entire phase | ✓ | 4.1.11 | — |
| `@vitest/runner` | Tag/skip/only semantics | ✓ | 4.1.11 | — |
| `@effect/vitest` | `it.effect` / `it.effect.skip` | ✓ | 4.0.0-rc.112 | — |
| `effect` | Everything | ✓ | 4.0.0-rc.112 | — |
| `pnpm` | Workspace | ✓ | 10.26.1 (packageManager pin) | — |
| `vitest.config.ts` | Success criteria 1 and 4 | ✗ | — | **No fallback — must be created (Finding 15)** |
| `slopcheck` | Package audit | ✓ | present | not needed — no new packages |

**Missing dependencies with no fallback:**
- `vitest.config.ts` — must be authored in this phase. Without it, no automated test can demonstrate
  criterion 1, and criterion 4's `--tagsFilter` half cannot run at all.

**Missing dependencies with fallback:** none.

---

## Validation Architecture

`.planning/config.json` has no `workflow.nyquist_validation` key, so it is treated as enabled.

### Test Framework

| Property | Value |
|----------|-------|
| Framework | `vitest@4.1.11` with `@effect/vitest@4.0.0-rc.112` |
| Config file | **none — see Wave 0** (Finding 15) |
| Quick run command | `pnpm exec vitest run packages/vitest/test/Runner.test.ts` |
| Full suite command | `pnpm test` (root `vitest run`) |
| Type gate | `pnpm typecheck:test` and `pnpm verify:tsgo-gate` |
| Spec gate | `bash spec/scripts/verify-traceability.sh` |

Existing test topology (all present, all extendable):
- `packages/vitest/test/Runner.test.ts` — recording-fake assertions on emission **shape**. The natural
  home for criteria 1, 3 (structural half) and 4.
- `packages/vitest/test/emission.test.ts` — the only file that calls `describeFeature` for real, using
  inline `parseFeature` sources (no `.feature` fixture directory exists under `packages/vitest`). The
  natural home for the runtime halves of criteria 1, 2 and 3.
- `packages/vitest/test/Plan.test.ts` — value assertions on `FeaturePlan` / `ScenarioPlan`. Home for
  `ScenarioPlan.tags` if Finding 11 Option A is chosen.
- `packages/vitest/test/describeFeature.test.ts` — `FeatureCollection` assertions; unaffected if the
  filter lives in `emitFeature`.

### Phase Requirements → Test Map

| Req | Behavior | Test Type | Automated Command | File Exists? |
|-----|----------|-----------|-------------------|--------------|
| RUN-05 / SC1 | Every inherited tag reaches the emitted node | unit (fake) | `pnpm exec vitest run packages/vitest/test/Runner.test.ts -t tags` | ✅ extend |
| RUN-05 / SC1 | …and reaches the *real* vitest task | integration | `pnpm exec vitest run packages/vitest/test/emission.test.ts` — assert via `--tagsFilter` selection or `task.tags` | ✅ extend (needs config, ❌ Wave 0) |
| RUN-05 / SC2 | `@skip` reports skipped | integration | `pnpm exec vitest run packages/vitest/test/emission.test.ts` — a `@skip` Scenario whose body would throw | ✅ extend |
| RUN-05 / SC2 | `Before`/`After` do not run for a skipped Scenario | integration | same file — a module-scope counter incremented by a `Before` hook, asserted `0` in a sibling test | ✅ extend |
| RUN-05 / SC2 | Pitfall 15: `@skip` + unmatched step → skipped, not undefined | integration | same file — a `@skip` Scenario with a deliberately unregistered step | ✅ extend |
| RUN-05 / SC3 | `@only` never becomes `only` | unit (fake) | `Runner.test.ts` — assert no recorded emission ever carries an only-marking option | ✅ extend |
| RUN-05 / SC3 | A Feature with `@only` passes a CI-mode run | integration | `pnpm test` with `allowOnly: false` in config — the repo's own suite becomes the assertion | ❌ Wave 0 (config) |
| RUN-05 / SC4 | `--tagsFilter` selects exactly the tagged Scenarios | integration | `pnpm exec vitest run packages/vitest/test/emission.test.ts --tagsFilter '@…'` | ❌ Wave 0 (config + a runnable command; consider a `package.json` script so it is exercised in CI) |
| RUN-05 / SC4 | `excludeTags` removes the Scenario from emission entirely | unit (fake) | `Runner.test.ts` — assert the record list has no entry for it (distinct from SC4's skip footprint) | ✅ extend |
| RUN-05 / SC4 | `includeTags` restricts emission | unit (fake) | `Runner.test.ts` | ✅ extend |
| Pitfall 4 | `excludeTags` does not change `plan.warnings` | unit | `Runner.test.ts` or `Plan.test.ts` | ✅ extend |
| Finding 3 | An undeclared tag degrades instead of failing the file | integration | needs a run *without* the tag declared — likeliest a child-process `vitest run` or a second config | ❌ Wave 0 (no child-process test precedent exists in this repo — see Sampling note) |

### Sampling Rate

- **Per task commit:** `pnpm exec vitest run packages/vitest` (fast; ~seconds)
- **Per wave merge:** `pnpm test && pnpm typecheck:test && pnpm verify:tsgo-gate`
- **Phase gate:** `pnpm test && pnpm lint && pnpm circular && pnpm typecheck:test && pnpm verify:tsgo-gate && pnpm verify:oxlint-plugin && pnpm verify:no-runner-dep && pnpm verify:spec` — all green before `/gsd:verify-work`

**Note on the two ❌ rows needing a non-default config:** this repo has **no existing
child-process/nested-vitest test pattern** (`grep -rn "child_process\|execFile\|spawn\|startVitest"`
over `packages/*/test` returns nothing). Introducing one is a genuine new capability with its own
cost. Cheaper alternatives the planner should weigh: (a) a second config file plus a `package.json`
script that CI runs (`"test:tags": "vitest run --tagsFilter '@…'"`), which keeps the assertion in CI
without new machinery; (b) accepting a documented manual verification step for the degradation path.

### Wave 0 Gaps

- [ ] `vitest.config.ts` at the repo root — `test.tags` for every tag the repo's own fixtures use, plus `allowOnly: false`. Blocks SC1 (integration half), SC3 and SC4.
- [ ] A decision + mechanism for exercising `--tagsFilter` in CI (a `package.json` script, or a second config) — blocks SC4's CLI half.
- [ ] A decision on how (or whether) to automate the Finding 3 degradation path given no child-process precedent exists.
- [ ] Framework install: none needed.

---

## Security Domain

`.planning/config.json` has no `security_enforcement` key, so it is treated as enabled.

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | no | Build-time test library; no identities. |
| V3 Session Management | no | No sessions. |
| V4 Access Control | no | No authorization boundary. |
| V5 Input Validation | **yes** | Tag strings originate from user-authored `.feature` files and flow into reporter output and into vitest's tag machinery. Follow the repo's established control: `Runner.ts` note (c) already uses `JSON.stringify` for the one attacker-influenced string it renders (a step pattern), specifically to stop a pattern containing a quote or newline from forging a second node in reporter output (threat T-06-06-01). |
| V6 Cryptography | no | None used. |
| V12 Files & Resources | marginal | No new file reads in this phase. A future `gherkinTags(glob)` helper (Open Question 4) *would* read arbitrary files at config-load time and should be scoped to an explicit glob, never a recursive default. |

### Known Threat Patterns for this phase

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| A tag string containing a newline or ANSI escape reaches the terminal via the Finding 3 degradation warning, forging log lines | Spoofing / Repudiation | `JSON.stringify` the tag in the warning message, exactly as `warningTitle` already does for step patterns. `describeFeature.ts`'s existing warning channel notes threat T-06-07-01 for the same reason. |
| A tag string is interpolated into a synthetic test node title | Spoofing | Do not create per-tag test nodes. If any node title ever carries a tag, quote it. `afterAllScenariosTitle` is a constant *precisely* to have no interpolation to forge with (T-07-06-01). |
| `excludeTags` silently removing Scenarios makes a suite report green while testing less than it claims | Tampering (integrity of the signal) | This is the intended semantics of D-03, and it is the phase's real risk. Recommend the library print a one-line collection-time notice when a registration filter drops Scenarios (e.g. `n Scenario(s) excluded by excludeTags`) on the same terminal channel as the unused-definition warnings. Silence here is how a filter accidentally left in a config file hides an entire Feature. **Raise to the user — CONTEXT.md did not decide it.** |
| An undeclared tag failing a whole Feature file to `0 tests` reads as "passed" in a `Test Files: 1 failed` scan-past | Denial of signal | Finding 3's degradation, plus a located library error. |

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `@skip`/`@only` → `it.effect.skip`/`it.effect.only` | `@skip` → skip; `@only` → plain tag | ADR-EC-020, 2026-08-28 | Removes Pitfall 22's CI footgun. Confirmed correct by Finding 6. |
| Tag filtering as a bespoke library mechanism | vitest v4 native tags + `--tagsFilter` | vitest v4 | Free filtering, `--listTags`, UI/VS Code integration — **but only for declared tags** (Finding 2). |
| "vitest tags need no declaration" | Tags MUST be declared in `test.tags`; `strictTags` defaults `true` | vitest 4.x (present in 4.1.11) | Invalidates CONTEXT.md D-04's last bullet. Findings 1 and 2. |
| Pitfall 22's option 1 (library-side `process.env.CI` detection for `@only`) | Never emit `only` at all | ADR-EC-020 | Pitfall 22 option 1 is obsolete; do not implement it. |

**Deprecated/outdated:**
- Pitfall 32's snippet `it.effect(pickle.name, { tags: … }, fn)` — options go **third** for
  `@effect/vitest`, not second (Finding 4). The snippet is right about vanilla `vitest`'s `it`.
- CONTEXT.md D-04's "No vitest config changes are needed" bullet.

---

## Spec Reconciliation Required

CONTEXT.md flagged ADR-EC-020. Research found the obligation is **larger** than that.

| Artifact | What is wrong | Required change |
|----------|---------------|-----------------|
| `spec/behaviors/02-shared-layers-and-tags.md` §BEH-EC-008 | Its MUST-level text says *"excludeTags-style filtering MUST be implemented as native vitest tag filtering (--tagsFilter), **not a describeFeature-time registration filter**."* D-01..D-03 do exactly the forbidden thing. CONTEXT.md did not name this document. | Amend the requirement text. This is a MUST-level contradiction, not a scope note — AGENTS.md §1 requires the behavior doc, invariant and traceability matrix to change in the same commit. |
| `spec/decisions/020-vitest-native-tags-for-skip-only.md` | Same contradiction in the Decision section's fourth bullet. **Also:** its Negative Consequences say config-time tag mechanics "need confirming" — they now are confirmed, and the answer changes the ADR's own `--tagsFilter` story (Finding 2). | Amend, or supersede with a new `ADR-EC-NNN` per AGENTS.md §6. The `@only` local-development story in particular needs restating: it is `--tagsFilter '@only'` **plus a `test.tags` declaration**, not `--tagsFilter` alone. |
| `spec/behaviors/02-shared-layers-and-tags.md` worked example | Will not compile if `describeFeature` grows a fourth parameter that the example needs to show. AGENTS.md §2: `typescript` fences are compiled once the doc-examples check lands. | Update the example to show `includeTags`/`excludeTags`. |
| `.planning/REQUIREMENTS.md` RUN-05 | Text says *"running just one Scenario locally is a `--tagsFilter` choice"* with no mention of the declaration prerequisite. | Amend or footnote. |
| `spec/roadmap.md` "Planned" § "custom, non-reserved tags" | ADR-EC-020 claimed this item was closed "at effectively no extra design cost". Finding 2 shows the cost is a config-time tag declaration per consumer. | Restate honestly per AGENTS.md §4 — it is *mostly* closed, with a documented config prerequisite. |
| `spec/index.yaml`, `spec/traceability.md` | Must stay consistent with the above. | `bash spec/scripts/verify-traceability.sh` must pass. |

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Adding an optional 4th parameter to both `describeFeature` overloads does not change which overload TypeScript reports a failed call against | Finding 14 | `verify-tsgo-gate.sh:252`'s diagnostic-name assertion could break, or worse, still pass while covering nothing. **Settle empirically by running `pnpm verify:tsgo-gate` early in the phase, not at the end.** |
| A2 | A consumer augmenting `TestTags` cannot break the published package because `publishConfig.exports` ships `./dist` with a fixed `.d.ts` | Finding 10 | A consumer compiling from source hits a type error. Low impact, easy fix (`as string[]`). Not verified against a scratch consumer. |
| A3 | Emitting `TestOptions.skip: true` and calling `it.effect.skip` are observationally identical for reporting purposes | Findings 4, Pattern 1 | Both were observed producing `↓` in the verbose reporter and both set `mode = "skip"` per `chunk-artifact.js:1934`. Not verified against every reporter (JSON, JUnit). Very low risk. |
| A4 | An empty `describe` block (every Scenario filtered out) collects cleanly rather than erroring | Pitfall 7 | Read from `interpretTaskModes` (`suite.tasks.length &&` short-circuits) but **not executed**. If wrong, the phase must suppress empty describes rather than merely preferring to. |
| A5 | The repo's `pnpm test` behaviour is unchanged by adding a `vitest.config.ts` that omits `include`/`exclude` | Finding 15 | If wrong, some package's tests silently stop running. **Verify by comparing test counts before and after the config lands** — this is exactly the class of failure `verify-no-runner-dep.sh`'s method note warns about ("observation cannot distinguish 'has no capability' from 'did not use it today'"). |
| A6 | GitHub Actions sets `CI=true`, so this repo's CI currently runs with `allowOnly: false` | Finding 6 | Well-established GHA behaviour, not verified in this session. Moot if `allowOnly: false` goes in the config. |

---

## Open Questions

1. **Does the undeclared-tag fallback warn or fail?**
   - *What we know:* the throw is catchable and a tagless re-emission works perfectly (Finding 3).
   - *What's unclear:* whether a zero-config consumer should get a working suite with silently
     unfilterable tags (warn), or a hard stop that forces them to write a config (fail).
   - *Recommendation:* **warn**, on the same terminal channel as the unused-definition warnings, with
     a message naming `feature.uri`, the Scenario and the tag, and pointing at
     `https://vitest.dev/guide/test-tags`. This mirrors ADR-EC-019's "dead code, not a broken
     Scenario" precedent. Needs user confirmation — it is a public-behaviour decision CONTEXT.md did
     not cover.

2. **What does an EMPTY `includeTags: []` / `excludeTags: []` mean?**
   - *What we know:* D-02 fixes the syntax as a plain array; nothing decided the empty case.
   - *What's unclear:* `includeTags: []` could mean "no filter" or "match nothing" (which would
     silently delete the entire suite).
   - *Recommendation:* `undefined` and `[]` both mean **no filter**. Never let a computed-empty array
     silence a suite. Document it in the option's own doc comment.

3. **What happens to `⚙ AfterAllScenarios` and `⚠` warning nodes when every Scenario in a Feature is
   skipped or filtered out?**
   - *What we know:* `AfterAllScenarios` currently runs unconditionally by design (`Runner.ts` note
     (e)), while `BeforeAllScenarios` cannot run at all in that state (Pitfall 6).
   - *What's unclear:* whether that asymmetry is acceptable or a defect.
   - *Recommendation:* suppress the `AfterAllScenarios` node when no Scenario was emitted or all
     emitted Scenarios are skipped, and amend `Runner.ts` note (e) to say so. Leave the `⚠` warning
     nodes emitting — they describe registration, not execution.

4. **Does this phase ship the `gherkinTags(glob)` config helper?**
   - *What we know:* Pitfall 32 proposed it ("a small `gherkinTags(globPattern)` config helper that
     pre-scans `.feature` files and returns a `TestTagDefinition[]`"). Finding 2 shows that without
     *something* filling this role, `--tagsFilter` is unusable for a real consumer, which is a
     significant hole in ADR-EC-020's promise.
   - *What's unclear:* CONTEXT.md never mentions it, and it is a new public export with its own file
     I/O, glob dependency and index.ts surface.
   - *Recommendation:* **raise to the user before planning.** Either scope it into Phase 9 (making
     RUN-05 genuinely complete) or record it as a deferred item with an explicit note in BEH-EC-008
     that consumers must declare tags manually today. Do not let it fall through silently.

5. **Should the library announce registration-time exclusions?**
   - *What we know:* D-03 says an excluded Scenario "does not appear in test output at all".
   - *What's unclear:* whether total silence is safe. A stale `excludeTags` in a shared config could
     hide a whole Feature with nothing in the output saying so.
   - *Recommendation:* one collection-time line (`n Scenario(s) excluded by excludeTags`) on the
     existing warning channel. Cheap, and it is the only defence against a silent green.

6. **Should the missing `packages/vitest` seam grep be added now?**
   - *What we know:* no script currently enforces "no vitest import in `Runner.ts`/`TestApi.ts`"
     (Finding 16), and this phase is the first to create real pressure toward such an import.
   - *Recommendation:* raise to the user. It is arguably out of RUN-05's scope but is cheapest now.

---

## Sources

### Primary (HIGH confidence — executed or read in this repo, 2026-08-29)

- `node_modules/.pnpm/@vitest+runner@4.1.11/.../dist/chunk-artifact.js` — `createSuiteCollector`'s `task()` (tag validation + inheritance + option merge, L1714–1745), `interpretTaskModes` (L920–1002), `checkAllowOnly` (L1032–1041), `matchesTags` / `validateTags` / `createNoTagsError` (L1190–1219), `createTagsFilter` / `parseTagsExpression` / `resolveTagPattern` / `createWildcardRegex` / `evaluateNode` (L1220–1435)
- `node_modules/.pnpm/@vitest+runner@4.1.11/.../dist/tasks.d-DEYaIMIu.d.ts` — `TestOptions.tags` (L824–826), `TestTagDefinition` (L45–59), `VitestRunnerConfig.{tags,tagsFilter,strictTags}` (L30–32), `FileSpecification.fileTags`
- `node_modules/.pnpm/vitest@4.1.11_vite@8.2.2/.../dist/chunks/cli-api.CnMVyzaz.js:9336` — `strictTags: config.strictTags ?? true`
- `node_modules/.pnpm/vitest@4.1.11_vite@8.2.2/.../dist/chunks/defaults.9aQKnqFk.js:46` — `allowOnly: !isCI`
- `npx vitest --help` — `--strictTags … (default: true)`, `--tagsFilter`, `--listTags`
- `node_modules/.pnpm/@effect+vitest@4.0.0-rc.112.../dist/index.d.ts` (L33, 44–49, 69, 110) and `dist/internal/internal.js` (L40–42, 68–76, 204–205) — `Tester` signature and verbatim `TestOptions` forwarding
- Executed probe runs (all four scenarios in Findings 1, 2, 3, 4, 6, 7); probe files removed, `git status` clean
- `packages/vitest/src/{TestApi,Runner,describeFeature,Plan,ScenarioEffect}.ts`, `packages/vitest/test/Runner.test.ts`, `packages/gherkin/src/{Model,Correlate}.ts`, `packages/gherkin/test/Correlate.test.ts:173`
- `AGENTS.md`, `.planning/{REQUIREMENTS,ROADMAP,STATE,config.json}`, `.planning/research/PITFALLS.md` (Pitfalls 15, 22, 32), `spec/decisions/020-…md`, `spec/behaviors/02-shared-layers-and-tags.md`
- `scripts/{verify-no-runner-dep,verify-tsgo-gate,verify-oxlint-plugin}.sh`, `.github/workflows/check.yml`

### Secondary (MEDIUM confidence)

- `https://vitest.dev/guide/test-tags` — confirms config-declared tags, the filter grammar and
  precedence, and that an undeclared tag throws. Does not state the `strictTags` default value; that
  was established from source, CLI help, and an executed run instead.

### Tertiary (LOW confidence)

- None. Every claim in this document traces to a Primary source or is listed in the Assumptions Log.

---

## Metadata

**Confidence breakdown:**
- Standard stack: **HIGH** — no new packages; every version read from the installed lockfile tree.
- vitest tag/skip/only semantics: **HIGH** — source read *and* executed, with positive and negative
  controls for the `allowOnly` claim.
- `@effect/vitest` options forwarding: **HIGH** — type declarations, implementation source, and an
  executed run all agree.
- Repo architecture / extension points: **HIGH** — read directly from the four canonical_refs files
  plus `Plan.ts` and `ScenarioEffect.ts`.
- Recommended filter placement (Findings 12, 13): **HIGH** for the failure modes (both read directly
  from the code that throws / computes warnings); **MEDIUM** for "inside `emitFeature`" being the
  best of the remaining options — it is the only placement that avoids both failures, but the exact
  argument shape is the planner's call.
- Empty-describe behaviour (Pitfall 7 / A4): **MEDIUM** — read, not executed.
- Overload-ordering safety under a 4th parameter (A1): **MEDIUM** — must be settled by
  `pnpm verify:tsgo-gate` during execution.

**Research date:** 2026-08-29
**Valid until:** 2026-09-28 (30 days) — but re-verify Findings 1, 2 and 6 immediately on any
`vitest` minor bump. vitest v4's tag system is new (ADR-EC-020's own Negative Consequences say so),
and `strictTags`'s default is exactly the kind of thing that flips in a minor release.
