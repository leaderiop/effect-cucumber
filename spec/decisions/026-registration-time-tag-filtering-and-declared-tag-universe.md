# ADR-EC-026: Tags emit natively, `includeTags`/`excludeTags` filter at registration time, and the tag universe must be declared in the runner config — supersedes ADR-EC-020

> **Status:** Accepted and implemented — shipped end to end in Phase 9 (RUN-05), observed against the real runner in `packages/vitest/test/emission.test.ts` and from outside the test process by `scripts/verify-tags-filter.sh`
> **Date:** 2026-08-30
> **Context:** supersedes [ADR-EC-020](020-vitest-native-tags-for-skip-only.md) after Phase 9 research falsified its central `--tagsFilter` promise by execution, and after the user deliberately extended the phase's scope to a library-level registration filter; this is a new ADR rather than a correction to ADR-EC-020, per `spec/process/requirement-id-scheme.md`'s rule that a genuinely new design question gets its own ADR

## Context

Two things forced a new decision, and both are empirical rather than preferential.

**The runner's strict-tags setting defaults to ON, and a CLI tag filter validates
against the declared tag list regardless of it.** Emitting any tag that the
runner's config does not declare fails the ENTIRE test file at collection time
with zero tests collected — not the one test that carried the tag. Separately,
a `--tagsFilter` pattern is validated against `test.tags` whether or not the
strict-tags check is enabled, so turning the check off silences the emission
side and leaves the filter side just as broken. Both facts were verified by
EXECUTION against the installed `vitest@4.1.11`, not read from documentation
(`.planning/phases/09-tags/09-RESEARCH.md`, Findings 1 and 2).

ADR-EC-020's central promise — that running one Scenario locally is a bare
`vitest --tagsFilter '@only'` choice, requiring nothing of the consumer — did
not work for any consumer. A `.feature` file's tags are written by a Feature
author who never sees the runner config, so without a mechanism to bridge the
two, ADR-EC-020's whole "run just one Scenario locally" story was unavailable.

**The user deliberately extended the scope.** ADR-EC-020 ruled out a
`describeFeature`-time registration filter and committed `excludeTags`-style
filtering to CLI filtering alone. The user chose a library-level registration
filter instead, symmetric (`includeTags` as well as `excludeTags`), as an
addition to CLI filtering rather than a replacement for it
(`.planning/phases/09-tags/09-CONTEXT.md`, D-01 through D-03).

## Decision

- **Every tag on a Scenario is emitted as a native tag on the generated test**,
  including the tags it inherits from its `Feature`, its `Rule` and its
  `Examples` block. Each keeps its literal `@` prefix exactly as written in the
  `.feature` file; there is no normalisation, no case folding and no stripping.
  Matching against a tag is exact-string and case-sensitive, which is the
  Cucumber convention.

- **`@skip` additionally emits the test as skipped.** Its body is therefore
  never invoked, which means neither its steps nor any of its hooks run — that
  is a structural property of a skipped test, not an arrangement this library
  maintains. It is also why a `@skip` Scenario containing a step that matches
  no registered definition reports as skipped rather than as undefined: the
  error is only reached at `yield*` time inside an Effect a skipped test never
  builds.

- **`@only` is never routed to the runner's only-mode.** It is a plain tag and
  nothing branches on it anywhere in the emission path. This is what makes an
  `@only` left in a committed `.feature` file unable to fail a CI run that
  forbids only-marking, which is the failure ADR-EC-020 was written to avoid
  and which this ADR keeps unchanged.

- **`includeTags` and `excludeTags` on `describeFeature`'s optional fourth
  argument filter at REGISTRATION time.** A Scenario the filter excludes never
  becomes a test and is ABSENT from the report — as distinct from a CLI filter,
  which reports non-matching tests as skipped and never removes them. The two
  mechanisms COMPOSE (registration filter first, then CLI filter over whatever
  was registered) and neither replaces the other. The syntax is a plain array
  of tag strings, never the runner's boolean tag-expression grammar, so there
  is no second grammar to keep in sync with someone else's parser. `undefined`
  and `[]` both mean NO FILTER, so a computed-empty array can never silence a
  whole suite.

- **The tag universe must be declared in the runner's config, and an
  undeclared tag degrades rather than failing the Feature.** The library
  catches the runner's rejection at the one adapter permitted to name the
  framework, re-emits the test UNTAGGED, and prints a warning naming the
  `.feature` file, the Scenario and the tag. The Scenario therefore still runs,
  but its tags do not exist for the runner, so a `--tagsFilter` naming any of
  them cannot select it — a discrepancy no test failure would ever surface,
  which is why it warns rather than staying silent. This follows
  [ADR-EC-019](019-fail-loudly-on-unmatched-or-ambiguous-steps.md)'s "dead
  code, not a broken Scenario" precedent. `gherkinTags("features/**/*.feature")`
  is the supported way to generate those declarations from a consumer's own
  `.feature` files.

- **`gherkinTags` accepts a GLOB PATTERN, or an array of patterns, resolved
  against `process.cwd()`** — the shape this phase scoped and the user
  confirmed on 2026-08-29. There is deliberately no default: the absence of one
  is what makes an implicit whole-working-directory scan structurally
  impossible. It is implemented with `tinyglobby`'s `globSync`, which makes
  `tinyglobby` the vitest package's one non-workspace runtime dependency.
  `globSync` and not the async `glob`, because a runner config is evaluated
  SYNCHRONOUSLY at load time — there is no point at which a `Promise` could be
  awaited before the config object has to exist. That is the same constraint
  that rules out reusing `@effect-cucumber/gherkin`'s own file reader, whose
  `FileSystem`-backed read suspends internally so `Effect.runSync` on it throws
  `AsyncFiberError` ([ADR-EC-021](021-effect-and-platform-are-peer-dependencies-of-gherkin.md)'s
  second Correction records that, reproduced against the real package). Two
  alternatives were rejected on facts rather than taste: the platform's own
  `fs.globSync` landed in Node 22 while `packages/vitest` declares
  `"node": ">=20"`, and a hand-written matcher would mishandle character
  classes, extglobs and brace expansion — precisely the parts of glob syntax a
  consumer is most likely to use and least likely to test. The dependency is a
  deliberate choice made with its cost in view, not an incidental one: it was
  named, with its exact version, by the user as an explicit exception to this
  phase's no-new-packages baseline.

## Consequences

**Positive**:

- ADR-EC-020's "run just one Scenario locally" story actually works, because
  `gherkinTags` closes the config-declaration gap that made it unavailable.
- A registration filter can do something a CLI filter structurally cannot:
  remove a Scenario from the report entirely. An author-side "these are not
  ready" filter therefore reads as absence rather than as a growing column of
  skipped tests nobody looks at.
- Both mechanisms remain available and compose, so nothing about adopting the
  registration filter costs a consumer the CLI one.
- `@only`'s CI-safety property from ADR-EC-020 is unchanged and is now asserted
  from outside the test process, with `allowOnly` pinned off.

**Negative**:

- A consumer with no tag declarations gets working tests with UNFILTERABLE
  tags, plus one warning per affected Scenario. Nothing fails, which is the
  point of the degradation, but it also means the only signal is terminal
  output — and the runner intercepts console output by default, so the warning
  is invisible without `--disableConsoleIntercept`.
- The vitest package now ships a third-party runtime dependency where it
  previously had only its workspace sibling, so a consumer's install graph
  grows by one small, single-purpose package. That is a real change to this
  project's dependency posture, not a rounding error, and it is recorded here
  so a later reader does not find it only in a lockfile diff.
- The `AfterAllScenarios` carve-out is a real behaviour change: a Feature whose
  Scenarios are all `@skip`-tagged or all filtered out emits no
  `AfterAllScenarios` node at all. See
  [BEH-EC-017](../behaviors/07-hook-ordering-and-guarantees.md), which states
  the carve-out and why the guarantee itself is untouched by it.
- Two grammars now describe tag selection to a consumer — this library's plain
  array and the runner's boolean expression — and they are not interchangeable.

**Trade-off accepted**: ADR-EC-020's claim that native tags closed the parked
"custom, non-reserved tags" item "at effectively no extra design cost" was
wrong, and the honest accounting is written down here rather than left implied.
The real cost is three things: a config-time tag declaration per consumer, a
degradation path with its own warning surface, and one added runtime
dependency. That cost is accepted because the alternative — a bespoke
tag-filtering mechanism, or a `--tagsFilter` story that silently does not work
— is worse in both directions.
