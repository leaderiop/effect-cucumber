# 04 — `loadFeature` parse and validation

The failure surface of `@effect-cucumber/gherkin`. [BEH-EC-001](./01-steps-and-world.md)
specifies that a `.feature` file is parsed into data by `loadFeature`; this file specifies
what happens when that parse produces something the author did not write.

See [`spec/roadmap.md`](../roadmap.md) for what is built versus what is only specified —
this document describes the contract, not the build status.

---

## BEH-EC-014: `loadFeature` fails loudly on every silent-failure mode of `compile()`

> **See:** [ADR-EC-014](../decisions/014-loadfeature-consumes-gherkindocument-and-pickles.md), [ADR-EC-019](../decisions/019-fail-loudly-on-unmatched-or-ambiguous-steps.md)

`@cucumber/gherkin`'s `compile()` does the right thing for its own purpose — producing
runnable pickles — and the wrong thing for a library whose job is telling an author their
feature file is broken. Several shapes compile happily into something the author did not
write, or into nothing at all, with no error at any layer. Each one is a test that passes
while asserting nothing.

```
REQUIREMENT: loadFeature MUST reject, with a distinct named error identifying
             the file and the line, every case where @cucumber/gherkin's
             compile() produces a silently zero or silently wrong result. Each
             case MUST carry its own reason tag on the thrown LoadFeatureError,
             drawn from exactly this set:

               MissingFile                 — the path could not be read
               ParseFailed                 — the source is not valid Gherkin
               UnknownDialect              — the `# language:` header names a
                                             dialect that does not exist
               NoFeature                   — the document declares no Feature:
               OutlineWithoutExamples      — an Outline keyword with no
                                             Examples: block, which compiles to
                                             one scenario whose step text keeps
                                             its literal <placeholders>
               EmptyExamples               — an Outline whose Examples: block(s)
                                             compiled to zero scenarios
               ZeroStepScenario            — a scenario with no steps, which
                                             drops the Background steps in scope
                                             along with it and then passes
               UninterpolatedPlaceholder   — a <token> naming one of this
                                             Outline's own Examples columns
                                             survived substitution
               ScenarioKeywordWithExamples — a plain scenario keyword carrying
                                             an Examples: table, which silently
                                             compiles as an Outline
               DuplicateScenarioName       — two scenarios share one
                                             un-interpolated name in one scope

             A consumer MUST discriminate on the reason tag. Message text is
             written for a human reading a failed test run and is NOT a stable
             interface — it MUST NOT be pattern-matched.
```

Four further findings are real defects with verified silent-failure paths, but each
detector admits an innocent reading: `<div>hello</div>` inside an Outline is legal step
text, a description is legal Gherkin, and an empty `Rule:` may be a heading an author is
about to fill in. Rejecting those would refuse legitimate feature files; staying silent
would let a dropped Examples column ship unnoticed.

```
REQUIREMENT: A heuristically-detected finding MUST be carried as a non-throwing
             warning on ParsedFeature.warnings, with its own reason tag, and it
             MUST NOT reject the feature file. The tags are:

               UnknownPlaceholder      — a surviving <token> that is NOT one of
                                         this Outline's Examples columns; the
                                         signature of a column the parser
                                         silently dropped
               DuplicateExamplesColumn — one Examples: header names the same
                                         column twice, and the first occurrence
                                         wins for both
               EmptyRule               — a Rule: containing no scenarios, which
                                         compiles to nothing in silence
               SuspectedSwallowedStep  — a block carrying a description, which
                                         is where a step keyword misspelled
                                         before any valid step is absorbed

             ParsedFeature.warnings is always an array and is usually empty.
             Warnings are data: loadFeature does not print, log, or throw them.
```

### Two decisions a reader will otherwise ask about

**Duplicate scenario names are rejected per scope, not per Feature.** A scope is either
feature level or the inside of one `Rule:`, so two different `Rule:` blocks may each
legitimately contain a `Scenario: happy path`. Whole-Feature uniqueness was considered and
rejected as too strict. The name compared is the un-interpolated AST name, never a
compiled one — an Outline's rows legitimately produce repeating interpolated names from a
single node, and comparing those would report a collision on any Outline with repeating
rows.

**Error and warning messages reproduce content in full and are never truncated.** When a
message quotes a DataTable cell value, a DocString body, or a block description, it quotes
the whole thing — no ellipsis, no length cap, no slice. The accepted tradeoff is stated
plainly rather than left to be discovered: a feature file containing fixture credentials
will reproduce those credentials in error output that may reach a publicly readable CI
log. Usefulness was chosen over redaction, because `loadFeature` is called at module top
level and a throw surfaces as a collection error for the whole test file — the one message
the author sees has to be enough on its own.

### Signatures

```ts
export const loadFeature: (path: string) => ParsedFeature
export const parseFeature: (source: string, uri: string) => ParsedFeature
```

`parseFeature` is the same pipeline without the filesystem read, for text already in hand —
a Vite `.feature?raw` import, or an inline template literal. `uri` is supplied by the
caller because a string parse has no other source for it, and it is what every error and
warning message names.

### Worked example

```typescript
import { loadFeature, LoadFeatureError, type ParsedFeature } from "@effect-cucumber/gherkin"

const explain = (err: LoadFeatureError): string => {
  switch (err.reason) {
    case "MissingFile":
      return `${err.uri} could not be read.`
    case "OutlineWithoutExamples":
    case "EmptyExamples":
      return `${err.uri}:${err.line ?? 0} — the Outline needs an Examples: table with a body row.`
    case "UninterpolatedPlaceholder":
      return `${err.uri}:${err.line ?? 0} — a placeholder survived substitution.`
    default:
      // Every other reason is already self-describing; the tag is the discriminator,
      // never the message text.
      return `${err.reason}: ${err.message}`
  }
}

const load = (path: string): ParsedFeature => {
  try {
    const feature = loadFeature(path)
    for (const warning of feature.warnings) {
      console.warn(`${warning.reason}: ${warning.message}`)
    }
    return feature
  } catch (error) {
    if (error instanceof LoadFeatureError) {
      throw new Error(explain(error), { cause: error })
    }
    throw error
  }
}
```

---

_Previous: [03 — Rules, Scenario Outlines, and TestClock](./03-rules-outlines-and-testclock.md)_
