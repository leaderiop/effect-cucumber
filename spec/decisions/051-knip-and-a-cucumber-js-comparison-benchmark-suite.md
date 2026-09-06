# ADR-EC-051: `knip` for monorepo-wide dead-export detection, and a black-box wall-clock benchmark suite comparing this library against the real `@cucumber/cucumber` package

> **Status:** Accepted
> **Date:** 2026-09-06
> **Context:** two independent additions bundled under one ADR because they share a Definitions-of-Done
> slot (tooling that improves confidence in the codebase without touching runtime behavior) and were
> planned and delivered together

## Context

**Dead-export detection.** This repository has no tool that finds an exported binding nothing imports.
`madge --circular` (ADR-EC-044's neighbor, wired as `pnpm circular`) finds import cycles, not dead
exports, and nothing else in `pnpm lint`'s pipeline (`oxlint`, `dprint check`) looks at cross-file
usage at all. A public export that stops being referenced — from either package's own `src/index.ts`
outward, or from `benchmarks/`'s own two entry scripts — currently has no mechanism that would ever
flag it.

**A real comparison against `@cucumber/cucumber`.** This project has never measured itself against the
tool it is most often compared to in conversation. Doing that honestly runs into two real
obstacles, both worth stating precisely because a naive attempt gets both wrong:

1. **The naming trap.** The real npm package is `@cucumber/cucumber`. "cucumber-js" is only its
   colloquial/GitHub name — no npm package literally named `cucumber-js` exists. A benchmark that
   tried to `pnpm add cucumber-js` would either fail outright or, worse, silently install an
   unrelated or abandoned package of that name. `@cucumber/cucumber` is the only correct dependency,
   confirmed via `pnpm info @cucumber/cucumber version` rather than assumed, and it was not previously
   present anywhere in this repository's dependency tree.
2. **No standalone CLI on this side.** `@effect-cucumber/vitest` has no equivalent of `cucumber-js
   features/`: a Scenario only exists as a real `it.effect`, collected and run by a real `vitest run`.
   There is no boundary inside this library's own code that corresponds to "run the Scenarios and
   nothing else" the way cucumber-js's CLI entry point does. Instrumenting sub-process-internal
   timers on the effect-cucumber side (e.g., wrapping `describeFeature`'s own execution) would time
   something structurally different from whatever a symmetric instrumentation point on the
   cucumber-js side would measure, and the two numbers would not be comparable even if both were
   individually accurate. The only measurement that times the same thing on both sides is external,
   whole-process wall-clock timing: spawn `vitest run <fixture>` on one side and `node
   .../cucumber.js <fixture>` on the other, as real child processes, timed from outside by the
   harness — never by trusting either tool's own self-reported duration.

A related, narrower constraint shaped the benchmark's fixture design.
`packages/vitest/test/acceptance/README.md` states that `@REQ-EC-NNN` tags are permitted in exactly
one directory (`packages/vitest/test/acceptance/`), enforced by
`spec/scripts/verify-traceability.sh` check 4, which greps every `.feature` file in the repository. A
benchmark wanting real, non-trivial coverage (custom parameter types, `DataTable`, `DocString`,
Backgrounds, tag inheritance, Outlines) could either hand-author a second such fixture from scratch or
reuse an existing one. Copying `parsing-and-matching.feature`'s content into `benchmarks/` would carry
its `@REQ-EC-NNN` tags into a second directory and fail that check by file name. Reusing it by its
real, on-disk path — never copying its text — sidesteps the constraint entirely rather than working
around it.

## Decision

**knip.** Added as a root `devDependency`, driven by `knip.jsonc` at the repo root. Its `workspaces`
key configures each publishable package (`packages/*`) with `entry: ["src/index.ts"]` — the one file
each package's real `exports["."]` (`packages/gherkin/package.json`, `packages/vitest/package.json`)
actually points at — and `project: ["src/**/*.ts"]`, plus a `benchmarks` workspace entry with the two
real scripts a human or CI ever invokes directly (`src/compare.ts`, `src/report.ts`) as its entries.
`knip` runs as `"lint:knip": "knip"`, and `pnpm lint` becomes `"oxlint -f unix && dprint check && pnpm
run lint:knip"` — knip is the last step, so a knip finding fails the build only after the cheaper,
faster checks have already passed. **This makes knip part of `pnpm lint`, which is CI-gating**: unlike
a timing number, a dead export is a deterministic property of the code as committed, not a function of
the machine that happened to run the check, so gating on it introduces no flakiness.

**The benchmark suite.** Lives entirely under a new `benchmarks/` directory, added to
`pnpm-workspace.yaml`'s `packages:` list as its own, private (`"private": true`), unpublished pnpm
workspace member — never added to `packages/gherkin` or `packages/vitest`'s manifests, and never
referenced by root `tsconfig.json`'s `references` array (it is checked standalone via `pnpm --filter
benchmarks check`). It depends on `@cucumber/cucumber` (the real package; version confirmed via `pnpm
info`, never guessed) as a `devDependency`, alongside `tsx` (for running `.ts` step files directly),
and both `@effect-cucumber/gherkin`/`@effect-cucumber/vitest` as `workspace:^` — a real consumer of
both published packages, exercising their real `exports["."]` surface rather than a relative import
into their `src/`.

Two suites ship, plus one generated one:

- **`counter`** — a fresh, minimal fixture authored for this suite alone (create, create-twice
  rejected, increment, decrement, a max-bound rejection, a min-bound rejection). Deliberately not a
  reuse of any existing acceptance fixture: every one of those pulls in effect-cucumber-specific
  machinery (shared `World` services via `Context.Service`, `ParameterTypeStore`) with no cucumber-js
  equivalent, which would make a "minimal overhead" baseline measure something other than minimal
  overhead.
- **`kitchen-sink`** — the real `packages/vitest/test/acceptance/parsing-and-matching.feature`, loaded
  by its real relative path from both `cucumber/kitchen-sink.steps.ts` and
  `effect-cucumber/kitchen-sink.steps.ts`, never copied — resolving the naming/tagging constraint
  above by construction. Both sides implement matching step definitions for that file's exact step
  texts, including a `{fruit}` custom parameter type (the same underlying
  `@cucumber/cucumber-expressions` library backs both `@cucumber/cucumber` and
  `@effect-cucumber/gherkin`) using the exact banana/apple/fig weight map
  `parsing-and-matching.steps.test.ts` already declares.
  - **One deliberate, documented asymmetry**: "both loaded features resolve the custom parameter type
    against different registries" checks a property genuinely internal to this library's own
    per-Feature-load `ParameterTypeRegistry` isolation (ADR-EC-023) — cucumber-js has no per-load
    registry concept at all to check, keeping exactly one process-wide registry always. Its
    cucumber-js counterpart is a no-op passing assertion, documented in `benchmarks/README.md`'s
    methodology section. This does not compromise wall-clock fairness: both sides still execute the
    identical number of steps regardless, and the step's own body does no metered work on either
    side — the real cost of `loadFeature` already happened at module load.
- **`pressure`** (generated, not committed) — `src/generatedSuites.ts` writes a Scenario Outline with
  a configurable number of Examples rows entirely over `counter.feature`'s existing step vocabulary,
  for a scale-sensitive run past both tools' fixed per-process startup cost.

Measurement is real child-process spawning (`node:child_process.spawn` in `src/process.ts`), timed
externally with `performance.now()` from immediately before spawn to the process's `close` event.
Each side's own JSON output (`vitest --reporter=json`, `@cucumber/cucumber --format json:<file>`) is
parsed only to confirm pass/fail counts — never trusted for the timing number itself.

**Gating posture, stated precisely.** `knip` is gating (part of `pnpm lint`). The benchmark's TIMING
is explicitly **not** CI-gating — nothing in this repository's CI asserts a specific duration,
percentage, or scenarios/sec figure, and `src/report.ts` actively declines to print a percent-delta
headline at all when either runner's measured stability (`src/statistics.ts`'s `measurementStability`)
is `"low"` (fewer than 5 kept iterations, or a coefficient of variation over `0.2`), rather than
silently printing a number nobody should trust.

## Consequences

**Positive**:

- A real, running answer to "how does this compare to cucumber-js", reproducible by anyone with
  `pnpm --filter benchmarks bench:compare`, instead of an unverifiable claim.
- `knip` closes a real gap: dead-export detection existed nowhere in this repository before this
  change.
- The reuse-by-path decision for `kitchen-sink` means the benchmark suite exercises real,
  already-audited step texts (custom parameter types, `DataTable`, `DocString`, Background/tag
  inheritance, Outlines) with zero duplication and zero risk of the copy drifting from the original.

**Negative / deliberate simplifications**:

- **Single execution mode, no phase-level instrumentation.** The suite measures one number per run:
  whole-process wall time. It does not break down parse time vs. collection time vs. execution time
  on either side, the way a more elaborate benchmark harness (or effect-bdd's own benchmark suite,
  whose structure this one is modeled on) might. Accepted because this library has no internal
  boundary that would make such a breakdown symmetric with anything on the cucumber-js side (the
  entire reason black-box timing was chosen over sub-process instrumentation in the first place) —
  a finer-grained breakdown on one side only would not be a fairer comparison, just a more detailed
  unfair one.
- **Small suites are dominated by fixed per-process startup cost**, not by anything
  Scenario-count-proportional — documented in `benchmarks/README.md` rather than hidden, and the
  reason the generated `pressure` suite exists.
- **The one documented step asymmetry** in `kitchen-sink` (above) means that suite's two sides are not
  byte-for-byte identical in what they assert, though they are identical in step count and pass/fail
  outcome, which is what wall-clock fairness actually requires.

## Follow-up

None identified. A future addition of a third runner (should one ever exist) would extend
`RunnerId`/`SuiteDefinition` rather than requiring a redesign — `src/runners.ts` already isolates
runner-specific spawning behind one function per runner.
