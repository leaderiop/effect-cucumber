# Benchmarks — effect-cucumber vs. cucumber-js

A black-box wall-clock benchmark suite comparing this library against the real `@cucumber/cucumber`
npm package (ADR-EC-051). Private, unpublished, its own pnpm workspace member — never touches
`packages/gherkin` or `packages/vitest`'s manifests, and never gates CI on a timing number.

**Naming trap**: the real npm package is `@cucumber/cucumber`. "cucumber-js" is only its
colloquial/GitHub name — no npm package literally named `cucumber-js` exists, and this suite does
not depend on one.

## Methodology

This library is vitest-native and ships no standalone CLI — a Scenario only ever exists as a real
`it.effect` inside a real `vitest run`. There is therefore no fair way to time "just the library"
in isolation on this side: any in-process instrumentation would time vitest's collection and
reporting machinery along with it, and cucumber-js has no equivalent boundary to instrument
symmetrically. The only comparison that measures the same thing on both sides is **black-box,
whole-process wall-clock timing**:

- **What is measured**: `node .../vitest run <fixture>` on one side, `node .../cucumber.js
  <feature>` on the other, each spawned as a real child process (`node:child_process.spawn` in
  `src/process.ts`) and timed externally with `performance.now()` from immediately before spawn to
  the process's `close` event.
- **What is NOT measured**: nothing sub-process-internal. Neither runner's own self-reported
  timing is trusted for the comparison itself — each side's JSON output (`vitest --reporter=json`,
  `cucumber.js --format json:<file>`) is parsed only for pass/fail counts, to confirm the run
  actually did what it claims before its wall-clock time is kept.
- **Why this is fair, and what it costs**: both numbers include process startup, module
  resolution, and (for effect-cucumber) vitest's own collection and reporting overhead — overhead
  a real consumer of either tool pays on every `vitest run` / `cucumber-js` invocation, not an
  artifact of the harness. It also means small suites are dominated by each tool's own fixed
  startup cost rather than by anything Scenario-count-proportional; the "pressure" suite (see
  below) exists specifically to see past that.

### Suites

- **`counter`** — a fresh, minimal fixture (`fixtures/counter.feature`): create, create-twice
  (rejected), increment, decrement, a max-bound rejection, a min-bound rejection. No existing
  acceptance fixture is this small, and reusing one would pull in effect-cucumber-specific
  machinery (shared World services, `ParameterTypeStore`) with no cucumber-js equivalent — which
  would defeat the point of a minimal-overhead baseline both runners implement from scratch. No
  tags, so `vitest.tags.ts`'s declared tag universe needs no change.
- **`kitchen-sink`** — the REAL `packages/vitest/test/acceptance/parsing-and-matching.feature`,
  reused by its real path, never copied. Copying it would carry its `@REQ-EC-NNN` tags outside
  `packages/vitest/test/acceptance/`, the one directory `spec/scripts/verify-traceability.sh` check
  4 permits them in. Both `cucumber/kitchen-sink.steps.ts` and
  `effect-cucumber/kitchen-sink.steps.ts` implement matching step definitions for that file's exact
  step texts, including a `{fruit}` custom parameter type on both sides (the same underlying
  `@cucumber/cucumber-expressions` library) using the same banana/apple/fig weight map
  `packages/vitest/test/acceptance/parsing-and-matching.steps.test.ts` declares.
  - **One deliberate, documented asymmetry**: "both loaded features resolve the custom parameter
    type against different registries" asserts that two separate `loadFeature` calls build two
    distinct `ParameterTypeRegistry` instances — a real property of this library's own
    per-Feature-load isolation (ADR-EC-023), with no cucumber-js equivalent to check at all
    (cucumber-js keeps exactly one process-wide parameter type registry, always). Its cucumber-js
    counterpart in `cucumber/kitchen-sink.steps.ts` is a no-op passing assertion. This does not
    affect wall-clock fairness: both sides still execute the same number of steps either way, and
    the step's own body does no meaningful work on the effect-cucumber side either — the real cost
    of `loadFeature` already happened at module load, before any Scenario runs.
- **`pressure`** (generated) — `src/generatedSuites.ts` writes `generated/pressure-counter.feature`
  as a Scenario Outline with `--pressure-scenarios` (default 200) generated Examples rows, entirely
  over `counter.feature`'s own step vocabulary. No new step definitions are needed on either side;
  `effect-cucumber/counter.steps.ts` reads an `EFFECT_CUCUMBER_BENCH_FEATURE_PATH` environment
  variable (set by `src/runners.ts`) to load the generated file instead of its own default fixture.

### What's gating and what isn't

`knip` (ADR-EC-051, dead-export detection) IS gating: it runs as the final step of `pnpm lint`
(`lint:knip`), which IS part of this repository's CI-gating checks — it is a deterministic
dead-code scan, not a perf number, so it never flakes for reasons outside a real code change.

This benchmark suite's TIMING is explicitly **NOT** CI-gating. A wall-clock number is a function of
the machine it ran on, competing load, and thermal throttling — asserting a specific percentage or
absolute duration in CI would be a flaky test wearing a benchmark's clothes. `src/report.ts` goes
further than merely not asserting: `renderMarkdown`/`renderHtml` withhold the percent-delta line
entirely and print a "do not publish a speed claim from this run" guard whenever either runner's
measured `Stability` (`src/statistics.ts`) is `"low"` — fewer than 5 kept iterations, or a
coefficient of variation over `0.2`.

## Running it

Always via `pnpm --filter benchmarks <script>` — there are no root-level `bench:*` aliases, on
purpose, so the isolation from the two published packages stays real.

```sh
pnpm --filter benchmarks check         # tsc -p tsconfig.json --noEmit
pnpm --filter benchmarks bench:smoke   # 1 suite, 0 warmups, 1 iteration — fast sanity check
pnpm --filter benchmarks bench:compare # every suite, 1 warmup + 5 iterations each
pnpm --filter benchmarks bench:pressure # every suite, 1 warmup + 1 iteration, pressure at 200 scenarios
```

Each `bench:*` script runs `src/compare.ts` (writes `results/latest.json`) followed by
`src/report.ts` (reads it, writes `results/latest.md` and `results/latest.html`). Both
`results/` and `generated/` are gitignored except for their own `.gitignore` marker — nothing this
suite produces is meant to be committed.

## Layout

```
benchmarks/
  fixtures/counter.feature          # the fresh minimal fixture
  cucumber/                         # @cucumber/cucumber step defs + World
  effect-cucumber/                  # describeFeature-based step defs (*.steps.ts, not *.steps.test.ts)
  generated/                        # generateScaledCounterFeature's output (gitignored)
  results/                          # latest.json / latest.md / latest.html (gitignored)
  src/
    types.ts          # shared shapes
    paths.ts           # import.meta.url-derived path helpers
    process.ts          # real child-process spawning, timed externally
    runners.ts          # runEffectCucumber / runCucumberJs
    suites.ts            # the two static suites
    generatedSuites.ts    # the "pressure" suite's feature generator
    statistics.ts          # pure stats — durationStats, measurementStability, percentDelta
    report.ts               # renderMarkdown / renderHtml + a results/latest.json -> .md/.html CLI
    compare.ts               # the orchestrating CLI
  test/
    statistics.test.ts  # RED-then-GREEN correctness tests for statistics.ts
    report.test.ts       # RED-then-GREEN correctness tests for report.ts
```

`test/*.test.ts` are ordinary vitest test files (matching the default `*.test.ts` include glob),
so `pnpm test` at the repo root runs them like any other test. The `*.steps.ts` files under
`cucumber/` and `effect-cucumber/` are NOT test files by that glob's definition on purpose — they
only run when `src/runners.ts` passes their path to a spawned `vitest run` / `cucumber.js`
explicitly.
