---
"@effect-cucumber/vitest": minor
---

`describeFeature` gains a `tagExpression?: string` option — a registration-time filter expressed
in vitest's own boolean tag-expression grammar (`and`/`or`/`not`/`&&`/`||`/`!`/parens), the
IDENTICAL `createTagsFilter` engine (`@vitest/runner/utils`) this library already reuses for
tag-expression-scoped hooks (`Before(tagExpr, fn)`). Mutually exclusive with `includeTags`/
`excludeTags`: combining `tagExpression` with either throws a located error naming both option
names, at registration time, before anything collects.

```ts
// Compound conditions includeTags/excludeTags cannot express as two plain arrays.
describeFeature(feature, layer, define, { tagExpression: "@smoke and not @wip" })
```

A tag literal `tagExpression` names that is absent from the Feature's own declared tag universe,
or a malformed expression string, throws synchronously, before registration — the same
"declared tag universe" rule already enforced for `includeTags`/`excludeTags` and for hook tag
expressions.

`ExcludedScenariosNotice` gains a matching `"ExcludedByTagExpression"` reason and a `tagExpression`
field, fixing a real bug this option's compiled-tag-matcher approach would otherwise have
introduced: without it, a `tagExpression` exclusion — always carrying an empty `includeTags`/
`excludeTags` pair — would have been mislabeled `ExcludedByExcludeTags` with an uninformative
empty list.

See [ADR-EC-054](../spec/decisions/054-describefeature-tagexpression-option-reuses-vitests-createtagsfilter.md).
