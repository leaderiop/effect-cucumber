# Spike: tag-expression-scoped `Before`/`After` hooks

> Resolves GitHub issue [#32](https://github.com/leaderiop/effect-cucumber/issues/32).
> Follows on from issue #24 (closed) — `research/cucumber-ecosystem-feature-survey.md` — which
> found cucumber-js/cucumber-jvm let a hook be scoped by a tag expression
> (`Before({tags: '@db and not @slow'}, fn)`) and that vitest's own `--tagsFilter` already parses
> the full Cucumber tag-expression grammar (`and`/`or`/`not`/parens), so the intent was to reuse
> that grammar rather than invent a second one.

This is a SPIKE, not a design proposal ready to build from. Prototype code lives on the throwaway
branch `spike/tagged-hooks`, under `research/spikes/tagged-hooks/`, and is not wired into
`packages/vitest/src/HookRegistry.ts`/`Hook.ts` on `main`.

## Method

1. Read `packages/vitest/src/Dsl.ts` (`HookRegistrar<ROut>`), `HookRegistry.ts`, `Hook.ts`,
   `Runner.ts` and `ScenarioEffect.ts` — where hooks actually run relative to a Scenario, and
   where a Scenario's own (already-flattened, inherited) tags become available.
2. Found the actual mechanism vitest's `--tagsFilter` uses under the hood by reading the
   INSTALLED package, not assuming a name (finding 1, below).
3. Wrote a throwaway prototype (`TaggedHookRegistry.ts`) that reuses that exact mechanism, wired
   into a copy of the hook-batch-invocation path (`runHookBatch`/`groupHooks` from `Hook.ts`).
4. Wrote a real `.feature` fixture (`checkout.feature`) and a real, standalone vitest file
   (`TaggedHooks.spike.test.ts`) that parses it with the REAL `loadFeature`
   (`packages/vitest/src/loadFeature.ts` — the same one `describeFeature` uses) and runs the
   prototype's hook batches against the fixture's real, parsed Scenario tags. **Actually run**,
   not simulated: `pnpm exec vitest run research/spikes/tagged-hooks/TaggedHooks.spike.test.ts`,
   4/4 passing.
5. Compared the finding against `spec/behaviors/07-hook-ordering-and-guarantees.md`'s
   independent-batch / combined-failure guarantee.

---

## 1. The actual tag-expression parser vitest's `--tagsFilter` uses

**Assumption going in:** `@cucumber/tag-expressions`, or some similarly-named package, sits
underneath vitest's `--tagsFilter`.

**Found:** it isn't a separate package at all. `@cucumber/tag-expressions` is **not** in this
repo's dependency tree (checked: no match under `node_modules/.pnpm` for `*tag-expr*`, versus
`@cucumber/cucumber-expressions`, `@cucumber/gherkin` and `@cucumber/messages`, which are). vitest
implements its own hand-rolled tokenizer/recursive-descent-parser/evaluator for the tag-expression
grammar directly inside `@vitest/runner`, and exports it publicly:

```
@vitest/runner/utils
  createTagsFilter(tagsExpr: string[], availableTags: TestTagDefinition[]): (testTags: string[]) => boolean
  matchesTags(testTags: string[]): boolean   // reads the CURRENT test's config-level filter
  validateTags(config, tags): void            // the `strictTags` gate
```

Verified by reading the installed source directly:
`node_modules/.pnpm/@vitest+runner@4.1.11/node_modules/@vitest/runner/dist/chunk-artifact.js`
(`tokenize`, `parseOrExpression`/`parseAndExpression`/`parseUnaryExpression`/
`parsePrimaryExpression`, `evaluateNode`), re-exported through
`node_modules/.pnpm/@vitest+runner@4.1.11/node_modules/@vitest/runner/dist/utils.js`, with the
public type surface in `dist/utils.d.ts`. `@vitest/runner`'s own `package.json` declares
`"./utils"` as a real export subpath — this is a supported, public API, not a reach into an
internal chunk.

The grammar is exactly what the issue #24 research described: `and` / `or` / `not` / `&&` / `||`
/ `!` / parens, left-associative, `not` binding tighter than `and` binding tighter than `or` — the
same boolean tag-expression grammar Cucumber's own tooling implements, independently reimplemented
by vitest rather than depending on `@cucumber/tag-expressions`.

**One real wrinkle, not the "no wrinkle" outcome hoped for:** `createTagsFilter`'s parser
validates every tag literal in the expression against a caller-supplied `availableTags: {name:
string}[]` — `resolveTagPattern` in vitest's source throws `"tag pattern ... is not defined"` for
anything absent from it, and throws unconditionally when `availableTags` is empty. This is
precisely the same "declared tag universe" problem `spec/decisions/026-registration-time-tag-filtering-and-declared-tag-universe.md`
already had to solve for CLI `--tagsFilter` (`gherkinTags()` scans `.feature` files to build
`vitest.config.ts`'s `tags:` list) — it resurfaces here, independently, for a completely different
call site (see Finding 4).

---

## 2. Prototype `HookRegistrar` signature

`research/spikes/tagged-hooks/TaggedHookRegistry.ts` sketches the additive overload:

```ts
export interface TaggedHookRegistrar<ROut> {
  // Existing shape — untouched.
  <A, E>(fn: () => Effect.Effect<A, E, ROut>): void
  // NEW: tag-expression-scoped registration.
  <A, E>(tagExpr: string, fn: () => Effect.Effect<A, E, ROut>): void
}
```

i.e. `Before(fn)` keeps working exactly as it does today (the `tagExpr: null` case below is that
same call, unchanged), and `Before("@db and not @slow", fn)` is the new, additive call. This
mirrors the two-arity pattern `ScenarioRegistrar`/`RuleRegistrar` already use in `Dsl.ts` for
`(name, define)` vs `(name, extraLayer, define)`, so it isn't a novel shape for this codebase's
DSL.

Wiring: `HookDefinition<Fn>` (`HookRegistry.ts`) gains one field, `tagExpr: string | null`,
alongside its existing `ruleId: string | null`. `groupHooks` (`Hook.ts`) compiles each
non-null `tagExpr` into a matcher via `createTagsFilter([tagExpr], availableTags)` **once**, when
the `HookSet` is built (mirrors `Runner.ts`'s existing "hoisted ... runs once per Rule, outside
every thunk" comment on `mergeHookSets` — not re-parsed per Scenario). `runHookBatch` gains a
`scenarioTags: ReadonlyArray<string>` parameter and, ahead of invoking each hook, skips any whose
compiled matcher returns `false` for those tags.

---

## 3. Real test run: the filter actually works

Fixture `research/spikes/tagged-hooks/checkout.feature` — one `Feature`, three `Scenario`s: no
tags, `@db`, and `@db @slow`.

`research/spikes/tagged-hooks/TaggedHooks.spike.test.ts`, run for real
(`pnpm exec vitest run research/spikes/tagged-hooks/TaggedHooks.spike.test.ts`, 4/4 passed):

```
✓ a tag-expression-scoped Before runs for a matching Scenario and NOT for a non-matching one
✓ composes and/not exactly as vitest's own tag-expression grammar does
✓ preserves registration order among the hooks that actually run in a batch
✓ failures from a filtered batch still COMBINE — the independent-batch guarantee survives filtering
```

Concretely: a `Before("@db", fn)` ran for the `@db` and `@db @slow` Scenarios and did NOT run for
the untagged one; a `Before("@db and not @slow", fn)` ran for exactly the `@db`-only Scenario, out
of three, proving the compound and/not form composes correctly through the real parser (not just
a single bare tag). Both parsed from a real `.feature` file via the real `loadFeature`, not a
hand-typed tag array.

---

## 4. Composition finding against BEH-EC-017 (hook ordering and guarantees)

**Additive alongside Rule/Feature scoping, not in conflict with it.** Rule/Feature scoping
(`spec/behaviors/07-hook-ordering-and-guarantees.md`'s "a hook registered on the FEATURE dsl
applies to every Scenario ... A Rule's own dsl additionally accepts Before/After/... which narrow
... and compose with the Feature's own") decides **which `HookSet` a Scenario's batch is built
from** (`mergeHookSets(feature, rule)`). A tag expression is an ADDITIONAL predicate evaluated
per-entry, against the Scenario's already-known tags, at the SAME point that batch already runs.
The two compose cleanly: a Rule-scoped `Before("@db", fn)` narrows to that Rule's Scenarios (via
Rule/Feature scoping, unchanged) AND further narrows to only the `@db`-tagged ones among them (via
the new tag expression) — both filters apply, combined, exactly as `mergeHookSets`' feature-then-rule
ordering and the tag filter compose independently in the prototype.

**The "independent batch, combined failures" guarantee survives filtering, with a one-word
reading of "batch" that should be made explicit in the real spec.** BEH-EC-017 defines a batch as
"every hook of one kind DUE TO RUN at one point." A tag-filtered-out hook was never due to run for
this Scenario — it is excluded BEFORE the batch is assembled, not silently dropped from within it.
The prototype's fourth test proves this directly: three `Before` hooks registered (one
unconditional-failing, one `@slow`-scoped-failing, one `@db`-scoped-failing), run against a
`@db`-only Scenario — the `@slow`-scoped one is never invoked and its failure never exists to be
combined or dropped; the other two fail, and `Cause.combine` still produces both, in registration
order, exactly as an un-filtered two-hook batch would. Registration order among the hooks that DO
run is unaffected (third test) — filtering removes entries, it does not reorder survivors. **No
existing guarantee needs to change**, but the doc's prose ("every hook of one kind due to run")
would benefit from one added clause making "filtered-out is not-due-to-run, not a failure" explicit,
since a future reader could otherwise mistake a tag-filtered hook for one silently dropped from
its batch — the exact thing BEH-EC-017 currently promises never happens.

**One real friction point: `BeforeAllScenarios`/`AfterAllScenarios`.** These already stay
Feature-only and are a compile error on a Rule's dsl, because they run ONCE, shared across every
Scenario in the Feature, with no per-Scenario tier available (`RShared` only, "the runner provides
no per-Scenario build to either hook"). A tag expression's whole premise is "does THIS Scenario's
tag set match" — but a once-per-Feature hook has no single Scenario to check when it actually
runs (before the first attempted Scenario, or after the last). Recommendation: exclude
`BeforeAllScenarios`/`AfterAllScenarios` from the tag-expression overload entirely (make a tag
expression a compile error there, the same way they're already a compile error on `RuleDsl`) —
there's no coherent single-Scenario-tags answer to give `createTagsFilter`, and any
answer invented for it (all Scenarios' tags unioned? intersected? the first attempted one's?)
would be an arbitrary new semantic, not a natural extension of what a Before/After hook's tag
scoping already means.

**`resolveTagPattern`'s "declared tag universe" requirement is a second, independent finding worth
recording.** Because `createTagsFilter` throws on any tag literal absent from its `availableTags`
argument, a tag-expression-scoped hook needs its Feature's full flattened tag vocabulary computed
once (union of every `ParsedScenario.tags` in the `FeaturePlan`) before ANY hook's expression can
be compiled — not just the tags on the one Scenario currently being checked, since an expression
like `@db and not @slow` needs `@slow` in the universe even for a Scenario that doesn't carry it.
This is the second time this exact requirement has appeared in this codebase (ADR-EC-026 first, for
CLI `--tagsFilter`), independently, for an entirely different call site that never touches vitest's
CLI filter at all — worth noting as a real, recurring cost of reusing vitest's exact grammar/engine
rather than a factor against it.

---

## Recommendation

Reuse is real and it works: `@vitest/runner/utils`'s `createTagsFilter` is the actual mechanism,
not a name to guess at, and the prototype proves a hook can be scoped by an arbitrary and/or/not/
parens expression against a Scenario's real, inherited tags, with the independent-batch/combined-
failure guarantee intact for whatever survives the filter.

If this moves past spike stage:

- Add the `TaggedHookRegistrar` overload additively to `Before`/`After`/`BeforeStep`/`AfterStep`
  only — never to `BeforeAllScenarios`/`AfterAllScenarios` (see the friction point above).
- Compile each hook's tag expression once, at `HookSet`-build time (mirroring the existing
  `mergeHookSets` hoisting), not per Scenario — `createTagsFilter` itself already memoizes by
  array-reference identity inside vitest's own runner, which is a hint that repeated parsing is
  expected to be avoided, not relied on.
- Add one clause to BEH-EC-017 making explicit that a tag-filtered-out hook is excluded from its
  batch before assembly, not a batch member whose failure is dropped — the guarantee doesn't
  change, but a future reader shouldn't have to re-derive that from first principles.
- Treat the "declared tag universe" requirement as a real, recurring cost (not a one-off): whatever
  API ships should compute a Feature's flattened tag universe ONCE per Feature (reusing the
  existing `ParsedScenario.tags` data already flowing through `Plan.ts`, not a second `gherkinTags`-
  style file rescan), and surface `createTagsFilter`'s "unknown tag" error as a clear diagnostic
  naming the offending hook and its `.feature` file, not a bare thrown string from inside vitest's
  parser.

## Prototype file map

- `research/spikes/tagged-hooks/TaggedHookRegistry.ts` — the registry/grouping/batch-runner
  prototype, and the `TaggedHookRegistrar<ROut>` type sketch.
- `research/spikes/tagged-hooks/checkout.feature` — the real fixture used for the run.
- `research/spikes/tagged-hooks/TaggedHooks.spike.test.ts` — the real, standalone vitest file
  proving the filter (run with `pnpm exec vitest run research/spikes/tagged-hooks/TaggedHooks.spike.test.ts`).

Branch: `spike/tagged-hooks` (off `main`, throwaway — not intended to merge).
