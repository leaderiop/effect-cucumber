---
"@effect-cucumber/vitest": minor
---

`Given`/`When`/`Then` gain a second call signature: a `decode` argument between the pattern and the
body, declaring `{ table: Schema }` or `{ docstring: Schema }`. The step body receives the
already-decoded value as its own trailing parameter — `ReadonlyArray<S["Type"]>` for `table`,
`S["Type"]` for `docstring` — instead of the raw `DataTable`/`DocString` wrapper, with no
`yield* decodeHashes(...)`/`decodeDocString(...)` call needed inside the body:

```ts
Given("the following items:", { table: ItemSchema }, (items) =>
  Effect.gen(function*() {
    yield* Cart.addAll(items) // already ReadonlyArray<Item> — no decode call
  }))
```

A decode failure still surfaces as the existing `DataTableError`/`DocStringError` in the step's
inferred error channel — it simply has no explicit call site to point at anymore. The existing
two-argument `Given(pattern, fn)` form is completely unchanged; typed step modules (`defineSteps`)
get the same overload symmetrically.
