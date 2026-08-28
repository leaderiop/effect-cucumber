# Roadmap

## Current state

**Design-only. No code has been written yet.** Everything in `spec/` describes
an intended contract, stress-tested against three worked examples (see
`spec/behaviors/`) but not yet built or verified by a real test run. The
repository's prior state (a single `DESIGN.md`) has been folded into this
`spec/` directory and superseded by it — `git log` has the original if it's
ever needed for context.

| Gate | Status |
| ---- | ------ |
| Packages exist | No — `@effect-cucumber/gherkin` and `@effect-cucumber/vitest` are specified in `spec/overview.md`, not scaffolded |
| `tsc -b` | Not wired |
| Unit tests | None yet |
| Acceptance suite (this library dogfooding itself) | None yet |
| `bash spec/scripts/verify-traceability.sh` | Wired and passing (checks spec-to-spec consistency only) |
| Doc-examples compile check | Not wired |

## Blocking first release

1. Scaffold the workspace monorepo (`package.json`, workspace config,
   `packages/gherkin`, `packages/vitest`) — pnpm workspaces is the working
   assumption, matching the Effect ecosystem's common convention, but hasn't
   been confirmed.
2. Implement `@effect-cucumber/gherkin` (parsing + step matching) in isolation
   against real `.feature` fixtures — see [ADR-EC-011](decisions/011-official-cucumber-parser-packages.md).
   No Effect-specific logic, so it's the easier of the two packages to get
   right first.
3. Implement `@effect-cucumber/vitest` (`describeFeature`, the DSL, the
   `it.effect`-based runner) against one hand-written `.feature` file, proving
   out Background + Scenario + one Given/When/Then (BEH-EC-001–004) before
   Rule/Outline/tags/hooks.
4. Wire the doc-examples compile check and the merge-gate table in
   `spec/process/definitions-of-done.md` for real, once there's an API to
   check examples against.

## Planned

- **An Examples column not referenced by any step's pattern** — the rare case
  where a Scenario Outline needs a raw example value that never appears
  inside a `Given`/`When`/`Then` string, so cucumber-expressions never gets a
  chance to coerce it. Needs a fallback — likely an optional typed `example`
  argument decoded via `Schema`, passed alongside the DSL object to
  `ScenarioOutline`'s callback.
- **Custom, non-reserved tags** — `@skip`/`@only` are specified
  ([BEH-EC-008](behaviors/02-shared-layers-and-tags.md)); arbitrary user tags
  (e.g. `@slow`, `@wip`) and how `excludeTags`-style filtering surfaces in the
  public API isn't designed yet.
- **Retries / `it.flakyTest` at the Scenario level** — whether/how a Scenario
  opts into `it.effect`'s retry behavior, and how that interacts with
  [ADR-EC-009](decisions/009-cross-step-state-lives-in-a-ref.md) (does a
  retried Scenario rebuild its per-Scenario Layer fresh per attempt, matching
  `it.effect`'s own retry semantics? — needs confirming against
  `@effect/vitest`'s actual retry implementation once that's checked).
- **A lint rule enforcing [ADR-EC-009](decisions/009-cross-step-state-lives-in-a-ref.md)** —
  flagging a `let`/`var` declared inside a `Scenario`/`Rule`/`Background`
  callback that a step function closes over. Currently a reviewed convention
  only (see [INV-EC-006](invariants.md#inv-ec-006-cross-step-scenario-data-survives-only-via-a-layer-provided-ref)).

## Under consideration

None yet — undecided is a real state, kept here rather than omitted.

## Explicitly not planned

| Item | Why |
| ---- | --- |
| A bespoke Gherkin parser | [ADR-EC-011](decisions/011-official-cucumber-parser-packages.md) — depend on official `@cucumber/gherkin` instead |
| A bespoke step-matching syntax | [ADR-EC-007](decisions/007-cucumber-expressions-for-step-matching.md) — cucumber-expressions is reused verbatim |
| A third "shared within a Rule" Layer scope | [ADR-EC-006](decisions/006-two-layer-scopes-only.md), [ADR-EC-010](decisions/010-rule-and-scenario-scoped-extra-layers.md) — promote to the Feature's `shared` Layer instead |
| A custom cucumber HTML/report format | Not a goal for v1 — defer to vitest's own reporters |
| A vitest plugin or custom test discovery mechanism | Not needed — a `.feature` file is plain data; the `.steps.ts` module is what vitest discovers, unmodified (see `spec/overview.md`) |
| GxP/regulatory compliance tooling | Out of scope — this is a testing library, not a regulated domain, unlike some sibling projects that adopted this same spec-driven method |
