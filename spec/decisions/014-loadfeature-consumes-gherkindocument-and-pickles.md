# ADR-EC-014: `loadFeature` consumes both the raw `GherkinDocument` and compiled Pickles

> **Status:** Accepted
> **Date:** 2026-08-28
> **Context:** resolves [research ticket #2](https://github.com/leaderiop/effect-cucumber/issues/2)

## Context

`@cucumber/gherkin@42.0.1`'s `Parser.parse(source)` and its separately-exported
`compile(gherkinDocument, uri, newId)` function do different, complementary
things — verified against the real installed package
([`research/gherkin-parsed-shape.md`](https://github.com/leaderiop/effect-cucumber/blob/research/gherkin-parsed-shape/research/gherkin-parsed-shape.md)):

- `Parser.parse()` produces a `GherkinDocument` — the structural tree
  (`Feature` → `Feature.children` → `Rule`/`Background`/`Scenario`, `Rule` →
  `Rule.children` → `Background`/`Scenario`) this library's DSL needs to build
  its `describe`/nested-`describe` hierarchy and to know which `Rule` (if any)
  a Scenario belongs to (for Layer scoping, per
  [ADR-EC-010](010-rule-and-scenario-scoped-extra-layers.md)). It does
  **not** substitute `Scenario Outline` placeholders, does **not** flatten
  tag inheritance (Feature/Rule/Examples tags stay separate from a
  Scenario's own), and does **not** compose a Rule's own `Background` with
  its Feature's `Background`.
- `compile()` produces `Pickle[]` — one per Scenario (or per Examples row for
  a Scenario Outline) — with `<placeholder>` tokens already substituted into
  step text, tags already flattened into one inherited list
  (`Pickle.tags`), and Background steps (Feature-level, then Rule-level if
  applicable) already stacked ahead of the Scenario's own steps, in the
  literal order they run. Each `Pickle` carries `astNodeIds` correlating it
  back to the `GherkinDocument` node(s) it was compiled from.

`spec/glossary.md` and `spec/behaviors/03-rules-outlines-and-testclock.md`
previously attributed placeholder substitution to "the Gherkin parser"
generically, conflating these two distinct functions. The practical
consequence — that step patterns like `{int}`/`{float}` already receive a
substituted, typed value with no extra work — still holds, but only because
of this decision, not automatically.

## Decision

`@effect-cucumber/gherkin`'s `loadFeature` calls both `Parser.parse()` and
`compile()`. It walks the `GherkinDocument` to build the Feature/Rule/
Background/Scenario tree the DSL needs, and for each Scenario (or each
Examples row of a Scenario Outline) it attaches that node's correlated
`Pickle` — found via `Pickle.astNodeIds` — as the source of truth for:

- the actual, already-placeholder-substituted step text to match against
  registered `Given`/`When`/`Then` patterns,
- the effective (already-inherited) tag list, for `@skip`/`@only` routing
  (BEH-EC-008), and
- the already-composed, already-ordered step list including Background
  steps — so the runner does not need its own Background/Rule-Background
  stacking logic (ADR-EC-004's "inlined as the first `yield*`s" requirement
  is satisfied by iterating the Pickle's step list in order, not by
  separately concatenating a Background step list at runtime).

`loadFeature` does **not** reimplement `interpolate()`, tag inheritance, or
Background stacking itself — all three come from `compile()` for free once
this correlation is in place.

## Consequences

**Positive**:

- One correlation step (`Pickle.astNodeIds` ↔ `GherkinDocument` node id) buys
  correct placeholder substitution, tag inheritance, and Background stacking
  simultaneously — three of the four findings in research ticket #2 resolve
  through this single decision, not three separate reimplementations.
- Matches how `@cucumber/gherkin` is actually meant to be used (this is the
  same parse-then-compile shape `cucumber-js` itself uses) rather than
  fighting the package's own design by trying to work from the raw AST
  alone.

**Negative**:

- `loadFeature`'s output is neither a bare `GherkinDocument` nor a bare
  `Pickle[]` — it's a synthesized structure this library owns, which is more
  implementation work than consuming either upstream shape directly would
  have been.
- A step's DSL registration (`Given`/`When`/`Then` inside `Background`/
  `Scenario`/`Rule`/`ScenarioOutline`) still has no relationship to which
  Pickle step it matches beyond text pattern matching — this decision doesn't
  change that steps are matched by text, not by any structural identity with
  the AST node that authored the pattern.

**Trade-off accepted**: the extra correlation logic in `loadFeature` is a
one-time cost, paid so `@effect-cucumber/vitest`'s runner (and every step
author) never has to think about placeholder substitution, tag inheritance,
or Background stacking as separate concerns — they're already resolved by
the time a Scenario's step list reaches the runner.

## Related corrections

This decision's practical upshot (substitution/tags/Background composition
are real, and already resolved by the time `loadFeature` hands data to the
DSL) is what `spec/glossary.md`'s "Scenario Outline" entry and
`spec/behaviors/03-rules-outlines-and-testclock.md` already claimed
informally — those documents are corrected to attribute the mechanism
accurately (to this decision, not "the Gherkin parser" as an undifferentiated
whole) rather than to restate a different conclusion.
