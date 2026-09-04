---
"@effect-cucumber/vitest": minor
---

Add tag-expression-scoped hooks: `Before`, `After`, `BeforeStep` and `AfterStep` accept an
additional, additive second call form — a leading tag-expression string, ahead of the body —
narrowing that hook to only the Scenarios whose own tags satisfy it. Parsed and evaluated by the
SAME grammar and engine vitest's own `--tagsFilter` uses (`and`/`or`/`not`/`&&`/`||`/`!`/parens),
via its exported `createTagsFilter` — no new dependency's grammar to learn, and confirmed NOT
`@cucumber/tag-expressions`, which remains absent from this repository's dependency tree entirely.

```ts
describeFeature(feature, World.layer, ({ Before, Scenario }) => {
  // Runs for every Scenario in this Feature, exactly as Before(fn) always has.
  Before(function*() {
    yield* Effect.void
  })

  // Runs ONLY for a Scenario whose own tags satisfy this expression.
  Before("@db and not @slow", function*() {
    yield* Ref.set((yield* Session).usesDatabase, true)
  })
})
```

`Before(fn)` keeps working exactly as it does today — the tag-expression form is additive, never a
replacement — and composes with existing Rule/Feature hook scoping: a Rule-scoped `Before("@db",
fn)` narrows to that Rule's Scenarios AND further narrows to only the `@db`-tagged ones among them.
`BeforeAllScenarios`/`AfterAllScenarios` do NOT accept a tag expression — passing one is a compile
error by arity, since a once-per-Feature hook has no single Scenario's tags to check against when
it actually runs.

Every tag literal a hook's own expression names must already be declared somewhere in that
Feature — the same "declared tag universe" rule `includeTags`/`excludeTags` already require,
extended to this second call site — or `describeFeature` throws a located `HookTagExpressionError`
naming the offending hook and its `.feature` file at registration time.

See [ADR-EC-035](../spec/decisions/035-tag-expression-scoped-hooks-reuse-vitests-createtagsfilter.md)
and [BEH-EC-027](../spec/behaviors/07-hook-ordering-and-guarantees.md).
