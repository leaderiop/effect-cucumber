# Roadmap

## Current state

**`@effect-cucumber/gherkin`'s parse pipeline, step matcher, and DataTable /
DocString wrapper have shipped; `@effect-cucumber/vitest` is still
scaffolding.** `loadFeature`/`parseFeature` and the `ParsedFeature` contract are
built and tested
([04 — loadFeature parse and validation](behaviors/04-loadfeature-parse-and-validation.md)),
as are custom parameter types and step matching
([05 — Step matching and parameter types](behaviors/05-step-matching-and-parameter-types.md)),
and a step's DocString and data table now reach `ParsedStep.stepArguments`
wrapped and in source order
([06 — DataTable and DocString arguments](behaviors/06-datatable-and-docstring-arguments.md));
everything else the runner needs — `describeFeature`, hooks, tags, Layer
scoping — is still an intended contract only, stress-tested against
three worked examples (see `spec/behaviors/`) and against four rounds of GSD
research (Stack, Features, Architecture, Pitfalls — see `.planning/research/`),
which found and fixed real bugs in the spec itself (ADR-EC-014/007's
corrections, ADR-EC-017's Background/Scenario fix) in addition to verifying
assumptions against the actually-installed dependencies. `.planning/ROADMAP.md`
formalizes the 11-phase, bottom-up build order both Architecture and Pitfalls
research independently converged on, and is the authority on per-phase status.

| Gate                                              | Status                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| ------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Packages exist                                    | Yes — both scaffolded and correctly linked. `@effect-cucumber/gherkin` has real source (`loadFeature`, `parseFeature`, the `ParsedFeature` contract, the error/warning surface, custom parameter types as data, the step matcher, the `DataTable` wrapper with `raw()`/`hashes()`/`rowsHash()`/`decodeHashes`, and the step-argument accessors behind `ParsedStep.stepArguments`); `@effect-cucumber/vitest` is still a placeholder barrel |
| `tsc -b`                                          | Wired (`tsconfig.base.json`/`tsconfig.json`/per-package configs) and building `packages/gherkin` for real                                                                                                                                                                                                                                                                                                                                  |
| `@effect/tsgo` (Effect-aware type checking)       | Wired, gating the build (ADR-EC-016)                                                                                                                                                                                                                                                                                                                                                                                                       |
| Unit tests                                        | Yes for `packages/gherkin` — fourteen `test/*.test.ts` files over a `.feature` fixture set, plus one type-check-only `.types.ts` file compiled by `pnpm typecheck:test`, all mapped in [`spec/traceability.md`](traceability.md) §4. None for `packages/vitest`                                                                                                                                                                            |
| Acceptance suite (this library dogfooding itself) | None yet                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| `bash spec/scripts/verify-traceability.sh`        | Wired and passing (checks spec-to-spec consistency only)                                                                                                                                                                                                                                                                                                                                                                                   |
| Doc-examples compile check                        | Not wired                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| GSD project planning                              | `PROJECT.md`/`config.json`/`ROADMAP.md` all done under `.planning/`; research done. See `.planning/ROADMAP.md` for per-phase status                                                                                                                                                                                                                                                                                                        |

## Blocking first release

See `.planning/research/SUMMARY.md` § Implications for Roadmap for the
detailed, dependency-graph-verified 11-phase build order (Phase 0 tooling
policy → Phase 1 `loadFeature` → Phase 2 parameter types → ... → Phase 9
shared Layer → Phase 10 composition root + dogfooded acceptance suite) once
`.planning/ROADMAP.md` formalizes it. High-level shape:

1. Finish Phase 0 tooling/dependency policy (partially done: peer deps
   fixed via ADR-EC-015, extended to `@effect-cucumber/gherkin` via
   ADR-EC-021, `@effect/tsgo` wired via ADR-EC-016; still open:
   `publishConfig.exports` swap, pnpm catalogs, CI, and ADR-EC-021's
   Follow-up items — the actual `Source.ts`/`loadFeature.ts`/`Errors.ts`
   rewrite, `BEH-EC-001` update, and `ParameterTypeStore`-as-Layer decision).
2. Implement `@effect-cucumber/gherkin`'s parse→compile→correlate pipeline
   (the riskiest phase — several silent-failure edge cases in
   `@cucumber/gherkin`'s `compile()` must become loud errors here).
3. Implement `@effect-cucumber/vitest`'s register→plan→emit pipeline against
   one hand-written `.feature` file, proving out Background + Scenario + one
   Given/When/Then (BEH-EC-001–004, BEH-EC-013) before Rule/Outline/tags/hooks.
4. Wire the doc-examples compile check and the merge-gate table in
   `spec/process/definitions-of-done.md` for real, once there's an API to
   check examples against.

## Planned

- **Reusable step definitions across Scenarios/Features** — a genuine
  table-stakes gap found by GSD Features research (BEH-EC-012's own worked
  example repeats an identical step verbatim). Deliberately deferred to a
  later milestone: a shared step's `R` must reconcile against every
  consuming Layer, a problem with no ecosystem precedent (every comparable
  library's steps are untyped, so they never have to solve it). Ship a
  working core first.
- **An Examples column not referenced by any step's pattern** — the rare case
  where a Scenario Outline needs a raw example value that never appears
  inside a `Given`/`When`/`Then` string, so cucumber-expressions never gets a
  chance to coerce it. Needs a fallback — likely an optional typed `example`
  argument decoded via `Schema`, passed alongside the DSL object to
  `ScenarioOutline`'s callback.
- **Retries / `it.flakyTest` at the Scenario level** — GSD Pitfalls research
  closed part of this: a retried Scenario **does** rebuild its per-Scenario
  Layer fresh per attempt, but only when `Effect.provide` sits _inside_ the
  retried Effect — composition order is load-bearing, and getting it
  backwards silently reintroduces the leak [ADR-EC-009](decisions/009-cross-step-state-lives-in-a-ref.md)
  exists to prevent. Still deferred to a later milestone; this note exists so
  the composition-order requirement isn't rediscovered from scratch when it's
  picked up.
- **A lint rule enforcing [ADR-EC-009](decisions/009-cross-step-state-lives-in-a-ref.md)** —
  flagging a `let`/`var` declared inside a `Scenario`/`Rule`/`Background`
  callback that a step function closes over. Currently a reviewed convention
  only (see [INV-EC-006](invariants.md#inv-ec-006-cross-step-scenario-data-survives-only-via-a-layer-provided-ref)).

## Under consideration

- **Vendored `@effect/oxc` rules** (`tools/oxlint/effect/`, from GSD Stack
  research) — 4 of Effect's own 5 unpublished oxlint rules, MIT-licensed,
  with `no-unused-internal` deliberately excluded (its one rule requiring
  `typescript <7.0.0`, incompatible with this project's TS 7). Currently
  untracked, not yet formally adopted — decide during Phase 0 planning
  whether to commit `tools/` and wire it into the lint config, or drop it.
- **A scheduled canary CI job against a floating `effect@rc`** — GSD Stack
  research's own prescription, not an ecosystem convention (no comparable
  project does this). Optional, not a hard requirement for Phase 0.
- **dprint's `semiColons: "asi"` (no-semicolon) house style** — Effect's own
  convention, flagged by research as a real stylistic commitment worth an
  explicit yes/no rather than silent inheritance when `dprint.json` is
  copied over in Phase 0.

## Explicitly not planned

| Item                                               | Why                                                                                                                                                                          |
| -------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A bespoke Gherkin parser                           | [ADR-EC-011](decisions/011-official-cucumber-parser-packages.md) — depend on official `@cucumber/gherkin` instead                                                            |
| A bespoke step-matching syntax                     | [ADR-EC-007](decisions/007-cucumber-expressions-for-step-matching.md) — cucumber-expressions is reused verbatim                                                              |
| A third "shared within a Rule" Layer scope         | [ADR-EC-006](decisions/006-two-layer-scopes-only.md), [ADR-EC-010](decisions/010-rule-and-scenario-scoped-extra-layers.md) — promote to the Feature's `shared` Layer instead |
| A custom cucumber HTML/report format               | Not a goal for v1 — defer to vitest's own reporters                                                                                                                          |
| A vitest plugin or custom test discovery mechanism | Not needed — a `.feature` file is plain data; the `.steps.ts` module is what vitest discovers, unmodified (see `spec/overview.md`)                                           |
| GxP/regulatory compliance tooling                  | Out of scope — this is a testing library, not a regulated domain, unlike some sibling projects that adopted this same spec-driven method                                     |
