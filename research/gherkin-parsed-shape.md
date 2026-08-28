# Research: `@cucumber/gherkin@42.0.1`'s actual parsed output shape

Answers GitHub issue #2 (child of wayfinder map #1). Verified against the
**actual installed packages**, not recollection:

- `npm install @cucumber/gherkin@42.0.1 @cucumber/messages` in a throwaway
  scratch dir (`/tmp/gherkin-research`, outside this repo).
- Read the installed `.d.ts` files directly (message shapes come from
  `@cucumber/messages@34.2.1`'s `dist/messages.d.ts`; the parser/compiler API
  comes from `@cucumber/gherkin`'s own `dist/*.d.ts` and `src/pickles/compile.ts`).
- Wrote and ran a real Node script (`run.mjs`) against a hand-written
  `sample.feature` containing: a Feature-level `Background`, a `Rule` with its
  own `Background` + one plain `Scenario` + one `Scenario Outline` with an
  `Examples` table, a step with a `DataTable`, and a step with a `DocString`.
  Both the raw `Parser.parse()` output and the `compile()`-produced `Pickle[]`
  were inspected.

Sample feature and script live in `/tmp/gherkin-research/` (not committed —
it's a scratch dir outside this repo, per the task instructions).

---

## 1. Where do tags live?

**Spec assumption:** `spec/behaviors/02-shared-layers-and-tags.md` (BEH-EC-008)
assumes a Scenario can be tagged (`@skip`/`@only`) and that tag maps to
`it.effect.skip`/`.only`. It doesn't say explicitly where in the AST tags
live, or whether Background/Rule/Examples can carry tags too.

**Found:** Tags live on multiple node types in the raw `GherkinDocument`, not
only on the compiled `Pickle`:

```ts
// @cucumber/messages/dist/messages.d.ts
export type Feature = { tags: readonly Tag[]; ... }
export type Rule = { tags: readonly Tag[]; ... }
export type Scenario = { tags: readonly Tag[]; ... }
export type Examples = { tags: readonly Tag[]; ... }
export type Background = { /* NO tags field */ ... }
```

`Background` has no `tags` field — Gherkin doesn't allow tagging a
Background. Confirmed at runtime: parsing the sample feature and checking
`'tags' in feature.children.find(c => c.background).background` returned
`false`.

The compiled `Pickle` also carries tags (`Pickle.tags: readonly PickleTag[]`),
but as a **flattened, inherited union**: `compile.ts`'s `compileScenario`
builds `tags = [...inheritedTags, ...scenario.tags]` where `inheritedTags`
is `featureTags` (or `featureTags + rule.tags` inside a Rule), and
`compileScenarioOutline` additionally appends `examples.tags`. Runtime
confirmation from the sample (`Feature: @feature-tag`, `Rule: Discounts` with
no tag, `Scenario Outline: @outline-tag`, `Examples: @examples-tag`):

```
Pickle tags: [ '@feature-tag', '@outline-tag', '@examples-tag' ]
```

**Match/conflict:** No conflict, but a clarification the spec should absorb:
tags exist at every raw-AST level (Feature, Rule, Scenario, Examples) *and*
on the Pickle as an inherited flat list. If `@effect-cucumber/gherkin`'s
`loadFeature` walks the raw `GherkinDocument` (which it must, to build the
Feature/Rule/Background/ScenarioOutline tree the DSL needs — see §2 and §4),
it needs its own inheritance logic to compute "effective tags" for
`@skip`/`@only` filtering (Feature tags apply to every Scenario, Rule tags to
every Scenario in that Rule, etc.) — it cannot just read `scenario.tags` in
isolation and expect Feature/Rule tags to already be folded in, the way the
Pickle does it. This inheritance behavior isn't currently described anywhere
in the spec files reviewed.

---

## 2. Background and Rule representation

**Spec assumption:** `spec/glossary.md` says Background steps "run before
every Scenario in a Feature (or Rule)". ADR-EC-010 says a `Rule`'s hooks
apply only to Scenarios within that Rule, and the worked example in
`spec/behaviors/03-rules-outlines-and-testclock.md` puts the `Background` at
the Feature's top level while a `Rule` nests `ScenarioOutline`/`Scenario`
inside it — implying Background can exist per-Feature and (separately) that a
Rule can group Scenarios, but doesn't explicitly say whether a Rule can carry
its *own* Background or how nesting/ordering is represented in the AST.

**Found:**

```ts
// @cucumber/messages
export type GherkinDocument = { feature?: Feature; ... }
export type Feature = { children: readonly FeatureChild[]; ... }
export type FeatureChild = { rule?: Rule; background?: Background; scenario?: Scenario }
export type Rule = { children: readonly RuleChild[]; ... }
export type RuleChild = { background?: Background; scenario?: Scenario }
```

- `Feature.children` is a single **ordered array** of tagged-union nodes
  (`FeatureChild`), each holding exactly one of `rule` / `background` /
  `scenario`. There's no separate `feature.background` field — the
  Feature-level Background is just the `FeatureChild` whose `.background` is
  set, wherever it happens to sit in `children` (Gherkin grammar constrains it
  to at most one, and it must precede Scenarios, but the *type* doesn't
  enforce that — order is whatever `children` says).
- `Rule.children` is the same pattern one level down, via `RuleChild` (which
  omits `rule` — Rules can't nest), so a `Rule` **can have its own
  `Background`**, structurally identical in shape to the Feature's
  (`{ location, keyword, name, description, steps, id }`), just scoped to
  `Rule.children` instead of `Feature.children`.
- Runtime confirmation from the sample (Feature-level `Background: Given the
  cart is empty`, Rule `Discounts` with its own `Background: Given a discount
  code "SAVE10" exists`):
  ```
  Rule has its own Background? true
  Rule Background steps: [ 'a discount code "SAVE10" exists' ]
  Rule.children order: [ 'background', 'scenario', 'scenario' ]
  Feature.children order: [ 'background', 'scenario', 'rule' ]
  ```
- How the two Backgrounds *compose* is not a matter of AST nesting at all —
  it's business logic in `compile.ts`: `compileRule` starts
  `ruleBackgroundSteps` from a **copy of** `featureBackgroundSteps` and then
  **concatenates** the Rule's own Background steps onto it
  (`ruleBackgroundSteps = ruleBackgroundSteps.concat(stepsContainer.background.steps)`).
  So a Scenario inside a Rule effectively runs: Feature Background steps,
  then Rule Background steps, then its own steps — confirmed in the compiled
  Pickle for "Applying a discount":
  ```
  - "the cart is empty"                       (Feature Background)
  - "a discount code \"SAVE10\" exists"        (Rule Background)
  - "I have a receipt:"                        (own step)
  - "I apply the discount code \"SAVE10\""
  - "the total is discounted"
  ```

**Match/conflict:** Matches the spec's intent (Background runs before every
Scenario, Rule can group Scenarios), and confirms the previously-unstated
detail that a Rule's own Background *stacks after*, not instead of, the
Feature's. No conflict, but this stacking behavior — and the fact that
`@effect-cucumber/gherkin` must replicate it itself if it hands the DSL raw
AST nodes rather than pre-compiled Pickles (BEH-EC-005's "first `yield*`s ...
in declaration order" requirement) — should be written down explicitly
somewhere, since it isn't yet.

---

## 3. `DataTable` and `DocString` step arguments

**Spec assumption:** ADR-EC-008 and the worked example in
`spec/behaviors/03-rules-outlines-and-testclock.md` both call `table.hashes()`
directly on a step's `DataTable` argument (`const rows = yield*
Schema.decodeUnknown(Schema.Array(CartRow))(table.hashes())`), implying
`.hashes()` is available as a method on whatever `DataTable` value a step
receives.

**Found:** Neither the raw `GherkinDocument`-level `DataTable`/`DocString`
nor the compiled `Pickle`-level `PickleTable`/`PickleDocString` has any
methods — they are plain data shapes (interfaces backed by plain objects),
not classes:

```ts
// raw AST (@cucumber/messages)
export type DataTable = { location: Location; rows: readonly TableRow[] }
export type TableRow = { location: Location; cells: readonly TableCell[]; id: string }
export type TableCell = { location: Location; value: string }
export type DocString = { location: Location; mediaType?: string; content: string; delimiter: string }

// compiled (Pickle-level)
export type PickleTable = { argumentIndex?: number; rows: readonly PickleTableRow[] }
export type PickleTableRow = { cells: readonly PickleTableCell[] }
export type PickleTableCell = { value: string }
export type PickleDocString = { argumentIndex?: number; mediaType?: string; content: string }
```

Runtime confirmation:

```
dataTable has hashes method? undefined
dataTable prototype: [Object: null prototype] {}
...
PickleTable has hashes? undefined
```

`PickleDocString`'s own prototype is just `Object.prototype` (`toString`,
`valueOf`, etc.) — no domain methods either. A `grep -l hashes` across the
entire installed `@cucumber/gherkin` source tree (`src/` and `dist/`) found
**zero** matches. `.hashes()`/`.raw()`/`.rowsHash()` are a runtime `DataTable`
*wrapper class* that lives in `@cucumber/cucumber` (the full Cucumber.js test
runner package), not in `@cucumber/gherkin` or `@cucumber/messages` — this
repo does not (and per ADR-EC-011, does not plan to) depend on
`@cucumber/cucumber`.

**Match/conflict — CONFLICT.** The spec's worked examples assume `.hashes()`
exists on the `DataTable` a step receives, but `@cucumber/gherkin` +
`@cucumber/messages` provide only raw `{ rows: [{ cells: [{ value }] }] }`
data — no such method anywhere in the dependency the spec says it's reusing.
`@effect-cucumber/gherkin` will need to implement its own thin `DataTable`
wrapper (`.hashes()`, and whatever else the DSL wants — `.raw()`,
`.rowsHash()`) around the raw `rows`/`cells` structure; it is not "free" from
`@cucumber/gherkin` the way ADR-EC-008 and BEH-EC-011/03's worked example
implicitly assume. Same for `DocString`: a step just gets `{ content:
string }` (plus optional `mediaType`) — trivial to consume directly, but
worth noting it's a plain string field, not an object with helper methods.

---

## 4. Scenario Outline + Examples placeholder substitution

**Spec assumption:** `spec/glossary.md` ("Scenario Outline") and
`spec/behaviors/03-rules-outlines-and-testclock.md` (BEH-EC-010) both state:
"`<placeholder>` tokens ... are substituted into the step text **by the
Gherkin parser** *before* step matching happens." `ADR-EC-007` repeats the
same claim ("substituted into step text is already coerced ... by the
pattern itself").

**Found:** This is **half right, half misleading** about *which part* of
`@cucumber/gherkin` does the substitution:

- The raw `GherkinDocument` returned by `Parser.parse(source)` does **not**
  substitute anything. A `Scenario Outline`'s `steps` retain the literal
  `<placeholder>` tokens verbatim — confirmed at runtime:
  ```
  Outline step texts (RAW, should still have <placeholder>):
   - "a discount code \"<code>\" worth <percent>%"
   - "I apply the discount code \"<code>\""
   - "the total is <expected>"
  ```
  (`Parser.d.ts`'s `parse(gherkinSource: string): GherkinDocument` is the only
  method that produces the AST; there is no substitution step inside it.)
- Substitution is performed by a **separate, explicitly-invoked function**,
  `compile(gherkinDocument, uri, newId): readonly Pickle[]`
  (`@cucumber/gherkin/src/pickles/compile.ts`, exported from the package's
  `index.ts` alongside `Parser`/`AstBuilder`). Inside it, a private
  `interpolate(name, variableCells, valueCells)` helper does a literal
  string-replace of each `<column>` token with that Examples row's cell value,
  and it is called for step text, docstring content/mediaType, data table
  cell values, and the Scenario's own `name` — but **only while building
  `Pickle`s**, one per Examples row. Runtime confirmation:
  ```
  Pickle name: Applying percentage discounts
  Pickle steps:
    ...
    - "a discount code \"SAVE10\" worth 10%"
    - "I apply the discount code \"SAVE10\""
    - "the total is 90.00"
  ```
  (a second Pickle exists for the `SAVE50` row, correctly substituted too).

**Match/conflict — CONFLICT (precision issue, not a factual reversal).** The
substitution genuinely is "done by `@cucumber/gherkin` itself" and does
happen "before cucumber-expression matching" — so ADR-EC-007's practical
conclusion (no separate typed "example row" mechanism needed) still holds
*if* `loadFeature` uses `compile()`'s `Pickle[]` output for the substituted
step text. But the spec's phrasing — "the Gherkin parser" — conflates
`Parser.parse()` (produces the raw, un-substituted `GherkinDocument`) with
`compile()` (a distinct function, called separately, that produces
`Pickle[]`). This matters concretely for `@effect-cucumber/gherkin`'s design:
the worked examples in `spec/behaviors/03-rules-outlines-and-testclock.md`
structure `describeFeature`'s DSL around the raw AST shape (`Rule` as nested
`describe`, `Background` inlined per Rule, `ScenarioOutline` as a distinct DSL
construct backed by the *template* Scenario + Examples table, not a flat
Pickle list) — i.e. it looks like `loadFeature` is expected to hand the DSL
something shaped like the raw `GherkinDocument`, not `Pickle[]`. If that's
right, `<placeholder>` substitution is **not** free: `loadFeature` must
either (a) also call `compile()` and correlate each `Pickle` back to its
originating `Scenario`/`Examples` row via `Pickle.astNodeIds`, or (b)
reimplement the same interpolation itself when it builds each Examples row's
step text from the raw AST's `Scenario.steps` + `Examples.tableHeader`/
`tableBody`. Either way, this is a concrete design decision `loadFeature`'s
implementation needs to make explicitly — it should not be assumed to fall
out "automatically" from parsing.

---

## Summary of conflicts to resolve before/while implementing `loadFeature`

1. **DataTable/DocString `.hashes()` (§3):** Does not exist in
   `@cucumber/gherkin`/`@cucumber/messages`. `@effect-cucumber/gherkin` must
   implement it itself.
2. **Placeholder substitution (§4):** Real, and done by `@cucumber/gherkin`'s
   `compile()` — but only on the compiled `Pickle`, never on the raw
   `GherkinDocument`/`Scenario.steps` that the spec's worked examples seem to
   walk directly. `loadFeature` needs an explicit decision: consume Pickles
   (and re-derive the Feature/Rule/Background tree structure needed for the
   DSL from `Pickle.astNodeIds`), or reimplement `interpolate()` itself
   against the raw AST.
3. **Tag inheritance (§1)** and **Background stacking (§2)** are not
   conflicts but previously-unstated mechanics `loadFeature` needs to
   replicate if it works from the raw AST rather than Pickles.
