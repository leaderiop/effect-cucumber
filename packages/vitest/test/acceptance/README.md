# Acceptance suite — the library dogfooding itself

Real `.feature` files, run through the real `describeFeature`, producing real passing `it.effect` tests. No other
`.feature` file in this repository does that: `packages/gherkin/test/fixtures/` is a parser corpus and
`packages/vitest/test/fixtures/` are tag-scanning fixtures, and neither is ever handed to a runner. The closest prior
art is [`../emission.test.ts`](../emission.test.ts), which does call `describeFeature` for real — but against an inline
source string with throwaway step bodies, which is a unit test of the emission path rather than an acceptance suite.

Each entry here is a PAIR: `<name>.feature` and `<name>.steps.test.ts`, sitting beside each other, named the same.

## This is the only directory where a `.feature` file may carry a `@REQ-EC-NNN` tag

[`../../../gherkin/test/fixtures/README.md`](../../../gherkin/test/fixtures/README.md) states the opposite rule for the
parser corpus, and that sentence stays exactly as written — the two rules are halves of the same constraint, and
`spec/scripts/verify-traceability.sh` check 4 enforces both. It greps EVERY `.feature` file in the repository for the
tag pattern, then asserts two things: that every tag it found is DEFINED in `spec/traceability.md`, and that no file
carrying one lives outside this directory. A tag added anywhere else fails `pnpm verify:spec` by file name.

The neighbouring claim — that every tag also has a real ROW in `spec/traceability.md` §5, rather than a passing
mention in that file's prose — belongs to **check 5**, not to check 4, and the distinction is the point of check 5
existing separately. Check 4's definedness half is a `grep -q` over the whole document, which an id merely mentioned
in prose satisfies; check 5 matches the §5 TABLE and nothing else. Check 5 also owns the count, the contiguity and the
one-Scenario-per-id rule. See that script's own comment above check 5 for the three failures check 4 is structurally
unable to see.

The ids are permanent. They are allocated contiguously, in the order the requirements list archived on the `planning-archive` branch writes the
requirements, and are never renumbered and never reused (AGENTS.md §6,
`spec/process/requirement-id-scheme.md`).

## The `.steps.test.ts` suffix, and why it is not `.steps.ts`

Vitest's default include glob is `**/*.{test,spec}.?(c|m)[jt]s?(x)`, and `vitest.config.ts` note (c) forbids touching
the include and exclude globs — setting either is the likeliest way to silently stop running some package's tests. A
file named `<name>.steps.ts` would therefore be collected by nothing: no error, no failing test, just a Feature that
never runs. The suffix is what makes the file exist as far as the runner is concerned.

## One deliberate deviation from the worked examples in `spec/behaviors/01`–`03`

It is a convention for this whole directory, not a one-off, and each acceptance step module restates it in its own
module doc comment so a reader comparing it to the behavior doc does not read the difference as drift. `loadFeature`
itself is the real `@effect-cucumber/vitest` wrapper (ADR-EC-024), reached the same way.

1. **`describeFeature` is imported by relative path from `../../src/describeFeature.ts`, not from the package barrel.**
   A real consumer writes `import { describeFeature } from "@effect-cucumber/vitest"`. This suite lives inside the
   package it consumes, and oxlint's `effect/no-import-from-barrel-package` runs with `checkRelativeIndexImports: true`,
   so a relative import of `index.ts` fails `pnpm lint`. The module object reached is the same one the barrel
   re-exports.

A related consequence: `loadFeature` returns a Promise and is awaited with a genuine top-level `await`. The gherkin
package's Effect underneath it cannot be `Effect.runSync`'d either: `NodeFileSystem.readFileString` suspends internally
and `runSync` over it throws `AsyncFiberError` — reproduced against the real package, not assumed.

## These `.feature` files are byte-exact and NOT formatted

`dprint.json`'s `includes` glob is `**/*.{ts,tsx,js,jsx,json,md}`. `.feature` is deliberately absent, so nothing
reformats these files and nothing will put back a character removed on purpose — the same rule, for the same reason, as
the gherkin corpus.

## Every cross-step value lives in a `Ref` obtained from a Layer-provided service

Every value one step writes for a later step in the same Scenario goes through a `Ref` on a `World`-shaped
`Context.Service` (INV-EC-006, ADR-EC-009). No `let`, no `var`, and **no module-scope mutable array, object or
counter standing in for one** — the module-scope escape hatch is closed on purpose. A module-scope holder satisfies the
letter of the no-`let` rule while defeating its entire intent, and it is additionally unable to observe per-Scenario
Layer freshness: one array is one array however many times the Layer was built. `scripts/verify-acceptance-ref-state.sh`
enforces this.

## Zero `any`

INV-EC-003's guarantee holds for step bodies free of `any`. One `any` in a step body is assignable to everything, so it
disables that guarantee for that step — inside the suite whose entire job is to prove the guarantee. Nothing here may
introduce one to make something compile. `scripts/verify-acceptance-no-any.sh` enforces it, and because that gate counts
a standalone token, an acceptance step's Gherkin text and a `.steps.test.ts` string literal must avoid the bare English
word as a standalone token too — a rule this repo has hit three times before: a grep-based
criterion that forbids a literal also forbids explaining it.

## Every pair carries its own mutation record

A passing acceptance test proves nothing on its own — a Scenario that would still pass with the behavior it claims to
cover removed from the library is traceability theater, not coverage. So every pair added here carries a numbered
mutation record in its `.steps.test.ts` module doc comment, in the format
[`../emission.test.ts`](../emission.test.ts) established: each entry names the mutation, what went RED, and — the part
that matters and the part that is easiest to omit — what stayed GREEN. Each mutation is performed, run, and then
REVERTED; nothing from one may remain in the commit.

The minimum set for a new pair is the analogue of mutations C, D and E recorded in
[`worked-example-01-apples.steps.test.ts`](./worked-example-01-apples.steps.test.ts):

- **C** — change a value in the `.feature` file without touching the `.steps.test.ts`, and watch the Scenario fail.
  That is what proves the Gherkin file's own argument reached the step body through the parser and the matcher instead
  of being hard-coded in the step.
- **D** — delete the body of the step that WRITES the cross-step state, and watch the Scenario fail. That is what proves
  the reading step reads what the writing step wrote through the `Ref`, rather than recomputing it.
- **E** — delete the pair's row from `spec/traceability.md` §5, and watch `pnpm verify:spec` fail naming the tag. That
  is what proves the traceability row is required rather than decorative.

## Assert the collected test COUNT, not the exit code

This directory's most useful measured finding, and the reason the minimum mutation set above starts at C: `pnpm test`
exiting 0 does **not** prove an acceptance pair ran. Mutation A on the first pair pointed the config's `gherkinTags`
glob at a pattern matching no file, leaving every acceptance tag undeclared — and the suite stayed green, 777 passed,
exit 0, because `describeFeature`'s undeclared-tag path (BEH-EC-008) catches the collection-time throw and re-emits each Scenario untagged
behind a warning. A renamed directory, a `.steps.ts` that should have been `.steps.test.ts`, or a Feature that emits
nothing all look identical from the outside: a smaller number nobody is watching. Assert how many tests the pair
produced.
