# ADR-EC-035: `Before`/`After`/`BeforeStep`/`AfterStep` accept a leading tag-expression string, compiled once per Feature via vitest's own `createTagsFilter`

> **Status:** Accepted and implemented — `packages/vitest/src/{HookTagExpression,HookRegistry,Hook,Dsl,Collect,ScenarioEffect,Runner}.ts`, observed against the real running framework in `packages/vitest/test/acceptance/tagged-hooks.{feature,steps.test.ts}`
> **Date:** 2026-09-04
> **Context:** resolves [GitHub issue #32](https://github.com/leaderiop/effect-cucumber/issues/32), part of [effect-cucumber gap decisions #11](https://github.com/leaderiop/effect-cucumber/issues/11); `spec/roadmap.md` § Planned locked the direction as "design locked, spike-proven" ahead of this ADR, after a real, working spike on branch `spike/tagged-hooks` (`research/tagged-hooks-spike.md`) answered the hard design questions against the CURRENT `main` at the time

## Context

cucumber-js and cucumber-jvm both let a hook be scoped by a tag expression —
`Before({ tags: "@db and not @slow" }, fn)` — filtering at RUN time, per
Scenario, whether a globally-registered hook applies. This library has no
global hook registry to filter (`Before` is always called from inside one
`describeFeature`/`Rule` call, already scoping it syntactically), but nothing
before this ADR let a hook registered at Feature or Rule level be FURTHER
narrowed to a subset of that scope's own Scenarios by their tags — the
`packages/vitest/README.md` migration guide's own "no structural equivalent"
paragraph named this gap explicitly.

Research for GitHub issue #24 (closed, archived on `planning-archive`) assumed
the mechanism to reuse would be `@cucumber/tag-expressions`, the same package
Cucumber's own tooling ships. The spike falsified that assumption by execution
before this ADR was written, and this ADR re-verified the finding against a
LATER `main` (retries, the failure-panel fix and Outline typing had all landed
since the spike) rather than trusting the spike's prose:

**`@cucumber/tag-expressions` is not in this repository's dependency tree at
all** — confirmed again: no match under `node_modules/.pnpm` for
`*tag-expr*`, versus `@cucumber/cucumber-expressions`, `@cucumber/gherkin` and
`@cucumber/messages`, which are. vitest's own `--tagsFilter` is not backed by
it either. vitest implements its own tokenizer/recursive-descent-parser/
evaluator for the tag-expression grammar (`and`/`or`/`not`/`&&`/`||`/`!`/
parens — the identical boolean grammar Cucumber's own tooling implements,
independently reimplemented) directly inside `@vitest/runner`, and exports it
publicly:

```
@vitest/runner/utils
  createTagsFilter(tagsExpr: string[], availableTags: TestTagDefinition[]): (testTags: string[]) => boolean
```

Re-verified against the CURRENTLY installed `@vitest/runner@4.1.11` — not
assumed from the spike's own citation — by reading the installed source
directly: `node_modules/.pnpm/@vitest+runner@4.1.11/node_modules/@vitest/
runner/dist/chunk-artifact.js` (`createTagsFilter`, `parseTagsExpression`,
`resolveTagPattern`, `evaluateNode`), re-exported through `dist/utils.js`,
with the public type surface in `dist/utils.d.ts`. `@vitest/runner`'s own
`package.json` declares `"./utils"` as a real, documented export subpath — a
supported public API, not a reach into an internal chunk — and is pinned to
the EXACT SAME version (`4.1.11`) the installed `vitest@4.1.11` itself
declares as a dependency, confirmed by reading `vitest`'s own
`package.json`. The spike's exact call signature held: `createTagsFilter`
still takes `(tagsExpr: string[], availableTags: TestTagDefinition[])` and
still returns `(testTags: string[]) => boolean`, and still throws
SYNCHRONOUSLY — inside `parseTagsExpression`/`resolveTagPattern`, at compile
time, not lazily when the returned predicate is later called — for any tag
literal in the expression absent from `availableTags`.

## Decision

**`Before`, `After`, `BeforeStep` and `AfterStep` gain a second call
signature — a leading tag-expression string ahead of the body — via a new
`TaggedHookRegistrar<ROut>` type in `Dsl.ts`, additive to the existing
one-arg `HookRegistrar<ROut>` shape:**

```ts
// packages/vitest/src/Dsl.ts
export interface TaggedHookRegistrar<ROut> {
  <A, E>(
    fn: (() => Effect.gen.Return<A, E, ROut | Scope.Scope>) | (() => Effect.Effect<A, E, ROut | Scope.Scope>)
  ): void
  <A, E>(
    tagExpr: string,
    fn: (() => Effect.gen.Return<A, E, ROut | Scope.Scope>) | (() => Effect.Effect<A, E, ROut | Scope.Scope>)
  ): void
}
```

`Before(fn)` keeps working exactly as it does today — the `tagExpr: null`
case below is that SAME call, unchanged, not a separate code path — and
`Before("@db and not @slow", fn)` is the new, additive call. The unconditional
overload is listed first, per this file's own convention that an existing
shape stays the shape a caller meets first.

**`BeforeAllScenarios`/`AfterAllScenarios` are deliberately EXCLUDED from
`TaggedHookRegistrar` — they keep the plain `HookRegistrar<RShared>` shape,
unchanged.** A tag expression's whole premise is "does THIS Scenario's tag set
match," but a once-per-Feature hook has no single Scenario to check when it
actually runs (before the first attempted Scenario, or after the last).
Passing a tag expression to either is therefore a **compile error by arity**
— `BeforeAllScenarios("@db", fn)` does not type-check against a one-arg-only
`HookRegistrar` — the identical mechanism that already makes `BeforeAllScenarios`/
`AfterAllScenarios` a compile error on a Rule's own dsl (`RuleDsl` simply has
no such member at all): a member's TYPE, or its very presence, is what the
Dsl restricts, never a runtime branch. `packages/vitest/test/
HookRegistrar.types.ts` pins both restrictions with `@ts-expect-error`
fixtures, compiled by `pnpm typecheck:test`. No arbitrary semantic (all
Scenarios' tags unioned? intersected? the first attempted one's?) was invented
to give either hook a tag expression's meaning; the restriction stays a
compile-time absence, the same shape this codebase already uses for "this
combination has no coherent meaning."

**A hook's own tag expression is compiled ONCE per Feature, at `groupHooks`
time — never re-parsed per Scenario — against the Feature's OWN declared tag
universe, and filtering happens BEFORE a hook becomes a batch member, never
from within an assembled batch:**

- `HookRegistry.ts`'s `HookDefinition<Fn>` gains a `tagExpr: string | null`
  field beside its existing `ruleId`, recorded verbatim by `register(kind,
  ruleId, tagExpr, body)`. `null` is the common, unconditional value — not a
  marker for "not yet set" — exactly the same shape `ruleId: null` already
  has for a Feature-level hook.
- A new leaf module, `HookTagExpression.ts`, mirrors this codebase's existing
  `Tags.ts` organisation (a focused module owning one tag-handling concern):
  `featureTagUniverse(scenarios)` flattens and deduplicates every literal tag
  across `ParsedFeature.allScenarios` — the SAME data `Plan.ts` already
  flattens, never a second `gherkinTags`-style file rescan — and
  `compileHookTagExpr({ tagExpr, availableTags, kind, featureUri })` calls the
  real `createTagsFilter([tagExpr], availableTags.map(name => ({ name })))`
  and wraps its result in a `TagMatcher`, or returns `null` for `tagExpr:
  null` (the unconditional case — not a separate code path).
- `Hook.ts`'s `HookSet` changes from `{ [K in HookKind]: ReadonlyArray<HookBody> }`
  to `{ [K in HookKind]: ReadonlyArray<HookEntry> }`, where `HookEntry = {
  body: HookBody; matches: TagMatcher | null }`. `groupHooks(definitions,
  availableTags, featureUri)` compiles every definition's `tagExpr` into its
  entry's `matches` exactly ONCE, at grouping time — mirroring `Runner.ts`'s
  existing "hoisted `mergeHookSets`, runs once per Rule, outside every thunk"
  comment, extended to tag-expression compilation.
- `runHookBatch(entries, scenarioTags)` gains a `scenarioTags` parameter and,
  immediately ahead of invoking each entry, `continue`s past any whose
  `matches` predicate rejects `scenarioTags` — the entry is never invoked,
  contributes no exit, and is therefore never a source of a "dropped
  failure": there is no failure, because there was no invocation. This is the
  literal mechanism behind the "excluded before the batch is assembled, never
  a silently-dropped batch member" property BEH-EC-017 already promises for
  the un-filtered case, and BEH-EC-027 (the new behavior entry this ADR
  backs) states explicitly what BEH-EC-017's prose left implicit: a
  tag-filtered-out hook was never "due to run" for this Scenario in the first
  place.
- `ScenarioEffect.ts` threads `args.plan.tags` — the Scenario's own
  already-flattened, inherited tags — into every `Before`/`BeforeStep`/
  `AfterStep`/`After` batch it runs. `Runner.ts` passes `[]` for
  `BeforeAllScenarios`/`AfterAllScenarios`'s batches: every entry there has
  `matches: null` by construction (excluded from `TaggedHookRegistrar` at the
  Dsl), so the argument is structurally present (one shared `runHookBatch`
  signature across all six kinds) but never actually consulted for either.

**The tag universe is FEATURE-WIDE, computed once in `Collect.ts`, and
applies identically to a Rule-scoped hook's own tag expression — not a
Rule-scoped universe.** `compileHookTagExpr` requires every tag literal an
expression names to be declared somewhere the caller can point to
(`createTagsFilter`'s own `resolveTagPattern` throws unconditionally for
anything absent), and an expression like `@db and not @slow` needs `@slow`
declared even for a Scenario that does not carry it. `Collect.ts` computes
`featureTagUniverse(feature.allScenarios)` ONCE, before either `groupHooks`
call (Feature-level and every Rule's), and passes the SAME value to both —
proven by `packages/vitest/test/describeFeature.test.ts`'s "compiles a
Rule-scoped hook's tag expression against the FEATURE-wide tag universe, not
the Rule's own" case, where `@db` is declared on a Feature-level Scenario, not
inside the Rule whose own `Before("@db", fn)` still compiles.

**This is the SAME "declared tag universe" rule
[ADR-EC-026](026-registration-time-tag-filtering-and-declared-tag-universe.md)
already established for `describeFeature`'s `includeTags`/`excludeTags` —
extended to a second, independent call site, not a new rule.** The two differ
in one real way, and the difference is deliberate rather than an
inconsistency: ADR-EC-026's undeclared-tag case is the RUNNER's own rejection
(vitest's `strictTags` check, at collection time), which `VitestTestApi.ts`
catches and DEGRADES — re-emitting the Scenario untagged, behind a warning,
so the Scenario still runs. A hook's tag expression is compiled by THIS
library's own code (`HookTagExpression.ts`), with no framework rejection to
intercept — there is nothing to degrade FROM. An unknown tag literal here is
therefore a LOUD, located, registration-time throw
(`HookTagExpressionError`, a real `Error` subclass mirroring `Errors.ts`'s
existing `StepFailureLocation` shape — never decoded or compared by tag,
printed as-is), naming the offending hook kind, its exact expression string
and the `.feature` file, with the underlying vitest parser message preserved
as `.cause` — the same "dead code, fail loud" precedent
[ADR-EC-019](019-fail-loudly-on-unmatched-or-ambiguous-steps.md) already sets
for an unmatched or ambiguous step: a typo in a hook's tag expression is
exactly as silent-and-wrong as a typo in a step pattern would be if it merely
degraded.

**`@vitest/runner` becomes a real, named dependency of `packages/vitest` —
peer and dev, pinned to `vitest`'s own peer range — not a transitive one
relied on implicitly.** `HookTagExpression.ts` imports `createTagsFilter`
from its public `./utils` subpath directly. `@vitest/runner` ships as part of
the SAME `vitest` release train, at the identical version `vitest` itself
depends on (verified by reading the installed `vitest@4.1.11`'s own
`package.json`), so pinning it to `vitest`'s own peer range
(`>=4.1.0 <5.0.0`) in `pnpm-workspace.yaml`'s `catalogs.peer` keeps the two
locked together the way they already are transitively — this makes that
coupling an explicit, documented dependency rather than an implicit one a
future `vitest` major could silently break.

**`scripts/verify-testapi-seam.sh` does not apply here, and this ADR records
why rather than leaving a reader to wonder.** That gate's `FORBIDDEN_RE`
(`vitest|@effect/vitest`) is scanned ONLY against `Runner.ts` and
`TestApi.ts` — the two modules that declare and consume the injected `TestApi`
seam itself. `HookTagExpression.ts` and `Hook.ts` are core, pure computation
(like `Plan.ts`), never covered by that gate, and — unlike ADR-EC-034's
`flakyTest`, which requires a LIVE running test framework instance
(`TestContext`, the actual `it.effect` machinery) — `createTagsFilter` is a
pure, synchronous, standalone parser/evaluator with no framework runtime
dependency at all: give it strings, get back a predicate function. It is
closer in kind to `tinyglobby`'s `globSync` (ADR-EC-026), a general utility
imported directly into a leaf module, than to a test-framework runtime
capability that must be applied at the one permitted seam. `Runner.ts` itself
still imports nothing new: it only ever passes plain `ReadonlyArray<string>`
scenario tags into `runHookBatch`, unchanged in kind from what it already
passes into `shouldEmit`/`isSkipped`/`isRetried`.

## Consequences

**Positive**:

- Closes the `packages/vitest/README.md` migration guide's own "no
  structural equivalent" gap for the common case — a tag-scoped hook whose
  tag doesn't align with a `Rule:` boundary now has a direct, one-line
  mechanical mapping (`Before("@db", fn)`), where before the only options
  were "regroup under a `Rule:`" or "fold the check into every step body."
- Composes additively with the existing Rule/Feature hook-scoping and with
  `includeTags`/`excludeTags` registration-time filtering — three
  independent filters, none of which special-cases the others.
- No new grammar for a consumer to learn: the exact `and`/`or`/`not`/parens
  syntax vitest's own `--tagsFilter` already teaches.
- The independent-batch/combined-failure guarantee (BEH-EC-017) needed no
  change to its mechanism, only a clarifying clause (BEH-EC-027) making
  explicit what was already true: a filtered-out hook was never a batch
  member to begin with.

**Negative**:

- A second dependency-posture change in two ADRs (`tinyglobby` for
  ADR-EC-026, now `@vitest/runner` for this one) — a real, if small, growth
  in this package's install graph, recorded rather than left to a lockfile
  diff.
- A hook's tag expression is validated against the Feature's OWN tags only —
  a tag expression cannot reach across `.feature` files (the same structural
  limit `includeTags`/`excludeTags` already has, and the one the
  `packages/vitest/README.md` migration guide's "cross-file" case still
  correctly names as real, unclosed rework).
- One more registration-time throw surface (`HookTagExpressionError`) for a
  consumer to encounter — deliberately loud rather than degraded, per the
  "dead code, fail loud" precedent above, but still a new way `describeFeature`
  can throw synchronously that did not exist before this ADR.

**Trade-off accepted**: reusing vitest's exact grammar/engine costs a second,
independent "declared tag universe" requirement (first ADR-EC-026, now this
one) — the spike's own write-up called this out as a real, recurring cost
rather than a one-off, and this ADR accepts it for the same reason ADR-EC-026
did: the alternative (a bespoke tag-expression grammar, or silently
mismatched semantics from vitest's own `--tagsFilter`) is worse in both
directions.
