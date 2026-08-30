# Phase 9: Tags - Context

**Gathered:** 2026-08-29
**Status:** Ready for planning

<domain>
## Phase Boundary

Every Gherkin tag on a Scenario — including tags inherited from its Feature, Rule, and Examples
block — becomes a native vitest tag on the emitted `it.effect` call. `@skip` additionally routes to
`it.effect.skip`. `@only` is never routed to `it.effect.only` (which fails CI by design) — it is
emitted as a plain tag, and running just that Scenario locally is a caller-side
`vitest --tagsFilter '@only'` choice. This phase also adds a library-level `includeTags`/
`excludeTags` option on `describeFeature`'s options object (a deliberate extension beyond the
original ADR-EC-020 scope — see Implementation Decisions below).

Tag parsing, flattening, and inheritance (Feature → Rule → Examples → Scenario) are **already
built** — `@effect-cucumber/gherkin`'s `Correlate.ts` already produces a fully-flattened
`ParsedScenario.tags: ReadonlyArray<string>` per ADR-EC-014. This phase is entirely about the
`@effect-cucumber/vitest` package: reading that `tags` field and wiring it through
`Plan.ts` → `Runner.ts` → `TestApi.ts` → the real `it.effect` call.

</domain>

<decisions>
## Implementation Decisions

### Library-level tag filtering (extends beyond ADR-EC-020)

ADR-EC-020 (Accepted, 2026-08-28) explicitly decided `excludeTags`-style filtering should be
**pure vitest `--tagsFilter` CLI filtering**, with no `describeFeature`-time registration filter.
The user deliberately overrides that scope boundary for this phase:

- **D-01:** Add BOTH `includeTags` and `excludeTags` to `describeFeature`'s options object — not
  just `excludeTags` as ROADMAP.md originally named. Symmetric API: `includeTags` restricts
  registration to a tag set, `excludeTags` removes a tag set.
- **D-02:** Syntax is a **plain array of tag strings** (e.g. `excludeTags: ["@slow", "@wip"]`) —
  not vitest's boolean expression grammar (`"@slow && !@wip"`). No expression parser to write,
  document, or keep in sync with vitest's own `--tagsFilter` grammar.
- **D-03:** Filtering happens at **registration time, skipping emission entirely** — a Scenario
  excluded by `excludeTags` (or not selected by `includeTags`) never becomes an `it.effect` call.
  It does not appear in test output at all, as if the Scenario were absent from the `.feature`
  file. (Contrast with `@skip`, which still emits the test but as `it.effect.skip` — this option
  is a coarser, author-side filter, not another skip mechanism.)
- **This is additive, not a replacement.** vitest's native `--tagsFilter` CLI mechanism still
  works independently on whatever tests DO get emitted — `includeTags`/`excludeTags` narrows what
  `describeFeature` registers in the first place; `--tagsFilter` narrows what runs among
  registered tests. The two compose (registration-time filter, then CLI-time filter), they don't
  compete.
- **Spec impact:** This decision amends ADR-EC-020's stated scope. The planner/researcher should
  flag this to the spec-reconciliation step of whichever plan closes this phase (mirroring how
  Phase 8's final plan reconciled spec against what was actually built) — ADR-EC-020's "Decision"
  section will need an amendment noting the `includeTags`/`excludeTags` addition, or a follow-up
  ADR should supersede it. Do not silently let the ADR text and the shipped code diverge.

### Everything else in RUN-05: follow the existing ADR/BEH exactly, no open questions

The rest of Phase 9's design is **already fully decided** by prior spec work and was confirmed,
not re-litigated, in discussion:

- **D-04:** Every tag (including inherited ones) is emitted as a native vitest tag via the
  `tags` field of vitest's `TestOptions` (the object form of `it.effect`'s third parameter,
  `V.TestOptions`) — confirmed against the installed `vitest@4.1.11` / `@vitest/runner@4.1.11`
  type declarations: `TestOptions.tags?: string[] | string`. Tag strings keep their literal `@`
  prefix from the `.feature` file (e.g. `"@skip"`, not `"skip"`) — this matches ADR-EC-020's own
  `--tagsFilter '@slow && !@wip'` examples and requires no normalization.
- **D-05:** `@skip` additionally routes to `it.effect.skip` (a real vitest skip, not just a tag).
  Since `it.effect.skip` never invokes the test body, and `Plan.ts`'s `planFeature` never throws
  for an unresolved step (`StepMatchError` is only surfaced when that step's Effect actually
  runs — see `Plan.ts`'s own documented behavior), routing `@skip` scenarios through the real
  `.skip` path automatically satisfies Pitfall 15's requirement ("a `@skip` Scenario containing an
  unmatched step reports skipped, not undefined") with no extra design needed.
- **D-06:** `@only` is NEVER routed to `it.effect.only`. It is emitted as a plain tag only.
- **D-07:** Only `@skip` and `@only` are reserved/special-cased. Every other tag (`@slow`, `@wip`,
  anything a Feature author writes) is a plain pass-through tag with no library-defined behavior
  beyond being filterable.
- No vitest config changes are needed: the project currently has no `vitest.config.ts` at all
  (defaults), and vitest's `strictTags` (which would require pre-declaring every used tag) is off
  by default — arbitrary per-Feature tags need no static declaration.

### Claude's Discretion

- Exact shape of the `TestApi.ts` interface extension (how tags/skip options thread from
  `Runner.ts` through to the real `it.effect` call) — this is implementation architecture, not a
  user-facing decision. `TestApi.ts` note (b) already documents that `skip`/`only` were
  *deliberately* left off the interface in Phase 6, reserved for this phase.
- Whether `it.effect`'s `TestOptions.skip` field or a separate `.skip` method call is used to
  route `@skip` — both are valid per vitest's type surface; pick whichever keeps `TestApi.ts`'s
  existing "no vitest import in Runner.ts" seam (note (a)) intact.
- Tag matching for `@skip`/`@only`/`includeTags`/`excludeTags` is exact-string, case-sensitive
  (Cucumber tag convention) — no fuzzy or case-insensitive matching was discussed or requested.
- **Empty-array filter semantics (resolved by research, no user input needed):** `undefined` and
  `[]` both mean "no filter" for `includeTags`/`excludeTags`. A computed-empty array must never
  silently delete the whole suite.
- **`AfterAllScenarios`/`BeforeAllScenarios` asymmetry under full exclusion (resolved by research,
  no user input needed):** when every Scenario in a Feature is skipped or filtered out, suppress
  the `AfterAllScenarios` node (it currently runs unconditionally per `Runner.ts` note (e), while
  `BeforeAllScenarios` structurally cannot run in that state). `⚠` warning nodes still emit — they
  describe registration, not execution. `Runner.ts` note (e) must be updated to say so.

### Corrections and Additions from Phase 9 Research (2026-08-29)

`09-RESEARCH.md` falsified one bullet of D-04 and surfaced four public-behavior gray areas that
were not covered above. The user resolved all four before planning; both sets are locked decisions
now, superseding the conflicting text above.

- **D-04 correction (FACTUAL, not a preference):** vitest 4.1.11's `strictTags` defaults to
  **`true`**, not off. Emitting any tag with no `vitest.config.ts` declaring it fails the *entire*
  test file (0 tests collected) — verified empirically (RESEARCH.md Finding 1). The D-04 bullet
  reading "No vitest config changes are needed … `strictTags` … is off by default" is **wrong** and
  must not be planned against. A root `vitest.config.ts` declaring `@skip`/`@only` (plus every tag
  this repo's own fixtures use) and `allowOnly: false` is required work in this phase (RESEARCH.md
  Finding 15), not optional polish.
- **D-08:** An undeclared tag reaching vitest's `strictTags` check must **warn and continue**, not
  fail the file. Catch the throw at the `describeFeature.ts` adapter boundary (verified catchable,
  RESEARCH.md Finding 3), re-emit the test untagged, and print a located warning naming the
  `.feature` file, the Scenario, and the offending tag. Matches ADR-EC-019's "dead code, not a
  broken Scenario" precedent.
- **D-09:** Ship a `gherkinTags(glob)` config helper **in this phase** — it pre-scans `.feature`
  files matching a glob and returns a `TestTagDefinition[]` a consumer spreads into their
  `vitest.config.ts`'s `test.tags`. Without this (or manual declaration), `--tagsFilter` — the
  entirety of ADR-EC-020's "run just one Scenario locally" story — does not work for a real
  consumer (RESEARCH.md Finding 2). This is new public surface: its own file I/O, a glob
  dependency, and an `index.ts` export. Scope it to an explicit glob argument, never a recursive
  default (Security Domain, V12).
  - **D-09 confirmed, post-plan-checker (2026-08-29):** the planner's first pass implemented
    `gherkinTags(paths: ReadonlyArray<string>)` — an explicit file/directory list, not a glob
    string — citing three forcing constraints (Node `>=20` predates `fs.globSync`; `tinyglobby` is
    only a transitive lockfile dependency; a hand-rolled matcher would mishandle glob syntax). The
    plan-checker flagged this as an unapproved deviation from D-09's literal wording. **The user was
    asked and confirmed the literal glob-string signature is required.** `gherkinTags` MUST accept
    a glob pattern (e.g. `gherkinTags("features/**/*.feature")`), not an explicit path array.
    `tinyglobby@0.2.17` (already present transitively in `pnpm-lock.yaml`) must be added as a real,
    declared dependency of `packages/vitest` to implement this — this is a deliberate, approved
    exception to Phase 9's "no new packages" baseline (RESEARCH's Package Legitimacy Audit and the
    plan's own supply-chain threat row must be updated to reflect one new direct dependency,
    `tinyglobby`, audited and accepted, not zero). The synchronous-read constraint from
    `loadFeature.ts`'s `AsyncFiberError` precedent still applies — `tinyglobby`'s sync glob API must
    be used, not its async one, to keep the helper callable synchronously at config-load time.
- **D-10:** The library prints **one collection-time notice** when `excludeTags`/`includeTags`
  causes registration-time exclusions (e.g. `N Scenario(s) excluded by excludeTags`), on the same
  terminal channel as the existing unused-step-definition warnings. D-03's Scenario still never
  becomes an `it.effect` call and never appears as its own test node — this notice is a single
  summary line, not per-Scenario output. Guards against a stale `excludeTags` silently hiding a
  whole Feature behind a green run.
- **D-11:** Add a small enforcement script in this phase (mirroring
  `scripts/verify-no-runner-dep.sh`'s method, including its positive control) that greps
  `packages/vitest/src/Runner.ts` and `TestApi.ts` for a forbidden `vitest` import. No such script
  exists today (RESEARCH.md Finding 16) — this phase is the first to create real pressure toward
  reaching for `import type { TestOptions } from "vitest"` in `TestApi.ts`, which would type-check,
  lint clean, and quietly undo the seam Anti-Pattern 3 exists for.

**Spec reconciliation is larger than originally flagged.** Not just ADR-EC-020's scope note —
`spec/behaviors/02-shared-layers-and-tags.md` §BEH-EC-008's MUST-level text explicitly *forbids* a
`describeFeature`-time registration filter, which D-01–D-03 do anyway. Per AGENTS.md §1/§4, the
plan that closes this phase must amend, in the same change: BEH-EC-008's MUST-level text and
worked example, ADR-EC-020's Decision/Negative-Consequences sections (or supersede it with a new
`ADR-EC-NNN` per AGENTS.md §6), `.planning/REQUIREMENTS.md` RUN-05's text, and
`spec/roadmap.md`'s "custom, non-reserved tags" entry — then `bash spec/scripts/verify-traceability.sh`
must pass.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Requirements this phase implements
- `.planning/REQUIREMENTS.md` (RUN-05 entry, line ~41) — the full requirement text, cites
  ADR-EC-020 and BEH-EC-008
- `.planning/ROADMAP.md` §"Phase 9: Tags" (lines 380–394) — goal, 4 success criteria, research flag

### Decisions / behaviors this phase implements
- `spec/decisions/020-vitest-native-tags-for-skip-only.md` — ADR-EC-020, the core design
  (native tag emission, `@skip` → `it.effect.skip`, `@only` stays plain, CLI-only filtering as
  originally scoped — **this phase's `includeTags`/`excludeTags` decision extends/amends this
  ADR's stated scope on the filtering point; see D-01 through D-03 above**)
- `spec/behaviors/02-shared-layers-and-tags.md` §BEH-EC-008 (lines 97–113) — the MUST-level
  requirement text and a worked example (`@skip` on a Scenario, shared-Layer Feature)
- `.planning/research/PITFALLS.md` Pitfall 15 (line 443, skip-ordering note at line ~1033) —
  "a `@skip` Scenario containing an unmatched step reports skipped, not undefined"

### Existing code this phase extends
- `packages/gherkin/src/Correlate.ts` (lines 110, 155, 346, 459, 489, 501) — already produces
  flattened, inherited `tags: ReadonlyArray<string>` on every `ParsedScenario`/`ParsedRule`/
  `ParsedFeature`. Nothing here needs to change — this phase only *reads* `ParsedScenario.tags`.
- `packages/gherkin/src/Model.ts` (lines 133–180) — `tags` field type definitions on the parsed
  model types.
- `packages/vitest/src/TestApi.ts` — the seam Runner.ts uses to reach `describe`/`it.effect`.
  Note (b) (around line 25) explicitly documents that `skip`/`only` were left off in Phase 6,
  reserved for this phase. Note (a) documents the no-vitest-import constraint that must survive
  whatever extension this phase makes.
- `packages/vitest/src/Runner.ts` — walks the `FeaturePlan` and emits one `describe`/`it.effect`
  call per Scenario via the injected `TestApi`. This is where tag/skip values get read off each
  `ScenarioPlan` and passed through to the `TestApi.effect` call.
- `packages/vitest/src/describeFeature.ts` — the composition root; owns the real
  `vitestTestApi: TestApi = { describe, effect: it.effect }` binding (around line 223) that will
  need to grow to carry tags/skip, and is where the new `includeTags`/`excludeTags` options-object
  field would be read and applied before `Runner.ts`'s emission walk.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `ParsedScenario.tags` (and the equivalent on `ParsedRule`/`ParsedFeature`) — fully flattened,
  already includes inherited tags from every ancestor scope. No new parsing/inheritance logic
  needed in this phase.
- vitest's own `TestOptions.tags?: string[] | string` and `TestOptions.skip?: boolean` (confirmed
  in the installed `@vitest/runner@4.1.11` type declarations) — the target shape this phase's
  emission code needs to produce; no custom tag-encoding scheme required.

### Established Patterns
- `TestApi.ts`'s seam pattern (Pattern 3 in `.planning/research/ARCHITECTURE.md`): `Runner.ts`
  never imports a test framework directly; every framework touchpoint is an injected interface
  member. Any interface change this phase makes must preserve that — no `vitest`/`@effect/vitest`
  import creeping into `Runner.ts` or `TestApi.ts`.
- Prior phases (06, 07, 08) each left a "reserved but not yet implemented" comment/type gap for
  the next phase to fill (e.g. `TestApi.ts` note (b) for this exact phase) — check for other such
  markers referencing Phase 9 or RUN-05 before starting.

### Integration Points
- `Runner.ts`'s per-Scenario emission loop is the single point where tag/skip values need to flow
  from `ScenarioPlan` into the `TestApi.effect` call.
- `describeFeature.ts`'s composition root is where the new `includeTags`/`excludeTags`
  options-object field is read and where registration-time filtering (D-03: skip emission
  entirely) needs to short-circuit before a Scenario reaches `Runner.ts`'s emission walk at all.

</code_context>

<specifics>
## Specific Ideas

No specific implementation-shape requirements beyond the decisions above — the user's input was
entirely in scope-setting (add `includeTags`/`excludeTags`, array-of-strings syntax, exclude from
emission entirely), not in favor of any particular code shape.

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope. The `includeTags`/`excludeTags` addition is an
extension of RUN-05's existing scope (tag filtering was already named in BEH-EC-008 "with no
decided mechanism"), not a new capability requiring its own phase.

### Reviewed Todos (not folded)
None — `todo.match-phase` returned zero matches for Phase 9.

</deferred>

---

*Phase: 9-Tags*
*Context gathered: 2026-08-29*
