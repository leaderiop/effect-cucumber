# ADR-EC-057: `Given`/`When`/`Then` gain a `decode` overload — a DataTable/DocString's `Schema` declared alongside the pattern, decoded before the step body runs

> **Status:** Accepted
> **Date:** 2026-09-10

## Context

Today, a step that carries a DataTable or DocString receives the raw wrapper (`DataTable`/`DocString`,
ADR-EC-008/ADR-EC-046) as an ordinary trailing parameter, and calls `decodeHashes(schema)(table)` or
`decodeDocString(schema)(docString)` itself, inside its own body:

```ts
Given("the following items:", (table: DataTable) =>
  Effect.gen(function*() {
    const rows = yield* decodeHashes(ItemSchema)(table)
    yield* Cart.addAll(rows)
  }))
```

This is boilerplate every step carrying a table or doc string repeats identically, and — unlike a
pattern hole, which `StepArgs<P>` already types precisely — the DataTable/DocString slot is `StepParams<P>`'s
one deliberately unchecked tail (`Dsl.ts`'s own header note), so nothing catches a step author reaching
for the wrong accessor or forgetting to decode at all.

## Decision

**`StepRegistrar` gains a SECOND call signature**: a `decode` argument between the pattern and the
body, declaring `{ table: Schema }` or `{ docstring: Schema }`. The body's own trailing parameter is
typed as the schema's decoded `Type` directly, not the raw wrapper:

```ts
export type DecodeStepArgument<S extends Schema.Constraint> = { readonly table: S } | { readonly docstring: S }

export interface StepRegistrar<ROut> {
  <P extends string, A, E>(pattern: P, fn: /* unchanged, first overload */): void
  <P extends string, A, E, S extends Schema.Constraint>(
    pattern: P,
    decode: DecodeStepArgument<S>,
    fn: (...p: [...StepArgs<P, Record<string, any>>, S["Type"], ...ReadonlyArray<any>]) =>
      Effect.Effect<A, E, ROut | Scope.Scope | Attachments | S["DecodingServices"]>
  ): void
}
```

```ts
Given("the following items:", { table: ItemSchema }, (items) =>
  Effect.gen(function*() {
    yield* Cart.addAll(items) // already ReadonlyArray<Item> — no decode call
  }))
```

**A new shared module, `DecodeStepArgument.ts`, holds the runtime wrapping** (`wrapWithDecode`) —
called from BOTH `Collect.ts`'s Feature/Rule/Scenario-level registrar and `StepModule.ts`'s (ADR-EC-027
typed step modules), since both share the identical `ScenarioDsl<R>` type and therefore both actually
expose the new overload. `wrapWithDecode` finds the raw DataTable/DocString among a step's assembled
arguments **by `_tag`**, not by position — `StepParams`'s unchecked tail's exact index depends on the
pattern's own capture count, which nothing upstream of the wrapper needs to re-derive — decodes it
through `decodeHashes`/`decodeDocString` (both **unchanged**, still `@effect-cucumber/gherkin`'s own
functions), and substitutes the decoded value in place before calling the step's real body.

**A registrar's two-vs-three-argument call is discriminated by `maybeFn === undefined`** — the DSL's
own first (two-argument) overload never supplies a third runtime argument, so this is exact, not a
`typeof`/shape guess against `decode`.

**The decode failure stays a real tagged error in the step's own inferred `E`, with no explicit call
site.** `DataTableError`/`DocStringError` are unchanged; a step declaring `{ table: ItemSchema }`
whose row fails to decode still fails with a `DataTableError`, exactly as today's manual
`yield* decodeHashes(...)` call would — it simply has no `yield*` line to point at anymore, which is
the whole premise of "unified decode." A step that declares `decode` but whose matched Pickle step
carries no matching argument at all decodes `undefined`, dying with the SAME defect a hand-written
`decodeHashes(schema)(undefined as any)` already would — this ADR invents no new failure mode for that
author mistake.

**The wrap runs OUTSIDE the step's own `Effect.fn(pattern)` span.** `Step.ts`'s `register` normalises
the step's real body into that span BEFORE `wrapWithDecode` wraps it, so decode is a distinct
pre-processing phase sitting outside the step's own named unit of work — the same choice
`ScenarioEffect.ts`'s `withStepFailureLocation` already makes for the whole body call. A decode
failure is still fully located: `withStepFailureLocation` wraps the ENTIRE `resolved.step.body(...)`
call, decode included, so it gains a `StepFailureLocation` exactly as any other step failure does,
with no special-case integration needed.

**The existing two-argument overload is completely untouched** — a step never using `decode` compiles
and runs exactly as before; `docstring` and `table` variants ship together, matching
ADR-EC-046's own DataTable/DocString symmetry rather than reintroducing the asymmetry it closed.

## Consequences

**Positive**:

- Removes the single most common piece of step-body boilerplate this codebase's own worked examples
  and acceptance tests exhibit (`worked-example-03-discounts`, `outline-typed-column`).
- Symmetric across both step-registration surfaces (`Collect.ts` and `StepModule.ts`'s typed step
  modules) via one shared `wrapWithDecode`, not two independently hand-rolled copies.
- No behavior change to `decodeHashes`/`decodeDocString` themselves, and no new failure taxonomy: a
  decode failure is the same tagged error, located the same way, through the same existing
  `withStepFailureLocation` wrap.

**Negative**:

- A decode failure's `.cause` chain no longer has an explicit `yield* decodeHashes(...)` call site to
  point a reader at — the trade-off this ADR's own premise accepts deliberately: less code, at the
  cost of one line of "here is where decoding happened" locality a reader previously had for free.
- The wrap sits outside the step's own `Effect.fn(pattern)` span, so a decode failure's OTel span
  attribution differs subtly from a step's own logic failing — judged acceptable since the step's
  location (file/pattern/line) is still attached identically via `StepFailureLocation`, and span
  attribution is an observability nicety, not a correctness guarantee this ADR touches.

**Trade-off accepted**: less boilerplate and one unchecked-tail parameter type, in exchange for a
decode failure losing its explicit call site — the same trade every "sugar over an existing mechanism"
ADR in this series makes.
