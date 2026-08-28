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

---

> **Correction (2026-08-28, GSD Pitfalls research, verified against
> `@cucumber/gherkin@42.0.1`'s `compile.js` source):** the claim above that
> `compile()` substitutes placeholders is **not universally true** — it has
> one specific, undocumented exception. `compileScenarioOutline` pushes a
> Scenario Outline's own `Background` steps with **empty `variableCells`**,
> so a `<placeholder>` inside a _Background_ step nested under a Scenario
> Outline is never interpolated — it stays a literal, un-interpolated string
> in every Examples row's Pickle. A step author who writes a Background step
> referencing an Outline's Examples column would see a confusing "no step
> matched `<code>`"-shaped failure that points at the wrong root cause.
>
> This is now `loadFeature`'s problem to catch, not silently pass through:
> per [ADR-EC-019](019-fail-loudly-on-unmatched-or-ambiguous-steps.md)'s
> "fail loudly" principle, `loadFeature` detects the surviving placeholder
> and fails with a specific, named error, whose wording is prescribed here and
> reproduced verbatim by `packages/gherkin/src/Validate.ts` — kept on one
> unbroken line below so it stays greppable against the implementation:
>
>> Background step text still contains an unsubstituted placeholder — this is a known `@cucumber/gherkin` limitation for Backgrounds nested under a Scenario Outline, not a bug in your Background text.
>
> That is raised rather than letting the problem
> surface as a baffling unmatched-step failure downstream. The detection
> rule this note originally prescribed — scanning every Pickle step's text
> for any leftover `<...>` token — is **superseded by the second correction
> below**, which was verified wrong in both directions and is not what
> shipped.

---

> **Correction (2026-08-28, Phase 2 implementation, verified against
> `@cucumber/gherkin@42.0.1` and pinned by
> `packages/gherkin/test/Validate.test.ts`):** the detection rule prescribed
> above — "checks every Pickle step's text for a leftover `<...>` token" — is
> the naive form. It is wrong in two directions, and neither is theoretical.
>
> **It has real false positives on valid Gherkin.** Three step texts were
> verified to survive `compile()` unchanged while being perfectly legitimate:
> `the assertion 2 < 3 holds`, `the html is <div>hello</div>`, and
> `an email <a@b.com>`. A bare `<...>` scan rejects all three, so the naive
> rule turns a correctness feature into a reason not to adopt the library.
>
> **It misses two carriers entirely.** A placeholder also survives
> un-interpolated inside a Background step's **DataTable cell values** and its
> **DocString content** under a Scenario Outline. Checking only `PickleStep.text`
> leaves both of those silent — which is the exact failure mode this correction
> exists to remove.
>
> What `packages/gherkin/src/Validate.ts` actually implements is two checks
> over one scan, and the split is what removes the false-positive class:
>
> - **The exact check.** Within a pickle correlated to a **Scenario Outline**, a
>   `<name>` whose name **is one of that Outline's own `Examples:` header
>   columns** is an error with reason `UninterpolatedPlaceholder`. It scans step
>   text, DocString content, and every DataTable cell value. It has zero false
>   positives, because writing a column name inside an Outline is proof the
>   author expected a substitution. It never runs on a plain-Scenario pickle,
>   and that single exclusion is what makes the three examples above safe: a
>   plain Scenario has no Examples columns, so it is never scanned.
> - **The heuristic check.** A `<name>` found in the same three places that is
>   **not** one of that Outline's columns is a **warning** with reason
>   `UnknownPlaceholder`, and the message names the columns that do exist —
>   the gap between what the author wrote and what the parser kept is the whole
>   finding. It catches an Examples column silently dropped upstream
>   ([cucumber/gherkin#22](https://github.com/cucumber/gherkin/issues/22), still
>   open: omitting the trailing `|` from **both** the header and the body rows
>   drops the last column with no error) and a typo'd placeholder name. It is a
>   warning rather than an error precisely because legitimate angle-bracket text
>   written inside an Outline reaches the same check.
>
> The prescribed error-message sentence quoted in the correction above is
> unchanged and is reproduced verbatim by `Validate.ts` for the Background case.
