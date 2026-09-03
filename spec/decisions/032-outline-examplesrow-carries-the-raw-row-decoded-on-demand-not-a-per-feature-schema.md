# ADR-EC-032: An Outline column no step pattern references reaches a step body as a raw `ExamplesRow` in `StepParams`'s trailing tail, decoded on demand — not a per-Feature Schema declaration

> **Status:** Accepted
> **Date:** 2026-09-03
> **Context:** resolves [wayfinder ticket #14](https://github.com/leaderiop/effect-cucumber/issues/14), part of
> [effect-cucumber gap decisions #11](https://github.com/leaderiop/effect-cucumber/issues/11)

## Context

`spec/roadmap.md` § Planned locked the direction before this ADR was written, but only as a sketch — explicitly
the least-specified item in that section, unlike `gherkinWatchTriggers` (ADR-EC-030) and `Random.withSeed`
(ADR-EC-031), which both named a concrete mechanism up front:

> extend `StepParams<P>`'s trailing tail (already used for DataTable/DocString, BEH-EC-003/016) to optionally
> carry the raw Examples row (column name → string) when the Feature declares a per-column `Schema`, decoded
> through `Schema` the same way DataTable already is (ADR-EC-008).

Two questions the sketch leaves open, both settled here after reading the real APIs involved:

**1. Where does the raw Examples row actually come from?** `@cucumber/gherkin`'s `compile()` never puts a
row's column→value map on the `Pickle` it produces — a Pickle's `steps[].text` is already interpolated, and
nothing on `Pickle` itself names the Examples header at all. The raw pair survives only in the AST: the
`Scenario Outline` node's `examples[].tableHeader` and `examples[].tableBody[]`, which `Correlate.ts` already
walks for an unrelated reason (`AstScenarioInfo.examplesHeaders`/`examplesRowCounts`, F1/F2/F11's validation).
`OutlineTitle.ts` independently re-walks the SAME AST a second time, today, to build the `(col=value, ...)`
title suffix (BEH-EC-010) — resolving a row's own AST node id off `pickle.astNodeIds.at(-1)` exactly the way
this feature also needs to. That duplication was already latent before this ADR; extending it a third way
(a third walk, inside `Plan.ts` or `ScenarioEffect.ts`, at the point `StepParams`'s tail is assembled) would
have made it worse instead of fixing it.

**2. What does "the Feature declares a per-column Schema" mean as a real API, and where does it live?**
This is the sketch's weakest joint, and does not survive contact with `describeFeature`'s real signature.
A single per-Feature Schema declaration cannot work at all: one Feature can contain many `Scenario Outline`s,
each with its own Examples header (this repository's own `outline-two-examples-blocks.feature` fixture proves
one Outline alone can have two DIFFERENT headers across its own Examples blocks), so there is no single
"the Feature's columns" to attach one Schema to. `describeFeature(feature, layer, define, options?)`'s fourth
argument (`DescribeFeatureOptions`) is the only Feature-scoped configuration surface that exists, and it holds
registration-time tag filters — a `Schema` keyed by column name has no natural home there, and inventing one
would add a SECOND registration-time configuration channel beside the DSL itself, parallel to but disconnected
from where a step body is actually written.

DataTable's own real precedent (ADR-EC-008, as corrected by that ADR's own follow-up notes) answers both
questions by NOT declaring a Schema anywhere upfront: `decodeHashes(rowSchema)(table)` is called INSIDE the
step body that wants a typed table, with the raw `DataTable` handed to it positionally through `StepParams`'s
existing tail. No `Schema` is ever registered against `describeFeature`, `loadFeature`, or any other
Feature-scoped surface — the Schema lives exactly where the step that cares about the shape is written, and a
step that does not care about the table never touches Schema at all. Nothing about the sketch's "when the
Feature declares a per-column Schema" is true of the mechanism it names as the precedent to copy.

## Decision

**The raw Examples row reaches `ParsedScenario` as a new field, computed once per Scenario in `Correlate.ts`
alongside the AST walk it already performs, not derived a second time downstream:**

```ts
export interface ExamplesRow {
  readonly _tag: "ExamplesRow"
  readonly uri: string
  readonly line: number
  readonly header: ReadonlyArray<string>
  readonly values: ReadonlyArray<string>
  readonly raw: Readonly<Record<string, string>>
}

// packages/gherkin/src/Model.ts
export interface ParsedScenario {
  // ...
  readonly exampleRow: Option.Option<ExamplesRow>
}
```

`Correlate.ts`'s `AstIndex` gains one more map, `rowById: ReadonlyMap<string, { header, values }>`, populated
in the SAME per-Scenario walk that already builds `exampleColumns`. `correlateFeature` resolves each Pickle's
row the identical way `OutlineTitle.ts` already did — `pickle.astNodeIds.at(-1)`, never `[0]` (the Outline's
own shared AST id) — and `OutlineTitle.ts` is rewritten to read `scenario.exampleRow` instead of re-walking the
document a second time, removing the duplication question 1 raised rather than adding a third copy of it.
`Option.none()` for a plain Scenario (whose sole `astNodeIds` entry is its own scenario id, never a row id, so
the lookup is naturally absent); `Option.some(...)` only for a genuine Outline row.

**`StepParams<P>`'s trailing tail carries this Scenario's `ExamplesRow` — appended by `Plan.ts`'s `planStep`,
LAST, after the step's own DataTable/DocString — for EVERY step of an Outline row, not only the one step an
author annotates for it:**

```ts
// Plan.ts, planStep — the resolved step's `args` field
const args = [...only.args, ...step.stepArguments, ...Option.toArray(scenario.exampleRow)]
```

This is a real, considered departure from the DataTable/DocString precedent's PER-STEP optionality, and the
departure is deliberate rather than an oversight: a DataTable/DocString is optional per STEP because
`compile()`'s `PickleStepArgument` is genuinely a property of that one step's own Gherkin text. An Examples row
has no equivalent per-step optionality — it is a property of the SCENARIO (the whole row), so every step
inside that Scenario shares the identical row, the same way every step already shares the same
`scenario.astName`/`scenario.tags`. Attaching it only to the one step whose author remembered to annotate it
would require the DSL to know in advance which step "wants" it, which does not exist as a concept anywhere
else in this codebase's registration model — `use(module)` (ADR-EC-027) already establishes that a step's
registration carries no author intent beyond its own body. The tail slot is unchecked `any[]` already
(`StepParams<P> = [...StepArgs<P, Record<string, any>>, ...ReadonlyArray<any>]`), so appending one more item
to it changes NO existing type-level contract — a step body that does not annotate a trailing parameter simply
never reads the extra argument JavaScript hands it, exactly as an unread `DataTable`/`DocString` already goes
unread today.

**No Schema is declared anywhere ahead of time. A step body that wants typed columns calls
`decodeExamplesRow(rowSchema)(row)` itself, the same call shape `decodeHashes(rowSchema)(table)` already has:**

```ts
// packages/gherkin/src/ExamplesRow.ts
export const decodeExamplesRow: <S extends Schema.Constraint>(
  rowSchema: S
) => (row: ExamplesRow) => Effect.Effect<S["Type"], ExamplesRowError, S["DecodingServices"]>
```

`decodeExamplesRow` mirrors `decodeHashes`'s shape exactly — same type parameter, same
`Schema.decodeUnknownEffect` mechanism, same "name the offending column" error reporting (reusing
`DataTable.ts`'s own `firstIssuePath`, exported for exactly this reason) — one level shallower, since an
`ExamplesRow` decodes to ONE value rather than an array of rows. `ExamplesRowError` is a new, minimal error
class (`packages/gherkin/src/Errors.ts`) rather than a widened `DataTableError`: an `ExamplesRow` has no
header/width shape of its own to get wrong (`header`/`values` come straight off the AST walk, never
author-supplied cells with a row count to validate against each other), so its reason set is closed at exactly
one (`RowDecodeFailed`), against `DataTableError`'s four.

**A duplicate Examples column name keeps its FIRST value in `raw`, mirroring `Validate.ts`'s existing
`DuplicateExamplesColumn` WARNING — not `DataTable`'s `hashes()`, which FAILS on a duplicate header.** These
are deliberately different precedents for a reason already established elsewhere in this codebase: an Examples
column repeat is upstream-tolerated (`@cucumber/gherkin` lets the first win, silently, for both header and
substitution) and this library already only WARNS about it (`Validate.ts`'s F11 check); a DataTable's duplicate
header is a table an AUTHOR wrote by hand, has no upstream tolerance precedent, and ADR-EC-008/025 already
chose to refuse it outright rather than silently resolve it. `ExamplesRow.header`/`.values` stay POSITIONAL
and undeduped beside `raw`, specifically so `OutlineTitle.ts`'s title-suffix format — which zips
`header[i]=values[i]` and must show every occurrence's own value, not a deduplicated lookup — keeps behaving
exactly as it did before this field existed.

## Consequences

**Positive**:

- No new registration-time configuration surface: a step body that wants typed Examples columns writes
  ordinary code inside its own body, using a decode call this codebase's own dogfooded acceptance suite already
  proves works (`decodeHashes`'s existing precedent, ADR-EC-008) — nothing new to teach beyond "the same thing,
  one row instead of a table."
- `OutlineTitle.ts` loses its own AST-walking duplication rather than gaining a third copy of it — a real
  simplification this ADR's investigation surfaced, not merely a side effect tolerated for the new feature's
  sake.
- Works uniformly across every Outline shape this library already handles: two Examples blocks with different
  headers on one Outline (`outline-two-examples-blocks.feature`), a Rule-nested Outline, and a duplicate row
  name — because it reuses the SAME row-resolution the title suffix already proves correct for all of them,
  rather than a new resolution path that would need its own coverage of the same cases.

**Negative**:

- Every step of an Outline row carries the trailing `ExamplesRow`, whether or not that step's own author
  wanted it — a step that never reads its trailing parameter pays nothing at the type level (the tail was
  already unchecked `any[]`), but a step author inspecting `arguments.length` or similar reflection (an
  anti-pattern this library's own `Effect.fn`-wrapped step bodies do not encourage, but cannot forbid) would
  observe one more item than before on an Outline row specifically. Stated as a real, if narrow, behavioral
  change rather than hidden.
- No compile-time signal ties a step's declared trailing parameter type to the columns an Outline's Examples
  header actually declares — the same UNVERIFIED-annotation gap BEH-EC-016 already documents and accepts for
  DataTable/DocString (`StepArgs<P>` cannot express "and also this Outline's columns" from the pattern literal
  alone), inherited here rather than newly introduced.
- `decodeExamplesRow` is called freshly by every step that wants a typed view of the same row; two steps of one
  Outline row each decoding the SAME columns each pay their own decode cost, since the raw `ExamplesRow` object
  (not a memoised decode) is what is shared. Stated as a real, deliberately accepted cost mirroring
  `decodeHashes`'s identical shape rather than an oversight — memoising a decode result would require a
  Schema-agnostic cache keyed by an arbitrary caller-supplied Schema value, which is a different, unrequested
  feature.

**Trade-off accepted**: the roadmap sketch's literal "per-Feature Schema declaration" framing does not survive
`describeFeature`'s real signature (no Feature-scoped surface for it exists, and one Outline can carry more
than one Examples header, so no single per-Feature Schema could even be correct) — this ADR corrects the sketch
the same way ADR-EC-030/031 corrected theirs, in favor of reusing the ALREADY-PROVEN DataTable/`decodeHashes`
mechanism one level up, over inventing a new registration surface this codebase has no other precedent for and
that a consumer would have to learn as a second way to declare a shape, beside the DSL itself.
