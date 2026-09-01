# Gherkin fixture corpus

One `.feature` file per row of `02-RESEARCH.md`'s fixture table, named for the reason it triggers so a failing test
names the defect. Every behavior recorded below was reproduced against `@cucumber/gherkin@42.0.1` and is pinned by an
executable assertion in [`../upstream-pin.test.ts`](../upstream-pin.test.ts) — an upstream bump that changes any of it
fails loudly instead of silently altering this library's semantics.

## These files are byte-exact and NOT formatted

`dprint.json`'s `includes` glob is `**/*.{ts,tsx,js,jsx,json,md}`. `.feature` is deliberately absent, so nothing
reformats these files and nothing will put back a character removed on purpose. Two fixtures depend on the exact
presence or absence of a trailing `|`:

- `warning-dropped-examples-column.feature` — the trailing `|` is missing from **both** the Examples header row and the
  body row. That keeps the cell counts consistent, so the last column is dropped in silence and `<b>` survives as
  literal step text. Restoring either pipe destroys the fixture.
- `parse-failed-inconsistent-cells.feature` — the trailing `|` is missing from the **body row only**. That makes the
  counts inconsistent and raises a loud `AstBuilderException`.

The two differ by one character and test opposite paths. A fixture for the silent drop that omits the pipe from the
body row alone tests the loud path instead and passes for entirely the wrong reason.

No fixture may carry a tag matching `@REQ-EC-NNN`. `spec/scripts/verify-traceability.sh` check 4 greps every `.feature`
file in the repository for that pattern and fails `pnpm verify:spec` twice over: when the tag is not defined in
`spec/traceability.md`, and — the half that applies to THIS directory — when the file carrying it lives anywhere other
than `packages/vitest/test/acceptance/`. A tag added here is reported by file name, whether or not it is defined.
Fixture tags use names like `@featuretag`, `@ruletag`, `@scenariotag`, `@exampletag`, `@blockone`, `@blocktwo`.

## Group A — `compile()` produces silently zero or silently wrong output

| Fixture                                          | Row | Reason tag                    | Verified upstream behavior                                                                                                                                    |
| ------------------------------------------------ | --- | ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `empty-examples-no-header.feature`               | F1  | `EmptyExamples`               | `Examples:` with no header and no rows: 0 pickles, no error, the AST node is orphaned                                                                         |
| `empty-examples-header-only.feature`             | F2  | `EmptyExamples`               | `Examples:` with a header and no body rows: 0 pickles, no error                                                                                               |
| `outline-without-examples.feature`               | F3  | `OutlineWithoutExamples`      | No `Examples:` at all: 1 pickle whose step text stays the literal `a <x>`                                                                                     |
| `scenario-keyword-with-examples.feature`         | F4  | `ScenarioKeywordWithExamples` | Plain `Scenario:` + `Examples:`: 2 pickles — `compile()` branches on `examples.length`                                                                        |
| `zero-step-scenario.feature`                     | F5  | `ZeroStepScenario`            | The zero-step pickle has `steps: []`; its feature Background steps are dropped too                                                                            |
| `zero-step-scenario-in-rule.feature`             | F6  | `ZeroStepScenario`            | Same inside a `Rule:` — the Rule Background is dropped as well                                                                                                |
| `uninterpolated-placeholder-background.feature`  | F7  | `UninterpolatedPlaceholder`   | Background step text stays `a <name>` while the Scenario step interpolates to `I use alice`                                                                   |
| `uninterpolated-placeholder-in-argument.feature` | F8  | `UninterpolatedPlaceholder`   | The Background DataTable cell and DocString keep `<x>`; the Scenario's own cell becomes `1`                                                                   |
| `no-feature.feature`                             | F12 | `NoFeature`                   | Comment-only file parses fine; `document.feature` is `undefined` (not `null`); 0 pickles                                                                      |
| `duplicate-scenario-name.feature`                | F22 | `DuplicateScenarioName`       | Legal Gherkin: 2 pickles, identical `name`, distinct `astNodeIds[0]`                                                                                          |
| `duplicate-scenario-name-across-rules.feature`   | F22 | none — negative control       | Two `Rule:` scopes may each hold a `Scenario: happy path`; this file must stay legal                                                                          |
| `empty-examples-among-multiple-blocks.feature`   | F28 | `EmptyExamples`               | One Outline, two Examples: blocks — block 1 has a row, block 2 is header-only: 1 pickle, block 2 contributes nothing, in silence, same as F1/F2 but per-block |

## Group B — parse-time throws that must be wrapped, not leaked

Every one of these arrives as a `CompositeParserException`; the concrete class lives on `.errors[0]`, and `.location` on
the composite itself is `undefined`.

| Fixture                                        | Row | Reason tag       | Verified upstream behavior                                                                                                                |
| ---------------------------------------------- | --- | ---------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| `parse-failed-misplaced-tag.feature`           | F17 | `ParseFailed`    | A `@tag` before `Background:` collects 3 cascading errors for one bad line; first at (4:3)                                                |
| `unknown-dialect.feature`                      | F18 | `UnknownDialect` | Wraps exactly one `NoSuchLanguageException` at (1:1): `Language not supported: xx`                                                        |
| `unknown-dialect-proto.feature`                | F18 | `UnknownDialect` | `# language: constructor` reads through to `Object.prototype` upstream and dies with a `TypeError`; rejected here before upstream sees it |
| `parse-failed-inconsistent-cells.feature`      | F10 | `ParseFailed`    | Wraps an `AstBuilderException`: `inconsistent cell count within the table` at (8:7)                                                       |
| `parse-failed-typo-keyword-after-step.feature` | F15 | `ParseFailed`    | `Ginve x` written after a valid `Given y` is a loud error at (5:5) — position-dependent                                                   |
| `parse-failed-background-after-rule.feature`   | F20 | `ParseFailed`    | Wraps `UnexpectedTokenException` at (8:3); the grammar forbids a Background after a `Rule:`                                               |

`UnexpectedTokenException` is **not** a member of the `Errors` namespace that `@cucumber/gherkin@42.0.1` exports —
`Errors` holds only `AstBuilderException`, `CompositeParserException`, `GherkinException`, `NoSuchLanguageException`
and `ParserException`. The pin test therefore discriminates it via `instanceof Errors.GherkinException` plus its
constructor name, never via `err.name` (which is `"Error"` on every one of these classes).

## Group C — silently wrong, but detection is heuristic, so these become warnings

| Fixture                                     | Row | Verified upstream behavior                                                                                                      |
| ------------------------------------------- | --- | ------------------------------------------------------------------------------------------------------------------------------- |
| `warning-dropped-examples-column.feature`   | F9  | Trailing pipe missing from both rows: header cells `["a"]`, body `["1"]`, no error, step text `1 and <b>` (cucumber/gherkin#22) |
| `warning-duplicate-examples-column.feature` | F11 | Header `\| a \| a \|`: the first column wins for both occurrences, giving `1 twice 1` (cucumber/gherkin#28)                     |
| `warning-empty-rule.feature`                | F13 | A `Rule:` with no scenarios contributes 0 pickles, in silence                                                                   |
| `warning-swallowed-step.feature`            | F14 | `Ginve x` written before a valid step is swallowed into `scenario.description`; 1 AST step, 1 pickle step, no error             |
| `description-plain.feature`                 | F14 | Ordinary prose descriptions on a Background and a Scenario; the swallowed-step heuristic must stay silent                       |

## Group D — correctness fixtures, no error expected

| Fixture                               | Row | Verified upstream behavior                                                                                                           |
| ------------------------------------- | --- | ------------------------------------------------------------------------------------------------------------------------------------ |
| `correlation-full.feature`            | F21 | Tags flatten to `["@featuretag", "@ruletag", "@scenariotag", "@exampletag"]`; steps run feature-bg, rule-bg, then the Scenario's own |
| `dialect-fr.feature`                  | F19 | `feature.language === "fr"`, keyword `Fonctionnalité`, step keyword `"Etant donné que "` with a trailing space                       |
| `id-collision-a.feature`              | F23 | Parsed alongside `id-collision-b.feature` with separate `IdGenerator.uuid()` generators, node ids never overlap                      |
| `id-collision-b.feature`              | F23 | The other half of the D3 regression pin; `IdGenerator.incrementing()` would collide here                                             |
| `outline-two-examples-blocks.feature` | F24 | 3 pickles from 2 blocks; `@blockone` lands only on that block's 2 rows; all 3 share `astNodeIds[0]`                                  |
| `outline-distinct-row-names.feature`  | F26 | Pickle names `outline a` / `outline b` differ from the un-interpolated AST name `outline <name>`                                     |
| `outline-identical-row-names.feature` | F27 | 3 pickles with identical `name` and distinct `location.line` (8, 9, 10)                                                              |
| `docstring-and-datatable.feature`     | F25 | One step carries both, with `argumentIndex` 1 (DocString) and 2 (DataTable) recording source order                                   |

## Group E — DataTable and DocString argument shapes (PARSE-04)

| Fixture                              | Row | Reason tag           | Verified upstream behavior                                                                                                                                |
| ------------------------------------ | --- | -------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `datatable-single-column.feature`    | F29 | none — shape fixture | 1 pickle; `dataTable.rows` has length 2 and every row exactly 1 cell; the `argumentIndex` KEY IS PRESENT and its VALUE is `undefined` — one argument only |
| `datatable-header-only.feature`      | F30 | none — shape fixture | A header row with no body rows parses cleanly; `dataTable.rows` has length 1; `argumentIndex` key present, value `undefined`                              |
| `datatable-two-column.feature`       | F31 | none — shape fixture | The `rowsHash()` shape, key column then value column: `rows` has length 2, every row 2 cells; `argumentIndex` key present, value `undefined`              |
| `datatable-duplicate-header.feature` | F32 | none — shape fixture | Legal Gherkin — the parser does NOT object to a repeated header cell; header cells are `["name", "name"]`, body row `["alice", "bob"]`                    |
| `datatable-before-docstring.feature` | F33 | none — shape fixture | One step carries both, with `argumentIndex` 2 (DocString) and 1 (DataTable) — the exact inverse of F25, proving the index records source order            |

`compile()` assigns a NUMBER to `argumentIndex` only when a step carries both arguments. When a step carries just a
DocString or just a DataTable, `compile()` still writes the `argumentIndex` key — it passes `undefined` into the
unconditional `pickleDocString()` / `pickleTable()` object literals — so the KEY IS ALWAYS PRESENT and only its VALUE is
`undefined`. An ordering rule must therefore read the VALUE and supply a fallback for `undefined`; it must never branch
on `"argumentIndex" in argument` or `Object.hasOwn(...)`, which is `true` in every case and would therefore discriminate
nothing. F29/F30/F31 are the fixtures that make a missing `undefined`-value fallback fail.

## `first-error-document-order.feature` has no F-row, on purpose

Every other fixture in this corpus pins one distinct fact about `@cucumber/gherkin@42.0.1`'s own
behavior. This one doesn't — it combines two ALREADY-pinned facts (F7's Background-placeholder
survival and F5's zero-step pickle) into a single file, purely to exercise `validateFeature`'s own
cross-check ordering: an `UninterpolatedPlaceholder` on an earlier line must outrank a
`ZeroStepScenario` on a later line. There is nothing new here for `upstream-pin.test.ts` to pin —
only `Validate.test.ts` reads this fixture.

## Row F16 has no fixture file, on purpose

F16 is the missing-file case. It is exercised by handing `loadFeature` a path that does not exist and asserting the
resulting `ENOENT` is wrapped as reason `MissingFile`. A file on disk would defeat the point.
